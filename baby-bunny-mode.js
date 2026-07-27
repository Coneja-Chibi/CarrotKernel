// =============================================================================
// BABY BUNNY MODE - COMPLETE SYSTEM 🐰
// Guided automation for character sheet processing
// =============================================================================
//
// This module contains all Baby Bunny Mode functionality:
//
// SECTION 1 & 2: BABY BUNNY MODE (CORE + BATCH)
//   - Main sheet detection and guided automation workflow
//   - Single character processing
//   - Batch character processing
//   - Sheet format detection (fullsheet/tagsheet/quicksheet)
//
// SECTION 3: BABY BUNNY CHUNKING
//   - Visual chunk editor and preview system
//   - Chunk finalization and vectorization
//
// SECTION 4: BABY BUNNY UI COMPONENTS
//   - Message buttons for manual triggering
//   - Tutorial popups
//   - Shared UI elements
//
// =============================================================================

import { saveSettingsDebounced, chat, chat_metadata, characters, this_chid } from '../../../../script.js';
import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { parseRegexFromString, world_info, world_names, loadWorldInfo, createNewWorldInfo, createWorldInfoEntry, saveWorldInfo, updateWorldInfoList, selected_world_info } from '../../../world-info.js';
import { highlightRegex } from '../../../utils.js';
import { regenerateChunkKeywords, detectFullsheetInMessage, vectorizeFullsheetFromMessage, chunkFullsheet } from './fullsheet-rag.js';
import { CarrotDebug } from './debugger.js';
import { closeTutorial } from './tutorials.js';
import { EXTENSION_NAME, characterRepoBooks } from './carrot-state.js';

const extensionName = EXTENSION_NAME;
const CUSTOM_KEYWORD_PRIORITY = 100; // Default weight for custom keywords

// Baby Bunny button class (matches qvink_memory button system)
const baby_bunny_button_class = `${extensionName}_baby_bunny_button`;


// =============================================================================
// SECTION 1 & 2: BABY BUNNY MODE (CORE + BATCH)
// Main sheet detection, single & batch character processing
// =============================================================================

async function checkForCompletedSheets(message, messageId) {
    CarrotDebug.ui('🐰 BABY BUNNY DEBUG: checkForCompletedSheets called', {
        messageId: messageId,
        hasMessage: !!message,
        hasMessageText: !!message?.mes,
        messageType: typeof message?.mes,
        isUser: message?.is_user,
        messagePreview: message?.mes?.substring(0, 200) + '...'
    });

    if (!message?.mes || typeof message.mes !== 'string') {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Skipping - no valid message text');
        return;
    }

    const messageText = message.mes;

    // STANDARDIZED EXTRACTION: Look for ALL BunnymoTags and Linguistics blocks
    const extractedData = extractAllSheetData(messageText);

    CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Standardized extraction results', {
        messageLength: messageText.length,
        bunnymoTagsFound: extractedData.bunnymoTags.length,
        linguisticsFound: extractedData.linguistics.length,
        totalBlocks: extractedData.bunnymoTags.length + extractedData.linguistics.length
    });

    // Check for BunnymoTags/Linguistics OR detect other sheet formats
    const hasBunnymoData = extractedData.bunnymoTags.length > 0 || extractedData.linguistics.length > 0;

    // Detect tagsheets (lines starting with < > tags without BunnymoTags wrapper)
    // Must have multiple tag lines to avoid false positives
    const tagLineMatches = messageText.match(/^<[A-Z_]+:[^>]+>/gim);
    const hasTagLines = tagLineMatches && tagLineMatches.length >= 3;

    // Detect quicksheets (character descriptions, typically 200-2000 chars with name mentions)
    // MUST have BOTH:
    // 1. Multiple structured tags (3+ tags in <TAG:value> format)
    // 2. High tag density (tags make up significant portion of content)
    const allTagMatches = messageText.match(/<[A-Z_]+:[^>]+>/gi);
    const tagCount = allTagMatches ? allTagMatches.length : 0;
    const tagDensity = tagCount > 0 ? (allTagMatches.join('').length / messageText.length) : 0;
    const hasSignificantTags = tagCount >= 3 && tagDensity > 0.15; // 15%+ of message is tags
    const isQuicksheet = messageText.length >= 200 && messageText.length < 2000 && hasSignificantTags;

    // Detect fullsheets (section headers)
    const hasFullsheetStructure = /^#{1,6}\s+\S+\s+\d+\s*\/\s*\d+/gim.test(messageText);

    if (!hasBunnymoData && !hasTagLines && !isQuicksheet && !hasFullsheetStructure) {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: No recognizable sheet format detected');
        return;
    }

    CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Sheet format detected', {
        hasBunnymoData,
        hasTagLines,
        isQuicksheet,
        hasFullsheetStructure
    });

    CarrotDebug.ui('🐰 Baby Bunny Mode: Detected completed sheet data', {
        messageId: messageId,
        bunnymoTagsCount: extractedData.bunnymoTags.length,
        linguisticsCount: extractedData.linguistics.length,
        messageLength: messageText.length
    });

    // Extract character data from all found blocks
    const characterData = [];

    // Process each BunnymoTags block with batch-specific parser
    for (const bunnymoBlock of extractedData.bunnymoTags) {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Processing BunnymoTags block', {
            fullContent: bunnymoBlock.substring(0, 100) + '...',
            fullLength: bunnymoBlock.length
        });

        const characterInfo = extractCharacterFromBatchBlock(bunnymoBlock, messageText);
        if (characterInfo) {
            characterData.push(characterInfo);
        }
    }

    // If no BunnymoTags but we have Linguistics, create character from Linguistics
    if (extractedData.bunnymoTags.length === 0 && extractedData.linguistics.length > 0) {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: No BunnymoTags found, creating character from Linguistics only');
        const characterInfo = extractCharacterFromSheetData('', extractedData.linguistics, messageText);
        if (characterInfo) {
            characterData.push(characterInfo);
        }
    }

    // If NO BunnymoTags or Linguistics but we detected a sheet format, create generic character data
    if (characterData.length === 0 && (hasTagLines || isQuicksheet || hasFullsheetStructure)) {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: No BunnymoTags/Linguistics, creating generic character from detected sheet format');

        // Try to extract character name from common patterns
        let characterName = 'Unknown Character';

        // Pattern 1: <NAME:CharName> or <Name:CharName> (remove underscores, handle multi-word names)
        const nameMatch = messageText.match(/<(?:NAME|Name|name):\s*([^>]+)>/i);
        if (nameMatch) {
            characterName = nameMatch[1].trim().replace(/_/g, ' ');
        }

        // Pattern 2: If no NAME tag, try to find it from first line or use "Unnamed Character"
        if (characterName === 'Unknown Character') {
            const firstLineMatch = messageText.match(/^([A-Z][a-zA-Z\s]+)/);
            if (firstLineMatch) {
                characterName = firstLineMatch[1].trim();
            }
        }

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Extracted character name:', characterName);

        // Create generic character data
        const characterInfo = {
            name: characterName,
            tags: messageText, // Use full message as tags
            linguistics: [],
            fullText: messageText
        };

        characterData.push(characterInfo);
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Created generic character with full data');
    }

    if (characterData.length > 0) {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: About to show popup for characters', {
            characterCount: characterData.length,
            characters: characterData.map(c => ({ name: c.name, tagsLength: c.tags.length }))
        });

        // If multiple characters found, show batch popup
        if (characterData.length > 1) {
            CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Multiple characters detected, showing batch popup');
            await showBatchBabyBunnyPopup(characterData);
        } else {
            // Single character - show individual popup
            CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Calling showBabyBunnyPopup for character:', characterData[0].name);
            await showBabyBunnyPopup(characterData[0]);
            CarrotDebug.ui('🐰 BABY BUNNY DEBUG: showBabyBunnyPopup completed for character:', characterData[0].name);
        }
    } else {
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: No character data found to show popup for');
    }
}

// STANDARDIZED SHEET DATA EXTRACTION
function extractAllSheetData(messageText) {
    const result = {
        bunnymoTags: [],
        linguistics: []
    };

    CarrotDebug.ui('🐰 RAW MESSAGE DEBUG:', {
        messageLength: messageText.length,
        containsBunnymoTags: messageText.includes('BunnymoTags'),
        bunnymoTagsCount: (messageText.match(/<BunnymoTags>/gi) || []).length,
        messageSample: messageText.substring(messageText.indexOf('BunnymoTags') - 100, messageText.indexOf('BunnymoTags') + 500)
    });

    // Extract ALL BunnymoTags blocks (case-insensitive, flexible spacing)
    const bunnymoRegexes = [
        /<BunnymoTags>(.*?)<\/BunnymoTags>/gis,
        /<bunnymotags>(.*?)<\/bunnymotags>/gis,
        /<BunnyMoTags>(.*?)<\/BunnyMoTags>/gis,
        /<bunnyMoTags>(.*?)<\/bunnyMoTags>/gis
    ];

    // Collect all BunnymoTags blocks first (deduplicate by content)
    let allBlocks = [];
    const seenBlocks = new Set();
    for (const regex of bunnymoRegexes) {
        const matches = [...messageText.matchAll(regex)];
        for (const match of matches) {
            const fullBlock = match[0].trim();
            // Normalize for comparison (lowercase, remove extra whitespace)
            const normalizedBlock = fullBlock.toLowerCase().replace(/\s+/g, ' ');

            if (!seenBlocks.has(normalizedBlock)) {
                seenBlocks.add(normalizedBlock);
                allBlocks.push(fullBlock);
            }
        }
    }

    // FALLBACK PARSER: If we found fewer than expected, try to find unclosed tags
    if (allBlocks.length === 0 || (messageText.match(/<BunnymoTags>/gi) || []).length > allBlocks.length) {
        CarrotDebug.ui('🐰 FALLBACK PARSER: Detected unclosed or partial BunnymoTags, attempting recovery...');

        // Find all opening tags and try to extract content until the next opening tag or end of message
        const openingTagPattern = /<BunnymoTags>/gi;
        const openingMatches = [...messageText.matchAll(openingTagPattern)];

        for (let i = 0; i < openingMatches.length; i++) {
            const startPos = openingMatches[i].index;
            const tagStart = startPos + openingMatches[i][0].length;

            // Find the end position: either a closing tag, the next opening tag, or end of message
            let endPos;
            const closingTagAfter = messageText.indexOf('</BunnymoTags>', tagStart);
            const nextOpeningTag = i < openingMatches.length - 1 ? openingMatches[i + 1].index : -1;

            if (closingTagAfter !== -1) {
                // Found a closing tag
                endPos = closingTagAfter + '</BunnymoTags>'.length;
            } else if (nextOpeningTag !== -1) {
                // No closing tag, but there's another opening tag - extract up to it
                endPos = nextOpeningTag;
            } else {
                // Last tag in message, no closing tag - extract to end
                endPos = messageText.length;
            }

            // Extract the block
            let extractedBlock = messageText.substring(startPos, endPos).trim();

            // Auto-close unclosed Linguistics tags (case-insensitive)
            const linguisticsOpenPattern = /<Linguistics>/gi;
            const linguisticsClosePattern = /<\/Linguistics>/gi;
            const openLingMatches = [...extractedBlock.matchAll(linguisticsOpenPattern)];
            const closeLingMatches = [...extractedBlock.matchAll(linguisticsClosePattern)];

            if (openLingMatches.length > closeLingMatches.length) {
                const unclosedCount = openLingMatches.length - closeLingMatches.length;
                CarrotDebug.ui(`🐰 FALLBACK: Found ${unclosedCount} unclosed <Linguistics> tag(s), adding closing tag(s)`);

                // Add missing closing tags before the BunnymoTags closing tag
                for (let j = 0; j < unclosedCount; j++) {
                    // Insert before </BunnymoTags> if it exists, otherwise at the end
                    if (extractedBlock.includes('</BunnymoTags>')) {
                        extractedBlock = extractedBlock.replace('</BunnymoTags>', '</linguistics></BunnymoTags>');
                    } else {
                        extractedBlock += '</linguistics>';
                    }
                }
            }

            // If we didn't find a closing BunnymoTags tag, add one
            if (!extractedBlock.endsWith('</BunnymoTags>')) {
                extractedBlock += '</BunnymoTags>';
                CarrotDebug.ui('🐰 FALLBACK: Added missing </BunnymoTags> closing tag');
            }

            // Check for duplicates
            const normalizedBlock = extractedBlock.toLowerCase().replace(/\s+/g, ' ');
            if (!seenBlocks.has(normalizedBlock)) {
                seenBlocks.add(normalizedBlock);
                allBlocks.push(extractedBlock);
                CarrotDebug.ui(`🐰 FALLBACK: Recovered block (${extractedBlock.length} chars)`);
            }
        }
    }

    // Check if this looks like multiple separate character sheets vs fullsheet duplicates
    if (allBlocks.length > 1) {
        // Detect if blocks have different <Name:> tags (indicating separate characters)
        const blockNames = allBlocks.map(block => {
            const nameMatch = block.match(/<Name:([^>]+)>/i);
            return nameMatch ? nameMatch[1].trim() : null;
        }).filter(n => n);

        const uniqueNames = new Set(blockNames);

        if (uniqueNames.size > 1) {
            // Multiple different character names = separate character sheets
            CarrotDebug.ui('🐰 MULTI-CHARACTER DETECTION: Found separate character sheets:', {
                totalBlocks: allBlocks.length,
                characterNames: Array.from(uniqueNames)
            });
            // Use ALL blocks
            result.bunnymoTags.push(...allBlocks);
        } else {
            // Same character name or no names = fullsheet format duplicates
            // Sort by length (largest first) and complexity (most tags)
            allBlocks.sort((a, b) => {
                const aTagCount = (a.match(/</g) || []).length;
                const bTagCount = (b.match(/</g) || []).length;
                const aLength = a.length;
                const bLength = b.length;

                // Prefer blocks with more tags, then by length
                if (aTagCount !== bTagCount) return bTagCount - aTagCount;
                return bLength - aLength;
            });

            CarrotDebug.ui('🐰 FULLSHEET DETECTION: Multiple BunnymoTags blocks found, prioritizing largest/most complete:', {
                totalBlocks: allBlocks.length,
                blockSizes: allBlocks.map(b => `${b.length} chars, ${(b.match(/</g) || []).length} tags`),
                selectedBlock: `${allBlocks[0].length} chars, ${(allBlocks[0].match(/</g) || []).length} tags`
            });

            // Use only the most complete block (TAG SYNTHESIS)
            result.bunnymoTags.push(allBlocks[0]);
        }
    } else if (allBlocks.length === 1) {
        // Single block, use it
        result.bunnymoTags.push(allBlocks[0]);
    }

    // Extract ALL Linguistics blocks (case-insensitive, flexible spacing)
    const linguisticsRegexes = [
        /<Linguistics>(.*?)<\/Linguistics>/gis,
        /<linguistics>(.*?)<\/linguistics>/gis,
        /<LINGUISTICS>(.*?)<\/LINGUISTICS>/gis
    ];

    for (const regex of linguisticsRegexes) {
        const matches = [...messageText.matchAll(regex)];
        for (const match of matches) {
            const fullBlock = match[0].trim();
            if (!result.linguistics.includes(fullBlock)) {
                result.linguistics.push(fullBlock);
            }
        }
    }

    CarrotDebug.ui('🐰 STANDARDIZED EXTRACTION DEBUG:', {
        bunnymoTagsFound: result.bunnymoTags.length,
        linguisticsFound: result.linguistics.length,
        bunnymoSamples: result.bunnymoTags.map(b => b.substring(0, 50) + '...'),
        linguisticsSamples: result.linguistics.map(l => l.substring(0, 50) + '...'),
        bunnymoNames: result.bunnymoTags.map(b => {
            const nameMatch = b.match(/<Name:([^>]+)>/i);
            return nameMatch ? nameMatch[1].trim() : 'NO NAME';
        })
    });

    return result;
}

// BATCH-SPECIFIC: Extract character from a single BunnymoTags block
// This parser treats the entire BunnymoTags block as complete - no appending
function extractCharacterFromBatchBlock(bunnymoBlock, fullMessageText) {
    CarrotDebug.ui('🐰 BATCH PARSER: Processing block', {
        blockLength: bunnymoBlock.length,
        preview: bunnymoBlock.substring(0, 100) + '...'
    });

    // Extract character name from <Name:> tag
    let characterName = '';
    const nameMatch = bunnymoBlock.match(/<Name:([^>]+)>/i);
    if (nameMatch) {
        characterName = nameMatch[1].trim();
        CarrotDebug.ui('🐰 BATCH PARSER: Found character name:', characterName);
    } else {
        // Fallback to trying to extract from linguistics or context
        const lingMatch = bunnymoBlock.match(/([A-Z][a-z]+)'s\s+primary\s+mode\s+of\s+speech/i);
        if (lingMatch) {
            characterName = lingMatch[1].trim();
        } else {
            characterName = 'Character';
        }
        CarrotDebug.ui('🐰 BATCH PARSER: Using fallback name:', characterName);
    }

    // The entire BunnymoTags block is the complete data
    let completeCharacterData = bunnymoBlock.trim();

    // BACKWARDS COMPATIBILITY: Check if Linguistics is inside BunnymoTags
    const hasLinguisticsInside = completeCharacterData.includes('<Linguistics>') || completeCharacterData.includes('<linguistics>');

    // If NO linguistics inside, look for standalone Linguistics blocks in the full message (old format)
    if (!hasLinguisticsInside) {
        CarrotDebug.ui('🐰 BATCH PARSER: No linguistics found inside BunnymoTags, checking for standalone blocks (old format)...');

        // Try to find a standalone Linguistics block near this character's block
        const linguisticsRegexes = [
            /<Linguistics>(.*?)<\/Linguistics>/gis,
            /<linguistics>(.*?)<\/linguistics>/gis,
            /<LINGUISTICS>(.*?)<\/LINGUISTICS>/gis
        ];

        // Find the position of this BunnymoTags block in the full message
        const blockPosition = fullMessageText.indexOf(bunnymoBlock);

        // Search for linguistics blocks near this position (within 1000 chars before or after)
        const searchStart = Math.max(0, blockPosition - 1000);
        const searchEnd = Math.min(fullMessageText.length, blockPosition + bunnymoBlock.length + 1000);
        const searchArea = fullMessageText.substring(searchStart, searchEnd);

        for (const regex of linguisticsRegexes) {
            const matches = [...searchArea.matchAll(regex)];
            if (matches.length > 0) {
                // Found a standalone linguistics block - append it
                const linguisticsBlock = matches[0][0].trim();
                CarrotDebug.ui('🐰 BATCH PARSER: Found standalone Linguistics block (old format), appending...');
                completeCharacterData += '\n\n' + linguisticsBlock;
                break;
            }
        }
    }

    CarrotDebug.ui('🐰 BATCH PARSER: Extraction complete', {
        characterName,
        dataLength: completeCharacterData.length,
        containsLinguistics: completeCharacterData.includes('<Linguistics>') || completeCharacterData.includes('<linguistics>'),
        usedOldFormat: !hasLinguisticsInside && (completeCharacterData.includes('<Linguistics>') || completeCharacterData.includes('<linguistics>'))
    });

    return {
        name: characterName,
        tags: completeCharacterData, // Complete BunnymoTags block as-is (with appended linguistics if old format)
        bunnymoTags: completeCharacterData, // Same
        linguistics: '', // Don't separate - it's already inside or appended
        fullText: fullMessageText
    };
}

// Extract character information from standardized sheet data
function extractCharacterFromSheetData(bunnymoBlock, linguisticsBlocks, fullMessageText) {
    // Try to find character name from multiple sources
    let characterName = '';

    // First priority: Look for <Name:> tag in BunnymoTags
    if (bunnymoBlock) {
        const nameMatch = bunnymoBlock.match(/<Name:([^>]+)>/i);
        if (nameMatch) {
            characterName = nameMatch[1].trim();
            CarrotDebug.ui('🐰 NAME EXTRACTION: Found from BunnymoTags <Name:> tag:', characterName);
        }
    }

    // Second priority: Look for name in Linguistics blocks
    if (!characterName && linguisticsBlocks.length > 0) {
        for (const linguisticsBlock of linguisticsBlocks) {
            const patterns = [
                /([A-Z][a-z]+)'s\s+primary\s+mode\s+of\s+speech/i,
                /Character\s+uses\s+([A-Z][a-z]+)/i,
                /([A-Z][a-z]+)\s+uses\s+<LING:/i
            ];

            for (const pattern of patterns) {
                const match = linguisticsBlock.match(pattern);
                if (match) {
                    characterName = match[1].trim();
                    CarrotDebug.ui('🐰 NAME EXTRACTION: Found from Linguistics:', { pattern: pattern.source, name: characterName });
                    break;
                }
            }
            if (characterName) break;
        }
    }

    // Third priority: Look in full message text
    if (!characterName) {
        const patterns = [
            /Character:\s*([A-Za-z_\s]+)/i,
            /Name.*?:\s*([A-Za-z_\s]+)/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\s+(?:sheet|character)/i
        ];

        for (const pattern of patterns) {
            const match = fullMessageText.match(pattern);
            if (match) {
                characterName = match[1].trim();
                CarrotDebug.ui('🐰 NAME EXTRACTION: Found from full message:', { pattern: pattern.source, name: characterName });
                break;
            }
        }
    }

    // Fallback name
    if (!characterName) {
        characterName = 'Character';
        CarrotDebug.ui('🐰 NAME EXTRACTION: Using fallback name');
    }

    // Combine all data
    let completeCharacterData = '';

    if (bunnymoBlock) {
        completeCharacterData = bunnymoBlock;
    }

    if (linguisticsBlocks.length > 0) {
        if (completeCharacterData) {
            completeCharacterData += '\n\n';
        }
        completeCharacterData += linguisticsBlocks.join('\n\n');
    }

    CarrotDebug.ui('🐰 SHEET DATA EXTRACTION COMPLETE:', {
        characterName: characterName,
        hasBunnymoTags: !!bunnymoBlock,
        linguisticsCount: linguisticsBlocks.length,
        totalDataLength: completeCharacterData.length
    });

    return {
        name: characterName,
        tags: completeCharacterData, // Complete combined data
        bunnymoTags: bunnymoBlock || '', // Just BunnymoTags
        linguistics: linguisticsBlocks.join('\n\n') || '', // All Linguistics combined
        fullText: fullMessageText
    };
}

// Extract character information from BunnymoTags content
function extractCharacterFromTags(tagsContent, fullMessageText, fullTagsContent) {
    // Try to find character name from tags
    let characterName = '';

    // Look for <Name:> tag first (check both inner content and full content)
    let nameMatch = tagsContent.match(/<Name:([^>]+)>/i);
    if (!nameMatch) {
        nameMatch = fullTagsContent.match(/<Name:([^>]+)>/i);
    }

    if (nameMatch) {
        characterName = nameMatch[1].trim();
        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Found name from tags:', characterName);
    } else {
        // Try different name patterns
        const patterns = [
            /([A-Z][a-z]+)'s\s+primary\s+mode\s+of\s+speech/i, // From Linguistics section
            /Character\s+uses\s+.*?([A-Z][a-z]+)/i,
            /Character:\s*([A-Za-z_\s]+)/i,
            /Name.*?:\s*([A-Za-z_\s]+)/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\s+(?:sheet|character)/i,
            /<[^>]*>\s*([A-Z][a-z]+)/i // First capitalized word in tags
        ];

        for (const pattern of patterns) {
            const match = fullMessageText.match(pattern);
            if (match) {
                characterName = match[1].trim();
                CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Found name from pattern:', { pattern: pattern.source, name: characterName });
                break;
            }
        }

        if (!characterName) {
            characterName = 'Character';
            CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Using fallback name');
        }
    }

    CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Character extraction', {
        characterName: characterName,
        tagsContentLength: tagsContent.length,
        fullTagsContentLength: fullTagsContent.length,
        usingFullContent: true
    });

    // Extract linguistics information if present
    let linguisticsContent = '';
    const linguisticsRegex = /<[lL]inguistics>\s*(.*?)\s*<\/[lL]inguistics>/gis;
    const linguisticsMatch = fullMessageText.match(linguisticsRegex);
    if (linguisticsMatch) {
        linguisticsContent = linguisticsMatch[0]; // Include the full linguistics tags
    }

    // Combine BunnymoTags and Linguistics for complete character data
    let completeCharacterData = fullTagsContent;
    if (linguisticsContent) {
        completeCharacterData += '\n\n' + linguisticsContent;
    }

    return {
        name: characterName,
        tags: completeCharacterData, // Include both BunnymoTags and Linguistics
        bunnymoTags: fullTagsContent, // Just the BunnymoTags for editing
        linguistics: linguisticsContent, // Just the linguistics for editing
        fullText: fullMessageText
    };
}

// Show comprehensive batch configuration popup for multiple characters
async function showBatchBabyBunnyPopup(charactersData) {
    return new Promise(async (resolve) => {
        const availableLorebooks = world_names?.length ? world_names : [];
        const lorebookOptions = availableLorebooks.map(name =>
            `<option value="${name}">${name}</option>`
        ).join('');

        // Build character configuration sections - COLLAPSED by default
        const characterSections = charactersData.map((char, index) => {
            const displayTags = char.tags
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;([^&]+)&gt;/g, '<span style="color: var(--SmartThemeQuoteColor); font-weight: 600;">&lt;$1&gt;</span>');

            return `
            <div class="batch-character-config" data-char-index="${index}" data-enabled="true" style="
                border: 2px solid var(--SmartThemeBorderColor);
                border-radius: 12px;
                background: linear-gradient(135deg, var(--SmartThemeBlurTintColor) 0%, rgba(var(--SmartThemeQuoteColorRGB, 78, 205, 196), 0.03) 100%);
                margin-bottom: 12px;
                transition: all 0.2s ease;
            ">
                <!-- Collapsible Header with Toggle -->
                <div class="batch-char-header" data-char-index="${index}" style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px 20px;
                    cursor: pointer;
                    user-select: none;
                ">
                    <!-- Enable/Disable Toggle Switch -->
                    <label class="batch-char-toggle" style="
                        position: relative;
                        width: 44px;
                        height: 24px;
                        flex-shrink: 0;
                    " onclick="event.stopPropagation();">
                        <input type="checkbox" class="batch-char-toggle-input" data-char-index="${index}" checked style="
                            opacity: 0;
                            width: 0;
                            height: 0;
                            position: absolute;
                        ">
                        <span class="batch-char-toggle-slider" style="
                            position: absolute;
                            cursor: pointer;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background-color: var(--SmartThemeQuoteColor);
                            transition: 0.3s;
                            border-radius: 24px;
                        ">
                            <span style="
                                position: absolute;
                                content: '';
                                height: 18px;
                                width: 18px;
                                left: 3px;
                                bottom: 3px;
                                background-color: white;
                                transition: 0.3s;
                                border-radius: 50%;
                            "></span>
                        </span>
                    </label>

                    <!-- Character Number Badge -->
                    <div style="
                        background: var(--SmartThemeQuoteColor);
                        color: var(--SmartThemeBlurTintColor);
                        border-radius: 50%;
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 16px;
                        font-weight: bold;
                        flex-shrink: 0;
                    ">${index + 1}</div>

                    <!-- Character Info -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 18px; font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">
                            ${char.name}
                        </div>
                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">
                            ${char.tags.length} characters of data
                        </div>
                    </div>

                    <!-- Expand/Collapse Icon -->
                    <i class="fa-solid fa-chevron-down batch-char-chevron" data-char-index="${index}" style="
                        color: var(--SmartThemeQuoteColor);
                        font-size: 14px;
                        transition: transform 0.2s ease;
                        flex-shrink: 0;
                    "></i>
                </div>

                <!-- Collapsible Content (hidden by default) -->
                <div class="batch-char-content" data-char-index="${index}" style="
                    display: none;
                    padding: 0 20px 20px 20px;
                    border-top: 1px solid var(--SmartThemeBorderColor);
                    margin-top: 0;
                ">

                <!-- Entry Name -->
                <div class="carrot-setting-item" style="margin-bottom: 16px;">
                    <label class="carrot-label">
                        <span class="carrot-label-text">Entry Name</span>
                        <span class="carrot-label-hint">Name that will appear in the lorebook entry list</span>
                    </label>
                    <input type="text" class="batch-entry-name carrot-input" data-char-index="${index}" value="${char.name}" style="font-size: 14px; padding: 12px;">
                </div>

                <!-- Trigger Keys -->
                <div class="carrot-setting-item" style="margin-bottom: 16px;">
                    <label class="carrot-label">
                        <span class="carrot-label-text">Trigger Keys</span>
                        <span class="carrot-label-hint">Character names and aliases that will activate this entry</span>
                    </label>
                    <div class="batch-triggers-container tag-input-container" data-char-index="${index}" style="
                        border: 1px solid var(--SmartThemeBorderColor);
                        border-radius: 6px;
                        padding: 8px;
                        background: var(--SmartThemeBlurTintColor);
                        min-height: 50px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        align-items: flex-start;
                        cursor: text;
                    ">
                        <div class="trigger-tag" data-tag="${char.name}" style="
                            background: var(--SmartThemeQuoteColor);
                            color: var(--SmartThemeBlurTintColor);
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 13px;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        ">
                            <span class="tag-text">${char.name}</span>
                            <i class="fa-solid fa-times tag-remove" style="cursor: pointer; opacity: 0.7;"></i>
                        </div>
                        <input type="text" class="batch-trigger-input" data-char-index="${index}" placeholder="Type and press Enter..." style="
                            border: none;
                            background: none;
                            outline: none;
                            flex: 1;
                            min-width: 150px;
                            font-size: 13px;
                            color: var(--SmartThemeBodyColor);
                        ">
                    </div>
                </div>

                <!-- Selection Mode -->
                <div class="carrot-setting-item" style="margin-bottom: 16px;">
                    <label class="carrot-label">
                        <span class="carrot-label-text">Entry Selection Mode</span>
                        <span class="carrot-label-hint">How this character's data should be activated</span>
                    </label>

                    <div style="display: flex; gap: 12px; margin-top: 12px;">
                        <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                            <input type="radio" name="selection-mode-${index}" class="batch-selection-mode" data-char-index="${index}" value="selective" checked style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                    <i class="fa-solid fa-hand-pointer" style="color: var(--SmartThemeQuoteColor);"></i>
                                    Selective
                                </div>
                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Entry only fires when triggers are mentioned in chat</div>
                            </div>
                        </label>

                        <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                            <input type="radio" name="selection-mode-${index}" class="batch-selection-mode" data-char-index="${index}" value="constant" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                    <i class="fa-solid fa-infinity" style="color: var(--SmartThemeQuoteColor);"></i>
                                    Constant
                                </div>
                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Always active - for MAIN characters only</div>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Tag Preview/Edit -->
                <div class="carrot-setting-item">
                    <label class="carrot-label">
                        <span class="carrot-label-text">Character Data</span>
                        <span class="carrot-label-hint">Click to edit tags</span>
                    </label>
                    <div class="tag-edit-container">
                        <div class="batch-tag-preview" data-char-index="${index}" style="
                            font-family: var(--monoFontFamily);
                            font-size: 11px;
                            color: var(--SmartThemeQuoteColor);
                            padding: 12px;
                            background: var(--SmartThemeBlurTintColor);
                            border: 1px solid var(--SmartThemeBorderColor);
                            border-radius: 6px;
                            max-height: 200px;
                            overflow-y: auto;
                            cursor: pointer;
                            line-height: 1.3;
                        ">${displayTags}</div>
                        <textarea class="batch-tag-editor carrot-input" data-char-index="${index}" style="
                            font-family: var(--monoFontFamily);
                            font-size: 11px;
                            min-height: 200px;
                            display: none;
                            line-height: 1.3;
                        ">${char.tags}</textarea>
                        <div class="batch-tag-edit-actions" data-char-index="${index}" style="margin-top: 8px; display: none;">
                            <button class="batch-save-tags carrot-primary-btn" data-char-index="${index}" style="font-size: 12px; padding: 6px 12px;">
                                <i class="fa-solid fa-save"></i> Save
                            </button>
                            <button class="batch-cancel-edit carrot-secondary-btn" data-char-index="${index}" style="font-size: 12px; padding: 6px 12px; margin-left: 8px;">
                                <i class="fa-solid fa-times"></i> Cancel
                            </button>
                        </div>
                    </div>
                </div>
                </div><!-- Close batch-char-content -->
            </div><!-- Close batch-character-config -->
            `;
        }).join('');

        const popup = $(`
            <div class="carrot-popup-container baby-bunny-batch-popup" style="padding: 0; max-width: 900px; width: 95%;">
                <div class="carrot-card" style="margin: 0; height: auto;">
                    <!-- Header -->
                    <div class="carrot-card-header" style="padding: 24px 32px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 24px;">🐰 Baby Bunny Mode - Batch Import</h3>
                            <button id="batch-process-individually" class="carrot-secondary-btn" style="
                                font-size: 13px;
                                padding: 8px 16px;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                white-space: nowrap;
                            ">
                                <i class="fa-solid fa-user"></i>
                                Process Individually
                            </button>
                        </div>
                        <p class="carrot-card-subtitle" style="margin: 0; color: var(--SmartThemeQuoteColor);">
                            <span id="batch-selected-count">${charactersData.length}</span> of ${charactersData.length} characters selected
                        </p>
                    </div>

                    <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 24px;">

                        <!-- Step 1: Lorebook Configuration -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">1</span>
                                Lorebook Configuration
                            </h4>

                            <!-- Grouping Mode -->
                            <div class="carrot-setting-item" style="margin-bottom: 16px;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Grouping Mode</span>
                                    <span class="carrot-label-hint">How to organize these characters into lorebooks</span>
                                </label>
                                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; background: var(--SmartThemeBlurTintColor);">
                                        <input type="radio" name="batch-grouping-mode" value="single-new" checked style="accent-color: var(--SmartThemeQuoteColor);">
                                        <div>
                                            <div style="font-weight: 600;">Single New Lorebook</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Put all characters in one new lorebook</div>
                                        </div>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; background: var(--SmartThemeBlurTintColor);">
                                        <input type="radio" name="batch-grouping-mode" value="multiple-new" style="accent-color: var(--SmartThemeQuoteColor);">
                                        <div>
                                            <div style="font-weight: 600;">Separate New Lorebooks</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Create a new lorebook for each character</div>
                                        </div>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; background: var(--SmartThemeBlurTintColor);">
                                        <input type="radio" name="batch-grouping-mode" value="single-existing" ${availableLorebooks.length === 0 ? 'disabled' : ''} style="accent-color: var(--SmartThemeQuoteColor);">
                                        <div>
                                            <div style="font-weight: 600;">Single Existing Lorebook</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Add all characters to one existing lorebook</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <!-- Lorebook Name (for single-new mode) -->
                            <div class="carrot-setting-item" id="batch-single-new-section">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">New Lorebook Name</span>
                                    <span class="carrot-label-hint">Name for the shared lorebook</span>
                                </label>
                                <input type="text" id="batch-lorebook-name" value="Character Archive - ${charactersData.map(c => c.name).join(', ')}" class="carrot-input" style="font-size: 14px; padding: 12px;">
                            </div>

                            <!-- Existing Lorebook Selection (for single-existing mode) -->
                            <div class="carrot-setting-item" id="batch-single-existing-section" style="display: none;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Select Existing Lorebook</span>
                                    <span class="carrot-label-hint">Choose from your available lorebooks</span>
                                </label>
                                <select id="batch-existing-lorebook" class="carrot-select" style="font-size: 14px; padding: 12px;">
                                    <option value="">-- Select Lorebook --</option>
                                    ${lorebookOptions}
                                </select>
                            </div>

                            <!-- Lorebook Names (for multiple-new mode) -->
                            <div class="carrot-setting-item" id="batch-multiple-new-section" style="display: none;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Lorebook Names</span>
                                    <span class="carrot-label-hint">Name each character's lorebook</span>
                                </label>
                                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                                    ${charactersData.map((char, index) => `
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <div style="
                                                background: var(--SmartThemeQuoteColor);
                                                color: var(--SmartThemeBlurTintColor);
                                                border-radius: 50%;
                                                width: 28px;
                                                height: 28px;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                font-size: 12px;
                                                font-weight: bold;
                                                flex-shrink: 0;
                                            ">${index + 1}</div>
                                            <div style="flex: 1;">
                                                <input type="text"
                                                    class="batch-multiple-lorebook-name carrot-input"
                                                    data-char-index="${index}"
                                                    value="${char.name} Character Archive"
                                                    placeholder="Lorebook name for ${char.name}"
                                                    style="font-size: 13px; padding: 10px; width: 100%;">
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Step 2: Character Configurations -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">2</span>
                                Configure Characters
                            </h4>

                            <div id="batch-character-configs" style="max-height: 500px; overflow-y: auto; padding-right: 8px;">
                                ${characterSections}
                            </div>
                        </div>

                        <!-- Step 3: Activation Scope -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">3</span>
                                Activation Scope
                            </h4>

                            <div class="carrot-setting-item">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Where to Activate</span>
                                    <span class="carrot-label-hint">Choose where to activate the lorebook(s)</span>
                                </label>

                                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="batch-lorebook-scope" value="character" checked style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-user" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Character Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to ALL chats with this character</div>
                                            </div>
                                        </div>
                                    </label>

                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="batch-lorebook-scope" value="chat" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-comments" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Chat Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply ONLY to this specific conversation</div>
                                            </div>
                                        </div>
                                    </label>

                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="batch-lorebook-scope" value="global" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-globe" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Global Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to all chats and characters</div>
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="carrot-action-bar" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--SmartThemeBorderColor);">
                            <button id="batch-bunny-cancel" class="carrot-secondary-btn" style="padding: 12px 24px; font-size: 14px;">
                                <i class="fa-solid fa-times"></i>
                                Cancel
                            </button>
                            <button id="batch-bunny-create" class="carrot-primary-btn" style="padding: 12px 24px; font-size: 14px;">
                                <i class="fa-solid fa-carrot"></i>
                                Create Archives
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Create overlay
        const overlay = $(`
            <div class="baby-bunny-overlay" style="
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100vh !important;
                background: rgba(0,0,0,0.8) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                backdrop-filter: blur(4px) !important;
            "></div>
        `);

        popup.css({
            'max-width': '900px',
            'width': '95%',
            'max-height': '85vh',
            'overflow-y': 'auto',
            'z-index': '999999',
            'position': 'relative'
        });

        overlay.append(popup);
        $('body').append(overlay);
        overlay.show();
        $('html, body').scrollTop(0);

        CarrotDebug.ui('🐰 BATCH BABY BUNNY DEBUG: Popup displayed for', charactersData.length, 'characters');

        // === EVENT HANDLERS ===

        // Character expand/collapse functionality
        popup.find('.batch-char-header').on('click', function() {
            const charIndex = $(this).data('char-index');
            const content = popup.find(`.batch-char-content[data-char-index="${charIndex}"]`);
            const chevron = popup.find(`.batch-char-chevron[data-char-index="${charIndex}"]`);

            if (content.is(':visible')) {
                content.slideUp(200);
                chevron.css('transform', 'rotate(0deg)');
            } else {
                content.slideDown(200);
                chevron.css('transform', 'rotate(180deg)');
            }
        });

        // Toggle switch functionality
        popup.find('.batch-char-toggle-input').on('change', function(e) {
            e.stopPropagation();
            const charIndex = $(this).data('char-index');
            const isEnabled = $(this).is(':checked');
            const config = popup.find(`.batch-character-config[data-char-index="${charIndex}"]`);
            const slider = $(this).siblings('.batch-char-toggle-slider');

            // Update visual state
            config.attr('data-enabled', isEnabled);

            if (isEnabled) {
                slider.css('background-color', 'var(--SmartThemeQuoteColor)');
                slider.find('span').css('transform', 'translateX(20px)');
                config.css('opacity', '1');
            } else {
                slider.css('background-color', '#ccc');
                slider.find('span').css('transform', 'translateX(0)');
                config.css('opacity', '0.5');
            }

            // Update selected count
            const selectedCount = popup.find('.batch-character-config[data-enabled="true"]').length;
            popup.find('#batch-selected-count').text(selectedCount);

            CarrotDebug.ui('🐰 BATCH: Character toggle', { charIndex, enabled: isEnabled, selectedCount });
        });

        // Initialize toggle slider positions
        popup.find('.batch-char-toggle-input:checked').each(function() {
            $(this).siblings('.batch-char-toggle-slider').find('span').css('transform', 'translateX(20px)');
        });

        // "Process Individually" button - sends each character through single popup
        popup.find('#batch-process-individually').on('click', async function() {
            CarrotDebug.ui('🐰 BATCH: Processing characters individually');
            overlay.remove();

            // Process each enabled character through the normal single-character popup
            for (let i = 0; i < charactersData.length; i++) {
                const isEnabled = popup.find(`.batch-character-config[data-char-index="${i}"]`).attr('data-enabled') === 'true';
                if (isEnabled) {
                    CarrotDebug.ui('🐰 BATCH: Processing character individually:', charactersData[i].name);
                    await showBabyBunnyPopup(charactersData[i]);
                }
            }

            resolve(true);
        });

        // Grouping mode switching
        popup.find('input[name="batch-grouping-mode"]').on('change', async function() {
            const mode = $(this).val();
            popup.find('#batch-single-new-section').toggle(mode === 'single-new');
            popup.find('#batch-single-existing-section').toggle(mode === 'single-existing');
            popup.find('#batch-multiple-new-section').toggle(mode === 'multiple-new');
        });

        // Trigger key input for each character
        popup.find('.batch-trigger-input').each(function() {
            const input = $(this);
            const charIndex = input.data('char-index');
            const container = popup.find(`.batch-triggers-container[data-char-index="${charIndex}"]`);

            input.on('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const tagText = $(this).val().trim();
                    if (tagText && !container.find(`[data-tag="${tagText}"]`).length) {
                        const tagElement = $(`
                            <div class="trigger-tag" data-tag="${tagText}" style="
                                background: var(--SmartThemeQuoteColor);
                                color: var(--SmartThemeBlurTintColor);
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 13px;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <span class="tag-text">${tagText}</span>
                                <i class="fa-solid fa-times tag-remove" style="cursor: pointer; opacity: 0.7;"></i>
                            </div>
                        `);
                        tagElement.insertBefore(input);
                        $(this).val('');
                    }
                }
            });

            // Click container to focus input
            container.on('click', function(e) {
                if (e.target === this || e.target.classList.contains('batch-triggers-container')) {
                    input.focus();
                }
            });
        });

        // Remove trigger tags
        popup.on('click', '.tag-remove', function() {
            $(this).closest('.trigger-tag').remove();
        });

        // Tag editing for each character
        popup.find('.batch-tag-preview').on('click', function() {
            const charIndex = $(this).data('char-index');
            $(this).hide();
            popup.find(`.batch-tag-editor[data-char-index="${charIndex}"]`).show();
            popup.find(`.batch-tag-edit-actions[data-char-index="${charIndex}"]`).show();
        });

        popup.find('.batch-save-tags').on('click', function() {
            const charIndex = $(this).data('char-index');
            const newTags = popup.find(`.batch-tag-editor[data-char-index="${charIndex}"]`).val();
            const newDisplayTags = newTags
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;([^&]+)&gt;/g, '<span style="color: var(--SmartThemeQuoteColor); font-weight: 600;">&lt;$1&gt;</span>');

            popup.find(`.batch-tag-preview[data-char-index="${charIndex}"]`).html(newDisplayTags);
            popup.find(`.batch-tag-editor[data-char-index="${charIndex}"]`).hide();
            popup.find(`.batch-tag-edit-actions[data-char-index="${charIndex}"]`).hide();
            popup.find(`.batch-tag-preview[data-char-index="${charIndex}"]`).show();

            // Update the character data
            charactersData[charIndex].tags = newTags;
        });

        popup.find('.batch-cancel-edit').on('click', function() {
            const charIndex = $(this).data('char-index');
            popup.find(`.batch-tag-editor[data-char-index="${charIndex}"]`).hide();
            popup.find(`.batch-tag-edit-actions[data-char-index="${charIndex}"]`).hide();
            popup.find(`.batch-tag-preview[data-char-index="${charIndex}"]`).show();
            // Reset to original value
            popup.find(`.batch-tag-editor[data-char-index="${charIndex}"]`).val(charactersData[charIndex].tags);
        });

        // Cancel button
        popup.find('#batch-bunny-cancel').on('click', function() {
            CarrotDebug.ui('🐰 BATCH BABY BUNNY DEBUG: Cancelled');
            overlay.remove();
            resolve(false);
        });

        // Create button
        popup.find('#batch-bunny-create').on('click', async function() {
            const mode = popup.find('input[name="batch-grouping-mode"]:checked').val();
            const scope = popup.find('input[name="batch-lorebook-scope"]:checked').val();

            CarrotDebug.ui('🐰 BATCH BABY BUNNY DEBUG: Creating archives', { mode, scope });

            // Collect character configurations - ONLY ENABLED ONES
            const characterConfigs = charactersData
                .map((char, index) => {
                    // Check if this character is enabled
                    const isEnabled = popup.find(`.batch-character-config[data-char-index="${index}"]`).attr('data-enabled') === 'true';

                    if (!isEnabled) {
                        return null; // Skip disabled characters
                    }

                    const entryName = popup.find(`.batch-entry-name[data-char-index="${index}"]`).val();
                    const triggers = [];
                    popup.find(`.batch-triggers-container[data-char-index="${index}"] .trigger-tag`).each(function() {
                        triggers.push($(this).data('tag'));
                    });
                    const tags = popup.find(`.batch-tag-editor[data-char-index="${index}"]`).val();
                    const selectionMode = popup.find(`.batch-selection-mode[data-char-index="${index}"]:checked`).val() || 'selective';

                    return {
                        ...char,
                        entryName,
                        triggers,
                        tags,
                        selectionMode
                    };
                })
                .filter(config => config !== null); // Remove disabled characters

            // Check if any characters are enabled
            if (characterConfigs.length === 0) {
                toastr.warning('Please enable at least one character to import');
                return;
            }

            CarrotDebug.ui('🐰 BATCH: Processing', characterConfigs.length, 'enabled characters');

            // Validate all inputs BEFORE tearing down the popup. Destroying it first
            // (as before) meant any validation failure discarded the user's entire
            // configuration with no way to recover, and left the returned promise
            // permanently unresolved since resolve() was never called on these paths.
            let singleLorebookName = null;
            const multipleLorebookNames = [];

            if (mode === 'single-new') {
                singleLorebookName = popup.find('#batch-lorebook-name').val().trim();
                if (!singleLorebookName) {
                    toastr.error('Please enter a lorebook name');
                    resolve(false);
                    return;
                }
            } else if (mode === 'multiple-new') {
                for (let i = 0; i < characterConfigs.length; i++) {
                    const config = characterConfigs[i];
                    const originalIndex = charactersData.indexOf(charactersData.find(c => c.name === config.name));

                    // Get the custom lorebook name from the input field
                    const lorebookName = popup.find(`.batch-multiple-lorebook-name[data-char-index="${originalIndex}"]`).val().trim();

                    if (!lorebookName) {
                        toastr.error(`Please enter a lorebook name for ${config.entryName}`);
                        resolve(false);
                        return;
                    }

                    multipleLorebookNames.push(lorebookName);
                }
            } else if (mode === 'single-existing') {
                singleLorebookName = popup.find('#batch-existing-lorebook').val();
                if (!singleLorebookName) {
                    toastr.error('Please select a lorebook');
                    resolve(false);
                    return;
                }
            }

            overlay.remove();

            // Process based on mode
            if (mode === 'single-new') {
                // Create single lorebook for all characters
                await processBatchToSingleLorebook(characterConfigs, singleLorebookName, true, scope);

            } else if (mode === 'multiple-new') {
                // Create separate lorebooks for each, using custom names
                for (let i = 0; i < characterConfigs.length; i++) {
                    await processSingleCharacterArchive(characterConfigs[i], multipleLorebookNames[i], true, scope);
                }

            } else if (mode === 'single-existing') {
                // Add all to existing lorebook
                await processBatchToSingleLorebook(characterConfigs, singleLorebookName, false, scope);
            }

            resolve(true);
        });
    });
}

// Helper function: Process all characters to a single lorebook
async function processBatchToSingleLorebook(characterConfigs, lorebookName, createNew, scope) {
    CarrotDebug.ui('🐰 BATCH PROCESSING: Single lorebook mode', { lorebookName, createNew, characterCount: characterConfigs.length });

    // Create or load the lorebook
    let lorebook;
    if (createNew) {
        lorebook = await createNewLorebook(lorebookName);
    } else {
        lorebook = await loadExistingLorebook(lorebookName);
    }

    if (!lorebook) {
        toastr.error('Failed to create/load lorebook');
        return;
    }

    // Add each character as an entry
    for (const config of characterConfigs) {
        await addCharacterToLorebook(lorebook, config, lorebookName);
    }

    // Save and activate the lorebook
    await saveLorebook(lorebook, lorebookName);
    await activateLorebook(lorebookName, scope);

    toastr.success(`Created ${characterConfigs.length} character archives in "${lorebookName}"`);
}

// Helper function: Process single character to its own archive
async function processSingleCharacterArchive(config, lorebookName, createNew, scope) {
    CarrotDebug.ui('🐰 BATCH PROCESSING: Single character mode', { name: config.entryName, lorebookName });

    let lorebook;
    if (createNew) {
        lorebook = await createNewLorebook(lorebookName);
    } else {
        lorebook = await loadExistingLorebook(lorebookName);
    }

    if (!lorebook) {
        toastr.error(`Failed to create/load lorebook for ${config.entryName}`);
        return;
    }

    await addCharacterToLorebook(lorebook, config, lorebookName);
    await saveLorebook(lorebook, lorebookName);
    await activateLorebook(lorebookName, scope);

    toastr.success(`Created character archive "${lorebookName}"`);
}

// Helper function: Add character to lorebook using ST's proper entry creation
async function addCharacterToLorebook(lorebook, config, lorebookName) {
    // Use ST's createWorldInfoEntry function to create properly formatted entry
    const newEntry = createWorldInfoEntry(lorebookName, lorebook);

    if (!newEntry) {
        CarrotDebug.error('🐰 BATCH PROCESSING ERROR: Failed to create entry for', config.entryName);
        return;
    }

    // Configure the entry with character data (following Baby Bunny Mode format)
    newEntry.comment = `${config.entryName} Character Archive - Generated by Baby Bunny Mode (Batch)`;
    newEntry.content = config.tags; // Full BunnymoTags block
    newEntry.key = config.triggers;
    newEntry.keysecondary = [];
    newEntry.selective = config.selectionMode === 'selective';
    newEntry.constant = config.selectionMode === 'constant';
    newEntry.order = 550;
    newEntry.position = 4;
    newEntry.disable = false;
    newEntry.addMemo = true;
    newEntry.excludeRecursion = true;
    newEntry.preventRecursion = false;
    newEntry.matchPersonaDescription = false;
    newEntry.matchCharacterDescription = false;
    newEntry.matchCharacterPersonality = false;
    newEntry.matchCharacterDepthPrompt = false;
    newEntry.matchScenario = false;
    newEntry.matchCreatorNotes = false;
    newEntry.delayUntilRecursion = false;
    newEntry.scanDepth = null;
    newEntry.caseSensitive = null;
    newEntry.matchWholeWords = null;
    newEntry.useGroupScoring = null;
    newEntry.groupOverride = false;
    newEntry.groupWeight = 100;
    newEntry.group = '';
    newEntry.probability = 100;
    newEntry.useProbability = false;

    CarrotDebug.ui('🐰 BATCH PROCESSING: Added entry', {
        name: config.entryName,
        triggers: config.triggers,
        uid: newEntry.uid
    });
}

// Helper function: Create new lorebook using ST's API
async function createNewLorebook(name) {
    try {
        await createNewWorldInfo(name);
        CarrotDebug.ui('🐰 BATCH PROCESSING: Created new lorebook', { name });
        return await loadWorldInfo(name);
    } catch (error) {
        CarrotDebug.error('🐰 BATCH PROCESSING ERROR: Failed to create lorebook', error);
        return null;
    }
}

// Helper function: Load existing lorebook using ST's API
async function loadExistingLorebook(name) {
    try {
        const data = await loadWorldInfo(name);
        CarrotDebug.ui('🐰 BATCH PROCESSING: Loaded existing lorebook', { name, entryCount: data.entries?.length });
        return data;
    } catch (error) {
        CarrotDebug.error('🐰 BATCH PROCESSING ERROR: Failed to load lorebook', error);
        return null;
    }
}

// Helper function: Save lorebook using ST's API
async function saveLorebook(lorebook, name) {
    try {
        // immediately=true: saveWorldInfo's debounced path shares a single timer, so a
        // batch loop saving several lorebooks back-to-back would otherwise only ever
        // persist the last one once the timer finally fires.
        await saveWorldInfo(name, lorebook, true);
        CarrotDebug.ui('🐰 BATCH PROCESSING: Saved lorebook', { name });
        return true;
    } catch (error) {
        CarrotDebug.error('🐰 BATCH PROCESSING ERROR: Failed to save lorebook', error);
        return false;
    }
}

// Show the guided Baby Bunny Mode popup
async function showBabyBunnyPopup(characterData, options = {}) {
    return new Promise(async (resolve) => {
        // Get available lorebooks for dropdown
        const availableLorebooks = world_names?.length ? world_names : [];

        // Handle forced lorebook from batch processing
        const forceLorebook = options.forceLorebook || null;
        const createNew = options.createNew !== undefined ? options.createNew : true;
        const skipLorebookUI = options.skipLorebookUI || false;

        // Format tags properly to bypass ST's tag filtering and make them readable
        const displayTags = characterData.tags
            .replace(/</g, '&lt;')  // Escape < to bypass ST filtering
            .replace(/>/g, '&gt;')  // Escape > to bypass ST filtering
            .replace(/&lt;([^&]+)&gt;/g, '<span style="color: var(--SmartThemeQuoteColor); font-weight: 600;">&lt;$1&gt;</span>'); // Colorize tags

        const lorebookOptions = availableLorebooks.map(name =>
            `<option value="${name}">${name}</option>`
        ).join('');

        const popup = $(`
            <div class="carrot-popup-container baby-bunny-popup" style="padding: 0; max-width: 750px; width: 95%;">
                <div class="carrot-card" style="margin: 0; height: auto;">
                    <!-- Header matching CarrotKernel style -->
                    <div class="carrot-card-header" style="padding: 24px 32px 16px; position: relative;">
                        <h3 style="margin: 0 0 8px; font-size: 24px;">🐰 Baby Bunny Mode</h3>
                        <p class="carrot-card-subtitle" style="margin: 0; color: var(--SmartThemeQuoteColor);">Guided Character Archive Creation</p>
                        <button class="menu_button" id="baby-bunny-skip-to-chunking" style="
                            position: absolute;
                            top: 24px;
                            right: 32px;
                            padding: 6px 12px;
                            font-size: 0.85em;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            opacity: 0.8;
                            transition: opacity 0.2s;
                        " title="Skip lorebook setup and go directly to chunking">
                            <i class="fa-solid fa-forward"></i>
                            <span>Skip to Chunking</span>
                        </button>
                    </div>

                    <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 24px;">

                        <!-- Step 1: Lorebook Selection -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">1</span>
                                Choose Archive Location
                            </h4>

                            <div class="carrot-setting-item" style="margin-bottom: 16px;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Archive Type</span>
                                    <span class="carrot-label-hint">Create a new lorebook or add to existing one</span>
                                </label>
                                <div style="display: flex; gap: 12px; margin-top: 8px;">
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="radio" name="lorebook-type" value="new" checked style="accent-color: var(--SmartThemeQuoteColor);">
                                        <span>Create New Lorebook</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="radio" name="lorebook-type" value="existing" ${availableLorebooks.length === 0 ? 'disabled' : ''} style="accent-color: var(--SmartThemeQuoteColor);">
                                        <span>Add to Existing</span>
                                    </label>
                                </div>
                            </div>

                            <div class="carrot-setting-item" id="new-lorebook-section">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">New Lorebook Name</span>
                                    <span class="carrot-label-hint">Name for the new character archive lorebook file</span>
                                </label>
                                <input type="text" id="baby-bunny-lorebook-name" value="${characterData.name} Character Archive" class="carrot-input" style="font-size: 14px; padding: 12px;">
                            </div>

                            <div class="carrot-setting-item" id="existing-lorebook-section" style="display: none;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Select Existing Lorebook</span>
                                    <span class="carrot-label-hint">Choose from your available lorebooks</span>
                                </label>
                                <select id="baby-bunny-existing-lorebook" class="carrot-select" style="font-size: 14px; padding: 12px;">
                                    <option value="">-- Select Lorebook --</option>
                                    ${lorebookOptions}
                                </select>
                            </div>
                        </div>

                        <!-- Step 2: Entry Configuration -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">2</span>
                                Configure Entry Details
                            </h4>

                            <div class="carrot-setting-item" style="margin-bottom: 16px;">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Entry Name</span>
                                    <span class="carrot-label-hint">Name that will appear in the lorebook entry list</span>
                                </label>
                                <input type="text" id="baby-bunny-entry-name" value="${characterData.name}" class="carrot-input" style="font-size: 14px; padding: 12px;">
                            </div>

                            <div class="carrot-setting-item">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Trigger Keys</span>
                                    <span class="carrot-label-hint">Character names and aliases that will activate this entry</span>
                                </label>
                                <div id="baby-bunny-triggers-container" class="tag-input-container" style="
                                    border: 1px solid var(--SmartThemeBorderColor);
                                    border-radius: 6px;
                                    padding: 8px;
                                    background: var(--SmartThemeBlurTintColor);
                                    min-height: 50px;
                                    display: flex;
                                    flex-wrap: wrap;
                                    gap: 6px;
                                    align-items: flex-start;
                                    cursor: text;
                                ">
                                    <div class="trigger-tag" data-tag="${characterData.name}" style="
                                        background: var(--SmartThemeQuoteColor);
                                        color: var(--SmartThemeBlurTintColor);
                                        padding: 4px 8px;
                                        border-radius: 4px;
                                        font-size: 13px;
                                        display: flex;
                                        align-items: center;
                                        gap: 6px;
                                    ">
                                        <span class="tag-text">${characterData.name}</span>
                                        <i class="fa-solid fa-times tag-remove" style="cursor: pointer; opacity: 0.7;" data-tag="${characterData.name}"></i>
                                    </div>
                                    <input type="text" id="baby-bunny-trigger-input" placeholder="Type trigger name and press Enter or Space..." style="
                                        border: none;
                                        background: none;
                                        outline: none;
                                        flex: 1;
                                        min-width: 200px;
                                        font-size: 13px;
                                        color: var(--SmartThemeBodyColor);
                                    ">
                                </div>
                            </div>
                        </div>

                        <!-- Step 3: Activation Mode -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">3</span>
                                Activation Mode
                            </h4>

                            <div class="carrot-setting-item">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Entry Selection Mode</span>
                                    <span class="carrot-label-hint">How this character's data should be activated</span>
                                </label>

                                <div style="display: flex; gap: 12px; margin-top: 12px;">
                                    <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="selection-mode" value="selective" checked style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                                <i class="fa-solid fa-hand-pointer" style="color: var(--SmartThemeQuoteColor);"></i>
                                                Selective
                                            </div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Entry only fires when triggers are mentioned in chat</div>
                                        </div>
                                    </label>

                                    <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="selection-mode" value="constant" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                                <i class="fa-solid fa-infinity" style="color: var(--SmartThemeQuoteColor);"></i>
                                                Constant
                                            </div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Always active - for MAIN characters only</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Step 4: Tag Review and Edit -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">4</span>
                                Review & Edit Character Data
                            </h4>

                            <div class="carrot-setting-item">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Character Tags</span>
                                    <span class="carrot-label-hint">BunnyMoTags and Linguistics data - click to edit</span>
                                </label>
                                <div class="tag-edit-container">
                                    <div id="tag-preview" class="carrot-preview-box" style="
                                        font-family: var(--monoFontFamily);
                                        font-size: 12px;
                                        color: var(--SmartThemeQuoteColor);
                                        padding: 16px;
                                        background: var(--SmartThemeBlurTintColor);
                                        border: 1px solid var(--SmartThemeBorderColor);
                                        border-radius: 6px;
                                        max-height: 300px;
                                        overflow-y: auto;
                                        cursor: pointer;
                                        line-height: 1.4;
                                    ">${displayTags}</div>
                                    <textarea id="tag-editor" class="carrot-input" style="
                                        font-family: var(--monoFontFamily);
                                        font-size: 12px;
                                        min-height: 300px;
                                        display: none;
                                        line-height: 1.4;
                                    ">${characterData.tags}</textarea>
                                    <div style="margin-top: 8px; display: none;" id="tag-edit-actions">
                                        <button id="save-tags" class="carrot-primary-btn" style="font-size: 12px; padding: 6px 12px;">
                                            <i class="fa-solid fa-save"></i> Save Changes
                                        </button>
                                        <button id="cancel-edit" class="carrot-secondary-btn" style="font-size: 12px; padding: 6px 12px; margin-left: 8px;">
                                            <i class="fa-solid fa-times"></i> Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Step 5: Loadout Management -->
                        <div class="carrot-setup-step">
                            <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">5</span>
                                Activate Lorebook
                            </h4>

                            <div class="carrot-setting-item">
                                <label class="carrot-label">
                                    <span class="carrot-label-text">Activation Scope</span>
                                    <span class="carrot-label-hint">Choose where to activate this lorebook</span>
                                </label>

                                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
                                    <!-- Character Settings Option -->
                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="lorebook-scope" value="character" checked style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-user" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Character Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to ALL chats with this character</div>
                                            </div>
                                        </div>
                                    </label>

                                    <!-- Chat Settings Option -->
                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="lorebook-scope" value="chat" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-comments" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Chat Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply ONLY to this specific conversation</div>
                                            </div>
                                        </div>
                                    </label>

                                    <!-- Global Settings Option -->
                                    <label class="carrot-toggle" style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; cursor: pointer; background: var(--SmartThemeBlurTintColor); transition: all 0.2s ease;">
                                        <input type="radio" name="lorebook-scope" value="global" style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                            <i class="fa-solid fa-globe" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Global Settings</div>
                                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to all chats and characters (default)</div>
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="carrot-action-bar" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--SmartThemeBorderColor);">
                            <button id="baby-bunny-cancel" class="carrot-secondary-btn" style="padding: 12px 24px; font-size: 14px;">
                                <i class="fa-solid fa-times"></i>
                                Cancel
                            </button>
                            <button id="baby-bunny-create" class="carrot-primary-btn" style="padding: 12px 24px; font-size: 14px;">
                                <i class="fa-solid fa-carrot"></i>
                                Create Archive
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Create custom overlay with maximum z-index to ensure visibility
        const overlay = $(`
            <div class="baby-bunny-overlay" style="
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100vh !important;
                background: rgba(0,0,0,0.8) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                backdrop-filter: blur(4px) !important;
            "></div>
        `);

        // Style the popup for better positioning with high priority
        popup.css({
            'max-width': '600px',
            'width': '90%',
            'max-height': '80vh',
            'overflow-y': 'auto',
            'z-index': '999999',
            'position': 'relative'
        });

        overlay.append(popup);
        $('body').append(overlay);

        // Force visibility and scroll to top to ensure user sees it
        overlay.show();
        $('html, body').scrollTop(0);

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Popup displayed', {
            overlayAdded: true,
            overlayVisible: overlay.is(':visible'),
            overlayInDOM: overlay.parent().length > 0,
            bodyChildren: $('body').children().length,
            overlayOffset: overlay.offset(),
            overlayDimensions: {
                width: overlay.width(),
                height: overlay.height()
            },
            popupVisible: popup.is(':visible'),
            computedZIndex: overlay.css('z-index')
        });

        // Additional debug: test that the overlay is actually clickable
        setTimeout(() => {
            CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Popup still visible after 1 second?', {
                overlayVisible: overlay.is(':visible'),
                overlayExists: $('.baby-bunny-overlay').length > 0
            });
        }, 1000);

        const skipButton = popup.find('#baby-bunny-skip-to-chunking');
        if (skipButton.length) {
            skipButton.on('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (skipButton.prop('disabled')) {
                    return;
                }

                const ragSettings = extension_settings[extensionName]?.rag;
                if (!ragSettings?.enabled) {
                    toastr.warning('Enable Smart Context (RAG) in CarrotKernel settings before chunking fullsheets.');
                    return;
                }

                const sourceText = characterData.fullText || characterData.tags;
                if (!sourceText || sourceText.length < 500) {
                    toastr.warning('No fullsheet content detected in this message to chunk.');
                    return;
                }

                const originalHtml = skipButton.html();
                const originalTitle = skipButton.attr('title');
                const setLoadingState = () => {
                    skipButton.prop('disabled', true)
                        .css('pointer-events', 'none')
                        .attr('title', 'Preparing chunking...')
                        .html('<i class="fa-solid fa-spinner fa-spin"></i> Chunking...');
                };
                const restoreButton = () => {
                    skipButton.prop('disabled', false)
                        .css('pointer-events', '')
                        .attr('title', originalTitle)
                        .html(originalHtml);
                };

                setLoadingState();

                try {
                    // Try to detect as fullsheet first
                    let fullsheetInfo = await detectFullsheetInMessage(sourceText);
                    let characterName = characterData.name || 'Unknown Character';
                    let content = sourceText;

                    // If fullsheet detection succeeded, use that data
                    if (fullsheetInfo) {
                        characterName = fullsheetInfo.characterName;
                        content = fullsheetInfo.content;
                        CarrotDebug.ui('✅ Detected as fullsheet format');
                    } else {
                        // Not a fullsheet - use sheet as-is for chunking
                        CarrotDebug.ui('ℹ️ Not a fullsheet format - chunking as raw sheet content');
                    }

                    CarrotDebug.ui('Baby Bunny Mode: Skip to chunking triggered', {
                        character: characterName,
                        isFullsheet: !!fullsheetInfo,
                        contentLength: content.length
                    });

                    overlay.remove();
                    restoreButton();

                    // Open Baby Bunny Chunking modal
                    const { openBabyBunnyChunking } = await import('./baby-bunny-mode.js');
                    await openBabyBunnyChunking(characterName, content);

                    resolve(true);
                } catch (error) {
                    CarrotDebug.error('BABY BUNNY ERROR: Skip to chunking failed', error);
                    // Only show toastr for unexpected errors not already handled by vectorizeFullsheetFromMessage
                    if (!error.message.includes('vectorization') && !error.message.includes('RAG')) {
                        toastr.error(`Failed to process fullsheet: ${error.message}`);
                    }
                    restoreButton();
                } finally {
                    if (skipButton.closest('body').length) {
                        restoreButton();
                    }
                }
            });
        }

        // Add interactive functionality for the new popup elements

        // 1. Lorebook type radio button switching
        popup.find('input[name="lorebook-type"]').on('change', async function() {
            const isNew = $(this).val() === 'new';
            popup.find('#new-lorebook-section').toggle(isNew);
            popup.find('#existing-lorebook-section').toggle(!isNew);
        });

        // 2. Tag input functionality for trigger keys
        const triggerContainer = popup.find('#baby-bunny-triggers-container');
        const triggerInput = popup.find('#baby-bunny-trigger-input');

        // Add tags on Enter or Space
        triggerInput.on('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const tagText = $(this).val().trim();
                if (tagText && !popup.find(`[data-tag="${tagText}"]`).length) {
                    addTriggerTag(tagText);
                    $(this).val('');
                }
            }
        });

        // Click container to focus input
        triggerContainer.on('click', function(e) {
            if (e.target === this || e.target.classList.contains('tag-input-container')) {
                triggerInput.focus();
            }
        });

        // Remove tags with X button
        triggerContainer.on('click', '.tag-remove', function() {
            $(this).closest('.trigger-tag').remove();
        });

        // Function to add new trigger tags
        function addTriggerTag(tagText) {
            const tagElement = $(`
                <div class="trigger-tag" data-tag="${tagText}" style="
                    background: var(--SmartThemeQuoteColor);
                    color: var(--SmartThemeBlurTintColor);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <span class="tag-text">${tagText}</span>
                    <i class="fa-solid fa-times tag-remove" style="cursor: pointer; opacity: 0.7;" data-tag="${tagText}"></i>
                </div>
            `);
            tagElement.insertBefore(triggerInput);
        }

        // 3. Tag editing functionality
        popup.find('#tag-preview').on('click', function() {
            $(this).hide();
            popup.find('#tag-editor').show();
            popup.find('#tag-edit-actions').show();
        });

        popup.find('#save-tags').on('click', function() {
            const newTags = popup.find('#tag-editor').val();
            const newDisplayTags = newTags
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;([^&]+)&gt;/g, '<span style="color: var(--SmartThemeQuoteColor); font-weight: 600;">&lt;$1&gt;</span>');

            popup.find('#tag-preview').html(newDisplayTags).show();
            popup.find('#tag-editor').hide();
            popup.find('#tag-edit-actions').hide();

            // Update the character data for saving
            characterData.tags = newTags;
        });

        popup.find('#cancel-edit').on('click', function() {
            popup.find('#tag-preview').show();
            popup.find('#tag-editor').hide();
            popup.find('#tag-edit-actions').hide();
        });

        // Handle button clicks
        popup.find('#baby-bunny-cancel').on('click', () => {
            overlay.remove();
            resolve(false);
        });

        popup.find('#baby-bunny-create').on('click', async () => {
            const isNewLorebook = popup.find('input[name="lorebook-type"]:checked').val() === 'new';
            const entryName = popup.find('#baby-bunny-entry-name').val().trim();
            const activationScope = popup.find('input[name="lorebook-scope"]:checked').val();
            const selectionMode = popup.find('input[name="selection-mode"]:checked').val() || 'selective';

            // Get lorebook name based on type
            let lorebookName;
            if (isNewLorebook) {
                lorebookName = popup.find('#baby-bunny-lorebook-name').val().trim();
            } else {
                lorebookName = popup.find('#baby-bunny-existing-lorebook').val();
            }

            // Get triggers from tag elements
            const triggers = [];
            popup.find('.trigger-tag').each(function() {
                triggers.push($(this).find('.tag-text').text().trim());
            });

            if (!entryName || !lorebookName || triggers.length === 0) {
                toastr.warning('Please fill in all required fields and add at least one trigger.');
                return;
            }

            overlay.remove();

            // Create the character archive with activation scope and selection mode
            await createCharacterArchive(entryName, triggers, lorebookName, characterData.tags, isNewLorebook, activationScope, selectionMode);
            resolve(true);
        });

        // Close on overlay click (outside popup)
        overlay.on('click', function(e) {
            if (e.target === this) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

// Expose checkForCompletedSheets to global scope for button access
window.checkForCompletedSheets = checkForCompletedSheets;

// Activate lorebook based on selected scope using SillyTavern's native world info system
async function activateLorebook(lorebookName, activationScope) {
    try {
        CarrotDebug.ui('🐰 Activating lorebook', { lorebookName, activationScope });

        const context = getContext();

        switch (activationScope) {
            case 'character':
                // Add to auxiliary lorebooks using ST's world_info.charLore structure
                if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
                    const char = context.characters[context.characterId];
                    const charFileName = char.avatar.replace(/\.(png|webp)$/, '');

                    // Initialize charLore if needed
                    if (!world_info.charLore) {
                        world_info.charLore = [];
                    }

                    // Find or create charLore entry for this character
                    let charLoreEntry = world_info.charLore.find(e => e.name === charFileName);
                    if (!charLoreEntry) {
                        charLoreEntry = { name: charFileName, extraBooks: [] };
                        world_info.charLore.push(charLoreEntry);
                    }

                    // Add lorebook to extraBooks if not already there
                    if (!charLoreEntry.extraBooks.includes(lorebookName)) {
                        charLoreEntry.extraBooks.push(lorebookName);
                        saveSettingsDebounced();

                        CarrotDebug.ui('🐰 ✅ Added lorebook to character auxiliary lorebooks:', char.name);
                        toastr.success(`Lorebook "${lorebookName}" added as auxiliary lorebook for ${char.name}`);
                    } else {
                        CarrotDebug.ui('🐰 Lorebook already in character auxiliary lorebooks');
                        toastr.info(`Lorebook "${lorebookName}" is already an auxiliary lorebook for ${char.name}`);
                    }
                } else {
                    CarrotDebug.ui('🐰 ⚠️ No character loaded - cannot activate character-scoped lorebook');
                    toastr.warning('No character is currently loaded. Lorebook created but not activated.');
                }
                break;

            case 'chat':
                // Set as chat's lorebook using ST's native structure
                // Stored in: chat_metadata['world_info'] (string, not array!)
                if (typeof chat_metadata !== 'undefined') {
                    // ST uses 'world_info' as the key, stores a single string
                    chat_metadata['world_info'] = lorebookName;

                    // Save chat metadata
                    await saveMetadataDebounced();

                    // Update UI - add 'world_set' class to chat lorebook button
                    $('.chat_lorebook_button').addClass('world_set');

                    CarrotDebug.ui('🐰 ✅ Activated lorebook for chat');
                    toastr.success(`Lorebook "${lorebookName}" activated for this chat`);
                }
                break;

            case 'global':
                // Activate lorebook globally by directly adding to selected_world_info
                CarrotDebug.ui('🐰 Activating lorebook globally:', lorebookName);

                // Directly add to selected_world_info array and save
                if (!selected_world_info.includes(lorebookName)) {
                    selected_world_info.push(lorebookName);
                    await updateWorldInfoList(); // Rebuild <option> elements, then let ST's own
                    // change handler persist the selection into world_info.globalSelect —
                    // saveSettingsDebounced() alone never writes that field.
                    $('#world_info').trigger('change');

                    CarrotDebug.ui('🐰 ✅ Added to selected_world_info and saved settings');
                    toastr.success(`Lorebook "${lorebookName}" activated globally`);
                } else {
                    CarrotDebug.ui('🐰 Lorebook already in selected_world_info');
                    toastr.info(`Lorebook "${lorebookName}" is already active globally`);
                }
                break;
        }

    } catch (error) {
        CarrotDebug.error('Failed to activate lorebook', error);
        toastr.warning('Lorebook created but activation failed: ' + error.message);
    }
}

// Create character archive lorebook with tags
async function createCharacterArchive(characterName, triggers, lorebookName, tags, isNewLorebook = true, activationScope = 'character', selectionMode = 'selective') {
    try {
        CarrotDebug.ui('🐰 Creating character archive', {
            characterName,
            triggers,
            lorebookName,
            tagsLength: tags.length,
            selectionMode
        });

        // Step 1: Handle lorebook creation/selection based on user choice
        let currentWorldInfo;

        if (isNewLorebook) {
            // Check if lorebook already exists for new lorebooks
            if (world_names.includes(lorebookName)) {
                // Show conflict resolution popup
                const userChoice = await showLorebookConflictDialog(lorebookName);
                if (userChoice === 'cancel') {
                    throw new Error('Operation cancelled by user.');
                } else if (userChoice === 'use_existing') {
                    // Use existing lorebook instead
                    isNewLorebook = false;
                    currentWorldInfo = await loadWorldInfo(lorebookName);
                } else if (userChoice === 'rename') {
                    // This would require re-prompting the user, for now just throw error
                    throw new Error(`Lorebook "${lorebookName}" already exists. Please choose a different name.`);
                }
            }

            if (isNewLorebook) {
                // Create lorebook structure manually without calling createNewWorldInfo
                CarrotDebug.ui('🐰 Creating new lorebook manually:', lorebookName);
                currentWorldInfo = {
                    entries: {}
                };
            }
        } else {
            // Load existing lorebook
            currentWorldInfo = await loadWorldInfo(lorebookName);
            if (!currentWorldInfo) {
                throw new Error(`Selected lorebook "${lorebookName}" not found.`);
            }
        }

        // Step 3: Create character entry with BunnymoTags

        if (!currentWorldInfo) {
            throw new Error(`Failed to load created lorebook: ${lorebookName}`);
        }

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Creating entry with currentWorldInfo', {
            lorebookName,
            existingEntries: Object.keys(currentWorldInfo.entries || {}).length,
            currentWorldInfoStructure: currentWorldInfo,
            isNewLorebook: isNewLorebook
        });

        let newEntry;
        if (isNewLorebook) {
            // For new lorebooks, create entry manually to avoid UI updates
            const newUid = Math.floor(Math.random() * 1000000); // Generate random UID
            newEntry = {
                uid: newUid,
                key: [],
                keysecondary: [],
                comment: '',
                content: '',
                constant: selectionMode === 'constant',
                selective: selectionMode === 'selective',
                addMemo: true,
                disable: false,
                useProbability: true,
                order: 550,
                probability: 100,
                selectiveLogic: 0,
                position: 4,
                excludeRecursion: true,
                preventRecursion: false,
                matchPersonaDescription: false,
                matchCharacterDescription: false,
                matchCharacterPersonality: false,
                matchCharacterDepthPrompt: false,
                matchScenario: false,
                matchCreatorNotes: false,
                delayUntilRecursion: false,
                depth: 2,
                group: '',
                groupOverride: false,
                groupWeight: 100,
                role: 2,
                vectorized: false,
                ignoreBudget: true,
                scanDepth: 1,
                caseSensitive: false,
                matchWholeWords: true,
                automationId: '',
                sticky: 0,
                cooldown: 0,
                delay: 0,
                triggers: [],
                displayIndex: 0,
                useGroupScoring: null,
                outletName: ''
            };

            // Add entry to our manually created structure
            currentWorldInfo.entries[newUid] = newEntry;
        } else {
            // For existing lorebooks, use the normal method
            newEntry = createWorldInfoEntry(lorebookName, currentWorldInfo);
            if (!newEntry) {
                throw new Error('Failed to create lorebook entry using currentWorldInfo');
            }
        }

        // Configure the entry with character data (following Egyptian Royalty example EXACTLY)
        newEntry.comment = `${characterName} Character Archive - Generated by Baby Bunny Mode`;
        newEntry.content = tags; // Use full tags content including <BunnymoTags> wrapper
        newEntry.key = triggers;
        newEntry.keysecondary = [];
        newEntry.selective = selectionMode === 'selective';
        newEntry.constant = selectionMode === 'constant';
        newEntry.order = 550; // Match Egyptian Royalty format
        newEntry.position = 4; // Match Egyptian Royalty format
        newEntry.disable = false;
        newEntry.addMemo = true;
        newEntry.excludeRecursion = true; // Match Egyptian Royalty format
        newEntry.preventRecursion = false; // Match Egyptian Royalty format
        newEntry.matchPersonaDescription = false; // Match Egyptian Royalty format
        newEntry.matchCharacterDescription = false; // Match Egyptian Royalty format
        newEntry.matchCharacterPersonality = false; // Match Egyptian Royalty format
        newEntry.matchCharacterDepthPrompt = false; // Match Egyptian Royalty format
        newEntry.matchScenario = false; // Match Egyptian Royalty format
        newEntry.matchCreatorNotes = false; // Match Egyptian Royalty format
        newEntry.delayUntilRecursion = false;
        newEntry.depth = 2; // Match Egyptian Royalty format
        newEntry.selectiveLogic = 0;
        newEntry.group = '';
        newEntry.groupOverride = false;
        newEntry.groupWeight = 100;
        newEntry.probability = 100;
        newEntry.useProbability = true;
        newEntry.role = 2; // Match Egyptian Royalty format
        newEntry.vectorized = false;
        newEntry.ignoreBudget = true; // Match Egyptian Royalty format
        newEntry.scanDepth = 1;
        newEntry.caseSensitive = false;
        newEntry.matchWholeWords = true;
        newEntry.automationId = ''; // Match Egyptian Royalty format
        newEntry.sticky = 0; // Match Egyptian Royalty format
        newEntry.cooldown = 0; // Match Egyptian Royalty format
        newEntry.delay = 0; // Match Egyptian Royalty format
        newEntry.triggers = []; // Match Egyptian Royalty format
        newEntry.displayIndex = 0; // Match Egyptian Royalty format
        newEntry.useGroupScoring = null; // Match Egyptian Royalty format
        newEntry.outletName = ''; // Match Egyptian Royalty format

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Entry configured', {
            entryId: newEntry.uid,
            contentLength: newEntry.content.length,
            triggers: newEntry.key,
            comment: newEntry.comment
        });

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: About to save lorebook (NemoLore approach)', {
            lorebookName,
            entriesCount: Object.keys(currentWorldInfo.entries || {}).length,
            entriesStructure: currentWorldInfo.entries,
            newEntryUid: newEntry.uid,
            currentWorldInfoStructure: Object.keys(currentWorldInfo)
        });

        // Save the updated lorebook immediately. saveWorldInfo's debounced path only
        // populates the in-memory worldInfoCache synchronously and defers the actual
        // fetch — the old "wait 1s then loadWorldInfo() to verify" approach re-read
        // that same synchronous cache, so it always "passed" without ever confirming
        // the write reached the server, and the follow-up updateWorldInfoList() call
        // could race the not-yet-fired debounced write. immediately=true awaits the
        // real fetch and emits WORLDINFO_UPDATED, making both problems moot.
        await saveWorldInfo(lorebookName, currentWorldInfo, true);

        const savedEntriesCount = Object.keys(currentWorldInfo.entries || {}).length;

        CarrotDebug.ui('🐰 BABY BUNNY DEBUG: Save complete', {
            lorebookName,
            savedEntriesCount,
            savedEntries: Object.keys(currentWorldInfo.entries || {})
        });

        // Update the UI now that the save has actually completed
        await updateWorldInfoList();

        // Step 5: Register as character repo in CarrotKernel settings
        const settings = extension_settings[extensionName];
        if (!settings.characterRepoBooks.includes(lorebookName)) {
            settings.characterRepoBooks.push(lorebookName);
            characterRepoBooks.add(lorebookName);
            saveSettingsDebounced();

            CarrotDebug.ui('🐰 Registered as character repo:', lorebookName);
        }

        // Step 6: Activate lorebook based on selected scope
        await activateLorebook(lorebookName, activationScope);

        // Step 7: Success notification (after verification)
        const scopeText = {
            'character': 'for this character',
            'chat': 'for this chat',
            'global': 'globally'
        }[activationScope];
        toastr.success(`🐰 Baby Bunny Mode: Successfully created "${lorebookName}" with ${savedEntriesCount} entries (${triggers.length} triggers) and activated ${scopeText}!`);

        CarrotDebug.ui('🐰 Character archive created successfully', {
            lorebookName,
            characterName,
            entryId: newEntry.uid,
            triggersCount: triggers.length,
            tagsLength: tags.length,
            activationScope
        });

    } catch (error) {
        CarrotDebug.ui('❌ Baby Bunny Mode error creating archive', error);
        toastr.error('Failed to create character archive: ' + error.message);
    }
}


// =============================================================================
// SECTION 3: BABY BUNNY CHUNKING
// Visual chunk editor and preview system
// =============================================================================

// State for the chunking editor
let previewChunks = [];
let fullsheetContent = '';
let characterName = '';
let currentTab = 'chunks'; // 'chunks' or 'original'

/**
 * Open the Baby Bunny Chunking modal with fullsheet content
 * @param {string} charName - Character name
 * @param {string} content - Fullsheet content
 */
export async function openBabyBunnyChunking(charName, content) {
    CarrotDebug.ui('🐰 CHUNKING: openBabyBunnyChunking called', { charName, contentLength: content?.length });

    characterName = charName;
    fullsheetContent = content;

    try {
        // Generate initial chunk preview
        CarrotDebug.ui('🐰 CHUNKING: Generating chunk preview...');
        await generateChunkPreview();
        CarrotDebug.ui('🐰 CHUNKING: Generated', previewChunks.length, 'chunks');

        // Show the modal
        CarrotDebug.ui('🐰 CHUNKING: Showing modal...');
        showChunkingModal();
        CarrotDebug.ui('🐰 CHUNKING: Modal should be visible now');
    } catch (error) {
        CarrotDebug.error('🐰 CHUNKING ERROR:', error);
        toastr.error(`Failed to open chunking modal: ${error.message}`);
    }
}

/**
 * Generate chunk previews based on current settings
 */
async function generateChunkPreview() {
    // Import chunking functions dynamically
    const { chunkFullsheet, getRAGSettings } = await import('./fullsheet-rag.js');

    const settings = getRAGSettings();
    const rawChunks = await chunkFullsheet(fullsheetContent, characterName);

    // Convert to preview format with additional metadata
    previewChunks = rawChunks.map((chunk, index) => {
        const keywords = chunk.metadata?.keywords || [];
        return {
            id: `preview_${index}`,
            hash: chunk.hash,
            text: chunk.text,
            section: chunk.metadata?.section || `Chunk ${index + 1}`,
            comment: chunk.metadata?.section || `Chunk ${index + 1}`,
            characterName: characterName,
            contextLevel: 'character', // Default to character context
            disabled: false, // Match chunk viewer (disabled not enabled)
            keywords: keywords,
            systemKeywords: keywords, // System keywords = keywords extracted from chunk
            customKeywords: [], // No custom keywords initially
            disabledKeywords: [], // None disabled initially
            customWeights: {}, // No custom weights initially
            chunkLinks: [], // No chunk links initially
            tags: chunk.metadata?.tags || [],
            index: index,
            originalIndex: index,
            depth: 4, // Default depth
            _editing: false, // Start collapsed
            ...chunk
        };
    });
}

/**
 * Show the chunking modal
 */
function showChunkingModal() {
    CarrotDebug.ui('🐰 CHUNKING: showChunkingModal called');
    createModalIfNeeded();
    CarrotDebug.ui('🐰 CHUNKING: Modal created, element exists?', $('#carrot-baby-chunking-modal').length > 0);

    // Set global character name and context level
    $('#chunking-character-name').val(characterName);
    $('#chunking-context-level').val('character');

    // Show chunks tab by default
    currentTab = 'chunks';
    renderCurrentTab();

    const $modal = $('#carrot-baby-chunking-modal');

    // Add 'active' class to trigger opacity and pointer-events
    $modal.addClass('active').css('display', 'flex');
    $('body').css('overflow', 'hidden');

    CarrotDebug.ui('🐰 CHUNKING: Modal display set, is visible?', $modal.is(':visible'));
    CarrotDebug.ui('🐰 CHUNKING: Modal has active class?', $modal.hasClass('active'));
}

/**
 * Create the modal HTML if it doesn't exist
 */
function createModalIfNeeded() {
    if ($('#carrot-baby-chunking-modal').length) return;

    const modalHTML = `
        <div id="carrot-baby-chunking-modal" class="carrot-popup-overlay">
            <div class="carrot-popup-container baby-bunny-popup" style="padding: 0; max-width: 1400px; width: 95%; height: 90vh;">
                <div class="carrot-card" style="margin: 0; height: 100%; display: flex; flex-direction: column;">
                    <!-- Header matching Baby Bunny style -->
                    <div class="carrot-card-header" style="padding: 24px 32px 16px; position: relative; flex-shrink: 0;">
                        <h3 style="margin: 0 0 8px; font-size: 24px;">🐰 Baby Bunny Chunking</h3>
                        <p class="carrot-card-subtitle" style="margin: 0; color: var(--SmartThemeQuoteColor);">Preview & Configure Fullsheet Chunks</p>
                        <button id="carrot-chunking-modal-close" class="menu_button" style="
                            position: absolute;
                            top: 24px;
                            right: 32px;
                            padding: 6px 12px;
                            font-size: 0.85em;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            opacity: 0.8;
                        " title="Close without saving">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 20px; flex: 1; overflow: hidden;">

                        <!-- Global Collection Settings -->
                        <div style="display: flex; gap: 16px; padding: 16px; background: var(--black30a, rgba(0, 0, 0, 0.2)); border-radius: 8px; flex-shrink: 0; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                                <i class="fa-solid fa-user" style="color: var(--SmartThemeQuoteColor);"></i>
                                <input type="text" id="chunking-character-name" placeholder="Character name..."
                                       style="flex: 1; background: var(--black30a, rgba(0, 0, 0, 0.3)); border: 1px solid var(--SmartThemeBorderColor); color: var(--SmartThemeEmColor); padding: 8px 12px; border-radius: 6px; font-size: 0.95em;">
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-layer-group" style="color: var(--SmartThemeQuoteColor);"></i>
                                <select id="chunking-context-level"
                                        style="background: var(--black30a, rgba(0, 0, 0, 0.3)); border: 1px solid var(--SmartThemeBorderColor); color: var(--SmartThemeEmColor); padding: 8px 12px; border-radius: 6px; font-size: 0.95em;">
                                    <option value="global">Global</option>
                                    <option value="character" selected>Character</option>
                                    <option value="chat">Chat</option>
                                </select>
                            </div>
                        </div>

                        <!-- Tab Navigation -->
                        <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); flex-shrink: 0;">
                            <button id="chunking-tab-chunks" class="chunking-tab-btn active" data-tab="chunks" style="padding: 10px 20px; background: transparent; border: none; color: var(--SmartThemeEmColor); cursor: pointer; border-bottom: 2px solid var(--SmartThemeQuoteColor); font-weight: 600;">
                                <i class="fa-solid fa-cube"></i> Chunks (<span id="chunking-tab-count">0</span>)
                            </button>
                            <button id="chunking-tab-original" class="chunking-tab-btn" data-tab="original" style="padding: 10px 20px; background: transparent; border: none; color: var(--SmartThemeEmColor); cursor: pointer; opacity: 0.6; border-bottom: 2px solid transparent;">
                                <i class="fa-solid fa-file-alt"></i> Original Document
                            </button>
                        </div>

                        <!-- Stats Bar (only visible on chunks tab) -->
                        <div id="chunking-stats-bar" style="display: flex; gap: 24px; padding: 16px; background: var(--black30a, rgba(0, 0, 0, 0.2)); border-radius: 8px; flex-shrink: 0;">
                            <div class="chunking-stat">
                                <i class="fa-solid fa-cube"></i>
                                <span class="chunking-stat-label">Chunks:</span>
                                <span id="chunking-count" class="chunking-stat-value">0</span>
                            </div>
                            <div class="chunking-stat">
                                <i class="fa-solid fa-text-width"></i>
                                <span class="chunking-stat-label">Total Size:</span>
                                <span id="chunking-total-tokens" class="chunking-stat-value">0</span>
                            </div>
                            <div class="chunking-stat">
                                <i class="fa-solid fa-scale-balanced"></i>
                                <span class="chunking-stat-label">Avg:</span>
                                <span id="chunking-avg-size" class="chunking-stat-value">0</span>
                            </div>
                            <div style="margin-left: auto; display: flex; gap: 8px;">
                                <button id="chunking-add-chunk-btn" class="menu_button" style="padding: 6px 12px; font-size: 0.9em;" title="Add new chunk">
                                    <i class="fa-solid fa-plus"></i> Add Chunk
                                </button>
                                <button id="chunking-refresh-btn" class="menu_button" style="padding: 6px 12px; font-size: 0.9em;" title="Regenerate chunks">
                                    <i class="fa-solid fa-rotate"></i>
                                </button>
                                <button id="chunking-expand-all-btn" class="menu_button" style="padding: 6px 12px; font-size: 0.9em;" title="Expand all">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                                <button id="chunking-collapse-all-btn" class="menu_button" style="padding: 6px 12px; font-size: 0.9em;" title="Collapse all">
                                    <i class="fa-solid fa-compress"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Content Container (will show either chunks or original document) -->
                        <div id="carrot-chunking-content-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
                            <!-- Content will be rendered here based on active tab -->
                        </div>

                        <!-- Footer Actions -->
                        <div style="display: flex; gap: 12px; padding-top: 16px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); flex-shrink: 0;">
                            <button id="carrot-chunking-cancel" class="menu_button" style="flex: 1; padding: 12px;">
                                <i class="fa-solid fa-xmark"></i>
                                <span>Cancel</span>
                            </button>
                            <button id="carrot-chunking-finalize" class="menu_button" style="flex: 2; padding: 12px; background: var(--SmartThemeQuoteColor); color: #000; font-weight: 600;">
                                <i class="fa-solid fa-check"></i>
                                <span>Finalize & Vectorize</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('body').append(modalHTML);

    // Attach event handlers
    attachModalHandlers();
}

/**
 * Attach event handlers to modal elements
 */
function attachModalHandlers() {
    // Close buttons
    $('#carrot-chunking-modal-close, #carrot-chunking-cancel').on('click', closeChunkingModal);

    // Finalize button
    $('#carrot-chunking-finalize').on('click', finalizeChunks);

    // Add chunk button
    $('#chunking-add-chunk-btn').on('click', () => {
        const newChunk = {
            id: `preview_${Date.now()}`,
            hash: Date.now(),
            text: '',
            section: 'New Chunk',
            comment: 'New Chunk',
            characterName: characterName,
            contextLevel: 'character',
            disabled: false,
            keywords: [],
            systemKeywords: [],
            customKeywords: [],
            disabledKeywords: [],
            customWeights: {},
            chunkLinks: [],
            tags: [],
            index: previewChunks.length,
            originalIndex: previewChunks.length,
            _editing: true // Start expanded
        };
        previewChunks.push(newChunk);
        renderCurrentTab();
        toastr.success('New chunk added');
    });

    // Regenerate button
    $('#chunking-refresh-btn').on('click', async () => {
        await generateChunkPreview();
        renderCurrentTab();
        toastr.success('Chunks regenerated!');
    });

    // Expand/Collapse all
    $('#chunking-expand-all-btn').on('click', () => {
        previewChunks.forEach(chunk => chunk._editing = true);
        renderCurrentTab();
    });

    $('#chunking-collapse-all-btn').on('click', () => {
        previewChunks.forEach(chunk => chunk._editing = false);
        renderCurrentTab();
    });

    // Tab switching
    $('.chunking-tab-btn').on('click', function() {
        const tab = $(this).data('tab');
        currentTab = tab;

        // Update tab styles
        $('.chunking-tab-btn').removeClass('active').css({
            'border-bottom-color': 'transparent',
            'opacity': '0.6',
            'font-weight': 'normal'
        });
        $(this).addClass('active').css({
            'border-bottom-color': 'var(--SmartThemeQuoteColor)',
            'opacity': '1',
            'font-weight': '600'
        });

        renderCurrentTab();
    });

    // Close on backdrop click
    $(document).on('click', '#carrot-baby-chunking-modal .carrot-modal-backdrop', closeChunkingModal);
}

/**
 * Render the current tab content
 */
function renderCurrentTab() {
    if (currentTab === 'chunks') {
        $('#chunking-stats-bar').show();
        renderChunkPreviews();
    } else if (currentTab === 'original') {
        $('#chunking-stats-bar').hide();
        renderOriginalDocument();
    }
}

/**
 * Render the original unchunked document
 */
function renderOriginalDocument() {
    const container = $('#carrot-chunking-content-container');

    const html = `
        <div style="padding: 20px; background: var(--black20a, rgba(0, 0, 0, 0.2)); border-radius: 8px; border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1));">
            <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-file-alt" style="color: var(--SmartThemeQuoteColor);"></i>
                <strong style="font-size: 1.1em;">Original Document</strong>
                <span style="opacity: 0.6; font-size: 0.9em;">(${fullsheetContent.length} characters)</span>
            </div>
            <textarea readonly style="
                width: 100%;
                min-height: 500px;
                background: var(--black30a, rgba(0, 0, 0, 0.3));
                border: 1px solid var(--SmartThemeBorderColor);
                color: var(--SmartThemeEmColor);
                padding: 16px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 0.9em;
                line-height: 1.6;
                resize: vertical;
            ">${escapeHtml(fullsheetContent)}</textarea>
        </div>
    `;

    container.html(html);
}

/**
 * Close the chunking modal
 */
function closeChunkingModal() {
    const $modal = $('#carrot-baby-chunking-modal');
    $modal.removeClass('active');
    setTimeout(() => {
        $modal.remove();
    }, 300); // Wait for fade out transition
    $('body').css('overflow', '');
    previewChunks = [];
}

/**
 * Render chunk previews (COPIED FROM CHUNK VIEWER LAYOUT)
 */
function renderChunkPreviews() {
    const container = $('#carrot-chunking-content-container');

    // Update stats
    const enabledChunks = previewChunks.filter(c => !c.disabled);
    $('#chunking-count').text(enabledChunks.length);
    $('#chunking-tab-count').text(enabledChunks.length);
    const totalTokens = previewChunks.reduce((sum, c) => sum + (c.text?.length || 0), 0);
    $('#chunking-total-tokens').text(totalTokens.toLocaleString());
    const avgSize = previewChunks.length ? Math.round(totalTokens / previewChunks.length) : 0;
    $('#chunking-avg-size').text(avgSize);

    // Render chunks using chunk viewer layout
    const html = previewChunks.map(chunk => renderChunkCard(chunk)).join('');
    container.html(html);

    // Attach chunk-specific handlers
    attachChunkHandlers();

    // Initialize keyword input mode setting
    if (typeof extension_settings[extensionName] === 'undefined') {
        extension_settings[extensionName] = {};
    }
    if (typeof extension_settings[extensionName].keyword_input_plaintext === 'undefined') {
        extension_settings[extensionName].keyword_input_plaintext = false; // Default to fancy mode
    }

    const isPlaintext = extension_settings[extensionName].keyword_input_plaintext;

    // Initialize select2 on all keyword selects - EXACT COPY from chunk viewer
    previewChunks.forEach(chunk => {
        const hash = chunk.hash;
        const $select = $(`.chunk-keywords-select[data-hash="${hash}"]`);
        const $textarea = $(`.chunk-keywords-plaintext[data-hash="${hash}"]`);
        const $switchBtn = $(`.chunk-switch-input-type-icon[data-hash="${hash}"]`);
        if (!$select.length) return;

        const systemKeywords = ensureArrayValue(chunk.systemKeywords);
        const customKeywords = ensureArrayValue(chunk.customKeywords);
        const allKeywords = [...new Set([...systemKeywords, ...customKeywords])];
        const customKeywordSet = new Set(customKeywords.map(normalizeKeyword));
        const disabledSet = new Set(ensureArrayValue(chunk.disabledKeywords).map(normalizeKeyword));

        if (!chunk.customWeights) chunk.customWeights = {};

        const getWeight = (keyword) => {
            const normalized = normalizeKeyword(keyword);
            const defaultPriority = 20;
            const customWeight = chunk.customWeights[normalized];
            return customWeight !== undefined
                ? customWeight
                : (customKeywordSet.has(normalized) ? CUSTOM_KEYWORD_PRIORITY : defaultPriority);
        };

        // Initialize fancy mode or plaintext mode based on setting
        if (!isPlaintext) {
            // FANCY MODE: Initialize select2
            $select.select2({
            tags: true,
            tokenSeparators: [','],
            placeholder: $select.attr('placeholder'),
            width: '100%',
            templateResult: function(item) {
                // Template for dropdown results
                const content = $('<span>').addClass('item').text(item.text).attr('title', `${item.text}\n\nClick to edit`);
                const isRegex = isValidRegex(item.text);
                if (isRegex) {
                    content.html(highlightRegex(item.text));
                    content.addClass('regex_item').prepend($('<span>').addClass('regex_icon').text('•*').attr('title', 'Regex'));
                }
                return content;
            },
            templateSelection: function(item) {
                // Template for selected items
                const keyword = item.text;
                const isRegex = isValidRegex(keyword);

                // Regex items - use ST's highlighting with weight badge
                if (isRegex) {
                    const normalized = normalizeKeyword(keyword);
                    const weight = getWeight(keyword);

                    const $regexTag = $('<span>').addClass('item').addClass('regex_item').attr('title', `${keyword}\n\nClick to edit`);
                    $regexTag.prepend($('<span>').addClass('regex_icon').text('•*').attr('title', 'Regex'));
                    $regexTag.append(' ').append($(highlightRegex(keyword)));

                    // Weight badge - clickable to edit (using contenteditable)
                    const $weight = $('<span>')
                        .addClass('keyword-weight-badge')
                        .attr('data-keyword', keyword)
                        .attr('data-hash', hash)
                        .attr('contenteditable', 'true')
                        .attr('spellcheck', 'false')
                        .attr('title', 'Click to edit weight')
                        .text(weight)
                        .css({
                            'opacity': '0.85',
                            'font-size': '0.85em',
                            'margin-left': '4px',
                            'cursor': 'text',
                            'padding': '1px 4px',
                            'border-radius': '3px',
                            'background': 'rgba(255,255,255,0.1)',
                            'font-family': 'monospace',
                            'min-width': '20px',
                            'display': 'inline-block',
                            'text-align': 'center'
                        })
                        .on('mousedown', function(e) {
                            e.stopPropagation();
                        })
                        .on('click', function(e) {
                            e.stopPropagation();
                            $(this).select();
                        })
                        .on('keydown', function(e) {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                $(this).blur();
                            }
                            // Allow only numbers
                            if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                            }
                        })
                        .on('blur', function() {
                            const newWeight = parseInt($(this).text()) || getWeight(keyword);
                            const clampedWeight = Math.max(1, Math.min(200, newWeight));

                            const normalized = normalizeKeyword(keyword);
                            if (!chunk.customWeights) chunk.customWeights = {};
                            chunk.customWeights[normalized] = clampedWeight;
                            // Spam log removed - fired on every weight change
                        });

                    const $weightWrapper = $('<span>').css('margin-left', '2px').text('[').append($weight).append(']');
                    $regexTag.append($weightWrapper);
                    return $regexTag;
                }

                // Regular keyword items
                const normalized = normalizeKeyword(keyword);
                const weight = getWeight(keyword);
                const isCustom = customKeywordSet.has(normalized);
                const isDisabled = disabledSet.has(normalized);

                const $tag = $('<span>').addClass('item');

                // Keyword text
                const $text = $('<span>').addClass('keyword-text').text(keyword);

                // Weight badge - clickable to edit (using contenteditable)
                const $weight = $('<span>')
                    .addClass('keyword-weight-badge')
                    .attr('data-keyword', keyword)
                    .attr('data-hash', hash)
                    .attr('contenteditable', 'true')
                    .attr('spellcheck', 'false')
                    .attr('title', 'Click to edit weight')
                    .text(weight)
                    .css({
                        'opacity': '0.85',
                        'font-size': '0.85em',
                        'margin-left': '4px',
                        'cursor': 'text',
                        'padding': '1px 4px',
                        'border-radius': '3px',
                        'background': 'rgba(255,255,255,0.1)',
                        'font-family': 'monospace',
                        'min-width': '20px',
                        'display': 'inline-block',
                        'text-align': 'center'
                    })
                    .on('mousedown', function(e) {
                        e.stopPropagation();
                    })
                    .on('click', function(e) {
                        e.stopPropagation();
                        $(this).select();
                    })
                    .on('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            $(this).blur();
                        }
                        // Allow only numbers
                        if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                            e.preventDefault();
                        }
                    })
                    .on('blur', function() {
                        const newWeight = parseInt($(this).text()) || getWeight(keyword);
                        const clampedWeight = Math.max(1, Math.min(200, newWeight));

                        const normalized = normalizeKeyword(keyword);
                        if (!chunk.customWeights) chunk.customWeights = {};
                        chunk.customWeights[normalized] = clampedWeight;
                        // Spam log removed - fired on every weight change
                    });

                const $weightWrapper = $('<span>').css('margin-left', '2px').text('[').append($weight).append(']');
                $tag.append($text).append($weightWrapper);

                if (isCustom) {
                    $tag.css('color', 'var(--SmartThemeQuoteColor)');
                }
                if (isDisabled) {
                    $tag.css('opacity', '0.5');
                }

                return $tag;
            }
        });

        // NOW populate with keywords AFTER select2 is initialized
        allKeywords.forEach(keyword => {
            const option = new Option(keyword, keyword, true, true);
            $select.append(option);
        });

        $select.trigger('change.select2');

        // Handle keyword changes
        $select.on('change', function() {
            let newKeywords = $(this).val() || [];

            // Update all keyword arrays
            chunk.keywords = newKeywords;
            chunk.systemKeywords = systemKeywords.filter(k => newKeywords.includes(k));
            chunk.customKeywords = newKeywords.filter(k => !systemKeywords.includes(k));

            // Set default weight for new custom keywords
            newKeywords.forEach(keyword => {
                const normalized = normalizeKeyword(keyword);
                if (!systemKeywords.includes(keyword) && chunk.customWeights[normalized] === undefined) {
                    chunk.customWeights[normalized] = CUSTOM_KEYWORD_PRIORITY;
                }
            });
        });

        // Stop propagation to prevent drawer closing
        $select.on('click focus', function(e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });

            // Handle weight badge clicks within select2
            $select.next('.select2-container').on('click mousedown', function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();

                // Check if click is on a weight badge
                const $target = $(e.target);
                if ($target.hasClass('keyword-weight-badge')) {
                    e.preventDefault();
                    handleWeightBadgeClick($target, chunk, hash);
                }
            });

            // Show select2, hide textarea
            $select.show();
            $textarea.hide();
        } else {
            // PLAINTEXT MODE: Initialize textarea with keyword:weight format
            const keywordsText = allKeywords.map(k => {
                const normalized = normalizeKeyword(k);
                const weight = getWeight(k);
                return `${k}:${weight}`;
            }).join(', ');
            $textarea.val(keywordsText);

            // Handle textarea changes
            $textarea.on('change input', function() {
                const text = $(this).val() || '';
                const newKeywords = [];

                // Parse comma-separated entries
                text.split(',').forEach(entry => {
                    const trimmed = entry.trim();
                    if (!trimmed) return;

                    // Check if entry has weight format (keyword:weight)
                    const colonIndex = trimmed.lastIndexOf(':');
                    if (colonIndex > 0) {
                        const keyword = trimmed.substring(0, colonIndex).trim();
                        const weightStr = trimmed.substring(colonIndex + 1).trim();
                        const weight = parseInt(weightStr);

                        if (keyword && !isNaN(weight) && weight >= 1 && weight <= 200) {
                            newKeywords.push(keyword);
                            const normalized = normalizeKeyword(keyword);
                            if (!chunk.customWeights) chunk.customWeights = {};
                            chunk.customWeights[normalized] = weight;
                        } else if (keyword) {
                            // Invalid or missing weight, use keyword without weight
                            newKeywords.push(keyword);
                        }
                    } else {
                        // No weight specified, just keyword
                        newKeywords.push(trimmed);
                    }
                });

                // Update all keyword arrays
                chunk.keywords = newKeywords;
                chunk.systemKeywords = systemKeywords.filter(k => newKeywords.includes(k));
                chunk.customKeywords = newKeywords.filter(k => !systemKeywords.includes(k));

                // Set default weight for new custom keywords without explicit weight
                newKeywords.forEach(keyword => {
                    const normalized = normalizeKeyword(keyword);
                    if (!systemKeywords.includes(keyword) && chunk.customWeights[normalized] === undefined) {
                        chunk.customWeights[normalized] = CUSTOM_KEYWORD_PRIORITY;
                    }
                });
            });

            // Stop propagation to prevent drawer closing
            $textarea.on('click focus', function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
            });

            // Show textarea, hide select2
            $select.hide();
            $textarea.show();
        }

        // Update switch button appearance
        $switchBtn.attr('title', $switchBtn.data(isPlaintext ? 'tooltip-on' : 'tooltip-off'));
        $switchBtn.text($switchBtn.data(isPlaintext ? 'icon-on' : 'icon-off'));
    });

    // Switch button handler - toggle between fancy and plaintext mode
    $(document).off('click', '.chunk-switch-input-type-icon').on('click', '.chunk-switch-input-type-icon', function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Toggle the setting
        extension_settings[extensionName].keyword_input_plaintext = !extension_settings[extensionName].keyword_input_plaintext;
        saveSettingsDebounced();

        // Re-render chunks to apply the new mode
        renderChunkPreviews();
    });
}

/**
 * Normalize keyword for comparison
 */
function normalizeKeyword(keyword) {
    return String(keyword || '').trim().toLowerCase();
}

/**
 * Handle weight badge click - shared function for all weight badge clicks
 */
function handleWeightBadgeClick($badge, chunk, hash) {
    const keyword = $badge.attr('data-keyword');
    if (!chunk) return;

    const normalized = normalizeKeyword(keyword);
    const systemKeywords = ensureArrayValue(chunk.systemKeywords);
    const customKeywords = ensureArrayValue(chunk.customKeywords);
    const customKeywordSet = new Set(customKeywords.map(normalizeKeyword));
    const currentWeight = chunk.customWeights?.[normalized] ||
        (customKeywordSet.has(normalized) ? CUSTOM_KEYWORD_PRIORITY : 20);

    // Create inline input
    const $input = $('<input>')
        .attr('type', 'number')
        .attr('min', '1')
        .attr('max', '200')
        .val(currentWeight)
        .css({
            'width': '60px',
            'padding': '2px 4px',
            'font-size': '0.85em',
            'font-family': 'monospace',
            'background': 'var(--SmartThemeUserMesBlurTintColor)',
            'border': '1px solid var(--SmartThemeBorderColor)',
            'border-radius': '3px',
            'color': 'inherit'
        })
        .addClass('keyword-weight-input');

    // Replace badge with input
    $badge.replaceWith($input);
    $input.focus().select();

    // Save on blur or enter
    $input.on('blur keydown', function(e) {
        if (e.type === 'keydown' && e.key !== 'Enter') return;

        const newWeight = parseInt($(this).val()) || currentWeight;

        // Clamp between 1-200
        const clampedWeight = Math.max(1, Math.min(200, newWeight));

        // Save to chunk
        if (!chunk.customWeights) chunk.customWeights = {};
        chunk.customWeights[normalized] = clampedWeight;

        // Re-render to update display
        renderChunkPreviews();
    });

    $input.on('click', function(e) {
        e.stopPropagation();
    });
}

/**
 * Check if a string is a valid regex (using ST's official validator)
 */
function isValidRegex(str) {
    if (!str) return false;
    return parseRegexFromString(str) !== null;
}

/**
 * Helper to ensure array value
 */
function ensureArrayValue(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    return [val];
}

/**
 * Render a single chunk card (EXACT COPY OF CHUNK VIEWER STRUCTURE)
 */
function renderChunkCard(chunk) {
    const chunkHashAttr = escapeHtml(chunk.hash);
    const sectionTitle = escapeHtml(chunk.section || 'Untitled');
    const isOpen = !!chunk._editing;
    const systemKeywords = ensureArrayValue(chunk.systemKeywords);
    const customKeywords = ensureArrayValue(chunk.customKeywords);
    const disabledSet = new Set(ensureArrayValue(chunk.disabledKeywords).map(normalizeKeyword));
    const customKeywordSet = new Set(customKeywords.map(normalizeKeyword));
    const activeKeywords = ensureArrayValue(chunk.keywords);

    if (!chunk.chunkLinks) chunk.chunkLinks = [];
    if (!chunk.customWeights) chunk.customWeights = {};

    const getWeight = (keyword, normalized) => {
        const defaultPriority = 20;
        const customWeight = chunk.customWeights[normalized];
        return customWeight !== undefined
            ? customWeight
            : (customKeywordSet.has(normalized) ? CUSTOM_KEYWORD_PRIORITY : defaultPriority);
    };

    const sortedKeywords = [...activeKeywords].sort((a, b) => {
        const aNorm = normalizeKeyword(a);
        const bNorm = normalizeKeyword(b);
        return getWeight(b, bNorm) - getWeight(a, aNorm);
    });

    // Collapsed state: show top 5 weighted keywords with badges
    const topKeywords = sortedKeywords.slice(0, 5);
    const remainingCount = Math.max(0, sortedKeywords.length - 5);

    const collapsedKeywordDisplay = topKeywords.length > 0
        ? `<div class="chunk-keywords-preview">${topKeywords.map(k => {
            const normalized = normalizeKeyword(k);
            const weight = getWeight(k, normalized);
            return `<span class="chunk-keyword-mini-badge" title="${escapeHtml(k)} (weight: ${weight})">${escapeHtml(k)}<sup>${weight}</sup></span>`;
        }).join('')}${remainingCount > 0 ? `<span class="chunk-keyword-more-badge" title="Click to expand ${remainingCount} more keywords">+${remainingCount}</span>` : ''}</div>`
        : `<span class="chunk-keywords-preview empty">No keywords</span>`;

    // Metadata badges
    const metadataBadges = `
        <div class="chunk-metadata-badges">
            <span class="chunk-meta-badge" title="Chunk size">${chunk.text.length} chars</span>
            ${chunk.index !== undefined ? `<span class="chunk-meta-badge" title="Chunk index">#${chunk.index}</span>` : ''}
        </div>
    `;

    // Build linked chunks section
    const linkedChunksHtml = buildLinkedChunksSection(chunk);

    const editingContent = `
        <div class="world_entry_edit">
            <div class="flex-container wide100p alignitemscenter">
                <div class="world_entry_form_control keyprimary flex1">
                    <small class="textAlignCenter">Primary Keywords</small>
                    <select class="keyprimaryselect keyselect chunk-keywords-select" name="key" data-hash="${chunkHashAttr}" placeholder="Keywords or Regexes" multiple="multiple" style="display: none;"></select>
                    <textarea class="text_pole chunk-keywords-plaintext" name="key" data-hash="${chunkHashAttr}" rows="2" placeholder="Comma separated list" style="display: none;"></textarea>
                    <button type="button" class="chunk-switch-input-type-icon" data-hash="${chunkHashAttr}" tabindex="-1" title="Switch to plaintext mode" data-icon-on="✨" data-icon-off="⌨️" data-tooltip-on="Switch to fancy mode" data-tooltip-off="Switch to plaintext mode">⌨️</button>
                </div>
            </div>

            <div class="world_entry_thin_controls flex-container flexFlowColumn">
                <div class="world_entry_form_control flex1">
                    <label for="content">
                        <small><span data-i18n="Content">Content</span></small>
                    </label>
                    <textarea class="text_pole autoSetHeight chunk-text-edit" name="content" data-hash="${chunkHashAttr}" placeholder="Chunk content...">${escapeHtml(chunk.text || '')}</textarea>
                </div>
            </div>

            ${linkedChunksHtml}
        </div>
    `;

    // Match chunk viewer structure EXACTLY
    const chevronClass = isOpen ? 'fa-circle-chevron-up up' : 'fa-circle-chevron-down down';
    const bodyClasses = ['inline-drawer-content', 'inline-drawer-outlet', 'wide100p'];
    const bodyStyle = isOpen ? 'style="display: block;"' : 'style="display: none;"';

    return `
        <div class="world_entry" data-hash="${chunkHashAttr}">
            <form class="world_entry_form wi-card-entry">
                <div class="inline-drawer wide100p">
                    <div class="inline-drawer-header gap5px padding0">
                        <span class="drag-handle">&#9776;</span>
                        <div class="gap5px world_entry_thin_controls wide100p alignitemscenter">
                            <div class="fa-fw fa-solid ${chevronClass} inline-drawer-icon chunk-toggle-drawer" data-hash="${chunkHashAttr}" aria-expanded="${isOpen ? 'true' : 'false'}" style="cursor: pointer;"></div>
                            <div class="fa-solid ${chunk.disabled ? 'fa-toggle-off' : 'fa-toggle-on'} chunk-toggle-enabled" data-hash="${chunkHashAttr}" title="${chunk.disabled ? 'Chunk is disabled - click to enable' : 'Chunk is enabled - click to disable'}" style="cursor: pointer; color: ${chunk.disabled ? 'var(--grey70)' : 'var(--SmartThemeQuoteColor)'}"></div>
                            <div class="flex-container alignitemscenter wide100p flexNoGap">
                                <div class="WIEntryTitleAndStatus flex-container flex1 alignitemscenter">
                                    <div class="flex-container flex1">
                                        <textarea class="text_pole chunk-title-field chunk-title-edit" data-hash="${chunkHashAttr}" rows="1" placeholder="Entry Title/Memo" style="resize: none;">${escapeHtml(chunk.comment || sectionTitle)}</textarea>
                                    </div>
                                </div>
                                <div class="chunk-header-right">
                                    ${collapsedKeywordDisplay}
                                    ${metadataBadges}
                                </div>
                            </div>
                        </div>
                        <i class="menu_button fa-solid fa-arrows-rotate chunk-refresh-btn" data-hash="${chunkHashAttr}" title="Regenerate keywords from current content" style="margin-right: 8px;"></i>
                        <i class="menu_button fa-solid fa-trash-can chunk-delete-btn" data-hash="${chunkHashAttr}" title="Delete chunk"></i>
                    </div>
                    <div class="${bodyClasses.join(' ')}" ${bodyStyle}>
                        ${editingContent}
                    </div>
                </div>
            </form>
        </div>
    `;
}

/**
 * Build linked chunks section for a chunk
 */
function buildLinkedChunksSection(chunk) {
    const chunkHashAttr = escapeHtml(chunk.hash);
    const chunkLinksArray = ensureArrayValue(chunk.chunkLinks);
    const chunkLinksMap = new Map(chunkLinksArray.map(link => [link.targetHash, link.mode]));

    // Find incoming links
    const incomingLinks = previewChunks
        .filter(c => c.hash !== chunk.hash && ensureArrayValue(c.chunkLinks).some(link => link.targetHash === chunk.hash))
        .map(c => ({
            hash: c.hash,
            title: c.comment || c.section || 'Untitled',
            mode: ensureArrayValue(c.chunkLinks).find(link => link.targetHash === chunk.hash)?.mode || 'soft'
        }));

    // Find outgoing links
    const outgoingLinks = chunkLinksArray.map(link => ({
        hash: link.targetHash,
        title: previewChunks.find(c => c.hash === link.targetHash)?.comment || previewChunks.find(c => c.hash === link.targetHash)?.section || 'Untitled',
        mode: link.mode
    })).filter(link => previewChunks.some(c => c.hash === link.hash));

    const availableChunks = previewChunks
        .filter(c => c.hash !== chunk.hash)
        .map(c => ({
            hash: c.hash,
            title: c.comment || c.section || 'Untitled',
            linked: chunkLinksMap.has(c.hash),
            mode: chunkLinksMap.get(c.hash) || 'soft'
        }));

    const linkSummaryHtml = (incomingLinks.length > 0 || outgoingLinks.length > 0) ? `
        <div style="margin-top: 12px; padding: 8px; background: var(--black10a, rgba(0,0,0,0.1)); border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1)); border-radius: 6px; font-size: 0.9em;">
            ${outgoingLinks.length > 0 ? `
                <div style="margin-bottom: ${incomingLinks.length > 0 ? '6px' : '0'};">
                    <small style="opacity: 0.7;">This activates:</small>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        ${outgoingLinks.map(link => `
                            <span style="padding: 2px 6px; background: var(--black20a, rgba(0,0,0,0.2)); border-radius: 4px; display: flex; align-items: center; gap: 4px;">
                                <span class="fa-solid fa-arrow-right" style="font-size: 0.7em; color: var(--SmartThemeBorderColor);"></span>
                                <span>${escapeHtml(link.title)}</span>
                                <span class="fa-solid fa-${link.mode === 'force' ? 'bolt' : 'arrow-up'}" style="color: ${link.mode === 'force' ? 'var(--SmartThemeQuoteColor)' : 'var(--SmartThemeEmColor)'}; font-size: 0.7em;"></span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            ${incomingLinks.length > 0 ? `
                <div>
                    <small style="opacity: 0.7;">Activated by:</small>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        ${incomingLinks.map(link => `
                            <span style="padding: 2px 6px; background: var(--black20a, rgba(0,0,0,0.2)); border-radius: 4px; display: flex; align-items: center; gap: 4px;">
                                <span>${escapeHtml(link.title)}</span>
                                <span class="fa-solid fa-arrow-right" style="font-size: 0.7em; color: var(--SmartThemeBorderColor);"></span>
                                <span class="fa-solid fa-${link.mode === 'force' ? 'bolt' : 'arrow-up'}" style="color: ${link.mode === 'force' ? 'var(--SmartThemeQuoteColor)' : 'var(--SmartThemeEmColor)'}; font-size: 0.7em;"></span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    ` : '';

    return `
        ${linkSummaryHtml}

        <!-- Linked Chunks Section -->
        <div class="inline-drawer wide100p flexFlowColumn" style="margin-top: 12px;">
            <div class="inline-drawer-toggle inline-drawer-header chunk-links-drawer-toggle" data-hash="${chunkHashAttr}" style="cursor: pointer;">
                <strong>Linked Chunks ${outgoingLinks.length > 0 ? `<span style="opacity: 0.6;">(${outgoingLinks.length})</span>` : ''}</strong>
                <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
            </div>
            <div class="inline-drawer-content chunk-links-drawer-content" data-hash="${chunkHashAttr}" style="display: none;">
                ${availableChunks.length === 0 ? `
                    <small style="opacity: 0.6; padding: 10px;">No other chunks available to link</small>
                ` : `
                    <div class="flex-container flexFlowRow flexGap10 paddingBottom5px">
                        <small class="flex-container flex1 flexFlowColumn">
                            ${availableChunks.slice(0, Math.ceil(availableChunks.length / 2)).map(target => `
                                <label class="checkbox flex-container alignItemsCenter flexNoGap" title="${escapeHtml(target.title)}${target.linked ? ` (${target.mode === 'force' ? 'Force' : 'Soft'} link)` : ''}">
                                    <input type="checkbox" class="chunk-link-checkbox" data-hash="${chunkHashAttr}" data-target="${escapeHtml(target.hash)}" ${target.linked ? 'checked' : ''}>
                                    <span style="display: flex; align-items: center; gap: 4px;">
                                        ${escapeHtml(target.title)}
                                        ${target.linked ? `<span class="fa-solid fa-${target.mode === 'force' ? 'bolt' : 'arrow-up'}" style="color: ${target.mode === 'force' ? 'var(--SmartThemeQuoteColor)' : 'var(--SmartThemeEmColor)'}; font-size: 0.7em;"></span>` : ''}
                                    </span>
                                </label>
                            `).join('')}
                        </small>
                        ${availableChunks.length > 1 ? `
                            <small class="flex-container flex1 flexFlowColumn">
                                ${availableChunks.slice(Math.ceil(availableChunks.length / 2)).map(target => `
                                    <label class="checkbox flex-container alignItemsCenter flexNoGap" title="${escapeHtml(target.title)}${target.linked ? ` (${target.mode === 'force' ? 'Force' : 'Soft'} link)` : ''}">
                                        <input type="checkbox" class="chunk-link-checkbox" data-hash="${chunkHashAttr}" data-target="${escapeHtml(target.hash)}" ${target.linked ? 'checked' : ''}>
                                        <span style="display: flex; align-items: center; gap: 4px;">
                                            ${escapeHtml(target.title)}
                                            ${target.linked ? `<span class="fa-solid fa-${target.mode === 'force' ? 'bolt' : 'arrow-up'}" style="color: ${target.mode === 'force' ? 'var(--SmartThemeQuoteColor)' : 'var(--SmartThemeEmColor)'}; font-size: 0.7em;"></span>` : ''}
                                        </span>
                                    </label>
                                `).join('')}
                            </small>
                        ` : ''}
                    </div>
                `}
                ${availableChunks.length > 0 ? `
                    <div class="flex-container alignitemscenter" style="gap: 12px; padding: 10px 10px 5px 10px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1));">
                        <small style="opacity: 0.7;">Link Mode:</small>
                        <label class="checkbox_label flex-container alignitemscenter flexNoGap" style="gap: 4px;">
                            <input type="radio" name="chunk-link-mode-${chunkHashAttr}" value="soft" class="chunk-link-mode-radio" data-hash="${chunkHashAttr}" checked>
                            <small><span class="fa-solid fa-arrow-up" style="color: var(--SmartThemeEmColor);"></span> Soft</small>
                        </label>
                        <label class="checkbox_label flex-container alignitemscenter flexNoGap" style="gap: 4px;">
                            <input type="radio" name="chunk-link-mode-${chunkHashAttr}" value="force" class="chunk-link-mode-radio" data-hash="${chunkHashAttr}">
                            <small><span class="fa-solid fa-bolt" style="color: var(--SmartThemeQuoteColor);"></span> Force</small>
                        </label>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Attach handlers for chunk-specific interactions
 */
function attachChunkHandlers() {
    // Toggle expand/collapse - OPTIMIZED: Just toggle visibility without full re-render
    $('.chunk-toggle-drawer').off('click').on('click', function(e) {
        e.stopPropagation();
        e.preventDefault();

        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (!chunk) return;

        // Toggle state
        chunk._editing = !chunk._editing;

        // Just toggle the drawer visibility and icon
        const $drawer = $(`.world_entry[data-hash="${hash}"]`).find('.inline-drawer-content').first();
        const $icon = $(this);

        if (chunk._editing) {
            $drawer.slideDown(150);
            $icon.removeClass('fa-circle-chevron-down down').addClass('fa-circle-chevron-up up');
            $icon.attr('aria-expanded', 'true');
        } else {
            $drawer.slideUp(150);
            $icon.removeClass('fa-circle-chevron-up up').addClass('fa-circle-chevron-down down');
            $icon.attr('aria-expanded', 'false');
        }
    });

    // Toggle enabled/disabled
    $('.chunk-toggle-enabled').off('click').on('click', function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (chunk) {
            chunk.disabled = !chunk.disabled;
            renderChunkPreviews();
        }
    });

    // Edit title
    $('.chunk-title-edit').off('input').on('input', function() {
        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (chunk) {
            chunk.comment = $(this).val();
            chunk.section = $(this).val();
        }
    });

    // Edit chunk text
    $('.chunk-text-edit').off('input').on('input', function() {
        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (chunk) {
            chunk.text = $(this).val();
        }
    });

    // Delete chunk
    $('.chunk-delete-btn').off('click').on('click', function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (chunk && confirm(`Delete chunk "${chunk.comment || chunk.section}"?`)) {
            previewChunks = previewChunks.filter(c => c.hash !== hash);
            renderChunkPreviews();
            toastr.info('Chunk deleted');
        }
    });

    // Refresh keywords button - regenerate keywords from current chunk content
    $('.chunk-refresh-btn').off('click').on('click', async function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        const chunk = previewChunks.find(c => c.hash === hash);
        if (!chunk) return;

        // Use shared regenerate function from chunk-common.js
        await regenerateChunkKeywords(
            chunk,
            characterName,
            () => renderChunkPreviews(), // On success, re-render
            null // No special error handling needed (shared function already shows toast)
        );
    });

    // Toggle linked chunks drawer
    $('.chunk-links-drawer-toggle').off('click').on('click', function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        const $content = $(`.chunk-links-drawer-content[data-hash="${hash}"]`);
        const $icon = $(this).find('.inline-drawer-icon');

        if ($content.is(':visible')) {
            $content.slideUp(200);
            $icon.removeClass('fa-circle-chevron-up up').addClass('fa-circle-chevron-down down');
        } else {
            $content.slideDown(200);
            $icon.removeClass('fa-circle-chevron-down down').addClass('fa-circle-chevron-up up');
        }
    });

    // Toggle chunk link checkbox
    $('.chunk-link-checkbox').off('change').on('change', function() {
        const hash = $(this).data('hash');
        const targetHash = $(this).data('target');
        const chunk = previewChunks.find(c => c.hash === hash);

        if (chunk) {
            if (!chunk.chunkLinks) chunk.chunkLinks = [];

            const linkMode = $(`.chunk-link-mode-radio[data-hash="${hash}"]:checked`).val() || 'soft';

            if (this.checked) {
                if (!chunk.chunkLinks.some(link => link.targetHash === targetHash)) {
                    chunk.chunkLinks.push({ targetHash, mode: linkMode });
                }
            } else {
                chunk.chunkLinks = chunk.chunkLinks.filter(link => link.targetHash !== targetHash);
            }

            renderChunkPreviews();
        }
    });

    // Update link mode when radio buttons change
    $('.chunk-link-mode-radio').off('change').on('change', function() {
        const hash = $(this).data('hash');
        const newMode = $(this).val();
        const chunk = previewChunks.find(c => c.hash === hash);

        if (chunk && chunk.chunkLinks) {
            $(`.chunk-link-checkbox[data-hash="${hash}"]:checked`).each(function() {
                const targetHash = $(this).data('target');
                const link = chunk.chunkLinks.find(l => l.targetHash === targetHash);
                if (link) {
                    link.mode = newMode;
                }
            });

            renderChunkPreviews();
        }
    });

    // Stop propagation on inputs to prevent drawer close
    $('.chunk-text-edit, .chunk-title-edit').off('click focus').on('click focus', function(e) {
        e.stopPropagation();
    });
}

/**
 * Finalize chunks and save to library
 */
async function finalizeChunks() {
    const $btn = $('#carrot-chunking-finalize');
    const originalHTML = $btn.html();

    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Processing...');

        const enabledChunks = previewChunks.filter(c => !c.disabled);

        if (enabledChunks.length === 0) {
            toastr.warning('No chunks enabled. Enable at least one chunk.');
            return;
        }

        // Get global settings
        const globalCharName = $('#chunking-character-name').val() || characterName;
        const globalContextLevel = $('#chunking-context-level').val();

        // Reconstruct fullsheet content from chunks (preserving edits)
        const reconstructedContent = enabledChunks.map((chunk, idx) => {
            return `## ${chunk.section}\n\n${chunk.text}`;
        }).join('\n\n');

        // Import vectorization function
        const { vectorizeFullsheetFromMessage } = await import('./fullsheet-rag.js');

        // Vectorize using the standard flow
        const success = await vectorizeFullsheetFromMessage(globalCharName, reconstructedContent);

        if (success) {
            toastr.success(`✅ ${enabledChunks.length} chunks finalized and vectorized!`);
            closeChunkingModal();
        } else {
            toastr.warning('Vectorization may have been skipped (already exists or disabled)');
        }

    } catch (error) {
        CarrotDebug.error('Failed to finalize chunks:', error);
        toastr.error(`Failed to finalize chunks: ${error.message}`);
    } finally {
        $btn.prop('disabled', false).html(originalHTML);
    }
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// SECTION 4: BABY BUNNY UI COMPONENTS
// Message buttons, tutorial popups, shared UI elements
// =============================================================================

function showTutorialBabyBunnyPopup(bunnyData) {
    const characterData = {
        name: 'Atsu_Ibn_Oba_Al-Masri',
        tags: bunnyData
    };

    // Format tags properly to bypass ST's tag filtering
    const displayTags = characterData.tags
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&lt;([^&]+)&gt;/g, '<span style="color: var(--SmartThemeQuoteColor); font-weight: 600;">&lt;$1&gt;</span>');

    const popup = $(`
        <div class="carrot-popup-container baby-bunny-popup baby-bunny-tutorial" style="padding: 0; max-width: 750px; width: 95%;">
            <div class="carrot-card" style="margin: 0; height: auto;">
                <!-- Header matching CarrotKernel style -->
                <div class="carrot-card-header" style="padding: 24px 32px 16px;">
                    <h3 style="margin: 0 0 8px; font-size: 24px;">🐰 Baby Bunny Mode - Tutorial</h3>
                    <p class="carrot-card-subtitle" style="margin: 0; color: var(--SmartThemeQuoteColor);">Learn how to create character archives from AI-generated sheets</p>
                </div>

                <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 24px;">

                    <!-- Introduction: The Baby Bunny Button -->
                    <div class="carrot-info-box" style="background: var(--black30a); border-left: 3px solid var(--SmartThemeQuoteColor); padding: 16px; border-radius: 6px;">
                        <h4 style="margin: 0 0 12px; color: var(--SmartThemeBodyColor); font-size: 16px; display: flex; align-items: center; gap: 8px;">
                            🎩🐰 What is the Baby Bunny Button?
                        </h4>
                        <p style="margin: 0 0 12px; color: var(--SmartThemeQuoteColor); line-height: 1.6;">
                            The <strong style="color: var(--ck-primary);">rabbit-in-hat button</strong> appears on all AI message cards.
                            Click it to manually declare that a message contains a character sheet.
                        </p>
                        <p style="margin: 0; color: var(--SmartThemeQuoteColor); line-height: 1.6;">
                            This opens <strong>Baby Bunny Mode</strong> - a guided interface for transforming AI-generated character sheets
                            (with or without <code style="background: var(--black70a); padding: 2px 6px; border-radius: 3px;">&lt;BunnymoTags&gt;</code>)
                            into permanent lorebook entries. This tutorial walks you through the process!
                        </p>
                    </div>

                    <!-- Step 1: Lorebook Selection -->
                    <div class="carrot-setup-step" id="tutorial-step-1">
                        <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">1</span>
                            Choose Archive Location
                        </h4>

                        <div class="carrot-setting-item" style="margin-bottom: 16px;">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Archive Type</span>
                                <span class="carrot-label-hint">Create a new lorebook or add to existing one</span>
                            </label>
                            <div style="display: flex; gap: 12px; margin-top: 8px;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="radio" name="lorebook-type-tutorial" value="new" checked disabled style="accent-color: var(--SmartThemeQuoteColor);">
                                    <span>Create New Lorebook</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: not-allowed; opacity: 0.6;">
                                    <input type="radio" name="lorebook-type-tutorial" value="existing" disabled style="accent-color: var(--SmartThemeQuoteColor);">
                                    <span>Add to Existing</span>
                                </label>
                            </div>
                        </div>

                        <div class="carrot-setting-item">
                            <label class="carrot-label">
                                <span class="carrot-label-text">New Lorebook Name</span>
                                <span class="carrot-label-hint">Name for the new character archive lorebook file</span>
                            </label>
                            <input type="text" value="${characterData.name} Character Archive" class="carrot-input" style="font-size: 14px; padding: 12px;" disabled>
                        </div>
                    </div>

                    <!-- Step 2: Entry Configuration -->
                    <div class="carrot-setup-step" id="tutorial-step-2">
                        <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">2</span>
                            Configure Entry Details
                        </h4>

                        <div class="carrot-setting-item" style="margin-bottom: 16px;">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Entry Name</span>
                                <span class="carrot-label-hint">Name that will appear in the lorebook entry list</span>
                            </label>
                            <input type="text" value="${characterData.name}" class="carrot-input" style="font-size: 14px; padding: 12px;" disabled>
                        </div>

                        <div class="carrot-setting-item" style="margin-bottom: 16px;">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Entry Selection Mode</span>
                                <span class="carrot-label-hint">How this character's data should be activated</span>
                            </label>

                            <div style="display: flex; gap: 12px; margin-top: 12px;">
                                <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; background: var(--SmartThemeBlurTintColor); opacity: 0.8; display: flex;">
                                    <input type="radio" name="selection-mode-tutorial" value="selective" checked disabled style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                            <i class="fa-solid fa-hand-pointer" style="color: var(--SmartThemeQuoteColor);"></i>
                                            Selective
                                        </div>
                                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Entry only fires when triggers are mentioned in chat</div>
                                    </div>
                                </label>

                                <label class="carrot-toggle" style="flex: 1; flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 2px solid var(--SmartThemeBorderColor); border-radius: 8px; background: var(--SmartThemeBlurTintColor); opacity: 0.8; display: flex;">
                                    <input type="radio" name="selection-mode-tutorial" value="constant" disabled style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                            <i class="fa-solid fa-infinity" style="color: var(--SmartThemeQuoteColor);"></i>
                                            Constant
                                        </div>
                                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor); line-height: 1.4;">Always active - for MAIN characters only</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div class="carrot-setting-item" id="tutorial-trigger-keys">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Trigger Keys</span>
                                <span class="carrot-label-hint">Character names and aliases that will activate this entry</span>
                            </label>
                            <div class="tag-input-container" style="
                                border: 1px solid var(--SmartThemeBorderColor);
                                border-radius: 6px;
                                padding: 8px;
                                background: var(--SmartThemeBlurTintColor);
                                min-height: 50px;
                                display: flex;
                                flex-wrap: wrap;
                                gap: 6px;
                                align-items: flex-start;
                                opacity: 0.7;
                            ">
                                <div class="trigger-tag" style="
                                    background: var(--SmartThemeQuoteColor);
                                    color: var(--SmartThemeBlurTintColor);
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <span class="tag-text">${characterData.name}</span>
                                    <i class="fa-solid fa-times" style="cursor: not-allowed; opacity: 0.5;"></i>
                                </div>
                                <input type="text" placeholder="Type trigger name..." style="
                                    border: none;
                                    background: none;
                                    outline: none;
                                    flex: 1;
                                    min-width: 200px;
                                    font-size: 13px;
                                    color: var(--SmartThemeBodyColor);
                                " disabled>
                            </div>
                        </div>
                    </div>

                    <!-- Step 3: Tag Review -->
                    <div class="carrot-setup-step" id="tutorial-step-3">
                        <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">3</span>
                            Review & Edit Character Data
                        </h4>

                        <div class="carrot-setting-item">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Character Tags</span>
                                <span class="carrot-label-hint">BunnyMoTags and Linguistics data - click to edit</span>
                            </label>
                            <div class="carrot-preview-box" style="
                                font-family: var(--monoFontFamily);
                                font-size: 12px;
                                color: var(--SmartThemeQuoteColor);
                                padding: 16px;
                                background: var(--SmartThemeBlurTintColor);
                                border: 1px solid var(--SmartThemeBorderColor);
                                border-radius: 6px;
                                max-height: 300px;
                                overflow-y: auto;
                                line-height: 1.4;
                                opacity: 0.9;
                            ">${displayTags}</div>
                        </div>
                    </div>

                    <!-- Step 4: Loadout Management -->
                    <div class="carrot-setup-step" id="tutorial-step-4">
                        <h4 style="margin: 0 0 16px; color: var(--SmartThemeBodyColor); font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span style="background: var(--SmartThemeQuoteColor); color: var(--SmartThemeBlurTintColor); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">4</span>
                            Activate Lorebook
                        </h4>

                        <div class="carrot-setting-item">
                            <label class="carrot-label">
                                <span class="carrot-label-text">Activation Scope</span>
                                <span class="carrot-label-hint">Choose where to activate this lorebook</span>
                            </label>

                            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
                                <label style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; background: var(--SmartThemeBlurTintColor); opacity: 0.8; display: flex;">
                                    <input type="radio" name="lorebook-scope-tutorial" value="character" checked disabled style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                        <i class="fa-solid fa-user" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                        <div>
                                            <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Character Settings</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to ALL chats with this character</div>
                                        </div>
                                    </div>
                                </label>

                                <label style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; background: var(--SmartThemeBlurTintColor); opacity: 0.8; display: flex;">
                                    <input type="radio" name="lorebook-scope-tutorial" value="chat" disabled style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                        <i class="fa-solid fa-comments" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                        <div>
                                            <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Chat Settings</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply ONLY to this specific conversation</div>
                                        </div>
                                    </div>
                                </label>

                                <label style="flex-direction: row; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; background: var(--SmartThemeBlurTintColor); opacity: 0.8; display: flex;">
                                    <input type="radio" name="lorebook-scope-tutorial" value="global" disabled style="accent-color: var(--SmartThemeQuoteColor); margin: 0;">
                                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                        <i class="fa-solid fa-globe" style="color: var(--SmartThemeQuoteColor); font-size: 18px; width: 20px; text-align: center;"></i>
                                        <div>
                                            <div style="font-weight: 600; color: var(--SmartThemeBodyColor); margin-bottom: 2px;">Global Settings</div>
                                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to all chats and characters (default)</div>
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Tutorial Notice & Action Buttons -->
                    <div style="background: color-mix(in srgb, #3b82f6 10%, transparent); border-left: 4px solid #3b82f6; border-radius: 6px; padding: 16px; margin-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <i class="fa-solid fa-info-circle" style="color: #3b82f6; font-size: 20px;"></i>
                            <div style="color: var(--SmartThemeBodyColor); font-size: 14px;">
                                <strong>Tutorial Mode:</strong> This is a demonstration. In real use, clicking "Create Archive" would save this character to your lorebook.
                            </div>
                        </div>
                    </div>

                    <div class="carrot-action-bar" id="tutorial-step-5" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; padding-top: 24px; border-top: 1px solid var(--SmartThemeBorderColor);">
                        <button id="tutorial-baby-bunny-close" class="carrot-secondary-btn" style="padding: 12px 24px; font-size: 14px;">
                            <i class="fa-solid fa-times"></i>
                            Close Tutorial
                        </button>
                        <button class="carrot-primary-btn" style="padding: 12px 24px; font-size: 14px; opacity: 0.6; cursor: not-allowed;" disabled>
                            <i class="fa-solid fa-carrot"></i>
                            Create Archive (Disabled)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `);

    // Create custom overlay
    const overlay = $(`
        <div class="baby-bunny-overlay baby-bunny-tutorial-overlay" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100vh !important;
            background: rgba(0,0,0,0.8) !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            backdrop-filter: blur(4px) !important;
        "></div>
    `);

    popup.css({
        'max-width': '750px',
        'width': '90%',
        'max-height': '80vh',
        'overflow-y': 'auto',
        'z-index': '999999',
        'position': 'relative'
    });

    overlay.append(popup);
    $('body').append(overlay);
    overlay.show();
    $('html, body').scrollTop(0);

    // Close button handler
    popup.find('#tutorial-baby-bunny-close').on('click', () => {
        overlay.remove();
        closeTutorial();
    });
}

// Close Baby Bunny tutorial popup
function closeBabyBunnyTutorial() {
    closeTutorial();
}

function initialize_baby_bunny_message_button() {
    // Add the message button to the chat messages
    // Initialization is silent - no logs needed

    let html = `
<div title="🐰 Manual Baby Bunny Mode - Process this message as a character sheet" class="mes_button ${baby_bunny_button_class}" tabindex="0">
    <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.097.298a2.19 2.19 0 0 0-2.145.687a4.03 4.03 0 0 0-.735 3.981c.534 1.742 1.517 4.657 2.264 6.743c.044.12.157.2.284.201h8.094a.31.31 0 0 0 .272-.19c.249-.627.533-1.362.83-2.144a.26.26 0 0 0-.107-.308a5.8 5.8 0 0 1-1.327-1.185a10.4 10.4 0 0 1-2.3-3.851a.1.1 0 0 0-.07-.024a.07.07 0 0 0-.071.06c-.225.912-.77 3.222-1.043 4.443a.31.31 0 0 1-.296.237a.284.284 0 0 1-.285-.237c-.438-2.086-.948-4.432-1.315-5.842C9.602.96 8.654.439 8.097.297m11.755 8.627a1.67 1.67 0 0 0 1.244-2.37a9.36 9.36 0 0 0-3.496-4.16a5.3 5.3 0 0 0-2.133-.532c-.533 0-.983.142-1.125.568c-.439 1.185 1.185 3.875 2.145 4.954a4.18 4.18 0 0 0 3.365 1.54M2.74 14.873c0 .654.531 1.185 1.186 1.185h2.192a.32.32 0 0 1 .225.094a.3.3 0 0 1 .071.237l-.794 5.522a1.6 1.6 0 0 0 .427 1.327c.349.339.817.526 1.303.522h8.177a1.85 1.85 0 0 0 1.303-.521c.356-.345.527-.837.462-1.328l-.794-5.522a.3.3 0 0 1 .071-.237a.32.32 0 0 1 .226-.094h2.488a1.185 1.185 0 1 0 0-2.37H3.878a1.185 1.185 0 0 0-1.137 1.185"/>
    </svg>
</div>
`

    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    let $chat = $("div#chat")
    $chat.on("click", `.${baby_bunny_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));

        CarrotDebug.ui('🐰 Baby Bunny button clicked for message:', message_id);

        // Debug: Log message info
        CarrotDebug.ui('🐰 Debugging message lookup:', {
            message_id: message_id,
            messageIdType: typeof message_id,
            chatLength: chat.length,
            firstMessage: chat[0] ? Object.keys(chat[0]) : 'No messages',
            sampleMessageIds: chat.slice(0, 3).map(msg => ({ index: msg.index, mesId: msg.mes_id, id: msg.id }))
        });

        // Try multiple ways to find the message
        let targetMessage = chat.find(msg => msg.index == message_id);
        if (!targetMessage) {
            targetMessage = chat.find(msg => msg.mes_id == message_id);
        }
        if (!targetMessage) {
            targetMessage = chat.find(msg => msg.id == message_id);
        }
        if (!targetMessage) {
            // Try by array index (mesid might be array position)
            targetMessage = chat[message_id];
        }

        if (!targetMessage) {
            CarrotDebug.error('🐰 Could not find message in chat array after trying all methods');
            toastr.warning('Could not find message to process.');
            return;
        }

        CarrotDebug.ui('🐰 Manual Baby Bunny Mode triggered - processing message as character sheet');
        toastr.success('🐰 Processing message with Baby Bunny Mode...');

        // Manually trigger the Baby Bunny Mode processing
        await checkForCompletedSheets(targetMessage, message_id);

        // Baby Bunny Mode handles everything - no need for separate RAG confirmation
        CarrotDebug.ui('✅ Baby Bunny Mode completed - skipping RAG confirmation (handled via Skip to Chunking button)');
        return;

        // Check if this is also a fullsheet and offer to vectorize (DISABLED - now handled by Baby Bunny Mode)
        CarrotDebug.ui('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        CarrotDebug.ui('🔬 CHECKING FOR FULLSHEET VECTORIZATION OPPORTUNITY');
        CarrotDebug.ui('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        try {
            CarrotDebug.ui('Step 1: Ensuring RAG module is loaded...');
            await fullsheetRAGPromise;
            CarrotDebug.ui('   Module loaded successfully');

            CarrotDebug.ui('Step 2: Checking if RAG is enabled...');
            const ragEnabled = extension_settings[extensionName]?.rag?.enabled;
            CarrotDebug.ui(`   RAG enabled: ${ragEnabled}`);
            CarrotDebug.ui(`   Extension settings:`, extension_settings[extensionName]?.rag);

            if (!ragEnabled) {
                CarrotDebug.ui('❌ RAG is not enabled - skipping vectorization check');
                CarrotDebug.ui('   To enable: Go to CarrotKernel settings and enable RAG');
                return;
            }

            CarrotDebug.ui('Step 3: Detecting fullsheet in message...');
            CarrotDebug.ui(`   Message length: ${targetMessage.mes?.length || 0} chars`);
            CarrotDebug.ui(`   Message preview:`, targetMessage.mes?.substring(0, 200));

            const fullsheetInfo = fullsheetAPI.detectFullsheetInMessage(targetMessage.mes);

            CarrotDebug.ui('Step 4: Fullsheet detection result:');
            if (fullsheetInfo) {
                CarrotDebug.ui('✅ FULLSHEET DETECTED!');
                CarrotDebug.ui('   Character:', fullsheetInfo.characterName);
                CarrotDebug.ui('   Section count:', fullsheetInfo.sectionCount);
                CarrotDebug.ui('   Content length:', fullsheetInfo.content.length);
            } else {
                CarrotDebug.ui('❌ NOT A FULLSHEET');
                CarrotDebug.ui('   Possible reasons:');
                CarrotDebug.ui('   - Message too short (< 5000 chars)');
                CarrotDebug.ui('   - Missing SECTION headers (need at least 3)');
                CarrotDebug.ui('   - Missing BunnymoTags');
                return;
            }

            CarrotDebug.ui('Step 5: Showing confirmation dialog...');

            // Ask user if they want to vectorize
            const shouldVectorize = confirm(
                `🔬 Fullsheet Detected!\n\n` +
                `Character: ${fullsheetInfo.characterName}\n` +
                `Sections: ${fullsheetInfo.sectionCount}\n` +
                `Size: ${Math.round(fullsheetInfo.content.length / 1000)}KB\n\n` +
                `Would you like to vectorize this fullsheet for RAG (Retrieval-Augmented Generation)?\n\n` +
                `This will enable smart context injection during chats with this character.`
            );

            if (shouldVectorize) {
                CarrotDebug.ui('✅ User confirmed - starting vectorization...');
                toastr.info('🔬 Vectorizing fullsheet...', 'RAG System', { timeOut: 3000 });

                const success = await fullsheetAPI.vectorizeFullsheetFromMessage(
                    fullsheetInfo.characterName,
                    fullsheetInfo.content
                );

                if (success) {
                    toastr.success(
                        `✅ ${fullsheetInfo.characterName} fullsheet vectorized successfully!`,
                        'RAG System',
                        { timeOut: 5000 }
                    );
                }
            } else {
                CarrotDebug.ui('❌ User declined vectorization');
            }
        } catch (error) {
            CarrotDebug.error('❌ Error checking for fullsheet vectorization:', error);
            CarrotDebug.error('   Error stack:', error.stack);
        }

        CarrotDebug.ui('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });
}

// Add Baby Bunny button to specific message (for MESSAGE_RENDERED events)
function add_baby_bunny_button_to_message(messageId) {
    CarrotDebug.ui(`🐰 Adding button to message ${messageId}`);

    // Find the specific message by mesid attribute
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length === 0) {
        CarrotDebug.ui(`🐰 Message ${messageId} not found in DOM`);
        return;
    }

    const extraButtons = messageElement.find('.mes_buttons .extraMesButtons');
    if (extraButtons.length === 0) {
        CarrotDebug.ui(`🐰 No extraMesButtons found in message ${messageId}`);
        return;
    }

    // Check if button already exists
    if (extraButtons.find(`.${baby_bunny_button_class}`).length > 0) {
        CarrotDebug.ui(`🐰 Button already exists in message ${messageId}`);
        return;
    }

    // Add the button
    let html = `<div title="🐰 Manual Baby Bunny Mode - Process this message as a character sheet" class="mes_button ${baby_bunny_button_class}" tabindex="0">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.097.298a2.19 2.19 0 0 0-2.145.687a4.03 4.03 0 0 0-.735 3.981c.534 1.742 1.517 4.657 2.264 6.743c.044.12.157.2.284.201h8.094a.31.31 0 0 0 .272-.19c.249-.627.533-1.362.83-2.144a.26.26 0 0 0-.107-.308a5.8 5.8 0 0 1-1.327-1.185a10.4 10.4 0 0 1-2.3-3.851a.1.1 0 0 0-.07-.024a.07.07 0 0 0-.071.06c-.225.912-.77 3.222-1.043 4.443a.31.31 0 0 1-.296.237a.284.284 0 0 1-.285-.237c-.438-2.086-.948-4.432-1.315-5.842C9.602.96 8.654.439 8.097.297m11.755 8.627a1.67 1.67 0 0 0 1.244-2.37a9.36 9.36 0 0 0-3.496-4.16a5.3 5.3 0 0 0-2.133-.532c-.533 0-.983.142-1.125.568c-.439 1.185 1.185 3.875 2.145 4.954a4.18 4.18 0 0 0 3.365 1.54M2.74 14.873c0 .654.531 1.185 1.186 1.185h2.192a.32.32 0 0 1 .225.094a.3.3 0 0 1 .071.237l-.794 5.522a1.6 1.6 0 0 0 .427 1.327c.349.339.817.526 1.303.522h8.177a1.85 1.85 0 0 0 1.303-.521c.356-.345.527-.837.462-1.328l-.794-5.522a.3.3 0 0 1 .071-.237a.32.32 0 0 1 .226-.094h2.488a1.185 1.185 0 1 0 0-2.37H3.878a1.185 1.185 0 0 0-1.137 1.185"/>
        </svg>
    </div>`;
    extraButtons.prepend(html);

    CarrotDebug.ui(`🐰 ✅ Button added to message ${messageId}`);
}

// Add Baby Bunny buttons to all existing messages (called on extension load)
function add_baby_bunny_buttons_to_all_existing_messages() {
    CarrotDebug.ui('🐰 Adding Baby Bunny buttons to all existing messages...');

    // Re-prime #message_template so any message cloned from it later (chat switch,
    // reload) still gets the button, using the same "already exists" guard as
    // add_baby_bunny_button_to_message().
    const templateExtraButtons = $("#message_template .mes_buttons .extraMesButtons");
    if (templateExtraButtons.find(`.${baby_bunny_button_class}`).length === 0) {
        let templateHtml = `<div title="🐰 Manual Baby Bunny Mode - Process this message as a character sheet" class="mes_button ${baby_bunny_button_class}" tabindex="0">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.097.298a2.19 2.19 0 0 0-2.145.687a4.03 4.03 0 0 0-.735 3.981c.534 1.742 1.517 4.657 2.264 6.743c.044.12.157.2.284.201h8.094a.31.31 0 0 0 .272-.19c.249-.627.533-1.362.83-2.144a.26.26 0 0 0-.107-.308a5.8 5.8 0 0 1-1.327-1.185a10.4 10.4 0 0 1-2.3-3.851a.1.1 0 0 0-.07-.024a.07.07 0 0 0-.071.06c-.225.912-.77 3.222-1.043 4.443a.31.31 0 0 1-.296.237a.284.284 0 0 1-.285-.237c-.438-2.086-.948-4.432-1.315-5.842C9.602.96 8.654.439 8.097.297m11.755 8.627a1.67 1.67 0 0 0 1.244-2.37a9.36 9.36 0 0 0-3.496-4.16a5.3 5.3 0 0 0-2.133-.532c-.533 0-.983.142-1.125.568c-.439 1.185 1.185 3.875 2.145 4.954a4.18 4.18 0 0 0 3.365 1.54M2.74 14.873c0 .654.531 1.185 1.186 1.185h2.192a.32.32 0 0 1 .225.094a.3.3 0 0 1 .071.237l-.794 5.522a1.6 1.6 0 0 0 .427 1.327c.349.339.817.526 1.303.522h8.177a1.85 1.85 0 0 0 1.303-.521c.356-.345.527-.837.462-1.328l-.794-5.522a.3.3 0 0 1 .071-.237a.32.32 0 0 1 .226-.094h2.488a1.185 1.185 0 1 0 0-2.37H3.878a1.185 1.185 0 0 0-1.137 1.185"/>
        </svg>
    </div>`;
        templateExtraButtons.prepend(templateHtml);
        CarrotDebug.ui('🐰 Re-primed #message_template with Baby Bunny button');
    }

    const allMessages = $("#chat .mes");
    CarrotDebug.ui(`🐰 Found ${allMessages.length} existing messages to process`);

    let addedCount = 0;
    allMessages.each(function() {
        const messageId = $(this).attr("mesid");
        if (messageId) {
            add_baby_bunny_button_to_message(messageId);
            addedCount++;
        }
    });

    CarrotDebug.ui(`🐰 ✅ Added Baby Bunny buttons to ${addedCount} existing messages`);
}

// Remove all Baby Bunny buttons from messages
function remove_all_baby_bunny_buttons() {
    CarrotDebug.ui('🐰 Removing all Baby Bunny buttons...');

    // Scope removal to #chat only. #message_template is ST's live, cached template
    // node (not an inert <template>) — a document-wide selector would strip the
    // button out of it too, and nothing ever re-primes it, so every message cloned
    // from the template afterward (chat switches, reloads) would permanently lose
    // the button until a full page reload.
    const buttons = $(`#chat .${baby_bunny_button_class}`);
    const count = buttons.length;
    buttons.remove();

    CarrotDebug.ui(`🐰 ✅ Removed ${count} Baby Bunny buttons`);
}


// =============================================================================
// EXPORTS
// =============================================================================

// Export core functions that are called from index.js
export {
    checkForCompletedSheets,
    initialize_baby_bunny_message_button,
    add_baby_bunny_button_to_message,
    add_baby_bunny_buttons_to_all_existing_messages,
    remove_all_baby_bunny_buttons,
    showTutorialBabyBunnyPopup,
    closeBabyBunnyTutorial,
    baby_bunny_button_class
};

