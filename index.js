import { eventSource, event_types, chat, saveSettingsDebounced, chat_metadata, addOneMessage, this_chid, characters, generateQuietPrompt, animation_duration, setExtensionPrompt, extension_prompt_types, extension_prompt_roles, messageFormatting, saveChatConditional, saveChatDebounced } from '../../../../script.js';
import { getTokenCountAsync } from '../../../../scripts/tokenizers.js';
import { extension_settings, getContext, writeExtensionField, saveMetadataDebounced } from '../../../extensions.js';
import { loadWorldInfo, world_names, createNewWorldInfo, createWorldInfoEntry, saveWorldInfo, updateWorldInfoList, selected_world_info, world_info, METADATA_KEY, parseRegexFromString } from '../../../world-info.js';
import { executeSlashCommandsWithOptions, registerSlashCommand } from '../../../slash-commands.js';
import { getMessageTimeStamp, dragElement } from '../../../RossAscends-mods.js';
import { loadMovingUIState } from '../../../power-user.js';
import { highlightRegex } from '../../../utils.js';
import { CarrotWorldBookTracker } from './worldbook-tracker.js';
import { CarrotLorebookConnector } from './lorebook-connector.js';
import { CarrotDebug, initializeDebugger } from './debugger.js';
import { CarrotContextManager, CarrotStorageManager } from './context-manager.js';
import { CarrotGitHubBrowser } from './github-browser.js';
import { CarrotPackManager } from './pack-manager.js';
import { generateFullSheet, generateTagSheet, generateQuickSheet, CarrotTemplateManager, initializeSheetGenerator } from './sheet-generator.js';
import {
    scannedCharacters,
    selectedLorebooks,
    characterRepoBooks,
    tagLibraries,
    setLastInjectedCharacters,
    getLastInjectedCharacters,
    currentRepoView,
    setCurrentRepoView,
    selectedCharacter,
    setSelectedCharacter,
    selectedRepository,
    setSelectedRepository,
    _packManagerOpening,
    setPackManagerOpening,
    pendingSheetCommand,
    setPendingSheetCommand,
    lastProcessedMessage,
    setLastProcessedMessage,
    pendingThinkingBlockData,
    setPendingThinkingBlockData,
    addToPendingThinkingBlockData,
    clearPendingThinkingBlockData,
    EXTENSION_NAME
} from './carrot-state.js';
import { renderAsCards, loadCarrotCardStyles, attachExternalCardsToMessage, ensureBunnyMoAnimations, createExternalCardContainer, createTabbedCharacterCard, createCharacterCard, initializeCardRenderer } from './card-renderer.js';
import { initializeUIUpdates, updateStatusPanels } from './ui-updates.js';
import { initializeTutorials, openSystemTutorial, openRepositoryTutorial, openInjectionTutorial, openTemplateEditorTutorial, startTutorial, closeTutorial } from './tutorials.js';
import { checkForCompletedSheets, initialize_baby_bunny_message_button, add_baby_bunny_button_to_message, add_baby_bunny_buttons_to_all_existing_messages, remove_all_baby_bunny_buttons, showTutorialBabyBunnyPopup, closeBabyBunnyTutorial, baby_bunny_button_class } from './baby-bunny-mode.js';
import { initializeChunkVisualizer, openChunkVisualizer as openChunkVisualizerModule, closeChunkVisualizer, saveChunkChanges } from './chunk-visualizer.js';
import { CarrotTemplatePromptEditInterface } from './template-editor.js';
import {
    initializeRepositoryManager,
    openRepositoryManager,
    cleanupStaleRepositories,
    manualRepositoryScan,
    navigateRepoHome,
    selectRepository,
    updateRepositoryPreview,
    navigateToRepository,
    renderRepositoryManager,
    returnToRepositoryManager,
    updateRepositoryManagerContent,
    showCharacterDetails,
    navigateToCharacter
} from './repository-manager.js';

// Import fullsheet-rag.js dynamically
let fullsheetAPI = {};
let fullsheetRAGLoaded = false;

// Pack Manager state (module-level)
let githubBrowser = null;
let hasScannedExisting = false;

// Main settings popout state
let mainLorebookPopoutVisible = false;
let $mainLorebookContent = null;
let $mainLorebookOriginalParent = null;
let $mainLorebookPopout = null;

async function loadFullsheetRAG() {
    if (fullsheetRAGLoaded) {
        return fullsheetAPI;
    }

    try {
        const module = await import('./fullsheet-rag.js');
        fullsheetRAGLoaded = true;
        fullsheetAPI = {
            initializeRAG: module.initializeRAG || (() => {}),
            saveRAGSettings: module.saveRAGSettings || (() => {}),
            addRAGButtonsToAllMessages: module.addRAGButtonsToAllMessages || (() => {}),
            removeAllRAGButtons: module.removeAllRAGButtons || (() => {}),
            detectFullsheetInMessage: module.detectFullsheetInMessage || (() => {}),
            vectorizeFullsheetFromMessage: module.vectorizeFullsheetFromMessage || (() => Promise.resolve(false)),
            getCurrentContextLevel: module.getCurrentContextLevel || (() => 'global'),
            getContextualLibrary: module.getContextualLibrary || (() => ({})),
            getKeywordPriority: module.getKeywordPriority || ((keyword) => 20),
            normalizeKeyword: module.normalizeKeyword || ((word) => (word || '').toLowerCase().trim()),
            regenerateChunkKeywords: module.regenerateChunkKeywords || (() => Promise.resolve()),
            applyAutomaticLinks: module.applyAutomaticLinks || (() => {}),
            updateChunksInLibrary: module.updateChunksInLibrary || ((collectionId, chunks) => {
                CarrotDebug.error('updateChunksInLibrary not implemented in fullsheet-rag.js');
                return Promise.resolve();
            }),
            apiInsertVectorItems: module.apiInsertVectorItems || (() => Promise.resolve()),
            deleteEntireCollection: module.deleteEntireCollection || (() => Promise.resolve()),
            purgeOrphanedVectors: module.purgeOrphanedVectors || (() => Promise.resolve()),
        };
        return fullsheetAPI;
    } catch (error) {
        CarrotDebug.error('CarrotKernel: Error loading fullsheet-rag.js', error);
        return {};
    }
}

// Start loading immediately
const fullsheetRAGPromise = loadFullsheetRAG();

// Create async wrapper functions that wait for the module to load
async function initializeRAG() {
    await fullsheetRAGPromise;
    return fullsheetAPI.initializeRAG?.() || Promise.resolve();
}

async function saveRAGSettings(settings) {
    await fullsheetRAGPromise;
    return fullsheetAPI.saveRAGSettings?.(settings);
}

async function addRAGButtonsToAllMessages() {
    await fullsheetRAGPromise;
    return fullsheetAPI.addRAGButtonsToAllMessages?.();
}

async function removeAllRAGButtons() {
    await fullsheetRAGPromise;
    return fullsheetAPI.removeAllRAGButtons?.();
}

async function detectFullsheetInMessage(message) {
    await fullsheetRAGPromise;
    return fullsheetAPI.detectFullsheetInMessage?.(message);
}

async function vectorizeFullsheetFromMessage(characterName, content) {
    await fullsheetRAGPromise;

    // Prompt user for custom collection name
    const defaultName = characterName;
    const customName = prompt('Enter a name for this collection:', defaultName);

    // User cancelled the prompt
    if (customName === null) {
        toastr.info('Vectorization cancelled');
        return false;
    }

    // Proceed with vectorization
    const success = await fullsheetAPI.vectorizeFullsheetFromMessage?.(characterName, content) || Promise.resolve(false);

    // If vectorization succeeded and user provided a custom name (different from default), save it
    if (success && customName.trim() !== '' && customName.trim() !== defaultName) {
        const ragState = extension_settings[extensionName]?.rag;
        if (ragState) {
            // We need to get the collection ID to save the custom name
            // The collection ID is generated based on characterName and current context
            if (globalThis.CarrotKernelFullsheetRag?.generateCollectionId) {
                const collectionId = globalThis.CarrotKernelFullsheetRag.generateCollectionId(characterName);
                await setCollectionName(collectionId, customName.trim());
                CarrotDebug.ui(`Set custom name "${customName.trim()}" for collection ${collectionId}`);
            }
        }
    }

    return success;
}

async function getCurrentContextLevel() {
    await fullsheetRAGPromise;
    if (fullsheetAPI.getCurrentContextLevel) {
        return fullsheetAPI.getCurrentContextLevel();
    }
    return 'global'; // Default fallback
}

async function getContextualLibrary() {
    await fullsheetRAGPromise;
    if (fullsheetAPI.getContextualLibrary) {
        return fullsheetAPI.getContextualLibrary();
    }
    return {}; // Default fallback
}

// Extract clean character name from collection ID by removing prefixes and context suffixes
function getCharacterNameFromCollectionId(collectionId) {
    // Check for custom name first
    const ragState = extension_settings[extensionName]?.rag;
    if (ragState?.collectionNames && ragState.collectionNames[collectionId]) {
        return ragState.collectionNames[collectionId];
    }

    // Fall back to auto-generated name
    return collectionId
        .replace(/^carrotkernel_char_/, '')  // Remove prefix
        .replace(/_charid_\d+$/, '')  // Remove character ID suffix
        .replace(/_chat_[a-z0-9_]+$/, '')  // Remove chat ID suffix
        .replace(/_/g, ' ')  // Convert remaining underscores to spaces
        .trim();
}

// Set custom name for a collection
async function setCollectionName(collectionId, customName) {
    const ragState = extension_settings[extensionName].rag;
    if (!ragState.collectionNames) {
        ragState.collectionNames = {};
    }
    ragState.collectionNames[collectionId] = customName;
    await saveSettingsDebounced();
}

// Show context selection popup for moving collections between storage levels
async function showCopyContextPopup(collectionId, sourceContext) {
    return new Promise((resolve) => {
        const characterName = getCharacterNameFromCollectionId(collectionId);

        const popup = $(`
            <div class="carrot-popup-container rag-copy-context-popup" style="padding: 0; max-width: 600px; width: 90%;">
                <div class="carrot-card" style="margin: 0; height: auto;">
                    <!-- Header -->
                    <div class="carrot-card-header" style="padding: 24px 32px 16px;">
                        <h3 style="margin: 0 0 8px; font-size: 22px;">📦 Move Collection</h3>
                        <p class="carrot-card-subtitle" style="margin: 0; color: var(--grey70, #94a3b8);">
                            Move <strong style="color: var(--SmartThemeQuoteColor, #10b981);">${characterName}</strong> from <strong>${sourceContext.toUpperCase()}</strong> storage to:
                        </p>
                    </div>

                    <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 20px;">
                        <!-- Context Level Options -->
                        <div class="carrot-setup-step">
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <label style="
                                    display: flex;
                                    align-items: flex-start;
                                    gap: 12px;
                                    padding: 16px;
                                    background: var(--black30a, rgba(0,0,0,0.2));
                                    border: 2px solid ${sourceContext === 'global' ? 'rgba(255,255,255,0.05)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                    border-radius: 8px;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    ${sourceContext === 'global' ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                                " class="copy-context-option" data-level="global" ${sourceContext === 'global' ? 'style="pointer-events: none;"' : ''}>
                                    <input type="radio" name="copy-context-level" value="global" ${sourceContext === 'global' ? 'disabled' : ''} style="
                                        accent-color: var(--SmartThemeQuoteColor, #10b981);
                                        margin-top: 2px;
                                        width: 18px;
                                        height: 18px;
                                    ">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                            🌍 Global Storage
                                        </div>
                                        <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                            ${sourceContext === 'global' ? 'Cannot move - already here' : 'Accessible across all characters and chats'}
                                        </div>
                                    </div>
                                </label>

                                <label style="
                                    display: flex;
                                    align-items: flex-start;
                                    gap: 12px;
                                    padding: 16px;
                                    background: var(--black30a, rgba(0,0,0,0.2));
                                    border: 2px solid ${sourceContext === 'character' ? 'rgba(255,255,255,0.05)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                    border-radius: 8px;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    ${sourceContext === 'character' ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                                " class="copy-context-option" data-level="character" ${sourceContext === 'character' ? 'style="pointer-events: none;"' : ''}>
                                    <input type="radio" name="copy-context-level" value="character" ${sourceContext === 'character' ? 'disabled' : ''} ${sourceContext !== 'character' && sourceContext !== 'global' ? 'checked' : ''} style="
                                        accent-color: var(--SmartThemeQuoteColor, #10b981);
                                        margin-top: 2px;
                                        width: 18px;
                                        height: 18px;
                                    ">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                            👤 Character Storage
                                        </div>
                                        <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                            ${sourceContext === 'character' ? 'Cannot move - already here' : 'Available for this character only, across all chats'}
                                        </div>
                                    </div>
                                </label>

                                <label style="
                                    display: flex;
                                    align-items: flex-start;
                                    gap: 12px;
                                    padding: 16px;
                                    background: var(--black30a, rgba(0,0,0,0.2));
                                    border: 2px solid ${sourceContext === 'chat' ? 'rgba(255,255,255,0.05)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                    border-radius: 8px;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    ${sourceContext === 'chat' ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                                " class="copy-context-option" data-level="chat" ${sourceContext === 'chat' ? 'style="pointer-events: none;"' : ''}>
                                    <input type="radio" name="copy-context-level" value="chat" ${sourceContext === 'chat' ? 'disabled' : ''} style="
                                        accent-color: var(--SmartThemeQuoteColor, #10b981);
                                        margin-top: 2px;
                                        width: 18px;
                                        height: 18px;
                                    ">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                            💬 Chat Storage
                                        </div>
                                        <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                            ${sourceContext === 'chat' ? 'Cannot move - already here' : 'Only available in this specific chat conversation'}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1));">
                            <button class="carrot-secondary-btn" id="copy-context-cancel" style="padding: 10px 24px;">
                                Cancel
                            </button>
                            <button class="carrot-primary-btn" id="copy-context-confirm" style="padding: 10px 24px;">
                                <i class="fa-solid fa-right-left"></i> Move Collection
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Show popup overlay
        const $overlay = $('#carrot-popup-overlay');
        $overlay.html(popup).css('display', 'flex').addClass('active');

        // Handle option hover effects (only for enabled options)
        popup.find('.copy-context-option:not([style*="pointer-events: none"])').on('mouseenter', function() {
            const isSelected = $(this).find('input[type="radio"]').is(':checked');
            if (!isSelected) {
                $(this).css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
                $(this).css('opacity', '0.8');
            }
        }).on('mouseleave', function() {
            const isSelected = $(this).find('input[type="radio"]').is(':checked');
            if (!isSelected) {
                $(this).css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
                $(this).css('opacity', '1');
            }
        });

        // Handle option click - highlight selected (only for enabled options)
        popup.find('.copy-context-option:not([style*="pointer-events: none"])').on('click', function() {
            popup.find('.copy-context-option').css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
            $(this).css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
            $(this).find('input[type="radio"]').prop('checked', true);
        });

        // Handle radio button change
        popup.find('input[name="copy-context-level"]').on('change', async function() {
            popup.find('.copy-context-option').css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
            $(this).closest('.copy-context-option').css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
        });

        // ESC key to cancel
        const handleCopyContextEscape = (e) => {
            if (e.key === 'Escape') {
                popup.find('#copy-context-cancel').click();
            }
        };
        $(document).on('keydown', handleCopyContextEscape);

        // Cancel button
        popup.find('#copy-context-cancel').on('click', () => {
            $(document).off('keydown', handleCopyContextEscape);
            $overlay.removeClass('active');
            setTimeout(() => {
                $overlay.hide().empty();
            }, 300);
            resolve(null); // Return null to indicate cancellation
        });

        // Confirm button
        popup.find('#copy-context-confirm').on('click', () => {
            const selectedLevel = popup.find('input[name="copy-context-level"]:checked').val();
            if (!selectedLevel) {
                toastr.warning('Please select a destination storage level');
                return;
            }
            $(document).off('keydown', handleCopyContextEscape);
            $overlay.removeClass('active');
            setTimeout(() => {
                $overlay.hide().empty();
            }, 300);
            resolve(selectedLevel);
        });
    });
}

// Use EXTENSION_NAME from carrot-state.js
const extensionName = EXTENSION_NAME;

// =============================================================================
// CARROT SHEET COMMAND SYSTEM 🥕
// Handles !fullsheet, !tagsheet, !quicksheet commands for character sheet injection
// =============================================================================

// Sheet command detection and processing - now using imported pendingSheetCommand from carrot-state

// Check if user message contains sheet commands
function detectSheetCommand(messageText) {
    if (!messageText || typeof messageText !== 'string') return null;
    
    const sheetCommands = [
        { command: '!fullsheet', type: 'fullsheet' },
        { command: '!tagsheet', type: 'tagsheet' },
        { command: '!quicksheet', type: 'quicksheet' },
        { command: '!memsheet', type: 'memsheet' },
        { command: '!updatesheet', type: 'updatesheet' },
        { command: '!physheet', type: 'physheet' }
    ];
    
    for (const { command, type } of sheetCommands) {
        const regex = new RegExp(`${command}\\s+(.+)`, 'i');
        const match = messageText.match(regex);
        if (match) {
            // Handle multiple character names separated by commas
            const characterNames = match[1].split(',').map(name => name.trim()).filter(name => name.length > 0);
            return {
                type: type,
                command: command,
                characterNames: characterNames,
                fullMatch: match[0]
            };
        }
    }
    
    return null;
}

// Process sheet command and generate appropriate injection
async function processSheetCommand(sheetData) {
    CarrotDebug.inject('processSheetCommand called with:', sheetData);

    const { type, entry } = sheetData;

    CarrotDebug.inject('Processing sheet command type:', type);

    CarrotDebug.inject('Processing sheet command', {
        type: type,
        entry: !!entry
    });
    
    // Create injection command
    const settings = extension_settings[extensionName];
    
    // Create simple, effective mandatory prompt without duplicating macro content
    const sheetTypeMap = {
        'fullsheet': 'FULLSHEET',
        'tagsheet': 'TAGSHEET',
        'quicksheet': 'QUICKSHEET',
        'memsheet': 'MEMSHEET',
        'updatesheet': 'UPDATESHEET',
        'physheet': 'PHYSSHEET'
    };

    // Get the appropriate injection template
    const templateCategoryMap = {
        'fullsheet': 'BunnyMo Fullsheet Injection',
        'tagsheet': 'BunnyMo Tagsheet Injection',
        'quicksheet': 'BunnyMo Quicksheet Injection',
        'memsheet': 'BunnyMo Memsheet Injection',
        'updatesheet': 'BunnyMo Updatesheet Injection',
        'physheet': 'BunnyMo Physsheet Injection'
    };
    
    const injectionTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory(templateCategoryMap[type]);
    
    let injectionText;
    let depth = 4; // Default depth
    let role = 'system'; // Default role
    
    if (injectionTemplate) {
        // Use custom template - no character name needed since ST handles the targeting
        injectionText = injectionTemplate.content;

        // Use template-specific depth and role settings
        // CRITICAL: Template depth property takes priority over legacy settings.inject_depth
        depth = injectionTemplate.depth !== undefined ? injectionTemplate.depth : (injectionTemplate.settings?.inject_depth || 4);
        role = injectionTemplate.role || 'system';

        CarrotDebug.inject('Using template settings:', {
            templateName: injectionTemplate.name,
            depth: depth,
            role: role,
            templateDepth: injectionTemplate.depth,
            legacyDepth: injectionTemplate.settings?.inject_depth
        });
    } else {
        // Fallback to default fancy format and global settings
        depth = settings.injectionDepth || 4;
        role = settings.injectionRole || 'system';

        injectionText = `🚨 **MANDATORY OOC OVERRIDE** 🚨

**SYSTEM DIRECTIVE:** A !${sheetTypeMap[type]} command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !${sheetTypeMap[type]} request as specified
• **PROVIDE** comprehensive character sheet information
• **RESUME** normal roleplay only after completing this request

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`;

        CarrotDebug.inject('Using fallback settings:', {
            depth: depth,
            role: role
        });
    }
    
    const injectionCommand = `/inject id=carrot-sheet-${type} position=chat ephemeral=true scan=true depth=${depth} role=${role} ${injectionText}`;
    
    CarrotDebug.inject('Executing sheet injection command', {
        command: injectionCommand.substring(0, 100) + '...',
        type: type,
        promptLength: injectionText.length
    });
    
    try {
        await executeSlashCommandsWithOptions(injectionCommand, { displayCommand: false, showOutput: false });
        
        CarrotDebug.inject('✅ Sheet injection executed successfully', {
            type: type,
            injectionSize: injectionText.length
        });
        
        return true;
    } catch (error) {
        CarrotDebug.error('❌ Sheet injection failed', {
            error: error,
            type: type
        });
        return false;
    }
}

// =============================================================================
// SHEET GENERATION & TEMPLATE SYSTEM 🥕
// Now loaded from ./sheet-generator.js
// Includes: generateFullSheet, generateTagSheet, generateQuickSheet, CarrotTemplateManager
// =============================================================================

// =============================================================================
// CARROT PACK MANAGER SYSTEM 🥕
// Auto-sync BunnyMo packs from GitHub repository
// Now loaded from ./pack-manager.js and ./github-browser.js
// =============================================================================

// =============================================================================
// CARROT CONTEXT & STORAGE MANAGEMENT SYSTEM 🥕
// Now loaded from ./context-manager.js
// =============================================================================

// Global instances
let CarrotContext = null;
let CarrotStorage = null;

// =============================================================================
// CARROT DEBUG MODULE 🥕
// Now loaded from ./debugger.js
// =============================================================================

// Initialize debugger (sets up window.CarrotDebug and window.cd)
initializeDebugger();

// =============================================================================
// END CARROT DEBUG MODULE 🥕
// =============================================================================

// ✅ FIXED: All core data structures now imported from carrot-state.js
// This eliminates circular dependencies and provides single source of truth
// See carrot-state.js for:
// - selectedLorebooks, characterRepoBooks, tagLibraries
// - scannedCharacters
// - lastInjectedCharacters
// - currentRepoView, selectedCharacter, selectedRepository
// - _packManagerOpening
// - pendingSheetCommand, lastProcessedMessage, pendingThinkingBlockData

// Initialize UI updates module with data collections
initializeUIUpdates(scannedCharacters, selectedLorebooks, characterRepoBooks);

// Initialize tutorials system
initializeTutorials();

// Update status panels after a short delay to ensure DOM is ready
setTimeout(() => {
    updateStatusPanels();
}, 500);

// Debug functionality now handled by CarrotDebug module

// Default settings
const defaultSettings = {
    enabled: true,
    selectedLorebooks: [],
    characterRepoBooks: [],
    tagLibraries: [],
    displayMode: 'thinking', // 'none', 'thinking', 'cards'
    autoExpand: false,
    sendToAI: true,
    injectionRole: 'system',
    injectionDepth: 4,
    maxCharactersDisplay: 6,  // Max characters shown in chat
    maxCharactersInject: 6,   // Max characters sent to AI
    debugMode: false,
    rag: {
        enabled: false,
        autoVectorize: true,
        debugMode: false,
        contextLevel: 'global',
        topK: 3,
        scoreThreshold: 0.15,
        queryContext: 3,
        chunkSize: 1000,
        chunkOverlap: 300,
        injectionDepth: 4,
        injectionRole: 'system',
        smartCrossReference: true,
        crosslinkThreshold: 0.25,
        keywordFallback: true,
        keywordFallbackPriority: false,
        keywordFallbackLimit: 2,
        simpleChunking: false,
        // Vectorization settings (matching ST's vectors extension)
        vectorSource: 'transformers',
        openaiModel: 'text-embedding-ada-002',
        cohereModel: 'embed-english-v3.0',
        googleModel: 'text-embedding-005',
        togetheraiModel: 'togethercomputer/m2-bert-80M-32k-retrieval',
        ollamaModel: 'mxbai-embed-large',
        ollamaKeep: false,
        vllmModel: '',
        webllmModel: '',
        useAltUrl: false,
        altUrl: '',
        // Custom collection names
        collectionNames: {},
        // Keyword matching
        caseSensitiveKeywords: false,
        // Disabled collections (don't query)
        disabledCollections: [],
    },
    babyBunnyMode: false,     // 🐰 Baby Bunny Mode - guided automation for sheet processing
    worldBookTrackerEnabled: true,  // WorldBook Tracker toggle
    autoRescanOnChatLoad: true,  // Auto-rescan character repos on chat switch
    bunnymoTagWrapping: false,  // Wrap worldbook entries with <BunnymoTags:Entry_Name> when triggered
    excludeTagSynthesis: false   // Exclude TAG SYNTHESIS / BunnymoTags block at end of fullsheet from chunking
};

// Debug logging function - now uses centralized CarrotDebug module
function logSeq(message) {
    CarrotDebug.init(message);
}

// Initialize extension settings
function initializeSettings() {
    // CRITICAL: Check if settings exist and are valid
    // Use strict checks to handle edge cases (null, undefined, etc.)
    const settingsExist = extension_settings.hasOwnProperty(extensionName) &&
                          extension_settings[extensionName] !== null &&
                          typeof extension_settings[extensionName] === 'object';

    if (!settingsExist) {
        // Initialization is silent - no logs needed
        extension_settings[extensionName] = { ...defaultSettings };
    } else {
        // Loading existing settings - silent
    }

    // Note: We no longer auto-reset templates to preserve user modifications

    // Ensure all default properties exist (safe merge - preserves user values)
    Object.keys(defaultSettings).forEach(key => {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    });
    
    // Restore lorebook sets from settings, but only include lorebooks that actually exist
    selectedLorebooks.clear();
    const availableLorebooks = world_names || [];
    const invalidSelectedBooks = [];

    if (extension_settings[extensionName].selectedLorebooks) {
        extension_settings[extensionName].selectedLorebooks.forEach(book => {
            // Only add if the lorebook actually exists
            if (availableLorebooks.includes(book)) {
                selectedLorebooks.add(book);
            } else {
                invalidSelectedBooks.push(book);
            }
        });
    }

    characterRepoBooks.clear();
    tagLibraries.clear();
    const invalidCharRepos = [];
    const invalidTagLibs = [];

    if (extension_settings[extensionName].characterRepoBooks) {
        extension_settings[extensionName].characterRepoBooks.forEach(book => {
            // Only add if the lorebook actually exists (selection status doesn't matter)
            if (availableLorebooks.includes(book)) {
                characterRepoBooks.add(book);
            } else {
                invalidCharRepos.push(book);
            }
        });
    }

    if (extension_settings[extensionName].tagLibraries) {
        extension_settings[extensionName].tagLibraries.forEach(book => {
            // Only add if the lorebook actually exists (selection status doesn't matter)
            if (availableLorebooks.includes(book)) {
                tagLibraries.add(book);
            } else {
                invalidTagLibs.push(book);
            }
        });
    }

    // After loading tag libraries, wrap them if bunnymoTagWrapping is enabled
    // (deferred to avoid blocking initialization)
    if (extension_settings[extensionName].bunnymoTagWrapping && tagLibraries.size > 0) {
        setTimeout(() => {
            wrapExistingTagLibraries();
        }, 1000);
    }

    // Log cleanup if any invalid entries were found
    const totalCleaned = invalidSelectedBooks.length + invalidCharRepos.length + invalidTagLibs.length;
    if (totalCleaned > 0) {
        CarrotDebug.scan('Cleaned up lorebooks that no longer exist:', {
            invalidSelectedBooks,
            invalidCharRepos,
            invalidTagLibs
        });

        // Also remove any characters from deleted repos
        const charsToRemove = [];
        scannedCharacters.forEach((char, name) => {
            if (invalidCharRepos.includes(char.source)) {
                charsToRemove.push(name);
            }
        });
        charsToRemove.forEach(name => scannedCharacters.delete(name));

        // Save cleaned settings
        extension_settings[extensionName].selectedLorebooks = Array.from(selectedLorebooks);
        extension_settings[extensionName].characterRepoBooks = Array.from(characterRepoBooks);
        extension_settings[extensionName].tagLibraries = Array.from(tagLibraries);
        saveSettingsDebounced();
    }

    CarrotDebug.repo('Settings loaded', {
        selectedLorebooks: selectedLorebooks.size,
        characterRepos: characterRepoBooks.size,
        cleanedInvalidBooks: totalCleaned
    });
}

// Save settings to extension storage
function saveSettings() {
    extension_settings[extensionName].selectedLorebooks = Array.from(selectedLorebooks);
    extension_settings[extensionName].characterRepoBooks = Array.from(characterRepoBooks);
    extension_settings[extensionName].tagLibraries = Array.from(tagLibraries);
    saveSettingsDebounced();
}

// Parse BunnymoTags blocks from lorebook entries
// Only called for Character Repos, not Tag Libraries
function extractBunnyMoCharacters(entry, lorebookName) {
    const characters = [];
    const content = entry.content || '';
    const entryKey = entry.key || entry.keys || entry.comment || 'unknown';

    // Look for <BunnymoTags> blocks (character sheets)
    const bunnyMoMatches = content.match(/<BunnymoTags>(.*?)<\/BunnymoTags>/gs);

    if (!bunnyMoMatches) {
        // No BunnymoTags block - silently skip, this entry is for other purposes
        return characters;
    }

    bunnyMoMatches.forEach((match, index) => {
        const tagContent = match.replace(/<\/?BunnymoTags>/g, '');
        const result = parseBunnyMoTagBlock(tagContent, lorebookName, entryKey);

        if (result.success) {
            characters.push(result.character);
        } else {
            // Log parsing failure with specific reason
            CarrotDebug.repo(`⏭️ Skipped entry "${entryKey}" in ${lorebookName}: ${result.reason}`);
        }
    });

    return characters;
}

// Parse individual BunnymoTags block (copied from BunnyMoTags and enhanced)
// Returns: { success: boolean, character?: object, reason?: string }
function parseBunnyMoTagBlock(tagContent, lorebookName, entryKey = 'unknown') {
    // Extract ALL <TAG:VALUE> patterns using regex, regardless of nesting or prose
    // This will extract GENRE and LING tags from within <Genre> and <Linguistics> blocks
    const tagPattern = /<([^:>]+):([^>]+)>/g;
    const matches = [...tagContent.matchAll(tagPattern)];

    // Check if block has any tags at all
    if (matches.length === 0) {
        return {
            success: false,
            reason: 'BunnymoTags block contains no valid <TAG:VALUE> patterns'
        };
    }

    let characterName = null;
    const tagMap = new Map();

    matches.forEach(match => {
        const [, tagType, tagValue] = match;
        const cleanType = tagType.trim().toUpperCase();
        const cleanValue = tagValue.trim().toUpperCase().replace(/_/g, ' ');

        if (cleanType === 'NAME') {
            characterName = cleanValue.replace(/_/g, ' ');
        } else {
            // Normalize category names
            let categoryKey = cleanType;

            // Map variations to standard names
            if (cleanType === 'DERE') categoryKey = 'DERE';
            else if (cleanType === 'LINGUISTIC' || cleanType === 'LINGUISTICS') categoryKey = 'LING';

            if (!tagMap.has(categoryKey)) {
                tagMap.set(categoryKey, new Set());
            }
            tagMap.get(categoryKey).add(cleanValue);
        }
    });

    // Validation: Must have Name tag
    if (!characterName) {
        return {
            success: false,
            reason: `BunnymoTags block missing required <Name:CHARACTER_NAME> tag (found ${matches.length} other tags)`
        };
    }

    // Validation: Must have at least one tag besides Name
    if (tagMap.size === 0) {
        return {
            success: false,
            reason: `BunnymoTags block for "${characterName}" has no character tags (only Name tag found)`
        };
    }

    return {
        success: true,
        character: {
            name: characterName,
            tags: tagMap,
            source: lorebookName
        }
    };
}

// =============================================================================
// BUNNYMO TAG WRAPPING - File-level lorebook modification
// =============================================================================

/**
 * Create a backup of a lorebook before modification
 */
async function backupLorebook(lorebookName) {
    try {
        const backupName = `${lorebookName}.carrot_backup`;

        // Check if backup already exists
        if (world_names.includes(backupName)) {
            CarrotDebug.scan(`Backup already exists for ${lorebookName}, skipping`);
            return true;
        }

        const lorebook = await loadWorldInfo(lorebookName);
        if (!lorebook) {
            CarrotDebug.error(`Cannot backup lorebook: ${lorebookName} not found`);
            return false;
        }

        await saveWorldInfo(backupName, lorebook, true);
        CarrotDebug.repo(`✅ Backed up lorebook: ${lorebookName} → ${backupName}`);
        return true;
    } catch (error) {
        CarrotDebug.error(`Failed to backup lorebook ${lorebookName}:`, error);
        return false;
    }
}

/**
 * Automatically wrap existing tag libraries on load (if not already wrapped)
 */
async function wrapExistingTagLibraries() {
    if (!extension_settings[extensionName].bunnymoTagWrapping) {
        return;
    }

    const tagLibsList = Array.from(tagLibraries);
    if (tagLibsList.length === 0) {
        return;
    }

    CarrotDebug.repo(`🔄 Checking ${tagLibsList.length} tag libraries for wrapping...`);

    for (const lorebookName of tagLibsList) {
        try {
            // Load the lorebook to check if it needs wrapping
            const lorebook = await loadWorldInfo(lorebookName);
            if (!lorebook) {
                continue;
            }

            // Get entries
            let entries = [];
            if (Array.isArray(lorebook.entries)) {
                entries = lorebook.entries;
            } else if (lorebook.entries && typeof lorebook.entries === 'object') {
                entries = Object.values(lorebook.entries);
            }

            if (entries.length === 0) {
                continue;
            }

            // Check if any entry needs wrapping
            let needsWrapping = false;
            for (const entry of entries) {
                if (!entry.content || !entry.content.trim()) {
                    continue;
                }

                const entryName = (entry.comment || entry.key?.[0] || 'Entry').replace(/[<>]/g, '');
                const expectedWrapper = `<BunnymoTags:${entryName}>`;

                // If any entry is not wrapped, the lorebook needs wrapping
                if (!entry.content.trim().startsWith(expectedWrapper)) {
                    needsWrapping = true;
                    break;
                }
            }

            // Wrap if needed
            if (needsWrapping) {
                CarrotDebug.repo(`📦 Wrapping tag library: ${lorebookName}`);
                await wrapLorebookEntries(lorebookName);
            } else {
                CarrotDebug.scan(`✓ Tag library already wrapped: ${lorebookName}`);
            }
        } catch (error) {
            CarrotDebug.error(`Failed to check/wrap ${lorebookName}:`, error);
        }
    }

    CarrotDebug.repo(`✅ Finished checking tag libraries for wrapping`);
}

/**
 * Wrap all entries in a tag library with BunnymoTags
 */
export async function wrapLorebookEntries(lorebookName) {
    try {
        // Create backup first
        const backed = await backupLorebook(lorebookName);
        if (!backed) {
            toastr.error(`Failed to backup ${lorebookName}. Wrapping cancelled.`);
            return false;
        }

        // Load the lorebook
        const lorebook = await loadWorldInfo(lorebookName);
        if (!lorebook) {
            CarrotDebug.error(`Cannot wrap entries: ${lorebookName} not found`);
            return false;
        }

        // ST's worldbook structure: .entries can be array OR object with numeric keys
        let entries = [];
        if (Array.isArray(lorebook.entries)) {
            entries = lorebook.entries;
        } else if (lorebook.entries && typeof lorebook.entries === 'object') {
            // Convert object with numeric keys to array
            entries = Object.values(lorebook.entries);
        }

        if (entries.length === 0) {
            CarrotDebug.error(`Cannot wrap entries: ${lorebookName} has no entries`, {
                lorebookKeys: Object.keys(lorebook),
                entriesType: typeof lorebook.entries,
                isArray: Array.isArray(lorebook.entries)
            });
            return false;
        }

        let wrappedCount = 0;
        let skippedCount = 0;

        // Wrap each entry
        for (const entry of entries) {
            if (!entry.content || !entry.content.trim()) {
                skippedCount++;
                continue;
            }

            const entryName = (entry.comment || entry.key?.[0] || 'Entry').replace(/[<>]/g, '');
            const expectedWrapper = `<BunnymoTags:${entryName}>`;

            // Check if already wrapped with this exact wrapper
            if (entry.content.trim().startsWith(expectedWrapper)) {
                CarrotDebug.scan(`Entry "${entryName}" already wrapped, skipping`);
                skippedCount++;
                continue;
            }

            // Wrap the content
            entry.content = `<BunnymoTags:${entryName}>\n${entry.content}\n</BunnymoTags:${entryName}>`;
            wrappedCount++;
        }

        // Save the modified lorebook
        await saveWorldInfo(lorebookName, lorebook, true);

        CarrotDebug.repo(`🏷️ Wrapped ${wrappedCount} entries in ${lorebookName} (${skippedCount} skipped)`);
        toastr.success(`Wrapped ${wrappedCount} entries in ${lorebookName}`);

        // Reload worldbook list to reflect changes
        await updateWorldInfoList();

        return true;
    } catch (error) {
        CarrotDebug.error(`Failed to wrap lorebook ${lorebookName}:`, error);
        toastr.error(`Failed to wrap ${lorebookName}: ${error.message}`);
        return false;
    }
}

/**
 * Unwrap all entries in a tag library (remove BunnymoTags)
 */
export async function unwrapLorebookEntries(lorebookName) {
    try {
        // Create backup first
        const backed = await backupLorebook(lorebookName);
        if (!backed) {
            toastr.error(`Failed to backup ${lorebookName}. Unwrapping cancelled.`);
            return false;
        }

        // Load the lorebook
        const lorebook = await loadWorldInfo(lorebookName);
        if (!lorebook) {
            CarrotDebug.error(`Cannot unwrap entries: ${lorebookName} not found`);
            return false;
        }

        // ST's worldbook structure: .entries can be array OR object with numeric keys
        let entries = [];
        if (Array.isArray(lorebook.entries)) {
            entries = lorebook.entries;
        } else if (lorebook.entries && typeof lorebook.entries === 'object') {
            // Convert object with numeric keys to array
            entries = Object.values(lorebook.entries);
        }

        if (entries.length === 0) {
            CarrotDebug.error(`Cannot unwrap entries: ${lorebookName} has no entries`, {
                lorebookKeys: Object.keys(lorebook),
                entriesType: typeof lorebook.entries,
                isArray: Array.isArray(lorebook.entries)
            });
            return false;
        }

        let unwrappedCount = 0;
        let skippedCount = 0;

        // Unwrap each entry
        for (const entry of entries) {
            if (!entry.content || !entry.content.trim()) {
                skippedCount++;
                continue;
            }

            const entryName = (entry.comment || entry.key?.[0] || 'Entry').replace(/[<>]/g, '');
            const expectedWrapper = `<BunnymoTags:${entryName}>`;
            const expectedClosing = `</BunnymoTags:${entryName}>`;

            // Check if wrapped with this exact wrapper
            const trimmedContent = entry.content.trim();
            if (trimmedContent.startsWith(expectedWrapper) && trimmedContent.endsWith(expectedClosing)) {
                // Remove the wrapper
                let unwrapped = entry.content.replace(expectedWrapper, '').replace(expectedClosing, '');
                // Trim excess newlines that were added during wrapping
                unwrapped = unwrapped.replace(/^\n+/, '').replace(/\n+$/, '');
                entry.content = unwrapped;
                unwrappedCount++;
            } else {
                CarrotDebug.scan(`Entry "${entryName}" not wrapped or has different wrapper, skipping`);
                skippedCount++;
            }
        }

        // Save the modified lorebook
        await saveWorldInfo(lorebookName, lorebook, true);

        CarrotDebug.repo(`🏷️ Unwrapped ${unwrappedCount} entries in ${lorebookName} (${skippedCount} skipped)`);
        toastr.success(`Unwrapped ${unwrappedCount} entries in ${lorebookName}`);

        // Reload worldbook list to reflect changes
        await updateWorldInfoList();

        return true;
    } catch (error) {
        CarrotDebug.error(`Failed to unwrap lorebook ${lorebookName}:`, error);
        toastr.error(`Failed to unwrap ${lorebookName}: ${error.message}`);
        return false;
    }
}

// Scan selected lorebooks for character data
// Loads ALL characters from connected Character Repos
// Context is handled by Lorebook Connector (which lorebooks are connected to which characters)
async function scanSelectedLorebooks(lorebookNames) {
    // ALWAYS clear scannedCharacters to prevent stale data
    // This matches main branch behavior and ensures consistent results
    scannedCharacters.clear();

    const foundCharacters = [];
    let characterReposScanned = 0;
    let tagLibrariesScanned = 0;

    CarrotDebug.scan(`Scanning ${lorebookNames.length} lorebooks`, {
        lorebooks: lorebookNames,
        characterRepos: Array.from(characterRepoBooks)
    });
    CarrotDebug.startTimer('lorebook-scan', 'SCAN');

    for (const lorebookName of lorebookNames) {
        const isMarkedAsCharacterRepo = characterRepoBooks.has(lorebookName);
        const isMarkedAsTagLibrary = tagLibraries.has(lorebookName);

        try {
            const lorebook = await loadWorldInfo(lorebookName);
            if (!lorebook || !lorebook.entries) {
                CarrotDebug.error(`Failed to load lorebook: ${lorebookName}`);
                continue;
            }

            // ONLY scan Character Repos for character data
            // Tag Libraries contain tags/traits, not character sheets
            if (!isMarkedAsCharacterRepo) {
                if (isMarkedAsTagLibrary) {
                    tagLibrariesScanned++;
                    CarrotDebug.lorebook(lorebookName, 'tag-library', lorebook.entries?.length || 0);
                }
                continue;
            }

            // Extract character data from BunnymoTags blocks in Character Repos only
            let foundCharactersInThisBook = false;

            Object.values(lorebook.entries).forEach(entry => {
                // Skip disabled entries (silent - no logging needed)
                if (entry.disable) {
                    return;
                }

                const characters = extractBunnyMoCharacters(entry, lorebookName);
                characters.forEach(char => {
                    // Load ALL characters from Character Repos - no filtering
                    // If it's in a Character Repo, it's a valid character
                    const cacheKey = `${lorebookName}::${char.name}`;
                    if (!scannedCharacters.has(cacheKey)) {
                        scannedCharacters.set(cacheKey, char);
                        foundCharacters.push(char.name);
                        foundCharactersInThisBook = true;
                        CarrotDebug.repo(`✅ Loaded character: ${char.name} from ${lorebookName}`, { cacheKey });
                    }
                });
            });

            // Categorize lorebook based on what we found
            if (foundCharactersInThisBook) {
                characterReposScanned++;
                const repoType = isMarkedAsCharacterRepo ? 'character-repo (marked)' : 'character-repo (auto-detected)';
                CarrotDebug.lorebook(lorebookName, repoType, lorebook.entries.length);
            } else if (isMarkedAsTagLibrary) {
                tagLibrariesScanned++;
                CarrotDebug.lorebook(lorebookName, 'tag-library', lorebook.entries.length);
            } else {
                // No character data found and not marked as anything
                CarrotDebug.lorebook(lorebookName, 'no-character-data', lorebook.entries.length);
            }
        } catch (error) {
            CarrotDebug.error(`Error scanning lorebook: ${lorebookName}`, error);
        }
    }

    CarrotDebug.endTimer('lorebook-scan', 'SCAN');

    const scanResults = {
        success: true,
        characters: foundCharacters,
        characterCount: foundCharacters.length,
        characterRepos: characterReposScanned,
        tagLibraries: tagLibrariesScanned,
        totalInMap: scannedCharacters.size
    };

    CarrotDebug.scan('Scan completed successfully', scanResults);

    return scanResults;
}

// ============================================================================
// CHARACTER LOOKUP UTILITIES
// ============================================================================

// Validate if a name is a valid character name (not lorebook metadata)
function isValidCharacterName(name) {
    if (!name || typeof name !== 'string') return false;

    // Exclude common lorebook metadata patterns
    const invalidPatterns = [
        /library/i,
        /auto-trigger/i,
        /anti.?clanker/i,
        /anti.?slop/i,
        /lambda/i,
        /mock.?benchmark/i,
        /ai.?representation/i,
        /generated.?by.?baby.?bunny/i,
        /character.?archive/i,
        /^master\s*-\s*/i, // "Master - Something" pattern
        /\.json$/i,
        /\.lorebook$/i,
    ];

    // Check if name matches any invalid pattern
    for (const pattern of invalidPatterns) {
        if (pattern.test(name)) {
            CarrotDebug.ui(`🚫 Filtered out non-character name: "${name}"`);
            return false;
        }
    }

    return true;
}

// Flexible character name matching to handle variations in character names
// Now supports composite keys (lorebook::charactername)
function findCharacterByName(searchName, lorebookName = null, silent = false) {
    if (!searchName) return null;

    // If we have a lorebook name, try exact composite key match first
    if (lorebookName) {
        const compositeKey = `${lorebookName}::${searchName}`;
        if (scannedCharacters.has(compositeKey)) {
            const charData = scannedCharacters.get(compositeKey);
            return { name: charData.name || searchName, data: charData };
        }
    }

    // Generate possible name variations for flexible matching
    const possibleNames = [
        searchName,
        searchName.toLowerCase(),
        searchName.toUpperCase(),
        searchName.trim(),
        searchName.replace(/'/g, "'"), // Straight to curly apostrophe
        searchName.replace(/'/g, "'"), // Curly to straight apostrophe
        searchName.replace(/[^\w\s]/g, ''), // Remove special chars
        searchName.replace(/\s+/g, ' '), // Normalize whitespace
        searchName.replace(/\s+/g, '_'), // Replace spaces with underscores
        searchName.replace(/\s+/g, '-'), // Replace spaces with dashes
        searchName.replace(/[^a-zA-Z0-9\s]/g, ''), // Remove all non-alphanumeric except spaces
    ];

    // Check each available character against all possible variations
    // Now keys are composite (lorebook::name), so extract the character name
    for (const [cacheKey, charData] of scannedCharacters.entries()) {
        // Extract character name from composite key
        const characterName = charData.name || cacheKey.split('::')[1] || cacheKey;

        // Check if any variation of search name matches any variation of stored name
        const storedVariations = [
            characterName,
            characterName.toLowerCase(),
            characterName.toUpperCase(),
            characterName.trim(),
            characterName.replace(/'/g, "'"),
            characterName.replace(/'/g, "'"),
            characterName.replace(/[^\w\s]/g, ''),
            characterName.replace(/\s+/g, ' '),
            characterName.replace(/\s+/g, '_'),
            characterName.replace(/\s+/g, '-'),
            characterName.replace(/[^a-zA-Z0-9\s]/g, ''),
        ];

        // Check for any match between search variations and stored variations
        for (const searchVar of possibleNames) {
            for (const storedVar of storedVariations) {
                if (searchVar === storedVar) {
                    CarrotDebug.ui(`✅ Found character match: "${searchName}" -> "${characterName}" (${cacheKey})`);
                    return { name: characterName, data: charData };
                }
            }
        }
    }

    // No match found - log as debug info, not error (could be old/invalid data)
    if (!silent) {
        CarrotDebug.ui(`ℹ️  Character not found in current scan: "${searchName}"`, {
            availableCharacters: Array.from(scannedCharacters.entries()).map(([key, data]) =>
                data.name || key.split('::')[1] || key
            ),
            searchVariations: possibleNames
        });
    }

    return null;
}

// ============================================================================
// CHARACTER DATA INJECTION SYSTEM
// ============================================================================
// Uses SillyTavern's /inject command for proper AI context integration

// Inject character data into AI context using /inject command
async function injectCharacterData(activeCharacters) {
    const settings = extension_settings[extensionName];
    
    CarrotDebug.startTimer('injection-process', 'INJECT');
    CarrotDebug.inject('Starting AI injection process', {
        activeCharacters: activeCharacters,
        sendToAI: settings.sendToAI,
        maxCharactersDisplay: settings.maxCharactersDisplay,
        injectionDepth: settings.injectionDepth,
        injectionRole: settings.injectionRole
    });
    
    if (!settings.sendToAI || activeCharacters.length === 0) {
        CarrotDebug.inject('AI injection skipped', {
            reason: !settings.sendToAI ? 'disabled' : 'no active characters',
            sendToAI: settings.sendToAI,
            characterCount: activeCharacters.length
        });
        return null;
    }
    
    // IMPORTANT: Limit characters based on maxCharactersDisplay setting
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersDisplay);
    const charactersToInject = activeCharacters.slice(0, maxChars);
    
    CarrotDebug.inject('Characters limited for injection', {
        totalDetected: activeCharacters.length,
        maxAllowed: settings.maxCharactersDisplay,
        willInject: charactersToInject.length,
        skipped: activeCharacters.length - charactersToInject.length
    });
    
    // Build character data for injection using template system
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('Character Data Injection');
    let injectionText = '';
    let processedCharacters = 0;
    let totalTags = 0;
    
    if (currentTemplate) {
        CarrotDebug.inject('Using template for injection', {
            templateName: currentTemplate.name,
            templateVariables: Object.keys(currentTemplate.variables || {}),
            injectionPosition: currentTemplate.injection?.position || 'default',
            injectionDepth: currentTemplate.injection?.depth || 4
        });
        
        // Process each character through the template
        const characterDataArray = [];
        charactersToInject.forEach(charName => {
            const charResult = findCharacterByName(charName);
            if (charResult && charResult.data) {
                const charData = charResult.data;
                const actualCharName = charResult.name;
                processedCharacters++;
                
                // Count total tags for debugging
                for (const [category, values] of charData.tags) {
                    totalTags += Array.from(values).length;
                }
                
                // Prepare character data for template processing
                const templateData = {
                    name: charName,
                    tags: charData.tags
                };
                
                characterDataArray.push(templateData);
            }
        });
        
        // For multiple characters, process each one
        if (characterDataArray.length > 0) {
            if (characterDataArray.length === 1) {
                // Single character - process directly
                injectionText = await CarrotTemplateManager.processTemplate(currentTemplate, characterDataArray[0]);
            } else {
                // Multiple characters - pass array directly to new template system
                injectionText = await CarrotTemplateManager.processTemplate(currentTemplate, characterDataArray);
            }
        }

        // Ensure injectionText is a string (template might return array/object)
        if (typeof injectionText !== 'string') {
            if (Array.isArray(injectionText)) {
                injectionText = injectionText.join('\n');
            } else if (injectionText && typeof injectionText === 'object') {
                injectionText = JSON.stringify(injectionText, null, 2);
            } else {
                injectionText = String(injectionText || '');
            }
            CarrotDebug.inject('⚠️ Template returned non-string, converted to string', {
                originalType: typeof injectionText,
                isArray: Array.isArray(injectionText)
            });
        }
    } else {
        // Fallback to original format if no template (silently)
        injectionText = '[Character Consistency Data]\n\n';
        
        charactersToInject.forEach(charName => {
            const charResult = findCharacterByName(charName);
            if (charResult && charResult.data) {
                const charData = charResult.data;
                const actualCharName = charResult.name;
                processedCharacters++;
                injectionText += `${charName}:\n`;
                for (const [category, values] of charData.tags) {
                    const valuesArray = Array.from(values);
                    injectionText += `• ${category}: ${valuesArray.join(', ')}\n`;
                    totalTags += valuesArray.length;
                }
                injectionText += '\n';
            }
        });
    }
    
    CarrotDebug.inject('Injection data built', {
        processedCharacters: processedCharacters,
        totalTags: totalTags,
        injectionSize: injectionText.length,
        preview: injectionText.substring(0, 200) + '...'
    });

    // Use template-specific depth and role if available, otherwise fall back to global settings
    // CRITICAL: Template settings should override global settings for depth and role
    const depth = currentTemplate?.depth !== undefined ? currentTemplate.depth : settings.injectionDepth;
    const role = currentTemplate?.role || settings.injectionRole;
    const injectionCommand = `/inject id=carrot-consistency position=chat ephemeral=true scan=true depth=${depth} role=${role} ${injectionText}`;

    CarrotDebug.inject('Executing injection command', {
        command: injectionCommand.substring(0, 100) + '...',
        fullCommand: injectionCommand,
        depth: depth,
        role: role,
        templateDepth: currentTemplate?.depth,
        globalDepth: settings.injectionDepth,
        usingTemplateDepth: currentTemplate?.depth !== undefined,
        ephemeral: true,
        position: 'chat',
        scan: true
    });
    
    try {
        const context = getContext();
        CarrotDebug.inject('SillyTavern context retrieved', {
            hasContext: !!context,
            contextType: typeof context
        });
        
        // Ensure executeSlashCommandsWithOptions is available
        if (typeof executeSlashCommandsWithOptions !== 'function') {
            throw new Error('executeSlashCommandsWithOptions function is not available. Check SillyTavern version compatibility.');
        }
        
        CarrotDebug.inject('Executing injection with proper newlines', {
            cleanText: injectionText,
            textLength: injectionText.length,
            containsNewlines: injectionText.includes('\n'),
            firstLine: injectionText.split('\n')[0]
        });
        
        await executeSlashCommandsWithOptions(injectionCommand, { displayCommand: false, showOutput: false });
        
        CarrotDebug.endTimer('injection-process', 'INJECT');
        CarrotDebug.inject('✅ Injection executed successfully', {
            injectedCharacters: charactersToInject,
            totalCharacters: activeCharacters.length,
            processedCharacters: processedCharacters,
            totalTags: totalTags,
            injectionSize: injectionText.length,
            command: 'executeSlashCommandsWithOptions'
        });
        
        // Track injected characters for persistence system
        setLastInjectedCharacters(charactersToInject);
        
        return charactersToInject;
    } catch (error) {
        CarrotDebug.endTimer('injection-process', 'INJECT');
        CarrotDebug.error('❌ AI injection failed', {
            error: error,
            injectionCommand: injectionCommand.substring(0, 200) + '...',
            fullCommand: injectionCommand,
            charactersAttempted: charactersToInject,
            errorMessage: error.message,
            errorStack: error.stack,
            functionAvailable: typeof executeSlashCommandsWithOptions,
            injectionTextPreview: injectionText.substring(0, 100) + '...'
        });
        return null;
    }
}

// Render character data as native SillyTavern-style reasoning block
function renderAsThinkingBox(activeCharacters) {
    CarrotDebug.startTimer('render-thinking-box', 'UI');

    console.log('🔍 renderAsThinkingBox called with:', activeCharacters);
    console.log('🔍 scannedCharacters Map keys:', Array.from(scannedCharacters.keys()));
    console.log('🔍 scannedCharacters Map size:', scannedCharacters.size);

    const settings = extension_settings[extensionName];
    const openAttr = settings.autoExpand ? 'open' : '';

    // Respect maxCharactersDisplay limit
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersDisplay);
    const charactersToShow = activeCharacters.slice(0, maxChars);

    // Create BunnyMoTags-style formatted content for the thinking block
    let content = '';
    let renderedCharacters = 0;

    charactersToShow.forEach(requestedKey => {
        console.log(`🔍 Looking up character by key: "${requestedKey}"`);

        // Try multiple matching strategies for backwards compatibility:
        // 1. Exact composite key match (lorebook::charactername)
        // 2. Case-insensitive composite key match
        // 3. Partial match on character name only (for old data without lorebook prefix)
        let charData = scannedCharacters.get(requestedKey);
        let matchedKey = requestedKey;

        if (!charData) {
            // Strategy 2: Case-insensitive composite key lookup
            const lowerKey = requestedKey.toLowerCase();
            for (const [key, data] of scannedCharacters.entries()) {
                if (key.toLowerCase() === lowerKey) {
                    charData = data;
                    matchedKey = key;
                    console.log(`🔍 Found via case-insensitive match: "${requestedKey}" → "${key}"`);
                    break;
                }
            }
        }

        if (!charData) {
            // Strategy 3: Match just the character name part (backwards compatibility)
            // If requestedKey doesn't have "::", try finding any key that ends with "::requestedKey"
            if (!requestedKey.includes('::')) {
                const lowerName = requestedKey.toLowerCase();
                for (const [key, data] of scannedCharacters.entries()) {
                    // Extract character name from composite key
                    const charName = key.split('::')[1] || key;
                    if (charName.toLowerCase() === lowerName) {
                        charData = data;
                        matchedKey = key;
                        console.log(`🔍 Found via character name match: "${requestedKey}" → "${key}"`);
                        break;
                    }
                }
            }
        }

        if (charData) {
            // Extract display name from matched key
            const displayName = charData.name || matchedKey.split('::')[1] || matchedKey;
            console.log(`🔍 Found character data for: "${displayName}" (matched via "${matchedKey}")`);

            const actualCharName = displayName;
            renderedCharacters++;
            
            // Add collapsible character section with simple HTML details/summary
            content += `<details open style="margin-bottom: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 8px; display: block;">`;
            content += `<summary style="cursor: pointer !important; font-weight: bold !important; color: var(--SmartThemeBodyColor) !important; font-size: 1.1em !important; text-shadow: 0 0 8px currentColor !important; margin-bottom: 8px !important; list-style: none !important; display: list-item !important; list-style-type: none !important;">🏷️ ${actualCharName}</summary>`;
            content += `<div class="character-tags-content" style="display: block;">`;

            // Check if tags is a Map or needs conversion
            let tagsToProcess = charData.tags;
            if (!(tagsToProcess instanceof Map)) {
                // Convert object to Map if needed
                CarrotDebug.ui(`🔧 Converting tags object to Map for ${actualCharName}`);
                tagsToProcess = new Map(Object.entries(tagsToProcess || {}));
            }
            
            // Create BunnyMoTags-style grouped sections (EXACT copy of BunnyMoTags grouping)
            const groupedSections = createBunnyMoTagsStyleSections(tagsToProcess);
            content += groupedSections;

            content += `</div></details>`;
        } else {
            // Character not found - log detailed error to debugger only
            CarrotDebug.error(`❌ Missing character data for display: ${requestedKey}`, {
                availableCharacters: Array.from(scannedCharacters.keys()),
                lookedFor: requestedKey,
                scannedSize: scannedCharacters.size,
                allRequestedCharacters: charactersToShow,
                hasCompositeKeyFormat: requestedKey.includes('::')
            });
            // Silently skip - don't show error to user
        }
    });

    console.log(`🔍 Rendered ${renderedCharacters} characters out of ${charactersToShow.length} requested`);
    console.log(`🔍 Content length: ${content.length}`);

    if (!content) {
        console.error('❌ NO CONTENT GENERATED - returning error message');

        // Generate specific error message based on what went wrong
        let errorReason = '';
        if (activeCharacters.length === 0) {
            errorReason = 'No characters were requested for display.';
        } else if (scannedCharacters.size === 0) {
            errorReason = `Requested ${activeCharacters.length} character(s) but no characters are loaded in memory. Character repos may not be marked or scanned yet.`;
        } else if (renderedCharacters === 0) {
            errorReason = `Requested characters "${activeCharacters.join('", "')}" but none were found in loaded characters. Available: ${Array.from(scannedCharacters.keys()).join(', ')}`;
        } else {
            errorReason = 'Character data was found but failed to render.';
        }

        content = `<em style="color: var(--SmartThemeQuoteColor); opacity: 0.7;">⚠️ ${errorReason}</em>`;

        CarrotDebug.error('⚠️ No character content - showing error message', {
            reason: errorReason,
            requestedCharacters: activeCharacters,
            requestedCount: activeCharacters.length,
            scannedCharactersKeys: Array.from(scannedCharacters.keys()),
            scannedSize: scannedCharacters.size,
            renderedCount: renderedCharacters
        });
    }
    
    // Show truncation indicator if needed
    const truncationNote = maxChars < activeCharacters.length ? 
        `<div style="color: var(--SmartThemeQuoteColor); font-size: 0.85em; opacity: 0.8; margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">📊 Showing ${maxChars} of ${activeCharacters.length} characters</div>` : '';
    
    // Use SillyTavern's exact native structure for reasoning blocks (match native appearance exactly)
    const finalHTML = `
        <details class="carrot-thinking-details" data-state="done" data-type="carrot-thinking" ${openAttr}>
            <summary class="carrot-thinking-summary flex-container">
                <div class="carrot-thinking-header-block flex-container">
                    <div class="carrot-thinking-header flex-container">
                        <span class="carrot-thinking-header-title" style="color: var(--SmartThemeQuoteColor);">🥕 BunnyMoTags</span>
                        <div class="carrot-thinking-arrow fa-solid fa-chevron-up"></div>
                    </div>
                </div>
            </summary>
            <div class="carrot-thinking-content">
                ${truncationNote}${content}
            </div>
        </details>
    `;
    
    CarrotDebug.endTimer('render-thinking-box', 'UI');
    CarrotDebug.ui('✅ ST-native thinking box HTML generated', {
        htmlLength: finalHTML.length,
        truncationNote: !!truncationNote,
        autoExpand: !!openAttr,
        charactersDisplayed: renderedCharacters
    });
    
    return finalHTML;
}

// Create BunnyMoTags-style grouped sections for thinking blocks (EXACT BunnyMoTags theming)
// 
// DOCUMENTATION: How to Add/Modify Categories
// ===========================================
// 1. To add a new tag category mapping, add it to the bunnyMoThemes object below
// 2. Each entry format: 'TAG_NAME': { color: '#hex', emoji: '🔥', section: 'Section Name' }
// 3. Add the section name to the sections object (line ~1011)
// 4. Add section styling to sectionStyles object (line ~1043)
// 5. Tags will automatically display as "TAG_NAME: VALUE" format
//
// Example: To add MOOD tags to a Psychology section:
//   'MOOD': { color: '#purple', emoji: '😊', section: 'Psychology' }
//
function createBunnyMoTagsStyleSections(tagsMap) {
    if (!tagsMap || tagsMap.size === 0) return '<em style="color: var(--SmartThemeQuoteColor); opacity: 0.7;">No tags available</em><br>';
    
    let sectionsHTML = '';
    
    // CATEGORY MAPPING: Define where each tag type goes and how it looks
    // FORMAT: 'TAG_PREFIX': { color: 'hex_color', emoji: 'unicode_emoji', section: 'Section_Name' }
    const bunnyMoThemes = {
        // Physical attributes
        'SPECIES': { color: '#ff6b6b', emoji: '🧬', section: 'Physical' },
        'GENDER': { color: '#4ecdc4', emoji: '⚧️', section: 'Physical' },
        'BUILD': { color: '#45b7d1', emoji: '💪', section: 'Physical' },
        'SKIN': { color: '#f39c12', emoji: '🎨', section: 'Physical' },
        'SKINCOLOR': { color: '#f39c12', emoji: '🎨', section: 'Physical' },
        'HAIR': { color: '#9b59b6', emoji: '💇', section: 'Physical' },
        'HAIRCOLOR': { color: '#9b59b6', emoji: '💇', section: 'Physical' },
        'EYECOLOR': { color: '#3498db', emoji: '👁️', section: 'Physical' },
        'AGE': { color: '#95a5a6', emoji: '📅', section: 'Physical' },
        'STYLE': { color: '#e67e22', emoji: '👔', section: 'Physical' },
        'FONT': { color: '#e91e63', emoji: '🖋️', section: 'Physical' },
        
        // Dere Types section (like BunnyMoTags)
        'DERE': { color: '#ff69b4', emoji: '💖', section: 'Dere Types' },
        
        // Core Traits section  
        'TRAIT': { color: '#2ecc71', emoji: '✨', section: 'Core Traits' },
        'CONFLICT': { color: '#e74c3c', emoji: '⚔️', section: 'Core Traits' },
        
        // Attachment & Social
        'ATTACHMENT': { color: '#3498db', emoji: '💙', section: 'Social Dynamics' },
        'BOUNDARIES': { color: '#95a5a6', emoji: '🚧', section: 'Social Dynamics' },
        'FLIRTING': { color: '#fd79a8', emoji: '😘', section: 'Social Dynamics' },
        
        // Intimate & Kinks section (like BunnyMoTags)
        'ORIENTATION': { color: '#6c5ce7', emoji: '🌈', section: 'Intimate & Kinks' },
        'KINK': { color: '#e84393', emoji: '🔥', section: 'Intimate & Kinks' },
        'CHEMISTRY': { color: '#00cec9', emoji: '⚗️', section: 'Intimate & Kinks' },
        'AROUSAL': { color: '#fd79a8', emoji: '💫', section: 'Intimate & Kinks' },
        'JEALOUSY': { color: '#00b894', emoji: '💚', section: 'Intimate & Kinks' },
        
        // MBTI Types section
        'ENTJ-U': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'ENTJ-A': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'INTJ-U': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'INTJ-A': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'ENTP-U': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'ENTP-A': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'INTP-U': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        'INTP-A': { color: '#8e44ad', emoji: '🧠', section: 'MBTI Types' },
        
        // Communication section
        'LING': { color: '#16a085', emoji: '💬', section: 'Communication' },
        
        // Psychology section
        'TRAUMA': { color: '#636e72', emoji: '💔', section: 'Psychology' },
        
        // Leadership section
        'POWER': { color: '#fdcb6e', emoji: '👑', section: 'Leadership' },
        
        // Other categories
        'NAME': { color: '#74b9ff', emoji: '👤', section: 'Identity' },
        'GENRE': { color: '#a29bfe', emoji: '📚', section: 'Identity' }
    };
    
    // SECTION LIST: All available sections (must match section names in bunnyMoThemes above)
    // ADD NEW SECTIONS HERE when adding new categories
    const sections = { 
        'Physical': [], 
        'Dere Types': [], 
        'Core Traits': [], 
        'Social Dynamics': [], 
        'Intimate & Kinks': [], 
        'MBTI Types': [],
        'Communication': [],
        'Psychology': [],
        'Leadership': [],
        'Identity': [],
        'Other': [] 
    };
    
    Array.from(tagsMap.entries()).forEach(([category, values]) => {
        const categoryUpper = category.toUpperCase();
        const theme = bunnyMoThemes[categoryUpper];
        const sectionName = theme?.section || 'Other';
        
        sections[sectionName].push({
            category: categoryUpper,
            values: Array.from(values),
            color: theme?.color || '#95a5a6',
            emoji: theme?.emoji || '📦'
        });
    });
    
    // Generate HTML for each section (exactly like BunnyMoTags screenshot)
    Object.entries(sections).forEach(([sectionName, sectionTags]) => {
        if (sectionTags.length === 0) return;
        
        // SECTION STYLING: Colors and emojis for section headers
        // ADD NEW SECTION STYLES HERE when adding new sections
        const sectionStyles = {
            'Physical': { color: '#ff6b6b', emoji: '🎯' },
            'Dere Types': { color: '#ff69b4', emoji: '💖' },
            'Core Traits': { color: '#2ecc71', emoji: '✨' },
            'Social Dynamics': { color: '#3498db', emoji: '🤝' },
            'Intimate & Kinks': { color: '#e84393', emoji: '🔥' },
            'MBTI Types': { color: '#8e44ad', emoji: '🧠' },
            'Communication': { color: '#16a085', emoji: '💬' },
            'Psychology': { color: '#636e72', emoji: '💔' },
            'Leadership': { color: '#fdcb6e', emoji: '👑' },
            'Identity': { color: '#74b9ff', emoji: '👤' },
            'Other': { color: '#95a5a6', emoji: '📦' }
        };
        
        const style = sectionStyles[sectionName] || sectionStyles['Other'];
        const sectionColor = style.color;
        const sectionEmoji = style.emoji;
        
        sectionsHTML += `<div style="margin: 12px 0;">`;
        sectionsHTML += `<strong style="color: ${sectionColor} !important; font-size: 1.1em !important; margin-left: 8px !important; text-shadow: 0 0 6px currentColor, 0 0 12px currentColor !important; font-weight: 700 !important; display: inline-block !important;">${sectionEmoji} ${sectionName}:</strong><br>`;
        
        sectionTags.forEach(tagGroup => {
            tagGroup.values.forEach((value, index) => {
                sectionsHTML += `<div style="margin: 4px 0 4px 16px;">`;
                sectionsHTML += `<span style="color: ${tagGroup.color}; font-weight: 600; font-size: 0.9em;">• ${tagGroup.category}: </span>`;

                // Special handling for FONT tag - display with the actual color
                if (tagGroup.category.toUpperCase() === 'FONT') {
                    const colorMatch = value.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|[a-zA-Z]+/);
                    if (colorMatch) {
                        const fontColor = colorMatch[0];
                        sectionsHTML += `<span style="color: ${fontColor}; font-weight: 900; font-size: 1em; text-shadow: 0 0 8px ${fontColor}, 0 0 16px ${fontColor};">Color Sample</span>`;
                    } else {
                        sectionsHTML += `<span style="color: var(--SmartThemeBodyColor); font-size: 0.85em;">${value}</span>`;
                    }
                } else {
                    sectionsHTML += `<span style="color: var(--SmartThemeBodyColor); font-size: 0.85em;">${value}</span>`;
                }

                sectionsHTML += `<br>`;
                sectionsHTML += `</div>`;
            });
        });
        
        sectionsHTML += `</div>`;
    });
    
    return sectionsHTML;
}

/*
 * CARROTKERNEL CATEGORIZATION SYSTEM DOCUMENTATION
 * ==============================================
 * 
 * This system categorizes BunnyMoTags into organized sections for display.
 * 
 * CURRENT CATEGORIES:
 * - Physical: SPECIES, GENDER, BUILD, SKIN, HAIR, STYLE
 * - Dere Types: DERE
 * - Core Traits: TRAIT, CONFLICT
 * - Social Dynamics: ATTACHMENT, BOUNDARIES, FLIRTING
 * - Intimate & Kinks: ORIENTATION, KINK, CHEMISTRY, AROUSAL, JEALOUSY
 * - MBTI Types: ENTJ-U, ENTJ-A, INTJ-U, INTJ-A, ENTP-U, ENTP-A, INTP-U, INTP-A
 * - Communication: LING
 * - Psychology: TRAUMA
 * - Leadership: POWER
 * - Identity: NAME, GENRE
 * 
 * HOW TO ADD NEW CATEGORIES:
 * 1. Add to bunnyMoThemes object (line ~971): 'TAG_NAME': { color: '#hex', emoji: '🔥', section: 'Section Name' }
 * 2. Add section to sections object (line ~1025): 'Section Name': []
 * 3. Add section styling to sectionStyles (line ~1058): 'Section Name': { color: '#hex', emoji: '🔥' }
 * 
 * DISPLAY FORMAT:
 * Tags display as "CATEGORY: VALUE" (e.g., "SKIN: FAIR", "TRAIT: INTELLIGENT")
 * 
 * RECENT CHANGES:
 * - Added MBTI Types section for ENTJ-U, ENTJ-A, etc.
 * - Added Communication section for LING tags
 * - Added Psychology section for TRAUMA tags
 * - Added Leadership section for POWER tags (moved from Intimate & Kinks)
 * - Implemented category prefix display format
 */

// Restore thinking blocks from cache (for page refresh/chat switching)
// Restore thinking blocks from message.extra (for page refresh)
// Following ST's reasoning.js pattern - data is already in message.extra from chat JSON
async function restoreThinkingBlocksFromMessageExtra() {
    const settings = extension_settings[extensionName];

    console.log('🔄 restoreThinkingBlocksFromMessageExtra START');
    console.log('🔄 Settings:', { enabled: settings?.enabled, displayMode: settings?.displayMode });

    if (!settings.enabled || settings.displayMode !== 'thinking') {
        console.log('🔄 Restoration skipped - not in thinking mode');
        return;
    }

    CarrotDebug.ui('🔄 Restoring thinking blocks from message.extra...');

    let restoredCount = 0;
    let skippedNoData = 0;
    let skippedNoDom = 0;
    let skippedExisting = 0;

    console.log('🔄 Processing', chat.length, 'messages in chat');

    // Scan through all AI messages and restore thinking blocks
    chat.forEach((message, index) => {
        // Skip user messages
        if (message.is_user) {
            return;
        }

        console.log(`🔄 Message ${index}: Checking for character data in message.extra...`);

        // Check if this AI message has character data
        const storedData = message?.extra?.carrot_character_data;

        // Support both formats: array (old) or object with .characters property (current)
        let characterNames;
        if (Array.isArray(storedData)) {
            characterNames = storedData;
        } else if (storedData?.characters && Array.isArray(storedData.characters)) {
            characterNames = storedData.characters;
        } else {
            console.log(`🔄 Message ${index}: No character data - SKIPPING`);
            skippedNoData++;
            return;
        }

        console.log(`🔄 Message ${index}: Found ${characterNames.length} characters:`, characterNames);

        const messageElement = document.querySelector(`[mesid="${index}"]`);

        if (!messageElement) {
            console.error(`🔄 Message ${index}: DOM element NOT FOUND - SKIPPING`);
            skippedNoDom++;
            return;
        }

        // Check if thinking block already exists
        const existingThinkingBlock = messageElement.querySelector('.carrot-thinking-details');

        if (existingThinkingBlock) {
            console.log(`🔄 Message ${index}: Already has thinking block - SKIPPING`);
            skippedExisting++;
            return;
        }

        // Render thinking block
        console.log(`🔄 Message ${index}: Calling renderAsThinkingBox with:`, characterNames);

        const thinkingBlockHTML = renderAsThinkingBox(characterNames);

        console.log(`🔄 Message ${index}: renderAsThinkingBox returned HTML length:`, thinkingBlockHTML?.length || 0);

        // Insert thinking block into message
        const mesText = messageElement.querySelector('.mes_text');

        if (mesText && thinkingBlockHTML) {
            console.log(`🔄 Message ${index}: Inserting thinking block into DOM...`);
            mesText.insertAdjacentHTML('beforebegin', thinkingBlockHTML);

            messageElement.classList.add('carrot-thinking');
            messageElement.setAttribute('data-carrot-thinking-state', 'done');

            restoredCount++;
            console.log(`🔄 Message ${index}: ✅ SUCCESSFULLY RESTORED THINKING BLOCK`);
        } else {
            console.error(`🔄 Message ${index}: ❌ FAILED TO INSERT - mesText=${!!mesText}, thinkingBlockHTML=${!!thinkingBlockHTML}`);
        }
    });

    console.log('🔄 restoreThinkingBlocksFromMessageExtra COMPLETE');
    console.log('🔄 SUMMARY:', {
        totalMessages: chat.length,
        restoredCount,
        skippedNoData,
        skippedNoDom,
        skippedExisting
    });

    if (restoredCount > 0) {
        CarrotDebug.ui(`✅ Restored ${restoredCount} thinking blocks from message.extra`);
    } else {
        CarrotDebug.ui('💭 No thinking blocks found to restore');
    }
}

// ============================================================================
// BUNNYMOTAGS-STYLE CARD DISPLAY SYSTEM  
// =============================================================================
// CARD RENDERING SYSTEM 🥕
// Now loaded from ./card-renderer.js
// Includes: renderAsCards, loadCarrotCardStyles, attachExternalCardsToMessage,
//           ensureBunnyMoAnimations, createExternalCardContainer,
//           createTabbedCharacterCard, createCharacterCard
// =============================================================================

// Generate unique colors for each character (BunnyMoTags style)
function generateCharacterColors(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        const char = name.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    const hue = Math.abs(hash) % 360;
    const saturation = 45 + (Math.abs(hash) % 30); // 45-75%
    const lightness = 25 + (Math.abs(hash) % 20);  // 25-45%
    
    return {
        bgColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        darkerBgColor: `hsl(${hue}, ${saturation}%, ${lightness - 8}%)`
    };
}


// Get default tag group mapping (EXACT BunnyMoTags implementation + ALL CarrotKernel categories)
function getTagGroupMapping() {
    const settings = extension_settings[extensionName] || {};
    return settings.tagGroups || {
        personality: ['personality', 'traits', 'behavior', 'mental', 'attitude', 'mind', 'dere', 'trait', 'attachment', 'conflict', 'boundaries', 'flirting'],
        mbti: ['entj', 'intj', 'enfp', 'infp', 'estp', 'istp', 'esfj', 'isfj', 'entp', 'intp', 'enfj', 'infj', 'estj', 'istj', 'esfp', 'isfp'],
        body: ['physical', 'appearance', 'body', 'species', 'gender', 'age', 'looks', 'build', 'skin', 'hair', 'style', 'dressstyle'],
        kinks: ['kinks', 'fetish', 'sexual', 'nsfw', 'adult', 'erotic', 'kink', 'chemistry', 'arousal', 'orientation', 'power', 'trauma', 'jealousy', 'attraction'],
        identity: ['name', 'genre', 'context'],
        communication: ['ling', 'linguistics', 'speech', 'language']
        // Only truly unknown tags go to 'others'
    };
}

// Smart tag grouping system (BunnyMoTags style)
function groupTags(tags) {
    const groupMapping = getTagGroupMapping();
    const groups = {
        personality: [],
        mbti: [],
        body: [],
        kinks: [],
        identity: [],
        communication: [],
        others: []
    };
    
    tags.forEach((values, category) => {
        if (!values || values.size === 0) return;
        
        const categoryLower = category.toLowerCase();
        const tagValues = Array.from(values);
        let foundGroup = 'others'; // default
        
        // Special handling for MBTI patterns (e.g., ENTJ-U, INFP-A, etc.)
        const hasMBTI = tagValues.some(tag => {
            const tagStr = tag.toString().toUpperCase();
            return /^(E|I)(N|S)(T|F)(J|P)(-[A-Z])?$/i.test(tagStr);
        });
        
        if (hasMBTI) {
            foundGroup = 'mbti';
        } else {
            // Check which group this category belongs to
            for (const [groupName, keywords] of Object.entries(groupMapping)) {
                if (keywords.some(keyword => categoryLower.includes(keyword))) {
                    foundGroup = groupName;
                    break;
                }
            }
        }
        
        groups[foundGroup].push({
            category: category,
            tags: tagValues,
            originalCategory: category
        });
    });
    
    return groups;
}

// Initialize card interactivity for CarrotKernel
window.CARROT_initializeCards = function() {
    const cards = document.querySelectorAll('.bmt-tracker-card[data-character]');
    cards.forEach(card => {
        // Remove existing listeners to avoid duplicates
        card.removeEventListener('mouseenter', window.CARROT_cardHoverIn);
        card.removeEventListener('mouseleave', window.CARROT_cardHoverOut);
        card.removeEventListener('click', window.CARROT_cardClick);
        
        // Add enhanced hover effects
        card.addEventListener('mouseenter', window.CARROT_cardHoverIn);
        card.addEventListener('mouseleave', window.CARROT_cardHoverOut);
        card.addEventListener('click', window.CARROT_cardClick);
    });
    
    // Add toggle button listeners
    const toggleButtons = document.querySelectorAll('.bmt-card-toggle[data-card-id]');
    toggleButtons.forEach(button => {
        button.removeEventListener('click', window.CARROT_toggleButtonClick);
        button.addEventListener('click', window.CARROT_toggleButtonClick);
    });
};

// CarrotKernel card event handlers
window.CARROT_cardHoverIn = function() {
    this.style.transform = 'translateY(-4px) scale(1.02)';
    this.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
};

window.CARROT_cardHoverOut = function() {
    this.style.transform = 'translateY(0) scale(1)';
    this.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2), 0 1px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
};

window.CARROT_cardClick = function(e) {
    // Don't trigger if clicking the toggle button itself
    if (e.target.closest('.bmt-card-toggle')) return;
    
    const cardId = this.id;
    if (cardId) window.CARROT_toggleCard(cardId);
};

window.CARROT_toggleButtonClick = function(e) {
    e.stopPropagation();
    const cardId = this.getAttribute('data-card-id');
    if (cardId) window.CARROT_toggleCard(cardId);
};

// Card toggle functionality for CarrotKernel
window.CARROT_toggleCard = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const content = card.querySelector('.bmt-card-content');
    const toggleIcon = card.querySelector('.bmt-toggle-icon');
    
    if (!content || !toggleIcon) return;
    
    const isCollapsed = card.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Expand
        card.classList.remove('collapsed');
        toggleIcon.textContent = '▼';
        content.style.maxHeight = 'none';
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    } else {
        // Collapse
        card.classList.add('collapsed');
        toggleIcon.textContent = '▶';
        content.style.maxHeight = '0';
        content.style.opacity = '0';
        content.style.transform = 'translateY(-10px)';
    }
};

// Macro section toggle functionality
window.CARROT_toggleMacroSection = function() {
    const $macroContent = $('#macro_definitions');
    const $indicator = $('.bmt-collapse-indicator');
    const $header = $('.bmt-collapsible-header');
    
    if ($macroContent.is(':visible')) {
        $macroContent.slideUp(300);
        $indicator.text('▼');
        $header.removeClass('expanded');
    } else {
        $macroContent.slideDown(300);
        $indicator.text('▲');
        $header.addClass('expanded');
    }
};

// ============================================================================
// MAIN DISPLAY COORDINATION
// ============================================================================

// Main display function - coordinates thinking box vs cards display
function displayCharacterData(injectedCharacters) {
    const settings = extension_settings[extensionName];

    console.log('🎯 displayCharacterData called with:', injectedCharacters);
    console.log('🎯 Display mode:', settings.displayMode);
    console.log('🎯 scannedCharacters Map size at display time:', scannedCharacters.size);

    CarrotDebug.ui('🎯 DISPLAY CHARACTER DATA: Function called', {
        injectedCharacters,
        charactersLength: injectedCharacters?.length,
        displayMode: settings.displayMode
    });
    
    if (!injectedCharacters || injectedCharacters.length === 0 || settings.displayMode === 'none') {
        CarrotDebug.ui('⏭️ DISPLAY: Skipping display', {
            reason: !injectedCharacters ? 'No characters' : injectedCharacters.length === 0 ? 'Empty array' : 'Display mode none'
        });
        return;
    }
    
    let renderedContent = '';
    if (settings.displayMode === 'thinking') {
        renderedContent = renderAsThinkingBox(injectedCharacters);
    } else if (settings.displayMode === 'cards') {
        renderedContent = renderAsCards(injectedCharacters);
    }

    if (renderedContent) {
        // Add to the last message
        const lastMessage = document.querySelector('#chat .mes:last-child');
        const allMessages = document.querySelectorAll('#chat .mes');
        
        if (lastMessage) {
            // Remove any existing CarrotKernel content (both old broken and new implementations)
            const existing = lastMessage.querySelector('.carrot-reasoning-details, .carrot-thinking-details, .carrot-cards-container');
            if (existing) {
                CarrotDebug.ui('🗑️ DISPLAY: Removing existing content');
                existing.remove();
            }
            
            // Add new content before message text (thinking appears at top)
            const mesText = lastMessage.querySelector('.mes_text');
            CarrotDebug.ui('🎯 DISPLAY: Message text element found', {
                hasMesText: !!mesText,
                mesTextContent: mesText?.textContent?.substring(0, 100)
            });
            
            if (mesText) {
                CarrotDebug.ui('Inserting HTML before mesText element');
                mesText.insertAdjacentHTML('beforebegin', renderedContent);
                CarrotDebug.ui('HTML insertion completed, checking if element exists in DOM');
                
                // Ensure collapsible functionality works by adding event listeners
                const characterDetails = lastMessage.querySelectorAll('details[style*="border"]');
                characterDetails.forEach(details => {
                    const summary = details.querySelector('summary');
                    if (summary && !summary.hasAttribute('data-carrot-listener')) {
                        summary.setAttribute('data-carrot-listener', 'true');
                        summary.addEventListener('click', (e) => {
                            e.preventDefault();
                            const isOpen = details.hasAttribute('open');
                            if (isOpen) {
                                details.removeAttribute('open');
                            } else {
                                details.setAttribute('open', '');
                            }
                        });
                    }
                });
                
                // Verify the thinking block was actually added (look for CarrotKernel thinking class)
                const insertedElement = lastMessage.querySelector('.carrot-thinking-details');
                CarrotDebug.ui('Verification - ST-native thinking block element found:', !!insertedElement);
                if (insertedElement) {
                    CarrotDebug.ui('Thinking block dimensions:', {
                        offsetHeight: insertedElement.offsetHeight,
                        offsetWidth: insertedElement.offsetWidth,
                        display: getComputedStyle(insertedElement).display,
                        visibility: getComputedStyle(insertedElement).visibility
                    });
                    
                    // Mark the message as having CarrotKernel thinking content (separate from ST reasoning)
                    lastMessage.classList.add('carrot-thinking');
                    lastMessage.setAttribute('data-carrot-thinking-state', 'done');
                    
                    // PERSISTENCE: Store character data in message.extra for page refresh survival
                    const messageId = parseInt(lastMessage.getAttribute('mesid'));
                    if (!isNaN(messageId) && chat[messageId]) {
                        if (!chat[messageId].extra) {
                            chat[messageId].extra = {};
                        }

                        // All injected characters are valid - no filtering needed
                        // Characters came from Character Repos

                        // Store characters if we have any
                        if (injectedCharacters.length > 0) {
                            // Store CarrotKernel character data in message.extra (like ST's native reasoning)
                            chat[messageId].extra.carrot_character_data = {
                                characters: injectedCharacters,
                                displayMode: settings.displayMode,
                                timestamp: Date.now(),
                                version: '1.0'
                            };
                        } else {
                            CarrotDebug.ui(`⏭️  No characters to store for message ${messageId}`);
                        }
                        
                        // Save the chat to persist the data
                        saveChatDebounced();
                        
                        CarrotDebug.ui('💾 PERSISTENCE: Character data saved to message.extra', {
                            messageId: messageId,
                            characters: injectedCharacters,
                            saved: true
                        });
                    }
                }
                
                CarrotDebug.ui(`✅ DISPLAY: Successfully displayed ${settings.displayMode}`, {
                    characters: injectedCharacters
                });
            } else {
                CarrotDebug.error('No .mes_text found in last message');
                CarrotDebug.ui('❌ DISPLAY: No .mes_text found in last message');
            }
        } else {
            CarrotDebug.ui('❌ DISPLAY: No last message found');
        }
    } else {
        CarrotDebug.ui('❌ DISPLAY: No rendered content to display');
    }
}

// Update lorebook list in UI
function updateLorebookList() {
    const listElement = $('#carrot-lorebook-list');
    if (!listElement.length) return;

    const availableLorebooks = world_names || [];
    let html = '';

    if (availableLorebooks.length === 0) {
        html = '<div class="carrot-empty-state">No lorebooks found</div>';
    } else {
        // Separate into suggested and other lorebooks
        const suggestedLorebooks = [];
        const otherLorebooks = [];

        availableLorebooks.forEach(lorebookName => {
            // Check if globally active (Active World(s) for all chats)
            const isGloballyActive = selected_world_info.includes(lorebookName);

            // Enhanced BunnyMo pattern matching
            const lowerName = lorebookName.toLowerCase();
            const isBunnyMo = lowerName.includes('bunny') ||
                            lowerName.includes('bunn') ||
                            lorebookName.includes('BUNNYMO') ||
                            lowerName.endsWith('.bny');

            if (isGloballyActive || isBunnyMo) {
                suggestedLorebooks.push(lorebookName);
            } else {
                otherLorebooks.push(lorebookName);
            }
        });

        // Render suggested section
        if (suggestedLorebooks.length > 0) {
            html += `
                <div style="margin-bottom: 12px; padding: 8px 12px; background: rgba(139, 92, 246, 0.1); border-radius: 6px; border-left: 3px solid #8b5cf6;">
                    <div style="font-size: 11px; font-weight: 600; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.5px;">
                        ✨ Suggested
                    </div>
                </div>
            `;

            suggestedLorebooks.forEach(lorebookName => {
                const isSelected = selectedLorebooks.has(lorebookName);
                const isCharacterRepo = characterRepoBooks.has(lorebookName);
                const isGloballyActive = selected_world_info.includes(lorebookName);

                // Enhanced BunnyMo pattern matching
                const lowerName = lorebookName.toLowerCase();
                const isBunnyMo = lowerName.includes('bunny') ||
                                lowerName.includes('bunn') ||
                                lorebookName.includes('BUNNYMO') ||
                                lowerName.endsWith('.bny');

                html += `
                <div class="carrot-lorebook-item" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: var(--black30); border-radius: 8px; border: 2px solid #8b5cf6; box-shadow: 0 0 12px rgba(139, 92, 246, 0.3); transition: all 0.2s ease;">
                    <label class="carrot-lorebook-checkbox" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer; margin: 0;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}
                               data-lorebook="${lorebookName}" class="carrot-lorebook-toggle" style="cursor: pointer;">
                        <span class="carrot-lorebook-name" style="flex: 1; font-weight: 500;">${lorebookName}</span>
                        <div style="display: flex; gap: 4px;">
                            ${isGloballyActive ? '<span style="font-size: 10px; padding: 2px 6px; background: rgba(76, 175, 80, 0.3); border-radius: 8px; color: #81c784; font-weight: 600;">🌍 Global</span>' : ''}
                            ${isBunnyMo ? '<span style="font-size: 10px; padding: 2px 6px; background: rgba(139, 92, 246, 0.3); border-radius: 8px; color: #8b5cf6; font-weight: 600;">🐰 BunnyMo</span>' : ''}
                        </div>
                    </label>
                    <div class="carrot-lorebook-actions" style="display: flex; align-items: center; gap: 8px;">
                        <span class="carrot-lorebook-status" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; background: ${isCharacterRepo ? 'rgba(156, 39, 176, 0.2)' : 'rgba(33, 150, 243, 0.2)'}; color: ${isCharacterRepo ? '#ce93d8' : '#90caf9'}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${isCharacterRepo ? '👤 Char Repo' : '📚 Tag Lib'}
                        </span>
                        <button class="carrot-repo-btn ${isCharacterRepo ? 'active' : ''}"
                                data-lorebook="${lorebookName}"
                                title="Toggle between Character Repository and Tag Library"
                                style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--SmartThemeBorderColor); background: ${isCharacterRepo ? 'rgba(156, 39, 176, 0.3)' : 'transparent'}; color: var(--SmartThemeBodyColor); cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
                            ${isCharacterRepo ? '👤' : '📚'}
                        </button>
                    </div>
                </div>
            `;
            });
        }

        // Render other lorebooks
        if (otherLorebooks.length > 0 && suggestedLorebooks.length > 0) {
            html += `
                <div style="margin: 16px 0 12px 0; padding: 8px 12px; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                    <div style="font-size: 11px; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px;">
                        All Lorebooks
                    </div>
                </div>
            `;
        }

        otherLorebooks.forEach(lorebookName => {
            const isSelected = selectedLorebooks.has(lorebookName);
            const isCharacterRepo = characterRepoBooks.has(lorebookName);
            const safeName = lorebookName.replace(/[^a-zA-Z0-9]/g, '_');

            html += `
                <div class="carrot-lorebook-item" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: var(--black30); border-radius: 8px; border: 1px solid ${isSelected ? 'var(--SmartThemeEmColor)' : 'var(--SmartThemeBorderColor)'}; transition: all 0.2s ease;">
                    <label class="carrot-lorebook-checkbox" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer; margin: 0;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}
                               data-lorebook="${lorebookName}" class="carrot-lorebook-toggle" style="cursor: pointer;">
                        <span class="carrot-lorebook-name" style="flex: 1; font-weight: 500;">${lorebookName}</span>
                    </label>
                    <div class="carrot-lorebook-actions" style="display: flex; align-items: center; gap: 8px;">
                        <span class="carrot-lorebook-status" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; background: ${isCharacterRepo ? 'rgba(156, 39, 176, 0.2)' : 'rgba(33, 150, 243, 0.2)'}; color: ${isCharacterRepo ? '#ce93d8' : '#90caf9'}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${isCharacterRepo ? '👤 Char Repo' : '📚 Tag Lib'}
                        </span>
                        <button class="carrot-repo-btn ${isCharacterRepo ? 'active' : ''}"
                                data-lorebook="${lorebookName}"
                                title="Toggle between Character Repository and Tag Library"
                                style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--SmartThemeBorderColor); background: ${isCharacterRepo ? 'rgba(156, 39, 176, 0.3)' : 'transparent'}; color: var(--SmartThemeBodyColor); cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
                            ${isCharacterRepo ? '👤' : '📚'}
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    listElement.html(html);
}

// Removed storage system - processing immediately like BunnyMoTags

/**
 * Process Tag Library entries for template-based injections
 * When Tag Library entries activate, check for associated templates and inject them
 */
async function processTagLibraryInjections(tagEntries) {
    if (!tagEntries || tagEntries.length === 0) {
        return;
    }

    CarrotDebug.inject(`🏷️ Starting Tag Library injection processing`, {
        totalEntries: tagEntries.length,
        entries: tagEntries.map(e => ({
            world: e.world,
            key: e.key,
            comment: e.comment
        }))
    });

    const settings = extension_settings[extensionName];

    for (const entry of tagEntries) {
        try {
            // Extract tag name from entry
            const tagName = entry.comment || entry.key?.[0] || 'Unknown';
            const lorebookName = entry.world;

            // Look for a template matching this tag entry
            // Template name should match the entry name or have a trigger keyword
            const matchingTemplate = findTemplateForEntry(entry);

            if (matchingTemplate) {
                // Only log when we actually find and process a template
                CarrotDebug.inject(`💉 Injecting tag template: "${tagName}" using ${matchingTemplate.name}`);

                // Process template with entry data
                const templateData = {
                    entry: entry,
                    tagName: tagName,
                    content: entry.content,
                    lorebookName: lorebookName,
                    key: entry.key,
                    comment: entry.comment
                };

                let injectionText = await CarrotTemplateManager.processTemplate(matchingTemplate, templateData);

                // Ensure string output
                if (typeof injectionText !== 'string') {
                    injectionText = String(injectionText || '');
                }

                // Use template settings for injection
                const depth = matchingTemplate.depth !== undefined ? matchingTemplate.depth : settings.injectionDepth || 4;
                const role = matchingTemplate.role || settings.injectionRole || 'system';
                const position = matchingTemplate.position || 'chat';

                // Create unique ID for this injection
                const injectionId = `carrot-tag-${lorebookName.replace(/[^a-zA-Z0-9]/g, '_')}-${tagName.replace(/[^a-zA-Z0-9]/g, '_')}`;

                const injectionCommand = `/inject id=${injectionId} position=${position} ephemeral=true scan=true depth=${depth} role=${role} ${injectionText}`;

                await executeSlashCommandsWithOptions(injectionCommand, { displayCommand: false, showOutput: false });
            }
            // Silently skip entries without templates (most tag library entries don't have templates)
        } catch (error) {
            CarrotDebug.error(`❌ Failed to process tag entry injection:`, {
                entry: entry,
                error: error.message,
                stack: error.stack
            });
        }
    }

    CarrotDebug.inject(`✅ Completed Tag Library injection processing`);
}

/**
 * Find a template that matches a lorebook entry
 * Checks template name, triggers, and categories
 */
function findTemplateForEntry(entry) {
    const entryName = (entry.comment || entry.key?.[0] || '').toLowerCase();
    const lorebookName = (entry.world || '').toLowerCase();

    const allTemplates = Object.values(CarrotTemplateManager.getTemplates());

    // Try to find matching template
    for (const template of allTemplates) {
        const templateName = (template.name || '').toLowerCase();

        // Check if template name matches entry name
        if (templateName.includes(entryName) || entryName.includes(templateName)) {
            return template;
        }

        // Check if template has triggers that match
        if (template.triggers && Array.isArray(template.triggers)) {
            for (const trigger of template.triggers) {
                const triggerLower = trigger.toLowerCase();
                if (entryName.includes(triggerLower) || lorebookName.includes(triggerLower)) {
                    return template;
                }
            }
        }

        // Check if template category suggests it's for this type of entry
        if (template.category) {
            const categoryLower = template.category.toLowerCase();
            if (categoryLower.includes('tag') && categoryLower.includes('injection')) {
                // Generic tag injection template - could be used as fallback
                // But keep looking for more specific match
                continue;
            }
        }
    }

    // No matching template found
    return null;
}

// Process activated lorebook entries (triggered when ST activates lorebook entries)
async function processActivatedLorebookEntries(entryList) {
    const settings = extension_settings[extensionName];

    if (!settings.enabled || !entryList || entryList.length === 0) {
        return;
    }

    // BunnymoTags Wrapping is now handled at file-level when marking as tag library
    // No runtime wrapping needed - entries are already wrapped in the lorebook files

    CarrotDebug.startTimer('process-activated-entries', 'SCAN');
    CarrotDebug.scan('🎯 PROCESSING ACTIVATED LOREBOOK ENTRIES', {
        totalEntries: entryList.length,
        characterRepoBooks: Array.from(characterRepoBooks),
        scannedCharacters: scannedCharacters.size,
        availableCharacters: Array.from(scannedCharacters.keys())
    });
    
    // Find activated character repository entries
    const activatedCharacters = [];
    
    // Separate character repo entries and tag library entries
    const characterRepoBooksList = Array.from(characterRepoBooks);
    const tagLibrariesList = Array.from(tagLibraries);

    CarrotDebug.scan(`🔍 Processing activated entries`, {
        totalEntries: entryList.length,
        characterRepos: characterRepoBooksList,
        tagLibraries: tagLibrariesList
    });

    // Filter for character entries from Character Repos
    const characterEntries = entryList.filter(entry => {
        return characterRepoBooksList.includes(entry.world);
    });

    // Filter for tag entries from Tag Libraries
    const tagLibraryEntries = entryList.filter(entry => {
        return tagLibrariesList.includes(entry.world);
    });

    CarrotDebug.scan(`📊 Entry breakdown`, {
        characterRepoEntries: characterEntries.length,
        tagLibraryEntries: tagLibraryEntries.length
    });

    // Process Tag Library entries for template-based injections
    if (tagLibraryEntries.length > 0) {
        CarrotDebug.inject(`🏷️ Processing ${tagLibraryEntries.length} Tag Library entries for template injections`);
        await processTagLibraryInjections(tagLibraryEntries);
    }

    // Early return if no character repo entries
    if (characterEntries.length === 0) {
        CarrotDebug.scan('No character repository entries were activated');
        return;
    }
    
    // Extract character data from activated entries
    const characterData = [];
    for (const entry of characterEntries) {
        CarrotDebug.scan(`🔄 Processing character entry`, {
            comment: entry.comment,
            key: entry.key,
            title: entry.title,
            world: entry.world,
            contentLength: entry.content?.length || 0
        });
        
        const character = extractCharacterDataFromEntry(entry);
        if (character) {
            characterData.push(character);
            activatedCharacters.push(character.name);
            
            // CRITICAL: Add character to scannedCharacters Map for display system
            const cacheKey = character.cacheKey || `${character.source}::${character.name}`;
            const characterForStorage = {
                name: character.name,
                tags: new Map(Object.entries(character.tags)), // Convert to Map for consistency
                source: character.source,
                uid: character.uid
            };
            scannedCharacters.set(cacheKey, characterForStorage);

            console.log(`✅ STORED CHARACTER IN scannedCharacters:`, {
                cacheKey: cacheKey,
                name: character.name,
                source: character.source,
                mapSize: scannedCharacters.size
            });

            CarrotDebug.scan(`📊 Character extracted and stored: ${character.name}`, {
                cacheKey: cacheKey,
                tagCount: Object.keys(character.tags).length,
                source: character.source,
                uid: character.uid,
                storedInScannedCharacters: scannedCharacters.has(cacheKey)
            });
        } else {
            CarrotDebug.scan(`⚠️ No character data extracted from entry`, {
                comment: entry.comment,
                key: entry.key,
                title: entry.title,
                reason: 'extractCharacterDataFromEntry returned null'
            });
        }
    }
    
    CarrotDebug.endTimer('process-activated-entries', 'SCAN');
    
    if (characterData.length > 0) {
        CarrotDebug.scan(`🎴 Creating thinking blocks for ${characterData.length} activated characters`);

        // Store character names for persistent tag injection
        setLastInjectedCharacters(characterData.map(char => char.name));

        // Inject to AI context
        await injectCharacterData(characterData.map(char => char.name));

        // Create system message with external cards (like BunnyMoTags)
        const settings = extension_settings[extensionName];

        if (settings.displayMode === 'cards') {
            // Create system message and external cards immediately
            await sendCarrotSystemMessage({ characters: characterData });
        } else if (settings.displayMode === 'thinking') {
            // Store character data in message.extra for persistence (following ST's reasoning.js pattern)
            // This will automatically persist to swipe_info and chat JSON
            // Store composite keys (lorebook::charactername) for accurate lookup
            const characterKeys = characterData.map(char => char.cacheKey || `${char.source}::${char.name}`);

            // Find the most recent user message to store character data
            // WORLD_INFO_ACTIVATED fires during generation, so we look for the last user message
            const lastUserMessageIndex = chat.findLastIndex(msg => msg.is_user);

            if (lastUserMessageIndex >= 0) {
                const userMessage = chat[lastUserMessageIndex];
                if (!userMessage.extra) {
                    userMessage.extra = {};
                }
                userMessage.extra.carrot_character_data = characterKeys;

                console.log('✅ Stored character data in message.extra:', {
                    messageIndex: lastUserMessageIndex,
                    characters: characterKeys
                });
            } else {
                // Fallback: store in pending data if no user message found (shouldn't happen)
                console.warn('⚠️ No user message found to store character data');
                setPendingThinkingBlockData(characterKeys);
            }
        }
    } else {
        CarrotDebug.scan('ℹ️ No character repository entries activated', {
            totalActivated: entryList.length,
            characterRepos: Array.from(characterRepoBooks)
        });
    }
}

// Extract character data from a single lorebook entry (copied from BunnyMoTags)
function extractCharacterDataFromEntry(entry) {
    if (!entry.content) return null;

    // Extract character name from comment, handling Baby Bunny Mode format
    let characterName = entry.comment || entry.key?.[0] || 'Unknown';

    // If comment has "Character Archive - Generated by Baby Bunny Mode", extract the actual name
    const babyBunnyMatch = characterName.match(/^(.+?)\s+Character Archive\s+-\s+Generated by Baby Bunny Mode/i);
    if (babyBunnyMatch) {
        characterName = babyBunnyMatch[1].trim();
    }

    CarrotDebug.scan('Extracting character from entry:', {
        entryComment: entry.comment,
        entryKey: entry.key,
        extractedName: characterName,
        entryTitle: entry.title || entry.comment
    });

    const character = {
        name: characterName,
        tags: {},
        source: entry.world,
        uid: entry.uid,
        cacheKey: `${entry.world}::${characterName}` // Composite key for scannedCharacters
    };

    // Parse BunnyMoTags from the entry content (FIX: correct case-sensitive matching)
    CarrotDebug.scan('Entry content preview:', entry.content.substring(0, 200));

    // Try both case variations to be safe
    const bunnyTagsMatch = entry.content.match(/<BunnyMoTags>(.*?)<\/BunnyMoTags>/s) ||
                          entry.content.match(/<BunnymoTags>(.*?)<\/BunnymoTags>/s);

    if (!bunnyTagsMatch) {
        // No BunnyMoTags block found - this is not a character entry, skip it
        CarrotDebug.scan('No BunnyMoTags block found in entry content - skipping (not a character)');
        return null;
    }

    const tagsContent = bunnyTagsMatch[1];
    CarrotDebug.scan('Found BunnyMoTags content:', tagsContent.substring(0, 100));

    const tagMatches = tagsContent.match(/<([^:>]+):([^>]+)>/g);

    if (!tagMatches || tagMatches.length === 0) {
        // BunnyMoTags block exists but no tags found - invalid character entry
        CarrotDebug.scan('BunnyMoTags block found but no individual tags matched - skipping');
        return null;
    }

    CarrotDebug.scan('Found tag matches:', tagMatches);

    tagMatches.forEach(tagMatch => {
        const match = tagMatch.match(/<([^:>]+):([^>]+)>/);
        if (match) {
            const category = match[1].toUpperCase().trim();
            const value = match[2].trim();

            // Update character name if this is the Name tag
            if (category === 'NAME') {
                character.name = value; // Keep original case
                character.cacheKey = `${entry.world}::${value}`; // Update cache key with actual name
            }

            if (!character.tags[category]) {
                character.tags[category] = [];
            }
            character.tags[category].push(value);
        }
    });

    CarrotDebug.scan(`✅ Extracted character: ${character.name} with ${Object.keys(character.tags).length} tag categories`);
    return character;
}

// Send CarrotKernel character cards as a system message (copied from BunnyMoTags)
async function sendCarrotSystemMessage(characterData) {
    CarrotDebug.ui('Creating system message with external cards', { characterCount: characterData?.characters?.length });
    
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        CarrotDebug.error('CarrotKernel disabled - blocking card creation');
        return;
    }
    
    if (!characterData || !characterData.characters || characterData.characters.length === 0) {
        CarrotDebug.error('No character data provided for system message');
        return;
    }
    
    const characterCount = characterData.characters.length;
    CarrotDebug.ui(`Creating system message with ${characterCount} character(s)`);
    
    try {
        // Ensure BunnyMoTags CSS is loaded
        const link = document.getElementById('bmt-card-styles');
        if (!link) {
            const newLink = document.createElement('link');
            newLink.id = 'bmt-card-styles';
            newLink.rel = 'stylesheet';
            newLink.type = 'text/css';
            newLink.href = '/scripts/extensions/third-party/BunnyMoTags/style.css';
            document.head.appendChild(newLink);
        }

        // Create system message content
        let messageText = `🥕 Character Information (${characterCount} ${characterCount === 1 ? 'character' : 'characters'})\n\n`;
        messageText += '<div class="carrot-data-anchor" style="display: none;">\n';
        messageText += JSON.stringify(characterData, null, 2);
        messageText += '\n</div>';
        messageText += '\n<div class="carrot-summary" style="font-style: italic; color: #888; margin-top: 10px;">';
        messageText += `📋 ${characterCount} character card${characterCount === 1 ? '' : 's'} loaded - `;
        messageText += 'visual cards will appear below this message</div>';

        const carrotMessage = {
            name: 'BunnyMoTags',
            is_user: false,
            is_system: true,
            mes: messageText,
            send_date: getMessageTimeStamp(),
            force_avatar: '/scripts/extensions/third-party/BunnyMoTags/BunnyTagLogo.png',
            extra: {
                type: 'bunnymo_system_message',
                bunnyMoData: characterData,
                isSmallSys: false,
                characterCount: characterCount,
                bunnymo_generated: true
            }
        };
        
        CarrotDebug.ui('Adding system message to chat');
        
        // Add to chat and display
        chat.push(carrotMessage);
        addOneMessage(carrotMessage);
        
        // Attach external cards after brief delay
        const messageIndex = chat.length - 1;
        setTimeout(() => {
            CarrotDebug.ui('Attaching external cards', { messageIndex, characterData });
            
            try {
                attachExternalCardsToMessage(messageIndex, characterData);
                CarrotDebug.ui(`✅ CarrotKernel external cards attached to system message`);
            } catch (error) {
                CarrotDebug.error('Failed to attach external cards', {
                    error: error.message,
                    stack: error.stack,
                    messageIndex,
                    characterData
                });
            }
        }, 200);
        
        CarrotDebug.ui(`✅ Successfully sent CarrotKernel system message`);
    } catch (error) {
        CarrotDebug.error('System message creation failed', error);
    }
}

// EXACT BunnyMoTags refreshTabContent function  
function refreshTabContent(character, tabContents) {
    CarrotDebug.ui(`Refreshing tab content for ${character?.name}`);
    
    if (!character || !tabContents) {
        CarrotDebug.error('Missing parameters in refreshTabContent', { character: !!character, tabContents: !!tabContents });
        return;
    }
    
    // Check if already showing this character to avoid unnecessary recreation
    const currentCharName = tabContents.personality?.getAttribute('data-current-character');
    if (currentCharName === character.name) {
        CarrotDebug.ui(`Already showing ${character.name}, skipping refresh`);
        return;
    }
    
    // Clear all tab contents and mark with current character
    Object.entries(tabContents).forEach(([tabId, tabContent]) => {
        if (tabContent) {
            tabContent.innerHTML = '';
            tabContent.setAttribute('data-current-character', character.name);
        }
    });
    
    // Create new cards for the selected character
    CarrotDebug.ui(`Creating tabbed character cards for ${character.name}`);
    
    const personalityCard = createTabbedCharacterCard(character, 0, 'personality');
    const physicalCard = createTabbedCharacterCard(character, 0, 'physical');
    const growthCard = createTabbedCharacterCard(character, 0, 'growth');
    
    CarrotDebug.ui(`Created all tab cards for ${character.name}`, {
        personality: !!personalityCard,
        physical: !!physicalCard,
        growth: !!growthCard
    });
    
    // Add cards to appropriate tabs
    if (tabContents.personality) {
        tabContents.personality.appendChild(personalityCard);
    }
    if (tabContents.physical) {
        tabContents.physical.appendChild(physicalCard);
    }
    if (tabContents.growth) {
        tabContents.growth.appendChild(growthCard);
    }
}

// ============================================================================
// PERSISTENT BUNNYMOTAGS SYSTEM
// ============================================================================
// Adds <BunnyMoTags> blocks to AI messages after they respond, hidden from AI context

// Add persistent <BunnyMoTags> to the last AI message after response
async function addPersistentTagsToMessage(messageId) {
    const settings = extension_settings[extensionName];

    // Get the last injected characters
    const lastInjectedCharacters = getLastInjectedCharacters();

    // Don't add persistent tags if disabled or no characters were injected
    if (!settings.enabled || !lastInjectedCharacters || lastInjectedCharacters.length === 0) {
        CarrotDebug.inject('⏭️ Skipping persistent tags', {
            enabled: settings.enabled,
            lastInjectedCount: lastInjectedCharacters ? lastInjectedCharacters.length : 0
        });
        return;
    }

    CarrotDebug.inject('🏷️ Adding persistent <BunnyMoTags> to message', {
        messageId: messageId,
        injectedCharacters: lastInjectedCharacters
    });

    try {
        // Find the message in chat array
        const message = chat[messageId];
        if (!message || message.is_user) {
            CarrotDebug.inject('❌ Message not found or is user message', {
                messageId: messageId,
                messageFound: !!message,
                isUser: message?.is_user
            });
            return;
        }

        // Check if tags already exist to avoid duplicates
        if (message.mes && message.mes.includes('<BunnyMoTags>')) {
            CarrotDebug.inject('ℹ️ BunnyMoTags already exist in message, skipping');
            return;
        }

        // Generate the persistent tags block
        const tagsBlock = generatePersistentTagsBlock(lastInjectedCharacters);

        // Add the tags block to the message content
        message.mes = `${message.mes}\n\n${tagsBlock}`;

        // Update the displayed message
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (messageElement) {
            const mesText = messageElement.querySelector('.mes_text');
            if (mesText) {
                // Re-render the message content to show the new tags
                mesText.innerHTML = messageFormatting(message.mes, message.name, message.is_system, message.is_user, messageId);

                // Initialize the BunnyMoTags display
                initializePersistentTagsDisplay(messageElement);
            }
        }

        // Save the updated chat
        await saveChatConditional();

        CarrotDebug.inject('✅ Persistent tags added successfully', {
            messageId: messageId,
            charactersCount: lastInjectedCharacters.length,
            tagsBlockLength: tagsBlock.length
        });

        // Clear the tracked characters since we've processed them
        setLastInjectedCharacters([]);

    } catch (error) {
        CarrotDebug.error('❌ Failed to add persistent tags', {
            error: error,
            messageId: messageId,
            injectedCharacters: lastInjectedCharacters
        });
    }
}

// Generate the persistent <BunnyMoTags> block content
function generatePersistentTagsBlock(characterNames) {
    let content = '<BunnyMoTags>\n';
    
    characterNames.forEach(charName => {
        let charData = null;
        for (const [key, value] of scannedCharacters) {
            if (key.endsWith(`::${charName}`)) {
                charData = value;
                break;
            }
        }
        if (charData && charData.tags) {
            content += `${charName}:\n`;
            
            // Convert tags to the same format as our injection system
            for (const [category, values] of charData.tags) {
                if (values.size > 0) {
                    const valuesArray = Array.from(values);
                    content += `• ${category}: ${valuesArray.join(', ')}\n`;
                }
            }
            content += '\n';
        }
    });
    
    content += '</BunnyMoTags>';
    return content;
}

// Initialize display for persistent BunnyMoTags blocks
function initializePersistentTagsDisplay(messageElement) {
    // Find BunnyMoTags blocks and render them with collapsible characters
    const bunnyTagsBlocks = messageElement.querySelectorAll('.mes_text');
    bunnyTagsBlocks.forEach(mesText => {
        const content = mesText.innerHTML;
        if (content.includes('&lt;BunnyMoTags&gt;') || content.includes('<BunnyMoTags>')) {
            // Parse and render the BunnyMoTags content with native styling
            renderPersistentBunnyMoTags(mesText);
        }
    });
}

// Render persistent BunnyMoTags with native ST reasoning box styling
function renderPersistentBunnyMoTags(mesText) {
    const settings = extension_settings[extensionName];

    // Extract all BunnyMoTags blocks
    let content = mesText.innerHTML;
    const bunnyTagsRegex = /&lt;BunnyMoTags&gt;([\s\S]*?)&lt;\/BunnyMoTags&gt;/g;
    const bunnyTagsMatches = [...content.matchAll(bunnyTagsRegex)];

    if (bunnyTagsMatches.length === 0) return;

    // Extract all Linguistics blocks
    const linguisticsRegex = /&lt;linguistics&gt;([\s\S]*?)&lt;\/linguistics&gt;/gi;
    const linguisticsMatches = [...content.matchAll(linguisticsRegex)];

    // Build replacements array to do all replacements in one pass
    const replacements = [];

    // Process each BunnyMoTags block
    bunnyTagsMatches.forEach((bunnyTagsMatch, blockIndex) => {
        const tagsContent = bunnyTagsMatch[1];
        const parsedCharacters = parseBunnyMoTagsContent(tagsContent);

        // Match linguistics block with the corresponding character block
        if (linguisticsMatches[blockIndex] && parsedCharacters.length > 0) {
            const linguisticsContent = linguisticsMatches[blockIndex][1].trim();

            // Extract LING: tags from the description
            const lingMatches = linguisticsContent.match(/&lt;LING:([^&]+)&gt;/g);
            if (lingMatches) {
                // Add extracted LING tags to the first character in this block
                if (!parsedCharacters[0].tags.has('ling')) {
                    parsedCharacters[0].tags.set('ling', new Set());
                }

                lingMatches.forEach(match => {
                    const lingTag = match.replace(/&lt;LING:([^&]+)&gt;/, '$1');
                    parsedCharacters[0].tags.get('ling').add(lingTag);
                });
            }

            // Add full linguistics description as a special section
            if (!parsedCharacters[0].tags.has('linguistics_description')) {
                parsedCharacters[0].tags.set('linguistics_description', new Set());
            }
            // Clean up the description (remove HTML entities and LING tags for display)
            const cleanDescription = linguisticsContent
                .replace(/&lt;LING:[^&]+&gt;/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
            parsedCharacters[0].tags.get('linguistics_description').add(cleanDescription);
        }

        if (parsedCharacters.length === 0) return;

        // Create native ST reasoning-style block with individual character collapsibility
        const reasoningBlock = createNativeBunnyMoTagsBlock(parsedCharacters, settings.autoExpand);

        // Store replacement data
        replacements.push({
            original: bunnyTagsMatch[0],
            replacement: reasoningBlock,
            index: bunnyTagsMatch.index
        });
    });

    // Sort replacements by index in reverse order (work backwards to maintain positions)
    replacements.sort((a, b) => b.index - a.index);

    // Apply all replacements
    replacements.forEach(rep => {
        content = content.substring(0, rep.index) + rep.replacement + content.substring(rep.index + rep.original.length);
    });

    // Replace all Linguistics blocks (they're now integrated into BunnyMoTags)
    content = content.replace(linguisticsRegex, '');

    mesText.innerHTML = content;

    // Initialize interactivity
    initializeBunnyMoTagsInteractivity(mesText);
}

// Parse BunnyMoTags content into character data
function parseBunnyMoTagsContent(content) {
    const characters = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    let currentCharacter = null;
    
    lines.forEach(line => {
        if (line.endsWith(':') && !line.startsWith('•')) {
            // Character name line
            if (currentCharacter) {
                characters.push(currentCharacter);
            }
            currentCharacter = {
                name: line.slice(0, -1).trim(),
                tags: new Map()
            };
        } else if (currentCharacter && line.startsWith('• ')) {
            // Tag line
            const tagLine = line.slice(2).trim();
            const colonIndex = tagLine.indexOf(':');
            if (colonIndex > 0) {
                const category = tagLine.slice(0, colonIndex).trim();
                const values = tagLine.slice(colonIndex + 1).trim()
                    .split(',')
                    .map(v => v.trim())
                    .filter(v => v);
                currentCharacter.tags.set(category, new Set(values));
            }
        }
    });
    
    if (currentCharacter) {
        characters.push(currentCharacter);
    }
    
    return characters;
}

// Create native ST reasoning-style block for BunnyMoTags
function createNativeBunnyMoTagsBlock(characters, autoExpand = false) {
    const openAttr = autoExpand ? 'open' : '';
    
    // Create individual character sections that are collapsible
    const characterSections = characters.map((char, index) => {
        const charId = `bunnymo-char-${char.name.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`;
        
        let tagContent = '';
        for (const [category, values] of char.tags) {
            const valuesArray = Array.from(values);
            tagContent += `<strong style="color: var(--SmartThemeBodyColor); opacity: 0.9;">${category}:</strong><br>`;
            tagContent += `<span style="color: var(--SmartThemeBodyColor); opacity: 0.7; margin-left: 10px;">${valuesArray.join(', ')}</span><br><br>`;
        }
        
        return `
            <details class="bunnymo-character-section" id="${charId}" ${autoExpand ? 'open' : ''}>
                <summary style="color: var(--SmartThemeBodyColor); font-weight: 600; opacity: 0.9; cursor: pointer; padding: 4px 0; border-bottom: 1px solid var(--SmartThemeBodyColor); opacity: 0.3; margin-bottom: 8px;">
                    🎭 ${char.name}
                    <span style="font-size: 0.85em; opacity: 0.7; font-weight: normal;">(${char.tags.size} categories)</span>
                </summary>
                <div style="padding-left: 12px; margin-top: 8px;">
                    ${tagContent}
                </div>
            </details>
        `;
    }).join('');
    
    return `
        <details class="mes_reasoning_details bunnymo-tags-container" ${openAttr}>
            <summary class="mes_reasoning_summary">
                <div class="mes_reasoning_header">
                    <div class="mes_reasoning_header_block">
                        <span style="color: var(--SmartThemeBodyColor);">🏷️ BunnyMoTags Character Data</span>
                    </div>
                    <div class="mes_reasoning_arrow fa-solid fa-caret-up"></div>
                </div>
            </summary>
            <div class="mes_reasoning">
                ${characterSections}
            </div>
        </details>
    `;
}

// Initialize BunnyMoTags block interactivity
function initializeBunnyMoTagsInteractivity(mesText) {
    // Add click handlers for character sections
    const characterSections = mesText.querySelectorAll('.bunnymo-character-section');
    characterSections.forEach(section => {
        const summary = section.querySelector('summary');
        if (summary) {
            summary.addEventListener('click', (e) => {
                // Add subtle animation
                setTimeout(() => {
                    const content = section.querySelector('div');
                    if (content) {
                        content.style.opacity = section.open ? '1' : '0.7';
                        content.style.transform = section.open ? 'translateY(0)' : 'translateY(-5px)';
                    }
                }, 50);
            });
        }
    });
}

// ============================================================================
// CONTEXT FILTERING SYSTEM
// ============================================================================
// Removes <BunnyMoTags> from AI context (similar to ST's reasoning filter)

/**
 * Removes BunnyMoTags from string for AI context (similar to removeReasoningFromString)
 * @param {string} str Input string that may contain BunnyMoTags
 * @returns {string} String with BunnyMoTags removed
 */
function removeBunnyMoTagsFromString(str) {
    const settings = extension_settings[extensionName];
    
    // Only filter if enabled (like ST's auto_parse setting)
    if (!settings.enabled || !settings.filterFromContext) {
        return str;
    }
    
    // Remove <BunnyMoTags>...</BunnyMoTags> blocks from content
    const filteredStr = str.replace(/<BunnyMoTags>[\s\S]*?<\/BunnyMoTags>/g, '');
    
    // Clean up any extra whitespace left behind
    return filteredStr.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * Hook into ST's message processing to filter BunnyMoTags from AI context
 * This needs to be called before messages are sent to the AI
 */
function initializeBunnyMoTagsContextFiltering() {
    // Try to hook into the Generate function - it might not be available immediately
    const originalGenerate = window.Generate || globalThis.Generate;
    if (typeof originalGenerate === 'function') {
        window.Generate = async function(...args) {
            // Filter BunnyMoTags from context before generation
            const settings = extension_settings[extensionName];
            let originalMessages = null;

            if (settings.enabled && settings.filterFromContext) {
                // Process chat messages to remove BunnyMoTags from AI context
                if (chat && Array.isArray(chat)) {
                    // Temporarily filter BunnyMoTags from message content for AI context
                    originalMessages = chat.map(msg => ({
                        ...msg,
                        originalMes: msg.mes
                    }));
                    
                    chat.forEach(msg => {
                        if (msg.mes && typeof msg.mes === 'string') {
                            msg.mes = removeBunnyMoTagsFromString(msg.mes);
                        }
                    });
                }
            }
            
            try {
                // Call original Generate function
                return await originalGenerate.apply(this, args);
            } finally {
                // Restore original messages after generation
                if (originalMessages) {
                    originalMessages.forEach((originalMsg, index) => {
                        if (chat[index] && originalMsg.originalMes) {
                            chat[index].mes = originalMsg.originalMes;
                        }
                    });
                }
            }
        };
        
        CarrotDebug.init('✅ BunnyMoTags context filtering initialized');
    } else {
        // This is not an error - Generate function may not be available yet or ST may use a different approach
        // Context filtering is optional, so just log as debug info
        CarrotDebug.init('ℹ️ Generate function not available - BunnyMoTags context filtering skipped (optional feature)');
    }
}

// OLD CHARACTER CONSISTENCY PIPELINE REMOVED - Now using WORLD_INFO_ACTIVATED event system

// =============================================================================
// UI UPDATES SYSTEM 🥕
// Now loaded from ./ui-updates.js
// Includes: updateStatusPanels
// =============================================================================


// =============================================================================
// POPUP UTILITIES 🥕
// Show/hide popup overlays for various UI components
// =============================================================================

// Show a popup overlay with title and content
function showCarrotPopup(title, content) {
    CarrotDebug.ui('showPopup called with title:', title);
    CarrotDebug.ui('Content length:', content?.length);
    CarrotDebug.ui('Is mobile?', window.innerWidth <= 768);

    // DEBUG: Check if popup elements exist
    const overlay = document.getElementById('carrot-popup-overlay');
    const container = document.getElementById('carrot-popup-container');
    CarrotDebug.ui('Elements exist?', { overlay: !!overlay, container: !!container });
    CarrotDebug.ui('Overlay display:', overlay ? overlay.style.display : 'N/A');
    CarrotDebug.ui('Container classes:', container ? container.className : 'N/A');

    // For repository browser, inject content directly
    if (content.includes('carrot-repo-browser') || content.includes('carrot-github-browser') || title.includes('BunnyMo Repository')) {
        CarrotDebug.ui('Setting up repository browser popup');
        const $container = $('#carrot-popup-container');
        $container.html(content);
        $container.addClass('carrot-repo-browser-popup');

        // Set mobile-responsive sizing matching ST's large_dialogue_popup
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            $container.css({
                'width': '100vw',
                'height': '100vh',
                'max-width': '100vw',
                'max-height': '100vh',
                'border-radius': '0',
                'margin': '0'
            });
            // Use dvh if supported for better mobile browser support
            if (CSS.supports('height', '100dvh')) {
                $container.css({
                    'height': '100dvh',
                    'max-height': '100dvh'
                });
            }
            CarrotDebug.ui('MOBILE: Container set to full viewport');
        } else {
            // Match ST's large_dialogue_popup sizing: 90vh/dvh height, 90vw/dvw max-width
            $container.css({
                'width': '90vw',
                'height': '90vh',
                'max-width': '90vw',
                'max-height': '90vh'
            });
            // Use dvh/dvw if supported for consistency with ST
            if (CSS.supports('height', '90dvh')) {
                $container.css({
                    'height': '90dvh',
                    'max-height': '90dvh',
                    'width': '90dvw',
                    'max-width': '90dvw'
                });
            }
            CarrotDebug.ui('DESKTOP: Container set to large size (90vh/vw)');
        }
    } else {
        // For other popups, use the wrapped structure
        const popup = `
            <div class="carrot-popup-content">
                <div class="carrot-popup-header">
                    <h4>${title}</h4>
                    <button onclick="closeCarrotPopup()" class="carrot-popup-close">✕</button>
                </div>
                <div class="carrot-popup-body">
                    ${content}
                </div>
            </div>
        `;
        $('#carrot-popup-container').html(popup);
        $('#carrot-popup-container').removeClass('carrot-repo-browser-popup');

        // Apply responsive sizing for regular popups too
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            $('#carrot-popup-container').css({
                'width': '100vw',
                'height': '100vh',
                'max-width': '100vw',
                'max-height': '100vh',
                'border-radius': '0'
            });
            // Use dvh if supported for better mobile browser support
            if (CSS.supports('height', '100dvh')) {
                $('#carrot-popup-container').css({
                    'height': '100dvh',
                    'max-height': '100dvh'
                });
            }
        } else {
            // For desktop, use reasonable sizing (not as large as repository browser)
            $('#carrot-popup-container').css({
                'max-width': '90vw',
                'max-height': '90vh'
            });
            if (CSS.supports('height', '90dvh')) {
                $('#carrot-popup-container').css({
                    'max-height': '90dvh',
                    'max-width': '90dvw'
                });
            }
        }
    }

    // Force overlay to be visible with explicit styles
    const $overlay = $('#carrot-popup-overlay');
    $overlay.css({
        'display': 'flex',
        'width': '100vw',
        'height': '100vh',
        'position': 'fixed',
        'top': '0',
        'left': '0',
        'z-index': '999998',
        'pointer-events': 'auto'
    });
    $overlay.addClass('active');

    // Force container to be interactive
    const $container = $('#carrot-popup-container');
    $container.css({
        'z-index': '999999',
        'pointer-events': 'auto'
    });

    // NUCLEAR: Force all children to be interactive
    setTimeout(() => {
        $container.find('*').css('pointer-events', 'auto');
    }, 50);

    CarrotDebug.ui('After setting overlay styles:', {
        display: $overlay.css('display'),
        width: $overlay.css('width'),
        height: $overlay.css('height'),
        position: $overlay.css('position')
    });
}

// Close the popup overlay
function closeCarrotPopup() {
    $('#carrot-popup-overlay').removeClass('active');
    $('#carrot-popup-container').removeClass('carrot-repo-browser-popup');
    setTimeout(() => {
        $('#carrot-popup-overlay').hide();
        $('.carrot-tutorial-highlight').removeClass('carrot-tutorial-highlight');

        // Clean up popup content to prevent state issues on reopen
        $('#carrot-popup-container').empty();

        // Reset template editor instance so it reinitializes cleanly next time
        if (carrotTemplatePromptEditInterface) {
            carrotTemplatePromptEditInterface = null;
        }
    }, 300);
}

// Make popup utilities globally accessible
window.showCarrotPopup = showCarrotPopup;
window.closeCarrotPopup = closeCarrotPopup;

// Chunk Visualizer (RAG chunk editor/viewer)
// Wrapper function to call the chunk-visualizer.js module
function openChunkVisualizer(collectionId) {
    CarrotDebug.ui(`Opening chunk visualizer for collection: ${collectionId}`);
    openChunkVisualizerModule(collectionId);
}

// Baby Bunny tutorial launcher (creates a simple tutorial about Baby Bunny Mode)
function openBabyBunnyTutorial() {
    CarrotDebug.ui('Opening Baby Bunny Mode tutorial');
    // For now, show a simple popup explaining Baby Bunny Mode
    // TODO: Create dedicated tutorial sequence in tutorials.js
    showCarrotPopup('Baby Bunny Mode Tutorial 🐰', `
        <div style="padding: 20px; max-width: 600px; margin: auto;">
            <h3>What is Baby Bunny Mode?</h3>
            <p>Baby Bunny Mode is a guided automation system that helps you process character sheets efficiently.</p>

            <h4 style="margin-top: 20px;">How It Works:</h4>
            <ol>
                <li><strong>Automatic Detection:</strong> Detects when the AI generates character sheets in response to commands</li>
                <li><strong>Smart Recognition:</strong> Identifies fullsheet, tagsheet, and quicksheet formats</li>
                <li><strong>One-Click Processing:</strong> Click the 🐰 button to process detected sheets</li>
                <li><strong>Batch Mode:</strong> Process multiple character sheets at once</li>
            </ol>

            <h4 style="margin-top: 20px;">Supported Commands:</h4>
            <ul>
                <li><code>!fullsheet [character name]</code> - Complete character data</li>
                <li><code>!tagsheet [character name]</code> - BunnymoTags format</li>
                <li><code>!quicksheet [character name]</code> - Quick reference</li>
            </ul>
        </div>
    `);
}

// Note: Repository functions now exported from repository-manager.js
// Window assignments for onclick handlers are in repository-manager.js

// =============================================================================
// GLOBAL CARROTKERNEL API OBJECT 🥕
// Central API for UI interactions, tutorials, scanning, and testing
// =============================================================================

// Global CarrotKernel object for UI interactions
// Tutorial methods now in tutorials.js - delegating to imported functions for backward compatibility



// Open template manager - beautiful UI with reliable functionality
function openTemplateManager() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        showCarrotPopup('CarrotKernel Disabled', `
            <p>CarrotKernel is currently disabled. Please enable it first to manage templates.</p>
            <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
        `);
        return;
    }
    
    showTemplateManagerInterface();
}

// Open pack manager for BunnyMo pack installation and updates
async function openPackManager() {
    CarrotDebug.repo('OPEN PACK MANAGER: Function called!');
    CarrotDebug.repo('Window width:', window.innerWidth);

    // Prevent multiple simultaneous opens
    if (_packManagerOpening) {
        CarrotDebug.repo('Already opening, ignoring duplicate call');
        return;
    }

    const settings = extension_settings[extensionName];
    CarrotDebug.repo('Settings enabled?', settings?.enabled);

    if (!settings.enabled) {
        CarrotDebug.repo('Extension disabled - showing error popup');
        showCarrotPopup('CarrotKernel Disabled', `
            <p>CarrotKernel is currently disabled. Please enable it first to manage packs.</p>
            <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
        `);
        return;
    }

    setPackManagerOpening(true);
    try {
        await showPackManagerInterface();
    } finally {
        setPackManagerOpening(false);
    }

// Show BunnyMoTags template manager (copied from your BunnyMoTags code)
}
function showTemplateManagerInterface() {
    // Implementation will use BunnyMoTags approach directly
    openTemplateEditor();
}

function openTemplateEditor() {
    const templates = CarrotTemplateManager.getTemplates();
    const templateKeys = Object.keys(templates);

    if (templateKeys.length === 0) {
        CarrotDebug.error('No templates available');
        return;
    }
    
    // Start with the first template or current primary
    const primaryTemplate = CarrotTemplateManager.getPrimaryTemplate();
    let selectedTemplateKey = templateKeys[0];
    if (primaryTemplate) {
        const primaryKey = Object.entries(templates).find(([k, v]) => 
            v.name === primaryTemplate.name || v.label === primaryTemplate.label || v.name === primaryTemplate.label
        )?.[0];
        if (primaryKey) selectedTemplateKey = primaryKey;
    }
    
    showTemplateEditor(selectedTemplateKey, templates);
}


// Template editor interface (module-level to persist across calls)
let carrotTemplatePromptEditInterface = null;

// Open template editor with selected template
function showTemplateEditor(selectedKey, allTemplates) {
    if (!carrotTemplatePromptEditInterface) {
        carrotTemplatePromptEditInterface = new CarrotTemplatePromptEditInterface();
    }

    carrotTemplatePromptEditInterface.selectedTemplate = selectedKey;
    carrotTemplatePromptEditInterface.show();
}

// Show GitHub repository browser interface
async function showPackManagerInterface() {
    // Show loading popup while scanning
    showCarrotPopup('BunnyMo Repository Browser', `
        <div class="carrot-github-browser">
            <div class="carrot-loading-state">
                <div class="carrot-spinner"></div>
                <p>Loading BunnyMo repository...</p>
                <div class="carrot-scan-progress">
                    <div>🔍 Connecting to GitHub</div>
                    <div>📂 Reading repository structure</div>
                    <div>🏷️ Checking for updates</div>
                </div>
            </div>
        </div>
    `);
    
    try {
        // Initialize the GitHub browser
        if (!githubBrowser) {
            CarrotDebug.repo('Creating new GitHub browser');
            githubBrowser = new CarrotGitHubBrowser();
        }

        CarrotDebug.repo('Starting loadRepository()');

        // Load the repository structure with timeout
        const loadPromise = githubBrowser.loadRepository();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Repository loading timed out after 30 seconds')), 30000)
        );

        await Promise.race([loadPromise, timeoutPromise]);
        CarrotDebug.repo('loadRepository() completed');

        // Show the browser interface
        CarrotDebug.repo('Showing browser content');
        await showGitHubBrowserContent();
        CarrotDebug.repo('Browser content displayed');

    } catch (error) {
        CarrotDebug.error('PACK MANAGER ERROR:', error);
        CarrotDebug.error('GitHub browser error:', error);
        showCarrotPopup('Repository Connection Error', `
            <div class="carrot-error-panel">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>Unable to Connect to BunnyMo Repository</h3>
                <p>Failed to load repository structure from GitHub:</p>
                <div class="carrot-error-details">${error.message}</div>
                <div class="carrot-error-actions">
                    <button class="carrot-primary-btn" onclick="CarrotKernel.openPackManager()">
                        <i class="fa-solid fa-rotate-right"></i> Retry
                    </button>
                </div>
            </div>
        `);
    }

// Show GitHub repository browser content - CarrotKernel Style
}
async function showGitHubBrowserContent() {
    const content = `
        <div class="carrot-repo-browser">
            <!-- Repository Header Card -->
            <div class="carrot-repo-header-card">
                <div class="carrot-repo-header-content">
                    <div class="carrot-repo-title-section">
                        <div class="carrot-repo-icon">🥕</div>
                        <div class="carrot-repo-title-text">
                            <h2>BunnyMo Repository</h2>
                            <div class="carrot-repo-subtitle">GitHub Pack Browser</div>
                        </div>
                    </div>
                    <div class="carrot-repo-controls">
                        <button class="carrot-icon-btn carrot-refresh-btn" onclick="CarrotKernel.refreshRepository()" data-tooltip="Refresh repository">
                            <i class="fa-solid fa-sync-alt"></i>
                        </button>
                        <button class="carrot-icon-btn carrot-home-btn" onclick="CarrotKernel.navigateToRoot()" data-tooltip="Repository root">
                            <i class="fa-solid fa-home"></i>
                        </button>
                        <button class="carrot-icon-btn carrot-detect-btn" onclick="CarrotKernel.detectExistingPacks()" data-tooltip="Detect existing BunnyMo packs">
                            <i class="fa-solid fa-search"></i>
                        </button>
                        <button class="carrot-icon-btn carrot-close-btn" onclick="CarrotKernel.closePopup()" data-tooltip="Close repository browser">
                            <i class="fa-solid fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="carrot-repo-breadcrumb-container" id="carrot-breadcrumbs">
                    <!-- Breadcrumb navigation will be inserted here -->
                </div>
            </div>
            
            <!-- Main Content Area -->
            <div class="carrot-repo-main-content">
                <!-- File Browser Card -->
                <div class="carrot-repo-browser-card">
                    <div class="carrot-card-header">
                        <h3><i class="fa-solid fa-folder-open"></i> Repository Contents</h3>
                        <div class="carrot-card-subtitle" id="carrot-browser-stats">Loading...</div>
                    </div>
                    <div class="carrot-repo-file-list" id="carrot-file-list">
                        <!-- File/folder listing will be inserted here -->
                    </div>
                </div>
                
                <!-- Preview Card -->
                <div class="carrot-repo-preview-card">
                    <div class="carrot-card-header">
                        <h3><i class="fa-solid fa-eye"></i> Preview</h3>
                        <div class="carrot-card-subtitle">Pack information and contents</div>
                    </div>
                    <div class="carrot-repo-preview-content" id="carrot-file-preview">
                        <div class="carrot-preview-placeholder">
                            <div class="carrot-placeholder-icon">📂</div>
                            <div class="carrot-placeholder-text">
                                <h4>Select a pack to preview</h4>
                                <p>Click on any JSON file to see its contents and install it directly to your lorebooks</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Status Footer -->
            <div class="carrot-repo-footer">
                <div class="carrot-repo-footer-content">
                    <div class="carrot-repo-status-card">
                        <div class="carrot-repo-status">
                            <i class="fa-brands fa-github"></i>
                            <span>Connected to Coneja-Chibi/BunnyMo</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showCarrotPopup('🥕 BunnyMo Repository Browser', content);

    // Wait for DOM to be ready (especially important on mobile)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Load the root directory content
    try {
        CarrotDebug.repo('Navigating to root directory');
        await githubBrowser.navigateToPath('/');
        CarrotDebug.repo('Updating browser content');

        // Wait for DOM to be ready with retry
        let retries = 0;
        const maxRetries = 10;
        while (retries < maxRetries) {
            const fileList = document.getElementById('carrot-file-list');
            if (fileList) {
                await updateBrowserContent();
                CarrotDebug.repo('Browser content updated successfully');
                break;
            }
            CarrotDebug.repo(`DOM not ready, retry ${retries + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (retries >= maxRetries) {
            throw new Error('DOM elements not found after waiting - popup may have failed to render');
        }
    } catch (error) {
        CarrotDebug.error('Failed to load directory content:', error);
        // Try to show error in the file list if it exists now
        setTimeout(() => {
            const fileList = document.getElementById('carrot-file-list');
            if (fileList) {
                fileList.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #ff6b6b;">
                        <i class="fa-solid fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
                        <p>Failed to load repository contents</p>
                        <p style="font-size: 12px; opacity: 0.7;">${error.message}</p>
                    </div>
                `;
            }
        }, 500);
    }

// Update browser content with current directory listing
}
async function updateBrowserContent() {
    const fileList = document.getElementById('carrot-file-list');
    const breadcrumbs = document.getElementById('carrot-breadcrumbs');

    CarrotDebug.repo('UPDATE CONTENT: Elements found?', {
        fileList: !!fileList,
        breadcrumbs: !!breadcrumbs
    });

    if (!fileList) {
        throw new Error('carrot-file-list element not found in DOM - popup may not have rendered yet');
    }
    if (!breadcrumbs) {
        throw new Error('carrot-breadcrumbs element not found in DOM - popup may not have rendered yet');
    }
    const statsEl = document.getElementById('carrot-browser-stats');
    
    if (!githubBrowser || !fileList) return;

    const currentPath = githubBrowser.currentPath;
    const items = githubBrowser.currentItems || [];
    
    // Update breadcrumbs
    if (breadcrumbs) {
        breadcrumbs.innerHTML = generateBreadcrumbs(currentPath);
    }
    
    // Show loading while generating file list with update detection
    fileList.innerHTML = `
        <div class="carrot-loading-state">
            <div class="carrot-spinner"></div>
            <p>Checking for updates...</p>
        </div>
    `;
    
    // Update file listing with update detection (async)
    fileList.innerHTML = await generateFileList(items);
    
    // Scan for existing packs before counting (only do this once)
    if (!hasScannedExisting) {
        await scanExistingLorebooks();
        hasScannedExisting = true;
    }
    
    // Update stats with update info
    if (statsEl) {
        const folders = items.filter(item => item.type === 'dir').length;
        const files = items.filter(item => item.type === 'file').length;
        const jsonFiles = items.filter(item => item.type === 'file' && item.name.endsWith('.json'));
        
        let updatesAvailable = 0;
        let installedPacks = 0;
        
        for (const file of jsonFiles) {
            // Check if pack is installed (filename is the key used during installation)
            const isInstalled = extension_settings[extensionName]?.installedPacks?.[file.name];
            
            if (isInstalled) {
                installedPacks++;
                if (githubBrowser.hasUpdates && githubBrowser.hasUpdates(file.name, file.sha)) {
                    updatesAvailable++;
                }
            }
        }
        
        let statsText = `${folders} folders, ${files} files`;
        if (jsonFiles.length > 0) {
            statsText += ` • ${installedPacks}/${jsonFiles.length} packs installed`;
            if (updatesAvailable > 0) {
                statsText += ` • ${updatesAvailable} update${updatesAvailable === 1 ? '' : 's'} available`;
            }
        }
        
        statsEl.innerHTML = `<span>${statsText}</span>`;
    }

// Generate breadcrumb navigation with back button
}
function generateBreadcrumbs(path) {
    const parts = path.split('/').filter(part => part.length > 0);
    let breadcrumbPath = '';
    
    // Add back button if not at root
    let html = '';
    if (parts.length > 0) {
        const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
        html += `
            <button class="carrot-breadcrumb-btn carrot-back-btn" onclick="CarrotKernel.navigateToPath('${parentPath}')" data-tooltip="Go back">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <span class="carrot-breadcrumb-separator">|</span>
        `;
    }
    
    // Add home button
    html += `<button class="carrot-breadcrumb-btn ${parts.length === 0 ? 'active' : ''}" onclick="CarrotKernel.navigateToPath('/')" ${parts.length === 0 ? 'disabled' : ''}>
        <i class="fa-solid fa-home"></i> BunnyMo
    </button>`;
    
    // Add folder hierarchy
    parts.forEach((part, index) => {
        breadcrumbPath += '/' + part;
        const isLast = index === parts.length - 1;
        
        html += `
            <span class="carrot-breadcrumb-separator">/</span>
            <button class="carrot-breadcrumb-btn ${isLast ? 'active' : ''}" 
                    onclick="CarrotKernel.navigateToPath('${breadcrumbPath}')"
                    ${isLast ? 'disabled' : ''}>
                📁 ${part}
            </button>
        `;
    });
    
    return html;
}

// Generate file/folder listing with update detection
async function generateFileList(items) {
    if (!items || items.length === 0) {
        return `
            <div class="carrot-empty-folder">
                <div class="carrot-placeholder-icon">📁</div>
                <div class="carrot-placeholder-text">
                    <h4>This folder is empty</h4>
                    <p>No files or folders found in this directory</p>
                </div>
            </div>
        `;
    }
    
    // Sort items: folders first, then files, both alphabetically
    const sortedItems = [...items].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });
    
    let html = '';
    
    for (const item of sortedItems) {
        const isFile = item.type === 'file';
        const isJsonFile = isFile && item.name.toLowerCase().endsWith('.json');
        const isReadmeFile = isFile && item.name.toLowerCase().startsWith('readme');
        const size = item.size ? formatFileSize(item.size) : '';
        
        let fileTypeClass = isFile ? 'file' : 'folder';
        if (isJsonFile) fileTypeClass += ' json-file';
        if (isReadmeFile) fileTypeClass += ' readme-file';
        
        // Check for updates
        let hasUpdates = false;
        let isInstalled = false;
        let updateIndicator = '';
        
        if (isJsonFile) {
            isInstalled = await checkPackInstalled(item.name);
            hasUpdates = githubBrowser.hasUpdates(item.name, item.sha);
            
            if (hasUpdates) {
                fileTypeClass += ' has-updates';
                updateIndicator = '<div class="carrot-update-badge" data-tooltip="Update Available">🔄</div>';
            } else if (isInstalled) {
                fileTypeClass += ' is-installed';
                updateIndicator = '<div class="carrot-installed-badge" data-tooltip="Installed">✅</div>';
            }
        } else if (item.type === 'dir') {
            // Check if folder contains files with updates
            const folderHasUpdates = await githubBrowser.folderHasUpdates(item.path);
            if (folderHasUpdates) {
                fileTypeClass += ' folder-has-updates';
                updateIndicator = '<div class="carrot-folder-update-glow" data-tooltip="Contains Updates">✨</div>';
            }
        }
        
        let fileIcon = '<i class="fa-solid fa-folder"></i>';
        if (isFile) {
            if (isJsonFile) fileIcon = '<i class="fa-solid fa-file-code"></i>';
            else if (isReadmeFile) fileIcon = '<i class="fa-solid fa-file-text"></i>';
            else fileIcon = '<i class="fa-solid fa-file"></i>';
        }
        
        let fileTypeLabel = '';
        if (item.type === 'dir') fileTypeLabel = 'Folder';
        else if (isJsonFile) {
            if (hasUpdates) fileTypeLabel = 'Update Available';
            else if (isInstalled) fileTypeLabel = 'Installed Pack';
            else fileTypeLabel = 'BunnyMo Pack';
        } else if (isReadmeFile) fileTypeLabel = 'Documentation';
        else fileTypeLabel = 'File';
        
        html += `
            <div class="carrot-repo-file-item ${fileTypeClass}" 
                 data-path="${item.path}" 
                 data-type="${item.type}"
                 onclick="CarrotKernel.handleFileClick('${item.path}', '${item.type}', '${item.name}')">
                
                <div class="carrot-file-icon">
                    ${fileIcon}
                    ${updateIndicator}
                </div>
                
                <div class="carrot-file-info">
                    <div class="carrot-file-name">${item.name}</div>
                    <div class="carrot-file-details">
                        ${size ? `<span class="carrot-file-size">${size}</span>` : ''}
                        <span class="carrot-file-type">${fileTypeLabel}</span>
                    </div>
                </div>
                
                <div class="carrot-file-actions">
                    ${isJsonFile ? `
                        <button class="carrot-icon-btn ${hasUpdates ? 'update-btn' : ''}" 
                                onclick="event.stopPropagation(); event.preventDefault(); CarrotKernel.installPackDirectly('${item.path}', '${item.name}'); return false;" 
                                data-tooltip="${hasUpdates ? 'Update Pack' : isInstalled ? 'Reinstall Pack' : 'Install Pack'}">
                            <i class="fa-solid fa-${hasUpdates ? 'sync-alt' : 'download'}"></i>
                        </button>
                    ` : ''}
                    ${(isFile && !isJsonFile) ? `
                        <button class="carrot-icon-btn" onclick="event.stopPropagation(); CarrotKernel.previewFile('${item.path}', '${item.name}')" 
                                data-tooltip="View File">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    ` : ''}
                    ${item.type === 'dir' ? `
                        <button class="carrot-icon-btn" onclick="event.stopPropagation(); CarrotKernel.navigateToPath('${item.path}')" 
                                data-tooltip="Open Folder">
                            <i class="fa-solid fa-folder-open"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    return html;
}

// Handle file/folder clicks
async function handleFileClick(path, type, name) {
    if (type === 'dir') {
        await navigateToPath(path);
    } else if (type === 'file') {
        // Preview any file type - JSON packs or README files
        await previewFile(path, name);
    }

// Navigate to specific path
}
async function navigateToPath(path) {
    try {
        await githubBrowser.navigateToPath(path);
        await updateBrowserContent();
    } catch (error) {
        CarrotDebug.error('Navigation error:', error);
        toastr.error('Failed to navigate to folder: ' + error.message);
    }

// Navigate to repository root
}
async function navigateToRoot() {
    await navigateToPath('/');
}

// Refresh repository
async function refreshRepository() {
    try {
        await githubBrowser.loadRepository();
        await updateBrowserContent();
        toastr.success('Repository refreshed');
    } catch (error) {
        CarrotDebug.error('Refresh error:', error);
        toastr.error('Failed to refresh repository: ' + error.message);
    }

// Manually trigger detection of existing packs
}
async function detectExistingPacks() {
    const button = document.querySelector('.carrot-detect-btn');
    if (button) {
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        button.disabled = true;
    }
    
    try {
        const foundCount = await scanExistingLorebooks();
        // Refresh the display to show updated counts
        await updateBrowserContent();
        
        if (foundCount > 0) {
            toastr.success(`Detected and tracked ${foundCount} existing pack${foundCount === 1 ? '' : 's'}!`);
        } else {
            toastr.info('No additional BunnyMo packs detected in your lorebooks');
        }
    } catch (error) {
        CarrotDebug.error('Failed to detect existing packs:', error);
        toastr.error('Failed to detect existing packs: ' + error.message);
    } finally {
        if (button) {
            button.innerHTML = '<i class="fa-solid fa-search"></i>';
            button.disabled = false;
        }
    }

// Show installation dialog and install pack
}
async function downloadFile(path, filename) {
    // Show beautiful installation dialog
    showPackInstallDialog(path, filename);
}

// Beautiful pack installation dialog
async function showPackInstallDialog(path, filename) {
    const cleanName = filename.replace('.json', '');
    
    // Create installation dialog
    const dialogContent = `
        <div class="carrot-install-dialog">
            <div class="carrot-install-header">
                <div class="carrot-install-icon">🎯</div>
                <div class="carrot-install-title">
                    <h3>Install BunnyMo Pack</h3>
                    <div class="carrot-install-subtitle">Adding to your SillyTavern lorebooks</div>
                </div>
            </div>
            
            <div class="carrot-install-content">
                <div class="carrot-pack-info">
                    <div class="carrot-pack-name">${cleanName}</div>
                    <div class="carrot-pack-status">
                        <i class="fa-solid fa-download"></i>
                        <span>Ready to install</span>
                    </div>
                </div>
                
                <div class="carrot-install-progress" id="carrot-install-progress" style="display: none;">
                    <div class="carrot-progress-bar">
                        <div class="carrot-progress-fill" id="carrot-progress-fill"></div>
                    </div>
                    <div class="carrot-progress-text" id="carrot-progress-text">Preparing installation...</div>
                </div>
            </div>
            
            <div class="carrot-install-actions">
                <button class="carrot-secondary-btn" onclick="CarrotKernel.closeInstallDialog()" id="carrot-cancel-btn">
                    Cancel
                </button>
                <button class="carrot-primary-btn" onclick="CarrotKernel.executeInstall('${path}', '${filename}')" id="carrot-install-btn">
                    <i class="fa-solid fa-download"></i> Install Pack
                </button>
            </div>
        </div>
    `;
    
    showCarrotPopup('🥕 Pack Installation', dialogContent);
}

// Check if a pack is already installed in ST's lorebooks
async function checkPackInstalled(filename) {
    CarrotDebug.repo('PACK DETECTION STARTED');
    CarrotDebug.repo('Checking pack installation for:', filename);

    try {
        // Dynamically import ST's world-info functions
        const worldInfoModule = await import('../../../world-info.js');
        CarrotDebug.repo('World-info module imported:', Object.keys(worldInfoModule));

        const { world_names } = worldInfoModule;
        CarrotDebug.repo('Available world_names:', {
            type: typeof world_names,
            length: world_names?.length,
            names: world_names
        });

        // Remove .json extension and check various name formats
        const baseName = filename.replace('.json', '');
        const possibleNames = [
            baseName,
            filename,
            baseName.toLowerCase(),
            filename.toLowerCase(),
            baseName.replace(/[^\w\s-]/g, ''), // Remove special chars
            baseName.replace(/\s+/g, '_'), // Replace spaces with underscores
            baseName.replace(/\s+/g, '-'), // Replace spaces with dashes
            baseName.replace(/[^a-zA-Z0-9]/g, ''), // Remove all non-alphanumeric
        ];

        CarrotDebug.repo('Checking possible names:', possibleNames);

        // Check each possible name individually for better debugging
        const matches = [];
        for (const name of possibleNames) {
            const found = world_names.includes(name);
            if (found) {
                matches.push(name);
            }
            CarrotDebug.repo(`"${name}" found: ${found}`);
        }

        const isInstalled = matches.length > 0;
        CarrotDebug.repo('Pack installed?', isInstalled);
        CarrotDebug.repo('Matching names:', matches);

        return isInstalled;

    } catch (error) {
        CarrotDebug.error('Pack detection failed:', error);
        CarrotDebug.error('Error stack:', error.stack);
        CarrotDebug.error('Failed to check pack installation status:', error);
        return false;
    } finally {
        CarrotDebug.repo('PACK DETECTION ENDED');
    }

// Install pack using native ST lorebook system
}
async function installPackNative(downloadUrl, filename) {
    CarrotDebug.repo('NATIVE INSTALLATION STARTED');
    CarrotDebug.repo('installPackNative called:', { downloadUrl, filename });

    try {
        CarrotDebug.repo(`🚀 Installing pack: ${filename}`);

        // Convert GitHub API download_url to raw.githubusercontent.com format
        // GitHub's download_url sometimes returns HTML instead of raw content
        let rawUrl = downloadUrl;
        if (downloadUrl.includes('github.com') && !downloadUrl.includes('raw.githubusercontent.com')) {
            // Convert: https://api.github.com/repos/owner/repo/contents/path
            // To: https://raw.githubusercontent.com/owner/repo/branch/path
            const urlParts = downloadUrl.match(/github\.com\/repos\/([^\/]+)\/([^\/]+)\/contents\/(.+)/);
            if (urlParts) {
                const [, owner, repo, path] = urlParts;
                rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${githubBrowser.githubBranch}/${path}`;
                CarrotDebug.repo('Converted to raw URL:', rawUrl);
            }
        }

        CarrotDebug.repo('Step A: Downloading JSON file from:', rawUrl);
        // Download the JSON file
        const response = await fetch(rawUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*'
            },
            cache: 'no-cache'
        });
        CarrotDebug.repo('Response status:', response.status);
        CarrotDebug.repo('Response content-type:', response.headers.get('content-type'));

        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
        }

        // Parse as JSON first to validate structure
        CarrotDebug.repo('Step A1: Parsing JSON...');
        let parsedJson;
        try {
            parsedJson = await response.json();
            CarrotDebug.repo('JSON parsed successfully. Keys:', Object.keys(parsedJson));
        } catch (parseError) {
            CarrotDebug.error('JSON parse failed:', parseError);
            throw new Error(`Invalid JSON data: ${parseError.message}`);
        }

        // Validate it's a proper world info structure
        if (!parsedJson.entries || typeof parsedJson.entries !== 'object') {
            throw new Error('Downloaded file is not a valid SillyTavern lorebook (missing entries)');
        }

        // Convert back to formatted JSON string for the File object
        const jsonData = JSON.stringify(parsedJson, null, 2);
        CarrotDebug.repo('Downloaded data:', {
            length: jsonData.length,
            entryCount: Object.keys(parsedJson.entries).length
        });

        CarrotDebug.repo('Step B: Creating File object...');
        // Create a File object (simulating file upload)
        const blob = new Blob([jsonData], { type: 'application/json' });
        const file = new File([blob], filename, { type: 'application/json' });
        CarrotDebug.repo('Created File object:', { name: file.name, size: file.size, type: file.type });

        CarrotDebug.repo('Step C: Importing world-info module...');
        // Dynamically import ST's world-info functions
        const worldInfoModule = await import('../../../world-info.js');
        CarrotDebug.repo('World-info module imported:', Object.keys(worldInfoModule));

        const { importWorldInfo } = worldInfoModule;
        const updateWorldInfoList = worldInfoModule.updateWorldInfoList; // May be undefined in older ST versions
        CarrotDebug.repo('Functions available:', {
            importWorldInfo: typeof importWorldInfo,
            updateWorldInfoList: typeof updateWorldInfoList
        });

        CarrotDebug.repo('Step D: Calling importWorldInfo...');
        // Import using ST's native system
        let importResult;
        try {
            importResult = await importWorldInfo(file);
            CarrotDebug.repo('Import result:', importResult);
        } catch (importError) {
            CarrotDebug.error('importWorldInfo failed:', importError);
            CarrotDebug.error('Error details:', {
                message: importError.message,
                stack: importError.stack,
                file: { name: file.name, size: file.size, type: file.type }
            });
            throw new Error(`Failed to import lorebook: ${importError.message}`);
        }

        CarrotDebug.repo('Step E: Updating world info list...');
        // Refresh ST's lorebook list (only if function exists)
        if (typeof updateWorldInfoList === 'function') {
            try {
                const updateResult = await updateWorldInfoList();
                CarrotDebug.repo('Update result:', updateResult);
            } catch (updateError) {
                CarrotDebug.error('updateWorldInfoList failed (non-critical):', updateError);
                // Non-critical - continue even if this fails
            }
        } else {
            CarrotDebug.repo('updateWorldInfoList not available (older ST version) - skipping refresh');
        }

        // Track the installation in our settings
        // CRITICAL: Never overwrite extension_settings completely
        if (!extension_settings[extensionName]) {
            CarrotDebug.error('extension_settings not initialized - this should not happen');
            extension_settings[extensionName] = {};
        }
        if (!extension_settings[extensionName].installedPacks) {
            extension_settings[extensionName].installedPacks = {};
        }

        // Use the actual filename as the key (what the counting logic expects)
        extension_settings[extensionName].installedPacks[filename] = {
            displayName: filename.replace('.json', ''),
            filename: filename,
            installedDate: Date.now(),
            size: jsonData.length,
            method: 'native'
        };
        
        // Save settings
        saveSettingsDebounced();

        CarrotDebug.repo('Native installation completed successfully');
        CarrotDebug.repo(`✅ Successfully installed: ${filename}`);
        toastr.success(`Installed ${filename} to your lorebooks!`);

        return true;

    } catch (error) {
        CarrotDebug.error('Native installation failed:', error);
        CarrotDebug.error('Error stack:', error.stack);
        CarrotDebug.error(`Failed to install pack: ${error.message}`, error);
        toastr.error(`Installation failed: ${error.message}`);
        return false;
    } finally {
        CarrotDebug.repo('NATIVE INSTALLATION ENDED');
    }

// Install pack directly from GitHub (bypassing dialog)
}
async function installPackDirectly(path, filename) {
    CarrotDebug.repo('DIRECT INSTALLATION STARTED');
    CarrotDebug.repo('installPackDirectly called:', { path, filename });
    CarrotDebug.repo('User Agent:', navigator.userAgent);
    CarrotDebug.repo('Current URL:', window.location.href);

    try {
        CarrotDebug.repo('Step 1: Getting download URL...');
        const downloadUrl = await githubBrowser.getDownloadUrl(path);
        CarrotDebug.repo('Download URL obtained:', downloadUrl);

        CarrotDebug.repo('Step 2: Calling installPackNative...');
        const success = await installPackNative(downloadUrl, filename);
        CarrotDebug.repo('Installation result:', success);

        if (success) {
            CarrotDebug.repo('Step 3: Refreshing browser content...');
            // Refresh the file list to update status indicators
            await updateBrowserContent();
            CarrotDebug.repo('Direct installation completed successfully');
        } else {
            CarrotDebug.repo('Installation reported failure');
        }

    } catch (error) {
        CarrotDebug.error('Direct installation failed:', error);
        CarrotDebug.error('Error stack:', error.stack);
        CarrotDebug.error('Direct installation failed:', error);
        toastr.error(`Failed to install ${filename}: ${error.message}`);
    }

    CarrotDebug.repo('DIRECT INSTALLATION ENDED');
}

// Scan existing lorebooks to retroactively track installed packs
async function scanExistingLorebooks() {
    CarrotDebug.repo('Scanning existing lorebooks for BunnyMo packs...');

    try {
        // Get all existing world info (lorebooks)
        const { world_names } = await import('../../../world-info.js');
        const existingBooks = world_names || [];

        // CRITICAL: Never overwrite extension_settings completely
        if (!extension_settings[extensionName]) {
            CarrotDebug.error('extension_settings not initialized - this should not happen');
            extension_settings[extensionName] = {};
        }
        if (!extension_settings[extensionName].installedPacks) {
            extension_settings[extensionName].installedPacks = {};
        }

        let foundPacks = 0;

        for (const bookName of existingBooks) {
            // Check if this looks like a BunnyMo pack by name
            const isBunnyMoPack = bookName.toLowerCase().includes('bunnymo') ||
                                 bookName.toLowerCase().includes('dere') ||
                                 bookName.toLowerCase().includes('pack');

            if (isBunnyMoPack) {
                // Generate a filename-like key
                let filename = bookName.endsWith('.json') ? bookName : `${bookName}.json`;

                // Only track if not already tracked
                if (!extension_settings[extensionName].installedPacks[filename]) {
                    extension_settings[extensionName].installedPacks[filename] = {
                        displayName: bookName,
                        filename: filename,
                        installedDate: Date.now(),
                        size: 0, // Unknown size for existing books
                        method: 'existing',
                        detected: true
                    };

                    foundPacks++;
                    CarrotDebug.repo(`Detected existing pack: ${bookName}`);
                }
            }
        }

        if (foundPacks > 0) {
            saveSettingsDebounced();
            CarrotDebug.repo(`Retroactively tracked ${foundPacks} existing packs`);
            toastr.info(`Found and tracked ${foundPacks} existing BunnyMo pack${foundPacks === 1 ? '' : 's'}`);
        } else {
            CarrotDebug.repo('No existing BunnyMo packs detected');
        }

        return foundPacks;

    } catch (error) {
        CarrotDebug.error('Failed to scan existing lorebooks:', error);
        return 0;
    }

// Execute the actual installation
}
async function executeInstall(path, filename) {
    const progressEl = document.getElementById('carrot-install-progress');
    const progressFillEl = document.getElementById('carrot-progress-fill');
    const progressTextEl = document.getElementById('carrot-progress-text');
    const installBtn = document.getElementById('carrot-install-btn');
    const cancelBtn = document.getElementById('carrot-cancel-btn');
    
    try {
        // Show progress
        progressEl.style.display = 'block';
        installBtn.disabled = true;
        cancelBtn.disabled = true;
        
        // Step 1: Download
        progressTextEl.textContent = 'Downloading pack from GitHub...';
        progressFillEl.style.width = '25%';
        
        const downloadUrl = await githubBrowser.getDownloadUrl(path);
        const response = await fetch(downloadUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Step 2: Parse
        progressTextEl.textContent = 'Processing pack data...';
        progressFillEl.style.width = '50%';
        
        const data = await response.json();
        const entries = data.entries || [];
        
        // Step 3: Install
        // Delegate to installPackNative(), which uses ST's actual /api/worldinfo/import
        // contract (a multipart file upload) instead of a raw JSON POST that endpoint rejects.
        progressTextEl.textContent = 'Installing to SillyTavern lorebooks...';
        progressFillEl.style.width = '75%';

        const cleanName = filename.replace('.json', '');
        const installed = await installPackNative(downloadUrl, filename);

        if (!installed) {
            throw new Error('Failed to install lorebook');
        }

        // Step 4: Track installation with SHA
        const currentItem = githubBrowser.currentItems.find(item => item.path === path);
        if (currentItem) {
            githubBrowser.trackPackInstallation(filename, currentItem.sha, currentItem.size);
            CarrotDebug.repo(`✅ Tracked installation: ${filename} (SHA: ${currentItem.sha})`);
        }
        
        progressTextEl.textContent = 'Installation complete!';
        progressFillEl.style.width = '100%';
        
        // Show success state
        setTimeout(() => {
            const dialogContent = `
                <div class="carrot-install-dialog">
                    <div class="carrot-install-header carrot-success">
                        <div class="carrot-install-icon">✅</div>
                        <div class="carrot-install-title">
                            <h3>Pack Installed Successfully!</h3>
                            <div class="carrot-install-subtitle">${cleanName} is now available in your lorebooks</div>
                        </div>
                    </div>
                    
                    <div class="carrot-install-content">
                        <div class="carrot-success-info">
                            <div class="carrot-success-stat">
                                <div class="carrot-stat-number">${entries.length}</div>
                                <div class="carrot-stat-label">Entries Added</div>
                            </div>
                            <div class="carrot-success-stat">
                                <div class="carrot-stat-number">${Math.round(JSON.stringify(data).length / 1024)}KB</div>
                                <div class="carrot-stat-label">Data Size</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="carrot-install-actions">
                        <button class="carrot-primary-btn" onclick="CarrotKernel.closePopup()">
                            <i class="fa-solid fa-check"></i> Done
                        </button>
                    </div>
                </div>
            `;
            
            showCarrotPopup('🎉 Installation Complete', dialogContent);
        }, 500);
        
        // Refresh ST's lorebook list
        await updateWorldInfoList();

    } catch (error) {
        CarrotDebug.error('Installation error:', error);
        
        // Show error state
        const dialogContent = `
            <div class="carrot-install-dialog">
                <div class="carrot-install-header carrot-error">
                    <div class="carrot-install-icon">❌</div>
                    <div class="carrot-install-title">
                        <h3>Installation Failed</h3>
                        <div class="carrot-install-subtitle">Unable to install the pack</div>
                    </div>
                </div>
                
                <div class="carrot-install-content">
                    <div class="carrot-error-details">
                        <strong>Error:</strong> ${error.message}
                    </div>
                </div>
                
                <div class="carrot-install-actions">
                    <button class="carrot-secondary-btn" onclick="CarrotKernel.showPackInstallDialog('${path}', '${filename}')">
                        <i class="fa-solid fa-redo"></i> Try Again
                    </button>
                    <button class="carrot-primary-btn" onclick="CarrotKernel.closePopup()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        showCarrotPopup('❌ Installation Failed', dialogContent);
    }

// Close installation dialog
}
function closeInstallDialog() {
    closeCarrotPopup();
    // Return to the browser
    showPackManagerInterface();
}

// Preview file content - supports JSON packs and README files
async function previewFile(path, filename) {
    const previewEl = document.getElementById('carrot-file-preview');
    if (!previewEl) return;
    
    const isJsonFile = filename.toLowerCase().endsWith('.json');
    const isReadmeFile = filename.toLowerCase().startsWith('readme');
    
    try {
        previewEl.innerHTML = `
            <div class="carrot-loading-state">
                <div class="carrot-spinner"></div>
                <p>Loading preview...</p>
            </div>
        `;
        
        const downloadUrl = await githubBrowser.getDownloadUrl(path);
        const response = await fetch(downloadUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (isJsonFile) {
            // Handle JSON pack preview
            const data = await response.json();
            
            // Handle SillyTavern's actual lorebook structure
            let entries = [];
            
            if (data.entries && typeof data.entries === 'object') {
                // SillyTavern format: {"entries": {"0": {...}, "1": {...}, ...}}
                entries = Object.values(data.entries);
            } else if (Array.isArray(data.entries)) {
                // Array format: {"entries": [{...}, {...}, ...]}
                entries = data.entries;
            } else if (Array.isArray(data)) {
                // Direct array: [{...}, {...}, ...]
                entries = data;
            } else if (data.world_info && data.world_info.entries && typeof data.world_info.entries === 'object') {
                // Nested object format
                entries = Object.values(data.world_info.entries);
            } else if (data.world_info && Array.isArray(data.world_info.entries)) {
                // Nested array format
                entries = data.world_info.entries;
            } else {
                // Last resort: look for any object with numbered keys or array
                for (const key in data) {
                    if (typeof data[key] === 'object' && data[key] !== null) {
                        if (Array.isArray(data[key]) && data[key].length > 0) {
                            entries = data[key];
                            break;
                        } else if (typeof data[key] === 'object') {
                            const values = Object.values(data[key]);
                            if (values.length > 0 && values[0] && typeof values[0] === 'object' && (values[0].key || values[0].keys || values[0].content)) {
                                entries = values;
                                break;
                            }
                        }
                    }
                }
            }
            
            previewEl.innerHTML = `
                <div class="carrot-pack-preview">
                    <div class="carrot-preview-header">
                        <div class="carrot-preview-title">
                            <div class="carrot-preview-icon">🎯</div>
                            <div class="carrot-preview-title-text">
                                <h3>${filename.replace('.json', '')}</h3>
                                <div class="carrot-preview-subtitle">BunnyMo Pack Preview</div>
                            </div>
                        </div>
                        <button class="carrot-primary-btn" onclick="CarrotKernel.downloadFile('${path}', '${filename}')">
                            <i class="fa-solid fa-download"></i> Install
                        </button>
                    </div>
                    
                    <div class="carrot-preview-stats">
                        <div class="carrot-stat-card">
                            <div class="carrot-stat-number">${entries.length}</div>
                            <div class="carrot-stat-label">Entries</div>
                        </div>
                        <div class="carrot-stat-card">
                            <div class="carrot-stat-number">${Math.round(JSON.stringify(data).length / 1024)}KB</div>
                            <div class="carrot-stat-label">Size</div>
                        </div>
                    </div>
                    
                    <div class="carrot-preview-content">
                        <h4><i class="fa-solid fa-list"></i> Pack Contents</h4>
                        ${entries.length > 0 ? `
                            <div class="carrot-entry-grid">
                                ${entries.slice(0, 8).map(entry => {
                                    // SillyTavern lorebook structure
                                    const entryName = entry.comment || 'Unnamed Entry';
                                    const content = entry.content || '';
                                    const probability = entry.probability !== undefined ? entry.probability : 100;

                                    return `
                                        <div class="carrot-entry-card">
                                            <div class="carrot-entry-key">${entryName}</div>
                                            <div class="carrot-entry-preview">${content.substring(0, 80)}${content.length > 80 ? '...' : ''}</div>
                                            <div class="carrot-entry-prob">TRIGGER: ${probability}%</div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${entries.length > 8 ? `<div class="carrot-more-entries">+ ${entries.length - 8} more entries</div>` : ''}
                        ` : `
                            <div class="carrot-empty-preview">
                                <div class="carrot-empty-icon">📭</div>
                                <h4>No Entries Found</h4>
                                <p>This JSON file might be empty, corrupted, or use an unsupported format.</p>
                                <details class="carrot-debug-info">
                                    <summary>Debug Info (click to expand)</summary>
                                    <pre>${JSON.stringify(data, null, 2).substring(0, 500)}${JSON.stringify(data, null, 2).length > 500 ? '...' : ''}</pre>
                                </details>
                            </div>
                        `}
                    </div>
                </div>
            `;
            
        } else if (isReadmeFile) {
            // Handle README file preview
            const textContent = await response.text();
            
            previewEl.innerHTML = `
                <div class="carrot-readme-preview">
                    <div class="carrot-preview-header">
                        <div class="carrot-preview-title">
                            <div class="carrot-preview-icon">📖</div>
                            <div class="carrot-preview-title-text">
                                <h3>${filename}</h3>
                                <div class="carrot-preview-subtitle">Repository Documentation</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="carrot-readme-content">
                        <pre>${textContent}</pre>
                    </div>
                </div>
            `;
            
        } else {
            // Handle other file types
            const textContent = await response.text();
            
            previewEl.innerHTML = `
                <div class="carrot-file-preview">
                    <div class="carrot-preview-header">
                        <div class="carrot-preview-title">
                            <div class="carrot-preview-icon">📄</div>
                            <div class="carrot-preview-title-text">
                                <h3>${filename}</h3>
                                <div class="carrot-preview-subtitle">File Preview</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="carrot-text-content">
                        <pre>${textContent.substring(0, 2000)}${textContent.length > 2000 ? '\n\n... (truncated)' : ''}</pre>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        CarrotDebug.error('Preview error:', error);
        previewEl.innerHTML = `
            <div class="carrot-error-state">
                <div class="carrot-error-icon">⚠️</div>
                <div class="carrot-error-text">
                    <h4>Failed to load preview</h4>
                    <p>${error.message}</p>
                </div>
            </div>
        `;
    }

// Format file size
}
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Remove old pack manager functions and replace with browser navigation functions
async function populatePackGrids(packManager) {
    const themeContainer = document.getElementById('carrot-theme-packs');
    const expansionContainer = document.getElementById('carrot-expansion-packs');
    
    // Populate theme packs
    if (themeContainer && packManager.availablePacks.size > 0) {
        const themeGrid = Array.from(packManager.availablePacks.entries()).map(([id, pack]) => {
            const isInstalled = packManager.localPacks.has(id);
            return `
                <div class="carrot-pack-item carrot-pack-theme-item">
                    <div class="carrot-pack-info">
                        <div class="carrot-pack-name">${pack.displayName}</div>
                        <div class="carrot-pack-desc">${pack.description || 'Theme pack with specialized character tags'}</div>
                        <div class="carrot-pack-details">
                            <span class="carrot-pack-size">${pack.size ? Math.round(pack.size / 1024) : '~200'}KB</span>
                            <span class="carrot-pack-variants">${pack.variants || 1} variant${pack.variants === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                    <div class="carrot-pack-actions">
                        ${isInstalled ? 
                            `<button class="carrot-secondary-btn" onclick="CarrotKernel.updatePack('${id}')">
                                <i class="fa-solid fa-sync-alt"></i> Update
                            </button>` :
                            `<button class="carrot-primary-btn" onclick="CarrotKernel.installPack('${id}')">
                                <i class="fa-solid fa-download"></i> Install
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
        themeContainer.innerHTML = themeGrid;
    }
    
    // Populate expansion packs
    if (expansionContainer && packManager.expansionPacks.size > 0) {
        const expansionGrid = Array.from(packManager.expansionPacks.entries()).map(([id, pack]) => {
            const isInstalled = packManager.localPacks.has(id);
            return `
                <div class="carrot-pack-item carrot-pack-expansion-item">
                    <div class="carrot-pack-info">
                        <div class="carrot-pack-name">${pack.displayName}</div>
                        <div class="carrot-pack-desc">${pack.description || 'Expansion pack with additional content'}</div>
                        <div class="carrot-pack-details">
                            <span class="carrot-pack-size">${pack.size ? Math.round(pack.size / 1024) : '~150'}KB</span>
                            <span class="carrot-pack-type">Expansion</span>
                        </div>
                    </div>
                    <div class="carrot-pack-actions">
                        ${isInstalled ? 
                            `<button class="carrot-secondary-btn" onclick="CarrotKernel.updatePack('${id}')">
                                <i class="fa-solid fa-sync-alt"></i> Update
                            </button>` :
                            `<button class="carrot-primary-btn" onclick="CarrotKernel.installPack('${id}')">
                                <i class="fa-solid fa-download"></i> Install
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
        expansionContainer.innerHTML = expansionGrid;
    }

// Install main BunnyMo pack
}
async function installMainPack(filename) {
    if (!filename) {
        CarrotDebug.error('No filename provided for main pack installation');
        return;
    }
    
    try {
        const packManager = new CarrotPackManager();
        await packManager.installPackByFilename(filename, 'main');
        
        // Update status and refresh interface
        updatePackStatus();
        toastr.success('Main BunnyMo pack installed successfully!');
        
        // Refresh the pack manager interface
        await showPackManagerInterface();
        
    } catch (error) {
        CarrotDebug.error('Failed to install main pack:', error);
        toastr.error('Failed to install main pack: ' + error.message);
    }

// Install theme or expansion pack
}
async function installPack(packId) {
    try {
        const packManager = new CarrotPackManager();
        await packManager.installPackById(packId);
        
        // Update status and refresh interface
        updatePackStatus();
        toastr.success('Pack installed successfully!');
        
        // Refresh the pack manager interface
        await showPackManagerInterface();
        
    } catch (error) {
        CarrotDebug.error('Failed to install pack:', error);
        toastr.error('Failed to install pack: ' + error.message);
    }

// Update main pack
}
async function updateMainPack(filename) {
    try {
        const packManager = new CarrotPackManager();
        await packManager.updateMainPack(filename);
        
        // Update status and refresh interface
        updatePackStatus();
        toastr.success('Main pack updated successfully!');
        
        // Refresh the pack manager interface
        await showPackManagerInterface();
        
    } catch (error) {
        CarrotDebug.error('Failed to update main pack:', error);
        toastr.error('Failed to update main pack: ' + error.message);
    }

// Update theme or expansion pack
}
async function updatePack(packId) {
    try {
        const packManager = new CarrotPackManager();
        await packManager.updatePackById(packId);
        
        // Update status and refresh interface  
        updatePackStatus();
        toastr.success('Pack updated successfully!');
        
        // Refresh the pack manager interface
        await showPackManagerInterface();
        
    } catch (error) {
        CarrotDebug.error('Failed to update pack:', error);
        toastr.error('Failed to update pack: ' + error.message);
    }

// Scan for pack updates
}
async function scanForUpdates() {
    try {
        const packManager = new CarrotPackManager();
        await packManager.scanAllPacks();
        
        updatePackStatus();
        toastr.info('Pack scan completed');
        
        // Refresh the pack manager interface
        await showPackManagerInterface();
        
    } catch (error) {
        CarrotDebug.error('Failed to scan for updates:', error);
        toastr.error('Failed to scan for updates: ' + error.message);
    }

// Update pack status in status card
}
function updatePackStatus() {
    const statusElement = document.getElementById('carrot-pack-status');
    const detailElement = document.getElementById('carrot-pack-detail');
    const indicatorElement = document.getElementById('carrot-pack-indicator');
    
    if (statusElement && detailElement && indicatorElement) {
        // This will be updated with real pack data when scanning completes
        statusElement.textContent = 'Ready for management';
        detailElement.textContent = 'Click to install and update packs';
        
        // Update indicator based on status
        indicatorElement.className = 'carrot-pulse-dot';
        indicatorElement.style.backgroundColor = '#28a745'; // Green for ready
    }

// Old template editor functions removed - now using BunnyMoTags TemplatePromptEditInterface

}


// Manual scan function
async function manualScan() {
    const selected = Array.from(selectedLorebooks);
    if (selected.length === 0) {
        alert('No lorebooks selected. Please select at least one lorebook to scan.');
        return;
    }
    
    // Update button to show scanning state
    const scanBtn = document.querySelector('button[onclick="CarrotKernel.manualScan()"]');
    const originalButtonText = scanBtn ? scanBtn.textContent : '';
    if (scanBtn) {
        scanBtn.textContent = '⏳ Scanning...';
        scanBtn.style.pointerEvents = 'none';
    }
    
    try {
        const results = await scanSelectedLorebooks(selected);
        updateStatusPanels();

        // Update the popup content in place instead of closing/reopening
        updateRepositoryManagerContent();
        
        // Force show character cards section after successful scan
        setTimeout(() => {
            forceShowCharacterCards();
        }, 500);
        
        // Show success message
        const characterCount = scannedCharacters.size;
        if (characterCount > 0) {
            // Briefly show success state
            if (scanBtn) {
                scanBtn.textContent = `✅ Found ${characterCount} characters`;
                scanBtn.style.background = 'rgba(76, 175, 80, 0.3)';
                setTimeout(() => {
                    scanBtn.textContent = '🔄 Rescan Repositories';
                    scanBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                    scanBtn.style.pointerEvents = 'auto';
                }, 2000);
            }
        }

    } catch (error) {
        CarrotDebug.error('Scan error:', error);
        alert('Scan failed: ' + error.message);

        // Restore button state on error
        if (scanBtn) {
            scanBtn.textContent = originalButtonText;
            scanBtn.style.pointerEvents = 'auto';
        }
    }

}

// Ensure tutorial overlay exists and return it
function getTutorialOverlay() {
    // First check if we're in a modal context
    const modal = document.querySelector('.popup:not(.popup_template)');
    if (modal) {
        let modalOverlay = modal.querySelector('#carrot-tutorial-overlay');
        if (!modalOverlay) {
            // Create tutorial overlay in modal
            createTutorialOverlayInModal(modal);
            modalOverlay = modal.querySelector('#carrot-tutorial-overlay');
        }
        if (modalOverlay) {
            return modalOverlay;
        }
    }
    
    // Fall back to document-level overlay
    let documentOverlay = document.getElementById('carrot-tutorial-overlay');
    if (!documentOverlay) {
        // Create tutorial overlay in document
        createTutorialOverlayInDocument();
        documentOverlay = document.getElementById('carrot-tutorial-overlay');
    }
    return documentOverlay;
}

// Create tutorial overlay in modal (reusing existing code pattern)
function createTutorialOverlayInModal(modal) {
    const tutorialHTML = `
        <!-- Tutorial Overlay -->
        <div class="carrot-tutorial-overlay" id="carrot-tutorial-overlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999999;">
            <div class="carrot-tutorial-spotlight" id="carrot-tutorial-spotlight"></div>
            <div class="carrot-tutorial-popup" id="carrot-tutorial-popup">
                <div class="carrot-tutorial-popup-header">
                    <h4 id="carrot-tutorial-popup-title">Tutorial Step</h4>
                    <button class="carrot-tutorial-close" onclick="CarrotKernel.closeTutorial()">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
                <div class="carrot-tutorial-popup-content" id="carrot-tutorial-popup-content">
                    <!-- Tutorial content -->
                </div>
                <div class="carrot-tutorial-popup-nav">
                    <button class="carrot-tutorial-prev" id="carrot-tutorial-prev" onclick="CarrotKernel.previousTutorialStep()">
                        <i class="fa-solid fa-arrow-left"></i> Previous
                    </button>
                    <span class="carrot-tutorial-progress" id="carrot-tutorial-progress">1 / 5</span>
                    <button class="carrot-tutorial-next" id="carrot-tutorial-next" onclick="CarrotKernel.nextTutorialStep()">
                        Next <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    modal.insertAdjacentHTML('beforeend', tutorialHTML);
    CarrotDebug.tutorial('✅ Tutorial overlay created in modal');
}

// Create tutorial overlay in document
function createTutorialOverlayInDocument() {
    const tutorialHTML = `
        <!-- Tutorial Overlay -->
        <div class="carrot-tutorial-overlay" id="carrot-tutorial-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999999; background: rgba(0,0,0,0.5);">
            <div class="carrot-tutorial-spotlight" id="carrot-tutorial-spotlight"></div>
            <div class="carrot-tutorial-popup" id="carrot-tutorial-popup">
                <div class="carrot-tutorial-popup-header">
                    <h4 id="carrot-tutorial-popup-title">Tutorial Step</h4>
                    <button class="carrot-tutorial-close" onclick="CarrotKernel.closeTutorial()">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
                <div class="carrot-tutorial-popup-content" id="carrot-tutorial-popup-content">
                    <!-- Tutorial content -->
                </div>
                <div class="carrot-tutorial-popup-nav">
                    <button class="carrot-tutorial-prev" id="carrot-tutorial-prev" onclick="CarrotKernel.previousTutorialStep()">
                        <i class="fa-solid fa-arrow-left"></i> Previous
                    </button>
                    <span class="carrot-tutorial-progress" id="carrot-tutorial-progress">1 / 5</span>
                    <button class="carrot-tutorial-next" id="carrot-tutorial-next" onclick="CarrotKernel.nextTutorialStep()">
                        Next <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', tutorialHTML);
    CarrotDebug.tutorial('✅ Tutorial overlay created in document');
}

// Show current tutorial step
// Show tutorial overlay
function showTutorialOverlay() {
    const overlay = getTutorialOverlay();
    
    if (!overlay) {
        CarrotDebug.error('❌ Tutorial overlay not found! Cannot show tutorial');
        return;
    }
    
    overlay.style.display = 'block';
    overlay.classList.add('active');
    
    CarrotDebug.tutorial('Tutorial overlay activated');
}

// Simple element highlighting
function highlightTargetElement(target) {
    // Remove any existing highlights
    document.querySelectorAll('.carrot-tutorial-highlight').forEach(el => {
        el.classList.remove('carrot-tutorial-highlight');
    });
    
    // Add highlight to target element
    const element = document.querySelector(target);
    if (element) {
        element.classList.add('carrot-tutorial-highlight');
        
        // Scroll element into view
        element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
        });
        
        CarrotDebug.tutorial(`Highlighted element: ${target}`);
    } else {
        CarrotDebug.tutorial(`Element not found: ${target}`);
    }

// Navigation functions
}
function addResizeHandler() {
    // Remove existing handler if any
    if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
    }
    
    // Create debounced resize handler
    let resizeTimeout;
    this.resizeHandler = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (this.currentTutorial && this.tutorialSteps.length > 0) {
                const step = this.tutorialSteps[this.currentStep];
                const targetElement = document.querySelector(step.target);
                const overlay = getTutorialOverlay();
                const popup = overlay?.querySelector('#carrot-tutorial-popup');
                
                if (targetElement && popup) {
                    // Reapply viewport safeguards on resize
                    const safeguards = applyViewportSafeguards(popup);
                    const rect = targetElement.getBoundingClientRect();
                    positionTutorialPopupWithSafeguards(rect, safeguards);
                    
                    CarrotDebug.tutorial('🔄 Tutorial repositioned on resize', {
                        newViewport: `${window.innerWidth}x${window.innerHeight}`,
                        step: this.currentStep,
                        tutorial: this.currentTutorial
                    });
                }
            }
        }, 100);
    };
    
    window.addEventListener('resize', this.resizeHandler);
}

// Apply comprehensive viewport safeguards to ensure tutorial popup is always viewable
function applyViewportSafeguards(popup) {
    if (!popup) return;
    
    // Get current viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    
    // Detect zoom level
    const zoomLevel = window.outerWidth / window.innerWidth;
    const isZoomed = zoomLevel < 0.98 || zoomLevel > 1.02;
    
    CarrotDebug.tutorial('🛡️ Applying viewport safeguards', {
        viewport: `${viewportWidth}x${viewportHeight}`,
        scroll: `${scrollX}, ${scrollY}`,
        zoomLevel: zoomLevel,
        isZoomed: isZoomed
    });
    
    // Calculate safe dimensions - more conservative for small screens and zoom
    const isMobile = viewportWidth <= 768;
    const isTablet = viewportWidth <= 1024 && viewportWidth > 768;
    
    let maxWidth, maxHeight, minMargin;
    
    if (isMobile) {
        // Mobile: very conservative sizing
        maxWidth = Math.min(viewportWidth * 0.95, 380);
        maxHeight = Math.min(viewportHeight * 0.85, 500);
        minMargin = 8;
    } else if (isTablet) {
        // Tablet: moderately conservative
        maxWidth = Math.min(viewportWidth * 0.85, 450);
        maxHeight = Math.min(viewportHeight * 0.80, 600);
        minMargin = 16;
    } else {
        // Desktop: normal sizing with zoom adjustments
        maxWidth = Math.min(viewportWidth * 0.75, isZoomed ? 350 : 500);
        maxHeight = Math.min(viewportHeight * 0.75, isZoomed ? 400 : 650);
        minMargin = isZoomed ? 8 : 20;
    }
    
    // Apply safe dimensions
    popup.style.maxWidth = `${maxWidth}px`;
    popup.style.maxHeight = `${maxHeight}px`;
    popup.style.width = `min(${maxWidth}px, 95vw)`;
    popup.style.minWidth = `min(280px, 90vw)`;
    
    // Ensure proper box-sizing and overflow handling
    popup.style.boxSizing = 'border-box';
    popup.style.overflowY = 'auto';
    popup.style.overflowX = 'hidden';
    popup.style.wordWrap = 'break-word';
    popup.style.hyphens = 'auto';
    
    // Add responsive text sizing for small viewports
    if (viewportWidth <= 480 || isZoomed) {
        popup.style.fontSize = '0.9em';
        popup.style.lineHeight = '1.4';
    }
    
    CarrotDebug.tutorial('🛡️ Viewport safeguards applied', {
        appliedMaxWidth: maxWidth,
        appliedMaxHeight: maxHeight,
        minMargin: minMargin,
        deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
        zoomAdjustments: isZoomed
    });
    
    return { maxWidth, maxHeight, minMargin };
}

// Simple element highlighting with golden glow
function highlightElement(targetElement, step) {
    const overlay = getTutorialOverlay();
    const popup = overlay?.querySelector('#carrot-tutorial-popup');
    
    if (!popup) {
        CarrotDebug.error('Tutorial popup not found during highlight');
        return;
    }
    
    // Apply viewport safeguards first
    const safeguards = applyViewportSafeguards(popup);
    
    // Update popup content
    overlay.querySelector('#carrot-tutorial-popup-title').textContent = step.title;
    overlay.querySelector('#carrot-tutorial-popup-content').innerHTML = step.content;
    overlay.querySelector('#carrot-tutorial-progress').textContent = 
        `${this.currentStep + 1} / ${this.tutorialSteps.length}`;
    
    // Update navigation buttons
    const prevBtn = overlay.querySelector('#carrot-tutorial-prev');
    const nextBtn = overlay.querySelector('#carrot-tutorial-next');
    
    prevBtn.style.display = this.currentStep > 0 ? 'flex' : 'none';
    nextBtn.textContent = this.currentStep === this.tutorialSteps.length - 1 ? 'Finish' : 'Next';
    
    // Position popup based on current element position with safeguards
    const rect = targetElement.getBoundingClientRect();
    positionTutorialPopupWithSafeguards(rect, safeguards);
    
    // Hide the overlay spotlight - we're just using element highlighting now
    const spotlight = overlay.querySelector('#carrot-tutorial-spotlight');
    spotlight.style.display = 'none';
    
    CarrotDebug.tutorial('highlight', this.currentTutorial, step.target);
}

// Enhanced popup positioning with comprehensive viewport safeguards
function positionTutorialPopupWithSafeguards(targetRect, safeguards) {
    const overlay = getTutorialOverlay();
    const popup = overlay?.querySelector('#carrot-tutorial-popup');
    
    if (!overlay || !popup || !safeguards) {
        CarrotDebug.error('Missing elements for safe tutorial positioning');
        return;
    }
    
    const { maxWidth, maxHeight, minMargin } = safeguards;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Force popup to render to get accurate dimensions
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
    const popupRect = popup.getBoundingClientRect();
    popup.style.visibility = 'visible';
    
    // Calculate safe position with multiple fallback strategies
    let left, top, positioning = 'auto';
    
    // Strategy 1: Try positioning relative to target
    if (targetRect.bottom + popupRect.height + minMargin <= viewportHeight) {
        // Below target
        top = Math.min(targetRect.bottom + minMargin, viewportHeight - popupRect.height - minMargin);
        positioning = 'below-target';
    } else if (targetRect.top - popupRect.height - minMargin >= 0) {
        // Above target
        top = Math.max(targetRect.top - popupRect.height - minMargin, minMargin);
        positioning = 'above-target';
    } else {
        // Strategy 2: Center vertically with safe margins
        top = Math.max(minMargin, (viewportHeight - popupRect.height) / 2);
        positioning = 'center-vertical';
    }
    
    // Horizontal positioning with viewport constraints
    if (targetRect.right + popupRect.width + minMargin <= viewportWidth) {
        // Right of target
        left = Math.min(targetRect.right + minMargin, viewportWidth - popupRect.width - minMargin);
    } else if (targetRect.left - popupRect.width - minMargin >= 0) {
        // Left of target  
        left = Math.max(targetRect.left - popupRect.width - minMargin, minMargin);
    } else {
        // Center horizontally with safe margins
        left = Math.max(minMargin, (viewportWidth - popupRect.width) / 2);
        positioning += '-center-horizontal';
    }
    
    // Final boundary enforcement - absolutely ensure popup stays in viewport
    left = Math.max(minMargin, Math.min(left, viewportWidth - popupRect.width - minMargin));
    top = Math.max(minMargin, Math.min(top, viewportHeight - popupRect.height - minMargin));
    
    // Apply position
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.position = 'fixed';
    popup.style.zIndex = '10001';
    
    // Add emergency overflow protection
    popup.style.maxWidth = `${Math.min(maxWidth, viewportWidth - (minMargin * 2))}px`;
    popup.style.maxHeight = `${Math.min(maxHeight, viewportHeight - (minMargin * 2))}px`;
    
    CarrotDebug.tutorial('🛡️ Safe tutorial popup positioned', {
        positioning: positioning,
        finalPosition: { left, top },
        viewport: `${viewportWidth}x${viewportHeight}`,
        popupSize: `${popupRect.width}x${popupRect.height}`,
        margins: minMargin,
        safeguards: safeguards
    });
}

// Legacy popup positioning method - kept for compatibility
function positionTutorialPopup(targetRect) {
    CarrotDebug.tutorial('🎯 Starting tutorial popup positioning', {
        targetRect: targetRect,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio,
        zoomLevel: window.outerWidth / window.innerWidth
    });
    
    const overlay = getTutorialOverlay();
    const popup = overlay?.querySelector('#carrot-tutorial-popup');
    
    CarrotDebug.tutorial('Tutorial elements found', {
        overlayExists: !!overlay,
        popupExists: !!popup,
        overlayBounds: overlay?.getBoundingClientRect() || 'not found',
        popupBounds: popup?.getBoundingClientRect() || 'not found'
    });
    
    if (!overlay || !popup) {
        CarrotDebug.error('❌ Tutorial elements missing - cannot position popup', {
            overlay: !!overlay,
            popup: !!popup
        });
        return;
    }
    
    // Check if we're in a modal context
    const modal = document.querySelector('.popup:not(.popup_template)');
    let containerRect, containerElement;
    
    if (modal && overlay.parentElement === modal) {
        // Use modal as container
        containerElement = modal;
        containerRect = modal.getBoundingClientRect();
        
        CarrotDebug.tutorial('🏠 Using modal container', {
            modalExists: true,
            overlayIsChildOfModal: overlay.parentElement === modal,
            modalRect: containerRect,
            modalId: modal.id || 'no-id',
            modalClasses: modal.className
        });
    } else {
        // Use viewport as container
        containerElement = document.documentElement;
        containerRect = { 
            top: 0, 
            left: 0, 
            width: window.innerWidth, 
            height: window.innerHeight 
        };
        
        CarrotDebug.tutorial('🌐 Using viewport container', {
            modalExists: !!modal,
            overlayParent: overlay.parentElement?.tagName || 'unknown',
            overlayIsChildOfModal: modal ? overlay.parentElement === modal : false,
            viewportRect: containerRect
        });
    }
    
    // Reset popup styles to get natural dimensions
    popup.style.cssText = '';
    popup.style.position = 'absolute';
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
    popup.style.maxWidth = '90vw'; // Responsive max width
    popup.style.width = 'min(420px, 90vw)'; // Responsive width with fallback
    
    // Get actual popup dimensions after styling
    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;
    
    // Use percentage-based margins that scale with viewport
    const marginPercent = 2; // 2% of container
    const margin = Math.max(10, (containerRect.width * marginPercent) / 100); // Min 10px, scales up
    let left, top, positioning;
    
    // Convert target rect to be relative to the container
    let relativeTargetRect = {
        top: targetRect.top - containerRect.top,
        left: targetRect.left - containerRect.left,
        right: targetRect.right - containerRect.left,
        bottom: targetRect.bottom - containerRect.top,
        width: targetRect.width,
        height: targetRect.height
    };
    
    // Get container dimensions
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Ensure popup fits within container with margins
    const maxWidth = containerWidth - (margin * 2);
    const maxHeight = containerHeight - (margin * 2);
    
    if (popupWidth > maxWidth) {
        popup.style.width = `${maxWidth}px`;
        popup.style.maxWidth = `${maxWidth}px`;
    }
    
    // Priority 1: Right side (most preferred)
    const spaceRight = containerWidth - relativeTargetRect.right;
    if (spaceRight >= popupWidth + margin) {
        left = Math.min(relativeTargetRect.right + margin, containerWidth - popupWidth - margin);
        top = Math.max(margin, 
            Math.min(relativeTargetRect.top + (relativeTargetRect.height / 2) - (popupHeight / 2), 
                     containerHeight - popupHeight - margin));
        positioning = 'right';
    }
    // Priority 2: Left side
    else if (relativeTargetRect.left >= popupWidth + margin) {
        left = Math.max(margin, relativeTargetRect.left - popupWidth - margin);
        top = Math.max(margin, 
            Math.min(relativeTargetRect.top + (relativeTargetRect.height / 2) - (popupHeight / 2), 
                     containerHeight - popupHeight - margin));
        positioning = 'left';
    }
    // Priority 3: Bottom
    else if (containerHeight - relativeTargetRect.bottom >= popupHeight + margin) {
        left = Math.max(margin, 
            Math.min(relativeTargetRect.left + (relativeTargetRect.width / 2) - (popupWidth / 2), 
                     containerWidth - popupWidth - margin));
        top = Math.min(relativeTargetRect.bottom + margin, containerHeight - popupHeight - margin);
        positioning = 'bottom';
    }
    // Priority 4: Top
    else if (relativeTargetRect.top >= popupHeight + margin) {
        left = Math.max(margin, 
            Math.min(relativeTargetRect.left + (relativeTargetRect.width / 2) - (popupWidth / 2), 
                     containerWidth - popupWidth - margin));
        top = Math.max(margin, relativeTargetRect.top - popupHeight - margin);
        positioning = 'top';
    }
    // Fallback: Center with container constraints (ensures always visible)
    else {
        left = Math.max(margin, Math.min(
            relativeTargetRect.left, 
            containerWidth - popupWidth - margin
        ));
        top = Math.max(margin, Math.min(
            relativeTargetRect.top - popupHeight - margin,
            containerHeight - popupHeight - margin
        ));
        positioning = 'center';
    }
    
    // Apply positioning - use absolute positioning within the overlay/modal
    popup.style.position = 'absolute';
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.transform = 'none';
    popup.style.zIndex = '999999';
    popup.style.visibility = 'visible';
    
    // Additional responsive constraints
    popup.style.maxHeight = `${maxHeight}px`;
    popup.style.overflowY = 'auto';
    popup.style.boxSizing = 'border-box';
    
    CarrotDebug.tutorial('📍 Initial popup positioning applied', {
        positioning: positioning,
        coordinates: { left, top },
        popupSize: { width: popupWidth, height: popupHeight },
        constraints: { maxWidth, maxHeight, margin },
        containerSize: { width: containerWidth, height: containerHeight }
    });
    
    // Ensure popup stays within bounds even with zoom
    const finalRect = popup.getBoundingClientRect();
    const containerFinalRect = containerElement.getBoundingClientRect();
    
    CarrotDebug.tutorial('🔍 Final bounds check', {
        popupFinalRect: finalRect,
        containerFinalRect: containerFinalRect,
        exceedsRight: finalRect.right > containerFinalRect.right,
        exceedsBottom: finalRect.bottom > containerFinalRect.bottom,
        isVisible: finalRect.width > 0 && finalRect.height > 0
    });
    
    let adjustmentsMade = false;
    if (finalRect.right > containerFinalRect.right) {
        const newLeft = containerWidth - popupWidth - margin;
        popup.style.left = `${newLeft}px`;
        adjustmentsMade = true;
        CarrotDebug.tutorial('🔧 Adjusted left position for right overflow', {
            oldLeft: left,
            newLeft: newLeft
        });
    }
    if (finalRect.bottom > containerFinalRect.bottom) {
        const newTop = containerHeight - popupHeight - margin;
        popup.style.top = `${newTop}px`;
        adjustmentsMade = true;
        CarrotDebug.tutorial('🔧 Adjusted top position for bottom overflow', {
            oldTop: top,
            newTop: newTop
        });
    }
    
    // Get final positioning info for debugging
    const finalPositionRect = popup.getBoundingClientRect();
    const screenBounds = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
    };
    
    CarrotDebug.tutorial('📊 TUTORIAL POPUP SCREEN POSITION ANALYSIS', {
        // Popup size and position
        popupSize: {
            width: finalPositionRect.width,
            height: finalPositionRect.height
        },
        popupPosition: {
            left: finalPositionRect.left,
            top: finalPositionRect.top,
            right: finalPositionRect.right,
            bottom: finalPositionRect.bottom
        },
        // Relative to screen viewport
        relativeToScreen: {
            leftPercent: `${((finalPositionRect.left / screenBounds.width) * 100).toFixed(1)}%`,
            topPercent: `${((finalPositionRect.top / screenBounds.height) * 100).toFixed(1)}%`,
            rightPercent: `${((finalPositionRect.right / screenBounds.width) * 100).toFixed(1)}%`,
            bottomPercent: `${((finalPositionRect.bottom / screenBounds.height) * 100).toFixed(1)}%`
        },
        // Screen/container info
        screenInfo: screenBounds,
        containerInfo: {
            rect: containerFinalRect,
            type: modal && overlay.parentElement === modal ? 'modal' : 'viewport'
        },
        // Visibility checks
        visibility: {
            exceedsScreenRight: finalPositionRect.right > screenBounds.width,
            exceedsScreenBottom: finalPositionRect.bottom > screenBounds.height,
            exceedsScreenLeft: finalPositionRect.left < 0,
            exceedsScreenTop: finalPositionRect.top < 0,
            isFullyOnScreen: finalPositionRect.left >= 0 && 
                            finalPositionRect.top >= 0 && 
                            finalPositionRect.right <= screenBounds.width && 
                            finalPositionRect.bottom <= screenBounds.height
        },
        // CSS positioning
        computedStyles: {
            position: popup.style.position,
            left: popup.style.left,
            top: popup.style.top,
            zIndex: popup.style.zIndex,
            transform: popup.style.transform
        }
    });
    
    if (adjustmentsMade) {
        CarrotDebug.tutorial('✅ Final tutorial popup position (with adjustments)', {
            adjustmentsMade: true,
            finalRect: finalPositionRect,
            isFullyVisible: finalPositionRect.right <= containerFinalRect.right && finalPositionRect.bottom <= containerFinalRect.bottom
        });
    } else {
        CarrotDebug.tutorial('✅ Final tutorial popup position (no adjustments)', {
            adjustmentsMade: false,
            finalRect: finalPositionRect,
            isFullyVisible: finalPositionRect.right <= containerFinalRect.right && finalPositionRect.bottom <= containerFinalRect.bottom
        });
    }
    
    // Add positioning class for animations
    popup.className = popup.className.replace(/carrot-popup-\w+/g, '');
    popup.classList.add(`carrot-popup-${positioning}`);
    
    CarrotDebug.popup(positioning, { left, top });
}

// Add visual arrow pointing from popup to target
function addPopupArrow(popup, targetRect, popupRect, positioning) {
    // Remove existing arrow
    const existingArrow = popup.querySelector('.carrot-popup-arrow');
    if (existingArrow) existingArrow.remove();
    
    // Only add arrow for side positions (right/left look best)
    if (positioning !== 'right' && positioning !== 'left') return;
    
    const arrow = document.createElement('div');
    arrow.className = 'carrot-popup-arrow';
    
    if (positioning === 'right') {
        arrow.style.cssText = `
            position: absolute;
            left: -8px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-right: 8px solid var(--active);
            z-index: 1;
        `;
    } else if (positioning === 'left') {
        arrow.style.cssText = `
            position: absolute;
            right: -8px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-left: 8px solid var(--active);
            z-index: 1;
        `;
    }
    
    popup.appendChild(arrow);
}

// Navigate to previous tutorial step
// Show popup
// showPopup now implemented as standalone function showCarrotPopup() - see delegation at top of object


// Parse BunnymoTags to extract basic info
function parseBunnymoTags(text) {
    const nameMatch = text.match(/<Name:([^>]+)>/i);
    return {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown Character'
    };
}

// DEBUG: Utility function to inspect modal sizing
function debugModalSizing() {
    CarrotDebug.ui('MODAL SIZING DEBUG REPORT:');

    const container = document.getElementById('carrot-popup-container');
    const overlay = document.getElementById('carrot-popup-overlay');

    if (!container) {
        CarrotDebug.error('No popup container found');
        return;
    }

    CarrotDebug.ui('Container Info:', {
        id: container.id,
        classes: container.className,
        inlineStyles: container.style.cssText
    });

    const computedStyles = window.getComputedStyle(container);
    CarrotDebug.ui('Computed Styles:', {
        width: computedStyles.width,
        height: computedStyles.height,
        maxWidth: computedStyles.maxWidth,
        maxHeight: computedStyles.maxHeight,
        position: computedStyles.position,
        display: computedStyles.display
    });

    CarrotDebug.ui('Actual Dimensions:', {
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight
    });

    if (overlay) {
        const overlayStyles = window.getComputedStyle(overlay);
        CarrotDebug.ui('Overlay Styles:', {
            width: overlayStyles.width,
            height: overlayStyles.height,
            display: overlayStyles.display,
            position: overlayStyles.position
        });
    }

    // Check all CSS rules affecting this element
    CarrotDebug.ui('Checking CSS Rules affecting container...');
    const sheets = Array.from(document.styleSheets);
    sheets.forEach((sheet, index) => {
        try {
            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            rules.forEach(rule => {
                if (rule.selectorText && (
                    rule.selectorText.includes('carrot-popup-container') ||
                    rule.selectorText.includes('#carrot-popup-container') ||
                    rule.selectorText.includes('.carrot-repo-browser-popup')
                )) {
                    CarrotDebug.ui(`Sheet ${index}: ${rule.selectorText} -> ${rule.style.cssText}`);
                }
            });
        } catch (e) {
            CarrotDebug.ui(`Sheet ${index}: Cannot access (cross-origin)`);
        }
    });
}

// Close popup
// closePopup now implemented as standalone function closeCarrotPopup() - see delegation at top of object


// =============================================================================
// WINDOW.CARROTKERNEL COMPATIBILITY SHIM
// Minimal delegation object for backward compatibility
// =============================================================================

// =============================================================================
// LOREBOOK MANAGEMENT UI
// =============================================================================

// Generate available lorebooks tab
function generateAvailableLorebooksTab(availableLorebooks, enabledRepos) {
    if (availableLorebooks.length === 0) {
        return '<div class="carrot-empty-state">No lorebooks found. Please create some lorebooks in SillyTavern first.</div>';
    }
    
    return `
        <div class="carrot-lorebook-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
            ${availableLorebooks.map(lorebook => {
                const isEnabled = enabledRepos.has(lorebook);
                const isCharRepo = characterRepoBooks.has(lorebook);
                const repoIcon = isCharRepo ? 'fa-solid fa-user' : 'fa-solid fa-book';
                const repoColor = isCharRepo ? '#9c27b0' : '#2196f3';
                const repoType = isCharRepo ? 'Character Repo' : 'Tag Library';
                
                return `
                    <div class="carrot-lorebook-card" style="
                        background: var(--SmartThemeBlurTintColor);
                        border: 1px solid ${isEnabled ? repoColor : 'var(--SmartThemeQuoteColor)'};
                        border-radius: 10px;
                        padding: 15px;
                        transition: all 0.3s ease;
                    ">
                        <div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                                    <i class="${repoIcon}" style="color: ${repoColor};"></i>
                                    <strong style="color: var(--SmartThemeBodyColor);">${lorebook}</strong>
                                </div>
                                <div style="color: var(--SmartThemeFadedColor); font-size: 12px;">${repoType}</div>
                            </div>
                            <label class="carrot-toggle" style="margin-left: 10px;">
                                <input type="checkbox" class="lorebook-enable-toggle" data-lorebook="${lorebook}" ${isEnabled ? 'checked' : ''}>
                                <span class="carrot-toggle-slider"></span>
                            </label>
                        </div>
                        
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button class="carrot-repo-toggle ${isCharRepo ? 'active' : ''}" data-lorebook="${lorebook}" style="
                                padding: 6px 12px;
                                border-radius: 6px;
                                border: 1px solid var(--SmartThemeQuoteColor);
                                background: ${isCharRepo ? repoColor : 'transparent'};
                                color: ${isCharRepo ? 'white' : 'var(--SmartThemeBodyColor)'};
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.3s ease;
                            ">
                                ${isCharRepo ? '👤 Character Repo' : '📚 Tag Library'}
                            </button>
                            
                            <div style="flex: 1; text-align: right; color: var(--SmartThemeFadedColor); font-size: 11px;">
                                Source: <strong>Global</strong>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Generate active lorebooks tab with source indicators
function generateActiveLorebooksTab(enabledRepos) {
    if (!enabledRepos || enabledRepos.size === 0) {
        return '<div class="carrot-empty-state">No active lorebooks. Enable some lorebooks in the Available tab.</div>';
    }
    
    const activeBooks = Array.from(enabledRepos);
    return `
        <div class="carrot-active-lorebooks" style="display: grid; gap: 12px;">
            ${activeBooks.map(lorebook => {
                const isCharRepo = characterRepoBooks.has(lorebook);
                const repoIcon = isCharRepo ? 'fa-solid fa-user' : 'fa-solid fa-book';
                const repoColor = isCharRepo ? '#9c27b0' : '#2196f3';
                
                return `
                    <div class="carrot-active-book" style="
                        background: var(--SmartThemeBlurTintColor);
                        border: 1px solid ${repoColor};
                        border-left: 4px solid ${repoColor};
                        border-radius: 8px;
                        padding: 15px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <i class="${repoIcon}" style="color: ${repoColor}; font-size: 18px;"></i>
                            <div>
                                <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">${lorebook}</div>
                                <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">
                                    ${isCharRepo ? 'Character Repository' : 'Tag Library'} • Active from: <strong>Global</strong>
                                </div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="carrot-source-badges" style="display: flex; gap: 4px;">
                                <span class="source-badge active" data-source="global" style="
                                    padding: 3px 8px;
                                    border-radius: 4px;
                                    font-size: 10px;
                                    background: #4caf50;
                                    color: white;
                                ">Global</span>
                                <span class="source-badge" data-source="character" style="
                                    padding: 3px 8px;
                                    border-radius: 4px;
                                    font-size: 10px;
                                    background: var(--black30);
                                    color: var(--SmartThemeFadedColor);
                                    cursor: pointer;
                                ">Character</span>
                                <span class="source-badge" data-source="chat" style="
                                    padding: 3px 8px;
                                    border-radius: 4px;
                                    font-size: 10px;
                                    background: var(--black30);
                                    color: var(--SmartThemeFadedColor);
                                    cursor: pointer;
                                ">Chat</span>
                            </div>
                            <button class="remove-lorebook" data-lorebook="${lorebook}" style="
                                background: none;
                                border: none;
                                color: #f44336;
                                cursor: pointer;
                                padding: 5px;
                            ">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Generate multi-context assignment tab
function generateAssignmentTab(enabledRepos) {
    return `
        <div class="carrot-assignment-interface">
            <div style="background: var(--SmartThemeBlurTintColor); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h5 style="margin: 0 0 10px 0; color: var(--SmartThemeEmColor);">
                    <i class="fa-solid fa-layer-group"></i> Multi-Context Assignment
                </h5>
                <p style="margin: 0; color: var(--SmartThemeFadedColor); font-size: 14px;">
                    Assign lorebooks to multiple contexts at once. Select lorebooks and choose which contexts should use them.
                </p>
            </div>
            
            <div class="carrot-assignment-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="assignment-source">
                    <h6 style="color: var(--SmartThemeEmColor); margin-bottom: 15px;">Select Lorebooks</h6>
                    <div class="lorebook-selector" style="max-height: 300px; overflow-y: auto; background: var(--black20); border-radius: 8px; padding: 10px;">
                        ${world_names?.map(lorebook => `
                            <label style="display: flex; align-items: center; padding: 8px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
                                <input type="checkbox" class="assign-lorebook" data-lorebook="${lorebook}" style="margin-right: 8px;">
                                <i class="fa-solid fa-${characterRepoBooks.has(lorebook) ? 'user' : 'book'}" style="margin-right: 8px; color: var(--SmartThemeEmColor);"></i>
                                <span>${lorebook}</span>
                            </label>
                        `).join('') || '<div style="text-align: center; color: var(--SmartThemeFadedColor); padding: 20px;">No lorebooks available</div>'}
                    </div>
                </div>
                
                <div class="assignment-target">
                    <h6 style="color: var(--SmartThemeEmColor); margin-bottom: 15px;">Assign To Contexts</h6>
                    <div class="context-options" style="display: grid; gap: 12px;">
                        <div class="context-option" style="background: var(--black20); padding: 15px; border-radius: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" class="assign-target" data-target="global" style="margin-right: 10px;">
                                <i class="fa-solid fa-globe" style="margin-right: 8px; color: var(--SmartThemeEmColor);"></i>
                                <div>
                                    <div><strong>Global Settings</strong></div>
                                    <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to all chats and characters (default)</div>
                                </div>
                            </label>
                        </div>
                        
                        <div class="context-option" style="background: var(--black20); padding: 15px; border-radius: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" class="assign-target" data-target="character" style="margin-right: 10px;">
                                <i class="fa-solid fa-user" style="margin-right: 8px; color: #2196f3;"></i>
                                <div>
                                    <div><strong>Current Character</strong></div>
                                    <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply to all chats with this character</div>
                                </div>
                            </label>
                        </div>
                        
                        <div class="context-option" style="background: var(--black20); padding: 15px; border-radius: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" class="assign-target" data-target="chat" style="margin-right: 10px;">
                                <i class="fa-solid fa-comments" style="margin-right: 8px; color: #4caf50;"></i>
                                <div>
                                    <div><strong>Current Chat</strong></div>
                                    <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Apply only to this specific chat</div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <button class="apply-assignment" style="
                        width: 100%;
                        margin-top: 15px;
                        padding: 12px;
                        background: var(--SmartThemeEmColor);
                        color: var(--SmartThemeQuoteColor);
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                    ">
                        <i class="fa-solid fa-check"></i> Apply Assignment
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Generate comprehensive settings management section
async function generateSettingsManagement(currentSettings) {
    return `
        <div class="carrot-section">
            <div class="carrot-section-header">
                <i class="fa-solid fa-cogs"></i>
                <h4>Context-Specific Settings</h4>
            </div>
            <div class="carrot-section-content">
                <div class="carrot-tabs">
                    <button class="carrot-tab active" data-tab="core-settings">Core Settings</button>
                    <button class="carrot-tab" data-tab="display-settings">Display & Injection</button>
                    <button class="carrot-tab" data-tab="advanced-settings">Advanced Options</button>
                </div>
                
                <div class="carrot-tab-content active" id="tab-core-settings">
                    ${generateCoreSettingsTab(currentSettings)}
                </div>
                
                <div class="carrot-tab-content" id="tab-display-settings">
                    ${generateDisplaySettingsTab(currentSettings)}
                </div>
                
                <div class="carrot-tab-content" id="tab-advanced-settings">
                    ${generateAdvancedSettingsTab(currentSettings)}
                </div>
            </div>
        </div>
    `;
}

// Generate core settings tab
function generateCoreSettingsTab(currentSettings) {
    return `
        <div class="carrot-settings-grid" style="display: grid; gap: 20px;">
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-power-off"></i> Master Controls
                </h5>
                
                <div class="carrot-setting-item" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor); margin-bottom: 4px;">CarrotKernel Enabled</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Enable CarrotKernel for this context</div>
                        </div>
                        <label class="carrot-toggle" style="margin-left: 15px;">
                            <input type="checkbox" id="context-enabled" checked>
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="carrot-setting-item">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor); margin-bottom: 4px;">Auto-scan on Startup</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Automatically scan lorebooks when ST loads</div>
                        </div>
                        <label class="carrot-toggle" style="margin-left: 15px;">
                            <input type="checkbox" id="context-scan-startup" ${currentSettings.scanOnStartup ? 'checked' : ''}>
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-save"></i> Profile Management
                </h5>
                
                <div class="profile-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button class="carrot-btn primary" id="save-current-context" style="
                        padding: 12px;
                        border-radius: 8px;
                        border: none;
                        background: var(--SmartThemeEmColor);
                        color: var(--SmartThemeQuoteColor);
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">
                        <i class="fa-solid fa-save"></i> Save Current Profile
                    </button>
                    
                    <button class="carrot-btn secondary" id="load-profile" style="
                        padding: 12px;
                        border-radius: 8px;
                        border: 1px solid var(--SmartThemeQuoteColor);
                        background: transparent;
                        color: var(--SmartThemeBodyColor);
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">
                        <i class="fa-solid fa-folder-open"></i> Load Profile
                    </button>
                    
                    <button class="carrot-btn danger" id="clear-context-settings" style="
                        padding: 12px;
                        border-radius: 8px;
                        border: 1px solid #f44336;
                        background: transparent;
                        color: #f44336;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                        grid-column: 1 / -1;
                    ">
                        <i class="fa-solid fa-trash"></i> Clear Context Settings
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Generate display settings tab
function generateDisplaySettingsTab(currentSettings) {
    return `
        <div class="carrot-settings-grid" style="display: grid; gap: 20px;">
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-eye"></i> Display Mode
                </h5>
                
                <div class="display-mode-selector" style="display: grid; gap: 12px;">
                    <label class="carrot-radio-option" style="display: flex; align-items: center; padding: 12px; border: 1px solid var(--SmartThemeQuoteColor); border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="display-mode" value="none" style="margin-right: 12px;">
                        <div>
                            <div style="font-weight: 500;">No Display</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Tags work in background, no visual display</div>
                        </div>
                    </label>
                    
                    <label class="carrot-radio-option" style="display: flex; align-items: center; padding: 12px; border: 1px solid var(--SmartThemeQuoteColor); border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="display-mode" value="thinking" checked style="margin-right: 12px;">
                        <div>
                            <div style="font-weight: 500;">Thinking Box Style</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Native ST reasoning-style collapsible display</div>
                        </div>
                    </label>
                    
                    <label class="carrot-radio-option" style="display: flex; align-items: center; padding: 12px; border: 1px solid var(--SmartThemeQuoteColor); border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="display-mode" value="cards" style="margin-right: 12px;">
                        <div>
                            <div style="font-weight: 500;">Character Cards</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">BunnyMoTags-style interactive character cards</div>
                        </div>
                    </label>
                </div>
                
                <div class="display-options" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--SmartThemeQuoteColor);">
                    <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px;">
                        <div>
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">Auto-expand displays</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Automatically expand thinking boxes and cards</div>
                        </div>
                        <label class="carrot-toggle">
                            <input type="checkbox" id="context-auto-expand">
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-syringe"></i> AI Injection Settings
                </h5>
                
                <div class="injection-settings" style="display: grid; gap: 15px;">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div>
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">AI Injection Enabled</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Send character data to AI context for consistency</div>
                        </div>
                        <label class="carrot-toggle">
                            <input type="checkbox" id="context-ai-injection" checked>
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div>
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">Filter tags from AI context</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Hide BunnyMoTags from AI (like ST's reasoning system)</div>
                        </div>
                        <label class="carrot-toggle">
                            <input type="checkbox" id="context-filter-tags" checked>
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>

                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div>
                            <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">Show what's being sent</div>
                            <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Display the injected text in your messages (for debugging)</div>
                        </div>
                        <label class="carrot-toggle">
                            <input type="checkbox" id="context-show-injection-text">
                            <span class="carrot-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Generate advanced settings tab
function generateAdvancedSettingsTab(currentSettings) {
    return `
        <div class="carrot-settings-grid" style="display: grid; gap: 20px;">
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-sliders"></i> Performance & Limits
                </h5>
                
                <div class="advanced-settings" style="display: grid; gap: 20px;">
                    <div class="setting-item">
                        <label style="display: block; font-weight: 500; color: var(--SmartThemeBodyColor); margin-bottom: 8px;">
                            Max Characters Displayed
                        </label>
                        <input type="number" id="context-max-chars" value="6" min="1" max="20" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid var(--SmartThemeQuoteColor);
                            border-radius: 6px;
                            background: var(--SmartThemeBlurTintColor);
                            color: var(--SmartThemeBodyColor);
                        ">
                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor); margin-top: 4px;">
                            Limit characters shown to prevent clutter (affects both injection and display)
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <label style="display: block; font-weight: 500; color: var(--SmartThemeBodyColor); margin-bottom: 8px;">
                            Injection Depth
                        </label>
                        <input type="number" id="context-injection-depth" value="4" min="1" max="20" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid var(--SmartThemeQuoteColor);
                            border-radius: 6px;
                            background: var(--SmartThemeBlurTintColor);
                            color: var(--SmartThemeBodyColor);
                        ">
                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor); margin-top: 4px;">
                            How deep to inject character data (4 = GuidedGenerations standard)
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="carrot-setting-group" style="background: var(--SmartThemeBlurTintColor); padding: 20px; border-radius: 10px; border: 1px solid var(--SmartThemeQuoteColor);">
                <h5 style="margin: 0 0 15px 0; color: var(--SmartThemeEmColor); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-download"></i> Import / Export
                </h5>
                
                <div class="import-export-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button class="carrot-btn secondary" id="export-context-profile" style="
                        padding: 12px;
                        border-radius: 8px;
                        border: 1px solid var(--SmartThemeQuoteColor);
                        background: transparent;
                        color: var(--SmartThemeBodyColor);
                        cursor: pointer;
                        font-weight: 500;
                    ">
                        <i class="fa-solid fa-download"></i> Export Profile
                    </button>
                    
                    <button class="carrot-btn secondary" id="import-context-profile" style="
                        padding: 12px;
                        border-radius: 8px;
                        border: 1px solid var(--SmartThemeQuoteColor);
                        background: transparent;
                        color: var(--SmartThemeBodyColor);
                        cursor: pointer;
                        font-weight: 500;
                    ">
                        <i class="fa-solid fa-upload"></i> Import Profile
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Generate profile browser section
async function generateProfileBrowser() {
    return `
        <div class="carrot-section">
            <div class="carrot-section-header">
                <i class="fa-solid fa-folder"></i>
                <h4>Saved Profiles Browser</h4>
            </div>
            <div class="carrot-section-content">
                <div class="carrot-tabs">
                    <button class="carrot-tab active" data-tab="my-profiles">My Profiles</button>
                    <button class="carrot-tab" data-tab="recent-profiles">Recent Activity</button>
                    <button class="carrot-tab" data-tab="profile-templates">Templates</button>
                </div>
                
                <div class="carrot-tab-content active" id="tab-my-profiles">
                    ${generateMyProfilesTab()}
                </div>
                
                <div class="carrot-tab-content" id="tab-recent-profiles">
                    ${generateRecentActivityTab()}
                </div>
                
                <div class="carrot-tab-content" id="tab-profile-templates">
                    ${generateProfileTemplatesTab()}
                </div>
            </div>
        </div>
    `;
}

// Generate my profiles tab
function generateMyProfilesTab() {
    return `
        <div class="carrot-profiles-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
            <div class="carrot-profile-card" style="
                background: var(--SmartThemeBlurTintColor);
                border: 1px solid var(--SmartThemeQuoteColor);
                border-radius: 10px;
                padding: 15px;
                transition: all 0.3s ease;
            ">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fa-solid fa-user" style="color: #2196f3;"></i>
                    <div>
                        <div style="font-weight: 500;">Alice Character Profile</div>
                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">2 lorebooks • Created 2 days ago</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="load-profile" style="
                        padding: 6px 12px;
                        border-radius: 6px;
                        border: 1px solid var(--SmartThemeQuoteColor);
                        background: transparent;
                        color: var(--SmartThemeBodyColor);
                        cursor: pointer;
                        font-size: 12px;
                    ">Load</button>
                    <button class="delete-profile" style="
                        padding: 6px 12px;
                        border-radius: 6px;
                        border: 1px solid #f44336;
                        background: transparent;
                        color: #f44336;
                        cursor: pointer;
                        font-size: 12px;
                    ">Delete</button>
                </div>
            </div>
            
            <div class="carrot-empty-state" style="
                grid-column: 1 / -1;
                text-align: center;
                color: var(--SmartThemeFadedColor);
                padding: 40px;
                background: var(--black20);
                border-radius: 10px;
                border: 2px dashed var(--SmartThemeQuoteColor);
            ">
                <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 10px;"></i>
                <div style="font-size: 18px; margin-bottom: 8px;">No Saved Profiles Yet</div>
                <div>Save your current settings to create your first profile</div>
            </div>
        </div>
    `;
}

// Generate recent activity tab
function generateRecentActivityTab() {
    return `
        <div class="carrot-activity-timeline" style="max-height: 400px; overflow-y: auto;">
            <div class="carrot-empty-state" style="
                text-align: center;
                color: var(--SmartThemeFadedColor);
                padding: 40px;
            ">
                <i class="fa-solid fa-clock" style="font-size: 32px; margin-bottom: 10px;"></i>
                <div style="font-size: 18px; margin-bottom: 8px;">No Recent Activity</div>
                <div>Profile activity will appear here as you save and load different configurations</div>
            </div>
        </div>
    `;
}

// Generate profile templates tab  
function generateProfileTemplatesTab() {
    return `
        <div class="carrot-templates-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
            <div class="carrot-template-card" style="
                background: linear-gradient(135deg, #4caf50 0%, rgba(76, 175, 80, 0.1) 100%);
                border: 1px solid #4caf50;
                border-radius: 10px;
                padding: 15px;
            ">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fa-solid fa-star" style="color: #4caf50;"></i>
                    <div>
                        <div style="font-weight: 500; color: var(--SmartThemeBodyColor);">General Purpose Template</div>
                        <div style="font-size: 12px; color: var(--SmartThemeFadedColor);">Basic setup for most characters</div>
                    </div>
                </div>
                
                <button class="apply-template" style="
                    width: 100%;
                    padding: 8px;
                    border-radius: 6px;
                    border: none;
                    background: #4caf50;
                    color: white;
                    cursor: pointer;
                    font-weight: 500;
                ">Apply Template</button>
            </div>
            
            <div class="carrot-empty-state" style="
                grid-column: 1 / -1;
                text-align: center;
                color: var(--SmartThemeFadedColor);
                padding: 40px;
                background: var(--black20);
                border-radius: 10px;
                border: 2px dashed var(--SmartThemeQuoteColor);
            ">
                <i class="fa-solid fa-magic-wand-sparkles" style="font-size: 32px; margin-bottom: 10px;"></i>
                <div style="font-size: 18px; margin-bottom: 8px;">Templates Coming Soon</div>
                <div>Pre-made configuration templates will be available here</div>
            </div>
        </div>
    `;
}

// Apply loadout changes (called when user clicks OK in the loadout manager)
async function applyLoadoutChanges() {
    // This will be implemented to handle saving changes from the loadout manager
    CarrotDebug.ui('Applying loadout changes...');
}

// Get loadout settings from the UI (helper function for loadout manager)
// Global CarrotKernel object for UI interactions
window.CarrotKernel = {
    // Tutorial delegation
    openSystemTutorial: () => openSystemTutorial(),
    openRepositoryTutorial: () => openRepositoryTutorial(),
    openInjectionTutorial: () => openInjectionTutorial(),
    openTemplateEditorTutorial: () => openTemplateEditorTutorial(),
    startTutorial: (id) => startTutorial(id),
    closeTutorial: () => closeTutorial(),
    
    // Popup utilities
    showPopup: (title, content) => showCarrotPopup(title, content),
    closePopup: () => closeCarrotPopup(),
    
    // Repository Manager
    openRepositoryManager: () => openRepositoryManager(),
    cleanupStaleRepositories: () => cleanupStaleRepositories(),
    renderRepositoryManager: () => renderRepositoryManager(),
    manualScan: () => manualRepositoryScan(),
    navigateRepoHome: () => navigateRepoHome(),
    selectRepository: (repoName) => selectRepository(repoName),
    updateRepositoryPreview: () => updateRepositoryPreview(),
    navigateToRepository: (repoName) => navigateToRepository(repoName),
    navigateToCharacter: (characterName, repoName) => navigateToCharacter(characterName, repoName),
    showCharacterDetails: (characterName) => showCharacterDetails(characterName),
    returnToRepositoryManager: () => returnToRepositoryManager(),
    updateRepositoryManagerContent: () => updateRepositoryManagerContent(),
    forceShowCharacterCards: () => forceShowCharacterCards(),

    // Pack/Template Manager
    openTemplateManager: () => openTemplateManager(),
    openPackManager: () => openPackManager(),
    showTemplateManagerInterface: () => showTemplateManagerInterface(),
    openTemplateEditor: () => openTemplateEditor(),
    showTemplateEditor: (selectedKey, allTemplates) => showTemplateEditor(selectedKey, allTemplates),
    showPackManagerInterface: () => showPackManagerInterface(),
    showGitHubBrowserContent: () => showGitHubBrowserContent(),
    updateBrowserContent: () => updateBrowserContent(),
    generateBreadcrumbs: (path) => generateBreadcrumbs(path),
    generateFileList: (items) => generateFileList(items),
    handleFileClick: (path, type, name) => handleFileClick(path, type, name),
    navigateToPath: (path) => navigateToPath(path),
    navigateToRoot: () => navigateToRoot(),
    refreshRepository: () => refreshRepository(),
    detectExistingPacks: () => detectExistingPacks(),
    downloadFile: (path, filename) => downloadFile(path, filename),
    previewFile: (path, filename) => previewFile(path, filename),
    showPackInstallDialog: (path, filename) => showPackInstallDialog(path, filename),
    installPackDirectly: (path, filename) => installPackDirectly(path, filename),
    executeInstall: (path, filename) => executeInstall(path, filename),
    checkPackInstalled: (filename) => checkPackInstalled(filename),
    closeInstallDialog: () => closeInstallDialog(),
    formatFileSize: (bytes) => formatFileSize(bytes),

    // Tutorial positioning/overlay
    getTutorialOverlay: () => getTutorialOverlay(),
    createTutorialOverlayInModal: (modal) => createTutorialOverlayInModal(modal),
    createTutorialOverlayInDocument: () => createTutorialOverlayInDocument(),
    showTutorialStep: () => showTutorialStep(),
    showTutorialOverlay: () => showTutorialOverlay(),
    highlightTargetElement: (target) => highlightTargetElement(target),
    nextTutorialStep: () => nextTutorialStep(),
    previousTutorialStep: () => previousTutorialStep(),
    addResizeHandler: () => addResizeHandler(),
    applyViewportSafeguards: (popup) => applyViewportSafeguards(popup),
    highlightElement: (targetElement, step) => highlightElement(targetElement, step),
    positionTutorialPopupWithSafeguards: (targetRect, safeguards) => positionTutorialPopupWithSafeguards(targetRect, safeguards),
    positionTutorialPopup: (targetRect) => positionTutorialPopup(targetRect),
    addPopupArrow: (popup, targetRect, popupRect, positioning) => addPopupArrow(popup, targetRect, popupRect, positioning),
    
    // Baby Bunny Mode
    openBabyBunnyTutorial: () => openBabyBunnyTutorial(),
    showTutorialBabyBunnyPopup: (bunnyData) => showTutorialBabyBunnyPopup(bunnyData),
    closeBabyBunnyTutorial: () => closeBabyBunnyTutorial(),
    checkForCompletedSheets: () => checkForCompletedSheets(),
    
    // RAG/Chunk Visualizer
    openChunkVisualizer: (collectionId) => openChunkVisualizer(collectionId),
    closeChunkVisualizer: () => closeChunkVisualizer(),
    saveChunkChanges: () => saveChunkChanges(),

    // Lorebook Connector
    openLorebookConnector: () => CarrotLorebookConnector.open(),
    closeLorebookConnector: () => CarrotLorebookConnector.close(),

    // Lorebook Scanning (exposed for pack manager)
    scanSelectedLorebooks: (lorebookNames) => scanSelectedLorebooks(lorebookNames),

    // Utilities
    parseBunnymoTags: (text) => parseBunnymoTags(text),
    debugModalSizing: () => debugModalSizing()
};
;

// Store event handler references for cleanup
let carrotEventHandlers = {
    chatChanged: null,
    messageRendered: null,
    chatRestoreListener: null
};

// Teardown function - removes all event listeners and cleans up
function teardownExtension() {
    CarrotDebug.init('Tearing down CarrotKernel - removing all event listeners...');

    // Remove event listeners if they were registered
    if (carrotEventHandlers.chatChanged && window.CARROT_CHAT_LISTENERS_REGISTERED) {
        eventSource.removeListener(event_types.CHAT_CHANGED, carrotEventHandlers.chatChanged);
        window.CARROT_CHAT_LISTENERS_REGISTERED = false;
    }

    if (carrotEventHandlers.messageRendered && window.CARROT_MESSAGE_LISTENER_REGISTERED) {
        eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, carrotEventHandlers.messageRendered);
        window.CARROT_MESSAGE_LISTENER_REGISTERED = false;
    }

    if (carrotEventHandlers.worldInfoActivated && window.CARROT_WORLDINFO_LISTENER_REGISTERED) {
        eventSource.removeListener(event_types.WORLD_INFO_ACTIVATED, carrotEventHandlers.worldInfoActivated);
        window.CARROT_WORLDINFO_LISTENER_REGISTERED = false;
    }

    // NOTE: MESSAGE_DELETED and MESSAGE_SWIPED listeners removed - no longer needed

    // Clear scanned data
    scannedCharacters.clear();
    selectedLorebooks.clear();

    // Remove any displayed character cards/thinking blocks
    document.querySelectorAll('.carrot-reasoning-details, .carrot-cards-container, .carrot-thinking-details').forEach(el => el.remove());

    // Disable WorldBook Tracker
    if (typeof CarrotWorldBookTracker !== 'undefined') {
        CarrotWorldBookTracker.disable();
    }

    // Remove Baby Bunny buttons
    remove_all_baby_bunny_buttons();

    CarrotDebug.init('CarrotKernel teardown complete - extension dormant');
}

// Register all event listeners - can be called multiple times safely due to registration guards
function registerEventListeners() {
    CarrotDebug.init('Registering CarrotKernel event listeners...');

    // 1. CHAT_CHANGED listener - Load lorebooks based on connections on chat load
    if (!window.CARROT_CHAT_LISTENERS_REGISTERED) {
        // Store the handler so we can remove it later
        carrotEventHandlers.chatChanged = async () => {
            const settings = extension_settings[extensionName];

            CarrotDebug.scan('CHAT_CHANGED: Loading lorebooks based on connections...');

            // PHASE 1: SCAN - Load character data from lorebooks
            const autoRescan = settings?.autoRescanOnChatLoad ?? true;

            if (autoRescan) {
                // ALWAYS scan all character repos to ensure we have all character data for restoration
                // This is critical because stored character data might reference any character repo
                const allCharRepos = Array.from(characterRepoBooks);

                if (allCharRepos.length > 0) {
                    CarrotDebug.scan(`Scanning all ${allCharRepos.length} character repos for restoration support`);
                    await scanSelectedLorebooks(allCharRepos);
                    CarrotDebug.scan(`Scan complete - ${scannedCharacters.size} character(s) loaded from character repos`);
                } else {
                    CarrotDebug.scan('No character repos configured - nothing to scan');
                }
            }

            // PHASE 2: RESTORE - Restore thinking blocks from message.extra AFTER scan completes (only if in thinking mode)
            if (settings?.enabled && settings.displayMode === 'thinking') {
                // Small delay to ensure DOM is fully ready
                setTimeout(async () => {
                    await restoreThinkingBlocksFromMessageExtra();
                }, 500);
            }
        };

        // Register the handler
        eventSource.on(event_types.CHAT_CHANGED, carrotEventHandlers.chatChanged);
        window.CARROT_CHAT_LISTENERS_REGISTERED = true;
        CarrotDebug.init('✓ CHAT_CHANGED listener registered (scan + restore coordinated)');
    }

    // 2. CHARACTER_MESSAGE_RENDERED listener - Display thinking blocks and add persistent tags
    if (!window.CARROT_MESSAGE_LISTENER_REGISTERED) {
        // Store the handler so we can remove it later
        carrotEventHandlers.messageRendered = async (messageId) => {
            console.log('📨 CHARACTER_MESSAGE_RENDERED EVENT START - messageId:', messageId);
            console.log('📨 pendingThinkingBlockData at start:', pendingThinkingBlockData);

            const settings = extension_settings[extensionName];

            console.log('📨 Settings:', { enabled: settings?.enabled, displayMode: settings?.displayMode });

            // CHARACTER_MESSAGE_RENDERED fires for AI messages, but we only want to show cards
            // when we have pending data from a previous user message that triggered WORLD_INFO_ACTIVATED
            // messageId is the array index, not a message property
            const message = chat[messageId];

            console.log('📨 Message found:', !!message, 'is_user:', message?.is_user);

            CarrotDebug.ui('Message lookup details:', {
                messageId,
                chatLength: chat.length,
                messageFound: !!message,
                chatIndexes: chat.map(msg => msg.index),
                lastMessage: chat[chat.length - 1],
                lastMessageIndex: chat[chat.length - 1]?.index,
                targetMessage: message
            });

            // Try alternative lookup methods
            const messageByLength = chat[chat.length - 1];
            const messageByIdDirect = chat.find(msg => msg.id === messageId);
            CarrotDebug.ui('Alternative lookups:', {
                lastMessageByLength: messageByLength,
                messageByIdDirect,
                lastMessageContentPreview: messageByLength?.mes?.substring(0, 200)
            });

            CarrotDebug.ui(`🎭 CHARACTER_MESSAGE_RENDERED fired for message ${messageId}`, {
                messageId: messageId,
                isUser: message?.is_user,
                messageFound: !!message,
                pendingDataLength: pendingThinkingBlockData.length,
                displayMode: settings.displayMode,
                hasStoredData: message?.extra?.carrot_character_data ? true : false
            });

            // Skip if this is a user message (we process user messages in WORLD_INFO_ACTIVATED)
            if (message?.is_user) {
                CarrotDebug.ui(`⏭️ Skipping CHARACTER_MESSAGE_RENDERED - this is a user message, handled by WORLD_INFO_ACTIVATED`);
                return;
            }

            // Only process thinking mode here (cards mode handled by WORLD_INFO_ACTIVATED)
            if (settings.displayMode !== 'thinking') {
                return;
            }

            // Find character data from the preceding user message or this AI message
            let characterNames = [];

            // First check if this AI message already has character data (swipe/refresh scenario)
            const aiStoredData = message?.extra?.carrot_character_data;
            if (aiStoredData) {
                // Support both formats: array (old) or object with .characters property (current)
                if (Array.isArray(aiStoredData)) {
                    characterNames = aiStoredData;
                } else if (aiStoredData.characters && Array.isArray(aiStoredData.characters)) {
                    characterNames = aiStoredData.characters;
                }

                if (characterNames.length > 0) {
                    console.log('📨 Found character data in AI message.extra:', characterNames);
                }
            }

            // If not found in AI message, look in previous user message
            if (characterNames.length === 0) {
                // Look for character data in the previous user message
                // AI responses always follow user messages
                const userMessageIndex = chat.findLastIndex((msg, idx) => msg.is_user && idx < messageId);

                if (userMessageIndex >= 0) {
                    const userMessage = chat[userMessageIndex];
                    const userStoredData = userMessage?.extra?.carrot_character_data;

                    if (userStoredData) {
                        // Support both formats
                        if (Array.isArray(userStoredData)) {
                            characterNames = userStoredData;
                        } else if (userStoredData.characters && Array.isArray(userStoredData.characters)) {
                            characterNames = userStoredData.characters;
                        }

                        if (characterNames.length > 0) {
                            console.log('📨 Found character data in user message.extra:', characterNames);

                            // Copy character data to AI message for easy access later (use object format)
                            if (!message.extra) {
                                message.extra = {};
                            }
                            message.extra.carrot_character_data = {
                                characters: characterNames,
                                displayMode: settings.displayMode,
                                timestamp: Date.now(),
                                version: '1.0'
                            };
                            console.log('📨 Copied character data to AI message.extra');
                        }
                    }
                }
            }

            // Display thinking block if we have character data
            if (characterNames.length > 0) {
                try {
                    const existingThinkingBlock = document.querySelector(`[mesid="${messageId}"] .carrot-thinking-details`);

                    if (!existingThinkingBlock) {
                        console.log('📨 Displaying thinking block for characters:', characterNames);
                        displayCharacterData(characterNames);
                    } else {
                        console.log('📨 Thinking block already exists, skipping');
                    }
                } catch (error) {
                    console.error('📨 ❌ Error displaying thinking block:', error);
                    CarrotDebug.error('Error displaying character data:', error);
                }
            } else {
                console.log('📨 No character data found to display');
            }

            // Add persistent tags
            addPersistentTagsToMessage(messageId);

            // 🐰 Baby Bunny Mode: Detect completed sheets and trigger guided automation
            CarrotDebug.ui('Checking if Baby Bunny Mode should trigger', {
                babyBunnyMode: settings.babyBunnyMode,
                isUser: message?.is_user,
                messageId: messageId,
                shouldTrigger: settings.babyBunnyMode && !message?.is_user
            });

            if (settings.babyBunnyMode && !message?.is_user) {
                CarrotDebug.ui('Triggering Baby Bunny Mode detection');

                // If message lookup failed, try using the last message as fallback
                let targetMessage = message;
                if (!targetMessage && messageByLength && !messageByLength.is_user) {
                    CarrotDebug.ui('Using fallback - last message from chat array');
                    targetMessage = messageByLength;
                }

                checkForCompletedSheets(targetMessage, messageId);
            } else {
                CarrotDebug.ui('Not triggering - either disabled or user message');
            }
        };

        // Register the handler
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, carrotEventHandlers.messageRendered);
        window.CARROT_MESSAGE_LISTENER_REGISTERED = true;
        CarrotDebug.init('✓ CHARACTER_MESSAGE_RENDERED listener registered');
    }

    // 3. WORLD_INFO_ACTIVATED listener - Process activated entries and populate scannedCharacters
    if (!window.CARROT_WORLDINFO_LISTENER_REGISTERED) {
        // Wrapper function that checks for sheet commands first, then processes normal entries
        carrotEventHandlers.worldInfoActivated = async function(entryList) {
            console.log('🌍 WORLD_INFO_ACTIVATED EVENT START');
            console.log('🌍 entryList:', entryList);

            const settings = extension_settings[extensionName];

            console.log('🌍 Settings:', { enabled: settings?.enabled, displayMode: settings?.displayMode });

            if (!settings.enabled || !entryList || entryList.length === 0) {
                console.log('🌍 Skipping - not enabled or no entries');
                return;
            }

            // Get the most recent user message to check what command they actually typed
            const context = getContext();
            const lastMessage = context?.chat?.[context.chat.length - 1];
            const lastMessageText = lastMessage?.mes || '';

            // Check what sheet command was in the user's message (if any)
            let commandFromMessage = null;
            const commandPatterns = [
                { command: '!updatesheet', type: 'updatesheet' },  // Check longest first
                { command: '!quicksheet', type: 'quicksheet' },
                { command: '!fullsheet', type: 'fullsheet' },
                { command: '!tagsheet', type: 'tagsheet' },
                { command: '!memsheet', type: 'memsheet' },
                { command: '!physheet', type: 'physheet' }
            ];

            for (const { command, type } of commandPatterns) {
                if (lastMessageText.toLowerCase().includes(command)) {
                    commandFromMessage = type;
                    CarrotDebug.inject(`Detected ${command} in user message`);
                    break;
                }
            }

            // If a sheet command was found in the message, process it
            if (commandFromMessage) {
                // Find the matching sheet command entry
                const sheetCommandEntry = entryList.find(entry => {
                    const key = entry.key || entry.keys || entry.title || entry.comment || '';
                    const keyStr = (typeof key === 'string') ? key.toLowerCase() :
                                  (Array.isArray(key)) ? key.join(' ').toLowerCase() :
                                  String(key).toLowerCase();

                    // Match the specific command found in the message
                    return keyStr && keyStr.includes(`!${commandFromMessage}`);
                });

                if (sheetCommandEntry) {
                    CarrotDebug.inject('Sheet command entry detected:', {
                        type: commandFromMessage,
                        entry: sheetCommandEntry
                    });

                    // Process the sheet command
                    const pendingCommand = {
                        type: commandFromMessage,
                        entry: sheetCommandEntry
                    };

                    try {
                        const success = await processSheetCommand(pendingCommand);
                        if (success) {
                            CarrotDebug.inject('✅ Sheet command processed successfully', pendingCommand);
                        } else {
                            CarrotDebug.error('❌ Sheet command processing failed', pendingCommand);
                        }
                    } catch (error) {
                        CarrotDebug.error('❌ Error processing sheet command:', error);
                    }

                    // Skip normal character processing when sheet command is executed
                    CarrotDebug.inject('Sheet command executed, skipping normal processing');
                    return;
                }
            }

            // No sheet command found, proceed with normal processing
            console.log('🌍 Processing normal lorebook entries...');
            await processActivatedLorebookEntries(entryList);
            console.log('🌍 WORLD_INFO_ACTIVATED EVENT COMPLETE');
            console.log('🌍 pendingThinkingBlockData after processing:', pendingThinkingBlockData);
        };

        // Register the handler
        eventSource.on(event_types.WORLD_INFO_ACTIVATED, carrotEventHandlers.worldInfoActivated);
        window.CARROT_WORLDINFO_LISTENER_REGISTERED = true;
        CarrotDebug.init('✓ WORLD_INFO_ACTIVATED listener registered (with sheet command detection)');
    }

    // NOTE: MESSAGE_DELETED and MESSAGE_SWIPED handlers removed
    // - MESSAGE_DELETED: Not needed - ST handles message.extra cleanup automatically
    // - MESSAGE_SWIPED: Not needed - ST's syncSwipeToMes() loads message.extra from swipe_info automatically
    //   When user swipes, ST loads swipe_info[swipeId].extra into message.extra
    //   CHARACTER_MESSAGE_RENDERED then fires and renders the thinking block from message.extra

    CarrotDebug.init('All event listeners registered successfully');
}

// =============================================================================
// MAIN INITIALIZATION - Execute on module load
// =============================================================================
(async () => {
    try {
        // Add CSS for CarrotKernel thinking blocks (exact copy of ST's native reasoning styles)
        const carrotThinkingCSS = `
            /* Copy all ST reasoning styles but with carrot-thinking prefixes */
            .carrot-thinking-details {
                all: unset;
                display: block;
                margin: 0.5rem 0;
                border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 50%, transparent);
                border-radius: 0.375rem;
                background: var(--SmartThemeBlurTintColor);
                backdrop-filter: blur(var(--SmartThemeBlurStrength));
                overflow: hidden;
                max-width: fit-content;
                width: auto;
            }

            .carrot-thinking-summary {
                all: unset;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.5rem 0.75rem;
                cursor: pointer;
                user-select: none;
                background: linear-gradient(135deg, transparent, color-mix(in srgb, var(--SmartThemeQuoteColor) 5%, transparent));
                border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 30%, transparent);
                transition: all 0.2s ease;
                list-style: none;
                min-height: 1.75rem;
            }

            .carrot-thinking-summary:hover {
                background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
            }

            .carrot-thinking-summary::marker,
            .carrot-thinking-summary::-webkit-details-marker {
                display: none;
            }

            .carrot-thinking-header-block {
                display: flex;
                align-items: center;
                flex: 1;
            }

            .carrot-thinking-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                flex: 1;
            }

            .carrot-thinking-header-title {
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--SmartThemeBodyColor);
                opacity: 0.9;
            }

            .carrot-thinking-arrow {
                font-size: 0.75rem;
                color: var(--SmartThemeQuoteColor);
                opacity: 0.7;
                transition: transform 0.2s ease;
                margin-left: auto;
            }

            .carrot-thinking-details[open] .carrot-thinking-arrow {
                transform: rotate(180deg);
            }

            .carrot-thinking-content {
                padding: 1rem;
                color: var(--SmartThemeBodyColor);
                line-height: 1.6;
                background: color-mix(in srgb, var(--SmartThemeChatTintColor) 40%, transparent);
                border-top: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 20%, transparent);
            }

            /* Match ST's hover behavior - thinking boxes fade when not hovered */
            .carrot-thinking-details {
                opacity: 0.3;
                transition: opacity 0.2s ease;
            }

            .mes:hover .carrot-thinking-details,
            .carrot-thinking-details:hover {
                opacity: 1;
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.textContent = carrotThinkingCSS;
        document.head.appendChild(styleElement);

        // Initialize context and storage managers first
        CarrotContext = new CarrotContextManager();
        await CarrotContext.initialize();

        CarrotStorage = new CarrotStorageManager(CarrotContext);

        // Initialize repository manager with popup functions and dependencies
        initializeRepositoryManager(showCarrotPopup, closeCarrotPopup, scanSelectedLorebooks, updateStatusPanels);

        // Initialize pack manager with retry mechanism
        CarrotDebug.repo('Initializing CarrotPackManager...');

        async function initializePackManagerWithRetry(retries = 3, delay = 1000) {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    CarrotDebug.repo(`Initialization attempt ${attempt}/${retries}`);

                    // Clear any existing instance
                    if (window.CarrotPackManager) {
                        CarrotDebug.repo('Clearing existing CarrotPackManager instance');
                        delete window.CarrotPackManager;
                    }

                    window.CarrotPackManager = new CarrotPackManager();
                    CarrotDebug.repo('CarrotPackManager created successfully');

                    window.CarrotPackManager.loadLocalPacks();
                    CarrotDebug.repo('Local packs loaded');

                    // Verify the instance is properly set up
                    const verification = {
                        exists: !!window.CarrotPackManager,
                        hasScanMethod: typeof window.CarrotPackManager.scanRemotePacks === 'function',
                        hasLoadMethod: typeof window.CarrotPackManager.loadLocalPacks === 'function',
                        githubRepo: window.CarrotPackManager.githubRepo,
                        packsFolder: window.CarrotPackManager.packsFolder
                    };

                    CarrotDebug.repo('CarrotPackManager verification:', verification);

                    // Validate that all required components are working
                    if (!verification.exists || !verification.hasScanMethod || !verification.hasLoadMethod) {
                        throw new Error('CarrotPackManager initialization incomplete');
                    }

                    CarrotDebug.repo('✅ CarrotPackManager initialized successfully on attempt', attempt);
                    return true;

                } catch (error) {
                    CarrotDebug.error(`Initialization attempt ${attempt} failed:`, error);

                    if (attempt < retries) {
                        CarrotDebug.repo(`Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    } else {
                        CarrotDebug.error('All initialization attempts failed');

                        // Provide user-visible error
                        setTimeout(() => {
                            if ($('#carrot-pack-status').length) {
                                $('#carrot-pack-status').html(`
                                    <p>❌ Pack Manager failed to initialize after ${retries} attempts.</p>
                                    <p>🔄 <button onclick="location.reload()" class="menu_button">Refresh Page</button></p>
                                    <p>💻 Open console for detailed error logs</p>
                                `);
                            }
                        }, 2000);

                        return false;
                    }
                }
            }
        }

        // Start initialization
        await initializePackManagerWithRetry()

        // Add global diagnostic function for users to troubleshoot pack manager issues
        window.CarrotPackManagerDiagnostics = function() {
            console.group('🥕 CARROT PACK MANAGER DIAGNOSTICS');

            CarrotDebug.ui('1. Pack Manager Instance:', {
                exists: !!window.CarrotPackManager,
                type: typeof window.CarrotPackManager,
                constructor: window.CarrotPackManager?.constructor?.name
            });

            if (window.CarrotPackManager) {
                CarrotDebug.ui('2. Pack Manager Methods:', {
                    scanRemotePacks: typeof window.CarrotPackManager.scanRemotePacks,
                    loadLocalPacks: typeof window.CarrotPackManager.loadLocalPacks,
                    getPackInfo: typeof window.CarrotPackManager.getPackInfo
                });

                CarrotDebug.ui('3. Pack Manager Configuration:', {
                    githubRepo: window.CarrotPackManager.githubRepo,
                    packsFolder: window.CarrotPackManager.packsFolder,
                    availablePacksSize: window.CarrotPackManager.availablePacks?.size
                });
            }

            CarrotDebug.ui('4. UI Elements:', {
                scanButton: !!$('#carrot-pack-scan').length,
                statusElement: !!$('#carrot-pack-status').length,
                masterToggle: !!$('#carrot_enabled').length,
                masterEnabled: extension_settings[extensionName]?.enabled
            });

            CarrotDebug.ui('5. Extension Settings:', {
                extensionName: extensionName,
                settingsExist: !!extension_settings[extensionName],
                debugMode: extension_settings[extensionName]?.debugMode
            });

            CarrotDebug.repo('6. Test GitHub API Access (run this manually if needed):');
            CarrotDebug.repo('fetch("https://api.github.com/repos/Chi-BiWolf/CarrotKernel-packs/contents/packs").then(r => CarrotDebug.ui("API Status:", r.status, r.statusText))');
            CarrotDebug.repo('7. Test Rate-Limited API Access:');
            CarrotDebug.repo('window.CarrotPackManager.testRateLimiting() // Tests the new rate limiting system');

            console.groupEnd();

            return 'Diagnostics completed. Check the logs above for any issues.';
        };

        CarrotDebug.repo('Diagnostic function added. Run CarrotPackManagerDiagnostics() in console to troubleshoot.');

        // Check for pack updates on startup (like ST extensions)
        setTimeout(async () => {
            if (extension_settings[extensionName]?.autoCheckUpdates !== false) {
                await window.CarrotPackManager.checkForUpdates();
            }
        }, 5000); // Wait 5 seconds after startup
        
        // Initialize settings
        initializeSettings();

        // Initialize sheet generator with findCharacterByName function
        // This fixes the circular dependency issue by injecting the function at runtime
        initializeSheetGenerator(findCharacterByName);
        CarrotDebug.init('Sheet generator initialized with findCharacterByName');

        // Initialize card renderer with findCharacterByName/refreshTabContent —
        // same circular-dependency fix as sheet generator above.
        initializeCardRenderer(findCharacterByName, refreshTabContent);
        CarrotDebug.init('Card renderer initialized with dependencies');

        // Load settings HTML - silent initialization
        const settingsHtml = await $.get(`scripts/extensions/third-party/${extensionName}/settings.html`);
        $('#extensions_settings').append(settingsHtml);

        // Update lorebook list
        updateLorebookList();

        // Bind settings events
        bindSettingsEvents();

        // Debug all carrot-related icon clicks in world info
        $(document).on('click', '.fa-carrot, .wi_icon[title*="carrot"], .world_entry_icon[title*="carrot"], .carrot-icon', function(e) {
            CarrotDebug.ui('Carrot icon clicked!', {
                element: this,
                target: e.target,
                currentTarget: e.currentTarget,
                classes: this.className,
                title: this.title,
                dataAttributes: Object.fromEntries(Object.entries(this.dataset || {})),
                parentElement: this.parentElement,
                timestamp: new Date().toISOString()
            });

            // Check if this is within a world info entry
            const worldEntry = $(this).closest('.world_entry, .wi_entry, .world_info_entry');
            if (worldEntry.length) {
                CarrotDebug.ui('Found parent world info entry:', {
                    entryElement: worldEntry[0],
                    entryId: worldEntry.attr('id'),
                    entryClasses: worldEntry[0].className,
                    entryData: Object.fromEntries(Object.entries(worldEntry[0].dataset || {}))
                });
            }

            // Check if click is being prevented
            CarrotDebug.ui('Event details:', {
                defaultPrevented: e.isDefaultPrevented(),
                propagationStopped: e.isPropagationStopped(),
                immediatePropagationStopped: e.isImmediatePropagationStopped(),
                eventType: e.type,
                originalEvent: e.originalEvent
            });
        });

        // Debug general world info icon clicks
        $(document).on('click', '.world_entry .fa-fw, .world_entry .world_entry_icon, .wi_entry .fa-fw', function(e) {
            CarrotDebug.ui('World info icon clicked!', {
                element: this,
                classes: this.className,
                title: this.title,
                isCarrotIcon: this.classList.contains('fa-carrot'),
                parentEntry: $(this).closest('.world_entry, .wi_entry')[0],
                timestamp: new Date().toISOString()
            });
        });

        // =============================================================================
        // 🐰 EVENT LISTENER REGISTRATION
        // =============================================================================

        // Only register event listeners if extension is enabled
        // If disabled, user can still toggle it back on via the settings panel
        if (extension_settings[extensionName]?.enabled) {
            CarrotDebug.init('Extension is enabled - registering event listeners');
            registerEventListeners();
        } else {
            CarrotDebug.init('Extension is disabled - skipping event listener registration');
            CarrotDebug.init('Settings panel remains accessible - toggle Master Enable to activate');
        }

        // Initialize debug system
        CarrotDebug.setEnabled(extension_settings[extensionName]?.debugMode || false);
        
        // Initialize BunnyMoTags context filtering (delayed to ensure Generate function exists)
        setTimeout(() => {
            initializeBunnyMoTagsContextFiltering();
        }, 1000);
        
        // Get context-aware settings to determine if we should auto-scan
        const currentSettings = await CarrotStorage.getSettings();

        // Only auto-scan and initialize features if extension is enabled
        if (extension_settings[extensionName]?.enabled) {
            // Determine which lorebooks to scan: selected ones, or fall back to marked character repos
            let lorebooksToScan = Array.from(selectedLorebooks);
            if (lorebooksToScan.length === 0 && characterRepoBooks.size > 0) {
                CarrotDebug.init('No selected lorebooks, will scan marked character repos');
                lorebooksToScan = Array.from(characterRepoBooks);
            }

            // Only auto-scan if explicitly enabled in settings and we have lorebooks to scan
            if (currentSettings.scanOnStartup && lorebooksToScan.length > 0 && scannedCharacters.size === 0) {
                CarrotDebug.init('Auto-scanning lorebooks on initialization (enabled in settings)');
                const scanResult = await scanSelectedLorebooks(lorebooksToScan);
                CarrotDebug.init('Auto-scan completed', scanResult);
            } else if (lorebooksToScan.length > 0) {
                CarrotDebug.init('Auto-scan disabled - lorebooks will be scanned on-demand only');
            }

            // Initialize WorldBook Tracker
            try {
                CarrotWorldBookTracker.init();
                CarrotDebug.init('WorldBook Tracker initialized successfully');

                // Apply initial enabled state
                if (!extension_settings[extensionName]?.worldBookTrackerEnabled) {
                    CarrotWorldBookTracker.disable();
                }
            } catch (error) {
                CarrotDebug.error('WorldBook Tracker initialization failed', error);
            }
        } else {
            CarrotDebug.init('Extension disabled - skipping auto-scan and feature initialization');
        }

        CarrotDebug.init('CarrotKernel initialized successfully', {
            version: '1.0.0',
            contextValid: CarrotContext.isContextValid(),
            debugMode: extension_settings[extensionName]?.debugMode,
            lorebooks: selectedLorebooks.size,
            characters: scannedCharacters.size,
            scanOnStartup: currentSettings.scanOnStartup
        });
        
    } catch (error) {
        // Always log initialization errors to console, regardless of debug settings
        CarrotDebug.error('🥕 CarrotKernel initialization failed:', error);
        CarrotDebug.error('Stack trace:', error.stack);
        CarrotDebug.error('CarrotKernel initialization failed', error);
    }
})();

// Apply master enable state to UI and functionality
function applyMasterEnableState(isEnabled) {
    CarrotDebug.ui('applyMasterEnableState called:', {
        isEnabled: isEnabled,
        timestamp: new Date().toISOString()
    });

    // Disable/enable all CarrotKernel UI elements
    const uiElements = [
        '#carrot_send_to_ai',
        '#carrot_display_mode',
        '#carrot_auto_expand',
        '#carrot_debug_mode',
        '#carrot_filter_context',
        '#carrot_baby_bunny_mode',
        '#carrot_worldbook_tracker',
        '#carrot_auto_rescan',
        '#carrot_max_characters_display',
        '#carrot_max_characters_inject',
        '#carrot-scan-btn',
        '#carrot-test-display',
        '.carrot-lorebook-toggle',
        '.carrot-repo-btn',
        '#carrot-search-lorebooks'
    ];

    CarrotDebug.ui('Updating UI elements state:', {
        elementCount: uiElements.length,
        disabling: !isEnabled
    });

    uiElements.forEach(selector => {
        const element = $(selector);
        const elementExists = element.length > 0;
        element.prop('disabled', !isEnabled);

        if (!elementExists) {
            CarrotDebug.error(`UI element not found: ${selector}`);
        }
    });

    // Add visual indication to the entire settings panel
    if (isEnabled) {
        CarrotDebug.ui('Enabling UI - removing disabled class');
        $('#carrot_settings').removeClass('carrot-disabled');

        // Re-register all event listeners
        registerEventListeners();

        // Re-enable WorldBook Tracker if it was enabled in settings
        if (extension_settings[extensionName]?.worldBookTrackerEnabled) {
            CarrotWorldBookTracker.enable();
        }

        // Re-add Baby Bunny buttons if enabled in settings
        if (extension_settings[extensionName]?.babyBunnyMode) {
            add_baby_bunny_buttons_to_all_existing_messages();
        }

        CarrotDebug.ui('UI elements ENABLED and event listeners registered');
    } else {
        CarrotDebug.ui('Disabling UI - tearing down extension');
        $('#carrot_settings').addClass('carrot-disabled');

        // Tear down all event listeners and clean up
        teardownExtension();

        CarrotDebug.ui('UI elements DISABLED and extension torn down');
    }
}

// Bind all settings UI events
function bindSettingsEvents() {
    CarrotDebug.ui('bindSettingsEvents called');

    // Check if DOM is ready and elements exist before binding
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            function checkElement() {
                const element = $(selector);
                if (element.length > 0) {
                    CarrotDebug.ui(`Element found: ${selector}`);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    CarrotDebug.ui(`Element not found after ${timeout}ms: ${selector}`);
                    reject(new Error(`Element ${selector} not found within timeout`));
                } else {
                    setTimeout(checkElement, 100);
                }
            }

            checkElement();
        });
    }

    const settings = extension_settings[extensionName];

    // Wait for critical UI elements before binding events
    const criticalElements = [
        '#carrot_enabled',
        '#carrot-pack-scan',
        '#carrot_settings'
    ];

    CarrotDebug.ui('Waiting for critical elements...', criticalElements);

    Promise.allSettled(criticalElements.map(selector => waitForElement(selector)))
        .then(results => {
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                CarrotDebug.ui('Some elements not found:', failures.map(f => f.reason?.message));
            }

            CarrotDebug.ui('Proceeding with event binding...');
            bindActualEvents();
        })
        .catch(error => {
            CarrotDebug.error('Critical error in element waiting:', error);
            // Try binding anyway as a fallback
            setTimeout(() => bindActualEvents(), 2000);
        });

    function bindActualEvents() {
        CarrotDebug.ui('Starting actual event binding...');
    
    // Master enable toggle
    $('#carrot_enabled').prop('checked', settings.enabled).on('change', async function() {
        const isEnabled = Boolean($(this).prop('checked'));
        CarrotDebug.ui('Master toggle state changed:', {
            previousState: settings.enabled,
            newState: isEnabled,
            timestamp: new Date().toISOString()
        });

        extension_settings[extensionName].enabled = isEnabled;

        CarrotDebug.ui('Applying master enable state...');
        // Apply master enable state
        applyMasterEnableState(isEnabled);

        CarrotDebug.ui('Updating status panels...');
        // Update status panels
        updateStatusPanels();


        CarrotDebug.ui('Saving settings...');
        saveSettingsDebounced();
        CarrotDebug.setting('masterEnable', !isEnabled, isEnabled);

        CarrotDebug.ui('Master toggle change completed');
    });
    
    // Display mode
    $('#carrot_display_mode').val(settings.displayMode).on('change', async function() {
        const newMode = String($(this).val());
        const oldMode = extension_settings[extensionName].displayMode;
        extension_settings[extensionName].displayMode = newMode;

        // Clear existing displays when switching to 'none'
        if (newMode === 'none') {
            const existingDisplays = document.querySelectorAll('.carrot-reasoning-details, .carrot-cards-container, .carrot-thinking-details');
            existingDisplays.forEach(el => el.remove());
            CarrotDebug.ui(`Cleared ${existingDisplays.length} character displays (switched to 'none')`);
        }

        saveSettingsDebounced();
    });
    
    // Send to AI
    $('#carrot_send_to_ai').prop('checked', settings.sendToAI).on('change', async function() {
        extension_settings[extensionName].sendToAI = Boolean($(this).prop('checked'));
        updateStatusPanels();
        saveSettingsDebounced();
    });
    
    // Auto-expand
    $('#carrot_auto_expand').prop('checked', settings.autoExpand).on('change', async function() {
        extension_settings[extensionName].autoExpand = Boolean($(this).prop('checked'));
        saveSettingsDebounced();
    });
    
    // Debug mode
    $('#carrot_debug_mode').prop('checked', settings.debugMode).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('debugMode', settings.debugMode, newValue);
        extension_settings[extensionName].debugMode = newValue;
        CarrotDebug.setEnabled(newValue);
        saveSettingsDebounced();
    });
    
    // Baby Bunny Mode
    $('#carrot_baby_bunny_mode').prop('checked', settings.babyBunnyMode).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('babyBunnyMode', settings.babyBunnyMode, newValue);
        extension_settings[extensionName].babyBunnyMode = newValue;
        saveSettingsDebounced();

        CarrotDebug.ui('Baby Bunny toggle changed', {
            oldValue: settings.babyBunnyMode,
            newValue: newValue,
            settingsSaved: true
        });

        if (newValue) {
            add_baby_bunny_buttons_to_all_existing_messages();
            toastr.info('🐰 Baby Bunny Mode enabled! I\'ll now guide you through creating character archives when you complete sheet commands.');
            CarrotDebug.ui('Baby Bunny Mode ENABLED - will detect BunnymoTags in AI responses');
        } else {
            remove_all_baby_bunny_buttons();
            toastr.info('🐰 Baby Bunny Mode disabled.');
            CarrotDebug.ui('Baby Bunny Mode DISABLED');
        }

    });

    // WorldBook Tracker toggle
    $('#carrot_worldbook_tracker').prop('checked', settings.worldBookTrackerEnabled).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('worldBookTrackerEnabled', settings.worldBookTrackerEnabled, newValue);
        extension_settings[extensionName].worldBookTrackerEnabled = newValue;
        saveSettingsDebounced();

        if (newValue) {
            CarrotWorldBookTracker.enable();
            toastr.info('🥕 WorldBook Tracker enabled');
        } else {
            CarrotWorldBookTracker.disable();
            toastr.info('🥕 WorldBook Tracker disabled');
        }
    });

    // Auto-rescan on chat load toggle
    $('#carrot_auto_rescan').prop('checked', settings.autoRescanOnChatLoad).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('autoRescanOnChatLoad', settings.autoRescanOnChatLoad, newValue);
        extension_settings[extensionName].autoRescanOnChatLoad = newValue;
        saveSettingsDebounced();

        if (newValue) {
            toastr.info('🔄 Auto-rescan enabled');
            // Immediately scan and restore for current chat
            if (selectedLorebooks.size > 0) {
                CarrotDebug.scan('Auto-rescan enabled - scanning current chat...');
                await scanSelectedLorebooks(Array.from(selectedLorebooks));
                CarrotDebug.scan(`Scan complete - ${scannedCharacters.size} characters loaded`);

                // Restore thinking blocks for current chat from cache
                setTimeout(async () => {
                    await restoreThinkingBlocksFromCache();
                }, 500);
            }
        } else {
            toastr.info('🔄 Auto-rescan disabled');
        }
    });

    // BunnymoTags Wrapping toggle
    $('#carrot_bunnymo_wrapping').prop('checked', settings.bunnymoTagWrapping).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('bunnymoTagWrapping', settings.bunnymoTagWrapping, newValue);
        extension_settings[extensionName].bunnymoTagWrapping = newValue;
        saveSettingsDebounced();

        if (newValue) {
            toastr.info('🏷️ BunnymoTags Wrapping enabled - worldbook entries will be wrapped with tags');
        } else {
            toastr.info('🏷️ BunnymoTags Wrapping disabled');
        }
    });

    // TAG SYNTHESIS Exclusion toggle
    $('#carrot_exclude_tag_synthesis').prop('checked', settings.excludeTagSynthesis).on('change', async function() {
        const newValue = Boolean($(this).prop('checked'));
        extension_settings[extensionName].excludeTagSynthesis = newValue;
        saveSettingsDebounced();

        if (newValue) {
            toastr.info('🚫 TAG SYNTHESIS section will be excluded from chunking');
        } else {
            toastr.info('TAG SYNTHESIS section will be included in chunking');
        }
    });

    // Max characters displayed (slider)
    $('#carrot_max_characters_display').val(settings.maxCharactersDisplay || 6).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_max_display_value').text(value);
        extension_settings[extensionName].maxCharactersDisplay = value;
        saveSettingsDebounced();
    });
    $('#carrot_max_display_value').text(settings.maxCharactersDisplay || 6);

    // Max characters injected (slider)
    $('#carrot_max_characters_inject').val(settings.maxCharactersInject || 6).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_max_inject_value').text(value);
        extension_settings[extensionName].maxCharactersInject = value;
        saveSettingsDebounced();
    });
    $('#carrot_max_inject_value').text(settings.maxCharactersInject || 6);

    // Injection Depth (slider)
    $('#carrot_injection_depth').val(settings.injectionDepth || 4).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_injection_depth_value').text(value);
        extension_settings[extensionName].injectionDepth = value;
        saveSettingsDebounced();
    });
    $('#carrot_injection_depth_value').text(settings.injectionDepth || 4);

    // ============================
    // Smart Context (RAG) Settings
    // ============================
    const ragDefaults = defaultSettings.rag;
    const ragState = Object.assign({}, ragDefaults, extension_settings[extensionName].rag || {});
    extension_settings[extensionName].rag = ragState;

    if (!extension_settings.vectors) {
        extension_settings.vectors = {};
    }

    const syncRagVectorsFromBase = () => {
        const baseVectors = extension_settings.vectors;
        if (!baseVectors) {
            return;
        }

        ragState.vectorSource = baseVectors.source ?? ragState.vectorSource ?? 'transformers';
        ragState.useAltUrl = baseVectors.use_alt_endpoint ?? ragState.useAltUrl ?? false;
        ragState.altUrl = baseVectors.alt_endpoint_url ?? ragState.altUrl ?? '';
        ragState.openaiModel = baseVectors.openai_model ?? ragState.openaiModel ?? 'text-embedding-ada-002';
        ragState.cohereModel = baseVectors.cohere_model ?? ragState.cohereModel ?? 'embed-english-v3.0';
        ragState.googleModel = baseVectors.google_model ?? ragState.googleModel ?? 'text-embedding-005';
        ragState.togetheraiModel = baseVectors.togetherai_model ?? ragState.togetheraiModel ?? 'togethercomputer/m2-bert-80M-32k-retrieval';
        ragState.ollamaModel = baseVectors.ollama_model ?? ragState.ollamaModel ?? 'mxbai-embed-large';
        ragState.ollamaKeep = baseVectors.ollama_keep ?? ragState.ollamaKeep ?? false;
        ragState.vllmModel = baseVectors.vllm_model ?? ragState.vllmModel ?? '';
        ragState.webllmModel = baseVectors.webllm_model ?? ragState.webllmModel ?? '';
    };

    const syncBaseVectorsFromRag = () => {
        const baseVectors = extension_settings.vectors;
        if (!baseVectors) {
            return;
        }

        baseVectors.source = ragState.vectorSource ?? baseVectors.source ?? 'transformers';
        baseVectors.use_alt_endpoint = ragState.useAltUrl ?? baseVectors.use_alt_endpoint ?? false;
        if (ragState.altUrl !== undefined) baseVectors.alt_endpoint_url = ragState.altUrl;
        if (ragState.openaiModel !== undefined) baseVectors.openai_model = ragState.openaiModel;
        if (ragState.cohereModel !== undefined) baseVectors.cohere_model = ragState.cohereModel;
        if (ragState.googleModel !== undefined) baseVectors.google_model = ragState.googleModel;
        if (ragState.togetheraiModel !== undefined) baseVectors.togetherai_model = ragState.togetheraiModel;
        if (ragState.ollamaModel !== undefined) baseVectors.ollama_model = ragState.ollamaModel;
        if (typeof ragState.ollamaKeep === 'boolean') baseVectors.ollama_keep = ragState.ollamaKeep;
        if (ragState.vllmModel !== undefined) baseVectors.vllm_model = ragState.vllmModel;
        if (ragState.webllmModel !== undefined) baseVectors.webllm_model = ragState.webllmModel;
    };

    syncRagVectorsFromBase();

    const persistRagSettings = async () => {
        syncBaseVectorsFromRag();
        await saveRAGSettings({ ...ragState });
    };

    $('#carrot_rag_enabled').prop('checked', ragState.enabled).on('change', async function() {
        const isEnabled = Boolean($(this).prop('checked'));
        ragState.enabled = isEnabled;
        await await persistRagSettings();

        if (isEnabled) {
            toastr.info('Smart Context enabled - fullsheets will be saved and queried');
            await addRAGButtonsToAllMessages();
        } else {
            toastr.info('Smart Context disabled');
            await removeAllRAGButtons();
        }
    });

    $('#carrot_rag_auto_vectorize').prop('checked', ragState.autoVectorize !== false).on('change', async function() {
        ragState.autoVectorize = Boolean($(this).prop('checked'));
        await await persistRagSettings();
    });

    $('#carrot_rag_debug_mode').prop('checked', ragState.debugMode || false).on('change', async function() {
        ragState.debugMode = Boolean($(this).prop('checked'));
        await await persistRagSettings();
    });

    $('#carrot_rag_context_level').val(ragState.contextLevel || 'global').on('change', async function() {
        ragState.contextLevel = String($(this).val());
        await await persistRagSettings();
        toastr.info(`Storage level changed to: ${ragState.contextLevel}`);
    });

    // Simple chunking toggle
    $('#carrot_rag_simple_chunking').prop('checked', ragState.simpleChunking ?? false).on('change', async function() {
        ragState.simpleChunking = $(this).prop('checked');
        await await persistRagSettings();

        // Show/hide complex settings
        if (ragState.simpleChunking) {
            $('.carrot-complex-setting').fadeOut(200);
            toastr.info('Simple section-based chunking enabled. Complex settings hidden.');
        } else {
            $('.carrot-complex-setting').fadeIn(200);
            toastr.info('Advanced chunking enabled. Complex settings visible.');
        }
    });

    // Initialize complex settings visibility
    if (ragState.simpleChunking) {
        $('.carrot-complex-setting').hide();
    }

    $('#carrot_rag_topk').val(ragState.topK || 3).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_rag_topk_value').text(value);
        ragState.topK = value;
        await persistRagSettings();
    });
    $('#carrot_rag_topk_value').text(ragState.topK || 3);

    $('#carrot_rag_threshold').val(Math.round((ragState.scoreThreshold ?? 0.15) * 100)).on('input', async function() {
        const value = parseInt($(this).val()) / 100;
        $('#carrot_rag_threshold_value').text(value.toFixed(2));
        ragState.scoreThreshold = value;
        await persistRagSettings();
    });
    $('#carrot_rag_threshold_value').text((ragState.scoreThreshold ?? 0.15).toFixed(2));

    $('#carrot_rag_context').val(ragState.queryContext || 3).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_rag_context_value').text(value);
        ragState.queryContext = value;
        await persistRagSettings();
    });
    $('#carrot_rag_context_value').text(ragState.queryContext || 3);

    $('#carrot_rag_chunksize').val(ragState.chunkSize || 1000).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_rag_chunksize_value').text(value);
        ragState.chunkSize = value;
        await persistRagSettings();
    });
    $('#carrot_rag_chunksize_value').text(ragState.chunkSize || 1000);

    $('#carrot_rag_overlap').val(ragState.chunkOverlap || 300).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_rag_overlap_value').text(value);
        ragState.chunkOverlap = value;
        await persistRagSettings();
    });
    $('#carrot_rag_overlap_value').text(ragState.chunkOverlap || 300);

    $('#carrot_rag_depth').val(ragState.injectionDepth || 4).on('input', async function() {
        const value = parseInt($(this).val());
        $('#carrot_rag_depth_value').text(value);
        ragState.injectionDepth = value;
        await persistRagSettings();
    });
    $('#carrot_rag_depth_value').text(ragState.injectionDepth || 4);

    $('#carrot_rag_crosslink').val(Math.round((ragState.crosslinkThreshold ?? 0.25) * 100)).on('input', async function() {
        const value = parseInt($(this).val()) / 100;
        $('#carrot_rag_crosslink_value').text(value.toFixed(2));
        ragState.crosslinkThreshold = value;
        await persistRagSettings();
    });
    $('#carrot_rag_crosslink_value').text((ragState.crosslinkThreshold ?? 0.25).toFixed(2));

    $('#carrot_rag_keyword_fallback').prop('checked', ragState.keywordFallback ?? true).on('change', async function() {
        ragState.keywordFallback = Boolean($(this).prop('checked'));
        await persistRagSettings();
    });

    $('#carrot_rag_keyword_priority').prop('checked', ragState.keywordFallbackPriority ?? false).on('change', async function() {
        ragState.keywordFallbackPriority = Boolean($(this).prop('checked'));
        await persistRagSettings();
    });

    $('#carrot_rag_keyword_limit').val(ragState.keywordFallbackLimit ?? 2).on('input', async function() {
        const value = Math.max(0, parseInt($(this).val()) || 0);
        ragState.keywordFallbackLimit = value;
        $('#carrot_rag_keyword_limit_value').text(value);
        await persistRagSettings();
    });
    $('#carrot_rag_keyword_limit_value').text(ragState.keywordFallbackLimit ?? 2);

    const $ragRole = $('#carrot_rag_role');
    if ($ragRole.length) {
        $ragRole.val(ragState.injectionRole || 'system').on('change', async function() {
            ragState.injectionRole = String($(this).val());
            await persistRagSettings();
        });
    }

    // Vectorization source and model settings
    $('#carrot_rag_vector_source').val(ragState.vectorSource || 'transformers').on('change', async function() {
        ragState.vectorSource = String($(this).val());
        await persistRagSettings();
        toggleRAGVectorSettings();
        toastr.info(`Vectorization source changed to: ${ragState.vectorSource}`);
    });

    $('#carrot_rag_openai_model').val(ragState.openaiModel || 'text-embedding-ada-002').on('change', async function() {
        ragState.openaiModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_cohere_model').val(ragState.cohereModel || 'embed-english-v3.0').on('change', async function() {
        ragState.cohereModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_google_model').val(ragState.googleModel || 'text-embedding-005').on('change', async function() {
        ragState.googleModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_togetherai_model').val(ragState.togetheraiModel || 'togethercomputer/m2-bert-80M-32k-retrieval').on('change', async function() {
        ragState.togetheraiModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_ollama_model').val(ragState.ollamaModel || 'mxbai-embed-large').on('input', async function() {
        ragState.ollamaModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_ollama_keep').prop('checked', ragState.ollamaKeep || false).on('change', async function() {
        ragState.ollamaKeep = Boolean($(this).prop('checked'));
        await persistRagSettings();
    });

    $('#carrot_rag_vllm_model').val(ragState.vllmModel || '').on('input', async function() {
        ragState.vllmModel = String($(this).val());
        await persistRagSettings();
    });

    $('#carrot_rag_webllm_model').val(ragState.webllmModel || '').on('input', async function() {
        ragState.webllmModel = String($(this).val());
        await persistRagSettings();
    });

    // URL settings for sources that need them
    $('#carrot_rag_use_alt_url').prop('checked', ragState.useAltUrl || false).on('change', async function() {
        ragState.useAltUrl = Boolean($(this).prop('checked'));
        await persistRagSettings();
        $('#carrot_rag_alt_url_container').toggle(ragState.useAltUrl);
    });

    $('#carrot_rag_alt_url').val(ragState.altUrl || '').on('input', async function() {
        ragState.altUrl = String($(this).val());
        await persistRagSettings();
    });

    // Initialize URL container visibility
    $('#carrot_rag_alt_url_container').toggle(ragState.useAltUrl || false);

    // Toggle function for vectorization model settings
    function toggleRAGVectorSettings() {
        const source = ragState.vectorSource || 'transformers';

        // Hide all model containers
        $('#carrot_rag_openai_model_container').hide();
        $('#carrot_rag_cohere_model_container').hide();
        $('#carrot_rag_google_model_container').hide();
        $('#carrot_rag_togetherai_model_container').hide();
        $('#carrot_rag_ollama_model_container').hide();
        $('#carrot_rag_ollama_keep_container').hide();
        $('#carrot_rag_vllm_model_container').hide();
        $('#carrot_rag_webllm_model_container').hide();
        $('#carrot_rag_llamacpp_info').hide();
        $('#carrot_rag_nomicai_container').hide();
        $('#carrot_rag_url_settings').hide();

        // Sources that require URL settings
        const urlRequiredSources = ['ollama', 'llamacpp', 'koboldcpp', 'vllm'];
        const showUrlSettings = urlRequiredSources.includes(source);

        // Update URL hint text based on source
        const urlHints = {
            'ollama': 'Set the Ollama URL in the Text Completion API connection settings.',
            'llamacpp': 'Set the llama.cpp URL in the Text Completion API connection settings.',
            'koboldcpp': 'Set the KoboldCpp URL in the Text Completion API connection settings.',
            'vllm': 'Set the vLLM URL in the Text Completion API connection settings.'
        };

        if (showUrlSettings) {
            $('#carrot_rag_url_settings').show();
            $('#carrot_rag_url_hint_text').text(urlHints[source] || '');
        }

        // Show relevant model container based on source
        switch (source) {
            case 'openai':
            case 'mistral':
                $('#carrot_rag_openai_model_container').show();
                break;
            case 'cohere':
                $('#carrot_rag_cohere_model_container').show();
                break;
            case 'palm':
            case 'vertexai':
                $('#carrot_rag_google_model_container').show();
                break;
            case 'togetherai':
                $('#carrot_rag_togetherai_model_container').show();
                break;
            case 'ollama':
                $('#carrot_rag_ollama_model_container').show();
                $('#carrot_rag_ollama_keep_container').show();
                break;
            case 'vllm':
                $('#carrot_rag_vllm_model_container').show();
                break;
            case 'webllm':
                $('#carrot_rag_webllm_model_container').show();
                break;
            case 'llamacpp':
                $('#carrot_rag_llamacpp_info').show();
                break;
            case 'nomicai':
                $('#carrot_rag_nomicai_container').show();
                break;
            // transformers, koboldcpp, extras don't need model selection
        }
    }

    // Initialize vectorization settings visibility
    toggleRAGVectorSettings();

    // ========================================================================
    // EMBEDDING PROVIDER CHANGE DETECTION AND RE-VECTORIZATION
    // ========================================================================

    function getProviderDisplayName(source, model) {
        if (!model || model === 'default') {
            return source;
        }
        return `${source} (${model})`;
    }

    function getCurrentProvider() {
        const source = ragState.vectorSource || 'transformers';
        let model = null;

        switch (source) {
            case 'openai':
            case 'mistral':
                model = ragState.openaiModel;
                break;
            case 'cohere':
                model = ragState.cohereModel;
                break;
            case 'palm':
            case 'vertexai':
                model = ragState.googleModel;
                break;
            case 'togetherai':
                model = ragState.togetheraiModel;
                break;
            case 'ollama':
                model = ragState.ollamaModel;
                break;
            case 'vllm':
                model = ragState.vllmModel;
                break;
            case 'webllm':
                model = ragState.webllmModel;
                break;
        }

        return { source, model };
    }

    async function checkProviderChange() {
        const current = getCurrentProvider();
        const last = {
            source: ragState.lastEmbeddingSource,
            model: ragState.lastEmbeddingModel
        };

        // If no last provider recorded, hide warning
        if (!last.source) {
            $('#carrot_rag_provider_warning').hide();
            return false;
        }

        // Check if there are any collections to re-vectorize
        // If no collections exist, don't show the warning
        const library = await getContextualLibrary() || {};
        const hasCollections = Object.keys(library).length > 0;

        if (!hasCollections) {
            $('#carrot_rag_provider_warning').hide();
            return false;
        }

        // Check if provider actually changed
        // Source change is always a real change
        const sourceChanged = last.source !== current.source;

        // Model change only counts as a real change if the last model was actually recorded
        // (not null/undefined). This prevents false warnings when user selects a model
        // in the dropdown for the first time after vectorizing.
        const modelChanged = (last.model && current.model) && (last.model !== current.model);

        const providerChanged = sourceChanged || modelChanged;

        if (providerChanged) {
            // Show warning with provider details
            $('#carrot_rag_old_provider').text(getProviderDisplayName(last.source, last.model));
            $('#carrot_rag_new_provider').text(getProviderDisplayName(current.source, current.model));
            $('#carrot_rag_provider_warning').slideDown(200);
        } else {
            $('#carrot_rag_provider_warning').slideUp(200);
        }

        return providerChanged;
    }

    // Check on initialization
    // Wrapped in async IIFE to handle await
    (async () => {
        await checkProviderChange();
    })();

    // Re-check when vector source or model changes
    $('#carrot_rag_vector_source').on('change', () => {
        setTimeout(async () => await checkProviderChange(), 100);
    });

    $('#carrot_rag_openai_model, #carrot_rag_cohere_model, #carrot_rag_google_model, #carrot_rag_togetherai_model').on('change', async () => await checkProviderChange());
    $('#carrot_rag_ollama_model, #carrot_rag_vllm_model, #carrot_rag_webllm_model').on('input', async () => await checkProviderChange());

    // Re-vectorize button handler
    $('#carrot_rag_revectorize_btn').on('click', async function() {
        const $btn = $(this);
        const originalText = $btn.html();

        if (!confirm('⚠️ This will delete all existing embeddings and re-vectorize all collections in the current storage level. This may take several minutes. Continue?')) {
            return;
        }

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Re-vectorizing...');

            const context = ragState.contextLevel || 'global';
            const library = await getContextualLibrary();
            const collections = Object.keys(library);

            if (collections.length === 0) {
                toastr.warning('No collections found to re-vectorize');
                return;
            }

            CarrotDebug.ui(`Starting re-vectorization of ${collections.length} collections...`);

            let successCount = 0;
            let failCount = 0;

            for (const collectionId of collections) {
                try {
                    CarrotDebug.ui(`Re-vectorizing collection: ${collectionId}`);

                    // Delete the entire collection from vector DB
                    if (fullsheetAPI.deleteEntireCollection) {
                        await fullsheetAPI.deleteEntireCollection(collectionId);
                    }

                    // Re-chunk and vectorize from the library data
                    const chunks = Object.entries(library[collectionId]).map(([hash, data]) => ({
                        hash: Number(hash),
                        text: data.text,
                        metadata: {
                            sectionTitle: data.sectionTitle || '',
                            topic: data.topic || '',
                            keywords: data.keywords || [],
                            customKeywords: data.customKeywords || [],
                            regexPatterns: data.regexPatterns || [],
                            enabledKeywords: data.enabledKeywords || {},
                            disabledKeywords: data.disabledKeywords || {},
                            priorityKeywords: data.priorityKeywords || {}
                        }
                    }));

                    // Insert chunks into vector DB
                    await fullsheetAPI.apiInsertVectorItems(collectionId, chunks);

                    successCount++;
                    CarrotDebug.ui(`Successfully re-vectorized: ${collectionId}`);
                } catch (error) {
                    failCount++;
                    CarrotDebug.error(`Failed to re-vectorize ${collectionId}:`, error);
                }
            }

            // Only mark the provider as up to date if every collection actually re-vectorized;
            // otherwise the warning must keep showing since some collections are still on the old provider.
            if (failCount === 0) {
                const current = getCurrentProvider();
                ragState.lastEmbeddingSource = current.source;
                ragState.lastEmbeddingModel = current.model;
                await persistRagSettings();

                // Hide warning
                $('#carrot_rag_provider_warning').slideUp(200);
            }

            if (successCount > 0) {
                toastr.success(`Re-vectorized ${successCount} collection(s) successfully`);
            }
            if (failCount > 0) {
                toastr.error(`Failed to re-vectorize ${failCount} collection(s)`);
            }

            CarrotDebug.ui(`Re-vectorization complete: ${successCount} success, ${failCount} failed`);

        } catch (error) {
            CarrotDebug.error('Re-vectorization error:', error);
            toastr.error(`Re-vectorization failed: ${error.message}`);
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    // ========================================================================

    // Initialize RAG system asynchronously
    (async () => {
        if (!window.__CarrotKernelRagInitialized) {
            // Wait for dynamic import to complete
            await fullsheetRAGPromise;
            await initializeRAG();
            window.__CarrotKernelRagInitialized = true;

            // Initialize chunk visualizer with fullsheet API
            initializeChunkVisualizer(fullsheetAPI);
        }
        if (ragState.enabled) {
            await addRAGButtonsToAllMessages();
        }
        await persistRagSettings();
    })();



    // Show context selection popup for vectorization
    async function showContextSelectionPopup() {
        return new Promise(async (resolve) => {
            const currentContextLevel = await getCurrentContextLevel();

            const popup = $(`
                <div class="carrot-popup-container rag-context-selection-popup" style="padding: 0; max-width: 600px; width: 90%;">
                    <div class="carrot-card" style="margin: 0; height: auto;">
                        <!-- Header -->
                        <div class="carrot-card-header" style="padding: 24px 32px 16px;">
                            <h3 style="margin: 0 0 8px; font-size: 22px;">🔬 Choose Storage Level</h3>
                            <p class="carrot-card-subtitle" style="margin: 0; color: var(--grey70, #94a3b8);">Where should these fullsheets be saved?</p>
                        </div>

                        <div class="carrot-card-body" style="padding: 0 32px 24px; display: flex; flex-direction: column; gap: 20px;">
                            <!-- Context Level Options -->
                            <div class="carrot-setup-step">
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <label style="
                                        display: flex;
                                        align-items: flex-start;
                                        gap: 12px;
                                        padding: 16px;
                                        background: var(--black30a, rgba(0,0,0,0.2));
                                        border: 2px solid ${currentContextLevel === 'global' ? 'var(--SmartThemeQuoteColor, #10b981)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                        border-radius: 8px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                    " class="context-option" data-level="global">
                                        <input type="radio" name="rag-context-level" value="global" ${currentContextLevel === 'global' ? 'checked' : ''} style="
                                            accent-color: var(--SmartThemeQuoteColor, #10b981);
                                            margin-top: 2px;
                                            width: 18px;
                                            height: 18px;
                                        ">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                                🌍 Global Storage
                                            </div>
                                            <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                                Accessible across all characters and chats. Best for shared world information.
                                            </div>
                                        </div>
                                    </label>

                                    <label style="
                                        display: flex;
                                        align-items: flex-start;
                                        gap: 12px;
                                        padding: 16px;
                                        background: var(--black30a, rgba(0,0,0,0.2));
                                        border: 2px solid ${currentContextLevel === 'character' ? 'var(--SmartThemeQuoteColor, #10b981)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                        border-radius: 8px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                    " class="context-option" data-level="character">
                                        <input type="radio" name="rag-context-level" value="character" ${currentContextLevel === 'character' ? 'checked' : ''} style="
                                            accent-color: var(--SmartThemeQuoteColor, #10b981);
                                            margin-top: 2px;
                                            width: 18px;
                                            height: 18px;
                                        ">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                                👤 Character Storage
                                            </div>
                                            <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                                Available for this character only, across all chats with them.
                                            </div>
                                        </div>
                                    </label>

                                    <label style="
                                        display: flex;
                                        align-items: flex-start;
                                        gap: 12px;
                                        padding: 16px;
                                        background: var(--black30a, rgba(0,0,0,0.2));
                                        border: 2px solid ${currentContextLevel === 'chat' ? 'var(--SmartThemeQuoteColor, #10b981)' : 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))'};
                                        border-radius: 8px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                    " class="context-option" data-level="chat">
                                        <input type="radio" name="rag-context-level" value="chat" ${currentContextLevel === 'chat' ? 'checked' : ''} style="
                                            accent-color: var(--SmartThemeQuoteColor, #10b981);
                                            margin-top: 2px;
                                            width: 18px;
                                            height: 18px;
                                        ">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--SmartThemeEmColor, white);">
                                                💬 Chat Storage
                                            </div>
                                            <div style="color: var(--grey70, #94a3b8); font-size: 14px; line-height: 1.5;">
                                                Only available in this specific chat conversation.
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <!-- Action Buttons -->
                            <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1));">
                                <button class="carrot-secondary-btn" id="rag-context-cancel" style="padding: 10px 24px;">
                                    Cancel
                                </button>
                                <button class="carrot-primary-btn" id="rag-context-confirm" style="padding: 10px 24px;">
                                    <i class="fa-solid fa-check"></i> Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            // Show popup overlay
            const $overlay = $('#carrot-popup-overlay');
            $overlay.html(popup).css('display', 'flex').addClass('active');

            // Handle option hover effects
            popup.find('.context-option').on('mouseenter', function() {
                const isSelected = $(this).find('input[type="radio"]').is(':checked');
                if (!isSelected) {
                    $(this).css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
                    $(this).css('opacity', '0.8');
                }
            }).on('mouseleave', function() {
                const isSelected = $(this).find('input[type="radio"]').is(':checked');
                if (!isSelected) {
                    $(this).css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
                    $(this).css('opacity', '1');
                }
            });

            // Handle option click - highlight selected
            popup.find('.context-option').on('click', function() {
                popup.find('.context-option').css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
                $(this).css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
                $(this).find('input[type="radio"]').prop('checked', true);
            });

            // Handle radio button change
            popup.find('input[name="rag-context-level"]').on('change', async function() {
                popup.find('.context-option').css('border-color', 'var(--SmartThemeBorderColor, rgba(255,255,255,0.1))');
                $(this).closest('.context-option').css('border-color', 'var(--SmartThemeQuoteColor, #10b981)');
            });

            // Cancel button
            popup.find('#rag-context-cancel').on('click', () => {
                $overlay.removeClass('active');
                setTimeout(() => {
                    $overlay.hide().empty();
                }, 300);
                resolve(null); // Return null to indicate cancellation
            });

            // Confirm button
            popup.find('#rag-context-confirm').on('click', () => {
                const selectedLevel = popup.find('input[name="rag-context-level"]:checked').val();
                $overlay.removeClass('active');
                setTimeout(() => {
                    $overlay.hide().empty();
                }, 300);
                resolve(selectedLevel);
            });

            // ESC key to cancel
            $(document).one('keydown', (e) => {
                if (e.key === 'Escape') {
                    popup.find('#rag-context-cancel').click();
                }
            });
        });
    }

    // ============================
    // RAG Debugging Utilities
    // ============================

    // Make RAG debugging functions globally accessible
    window.CarrotRAGDebug = {
        // View all stored collections
        viewCollections: async function() {
            const contextLevel = await getCurrentContextLevel();
            const library = await getContextualLibrary();
            const collections = Object.keys(library);
            CarrotDebug.ui(`RAG Collections (${contextLevel.toUpperCase()} storage):`, collections);
            CarrotDebug.ui('Total collections:', collections.length);
            return collections;
        },

        // View chunks for a specific collection
        viewChunks: async function(collectionId) {
            const contextLevel = await getCurrentContextLevel();
            const library = await getContextualLibrary();
            const chunks = library[collectionId];
            if (!chunks) {
                CarrotDebug.error(`Collection "${collectionId}" not found in ${contextLevel} storage`);
                CarrotDebug.ui('Available collections:', Object.keys(library));
                return null;
            }
            CarrotDebug.ui(`Chunks for "${collectionId}" (${contextLevel} storage):`, chunks);
            CarrotDebug.ui(`Total chunks: ${Object.keys(chunks).length}`);
            return chunks;
        },

        // View a specific chunk by hash
        viewChunk: async function(collectionId, hash) {
            const chunks = await this.viewChunks(collectionId);
            if (!chunks) return null;
            const chunk = chunks[hash];
            if (!chunk) {
                CarrotDebug.error(`Chunk ${hash} not found in collection "${collectionId}"`);
                return null;
            }
            CarrotDebug.ui('Chunk:', chunk);
            return chunk;
        },

        // Get collection stats
        getStats: async function(collectionId) {
            const chunks = await this.viewChunks(collectionId);
            if (!chunks) return null;

            const chunkArray = Object.values(chunks).map(chunk => {
                initializeChunkKeywordMetadata(chunk);
                return chunk;
            });

            const totalChunks = chunkArray.length;
            const totalSize = chunkArray.reduce((sum, c) => sum + (c.text?.length || 0), 0);
            const avgSize = totalChunks ? Math.round(totalSize / totalChunks) : 0;
            const sectionCount = [...new Set(chunkArray.map(c => c.section).filter(Boolean))].length;

            return { totalChunks, totalSize, avgSize, sectionCount };
        },
    };
    }
    // end bindActualEvents()

    // Inline drawer toggle for linked chunks section - Let ST's native handler manage this
    // No custom handler needed since we're using ST's standard inline-drawer structure

    // Helper function to actually close the modal
    function closeVisualizerModal() {
        // Clean up only our specific event handlers
        $(document).off('click', '.carrot-chunk-toggle-drawer');
        // DO NOT remove .world_entry_thin_controls handlers - that breaks ST's native lorebook!
        // Our delegated handlers are specific enough that they won't leak
        $(document).off('click', '.text_pole[readonly]');
        $(document).off('click', '.keyword-weight-badge');
        $(document).off('click', '.carrot-chunk-delete-btn');

        $('#carrot-rag-visualizer-modal').fadeOut(200, function () {
            $(this).removeClass('is-visible').css('display', 'none');
        });
        $('body').css('overflow', '');
        currentEditingCollection = null;
        modifiedChunks = {};
        hasUnsavedChanges = false;
    }

    // Modal close handlers
    $('#carrot-rag-modal-close, #carrot-rag-modal-cancel').on('click', async function() {
        // Check for unsaved changes
        if (hasUnsavedChanges) {
            const stContext = getContext();
            const result = await stContext.callGenericPopup(
                'You have unsaved changes. What would you like to do?',
                'confirm',
                '',
                { okButton: 'Save', cancelButton: 'Discard' }
            );

            if (result) {
                // User clicked "Save" - trigger save (which will close modal)
                $('#carrot-rag-modal-save').click();
                return;
            } else {
                // User clicked "Discard" - close without saving
                closeVisualizerModal();
                return;
            }
            // If user clicked X to close popup, do nothing (stay in visualizer)
        }

        closeVisualizerModal();
    });

    // Save changes
    $('#carrot-rag-modal-save').on('click', async function() {
        if (!currentEditingCollection) return;

        // Clean up editing flags
        Object.values(modifiedChunks).forEach(chunk => delete chunk._editing);

        // Clean up only our specific event handlers
        $(document).off('click', '.carrot-chunk-toggle-drawer');
        // DO NOT remove .world_entry_thin_controls handlers - that breaks ST's native lorebook!
        $(document).off('click', '.text_pole[readonly]');
        $(document).off('click', '.keyword-weight-badge');
        $(document).off('click', '.carrot-chunk-delete-btn');

        // Save to contextual library
        const library = getContextualLibrary();
        const originalChunks = library[currentEditingCollection] || {};

        // Log chunks with custom weights before saving
        CarrotDebug.ui('Saving chunks to library...');
        Object.entries(modifiedChunks).forEach(([hash, chunk]) => {
            if (chunk.customWeights && Object.keys(chunk.customWeights).length > 0) {
                CarrotDebug.ui(`Saving chunk ${hash} with custom weights:`, chunk.customWeights);
            }
        });

        library[currentEditingCollection] = modifiedChunks;
        saveSettingsDebounced();
        CarrotDebug.ui('Save complete!');

        // Sync vector database - delete orphaned embeddings
        try {
            const originalHashes = new Set(Object.keys(originalChunks));
            const currentHashes = new Set(Object.keys(modifiedChunks));
            const deletedHashes = [...originalHashes].filter(h => !currentHashes.has(h));

            if (deletedHashes.length > 0 && fullsheetRAGLoaded && fullsheetAPI.purgeOrphanedVectors) {
                CarrotDebug.ui(`Purging ${deletedHashes.length} orphaned vectors from ${currentEditingCollection}`);
                await fullsheetAPI.purgeOrphanedVectors(currentEditingCollection, deletedHashes);
            }
        } catch (error) {
            CarrotDebug.error('Failed to purge orphaned vectors:', error);
            // Don't block save on vector cleanup failure
        }

        toastr.success('Chunks saved!');
        hasUnsavedChanges = false; // Reset flag after successful save
        $('#carrot-rag-visualizer-modal').fadeOut(200, function () {
            $(this).removeClass('is-visible').css('display', 'none');
        });
        $('body').css('overflow', '');
        currentEditingCollection = null;
        modifiedChunks = {};

        // Refresh the viewer list
        $('#carrot-rag-refresh-viewer').click();
    });

    // Search functionality
    $('#carrot-rag-chunk-search').on('input', async function() {
        const searchTerm = $(this).val();
        renderChunks(modifiedChunks, searchTerm);
    });

    // Format toggle functionality
    $('#carrot-rag-format-toggle').on('click', function() {
        chunkFormattingEnabled = !chunkFormattingEnabled;

        const $btn = $(this);
        const $icon = $btn.find('i');
        const $label = $btn.find('.chunk-format-label');

        if (chunkFormattingEnabled) {
            $icon.removeClass('fa-align-left').addClass('fa-file-code');
            $label.text('Formatted');
            $btn.attr('title', 'Showing formatted text (click for plain)');
        } else {
            $icon.removeClass('fa-file-code').addClass('fa-align-left');
            $label.text('Plain');
            $btn.attr('title', 'Showing plain text (click for formatted)');
        }

        // Re-render all chunks to apply formatting
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Case-sensitivity toggle functionality
    $('#carrot-rag-case-toggle').on('click', async function() {
        const ragState = extension_settings[extensionName].rag;
        ragState.caseSensitiveKeywords = !ragState.caseSensitiveKeywords;
        await saveSettingsDebounced();

        const $btn = $(this);
        const $label = $btn.find('.chunk-case-label');

        if (ragState.caseSensitiveKeywords) {
            $label.text('Case: Match');
            $btn.attr('title', 'Keyword matching is case-sensitive (click to ignore case)');
            toastr.info('Keywords are now case-sensitive');
        } else {
            $label.text('Case: Ignore');
            $btn.attr('title', 'Keyword matching ignores case (click for case-sensitive)');
            toastr.info('Keywords now ignore case');
        }
    });

    // Add Chunk functionality moved to chunk-visualizer.js's bindChunkVisualizerEvents(),
    // where modifiedChunks/renderChunks/getSearchTerm are actually in scope.

    // Helper for the viewer to get data for a specific level
    // FIXED: Now only returns the CURRENT character/chat's library, not ALL characters/chats
    function getFullLibraryForLevel(level) {
        CarrotDebug.ui(`Getting library for level: ${level}`);
        const ragState = extension_settings[extensionName]?.rag;
        if (!ragState?.libraries) {
            CarrotDebug.ui('No libraries found in ragState.');
            return {};
        }

        const context = getContext();
        switch(level) {
            case 'character':
                const charId = context.characterId;
                if (!charId && charId !== 0) {
                    CarrotDebug.ui('No active character for character-level library');
                    return {};
                }
                const charLibs = ragState.libraries.character || {};
                return charLibs[charId] || {};
            case 'chat':
                const chatId = context.chatId;
                if (!chatId && chatId !== 0) {
                    CarrotDebug.ui('No active chat for chat-level library');
                    return {};
                }
                const chatLibs = ragState.libraries.chat || {};
                return chatLibs[chatId] || {};
            case 'global':
            default:
                return ragState.libraries.global || {};
        }
    }

    // RAG Data Viewer UI
    $(document).on('click', '#carrot-rag-refresh-viewer', function() {
        CarrotDebug.ui('RAG Viewer: Refresh button clicked.');

        const ragState = extension_settings[extensionName].rag;
        const viewerContext = $('#carrot_rag_viewer_context').val() || 'global';
        CarrotDebug.ui('RAG Viewer: Context selected:', viewerContext);

        const library = getFullLibraryForLevel(viewerContext);
        CarrotDebug.ui('RAG Viewer: Found library:', library);

        const collections = Object.keys(library);
        CarrotDebug.ui('RAG Viewer: Found collections:', collections);

        const $list = $('#carrot-rag-collections-list');

        if (collections.length === 0) {
            CarrotDebug.ui('RAG Viewer: No collections found, showing empty state.');
            $list.html(`<div style="color: #ef4444; padding: 10px; background: rgba(239,68,68,0.1); border-radius: 4px;">No collections saved yet for <strong>${viewerContext}</strong> storage. Generate and save a fullsheet first!</div>`).show();
            $('#carrot-rag-empty-state').hide();
            return;
        }
        
        $('#carrot-rag-empty-state').hide();
        
        let html = `<div style="color: #10b981; margin-bottom: 15px; font-weight: 600;">Found ${collections.length} collection${collections.length > 1 ? 's' : ''} in <span style="text-transform: uppercase; color: #8b5cf6;">${viewerContext}</span> storage</div>`;

        collections.forEach(collectionId => {
            const chunks = library[collectionId];
            const chunkArray = Object.values(chunks);
            const totalChunks = chunkArray.length;
            const totalSize = chunkArray.reduce((sum, c) => sum + (c.text?.length || 0), 0);
            const avgSize = Math.round(totalSize / totalChunks);
            const sections = [...new Set(chunkArray.map(c => c.section))];

            const characterName = getCharacterNameFromCollectionId(collectionId);

            html += `
                <div style="background: rgba(16,185,129,0.1); padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #10b981;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 10px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <div style="font-weight: 600; font-size: 1.1em; color: #10b981;">
                                    ${characterName}
                                </div>
                                <button class="menu_button carrot-rename-collection-btn" data-collection="${collectionId}" style="padding: 4px 8px; font-size: 0.85em; opacity: 0.7;" title="Change display name (internal ID stays the same)">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                            </div>
                            <div style="font-size: 0.7em; color: #94a3b8; font-family: monospace; opacity: 0.4; cursor: help;" title="Internal database identifier - cannot be changed">
                                ${collectionId}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
                            <div class="fa-solid fa-toggle-${ragState.disabledCollections?.includes(collectionId) ? 'off' : 'on'} carrot-toggle-collection-btn" data-collection="${collectionId}" title="${ragState.disabledCollections?.includes(collectionId) ? 'Collection disabled - click to enable' : 'Collection enabled - click to disable'}" style="cursor: pointer; font-size: 1.2em; color: ${ragState.disabledCollections?.includes(collectionId) ? 'var(--grey70)' : 'var(--SmartThemeQuoteColor)'}; padding: 6px;"></div>
                            <button class="carrot-secondary-btn carrot-view-chunks-btn" data-collection="${collectionId}" style="padding: 6px 12px; font-size: 0.85em; white-space: nowrap;">
                                <i class="fa-solid fa-eye"></i> View Chunks
                            </button>
                            <button class="carrot-primary-btn carrot-copy-context-btn" data-collection="${collectionId}" style="padding: 6px 12px; font-size: 0.85em; white-space: nowrap;">
                                <i class="fa-solid fa-right-left"></i> Move to...
                            </button>
                            <button class="menu_button carrot-delete-collection-btn" data-collection="${collectionId}" style="padding: 6px 12px; font-size: 0.85em; color: #ff6b6b; flex-shrink: 0;" title="Delete this collection">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; font-size: 0.9em; color: #cbd5e1;">
                        <div><strong>Chunks:</strong> ${totalChunks}</div>
                        <div class="collection-token-count" data-collection="${collectionId}"><strong>Total Size:</strong> <span class="token-value">${totalSize.toLocaleString()} tokens</span></div>
                        <div class="collection-avg-token-count" data-collection="${collectionId}"><strong>Avg Size:</strong> <span class="token-value">${avgSize} tokens</span></div>
                        <div><strong>Sections:</strong> ${sections.length}</div>
                    </div>
                </div>
            `;
        });

        $list.html(html).show();

        // Calculate async token counts for each collection
        collections.forEach(async (collectionId) => {
            const chunks = library[collectionId];
            const chunkArray = Object.values(chunks);

            // Calculate total tokens
            let totalTokens = 0;
            for (const chunk of chunkArray) {
                try {
                    const tokens = await getTokenCountAsync(chunk.text || '');
                    totalTokens += tokens;
                } catch (error) {
                    // Fallback to character count if token counting fails
                    totalTokens += (chunk.text || '').length;
                }
            }

            // Update total size display
            $(`.collection-token-count[data-collection="${collectionId}"] .token-value`).text(`${totalTokens.toLocaleString()} tokens`);

            // Update average size display
            const avgTokens = chunkArray.length > 0 ? Math.round(totalTokens / chunkArray.length) : 0;
            $(`.collection-avg-token-count[data-collection="${collectionId}"] .token-value`).text(`${avgTokens} tokens`);
        });

        // NOTE: Event handlers moved to delegated handlers outside this function
        // to ensure they persist after HTML regeneration
    });

    // DELEGATED EVENT HANDLERS FOR RAG VIEWER
    // These are attached to document so they work even after HTML is regenerated

    $(document).on('click', '.carrot-toggle-collection-btn', async function() {
        const collectionId = $(this).data('collection');
        const ragState = extension_settings[extensionName].rag;

        if (!ragState.disabledCollections) {
            ragState.disabledCollections = [];
        }

        const index = ragState.disabledCollections.indexOf(collectionId);
        if (index > -1) {
            // Enable collection
            ragState.disabledCollections.splice(index, 1);
            toastr.success(`Collection enabled`);
        } else {
            // Disable collection
            ragState.disabledCollections.push(collectionId);
            toastr.warning(`Collection disabled - embeddings won't be queried`);
        }

        await saveSettingsDebounced();
        $('#carrot-rag-refresh-viewer').click();
    });

    $(document).on('click', '.carrot-view-chunks-btn', function() {
        const collectionId = $(this).data('collection');
        openChunkVisualizer(collectionId);
    });

    $(document).on('click', '.carrot-rename-collection-btn', async function() {
        const collectionId = $(this).data('collection');
        const currentName = getCharacterNameFromCollectionId(collectionId);

        const newName = prompt('Enter a custom name for this collection:', currentName);

        if (newName !== null && newName.trim() !== '') {
            await setCollectionName(collectionId, newName.trim());
            toastr.success(`Renamed collection to "${newName.trim()}"`);
            $('#carrot-rag-refresh-viewer').click();
        }
    });

    $(document).on('click', '.carrot-copy-context-btn', async function() {
        try {
            const collectionId = $(this).data('collection');
            const currentViewerContext = $('#carrot_rag_viewer_context').val() || 'global';

                CarrotDebug.ui('[Move Collection] Starting move operation', { collectionId, currentViewerContext });

                const selectedContextLevel = await showCopyContextPopup(collectionId, currentViewerContext);

                if (!selectedContextLevel) {
                    CarrotDebug.ui('[Move Collection] User cancelled');
                    return;
                }

                CarrotDebug.ui('[Move Collection] Target level:', selectedContextLevel);

                const ragState = extension_settings[extensionName].rag;

                // Get chunks from source (read-only, for copying)
                const sourceLibrary = getFullLibraryForLevel(currentViewerContext);
                const chunks = sourceLibrary[collectionId];

                CarrotDebug.ui('[Move Collection] Source library chunks:', chunks ? Object.keys(chunks).length : 0);

                if (!chunks) {
                    CarrotDebug.error('[Move Collection] Collection not found in source library');
                    toastr.error('Collection not found in source storage');
                    return;
                }

                // Add to target
                const targetContext = getContext();
                let targetId;
                if (selectedContextLevel === 'character') targetId = targetContext.characterId;
                if (selectedContextLevel === 'chat') targetId = targetContext.chatId;

                CarrotDebug.ui('[Move Collection] Target context ID:', targetId);

                if (selectedContextLevel !== 'global' && (targetId === null || targetId === undefined)) {
                    CarrotDebug.error('[Move Collection] No active context ID for target level');
                    toastr.error(`No active ${selectedContextLevel} to move data to.`);
                    return;
                }

                if (!ragState.libraries[selectedContextLevel]) ragState.libraries[selectedContextLevel] = {};
                if (selectedContextLevel !== 'global' && !ragState.libraries[selectedContextLevel][targetId]) {
                    ragState.libraries[selectedContextLevel][targetId] = {};
                }

                const targetLib = (selectedContextLevel === 'global') ? ragState.libraries.global : ragState.libraries[selectedContextLevel][targetId];
                targetLib[collectionId] = JSON.parse(JSON.stringify(chunks));

                CarrotDebug.ui('[Move Collection] Copied to target library');

                // Handle vector embeddings if collection ID changes based on context
                // We need to move embeddings to the new collection ID
                try {
                    if (fullsheetRAGLoaded && fullsheetAPI.deleteEntireCollection && fullsheetAPI.apiInsertVectorItems) {
                        CarrotDebug.ui(`[Move Collection] Checking if vector move is needed...`);

                        // Note: The collectionId in the library doesn't change, but the actual vector
                        // collection ID might be different based on context. Since we're moving the
                        // chunks as-is with the same collectionId key, the embeddings should already
                        // be accessible via the collection ID. No vector move needed.
                        CarrotDebug.ui(`[Move Collection] Vector embeddings remain at collection: ${collectionId}`);
                    }
                } catch (error) {
                    CarrotDebug.error('[Move Collection] Vector handling warning:', error);
                }

                // Delete from actual source (not the copy returned by getFullLibraryForLevel)
                let deleted = false;
                switch(currentViewerContext) {
                    case 'character':
                        const allCharLibs = ragState.libraries.character || {};
                        for (const charId in allCharLibs) {
                            if (allCharLibs[charId][collectionId]) {
                                delete allCharLibs[charId][collectionId];
                                deleted = true;
                                CarrotDebug.ui(`[Move Collection] Deleted from character library: ${charId}`);
                                break;
                            }
                        }
                        break;
                    case 'chat':
                        const allChatLibs = ragState.libraries.chat || {};
                        for (const chatId in allChatLibs) {
                            if (allChatLibs[chatId][collectionId]) {
                                delete allChatLibs[chatId][collectionId];
                                deleted = true;
                                CarrotDebug.ui(`[Move Collection] Deleted from chat library: ${chatId}`);
                                break;
                            }
                        }
                        break;
                    case 'global':
                        if (ragState.libraries.global && ragState.libraries.global[collectionId]) {
                            delete ragState.libraries.global[collectionId];
                            deleted = true;
                            CarrotDebug.ui('[Move Collection] Deleted from global library');
                        }
                        break;
                }

                if (!deleted) {
                    CarrotDebug.error('[Move Collection] Failed to delete from source - collection not found in actual source library');
                }

                CarrotDebug.ui('[Move Collection] Deleted from source library');

                saveSettingsDebounced();

                const characterName = getCharacterNameFromCollectionId(collectionId);
                toastr.success(`Moved ${characterName} from ${currentViewerContext.toUpperCase()} to ${selectedContextLevel.toUpperCase()} storage`);

                CarrotDebug.ui('[Move Collection] Move complete, refreshing viewer');
                $('#carrot-rag-refresh-viewer').click();
        } catch (error) {
            CarrotDebug.error('[Move Collection] Error during move operation:', error);
            toastr.error(`Failed to move collection: ${error.message}`);
        }
    });

    $(document).on('click', '.carrot-delete-collection-btn', async function() {
        const collectionId = $(this).data('collection');
        const characterName = getCharacterNameFromCollectionId(collectionId);

        const stContext = getContext();
        const confirmed = await stContext.callGenericPopup(
            `Are you sure you want to delete all chunks for "${characterName}"? This cannot be undone.`,
            'confirm',
            '',
            { okButton: 'Delete', cancelButton: 'Cancel' }
        );

        if (!confirmed) return;

        const currentViewerContext = $('#carrot_rag_viewer_context').val() || 'global';
        const ragState = extension_settings[extensionName]?.rag;

        if (!ragState?.libraries) {
            toastr.error('No RAG libraries found');
            return;
        }

        // Delete from the actual source library, not a copy
        let deleted = false;
        switch(currentViewerContext) {
            case 'character':
                const allCharLibs = ragState.libraries.character || {};
                for (const charId in allCharLibs) {
                    if (allCharLibs[charId][collectionId]) {
                        delete allCharLibs[charId][collectionId];
                        deleted = true;
                        break;
                    }
                }
                break;
            case 'chat':
                const allChatLibs = ragState.libraries.chat || {};
                for (const chatId in allChatLibs) {
                    if (allChatLibs[chatId][collectionId]) {
                        delete allChatLibs[chatId][collectionId];
                        deleted = true;
                        break;
                    }
                }
                break;
            case 'global':
            default:
                if (ragState.libraries.global[collectionId]) {
                    delete ragState.libraries.global[collectionId];
                    deleted = true;
                }
                break;
        }

        if (!deleted) {
            toastr.error('Collection not found in storage');
            return;
        }

        // Use immediate save and refresh after save completes
        if (typeof saveSettings === 'function') {
            await saveSettings();
        } else {
            saveSettingsDebounced();
        }

        // Delete vector embeddings from the database
        try {
            await fullsheetRAGPromise;
            if (fullsheetAPI.deleteEntireCollection) {
                CarrotDebug.ui(`🥕 Deleting vector collection: ${collectionId}`);
                await fullsheetAPI.deleteEntireCollection(collectionId);
            }
        } catch (error) {
            CarrotDebug.error('🥕 Failed to delete vector collection:', error);
            // Don't block on vector deletion failure
        }

        toastr.success(`Deleted ${characterName} from ${currentViewerContext.toUpperCase()} storage`);

        // Small delay to ensure save completes before refresh
        setTimeout(() => {
            $('#carrot-rag-refresh-viewer').click();
        }, 100);
    });


        // REMOVED: Duplicate handler - main handler is at line 22115

    // Lorebook selection toggle
    $(document).on('change', '.carrot-lorebook-toggle', function() {
        const lorebookName = $(this).data('lorebook');
        const isChecked = $(this).prop('checked');

        if (isChecked) {
            selectedLorebooks.add(lorebookName);
            // Add to tag libraries by default (unless already marked as character repo)
            if (!characterRepoBooks.has(lorebookName)) {
                tagLibraries.add(lorebookName);
            }
            $(this).siblings('.carrot-status-indicator').addClass('active');
        } else {
            selectedLorebooks.delete(lorebookName);
            $(this).siblings('.carrot-status-indicator').removeClass('active');

            // Remove from both character repos and tag libraries when disabled
            if (characterRepoBooks.has(lorebookName)) {
                characterRepoBooks.delete(lorebookName);
                CarrotDebug.repo(`Removed ${lorebookName} from character repos (lorebook disabled)`);
            }
            if (tagLibraries.has(lorebookName)) {
                tagLibraries.delete(lorebookName);
                CarrotDebug.repo(`Removed ${lorebookName} from tag libraries (lorebook disabled)`);
            }
        }
        updateStatusPanels();
        saveSettings();
    });
    
    // Character repo toggle
    $(document).on('click', '.carrot-repo-btn', async function() {
        const lorebookName = $(this).data('lorebook');
        const isCurrentlyRepo = characterRepoBooks.has(lorebookName);
        const isCurrentlyTagLib = tagLibraries.has(lorebookName);
        const $badge = $(this).siblings('.carrot-lorebook-status');
        const settings = extension_settings[extensionName];

        if (isCurrentlyRepo) {
            // Switch from Character Repo to Tag Library
            characterRepoBooks.delete(lorebookName);
            tagLibraries.add(lorebookName);
            $(this).removeClass('active')
                   .css({ background: 'transparent' })
                   .text('📚');
            // Update badge
            $badge.css({
                background: 'rgba(33, 150, 243, 0.2)',
                color: '#90caf9'
            }).html('📚 Tag Lib');

            // Wrap entries if BunnymoTagWrapping is enabled
            if (settings.bunnymoTagWrapping) {
                $(this).text('🔄 Wrapping...').prop('disabled', true);
                await wrapLorebookEntries(lorebookName);
                $(this).text('📚').prop('disabled', false);
            }
        } else if (isCurrentlyTagLib) {
            // Switch from Tag Library to Character Repo
            tagLibraries.delete(lorebookName);
            characterRepoBooks.add(lorebookName);
            $(this).addClass('active')
                   .css({ background: 'rgba(156, 39, 176, 0.3)' })
                   .text('👤');
            // Update badge
            $badge.css({
                background: 'rgba(156, 39, 176, 0.2)',
                color: '#ce93d8'
            }).html('👤 Char Repo');

            // Unwrap entries if BunnymoTagWrapping is enabled
            if (settings.bunnymoTagWrapping) {
                $(this).text('🔄 Unwrapping...').prop('disabled', true);
                await unwrapLorebookEntries(lorebookName);
                $(this).text('👤').prop('disabled', false);
            }
        } else {
            // Not a repo or tag lib, make it a tag library
            tagLibraries.add(lorebookName);
            $(this).removeClass('active')
                   .css({ background: 'transparent' })
                   .text('📚');
            // Update badge
            $badge.css({
                background: 'rgba(33, 150, 243, 0.2)',
                color: '#90caf9'
            }).html('📚 Tag Lib');

            // Wrap entries if BunnymoTagWrapping is enabled
            if (settings.bunnymoTagWrapping) {
                $(this).text('🔄 Wrapping...').prop('disabled', true);
                await wrapLorebookEntries(lorebookName);
                $(this).text('📚').prop('disabled', false);
            }
        }
        updateStatusPanels();
        saveSettings();
    });
    
    // Scan button
    $('#carrot-scan-btn').on('click', async function() {
        // Check master enable first
        if (!extension_settings[extensionName].enabled) {
            alert('CarrotKernel is disabled. Please enable it first.');
            return;
        }
        
        const selected = Array.from(selectedLorebooks);
        if (selected.length === 0) {
            alert('No lorebooks selected. Please select at least one lorebook to scan.');
            return;
        }
        
        $(this).text('Scanning...').prop('disabled', true);

        try {
            const results = await scanSelectedLorebooks(selected);

            let message = `Scan Results:\n\n`;
            message += `• Characters Found: ${results.characters.length}\n`;
            message += `• Character Repos: ${results.characterRepos}\n`;
            message += `• Tag Libraries: ${results.tagLibraries}\n\n`;
            
            if (results.characters.length > 0) {
                message += `Characters: ${results.characters.join(', ')}`;
            }
            
            alert(message);
            updateStatusPanels();

        } catch (error) {
            alert(`Scan failed: ${error.message}`);
        } finally {
            $(this).text('Scan Selected Lorebooks').prop('disabled', false);
            updateStatusPanels();
        }
    });
    
    // Test display button
    $('#carrot-test-display').on('click', function() {
        // Check master enable first
        if (!extension_settings[extensionName].enabled) {
            alert('CarrotKernel is disabled. Please enable it first.');
            return;
        }
        
        if (scannedCharacters.size === 0) {
            alert('No characters scanned. Please scan lorebooks first.');
            return;
        }
        
        const testCharacters = Array.from(scannedCharacters.keys()).slice(0, 2);
        displayCharacterData(testCharacters);
    });
    
    // Search functionality
    $('#carrot-search-lorebooks').on('input', async function() {
        const searchTerm = $(this).val().toLowerCase();
        $('.carrot-lorebook-item').each(function() {
            const lorebookName = $(this).find('.carrot-lorebook-name').text().toLowerCase();
            $(this).toggle(lorebookName.includes(searchTerm));
        });
    });

    // Pack Manager Events
    $('#carrot_auto_check_updates').prop('checked', settings.autoCheckUpdates !== false).on('change', async function() {
        extension_settings[extensionName].autoCheckUpdates = $(this).prop('checked');
        saveSettingsDebounced();
    });

    // Pack manager buttons with debouncing
    let packScanInProgress = false;
    const PACK_SCAN_DEBOUNCE_MS = 1000; // Prevent rapid clicks

    $('#carrot-pack-scan').on('click', async function(event) {
        CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Scan button clicked');

        // Prevent double-clicks and rapid clicking
        if (packScanInProgress) {
            CarrotDebug.ui('⚠️ PACK MANAGER DEBUG: Scan already in progress, ignoring click');
            event.preventDefault();
            return false;
        }

        packScanInProgress = true;
        const button = $(this);
        const originalText = button.html();

        // Visual feedback that click was registered
        button.addClass('clicked');

        CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Button element found:', {
            buttonExists: !!button.length,
            originalText: originalText,
            isDisabled: button.prop('disabled')
        });

        // Check if CarrotPackManager exists
        if (!window.CarrotPackManager) {
            CarrotDebug.error('❌ PACK MANAGER ERROR: window.CarrotPackManager not found!');
            $('#carrot-pack-status').html('<p>❌ Pack Manager not initialized. Please refresh the page.</p>');
            packScanInProgress = false;
            button.removeClass('clicked');
            return;
        }

        CarrotDebug.ui('🎯 PACK MANAGER DEBUG: CarrotPackManager found, checking scanRemotePacks method');

        if (typeof window.CarrotPackManager.scanRemotePacks !== 'function') {
            CarrotDebug.error('❌ PACK MANAGER ERROR: scanRemotePacks method not found!');
            $('#carrot-pack-status').html('<p>❌ Pack Manager scanRemotePacks method missing. Extension may be corrupted.</p>');
            packScanInProgress = false;
            button.removeClass('clicked');
            return;
        }

        CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Starting pack scan process');

        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Scanning...');
        $('#carrot-pack-status').html('<p>🔍 Scanning GitHub repository for available packs...</p><p>📊 Rate-limit aware scanning with automatic retry enabled.</p>');

        try {
            CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Calling scanRemotePacks()...');
            const packs = await window.CarrotPackManager.scanRemotePacks();

            CarrotDebug.ui('🎯 PACK MANAGER DEBUG: scanRemotePacks completed successfully:', {
                packsFound: packs?.length || 0,
                packs: packs
            });

            updatePackListUI(packs);
            $('#carrot-pack-status').html(`<p>✅ Found ${packs.length} available packs</p>`);

            CarrotDebug.ui('✅ PACK MANAGER DEBUG: Pack scan completed successfully');
        } catch (error) {
            CarrotDebug.error('❌ PACK MANAGER ERROR: Scan failed:', {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                fullError: error
            });

            // Provide user-friendly error messages based on error type
            let userMessage = '';
            if (error.message.includes('rate limit') || error.message.includes('403')) {
                CarrotDebug.error('⚠️ PACK MANAGER DEBUG: GitHub rate limit detected');
                const retryTime = window.CarrotPackManager?.rateLimitInfo?.resetTime;
                const waitMinutes = retryTime ? Math.ceil((retryTime - Date.now()) / 60000) : 5;
                userMessage = `<p>⏳ GitHub API rate limit reached. The extension will automatically retry.</p>
                              <p>🕒 Rate limit resets in approximately ${waitMinutes} minutes.</p>
                              <p>💡 Tip: Try again later or check console for retry progress.</p>`;
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                CarrotDebug.error('⚠️ PACK MANAGER DEBUG: Network error detected');
                userMessage = `<p>🌐 Network error occurred. The extension will automatically retry failed requests.</p>
                              <p>🔄 Check your internet connection and try scanning again.</p>
                              <p>💻 Console shows detailed retry attempts and network status.</p>`;
            } else if (error.message.includes('404')) {
                CarrotDebug.error('⚠️ PACK MANAGER DEBUG: GitHub repository not found');
                userMessage = `<p>❌ Pack repository not found (GitHub returned 404).</p>
                              <p>🔗 The repository may have moved or been renamed.</p>
                              <p>💻 Check console for the attempted repository URL.</p>`;
            } else if (error.message.includes('timeout')) {
                userMessage = `<p>⏱️ Request timed out. GitHub may be experiencing slow response times.</p>
                              <p>🔄 The extension automatically retries with exponential backoff.</p>
                              <p>💡 Try scanning again - it may succeed on retry.</p>`;
            } else {
                userMessage = `<p>❌ Scan failed: ${error.message}</p>
                              <p>🔄 If this was a temporary issue, the extension will retry automatically.</p>
                              <p>💻 Check console for detailed error information and retry attempts.</p>`;
            }

            $('#carrot-pack-status').html(userMessage);
        } finally {
            CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Restoring button state');
            button.prop('disabled', false).html(originalText).removeClass('clicked');

            // Reset scan state with debounce delay
            setTimeout(() => {
                packScanInProgress = false;
                CarrotDebug.ui('🎯 PACK MANAGER DEBUG: Scan debounce period ended');
            }, PACK_SCAN_DEBOUNCE_MS);
        }
    });

    CarrotDebug.repo('✅ Pack scan button event handler bound successfully');

    $('#carrot-pack-sync').on('click', async function() {
        const button = $(this);
        const originalText = button.html();
        
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Installing...');
        $('#carrot-pack-status').html('<p>📦 Installing all available packs...</p>');
        
        try {
            const result = await window.CarrotPackManager.autoSync();
            $('#carrot-pack-status').html(`<p>✅ ${result.summary}</p>`);
            
            // Refresh pack list to show installed status
            const packs = Array.from(window.CarrotPackManager.availablePacks.values());
            updatePackListUI(packs);
        } catch (error) {
            $('#carrot-pack-status').html(`<p>❌ Installation failed: ${error.message}</p>`);
        } finally {
            button.prop('disabled', false).html(originalText);
        }
    });

    $('#carrot-pack-update').on('click', async function() {
        const button = $(this);
        const originalText = button.html();
        
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Updating...');
        $('#carrot-pack-status').html('<p>🔄 Updating all installed packs...</p>');
        
        try {
            const result = await window.CarrotPackManager.updateAllPacks();
            $('#carrot-pack-status').html(`<p>✅ Updates complete: ${result.updated} updated, ${result.failed} failed</p>`);
            
            // Refresh pack list to show updated status
            const packs = Array.from(window.CarrotPackManager.availablePacks.values());
            updatePackListUI(packs);
        } catch (error) {
            $('#carrot-pack-status').html(`<p>❌ Update failed: ${error.message}</p>`);
        } finally {
            button.prop('disabled', false).html(originalText);
        }
    });

    // Initialize Baby Bunny Mode button (using qvink_memory timing)
    jQuery(function() {
        initialize_baby_bunny_message_button();

        // Add buttons to all existing messages after template is set up (only if enabled)
        setTimeout(() => {
            // MASTER ENABLE CHECK: Only add buttons if extension AND Baby Bunny are enabled
            if (extension_settings[extensionName]?.enabled && extension_settings[extensionName]?.babyBunnyMode) {
                add_baby_bunny_buttons_to_all_existing_messages();
            }
        }, 500);
    });

    // Hook into message rendering events to ensure buttons appear on new messages (only if enabled)
    // Only register once to prevent duplicate button additions
    if (!window.CARROT_BUTTON_LISTENERS_REGISTERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            // MASTER ENABLE CHECK: Only add buttons if extension AND Baby Bunny are enabled
            if (extension_settings[extensionName]?.enabled && extension_settings[extensionName]?.babyBunnyMode) {
                add_baby_bunny_button_to_message(messageId);
            }
        });

        eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
            // MASTER ENABLE CHECK: Only add buttons if extension AND Baby Bunny are enabled
            if (extension_settings[extensionName]?.enabled && extension_settings[extensionName]?.babyBunnyMode) {
                add_baby_bunny_button_to_message(messageId);
            }
        });
        window.CARROT_BUTTON_LISTENERS_REGISTERED = true;
    }

    // Mobile touch support for clickable status panels
    // Add touch event handlers to ensure modals open on mobile devices
    if ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)) {
        const mobileClickableSelectors = [
            '.carrot-status-templates.carrot-clickable',
            '.carrot-status-packs.carrot-clickable',
            '.carrot-status-system.carrot-clickable',
            '.carrot-status-repository.carrot-clickable'
        ];

        mobileClickableSelectors.forEach(selector => {
            $(document).on('touchend', selector, function(e) {
                // Don't prevent default - let onclick work naturally
                // Just ensure the element is tappable
                CarrotDebug.ui('MOBILE DEBUG: Touch event fired for:', selector);
            });
        });
    }

    // Inject CarrotKernel lorebook connector button into character card
    if ($('#carrot_lorebook_connector_button').length === 0) {
        const $rabbitButton = $('<div id="carrot_lorebook_connector_button" class="menu_button" title="CarrotKernel Lorebook Connections&#10;&#10;Manage character and chat lorebook connections" style="font-size: inherit;">🐰</div>');
        $rabbitButton.insertAfter('#world_button');

        $rabbitButton.on('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            CarrotLorebookConnector.open();
        });

        // Hide native ST lorebook buttons when CarrotKernel is active
        // Our rabbit button replaces both character and chat lorebook buttons
        $('#world_button').css('display', 'none');
        $('.chat_lorebook_button').css('display', 'none !important');

        // Also hide via stylesheet to ensure it works
        $('<style>.chat_lorebook_button { display: none !important; }</style>').appendTo('head');
    }

    // Override "Link to World Info" dropdown option to use CarrotKernel connector.
    // Match on the option's id, not its value — "Link to World Info" has no `value`
    // attribute, so .val() falls back to the (now emoji-relabeled) option text and
    // can never equal 'set_character_world'. Bind directly on the element (not
    // delegated on document) so this fires alongside ST's own directly-bound handler
    // rather than arriving late in the bubble phase.
    $('#char-management-dropdown').on('change', function(e) {
        const target = $(this.selectedOptions).attr('id');
        if (target === 'set_character_world') {
            e.preventDefault();
            e.stopPropagation();
            CarrotLorebookConnector.open();
            // Reset dropdown
            $(this).val('default');
            return false;
        }
    });

    // Change the text of "Link to World Info" option to indicate CarrotKernel override
    $('#set_character_world').text('🐰 Lorebook Connections (CarrotKernel)');

    // Main lorebook popout button
    $('#carrot-main-lorebook-popout-btn').off('click').on('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        toggleMainLorebookPopout();
    });
}

// =============================================================================
// MAIN LOREBOOK POPOUT FUNCTIONALITY
// =============================================================================

function initializeMainLorebookPopout() {
    // Store references to the lorebook content
    $mainLorebookContent = $('#carrot-lorebook-management .carrot-card-body');
    $mainLorebookOriginalParent = $mainLorebookContent.parent();

    // Check if popout template exists
    if ($('#zoomed_avatar_template').length === 0) {
        CarrotDebug.error('Popout template not found - popout feature disabled');
        return;
    }

    // Create the popout window from template
    $mainLorebookPopout = $($('#zoomed_avatar_template').html());
    $mainLorebookPopout.attr('id', 'carrot-main-lorebook-popout')
        .removeClass('zoomed_avatar')
        .addClass('draggable')
        .css({
            'position': 'fixed',
            'top': '50%',
            'left': '50%',
            'transform': 'translate(-50%, -50%)',
            'min-width': '900px',
            'min-height': '700px',
            'max-width': '95vw',
            'max-height': '95vh',
            'width': '1200px',
            'height': '85vh',
            'z-index': '10000',
            'background': 'var(--SmartThemeBlurTintColor)',
            'border': '3px solid var(--SmartThemeEmColor)',
            'border-radius': '16px',
            'box-shadow': '0 25px 80px rgba(0,0,0,0.6)',
            'overflow': 'hidden',
            'display': 'flex',
            'flex-direction': 'column'
        })
        .empty();

    // Create control bar with drag handle and close button
    const controlBarHtml = `
        <div class="panelControlBar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05)); border-bottom: 2px solid rgba(139, 92, 246, 0.3); backdrop-filter: blur(10px);">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div id="carrot-main-lorebook-popout-header" class="fa-solid fa-grip drag-grabber" style="cursor: move; color: var(--SmartThemeBodyColor); opacity: 0.7; font-size: 18px; transition: opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.7'"></div>
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--SmartThemeBodyColor);">📚 Lorebook Management</h3>
            </div>
            <button class="dragClose" style="
                cursor: pointer;
                background: rgba(239, 68, 68, 0.15);
                border: 1.5px solid rgba(239, 68, 68, 0.4);
                border-radius: 8px;
                padding: 8px 12px;
                color: #ef4444;
                font-size: 16px;
                font-weight: 600;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
            " onmouseenter="this.style.background='rgba(239, 68, 68, 0.25)'; this.style.borderColor='rgba(239, 68, 68, 0.6)'; this.style.transform='scale(1.05)'" onmouseleave="this.style.background='rgba(239, 68, 68, 0.15)'; this.style.borderColor='rgba(239, 68, 68, 0.4)'; this.style.transform='scale(1)'">
                <i class="fa-solid fa-xmark"></i>
                <span>Close</span>
            </button>
        </div>
    `;

    $mainLorebookPopout.append(controlBarHtml);

    // Create content wrapper
    const contentWrapper = $('<div></div>')
        .css({
            'padding': '30px',
            'overflow-y': 'auto',
            'overflow-x': 'hidden',
            'flex': '1',
            'background': 'var(--SmartThemeBlurTintColor)'
        });

    $mainLorebookPopout.append(contentWrapper);

    CarrotDebug.ui('🥕 Main lorebook popout initialized');
}

function openMainLorebookPopout() {
    if (!$mainLorebookPopout) {
        initializeMainLorebookPopout();
        if (!$mainLorebookPopout) return; // Failed to initialize
    }

    // Create backdrop overlay
    const $backdrop = $('<div></div>')
        .attr('id', 'carrot-popout-backdrop')
        .css({
            'position': 'fixed',
            'top': '0',
            'left': '0',
            'width': '100vw',
            'height': '100vh',
            'background': 'rgba(0, 0, 0, 0.6)',
            'backdrop-filter': 'blur(4px)',
            'z-index': '9999',
            'opacity': '0',
            'transition': 'opacity 0.3s ease'
        })
        .on('click', function() {
            closeMainLorebookPopout();
        });

    // Add backdrop and popout to body
    $('body').append($backdrop);
    $('body').append($mainLorebookPopout);

    // Trigger backdrop fade-in
    setTimeout(() => $backdrop.css('opacity', '1'), 10);

    // Make draggable
    loadMovingUIState();
    dragElement($mainLorebookPopout);

    // Setup close button
    $mainLorebookPopout.find('.dragClose').off('click').on('click', function() {
        closeMainLorebookPopout();
    });

    // Move content to popout
    const $contentWrapper = $mainLorebookPopout.find('div').last();
    $mainLorebookContent.appendTo($contentWrapper);

    // Enhance styling for popout view
    $mainLorebookContent.css({
        'max-height': 'none',
        'height': '100%',
        'display': 'flex',
        'flex-direction': 'column'
    });

    // Make search container not shrink
    $mainLorebookContent.find('.carrot-search-container').css({
        'flex-shrink': '0'
    });

    // Make search box larger
    $mainLorebookContent.find('#carrot-search-lorebooks').css({
        'font-size': '16px',
        'padding': '14px 20px'
    });

    // Make lorebook container fill remaining space
    $mainLorebookContent.find('.carrot-lorebook-container').css({
        'max-height': 'none',
        'flex': '1',
        'overflow-y': 'auto',
        'display': 'flex',
        'flex-direction': 'column'
    });

    // Make lorebook list fill the container
    $mainLorebookContent.find('.carrot-lorebook-list').css({
        'flex': '1'
    });

    // Make lorebook items larger and more spaced
    $mainLorebookContent.find('.carrot-lorebook-item').css({
        'padding': '16px 20px',
        'margin-bottom': '12px',
        'font-size': '15px'
    });

    // Make action bar not shrink
    $mainLorebookContent.find('.carrot-action-bar').css({
        'flex-shrink': '0',
        'margin-top': '16px'
    });

    // Make action buttons larger
    $mainLorebookContent.find('.carrot-primary-btn, .carrot-secondary-btn').css({
        'padding': '14px 24px',
        'font-size': '15px'
    });

    // Add placeholder to original location
    const $placeholder = $('<div class="carrot-card-body"></div>')
        .attr('id', 'carrot-main-lorebook-placeholder')
        .html('<div style="display: flex; align-items: center; justify-content: center; padding: 60px; color: var(--SmartThemeQuoteColor); font-style: italic; flex-direction: column; gap: 10px;"><i class="fa-solid fa-window-restore" style="font-size: 32px;"></i><span>Currently viewing in separate window</span></div>');
    $mainLorebookOriginalParent.append($placeholder);

    // Show with animation
    $mainLorebookPopout.fadeIn(animation_duration);
    mainLorebookPopoutVisible = true;

    CarrotDebug.ui('🥕 Main lorebook popout opened');
}

function closeMainLorebookPopout() {
    if (!$mainLorebookPopout || !mainLorebookPopoutVisible) return;

    // Fade out backdrop
    const $backdrop = $('#carrot-popout-backdrop');
    $backdrop.css('opacity', '0');

    $mainLorebookPopout.fadeOut(animation_duration, () => {
        // Reset styling to original
        $mainLorebookContent.css({
            'max-height': '',
            'height': '',
            'display': '',
            'flex-direction': ''
        });
        $mainLorebookContent.find('.carrot-search-container').css({
            'flex-shrink': ''
        });
        $mainLorebookContent.find('#carrot-search-lorebooks').css({
            'font-size': '',
            'padding': ''
        });
        $mainLorebookContent.find('.carrot-lorebook-container').css({
            'max-height': '',
            'flex': '',
            'overflow-y': '',
            'display': '',
            'flex-direction': ''
        });
        $mainLorebookContent.find('.carrot-lorebook-list').css({
            'flex': ''
        });
        $mainLorebookContent.find('.carrot-lorebook-item').css({
            'padding': '',
            'margin-bottom': '',
            'font-size': ''
        });
        $mainLorebookContent.find('.carrot-action-bar').css({
            'flex-shrink': '',
            'margin-top': ''
        });
        $mainLorebookContent.find('.carrot-primary-btn, .carrot-secondary-btn').css({
            'padding': '',
            'font-size': ''
        });

        // Move content back to original location
        $('#carrot-main-lorebook-placeholder').remove();
        $mainLorebookContent.appendTo($mainLorebookOriginalParent);

        // Remove popout and backdrop from DOM
        $mainLorebookPopout.remove();
        $backdrop.remove();
        $mainLorebookPopout = null;

        CarrotDebug.ui('🥕 Main lorebook popout closed');
    });

    mainLorebookPopoutVisible = false;
}

function toggleMainLorebookPopout() {
    if (mainLorebookPopoutVisible) {
        closeMainLorebookPopout();
    } else {
        openMainLorebookPopout();
    }
}

// Handle ESC key to close popout
$(document).on('keydown', function(event) {
    if (event.key === 'Escape' && mainLorebookPopoutVisible) {
        closeMainLorebookPopout();
    }
});

// Update pack list UI with current pack status
function updatePackListUI(packs) {
    const container = $('#carrot-pack-list');
    
    if (!packs || packs.length === 0) {
        container.html('<p class="carrot-help-text">No packs found. Click "Scan Available Packs" to check GitHub.</p>');
        return;
    }

    const packListHtml = packs.map(pack => {
        const localPack = window.CarrotPackManager.localPacks.get(pack.name);
        const isInstalled = !!localPack;
        const hasUpdate = isInstalled && localPack.updateAvailable;
        
        let statusIcon = '';
        let statusText = '';
        let buttonText = 'Install';
        let buttonClass = 'carrot-primary-btn';
        
        if (hasUpdate) {
            statusIcon = '🔄';
            statusText = 'Update Available';
            buttonText = 'Update';
            buttonClass = 'carrot-warning-btn';
        } else if (isInstalled) {
            statusIcon = '✅';
            statusText = 'Installed';
            buttonText = 'Reinstall';
            buttonClass = 'carrot-secondary-btn';
        } else {
            statusIcon = '📦';
            statusText = 'Available';
            buttonText = 'Install';
            buttonClass = 'carrot-primary-btn';
        }
        
        return `
            <div class="carrot-pack-item" data-pack="${pack.name}">
                <div class="carrot-pack-header">
                    <div class="carrot-pack-info">
                        <h4 class="carrot-pack-name">${pack.displayName}</h4>
                        <p class="carrot-pack-theme">${pack.theme} Theme</p>
                    </div>
                    <div class="carrot-pack-status">
                        <span class="carrot-status-icon">${statusIcon}</span>
                        <span class="carrot-status-text">${statusText}</span>
                    </div>
                </div>
                <div class="carrot-pack-details">
                    <div class="carrot-pack-meta">
                        <span class="carrot-pack-size">${(pack.jsonSize / 1024).toFixed(1)}KB</span>
                        <span class="carrot-pack-file">${pack.jsonFile}</span>
                    </div>
                    <div class="carrot-pack-actions">
                        <button class="carrot-pack-install-btn ${buttonClass}" data-pack="${pack.name}">
                            ${buttonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.html(packListHtml);

    // Bind individual pack install/update buttons
    $('.carrot-pack-install-btn').off('click').on('click', async function(e) {
        e.preventDefault();
        
        const packName = $(this).data('pack');
        const button = $(this);
        const originalText = button.text();
        
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Processing...');
        
        try {
            const localPack = window.CarrotPackManager.localPacks.get(packName);
            let success = false;
            
            if (localPack && localPack.updateAvailable) {
                success = await window.CarrotPackManager.updatePack(packName);
            } else {
                success = await window.CarrotPackManager.installPack(packName);
            }
            
            if (success) {
                button.removeClass('carrot-primary-btn carrot-warning-btn').addClass('carrot-success-btn');
                button.html('✅ Done');
                
                // Update the pack item status
                const packItem = button.closest('.carrot-pack-item');
                packItem.find('.carrot-status-icon').text('✅');
                packItem.find('.carrot-status-text').text('Installed');
                
                setTimeout(() => {
                    button.removeClass('carrot-success-btn').addClass('carrot-secondary-btn');
                    button.text('Reinstall').prop('disabled', false);
                }, 2000);
            } else {
                button.prop('disabled', false).text(originalText);
            }
        } catch (error) {
            CarrotDebug.error('Pack operation failed:', error);
            button.prop('disabled', false).text(originalText);
        }
    });

}

// =============================================================================
// LOADOUT MANAGEMENT SYSTEM 🥕
// Now loaded from ./loadout-manager.js
// Comprehensive system for managing lorebook configurations and profiles
// =============================================================================

// BABY BUNNY MODE MESSAGE BUTTON (following qvink_memory pattern)
// =============================================================================


// 🥕 WB TRACKER DEBUG - WORLD INFO ENTRY TRIGGER DEBUGGING
CarrotDebug.ui('Setting up world info trigger debugging...');

document.addEventListener('click', function(e) {
    // Log ALL clicks to see what's happening (only in debug mode)
    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui('Click detected on element:', {
            tagName: e.target.tagName,
            className: e.target.className,
            classList: Array.from(e.target.classList),
            hasCarrotClass: e.target.classList.contains('fa-carrot'),
            id: e.target.id,
            textContent: e.target.textContent?.substring(0, 50)
        });
    }

    // Check for carrot icon - either fa-carrot class OR ck-trigger with carrot emoji
    const isCarrotIcon = e.target.classList.contains('fa-carrot') ||
                        (e.target.classList.contains('ck-trigger') && e.target.textContent?.includes('🥕'));

    if (isCarrotIcon) {
        CarrotDebug.ui('Carrot clicked - trying to open WorldBook tracker panel...');

        // Check if CarrotKernel has a function to open the tracker
        CarrotDebug.ui('Checking for CarrotKernel tracker functions...');
        const carrotFunctions = {
            CarrotKernel: typeof window.CarrotKernel,
            openTracker: typeof window.CarrotKernel?.openTracker,
            showTracker: typeof window.CarrotKernel?.showTracker,
            openWorldBookTracker: typeof window.CarrotKernel?.openWorldBookTracker,
            showWorldBookTracker: typeof window.CarrotKernel?.showWorldBookTracker,
            popup: typeof window.CarrotKernel?.showPopup
        };
        CarrotDebug.ui('Available CarrotKernel functions:', carrotFunctions);

        // Try to find and call the tracker opening function
        if (window.CarrotKernel) {
            CarrotDebug.ui('CarrotKernel object found, trying to open tracker...');

            // Method 1: Try showPopup with proper parameters
            if (window.CarrotKernel.showPopup) {
                CarrotDebug.ui('Trying CarrotKernel.showPopup with proper parameters...');
                try {
                    // Call showPopup with title and content parameters
                    window.CarrotKernel.showPopup('WorldBook Tracker', '<div class="worldbook-tracker">Loading tracker...</div>');
                    CarrotDebug.ui('showPopup called successfully');
                } catch (error) {
                    CarrotDebug.error('showPopup failed:', error);
                }
            }

            // Method 2: Try openTracker
            if (window.CarrotKernel.openTracker) {
                CarrotDebug.ui('Trying CarrotKernel.openTracker...');
                try {
                    window.CarrotKernel.openTracker();
                    CarrotDebug.ui('openTracker called successfully');
                } catch (error) {
                    CarrotDebug.error('openTracker failed:', error);
                }
            }

            // Method 3: Try direct popup call with tracker content
            if (window.CarrotKernel.showPopup && window.CarrotKernel.generateTrackerHTML) {
                CarrotDebug.ui('Trying to generate and show tracker HTML...');
                try {
                    const trackerHTML = window.CarrotKernel.generateTrackerHTML();
                    window.CarrotKernel.showPopup('WorldBook Tracker', trackerHTML);
                    CarrotDebug.ui('Tracker HTML generated and shown');
                } catch (error) {
                    CarrotDebug.error('Tracker HTML generation failed:', error);
                }
            }

            // Method 4: Look for any CarrotKernel methods that might open the tracker
            CarrotDebug.ui('All CarrotKernel methods:', Object.getOwnPropertyNames(window.CarrotKernel));
        } else {
            CarrotDebug.error('CarrotKernel object not found on window');
        }

        // Check if the specific ck-panel tracker exists and populate it
        setTimeout(() => {
            const ckPanel = document.querySelector('.ck-panel');
            const ckContent = document.querySelector('.ck-panel .ck-content');
            const ckBadge = document.querySelector('.ck-panel .ck-header__badge');

            CarrotDebug.ui('🥕 PANEL CHECK: ck-panel exists?', !!ckPanel);
            CarrotDebug.ui('🥕 PANEL CHECK: ck-content exists?', !!ckContent);
            CarrotDebug.ui('🥕 PANEL CHECK: ck-badge exists?', !!ckBadge);

            if (ckPanel && ckContent) {
                CarrotDebug.ui('✅ PANEL FOUND: CarrotKernel tracker panel exists');
                CarrotDebug.ui('🥕 PANEL STATUS: Badge shows:', ckBadge?.textContent);
                CarrotDebug.ui('🥕 PANEL STATUS: Content empty?', ckContent.innerHTML.trim() === '');

                // Try to populate the tracker content
                CarrotDebug.ui('🥕 POPULATE: Attempting to populate tracker...');

                // Check if there's a populate function
                if (window.CarrotKernel && window.CarrotKernel.populateTracker) {
                    CarrotDebug.ui('🥕 POPULATE: Trying CarrotKernel.populateTracker...');
                    try {
                        window.CarrotKernel.populateTracker();
                        CarrotDebug.ui('✅ POPULATE: populateTracker called');
                    } catch (error) {
                        CarrotDebug.ui('❌ POPULATE: populateTracker failed:', error);
                    }
                }

                // Check if there's an update function
                if (window.CarrotKernel && window.CarrotKernel.updateTracker) {
                    CarrotDebug.ui('🥕 POPULATE: Trying CarrotKernel.updateTracker...');
                    try {
                        window.CarrotKernel.updateTracker();
                        CarrotDebug.ui('✅ POPULATE: updateTracker called');
                    } catch (error) {
                        CarrotDebug.ui('❌ POPULATE: updateTracker failed:', error);
                    }
                }

            } else {
                CarrotDebug.ui('❌ PANEL NOT FOUND: CarrotKernel tracker panel does not exist');
            }
        }, 300);
    }
}, true);






