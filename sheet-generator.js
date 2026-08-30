// =============================================================================
// CARROT SHEET GENERATOR & TEMPLATE SYSTEM 🥕
// Character sheet generation and template management for BunnyMo format
// =============================================================================

import { CarrotDebug } from './debugger.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { loadWorldInfo } from '../../../world-info.js';
import {
    scannedCharacters,
    selectedLorebooks,
    characterRepoBooks,
    getLastInjectedCharacters,
    EXTENSION_NAME
} from './carrot-state.js';

// Use EXTENSION_NAME consistently
const extensionName = EXTENSION_NAME;

// Forward declaration - will be provided by index.js
// This is a temporary solution to avoid circular dependency
// TODO: Consider moving findCharacterByName to carrot-state.js or a utilities module
let findCharacterByName = null;

/**
 * Initialize the sheet generator with required dependencies
 * Called by index.js after it defines findCharacterByName
 * @param {Function} findCharFn - The findCharacterByName function from index.js
 */
export function initializeSheetGenerator(findCharFn) {
    findCharacterByName = findCharFn;
    CarrotDebug.init('Sheet generator initialized with dependencies');
}

// =============================================================================
// SHEET GENERATION FUNCTIONS
// =============================================================================

async function generateFullSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Fullsheet Format');

    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };

        return await CarrotTemplateManager.processTemplate(currentTemplate, templateData);
    }
    
    // Fallback to default format
    let content = `# 📋 FULL CHARACTER SHEET: ${characterName}\n\n`;
    
    for (const [category, values] of charData.tags) {
        if (values.size > 0) {
            content += `## ${category.toUpperCase()}\n`;
            Array.from(values).forEach(tag => {
                content += `- ${tag}\n`;
            });
            content += '\n';
        }
    }
    
    return content;
}

// Generate tag-focused sheet
async function generateTagSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Tagsheet Format');

    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };

        return await CarrotTemplateManager.processTemplate(currentTemplate, templateData);
    }
    
    // Fallback to BunnymoTags format
    let content = `<BunnymoTags><Name:${characterName}>`;
    
    // Build structured BunnymoTags format
    const tagMap = new Map();
    for (const [category, values] of charData.tags) {
        if (values.size > 0) {
            tagMap.set(category.toUpperCase(), Array.from(values));
        }
    }
    
    // Add genre if available
    if (tagMap.has('GENRE')) {
        content += `, <GENRE:${tagMap.get('GENRE').join(',')}>`;
    }
    
    // Physical section
    const physicalTags = ['SPECIES', 'GENDER', 'BUILD', 'SKIN', 'HAIR', 'STYLE'];
    const physicalData = physicalTags.filter(tag => tagMap.has(tag));
    if (physicalData.length > 0) {
        content += ' <PHYSICAL>';
        physicalData.forEach(tag => {
            const values = tagMap.get(tag);
            values.forEach(value => content += `<${tag}:${value}>, `);
        });
        content = content.slice(0, -2) + '</PHYSICAL>';
    }
    
    // Personality section  
    const personalityTags = ['PERSONALITY', 'TRAIT', 'DERE', 'ATTACHMENT', 'CONFLICT', 'BOUNDARIES', 'FLIRTING'];
    const personalityData = personalityTags.filter(tag => tagMap.has(tag));
    if (personalityData.length > 0) {
        content += ' <PERSONALITY>';
        personalityData.forEach(tag => {
            const values = tagMap.get(tag);
            values.forEach(value => content += `<${tag}:${value}>, `);
        });
        content = content.slice(0, -2) + '</PERSONALITY>';
    }
    
    // NSFW section
    const nsfwTags = ['ORIENTATION', 'POWER', 'KINK', 'CHEMISTRY', 'AROUSAL', 'TRAUMA', 'JEALOUSY'];
    const nsfwData = nsfwTags.filter(tag => tagMap.has(tag));
    if (nsfwData.length > 0) {
        content += ' <NSFW>';
        nsfwData.forEach(tag => {
            const values = tagMap.get(tag);
            values.forEach(value => content += `<${tag}:${value}>, `);
        });
        content = content.slice(0, -2) + '</NSFW>';
    }
    
    content += ' </BunnymoTags>';
    
    // Add linguistics if available
    if (tagMap.has('LING') || tagMap.has('LINGUISTICS')) {
        const lingValues = tagMap.get('LING') || tagMap.get('LINGUISTICS') || [];
        if (lingValues.length > 0) {
            content += `\n\n<Linguistics> Character uses `;
            lingValues.forEach((ling, index) => {
                content += `<LING:${ling}>`;
                if (index < lingValues.length - 1) content += ' and ';
            });
            content += ' in their speech patterns. </Linguistics>';
        }
    }
    
    return content;
}

// Generate quick reference sheet
async function generateQuickSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Quicksheet Format');

    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };

        return await CarrotTemplateManager.processTemplate(currentTemplate, templateData);
    }
    
    // Fallback to default format
    let content = `# ⚡ QUICK SHEET: ${characterName}\n\n`;
    
    // Key categories only
    const keyCategories = ['PHYSICAL', 'PERSONALITY', 'SPECIES', 'GENDER', 'NSFW'];
    
    for (const category of keyCategories) {
        const values = charData.tags.get(category);
        if (values && values.size > 0) {
            content += `**${category}:** ${Array.from(values).join(', ')}\n`;
        }
    }
    
    return content;
}
// =============================================================================
// CARROT TEMPLATE MANAGER SYSTEM 🥕
// Simple, reliable template system inspired by qvink_memory's excellent approach
// Avoids BunnyMoTags' overcomplicated failures - uses clean string substitution
// =============================================================================

const CarrotTemplateManager = {
    // Advanced template system with BunnyMoTags-inspired structure
    defaultTemplates: {
        'character_consistency': {
            id: 'character_consistency',
            name: 'Character Consistency',
            description: 'Maintains character consistency across conversations',
            category: 'Character Data Injection',
            role: 'system',
            content: `OOC MANDATORY: [CHARACTER CONTEXT - CarrotKernel Tags]

{{TRIGGERED_CHARACTER_TAGS}}

**CRITICAL INSTRUCTIONS:**
1. You MUST incorporate this character information into your response planning
2. Stay true to their personality traits, species characteristics, and behavioral patterns
3. When using your <think> blocks for reasoning, you MUST include exactly 10 carrot emotes (🥕) distributed throughout your thinking process
4. Carrot emotes (🥕) must ONLY appear inside <think></think> blocks - NEVER in your actual response
5. Use carrots when referencing or applying the character information: "🥕 Luna has the trait \`PROTECTIVE\`, so she'd react immediately in defense of her new found family..."

**CARROT REQUIREMENT:** Exactly 10 🥕 emotes within <think> blocks only.`,
            macros: {
                'CHARACTERS': {
                    type: 'system',
                    description: 'Active character data from scannedCharacters Map',
                    enabled: true,
                    format: 'detailed'
                },
                'PERSONALITY_TAGS': {
                    type: 'tag_category',
                    description: 'Personality and trait tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'PHYSICAL_TAGS': {
                    type: 'tag_category',
                    description: 'Physical appearance and body tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'MBTI_TAGS': {
                    type: 'tag_category',
                    description: 'MBTI personality type tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'COMMUNICATION_TAGS': {
                    type: 'tag_category',
                    description: 'Language and communication tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'IDENTITY_TAGS': {
                    type: 'tag_category',
                    description: 'Identity and context tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'KINK_TAGS': {
                    type: 'tag_category',
                    description: 'Adult/kink tags from all scanned characters',
                    enabled: true,
                    format: 'category_list'
                },
                'SELECTED_LOREBOOKS': {
                    type: 'system',
                    description: 'List of enabled lorebooks from selectedLorebooks Set',
                    enabled: true,
                    format: 'list'
                },
                'CHARACTER_REPO_BOOKS': {
                    type: 'system',
                    description: 'Lorebooks marked as character repositories from characterRepoBooks Set',
                    enabled: true,
                    format: 'list'
                },
                'BUNNYMO_PACK_TAGS': {
                    type: 'bunnymo',
                    description: 'Extracted tag options from BunnyMo pack lorebooks, grouped by prefix (DERE, MBTI, TRAIT, etc.)',
                    enabled: true,
                    format: 'structured'
                },
                'CHARACTER_COUNT': {
                    type: 'system',
                    description: 'Total number of characters in scannedCharacters Map',
                    enabled: true,
                    format: 'number'
                },
                'CHARACTER_LIST': {
                    type: 'system',
                    description: 'Names of all scanned characters from scannedCharacters keys',
                    enabled: true,
                    format: 'list'
                },
                'TRIGGERED_CHARACTER_TAGS': {
                    type: 'triggered',
                    description: 'Tags from characters currently detected in chat context',
                    enabled: true,
                    format: 'triggered_detailed'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },
        
        'bunnymo_fullsheet_injection_default': {
            id: 'bunnymo_fullsheet_injection_default',
            name: 'Default Fullsheet Injection',
            description: 'System prompt for !fullsheet commands',
            category: 'BunnyMo Fullsheet Injection',
            role: 'system',
            content: `🚨 **MANDATORY OOC OVERRIDE** 🚨

**SYSTEM DIRECTIVE:** A !FULLSHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !FULLSHEET request for "{{CHARACTER_NAME}}" with complete comprehensive detail
• **PROVIDE** ALL character categories, tags, and information in organized sections
• **INCLUDE** physical traits, personality, background, abilities, and all available data
• **FORMAT** the sheet as a single machine-readable block using exactly this structure (fill in every value, keep the wrapper tags verbatim):
  <BunnymoTags>
  <Name:CHARACTER_NAME>, <GENRE:GENRE>
  <PHYSICAL>
  <SPECIES:TYPE>, <GENDER:GENDER>, <BUILD:BUILD>, <SKIN:SKIN>, <HAIR:HAIR>, <STYLE:STYLE>
  </PHYSICAL>
  <PERSONALITY>
  <Dere:TYPE>, <TRAIT:TRAIT>, <TRAIT:TRAIT>, <ATTACHMENT:TYPE>, <CONFLICT:TYPE>, <BOUNDARIES:TYPE>
  </PERSONALITY>
  <NSFW>
  <ORIENTATION:TYPE>, <POWER:TYPE>, <KINK:KINK>, <CHEMISTRY:TYPE>, <AROUSAL:TYPE>, <TRAUMA:TYPE>
  </NSFW>
  </BunnymoTags>

  <Linguistics>
  Describe the character's speech patterns in prose, and include one or more <LING:STYLE> tags for each distinct pattern.
  </Linguistics>
• **RESUME** normal roleplay only after completing this comprehensive character sheet

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the sheet request',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },
        
        'bunnymo_tagsheet_injection_default': {
            id: 'bunnymo_tagsheet_injection_default',
            name: 'Default Tagsheet Injection',
            description: 'System prompt for !tagsheet commands',
            category: 'BunnyMo Tagsheet Injection',
            role: 'system',
            content: `🏷️ **MANDATORY OOC OVERRIDE** 🏷️

**SYSTEM DIRECTIVE:** A !TAGSHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !TAGSHEET request for ALL characters referenced in the message
• **PROVIDE** complete BunnymoTags format for each character:
  <BunnymoTags><Name:CHARACTER_NAME>, <GENRE:GENRE> <PHYSICAL><SPECIES:TYPE>, <GENDER:GENDER>, <BUILD:BUILD>, <SKIN:SKIN>, <HAIR:HAIR>, <STYLE:STYLE></PHYSICAL> <PERSONALITY><Dere:TYPE>, <TRAIT:TRAITS>, <ATTACHMENT:TYPE>, etc.</PERSONALITY> <NSFW><ORIENTATION:TYPE>, <POWER:TYPE>, <KINK:KINKS>, etc.</NSFW> </BunnymoTags>
• **INCLUDE** <Linguistics> sections with <LING:STYLE> speech patterns
• **RESUME** normal roleplay only after completing all character tagsheets

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the sheet request',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },
        
        'bunnymo_quicksheet_injection_default': {
            id: 'bunnymo_quicksheet_injection_default',
            name: 'Default Quicksheet Injection',
            description: 'System prompt for !quicksheet commands',
            category: 'BunnyMo Quicksheet Injection',
            role: 'system',
            content: `⚡ **MANDATORY OOC OVERRIDE** ⚡

**SYSTEM DIRECTIVE:** A !QUICKSHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !QUICKSHEET request for "{{CHARACTER_NAME}}" with essential information only
• **PROVIDE** key character details: Physical, Personality, Species, Gender, and NSFW basics
• **FOCUS** on the most important identifying traits and characteristics
• **FORMAT** the sheet as a single machine-readable block using exactly this structure (fill in every value, keep the wrapper tags verbatim, essentials only):
  <BunnymoTags>
  <Name:CHARACTER_NAME>, <GENRE:GENRE>
  <PHYSICAL>
  <SPECIES:TYPE>, <GENDER:GENDER>, <BUILD:BUILD>
  </PHYSICAL>
  <PERSONALITY>
  <Dere:TYPE>, <TRAIT:TRAIT>, <TRAIT:TRAIT>
  </PERSONALITY>
  <NSFW>
  <ORIENTATION:TYPE>, <POWER:TYPE>
  </NSFW>
  </BunnymoTags>
• **RESUME** normal roleplay only after completing this quick reference

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the sheet request',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },

        'bunnymo_memsheet_injection_default': {
            id: 'bunnymo_memsheet_injection_default',
            name: 'Default Memsheet Injection',
            description: 'System prompt for !memsheet commands',
            category: 'BunnyMo Memsheet Injection',
            role: 'system',
            content: `📖 **MANDATORY OOC OVERRIDE** 📖

**SYSTEM DIRECTIVE:** A !MEMSHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !MEMSHEET request - catalogue the specific memory event being referenced
• **PROVIDE** comprehensive memory cataloguing with temporal data, spatial details, participants, concrete events, relationship dynamics, significance analysis, memory tags, and future reference triggers
• **DO NOT CONTINUE** the story after completing this memory catalogue

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative. Story does NOT resume after memory cataloguing.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the memory entry',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },

        'bunnymo_updatesheet_injection_default': {
            id: 'bunnymo_updatesheet_injection_default',
            name: 'Default Updatesheet Injection',
            description: 'System prompt for !updatesheet commands',
            category: 'BunnyMo Updatesheet Injection',
            role: 'system',
            content: `🔄 **MANDATORY OOC OVERRIDE** 🔄

**SYSTEM DIRECTIVE:** A !UPDATESHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !UPDATESHEET request for "{{CHARACTER_NAME}}" - perform comprehensive psychological tag evolution assessment
• **PROVIDE** complete evolution analysis including: assessment scope, change magnitude, psychological analysis by category (Dere, Attachment, MBTI, Traits, NSFW, Boundaries, Genre), overall change assessment with statistics, updated tag block (copy-paste ready), and detailed change log
• **ANALYZE** all scenes since last update to identify tag strengthening/weakening/converting/emerging/fading
• **RESUME** normal roleplay only after completing this comprehensive psychological profile update

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the update assessment',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        },

        'bunnymo_physsheet_injection_default': {
            id: 'bunnymo_physsheet_injection_default',
            name: 'Default Physsheet Injection',
            description: 'System prompt for !physheet commands',
            category: 'BunnyMo Physsheet Injection',
            role: 'system',
            content: `💪 **MANDATORY OOC OVERRIDE** 💪

**SYSTEM DIRECTIVE:** A !PHYSSHEET command has been detected and must be executed immediately.

**INSTRUCTIONS:**
• **CEASE** all current roleplay and narrative progression
• **EXECUTE** the !PHYSSHEET request for "{{CHARACTER_NAME}}" with complete comprehensive physical detail
• **PROVIDE** comprehensive physical bio using the format provided in the Physical Sheet template
• **INCLUDE** appearance overview, core features, distinguishing marks, grooming, physical presence, sensory profile, erogenous zones, intimate details, sexual responses, physical capability, and outfit catalog
• **RESUME** normal roleplay only after completing this comprehensive physical profile

**PRIORITY:** CRITICAL - This system command takes precedence over all ongoing narrative.`,
            variables: {
                'CHARACTER_NAME': {
                    type: 'system',
                    description: 'Character name for the physical profile',
                    enabled: true,
                    format: 'text'
                }
            },
            settings: {
                inject_depth: 4,
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: Date.now(),
                modified: Date.now(),
                usage_count: 0,
                is_default: true,
                is_primary: true
            }
        }
    },

    // Current template and state management
    currentEditingTemplate: null,
    
    // Template storage and retrieval
    getTemplates() {
        const settings = extension_settings[extensionName] || {};
        const userTemplates = settings.templates || {};
        const allTemplates = { ...this.defaultTemplates, ...userTemplates };
        
        // Convert all templates to BunnyMoTags-compatible format
        const compatibleTemplates = {};
        for (const [id, template] of Object.entries(allTemplates)) {
            compatibleTemplates[id] = {
                ...template,
                label: template.name,
                isDefault: template.metadata?.is_default || false,
                variables: template.variables || []
            };
        }
        
        return compatibleTemplates;
    },

    getTemplate(id) {
        const templates = this.getTemplates();
        const template = templates[id];
        if (!template) return null;

        // Convert CarrotKernel format to BunnyMoTags-compatible format
        return {
            ...template,
            label: template.name,
            isDefault: template.metadata?.is_default || false,
            variables: template.variables || [],
            // Ensure depth is available from multiple possible sources
            depth: template.depth !== undefined ? template.depth :
                   (template.settings?.inject_depth !== undefined ? template.settings.inject_depth : 4)
        };
    },

    getPrimaryTemplate() {
        const settings = extension_settings[extensionName] || {};
        const primaryId = settings.primaryTemplate || 'character_consistency';
        return this.getTemplate(primaryId);
    },

    // Method to reset a template to its default version
    resetTemplateToDefault(templateId) {
        const settings = extension_settings[extensionName] || {};
        if (settings.templates && settings.templates[templateId]) {
            delete settings.templates[templateId];
            saveSettingsDebounced();
        }
    },

    // Get templates by category
    getTemplatesByCategory(category) {
        const allTemplates = this.getTemplates();
        return Object.entries(allTemplates)
            .filter(([id, template]) => template.category === category)
            .reduce((acc, [id, template]) => {
                acc[id] = template;
                return acc;
            }, {});
    },

    // Get primary template for a category
    getPrimaryTemplateForCategory(category) {
        const categoryTemplates = this.getTemplatesByCategory(category);
        
        // Find the template marked as primary
        const primaryTemplate = Object.entries(categoryTemplates)
            .find(([id, template]) => template.isPrimary || template.metadata?.is_primary);
            
        if (primaryTemplate) {
            return primaryTemplate[1];
        }
        
        // If no primary template, return the first available template
        const firstTemplate = Object.values(categoryTemplates)[0];
        if (firstTemplate) {
            return firstTemplate;
        }
        
        // Fallback to the character_consistency template
        return this.getTemplate('character_consistency');
    },

    setPrimaryTemplate(id) {
        // CRITICAL: Never overwrite extension_settings completely - use optional chaining
        if (!extension_settings[extensionName]) {
            CarrotDebug.error('⚠️ TEMPLATES: extension_settings not initialized - this should not happen');
            extension_settings[extensionName] = {};
        }
        extension_settings[extensionName].primaryTemplate = id;
        this.saveSettings();
        CarrotDebug.ui(`Primary template set to: ${id}`);
    },

    // Template operations
    saveTemplate(template) {
        // CRITICAL: Never overwrite extension_settings completely
        if (!extension_settings[extensionName]) {
            CarrotDebug.error('⚠️ TEMPLATES: extension_settings not initialized - this should not happen');
            extension_settings[extensionName] = {};
        }
        if (!extension_settings[extensionName].templates) {
            extension_settings[extensionName].templates = {};
        }

        template.metadata = template.metadata || {};
        template.metadata.modified = Date.now();
        template.metadata.usage_count = template.metadata.usage_count || 0;

        extension_settings[extensionName].templates[template.id] = template;
        this.saveSettings(true); // Force immediate save for template creation
        CarrotDebug.ui(`Template '${template.name}' saved successfully`);
        return true;
    },

    duplicateTemplate(id) {
        const template = this.getTemplate(id);
        if (!template) return null;

        const newTemplate = JSON.parse(JSON.stringify(template));
        newTemplate.id = `${id}_copy_${Date.now()}`;
        newTemplate.name = `${template.name} (Copy)`;
        newTemplate.metadata.created = Date.now();
        newTemplate.metadata.modified = Date.now();
        newTemplate.metadata.usage_count = 0;
        newTemplate.metadata.is_default = false;

        this.saveTemplate(newTemplate);
        return newTemplate.id;
    },

    deleteTemplate(id) {
        const template = this.getTemplate(id);
        if (!template) return false;
        
        if (template.metadata && template.metadata.is_default) {
            CarrotDebug.ui(`Cannot delete default template: ${template.name}`);
            return false;
        }

        delete extension_settings[extensionName].templates[id];
        this.saveSettings(true); // Force immediate save for template deletion
        CarrotDebug.ui(`Template '${template.name}' deleted successfully`);
        return true;
    },

    resetTemplate(id) {
        const defaultTemplate = this.defaultTemplates[id];
        if (!defaultTemplate) return false;

        if (extension_settings[extensionName]?.templates?.[id]) {
            delete extension_settings[extensionName].templates[id];
            this.saveSettings(true); // Force immediate save for template reset
            CarrotDebug.ui(`Template '${defaultTemplate.name}' reset to default`);
        }
        return true;
    },

    updateTemplate(id, updatedTemplate) {
        // CRITICAL: Never overwrite extension_settings completely
        if (!extension_settings[extensionName]) {
            CarrotDebug.error('⚠️ TEMPLATES: extension_settings not initialized - this should not happen');
            extension_settings[extensionName] = {};
        }
        if (!extension_settings[extensionName].templates) {
            extension_settings[extensionName].templates = {};
        }

        updatedTemplate.id = id;
        updatedTemplate.metadata = updatedTemplate.metadata || {};
        updatedTemplate.metadata.modified = Date.now();
        updatedTemplate.metadata.usage_count = updatedTemplate.metadata.usage_count || 0;
        updatedTemplate.metadata.is_default = false;

        extension_settings[extensionName].templates[id] = updatedTemplate;
        this.saveSettings(true); // Force immediate save for template updates
        CarrotDebug.ui(`Template '${updatedTemplate.name}' updated successfully`);
        return true;
    },

    // Compatibility method for BunnyMoTags interface
    setTemplate(id, template) {
        
        // Convert BunnyMoTags template format to CarrotKernel format
        const convertedTemplate = {
            id: id,
            name: template.label || template.name || id,
            description: template.description || '',
            category: template.category || 'general',
            role: template.role || 'system',
            content: template.content || '',
            macros: template.macros || {},
            variables: template.variables || [],
            depth: template.depth !== undefined ? template.depth : 4,  // Handle 0 correctly - don't treat as falsy
            scan: template.scan !== false,
            settings: {
                inject_depth: template.depth !== undefined ? template.depth : 4,  // Handle 0 correctly - don't treat as falsy
                inject_position: 'depth',
                auto_activate: true,
                ephemeral: true
            },
            metadata: {
                created: template.metadata?.created || Date.now(),
                modified: Date.now(),
                usage_count: template.metadata?.usage_count || 0,
                is_default: template.isDefault || false
            }
        };
        
        
        return this.updateTemplate(id, convertedTemplate);
    },

    // Compatibility method for BunnyMoTags interface  
    saveUserTemplates() {
        this.saveSettings();
    },

    exportAllTemplates() {
        const templates = this.getTemplates();
        const userTemplates = {};
        
        // Only export non-default templates
        Object.entries(templates).forEach(([id, template]) => {
            if (!template.metadata?.is_default) {
                userTemplates[id] = template;
            }
        });

        return JSON.stringify({
            version: '2.0',
            extension: 'CarrotKernel',
            type: 'template_collection',
            templates: userTemplates,
            exported: Date.now()
        }, null, 2);
    },

    // Advanced macro processing system
    // FIXED: Now async to await macro processing
    async processTemplate(template, characterData) {
        let content = template.content;

        // Use the new real macro processing system
        // FIXED: Await async macro processing
        content = await this.processMacros(content);

        // Update usage statistics
        if (template.metadata) {
            template.metadata.usage_count = (template.metadata.usage_count || 0) + 1;
            if (!template.metadata.is_default) {
                this.saveTemplate(template);
            }
        }

        return content;
    },


    // Import/Export functionality
    exportTemplate(id) {
        const template = this.getTemplate(id);
        if (!template) return null;
        
        return JSON.stringify({
            version: '2.0',
            extension: 'CarrotKernel',
            type: 'template',
            template: template,
            exported: Date.now()
        }, null, 2);
    },

    importTemplate(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.extension !== 'CarrotKernel') {
                throw new Error('Invalid template format');
            }
            
            const template = data.template;
            template.id = `imported_${Date.now()}`;
            template.metadata = template.metadata || {};
            template.metadata.created = Date.now();
            template.metadata.modified = Date.now();
            template.metadata.is_default = false;
            
            this.saveTemplate(template);
            return template.id;
        } catch (error) {
            CarrotDebug.ui(`Template import failed: ${error.message}`);
            return null;
        }
    },

    saveSettings(immediate = false) {
        if (immediate) {
            // Force immediate save for critical operations like template saving.
            // writeExtensionField is for per-character data (it looks up
            // context.characters[characterId]) — 'CarrotKernel' is never a valid
            // character id, so it was always a silent no-op. Templates are global
            // extension settings; saveSettingsDebounced() is the real persistence.
            if (typeof saveSettingsDebounced === 'function') {
                saveSettingsDebounced();
            }
        } else {
            saveSettingsDebounced();
        }
    },

    // Helper function to get currently triggered/active characters
    getTriggeredCharacters() {
        const lastInjectedCharacters = getLastInjectedCharacters();
        if (!lastInjectedCharacters || lastInjectedCharacters.length === 0) {
            return [];
        }

        if (!findCharacterByName) {
            CarrotDebug.error('⚠️ findCharacterByName not initialized - call initializeSheetGenerator first');
            return [];
        }

        return lastInjectedCharacters.map(name => findCharacterByName(name))
            .filter(result => result && result.data)
            .map(result => ({ name: result.name, data: result.data }));
    },

    // Helper function to extract tags by category from triggered characters only
    getTagsByCategory(categoryKeywords) {
        const triggeredChars = this.getTriggeredCharacters();
        if (triggeredChars.length === 0) return 'No characters triggered in conversation';
        
        const categoryTags = new Set();
        for (const { name, data } of triggeredChars) {
            if (data.tags && data.tags.size > 0) {
                for (const [category, tags] of data.tags) {
                    // Check if this category matches our keywords
                    if (categoryKeywords.some(keyword => category.toLowerCase().includes(keyword.toLowerCase()))) {
                        const tagArray = Array.isArray(tags) ? tags : Array.from(tags);
                        tagArray.forEach(tag => categoryTags.add(`${name}: ${tag}`));
                    }
                }
            }
        }
        return categoryTags.size > 0 ? Array.from(categoryTags).join(', ') : `No ${categoryKeywords[0]} tags found in triggered characters`;
    },

    // Macro processors - exposed as property so macro display system can access them
    macroProcessors: {
            'CHARACTERS': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                if (triggeredChars.length === 0) return 'No characters triggered in conversation';
                
                let output = '';
                for (const { name, data } of triggeredChars) {
                    output += `**${name}** (from ${data.source})\n`;
                    if (data.tags && data.tags.size > 0) {
                        const tagList = Array.from(data.tags.entries())
                            .map(([category, tags]) => `${category}: ${Array.isArray(tags) ? tags.join(', ') : tags}`)
                            .join(' | ');
                        output += `${tagList}\n\n`;
                    }
                }
                return output;
            },

            // Individual character name macros
            'CHARACTER1': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length >= 1 ? triggeredChars[0].name : 'No character 1';
            },

            'CHARACTER2': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length >= 2 ? triggeredChars[1].name : 'No character 2';
            },
            
            'CHARACTER3': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length >= 3 ? triggeredChars[2].name : 'No character 3';
            },
            
            'CHARACTER4': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length >= 4 ? triggeredChars[3].name : 'No character 4';
            },
            
            'CHARACTER5': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length >= 5 ? triggeredChars[4].name : 'No character 5';
            },
            
            'PERSONALITY_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['personality', 'traits', 'behavior', 'mental', 'attitude', 'mind', 'dere', 'trait']);
            },
            
            'PHYSICAL_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['physical', 'appearance', 'body', 'species', 'gender', 'age', 'looks', 'build', 'skin', 'hair', 'style']);
            },
            
            'MBTI_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['entj', 'intj', 'enfp', 'infp', 'estp', 'istp', 'esfj', 'isfj', 'entp', 'intp', 'enfj', 'infj', 'estj', 'istj', 'esfp', 'isfp', 'mbti']);
            },
            
            'COMMUNICATION_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['ling', 'linguistics', 'speech', 'language', 'communication']);
            },
            
            'IDENTITY_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['name', 'genre', 'context', 'identity']);
            },
            
            'KINK_TAGS': () => {
                return CarrotTemplateManager.getTagsByCategory(['kinks', 'fetish', 'sexual', 'nsfw', 'adult', 'erotic', 'kink']);
            },
            
            'TRIGGERED_CHARACTER_TAGS': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                if (triggeredChars.length === 0) return 'No characters triggered in conversation';
                
                let output = '';
                for (const { name, data } of triggeredChars) {
                    output += `${name}: `;
                    if (data.tags && data.tags.size > 0) {
                        const allTags = [];
                        for (const [category, tags] of data.tags) {
                            const tagArray = Array.isArray(tags) ? tags : Array.from(tags);
                            allTags.push(...tagArray);
                        }
                        output += allTags.join(', ');
                    }
                    output += '\n';
                }
                return output;
            },
            
            'SELECTED_LOREBOOKS': () => {
                return selectedLorebooks.size > 0 ? Array.from(selectedLorebooks).join(', ') : 'None selected';
            },

            'CHARACTER_REPO_BOOKS': () => {
                return characterRepoBooks.size > 0 ? Array.from(characterRepoBooks).join(', ') : 'None configured';
            },

            'BUNNYMO_PACK_TAGS': async () => {
                // Extract tag prefixes and options from BunnyMo pack lorebooks
                const packsByPrefix = new Map(); // prefix -> { packName, options: [] }

                for (const lorebookName of selectedLorebooks) {
                    try {
                        const lorebookData = await loadWorldInfo(lorebookName);
                        if (!lorebookData || !lorebookData.entries) continue;

                        const packOptions = new Map(); // prefix -> Set of options

                        for (const [entryId, entry] of Object.entries(lorebookData.entries)) {
                            if (!entry.key || entry.key.length === 0) continue;

                            const rawTag = entry.key[0]; // e.g., "<DERE:TSUNDERE>"
                            const match = rawTag.match(/<([^:>]+):([^>]+)>/); // Extract prefix and value

                            if (match) {
                                const prefix = match[1].trim(); // "DERE"
                                const value = match[2].trim();  // "TSUNDERE"

                                if (!packOptions.has(prefix)) {
                                    packOptions.set(prefix, new Set());
                                }
                                packOptions.get(prefix).add(value);
                            } else {
                                // Handle tags without colons like <ISTJ-H>
                                const simpleMatch = rawTag.match(/<([^>]+)>/);
                                if (simpleMatch) {
                                    const tag = simpleMatch[1].trim();
                                    // Try to detect category from tag structure or entry comment
                                    const comment = (entry.comment || '').toLowerCase();

                                    let prefix = 'MISC';
                                    if (comment.includes('mbti') || tag.match(/^[IE][NS][TF][JP]/)) {
                                        prefix = 'MBTI';
                                    } else if (comment.includes('trait')) {
                                        prefix = 'TRAIT';
                                    } else if (comment.includes('species')) {
                                        prefix = 'SPECIES';
                                    }

                                    if (!packOptions.has(prefix)) {
                                        packOptions.set(prefix, new Set());
                                    }
                                    packOptions.get(prefix).add(tag);
                                }
                            }
                        }

                        // Store results with lorebook name
                        for (const [prefix, optionsSet] of packOptions) {
                            packsByPrefix.set(prefix, {
                                packName: lorebookName,
                                options: Array.from(optionsSet).sort()
                            });
                        }

                    } catch (error) {
                        CarrotDebug.error(`[CarrotKernel] Error loading lorebook ${lorebookName}:`, error);
                    }
                }

                if (packsByPrefix.size === 0) {
                    return 'No BunnyMo pack tags found in selected lorebooks';
                }

                // Format output: one pack per section
                let output = '## BUNNYMO PACK TAGS - CHOOSE FROM THESE NAMES ONLY\n\n';

                for (const [prefix, data] of packsByPrefix) {
                    output += `### ${prefix} Pack (from "${data.packName}"):\n`;
                    output += `**Pick ONE from these ${prefix} options:**\n`;
                    data.options.forEach(opt => {
                        output += `- ${opt}\n`;
                    });
                    output += '\n';
                }

                output += '**CRITICAL: Only use tags from the lists above. Do not invent new tags.**\n';

                return output;
            },

            // Helper function to extract pack-specific tags with configurable detail
            async getBunnyMoPackOptions(packPrefix, detailLevel = 'tags') {
                const packOptions = [];

                for (const lorebookName of selectedLorebooks) {
                    try {
                        const lorebookData = await loadWorldInfo(lorebookName);
                        if (!lorebookData || !lorebookData.entries) continue;

                        for (const [entryId, entry] of Object.entries(lorebookData.entries)) {
                            if (!entry.key || entry.key.length === 0) continue;

                            const rawTag = entry.key[0];
                            const match = rawTag.match(/<([^:>]+):([^>]+)>/);

                            if (match) {
                                const prefix = match[1].trim().toUpperCase();
                                const value = match[2].trim();

                                if (prefix === packPrefix.toUpperCase()) {
                                    if (detailLevel === 'tags') {
                                        packOptions.push(value);
                                    } else if (detailLevel === 'tags+content') {
                                        packOptions.push({
                                            tag: value,
                                            content: entry.content || ''
                                        });
                                    } else if (detailLevel === 'full') {
                                        packOptions.push({
                                            tag: value,
                                            content: entry.content || '',
                                            comment: entry.comment || '',
                                            keys: entry.key || []
                                        });
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        CarrotDebug.error(`[CarrotKernel] Error loading lorebook ${lorebookName}:`, error);
                    }
                }

                return packOptions;
            },

            // Individual pack macros - DERE
            'DERE_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('DERE', 'tags');
                if (options.length === 0) return 'No DERE options found in selected lorebooks';
                return `**DERE Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'DERE_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('DERE', 'tags+content');
                if (options.length === 0) return 'No DERE options found in selected lorebooks';
                let output = '**DERE Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            // MBTI Pack
            'MBTI_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('MBTI', 'tags');
                if (options.length === 0) return 'No MBTI options found in selected lorebooks';
                return `**MBTI Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'MBTI_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('MBTI', 'tags+content');
                if (options.length === 0) return 'No MBTI options found in selected lorebooks';
                let output = '**MBTI Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            // TRAIT Pack
            'TRAIT_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('TRAIT', 'tags');
                if (options.length === 0) return 'No TRAIT options found in selected lorebooks';
                return `**TRAIT Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'TRAIT_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('TRAIT', 'tags+content');
                if (options.length === 0) return 'No TRAIT options found in selected lorebooks';
                let output = '**TRAIT Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            // LINGUISTICS Pack
            'LINGUISTICS_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('LINGUISTICS', 'tags');
                if (options.length === 0) return 'No LINGUISTICS options found in selected lorebooks';
                return `**LINGUISTICS Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'LINGUISTICS_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('LINGUISTICS', 'tags+content');
                if (options.length === 0) return 'No LINGUISTICS options found in selected lorebooks';
                let output = '**LINGUISTICS Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            // SPECIES Pack
            'SPECIES_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('SPECIES', 'tags');
                if (options.length === 0) return 'No SPECIES options found in selected lorebooks';
                return `**SPECIES Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'SPECIES_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('SPECIES', 'tags+content');
                if (options.length === 0) return 'No SPECIES options found in selected lorebooks';
                let output = '**SPECIES Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            // GENRE Pack
            'GENRE_OPTIONS': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('GENRE', 'tags');
                if (options.length === 0) return 'No GENRE options found in selected lorebooks';
                return `**GENRE Pack Options:**\n${options.map(tag => `- ${tag}`).join('\n')}`;
            },

            'GENRE_OPTIONS_DETAILED': async () => {
                const options = await CarrotTemplateManager.macroProcessors.getBunnyMoPackOptions('GENRE', 'tags+content');
                if (options.length === 0) return 'No GENRE options found in selected lorebooks';
                let output = '**GENRE Pack Options (with descriptions):**\n\n';
                options.forEach(opt => {
                    output += `**${opt.tag}:**\n${opt.content}\n\n`;
                });
                return output;
            },

            'CHARACTER_COUNT': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length.toString();
            },
            
            'CHARACTER_LIST': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length > 0 ? triggeredChars.map(c => c.name).join(', ') : 'No characters triggered';
            },
            
            'CHARACTERS_WITH_TYPES': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                if (triggeredChars.length === 0) return 'No characters triggered';
                
                return triggeredChars.map(({ name, data }) => {
                    // Extract species/type tags from character data
                    let type = 'character';
                    if (data.tags && data.tags.size > 0) {
                        for (const [category, tags] of data.tags) {
                            const tagArray = Array.isArray(tags) ? tags : Array.from(tags);
                            // Look for species/type indicators
                            const speciesTag = tagArray.find(tag => 
                                tag.includes('anthro') || tag.includes('human') || tag.includes('elf') || 
                                tag.includes('wolf') || tag.includes('cat') || tag.includes('dragon') ||
                                tag.includes('vampire') || tag.includes('demon') || tag.includes('angel') ||
                                tag.includes('species') || tag.includes('race')
                            );
                            if (speciesTag) {
                                type = speciesTag;
                                break;
                            }
                        }
                    }
                    return `${name} (${type})`;
                }).join(', ');
            },
            
            'ALL_TAG_CATEGORIES': () => {
                const allCategories = new Set();
                scannedCharacters.forEach(charData => {
                    if (charData.tags && charData.tags.size > 0) {
                        for (const [category] of charData.tags) {
                            allCategories.add(category);
                        }
                    }
                });
                return allCategories.size > 0 ? Array.from(allCategories).join(', ') : 'No categories found';
            },
            
            'CHARACTER_SOURCES': () => {
                const sourceMap = new Map();
                scannedCharacters.forEach((charData, charName) => {
                    const source = charData.source || 'Unknown';
                    if (!sourceMap.has(source)) {
                        sourceMap.set(source, []);
                    }
                    sourceMap.get(source).push(charName);
                });
                
                let output = '';
                for (const [source, characters] of sourceMap) {
                    output += `**${source}**: ${characters.join(', ')}\n`;
                }
                return output || 'No character sources found';
            },
            
            'TAG_STATISTICS': () => {
                const categoryStats = new Map();
                let totalTags = 0;
                
                scannedCharacters.forEach(charData => {
                    if (charData.tags && charData.tags.size > 0) {
                        for (const [category, tags] of charData.tags) {
                            const tagArray = Array.isArray(tags) ? tags : Array.from(tags);
                            const count = tagArray.length;
                            totalTags += count;
                            
                            if (!categoryStats.has(category)) {
                                categoryStats.set(category, { count: 0, characters: 0 });
                            }
                            categoryStats.get(category).count += count;
                            categoryStats.get(category).characters += 1;
                        }
                    }
                });
                
                if (categoryStats.size === 0) return 'No tag statistics available';
                
                const sortedStats = Array.from(categoryStats.entries())
                    .sort((a, b) => b[1].count - a[1].count);
                
                let output = `**Tag Statistics** (${totalTags} total tags across ${scannedCharacters.size} characters)\n`;
                output += `Most common categories:\n`;
                sortedStats.slice(0, 5).forEach(([category, stats]) => {
                    output += `• ${category}: ${stats.count} tags (${stats.characters} characters)\n`;
                });
                
                return output;
            },
            
            'CROSS_CHARACTER_ANALYSIS': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                if (triggeredChars.length < 2) return 'Need at least 2 characters for cross-analysis';
                
                const commonTags = new Set();
                const allCharTags = triggeredChars.map(char => {
                    const tags = new Set();
                    if (char.data.tags) {
                        for (const [category, tagList] of char.data.tags) {
                            const tagArray = Array.isArray(tagList) ? tagList : Array.from(tagList);
                            tagArray.forEach(tag => tags.add(tag));
                        }
                    }
                    return { name: char.name, tags };
                });
                
                // Find common tags across ALL characters
                if (allCharTags.length > 0) {
                    const firstCharTags = allCharTags[0].tags;
                    for (const tag of firstCharTags) {
                        if (allCharTags.every(char => char.tags.has(tag))) {
                            commonTags.add(tag);
                        }
                    }
                }
                
                let output = `**Character Relationship Analysis**\n`;
                if (commonTags.size > 0) {
                    output += `Shared traits: ${Array.from(commonTags).join(', ')}\n`;
                } else {
                    output += `No shared traits found between all characters\n`;
                }
                
                // Find unique traits per character
                output += `\nUnique traits:\n`;
                allCharTags.forEach(({ name, tags }) => {
                    const uniqueTags = new Set(tags);
                    allCharTags.forEach(other => {
                        if (other.name !== name) {
                            other.tags.forEach(tag => uniqueTags.delete(tag));
                        }
                    });
                    if (uniqueTags.size > 0) {
                        output += `• ${name}: ${Array.from(uniqueTags).slice(0, 3).join(', ')}\n`;
                    }
                });
                
                return output;
            },
            
            'REPOSITORY_METADATA': () => {
                const stats = {
                    selectedLorebooks: selectedLorebooks.size,
                    characterRepos: characterRepoBooks.size,
                    totalCharacters: scannedCharacters.size,
                    triggeredCharacters: CarrotTemplateManager.getTriggeredCharacters().length,
                    totalCategories: new Set()
                };
                
                // Count unique categories
                scannedCharacters.forEach(charData => {
                    if (charData.tags) {
                        for (const [category] of charData.tags) {
                            stats.totalCategories.add(category);
                        }
                    }
                });
                stats.totalCategories = stats.totalCategories.size;
                
                // Calculate data quality metrics
                let taggedCharacters = 0;
                scannedCharacters.forEach(charData => {
                    if (charData.tags && charData.tags.size > 0) taggedCharacters++;
                });
                const dataQuality = scannedCharacters.size > 0 ? Math.round((taggedCharacters / scannedCharacters.size) * 100) : 0;
                
                return `**CarrotKernel System Status**
📊 **System Overview:**
• Active lorebooks: ${stats.selectedLorebooks}
• Character repositories: ${stats.characterRepos}
• Total characters indexed: ${stats.totalCharacters}
• Currently triggered: ${stats.triggeredCharacters}
• Tag categories available: ${stats.totalCategories}

📈 **Data Quality:**
• Character coverage: ${dataQuality}% (${taggedCharacters}/${stats.totalCharacters} characters have tags)
• System health: ${stats.totalCharacters > 0 && stats.totalCategories > 0 ? 'Operational' : 'Needs attention'}

🔧 **Quick Actions:**
${stats.totalCharacters === 0 ? '⚠️ No characters found - scan lorebooks first' : '✅ System ready for template processing'}`;
            },
            
            // Sheet format macros - usable in templates
            'FULLSHEET_FORMAT': (charName) => {
                if (!charName && CarrotTemplateManager.getTriggeredCharacters().length > 0) {
                    charName = CarrotTemplateManager.getTriggeredCharacters()[0].name;
                }
                if (!charName) return 'No character specified for fullsheet format';
                
                const charResult = findCharacterByName(charName);
                if (!charResult || !charResult.data) return `Character ${charName} not found`;
                
                const charData = charResult.data;
                const actualCharName = charResult.name;
                
                return generateFullSheet(charName, charData);
            },
            
            'TAGSHEET_FORMAT': (charName) => {
                if (!charName && CarrotTemplateManager.getTriggeredCharacters().length > 0) {
                    charName = CarrotTemplateManager.getTriggeredCharacters()[0].name;
                }
                if (!charName) return 'No character specified for tagsheet format';
                
                const charResult = findCharacterByName(charName);
                if (!charResult || !charResult.data) return `Character ${charName} not found`;
                
                const charData = charResult.data;
                const actualCharName = charResult.name;
                
                return generateTagSheet(charName, charData);
            },
            
            'QUICKSHEET_FORMAT': (charName) => {
                if (!charName && CarrotTemplateManager.getTriggeredCharacters().length > 0) {
                    charName = CarrotTemplateManager.getTriggeredCharacters()[0].name;
                }
                if (!charName) return 'No character specified for quicksheet format';
                
                const charResult = findCharacterByName(charName);
                if (!charResult || !charResult.data) return `Character ${charName} not found`;
                
                const charData = charResult.data;
                const actualCharName = charResult.name;
                
                return generateQuickSheet(charName, charData);
            },
            
            'CHARACTER_NAME': () => {
                const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
                return triggeredChars.length > 0 ? triggeredChars[0].name : 'Unknown Character';
            }
    },

    // Macro processing system - connects template variables to real CarrotKernel data
    // FIXED: Now async to properly await async macro processors
    async processMacros(templateContent) {
        if (!templateContent) return '';

        let processedContent = templateContent;

        // Replace each macro with processed data
        // CRITICAL: Await all processors since some are async
        for (const [macro, processor] of Object.entries(this.macroProcessors)) {
            // getBunnyMoPackOptions is a helper method used by the *_OPTIONS
            // processors above (called with pack-prefix/detail-level args), not a
            // standalone template macro — skip it here so it isn't surfaced as a
            // bogus {{getBunnyMoPackOptions}} macro card.
            if (macro === 'getBunnyMoPackOptions') continue;
            const placeholder = `{{${macro}}}`;
            if (processedContent.includes(placeholder)) {
                const replacement = await processor();  // ✅ FIXED: Await processor
                processedContent = processedContent.replace(new RegExp(placeholder, 'g'), replacement);
            }
        }

        return processedContent;
    }
};

// Expose CarrotTemplateManager globally so bunnymo_class.js can access it
window.CarrotTemplateManager = CarrotTemplateManager;

// Export for module use
export {
    generateFullSheet,
    generateTagSheet,
    generateQuickSheet,
    CarrotTemplateManager
};
