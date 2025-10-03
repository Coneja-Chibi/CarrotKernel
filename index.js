import { eventSource, event_types, chat, saveSettingsDebounced, chat_metadata, addOneMessage } from '../../../../script.js';
import { extension_settings, getContext, writeExtensionField, saveMetadataDebounced } from '../../../extensions.js';
import { loadWorldInfo, world_names, createNewWorldInfo, createWorldInfoEntry, saveWorldInfo, updateWorldInfoList, selected_world_info, world_info, METADATA_KEY } from '../../../world-info.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { getMessageTimeStamp } from '../../../RossAscends-mods.js';
import { CarrotWorldBookTracker } from './worldbook-tracker.js';

const extensionName = 'CarrotKernel';

// EXACT COPY of qvink_memory button system
const baby_bunny_button_class = `${extensionName}_baby_bunny_button`;

// Make button class globally accessible for debugging
window.baby_bunny_button_class = baby_bunny_button_class;

// Make functions globally accessible for debugging
window.initialize_baby_bunny_message_button = function() {
    return initialize_baby_bunny_message_button();
};
window.add_baby_bunny_button_to_message = function(messageId) {
    return add_baby_bunny_button_to_message(messageId);
};
window.add_baby_bunny_buttons_to_all_existing_messages = function() {
    return add_baby_bunny_buttons_to_all_existing_messages();
};

// =============================================================================
// CARROT SHEET COMMAND SYSTEM 🥕
// Handles !fullsheet, !tagsheet, !quicksheet commands for character sheet injection
// =============================================================================

// Sheet command detection and processing
let pendingSheetCommand = null; // Store current sheet command if detected

// Check if user message contains sheet commands
function detectSheetCommand(messageText) {
    if (!messageText || typeof messageText !== 'string') return null;
    
    const sheetCommands = [
        { command: '!fullsheet', type: 'fullsheet' },
        { command: '!tagsheet', type: 'tagsheet' }, 
        { command: '!quicksheet', type: 'quicksheet' }
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
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🥕 SHEET COMMAND DEBUG: processSheetCommand called with:', sheetData);
    }

    const { type, entry } = sheetData;

    if (extension_settings[extensionName]?.debugMode) {
        console.log('🥕 SHEET COMMAND DEBUG: Processing sheet command type:', type);
    }

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
        'quicksheet': 'QUICKSHEET'
    };
    
    // Get the appropriate injection template
    const templateCategoryMap = {
        'fullsheet': 'BunnyMo Fullsheet Injection',
        'tagsheet': 'BunnyMo Tagsheet Injection', 
        'quicksheet': 'BunnyMo Quicksheet Injection'
    };
    
    const injectionTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory(templateCategoryMap[type]);
    
    let injectionText;
    let depth = 4; // Default depth
    let role = 'system'; // Default role
    
    if (injectionTemplate) {
        // Use custom template - no character name needed since ST handles the targeting
        injectionText = injectionTemplate.content;
        
        // Use template-specific depth and role settings
        depth = injectionTemplate.settings?.inject_depth || injectionTemplate.depth || 4;
        role = injectionTemplate.role || 'system';
        
        console.log('🥕 SHEET COMMAND DEBUG: Using template settings:', {
            templateName: injectionTemplate.name,
            depth: depth,
            role: role
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
        
        console.log('🥕 SHEET COMMAND DEBUG: Using fallback settings:', {
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

// Generate full character sheet
function generateFullSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Fullsheet Format');
    
    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };
        
        return CarrotTemplateManager.processTemplate(currentTemplate.content, templateData);
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
function generateTagSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Tagsheet Format');
    
    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };
        
        return CarrotTemplateManager.processTemplate(currentTemplate.content, templateData);
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
function generateQuickSheet(characterName, charData) {
    const currentTemplate = CarrotTemplateManager.getPrimaryTemplateForCategory('BunnyMo Quicksheet Format');
    
    if (currentTemplate) {
        // Use template system
        const templateData = {
            name: characterName,
            tags: charData.tags
        };
        
        return CarrotTemplateManager.processTemplate(currentTemplate.content, templateData);
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
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = {};
        }
        extension_settings[extensionName].primaryTemplate = id;
        this.saveSettings();
        CarrotDebug.ui(`Primary template set to: ${id}`);
    },

    // Template operations
    saveTemplate(template) {
        if (!extension_settings[extensionName]) {
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
        if (!extension_settings[extensionName]) {
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
    processTemplate(template, characterData) {
        let content = template.content;
        
        // Use the new real macro processing system
        content = this.processMacros(content);

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
            // Force immediate save for critical operations like template saving
            // First ensure the entire extension settings object is saved
            if (typeof saveSettingsDebounced === 'function') {
                saveSettingsDebounced();
            }
            // Also try to force immediate write
            if (typeof writeExtensionField === 'function') {
                writeExtensionField(extensionName, 'templates', extension_settings[extensionName]?.templates || {});
            }
        } else {
            saveSettingsDebounced();
        }
    },

    // Helper function to get currently triggered/active characters
    getTriggeredCharacters() {
        if (!lastInjectedCharacters || lastInjectedCharacters.length === 0) {
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
                const triggeredChars = CarrotTemplateManager.CarrotTemplateManager.getTriggeredCharacters();
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
                const triggeredChars = CarrotTemplateManager.CarrotTemplateManager.getTriggeredCharacters();
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
    processMacros(templateContent) {
        if (!templateContent) return '';
        
        let processedContent = templateContent;
        
        // Replace each macro with processed data
        for (const [macro, processor] of Object.entries(this.macroProcessors)) {
            const placeholder = `{{${macro}}}`;
            if (processedContent.includes(placeholder)) {
                const replacement = processor();
                processedContent = processedContent.replace(new RegExp(placeholder, 'g'), replacement);
            }
        }
        
        return processedContent;
    }
};

// Expose CarrotTemplateManager globally so bunnymo_class.js can access it
window.CarrotTemplateManager = CarrotTemplateManager;

// =============================================================================
// CARROT PACK MANAGER SYSTEM 🥕  
// Auto-sync BunnyMo packs from GitHub repository
// =============================================================================

// GitHub repository browser class with update detection
class CarrotGitHubBrowser {
    constructor() {
        this.githubRepo = 'Coneja-Chibi/BunnyMo';
        this.githubBranch = 'BunnyMo';
        this.currentPath = '/';
        this.currentItems = [];
        this.pathCache = new Map();
        this.installedPacks = this.loadInstalledPacks();
        this.updateCache = new Map();

        // Rate limit management
        this.requestQueue = [];
        this.processingQueue = false;
        this.rateLimitInfo = {
            limit: 60,
            remaining: 60,
            resetTime: Date.now() + 3600000,
            lastUpdated: Date.now()
        };
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffFactor: 2
        };
    }
    
    // Load installed pack tracking from extension settings
    loadInstalledPacks() {
        const settings = extension_settings[extensionName];
        return settings.installedBunnyMoPacks || {};
    }
    
    // Save installed pack tracking to extension settings
    saveInstalledPacks() {
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = {};
        }
        extension_settings[extensionName].installedBunnyMoPacks = this.installedPacks;
        saveSettingsDebounced();
    }

    // Rate-limit aware GitHub API fetch with retry logic
    async fetchWithRateLimit(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, options, resolve, reject });
            this.processQueue();
        });
    }

    // Process the request queue with rate limit awareness
    async processQueue() {
        if (this.processingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();

            try {
                await this.checkRateLimit();
                const response = await this.makeRequestWithRetry(request.url, request.options);
                this.updateRateLimitInfo(response);
                request.resolve(response);
                await this.delay(100);
            } catch (error) {
                request.reject(error);
            }
        }

        this.processingQueue = false;
    }

    // Check rate limit and wait if necessary
    async checkRateLimit() {
        const now = Date.now();
        if (now - this.rateLimitInfo.lastUpdated > 60000) {
            this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
        }

        if (this.rateLimitInfo.remaining <= 5) {
            const waitTime = Math.max(0, this.rateLimitInfo.resetTime - now);
            if (waitTime > 0) {
                CarrotDebug.repo(`⏳ GitHub Browser rate limit approaching, waiting ${Math.ceil(waitTime/1000)}s...`);
                await this.delay(waitTime);
                this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
            }
        }
    }

    // Make request with exponential backoff retry
    async makeRequestWithRetry(url, options = {}, retryCount = 0) {
        try {
            const response = await fetch(url, options);

            if (response.status === 403) {
                const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
                const rateLimitReset = response.headers.get('x-ratelimit-reset');

                if (rateLimitRemaining === '0' && retryCount < this.retryConfig.maxRetries) {
                    const resetTime = parseInt(rateLimitReset) * 1000;
                    const waitTime = Math.max(0, resetTime - Date.now()) + 1000;

                    CarrotDebug.repo(`⏳ GitHub Browser rate limit hit, waiting ${Math.ceil(waitTime/1000)}s for reset...`);
                    await this.delay(waitTime);

                    return this.makeRequestWithRetry(url, options, retryCount + 1);
                }
            }

            if (!response.ok && this.isRetryableError(response.status) && retryCount < this.retryConfig.maxRetries) {
                const delay = Math.min(
                    this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
                    this.retryConfig.maxDelay
                );

                CarrotDebug.repo(`⚠️ GitHub Browser request failed (${response.status}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
                await this.delay(delay);

                return this.makeRequestWithRetry(url, options, retryCount + 1);
            }

            return response;

        } catch (error) {
            if (this.isRetryableNetworkError(error) && retryCount < this.retryConfig.maxRetries) {
                const delay = Math.min(
                    this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
                    this.retryConfig.maxDelay
                );

                CarrotDebug.repo(`⚠️ GitHub Browser network error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
                await this.delay(delay);

                return this.makeRequestWithRetry(url, options, retryCount + 1);
            }

            throw error;
        }
    }

    // Update rate limit info from response headers
    updateRateLimitInfo(response) {
        const limit = response.headers.get('x-ratelimit-limit');
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');

        if (limit) this.rateLimitInfo.limit = parseInt(limit);
        if (remaining) this.rateLimitInfo.remaining = parseInt(remaining);
        if (reset) this.rateLimitInfo.resetTime = parseInt(reset) * 1000;
        this.rateLimitInfo.lastUpdated = Date.now();

        CarrotDebug.repo(`📊 GitHub Browser rate limit: ${this.rateLimitInfo.remaining}/${this.rateLimitInfo.limit} remaining`);
    }

    // Check if error status is retryable
    isRetryableError(status) {
        return [429, 502, 503, 504].includes(status);
    }

    // Check if network error is retryable
    isRetryableNetworkError(error) {
        return error.name === 'TypeError' ||
               error.message.includes('fetch') ||
               error.message.includes('network') ||
               error.message.includes('timeout');
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Track a pack installation with its SHA hash
    trackPackInstallation(filename, sha, size) {
        this.installedPacks[filename] = {
            sha: sha,
            size: size,
            installedDate: Date.now(),
            lastChecked: Date.now()
        };
        this.saveInstalledPacks();
    }
    
    // Check if a file has updates available (different SHA)
    hasUpdates(filename, currentSha) {
        const installed = this.installedPacks[filename];
        if (!installed) return false; // Not installed, so no update needed
        return installed.sha !== currentSha; // Different SHA = update available
    }
    
    // Check if folder contains any files with updates
    async folderHasUpdates(folderPath) {
        try {
            if (this.updateCache.has(folderPath)) {
                return this.updateCache.get(folderPath);
            }
            
            // Get all JSON files in this folder (recursively)
            const folderFiles = await this.getAllJsonFilesInFolder(folderPath);
            
            for (const file of folderFiles) {
                if (this.hasUpdates(file.name, file.sha)) {
                    this.updateCache.set(folderPath, true);
                    return true;
                }
            }
            
            this.updateCache.set(folderPath, false);
            return false;
        } catch (error) {
            CarrotDebug.error('Error checking folder updates:', error);
            return false;
        }
    }
    
    // Get all JSON files in a folder (for update checking)
    async getAllJsonFilesInFolder(folderPath) {
        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents${folderPath ? '/' + encodeURIComponent(folderPath) : ''}`;
            const response = await this.fetchWithRateLimit(apiUrl);
            
            if (!response.ok) return [];
            
            const data = await response.json();
            let jsonFiles = [];
            
            for (const item of data) {
                if (item.type === 'file' && item.name.endsWith('.json')) {
                    jsonFiles.push(item);
                } else if (item.type === 'dir') {
                    // Recursively check subdirectories
                    const subFiles = await this.getAllJsonFilesInFolder(item.path);
                    jsonFiles = jsonFiles.concat(subFiles);
                }
            }
            
            return jsonFiles;
        } catch (error) {
            CarrotDebug.error('Error getting JSON files:', error);
            return [];
        }
    }
    
    // Load repository structure
    async loadRepository() {
        CarrotDebug.repo('🔍 Loading BunnyMo repository structure...');
        
        try {
            // Load root directory
            await this.navigateToPath('/');
            
            CarrotDebug.repo('✅ Repository structure loaded successfully');
        } catch (error) {
            CarrotDebug.error('❌ Failed to load repository:', error);
            throw error;
        }
    }
    
    // Navigate to specific path in repository
    async navigateToPath(path) {
        // Normalize path
        path = path === '/' ? '' : path.replace(/^\/+|\/+$/g, '');
        this.currentPath = path ? '/' + path : '/';
        
        // Check cache first
        if (this.pathCache.has(path)) {
            this.currentItems = this.pathCache.get(path);
            CarrotDebug.repo(`📂 Loaded ${this.currentItems.length} items from cache for: ${this.currentPath}`);
            return;
        }
        
        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents${path ? '/' + encodeURIComponent(path) : ''}`;
            CarrotDebug.repo(`🌐 Fetching: ${apiUrl}`);

            const response = await this.fetchWithRateLimit(apiUrl);
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error(`GitHub API rate limit exceeded. Please wait and try again later.`);
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Process items
            this.currentItems = Array.isArray(data) ? data.map(item => ({
                name: item.name,
                path: item.path,
                type: item.type,
                size: item.size,
                download_url: item.download_url,
                sha: item.sha
            })) : [];
            
            // Cache the results
            this.pathCache.set(path, this.currentItems);
            
            CarrotDebug.repo(`📂 Loaded ${this.currentItems.length} items for: ${this.currentPath}`);
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to navigate to path:', error);
            throw error;
        }
    }
    
    // Get download URL for a file
    async getDownloadUrl(path) {
        const item = this.currentItems.find(item => item.path === path);
        if (item && item.download_url) {
            return item.download_url;
        }
        
        // Fallback: make API call to get download URL
        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(path)}`;
            const response = await this.fetchWithRateLimit(apiUrl);
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.download_url;
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to get download URL:', error);
            throw error;
        }
    }
    
    // Clear cache (for refresh)
    clearCache() {
        this.pathCache.clear();
    }
}

// Legacy pack manager class (keeping for backwards compatibility)
class CarrotPackManager {
    constructor() {
        this.githubRepo = 'Coneja-Chibi/BunnyMo';
        this.githubBranch = 'BunnyMo';
        this.packsFolder = 'BunnMo Packs';
        this.localPacks = new Map();
        this.availablePacks = new Map();
        this.mainPackInfo = null;
        this.expansionPacks = new Map();

        // Rate limit management
        this.requestQueue = [];
        this.processingQueue = false;
        this.rateLimitInfo = {
            limit: 60, // Default GitHub API limit
            remaining: 60,
            resetTime: Date.now() + 3600000, // 1 hour from now
            lastUpdated: Date.now()
        };
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // 1 second
            maxDelay: 30000, // 30 seconds
            backoffFactor: 2
        };
    }

    // Rate-limit aware GitHub API fetch with retry logic
    async fetchWithRateLimit(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, options, resolve, reject });
            this.processQueue();
        });
    }

    // Process the request queue with rate limit awareness
    async processQueue() {
        if (this.processingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();

            try {
                // Check rate limit before making request
                await this.checkRateLimit();

                const response = await this.makeRequestWithRetry(request.url, request.options);
                this.updateRateLimitInfo(response);
                request.resolve(response);

                // Small delay between requests to be respectful
                await this.delay(100);

            } catch (error) {
                request.reject(error);
            }
        }

        this.processingQueue = false;
    }

    // Check rate limit and wait if necessary
    async checkRateLimit() {
        const now = Date.now();

        // If rate limit info is stale, refresh it
        if (now - this.rateLimitInfo.lastUpdated > 60000) { // 1 minute
            this.rateLimitInfo.remaining = this.rateLimitInfo.limit; // Assume reset
        }

        // If we're close to the limit, wait
        if (this.rateLimitInfo.remaining <= 5) {
            const waitTime = Math.max(0, this.rateLimitInfo.resetTime - now);
            if (waitTime > 0) {
                CarrotDebug.repo(`⏳ Rate limit approaching, waiting ${Math.ceil(waitTime/1000)}s...`);
                await this.delay(waitTime);
                this.rateLimitInfo.remaining = this.rateLimitInfo.limit; // Reset after waiting
            }
        }
    }

    // Make request with exponential backoff retry
    async makeRequestWithRetry(url, options = {}, retryCount = 0) {
        try {
            const response = await fetch(url, options);

            // Handle rate limit specifically
            if (response.status === 403) {
                const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
                const rateLimitReset = response.headers.get('x-ratelimit-reset');

                if (rateLimitRemaining === '0' && retryCount < this.retryConfig.maxRetries) {
                    const resetTime = parseInt(rateLimitReset) * 1000;
                    const waitTime = Math.max(0, resetTime - Date.now()) + 1000; // Add 1s buffer

                    CarrotDebug.repo(`⏳ Rate limit hit, waiting ${Math.ceil(waitTime/1000)}s for reset...`);
                    await this.delay(waitTime);

                    return this.makeRequestWithRetry(url, options, retryCount + 1);
                }
            }

            // Handle other temporary errors with exponential backoff
            if (!response.ok && this.isRetryableError(response.status) && retryCount < this.retryConfig.maxRetries) {
                const delay = Math.min(
                    this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
                    this.retryConfig.maxDelay
                );

                CarrotDebug.repo(`⚠️ Request failed (${response.status}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
                await this.delay(delay);

                return this.makeRequestWithRetry(url, options, retryCount + 1);
            }

            return response;

        } catch (error) {
            // Handle network errors with retry
            if (this.isRetryableNetworkError(error) && retryCount < this.retryConfig.maxRetries) {
                const delay = Math.min(
                    this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
                    this.retryConfig.maxDelay
                );

                CarrotDebug.repo(`⚠️ Network error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
                await this.delay(delay);

                return this.makeRequestWithRetry(url, options, retryCount + 1);
            }

            throw error;
        }
    }

    // Update rate limit info from response headers
    updateRateLimitInfo(response) {
        const limit = response.headers.get('x-ratelimit-limit');
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');

        if (limit) this.rateLimitInfo.limit = parseInt(limit);
        if (remaining) this.rateLimitInfo.remaining = parseInt(remaining);
        if (reset) this.rateLimitInfo.resetTime = parseInt(reset) * 1000;
        this.rateLimitInfo.lastUpdated = Date.now();

        CarrotDebug.repo(`📊 Rate limit: ${this.rateLimitInfo.remaining}/${this.rateLimitInfo.limit} remaining`);
    }

    // Check if error status is retryable
    isRetryableError(status) {
        return [429, 502, 503, 504].includes(status);
    }

    // Check if network error is retryable
    isRetryableNetworkError(error) {
        return error.name === 'TypeError' ||
               error.message.includes('fetch') ||
               error.message.includes('network') ||
               error.message.includes('timeout');
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Test rate limiting system (for debugging)
    async testRateLimiting() {
        console.log('🧪 Testing rate limiting system...');

        const testUrl = `https://api.github.com/repos/${this.githubRepo}/contents`;
        const startTime = Date.now();

        try {
            console.log('📊 Current rate limit info:', this.rateLimitInfo);
            console.log('🔄 Making test request with rate limiting...');

            const response = await this.fetchWithRateLimit(testUrl);
            const endTime = Date.now();

            console.log('✅ Rate-limited request completed:', {
                status: response.status,
                ok: response.ok,
                duration: `${endTime - startTime}ms`,
                rateLimit: {
                    limit: response.headers.get('x-ratelimit-limit'),
                    remaining: response.headers.get('x-ratelimit-remaining'),
                    reset: response.headers.get('x-ratelimit-reset')
                }
            });

            return {
                success: true,
                status: response.status,
                duration: endTime - startTime,
                rateLimitRemaining: response.headers.get('x-ratelimit-remaining')
            };

        } catch (error) {
            console.error('❌ Rate limiting test failed:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Scan for all pack types: main pack, expansion packs, and variants
    async scanAllPacks() {
        try {
            CarrotDebug.repo('🔍 Scanning all BunnyMo content from GitHub...');
            
            // Scan main pack
            await this.scanMainPack();
            
            // Scan theme packs
            await this.scanThemePacks();
            
            // Scan expansion packs
            await this.scanExpansionPacks();
            
            const totalPacks = 1 + this.availablePacks.size + this.expansionPacks.size;
            CarrotDebug.repo(`✅ Found ${totalPacks} total packs (1 main, ${this.availablePacks.size} themes, ${this.expansionPacks.size} expansions)`);
            
            return this.getPackSummary();
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to scan packs:', error);
            return null;
        }
    }

    // Scan the main BunnyMo pack
    async scanMainPack() {
        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents`;
            const response = await this.fetchWithRateLimit(apiUrl);
            
            if (!response.ok) {
                if (response.status === 403) {
                    CarrotDebug.error('GitHub API rate limit exceeded for main pack scan');
                    return;
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const contents = await response.json();
            
            // Check if contents is an array (successful response)
            if (!Array.isArray(contents)) {
                CarrotDebug.error('Invalid response format for main pack scan', contents);
                return;
            }
            
            // Find the main pack JSON file
            const mainFile = contents.find(file => 
                file.name.includes('BUNNYMO') && file.name.endsWith('.json')
            );
            
            if (mainFile) {
                this.mainPackInfo = {
                    name: 'main',
                    displayName: 'Main BunnyMo Pack',
                    filename: mainFile.name,
                    size: mainFile.size,
                    downloadUrl: mainFile.download_url,
                    version: mainFile.sha,
                    type: 'main'
                };
            }
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to scan main pack:', error);
        }
    }

    // Scan theme packs (existing functionality)
    async scanThemePacks() {
        return this.scanRemotePacks(); // Use existing method
    }

    // Scan expansion packs from each theme pack
    async scanExpansionPacks() {
        try {
            this.expansionPacks.clear();
            
            for (const [themeName, themeInfo] of this.availablePacks) {
                const expansionsUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(this.packsFolder)}/${encodeURIComponent(themeName)}/Expansion%20Packs%20(Seperated)`;
                
                try {
                    const response = await this.fetchWithRateLimit(expansionsUrl);
                    if (response.ok) {
                        const expansions = await response.json();
                        const jsonExpansions = expansions.filter(item => item.name.endsWith('.json'));
                        
                        for (const expansion of jsonExpansions) {
                            const expansionId = `${themeName}/${expansion.name}`;
                            this.expansionPacks.set(expansionId, {
                                name: expansionId,
                                displayName: expansion.name.replace('.json', ''),
                                parentTheme: themeName,
                                filename: expansion.name,
                                size: expansion.size,
                                downloadUrl: expansion.download_url,
                                version: expansion.sha,
                                type: 'expansion'
                            });
                        }
                    }
                } catch (expansionError) {
                    // Skip themes without expansion packs
                    continue;
                }
            }
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to scan expansion packs:', error);
        }
    }

    // Get pack summary for status card
    getPackSummary() {
        const installedMain = this.localPacks.has('main');
        const installedThemes = Array.from(this.availablePacks.keys()).filter(key => this.localPacks.has(key)).length;
        const installedExpansions = Array.from(this.expansionPacks.keys()).filter(key => this.localPacks.has(key)).length;
        
        const totalAvailable = 1 + this.availablePacks.size + this.expansionPacks.size;
        const totalInstalled = (installedMain ? 1 : 0) + installedThemes + installedExpansions;
        
        return {
            mainPack: this.mainPackInfo,
            mainInstalled: installedMain,
            themePacks: this.availablePacks.size,
            themesInstalled: installedThemes,
            expansionPacks: this.expansionPacks.size,
            expansionsInstalled: installedExpansions,
            totalAvailable,
            totalInstalled,
            hasUpdates: this.checkForAnyUpdates()
        };
    }

    // Check if any packs have updates available
    checkForAnyUpdates() {
        for (const [packId, localPack] of this.localPacks) {
            if (localPack.updateAvailable) {
                return true;
            }
        }
        return false;
    }

    // Install main pack
    async installMainPack() {
        if (!this.mainPackInfo) {
            throw new Error('Main pack not found. Run scan first.');
        }
        
        return this.installPackByInfo(this.mainPackInfo, 'main');
    }

    // Install all theme packs
    async installAllThemes() {
        let installed = 0;
        let failed = 0;
        
        for (const [packName, packInfo] of this.availablePacks) {
            try {
                const success = await this.installPack(packName);
                if (success) installed++;
                else failed++;
            } catch (error) {
                failed++;
            }
        }
        
        return { installed, failed };
    }

    // Install all expansion packs
    async installAllExpansions() {
        let installed = 0;
        let failed = 0;
        
        for (const [packId, packInfo] of this.expansionPacks) {
            try {
                const success = await this.installPackByInfo(packInfo, packId);
                if (success) installed++;
                else failed++;
            } catch (error) {
                failed++;
            }
        }
        
        return { installed, failed };
    }

    // Generic pack installer
    async installPackByInfo(packInfo, packId) {
        try {
            CarrotDebug.repo(`📦 Installing pack: ${packInfo.displayName}`);
            
            // Download pack data
            const response = await fetch(packInfo.downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download: ${response.status}`);
            }
            
            const packData = await response.json();
            
            // Install as ST lorebook
            const filename = `${packInfo.displayName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            
            const saveResponse = await fetch('/api/worldinfo/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: filename, data: packData })
            });
            
            if (!saveResponse.ok) {
                throw new Error(`Failed to save lorebook: ${saveResponse.status}`);
            }
            
            // Track installation
            if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
            if (!extension_settings[extensionName].installedPacks) extension_settings[extensionName].installedPacks = {};
            
            extension_settings[extensionName].installedPacks[packId] = {
                displayName: packInfo.displayName,
                filename: filename,
                version: packInfo.version,
                installedDate: Date.now(),
                size: packInfo.size,
                type: packInfo.type
            };
            
            this.localPacks.set(packId, extension_settings[extensionName].installedPacks[packId]);
            saveSettingsDebounced();
            
            // Refresh ST's lorebook list
            if (typeof loadWorldInfoList === 'function') {
                loadWorldInfoList();
            }
            
            CarrotDebug.repo(`✅ Pack installed: ${packInfo.displayName}`);
            return true;
            
        } catch (error) {
            CarrotDebug.error(`❌ Failed to install ${packInfo.displayName}:`, error);
            return false;
        }
    }

    // Scan GitHub repository for available packs
    async scanRemotePacks() {
        console.log('🎯 PACK MANAGER DEBUG: scanRemotePacks() called');

        try {
            CarrotDebug.repo('🔍 Scanning remote packs from GitHub...');

            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(this.packsFolder)}`;
            console.log('🎯 PACK MANAGER DEBUG: API URL constructed:', {
                apiUrl: apiUrl,
                githubRepo: this.githubRepo,
                packsFolder: this.packsFolder
            });

            console.log('🎯 PACK MANAGER DEBUG: Making rate-limited fetch request to GitHub API...');
            const response = await this.fetchWithRateLimit(apiUrl);

            console.log('🎯 PACK MANAGER DEBUG: GitHub API response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: {
                    'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
                    'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
                    'x-ratelimit-reset': response.headers.get('x-ratelimit-reset')
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ PACK MANAGER ERROR: GitHub API error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: errorText
                });
                throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
            }

            console.log('🎯 PACK MANAGER DEBUG: Parsing JSON response...');
            const contents = await response.json();

            console.log('🎯 PACK MANAGER DEBUG: GitHub API contents parsed:', {
                isArray: Array.isArray(contents),
                length: contents?.length,
                firstFewItems: contents?.slice(0, 3)
            });

            const packs = contents.filter(item => item.type === 'dir');
            console.log('🎯 PACK MANAGER DEBUG: Directory items filtered:', {
                totalItems: contents.length,
                packDirectories: packs.length,
                packNames: packs.map(p => p.name)
            });

            this.availablePacks.clear();

            console.log('🎯 PACK MANAGER DEBUG: Starting to fetch pack info for each pack...');
            for (const pack of packs) {
                console.log(`🎯 PACK MANAGER DEBUG: Fetching info for pack: ${pack.name}`);
                const packInfo = await this.getPackInfo(pack.name);
                if (packInfo) {
                    this.availablePacks.set(pack.name, packInfo);
                    console.log(`✅ PACK MANAGER DEBUG: Successfully added pack: ${pack.name}`);
                } else {
                    console.warn(`⚠️ PACK MANAGER DEBUG: Failed to get info for pack: ${pack.name}`);
                }
            }

            console.log('🎯 PACK MANAGER DEBUG: Pack scanning completed:', {
                totalPacksFound: this.availablePacks.size,
                packNames: Array.from(this.availablePacks.keys())
            });

            CarrotDebug.repo(`✅ Found ${this.availablePacks.size} packs on GitHub`);
            return Array.from(this.availablePacks.values());

        } catch (error) {
            console.error('❌ PACK MANAGER ERROR: scanRemotePacks failed:', {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                fullError: error
            });

            CarrotDebug.error('❌ Failed to scan remote packs:', error);
            return [];
        }
    }

    // Get detailed info about a specific pack
    async getPackInfo(packName) {
        console.log(`🎯 PACK MANAGER DEBUG: getPackInfo called for pack: ${packName}`);

        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(this.packsFolder)}/${encodeURIComponent(packName)}`;
            console.log(`🎯 PACK MANAGER DEBUG: Pack info API URL: ${apiUrl}`);

            const response = await this.fetchWithRateLimit(apiUrl);
            console.log(`🎯 PACK MANAGER DEBUG: Pack info response for ${packName}:`, {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                rateLimitRemaining: response.headers.get('x-ratelimit-remaining')
            });

            if (!response.ok) {
                if (response.status === 403) {
                    console.warn(`⚠️ PACK MANAGER DEBUG: Rate limit hit for pack ${packName}`);
                    CarrotDebug.error(`GitHub API rate limit exceeded for pack: ${packName}`);
                    return null;
                }
                console.error(`❌ PACK MANAGER ERROR: API error for pack ${packName}: ${response.status}`);
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const contents = await response.json();
            
            // Check if contents is an array (successful response)
            if (!Array.isArray(contents)) {
                CarrotDebug.error(`Invalid response format for pack: ${packName}`, contents);
                return null;
            }
            
            // Find the main pack JSON file
            const jsonFile = contents.find(file => file.name.endsWith('.json'));
            const readmeFile = contents.find(file => file.name.toLowerCase().includes('readme'));
            
            if (!jsonFile) return null;
            
            const packInfo = {
                name: packName,
                displayName: packName.replace(/\s*\([^)]*\)\s*$/, ''), // Remove theme suffix
                theme: packName.match(/\(([^)]+)\)/)?.[1] || 'General',
                jsonFile: jsonFile.name,
                jsonSize: jsonFile.size || 0,
                downloadUrl: jsonFile.download_url,
                readmeUrl: readmeFile?.download_url,
                lastModified: jsonFile.sha, // Use SHA as version identifier
                installed: false,
                needsUpdate: false
            };
            
            return packInfo;
            
        } catch (error) {
            CarrotDebug.error(`❌ Failed to get pack info for ${packName}:`, error);
            return null;
        }
    }

    // Download and install a pack as a native ST lorebook
    async installPack(packName) {
        try {
            const packInfo = this.availablePacks.get(packName);
            if (!packInfo) {
                throw new Error(`Pack ${packName} not found in available packs`);
            }
            
            CarrotDebug.repo(`📦 Installing pack: ${packInfo.displayName}`);
            
            // Download the main JSON file
            const response = await fetch(packInfo.downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download pack: ${response.status}`);
            }
            
            const packData = await response.json();
            
            // Install as native ST lorebook using ST's API
            const filename = `${packInfo.displayName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            
            // Use ST's native save lorebook functionality
            const saveResponse = await fetch('/api/worldinfo/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: filename,
                    data: packData
                })
            });
            
            if (!saveResponse.ok) {
                throw new Error(`Failed to save lorebook: ${saveResponse.status}`);
            }
            
            // Track installation in our metadata
            if (!extension_settings[extensionName]) {
                extension_settings[extensionName] = {};
            }
            if (!extension_settings[extensionName].installedPacks) {
                extension_settings[extensionName].installedPacks = {};
            }
            
            extension_settings[extensionName].installedPacks[packName] = {
                displayName: packInfo.displayName,
                theme: packInfo.theme,
                filename: filename,
                version: packInfo.lastModified,
                installedDate: Date.now(),
                size: packInfo.jsonSize
            };
            
            this.localPacks.set(packName, extension_settings[extensionName].installedPacks[packName]);
            
            // Save settings
            saveSettingsDebounced();
            
            // Refresh ST's lorebook list
            if (typeof loadWorldInfoList === 'function') {
                loadWorldInfoList();
            }
            
            CarrotDebug.repo(`✅ Pack installed as lorebook: ${filename}`);
            toastr.success(`Pack installed: ${packInfo.displayName}`, `Saved as ${filename}`);
            return true;
            
        } catch (error) {
            CarrotDebug.error(`❌ Failed to install pack ${packName}:`, error);
            toastr.error(`Failed to install pack: ${error.message}`);
            return false;
        }
    }

    // Check for pack updates (like ST's extension update system)
    async checkForUpdates() {
        try {
            CarrotDebug.repo('🔍 Checking for pack updates...');
            
            await this.scanRemotePacks();
            let updatesAvailable = 0;
            
            for (const [packName, localPack] of this.localPacks) {
                const remotePack = this.availablePacks.get(packName);
                if (remotePack && localPack.version !== remotePack.lastModified) {
                    localPack.updateAvailable = true;
                    localPack.newVersion = remotePack.lastModified;
                    updatesAvailable++;
                }
            }
            
            CarrotDebug.repo(`✅ Update check complete: ${updatesAvailable} updates available`);
            
            if (updatesAvailable > 0) {
                this.showUpdateNotification(updatesAvailable);
            }
            
            return updatesAvailable;
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to check for updates:', error);
            return 0;
        }
    }

    // Show update notification (like ST's extension updates)
    showUpdateNotification(count) {
        const message = count === 1 ? '1 pack update available' : `${count} pack updates available`;
        
        toastr.info(message, 'CarrotKernel Pack Updates', {
            timeOut: 0,
            extendedTimeOut: 0,
            closeButton: true,
            onclick: () => {
                this.openPackManager();
            }
        });
    }

    // Auto-update all packs (like ST's "Update All Extensions")
    async updateAllPacks() {
        try {
            CarrotDebug.repo('🔄 Updating all packs...');
            
            let updated = 0;
            let failed = 0;
            
            for (const [packName, localPack] of this.localPacks) {
                if (localPack.updateAvailable) {
                    const success = await this.updatePack(packName);
                    if (success) {
                        updated++;
                    } else {
                        failed++;
                    }
                }
            }
            
            const message = `Pack updates complete: ${updated} updated, ${failed} failed`;
            CarrotDebug.repo(`✅ ${message}`);
            
            if (failed === 0) {
                toastr.success(message);
            } else {
                toastr.warning(message);
            }
            
            return { updated, failed };
            
        } catch (error) {
            CarrotDebug.error('❌ Failed to update packs:', error);
            toastr.error(`Pack updates failed: ${error.message}`);
            return { updated: 0, failed: 1 };
        }
    }

    // Update a specific pack
    async updatePack(packName) {
        try {
            const localPack = this.localPacks.get(packName);
            const remotePack = this.availablePacks.get(packName);
            
            if (!localPack || !remotePack) {
                throw new Error(`Pack ${packName} not found`);
            }
            
            CarrotDebug.repo(`🔄 Updating pack: ${localPack.displayName}`);
            
            // Download updated pack data
            const response = await fetch(remotePack.downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download pack update: ${response.status}`);
            }
            
            const packData = await response.json();
            
            // Update the lorebook file using ST's API
            const updateResponse = await fetch('/api/worldinfo/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: localPack.filename,
                    data: packData,
                    overwrite: true
                })
            });
            
            if (!updateResponse.ok) {
                throw new Error(`Failed to update lorebook: ${updateResponse.status}`);
            }
            
            // Update our metadata
            localPack.version = remotePack.lastModified;
            localPack.updatedDate = Date.now();
            localPack.updateAvailable = false;
            delete localPack.newVersion;
            
            extension_settings[extensionName].installedPacks[packName] = localPack;
            saveSettingsDebounced();
            
            // Refresh ST's lorebook list
            if (typeof loadWorldInfoList === 'function') {
                loadWorldInfoList();
            }
            
            CarrotDebug.repo(`✅ Pack updated successfully: ${localPack.displayName}`);
            return true;
            
        } catch (error) {
            CarrotDebug.error(`❌ Failed to update pack ${packName}:`, error);
            return false;
        }
    }

    // Auto-sync all packs (install new, update existing)
    async autoSync() {
        try {
            CarrotDebug.repo('🔄 Starting auto-sync process...');
            
            // Scan remote packs first
            await this.scanRemotePacks();
            
            let installed = 0;
            let updated = 0;
            let skipped = 0;
            
            for (const [packName, remotePack] of this.availablePacks) {
                const localPack = this.localPacks.get(packName);
                
                if (!localPack) {
                    // New pack - install it
                    const success = await this.installPack(packName);
                    if (success) installed++;
                } else {
                    // Pack already installed
                    skipped++;
                }
            }
            
            const summary = `Auto-sync complete: ${installed} installed, ${updated} updated, ${skipped} up-to-date`;
            CarrotDebug.repo(`✅ ${summary}`);
            toastr.success(summary);
            
            return { installed, updated, skipped, summary };
            
        } catch (error) {
            CarrotDebug.error('❌ Auto-sync failed:', error);
            toastr.error(`Auto-sync failed: ${error.message}`);
            return { installed: 0, updated: 0, skipped: 0, error: error.message };
        }
    }

    // Load locally installed packs
    loadLocalPacks() {
        const settings = extension_settings[extensionName] || {};
        const packs = settings.packs || {};
        
        this.localPacks.clear();
        
        for (const [packName, packData] of Object.entries(packs)) {
            if (packData.installed) {
                this.localPacks.set(packName, packData);
            }
        }
        
        CarrotDebug.repo(`📁 Loaded ${this.localPacks.size} local packs`);
    }
}

// =============================================================================
// CARROT CONTEXT & STORAGE MANAGEMENT SYSTEM 🥕
// Handles per-chat and per-character settings based on ST's native patterns
// =============================================================================

class CarrotContextManager {
    constructor() {
        this.stContext = null;
        this.isInitialized = false;
    }
    
    async initialize() {
        try {
            // Get ST context using the imported getContext function
            this.stContext = getContext();
            this.setupEventListeners();
            this.isInitialized = true;
            CarrotDebug.init('🎯 CarrotContextManager initialized successfully');
        } catch (error) {
            CarrotDebug.error('Failed to initialize CarrotContextManager:', error);
        }
    }
    
    setupEventListeners() {
        if (!this.stContext?.eventSource) return;
        
        // Listen for context changes using ST's native events
        this.stContext.eventSource.on(event_types.CHAT_CHANGED, () => {
            const context = this.getCurrentContext();
            CarrotDebug.scan(`Chat changed - Char: ${context.characterId}, Chat: ${context.chatId}, Group: ${context.groupId}`);
        });
        
        this.stContext.eventSource.on(event_types.CHARACTER_PAGE_LOADED, () => {
            const context = this.getCurrentContext();
            CarrotDebug.scan(`Character changed - Char: ${context.characterId}, Chat: ${context.chatId}`);
        });
        
        this.stContext.eventSource.on(event_types.GROUP_UPDATED, () => {
            const context = this.getCurrentContext();
            CarrotDebug.scan(`Group updated - Group: ${context.groupId}, Chat: ${context.chatId}`);
        });
    }
    
    getCurrentContext() {
        // Use ST's native context detection directly (same as ST's getContext())
        const freshContext = getContext();
        return {
            characterId: freshContext.characterId,
            chatId: freshContext.chatId,
            groupId: freshContext.groupId,
            isGroup: !!freshContext.groupId,
            characters: freshContext.characters,
            groups: freshContext.groups
        };
    }
    
    isContextValid() {
        const context = this.getCurrentContext();
        return this.isInitialized && (context.characterId || context.groupId);
    }
}

class CarrotStorageManager {
    constructor(contextManager) {
        this.contextManager = contextManager;
        this.defaultSettings = {
            enabledRepos: new Set(),
            autoScanEnabled: false,
            scanOnStartup: false,
            displaySettings: {
                showCards: true,
                groupByCharacter: true,
                compactMode: false
            }
        };
    }
    
    // Get settings with proper hierarchy: chat > character > global
    async getSettings() {
        const context = this.contextManager.getCurrentContext();
        
        // Start with global settings
        let settings = { ...this.defaultSettings };
        const globalSettings = extension_settings[extensionName] || {};
        Object.assign(settings, globalSettings);
        
        // Override with character-specific settings if available
        if (context.characterId && context.characters) {
            const character = context.characters[context.characterId];
            if (character?.data?.extensions?.[extensionName]) {
                const charSettings = character.data.extensions[extensionName];
                Object.assign(settings, charSettings);
                CarrotDebug.scan(`Applied character-specific settings for ${character.name}`);
            }
        }
        
        // Override with chat-specific settings (highest priority)
        if (context.chatId && chat_metadata?.[extensionName]) {
            const chatSettings = chat_metadata[extensionName];
            Object.assign(settings, chatSettings);
            CarrotDebug.scan(`Applied chat-specific settings for chat ${context.chatId}`);
        }
        
        // Convert enabledRepos to Set if it's an array
        if (Array.isArray(settings.enabledRepos)) {
            settings.enabledRepos = new Set(settings.enabledRepos);
        }
        
        CarrotDebug.scan('Settings hierarchy resolved:', settings);
        return settings;
    }
    
    // Save settings at the appropriate level
    async saveSettings(settings, level = 'global') {
        const context = this.contextManager.getCurrentContext();
        
        // Convert Set to Array for JSON serialization
        const serializableSettings = { ...settings };
        if (serializableSettings.enabledRepos instanceof Set) {
            serializableSettings.enabledRepos = Array.from(serializableSettings.enabledRepos);
        }
        
        switch (level) {
            case 'chat':
                if (!context.chatId) {
                    CarrotDebug.error('Cannot save chat settings: no active chat');
                    return false;
                }
                
                // Use ST's chat metadata system
                if (!chat_metadata[extensionName]) {
                    chat_metadata[extensionName] = {};
                }
                Object.assign(chat_metadata[extensionName], serializableSettings);
                
                // Save using ST's debounced function
                await saveMetadataDebounced();
                CarrotDebug.scan(`Saved chat-level settings for chat ${context.chatId}`);
                break;
                
            case 'character':
                if (!context.characterId || context.isGroup) {
                    CarrotDebug.error('Cannot save character settings: no active character or in group');
                    return false;
                }
                
                // Use ST's character extension system
                await writeExtensionField(context.characterId, extensionName, serializableSettings);
                CarrotDebug.scan(`Saved character-level settings for character ${context.characterId}`);
                break;
                
            case 'global':
            default:
                // Use ST's global extension settings
                if (!extension_settings[extensionName]) {
                    extension_settings[extensionName] = {};
                }
                Object.assign(extension_settings[extensionName], serializableSettings);
                
                // Save using ST's debounced function
                saveSettingsDebounced();
                CarrotDebug.scan('Saved global settings');
                break;
        }
        
        return true;
    }
    
    // Clear settings at a specific level
    async clearSettings(level) {
        const context = this.contextManager.getCurrentContext();
        
        switch (level) {
            case 'chat':
                if (chat_metadata[extensionName]) {
                    delete chat_metadata[extensionName];
                    await saveMetadataDebounced();
                    CarrotDebug.scan('Cleared chat-level settings');
                }
                break;
                
            case 'character':
                if (context.characterId) {
                    await writeExtensionField(context.characterId, extensionName, null);
                    CarrotDebug.scan('Cleared character-level settings');
                }
                break;
                
            case 'global':
                if (extension_settings[extensionName]) {
                    delete extension_settings[extensionName];
                    saveSettingsDebounced();
                    CarrotDebug.scan('Cleared global settings');
                }
                break;
        }
    }
    
    // Check if settings exist at a specific level
    hasSettingsAt(level) {
        const context = this.contextManager.getCurrentContext();
        
        switch (level) {
            case 'chat':
                return !!(chat_metadata?.[extensionName]);
            case 'character':
                if (!context.characterId || context.isGroup) return false;
                const character = context.characters?.[context.characterId];
                return !!(character?.data?.extensions?.[extensionName]);
            case 'global':
                return !!(extension_settings?.[extensionName]);
            default:
                return false;
        }
    }
}

// Global instances
let CarrotContext = null;
let CarrotStorage = null;

// =============================================================================
// CARROT DEBUG MODULE 🥕
// Centralized debug system with organized categories using CARROT 🥕 BNY: naming
// =============================================================================

class CarrotDebugger {
    constructor() {
        this.enabled = false;
        this.logSequence = 0;
        this.categories = {
            INIT: { emoji: '🌱', color: '#4caf50', name: 'Initialization' },
            SCAN: { emoji: '🔍', color: '#2196f3', name: 'Character Scanning' },
            INJECT: { emoji: '💉', color: '#ff6b35', name: 'AI Injection' },
            UI: { emoji: '🎨', color: '#9c27b0', name: 'User Interface' },
            REPO: { emoji: '📚', color: '#ff9800', name: 'Repository Management' },
            ERROR: { emoji: '❌', color: '#f44336', name: 'Critical Errors' }
        };
        
        // Performance tracking
        this.timers = new Map();
        this.metrics = new Map();
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) {
            this.init('🥕 CarrotKernel Debug Mode ENABLED');
            this.showDebugInfo();
        } else {
            this.init('🥕 CarrotKernel Debug Mode DISABLED');
        }
    }
    
    showDebugInfo() {
        console.group('🥕 CARROT BNY: DEBUG SYSTEM');
        console.log('📊 Available Categories:');
        Object.entries(this.categories).forEach(([key, cat]) => {
            console.log(`  ${cat.emoji} ${key}: ${cat.name}`);
        });
        console.log('🎯 Usage: CarrotDebug.[category]("message", data)');
        console.groupEnd();
    }
    
    _log(category, message, data = null) {
        if (!this.enabled) return;
        
        const cat = this.categories[category];
        if (!cat) {
            console.error('🥕 CARROT BNY: INVALID CATEGORY', category);
            return;
        }
        
        const logId = ++this.logSequence;
        const prefix = `🥕 CARROT ${cat.emoji} BNY: ${category}`;
        
        console.group(`%c${prefix} #${logId}`, `color: ${cat.color}; font-weight: bold;`);
        console.log(`%c${message}`, `color: ${cat.color};`);
        
        if (data !== null) {
            if (typeof data === 'object') {
                console.table ? console.table(data) : console.log(data);
            } else {
                console.log('📋 Data:', data);
            }
        }
        
        console.groupEnd();
    }
    
    // Performance timers
    startTimer(name, category = 'INIT') {
        const key = `${category}:${name}`;
        this.timers.set(key, performance.now());
        this._log(category, `⏱️ Timer Started: ${name}`);
    }
    
    endTimer(name, category = 'INIT') {
        const key = `${category}:${name}`;
        const startTime = this.timers.get(key);
        if (!startTime) {
            this.error(`Timer '${name}' not found`);
            return;
        }
        
        const duration = performance.now() - startTime;
        this.timers.delete(key);
        this._log(category, `⏱️ Timer Ended: ${name} (${duration.toFixed(2)}ms)`);
        return duration;
    }
    
    // Category-specific debug functions
    init(message, data = null) { this._log('INIT', message, data); }
    scan(message, data = null) { this._log('SCAN', message, data); }
    inject(message, data = null) { this._log('INJECT', message, data); }
    ui(message, data = null) { this._log('UI', message, data); }
    repo(message, data = null) { this._log('REPO', message, data); }
    
    error(message, data = null) {
        const cat = this.categories.ERROR;
        const prefix = `🥕 CARROT ${cat.emoji} BNY: ERROR`;
        
        console.group(`%c${prefix}`, `color: ${cat.color}; font-weight: bold; background: #ffe6e6;`);
        console.error(`%c${message}`, `color: ${cat.color}; font-weight: bold;`);
        
        if (data !== null) {
            console.error('💥 Error Data:', data);
        }
        
        console.trace('🥕 Stack Trace');
        console.groupEnd();
    }
    
    // Specialized debug functions
    characters(detected, context = 'chat') {
        if (!this.enabled) return;
        this.scan(`Character Detection in ${context}`, {
            count: detected.size,
            characters: Array.from(detected),
            context: context
        });
    }
    
    lorebook(name, type, entries = 0) {
        this.scan(`Lorebook Processed: ${name}`, {
            type: type,
            entries: entries,
            timestamp: new Date().toISOString()
        });
    }
    
    injection(characters, injectionData) {
        this.inject('AI Injection Process', {
            targetCharacters: Array.from(characters),
            injectionSize: injectionData.length,
            preview: injectionData.substring(0, 100) + '...'
        });
    }
    
    tutorial(action, tutorialId, step = null) {
        this.ui(`Tutorial ${action}: ${tutorialId}`, {
            step: step,
            timestamp: Date.now()
        });
    }
    
    popup(positioning, coords) {
        this.ui('Popup Positioning', {
            strategy: positioning,
            coordinates: coords
        });
    }
    
    setting(key, oldValue, newValue) {
        this.repo('Setting Changed', {
            setting: key,
            from: oldValue,
            to: newValue
        });
    }
    
    /**
     * Pretty print object data
     */
    inspect(obj, label = 'Object') {
        if (!this.enabled) return;
        
        console.group(`🥕 CARROT 🔍 BNY: INSPECT - ${label}`);
        console.log('📋 Type:', typeof obj);
        console.log('📋 Constructor:', obj?.constructor?.name || 'Unknown');
        
        if (typeof obj === 'object' && obj !== null) {
            console.log('📋 Keys:', Object.keys(obj));
            if (Array.isArray(obj)) {
                console.log('📋 Length:', obj.length);
            }
            console.table ? console.table(obj) : console.log(obj);
        } else {
            console.log('📋 Value:', obj);
        }
        
        console.groupEnd();
    }
}

// Create global debug instance
window.CarrotDebug = new CarrotDebugger();

// Console shortcuts
if (typeof window !== 'undefined') {
    window.cd = window.CarrotDebug;
}

// =============================================================================
// END CARROT DEBUG MODULE 🥕  
// =============================================================================

// Core data structures (modeled after BunnyMoTags)
let selectedLorebooks = new Set();      // Enabled lorebooks
let characterRepoBooks = new Set();     // Lorebooks marked as character repositories  
let scannedCharacters = new Map();      // character_name -> { tags: Map, source: lorebook_name }
let lastProcessedMessage = null;
let lastInjectedCharacters = [];        // Track which characters were injected for persistence
let pendingThinkingBlockData = [];       // Store character data for thinking blocks when AI responds
// Debug functionality now handled by CarrotDebug module

// Default settings
const defaultSettings = {
    enabled: true,
    selectedLorebooks: [],
    characterRepoBooks: [],
    displayMode: 'thinking', // 'none', 'thinking', 'cards'
    autoExpand: false,
    sendToAI: true,
    injectionRole: 'system',
    maxCharactersDisplay: 6,  // Max characters shown in chat
    maxCharactersInject: 6,   // Max characters sent to AI
    debugMode: false,
    babyBunnyMode: false,     // 🐰 Baby Bunny Mode - guided automation for sheet processing
    worldBookTrackerEnabled: true,  // WorldBook Tracker toggle
    autoRescanOnChatLoad: true  // Auto-rescan character repos on chat switch
};

// Debug logging function - now uses centralized CarrotDebug module
function logSeq(message) {
    CarrotDebug.init(message);
}

// Initialize extension settings
function initializeSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = { ...defaultSettings };
    }
    
    // Note: We no longer auto-reset templates to preserve user modifications
    
    // Ensure all default properties exist
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
    const invalidCharRepos = [];

    if (extension_settings[extensionName].characterRepoBooks) {
        extension_settings[extensionName].characterRepoBooks.forEach(book => {
            // Only add if the lorebook actually exists AND is in selectedLorebooks
            if (availableLorebooks.includes(book) && selectedLorebooks.has(book)) {
                characterRepoBooks.add(book);
            } else {
                invalidCharRepos.push(book);
            }
        });
    }

    // Log cleanup if any invalid entries were found
    const totalCleaned = invalidSelectedBooks.length + invalidCharRepos.length;
    if (totalCleaned > 0) {
        console.log('🥕 CarrotKernel: Cleaned up lorebooks that no longer exist:', {
            invalidSelectedBooks,
            invalidCharRepos
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
    saveSettingsDebounced();
}

// Parse BunnymoTags blocks from lorebook entries
function extractBunnyMoCharacters(entry, lorebookName) {
    const characters = [];
    const content = entry.content || '';
    
    CarrotDebug.scan(`Parsing entry in ${lorebookName}`, {
        entryKey: entry.key,
        entryComment: entry.comment,
        contentPreview: content.substring(0, 200) + '...',
        contentLength: content.length
    });
    
    // Look for <BunnymoTags> blocks
    const bunnyMoMatches = content.match(/<BunnymoTags>(.*?)<\/BunnymoTags>/gs);
    
    if (bunnyMoMatches) {
        CarrotDebug.scan(`Found ${bunnyMoMatches.length} BunnymoTags blocks`, {
            matches: bunnyMoMatches.map(m => m.substring(0, 100) + '...')
        });
        
        bunnyMoMatches.forEach(match => {
            const tagContent = match.replace(/<\/?BunnymoTags>/g, '');
            const character = parseBunnyMoTagBlock(tagContent, lorebookName);
            
            if (character) {
                characters.push(character);
                CarrotDebug.scan(`Found character: ${character.name}`, {
                    lorebook: lorebookName,
                    tags: character.tags,
                    tagCount: character.tags.size,
                    categories: Array.from(character.tags.keys())
                });
            } else {
                CarrotDebug.error(`Failed to parse character from tags`, {
                    tagContent: tagContent,
                    lorebook: lorebookName
                });
            }
        });
    } else {
        CarrotDebug.scan(`No BunnymoTags blocks found in entry`, {
            entryKey: entry.key,
            searchedFor: '<BunnymoTags>...</BunnymoTags>',
            contentSample: content.substring(0, 500)
        });
    }
    
    return characters;
}

// Parse individual BunnymoTags block (copied from BunnyMoTags and enhanced)
function parseBunnyMoTagBlock(tagContent, lorebookName) {
    const tags = tagContent.split(',').map(t => t.trim());
    let characterName = null;
    const tagMap = new Map();
    let parsedCount = 0;
    let failedCount = 0;
    
    tags.forEach(tag => {
        const tagMatch = tag.match(/<([^:>]+):([^>]+)>/);
        if (tagMatch) {
            const [, tagType, tagValue] = tagMatch;
            const cleanType = tagType.trim().toUpperCase();
            const cleanValue = tagValue.trim().toUpperCase().replace(/_/g, ' ');
            
            parsedCount++;
            
            if (cleanType === 'NAME') {
                characterName = cleanValue.replace(/_/g, ' ');
            } else {
                if (!tagMap.has(cleanType)) {
                    tagMap.set(cleanType, new Set());
                }
                tagMap.get(cleanType).add(cleanValue);
            }
        } else {
            failedCount++;
        }
    });
    
    // Single consolidated debug output
    CarrotDebug.scan(`📝 Parsed BunnymoTags block`, {
        lorebook: lorebookName,
        totalTags: tags.length,
        parsedSuccessfully: parsedCount,
        failed: failedCount,
        character: characterName,
        categories: tagMap.size
    });
    
    if (characterName && tagMap.size > 0) {
        const result = {
            name: characterName,
            tags: tagMap,
            source: lorebookName
        };
        
        CarrotDebug.scan(`🎉 CHARACTER PARSED SUCCESSFULLY`, {
            name: characterName,
            tagCount: tagMap.size,
            categories: Array.from(tagMap.keys())
        });
        
        return result;
    }
    
    CarrotDebug.error(`❌ FAILED TO PARSE CHARACTER`, {
        hadName: !!characterName,
        tagCount: tagMap.size,
        content: tagContent
    });
    
    return null;
}

// Scan selected lorebooks for character data
async function scanSelectedLorebooks(lorebookNames) {
    scannedCharacters.clear();
    
    const foundCharacters = [];
    let characterReposScanned = 0;
    let tagLibrariesScanned = 0;
    
    CarrotDebug.scan(`Starting scan of ${lorebookNames.length} lorebooks`, {
        lorebooks: lorebookNames,
        characterRepos: Array.from(characterRepoBooks)
    });
    CarrotDebug.startTimer('lorebook-scan', 'SCAN');
    
    for (const lorebookName of lorebookNames) {
        const isCharacterRepo = characterRepoBooks.has(lorebookName);
        
        try {
            const lorebook = await loadWorldInfo(lorebookName);
            if (!lorebook || !lorebook.entries) {
                CarrotDebug.error(`Failed to load lorebook: ${lorebookName}`);
                continue;
            }
            
            if (isCharacterRepo) {
                characterReposScanned++;
                CarrotDebug.lorebook(lorebookName, 'character-repo', lorebook.entries.length);
                
                // Extract character data from BunnymoTags blocks
                Object.values(lorebook.entries).forEach(entry => {
                    // Skip disabled entries
                    if (entry.disable) {
                        CarrotDebug.scan(`Skipping disabled entry`, {
                            key: entry.key,
                            comment: entry.comment,
                            lorebook: lorebookName
                        });
                        return;
                    }
                    
                    const characters = extractBunnyMoCharacters(entry, lorebookName);
                    characters.forEach(char => {
                        if (!scannedCharacters.has(char.name)) {
                            scannedCharacters.set(char.name, char);
                            foundCharacters.push(char.name);
                        }
                    });
                });
            } else {
                tagLibrariesScanned++;
                CarrotDebug.lorebook(lorebookName, 'tag-library', lorebook.entries.length);
                // Tag libraries provide context but don't contain character data
            }
        } catch (error) {
            CarrotDebug.error(`Error scanning lorebook: ${lorebookName}`, error);
        }
    }
    
    CarrotDebug.endTimer('lorebook-scan', 'SCAN');
    CarrotDebug.scan('Scan completed successfully', {
        charactersFound: foundCharacters.length,
        characterReposScanned: characterReposScanned,
        tagLibrariesScanned: tagLibrariesScanned,
        totalCharacters: scannedCharacters.size
    });

    return {
        characters: foundCharacters,
        characterRepos: characterReposScanned,
        tagLibraries: tagLibrariesScanned
    };
}

// ============================================================================
// CHARACTER LOOKUP UTILITIES
// ============================================================================

// Flexible character name matching to handle variations in character names
function findCharacterByName(searchName) {
    if (!searchName) return null;
    
    // First try exact match
    if (scannedCharacters.has(searchName)) {
        return { name: searchName, data: scannedCharacters.get(searchName) };
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
    for (const [storedName, charData] of scannedCharacters.entries()) {
        // Check if any variation of search name matches any variation of stored name
        const storedVariations = [
            storedName,
            storedName.toLowerCase(),
            storedName.toUpperCase(),
            storedName.trim(),
            storedName.replace(/'/g, "'"),
            storedName.replace(/'/g, "'"),
            storedName.replace(/[^\w\s]/g, ''),
            storedName.replace(/\s+/g, ' '),
            storedName.replace(/\s+/g, '_'),
            storedName.replace(/\s+/g, '-'),
            storedName.replace(/[^a-zA-Z0-9\s]/g, ''),
        ];
        
        // Check for any match between search variations and stored variations
        for (const searchVar of possibleNames) {
            for (const storedVar of storedVariations) {
                if (searchVar === storedVar) {
                    CarrotDebug.ui(`✅ Found character match: "${searchName}" -> "${storedName}"`);
                    return { name: storedName, data: charData };
                }
            }
        }
    }
    
    // No match found
    CarrotDebug.error(`❌ No character match found for: "${searchName}"`, {
        availableCharacters: Array.from(scannedCharacters.keys()),
        searchVariations: possibleNames
    });
    
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
        maxCharactersShown: settings.maxCharactersShown,
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
    
    // IMPORTANT: Limit characters based on maxCharactersShown setting
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersShown);
    const charactersToInject = activeCharacters.slice(0, maxChars);
    
    CarrotDebug.inject('Characters limited for injection', {
        totalDetected: activeCharacters.length,
        maxAllowed: settings.maxCharactersShown,
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
                injectionText = CarrotTemplateManager.processTemplate(currentTemplate, characterDataArray[0]);
            } else {
                // Multiple characters - pass array directly to new template system
                injectionText = CarrotTemplateManager.processTemplate(currentTemplate, characterDataArray);
            }
        }
    } else {
        // Fallback to original format if no template
        CarrotDebug.inject('No template found, using fallback format');
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
    
    // Use GuidedGenerations' exact injection pattern for perfect adherence
    const depth = settings.injectionDepth;
    const role = settings.injectionRole;
    const injectionCommand = `/inject id=carrot-consistency position=chat ephemeral=true scan=true depth=${depth} role=${role} ${injectionText}`;
    
    CarrotDebug.inject('Executing injection command', {
        command: injectionCommand.substring(0, 100) + '...',
        fullCommand: injectionCommand,
        depth: depth,
        role: role,
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
        lastInjectedCharacters = [...charactersToInject];
        
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
    
    const settings = extension_settings[extensionName];
    const openAttr = settings.autoExpand ? 'open' : '';
    
    CarrotDebug.ui('Rendering ST-native thinking box display', {
        activeCharacters: activeCharacters,
        autoExpand: settings.autoExpand,
        maxCharactersShown: settings.maxCharactersShown
    });
    
    // Respect maxCharactersShown limit
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersShown);
    const charactersToShow = activeCharacters.slice(0, maxChars);
    
    CarrotDebug.ui('Characters filtered for display', {
        totalCharacters: activeCharacters.length,
        maxAllowed: maxChars,
        willShow: charactersToShow.length,
        truncated: maxChars < activeCharacters.length
    });
    
    // Create BunnyMoTags-style formatted content for the thinking block
    let content = '';
    let renderedCharacters = 0;
    
    // Debug what we have available
    CarrotDebug.ui('🔍 DEBUG: Character data lookup', {
        charactersToShow: charactersToShow,
        availableInScanned: Array.from(scannedCharacters.keys()),
        scannedCharactersSize: scannedCharacters.size,
        exactMatches: charactersToShow.filter(name => scannedCharacters.has(name)),
        scannedCharactersEntries: Array.from(scannedCharacters.entries()).map(([key, value]) => ({ 
            key, 
            hasValue: !!value,
            tagCount: value?.tags?.size || 0,
            source: value?.source
        }))
    });

    charactersToShow.forEach(rawCharName => {
        // Extract actual character name from Baby Bunny Mode format if needed
        let charName = rawCharName;
        const babyBunnyMatch = charName.match(/^(.+?)\s+Character Archive\s+-\s+Generated by Baby Bunny Mode/i);
        if (babyBunnyMatch) {
            charName = babyBunnyMatch[1].trim();
        }

        const charResult = findCharacterByName(charName);
        
        if (charResult && charResult.data) {
            const charData = charResult.data;
            const actualCharName = charResult.name;
            renderedCharacters++;
            
            // Add collapsible character section with simple HTML details/summary
            content += `<details open style="margin-bottom: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 8px; display: block;">`;
            content += `<summary style="cursor: pointer !important; font-weight: bold !important; color: var(--SmartThemeBodyColor) !important; font-size: 1.1em !important; text-shadow: 0 0 8px currentColor !important; margin-bottom: 8px !important; list-style: none !important; display: list-item !important; list-style-type: none !important;">🏷️ ${actualCharName}${actualCharName !== charName ? ` (matched from "${charName}")` : ''}</summary>`;
            content += `<div class="character-tags-content" style="display: block;">`;
            
            // Debug the character data structure
            CarrotDebug.ui(`🔍 DEBUG: Character data for ${actualCharName}`, {
                originalSearch: charName,
                hasCharData: !!charData,
                tagsType: typeof charData.tags,
                tagsSize: charData.tags?.size,
                tagsIsMap: charData.tags instanceof Map,
                tagEntries: charData.tags ? Array.from(charData.tags.entries()) : 'no tags',
                source: charData.source
            });
            
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
            
            CarrotDebug.ui(`Rendered character data: ${actualCharName}`, {
                originalSearch: charName,
                categories: tagsToProcess.size,
                totalTags: Array.from(tagsToProcess.values()).reduce((sum, vals) => sum + vals.length, 0),
                source: charData.source
            });
        } else {
            CarrotDebug.error(`Missing character data for display: ${charName}`, {
                availableCharacters: Array.from(scannedCharacters.keys()),
                lookedFor: charName
            });
            
            // Add debug info to the display for the user
            content += `<div style="color: var(--SmartThemeQuoteColor); opacity: 0.7; margin-bottom: 8px;">`;
            content += `⚠️ No data found for character: <strong>${charName}</strong><br>`;
            content += `Available characters: ${Array.from(scannedCharacters.keys()).join(', ') || 'none'}<br>`;
            content += `</div>`;
        }
    });
    
    if (!content) {
        content = `<em style="color: var(--SmartThemeQuoteColor); opacity: 0.7;">No character data found. Characters may not be scanned yet.</em>`;
        CarrotDebug.ui('⚠️ No character content - showing empty message');
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
        'HAIR': { color: '#9b59b6', emoji: '💇', section: 'Physical' },
        'STYLE': { color: '#e67e22', emoji: '👔', section: 'Physical' },
        
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
                sectionsHTML += `<span style="color: var(--SmartThemeBodyColor); font-size: 0.85em;">${value}</span>`;
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

// Restore thinking blocks from stored chat data (for page refresh/chat switching)
function restoreThinkingBlocksFromChat() {
    const settings = extension_settings[extensionName];
    
    if (!settings.enabled || settings.displayMode !== 'thinking') return;
    
    CarrotDebug.ui('🔄 PERSISTENCE: Scanning chat for stored thinking block data');
    
    let restoredCount = 0;
    
    // Scan through all chat messages for stored CarrotKernel data
    chat.forEach((message, index) => {
        if (message.extra?.carrot_character_data) {
            const storedData = message.extra.carrot_character_data;
            const messageElement = document.querySelector(`[mesid="${index}"]`);
            
            // Check if this message already has BunnyMoTags content
            const existingCarrotContent = Array.from(messageElement?.querySelectorAll('.mes_reasoning_header_title') || [])
                .some(el => el.textContent.includes('🥕 BunnyMoTags')) ||
                Array.from(messageElement?.querySelectorAll('details[style*="border"]') || []).length > 0;
            
            CarrotDebug.ui(`🔍 PERSISTENCE DEBUG: Message ${index}`, {
                hasMessageElement: !!messageElement,
                hasStoredData: !!storedData.characters,
                storedCharactersLength: storedData.characters?.length,
                hasExistingCarrotContent: !!existingCarrotContent,
                messageHTML: messageElement?.innerHTML?.substring(0, 200)
            });
            
            if (messageElement && !existingCarrotContent && storedData.characters && storedData.characters.length > 0) {
                CarrotDebug.ui(`🔄 PERSISTENCE: Restoring thinking block for message ${index}`, {
                    characters: storedData.characters,
                    originalDisplayMode: storedData.displayMode
                });
                
                // Temporarily set pending data and call displayCharacterData for this specific message
                const originalPending = [...pendingThinkingBlockData];
                pendingThinkingBlockData = storedData.characters;
                
                // Generate the thinking block content
                const thinkingBlockHTML = renderAsThinkingBox(storedData.characters);
                
                // Insert it directly into the message
                const mesText = messageElement.querySelector('.mes_text');
                if (mesText && thinkingBlockHTML) {
                    mesText.insertAdjacentHTML('beforebegin', thinkingBlockHTML);
                    
                    // Ensure collapsible functionality works by adding event listeners
                    const characterDetails = messageElement.querySelectorAll('details[style*="border"]');
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
                    
                    // Mark the message as having CarrotKernel thinking content
                    messageElement.classList.add('carrot-thinking');
                    messageElement.setAttribute('data-carrot-thinking-state', 'done');
                    
                    restoredCount++;
                }
                
                // Restore original pending data
                pendingThinkingBlockData = originalPending;
            }
        }
    });
    
    if (restoredCount > 0) {
        CarrotDebug.ui(`✅ PERSISTENCE: Restored ${restoredCount} thinking blocks from storage`);
    } else {
        CarrotDebug.ui('💭 PERSISTENCE: No stored thinking blocks found to restore');
    }
}

// ============================================================================
// BUNNYMOTAGS-STYLE CARD DISPLAY SYSTEM  
// ============================================================================
// Complete card renderer with grouping, colors, and interactivity

// Render character data as BunnyMoTags-style cards
function renderAsCards(activeCharacters) {
    const settings = extension_settings[extensionName];
    
    // Respect maxCharactersShown limit  
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersShown);
    const charactersToShow = activeCharacters.slice(0, maxChars);
    
    // Load CSS styles first (create style element if needed)
    loadCarrotCardStyles();
    
    const cardsHTML = charactersToShow
        .map((charName, index) => createCharacterCard(charName, index))
        .join('');
    
    // Add a header for the system message with character count (EXACT BunnyMoTags format)
    const characterCount = charactersToShow.length;
    const totalCount = activeCharacters.length;
    const headerText = totalCount > characterCount ? 
        `Character Information (${characterCount}/${totalCount})` :
        `Character Information (${characterCount} ${characterCount === 1 ? 'character' : 'characters'})`;
    
    const containerHTML = `
        <div class="bmt-system-message-header">
            <h3 style="margin: 0 0 15px 0; color: var(--SmartThemeBodyColor); font-size: 16px; font-weight: 600;">
                🏷️ ${headerText}
            </h3>
        </div>
        <div class="bmt-cards-grid horizontal">
            ${cardsHTML}
        </div>
    `;
    
    // Initialize card interactivity after a short delay to ensure DOM is ready
    setTimeout(() => {
        if (window.CARROT_initializeCards) {
            window.CARROT_initializeCards();
        }
    }, 100);
    
    return containerHTML;
}

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



// Load CSS styles for CarrotKernel cards
function loadCarrotCardStyles() {
    if (document.getElementById('carrot-card-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'carrot-card-styles';
    style.textContent = `
        /* EXACT BunnyMoTags Card Styles - Copied from Original Implementation */
        .bmt-cards-grid.horizontal {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin: 0;
            padding: 0;
        }
        
        .bmt-tracker-card.horizontal-layout {
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            padding: 0 !important;
            margin-bottom: 20px !important;
            border-radius: 16px !important;
            overflow: hidden !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), 0 1px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            backdrop-filter: blur(12px) !important;
            color: #fff;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            position: relative;
            font-size: 14px;
            font-weight: 500;
        }
        
        .bmt-tracker-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        }
        
        .bmt-gradient-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent) !important;
        }
        
        .bmt-card-header-horizontal {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 16px 20px 12px 20px !important;
            background: rgba(255, 255, 255, 0.05) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        
        .bmt-character-info {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
        }
        
        .bmt-character-name {
            font-size: 20px !important;
            font-weight: 700 !important;
            color: #fff !important;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
            margin: 0 !important;
        }
        
        .bmt-character-meta {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
        }
        
        .bmt-meta-badge {
            background: rgba(255, 255, 255, 0.15) !important;
            color: rgba(255, 255, 255, 0.9) !important;
            padding: 4px 8px !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            font-weight: 500 !important;
            backdrop-filter: blur(8px) !important;
        }
        
        .bmt-card-controls {
            display: flex !important;
            align-items: center !important;
        }
        
        .bmt-card-toggle {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 8px 12px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            backdrop-filter: blur(8px);
            font-size: 12px;
            min-width: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .bmt-card-toggle:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #fff;
            transform: scale(1.05);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .bmt-toggle-icon {
            display: inline-block;
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            font-size: 12px;
            font-weight: bold;
        }
        
        .bmt-tracker-card.collapsed .bmt-toggle-icon {
            transform: rotate(-90deg);
        }
        
        .bmt-card-content {
            padding: 0 20px 20px 20px;
            max-height: none;
            overflow: hidden;
            transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
            opacity: 1;
            transform: translateY(0);
        }
        
        .bmt-tracker-card.collapsed .bmt-card-content {
            max-height: 0 !important;
            padding: 0 20px !important;
            opacity: 0;
            transform: translateY(-10px);
        }
        
        .bmt-groups-container {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 20px !important;
            padding: 20px !important;
            background: rgba(0, 0, 0, 0.05) !important;
        }
        
        .bmt-group-section {
            flex: 1 1 300px !important;
            min-width: 250px !important;
            background: rgba(255, 255, 255, 0.08) !important;
            border-radius: 8px !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            overflow: hidden !important;
        }
        
        .bmt-group-section.collapsible {
            flex: 1 1 100% !important;
        }
        
        .bmt-group-header {
            display: flex !important;
            align-items: center !important;
            padding: 12px 16px !important;
            background: rgba(255, 255, 255, 0.05) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            font-weight: 600 !important;
            color: #fff !important;
            gap: 8px !important;
        }
        
        .bmt-group-icon {
            font-size: 16px !important;
        }
        
        .bmt-group-title {
            flex: 1 !important;
            font-size: 14px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        
        .bmt-group-count {
            font-size: 12px !important;
            opacity: 0.7 !important;
            background: rgba(255, 255, 255, 0.1) !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
        }
        
        .bmt-group-details {
            width: 100% !important;
        }
        
        .bmt-group-details summary {
            cursor: pointer !important;
            list-style: none !important;
        }
        
        .bmt-group-details summary::-webkit-details-marker {
            display: none !important;
        }
        
        .bmt-expand-arrow {
            font-size: 12px !important;
            transition: transform 0.3s ease !important;
            margin-left: 8px !important;
        }
        
        .bmt-group-details[open] .bmt-expand-arrow {
            transform: rotate(180deg) !important;
        }
        
        .bmt-group-content {
            padding: 16px !important;
        }
        
        .bmt-category-row {
            margin-bottom: 12px !important;
        }
        
        .bmt-category-row:last-child {
            margin-bottom: 0 !important;
        }
        
        .bmt-category-label {
            font-size: 11px !important;
            font-weight: 600 !important;
            color: rgba(255, 255, 255, 0.7) !important;
            margin-bottom: 6px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        
        .bmt-tags-row {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
        }
        
        .bmt-tag-horizontal {
            padding: 4px 8px !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            font-weight: 500 !important;
            border: 1px solid !important;
            display: inline-block !important;
            margin: 2px !important;
            transition: all 0.2s ease !important;
            cursor: pointer !important;
            backdrop-filter: blur(8px) !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
        }
        
        .bmt-tag-horizontal:hover {
            transform: translateY(-1px) scale(1.02) !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.25) 50%, rgba(255, 255, 255, 0.30) 100%) !important;
            border-color: rgba(255, 255, 255, 0.4) !important;
        }
    `;
    
    document.head.appendChild(style);
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
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🧠 CARROT DEBUG: About to call renderAsThinkingBox with:', injectedCharacters);
        }
        CarrotDebug.ui('🧠 DISPLAY: Rendering thinking box');
        renderedContent = renderAsThinkingBox(injectedCharacters);
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🧠 CARROT DEBUG: renderAsThinkingBox returned:', {
                contentLength: renderedContent?.length,
                hasContent: !!renderedContent,
                content: renderedContent
            });
        }
        CarrotDebug.ui('🧠 DISPLAY: Thinking box rendered', {
            contentLength: renderedContent?.length,
            hasContent: !!renderedContent
        });
    } else if (settings.displayMode === 'cards') {
        CarrotDebug.ui('📊 DISPLAY: Rendering cards');
        renderedContent = renderAsCards(injectedCharacters);
        CarrotDebug.ui('📊 DISPLAY: Cards rendered', {
            contentLength: renderedContent?.length,
            hasContent: !!renderedContent
        });
    }
    
    if (renderedContent) {
        // Add to the last message
        const lastMessage = document.querySelector('#chat .mes:last-child');
        const allMessages = document.querySelectorAll('#chat .mes');
        
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🎯 CARROT DEBUG: DOM injection details:', {
                contentLength: renderedContent.length,
                lastMessageExists: !!lastMessage,
                totalMessages: allMessages.length,
                lastMessageId: lastMessage?.getAttribute('mesid'),
                content: renderedContent.substring(0, 200) + '...'
            });
        }
        
        CarrotDebug.ui('🎯 DISPLAY: DOM selection results', {
            lastMessage: !!lastMessage,
            lastMessageId: lastMessage?.getAttribute('mesid'),
            totalMessages: allMessages.length,
            lastFewMessages: Array.from(allMessages).slice(-3).map(msg => ({
                mesid: msg.getAttribute('mesid'),
                isUser: msg.classList.contains('is_user'),
                isSystem: msg.classList.contains('is_system'),
                name: msg.querySelector('.ch_name')?.textContent
            }))
        });
        
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
                if (extension_settings[extensionName]?.debugMode) {
                    console.log('🎯 CARROT DEBUG: Inserting HTML before mesText element');
                }
                mesText.insertAdjacentHTML('beforebegin', renderedContent);
                if (extension_settings[extensionName]?.debugMode) {
                    console.log('✅ CARROT DEBUG: HTML insertion completed, checking if element exists in DOM');
                }
                
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
                if (extension_settings[extensionName]?.debugMode) {
                    console.log('🔍 CARROT DEBUG: Verification - ST-native thinking block element found:', !!insertedElement);
                }
                if (insertedElement) {
                    if (extension_settings[extensionName]?.debugMode) {
                        console.log('📏 CARROT DEBUG: Thinking block dimensions:', {
                            offsetHeight: insertedElement.offsetHeight,
                            offsetWidth: insertedElement.offsetWidth,
                            display: getComputedStyle(insertedElement).display,
                            visibility: getComputedStyle(insertedElement).visibility
                        });
                    }
                    
                    // Mark the message as having CarrotKernel thinking content (separate from ST reasoning)
                    lastMessage.classList.add('carrot-thinking');
                    lastMessage.setAttribute('data-carrot-thinking-state', 'done');
                    
                    // PERSISTENCE: Store character data in message.extra for page refresh survival
                    const messageId = parseInt(lastMessage.getAttribute('mesid'));
                    if (!isNaN(messageId) && chat[messageId]) {
                        if (!chat[messageId].extra) {
                            chat[messageId].extra = {};
                        }
                        
                        // Store CarrotKernel character data in message.extra (like ST's native reasoning)
                        chat[messageId].extra.carrot_character_data = {
                            characters: injectedCharacters,
                            displayMode: settings.displayMode,
                            timestamp: Date.now(),
                            version: '1.0'
                        };
                        
                        // Save the chat to persist the data
                        if (typeof saveChatDebounced === 'function') {
                            saveChatDebounced();
                        }
                        
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
                console.error('❌ CARROT DEBUG: No .mes_text found in last message');
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
        availableLorebooks.forEach(lorebookName => {
            const isSelected = selectedLorebooks.has(lorebookName);
            const isCharacterRepo = characterRepoBooks.has(lorebookName);
            const safeName = lorebookName.replace(/[^a-zA-Z0-9]/g, '_');
            
            html += `
                <div class="carrot-lorebook-item">
                    <div class="carrot-lorebook-main">
                        <label class="carrot-lorebook-checkbox">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                   data-lorebook="${lorebookName}" class="carrot-lorebook-toggle">
                            <span class="carrot-status-indicator ${isSelected ? 'active' : ''}"></span>
                            <span class="carrot-lorebook-name">${lorebookName}</span>
                        </label>
                        <div class="carrot-lorebook-actions">
                            <button class="carrot-repo-btn ${isCharacterRepo ? 'active' : ''}" 
                                    data-lorebook="${lorebookName}" title="Toggle Character Repository">
                                ${isCharacterRepo ? '👤' : '📚'}
                            </button>
                            <span class="carrot-lorebook-status">
                                ${isCharacterRepo ? 'Character Repo' : 'Tag Library'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    listElement.html(html);
}

// Removed storage system - processing immediately like BunnyMoTags

// Process activated lorebook entries (triggered when ST activates lorebook entries)
async function processActivatedLorebookEntries(entryList) {
    const settings = extension_settings[extensionName];
    
    if (!settings.enabled || !entryList || entryList.length === 0) {
        return;
    }
    
    CarrotDebug.startTimer('process-activated-entries', 'SCAN');
    CarrotDebug.scan('🎯 PROCESSING ACTIVATED LOREBOOK ENTRIES', {
        totalEntries: entryList.length,
        characterRepoBooks: Array.from(characterRepoBooks),
        scannedCharacters: scannedCharacters.size,
        availableCharacters: Array.from(scannedCharacters.keys())
    });
    
    // Find activated character repository entries
    const activatedCharacters = [];
    
    // Filter for character entries from selected character repos (exactly like BunnyMoTags)
    const characterRepoBooksList = Array.from(characterRepoBooks);
    CarrotDebug.scan(`🔍 DEBUG: Character repo books configured: ${JSON.stringify(characterRepoBooksList)}`);
    
    // Debug: Check if we have any lorebooks scanned at all
    CarrotDebug.scan(`🔍 DEBUG: Current state`, {
        selectedLorebooks: Array.from(selectedLorebooks),
        characterRepoBooks: Array.from(characterRepoBooks),
        scannedCharacters: scannedCharacters.size,
        scannedCharacterNames: Array.from(scannedCharacters.keys())
    });
    
    // Log all activated entries for debugging
    entryList.forEach((entry, index) => {
        CarrotDebug.scan(`📋 Entry ${index + 1}/${entryList.length}`, {
            world: entry.world,
            key: entry.key,
            comment: entry.comment,
            title: entry.title,
            content: entry.content?.substring(0, 100) + '...',
            isCharacterRepo: characterRepoBooksList.includes(entry.world),
            isInSelectedLorebooks: selectedLorebooks.has(entry.world)
        });
    });
    
    const characterEntries = entryList.filter(entry => {
        // Check if this entry is from a selected character repository
        const isFromCharacterRepo = characterRepoBooksList.includes(entry.world);
        
        if (isFromCharacterRepo) {
            CarrotDebug.scan(`✅ Character entry activated by WorldInfo: ${entry.comment || entry.key?.[0]} from ${entry.world}`);
            return true;
        }
        return false;
    });
    
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
            const characterForStorage = {
                tags: new Map(Object.entries(character.tags)), // Convert to Map for consistency
                source: character.source,
                uid: character.uid
            };
            scannedCharacters.set(character.name, characterForStorage);
            
            CarrotDebug.scan(`📊 Character extracted and stored: ${character.name}`, {
                tagCount: Object.keys(character.tags).length,
                source: character.source,
                uid: character.uid,
                storedInScannedCharacters: scannedCharacters.has(character.name)
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
        lastInjectedCharacters = characterData.map(char => char.name);
        
        // Inject to AI context
        await injectCharacterData(characterData.map(char => char.name));
        
        // Create system message with external cards (like BunnyMoTags)
        const settings = extension_settings[extensionName];
        CarrotDebug.ui(`🔍 DISPLAY MODE DEBUG: settings.displayMode = "${settings.displayMode}"`);
        
        if (settings.displayMode === 'cards') {
            // Create system message and external cards immediately
            CarrotDebug.ui('📊 CARDS MODE: Creating system message immediately');
            await sendCarrotSystemMessage({ characters: characterData });
        } else if (settings.displayMode === 'thinking') {
            // Store character data for thinking blocks when AI message is rendered
            const characterNames = characterData.map(char => char.name);
            pendingThinkingBlockData = characterNames;
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🧠 CARROT DEBUG: Storing thinking block data:', characterNames);
            }
            CarrotDebug.ui('🧠 THINKING MODE: Stored character data for later display', {
                characterNames,
                pendingThinkingBlockDataLength: pendingThinkingBlockData.length
            });
        } else {
            CarrotDebug.ui('⚠️ UNKNOWN DISPLAY MODE:', settings.displayMode);
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

    if (extension_settings[extensionName]?.debugMode) {
        console.log('🔍 CARROT DEBUG: Extracting character from entry:', {
            entryComment: entry.comment,
            entryKey: entry.key,
            extractedName: characterName,
            entryTitle: entry.title || entry.comment
        });
    }
    
    const character = {
        name: characterName,
        tags: {},
        source: entry.world,
        uid: entry.uid
    };
    
    // Parse BunnyMoTags from the entry content (FIX: correct case-sensitive matching)
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🔍 CARROT DEBUG: Entry content preview:', entry.content.substring(0, 200));
    }
    
    // Try both case variations to be safe
    const bunnyTagsMatch = entry.content.match(/<BunnyMoTags>(.*?)<\/BunnyMoTags>/s) || 
                          entry.content.match(/<BunnymoTags>(.*?)<\/BunnymoTags>/s);
    
    if (bunnyTagsMatch) {
        const tagsContent = bunnyTagsMatch[1];
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🔍 CARROT DEBUG: Found BunnyMoTags content:', tagsContent.substring(0, 100));
        }
        
        const tagMatches = tagsContent.match(/<([^:>]+):([^>]+)>/g);
        
        if (tagMatches) {
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 CARROT DEBUG: Found tag matches:', tagMatches);
            }
            
            tagMatches.forEach(tagMatch => {
                const match = tagMatch.match(/<([^:>]+):([^>]+)>/);
                if (match) {
                    const category = match[1].toUpperCase().trim(); // Keep original case for display
                    const value = match[2].trim();
                    
                    if (!character.tags[category]) {
                        character.tags[category] = [];
                    }
                    character.tags[category].push(value);
                    
                    if (extension_settings[extensionName]?.debugMode) {
                        console.log(`🔍 CARROT DEBUG: Added tag - ${category}: ${value}`);
                    }
                }
            });
        } else {
            if (extension_settings[extensionName]?.debugMode) {
                console.log('⚠️ CARROT DEBUG: BunnyMoTags block found but no individual tags matched');
            }
        }
    } else {
        if (extension_settings[extensionName]?.debugMode) {
            console.log('⚠️ CARROT DEBUG: No BunnyMoTags block found in entry content');
        }
    }
    
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

// Create external card container (like BunnyMoTags)
function attachExternalCardsToMessage(messageIndex, characterData) {
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🔧 CARDS EMERGENCY DEBUG: Function called', { messageIndex, characterData });
    }
    
    CarrotDebug.ui('🔧 CARDS DEBUG: Starting card attachment', { 
        messageIndex, 
        characterData,
        dataType: typeof characterData,
        hasCharacters: characterData?.characters,
        characterCount: characterData?.characters?.length 
    });
    
    try {
        const settings = extension_settings[extensionName];
        if (!settings.enabled) {
            CarrotDebug.error('CarrotKernel disabled - blocking card attachment');
            return;
        }
        
        if (!characterData?.characters?.length) {
            CarrotDebug.error('No character data for card attachment', {
                characterData,
                hasCharacters: !!characterData?.characters,
                charactersLength: characterData?.characters?.length
            });
            return;
        }
        
        // Find the system message element
        CarrotDebug.ui('🔧 CARDS DEBUG: Looking for message element', { messageIndex });
        const messageElement = document.querySelector(`div[mesid="${messageIndex}"]`);
        if (!messageElement) {
            CarrotDebug.error('Message element not found', { 
                messageIndex,
                allMessages: Array.from(document.querySelectorAll('[mesid]')).map(el => el.getAttribute('mesid'))
            });
            return;
        }
        
        CarrotDebug.ui('🔧 CARDS DEBUG: Creating card container');
        const cardContainer = createExternalCardContainer(characterData, messageIndex);
        
        CarrotDebug.ui('🔧 CARDS DEBUG: Card container result', {
            containerExists: !!cardContainer,
            containerType: typeof cardContainer,
            isNode: cardContainer instanceof Node,
            isElement: cardContainer instanceof Element,
            nodeName: cardContainer?.nodeName,
            className: cardContainer?.className
        });
        
        if (!cardContainer) {
            CarrotDebug.error('Card container creation failed');
            return;
        }
        
        if (!(cardContainer instanceof Node)) {
            CarrotDebug.error('Card container is not a proper DOM Node', {
                containerType: typeof cardContainer,
                container: cardContainer
            });
            return;
        }
        
        CarrotDebug.ui('🔧 CARDS DEBUG: Attaching container to DOM');
        messageElement.insertAdjacentElement('afterend', cardContainer);
        CarrotDebug.ui(`✅ External cards attached to message ${messageIndex}`);

    } catch (error) {
        CarrotDebug.error('Card attachment failed', { 
            messageIndex, 
            error: error.message,
            stack: error.stack,
            characterData 
        });
        throw error; // Re-throw to see the full stack trace
    }
}

// EXACT BunnyMoTags ensureBunnyMoAnimations function
function ensureBunnyMoAnimations() {
    if (!document.getElementById('bunnymo-animations')) {
        const style = document.createElement('style');
        style.id = 'bunnymo-animations';
        style.textContent = `
            @keyframes bunnymo-glow {
                0% { box-shadow: 0 0 0 2px rgba(255, 100, 255, 0.3), 0 0 20px rgba(100, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4); }
                16% { box-shadow: 0 0 0 2px rgba(100, 255, 100, 0.3), 0 0 25px rgba(255, 100, 255, 0.25), 0 8px 32px rgba(0, 0, 0, 0.4); }
                32% { box-shadow: 0 0 0 2px rgba(255, 255, 100, 0.3), 0 0 20px rgba(100, 255, 100, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4); }
                48% { box-shadow: 0 0 0 2px rgba(100, 255, 255, 0.3), 0 0 25px rgba(255, 255, 100, 0.25), 0 8px 32px rgba(0, 0, 0, 0.4); }
                64% { box-shadow: 0 0 0 2px rgba(255, 100, 100, 0.3), 0 0 20px rgba(100, 100, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4); }
                80% { box-shadow: 0 0 0 2px rgba(255, 200, 100, 0.3), 0 0 25px rgba(200, 100, 255, 0.25), 0 8px 32px rgba(0, 0, 0, 0.4); }
                100% { box-shadow: 0 0 0 2px rgba(255, 100, 255, 0.3), 0 0 20px rgba(100, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4); }
            }
            @keyframes sparkle {
                0%, 100% { opacity: 0.6; transform: translateX(0px); }
                50% { opacity: 1; transform: translateX(-5px); }
            }
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-5px); }
            }
            @keyframes card-color-shift {
                0% { background-position: 0% 50%; }
                25% { background-position: 100% 25%; }
                50% { background-position: 50% 100%; }
                75% { background-position: 25% 0%; }
                100% { background-position: 0% 50%; }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
}

// EXACT BunnyMoTags createExternalCardContainer function
function createExternalCardContainer(characterData, messageIndex) {
    CarrotDebug.ui('Creating external card container', { 
        messageIndex, 
        characterData,
        isArray: Array.isArray(characterData),
        hasCharacters: characterData?.characters,
        characterCount: characterData?.characters?.length 
    });
    
    const characters = Array.isArray(characterData) ? characterData : characterData?.characters || [];
    if (!characters || characters.length === 0) {
        CarrotDebug.error('No characters to render in container', {
            receivedData: characterData,
            charactersExtracted: characters,
            isArray: Array.isArray(characterData)
        });
        return null;
    }
    
    CarrotDebug.ui(`Processing ${characters.length} characters for container creation`);
    const container = document.createElement('div');
    container.className = 'bunnymo-external-cards';
    container.id = `bunnymo-cards-${messageIndex}`;
    container.setAttribute('data-message-id', messageIndex);
    
    // Refined container styling - matches settings design
    container.style.cssText = `
        margin: 12px 0 !important;
        padding: 0 !important;
        background: var(--SmartThemeBlurTintColor, rgba(20, 20, 30, 0.7)) !important;
        backdrop-filter: blur(15px) saturate(120%) !important;
        border-radius: 16px !important;
        overflow: visible !important;
        position: relative !important;
        box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.15),
            0 8px 24px rgba(0, 0, 0, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.15)) !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        height: auto !important;
        width: auto !important;
        z-index: 1000 !important;
    `;

    // Ensure animations are loaded
    ensureBunnyMoAnimations();

    // Subtle accent gradient overlay
    const accentLayer = document.createElement('div');
    accentLayer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, 
            rgba(255, 105, 180, 0.05) 0%, 
            transparent 25%, 
            transparent 75%, 
            rgba(138, 43, 226, 0.05) 100%);
        pointer-events: none;
        z-index: 1;
    `;
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: container.appendChild(accentLayer)', { container, accentLayer });
    }
    container.appendChild(accentLayer);

    // Main content area
    const mainContent = document.createElement('div');
    mainContent.style.cssText = `
        position: relative;
        z-index: 2;
        padding: 0;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
    `;

    // Create refined header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 16px 20px;
        background: var(--SmartThemeHeaderColor, rgba(255, 255, 255, 0.08));
        border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.15));
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const headerTitle = document.createElement('div');
    headerTitle.style.cssText = `
        font-size: 1.1em;
        color: var(--SmartThemeBodyColor, #ff69b4);
        font-weight: 600;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    headerTitle.innerHTML = '🎭 Character Data';
    
    const headerInfo = document.createElement('div');
    headerInfo.style.cssText = `
        font-size: 0.85em;
        color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.7));
        font-weight: 400;
    `;
    headerInfo.textContent = `${characters.length} character${characters.length > 1 ? 's' : ''}`;
    
    // Add refined toggle button
    const toggleButton = document.createElement('div');
    toggleButton.style.cssText = `
        cursor: pointer;
        background: var(--SmartThemeButtonColor, rgba(255, 255, 255, 0.15));
        border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.25));
        border-radius: 8px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: var(--SmartThemeBodyColor, white);
        transition: all 0.2s ease;
        backdrop-filter: blur(5px);
    `;
    toggleButton.innerHTML = '▼';
    toggleButton.title = 'Toggle card visibility';
    
    // Assemble header
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: header.appendChild(headerTitle)', { header, headerTitle });
    }
    header.appendChild(headerTitle);
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: header.appendChild(headerInfo)', { header, headerInfo });
    }
    header.appendChild(headerInfo);
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: header.appendChild(toggleButton)', { header, headerTitle, headerInfo, toggleButton });
    }
    header.appendChild(toggleButton);
    
    // Add character selector if multiple characters
    let activeCharacterIndex = 0;
    if (characters.length > 1) {
        const characterSelector = document.createElement('div');
        characterSelector.style.cssText = `
            display: flex;
            justify-content: center;
            gap: 6px;
            padding: 12px 16px 0;
            flex-wrap: wrap;
        `;
        
        CarrotDebug.ui(`Creating character selector buttons for ${characters.length} characters`);
        
        characters.forEach((character, index) => {
            const charButton = document.createElement('button');
            charButton.className = 'character-selector-btn' + (index === 0 ? ' active' : '');
            charButton.style.cssText = `
                padding: 6px 12px;
                background: ${index === 0 ? 'var(--SmartThemeButtonColor, rgba(255, 105, 180, 0.25))' : 'var(--SmartThemeButtonColor, rgba(255, 255, 255, 0.08))'};
                border: 1px solid ${index === 0 ? 'var(--SmartThemeAccentColor, #ff69b4)' : 'var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.15))'};
                border-radius: 12px;
                color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.9));
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 0.8em;
                font-weight: 500;
                white-space: nowrap;
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            charButton.textContent = character.name || `Character ${index + 1}`;
            charButton.title = character.name || `Character ${index + 1}`;
            
            charButton.addEventListener('click', () => {
                activeCharacterIndex = index;
                // Update selector buttons
                characterSelector.querySelectorAll('.character-selector-btn').forEach((btn, i) => {
                    const isActive = i === index;
                    btn.classList.toggle('active', isActive);
                    btn.style.background = isActive ? 'var(--SmartThemeButtonColor, rgba(255, 105, 180, 0.25))' : 'var(--SmartThemeButtonColor, rgba(255, 255, 255, 0.08))';
                    btn.style.borderColor = isActive ? 'var(--SmartThemeAccentColor, #ff69b4)' : 'var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.15))';
                });
                // Refresh tab content for selected character
                refreshTabContent(characters[index], tabContents);
            });
            
            characterSelector.appendChild(charButton);
        });
        
        header.appendChild(characterSelector);
    }
    
    // Create tabbed navigation
    const tabNavigation = document.createElement('div');
    tabNavigation.className = 'carrot-tabs';
    tabNavigation.style.cssText = `
        display: flex;
        margin-bottom: 16px;
        border-radius: 8px;
        overflow: hidden;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    `;
    
    const tabs = [
        { id: 'personality', label: 'Personality', icon: '🧠', color: '#ff69b4' },
        { id: 'physical', label: 'Physical', icon: '💎', color: '#4ecdc4' },
        { id: 'growth', label: 'Growth', icon: '🌱', color: '#95e1d3' }
    ];
    
    let activeTab = 'personality';
    
    // Create tab buttons with modern glassmorphic design
    tabs.forEach((tab, index) => {
        const tabButton = document.createElement('button');
        tabButton.className = 'carrot-tab' + (index === 0 ? ' active' : '');
        tabButton.setAttribute('data-tab', tab.id);
        
        const isActive = index === 0;
        tabButton.style.cssText = `
            flex: 1;
            padding: 14px 20px;
            background: ${isActive ? `linear-gradient(135deg, ${tab.color}40, ${tab.color}20)` : 'transparent'};
            border: none;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            color: var(--SmartThemeBodyColor, #ffffff);
            font-weight: ${isActive ? '600' : '500'};
            font-size: 0.9em;
            text-shadow: ${isActive ? `0 0 8px ${tab.color}80` : 'none'};
            border-bottom: ${isActive ? `3px solid ${tab.color}` : '3px solid transparent'};
            transform: ${isActive ? 'translateY(-2px)' : 'none'};
            box-shadow: ${isActive ? `0 4px 12px ${tab.color}30` : 'none'};
        `;
        
        // Create enhanced tab content with icon and label
        tabButton.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 1.2em; filter: drop-shadow(0 0 4px ${tab.color});">${tab.icon}</span>
                <span>${tab.label}</span>
            </div>
        `;
        
        // Add hover effects
        tabButton.addEventListener('mouseenter', () => {
            if (!tabButton.classList.contains('active')) {
                tabButton.style.background = `linear-gradient(135deg, ${tab.color}20, ${tab.color}10)`;
                tabButton.style.transform = 'translateY(-1px)';
                tabButton.style.boxShadow = `0 2px 8px ${tab.color}20`;
            }
        });
        
        tabButton.addEventListener('mouseleave', () => {
            if (!tabButton.classList.contains('active')) {
                tabButton.style.background = 'transparent';
                tabButton.style.transform = 'none';
                tabButton.style.boxShadow = 'none';
            }
        });
        
        tabButton.addEventListener('click', () => switchTab(tab.id, tab.color));
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🚨 DEBUG appendChild: tabNavigation.appendChild(tabButton)', { tabNavigation, tabButton, tabId: tab.id });
        }
        tabNavigation.appendChild(tabButton);
    });
    
    // Enhanced tab switching function with smooth animations
    function switchTab(tabId, tabColor) {
        activeTab = tabId;
        
        // Update tab buttons with enhanced styling
        const tabButtons = tabNavigation.querySelectorAll('.carrot-tab');
        tabButtons.forEach(btn => {
            const btnTabId = btn.getAttribute('data-tab');
            const btnTabData = tabs.find(t => t.id === btnTabId);
            const isActive = btnTabId === tabId;
            
            btn.classList.toggle('active', isActive);
            
            // Apply enhanced styling
            if (isActive) {
                btn.style.background = `linear-gradient(135deg, ${btnTabData.color}40, ${btnTabData.color}20)`;
                btn.style.fontWeight = '600';
                btn.style.textShadow = `0 0 8px ${btnTabData.color}80`;
                btn.style.borderBottom = `3px solid ${btnTabData.color}`;
                btn.style.transform = 'translateY(-2px)';
                btn.style.boxShadow = `0 4px 12px ${btnTabData.color}30`;
            } else {
                btn.style.background = 'transparent';
                btn.style.fontWeight = '500';
                btn.style.textShadow = 'none';
                btn.style.borderBottom = '3px solid transparent';
                btn.style.transform = 'none';
                btn.style.boxShadow = 'none';
            }
        });
        
        // Update tab content with smooth transitions
        Object.entries(tabContents).forEach(([tabKey, tabElement]) => {
            const isActive = tabKey === tabId;
            
            if (isActive) {
                // Fade in active tab
                tabElement.style.display = 'block';
                tabElement.style.opacity = '0';
                tabElement.style.transform = 'translateY(10px)';
                
                requestAnimationFrame(() => {
                    tabElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    tabElement.style.opacity = '1';
                    tabElement.style.transform = 'translateY(0)';
                });
            } else {
                // Fade out inactive tabs
                tabElement.style.transition = 'all 0.2s ease';
                tabElement.style.opacity = '0';
                tabElement.style.transform = 'translateY(-5px)';
                
                setTimeout(() => {
                    if (tabElement.style.opacity === '0') {
                        tabElement.style.display = 'none';
                    }
                }, 200);
            }
        });
    }
    
    // Create collapsible content area
    const collapsibleContent = document.createElement('div');
    collapsibleContent.style.cssText = `
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease;
        opacity: 0;
        transform-origin: top;
    `;
    
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: collapsibleContent.appendChild(tabNavigation)', { collapsibleContent, tabNavigation });
    }
    collapsibleContent.appendChild(tabNavigation);
    
    // Content container for tabs with enhanced styling
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
        padding: 24px;
        min-height: 240px;
        background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
        backdrop-filter: blur(12px);
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.15);
        position: relative;
        overflow: hidden;
    `;

    // Create tab content areas with enhanced styling
    const tabContents = {};
    tabs.forEach(tab => {
        const tabContent = document.createElement('div');
        tabContent.className = 'carrot-tab-content';
        tabContent.id = `carrot-tab-${tab.id}`;
        tabContent.style.cssText = `
            display: ${tab.id === 'personality' ? 'block' : 'none'};
            opacity: ${tab.id === 'personality' ? '1' : '0'};
            transform: translateY(0);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🚨 DEBUG appendChild: contentContainer.appendChild(tabContent)', { contentContainer, tabContent, tabId: tab.id });
        }
        contentContainer.appendChild(tabContent);
        tabContents[tab.id] = tabContent; // Store reference
    });
    
    // Process characters and organize by tabs - show first character initially
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[BMT CARDS] Creating tabbed interface for ${characters.length} characters`);
    }
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[BMT CARDS] First character data:`, characters[0]);
    }
    
    if (characters.length > 0) {
            // Characters from our system have different format - need to convert
        const firstChar = characters[0];
        
        // Check if it's already a proper character object or just a name
        let formattedChar;
        if (typeof firstChar === 'string') {
            // It's just a character name, need to get data from scannedCharacters
            const charResult = findCharacterByName(firstChar);
            if (charResult && charResult.data) {
                formattedChar = {
                    name: charResult.name,
                    tags: charResult.data.tags instanceof Map ? Object.fromEntries(charResult.data.tags) : charResult.data.tags
                };
            } else {
                console.error(`[BMT CARDS] No data found for character: ${firstChar}`);
                return;
            }
        } else {
            // It's already a character object
            formattedChar = {
                name: firstChar.name,
                tags: firstChar.tags instanceof Map ? Object.fromEntries(firstChar.tags) : firstChar.tags
            };
        }
        
        if (extension_settings[extensionName]?.debugMode) {
            console.log(`[BMT CARDS] Formatted character:`, formattedChar);
        }
        refreshTabContent(formattedChar, tabContents);
    }

    collapsibleContent.appendChild(contentContainer);
    
    // Add toggle functionality
    let isExpanded = false; // Start collapsed
    toggleButton.addEventListener('click', () => {
        isExpanded = !isExpanded;
        
        if (isExpanded) {
            // Expand
            toggleButton.innerHTML = '▼';
            toggleButton.style.background = 'rgba(255, 105, 180, 0.3)';
            toggleButton.style.borderColor = '#ff69b4';
            collapsibleContent.style.maxHeight = collapsibleContent.scrollHeight + 'px';
            collapsibleContent.style.opacity = '1';
        } else {
            // Collapse
            toggleButton.innerHTML = '▲';
            toggleButton.style.background = 'rgba(255, 255, 255, 0.2)';
            toggleButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            collapsibleContent.style.maxHeight = '0';
            collapsibleContent.style.opacity = '0';
        }
    });
    
    // Add hover effects to toggle button
    toggleButton.addEventListener('mouseenter', () => {
        toggleButton.style.background = isExpanded ? 'rgba(255, 105, 180, 0.4)' : 'rgba(255, 255, 255, 0.3)';
        toggleButton.style.transform = 'scale(1.1)';
    });
    
    toggleButton.addEventListener('mouseleave', () => {
        toggleButton.style.background = isExpanded ? 'rgba(255, 105, 180, 0.3)' : 'rgba(255, 255, 255, 0.2)';
        toggleButton.style.transform = 'scale(1)';
    });

    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: mainContent.appendChild(header)', { mainContent, header });
    }
    mainContent.appendChild(header);
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: mainContent.appendChild(collapsibleContent)', { mainContent, collapsibleContent });
    }
    mainContent.appendChild(collapsibleContent);
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🚨 DEBUG appendChild: container.appendChild(mainContent)', { container, mainContent });
    }
    container.appendChild(mainContent);

    CarrotDebug.ui(`Container created successfully`, {
        characterCount: characters.length,
        containerId: container.id,
        containerChildren: container.children.length
    });

    return container;
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
        if (extension_settings[extensionName]?.debugMode) {
            console.log(`[BMT CARDS] Already showing ${character.name}, skipping refresh`);
        }
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

// EXACT BunnyMoTags createTabbedCharacterCard function
function createTabbedCharacterCard(character, index, tabType) {
    CarrotDebug.ui(`Creating ${tabType} card for ${character?.name}`, {
        characterName: character?.name,
        tagCategories: Object.keys(character?.tags || {}).length,
        tabType
    });
    
    const name = character.name || 'Unknown Character';
    const tags = character.tags || {};
    
    // Ensure animations are loaded
    ensureBunnyMoAnimations();
    const card = document.createElement('div');
    card.className = 'bunnymo-character-card';
    card.style.cssText = `
        margin-bottom: 20px !important;
        padding: 0 !important;
        background: linear-gradient(135deg, rgba(255, 105, 180, 0.15) 0%, rgba(138, 43, 226, 0.15) 30%, rgba(100, 149, 237, 0.15) 60%, rgba(255, 215, 0, 0.15) 100%) !important;
        background-size: 300% 300% !important;
        animation: card-color-shift 12s ease-in-out infinite !important;
        border: 2px solid transparent !important;
        background-clip: padding-box !important;
        border-radius: 16px !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 999 !important;
        box-shadow: 0 4px 20px rgba(255, 105, 180, 0.1) !important;
        overflow: visible !important;
    `;
    
    // Character name header
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `
        padding: 20px 24px 16px;
        background: rgba(255, 255, 255, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        position: relative;
    `;
    
    const nameText = document.createElement('div');
    nameText.style.cssText = `
        font-size: 1.4em;
        color: #ff69b4;
        font-weight: 700;
        text-align: center;
        text-shadow: 0 0 15px #ff69b4, 0 0 25px #ff69b4;
        animation: float 4s ease-in-out infinite;
        margin-bottom: 0;
    `;
    nameText.textContent = name;
    nameDiv.appendChild(nameText);
    card.appendChild(nameDiv);
    
    // Create tab-specific content
    const tabContent = createTabSpecificContent(tags, tabType);
    card.appendChild(tabContent);
    
    return card;
}

// NOTE: I'm being terrible at copying BunnyMoTags exactly. 
// The real functions are 2000+ lines of complex theming and categorization code.
// For now using a simplified version that works - will need to copy the full functions properly later.
function createTabSpecificContent(tags, tabType) {
    console.log('🔍 DEBUG createTabSpecificContent called with:', { tags, tabType });
    
    const container = document.createElement('div');
    container.style.cssText = `padding: 20px 24px;`;
    
    // Define BunnyMoTags-specific categorization with regex patterns
    const bunnyMoCategories = {
        personality: {
            'MBTI Types': {
                pattern: /^(E|I)(N|S)(T|F)(J|P)-[AU]$/,
                icon: '🧠',
                description: 'Myers-Briggs Personality Types'
            },
            'Dere Types': {
                pattern: /^(DERE:|tsundere|yandere|kuudere|dandere|oujidere|sadodere)/i,
                icon: '💖',
                description: 'Character Archetype Classifications'
            },
            'Core Traits': {
                pattern: /^TRAIT:/,
                icon: '⭐',
                description: 'Fundamental Character Traits'
            },
            'Attachment Style': {
                pattern: /^ATTACHMENT:/,
                icon: '🔗',
                description: 'Emotional Attachment Patterns'
            },
            'Conflict Style': {
                pattern: /^CONFLICT:/,
                icon: '⚔️',
                description: 'Approach to Disagreements'
            },
            'Boundaries': {
                pattern: /^BOUNDARIES?:/,
                icon: '🛡️',
                description: 'Personal Boundary Management'
            }
        },
        physical: {
            'Species': {
                pattern: /^SPECIES:/,
                icon: '🧬',
                description: 'Character Species Classification'
            },
            'Build & Form': {
                pattern: /^BUILD:/,
                icon: '💪',
                description: 'Physical Build and Stature'
            },
            'Appearance': {
                pattern: /^(SKIN|HAIR|STYLE):/,
                icon: '✨',
                description: 'Visual Characteristics'
            },
            'Gender & Identity': {
                pattern: /^GENDER:/,
                icon: '👤',
                description: 'Gender Identity'
            },
            'Style & Fashion': {
                pattern: /^(DRESSSTYLE|STYLE):/,
                icon: '👗',
                description: 'Clothing and Fashion Preferences'
            }
        },
        growth: {
            'Psychology': {
                pattern: /^(TRAUMA|JEALOUSY):/,
                icon: '🧠',
                description: 'Psychological Development Areas'
            },
            'Social Dynamics': {
                pattern: /^(CHEMISTRY|FLIRTING):/,
                icon: '💫',
                description: 'Interpersonal Skills and Chemistry'
            },
            'Leadership': {
                pattern: /^POWER:/,
                icon: '👑',
                description: 'Authority and Leadership Styles'
            }
        }
    };
    
    // Kinks section (collapsible in personality tab)
    const kinksCategories = {
        'Intimate Preferences': {
            pattern: /^(ORIENTATION|AROUSAL|ATTRACTION):/,
            icon: '❤️',
            description: 'Sexual and Romantic Preferences'
        },
        'Kinks & Fetishes': {
            pattern: /^KINK:/,
            icon: '🔥',
            description: 'Specific Kinks and Fetishes'
        },
        'Power Dynamics': {
            pattern: /^POWER:/,
            icon: '⚡',
            description: 'Dominant/Submissive Preferences'
        }
    };
    
    // Special sections
    const specialCategories = {
        'Linguistics': {
            pattern: /^LING:/,
            icon: '🗣️',
            description: 'Communication and Speech Patterns'
        },
        'Context': {
            pattern: /^(NAME|GENRE):/,
            icon: '📋',
            description: 'Character Context Information'
        }
    };
    
    // No "Other" section - everything should be properly categorized!
    const organizedTags = {};
    
    // Initialize categories that exist for this tab type - ORGANIZED BY ROYGBIV FLOW
    if (tabType === 'personality') {
        organizedTags['MBTI Types'] = [];           // Red
        organizedTags['Dere Types'] = [];           // Orange  
        organizedTags['Core Traits'] = [];          // Yellow
        organizedTags['Attachment Style'] = [];     // Green
        organizedTags['Social Dynamics'] = [];      // Blue
        organizedTags['Conflict Style'] = [];       // Indigo
        organizedTags['Boundaries'] = [];           // Violet
        organizedTags['Psychology'] = [];           // Purple
        organizedTags['Leadership'] = [];           // Pink
        organizedTags['Intimate & Kinks'] = [];     // Dark Red (merged section)
        organizedTags['Linguistics'] = [];          // Neutral
        organizedTags['Communication'] = [];        // Communication patterns
    } else if (tabType === 'physical') {
        organizedTags['Species'] = [];              // Earth tones
        organizedTags['Build & Form'] = [];         // Metal tones  
        organizedTags['Appearance'] = [];           // Warm tones
        organizedTags['Gender & Identity'] = [];    // Cool tones
        organizedTags['Style & Fashion'] = [];      // Vibrant tones
        organizedTags['Context'] = [];              // Neutral tones
        organizedTags['Identity'] = [];             // Character identity info
    } else if (tabType === 'growth') {
        // Growth tab is reserved for future features - return empty
        return document.createElement('div');
    }
    
    // Simple, direct tag categorization
    console.log('🔍 DEBUG: Processing tags for categorization:', tags);
    console.log('🔍 DEBUG: Available tag categories:', Object.keys(tags));
    
    Object.entries(tags).forEach(([tagCategory, tagList]) => {
        console.log(`🔍 DEBUG: Processing category "${tagCategory}" with tags:`, tagList);
        console.log('🚨 CARROT KERNEL UPDATE TEST - NEW CODE IS RUNNING! 🚨');
        
        if (!Array.isArray(tagList)) {
            console.log(`🔍 DEBUG: Skipping non-array category: ${tagCategory}`, tagList);
            return;
        }
        
        tagList.forEach(tag => {
            let category = 'Other';
            
            // Direct tag categorization based on tag content and category name (FIXED to match BunnyMoTags)
            if (tagCategory.toLowerCase() === 'dere' || /^(tsundere|yandere|kuudere|dandere|oujidere|sadodere)/i.test(tag)) {
                category = 'Dere Types';
            }
            else if (/^(E|I)(N|S)(T|F)(J|P)(-[AU])?$/i.test(tag)) {
                category = 'MBTI Types';
                if (extension_settings[extensionName]?.debugMode) {
                    console.log(`[BMT CARDS] MBTI MATCH: "${tag}" -> "${category}"`);
                }
            }
            else if (tagCategory.toLowerCase() === 'trait') {
                category = 'Core Traits';
            }
            else if (tagCategory.toLowerCase() === 'attachment') {
                category = 'Attachment Style';
            }
            else if (tagCategory.toLowerCase() === 'conflict') {
                category = 'Conflict Style';
            }
            else if (tagCategory.toLowerCase() === 'trauma' || tagCategory.toLowerCase() === 'jealousy') {
                category = 'Psychology';
            }
            else if (tagCategory.toLowerCase() === 'power' && tag.toLowerCase().includes('leadership')) {
                category = 'Leadership';
            }
            else if (['kink', 'chemistry', 'arousal', 'orientation', 'power'].includes(tagCategory.toLowerCase())) {
                category = 'Intimate & Kinks';
            }
            else if (tagCategory.toLowerCase() === 'species') {
                category = 'Species';
            }
            else if (tagCategory.toLowerCase() === 'build') {
                category = 'Build & Form';
            }
            else if (['skin', 'hair', 'style'].includes(tagCategory.toLowerCase())) {
                category = 'Appearance';
            }
            else if (tagCategory.toLowerCase() === 'gender') {
                category = 'Gender & Identity';
            }
            else if (tagCategory.toLowerCase() === 'boundaries') {
                category = 'Boundaries';
            }
            else if (tagCategory.toLowerCase() === 'flirting') {
                category = 'Social Dynamics';
            }
            else if (tagCategory.toLowerCase() === 'gender') {
                category = 'Gender & Identity';
            }
            else if (tagCategory === 'skin' || tagCategory === 'hair' || tag.startsWith('SKIN:') || tag.startsWith('HAIR:') || tag.startsWith('STYLE:')) {
                category = 'Appearance';
            }
            else if (tagCategory === 'dressstyle' || tag.startsWith('DRESSSTYLE:')) {
                category = 'Style & Fashion';
            }
            else if (tagCategory === 'attachment' || tag.startsWith('ATTACHMENT:')) {
                category = 'Attachment Style';
            }
            else if (tagCategory === 'conflict' || tag.startsWith('CONFLICT:')) {
                category = 'Conflict Style';
            }
            else if (tagCategory === 'boundaries' || tag.startsWith('BOUNDARIES:')) {
                category = 'Boundaries';
            }
            else if (tagCategory === 'orientation' || tagCategory === 'arousal' || tagCategory === 'attraction' || tagCategory === 'kink' || tag.startsWith('KINK:')) {
                category = 'Intimate & Kinks';
            }
            else if (tagCategory === 'power' && (tag.includes('DOM') || tag.includes('SUB') || tag.includes('LEADERSHIP'))) {
                if (tag === 'LEADERSHIP') {
                    category = 'Leadership';
                } else {
                    category = 'Intimate & Kinks';  // Power dynamics go to intimate section
                }
            }
            else if (tagCategory === 'trauma' || tagCategory === 'jealousy') {
                category = 'Psychology';
            }
            else if (tagCategory === 'chemistry' || tagCategory === 'flirting') {
                category = 'Social Dynamics';
            }
            else if (tag.startsWith('LING:') || tagCategory.toLowerCase() === 'ling' || tagCategory.toLowerCase() === 'linguistics') {
                category = 'Communication';
            }
            else if (tagCategory.toLowerCase() === 'linguistics_description') {
                category = 'Linguistics';
            }
            else if (tagCategory.toLowerCase() === 'name' || tagCategory.toLowerCase() === 'genre') {
                category = 'Identity';
            }
            
            // Only add if category exists for this tab - NO OTHER SECTION!
            if (organizedTags[category]) {
                // Format tag with category prefix for display (e.g., "SKIN: FAIR" instead of just "FAIR")
                const displayTag = `${tagCategory.toUpperCase()}: ${tag}`;
                organizedTags[category].push(displayTag);
                if (extension_settings[extensionName]?.debugMode) {
                    console.log(`[BMT CARDS] Added "${displayTag}" to "${category}"`);
                }
            } else {
                if (extension_settings[extensionName]?.debugMode) {
                    console.log(`[BMT CARDS] SKIPPING "${tag}" - category "${category}" not available for ${tabType} tab and no Other section`);
                }
            }
        });
    });
    
    // DEBUG: Log final organization
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[BMT CARDS] Final organized tags for ${tabType}:`, organizedTags);
    }
    
    // Create sections for each category that has tags
    Object.entries(organizedTags).forEach(([categoryName, categoryTags]) => {
        if (categoryTags.length === 0) return;
        
        if (extension_settings[extensionName]?.debugMode) {
            console.log(`[BMT CARDS] Creating section for category: ${categoryName} with ${categoryTags.length} tags:`, categoryTags);
        }
        
        // Simple category info mapping
        const categoryInfo = getCategoryInfo(categoryName);
        const isCollapsible = true; // Make all categories collapsible
        
        const section = createTagSection(categoryName, categoryTags, tabType, isCollapsible, categoryInfo);
        container.appendChild(section);
    });
    
    // Always return a container, even if empty (for proper DOM structure)
    if (container.children.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.cssText = 'color: var(--SmartThemeQuoteColor); opacity: 0.7; padding: 20px; text-align: center;';
        emptyMessage.textContent = `No ${tabType} data available`;
        container.appendChild(emptyMessage);
    }
    
    return container;
}

// EXACT BunnyMoTags getCategoryInfo function
function getCategoryInfo(categoryName) {
    const categoryMap = {
        'MBTI Types': { icon: '🧠', description: 'Myers-Briggs Personality Types' },
        'Dere Types': { icon: '💖', description: 'Character Archetype Classifications' },
        'Core Traits': { icon: '⭐', description: 'Fundamental Character Traits' },
        'Attachment Style': { icon: '🔗', description: 'Emotional Attachment Patterns' },
        'Conflict Style': { icon: '⚔️', description: 'Approach to Disagreements' },
        'Boundaries': { icon: '🛡️', description: 'Personal Boundary Management' },
        'Species': { icon: '🧬', description: 'Character Species Classification' },
        'Build & Form': { icon: '💪', description: 'Physical Build and Stature' },
        'Appearance': { icon: '✨', description: 'Visual Characteristics' },
        'Gender & Identity': { icon: '👤', description: 'Gender Identity' },
        'Style & Fashion': { icon: '👗', description: 'Clothing and Fashion Preferences' },
        'Psychology': { icon: '🧠', description: 'Psychological Development Areas' },
        'Social Dynamics': { icon: '💫', description: 'Interpersonal Skills and Chemistry' },
        'Leadership': { icon: '👑', description: 'Authority and Leadership Styles' },
        'Intimate Preferences': { icon: '❤️', description: 'Sexual and Romantic Preferences' },
        'Kinks & Fetishes': { icon: '🔥', description: 'Specific Kinks and Fetishes' },
        'Power Dynamics': { icon: '⚡', description: 'Dominant/Submissive Preferences' },
        'Linguistics': { icon: '🗣️', description: 'Communication and Speech Patterns' },
        'Communication': { icon: '💬', description: 'Speech and Communication Patterns' },
        'Context': { icon: '📋', description: 'Character Context Information' },
        'Identity': { icon: '🆔', description: 'Character Identity and Background' },
        'Other': { icon: '📦', description: 'Miscellaneous tags' }
    };
    
    return categoryMap[categoryName] || { icon: '📦', description: 'Miscellaneous tags' };
}

// EXACT BunnyMoTags createTagSection function with full theming system
function createTagSection(categoryName, tags, tabType, isCollapsible = false, categoryInfo = {}) {
    // COHESIVE PROFESSIONAL ROYGBIV THEMING SYSTEM
    const bunnyMoThemes = {
        // PERSONALITY TAB - ROYGBIV FLOW WITH PROFESSIONAL STYLING
        'MBTI Types': {
            color: '#e53e3e',
            background: 'linear-gradient(135deg, rgba(254, 215, 215, 0.95) 0%, rgba(254, 178, 178, 0.9) 25%, rgba(252, 165, 165, 0.9) 50%, rgba(248, 113, 113, 0.85) 75%, rgba(239, 68, 68, 0.9) 100%)',
            border: '2px solid #e53e3e',
            textColor: '#742a2a',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-red',
            headerBg: 'linear-gradient(135deg, rgba(229, 62, 62, 0.7), rgba(197, 48, 48, 0.8))',
            shadow: '0 4px 12px rgba(229, 62, 62, 0.25)'
        },
        'Dere Types': {
            color: '#dd6b20',
            background: 'linear-gradient(135deg, rgba(254, 235, 200, 0.95) 0%, rgba(251, 211, 141, 0.9) 25%, rgba(245, 158, 11, 0.9) 50%, rgba(217, 119, 6, 0.85) 75%, rgba(180, 83, 9, 0.9) 100%)',
            border: '2px solid #dd6b20',
            textColor: '#744210',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-orange',
            headerBg: 'linear-gradient(135deg, rgba(221, 107, 32, 0.7), rgba(192, 86, 33, 0.8))',
            shadow: '0 4px 12px rgba(221, 107, 32, 0.25)'
        },
        'Core Traits': {
            color: '#d69e2e',
            background: 'linear-gradient(135deg, rgba(254, 240, 138, 0.95) 0%, rgba(251, 191, 36, 0.9) 25%, rgba(245, 158, 11, 0.9) 50%, rgba(217, 119, 6, 0.85) 75%, rgba(180, 83, 9, 0.9) 100%)',
            border: '2px solid #d69e2e',
            textColor: '#744210',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-yellow',
            headerBg: 'linear-gradient(135deg, rgba(214, 158, 46, 0.7), rgba(183, 121, 31, 0.8))',
            shadow: '0 4px 12px rgba(214, 158, 46, 0.25)'
        },
        'Attachment Style': {
            color: '#38a169',
            background: 'linear-gradient(135deg, rgba(220, 252, 231, 0.95) 0%, rgba(167, 243, 208, 0.9) 25%, rgba(110, 231, 183, 0.9) 50%, rgba(52, 211, 153, 0.85) 75%, rgba(16, 185, 129, 0.9) 100%)',
            border: '2px solid #38a169',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-green',
            headerBg: 'linear-gradient(135deg, rgba(56, 161, 105, 0.7), rgba(47, 133, 90, 0.8))',
            shadow: '0 4px 12px rgba(56, 161, 105, 0.25)'
        },
        'Social Dynamics': {
            color: '#3182ce',
            background: 'linear-gradient(135deg, rgba(219, 234, 254, 0.95) 0%, rgba(147, 197, 253, 0.9) 25%, rgba(96, 165, 250, 0.9) 50%, rgba(59, 130, 246, 0.85) 75%, rgba(37, 99, 235, 0.9) 100%)',
            border: '2px solid #3182ce',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-blue',
            headerBg: 'linear-gradient(135deg, rgba(49, 130, 206, 0.7), rgba(44, 82, 130, 0.8))',
            shadow: '0 4px 12px rgba(49, 130, 206, 0.25)'
        },
        'Conflict Style': {
            color: '#553c9a',
            background: 'linear-gradient(135deg, rgba(238, 230, 255, 0.95) 0%, rgba(221, 214, 254, 0.9) 25%, rgba(196, 181, 253, 0.9) 50%, rgba(147, 51, 234, 0.85) 75%, rgba(126, 34, 206, 0.9) 100%)',
            border: '2px solid #553c9a',
            textColor: '#2d3748',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-indigo',
            headerBg: 'linear-gradient(135deg, rgba(85, 60, 154, 0.7), rgba(68, 51, 122, 0.8))',
            shadow: '0 4px 12px rgba(85, 60, 154, 0.25)'
        },
        'Boundaries': {
            color: '#805ad5',
            background: 'linear-gradient(135deg, rgba(245, 243, 255, 0.95) 0%, rgba(221, 214, 254, 0.9) 25%, rgba(196, 181, 253, 0.9) 50%, rgba(168, 85, 247, 0.85) 75%, rgba(147, 51, 234, 0.9) 100%)',
            border: '2px solid #805ad5',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-violet',
            headerBg: 'linear-gradient(135deg, rgba(128, 90, 213, 0.7), rgba(107, 70, 193, 0.8))',
            shadow: '0 4px 12px rgba(128, 90, 213, 0.25)'
        },
        'Psychology': {
            color: '#9f7aea',
            background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(221, 214, 254, 0.9) 25%, rgba(196, 181, 253, 0.9) 50%, rgba(168, 85, 247, 0.85) 75%, rgba(147, 51, 234, 0.9) 100%)',
            border: '2px solid #9f7aea',
            textColor: '#2d3748',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-purple',
            headerBg: 'linear-gradient(135deg, rgba(159, 122, 234, 0.7), rgba(128, 90, 213, 0.8))',
            shadow: '0 4px 12px rgba(159, 122, 234, 0.25)'
        },
        'Leadership': {
            color: '#d53f8c',
            background: 'linear-gradient(135deg, rgba(254, 215, 226, 0.95) 0%, rgba(251, 182, 206, 0.9) 25%, rgba(244, 114, 182, 0.9) 50%, rgba(236, 72, 153, 0.85) 75%, rgba(219, 39, 119, 0.9) 100%)',
            border: '2px solid #d53f8c',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-pink',
            headerBg: 'linear-gradient(135deg, rgba(213, 63, 140, 0.7), rgba(184, 50, 128, 0.8))',
            shadow: '0 4px 12px rgba(213, 63, 140, 0.25)'
        },
        
        // MERGED INTIMATE & KINKS - FLASHY DARK RED
        'Intimate & Kinks': {
            color: '#dc2626',
            background: 'linear-gradient(135deg, #220506 0%, #450a0a 25%, #7f1d1d 50%, #991b1b 75%, #b91c1c 100%)',
            border: '4px solid #dc2626',
            textColor: '#ffffff',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'intimate-flashy',
            headerBg: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
            shadow: '0 12px 40px rgba(220, 38, 38, 0.6), 0 0 30px rgba(220, 38, 38, 0.3)',
            glow: '0 0 30px rgba(220, 38, 38, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        },
        
        // NEUTRAL/SPECIAL CATEGORIES  
        'Linguistics': {
            color: '#718096',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e0 100%)',
            border: '2px solid #718096',
            textColor: '#1a202c',
            font: '"Courier New", monospace',
            style: 'professional-neutral',
            headerBg: 'linear-gradient(135deg, #718096, #4a5568)',
            shadow: '0 4px 12px rgba(113, 128, 150, 0.25)'
        },
        'Communication': {
            color: '#48bb78',
            background: 'linear-gradient(135deg, #f0fff4 0%, #c6f6d5 100%)',
            border: '2px solid #48bb78',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-communication',
            headerBg: 'linear-gradient(135deg, #48bb78, #38a169)',
            shadow: '0 4px 12px rgba(72, 187, 120, 0.25)'
        },
        
        // PHYSICAL TAB - COHESIVE EARTH/NATURAL TONES
        'Species': {
            color: '#8b4513',
            background: 'linear-gradient(135deg, #f7fafc 0%, #e2e8f0 100%)',
            border: '2px solid #8b4513',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-earth',
            headerBg: 'linear-gradient(135deg, #8b4513, #a0522d)',
            shadow: '0 4px 12px rgba(139, 69, 19, 0.25)'
        },
        'Build & Form': {
            color: '#4a5568',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e0 100%)',
            border: '2px solid #4a5568',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-steel',
            headerBg: 'linear-gradient(135deg, #4a5568, #2d3748)',
            shadow: '0 4px 12px rgba(74, 85, 104, 0.25)'
        },
        'Appearance': {
            color: '#ed8936',
            background: 'linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%)',
            border: '2px solid #ed8936',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-warm',
            headerBg: 'linear-gradient(135deg, #ed8936, #dd6b20)',
            shadow: '0 4px 12px rgba(237, 137, 54, 0.25)'
        },
        'Gender & Identity': {
            color: '#4299e1',
            background: 'linear-gradient(135deg, #ebf8ff 0%, #bee3f8 100%)',
            border: '2px solid #4299e1',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-cool',
            headerBg: 'linear-gradient(135deg, #4299e1, #3182ce)',
            shadow: '0 4px 12px rgba(66, 153, 225, 0.25)'
        },
        'Style & Fashion': {
            color: '#9f7aea',
            background: 'linear-gradient(135deg, #faf5ff 0%, #e9d8fd 100%)',
            border: '2px solid #9f7aea',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-vibrant',
            headerBg: 'linear-gradient(135deg, #9f7aea, #805ad5)',
            shadow: '0 4px 12px rgba(159, 122, 234, 0.25)'
        },
        'Context': {
            color: '#718096',
            background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
            border: '2px solid #718096',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-context',
            headerBg: 'linear-gradient(135deg, #718096, #4a5568)',
            shadow: '0 4px 12px rgba(113, 128, 150, 0.25)'
        },
        'Identity': {
            color: '#2b6cb0',
            background: 'linear-gradient(135deg, #ebf8ff 0%, #bee3f8 100%)',
            border: '2px solid #2b6cb0',
            textColor: '#1a202c',
            font: 'system-ui, -apple-system, sans-serif',
            style: 'professional-identity',
            headerBg: 'linear-gradient(135deg, #2b6cb0, #2c5282)',
            shadow: '0 4px 12px rgba(43, 108, 176, 0.25)'
        }
    };
    
    const theme = bunnyMoThemes[categoryName] || bunnyMoThemes['Context'];
    
    // DEBUG: Log theme selection
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[BMT CARDS] Selected theme for category "${categoryName}":`, theme);
    }
    
    const section = document.createElement('div');
    
    // Apply glassmorphic styling with gradient tinting
    let sectionStyles = `
        margin-bottom: 24px;
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: linear-gradient(135deg, 
            rgba(0, 0, 0, 0.6) 0%, 
            rgba(0, 0, 0, 0.7) 50%, 
            rgba(0, 0, 0, 0.6) 100%), 
            ${theme.color}40;
        backdrop-filter: blur(8px) saturate(120%);
        -webkit-backdrop-filter: blur(8px) saturate(120%);
        font-family: ${theme.font};
        position: relative;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    `;
    
    // Add special effects based on style
    if (theme.style === 'cyberpunk') {
        sectionStyles += `
            animation: videogame-pulse 2s ease-in-out infinite alternate;
            text-shadow: ${theme.glow};
        `;
    } else if (theme.style === 'intimate-flashy') {
        sectionStyles += `
            animation: intimate-pulse 3s ease-in-out infinite alternate;
            box-shadow: ${theme.shadow}, ${theme.glow};
            transform: scale(1.02);
        `;
    } else if (theme.style === 'mystical') {
        sectionStyles += `
            animation: mystical-rotate 20s linear infinite;
        `;
    } else if (theme.style === 'ancient') {
        sectionStyles += `
            box-shadow: inset 0 2px 4px rgba(139, 69, 19, 0.3), ${theme.shadow};
        `;
    }
    
    section.style.cssText = sectionStyles;
    
    // Create header with BOLD theme-specific styling
    const header = document.createElement('div');
    let headerStyles = `
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: ${theme.headerBg};
        border-bottom: 3px solid ${theme.color};
        font-weight: 700;
        font-size: 1.1em;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        position: relative;
    `;
    
    // Style-specific header customizations
    if (theme.style === 'cyberpunk') {
        headerStyles += `
            color: ${theme.textColor};
            text-shadow: ${theme.glow};
            text-transform: uppercase;
            letter-spacing: 2px;
            font-family: ${theme.font};
        `;
    } else if (theme.style === 'newspaper') {
        headerStyles += `
            color: white;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 4px double #2c3e50;
        `;
    } else if (theme.style === 'royal') {
        headerStyles += `
            color: #2d3436;
            text-transform: capitalize;
            font-variant: small-caps;
            border-bottom: 4px double #e67e22;
        `;
    } else if (theme.style === 'ancient') {
        headerStyles += `
            color: #654321;
            font-variant: small-caps;
            border-bottom: 5px ridge #8b4513;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        `;
    } else {
        headerStyles += `
            color: white;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            font-weight: 800;
        `;
    }
    
    header.style.cssText = headerStyles;
    
    const title = document.createElement('div');
    title.style.cssText = `
        color: white;
        font-weight: 800;
        font-size: 1.1em;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
        ${theme.style === 'magazine' ? 'text-transform: uppercase; letter-spacing: 1px;' : ''}
        ${theme.style === 'videogame' ? 'text-shadow: ' + theme.glow + ';' : ''}
    `;
    // Use icon from categoryInfo if available
    const icon = categoryInfo.icon || '📦';
    title.innerHTML = `${icon} ${categoryName}`;
    
    // Add tooltip with description if available
    if (categoryInfo.description) {
        title.title = categoryInfo.description;
    }
    
    const count = document.createElement('div');
    count.style.cssText = `
        background: rgba(255, 255, 255, 0.9);
        color: #2d3436;
        padding: 8px 12px;
        border-radius: 50%;
        font-size: 1em;
        font-weight: 900;
        min-width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid ${theme.color};
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        text-shadow: none;
    `;
    count.textContent = tags.length;
    
    header.appendChild(title);
    
    // Add collapse toggle for kinks section
    if (isCollapsible) {
        const collapseToggle = document.createElement('div');
        collapseToggle.style.cssText = `
            color: white;
            cursor: pointer;
            font-size: 1.2em;
            font-weight: bold;
            padding: 0 8px;
            transition: transform 0.3s ease;
            user-select: none;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
        `;
        collapseToggle.innerHTML = '👁️'; // Start with expanded icon
        collapseToggle.title = 'Click to toggle visibility';
        
        // Add count and toggle together
        const rightSection = document.createElement('div');
        rightSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        rightSection.appendChild(count);
        rightSection.appendChild(collapseToggle);
        header.appendChild(rightSection);
    } else {
        header.appendChild(count);
    }
    
    // Create tags grid with READABLE, theme-specific styling
    const tagsGrid = document.createElement('div');
    
    let gridStyles = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
        padding: 16px 20px 20px;
        transition: all 0.3s ease;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(15px) saturate(180%);
        -webkit-backdrop-filter: blur(15px) saturate(180%);
        border-radius: 0 0 16px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.15);
    `;
    
    // Style-specific grid backgrounds - READABLE!
    if (theme.style === 'newspaper') {
        gridStyles += `background: rgba(255, 255, 255, 0.8);`;
    } else if (theme.style === 'intimate-flashy') {
        gridStyles += `
            background: linear-gradient(135deg, rgba(34, 5, 6, 0.9) 0%, rgba(69, 10, 10, 0.8) 50%, rgba(127, 29, 29, 0.7) 100%);
            padding: 12px 16px 16px;
        `;
    } else if (theme.style === 'cyberpunk') {
        gridStyles += `background: rgba(10, 10, 15, 0.7);`;
    } else if (theme.style === 'royal') {
        gridStyles += `background: rgba(255, 234, 167, 0.3);`;
    } else if (theme.style === 'ancient') {
        gridStyles += `background: rgba(244, 228, 188, 0.4);`;
    } else if (theme.style === 'industrial') {
        gridStyles += `background: rgba(178, 190, 195, 0.2);`;
    } else if (theme.style === 'glamorous') {
        gridStyles += `background: rgba(253, 121, 168, 0.1);`;
    }
    
    tagsGrid.style.cssText = gridStyles;
    
    tags.forEach(tag => {
        const tagElement = document.createElement('div');
        
        // Compact, readable tag styling with proper text handling
        let tagStyles = `
            padding: 8px 10px;
            font-size: 0.85em;
            font-weight: 600;
            text-align: center;
            transition: all 0.3s ease;
            cursor: pointer;
            border-radius: 8px;
            font-family: ${theme.font};
            min-height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1.2;
            word-break: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
            white-space: normal;
            overflow: hidden;
            box-sizing: border-box;
        `;
        
        // Style-specific tag designs - BIGGER AND MORE VISIBLE!
        if (theme.style === 'intimate-flashy') {
            tagStyles += `
                background: linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b);
                color: #ffffff;
                border: 3px solid #dc2626;
                font-weight: 800;
                box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
            `;
        } else {
            tagStyles += `
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.25) 50%, rgba(255, 255, 255, 0.35) 100%);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.4);
                color: rgba(255, 255, 255, 0.95);
                font-weight: 700;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                border-radius: 12px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
            `;
        }
        
        tagElement.style.cssText = tagStyles;
        
        // Keep full tag display with category prefixes (e.g., "SKIN: FAIR")
        let displayText = tag;
        
        // Format the display text nicely - preserve natural spacing
        displayText = displayText.replace(/_/g, ' ').trim();
        
        // Only add spaces before capitals if there's no existing space and it's not at the start
        displayText = displayText.replace(/([a-z])([A-Z])/g, '$1 $2');
        
        // Clean up multiple spaces and capitalize first letter only
        displayText = displayText.replace(/\s+/g, ' ').trim();
        if (displayText.length > 0) {
            displayText = displayText.charAt(0).toUpperCase() + displayText.slice(1);
        }
        
        tagElement.textContent = displayText;
        tagElement.setAttribute('data-original-tag', tag); // Keep original for WB search
        
        // Add click handler for WB linking
        tagElement.addEventListener('click', (e) => {
            e.preventDefault();
            const originalTag = tagElement.getAttribute('data-original-tag') || tag;
            expandTag(originalTag, tagElement);
        });
        
        // ENHANCED hover effects for bigger tags
        tagElement.addEventListener('mouseenter', function() {
            if (theme.style === 'intimate-flashy') {
                this.style.transform = 'translateY(-3px) scale(1.05)';
                this.style.boxShadow = '0 12px 35px rgba(220, 38, 38, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.2)';
            } else {
                this.style.transform = 'translateY(-3px) scale(1.05)';
                this.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 1)';
            }
        });
        
        tagElement.addEventListener('mouseleave', function() {
            // Reset to original styles on mouse leave
            this.style.transform = 'translateY(0) scale(1)';
            this.style.cssText = tagStyles;
        });
        
        tagsGrid.appendChild(tagElement);
    });
    
    section.appendChild(header);
    section.appendChild(tagsGrid);
    
    // Add toggle functionality for collapsible sections
    if (isCollapsible) {
        const collapseToggle = header.querySelector('div[title="Click to toggle visibility"]');
        if (collapseToggle) {
            let isExpanded = true; // Start expanded
            
            collapseToggle.addEventListener('click', () => {
                isExpanded = !isExpanded;
                
                if (isExpanded) {
                    tagsGrid.style.display = 'grid';
                    collapseToggle.style.transform = 'rotate(90deg)';
                    collapseToggle.innerHTML = '👁️';
                } else {
                    tagsGrid.style.display = 'none';
                    collapseToggle.style.transform = 'rotate(0deg)';
                    collapseToggle.innerHTML = '👁️‍🗨️';
                }
            });
        }
    }
    
    return section;
}

// EXACT BunnyMoTags expandTag function
function expandTag(tag, tagElement) {
    // Check if popup already exists
    const existingPopup = document.querySelector('.bunnymo-tag-popup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Create popup
    const popup = document.createElement('div');
    popup.className = 'bunnymo-tag-popup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(20, 20, 30, 0.95);
        backdrop-filter: blur(15px);
        border: 2px solid rgba(255, 105, 180, 0.5);
        border-radius: 12px;
        padding: 20px;
        z-index: 10000;
        max-width: 400px;
        min-width: 300px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: fadeIn 0.3s ease;
    `;
    
    // Create content
    const content = document.createElement('div');
    content.innerHTML = `
        <div style="color: #ff69b4; font-size: 1.2em; font-weight: bold; margin-bottom: 15px; text-align: center;">
            📋 Tag Details
        </div>
        <div style="color: rgba(255, 255, 255, 0.9); margin-bottom: 15px;">
            <strong style="color: #00ffff;">Tag:</strong> ${tag}
        </div>
        <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9em; margin-bottom: 15px; line-height: 1.4;">
            This tag represents a character trait or attribute. Click the button below to search for related WorldBook entries.
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button class="wb-search-btn" style="
                background: linear-gradient(135deg, #ff69b4, #9370db);
                border: none;
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s ease;
            ">🔍 Search WorldBook</button>
            <button class="close-popup-btn" style="
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: rgba(255, 255, 255, 0.9);
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.3s ease;
            ">✕ Close</button>
        </div>
    `;
    
    popup.appendChild(content);
    
    // Add event listeners
    const wbSearchBtn = popup.querySelector('.wb-search-btn');
    const closeBtn = popup.querySelector('.close-popup-btn');
    
    wbSearchBtn.addEventListener('click', () => {
        searchWorldBook(tag);
        popup.remove();
    });
    
    closeBtn.addEventListener('click', () => {
        popup.remove();
    });
    
    // Close on background click
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    });
    
    // Add hover effects
    wbSearchBtn.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
        this.style.boxShadow = '0 4px 15px rgba(255, 105, 180, 0.4)';
    });
    
    wbSearchBtn.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = 'none';
    });
    
    document.body.appendChild(popup);
}

// EXACT BunnyMoTags searchWorldBook function
function searchWorldBook(tag) {
    try {
        // Try to access SillyTavern's WorldBook functionality
        if (typeof window.world_info_character_cards !== 'undefined') {
            // Search through world info entries
            if (extension_settings[extensionName]?.debugMode) {
                console.log(`[BMT SYSTEM] Searching WorldBook for tag: ${tag}`);
            }
            
            // Create a temporary search popup
            const searchPopup = document.createElement('div');
            searchPopup.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(20, 20, 30, 0.95);
                backdrop-filter: blur(15px);
                border: 2px solid rgba(0, 255, 255, 0.5);
                border-radius: 12px;
                padding: 15px;
                z-index: 10001;
                max-width: 350px;
                animation: fadeIn 0.3s ease;
            `;
            
            searchPopup.innerHTML = `
                <div style="color: #00ffff; font-weight: bold; margin-bottom: 10px;">🔍 WorldBook Search</div>
                <div style="color: rgba(255, 255, 255, 0.9); font-size: 0.9em;">
                    Searching for entries related to: <strong style="color: #ff69b4;">${tag}</strong>
                </div>
                <div style="margin-top: 10px; text-align: right;">
                    <button style="
                        background: rgba(255, 255, 255, 0.2);
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.8em;
                    " onclick="this.parentElement.parentElement.remove()">Close</button>
                </div>
            `;
            
            document.body.appendChild(searchPopup);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                if (searchPopup.parentElement) {
                    searchPopup.remove();
                }
            }, 3000);
            
        } else {
            // Fallback notification
            if (extension_settings[extensionName]?.debugMode) {
                console.log(`[BMT SYSTEM] WorldBook search not available for tag: ${tag}`);
            }
            
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(220, 20, 60, 0.9);
                color: white;
                padding: 10px 15px;
                border-radius: 6px;
                z-index: 10001;
                font-size: 0.9em;
                animation: fadeIn 0.3s ease;
            `;
            notification.textContent = `WorldBook search not available`;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 2000);
        }
    } catch (error) {
        console.error('[BunnyMoTags] Error searching WorldBook:', error);
    }
}

// Old createCharacterCard function (keeping for compatibility)
function createCharacterCard(character, index) {
    const card = document.createElement('div');
    card.className = 'bunnymo-character-card';
    card.style.cssText = `
        margin-bottom: 20px !important;
        padding: 0 !important;
        background: linear-gradient(135deg, rgba(255, 105, 180, 0.15) 0%, rgba(138, 43, 226, 0.15) 30%, rgba(100, 149, 237, 0.15) 60%, rgba(255, 215, 0, 0.15) 100%) !important;
        background-size: 300% 300% !important;
        animation: card-color-shift 12s ease-in-out infinite !important;
        border: 2px solid transparent !important;
        background-clip: padding-box !important;
        border-radius: 16px !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 999 !important;
        box-shadow: 0 4px 20px rgba(255, 105, 180, 0.1) !important;
        overflow: visible !important;
    `;
    
    // Character name header (exact BunnyMoTags styling)
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `
        padding: 20px 24px 16px;
        background: rgba(255, 255, 255, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        position: relative;
    `;
    
    const nameText = document.createElement('div');
    nameText.style.cssText = `
        font-size: 1.4em;
        color: #ff69b4;
        font-weight: 700;
        text-align: center;
        text-shadow: 0 0 15px #ff69b4, 0 0 25px #ff69b4;
        animation: float 4s ease-in-out infinite;
        margin-bottom: 0;
    `;
    nameText.textContent = character.name || 'Unknown Character';
    nameDiv.appendChild(nameText);
    card.appendChild(nameDiv);
    
    // Character tags content
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'padding: 20px 24px;';
    
    const tags = character.tags || {};
    
    Object.entries(tags).forEach(([category, tagArray]) => {
        if (tagArray && tagArray.length > 0) {
            const categorySection = document.createElement('div');
            categorySection.style.cssText = 'margin-bottom: 20px;';
            
            const categoryHeader = document.createElement('div');
            categoryHeader.style.cssText = `
                font-size: 1.1em;
                color: #00ffff;
                font-weight: 600;
                margin-bottom: 12px;
                text-shadow: 0 0 10px #00ffff;
                text-transform: uppercase;
                letter-spacing: 1px;
            `;
            categoryHeader.textContent = category;
            categorySection.appendChild(categoryHeader);
            
            const tagsGrid = document.createElement('div');
            tagsGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 8px;
                margin-bottom: 16px;
            `;
            
            tagArray.forEach(tag => {
                const tagElement = document.createElement('div');
                tagElement.style.cssText = `
                    background: linear-gradient(135deg, rgba(255, 105, 180, 0.2), rgba(138, 43, 226, 0.2));
                    border: 1px solid rgba(255, 105, 180, 0.4);
                    border-radius: 20px;
                    padding: 8px 12px;
                    text-align: center;
                    font-size: 0.9em;
                    color: rgba(255, 255, 255, 0.9);
                    transition: all 0.3s ease;
                    cursor: default;
                    backdrop-filter: blur(10px);
                `;
                tagElement.textContent = tag;
                
                // Add hover effect
                tagElement.addEventListener('mouseenter', () => {
                    tagElement.style.background = 'linear-gradient(135deg, rgba(255, 105, 180, 0.3), rgba(138, 43, 226, 0.3))';
                    tagElement.style.transform = 'translateY(-2px)';
                    tagElement.style.boxShadow = '0 4px 12px rgba(255, 105, 180, 0.3)';
                });
                
                tagElement.addEventListener('mouseleave', () => {
                    tagElement.style.background = 'linear-gradient(135deg, rgba(255, 105, 180, 0.2), rgba(138, 43, 226, 0.2))';
                    tagElement.style.transform = 'translateY(0)';
                    tagElement.style.boxShadow = 'none';
                });
                
                tagsGrid.appendChild(tagElement);
            });
            
            categorySection.appendChild(tagsGrid);
            contentDiv.appendChild(categorySection);
        }
    });
    
    card.appendChild(contentDiv);
    return card;
}

// ============================================================================
// PERSISTENT BUNNYMOTAGS SYSTEM
// ============================================================================
// Adds <BunnyMoTags> blocks to AI messages after they respond, hidden from AI context

// Add persistent <BunnyMoTags> to the last AI message after response
async function addPersistentTagsToMessage(messageId) {
    const settings = extension_settings[extensionName];
    
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
        const message = chat.find(msg => msg.index === messageId);
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
        lastInjectedCharacters = [];
        
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
        const charData = scannedCharacters.get(charName);
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
        window.Generate = function(...args) {
            // Filter BunnyMoTags from context before generation
            const settings = extension_settings[extensionName];
            if (settings.enabled && settings.filterFromContext) {
                // Process chat messages to remove BunnyMoTags from AI context
                if (chat && Array.isArray(chat)) {
                    // Temporarily filter BunnyMoTags from message content for AI context
                    const originalMessages = chat.map(msg => ({
                        ...msg,
                        originalMes: msg.mes
                    }));
                    
                    chat.forEach(msg => {
                        if (msg.mes && typeof msg.mes === 'string') {
                            msg.mes = removeBunnyMoTagsFromString(msg.mes);
                        }
                    });
                    
                    // Call original Generate function
                    const result = originalGenerate.apply(this, args);
                    
                    // Restore original messages after generation
                    originalMessages.forEach((originalMsg, index) => {
                        if (chat[index] && originalMsg.originalMes) {
                            chat[index].mes = originalMsg.originalMes;
                        }
                    });
                    
                    return result;
                }
            }
            
            // If filtering disabled or no chat, call original function
            return originalGenerate.apply(this, args);
        };
        
        CarrotDebug.init('✅ BunnyMoTags context filtering initialized');
    } else {
        CarrotDebug.error('❌ Could not hook into Generate function for context filtering');
    }
}

// OLD CHARACTER CONSISTENCY PIPELINE REMOVED - Now using WORLD_INFO_ACTIVATED event system

// Update status panels with current state
function updateStatusPanels() {
    const settings = extension_settings[extensionName];

    // System Status Panel
    const systemStatus = $('#carrot-system-status');
    const systemDetail = $('#carrot-system-detail');
    const systemIndicator = $('#carrot-system-indicator');

    if (settings.enabled) {
        systemStatus.text('Active and Ready');
        systemDetail.text('Click to open tutorial');
        systemIndicator.removeClass('error warning').addClass('success');
        $('.carrot-status-system').addClass('initialized');
    } else {
        systemStatus.text('Disabled');
        systemDetail.text('Click to learn how to enable');
        systemIndicator.removeClass('success warning').addClass('error');
        $('.carrot-status-system').removeClass('initialized');
    }

    // Repository Status Panel
    const repoStatus = $('#carrot-repo-status');
    const repoDetail = $('#carrot-repo-detail');
    const repoIndicator = $('#carrot-repo-indicator');

    const characterCount = scannedCharacters.size;
    const selectedCount = selectedLorebooks.size;
    const repoCount = characterRepoBooks.size;

    if (characterCount > 0) {
        repoStatus.text(`${characterCount} characters indexed`);
        repoDetail.text(`From ${repoCount} repositories`);
        repoIndicator.removeClass('error warning').addClass('success');
        $('.carrot-status-repository').addClass('loaded');
    } else if (selectedCount > 0) {
        repoStatus.text(`${selectedCount} lorebooks selected`);
        repoDetail.text('Click to scan for characters');
        repoIndicator.removeClass('error success').addClass('warning');
        $('.carrot-status-repository').removeClass('loaded');
    } else {
        repoStatus.text('0 characters indexed');
        repoDetail.text('Click to manage repositories');
        repoIndicator.removeClass('success warning').addClass('error');
        $('.carrot-status-repository').removeClass('loaded');
    }

    // AI Injection Status Panel
    const injectionStatus = $('#carrot-injection-status');
    const injectionDetail = $('#carrot-injection-detail');
    const injectionIndicator = $('#carrot-injection-indicator');
    const injectionTooltipStatus = $('#carrot-injection-tooltip-status');

    if (!settings.enabled) {
        injectionStatus.text('Disabled');
        injectionDetail.text('System disabled');
        injectionIndicator.removeClass('success warning active').addClass('error');
        if (injectionTooltipStatus.length) injectionTooltipStatus.text('System Disabled');
        $('.carrot-status-injection').removeClass('injecting');
    } else if (!settings.sendToAI) {
        injectionStatus.text('AI Injection Off');
        injectionDetail.text('Hover for details');
        injectionIndicator.removeClass('success error active').addClass('warning');
        if (injectionTooltipStatus.length) injectionTooltipStatus.text('AI Injection Disabled');
        $('.carrot-status-injection').removeClass('injecting');
    } else if (characterCount === 0) {
        injectionStatus.text('Standby');
        injectionDetail.text('No characters to inject');
        injectionIndicator.removeClass('success error active').addClass('warning');
        if (injectionTooltipStatus.length) injectionTooltipStatus.text('Waiting for character data');
        $('.carrot-status-injection').removeClass('injecting');
    } else {
        injectionStatus.text('Ready');
        injectionDetail.text(`${characterCount} characters available`);
        injectionIndicator.removeClass('error warning').addClass('success');
        if (injectionTooltipStatus.length) injectionTooltipStatus.text(`Ready to inject ${characterCount} characters`);
        $('.carrot-status-injection').removeClass('injecting');
    }

    // Pack Manager Status Panel
    const packStatus = $('#carrot-pack-status');
    const packDetail = $('#carrot-pack-detail');
    const packIndicator = $('#carrot-pack-indicator');

    if (!settings.enabled) {
        packStatus.text('Disabled');
        packDetail.text('System disabled');
        packIndicator.removeClass('success warning').addClass('error');
        $('.carrot-status-packs').removeClass('initialized');
    } else {
        // Initialize with default ready state
        packStatus.text('Ready for management');
        packDetail.text('Click to install and update packs');
        packIndicator.removeClass('error warning').addClass('success');
        $('.carrot-status-packs').addClass('initialized');

        // If we have cached pack data, show more specific status
        if (window.CarrotKernel && window.CarrotKernel.cachedPackSummary) {
            const summary = window.CarrotKernel.cachedPackSummary;
            if (summary.hasUpdates) {
                packStatus.text('Updates available');
                packDetail.text('Click to install updates');
                packIndicator.removeClass('success error').addClass('warning');
            } else if (summary.totalInstalled > 0) {
                packStatus.text(`${summary.totalInstalled} packs installed`);
                packDetail.text('Click to manage packs');
                packIndicator.removeClass('error warning').addClass('success');
            }
        }
    }
}

// Initialize extension
jQuery(async () => {
    try {
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🚨 CARROT KERNEL LOADING - NEW CODE VERSION! 🚨');
        }
        CarrotDebug.init('Starting CarrotKernel initialization...');

        // Auto-scan character repos on chat load (if enabled)
        // Use .once() or check if already registered to prevent duplicate listeners
        if (!window.CARROT_CHAT_LISTENERS_REGISTERED) {
            eventSource.on(event_types.CHAT_CHANGED, async () => {
                const autoRescan = extension_settings[extensionName]?.autoRescanOnChatLoad ?? true;
                if (autoRescan && selectedLorebooks.size > 0) {
                    console.log('🥕 Chat changed - auto-scanning lorebooks to restore tag data...');
                    const results = await scanSelectedLorebooks(Array.from(selectedLorebooks));
                    console.log(`🥕 Auto-scan complete - ${scannedCharacters.size} characters loaded`, results);
                }
            });
            window.CARROT_CHAT_LISTENERS_REGISTERED = true;
        }

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
        
        // Initialize pack manager with retry mechanism
        console.log('🎯 PACK MANAGER DEBUG: Initializing CarrotPackManager...');

        async function initializePackManagerWithRetry(retries = 3, delay = 1000) {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    console.log(`🎯 PACK MANAGER DEBUG: Initialization attempt ${attempt}/${retries}`);

                    // Clear any existing instance
                    if (window.CarrotPackManager) {
                        console.log('🎯 PACK MANAGER DEBUG: Clearing existing CarrotPackManager instance');
                        delete window.CarrotPackManager;
                    }

                    window.CarrotPackManager = new CarrotPackManager();
                    console.log('🎯 PACK MANAGER DEBUG: CarrotPackManager created successfully');

                    window.CarrotPackManager.loadLocalPacks();
                    console.log('🎯 PACK MANAGER DEBUG: Local packs loaded');

                    // Verify the instance is properly set up
                    const verification = {
                        exists: !!window.CarrotPackManager,
                        hasScanMethod: typeof window.CarrotPackManager.scanRemotePacks === 'function',
                        hasLoadMethod: typeof window.CarrotPackManager.loadLocalPacks === 'function',
                        githubRepo: window.CarrotPackManager.githubRepo,
                        packsFolder: window.CarrotPackManager.packsFolder
                    };

                    console.log('🎯 PACK MANAGER DEBUG: CarrotPackManager verification:', verification);

                    // Validate that all required components are working
                    if (!verification.exists || !verification.hasScanMethod || !verification.hasLoadMethod) {
                        throw new Error('CarrotPackManager initialization incomplete');
                    }

                    console.log('✅ PACK MANAGER DEBUG: CarrotPackManager initialized successfully on attempt', attempt);
                    return true;

                } catch (error) {
                    console.error(`❌ PACK MANAGER ERROR: Initialization attempt ${attempt} failed:`, error);

                    if (attempt < retries) {
                        console.log(`🔄 PACK MANAGER DEBUG: Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    } else {
                        console.error('❌ PACK MANAGER ERROR: All initialization attempts failed');

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
        initializePackManagerWithRetry()

        // Add global diagnostic function for users to troubleshoot pack manager issues
        window.CarrotPackManagerDiagnostics = function() {
            console.group('🥕 CARROT PACK MANAGER DIAGNOSTICS');

            console.log('1. Pack Manager Instance:', {
                exists: !!window.CarrotPackManager,
                type: typeof window.CarrotPackManager,
                constructor: window.CarrotPackManager?.constructor?.name
            });

            if (window.CarrotPackManager) {
                console.log('2. Pack Manager Methods:', {
                    scanRemotePacks: typeof window.CarrotPackManager.scanRemotePacks,
                    loadLocalPacks: typeof window.CarrotPackManager.loadLocalPacks,
                    getPackInfo: typeof window.CarrotPackManager.getPackInfo
                });

                console.log('3. Pack Manager Configuration:', {
                    githubRepo: window.CarrotPackManager.githubRepo,
                    packsFolder: window.CarrotPackManager.packsFolder,
                    availablePacksSize: window.CarrotPackManager.availablePacks?.size
                });
            }

            console.log('4. UI Elements:', {
                scanButton: !!$('#carrot-pack-scan').length,
                statusElement: !!$('#carrot-pack-status').length,
                masterToggle: !!$('#carrot_enabled').length,
                masterEnabled: extension_settings[extensionName]?.enabled
            });

            console.log('5. Extension Settings:', {
                extensionName: extensionName,
                settingsExist: !!extension_settings[extensionName],
                debugMode: extension_settings[extensionName]?.debugMode
            });

            console.log('6. Test GitHub API Access (run this manually if needed):');
            console.log('fetch("https://api.github.com/repos/Chi-BiWolf/CarrotKernel-packs/contents/packs").then(r => console.log("API Status:", r.status, r.statusText))');
            console.log('7. Test Rate-Limited API Access:');
            console.log('window.CarrotPackManager.testRateLimiting() // Tests the new rate limiting system');

            console.groupEnd();

            return 'Diagnostics completed. Check the logs above for any issues.';
        };

        console.log('🎯 PACK MANAGER DEBUG: Diagnostic function added. Run CarrotPackManagerDiagnostics() in console to troubleshoot.');

        // Check for pack updates on startup (like ST extensions)
        setTimeout(async () => {
            if (extension_settings[extensionName]?.autoCheckUpdates !== false) {
                await window.CarrotPackManager.checkForUpdates();
            }
        }, 5000); // Wait 5 seconds after startup
        
        // Initialize settings
        initializeSettings();
        
        // Load settings HTML
        const settingsHtml = await $.get(`scripts/extensions/third-party/${extensionName}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        
        // Update lorebook list
        updateLorebookList();
        
        // Bind settings events
        bindSettingsEvents();


        // Debug all carrot-related icon clicks in world info
        $(document).on('click', '.fa-carrot, .wi_icon[title*="carrot"], .world_entry_icon[title*="carrot"], .carrot-icon', function(e) {
            console.log('🥕 CLICK DEBUG: Carrot icon clicked!', {
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
                console.log('🥕 CLICK DEBUG: Found parent world info entry:', {
                    entryElement: worldEntry[0],
                    entryId: worldEntry.attr('id'),
                    entryClasses: worldEntry[0].className,
                    entryData: Object.fromEntries(Object.entries(worldEntry[0].dataset || {}))
                });
            }

            // Check if click is being prevented
            console.log('🥕 CLICK DEBUG: Event details:', {
                defaultPrevented: e.isDefaultPrevented(),
                propagationStopped: e.isPropagationStopped(),
                immediatePropagationStopped: e.isImmediatePropagationStopped(),
                eventType: e.type,
                originalEvent: e.originalEvent
            });
        });

        // Debug general world info icon clicks
        $(document).on('click', '.world_entry .fa-fw, .world_entry .world_entry_icon, .wi_entry .fa-fw', function(e) {
            console.log('🌍 WI CLICK DEBUG: World info icon clicked!', {
                element: this,
                classes: this.className,
                title: this.title,
                isCarrotIcon: this.classList.contains('fa-carrot'),
                parentEntry: $(this).closest('.world_entry, .wi_entry')[0],
                timestamp: new Date().toISOString()
            });
        });

        // =============================================================================
        // 🐰 BABY BUNNY MODE - GUIDED AUTOMATION SYSTEM
        // =============================================================================

        // Check for completed BunnyMo sheets and trigger guided automation
        async function checkForCompletedSheets(message, messageId) {
            console.log('🐰 BABY BUNNY DEBUG: checkForCompletedSheets called', {
                messageId: messageId,
                hasMessage: !!message,
                hasMessageText: !!message?.mes,
                messageType: typeof message?.mes,
                isUser: message?.is_user,
                messagePreview: message?.mes?.substring(0, 200) + '...'
            });

            if (!message?.mes || typeof message.mes !== 'string') {
                console.log('🐰 BABY BUNNY DEBUG: Skipping - no valid message text');
                return;
            }

            const messageText = message.mes;

            // STANDARDIZED EXTRACTION: Look for ALL BunnymoTags and Linguistics blocks
            const extractedData = extractAllSheetData(messageText);

            console.log('🐰 BABY BUNNY DEBUG: Standardized extraction results', {
                messageLength: messageText.length,
                bunnymoTagsFound: extractedData.bunnymoTags.length,
                linguisticsFound: extractedData.linguistics.length,
                totalBlocks: extractedData.bunnymoTags.length + extractedData.linguistics.length
            });

            if (extractedData.bunnymoTags.length === 0 && extractedData.linguistics.length === 0) {
                console.log('🐰 BABY BUNNY DEBUG: No BunnymoTags or Linguistics blocks found');
                return;
            }

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
                console.log('🐰 BABY BUNNY DEBUG: Processing BunnymoTags block', {
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
                console.log('🐰 BABY BUNNY DEBUG: No BunnymoTags found, creating character from Linguistics only');
                const characterInfo = extractCharacterFromSheetData('', extractedData.linguistics, messageText);
                if (characterInfo) {
                    characterData.push(characterInfo);
                }
            }

            if (characterData.length > 0) {
                console.log('🐰 BABY BUNNY DEBUG: About to show popup for characters', {
                    characterCount: characterData.length,
                    characters: characterData.map(c => ({ name: c.name, tagsLength: c.tags.length }))
                });

                // If multiple characters found, show batch popup
                if (characterData.length > 1) {
                    console.log('🐰 BABY BUNNY DEBUG: Multiple characters detected, showing batch popup');
                    await showBatchBabyBunnyPopup(characterData);
                } else {
                    // Single character - show individual popup
                    console.log('🐰 BABY BUNNY DEBUG: Calling showBabyBunnyPopup for character:', characterData[0].name);
                    await showBabyBunnyPopup(characterData[0]);
                    console.log('🐰 BABY BUNNY DEBUG: showBabyBunnyPopup completed for character:', characterData[0].name);
                }
            } else {
                console.log('🐰 BABY BUNNY DEBUG: No character data found to show popup for');
            }
        }

        // STANDARDIZED SHEET DATA EXTRACTION
        function extractAllSheetData(messageText) {
            const result = {
                bunnymoTags: [],
                linguistics: []
            };

            console.log('🐰 RAW MESSAGE DEBUG:', {
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
                console.log(`🐰 REGEX DEBUG: ${regex.source} found ${matches.length} matches`);
                for (const match of matches) {
                    const fullBlock = match[0].trim();
                    // Normalize for comparison (lowercase, remove extra whitespace)
                    const normalizedBlock = fullBlock.toLowerCase().replace(/\s+/g, ' ');

                    if (!seenBlocks.has(normalizedBlock)) {
                        seenBlocks.add(normalizedBlock);
                        allBlocks.push(fullBlock);
                        console.log(`🐰 BLOCK FOUND: ${fullBlock.substring(0, 100)}... (${fullBlock.length} chars)`);
                    } else {
                        console.log(`🐰 DUPLICATE BLOCK SKIPPED: ${fullBlock.substring(0, 50)}...`);
                    }
                }
            }

            // FALLBACK PARSER: If we found fewer than expected, try to find unclosed tags
            if (allBlocks.length === 0 || (messageText.match(/<BunnymoTags>/gi) || []).length > allBlocks.length) {
                console.log('🐰 FALLBACK PARSER: Detected unclosed or partial BunnymoTags, attempting recovery...');

                // Find all opening tags and try to extract content until the next opening tag or end of message
                const openingTagPattern = /<BunnymoTags>/gi;
                const openingMatches = [...messageText.matchAll(openingTagPattern)];

                console.log(`🐰 FALLBACK: Found ${openingMatches.length} opening tags`);

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
                        console.log('🐰 FALLBACK: No closing tag found, extracting until next opening tag');
                    } else {
                        // Last tag in message, no closing tag - extract to end
                        endPos = messageText.length;
                        console.log('🐰 FALLBACK: No closing tag found, extracting to end of message');
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
                        console.log(`🐰 FALLBACK: Found ${unclosedCount} unclosed <Linguistics> tag(s), adding closing tag(s)`);

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
                        console.log('🐰 FALLBACK: Added missing </BunnymoTags> closing tag');
                    }

                    // Check for duplicates
                    const normalizedBlock = extractedBlock.toLowerCase().replace(/\s+/g, ' ');
                    if (!seenBlocks.has(normalizedBlock)) {
                        seenBlocks.add(normalizedBlock);
                        allBlocks.push(extractedBlock);
                        console.log(`🐰 FALLBACK: Recovered block ${i + 1}: ${extractedBlock.substring(0, 100)}... (${extractedBlock.length} chars)`);
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
                    console.log('🐰 MULTI-CHARACTER DETECTION: Found separate character sheets:', {
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

                    console.log('🐰 FULLSHEET DETECTION: Multiple BunnymoTags blocks found, prioritizing largest/most complete:', {
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

            console.log('🐰 STANDARDIZED EXTRACTION DEBUG:', {
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
            console.log('🐰 BATCH PARSER: Processing block', {
                blockLength: bunnymoBlock.length,
                preview: bunnymoBlock.substring(0, 100) + '...'
            });

            // Extract character name from <Name:> tag
            let characterName = '';
            const nameMatch = bunnymoBlock.match(/<Name:([^>]+)>/i);
            if (nameMatch) {
                characterName = nameMatch[1].trim();
                console.log('🐰 BATCH PARSER: Found character name:', characterName);
            } else {
                // Fallback to trying to extract from linguistics or context
                const lingMatch = bunnymoBlock.match(/([A-Z][a-z]+)'s\s+primary\s+mode\s+of\s+speech/i);
                if (lingMatch) {
                    characterName = lingMatch[1].trim();
                } else {
                    characterName = 'Character';
                }
                console.log('🐰 BATCH PARSER: Using fallback name:', characterName);
            }

            // The entire BunnymoTags block is the complete data
            let completeCharacterData = bunnymoBlock.trim();

            // BACKWARDS COMPATIBILITY: Check if Linguistics is inside BunnymoTags
            const hasLinguisticsInside = completeCharacterData.includes('<Linguistics>') || completeCharacterData.includes('<linguistics>');

            // If NO linguistics inside, look for standalone Linguistics blocks in the full message (old format)
            if (!hasLinguisticsInside) {
                console.log('🐰 BATCH PARSER: No linguistics found inside BunnymoTags, checking for standalone blocks (old format)...');

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
                        console.log('🐰 BATCH PARSER: Found standalone Linguistics block (old format), appending...');
                        completeCharacterData += '\n\n' + linguisticsBlock;
                        break;
                    }
                }
            }

            console.log('🐰 BATCH PARSER: Extraction complete', {
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
                    console.log('🐰 NAME EXTRACTION: Found from BunnymoTags <Name:> tag:', characterName);
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
                            console.log('🐰 NAME EXTRACTION: Found from Linguistics:', { pattern: pattern.source, name: characterName });
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
                        console.log('🐰 NAME EXTRACTION: Found from full message:', { pattern: pattern.source, name: characterName });
                        break;
                    }
                }
            }

            // Fallback name
            if (!characterName) {
                characterName = 'Character';
                console.log('🐰 NAME EXTRACTION: Using fallback name');
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

            console.log('🐰 SHEET DATA EXTRACTION COMPLETE:', {
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
                console.log('🐰 BABY BUNNY DEBUG: Found name from tags:', characterName);
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
                        console.log('🐰 BABY BUNNY DEBUG: Found name from pattern:', { pattern: pattern.source, name: characterName });
                        break;
                    }
                }

                if (!characterName) {
                    characterName = 'Character';
                    console.log('🐰 BABY BUNNY DEBUG: Using fallback name');
                }
            }

            console.log('🐰 BABY BUNNY DEBUG: Character extraction', {
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
                        height: 100% !important;
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

                console.log('🐰 BATCH BABY BUNNY DEBUG: Popup displayed for', charactersData.length, 'characters');

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

                    console.log('🐰 BATCH: Character toggle', { charIndex, enabled: isEnabled, selectedCount });
                });

                // Initialize toggle slider positions
                popup.find('.batch-char-toggle-input:checked').each(function() {
                    $(this).siblings('.batch-char-toggle-slider').find('span').css('transform', 'translateX(20px)');
                });

                // "Process Individually" button - sends each character through single popup
                popup.find('#batch-process-individually').on('click', async function() {
                    console.log('🐰 BATCH: Processing characters individually');
                    overlay.remove();

                    // Process each enabled character through the normal single-character popup
                    for (let i = 0; i < charactersData.length; i++) {
                        const isEnabled = popup.find(`.batch-character-config[data-char-index="${i}"]`).attr('data-enabled') === 'true';
                        if (isEnabled) {
                            console.log('🐰 BATCH: Processing character individually:', charactersData[i].name);
                            await showBabyBunnyPopup(charactersData[i]);
                        }
                    }

                    resolve(true);
                });

                // Grouping mode switching
                popup.find('input[name="batch-grouping-mode"]').on('change', function() {
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
                    console.log('🐰 BATCH BABY BUNNY DEBUG: Cancelled');
                    overlay.remove();
                    resolve(false);
                });

                // Create button
                popup.find('#batch-bunny-create').on('click', async function() {
                    const mode = popup.find('input[name="batch-grouping-mode"]:checked').val();
                    const scope = popup.find('input[name="batch-lorebook-scope"]:checked').val();

                    console.log('🐰 BATCH BABY BUNNY DEBUG: Creating archives', { mode, scope });

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

                    console.log('🐰 BATCH: Processing', characterConfigs.length, 'enabled characters');

                    overlay.remove();

                    // Process based on mode
                    if (mode === 'single-new') {
                        const lorebookName = popup.find('#batch-lorebook-name').val().trim();
                        if (!lorebookName) {
                            toastr.error('Please enter a lorebook name');
                            return;
                        }

                        // Create single lorebook for all characters
                        await processBatchToSingleLorebook(characterConfigs, lorebookName, true, scope);

                    } else if (mode === 'multiple-new') {
                        // Create separate lorebooks for each, using custom names
                        for (let i = 0; i < characterConfigs.length; i++) {
                            const config = characterConfigs[i];
                            const originalIndex = charactersData.indexOf(charactersData.find(c => c.name === config.name));

                            // Get the custom lorebook name from the input field
                            const lorebookName = popup.find(`.batch-multiple-lorebook-name[data-char-index="${originalIndex}"]`).val().trim();

                            if (!lorebookName) {
                                toastr.error(`Please enter a lorebook name for ${config.entryName}`);
                                return;
                            }

                            await processSingleCharacterArchive(config, lorebookName, true, scope);
                        }

                    } else if (mode === 'single-existing') {
                        const lorebookName = popup.find('#batch-existing-lorebook').val();
                        if (!lorebookName) {
                            toastr.error('Please select a lorebook');
                            return;
                        }

                        // Add all to existing lorebook
                        await processBatchToSingleLorebook(characterConfigs, lorebookName, false, scope);
                    }

                    resolve(true);
                });
            });
        }

        // Helper function: Process all characters to a single lorebook
        async function processBatchToSingleLorebook(characterConfigs, lorebookName, createNew, scope) {
            console.log('🐰 BATCH PROCESSING: Single lorebook mode', { lorebookName, createNew, characterCount: characterConfigs.length });

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
            console.log('🐰 BATCH PROCESSING: Single character mode', { name: config.entryName, lorebookName });

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
                console.error('🐰 BATCH PROCESSING ERROR: Failed to create entry for', config.entryName);
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

            console.log('🐰 BATCH PROCESSING: Added entry', {
                name: config.entryName,
                triggers: config.triggers,
                uid: newEntry.uid
            });
        }

        // Helper function: Create new lorebook using ST's API
        async function createNewLorebook(name) {
            try {
                await createNewWorldInfo(name);
                console.log('🐰 BATCH PROCESSING: Created new lorebook', { name });
                return { name, entries: [] };
            } catch (error) {
                console.error('🐰 BATCH PROCESSING ERROR: Failed to create lorebook', error);
                return null;
            }
        }

        // Helper function: Load existing lorebook using ST's API
        async function loadExistingLorebook(name) {
            try {
                const data = await loadWorldInfo(name);
                console.log('🐰 BATCH PROCESSING: Loaded existing lorebook', { name, entryCount: data.entries?.length });
                return data;
            } catch (error) {
                console.error('🐰 BATCH PROCESSING ERROR: Failed to load lorebook', error);
                return null;
            }
        }

        // Helper function: Save lorebook using ST's API
        async function saveLorebook(lorebook, name) {
            try {
                await saveWorldInfo(name, lorebook);
                console.log('🐰 BATCH PROCESSING: Saved lorebook', { name });
                return true;
            } catch (error) {
                console.error('🐰 BATCH PROCESSING ERROR: Failed to save lorebook', error);
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
                            <div class="carrot-card-header" style="padding: 24px 32px 16px;">
                                <h3 style="margin: 0 0 8px; font-size: 24px;">🐰 Baby Bunny Mode</h3>
                                <p class="carrot-card-subtitle" style="margin: 0; color: var(--SmartThemeQuoteColor);">Guided Character Archive Creation</p>
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
                        height: 100% !important;
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

                console.log('🐰 BABY BUNNY DEBUG: Popup displayed', {
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
                    console.log('🐰 BABY BUNNY DEBUG: Popup still visible after 1 second?', {
                        overlayVisible: overlay.is(':visible'),
                        overlayExists: $('.baby-bunny-overlay').length > 0
                    });
                }, 1000);

                // Add interactive functionality for the new popup elements

                // 1. Lorebook type radio button switching
                popup.find('input[name="lorebook-type"]').on('change', function() {
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
                            saveSettingsDebounced();
                            await updateWorldInfoList(); // Update UI to show selection

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

                console.log('🐰 BABY BUNNY DEBUG: Creating entry with currentWorldInfo', {
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

                console.log('🐰 BABY BUNNY DEBUG: Entry configured', {
                    entryId: newEntry.uid,
                    contentLength: newEntry.content.length,
                    triggers: newEntry.key,
                    comment: newEntry.comment
                });

                console.log('🐰 BABY BUNNY DEBUG: About to save lorebook (NemoLore approach)', {
                    lorebookName,
                    entriesCount: Object.keys(currentWorldInfo.entries || {}).length,
                    entriesStructure: currentWorldInfo.entries,
                    newEntryUid: newEntry.uid,
                    currentWorldInfoStructure: Object.keys(currentWorldInfo)
                });

                // Save the updated lorebook (following NemoLore's exact pattern)
                await saveWorldInfo(lorebookName, currentWorldInfo);

                // Step 4.5: Wait a moment and verify the save actually worked
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for file system

                // Verify the lorebook was actually saved with entries
                const verificationWorldInfo = await loadWorldInfo(lorebookName);
                const savedEntriesCount = Object.keys(verificationWorldInfo?.entries || {}).length;

                console.log('🐰 BABY BUNNY DEBUG: Save verification', {
                    lorebookName,
                    savedEntriesCount,
                    verificationPassed: savedEntriesCount > 0,
                    savedEntries: Object.keys(verificationWorldInfo?.entries || {})
                });

                if (savedEntriesCount === 0) {
                    throw new Error('Lorebook was created but entries were not saved properly');
                }

                // Only update the UI AFTER verification passes
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


        // Apply initial master enable state
        applyMasterEnableState(extension_settings[extensionName].enabled);
        
        // Initialize template manager status
        if (window.CarrotKernel && window.CarrotKernel.updateTemplateStatus) {
            window.CarrotKernel.updateTemplateStatus();
        }
        
        // Initialize status panels
        updateStatusPanels();
        
        // Sheet commands are now detected via WORLD_INFO_ACTIVATED entries - much simpler!

        // Hook into SillyTavern's lorebook activation system (exactly like BunnyMoTags)
        eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entryList) => {
            const settings = extension_settings[extensionName];
            
            // Log this event only when debug mode is enabled
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔥 CARROT DEBUG: WORLD_INFO_ACTIVATED fired with', entryList?.length || 0, 'entries');
                console.log('🔥 CARROT DEBUG: Settings enabled:', settings.enabled, 'Display mode:', settings.displayMode);
                console.log('🔥 CARROT DEBUG: Entry list:', entryList);

                // 🥕 Enhanced debugging for carrot icon troubleshooting
                entryList?.forEach((entry, index) => {
                    console.log(`🥕 WI DEBUG: Entry ${index + 1}:`, {
                        uid: entry.uid,
                        key: entry.key || entry.keys,
                        comment: entry.comment,
                        title: entry.title,
                        enabled: entry.enabled,
                        entry: entry
                    });
                });
            }
            
            // Check if any activated entries are sheet commands
            const sheetCommandEntry = entryList?.find(entry => {
                // Check multiple possible key properties and ensure it's a string
                const key = entry.key || entry.keys || entry.title || entry.comment || '';
                const keyStr = (typeof key === 'string') ? key.toLowerCase() : 
                              (Array.isArray(key)) ? key.join(' ').toLowerCase() :
                              String(key).toLowerCase();
                              
                console.log('🥕 SHEET COMMAND DEBUG: Checking entry:', { entry, key, keyStr });
                return keyStr && (keyStr.includes('!quicksheet') || keyStr.includes('!fullsheet') || keyStr.includes('!tagsheet'));
            });
            
            if (sheetCommandEntry) {
                console.log('🥕 SHEET COMMAND DEBUG: Sheet command entry detected in WORLD_INFO_ACTIVATED:', sheetCommandEntry);
                
                // Extract sheet command details from the entry
                const key = sheetCommandEntry.key || sheetCommandEntry.keys || sheetCommandEntry.title || sheetCommandEntry.comment || '';
                const keyStr = (typeof key === 'string') ? key.toLowerCase() : 
                              (Array.isArray(key)) ? key.join(' ').toLowerCase() :
                              String(key).toLowerCase();
                              
                let sheetType = null;
                if (keyStr.includes('!quicksheet')) sheetType = 'quicksheet';
                else if (keyStr.includes('!fullsheet')) sheetType = 'fullsheet';
                else if (keyStr.includes('!tagsheet')) sheetType = 'tagsheet';
                
                console.log('🥕 SHEET COMMAND DEBUG: Detected sheet type:', sheetType);
                
                // Set up the sheet command - let ST's native firing system handle everything
                pendingSheetCommand = {
                    type: sheetType,
                    entry: sheetCommandEntry
                };
                
                console.log('🥕 SHEET COMMAND DEBUG: Set pendingSheetCommand:', pendingSheetCommand);
            }
            
            CarrotDebug.scan(`🔥 WORLD_INFO_ACTIVATED - ${entryList?.length || 0} entries fired`, {
                enabled: settings.enabled,
                displayMode: settings.displayMode,
                selectedLorebooks: Array.from(selectedLorebooks),
                characterRepoBooks: Array.from(characterRepoBooks),
                sheetCommandDetected: !!sheetCommandEntry
            });
            
            if (!settings.enabled) {
                CarrotDebug.scan('❌ CarrotKernel disabled, ignoring WORLD_INFO_ACTIVATED');
                return;
            }
            
            // Check if we have a pending sheet command to process instead
            if (pendingSheetCommand) {
                console.log('🥕 SHEET COMMAND DEBUG: Processing pending sheet command instead of normal injection', pendingSheetCommand);
                CarrotDebug.inject('Processing pending sheet command instead of normal character injection', pendingSheetCommand);
                
                try {
                    const success = await processSheetCommand(pendingSheetCommand);
                    if (success) {
                        console.log('🥕 SHEET COMMAND DEBUG: Sheet command processed successfully', pendingSheetCommand);
                        CarrotDebug.inject('✅ Sheet command processed successfully', pendingSheetCommand);
                    } else {
                        console.log('🥕 SHEET COMMAND DEBUG: Sheet command processing failed', pendingSheetCommand);
                        CarrotDebug.error('❌ Sheet command processing failed', pendingSheetCommand);
                    }
                } catch (error) {
                    console.log('🥕 SHEET COMMAND DEBUG: Error processing sheet command:', error);
                    CarrotDebug.error('❌ Error processing sheet command:', error);
                } finally {
                    // Clear the pending command
                    console.log('🥕 SHEET COMMAND DEBUG: Clearing pendingSheetCommand and returning early');
                    pendingSheetCommand = null;
                }
                
                // Skip normal character processing when sheet command is executed
                console.log('🥕 SHEET COMMAND DEBUG: Returning early to skip normal injection');
                return;
            }
            
            console.log('🥕 SHEET COMMAND DEBUG: No pending sheet command, proceeding with normal injection');
            
            try {
                await processActivatedLorebookEntries(entryList);
            } catch (error) {
                CarrotDebug.error('❌ Error in processActivatedLorebookEntries:', error);
            }
        });

        // Show conflict resolution dialog when lorebook name already exists
        async function showLorebookConflictDialog(lorebookName) {
            return new Promise((resolve) => {
                const conflictOverlay = $(`
                    <div class="baby-bunny-overlay" style="
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        background: rgba(0,0,0,0.8) !important;
                        z-index: 999999 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    "></div>
                `);

                const conflictPopup = $(`
                    <div class="carrot-popup-container" style="max-width: 500px; width: 90%;">
                        <div class="carrot-card">
                            <div class="carrot-card-header">
                                <h3>⚠️ Lorebook Already Exists</h3>
                                <p class="carrot-card-subtitle">The lorebook "${lorebookName}" already exists.</p>
                            </div>
                            <div class="carrot-card-body">
                                <p style="margin-bottom: 20px;">What would you like to do?</p>

                                <div class="carrot-action-bar" style="display: flex; gap: 12px; justify-content: center; flex-direction: column;">
                                    <button id="conflict-use-existing" class="carrot-primary-btn">
                                        <i class="fa-solid fa-folder"></i>
                                        Use Existing Lorebook
                                    </button>
                                    <button id="conflict-rename" class="carrot-secondary-btn">
                                        <i class="fa-solid fa-edit"></i>
                                        Choose Different Name
                                    </button>
                                    <button id="conflict-cancel" class="carrot-secondary-btn">
                                        <i class="fa-solid fa-times"></i>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `);

                conflictOverlay.append(conflictPopup);
                $('body').append(conflictOverlay);

                // Handle choices
                conflictPopup.find('#conflict-use-existing').on('click', () => {
                    conflictOverlay.remove();
                    resolve('use_existing');
                });

                conflictPopup.find('#conflict-rename').on('click', () => {
                    conflictOverlay.remove();
                    resolve('rename');
                });

                conflictPopup.find('#conflict-cancel').on('click', () => {
                    conflictOverlay.remove();
                    resolve('cancel');
                });

                // Close on overlay click
                conflictOverlay.on('click', function(e) {
                    if (e.target === this) {
                        conflictOverlay.remove();
                        resolve('cancel');
                    }
                });
            });
        }

        // Hook into CHARACTER_MESSAGE_RENDERED to display thinking blocks and add persistent tags
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            const settings = extension_settings[extensionName];
            
            // CHARACTER_MESSAGE_RENDERED fires for AI messages, but we only want to show cards
            // when we have pending data from a previous user message that triggered WORLD_INFO_ACTIVATED
            const message = chat.find(msg => msg.index === messageId);

            console.log('🐰 BABY BUNNY DEBUG: Message lookup details');
            console.log('  messageId:', messageId);
            console.log('  chatLength:', chat.length);
            console.log('  messageFound:', !!message);
            console.log('  chatIndexes:', chat.map(msg => msg.index));
            console.log('  lastMessage:', chat[chat.length - 1]);
            console.log('  lastMessageIndex:', chat[chat.length - 1]?.index);
            console.log('  targetMessage:', message);

            // Try alternative lookup methods
            const messageByLength = chat[chat.length - 1];
            const messageByIdDirect = chat.find(msg => msg.id === messageId);
            console.log('🐰 BABY BUNNY DEBUG: Alternative lookups');
            console.log('  lastMessageByLength:', messageByLength);
            console.log('  messageByIdDirect:', messageByIdDirect);
            console.log('  lastMessageContent preview:', messageByLength?.mes?.substring(0, 200));

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
            
            // PERSISTENCE: Check if this message has stored CarrotKernel data (for page refresh recovery)
            if (message?.extra?.carrot_character_data && !pendingThinkingBlockData.length) {
                const storedData = message.extra.carrot_character_data;
                
                CarrotDebug.ui('🔄 PERSISTENCE: Restoring thinking block from stored data', {
                    messageId: messageId,
                    storedCharacters: storedData.characters,
                    storedDisplayMode: storedData.displayMode,
                    currentDisplayMode: settings.displayMode
                });
                
                // Only restore if we're in thinking mode and this message doesn't already have the thinking block
                if (settings.displayMode === 'thinking') {
                    const existingThinkingBlock = document.querySelector(`[mesid="${messageId}"] .carrot-thinking-details`);
                    
                    if (!existingThinkingBlock && storedData.characters && storedData.characters.length > 0) {
                        CarrotDebug.ui('🔄 PERSISTENCE: Restoring thinking block for message', {
                            messageId: messageId,
                            characters: storedData.characters
                        });
                        
                        // Restore the thinking block using the stored character data
                        displayCharacterData(storedData.characters);
                        return; // Exit early since we restored from persistence
                    }
                }
            }
            
            // CHARACTER_MESSAGE_RENDERED should ONLY handle thinking mode
            // Cards mode is already handled by WORLD_INFO_ACTIVATED -> sendCarrotSystemMessage
            console.log('🎭 CARROT DEBUG: CHARACTER_MESSAGE_RENDERED fired, checking thinking mode:', {
                displayMode: settings.displayMode,
                pendingDataLength: pendingThinkingBlockData.length,
                pendingData: pendingThinkingBlockData
            });
            
            if (settings.displayMode === 'thinking' && pendingThinkingBlockData.length > 0) {
                console.log('🧠 CARROT DEBUG: Attempting to display thinking blocks for:', pendingThinkingBlockData);
                CarrotDebug.ui('🧠 THINKING BLOCKS: Attempting to display thinking blocks', {
                    characterNames: pendingThinkingBlockData
                });
                
                try {
                    // For thinking mode, use displayCharacterData which will call renderAsThinkingBox
                    displayCharacterData(pendingThinkingBlockData);
                    console.log('✅ CARROT DEBUG: Successfully called displayCharacterData');
                    CarrotDebug.ui('✅ THINKING BLOCKS: Successfully called displayCharacterData');
                    pendingThinkingBlockData = []; // Clear after displaying
                } catch (error) {
                    console.error('❌ CARROT DEBUG: Error displaying character data:', error);
                    CarrotDebug.error('❌ THINKING BLOCKS: Error displaying character data', error);
                }
            } else {
                // Clear any stale pending data if we're not in thinking mode
                if (settings.displayMode !== 'thinking' && pendingThinkingBlockData.length > 0) {
                    CarrotDebug.ui('🧹 Clearing stale pending data - display mode changed to:', settings.displayMode);
                    pendingThinkingBlockData = [];
                }
                
                CarrotDebug.ui('⏭️ THINKING BLOCKS: Skipped display', {
                    reason: settings.displayMode !== 'thinking' ? 'Not in thinking mode (cards handled by WORLD_INFO_ACTIVATED)' : 'No pending data',
                    displayMode: settings.displayMode,
                    pendingDataLength: pendingThinkingBlockData.length
                });
            }
            
            // Add persistent tags
            addPersistentTagsToMessage(messageId);

            // 🐰 Baby Bunny Mode: Detect completed sheets and trigger guided automation
            console.log('🐰 BABY BUNNY DEBUG: Checking if Baby Bunny Mode should trigger', {
                babyBunnyMode: settings.babyBunnyMode,
                isUser: message?.is_user,
                messageId: messageId,
                shouldTrigger: settings.babyBunnyMode && !message?.is_user
            });

            if (settings.babyBunnyMode && !message?.is_user) {
                console.log('🐰 BABY BUNNY DEBUG: Triggering Baby Bunny Mode detection');

                // If message lookup failed, try using the last message as fallback
                let targetMessage = message;
                if (!targetMessage && messageByLength && !messageByLength.is_user) {
                    console.log('🐰 BABY BUNNY DEBUG: Using fallback - last message from chat array');
                    targetMessage = messageByLength;
                }

                checkForCompletedSheets(targetMessage, messageId);
            } else {
                console.log('🐰 BABY BUNNY DEBUG: Not triggering - either disabled or user message');
            }
        });

        // Hook into CHAT_CHANGED to restore thinking blocks after page refresh/chat switch
        // Only register once to prevent memory leaks
        if (!window.CARROT_RESTORE_LISTENER_REGISTERED) {
            eventSource.on(event_types.CHAT_CHANGED, async () => {
                const settings = extension_settings[extensionName];

                if (!settings.enabled || settings.displayMode !== 'thinking') return;

                CarrotDebug.ui('📝 CHAT_CHANGED: Checking for thinking blocks to restore');

                // Wait for auto-scan to complete before restoring (if auto-scan is enabled)
                const autoRescan = extension_settings[extensionName]?.autoRescanOnChatLoad ?? true;
                if (autoRescan && characterRepoBooks.size > 0) {
                    // Wait longer to ensure scan completes first
                    setTimeout(() => {
                        CarrotDebug.ui('📝 RESTORE: Auto-scan should be complete, restoring thinking blocks');
                        restoreThinkingBlocksFromChat();
                    }, 1500);
                } else {
                    // No scan happening, restore immediately
                    setTimeout(() => {
                        restoreThinkingBlocksFromChat();
                    }, 500);
                }
            });
            window.CARROT_RESTORE_LISTENER_REGISTERED = true;
        }
        
        // Initialize debug system
        CarrotDebug.setEnabled(extension_settings[extensionName]?.debugMode || false);
        
        // Initialize BunnyMoTags context filtering (delayed to ensure Generate function exists)
        setTimeout(() => {
            initializeBunnyMoTagsContextFiltering();
        }, 1000);
        
        // Get context-aware settings to determine if we should auto-scan
        const currentSettings = await CarrotStorage.getSettings();
        
        // Only auto-scan if explicitly enabled in settings and we have selected lorebooks
        if (currentSettings.scanOnStartup && selectedLorebooks.size > 0 && scannedCharacters.size === 0) {
            CarrotDebug.init('Auto-scanning lorebooks on initialization (enabled in settings)');
            const scanResult = await scanSelectedLorebooks(Array.from(selectedLorebooks));
            CarrotDebug.init('Auto-scan completed', scanResult);
        } else if (selectedLorebooks.size > 0) {
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

        CarrotDebug.init('CarrotKernel initialized successfully', {
            version: '1.0.0',
            contextValid: CarrotContext.isContextValid(),
            debugMode: extension_settings[extensionName]?.debugMode,
            lorebooks: selectedLorebooks.size,
            characters: scannedCharacters.size,
            scanOnStartup: currentSettings.scanOnStartup
        });
        
    } catch (error) {
        CarrotDebug.error('CarrotKernel initialization failed', error);
    }
});

// Apply master enable state to UI and functionality
function applyMasterEnableState(isEnabled) {
    console.log('🎯 MASTER ENABLE DEBUG: applyMasterEnableState called:', {
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

    console.log('🎯 MASTER ENABLE DEBUG: Updating UI elements state:', {
        elementCount: uiElements.length,
        disabling: !isEnabled
    });

    uiElements.forEach(selector => {
        const element = $(selector);
        const elementExists = element.length > 0;
        element.prop('disabled', !isEnabled);

        if (!elementExists) {
            console.warn(`⚠️ MASTER ENABLE DEBUG: UI element not found: ${selector}`);
        }
    });

    // Add visual indication to the entire settings panel
    if (isEnabled) {
        console.log('🎯 MASTER ENABLE DEBUG: Enabling UI - removing disabled class');
        $('#carrot_settings').removeClass('carrot-disabled');

        // Re-enable WorldBook Tracker if it was enabled in settings
        if (extension_settings[extensionName]?.worldBookTrackerEnabled) {
            CarrotWorldBookTracker.enable();
        }

        // Re-add Baby Bunny buttons if enabled in settings
        if (extension_settings[extensionName]?.babyBunnyMode) {
            add_baby_bunny_buttons_to_all_existing_messages();
        }

        CarrotDebug.ui('UI elements ENABLED');
    } else {
        console.log('🎯 MASTER ENABLE DEBUG: Disabling UI - adding disabled class and clearing displays');
        $('#carrot_settings').addClass('carrot-disabled');

        // Clear all existing character displays when disabled
        const existingDisplays = document.querySelectorAll('.carrot-reasoning-details, .carrot-cards-container');
        console.log(`🎯 MASTER ENABLE DEBUG: Removing ${existingDisplays.length} existing character displays`);
        existingDisplays.forEach(el => {
            el.remove();
        });

        // Clear scanned character data
        scannedCharacters.clear();

        // Disable WorldBook Tracker when master is disabled
        CarrotWorldBookTracker.disable();

        // Remove all Baby Bunny buttons when master is disabled
        remove_all_baby_bunny_buttons();

        CarrotDebug.ui('UI elements DISABLED and data cleared');
    }
}

// Bind all settings UI events
function bindSettingsEvents() {
    console.log('🎯 DOM DEBUG: bindSettingsEvents called');

    // Check if DOM is ready and elements exist before binding
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            function checkElement() {
                const element = $(selector);
                if (element.length > 0) {
                    console.log(`✅ DOM DEBUG: Element found: ${selector}`);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    console.error(`❌ DOM DEBUG: Element not found after ${timeout}ms: ${selector}`);
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

    console.log('🎯 DOM DEBUG: Waiting for critical elements...', criticalElements);

    Promise.allSettled(criticalElements.map(selector => waitForElement(selector)))
        .then(results => {
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                console.warn('⚠️ DOM DEBUG: Some elements not found:', failures.map(f => f.reason?.message));
            }

            console.log('🎯 DOM DEBUG: Proceeding with event binding...');
            bindActualEvents();
        })
        .catch(error => {
            console.error('❌ DOM DEBUG: Critical error in element waiting:', error);
            // Try binding anyway as a fallback
            setTimeout(() => bindActualEvents(), 2000);
        });

    function bindActualEvents() {
        console.log('🎯 DOM DEBUG: Starting actual event binding...');
    
    // Master enable toggle
    $('#carrot_enabled').prop('checked', settings.enabled).on('change', function() {
        const isEnabled = Boolean($(this).prop('checked'));
        console.log('🎯 MASTER TOGGLE DEBUG: State changed:', {
            previousState: settings.enabled,
            newState: isEnabled,
            timestamp: new Date().toISOString()
        });

        extension_settings[extensionName].enabled = isEnabled;

        console.log('🎯 MASTER TOGGLE DEBUG: Applying master enable state...');
        // Apply master enable state
        applyMasterEnableState(isEnabled);

        console.log('🎯 MASTER TOGGLE DEBUG: Updating status panels...');
        // Update status panels
        updateStatusPanels();


        console.log('🎯 MASTER TOGGLE DEBUG: Saving settings...');
        saveSettingsDebounced();
        CarrotDebug.setting('masterEnable', !isEnabled, isEnabled);

        console.log('🎯 MASTER TOGGLE DEBUG: Master toggle change completed');
    });
    
    // Display mode
    $('#carrot_display_mode').val(settings.displayMode).on('change', function() {
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
    $('#carrot_send_to_ai').prop('checked', settings.sendToAI).on('change', function() {
        extension_settings[extensionName].sendToAI = Boolean($(this).prop('checked'));
        updateStatusPanels();
        saveSettingsDebounced();
    });
    
    // Auto-expand
    $('#carrot_auto_expand').prop('checked', settings.autoExpand).on('change', function() {
        extension_settings[extensionName].autoExpand = Boolean($(this).prop('checked'));
        saveSettingsDebounced();
    });
    
    // Debug mode
    $('#carrot_debug_mode').prop('checked', settings.debugMode).on('change', function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('debugMode', settings.debugMode, newValue);
        extension_settings[extensionName].debugMode = newValue;
        CarrotDebug.setEnabled(newValue);
        saveSettingsDebounced();
    });
    
    // Baby Bunny Mode
    $('#carrot_baby_bunny_mode').prop('checked', settings.babyBunnyMode).on('change', function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('babyBunnyMode', settings.babyBunnyMode, newValue);
        extension_settings[extensionName].babyBunnyMode = newValue;
        saveSettingsDebounced();

        console.log('🐰 BABY BUNNY DEBUG: Toggle changed', {
            oldValue: settings.babyBunnyMode,
            newValue: newValue,
            settingsSaved: true
        });

        if (newValue) {
            add_baby_bunny_buttons_to_all_existing_messages();
            toastr.info('🐰 Baby Bunny Mode enabled! I\'ll now guide you through creating character archives when you complete sheet commands.');
            console.log('🐰 BABY BUNNY DEBUG: Baby Bunny Mode ENABLED - will detect BunnymoTags in AI responses');
        } else {
            remove_all_baby_bunny_buttons();
            toastr.info('🐰 Baby Bunny Mode disabled.');
            console.log('🐰 BABY BUNNY DEBUG: Baby Bunny Mode DISABLED');
        }

    });

    // WorldBook Tracker toggle
    $('#carrot_worldbook_tracker').prop('checked', settings.worldBookTrackerEnabled).on('change', function() {
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
                console.log('🥕 Auto-rescan enabled - scanning current chat...');
                await scanSelectedLorebooks(Array.from(selectedLorebooks));
                console.log(`🥕 Scan complete - ${scannedCharacters.size} characters loaded`);

                // Restore thinking blocks for current chat
                setTimeout(() => {
                    restoreThinkingBlocksFromChat();
                }, 500);
            }
        } else {
            toastr.info('🔄 Auto-rescan disabled');
        }
    });

    // Max characters displayed (slider)
    $('#carrot_max_characters_display').val(settings.maxCharactersDisplay || 6).on('input', function() {
        const value = parseInt($(this).val());
        $('#carrot_max_display_value').text(value);
        extension_settings[extensionName].maxCharactersDisplay = value;
        saveSettingsDebounced();
    });
    $('#carrot_max_display_value').text(settings.maxCharactersDisplay || 6);

    // Max characters injected (slider)
    $('#carrot_max_characters_inject').val(settings.maxCharactersInject || 6).on('input', function() {
        const value = parseInt($(this).val());
        $('#carrot_max_inject_value').text(value);
        extension_settings[extensionName].maxCharactersInject = value;
        saveSettingsDebounced();
    });
    $('#carrot_max_inject_value').text(settings.maxCharactersInject || 6);
    
    // Lorebook selection toggle
    $(document).on('change', '.carrot-lorebook-toggle', function() {
        const lorebookName = $(this).data('lorebook');
        const isChecked = $(this).prop('checked');

        if (isChecked) {
            selectedLorebooks.add(lorebookName);
            $(this).siblings('.carrot-status-indicator').addClass('active');
        } else {
            selectedLorebooks.delete(lorebookName);
            $(this).siblings('.carrot-status-indicator').removeClass('active');

            // Also remove from characterRepoBooks if it was a character repo
            if (characterRepoBooks.has(lorebookName)) {
                characterRepoBooks.delete(lorebookName);
                CarrotDebug.repo(`Removed ${lorebookName} from character repos (lorebook disabled)`);
            }
        }
        updateStatusPanels();
        saveSettings();
    });
    
    // Character repo toggle
    $(document).on('click', '.carrot-repo-btn', function() {
        const lorebookName = $(this).data('lorebook');
        const isCurrentlyRepo = characterRepoBooks.has(lorebookName);
        
        if (isCurrentlyRepo) {
            characterRepoBooks.delete(lorebookName);
            $(this).removeClass('active').text('📚');
            $(this).siblings('.carrot-lorebook-status').text('Tag Library');
        } else {
            characterRepoBooks.add(lorebookName);
            $(this).addClass('active').text('👤');
            $(this).siblings('.carrot-lorebook-status').text('Character Repo');
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
    $('#carrot-search-lorebooks').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        $('.carrot-lorebook-item').each(function() {
            const lorebookName = $(this).find('.carrot-lorebook-name').text().toLowerCase();
            $(this).toggle(lorebookName.includes(searchTerm));
        });
    });

    // Pack Manager Events
    $('#carrot_auto_check_updates').prop('checked', settings.autoCheckUpdates !== false).on('change', function() {
        extension_settings[extensionName].autoCheckUpdates = $(this).prop('checked');
        saveSettingsDebounced();
    });

    // Pack manager buttons with debouncing
    let packScanInProgress = false;
    const PACK_SCAN_DEBOUNCE_MS = 1000; // Prevent rapid clicks

    $('#carrot-pack-scan').on('click', async function(event) {
        console.log('🎯 PACK MANAGER DEBUG: Scan button clicked');

        // Prevent double-clicks and rapid clicking
        if (packScanInProgress) {
            console.log('⚠️ PACK MANAGER DEBUG: Scan already in progress, ignoring click');
            event.preventDefault();
            return false;
        }

        packScanInProgress = true;
        const button = $(this);
        const originalText = button.html();

        // Visual feedback that click was registered
        button.addClass('clicked');

        console.log('🎯 PACK MANAGER DEBUG: Button element found:', {
            buttonExists: !!button.length,
            originalText: originalText,
            isDisabled: button.prop('disabled')
        });

        // Check if CarrotPackManager exists
        if (!window.CarrotPackManager) {
            console.error('❌ PACK MANAGER ERROR: window.CarrotPackManager not found!');
            $('#carrot-pack-status').html('<p>❌ Pack Manager not initialized. Please refresh the page.</p>');
            return;
        }

        console.log('🎯 PACK MANAGER DEBUG: CarrotPackManager found, checking scanRemotePacks method');

        if (typeof window.CarrotPackManager.scanRemotePacks !== 'function') {
            console.error('❌ PACK MANAGER ERROR: scanRemotePacks method not found!');
            $('#carrot-pack-status').html('<p>❌ Pack Manager scanRemotePacks method missing. Extension may be corrupted.</p>');
            return;
        }

        console.log('🎯 PACK MANAGER DEBUG: Starting pack scan process');

        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Scanning...');
        $('#carrot-pack-status').html('<p>🔍 Scanning GitHub repository for available packs...</p><p>📊 Rate-limit aware scanning with automatic retry enabled.</p>');

        try {
            console.log('🎯 PACK MANAGER DEBUG: Calling scanRemotePacks()...');
            const packs = await window.CarrotPackManager.scanRemotePacks();

            console.log('🎯 PACK MANAGER DEBUG: scanRemotePacks completed successfully:', {
                packsFound: packs?.length || 0,
                packs: packs
            });

            updatePackListUI(packs);
            $('#carrot-pack-status').html(`<p>✅ Found ${packs.length} available packs</p>`);

            console.log('✅ PACK MANAGER DEBUG: Pack scan completed successfully');
        } catch (error) {
            console.error('❌ PACK MANAGER ERROR: Scan failed:', {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                fullError: error
            });

            // Provide user-friendly error messages based on error type
            let userMessage = '';
            if (error.message.includes('rate limit') || error.message.includes('403')) {
                console.warn('⚠️ PACK MANAGER DEBUG: GitHub rate limit detected');
                const retryTime = window.CarrotPackManager?.rateLimitInfo?.resetTime;
                const waitMinutes = retryTime ? Math.ceil((retryTime - Date.now()) / 60000) : 5;
                userMessage = `<p>⏳ GitHub API rate limit reached. The extension will automatically retry.</p>
                              <p>🕒 Rate limit resets in approximately ${waitMinutes} minutes.</p>
                              <p>💡 Tip: Try again later or check console for retry progress.</p>`;
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                console.warn('⚠️ PACK MANAGER DEBUG: Network error detected');
                userMessage = `<p>🌐 Network error occurred. The extension will automatically retry failed requests.</p>
                              <p>🔄 Check your internet connection and try scanning again.</p>
                              <p>💻 Console shows detailed retry attempts and network status.</p>`;
            } else if (error.message.includes('404')) {
                console.warn('⚠️ PACK MANAGER DEBUG: GitHub repository not found');
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
            console.log('🎯 PACK MANAGER DEBUG: Restoring button state');
            button.prop('disabled', false).html(originalText).removeClass('clicked');

            // Reset scan state with debounce delay
            setTimeout(() => {
                packScanInProgress = false;
                console.log('🎯 PACK MANAGER DEBUG: Scan debounce period ended');
            }, PACK_SCAN_DEBOUNCE_MS);
        }
    });

    console.log('✅ PACK MANAGER DEBUG: Pack scan button event handler bound successfully');

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

    // Add loadout manager status card (4th card next to System Status, Character Repository, AI Injection)
    addLoadoutManagerCard();

    // Initialize Baby Bunny Mode button (using qvink_memory timing)
    jQuery(function() {
        initialize_baby_bunny_message_button();

        // Add buttons to all existing messages after template is set up (only if enabled)
        setTimeout(() => {
            if (extension_settings[extensionName]?.babyBunnyMode) {
                add_baby_bunny_buttons_to_all_existing_messages();
            }
        }, 500);
    });

    // Hook into message rendering events to ensure buttons appear on new messages (only if enabled)
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        if (extension_settings[extensionName]?.babyBunnyMode) {
            add_baby_bunny_button_to_message(messageId);
        }
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
        if (extension_settings[extensionName]?.babyBunnyMode) {
            add_baby_bunny_button_to_message(messageId);
        }
    });

    // Mobile touch support for clickable status panels
    // Add touch event handlers to ensure modals open on mobile devices
    const mobileClickableSelectors = [
        '.carrot-status-templates.carrot-clickable',
        '.carrot-status-packs.carrot-clickable',
        '.carrot-status-system.carrot-clickable',
        '.carrot-status-repository.carrot-clickable',
        '.carrot-loadout-manager.carrot-clickable'
    ];

    mobileClickableSelectors.forEach(selector => {
        $(document).on('touchend', selector, function(e) {
            // Don't prevent default - let onclick work naturally
            // Just ensure the element is tappable
            console.log('🥕 MOBILE DEBUG: Touch event fired for:', selector);
        });
    });

    console.log('🥕 MOBILE DEBUG: Mobile touch handlers registered for status panels');
}


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
            console.error('Pack operation failed:', error);
            button.prop('disabled', false).text(originalText);
        }
    });

}

// Add Loadout Manager status card (4th card matching ST's status card style)
function addLoadoutManagerCard() {
    // Find the existing status panel container
    const statusContainer = document.querySelector('.carrot-status-panels');
    if (!statusContainer) {
        CarrotDebug.error('Status panels container not found - cannot add loadout manager card');
        return;
    }
    
    // Create the 4th status card HTML matching CarrotKernel's exact structure
    const loadoutCardHTML = `
        <div class="carrot-status-panel carrot-loadout-manager carrot-clickable" id="carrot-loadout-card"
             data-tooltip="Click to manage loadouts - Save different lorebook profiles for specific chats and characters"
             onclick="CarrotKernel.openLoadoutManager()">
            <div class="carrot-status-icon">
                <i class="fa-solid fa-layer-group"></i>
            </div>
            <div class="carrot-status-content">
                <div class="carrot-status-title">Loadout Manager</div>
                <div class="carrot-status-value" id="carrot-loadout-status">No profiles saved</div>
                <div class="carrot-status-detail" id="carrot-loadout-detail">Click to manage context profiles</div>
            </div>
            <div class="carrot-status-indicator" id="carrot-loadout-indicator">
                <div class="carrot-pulse-dot"></div>
            </div>
            <div class="carrot-click-hint">
                <i class="fa-solid fa-mouse-pointer"></i>
            </div>
        </div>
    `;
    
    // Insert the loadout manager card
    statusContainer.insertAdjacentHTML('beforeend', loadoutCardHTML);
    
    // Update the loadout card status initially and on context changes
    updateLoadoutCardStatus();
    
    // Set up event listeners to update loadout card when context changes
    if (CarrotContext?.stContext?.eventSource) {
        CarrotContext.stContext.eventSource.on(event_types.CHAT_CHANGED, updateLoadoutCardStatus);
        CarrotContext.stContext.eventSource.on(event_types.CHARACTER_PAGE_LOADED, updateLoadoutCardStatus);
        CarrotContext.stContext.eventSource.on(event_types.GROUP_UPDATED, updateLoadoutCardStatus);
    }
    
    CarrotDebug.ui('Loadout Manager status card added successfully');
}

// Update the loadout manager card status
async function updateLoadoutCardStatus() {
    if (!CarrotContext || !CarrotStorage) return;
    
    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    
    let statusText = 'No profiles saved';
    let indicatorClass = '';
    
    // Count saved profiles
    const chatProfiles = CarrotStorage.hasSettingsAt('chat') ? 1 : 0;
    const characterProfiles = CarrotStorage.hasSettingsAt('character') ? 1 : 0;
    const totalProfiles = chatProfiles + characterProfiles;
    
    if (totalProfiles > 0) {
        statusText = `${totalProfiles} profile${totalProfiles > 1 ? 's' : ''} saved`;
        indicatorClass = 'active';
    }
    
    // Determine current context
    let contextInfo = 'Global';
    if (context.isGroup) {
        contextInfo = `Group: ${context.groupId}`;
    } else if (context.characterId && context.characters) {
        const character = context.characters[context.characterId];
        contextInfo = character ? character.name : `Character: ${context.characterId}`;
    }
    
    $('#carrot-loadout-status').text(statusText);
    $('#carrot-loadout-indicator').removeClass('active').addClass(indicatorClass);
    
    // Update tooltip with current context
    $('#carrot-loadout-card').attr('title', `Loadout Manager - Current: ${contextInfo}`);
}

// Open the comprehensive Loadout Manager interface
async function openLoadoutManager() {
    if (!CarrotContext || !CarrotStorage) {
        alert('CarrotKernel loadout system not initialized');
        return;
    }

    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    
    // Build comprehensive loadout management interface
    const loadoutHTML = await buildLoadoutManagerHTML(context, currentSettings);
    
    // Use CarrotKernel's native overlay system for better sizing control
    showCarrotLoadoutOverlay(loadoutHTML, context, currentSettings);
    
    CarrotDebug.ui('Loadout Manager opened');
}

// Show CarrotKernel loadout manager in native overlay system with proper sizing
function showCarrotLoadoutOverlay(loadoutHTML, context, currentSettings) {
    // Get or create the overlay
    let overlay = document.getElementById('carrot-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'carrot-popup-overlay';
        overlay.className = 'carrot-popup-overlay';
        document.body.appendChild(overlay);
    }
    
    // Create loadout-specific container with screen-relative sizing
    const container = document.createElement('div');
    container.id = 'carrot-loadout-container';
    container.className = 'carrot-popup-container carrot-loadout-popup';
    
    // Use viewport-relative dimensions for better screen utilization
    container.style.cssText = `
        width: min(95vw, 1400px);
        height: min(90vh, 900px);
        max-width: none;
        max-height: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--SmartThemeBlurTintColor);
        border: 2px solid var(--SmartThemeEmColor);
        border-radius: 15px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        z-index: 9999;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0;
        margin: 0;
    `;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeButton.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        background: none;
        border: none;
        color: var(--SmartThemeBodyColor);
        font-size: 18px;
        cursor: pointer;
        z-index: 10000;
        padding: 8px;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    `;
    
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = 'var(--SmartThemeEmColor)';
        closeButton.style.color = 'white';
    });
    
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = 'none';
        closeButton.style.color = 'var(--SmartThemeBodyColor)';
    });
    
    closeButton.addEventListener('click', () => {
        hideCarrotLoadoutOverlay();
    });
    
    // Add content wrapper with proper padding and responsive design
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
        padding: 60px 40px 40px 40px;
        height: 100%;
        box-sizing: border-box;
        overflow-y: auto;
    `;
    
    contentWrapper.innerHTML = loadoutHTML;
    container.appendChild(closeButton);
    container.appendChild(contentWrapper);
    
    // Clear any existing content and add new container
    overlay.innerHTML = '';
    overlay.appendChild(container);
    
    // Show overlay with animation
    overlay.style.cssText = `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(5px);
        z-index: 9998;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    // Trigger animation
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
    
    // Bind event handlers for context switching after overlay is shown
    bindLoadoutManagerEvents(context, currentSettings);
    
    // Update loadouts display
    updateLoadoutsDisplay(context);
    
    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideCarrotLoadoutOverlay();
        }
    });
    
    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            hideCarrotLoadoutOverlay();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Store escape handler for cleanup
    overlay.escapeHandler = handleEscape;
}

// Hide CarrotKernel loadout overlay
function hideCarrotLoadoutOverlay() {
    const overlay = document.getElementById('carrot-popup-overlay');
    if (overlay) {
        // Clean up escape handler
        if (overlay.escapeHandler) {
            document.removeEventListener('keydown', overlay.escapeHandler);
            delete overlay.escapeHandler;
        }
        
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }, 300);
    }
}

// Build the comprehensive loadout manager HTML using proper CarrotKernel styling
async function buildLoadoutManagerHTML(context, currentSettings) {
    // Get detailed context information
    let characterName = 'No character';
    let chatName = 'No active chat';
    
    if (context.isGroup) {
        chatName = `Group Chat: ${context.groupId}`;
    } else if (context.characterId && context.characters) {
        const character = context.characters[context.characterId];
        characterName = character ? character.name : `Character: ${context.characterId}`;
        
        // Get chat name from ST context
        const stContext = getContext();
        if (stContext.chatId) {
            chatName = `Chat: ${stContext.chatId}`;
        }
    }
    
    // Determine settings source with proper priority
    let settingsSource = 'Global';
    let contextMode = 'global';
    
    if (CarrotStorage.hasSettingsAt('chat')) {
        settingsSource = 'Chat';
        contextMode = 'chat';
    } else if (CarrotStorage.hasSettingsAt('character')) {
        settingsSource = 'Character';
        contextMode = 'character';
    }
    
    return `
        <div id="carrot-loadout-manager" class="carrot-extension-settings">
            <!-- Context Selection Header -->
            <div class="carrot-context-header">
                <h2 style="text-align: center; margin-bottom: 10px;">🥕 CarrotKernel Loadout Manager</h2>
                <p style="text-align: center; opacity: 0.8; margin-bottom: 20px;">Manage per-context settings and lorebook profiles</p>
                
                <!-- Context Status Panels (matching CarrotKernel main interface design) -->
                <div class="carrot-status-section">
                    <div class="carrot-status-panels">
                        <div class="carrot-status-panel carrot-status-character carrot-clickable ${contextMode === 'character' ? 'active' : ''}" 
                             data-context="character" 
                             data-tooltip="Click to configure settings for this specific character"
                             onclick="switchToCharacterContext()">
                            <div class="carrot-status-icon">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div class="carrot-status-content">
                                <div class="carrot-status-title">Character Settings</div>
                                <div class="carrot-status-value">${characterName}</div>
                                <div class="carrot-status-detail">Click to edit character profile</div>
                            </div>
                            <div class="carrot-status-indicator ${CarrotStorage.hasSettingsAt('character') ? 'success' : ''}">
                                <div class="carrot-pulse-dot"></div>
                            </div>
                            <div class="carrot-click-hint">
                                <i class="fa-solid fa-mouse-pointer"></i>
                            </div>
                        </div>
                        
                        <div class="carrot-status-panel carrot-status-chat carrot-clickable ${contextMode === 'chat' ? 'active' : ''}" 
                             data-context="chat" 
                             data-tooltip="Click to configure settings for this specific chat conversation"
                             onclick="switchToChatContext()">
                            <div class="carrot-status-icon">
                                <i class="fa-solid fa-comments"></i>
                            </div>
                            <div class="carrot-status-content">
                                <div class="carrot-status-title">Chat Settings</div>
                                <div class="carrot-status-value">${chatName}</div>
                                <div class="carrot-status-detail">Click to edit chat profile</div>
                            </div>
                            <div class="carrot-status-indicator ${CarrotStorage.hasSettingsAt('chat') ? 'success' : ''}">
                                <div class="carrot-pulse-dot"></div>
                            </div>
                            <div class="carrot-click-hint">
                                <i class="fa-solid fa-mouse-pointer"></i>
                            </div>
                        </div>
                        
                        <div class="carrot-status-panel carrot-status-reset carrot-clickable"
                             data-context="reset"
                             data-tooltip="Reset settings for the currently active context (${contextMode === 'character' ? 'Character' : contextMode === 'chat' ? 'Chat' : 'Global'})"
                             onclick="resetCurrentContextSettings('${contextMode}')">
                            <div class="carrot-status-icon">
                                <i class="fa-solid fa-rotate-left"></i>
                            </div>
                            <div class="carrot-status-content">
                                <div class="carrot-status-title">Reset Settings</div>
                                <div class="carrot-status-value">${contextMode === 'character' ? 'Character' : contextMode === 'chat' ? 'Chat' : 'Global'} Context</div>
                                <div class="carrot-status-detail">Click to restore defaults</div>
                            </div>
                            <div class="carrot-status-indicator warning">
                                <div class="carrot-pulse-dot"></div>
                            </div>
                            <div class="carrot-click-hint">
                                <i class="fa-solid fa-mouse-pointer"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Feature Controls for Selected Context -->
            <div class="carrot-card carrot-enable-card carrot-tutorial-target" id="carrot-context-controls">
                <div class="carrot-card-header">
                    <h3 id="carrot-context-title">⚡ ${contextMode === 'character' ? 'Character' : contextMode === 'chat' ? 'Chat' : 'Global'} Settings</h3>
                    <p class="carrot-card-subtitle" id="carrot-context-subtitle">Configure CarrotKernel for this specific context</p>
                </div>
                <div class="carrot-card-body">
                    <div class="carrot-settings-grid">
                        ${generateContextSettings(currentSettings, contextMode)}
                    </div>
                </div>
            </div>
            
            <!-- Lorebook Management -->
            <div class="carrot-card carrot-tutorial-target" id="carrot-context-lorebooks">
                <div class="carrot-card-header">
                    <h3>📚 Context Lorebook Management</h3>
                    <p class="carrot-card-subtitle">Select lorebooks and repositories for this context</p>
                </div>
                <div class="carrot-card-body">
                    <div class="carrot-search-container">
                        <input type="text" id="carrot-context-search-lorebooks" class="carrot-search-input" placeholder="🔍 Search lorebooks...">
                    </div>
                    <div class="carrot-lorebook-container">
                        <div class="carrot-lorebook-list" id="carrot-context-lorebook-list">
                            ${generateContextLorebookList(currentSettings.enabledRepos)}
                        </div>
                    </div>
                    <div class="carrot-action-bar">
                        <button id="carrot-context-scan-btn" class="carrot-primary-btn">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            Scan Selected Lorebooks
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Advanced Context Settings -->
            <div class="carrot-card carrot-tutorial-target" id="carrot-context-advanced">
                <div class="carrot-card-header">
                    <h3>🔧 Advanced Context Settings</h3>
                    <p class="carrot-card-subtitle">Fine-tune behavior for this specific context</p>
                </div>
                <div class="carrot-card-body">
                    <div class="carrot-settings-grid">
                        ${generateAdvancedContextSettings(currentSettings)}
                    </div>
                </div>
            </div>
            
            <!-- Profile Management -->
            <div class="carrot-card carrot-tutorial-target" id="carrot-profile-management">
                <div class="carrot-card-header">
                    <h3>💼 Profile Management</h3>
                    <p class="carrot-card-subtitle">Import, export, and manage loadout profiles</p>
                </div>
                <div class="carrot-card-body">
                    ${generateProfileManagement(contextMode)}
                </div>
            </div>
        </div>
    `;
}

// Bind event handlers for loadout manager interactions (now simplified since using inline onclick)
function bindLoadoutManagerEvents(context, currentSettings) {
    // Only need to bind the profile management buttons since context switching uses inline onclick
    setTimeout(() => {
        // Profile management button handlers
        const saveBtn = document.getElementById('carrot-context-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveCurrentLoadoutProfile();
            });
        }

        const clearBtn = document.getElementById('carrot-context-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearCurrentLoadoutProfile();
            });
        }

        // Lorebook scanning button handler
        const scanBtn = document.getElementById('carrot-context-scan-btn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                scanLoadoutLorebooks();
            });
        }

        // Profile template button handlers
        const generalTemplate = document.getElementById('carrot-template-general');
        if (generalTemplate) {
            generalTemplate.addEventListener('click', () => {
                applyProfileTemplate('general');
            });
        }

        const roleplayTemplate = document.getElementById('carrot-template-roleplay');
        if (roleplayTemplate) {
            roleplayTemplate.addEventListener('click', () => {
                applyProfileTemplate('roleplay');
            });
        }

        const minimalTemplate = document.getElementById('carrot-template-minimal');
        if (minimalTemplate) {
            minimalTemplate.addEventListener('click', () => {
                applyProfileTemplate('minimal');
            });
        }

        // Loadout assignment system handlers
        const changeLoadoutBtn = document.getElementById('carrot-change-loadout');
        if (changeLoadoutBtn) {
            changeLoadoutBtn.addEventListener('click', () => {
                openLoadoutAssignment(context, currentSettings);
            });
        }

        const saveLoadoutBtn = document.getElementById('carrot-save-loadout');
        if (saveLoadoutBtn) {
            saveLoadoutBtn.addEventListener('click', () => {
                saveCurrentAsLoadout();
            });
        }

        const manageLoadoutsBtn = document.getElementById('carrot-manage-loadouts');
        if (manageLoadoutsBtn) {
            manageLoadoutsBtn.addEventListener('click', () => {
                openLoadoutManagement();
            });
        }

        // Slider event handlers for real-time value display
        const maxDisplaySlider = document.getElementById('carrot_context_max_display');
        if (maxDisplaySlider) {
            maxDisplaySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                const valueDisplay = document.getElementById('carrot_context_max_display_value');
                if (valueDisplay) valueDisplay.textContent = value;
            });
        }

        const maxInjectSlider = document.getElementById('carrot_context_max_inject');
        if (maxInjectSlider) {
            maxInjectSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                const valueDisplay = document.getElementById('carrot_context_max_inject_value');
                if (valueDisplay) valueDisplay.textContent = value;
            });
        }

        if (extension_settings[extensionName]?.debugMode) {
            console.log('🥕 LOADOUT DEBUG: Simplified event binding completed (using inline onclick for context switching)');
        }
        CarrotDebug.ui('Loadout manager events bound successfully');
    }, 100);
}

// Switch context in loadout manager
async function switchLoadoutContext(selectedContext, context, currentSettings) {
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Switching to context: ${selectedContext}`);
    }
    
    // Check if clicking the same active context (deselection)
    const contextCards = document.querySelectorAll('.carrot-status-panel[data-context="character"], .carrot-status-panel[data-context="chat"]');
    const currentActiveCard = document.querySelector('.carrot-status-panel.active[data-context]');
    const isDeselecting = currentActiveCard && currentActiveCard.dataset.context === selectedContext;
    
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Found ${contextCards.length} context cards, deselecting: ${isDeselecting}`);
    }
    
    // Update active state
    contextCards.forEach(card => {
        if (isDeselecting) {
            // Deselecting - remove active from all
            card.classList.remove('active');
        } else {
            // Selecting new context
            card.classList.remove('active');
            if (card.dataset.context === selectedContext) {
                card.classList.add('active');
                if (extension_settings[extensionName]?.debugMode) {
                    console.log(`🥕 LOADOUT DEBUG: Activated card for context: ${selectedContext}`);
                }
            }
        }
    });
    
    // If deselecting, use global/default settings and update interface
    if (isDeselecting) {
        updateLoadoutInterface('global', currentSettings, context);
        updateLoadoutsDisplay(context);
        if (extension_settings[extensionName]?.debugMode) {
            console.log(`🥕 LOADOUT DEBUG: Deselected context, reverted to global settings`);
        }
        CarrotDebug.ui('Deselected context - reverted to default settings');
        return;
    }

    // Get context-specific settings using the correct CarrotStorage method
    // CarrotStorage.getSettings() already handles the hierarchy internally
    const contextSettings = await CarrotStorage.getSettings();

    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Settings loaded for context ${selectedContext}:`, contextSettings);
    }

    // Update the interface content for the selected context
    updateLoadoutInterface(selectedContext, contextSettings, context);
    
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Interface updated for context: ${selectedContext}`);
    }
    CarrotDebug.ui(`Switched loadout context to: ${selectedContext}`);
}

// Reset settings for the currently active context
async function resetCurrentContextSettings(contextMode) {
    const contextName = contextMode === 'character' ? 'Character' :
                       contextMode === 'chat' ? 'Chat' : 'Global';

    const confirmMessage = `Reset all ${contextName} settings to default?\n\nThis will restore global defaults for this context and cannot be undone.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Resetting ${contextMode} context settings`);
    }

    // Clear settings for the specified context
    if (contextMode === 'character' || contextMode === 'chat') {
        await CarrotStorage.clearSettings(contextMode);

        // Reload the loadout manager to show updated state
        await CarrotKernel.openLoadoutManager();

        // Show success message
        toastr.success(`${contextName} settings reset to defaults`, 'CarrotKernel', { timeOut: 3000 });

        CarrotDebug.ui(`Reset ${contextMode} context settings to defaults`);
    }
}

// Update loadout interface content based on selected context
function updateLoadoutInterface(contextMode, contextSettings, context) {
    // Update main title and subtitle
    const titleElement = document.getElementById('carrot-context-title');
    const subtitleElement = document.getElementById('carrot-context-subtitle');
    
    if (titleElement && subtitleElement) {
        const contextName = contextMode === 'character' ? 'Character' : 
                          contextMode === 'chat' ? 'Chat' : 'Default';
        const subtitleText = contextMode === 'global' ? 'No context selected - showing default/global settings' : 
                           `Configure CarrotKernel for this specific ${contextMode}`;
        titleElement.innerHTML = `⚡ ${contextName} Settings`;
        subtitleElement.textContent = subtitleText;
    }

    // Update settings grid with context-specific values
    const settingsGrid = document.querySelector('#carrot-context-controls .carrot-settings-grid');
    if (settingsGrid) {
        settingsGrid.innerHTML = generateContextSettings(contextSettings, contextMode);
    }

    // Update lorebook list for this context
    const lorebookList = document.getElementById('carrot-context-lorebook-list');
    if (lorebookList) {
        lorebookList.innerHTML = generateContextLorebookList(contextSettings.enabledRepos);
    }

    // Update advanced settings
    const advancedGrid = document.querySelector('#carrot-context-advanced .carrot-settings-grid');
    if (advancedGrid) {
        advancedGrid.innerHTML = generateAdvancedContextSettings(contextSettings);
    }

    // Update button text
    const saveBtn = document.getElementById('carrot-context-save-btn');
    if (saveBtn) {
        const contextName = contextMode === 'character' ? 'Character' : 
                          contextMode === 'chat' ? 'Chat' : 'Global';
        saveBtn.innerHTML = `<i class="fa-solid fa-save"></i> Save ${contextName} Profile`;
    }
}

// Generate context settings matching CarrotKernel's feature controls
function generateContextSettings(currentSettings, contextMode) {
    return `
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_enabled" ${currentSettings.enabled ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Master Enable</span>
            </label>
            <div class="carrot-help-text">Enable/disable CarrotKernel character tracking system</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_ai_injection" ${currentSettings.sendToAI ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">AI Injection</span>
            </label>
            <div class="carrot-help-text">Send character data to AI context for consistency</div>
        </div>
        <div class="carrot-setting-item">
            <select id="carrot_context_display_mode" class="carrot-select">
                <option value="none" ${currentSettings.displayMode === 'none' ? 'selected' : ''}>No Display</option>
                <option value="thinking" ${currentSettings.displayMode === 'thinking' ? 'selected' : ''}>Thinking Box Style</option>
                <option value="cards" ${currentSettings.displayMode === 'cards' ? 'selected' : ''}>Character Cards</option>
            </select>
            <div class="carrot-help-text">Choose how character data appears in chat</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_auto_expand" ${currentSettings.autoExpand ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Auto-expand thinking boxes</span>
            </label>
            <div class="carrot-help-text">Automatically expand thinking boxes when displayed</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_baby_bunny" ${currentSettings.babyBunnyMode ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">🐰 Baby Bunny Mode</span>
            </label>
            <div class="carrot-help-text">Guided automation for sheet processing and character archive creation</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_worldbook_tracker" ${currentSettings.worldBookTrackerEnabled ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">🌍 WorldBook Tracker</span>
            </label>
            <div class="carrot-help-text">Show WorldBook Tracker icon and panel for monitoring active lorebook entries</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_auto_rescan" ${currentSettings.autoRescanOnChatLoad ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">🔄 Auto-rescan on chat load</span>
            </label>
            <div class="carrot-help-text">Automatically re-scan character repos when switching chats to restore tag display</div>
        </div>
    `;
}

// Generate lorebook list matching existing CarrotKernel lorebook styling
function generateContextLorebookList(enabledRepos) {
    const availableLorebooks = world_names || [];
    
    if (availableLorebooks.length === 0) {
        return `
            <div class="carrot-loading-state">
                <div class="carrot-spinner"></div>
                <p>No lorebooks found. Create some lorebooks in SillyTavern first.</p>
            </div>
        `;
    }
    
    return availableLorebooks.map(lorebookName => {
        const isSelected = enabledRepos && enabledRepos.has(lorebookName);
        const isCharacterRepo = characterRepoBooks.has(lorebookName);
        const repoType = isCharacterRepo ? 'Character Repo' : 'Tag Library';
        
        return `
            <div class="carrot-lorebook-item ${isSelected ? 'selected' : ''}">
                <label class="carrot-lorebook-label">
                    <input type="checkbox" class="carrot-lorebook-checkbox" data-lorebook="${lorebookName}" ${isSelected ? 'checked' : ''}>
                    <span class="carrot-status-indicator ${isSelected ? 'active' : ''}"></span>
                    <span class="carrot-lorebook-name">${lorebookName}</span>
                </label>
                <div class="carrot-lorebook-actions">
                    <button class="carrot-repo-btn ${isCharacterRepo ? 'active' : ''}" 
                            data-lorebook="${lorebookName}" title="Toggle Character Repository">
                        ${isCharacterRepo ? '👤' : '📚'}
                    </button>
                    <span class="carrot-lorebook-status">
                        ${repoType}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// Generate advanced settings matching CarrotKernel's advanced settings
function generateAdvancedContextSettings(currentSettings) {
    const maxDisplay = currentSettings.maxCharactersDisplay || 6;
    const maxInject = currentSettings.maxCharactersInject || 6;

    return `
        <div class="carrot-setting-item">
            <label class="carrot-label">
                <span class="carrot-label-text">Max Characters Displayed: <span id="carrot_context_max_display_value">${maxDisplay}</span></span>
                <span class="carrot-label-hint">Limit characters shown in chat to prevent visual clutter</span>
            </label>
            <input type="range" id="carrot_context_max_display" class="carrot-slider" min="1" max="20" value="${maxDisplay}">
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-label">
                <span class="carrot-label-text">Max Characters Injected: <span id="carrot_context_max_inject_value">${maxInject}</span></span>
                <span class="carrot-label-hint">Limit characters sent to AI context to save tokens</span>
            </label>
            <input type="range" id="carrot_context_max_inject" class="carrot-slider" min="1" max="20" value="${maxInject}">
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_debug_mode" ${currentSettings.debugMode ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Debug Mode</span>
            </label>
            <div class="carrot-help-text">Enable detailed console logging</div>
        </div>
    `;
}

// Generate profile management section
function generateProfileManagement(contextMode) {
    const contextName = contextMode === 'character' ? 'Character' : 
                       contextMode === 'chat' ? 'Chat' : 
                       'Current Context';
    
    return `
        <div class="carrot-settings-grid">
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Context Profile Actions</span>
                    <span class="carrot-label-hint">Save, load, and manage ${contextName.toLowerCase()} settings</span>
                </label>
                <div class="carrot-profile-actions">
                    <button id="carrot-context-save-btn" class="carrot-primary-btn">
                        <i class="fa-solid fa-save"></i>
                        Save ${contextName} Profile
                    </button>
                    <button id="carrot-context-clear-btn" class="carrot-secondary-btn">
                        <i class="fa-solid fa-eraser"></i>
                        Clear Settings
                    </button>
                </div>
            </div>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Current Loadout</span>
                    <span class="carrot-label-hint">Active loadout assigned to this ${contextName.toLowerCase()}</span>
                </label>
                <div class="carrot-current-loadout" id="carrot-current-loadout">
                    <div class="carrot-loadout-status">
                        <div class="carrot-status-indicator">
                            <div class="carrot-pulse-dot carrot-blink"></div>
                        </div>
                        <div class="carrot-status-text">
                            <div class="carrot-current-loadout-name" id="carrot-current-loadout-name">None Selected</div>
                            <div class="carrot-current-loadout-desc" id="carrot-current-loadout-desc">No loadout assigned to this ${contextName.toLowerCase()}</div>
                        </div>
                        <button id="carrot-change-loadout" class="carrot-primary-btn">
                            <i class="fa-solid fa-exchange-alt"></i>
                            Assign Loadout
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Loadout Library</span>
                    <span class="carrot-label-hint">Create, manage, and assign your reusable loadouts</span>
                </label>
                <div class="carrot-loadouts-section">
                    <div class="carrot-loadouts-list" id="carrot-loadouts-list">
                        <div class="carrot-empty-loadouts">
                            <i class="fa-solid fa-bookmark"></i>
                            <p>No saved loadouts yet</p>
                            <small>Save your current settings as a loadout to reuse later</small>
                        </div>
                    </div>
                    <div class="carrot-loadout-actions">
                        <button id="carrot-save-loadout" class="carrot-primary-btn">
                            <i class="fa-solid fa-bookmark"></i>
                            Save Current Settings
                        </button>
                        <button id="carrot-manage-loadouts" class="carrot-secondary-btn">
                            <i class="fa-solid fa-cog"></i>
                            Manage Loadouts
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Import/Export</span>
                    <span class="carrot-label-hint">Share loadouts with other users</span>
                </label>
                <div class="carrot-profile-actions">
                    <button id="carrot-export-profile" class="carrot-secondary-btn">
                        <i class="fa-solid fa-download"></i>
                        Export Profile
                    </button>
                    <button id="carrot-import-profile" class="carrot-secondary-btn">
                        <i class="fa-solid fa-upload"></i>
                        Import Profile
                    </button>
                </div>
            </div>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Profile Templates</span>
                    <span class="carrot-label-hint">Quick-start templates for common configurations</span>
                </label>
                <div class="carrot-template-actions">
                    <button id="carrot-template-general" class="carrot-primary-btn carrot-template-btn carrot-tooltip" 
                            title="All features ON, 6 character limit, thinking boxes, depth 4 - Best for most users">
                        <i class="fa-solid fa-star"></i>
                        General Purpose
                    </button>
                    <button id="carrot-template-roleplay" class="carrot-primary-btn carrot-template-btn carrot-tooltip"
                            title="Card display mode, 10 character limit, auto-expand ON - Enhanced for immersive roleplay">
                        <i class="fa-solid fa-theater-masks"></i>
                        Roleplay Focus
                    </button>
                    <button id="carrot-template-minimal" class="carrot-primary-btn carrot-template-btn carrot-tooltip"
                            title="No display mode, 3 character limit, depth 2, filtered - Lightweight performance">
                        <i class="fa-solid fa-minimize"></i>
                        Minimal Setup
                    </button>
                </div>
            </div>
        </div>
    `;
}

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
async function getLoadoutSettings() {
    return {
        enabledRepos: selectedLorebooks,
        scanOnStartup: $('#loadout-scan-startup').prop('checked'),
        autoScanEnabled: extension_settings[extensionName].sendToAI,
        displaySettings: {
            showCards: extension_settings[extensionName].displayMode !== 'disabled',
            groupByCharacter: true,
            compactMode: false
        }
    };
}


// Global CarrotKernel object for UI interactions
window.CarrotKernel = {
    // Tutorial system variables
    currentTutorial: null,
    currentStep: 0,
    tutorialSteps: [],
    resizeHandler: null,
    
    // Tutorial definitions
    tutorials: {
        'basic-setup': {
            title: 'System Configuration Tutorial',
            steps: [
                {
                    target: '.carrot-setting-item:first-child',
                    title: 'Master Enable',
                    content: `
                        Turn on CarrotKernel. Must be enabled for all functionality.
                    `
                },
                {
                    target: '.carrot-setting-item:nth-child(2)',
                    title: 'AI Injection',
                    content: `
                        Send character data to AI automatically when characters are mentioned.
                    `
                },
                {
                    target: '.carrot-setting-item:nth-child(3)',
                    title: 'Display Mode',
                    content: `
                        How character data appears in chats:
                        No Display (recommended), Thinking Box, or Character Cards
                    `
                },
                {
                    target: '.carrot-search-container',
                    title: 'Search Lorebooks',
                    content: `
                        Type to filter your lorebook list quickly.
                    `
                },
                {
                    target: '.carrot-lorebook-item',
                    title: 'Select Lorebooks',
                    content: `
                        Check boxes next to lorebooks you want to use.
                    `
                },
                {
                    target: '#carrot-scan-btn',
                    title: 'Scan Selected',
                    content: `
                        Click to scan and index character data from selected lorebooks.
                    `
                }
            ]
        },
        
        'repository-management': {
            title: 'Repository Management Tutorial',
            steps: [
                {
                    target: 'button#carrot-scan-btn',
                    title: 'Start Here: Scan Button',
                    content: `
                        🔍 CLICK "SCAN SELECTED LOREBOOKS" to begin!

                        This scans your lorebooks for character data and creates a searchable repository.
                        After scanning, you'll see character cards that you can click to view details.
                        
                        ✨ The scan finds <BunnymoTags> blocks and organizes character information automatically.
                    `
                },
                {
                    target: '#carrot-lorebook-management',
                    title: 'Two Types of Lorebooks',
                    content: `
                        👤 CHARACTER REPOSITORIES: Contain individual character data
                        📚 TAG LIBRARIES: Contain tag definitions (species, personality, etc.)

                        You need both types for complete functionality.
                    `
                },
                {
                    target: '.carrot-lorebook-item',
                    title: 'Mark Repository Types',
                    content: `
                        Use the 👤/📚 buttons to mark lorebook types.

                        Character repos have <BunnymoTags> blocks with character names.
                        Tag libraries have definitions like "TSUNDERE: Hostile but caring..."
                    `
                }
            ]
        },
        
        'loadout-manager': {
            title: 'Loadout Manager Tutorial',
            steps: [
                {
                    target: '.carrot-loadout-context-cards',
                    title: 'Context-Specific Settings',
                    content: `
                        Create different settings for different characters and chats.

                        Character Settings apply to ALL chats with that character.
                        Chat Settings apply ONLY to this specific conversation.
                    `
                },
                {
                    target: '#carrot-context-lorebooks',
                    title: 'Different Lorebooks Per Context',
                    content: `
                        Select different lorebooks for each context.

                        Example: Medieval Chat uses Medieval + Fantasy lorebooks.
                        Sci-fi Chat uses Space + Technology lorebooks.
                    `
                },
                {
                    target: '#carrot-profile-management',
                    title: 'Save and Apply Profiles',
                    content: `
                        Save your settings as named profiles, then assign them to characters/chats.

                        Settings auto-apply when you enter that context.
                    `
                }
            ]
        },
        
        'injection-system': {
            title: 'AI Injection System Tutorial',
            steps: [
                {
                    target: '.carrot-status-injection',
                    title: 'How Injection Works',
                    content: `
                        When you mention "Alice" in chat:
                        1. CarrotKernel detects the character name
                        2. Sends Alice's data to AI context
                        3. AI maintains character consistency
                        4. Your chat stays clean (ephemeral injection)
                    `
                },
                {
                    target: 'select#carrot_display_mode',
                    title: 'Display Modes',
                    content: `
                        Choose how character data appears:

                        NO DISPLAY: Silent injection (recommended)
                        THINKING BOX: Shows in expandable boxes
                        CHARACTER CARDS: Visual character cards
                    `
                },
                {
                    target: 'input#carrot_injection_depth',
                    title: 'Injection Depth',
                    content: `
                        Controls priority in AI context.

                        Depth 4 (recommended): Same as GuidedGenerations
                        Lower = higher priority but may interfere
                        Higher = lower priority, may be ignored
                    `
                }
            ]
        },
        'template-editor': {
            title: 'Template Editor Tutorial',
            steps: [
                {
                    target: 'select#bmt_template_selector',
                    title: 'Select Template',
                    content: `
                        Choose which template to edit. Templates control how character data is formatted for the AI.
                    `
                },
                {
                    target: 'textarea#prompt',
                    title: 'Edit Template Content',
                    content: `
                        Write your injection prompt using {{MACRO_NAME}} variables:
                        {{TRIGGERED_CHARACTER_TAGS}} - Character data
                        {{CHARACTER_LIST}} - Character names
                    `
                },
                {
                    target: '.bmt-button-group',
                    title: 'Template Actions',
                    content: `
                        👁️ Preview: See template with real data
                        💾 Save: Save your changes
                        📋 Duplicate: Copy template for experiments
                    `
                }
            ]
        },
        'baby-bunny': {
            title: 'Baby Bunny Mode Tutorial',
            steps: [
                {
                    target: '.carrot-info-box',
                    title: 'What is Baby Bunny Mode?',
                    content: `
                        The <strong style="color: var(--ck-primary);">🎩🐰 rabbit-in-hat button</strong> appears on all AI message cards.
                        <br><br>
                        Click it to manually declare that a message contains a character sheet, which opens this Baby Bunny Mode popup.
                        <br><br>
                        This guided interface helps you transform AI-generated character sheets (with or without &lt;BunnymoTags&gt;) into permanent lorebook entries.
                        <br><br>
                        Let's walk through the process!
                    `
                },
                {
                    target: '#tutorial-step-1',
                    title: 'Step 1: Choose Archive Location',
                    content: `
                        First, decide where to save this character archive:
                        <br><br>
                        • <strong>Create New Lorebook:</strong> Makes a fresh lorebook file just for this character
                        <br>
                        • <strong>Add to Existing:</strong> Adds this character to an existing lorebook
                        <br><br>
                        <strong>Tip:</strong> Group related characters together in the same lorebook!
                    `
                },
                {
                    target: '#tutorial-step-2',
                    title: 'Step 2: Configure Entry Details',
                    content: `
                        Set up how this character entry will be identified:
                        <br><br>
                        • <strong>Entry Name:</strong> What the lorebook entry is called
                        <br>
                        • <strong>Selection Mode:</strong> Constant (always active) or Selective (trigger-based)
                        <br>
                        • <strong>Trigger Keys:</strong> Words that activate the data (if Selective)
                        <br><br>
                        <strong>Tip:</strong> Use Constant for main characters, Selective for supporting cast!
                    `
                },
                {
                    target: '#tutorial-trigger-keys',
                    title: 'Adding Trigger Keys',
                    content: `
                        Click the input field and type a trigger word, then press <strong>Enter</strong> or <strong>Space</strong> to add it.
                        <br><br>
                        Example triggers for "Atsu_Ibn_Oba_Al-Masri":
                        <br>
                        • Atsu
                        <br>
                        • Ibn Oba
                        <br>
                        • Al-Masri
                        <br>
                        • The Pharaoh
                        <br><br>
                        Click the X on any tag to remove it!
                    `
                },
                {
                    target: '#tutorial-step-3',
                    title: 'Step 3: Review Character Data',
                    content: `
                        This shows all the BunnymoTags parsed from the AI's character sheet:
                        <br><br>
                        • <strong>Physical</strong> tags (species, build, appearance)
                        <br>
                        • <strong>Personality</strong> tags (traits, dere types, MBTI)
                        <br>
                        • <strong>NSFW</strong> tags (orientation, kinks, chemistry)
                        <br>
                        • <strong>Linguistics</strong> (speech patterns)
                        <br><br>
                        In real use, you can click this to edit the tags before saving!
                    `
                },
                {
                    target: '#tutorial-step-4',
                    title: 'Step 4: Activate Lorebook',
                    content: `
                        Choose when this character's lorebook should be active:
                        <br><br>
                        • <strong>Character Settings:</strong> Active in ALL chats with this character
                        <br>
                        • <strong>Chat Settings:</strong> Active ONLY in this specific conversation
                        <br>
                        • <strong>Global Settings:</strong> Active in all chats everywhere
                        <br><br>
                        <strong>Recommended:</strong> Use Character Settings for best results!
                    `
                },
                {
                    target: '#tutorial-step-5',
                    title: 'Create the Archive!',
                    content: `
                        Click <strong>"Create Archive"</strong> to save this character to your lorebook!
                        <br><br>
                        What happens next:
                        <br>
                        1. Character data saved to lorebook entry
                        <br>
                        2. Lorebook activated for the chosen scope
                        <br>
                        3. Character automatically injected when mentioned in chat
                        <br><br>
                        <strong>Tutorial Mode:</strong> This demo button is disabled - in real use, it would create the archive!
                    `
                }
            ]
        }
    },

    // Open system tutorial - shows basic setup and configuration tutorial
    openSystemTutorial() {
        // Tutorial doesn't need any specific panel open
        this.startTutorial('basic-setup');
    },

    // Open repository tutorial - shows character repository vs tag library tutorial
    openRepositoryTutorial() {
        // Tutorial doesn't need any specific panel open
        this.startTutorial('repository-management');
    },

    // Open injection tutorial - shows AI injection system tutorial
    openInjectionTutorial() {
        // Tutorial doesn't need any specific panel open
        this.startTutorial('injection-system');
    },

    // Open loadout manager tutorial - shows character vs chat context tutorial
    async openLoadoutTutorial() {
        // Open the loadout manager popup first
        await this.openLoadoutManager();

        // Wait for popup to render, then start tutorial
        setTimeout(() => {
            this.startTutorial('loadout-manager');
        }, 500);
    },

    // Open template editor tutorial - shows how to use the template system
    openTemplateEditorTutorial() {
        // Open the template editor modal first
        if (typeof openTemplateEditorModal === 'function') {
            openTemplateEditorModal();
        } else {
            // Fallback: try to click the template editor button
            const templateButton = document.querySelector('[onclick*="openTemplateEditorModal"]');
            if (templateButton) {
                templateButton.click();
            }
        }

        // Wait for modal to render, then start tutorial
        setTimeout(() => {
            this.startTutorial('template-editor');
        }, 500);
    },

    // Open Baby Bunny Mode tutorial - shows how to use the character archive creator
    openBabyBunnyTutorial() {
        // Create a tutorial-specific Baby Bunny popup with example data
        const tutorialBunnyData = `<BunnymoTags><Name:Atsu_Ibn_Oba_Al-Masri>, <GENRE:FANTASY>
<PHYSICAL>
<SPECIES:HUMAN>, <GENDER:MALE>, <BUILD:Muscular>, <BUILD:Tall>, <SKIN:FAIR>, <HAIR:BLACK>, <STYLE:ANCIENT_EGYPTIAN_ROYALTY>,</PHYSICAL>
<PERSONALITY><Dere:Sadodere>, <Dere:Oujidere>, <ENTJ-U>, <TRAIT:CRUEL>, <TRAIT:INTELLIGENT>, <TRAIT:POWERFUL>, <TRAIT:DANGEROUS>, <TRAIT:SELFISH>, <TRAIT:HEDONISTIC>, <ATTACHMENT:FEARFUL_AVOIDANT>, <CONFLICT:COMPETITIVE>, <BOUNDARIES:RIGID>,<FLIRTING:AGGRESSIVE>, </PERSONALITY>
<NSFW><ORIENTATION:PANSEXUAL>, <POWER:DOMINANT>, <KINK:BRAT_TAMING>, <KINK:PUBLIC_HUMILIATION>, <KINK:POWER_PLAY>, <KINK:EXHIBITIONISM>, <CHEMISTRY:ANTAGONISTIC>, <AROUSAL:DOMINANCE>, <TRAUMA:CHILDHOOD>, <JEALOUSY:POSSESSIVE>,</NSFW>

<Genre>
This story primarily uses <GENRE:BLANK> as its most prominent narrative foundation, establishing the core structure and pacing. This is often blended with <GENRE:ROMANCE> as a secondary layer, adding emotional stakes and relationship development to the primary genre framework.
</Genre>

<Linguistics>
Character uses <LING:COMMANDING> as his primary mode of speech, asserting authority and control. This is almost always blended with <LING:SUGGESTIVE>, using a tone of cruel flirtation, possessive pet names, and psychological manipulation to achieve his goals.
</linguistics></BunnymoTags>`;

        // Show tutorial-specific Baby Bunny popup
        this.showTutorialBabyBunnyPopup(tutorialBunnyData);

        // Wait for popup to render, then start tutorial
        setTimeout(() => {
            this.startTutorial('baby-bunny');
        }, 500);
    },

    // Open repository manager popup with Pack Manager-style layout
    openRepositoryManager() {
        const settings = extension_settings[extensionName];
        if (!settings.enabled) {
            this.showPopup('CarrotKernel Disabled', `
                <p>CarrotKernel is currently disabled. Please enable it first to manage repositories.</p>
                <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
            `);
            return;
        }

        // Clean up stale repositories (ones that no longer exist in selected lorebooks)
        this.cleanupStaleRepositories();

        this.currentRepoView = 'home';
        this.selectedCharacter = null;
        this.selectedRepository = null;
        this.renderRepositoryManager();
    },

    // Remove repositories that are no longer in selected lorebooks
    cleanupStaleRepositories() {
        const reposToRemove = [];
        characterRepoBooks.forEach(repoName => {
            if (!selectedLorebooks.has(repoName)) {
                reposToRemove.push(repoName);
            }
        });

        if (reposToRemove.length > 0) {
            console.log('🥕 Cleaning up stale repositories:', reposToRemove);
            reposToRemove.forEach(repo => {
                characterRepoBooks.delete(repo);
                // Remove characters from this repository
                const charsToRemove = [];
                scannedCharacters.forEach((char, name) => {
                    if (char.source === repo) {
                        charsToRemove.push(name);
                    }
                });
                charsToRemove.forEach(name => scannedCharacters.delete(name));
            });

            // Save cleaned settings
            extension_settings[extensionName].characterRepoBooks = Array.from(characterRepoBooks);
            saveSettingsDebounced();
        }
    },

    // Render the repository manager with Pack Manager-style two-panel layout
    renderRepositoryManager() {
        // Update active status for all characters based on current triggers
        const triggeredChars = CarrotTemplateManager.getTriggeredCharacters();
        const triggeredNames = new Set(triggeredChars.map(c => c.name));

        scannedCharacters.forEach((char, name) => {
            char.isActive = triggeredNames.has(name);
        });

        const characterCount = scannedCharacters.size;
        const selectedCount = selectedLorebooks.size;
        const repoCount = characterRepoBooks.size;
        const activeCharacters = Array.from(scannedCharacters.values()).filter(c => c.isActive).length;
        const totalTags = Array.from(scannedCharacters.values()).reduce((sum, char) => {
            return sum + (char.tags ? Object.keys(char.tags).length : 0);
        }, 0);

        let content = `
            <div class="carrot-repo-browser">
                <!-- Header with stats -->
                <div class="carrot-repo-header-card">
                    <div class="carrot-repo-title-section">
                        <div class="carrot-repo-title-text">
                            <h2>🥕 Character Repository Manager</h2>
                            <p class="carrot-repo-subtitle">Manage indexed characters and lorebook repositories</p>
                        </div>
                        <div class="carrot-repo-header-actions">
                            <button onclick="CarrotKernel.manualScan()" class="carrot-repo-header-btn">
                                <i class="fa-solid fa-rotate"></i> Rescan
                            </button>
                            <button onclick="CarrotKernel.closePopup(); CarrotKernel.openRepositoryTutorial()" class="carrot-repo-header-btn">
                                <i class="fa-solid fa-graduation-cap"></i> Tutorial
                            </button>
                            <button onclick="CarrotKernel.closePopup()" class="carrot-repo-header-btn carrot-repo-close-btn">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>
                    <div class="carrot-repo-stats-row">
                        <div class="carrot-repo-stat-badge">
                            <span class="carrot-repo-stat-value">${characterCount}</span>
                            <span class="carrot-repo-stat-label">Characters</span>
                        </div>
                        <div class="carrot-repo-stat-badge">
                            <span class="carrot-repo-stat-value">${activeCharacters}</span>
                            <span class="carrot-repo-stat-label">Active</span>
                        </div>
                        <div class="carrot-repo-stat-badge">
                            <span class="carrot-repo-stat-value">${repoCount}</span>
                            <span class="carrot-repo-stat-label">Repositories</span>
                        </div>
                        <div class="carrot-repo-stat-badge">
                            <span class="carrot-repo-stat-value">${totalTags}</span>
                            <span class="carrot-repo-stat-label">Total Tags</span>
                        </div>
                    </div>
                </div>

                <!-- Two-panel layout -->
                <div class="carrot-repo-main-content">
                    <!-- Left panel: Repository contents -->
                    <div class="carrot-repo-browser-card">
                        <div class="carrot-repo-card-header">
                            <div class="carrot-repo-breadcrumb">
                                ${this.renderRepositoryBreadcrumb()}
                            </div>
                        </div>
                        <div class="carrot-repo-file-list" id="carrot-repo-file-list">
                            ${this.renderRepositoryContents()}
                        </div>
                    </div>

                    <!-- Right panel: Preview -->
                    <div class="carrot-repo-preview-card">
                        <div class="carrot-repo-card-header">
                            <h3><i class="fa-solid fa-eye"></i> Preview</h3>
                        </div>
                        <div class="carrot-repo-preview-content" id="carrot-repo-preview">
                            ${this.renderRepositoryPreview()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.showPopup('Character Repository Manager', content);
    },

    // Render breadcrumb navigation
    renderRepositoryBreadcrumb() {
        if (this.currentRepoView === 'home') {
            return `
                <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                    <i class="fa-solid fa-folder"></i> Repository Contents
                </span>
            `;
        } else if (this.currentRepoView === 'repository') {
            return `
                <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="CarrotKernel.navigateRepoHome()">
                    <i class="fa-solid fa-folder"></i> Repositories
                </span>
                <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
                <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                    ${this.selectedRepository}
                </span>
            `;
        } else if (this.currentRepoView === 'character') {
            return `
                <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="CarrotKernel.navigateRepoHome()">
                    <i class="fa-solid fa-folder"></i> Repositories
                </span>
                <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
                <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="CarrotKernel.navigateToRepository('${this.selectedRepository}')">
                    ${this.selectedRepository}
                </span>
                <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
                <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                    ${this.selectedCharacter}
                </span>
            `;
        }
    },

    // Render repository contents (left panel)
    renderRepositoryContents() {
        if (this.currentRepoView === 'home') {
            return this.renderRepositoryList();
        } else if (this.currentRepoView === 'repository') {
            return this.renderCharacterList();
        } else if (this.currentRepoView === 'character') {
            return this.renderCharacterDetails();
        }
    },

    // Render preview (right panel)
    renderRepositoryPreview() {
        if (this.selectedCharacter && this.currentRepoView === 'character') {
            return `<div class="carrot-repo-empty-preview">Character details shown in left panel</div>`;
        } else if (this.selectedRepository) {
            const characters = Array.from(scannedCharacters.values())
                .filter(c => c.source === this.selectedRepository);
            return `
                <div class="carrot-repo-preview-info">
                    <h4>${this.selectedRepository}</h4>
                    <p><strong>${characters.length}</strong> characters indexed</p>
                    <ul class="carrot-repo-character-quick-list">
                        ${characters.slice(0, 10).map(c => `<li>${c.name || 'Unknown'}</li>`).join('')}
                        ${characters.length > 10 ? `<li><em>+ ${characters.length - 10} more...</em></li>` : ''}
                    </ul>
                </div>
            `;
        } else {
            return `
                <div class="carrot-repo-empty-preview">
                    <i class="fa-solid fa-folder-open" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                    <p>Select a repository to preview</p>
                    <p style="font-size: 12px; opacity: 0.7;">Click on any repository to see its contents and details</p>
                </div>
            `;
        }
    },
    
    // Update repository manager content without closing popup
    updateRepositoryManagerContent() {
        const popupContainer = document.getElementById('carrot-popup-container');
        if (!popupContainer) {
            return; // Popup is not open
        }
        
        const characterCount = scannedCharacters.size;
        const selectedCount = selectedLorebooks.size;
        
        // Update statistics cards
        const statsCards = popupContainer.querySelectorAll('[style*="font-size: 28px"]');
        if (statsCards.length >= 3) {
            statsCards[0].textContent = characterCount;
            statsCards[1].textContent = selectedCount;
            statsCards[2].textContent = characterRepoBooks.size;
        }
        
        // Note: Character cards section will be handled by forceShowCharacterCards()
        // Just update the Getting Started section to show it's now active
        if (characterCount > 0) {
            const gettingStarted = popupContainer.querySelector('h5[style*="Getting Started"]');
            if (gettingStarted) {
                const gettingStartedContainer = gettingStarted.closest('div[style*="background: linear-gradient"]');
                if (gettingStartedContainer) {
                    // Just update the title and text, don't add character cards here
                    gettingStartedContainer.innerHTML = `
                        <h5 style="margin: 0 0 12px 0; color: var(--SmartThemeEmColor); font-size: 18px; font-weight: 600;">✅ Repository Active</h5>
                        <p style="margin: 0 0 12px 0; color: #e0e0e0; line-height: 1.4;">Your character repositories are working! CarrotKernel will automatically:</p>
                        <ul style="margin: 0; padding-left: 20px; color: #d0d0d0; line-height: 1.6;">
                            <li style="margin-bottom: 8px;">Detect when you mention these ${characterCount} characters</li>
                            <li style="margin-bottom: 8px;">Inject their data into AI context for consistency</li>
                            <li style="margin-bottom: 8px;">Display results based on your chosen display mode</li>
                        </ul>
                    `;
                }
            }
        }
    },
    
    // Force show character cards - simple inline approach
    forceShowCharacterCards() {
        const popupContainer = document.getElementById('carrot-popup-container');
        if (!popupContainer || scannedCharacters.size === 0) {
            if (extension_settings[extensionName]?.debugMode) {
                console.log('Cannot show character cards:', { popupContainer: !!popupContainer, characterCount: scannedCharacters.size });
            }
            return;
        }
        
        // Update the existing character count stats
        this.updateCharacterCountStats();
        
        // Add a simple character list after the purple header section
        this.addCharactersList();
        
        // Hide getting started since user completed setup
        this.hideGettingStartedSection();
        
        if (extension_settings[extensionName]?.debugMode) {
            console.log(`✅ Character data updated - ${scannedCharacters.size} characters available`);
        }
    },
    
    // Add simple characters list
    addCharactersList() {
        const popupContainer = document.getElementById('carrot-popup-container');
        if (!popupContainer || scannedCharacters.size === 0) return;
        
        // Remove existing character list if any
        const existingList = popupContainer.querySelector('#carrot-characters-list');
        if (existingList) {
            existingList.remove();
        }
        
        // Create new character list
        const charactersList = document.createElement('div');
        charactersList.id = 'carrot-characters-list';
        charactersList.style.cssText = `
            background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
            border: 1px solid #555;
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        `;
        
        let listHTML = `
            <h5 style="margin: 0 0 16px 0; color: var(--SmartThemeEmColor); font-size: 16px; font-weight: 600;">
                ✅ Found ${scannedCharacters.size} Characters
            </h5>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
        `;
        
        scannedCharacters.forEach((characterData, characterName) => {
            let tagCount = 0;
            
            // Debug character data during list generation
            if (extension_settings[extensionName]?.debugMode) {
                console.log(`🔍 LIST GEN - Character: ${characterName}`);
            }
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 LIST GEN - Data:', characterData);
            }
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 LIST GEN - Tags:', characterData?.tags);
            }
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 LIST GEN - Tags type:', typeof characterData?.tags);
            }
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 LIST GEN - Is Map:', characterData?.tags instanceof Map);
            }
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 LIST GEN - Is Set:', characterData?.tags instanceof Set);
            }
            
            if (characterData && characterData.tags) {
                if (characterData.tags instanceof Map) {
                    tagCount = characterData.tags.size;
                } else if (characterData.tags instanceof Set) {
                    tagCount = characterData.tags.size;
                } else if (Array.isArray(characterData.tags)) {
                    tagCount = characterData.tags.length;
                } else if (typeof characterData.tags === 'object') {
                    tagCount = Object.keys(characterData.tags).length;
                }
            }
            
            listHTML += `
                <div style="
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onclick="CarrotKernel.showCharacterDetails('${characterName}')"
                   onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'"
                   onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: var(--SmartThemeEmColor);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 18px;
                    ">${characterName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="color: white; font-weight: 500; font-size: 14px;">${characterName}</div>
                        <div style="color: #bbb; font-size: 12px;">${tagCount} tags</div>
                    </div>
                </div>
            `;
        });
        
        listHTML += '</div>';
        charactersList.innerHTML = listHTML;
        
        // Insert after the purple header section
        const purpleSection = popupContainer.querySelector('div[style*="background: linear-gradient"][style*="SmartThemeEmColor"]');
        if (purpleSection) {
            purpleSection.parentNode.insertBefore(charactersList, purpleSection.nextSibling);
        } else {
            popupContainer.appendChild(charactersList);
        }
    },
    
    // Update character count in stats
    updateCharacterCountStats() {
        const popupContainer = document.getElementById('carrot-popup-container');
        if (!popupContainer) return;
        
        // Update the first stats card (Characters Indexed)
        const statsCards = popupContainer.querySelectorAll('[style*="font-size: 28px"]');
        if (statsCards.length >= 1) {
            statsCards[0].textContent = scannedCharacters.size;
        }
    },
    
    
    // Show character details inline with collapse
    showCharacterDetails(characterName) {
        const characterData = scannedCharacters.get(characterName);
        if (!characterData) {
            alert('Character data not found for: ' + characterName);
            return;
        }
        
        if (extension_settings[extensionName]?.debugMode) {
            console.log('🔍 Showing character details for:', characterName, characterData);
        }
        
        // Store the current repository manager state before changing views
        const popupContainer = document.getElementById('carrot-popup-container');
        if (popupContainer) {
            this._previousRepositoryState = popupContainer.innerHTML;
            if (extension_settings[extensionName]?.debugMode) {
                console.log('💾 Stored repository manager state for restoration');
            }
        }
        
        try {
            // Create back button container
            const backButtonHTML = `
                <div style="margin-bottom: 16px;">
                    <button onclick="CarrotKernel.returnToRepositoryManager()" style="
                        background: var(--SmartThemeQuoteColor);
                        color: var(--SmartThemeEmColor);
                        border: 1px solid var(--SmartThemeBorderColor);
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8';" onmouseout="this.style.opacity='1';">
                        <i class="fa-solid fa-arrow-left" style="margin-right: 8px;"></i>
                        Back to Repository
                    </button>
                </div>`;
            
            // Convert Map-based tags to object format expected by createExternalCardContainer
            const tagsObject = {};
            if (characterData.tags && characterData.tags instanceof Map) {
                characterData.tags.forEach((value, key) => {
                    // Convert Set values to arrays
                    if (value instanceof Set) {
                        tagsObject[key] = Array.from(value);
                    } else if (Array.isArray(value)) {
                        tagsObject[key] = value;
                    } else {
                        tagsObject[key] = [String(value)];
                    }
                });
            }
            
            if (extension_settings[extensionName]?.debugMode) {
                console.log('🔍 DEBUG: Converted tags for character card:', tagsObject);
            }
            
            // Use existing CarrotKernel character card system
            const characterForCard = {
                name: characterName,
                tags: tagsObject,
                source: characterData.source
            };
            
            const cardContainer = createExternalCardContainer([characterForCard], Date.now());
            
            // Show in repository manager popup
            const popupContainer = document.getElementById('carrot-popup-container');
            if (popupContainer && cardContainer) {
                popupContainer.innerHTML = backButtonHTML;
                popupContainer.appendChild(cardContainer);
                
                // Auto-activate first tab in each character card
                setTimeout(() => {
                    const tabs = cardContainer.querySelectorAll('.carrot-tab');
                    const personalityTabs = cardContainer.querySelectorAll('.carrot-tab[data-tab="personality"]');
                    
                    if (extension_settings[extensionName]?.debugMode) {
                        console.log('🔍 DEBUG: Found tabs:', tabs.length);
                    }
                    if (extension_settings[extensionName]?.debugMode) {
                        console.log('🔍 DEBUG: Found personality tabs:', personalityTabs.length);
                    }
                    
                    // Click the first personality tab to ensure it's active and content is shown
                    personalityTabs.forEach((tab, index) => {
                        if (!tab.classList.contains('active')) {
                            tab.click();
                            if (extension_settings[extensionName]?.debugMode) {
                                console.log(`🔓 Auto-activated personality tab ${index + 1}`);
                            }
                        }
                    });
                }, 200); // Slightly longer delay to ensure tabs are ready
            }
            
        } catch (error) {
            console.error('Character details error:', error, characterData);
            alert('Error displaying character details: ' + error.message);
        }
    },
    
    // Return to repository manager from character details
    returnToRepositoryManager() {
        console.log('🔄 Returning to repository manager');
        // Simply restore the stored repository manager state
        if (this._previousRepositoryState) {
            const popupContainer = document.getElementById('carrot-popup-container');
            if (popupContainer) {
                popupContainer.innerHTML = this._previousRepositoryState;
                console.log('✅ Restored exact previous repository manager state');
            }
        } else {
            // Fallback to regenerating if no stored state
            this.openRepositoryManager();
        }
    },
    
    // Hide Getting Started section when character cards are visible
    hideGettingStartedSection() {
        const popupContainer = document.getElementById('carrot-popup-container');
        if (!popupContainer) {
            console.log('❌ No popup container found');
            return;
        }
        
        // Debug: log all h5 elements to see what we have
        const allH5s = popupContainer.querySelectorAll('h5');
        console.log('🔍 All h5 elements found:', Array.from(allH5s).map(h5 => h5.textContent));
        
        // Try multiple ways to find the section
        let sectionToHide = null;
        
        // Method 1: Look for exact text match
        Array.from(allH5s).forEach(h5 => {
            if (h5.textContent.includes('Getting Started') || h5.textContent.includes('Repository Active')) {
                sectionToHide = h5.closest('div');
                console.log('✅ Found section by text:', h5.textContent);
            }
        });
        
        // Method 2: Look for specific styling if Method 1 failed
        if (!sectionToHide) {
            sectionToHide = popupContainer.querySelector('div[style*="background: linear-gradient"][style*="#2a2a2a"]');
            if (sectionToHide) {
                console.log('✅ Found section by gradient styling');
            }
        }
        
        if (sectionToHide) {
            console.log('🎯 Hiding section:', sectionToHide);
            
            // Immediate hide - no animation to avoid issues
            sectionToHide.style.display = 'none';
            
            // Or remove entirely after a brief delay
            setTimeout(() => {
                if (sectionToHide.parentNode) {
                    sectionToHide.remove();
                    console.log('✅ Getting Started section removed - user has completed setup');
                }
            }, 100);
        } else {
            console.log('❌ Could not find Getting Started section to hide');
        }
    },
    
    // Generate HTML for character cards display
    generateCharacterCardsHTML() {
        if (scannedCharacters.size === 0) {
            return '<p style="color: #888; text-align: center; padding: 20px;">No characters scanned yet</p>';
        }
        
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 12px;">';
        
        scannedCharacters.forEach((characterData, characterName) => {
            // Handle different possible data structures
            let tags = [];
            
            console.log('Character data for', characterName, ':', characterData);
            
            if (characterData && characterData.tags) {
                if (characterData.tags instanceof Map) {
                    // Convert Map to array of "key: value" strings
                    tags = Array.from(characterData.tags.entries()).map(([key, value]) => `${key}: ${value}`);
                } else if (Array.isArray(characterData.tags)) {
                    tags = characterData.tags;
                } else if (typeof characterData.tags === 'object') {
                    // Convert object to array of "key: value" strings
                    tags = Object.entries(characterData.tags).map(([key, value]) => `${key}: ${value}`);
                }
            } else if (Array.isArray(characterData)) {
                tags = characterData;
            } else if (characterData && typeof characterData === 'object') {
                // Try to find other array properties
                tags = characterData.processedTags || characterData.allTags || [];
            }
            
            const tagCount = tags.length;
            const firstFewTags = tags.slice(0, 3).map(tag => {
                if (typeof tag === 'string') {
                    return tag.split(':')[1] || tag;
                } else {
                    return String(tag);
                }
            }).join(', ');
            
            html += `
                <div style="
                    background: linear-gradient(135deg, #3a3a3a 0%, #4a4a4a 100%);
                    border: 1px solid #666;
                    border-radius: 8px;
                    padding: 16px;
                    transition: all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)'" 
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                        <div style="
                            width: 40px; 
                            height: 40px; 
                            background: var(--SmartThemeEmColor); 
                            border-radius: 50%; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            color: white; 
                            font-weight: bold;
                            font-size: 18px;
                        ">${characterName.charAt(0).toUpperCase()}</div>
                        <div>
                            <div style="color: white; font-weight: 600; font-size: 16px;">${characterName}</div>
                            <div style="color: #bbb; font-size: 12px;">${tagCount} tags indexed</div>
                        </div>
                    </div>
                    
                    ${tagCount > 0 ? `
                        <div style="margin-bottom: 8px;">
                            <div style="color: #ccc; font-size: 13px; margin-bottom: 4px;">Sample Tags:</div>
                            <div style="color: #aaa; font-size: 12px; font-style: italic;">${firstFewTags}${tagCount > 3 ? '...' : ''}</div>
                        </div>
                    ` : ''}
                    
                    <button onclick="CarrotKernel.toggleCharacterDetails('${characterName}')" style="
                        width: 100%;
                        padding: 8px;
                        background: rgba(255, 255, 255, 0.1);
                        color: #e0e0e0;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" 
                       onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                        📋 View Profile
                    </button>
                    <div id="character-details-${characterName}" style="display: none; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid #555;">
                        <!-- Character details will be loaded here -->
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    },
    
    // Navigation functions
    navigateRepoHome() {
        this.currentRepoView = 'home';
        this.selectedRepository = null;
        this.selectedCharacter = null;
        this.renderRepositoryManager();
    },

    selectRepository(repoName) {
        // Just update the preview, don't navigate
        this.selectedRepository = repoName;
        this.updateRepositoryPreview();

        // Highlight selected item
        document.querySelectorAll('.carrot-repo-file-item').forEach(item => {
            item.classList.remove('carrot-repo-selected');
        });
        const selectedItem = document.querySelector(`.carrot-repo-file-item[data-repo="${repoName}"]`);
        if (selectedItem) {
            selectedItem.classList.add('carrot-repo-selected');
        }
    },

    updateRepositoryPreview() {
        const previewEl = document.getElementById('carrot-repo-preview');
        if (!previewEl) return;

        if (!this.selectedRepository) {
            previewEl.innerHTML = `
                <div class="carrot-repo-empty-preview">
                    <i class="fa-solid fa-folder-open" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                    <p>Select a repository to preview</p>
                    <p style="font-size: 12px; opacity: 0.7;">Click on any repository to see its contents and details</p>
                </div>
            `;
            return;
        }

        // Get characters from this repository
        const characters = Array.from(scannedCharacters.values())
            .filter(c => c.source === this.selectedRepository)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (characters.length === 0) {
            previewEl.innerHTML = `
                <div class="carrot-repo-preview-info">
                    <h4>${this.selectedRepository}</h4>
                    <p><strong>0</strong> characters indexed</p>
                    <p style="opacity: 0.7; font-size: 13px;">No characters found in this repository</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="carrot-repo-preview-info">
                <h4>${this.selectedRepository}</h4>
                <p><strong>${characters.length}</strong> ${characters.length === 1 ? 'character' : 'characters'} indexed</p>
                <div class="carrot-repo-character-preview-list">
        `;

        characters.forEach(char => {
            const name = char.name || 'Unknown';
            // Handle both Map and Object structures for tags
            let tagCount = 0;
            if (char.tags) {
                if (char.tags instanceof Map) {
                    tagCount = char.tags.size;
                } else if (typeof char.tags === 'object') {
                    tagCount = Object.keys(char.tags).length;
                }
            }
            const activeIcon = char.isActive ? '🟢' : '⚪';

            html += `
                <div class="carrot-repo-character-preview-item" onclick="CarrotKernel.navigateToCharacter('${name.replace(/'/g, "\\'")}', '${this.selectedRepository.replace(/'/g, "\\'")}')">
                    <span class="carrot-repo-preview-icon">${activeIcon}</span>
                    <span class="carrot-repo-preview-name">${name}</span>
                    <span class="carrot-repo-preview-tags">${tagCount} tags</span>
                </div>
            `;
        });

        html += '</div></div>';
        previewEl.innerHTML = html;
    },

    navigateToRepository(repoName) {
        this.currentRepoView = 'repository';
        this.selectedRepository = repoName;
        this.selectedCharacter = null;
        this.renderRepositoryManager();
    },

    navigateToCharacter(characterName, repoName) {
        this.currentRepoView = 'character';
        this.selectedCharacter = characterName;
        this.selectedRepository = repoName;
        this.renderRepositoryManager();
    },

    // Render list of all repositories
    renderRepositoryList() {
        // Only show repos that are both marked as character repos AND exist in selected lorebooks
        const repoBooks = Array.from(characterRepoBooks).filter(repo => selectedLorebooks.has(repo));

        if (repoBooks.length === 0) {
            return `
                <div class="carrot-repo-empty-state">
                    <i class="fa-solid fa-inbox" style="font-size: 64px; opacity: 0.3;"></i>
                    <p><strong>No character repositories found</strong></p>
                    <p style="font-size: 13px; opacity: 0.8;">Mark lorebooks as character repositories to see them here</p>
                </div>
            `;
        }

        let html = '<div class="carrot-repo-summary">';
        html += `<p>${repoBooks.length} ${repoBooks.length === 1 ? 'repository' : 'repositories'} • ${scannedCharacters.size} ${scannedCharacters.size === 1 ? 'character' : 'characters'} total</p>`;
        html += '</div>';

        repoBooks.forEach(repoName => {
            const characters = Array.from(scannedCharacters.values())
                .filter(c => c.source === repoName);

            html += `
                <div class="carrot-repo-file-item carrot-clickable"
                     onclick="CarrotKernel.selectRepository('${repoName.replace(/'/g, "\\'")}')"
                     ondblclick="CarrotKernel.navigateToRepository('${repoName.replace(/'/g, "\\'")}')"
                     data-repo="${repoName}">
                    <div class="carrot-repo-file-icon">
                        <i class="fa-solid fa-folder"></i>
                    </div>
                    <div class="carrot-repo-file-info">
                        <div class="carrot-repo-file-name">${repoName}</div>
                        <div class="carrot-repo-file-meta">${characters.length} ${characters.length === 1 ? 'character' : 'characters'}</div>
                    </div>
                </div>
            `;
        });

        return html;
    },

    // Render list of characters in a repository
    renderCharacterList() {
        const characters = Array.from(scannedCharacters.values())
            .filter(c => c.source === this.selectedRepository)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (characters.length === 0) {
            return `
                <div class="carrot-repo-empty-state">
                    <i class="fa-solid fa-users-slash" style="font-size: 64px; opacity: 0.3;"></i>
                    <p><strong>No characters found</strong></p>
                </div>
            `;
        }

        let html = '<div class="carrot-repo-summary">';
        html += `<p>${characters.length} ${characters.length === 1 ? 'character' : 'characters'} in this repository</p>`;
        html += '</div>';

        characters.forEach(char => {
            const name = char.name || 'Unknown';
            // Handle both Map and Object structures for tags
            let tagCount = 0;
            if (char.tags) {
                if (char.tags instanceof Map) {
                    tagCount = char.tags.size;
                } else if (typeof char.tags === 'object') {
                    tagCount = Object.keys(char.tags).length;
                }
            }
            const isActive = char.isActive;

            html += `
                <div class="carrot-repo-file-item carrot-clickable" onclick="CarrotKernel.navigateToCharacter('${name}', '${this.selectedRepository}')">
                    <div class="carrot-repo-file-icon">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="carrot-repo-file-info">
                        <div class="carrot-repo-file-name">
                            ${isActive ? '<span class="carrot-repo-status-active">🟢</span> ' : ''}${name}
                        </div>
                        <div class="carrot-repo-file-meta">${tagCount} ${tagCount === 1 ? 'tag' : 'tags'}</div>
                    </div>
                </div>
            `;
        });

        return html;
    },

    // Render character details
    renderCharacterDetails() {
        const character = Array.from(scannedCharacters.values())
            .find(c => c.name === this.selectedCharacter && c.source === this.selectedRepository);

        if (!character) {
            return `
                <div class="carrot-repo-empty-state">
                    <i class="fa-solid fa-exclamation-triangle" style="font-size: 64px; opacity: 0.3;"></i>
                    <p><strong>Character not found</strong></p>
                </div>
            `;
        }

        // Handle both Map and Object structures for tags
        let tagCategories = [];
        let tagCount = 0;
        const isMap = character.tags instanceof Map;

        if (isMap) {
            tagCategories = Array.from(character.tags.keys());
            tagCount = character.tags.size;
        } else if (character.tags && typeof character.tags === 'object') {
            tagCategories = Object.keys(character.tags);
            tagCount = tagCategories.length;
        }

        let html = '<div class="carrot-repo-character-detail">';

        // Character header
        html += `
            <div class="carrot-repo-detail-header">
                <div class="carrot-repo-detail-avatar">
                    <i class="fa-solid fa-user-circle"></i>
                </div>
                <div class="carrot-repo-detail-info">
                    <h3>${character.name || 'Unknown'}</h3>
                    <p>
                        ${character.isActive ? '<span class="carrot-repo-badge-active">🟢 Active</span>' : '<span class="carrot-repo-badge-inactive">⚪ Inactive</span>'}
                        <span class="carrot-repo-badge">${tagCount} tag categories</span>
                    </p>
                </div>
            </div>
        `;

        // Tags by category
        if (tagCategories.length > 0) {
            html += '<div class="carrot-repo-tags-section">';
            tagCategories.forEach(category => {
                // Get tags from Map or Object
                let categoryTags = [];
                if (isMap) {
                    const tagSet = character.tags.get(category);
                    categoryTags = tagSet instanceof Set ? Array.from(tagSet) : (Array.isArray(tagSet) ? tagSet : []);
                } else {
                    categoryTags = character.tags[category] || [];
                }

                if (categoryTags.length > 0) {
                    html += `
                        <div class="carrot-repo-tag-category">
                            <h4>${category}</h4>
                            <div class="carrot-repo-tag-list">
                                ${categoryTags.map(tag => `<span class="carrot-repo-tag">${tag}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }
            });
            html += '</div>';
        } else {
            html += '<div class="carrot-repo-no-tags"><p>No tags found for this character</p></div>';
        }

        html += '</div>';
        return html;
    },

    // Show character list detail view
    showCharacterList() {
        const characters = Array.from(scannedCharacters.entries());
        const characterHTML = characters.map(([name, data]) => {
            const tagCount = data.tags ? Object.keys(data.tags).length : 0;
            const isActive = data.isActive ? '🟢' : '⚪';
            return `
                <div class="carrot-list-item">
                    <div class="carrot-list-header">
                        <span class="carrot-list-status">${isActive}</span>
                        <span class="carrot-list-name">${name}</span>
                        <span class="carrot-list-badge">${tagCount} tags</span>
                    </div>
                </div>
            `;
        }).join('');

        this.showPopup('Indexed Characters', `
            <div class="carrot-repo-content">
                <div class="carrot-list-container">
                    ${characterHTML || '<div class="carrot-empty-state"><p>No characters indexed</p></div>'}
                </div>
            </div>
        `);
    },

    // Show lorebook list
    showLorebookList() {
        const lorebooks = Array.from(selectedLorebooks);
        const repoBooks = Array.from(characterRepoBooks);

        const lorebookHTML = lorebooks.map(name => {
            const isRepo = repoBooks.includes(name);
            const icon = isRepo ? '👤' : '📚';
            return `
                <div class="carrot-list-item">
                    <div class="carrot-list-header">
                        <span class="carrot-list-icon">${icon}</span>
                        <span class="carrot-list-name">${name}</span>
                        <span class="carrot-list-badge">${isRepo ? 'Character Repo' : 'Regular'}</span>
                    </div>
                </div>
            `;
        }).join('');

        this.showPopup('Selected Lorebooks', `
            <div class="carrot-repo-content">
                <div class="carrot-list-container">
                    ${lorebookHTML || '<div class="carrot-empty-state"><p>No lorebooks selected</p></div>'}
                </div>
            </div>
        `);
    },

    // Show repository list
    showRepositoryList() {
        const repoBooks = Array.from(characterRepoBooks);
        const repoHTML = repoBooks.map(name => {
            const characters = Array.from(scannedCharacters.values())
                .filter(c => c.source === name);
            return `
                <div class="carrot-list-item">
                    <div class="carrot-list-header">
                        <span class="carrot-list-icon">👤</span>
                        <span class="carrot-list-name">${name}</span>
                        <span class="carrot-list-badge">${characters.length} characters</span>
                    </div>
                </div>
            `;
        }).join('');

        this.showPopup('Character Repositories', `
            <div class="carrot-repo-content">
                <div class="carrot-list-container">
                    ${repoHTML || '<div class="carrot-empty-state"><p>No character repositories</p></div>'}
                </div>
            </div>
        `);
    },

    // Toggle character cards visibility
    toggleCharacterCards() {
        const cardsDiv = document.getElementById('carrot-character-cards');
        const button = document.querySelector('button[onclick="CarrotKernel.toggleCharacterCards()"]');

        if (cardsDiv && button) {
            if (cardsDiv.style.display === 'none') {
                cardsDiv.style.display = 'block';
                button.innerHTML = '👁️ Hide Cards';
                // Update the content in case new characters were added
                cardsDiv.innerHTML = this.generateCharacterCardsHTML();
            } else {
                cardsDiv.style.display = 'none';
                button.innerHTML = '👁️ View Cards';
            }
        }
    },
    
    // Toggle detailed character profile inline
    toggleCharacterDetails(characterName) {
        const detailsDiv = document.getElementById(`character-details-${characterName}`);
        const button = document.querySelector(`button[onclick="CarrotKernel.toggleCharacterDetails('${characterName}')"]`);
        
        if (!detailsDiv || !button) {
            console.error('Character details elements not found');
            return;
        }
        
        if (detailsDiv.style.display === 'none') {
            // Show details - generate content if not already loaded
            if (!detailsDiv.innerHTML.trim() || detailsDiv.innerHTML.includes('Character details will be loaded here')) {
                const characterData = scannedCharacters.get(characterName);
                if (!characterData) {
                    detailsDiv.innerHTML = '<p style="color: #ff6666;">Character data not found</p>';
                } else {
                    detailsDiv.innerHTML = this.generateCharacterDetailsHTML(characterName, characterData);
                }
            }
            detailsDiv.style.display = 'block';
            button.innerHTML = '📋 Hide Profile';
        } else {
            // Hide details
            detailsDiv.style.display = 'none';
            button.innerHTML = '📋 View Profile';
        }
    },
    
    // Generate detailed character profile HTML
    generateCharacterDetailsHTML(characterName, characterData) {
        // Handle different possible data structures
        let tags = [];
        
        if (characterData && characterData.tags) {
            if (characterData.tags instanceof Map) {
                // Convert Map to array of "key: value" strings
                tags = Array.from(characterData.tags.entries()).map(([key, value]) => `${key}: ${value}`);
            } else if (Array.isArray(characterData.tags)) {
                tags = characterData.tags;
            } else if (typeof characterData.tags === 'object') {
                // Convert object to array of "key: value" strings
                tags = Object.entries(characterData.tags).map(([key, value]) => `${key}: ${value}`);
            }
        } else if (Array.isArray(characterData)) {
            tags = characterData;
        } else if (characterData && typeof characterData === 'object') {
            // Try to find other array properties
            tags = characterData.processedTags || characterData.allTags || [];
        }
        
        if (tags.length === 0) {
            return '<p style="color: #aaa;">No tags found for this character</p>';
        }
        
        // Group tags by category (basic grouping)
        const grouped = {};
        tags.forEach(tag => {
            const tagStr = typeof tag === 'string' ? tag : String(tag);
            const parts = tagStr.split(':');
            const category = parts[0] ? parts[0].trim() : 'Other';
            const value = parts[1] ? parts[1].trim() : tagStr;
            
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(value);
        });
        
        let html = '<div style="max-height: 300px; overflow-y: auto;">';
        
        Object.entries(grouped).forEach(([category, values]) => {
            html += `
                <div style="margin-bottom: 12px;">
                    <div style="color: var(--SmartThemeEmColor); font-weight: 600; font-size: 13px; margin-bottom: 6px; text-transform: uppercase;">
                        ${category}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            `;
            
            values.forEach(value => {
                html += `
                    <span style="
                        background: rgba(255, 255, 255, 0.1);
                        color: #ddd;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">${value}</span>
                `;
            });
            
            html += '</div></div>';
        });
        
        html += '</div>';
        return html;
    },
    
    // Open template manager - beautiful UI with reliable functionality
    openTemplateManager() {
        const settings = extension_settings[extensionName];
        if (!settings.enabled) {
            this.showPopup('CarrotKernel Disabled', `
                <p>CarrotKernel is currently disabled. Please enable it first to manage templates.</p>
                <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
            `);
            return;
        }
        
        this.showTemplateManagerInterface();
    },
    
    // Open pack manager for BunnyMo pack installation and updates
    async openPackManager() {
        console.log('🥕🔥 OPEN PACK MANAGER: Function called!');
        console.log('🥕🔥 OPEN PACK MANAGER: Window width:', window.innerWidth);

        // Prevent multiple simultaneous opens
        if (this._packManagerOpening) {
            console.log('🥕🔥 OPEN PACK MANAGER: Already opening, ignoring duplicate call');
            return;
        }

        const settings = extension_settings[extensionName];
        console.log('🥕🔥 OPEN PACK MANAGER: Settings enabled?', settings?.enabled);

        if (!settings.enabled) {
            console.log('🥕🔥 OPEN PACK MANAGER: Extension disabled - showing error popup');
            this.showPopup('CarrotKernel Disabled', `
                <p>CarrotKernel is currently disabled. Please enable it first to manage packs.</p>
                <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
            `);
            return;
        }

        this._packManagerOpening = true;
        try {
            await this.showPackManagerInterface();
        } finally {
            this._packManagerOpening = false;
        }
    },
    
    // Show BunnyMoTags template manager (copied from your BunnyMoTags code)
    showTemplateManagerInterface() {
        // Implementation will use BunnyMoTags approach directly
        this.openTemplateEditor();
    },
    
    openTemplateEditor() {
        const templates = CarrotTemplateManager.getTemplates();
        const templateKeys = Object.keys(templates);
        
        if (templateKeys.length === 0) {
            console.warn('No templates available');
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
        
        this.showTemplateEditor(selectedTemplateKey, templates);
    },
    
    // Copy BunnyMoTags template editor exactly
    showTemplateEditor(selectedKey, allTemplates) {
        // Initialize template manager if needed
        if (!this.carrotTemplatePromptEditInterface) {
            this.carrotTemplatePromptEditInterface = new CarrotTemplatePromptEditInterface();
        }
        
        this.carrotTemplatePromptEditInterface.selectedTemplate = selectedKey;
        this.carrotTemplatePromptEditInterface.show();
    },
    
    // Show GitHub repository browser interface
    async showPackManagerInterface() {
        // Show loading popup while scanning
        this.showPopup('BunnyMo Repository Browser', `
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
            if (!this.githubBrowser) {
                console.log('🥕🔥 PACK MANAGER: Creating new GitHub browser');
                this.githubBrowser = new CarrotGitHubBrowser();
            }

            console.log('🥕🔥 PACK MANAGER: Starting loadRepository()');

            // Load the repository structure with timeout
            const loadPromise = this.githubBrowser.loadRepository();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Repository loading timed out after 30 seconds')), 30000)
            );

            await Promise.race([loadPromise, timeoutPromise]);
            console.log('🥕🔥 PACK MANAGER: loadRepository() completed');

            // Show the browser interface
            console.log('🥕🔥 PACK MANAGER: Showing browser content');
            await this.showGitHubBrowserContent();
            console.log('🥕🔥 PACK MANAGER: Browser content displayed');

        } catch (error) {
            console.error('🥕🔥 PACK MANAGER ERROR:', error);
            CarrotDebug.error('GitHub browser error:', error);
            this.showPopup('Repository Connection Error', `
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
    },
    
    // Show GitHub repository browser content - CarrotKernel Style
    async showGitHubBrowserContent() {
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
        
        this.showPopup('🥕 BunnyMo Repository Browser', content);

        // Wait for DOM to be ready (especially important on mobile)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load the root directory content
        try {
            console.log('🥕🔥 PACK MANAGER: Navigating to root directory');
            await this.githubBrowser.navigateToPath('/');
            console.log('🥕🔥 PACK MANAGER: Updating browser content');
            await this.updateBrowserContent();
            console.log('🥕🔥 PACK MANAGER: Browser content updated successfully');
        } catch (error) {
            console.error('🥕🔥 PACK MANAGER: Failed to load directory content:', error);
            // Show error in the file list
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
        }
    },
    
    // Update browser content with current directory listing
    async updateBrowserContent() {
        const fileList = document.getElementById('carrot-file-list');
        const breadcrumbs = document.getElementById('carrot-breadcrumbs');

        console.log('🥕🔥 UPDATE CONTENT: Elements found?', {
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
        
        if (!this.githubBrowser || !fileList) return;
        
        const currentPath = this.githubBrowser.currentPath;
        const items = this.githubBrowser.currentItems || [];
        
        // Update breadcrumbs
        if (breadcrumbs) {
            breadcrumbs.innerHTML = this.generateBreadcrumbs(currentPath);
        }
        
        // Show loading while generating file list with update detection
        fileList.innerHTML = `
            <div class="carrot-loading-state">
                <div class="carrot-spinner"></div>
                <p>Checking for updates...</p>
            </div>
        `;
        
        // Update file listing with update detection (async)
        fileList.innerHTML = await this.generateFileList(items);
        
        // Scan for existing packs before counting (only do this once)
        if (!this._hasScannedExisting) {
            await this.scanExistingLorebooks();
            this._hasScannedExisting = true;
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
                    if (this.githubBrowser.hasUpdates && this.githubBrowser.hasUpdates(file.name, file.sha)) {
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
    },
    
    // Generate breadcrumb navigation with back button
    generateBreadcrumbs(path) {
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
    },
    
    // Generate file/folder listing with update detection
    async generateFileList(items) {
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
            const size = item.size ? this.formatFileSize(item.size) : '';
            
            let fileTypeClass = isFile ? 'file' : 'folder';
            if (isJsonFile) fileTypeClass += ' json-file';
            if (isReadmeFile) fileTypeClass += ' readme-file';
            
            // Check for updates
            let hasUpdates = false;
            let isInstalled = false;
            let updateIndicator = '';
            
            if (isJsonFile) {
                isInstalled = await this.checkPackInstalled(item.name);
                hasUpdates = this.githubBrowser.hasUpdates(item.name, item.sha);
                
                if (hasUpdates) {
                    fileTypeClass += ' has-updates';
                    updateIndicator = '<div class="carrot-update-badge" data-tooltip="Update Available">🔄</div>';
                } else if (isInstalled) {
                    fileTypeClass += ' is-installed';
                    updateIndicator = '<div class="carrot-installed-badge" data-tooltip="Installed">✅</div>';
                }
            } else if (item.type === 'dir') {
                // Check if folder contains files with updates
                const folderHasUpdates = await this.githubBrowser.folderHasUpdates(item.path);
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
    },
    
    // Handle file/folder clicks
    async handleFileClick(path, type, name) {
        if (type === 'dir') {
            await this.navigateToPath(path);
        } else if (type === 'file') {
            // Preview any file type - JSON packs or README files
            await this.previewFile(path, name);
        }
    },
    
    // Navigate to specific path
    async navigateToPath(path) {
        try {
            await this.githubBrowser.navigateToPath(path);
            await this.updateBrowserContent();
        } catch (error) {
            CarrotDebug.error('Navigation error:', error);
            toastr.error('Failed to navigate to folder: ' + error.message);
        }
    },
    
    // Navigate to repository root
    async navigateToRoot() {
        await this.navigateToPath('/');
    },
    
    // Refresh repository
    async refreshRepository() {
        try {
            await this.githubBrowser.loadRepository();
            await this.updateBrowserContent();
            toastr.success('Repository refreshed');
        } catch (error) {
            CarrotDebug.error('Refresh error:', error);
            toastr.error('Failed to refresh repository: ' + error.message);
        }
    },

    // Manually trigger detection of existing packs
    async detectExistingPacks() {
        const button = document.querySelector('.carrot-detect-btn');
        if (button) {
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            button.disabled = true;
        }
        
        try {
            const foundCount = await this.scanExistingLorebooks();
            // Refresh the display to show updated counts
            await this.updateBrowserContent();
            
            if (foundCount > 0) {
                toastr.success(`Detected and tracked ${foundCount} existing pack${foundCount === 1 ? '' : 's'}!`);
            } else {
                toastr.info('No additional BunnyMo packs detected in your lorebooks');
            }
        } catch (error) {
            console.error('Failed to detect existing packs:', error);
            toastr.error('Failed to detect existing packs: ' + error.message);
        } finally {
            if (button) {
                button.innerHTML = '<i class="fa-solid fa-search"></i>';
                button.disabled = false;
            }
        }
    },
    
    // Show installation dialog and install pack
    async downloadFile(path, filename) {
        // Show beautiful installation dialog
        this.showPackInstallDialog(path, filename);
    },
    
    // Beautiful pack installation dialog
    async showPackInstallDialog(path, filename) {
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
        
        this.showPopup('🥕 Pack Installation', dialogContent);
    },
    
    // Check if a pack is already installed in ST's lorebooks
    async checkPackInstalled(filename) {
        console.log('🥕🔍 === PACK DETECTION STARTED ===');
        console.log('🥕 Checking pack installation for:', filename);
        
        try {
            // Dynamically import ST's world-info functions
            const worldInfoModule = await import('../../../world-info.js');
            console.log('🥕 World-info module imported:', Object.keys(worldInfoModule));
            
            const { world_names } = worldInfoModule;
            console.log('🥕 Available world_names type:', typeof world_names);
            console.log('🥕 Available world_names length:', world_names?.length);
            console.log('🥕 Available world_names:', world_names);
            
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
            
            console.log('🥕 Checking possible names:', possibleNames);
            
            // Check each possible name individually for better debugging
            const matches = [];
            for (const name of possibleNames) {
                const found = world_names.includes(name);
                if (found) {
                    matches.push(name);
                }
                console.log(`🥕 "${name}" found: ${found}`);
            }
            
            const isInstalled = matches.length > 0;
            console.log('🥕 Pack installed?', isInstalled);
            console.log('🥕 Matching names:', matches);
            
            return isInstalled;
            
        } catch (error) {
            console.error('🥕 ❌ Pack detection failed:', error);
            console.error('🥕 Error stack:', error.stack);
            CarrotDebug.error('Failed to check pack installation status:', error);
            return false;
        } finally {
            console.log('🥕🔍 === PACK DETECTION ENDED ===');
        }
    },

    // Install pack using native ST lorebook system
    async installPackNative(downloadUrl, filename) {
        console.log('🥕🔧 === NATIVE INSTALLATION STARTED ===');
        console.log('🥕 installPackNative called:', { downloadUrl, filename });

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
                    rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${this.githubBrowser.githubBranch}/${path}`;
                    console.log('🥕 Converted to raw URL:', rawUrl);
                }
            }

            console.log('🥕 Step A: Downloading JSON file from:', rawUrl);
            // Download the JSON file
            const response = await fetch(rawUrl);
            console.log('🥕 Response status:', response.status);
            console.log('🥕 Response content-type:', response.headers.get('content-type'));

            if (!response.ok) {
                throw new Error(`Failed to download: ${response.status}`);
            }

            const jsonData = await response.text();
            console.log('🥕 Downloaded data length:', jsonData.length);
            console.log('🥕 First 200 chars:', jsonData.substring(0, 200));
            
            console.log('🥕 Step B: Creating File object...');
            // Create a File object (simulating file upload)
            const blob = new Blob([jsonData], { type: 'application/json' });
            const file = new File([blob], filename, { type: 'application/json' });
            console.log('🥕 Created File object:', { name: file.name, size: file.size, type: file.type });
            
            console.log('🥕 Step C: Importing world-info module...');
            // Dynamically import ST's world-info functions
            const worldInfoModule = await import('../../../world-info.js');
            console.log('🥕 World-info module imported:', Object.keys(worldInfoModule));
            
            const { importWorldInfo, updateWorldInfoList } = worldInfoModule;
            console.log('🥕 Functions available:', { 
                importWorldInfo: typeof importWorldInfo, 
                updateWorldInfoList: typeof updateWorldInfoList 
            });
            
            console.log('🥕 Step D: Calling importWorldInfo...');
            // Import using ST's native system
            const importResult = await importWorldInfo(file);
            console.log('🥕 Import result:', importResult);
            
            console.log('🥕 Step E: Updating world info list...');
            // Refresh ST's lorebook list
            const updateResult = await updateWorldInfoList();
            console.log('🥕 Update result:', updateResult);
            
            // Track the installation in our settings
            if (!extension_settings[extensionName]) {
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
            
            console.log('🥕 ✅ Native installation completed successfully');
            CarrotDebug.repo(`✅ Successfully installed: ${filename}`);
            toastr.success(`Installed ${filename} to your lorebooks!`);
            
            return true;
            
        } catch (error) {
            console.error('🥕 ❌ Native installation failed:', error);
            console.error('🥕 Error stack:', error.stack);
            CarrotDebug.error(`Failed to install pack: ${error.message}`, error);
            toastr.error(`Installation failed: ${error.message}`);
            return false;
        } finally {
            console.log('🥕🔧 === NATIVE INSTALLATION ENDED ===');
        }
    },

    // Install pack directly from GitHub (bypassing dialog)
    async installPackDirectly(path, filename) {
        console.log('🥕🚀 === DIRECT INSTALLATION STARTED ===');
        console.log('🥕 installPackDirectly called:', { path, filename });
        console.log('🥕 User Agent:', navigator.userAgent);
        console.log('🥕 Current URL:', window.location.href);
        
        try {
            console.log('🥕 Step 1: Getting download URL...');
            const downloadUrl = await this.githubBrowser.getDownloadUrl(path);
            console.log('🥕 Download URL obtained:', downloadUrl);
            
            console.log('🥕 Step 2: Calling installPackNative...');
            const success = await this.installPackNative(downloadUrl, filename);
            console.log('🥕 Installation result:', success);
            
            if (success) {
                console.log('🥕 Step 3: Refreshing browser content...');
                // Refresh the file list to update status indicators
                await this.updateBrowserContent();
                console.log('🥕 ✅ Direct installation completed successfully');
            } else {
                console.log('🥕 ❌ Installation reported failure');
            }
            
        } catch (error) {
            console.error('🥕 ❌ Direct installation failed:', error);
            console.error('🥕 Error stack:', error.stack);
            CarrotDebug.error('Direct installation failed:', error);
            toastr.error(`Failed to install ${filename}: ${error.message}`);
        }
        
        console.log('🥕🏁 === DIRECT INSTALLATION ENDED ===');
    },

    // Scan existing lorebooks to retroactively track installed packs
    async scanExistingLorebooks() {
        console.log('🔍 Scanning existing lorebooks for BunnyMo packs...');

        try {
            // Get all existing world info (lorebooks)
            const { world_names } = await import('../../../world-info.js');
            const existingBooks = world_names || [];

            if (!extension_settings[extensionName]) {
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
                        console.log(`📦 Detected existing pack: ${bookName}`);
                    }
                }
            }
            
            if (foundPacks > 0) {
                saveSettingsDebounced();
                console.log(`✅ Retroactively tracked ${foundPacks} existing packs`);
                toastr.info(`Found and tracked ${foundPacks} existing BunnyMo pack${foundPacks === 1 ? '' : 's'}`);
            } else {
                console.log('ℹ️ No existing BunnyMo packs detected');
            }
            
            return foundPacks;
            
        } catch (error) {
            console.error('❌ Failed to scan existing lorebooks:', error);
            return 0;
        }
    },

    // Execute the actual installation
    async executeInstall(path, filename) {
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
            
            const downloadUrl = await this.githubBrowser.getDownloadUrl(path);
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
            progressTextEl.textContent = 'Installing to SillyTavern lorebooks...';
            progressFillEl.style.width = '75%';
            
            const cleanName = filename.replace('.json', '');
            const saveResponse = await fetch('/api/worldinfo/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: cleanName,
                    data: data 
                })
            });
            
            if (!saveResponse.ok) {
                throw new Error(`Failed to install lorebook: ${saveResponse.status}`);
            }
            
            // Step 4: Track installation with SHA
            const currentItem = this.githubBrowser.currentItems.find(item => item.path === path);
            if (currentItem) {
                this.githubBrowser.trackPackInstallation(filename, currentItem.sha, currentItem.size);
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
                
                this.showPopup('🎉 Installation Complete', dialogContent);
            }, 500);
            
            // Refresh ST's lorebook list
            if (typeof loadWorldInfoList === 'function') {
                loadWorldInfoList();
            }
            
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
            
            this.showPopup('❌ Installation Failed', dialogContent);
        }
    },
    
    // Close installation dialog
    closeInstallDialog() {
        this.closePopup();
        // Return to the browser
        this.showPackManagerInterface();
    },
    
    // Preview file content - supports JSON packs and README files
    async previewFile(path, filename) {
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
            
            const downloadUrl = await this.githubBrowser.getDownloadUrl(path);
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
    },
    
    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },
    
    // Remove old pack manager functions and replace with browser navigation functions
    async populatePackGrids(packManager) {
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
    },
    
    // Install main BunnyMo pack
    async installMainPack(filename) {
        if (!filename) {
            CarrotDebug.error('No filename provided for main pack installation');
            return;
        }
        
        try {
            const packManager = new CarrotPackManager();
            await packManager.installPackByFilename(filename, 'main');
            
            // Update status and refresh interface
            this.updatePackStatus();
            toastr.success('Main BunnyMo pack installed successfully!');
            
            // Refresh the pack manager interface
            await this.showPackManagerInterface();
            
        } catch (error) {
            CarrotDebug.error('Failed to install main pack:', error);
            toastr.error('Failed to install main pack: ' + error.message);
        }
    },
    
    // Install theme or expansion pack
    async installPack(packId) {
        try {
            const packManager = new CarrotPackManager();
            await packManager.installPackById(packId);
            
            // Update status and refresh interface
            this.updatePackStatus();
            toastr.success('Pack installed successfully!');
            
            // Refresh the pack manager interface
            await this.showPackManagerInterface();
            
        } catch (error) {
            CarrotDebug.error('Failed to install pack:', error);
            toastr.error('Failed to install pack: ' + error.message);
        }
    },
    
    // Update main pack
    async updateMainPack(filename) {
        try {
            const packManager = new CarrotPackManager();
            await packManager.updateMainPack(filename);
            
            // Update status and refresh interface
            this.updatePackStatus();
            toastr.success('Main pack updated successfully!');
            
            // Refresh the pack manager interface
            await this.showPackManagerInterface();
            
        } catch (error) {
            CarrotDebug.error('Failed to update main pack:', error);
            toastr.error('Failed to update main pack: ' + error.message);
        }
    },
    
    // Update theme or expansion pack
    async updatePack(packId) {
        try {
            const packManager = new CarrotPackManager();
            await packManager.updatePackById(packId);
            
            // Update status and refresh interface  
            this.updatePackStatus();
            toastr.success('Pack updated successfully!');
            
            // Refresh the pack manager interface
            await this.showPackManagerInterface();
            
        } catch (error) {
            CarrotDebug.error('Failed to update pack:', error);
            toastr.error('Failed to update pack: ' + error.message);
        }
    },
    
    // Scan for pack updates
    async scanForUpdates() {
        try {
            const packManager = new CarrotPackManager();
            await packManager.scanAllPacks();
            
            this.updatePackStatus();
            toastr.info('Pack scan completed');
            
            // Refresh the pack manager interface
            await this.showPackManagerInterface();
            
        } catch (error) {
            CarrotDebug.error('Failed to scan for updates:', error);
            toastr.error('Failed to scan for updates: ' + error.message);
        }
    },
    
    // Update pack status in status card
    updatePackStatus() {
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
    },
    
    // Old template editor functions removed - now using BunnyMoTags TemplatePromptEditInterface
    
    // Helper function to download files
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    
    // Open loadout manager - comprehensive per-chat/per-character settings management
    async openLoadoutManager() {
        if (!CarrotContext || !CarrotStorage) {
            this.showPopup('System Error', `
                <p>CarrotKernel loadout system is not properly initialized.</p>
                <p>Please reload SillyTavern and try again.</p>
            `);
            return;
        }

        const context = CarrotContext.getCurrentContext();
        const currentSettings = await CarrotStorage.getSettings();
        
        // Build comprehensive loadout management interface
        const loadoutHTML = await buildLoadoutManagerHTML(context, currentSettings);
        
        // Use CarrotKernel's native popup overlay for full-width display
        this.showPopup('', loadoutHTML, {
            wide: true,
            customClass: 'carrot-loadout-popup'
        });
        
        // Bind events after popup is shown
        setTimeout(() => {
            this.bindLoadoutManagerEvents();
        }, 100);
    },
    
    // Enhanced event binding for comprehensive loadout manager
    bindLoadoutManagerEvents() {
        const self = this;
        
        // Tab switching functionality
        $('.carrot-tab').off('click').on('click', function() {
            const tabName = $(this).data('tab');
            $(this).siblings('.carrot-tab').removeClass('active');
            $(this).addClass('active');
            
            // Hide all tab contents, show the selected one
            $('.carrot-tab-content').removeClass('active');
            $(`#tab-${tabName}`).addClass('active');
        });
        
        // Lorebook enable/disable toggles
        $('.lorebook-enable-toggle').off('change').on('change', function() {
            const lorebook = $(this).data('lorebook');
            const isEnabled = $(this).prop('checked');

            if (isEnabled) {
                selectedLorebooks.add(lorebook);
            } else {
                selectedLorebooks.delete(lorebook);

                // Also remove from characterRepoBooks if it was a character repo
                if (characterRepoBooks.has(lorebook)) {
                    characterRepoBooks.delete(lorebook);
                    CarrotDebug.repo(`Removed ${lorebook} from character repos (lorebook disabled in loadout manager)`);
                }
            }

            // Update the visual state of the card
            const card = $(this).closest('.carrot-lorebook-card');
            const isCharRepo = characterRepoBooks.has(lorebook);
            const repoColor = isCharRepo ? '#9c27b0' : '#2196f3';
            
            card.css('border-color', isEnabled ? repoColor : 'var(--SmartThemeQuoteColor)');
            
            CarrotDebug.ui(`Lorebook ${lorebook} ${isEnabled ? 'enabled' : 'disabled'}`);
        });
        
        // Repository type toggles (Character Repo vs Tag Library)
        $('.carrot-repo-toggle').off('click').on('click', function() {
            const lorebook = $(this).data('lorebook');
            const isCurrentlyCharRepo = characterRepoBooks.has(lorebook);
            
            if (isCurrentlyCharRepo) {
                characterRepoBooks.delete(lorebook);
                $(this).removeClass('active')
                      .css({ background: 'transparent', color: 'var(--SmartThemeBodyColor)' })
                      .html('📚 Tag Library');
            } else {
                characterRepoBooks.add(lorebook);
                $(this).addClass('active')
                      .css({ background: '#9c27b0', color: 'white' })
                      .html('👤 Character Repo');
            }
            
            CarrotDebug.ui(`Lorebook ${lorebook} marked as ${isCurrentlyCharRepo ? 'Tag Library' : 'Character Repository'}`);
        });
        
        // Source badge toggles for multi-context assignment
        $('.source-badge').off('click').on('click', function() {
            const source = $(this).data('source');
            const lorebook = $(this).closest('.carrot-active-book').find('.remove-lorebook').data('lorebook');
            
            // Toggle visual state
            if ($(this).hasClass('active')) {
                $(this).removeClass('active')
                       .css({ background: 'var(--black30)', color: 'var(--SmartThemeFadedColor)' });
            } else {
                $(this).addClass('active')
                       .css({ background: '#4caf50', color: 'white' });
            }
            
            CarrotDebug.ui(`Toggled ${lorebook} for ${source} context`);
        });
        
        // Remove lorebook from active list
        $('.remove-lorebook').off('click').on('click', function() {
            const lorebook = $(this).data('lorebook');
            selectedLorebooks.delete(lorebook);

            // Also remove from characterRepoBooks if it was a character repo
            if (characterRepoBooks.has(lorebook)) {
                characterRepoBooks.delete(lorebook);
                CarrotDebug.repo(`Removed ${lorebook} from character repos (lorebook removed from active list)`);
            }

            // Remove the visual element
            $(this).closest('.carrot-active-book').fadeOut(300, function() {
                $(this).remove();
            });

            CarrotDebug.ui(`Removed ${lorebook} from active lorebooks`);
        });
        
        // Multi-context assignment system
        $('.apply-assignment').off('click').on('click', async function() {
            const selectedLorebooks = [];
            const selectedContexts = [];
            
            $('.assign-lorebook:checked').each(function() {
                selectedLorebooks.push($(this).data('lorebook'));
            });
            
            $('.assign-target:checked').each(function() {
                selectedContexts.push($(this).data('target'));
            });
            
            if (selectedLorebooks.length === 0 || selectedContexts.length === 0) {
                alert('Please select both lorebooks and contexts to assign them to.');
                return;
            }
            
            // Apply assignments to each selected context
            for (const context of selectedContexts) {
                const settings = {
                    enabledRepos: new Set(selectedLorebooks),
                    scanOnStartup: $('#context-scan-startup').prop('checked'),
                    autoScanEnabled: true
                };
                
                await CarrotStorage.saveSettings(settings, context);
                CarrotDebug.ui(`Applied assignment to ${context} context`);
            }
            
            // Update button state
            $(this).html('<i class="fa-solid fa-check"></i> Assignment Applied!').prop('disabled', true);
            setTimeout(() => {
                $(this).html('<i class="fa-solid fa-check"></i> Apply Assignment').prop('disabled', false);
            }, 3000);
            
            updateLoadoutCardStatus();
        });
        
        // Core settings event binding
        $('#context-enabled').off('change').on('change', function() {
            const isEnabled = $(this).prop('checked');
            CarrotDebug.ui(`CarrotKernel ${isEnabled ? 'enabled' : 'disabled'} for current context`);
        });
        
        $('#context-scan-startup').off('change').on('change', function() {
            const isEnabled = $(this).prop('checked');
            CarrotDebug.ui(`Auto-scan on startup ${isEnabled ? 'enabled' : 'disabled'}`);
        });
        
        // Display mode radio buttons
        $('input[name="display-mode"]').off('change').on('change', function() {
            const displayMode = $(this).val();
            CarrotDebug.ui(`Display mode changed to: ${displayMode}`);
        });
        
        // Profile management buttons
        $('#save-current-context').off('click').on('click', async function() {
            const settings = await getLoadoutSettings();
            
            // Determine the appropriate context level to save to
            let contextLevel = 'character';
            if (CarrotContext.getCurrentContext().isGroup) {
                contextLevel = 'chat';
            }
            
            const success = await CarrotStorage.saveSettings(settings, contextLevel);
            if (success) {
                $(this).html('<i class="fa-solid fa-check"></i> Profile Saved!').prop('disabled', true);
                setTimeout(() => {
                    $(this).html('<i class="fa-solid fa-save"></i> Save Current Profile').prop('disabled', false);
                }, 2000);
                updateLoadoutCardStatus();
            }
        });
        
        $('#clear-context-settings').off('click').on('click', async function() {
            if (!confirm('Clear all CarrotKernel settings for this context? This will restore global defaults.')) return;
            
            const context = CarrotContext.getCurrentContext();
            if (context.isGroup) {
                await CarrotStorage.clearSettings('chat');
            } else {
                await CarrotStorage.clearSettings('character');
            }
            
            $(this).html('<i class="fa-solid fa-check"></i> Settings Cleared').prop('disabled', true);
            setTimeout(() => {
                $(this).html('<i class="fa-solid fa-trash"></i> Clear Context Settings').prop('disabled', false);
            }, 2000);
            
            updateLoadoutCardStatus();
            self.closePopup();
            self.openLoadoutManager(); // Refresh the interface
        });
        
        // Export/Import functionality
        $('#export-context-profile').off('click').on('click', async function() {
            const settings = await CarrotStorage.getSettings();
            const context = CarrotContext.getCurrentContext();
            
            const exportData = {
                settings: {
                    ...settings,
                    enabledRepos: Array.from(settings.enabledRepos || [])
                },
                context: {
                    characterName: context.characters?.[context.characterId]?.name || 'Unknown',
                    isGroup: context.isGroup,
                    timestamp: new Date().toISOString()
                },
                version: '1.0.0',
                type: 'CarrotKernel_Profile'
            };
            
            const filename = `carrot-profile-${context.characters?.[context.characterId]?.name || 'context'}-${new Date().toISOString().split('T')[0]}.json`;
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', filename);
            linkElement.click();
            
            CarrotDebug.ui('Profile exported successfully');
        });
        
        $('#import-context-profile').off('click').on('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);
                    
                    if (importData.type === 'CarrotKernel_Profile' && importData.settings) {
                        // Convert array back to Set for enabledRepos
                        if (Array.isArray(importData.settings.enabledRepos)) {
                            importData.settings.enabledRepos = new Set(importData.settings.enabledRepos);
                        }
                        
                        // Determine context level to save to
                        const context = CarrotContext.getCurrentContext();
                        const contextLevel = context.isGroup ? 'chat' : 'character';
                        
                        const success = await CarrotStorage.saveSettings(importData.settings, contextLevel);
                        if (success) {
                            updateLoadoutCardStatus();
                            self.closePopup();
                            self.openLoadoutManager(); // Refresh the interface
                            CarrotDebug.ui('Profile imported successfully');
                        } else {
                            alert('Failed to import profile.');
                        }
                    } else {
                        alert('Invalid CarrotKernel profile file format.');
                    }
                } catch (error) {
                    alert('Error reading profile file: ' + error.message);
                    CarrotDebug.error('Profile import error:', error);
                }
            };
            input.click();
        });
        
        // Save chat profile
        $('#save-chat-profile').off('click').on('click', async function() {
            if (!CarrotContext?.isContextValid()) {
                alert('No active chat to save settings for.');
                return;
            }
            
            const settings = await getLoadoutSettings();
            const success = await CarrotStorage.saveSettings(settings, 'chat');
            
            if (success) {
                $(this).html('<i class="fa-solid fa-check"></i> Saved for Chat').prop('disabled', true);
                setTimeout(() => {
                    $(this).html('<i class="fa-solid fa-comments"></i> Save Chat Profile').prop('disabled', false);
                }, 2000);
                updateLoadoutCardStatus();
                CarrotDebug.ui('Chat profile saved successfully');
            } else {
                alert('Failed to save chat profile.');
            }
        });
        
        // Save character profile
        $('#save-character-profile').off('click').on('click', async function() {
            const context = CarrotContext?.getCurrentContext();
            if (!context?.characterId || context.isGroup) {
                alert('No active character to save settings for.');
                return;
            }
            
            const settings = await getLoadoutSettings();
            const success = await CarrotStorage.saveSettings(settings, 'character');
            
            if (success) {
                $(this).html('<i class="fa-solid fa-check"></i> Saved for Character').prop('disabled', true);
                setTimeout(() => {
                    $(this).html('<i class="fa-solid fa-user"></i> Save Character Profile').prop('disabled', false);
                }, 2000);
                updateLoadoutCardStatus();
                CarrotDebug.ui('Character profile saved successfully');
            } else {
                alert('Failed to save character profile.');
            }
        });
        
        // Clear chat profile
        $('#clear-chat-profile').off('click').on('click', async function() {
            if (!confirm('Clear CarrotKernel settings for this chat?')) return;
            
            await CarrotStorage.clearSettings('chat');
            $(this).html('<i class="fa-solid fa-check"></i> Cleared').prop('disabled', true);
            setTimeout(() => {
                $(this).html('<i class="fa-solid fa-eraser"></i> Clear Chat Profile').prop('disabled', false);
            }, 2000);
            updateLoadoutCardStatus();
            CarrotDebug.ui('Chat profile cleared');
        });
        
        // Clear character profile
        $('#clear-character-profile').off('click').on('click', async function() {
            if (!confirm('Clear CarrotKernel settings for this character?')) return;
            
            await CarrotStorage.clearSettings('character');
            $(this).html('<i class="fa-solid fa-check"></i> Cleared').prop('disabled', true);
            setTimeout(() => {
                $(this).html('<i class="fa-solid fa-user-minus"></i> Clear Character Profile').prop('disabled', false);
            }, 2000);
            updateLoadoutCardStatus();
            CarrotDebug.ui('Character profile cleared');
        });
        
        // Export profile
        $('#export-profile').off('click').on('click', async function() {
            const settings = await CarrotStorage.getSettings();
            const context = CarrotContext.getCurrentContext();
            
            const exportData = {
                settings: settings,
                context: {
                    characterName: context.characters?.[context.characterId]?.name || 'Unknown',
                    timestamp: new Date().toISOString()
                },
                version: '1.0'
            };
            
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            const exportFileName = `carrot-profile-${context.characters?.[context.characterId]?.name || 'global'}-${new Date().toISOString().split('T')[0]}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileName);
            linkElement.click();
            
            CarrotDebug.ui('Profile exported successfully');
        });
        
        // Import profile
        $('#import-profile').off('click').on('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);
                    
                    if (importData.version && importData.settings) {
                        // Apply imported settings to current context
                        const success = await CarrotStorage.saveSettings(importData.settings, 'character');
                        if (success) {
                            self.closePopup();
                            self.openLoadoutManager(); // Refresh the interface
                            updateLoadoutCardStatus();
                            CarrotDebug.ui('Profile imported successfully');
                        } else {
                            alert('Failed to import profile.');
                        }
                    } else {
                        alert('Invalid profile file format.');
                    }
                } catch (error) {
                    alert('Error reading profile file: ' + error.message);
                }
            };
            input.click();
        });
        
        // Scan on startup toggle
        $('#loadout-scan-startup').off('change').on('change', async function() {
            const isEnabled = $(this).prop('checked');
            
            // Determine current settings level
            let settingsLevel = 'global';
            if (CarrotStorage.hasSettingsAt('chat')) {
                settingsLevel = 'chat';
            } else if (CarrotStorage.hasSettingsAt('character')) {
                settingsLevel = 'character';
            }
            
            const currentSettings = await CarrotStorage.getSettings();
            currentSettings.scanOnStartup = isEnabled;
            
            await CarrotStorage.saveSettings(currentSettings, settingsLevel);
            CarrotDebug.ui(`Scan on startup ${isEnabled ? 'enabled' : 'disabled'} for ${settingsLevel} level`);
        });
    },
    
    // Manual scan function
    async manualScan() {
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
            this.updateRepositoryManagerContent();
            
            // Force show character cards section after successful scan
            setTimeout(() => {
                this.forceShowCharacterCards();
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
            console.error('Scan error:', error);
            alert('Scan failed: ' + error.message);
            
            // Restore button state on error
            if (scanBtn) {
                scanBtn.textContent = originalButtonText;
                scanBtn.style.pointerEvents = 'auto';
            }
        }
    },
    
    // Start a tutorial - simple browser dialog system
    async startTutorial(tutorialId) {
        if (!this.tutorials[tutorialId]) {
            alert(`Tutorial "${tutorialId}" not found`);
            return;
        }
        
        const tutorial = this.tutorials[tutorialId];
        const steps = tutorial.steps;
        
        // Show each step with browser confirm dialog
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Highlight the target element
            const target = document.querySelector(step.target);
            if (target) {
                // Remove previous highlights
                document.querySelectorAll('.carrot-tutorial-highlight')
                    .forEach(el => el.classList.remove('carrot-tutorial-highlight'));
                
                // Add highlight to current target
                target.classList.add('carrot-tutorial-highlight');
                
                // Smart scrolling for different devices
                const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
                const scrollOptions = {
                    behavior: 'smooth',
                    block: isMobile ? 'start' : 'center',
                    inline: 'nearest'
                };
                
                // For mobile, add extra padding to ensure element is fully visible
                if (isMobile) {
                    // Check if element is in a modal or overlay
                    const isInModal = target.closest('.popup, .modal, #carrot-loadout-manager');
                    if (isInModal) {
                        // For modals on mobile, just ensure element is visible
                        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } else {
                        // For main page elements, scroll with top padding
                        const rect = target.getBoundingClientRect();
                        const headerHeight = 60; // Account for mobile headers
                        if (rect.top < headerHeight) {
                            window.scrollBy({
                                top: rect.top - headerHeight - 20,
                                behavior: 'smooth'
                            });
                        } else {
                            target.scrollIntoView(scrollOptions);
                        }
                    }
                } else {
                    // Desktop - use center alignment
                    target.scrollIntoView(scrollOptions);
                }
                
                // Wait longer on mobile for scroll to complete
                await new Promise(resolve => setTimeout(resolve, isMobile ? 800 : 500));
            }
            
            // Clean up HTML tags and format text nicely
            const cleanContent = step.content
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>') // Fix HTML entities
                .replace(/&amp;/g, '&') // Fix ampersands
                .trim();
            
            // Format text with proper line breaks for readability
            const formattedContent = cleanContent
                .replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2') // Add breaks after sentences starting new topics
                .replace(/([:])\s*([A-Z•])/g, '$1\n$2') // Add breaks after colons
                .replace(/•\s/g, '\n• ') // Put bullets on new lines
                .replace(/(\d+\.)\s/g, '\n$1 ') // Put numbered items on new lines
                .replace(/\n\n\n+/g, '\n\n') // Clean up multiple line breaks
                .trim();
            
            // Show step as confirm dialog (like in your image)
            const continueClicked = confirm(
                `Step ${i + 1} of ${steps.length}: ${step.title}\n\n${formattedContent}\n\nClick OK for next step, Cancel to exit tutorial.`
            );
            
            if (!continueClicked) {
                break; // User cancelled
            }
        }
        
        // Clean up highlights
        document.querySelectorAll('.carrot-tutorial-highlight')
            .forEach(el => el.classList.remove('carrot-tutorial-highlight'));
        
        alert('Tutorial completed! 🎉');
    },
    
    // Ensure tutorial overlay exists and return it
    getTutorialOverlay() {
        // First check if we're in a modal context
        const modal = document.querySelector('.popup:not(.popup_template)');
        if (modal) {
            let modalOverlay = modal.querySelector('#carrot-tutorial-overlay');
            if (!modalOverlay) {
                // Create tutorial overlay in modal
                this.createTutorialOverlayInModal(modal);
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
            this.createTutorialOverlayInDocument();
            documentOverlay = document.getElementById('carrot-tutorial-overlay');
        }
        return documentOverlay;
    },
    
    // Create tutorial overlay in modal (reusing existing code pattern)
    createTutorialOverlayInModal(modal) {
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
    },
    
    // Create tutorial overlay in document
    createTutorialOverlayInDocument() {
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
    },

    // Show current tutorial step
    showTutorialStep() {
        if (!this.tutorialSteps || this.currentStep >= this.tutorialSteps.length) {
            this.closeTutorial();
            return;
        }
        
        const step = this.tutorialSteps[this.currentStep];
        const targetElement = document.querySelector(step.target);
        
        if (!targetElement) {
            CarrotDebug.error('Tutorial target not found', step.target);
            this.nextTutorialStep();
            return;
        }
        
        // Remove previous highlights
        document.querySelectorAll('.carrot-tutorial-highlight')
            .forEach(el => el.classList.remove('carrot-tutorial-highlight'));
        
        // Highlight target element
        targetElement.classList.add('carrot-tutorial-highlight');
        
        // Just highlight the element - let user scroll themselves
        this.highlightElement(targetElement, step);
    },
    
    // Show tutorial overlay
    showTutorialOverlay() {
        const overlay = this.getTutorialOverlay();
        
        if (!overlay) {
            CarrotDebug.error('❌ Tutorial overlay not found! Cannot show tutorial');
            return;
        }
        
        overlay.style.display = 'block';
        overlay.classList.add('active');
        
        CarrotDebug.tutorial('Tutorial overlay activated');
    },
    
    // Simple element highlighting
    highlightTargetElement(target) {
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
    },
    
    // Navigation functions
    nextTutorialStep() {
        if (this.currentStep < this.tutorialSteps.length - 1) {
            this.currentStep++;
            this.showTutorialStep();
        } else {
            this.closeTutorial();
        }
    },
    
    previousTutorialStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showTutorialStep();
        }
    },
    
    // Add window resize handler for tutorial repositioning
    addResizeHandler() {
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
                    const overlay = this.getTutorialOverlay();
                    const popup = overlay?.querySelector('#carrot-tutorial-popup');
                    
                    if (targetElement && popup) {
                        // Reapply viewport safeguards on resize
                        const safeguards = this.applyViewportSafeguards(popup);
                        const rect = targetElement.getBoundingClientRect();
                        this.positionTutorialPopupWithSafeguards(rect, safeguards);
                        
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
    },
    
    // Close tutorial with proper cleanup
    closeTutorial() {
        const overlay = this.getTutorialOverlay();
        if (overlay) {
            overlay.classList.remove('active');
            
            setTimeout(() => {
                overlay.style.display = 'none';
                
                // Remove all highlights
                document.querySelectorAll('.carrot-tutorial-highlight')
                    .forEach(el => el.classList.remove('carrot-tutorial-highlight'));
                
                // Reset popup position
                const popup = overlay.querySelector('#carrot-tutorial-popup');
                if (popup) {
                    popup.style.cssText = '';
                    popup.className = popup.className.replace(/carrot-popup-\w+/g, '');
                }
            }, 400);
        }
        
        // Reset tutorial state
        this.currentTutorial = null;
        this.currentStep = 0;
        this.tutorialSteps = [];
        
        CarrotDebug.tutorial('Tutorial closed');
    },
    
    
    // Apply comprehensive viewport safeguards to ensure tutorial popup is always viewable
    applyViewportSafeguards(popup) {
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
    },

    // Simple element highlighting with golden glow
    highlightElement(targetElement, step) {
        const overlay = this.getTutorialOverlay();
        const popup = overlay?.querySelector('#carrot-tutorial-popup');
        
        if (!popup) {
            CarrotDebug.error('Tutorial popup not found during highlight');
            return;
        }
        
        // Apply viewport safeguards first
        const safeguards = this.applyViewportSafeguards(popup);
        
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
        this.positionTutorialPopupWithSafeguards(rect, safeguards);
        
        // Hide the overlay spotlight - we're just using element highlighting now
        const spotlight = overlay.querySelector('#carrot-tutorial-spotlight');
        spotlight.style.display = 'none';
        
        CarrotDebug.tutorial('highlight', this.currentTutorial, step.target);
    },
    
    // Enhanced popup positioning with comprehensive viewport safeguards
    positionTutorialPopupWithSafeguards(targetRect, safeguards) {
        const overlay = this.getTutorialOverlay();
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
    },
    
    // Legacy popup positioning method - kept for compatibility
    positionTutorialPopup(targetRect) {
        CarrotDebug.tutorial('🎯 Starting tutorial popup positioning', {
            targetRect: targetRect,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            devicePixelRatio: window.devicePixelRatio,
            zoomLevel: window.outerWidth / window.innerWidth
        });
        
        const overlay = this.getTutorialOverlay();
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
    },
    
    // Add visual arrow pointing from popup to target
    addPopupArrow(popup, targetRect, popupRect, positioning) {
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
    },
    
    // Navigate to previous tutorial step
    previousTutorialStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showTutorialStep();
        }
    },
    
    // Navigate to next tutorial step
    nextTutorialStep() {
        this.currentStep++;
        this.showTutorialStep();
    },
    
    // Show popup
    showPopup(title, content) {
        console.log('🥕🔥 POPUP DEBUG: showPopup called with title:', title);
        console.log('🥕🔥 POPUP DEBUG: Content length:', content?.length);
        console.log('🥕🔥 POPUP DEBUG: Is mobile?', window.innerWidth <= 768);

        // DEBUG: Check if popup elements exist
        const overlay = document.getElementById('carrot-popup-overlay');
        const container = document.getElementById('carrot-popup-container');
        console.log('🥕🔥 POPUP DEBUG: Elements exist?', { overlay: !!overlay, container: !!container });
        console.log('🥕🔥 POPUP DEBUG: Overlay display:', overlay ? overlay.style.display : 'N/A');
        console.log('🥕🔥 POPUP DEBUG: Container classes:', container ? container.className : 'N/A');
        
        // For repository browser, inject content directly
        if (content.includes('carrot-repo-browser') || content.includes('carrot-github-browser') || title.includes('BunnyMo Repository')) {
            console.log('🥕 Setting up repository browser popup');
            const $container = $('#carrot-popup-container');
            $container.html(content);
            $container.addClass('carrot-repo-browser-popup');

            // Set mobile-responsive sizing
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
                console.log('🥕🔥 MOBILE: Container set to full viewport');
            } else {
                $container.css({
                    'width': 'min(95vw, 1600px)',
                    'height': 'min(90vh, 1000px)',
                    'max-width': 'min(95vw, 1600px)',
                    'max-height': 'min(90vh, 1000px)'
                });
                console.log('🥕🔥 DESKTOP: Container set to large size');
            }
        } else {
            // For other popups, use the wrapped structure
            const popup = `
                <div class="carrot-popup-content">
                    <div class="carrot-popup-header">
                        <h4>${title}</h4>
                        <button onclick="CarrotKernel.closePopup()" class="carrot-popup-close">✕</button>
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
            'z-index': '999997'
        });
        $overlay.addClass('active');

        console.log('🥕🔥 POPUP DEBUG: After setting overlay styles:', {
            display: $overlay.css('display'),
            width: $overlay.css('width'),
            height: $overlay.css('height'),
            position: $overlay.css('position')
        });
    },

    // Show tutorial-specific Baby Bunny popup (doesn't create actual archives)
    showTutorialBabyBunnyPopup(bunnyData) {
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
                height: 100% !important;
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
            this.endTutorial();
        });
    },

    // Close Baby Bunny tutorial popup
    closeBabyBunnyTutorial() {
        this.closePopup();
        this.endTutorial();
    },

    // Parse BunnymoTags to extract basic info
    parseBunnymoTags(text) {
        const nameMatch = text.match(/<Name:([^>]+)>/i);
        return {
            name: nameMatch ? nameMatch[1].trim() : 'Unknown Character'
        };
    },

    // DEBUG: Utility function to inspect modal sizing
    debugModalSizing() {
        console.log('🔍 MODAL SIZING DEBUG REPORT:');
        
        const container = document.getElementById('carrot-popup-container');
        const overlay = document.getElementById('carrot-popup-overlay');
        
        if (!container) {
            console.log('❌ No popup container found');
            return;
        }
        
        console.log('📋 Container Info:');
        console.log('  - ID:', container.id);
        console.log('  - Classes:', container.className);
        console.log('  - Inline styles:', container.style.cssText);
        
        const computedStyles = window.getComputedStyle(container);
        console.log('📏 Computed Styles:');
        console.log('  - Width:', computedStyles.width);
        console.log('  - Height:', computedStyles.height);
        console.log('  - Max-width:', computedStyles.maxWidth);
        console.log('  - Max-height:', computedStyles.maxHeight);
        console.log('  - Position:', computedStyles.position);
        console.log('  - Display:', computedStyles.display);
        
        console.log('📐 Actual Dimensions:');
        console.log('  - offsetWidth:', container.offsetWidth);
        console.log('  - offsetHeight:', container.offsetHeight);
        console.log('  - clientWidth:', container.clientWidth);
        console.log('  - clientHeight:', container.clientHeight);
        
        if (overlay) {
            const overlayStyles = window.getComputedStyle(overlay);
            console.log('🗂️ Overlay Styles:');
            console.log('  - Width:', overlayStyles.width);
            console.log('  - Height:', overlayStyles.height);
            console.log('  - Display:', overlayStyles.display);
            console.log('  - Position:', overlayStyles.position);
        }
        
        // Check all CSS rules affecting this element
        console.log('📜 CSS Rules affecting container:');
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
                        console.log(`  - Sheet ${index}: ${rule.selectorText} -> ${rule.style.cssText}`);
                    }
                });
            } catch (e) {
                console.log(`  - Sheet ${index}: Cannot access (cross-origin)`);
            }
        });
    },
    
    // Close popup
    closePopup() {
        $('#carrot-popup-overlay').removeClass('active');
        $('#carrot-popup-container').removeClass('carrot-repo-browser-popup');
        setTimeout(() => {
            $('#carrot-popup-overlay').hide();
            $('.carrot-tutorial-highlight').removeClass('carrot-tutorial-highlight');
        }, 300);
    },
    
    // DEBUG AND TESTING FUNCTIONS
    debug: {
        // Manual trigger for character consistency processing
        async testProcessing() {
            CarrotDebug.init('🧪 MANUAL TEST: WORLD_INFO_ACTIVATED System (old processing removed)');
            CarrotDebug.init('Use World Info entries to trigger processing now');
        },
        
        // Show current system state
        showState() {
            CarrotDebug.inspect({
                masterEnabled: extension_settings[extensionName]?.enabled,
                debugMode: extension_settings[extensionName]?.debugMode,
                selectedLorebooks: Array.from(selectedLorebooks),
                characterRepoBooks: Array.from(characterRepoBooks),
                scannedCharacters: Array.from(scannedCharacters.keys()),
                characterData: Object.fromEntries(scannedCharacters)
            }, 'CarrotKernel System State');
        },
        
        // Test character detection only (old system removed)
        testDetection() {
            CarrotDebug.init('🧪 MANUAL TEST: Character Detection (OLD SYSTEM REMOVED)');
            CarrotDebug.init('Detection now happens via WORLD_INFO_ACTIVATED event');
            return [];
        },
        
        // Test injection only
        async testInjection(characters = null) {
            if (!characters) {
                CarrotDebug.error('Please provide character names array - old detection removed');
                return null;
            }
            if (characters.length === 0) {
                CarrotDebug.error('No characters to inject - provide character names');
                return null;
            }
            
            CarrotDebug.init('🧪 MANUAL TEST: AI Injection');
            return await injectCharacterData(characters);
        },
        
        // Test display only
        testDisplay(characters = null) {
            if (!characters) {
                CarrotDebug.error('Please provide character names array - old detection removed');
                return;
            }
            if (characters.length === 0) {
                CarrotDebug.error('No characters to display - provide character names');
                return;
            }
            
            CarrotDebug.init('🧪 MANUAL TEST: Display System');
            displayCharacterData(characters);
        },
        
        // Force scan lorebooks
        async forceScan() {
            CarrotDebug.init('🧪 MANUAL TEST: Force Lorebook Scan');
            if (selectedLorebooks.size === 0) {
                CarrotDebug.error('No lorebooks selected - check settings');
                return null;
            }
            return await scanSelectedLorebooks(Array.from(selectedLorebooks));
        },
        
        // Test BunnyMoTags filtering system
        testBunnyMoTagsFiltering() {
            CarrotDebug.init('🧪 MANUAL TEST: BunnyMoTags Context Filtering');
            
            const testContent = `Hello there!

<BunnyMoTags>
Nefertari:
• PHYSICAL: Golden skin, emerald eyes
• PERSONALITY: Regal, proud
</BunnyMoTags>

This is a test message.`;

            const filtered = removeBunnyMoTagsFromString(testContent);
            
            CarrotDebug.init('🧪 Original content:');
            console.log(testContent);
            CarrotDebug.init('🧪 Filtered content:');
            console.log(filtered);
            
            return {
                original: testContent,
                filtered: filtered,
                tagsRemoved: testContent !== filtered
            };
        },
        
        // Test persistent tags creation
        async testPersistentTags(characterNames = null) {
            if (!characterNames && lastInjectedCharacters.length > 0) {
                characterNames = lastInjectedCharacters;
            }
            if (!characterNames || characterNames.length === 0) {
                CarrotDebug.error('No character names provided or injected - provide array of character names');
                return null;
            }
            
            CarrotDebug.init('🧪 MANUAL TEST: Persistent BunnyMoTags Generation');
            
            const tagsBlock = generatePersistentTagsBlock(characterNames);
            CarrotDebug.init('🧪 Generated tags block:');
            console.log(tagsBlock);
            
            return tagsBlock;
        }
    }
};

// Global functions for loadout manager inline onclick handlers
window.switchToCharacterContext = async function() {
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🥕 LOADOUT DEBUG: Character context clicked via onclick');
    }
    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    await switchLoadoutContext('character', context, currentSettings);
};

window.switchToChatContext = async function() {
    if (extension_settings[extensionName]?.debugMode) {
        console.log('🥕 LOADOUT DEBUG: Chat context clicked via onclick');
    }
    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    await switchLoadoutContext('chat', context, currentSettings);
};

// Placeholder functions for loadout manager functionality

// Open tutorial for loadout manager (removed - now using CarrotKernel.openLoadoutTutorial directly)
// window.openLoadoutTutorial = function() {
//     console.log('🥕 LOADOUT DEBUG: Opening proper tutorial system');
//     CarrotKernel.openLoadoutTutorial();
// }

// Save current loadout profile for active context
function saveCurrentLoadoutProfile() {
    // Get the active context from the interface
    const activeCard = document.querySelector('.carrot-status-panel.active[data-context]');
    if (!activeCard) {
        CarrotDebug.error('No active context selected');
        return;
    }
    
    const contextType = activeCard.dataset.context;
    
    // Collect current settings from the interface
    const settings = {
        enabled: document.getElementById('carrot_context_enabled')?.checked || false,
        sendToAI: document.getElementById('carrot_context_ai_injection')?.checked || false,
        displayMode: document.getElementById('carrot_context_display_mode')?.value || 'thinking',
        autoExpand: document.getElementById('carrot_context_auto_expand')?.checked || false,
        babyBunnyMode: document.getElementById('carrot_context_baby_bunny')?.checked || false,
        worldBookTrackerEnabled: document.getElementById('carrot_context_worldbook_tracker')?.checked || false,
        autoRescanOnChatLoad: document.getElementById('carrot_context_auto_rescan')?.checked || false,
        maxCharactersDisplay: parseInt(document.getElementById('carrot_context_max_display')?.value || '6'),
        maxCharactersInject: parseInt(document.getElementById('carrot_context_max_inject')?.value || '6'),
        debugMode: document.getElementById('carrot_context_debug_mode')?.checked || false
    };
    
    // Get selected lorebooks
    const selectedLorebooks = [];
    document.querySelectorAll('.lorebook-enable-toggle:checked').forEach(checkbox => {
        selectedLorebooks.push(checkbox.dataset.lorebook);
    });
    settings.enabledRepos = new Set(selectedLorebooks);
    
    // Save to appropriate context
    CarrotStorage.saveSettingsAt(contextType, settings);
    
    // Show success message
    toastr.success(`Profile saved for ${contextType} context`, 'CarrotKernel');
    CarrotDebug.ui(`Saved loadout profile for ${contextType} context`);
}

// Clear current loadout profile
function clearCurrentLoadoutProfile() {
    const activeCard = document.querySelector('.carrot-context-card.active');
    if (!activeCard) {
        CarrotDebug.error('No active context selected');
        return;
    }
    
    const contextType = activeCard.dataset.context;
    
    if (contextType === 'global') {
        toastr.warning('Cannot clear global settings', 'CarrotKernel');
        return;
    }
    
    // Clear the context-specific settings
    CarrotStorage.clearSettingsAt(contextType);
    
    // Refresh the interface
    const context = CarrotContext.getCurrentContext();
    CarrotStorage.getSettings().then(currentSettings => {
        updateLoadoutInterface('global', currentSettings, context);
    });
    
    // Update active card
    document.querySelectorAll('.carrot-status-panel[data-context]').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.context === 'global') {
            card.classList.add('active');
        }
    });
    
    toastr.success(`Cleared ${contextType} profile`, 'CarrotKernel');
    CarrotDebug.ui(`Cleared loadout profile for ${contextType} context`);
}

// Scan selected lorebooks for character repositories from loadout manager
function scanLoadoutLorebooks() {
    const selectedBooks = [];
    document.querySelectorAll('.lorebook-enable-toggle:checked').forEach(checkbox => {
        selectedBooks.push(checkbox.dataset.lorebook);
    });
    
    if (selectedBooks.length === 0) {
        toastr.warning('No lorebooks selected to scan', 'CarrotKernel');
        return;
    }
    
    // Use existing scanning function
    CarrotKernel.forceScan().then(() => {
        toastr.success(`Scanned ${selectedBooks.length} lorebooks`, 'CarrotKernel');
        CarrotDebug.ui(`Completed scan of ${selectedBooks.length} lorebooks`);
    }).catch(error => {
        toastr.error('Failed to scan lorebooks', 'CarrotKernel');
        CarrotDebug.error('Lorebook scan failed:', error);
    });
};

// Apply profile template to current context
function applyProfileTemplate(templateType) {
    const templates = {
        'general': {
            enabled: true,
            sendToAI: true,
            displayMode: 'thinking',
            autoExpand: false,
            babyBunnyMode: false,
            worldBookTrackerEnabled: true,
            autoRescanOnChatLoad: true,
            maxCharactersDisplay: 6,
            maxCharactersInject: 6,
            debugMode: false,
            description: 'General Purpose - Balanced settings for everyday use with character tracking and tag filtering'
        },
        'roleplay': {
            enabled: true,
            sendToAI: true,
            displayMode: 'thinking',
            autoExpand: true,
            babyBunnyMode: false,
            worldBookTrackerEnabled: true,
            autoRescanOnChatLoad: true,
            maxCharactersDisplay: 10,
            maxCharactersInject: 8,
            debugMode: false,
            description: 'Roleplay Focus - More characters shown and injected for immersive storytelling'
        },
        'minimal': {
            enabled: true,
            sendToAI: true,
            displayMode: 'none',
            autoExpand: false,
            babyBunnyMode: false,
            worldBookTrackerEnabled: false,
            autoRescanOnChatLoad: false,
            maxCharactersDisplay: 3,
            maxCharactersInject: 3,
            debugMode: false,
            description: 'Minimal Setup - Lightweight config with hidden display, essential tracking only'
        }
    };

    const template = templates[templateType];
    if (!template) {
        toastr.error(`Unknown template: ${templateType}`, 'CarrotKernel');
        return;
    }

    // Apply template settings to the UI
    const enabledCheckbox = document.getElementById('carrot_context_enabled');
    if (enabledCheckbox) enabledCheckbox.checked = template.enabled;

    const sendToAICheckbox = document.getElementById('carrot_context_ai_injection');
    if (sendToAICheckbox) sendToAICheckbox.checked = template.sendToAI;

    const displayModeSelect = document.getElementById('carrot_context_display_mode');
    if (displayModeSelect) displayModeSelect.value = template.displayMode;

    const autoExpandCheckbox = document.getElementById('carrot_context_auto_expand');
    if (autoExpandCheckbox) autoExpandCheckbox.checked = template.autoExpand;

    const babyBunnyCheckbox = document.getElementById('carrot_context_baby_bunny');
    if (babyBunnyCheckbox) babyBunnyCheckbox.checked = template.babyBunnyMode;

    const worldbookCheckbox = document.getElementById('carrot_context_worldbook_tracker');
    if (worldbookCheckbox) worldbookCheckbox.checked = template.worldBookTrackerEnabled;

    const autoRescanCheckbox = document.getElementById('carrot_context_auto_rescan');
    if (autoRescanCheckbox) autoRescanCheckbox.checked = template.autoRescanOnChatLoad;

    const maxDisplaySlider = document.getElementById('carrot_context_max_display');
    const maxDisplayValue = document.getElementById('carrot_context_max_display_value');
    if (maxDisplaySlider) {
        maxDisplaySlider.value = template.maxCharactersDisplay;
        if (maxDisplayValue) maxDisplayValue.textContent = template.maxCharactersDisplay;
    }

    const maxInjectSlider = document.getElementById('carrot_context_max_inject');
    const maxInjectValue = document.getElementById('carrot_context_max_inject_value');
    if (maxInjectSlider) {
        maxInjectSlider.value = template.maxCharactersInject;
        if (maxInjectValue) maxInjectValue.textContent = template.maxCharactersInject;
    }

    const debugCheckbox = document.getElementById('carrot_context_debug_mode');
    if (debugCheckbox) debugCheckbox.checked = template.debugMode;

    // Show success message
    toastr.success(`Applied ${template.description}`, 'Profile Template');
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Applied ${templateType} template`, template);
    }
};

// Save current settings as a new loadout
function saveCurrentAsLoadout() {
    const loadoutName = prompt('Enter a name for this loadout:', '');
    if (!loadoutName || loadoutName.trim() === '') {
        return;
    }

    // Collect current settings and lorebook selections
    const loadout = {
        name: loadoutName.trim(),
        settings: {
            enabled: document.getElementById('carrot_context_enabled')?.checked || false,
            sendToAI: document.getElementById('carrot_context_ai_injection')?.checked || false,
            displayMode: document.getElementById('carrot_context_display_mode')?.value || 'thinking',
            autoExpand: document.getElementById('carrot_context_auto_expand')?.checked || false,
            filterContext: document.getElementById('carrot_context_filter')?.checked || false,
            maxCharacters: parseInt(document.getElementById('carrot_context_max_characters')?.value || '6'),
            injectionDepth: parseInt(document.getElementById('carrot_context_injection_depth')?.value || '4')
        },
        lorebooks: [],
        timestamp: Date.now(),
        description: `Created ${new Date().toLocaleDateString()}`
    };

    // Get selected lorebooks
    document.querySelectorAll('.lorebook-enable-toggle:checked').forEach(checkbox => {
        loadout.lorebooks.push(checkbox.dataset.lorebook);
    });

    // Save to loadout library
    const loadouts = getLoadoutLibrary();
    loadouts[loadoutName.trim()] = loadout;
    saveLoadoutLibrary(loadouts);

    // Update the UI
    const context = CarrotContext.getCurrentContext();
    updateLoadoutsDisplay(context);
    toastr.success(`Saved loadout: ${loadoutName}`, 'Loadout Library');
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Saved loadout: ${loadoutName}`, loadout);
    }
}


// Core loadout management functions
function getLoadoutLibrary() {
    return JSON.parse(localStorage.getItem('carrot_loadout_library') || '{}');
}

function saveLoadoutLibrary(loadouts) {
    localStorage.setItem('carrot_loadout_library', JSON.stringify(loadouts));
}

function getContextAssignments() {
    return JSON.parse(localStorage.getItem('carrot_loadout_assignments') || '{}');
}

function saveContextAssignments(assignments) {
    localStorage.setItem('carrot_loadout_assignments', JSON.stringify(assignments));
}

function getCurrentContextKey(context) {
    const stContext = getContext();
    if (context.character) {
        return `character:${context.character}`;
    } else if (context.chat && stContext.chatId) {
        return `chat:${stContext.chatId}`;
    }
    return 'global';
}

function getCurrentLoadoutForContext(context) {
    const contextKey = getCurrentContextKey(context);
    const assignments = getContextAssignments();
    return assignments[contextKey] || null;
}

function assignLoadoutToContext(loadoutName, context) {
    const contextKey = getCurrentContextKey(context);
    const assignments = getContextAssignments();
    
    if (loadoutName === null) {
        delete assignments[contextKey];
    } else {
        assignments[contextKey] = loadoutName;
    }
    
    saveContextAssignments(assignments);
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Assigned loadout "${loadoutName}" to context "${contextKey}"`);
    }
}

function applyLoadoutToInterface(loadoutName) {
    const loadouts = getLoadoutLibrary();
    const loadout = loadouts[loadoutName];
    if (!loadout) {
        console.error(`🥕 LOADOUT ERROR: Loadout "${loadoutName}" not found`);
        return false;
    }

    // Apply settings
    const settings = loadout.settings;
    const enabledCheckbox = document.getElementById('carrot_context_enabled');
    if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;

    const sendToAICheckbox = document.getElementById('carrot_context_ai_injection');
    if (sendToAICheckbox) sendToAICheckbox.checked = settings.sendToAI;

    const displayModeSelect = document.getElementById('carrot_context_display_mode');
    if (displayModeSelect) displayModeSelect.value = settings.displayMode;

    const autoExpandCheckbox = document.getElementById('carrot_context_auto_expand');
    if (autoExpandCheckbox) autoExpandCheckbox.checked = settings.autoExpand;

    const filterCheckbox = document.getElementById('carrot_context_filter');
    if (filterCheckbox) filterCheckbox.checked = settings.filterContext;

    const maxCharInput = document.getElementById('carrot_context_max_characters');
    if (maxCharInput) maxCharInput.value = settings.maxCharacters;

    const injectionDepthInput = document.getElementById('carrot_context_injection_depth');
    if (injectionDepthInput) injectionDepthInput.value = settings.injectionDepth;

    // Apply lorebook selections
    document.querySelectorAll('.lorebook-enable-toggle').forEach(checkbox => {
        checkbox.checked = loadout.lorebooks.includes(checkbox.dataset.lorebook);
    });

    if (extension_settings[extensionName]?.debugMode) {
        console.log(`🥕 LOADOUT DEBUG: Applied loadout "${loadoutName}" to interface`, loadout);
    }
    return true;
}

// Open loadout assignment popup
function openLoadoutAssignment(context, currentSettings) {
    const loadouts = getLoadoutLibrary();
    const loadoutNames = Object.keys(loadouts);
    const currentLoadout = getCurrentLoadoutForContext(context);
    
    if (loadoutNames.length === 0) {
        toastr.info('No loadouts available. Create your first loadout by saving your current settings!', 'Loadout Assignment');
        return;
    }

    const contextKey = getCurrentContextKey(context);
    const contextName = contextKey.includes('character') ? 'Character' : 
                       contextKey.includes('chat') ? 'Chat' : 'Global';

    const loadoutOptions = loadoutNames.map(name => {
        const loadout = loadouts[name];
        const date = new Date(loadout.timestamp).toLocaleDateString();
        const selected = name === currentLoadout ? 'selected' : '';
        return `<option value="${name}" ${selected}>${name} (${date})</option>`;
    }).join('');

    const assignmentHTML = `
        <div class="carrot-loadout-assignment">
            <h3>🎯 Assign Loadout to ${contextName}</h3>
            <p>Choose which loadout should be automatically applied when you use this ${contextName.toLowerCase()}:</p>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Select Loadout</span>
                    <span class="carrot-label-hint">Current: ${currentLoadout || 'None Selected'}</span>
                </label>
                <select id="loadout-assignment-selector" class="carrot-select">
                    <option value="">❌ Remove Assignment (use defaults)</option>
                    ${loadoutOptions}
                </select>
            </div>
            
            <div class="carrot-assignment-actions" style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <button onclick="assignSelectedLoadout()" class="carrot-primary-btn">
                    <i class="fa-solid fa-check"></i> Assign & Apply
                </button>
                <button onclick="previewSelectedLoadout()" class="carrot-secondary-btn">
                    <i class="fa-solid fa-eye"></i> Preview
                </button>
                <button onclick="closeAssignmentPopup()" class="carrot-secondary-btn">
                    <i class="fa-solid fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;

    const stContext = getContext();
    stContext.callGenericPopup(assignmentHTML, 'text', 'Loadout Assignment', {
        wide: false,
        large: false,
        cancelButton: false,
        okButton: false
    });

    // Store context for assignment
    window.currentAssignmentContext = context;
}

// Assignment popup functions
window.assignSelectedLoadout = function() {
    const selector = document.getElementById('loadout-assignment-selector');
    if (!selector) return;

    const loadoutName = selector.value || null;
    const context = window.currentAssignmentContext;
    
    // Assign loadout to context
    assignLoadoutToContext(loadoutName, context);
    
    // Apply loadout to current interface if selected
    if (loadoutName) {
        applyLoadoutToInterface(loadoutName);
        toastr.success(`Assigned and applied "${loadoutName}" to this context`, 'Loadout Assignment');
    } else {
        toastr.success('Removed loadout assignment - using default settings', 'Loadout Assignment');
    }
    
    // Update displays and close
    updateLoadoutsDisplay(context);
    closeAssignmentPopup();
};

window.previewSelectedLoadout = function() {
    const selector = document.getElementById('loadout-assignment-selector');
    if (!selector || !selector.value) return;

    if (applyLoadoutToInterface(selector.value)) {
        toastr.info(`Previewing loadout: ${selector.value}`, 'Loadout Preview');
    }
};

window.closeAssignmentPopup = function() {
    // This will be handled by SillyTavern's popup system
    const popupWrapper = document.querySelector('#dialogue_popup');
    if (popupWrapper) {
        const closeBtn = popupWrapper.querySelector('#dialogue_popup_cancel');
        if (closeBtn) closeBtn.click();
    }
};

// Update the loadouts display (both current loadout and library list)
function updateLoadoutsDisplay(context) {
    updateCurrentLoadoutDisplay(context);
    updateLoadoutLibraryList();
}

function updateCurrentLoadoutDisplay(context) {
    const currentLoadoutName = getCurrentLoadoutForContext(context);
    const nameElement = document.getElementById('carrot-current-loadout-name');
    const descElement = document.getElementById('carrot-current-loadout-desc');
    const contextKey = getCurrentContextKey(context);
    
    if (currentLoadoutName) {
        const loadouts = getLoadoutLibrary();
        const loadout = loadouts[currentLoadoutName];
        
        if (nameElement) nameElement.textContent = currentLoadoutName;
        if (descElement) descElement.textContent = loadout ? loadout.description : 'Loadout applied to this context';
        
        // Apply the loadout to interface if it exists
        if (loadout) {
            applyLoadoutToInterface(currentLoadoutName);
        }
    } else {
        if (nameElement) nameElement.textContent = 'None Selected';
        if (descElement) {
            const contextName = contextKey.includes('character') ? 'character' : 
                              contextKey.includes('chat') ? 'chat' : 'context';
            descElement.textContent = `No loadout assigned to this ${contextName}`;
        }
    }
}

function updateLoadoutLibraryList() {
    const loadoutsList = document.getElementById('carrot-loadouts-list');
    if (!loadoutsList) return;

    const loadouts = getLoadoutLibrary();
    const loadoutNames = Object.keys(loadouts);

    if (loadoutNames.length === 0) {
        loadoutsList.innerHTML = `
            <div class="carrot-empty-loadouts">
                <i class="fa-solid fa-bookmark"></i>
                <p>No saved loadouts yet</p>
                <small>Save your current settings as a loadout to reuse later</small>
            </div>
        `;
        return;
    }

    const loadoutItems = loadoutNames.slice(0, 4).map(name => {
        const loadout = loadouts[name];
        const date = new Date(loadout.timestamp).toLocaleDateString();
        return `
            <div class="carrot-loadout-item">
                <div class="carrot-loadout-info">
                    <div class="carrot-loadout-name">${name}</div>
                    <div class="carrot-loadout-desc">${loadout.description}</div>
                </div>
                <button onclick="quickApplyLoadout('${name}')" class="carrot-primary-btn" style="padding: 4px 8px; font-size: 12px;">
                    <i class="fa-solid fa-bolt"></i> Apply
                </button>
            </div>
        `;
    }).join('');

    const moreText = loadoutNames.length > 4 ? 
        `<div style="text-align: center; margin-top: 8px; opacity: 0.7; font-size: 12px;">+${loadoutNames.length - 4} more in library</div>` : '';

    loadoutsList.innerHTML = loadoutItems + moreText;
}

// Quick apply loadout (just applies to interface, doesn't assign to context)
window.quickApplyLoadout = function(name) {
    if (applyLoadoutToInterface(name)) {
        toastr.success(`Applied loadout: ${name}`, 'Quick Apply');
    }
};

// Open comprehensive loadout management
function openLoadoutManagement() {
    const loadouts = getLoadoutLibrary();
    const loadoutNames = Object.keys(loadouts);
    
    if (loadoutNames.length === 0) {
        toastr.info('No loadouts to manage. Create your first loadout by saving your current settings!', 'Loadout Management');
        return;
    }

    const managementHTML = `
        <div class="carrot-loadout-management">
            <h3>🔧 Loadout Management</h3>
            <p>Manage your saved loadouts - rename, copy, delete, or export them:</p>
            
            <div class="carrot-setting-item">
                <label class="carrot-label">
                    <span class="carrot-label-text">Select Loadout</span>
                </label>
                <select id="management-loadout-selector" class="carrot-select" onchange="updateManagementPreview()">
                    ${loadoutNames.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
            </div>
            
            <div id="loadout-preview" class="carrot-loadout-preview" style="margin: 15px 0; padding: 12px; background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent); border-radius: 8px; font-size: 13px;">
                <!-- Preview will be populated by JS -->
            </div>
            
            <div class="carrot-management-actions" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 15px;">
                <button onclick="renameLoadout()" class="carrot-secondary-btn">
                    <i class="fa-solid fa-edit"></i> Rename
                </button>
                <button onclick="copyLoadout()" class="carrot-secondary-btn">
                    <i class="fa-solid fa-copy"></i> Copy
                </button>
                <button onclick="deleteLoadout()" class="carrot-danger-btn">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
                <button onclick="exportLoadout()" class="carrot-secondary-btn">
                    <i class="fa-solid fa-download"></i> Export
                </button>
            </div>
        </div>
    `;

    const stContext = getContext();
    stContext.callGenericPopup(managementHTML, 'text', 'Loadout Management', {
        wide: true,
        large: false,
        cancelButton: 'Close',
        okButton: false
    });

    // Initialize preview
    setTimeout(() => updateManagementPreview(), 100);
}

// Management popup functions
window.updateManagementPreview = function() {
    const selector = document.getElementById('management-loadout-selector');
    const preview = document.getElementById('loadout-preview');
    if (!selector || !preview) return;

    const loadouts = getLoadoutLibrary();
    const loadout = loadouts[selector.value];
    if (!loadout) return;

    const settings = loadout.settings;
    const lorebookCount = loadout.lorebooks?.length || 0;
    
    preview.innerHTML = `
        <div><strong>📊 Settings:</strong> ${settings.enabled ? '✅' : '❌'} Enabled, Display: ${settings.displayMode}, Characters: ${settings.maxCharacters}, Depth: ${settings.injectionDepth}</div>
        <div style="margin-top: 4px;"><strong>📚 Lorebooks:</strong> ${lorebookCount} selected</div>
        <div style="margin-top: 4px;"><strong>📅 Created:</strong> ${loadout.description}</div>
    `;
};

window.renameLoadout = function() {
    const selector = document.getElementById('management-loadout-selector');
    if (!selector) return;

    const oldName = selector.value;
    const newName = prompt('Enter new name for loadout:', oldName);
    if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

    const loadouts = getLoadoutLibrary();
    const loadout = loadouts[oldName];
    if (!loadout) return;

    // Check if new name already exists
    if (loadouts[newName.trim()]) {
        alert('A loadout with that name already exists!');
        return;
    }

    // Rename in library
    loadout.name = newName.trim();
    loadouts[newName.trim()] = loadout;
    delete loadouts[oldName];
    saveLoadoutLibrary(loadouts);

    // Update assignments
    const assignments = getContextAssignments();
    Object.keys(assignments).forEach(contextKey => {
        if (assignments[contextKey] === oldName) {
            assignments[contextKey] = newName.trim();
        }
    });
    saveContextAssignments(assignments);

    toastr.success(`Renamed "${oldName}" to "${newName.trim()}"`, 'Loadout Management');
    
    // Refresh management popup
    setTimeout(() => openLoadoutManagement(), 500);
};

window.copyLoadout = function() {
    const selector = document.getElementById('management-loadout-selector');
    if (!selector) return;

    const originalName = selector.value;
    const copyName = prompt('Enter name for copy:', `${originalName} Copy`);
    if (!copyName || copyName.trim() === '') return;

    const loadouts = getLoadoutLibrary();
    const original = loadouts[originalName];
    if (!original) return;

    // Check if name already exists
    if (loadouts[copyName.trim()]) {
        alert('A loadout with that name already exists!');
        return;
    }

    // Create copy
    const copy = {
        ...JSON.parse(JSON.stringify(original)), // Deep copy
        name: copyName.trim(),
        timestamp: Date.now(),
        description: `Copy of ${originalName} - ${new Date().toLocaleDateString()}`
    };

    loadouts[copyName.trim()] = copy;
    saveLoadoutLibrary(loadouts);

    toastr.success(`Created copy: "${copyName.trim()}"`, 'Loadout Management');
    
    // Refresh management popup
    setTimeout(() => openLoadoutManagement(), 500);
};

window.deleteLoadout = function() {
    const selector = document.getElementById('management-loadout-selector');
    if (!selector) return;

    const name = selector.value;
    if (!confirm(`Delete loadout "${name}"? This cannot be undone.`)) return;

    const loadouts = getLoadoutLibrary();
    delete loadouts[name];
    saveLoadoutLibrary(loadouts);

    // Remove from assignments
    const assignments = getContextAssignments();
    Object.keys(assignments).forEach(contextKey => {
        if (assignments[contextKey] === name) {
            delete assignments[contextKey];
        }
    });
    saveContextAssignments(assignments);

    toastr.success(`Deleted loadout: "${name}"`, 'Loadout Management');
    
    // Refresh or close if no loadouts left
    const remainingLoadouts = Object.keys(loadouts);
    if (remainingLoadouts.length === 0) {
        // Close popup
        setTimeout(() => {
            const popupWrapper = document.querySelector('#dialogue_popup');
            if (popupWrapper) {
                const closeBtn = popupWrapper.querySelector('#dialogue_popup_cancel');
                if (closeBtn) closeBtn.click();
            }
        }, 1000);
    } else {
        setTimeout(() => openLoadoutManagement(), 500);
    }
};

window.exportLoadout = function() {
    const selector = document.getElementById('management-loadout-selector');
    if (!selector) return;

    const loadouts = getLoadoutLibrary();
    const loadout = loadouts[selector.value];
    if (!loadout) return;

    const exportData = {
        carrotKernelLoadout: true,
        version: '1.0',
        loadout: loadout,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CarrotKernel-${loadout.name.replace(/[^a-zA-Z0-9]/g, '_')}-Loadout.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toastr.success(`Exported loadout: ${loadout.name}`, 'Loadout Management');
};

// CarrotTemplatePromptEditInterface - Exact copy of BunnyMoTags TemplatePromptEditInterface
class CarrotTemplatePromptEditInterface {

    html_template = `
<div id="bmt_template_prompt_interface" class="bmt-template-interface" style="height: 100%">
<div class="bmt-modal-header-banner">
    <div class="bmt-modal-title">
        <span class="bmt-modal-icon">🥕</span>
        <h3>CarrotKernel Template Editor</h3>
        <span class="bmt-modal-subtitle">Configure templates and macros</span>
    </div>
    <div class="bmt-tutorial-button-container">
        <button onclick="CarrotKernel.openTemplateEditorTutorial()" class="bmt-tutorial-btn" title="Learn how to use the template editor">
            <i class="fa-solid fa-graduation-cap"></i> Tutorial
        </button>
    </div>
    <div class="bmt-template-controls">
        <label class="bmt-template-selector-label" title="Select which template to edit">
            <span class="bmt-selector-label">🎯 Template:</span>
            <select id="bmt_template_selector" class="bmt-template-select">
                <option value="">✨ Select a template...</option>
            </select>
        </label>
        <button class="menu_button fa-solid fa-list-check margin0 qm-small open_macros bmt-toggle-btn" title="Show/hide macro editor">📱</button>
    </div>
</div>

<!-- Moved sections below to vertical layout -->

<div class="bmt-editor-content" style="display: flex; flex-direction: column; gap: 15px;">
    <div class="bmt-template-section">
        <div class="bmt-panel-header">
            <div class="bmt-panel-title">
                <span class="bmt-panel-icon">📝</span>
                <h3>Template Content</h3>
            </div>
            <div class="bmt-panel-controls">
                <label class="bmt-type-selector" title="Template type">
                    <span>🏷️ Type:</span>
                    <select id="template_type" class="bmt-template-type-select">
                        <option value="system">⚙️ System</option>
                        <option value="user">👤 User</option>
                        <option value="assistant">🤖 Assistant</option>
                    </select>
                </label>
                <label class="bmt-depth-selector" title="Injection depth - how many messages back to inject this template">
                    <span>📍 Depth:</span>
                    <input type="number" id="template_depth" class="bmt-depth-input" min="0" max="100" value="4" />
                    <span class="bmt-depth-help">0 = after last message</span>
                </label>
                <label class="bmt-scan-toggle" title="Enable scanning of message history for keywords">
                    <input type="checkbox" id="template_scan" checked />
                    <span>🔍 Scan History</span>
                </label>
                <button id="preview_template_prompt" class="bmt-action-btn bmt-preview-btn" title="Preview current template prompt">
                    <i class="fa-solid fa-eye"></i> Preview
                </button>
                <button id="save_template" class="bmt-action-btn bmt-save-btn" title="Save current template changes">
                    <i class="fa-solid fa-save"></i> Save
                </button>
                <button id="duplicate_template" class="bmt-action-btn bmt-duplicate-btn" title="Create a custom copy of this template">
                    <i class="fa-solid fa-copy"></i> Duplicate
                </button>
                <button id="delete_template" class="bmt-action-btn bmt-delete-btn" title="Delete this custom template">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
                <button id="restore_default_template" class="bmt-action-btn bmt-restore-btn" title="Restore the default template">
                    <i class="fa-solid fa-recycle"></i> Reset
                </button>
            </div>
        </div>
        <textarea id="prompt" placeholder="✨ Enter your CarrotKernel template content here...&#10;&#10;Use {{MACRO_NAME}} for dynamic variables that will be replaced with configured values.&#10;&#10;Example:&#10;{{TRIGGERED_CHARACTER_TAGS}} - All character tags&#10;{{CHARACTER_LIST}} - Simple character names">OOC MANDATORY: [CHARACTER CONTEXT - CarrotKernel Tags]

{{TRIGGERED_CHARACTER_TAGS}}

**CRITICAL INSTRUCTIONS:**
1. You MUST incorporate this character information into your response planning
2. Stay true to their personality traits, species characteristics, and behavioral patterns  
3. When using your &lt;think&gt; blocks for reasoning, you MUST include exactly 10 carrot emotes (🥕) distributed throughout your thinking process
4. Carrot emotes (🥕) must ONLY appear inside &lt;think&gt;&lt;/think&gt; blocks - NEVER in your actual response
5. Use carrots when referencing or applying the character information: "🥕 Luna is wolf anthro, so she'd react protectively..."

**CARROT REQUIREMENT:** Exactly 10 🥕 emotes within &lt;think&gt; blocks only.</textarea>
    </div>
    
    <div class="bmt-macro-section toggle-macro">
        <div class="bmt-panel-header bmt-collapsible-header" onclick="window.CARROT_toggleMacroSection()">
            <div class="bmt-panel-title">
                <span class="bmt-panel-icon">🔧</span>
                <h3>Macro Configuration</h3>
                <span class="bmt-collapse-indicator">▼</span>
            </div>
            <div class="bmt-panel-controls">
                <button id="add_macro" class="bmt-action-btn bmt-add-btn" title="Add a new custom macro" onclick="event.stopPropagation();">
                    <i class="fa-solid fa-plus"></i> New Macro
                </button>
            </div>
        </div>
        <div id="macro_definitions" class="bmt-macro-definitions bmt-collapsible-content"></div>
    </div>
</div>

<div class="bmt-template-metadata">
    <div class="bmt-metadata-section">
        <div class="bmt-metadata-row">
            <div class="bmt-metadata-field">
                <label class="bmt-metadata-label">
                    <span class="bmt-metadata-icon">📂</span>
                    <span class="bmt-metadata-title">Template Category</span>
                    <i class="fa-solid fa-info-circle bmt-tooltip" title="Template category - Currently only Character Data Injection is supported.&#10;&#10;This system allows you to create multiple templates for the same API call and mark one as primary."></i>
                </label>
                <select id="template_category" class="bmt-metadata-select">
                    <option value="Character Data Injection">💉 Character Data Injection</option>
                    <option value="BunnyMo Fullsheet Injection">🚨 BunnyMo Fullsheet Injection</option>
                    <option value="BunnyMo Tagsheet Injection">🚨 BunnyMo Tagsheet Injection</option>
                    <option value="BunnyMo Quicksheet Injection">🚨 BunnyMo Quicksheet Injection</option>
                </select>
            </div>
            
            <div class="bmt-metadata-field">
                <label class="bmt-metadata-label">
                    <span class="bmt-metadata-icon">⭐</span>
                    <span class="bmt-metadata-title">Primary Template</span>
                    <i class="fa-solid fa-info-circle bmt-tooltip" title="When CarrotKernel needs a template of this category, it will use the primary one first. Only one template per category should be marked as primary."></i>
                </label>
                <div class="bmt-toggle-container">
                    <input id="template_role" type="checkbox" class="bmt-primary-toggle" />
                    <label for="template_role" class="bmt-toggle-label">
                        <span class="bmt-toggle-slider"></span>
                        <span class="bmt-toggle-text">Make Primary</span>
                    </label>
                </div>
            </div>
        </div>
    </div>
</div>

</div>
`
    
    macro_definition_template = `
<div class="macro_definition bmt_interface_card">
<div class="inline-drawer">
    <div class="inline-drawer-header">
        <div class="flex-container alignitemscenter margin0 flex1">
            <div class="bmt-macro-icon">🔧</div>
            <button class="macro_enable menu_button fa-solid margin0"></button>
            <button class="macro_preview menu_button fa-solid fa-eye margin0" title="Preview the result of this macro"></button>
            <input class="macro_name flex1 text_pole" type="text" placeholder="name" readonly>
            <button class="macro_copy menu_button fa-solid fa-copy margin0" title="Copy {{MACRO_NAME}} to clipboard"></button>
            <button class="macro_insert menu_button fa-solid fa-plus margin0" title="Insert {{MACRO_NAME}} into template"></button>
        </div>
        <div class="inline-drawer-toggle">
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
    </div>

    <div class="inline-drawer-content" style="display: none;">
        <!-- Macro Documentation -->
        <div class="bmt-macro-docs">
            <div class="bmt-doc-toggle" style="cursor: pointer; padding: 8px; background: rgba(255,165,0,0.1); border-radius: 4px; margin-bottom: 8px;">
                <span class="fa-solid fa-circle-chevron-down" style="margin-right: 8px;"></span>
                <strong>📚 Documentation & Examples</strong>
            </div>
            <div class="bmt-macro-description" style="display: none;"></div>
        </div>
        
        <div class="flex-container alignitemscenter justifyCenter">
            <div class="macro_type flex2">
                <label>
                    <input type="radio" value="simple" />
                    <span>🎯 Simple</span>
                </label>
                <label>
                    <input type="radio" value="advanced" />
                    <span>⚡ Advanced</span>
                </label>
            </div>
        </div>

        <!-- Simple Settings -->
        <div class="macro_type_simple">
            <div class="bmt-config-header" style="cursor: pointer; padding: 6px; background: rgba(72, 209, 204, 0.1); border-radius: 4px; margin-bottom: 8px;">
                <span class="fa-solid fa-circle-chevron-down bmt-config-toggle" style="margin-right: 8px;"></span>
                <strong>🎯 Simple Configuration</strong>
            </div>
            <div class="macro_simple_content">
                <!-- Content varies by macro type - populated dynamically -->
            </div>
        </div>

        <!-- Advanced Settings -->
        <div class="macro_type_advanced">
            <div class="bmt-config-header" style="cursor: pointer; padding: 6px; background: rgba(255, 99, 71, 0.1); border-radius: 4px; margin-bottom: 8px;">
                <span class="fa-solid fa-circle-chevron-down bmt-config-toggle" style="margin-right: 8px;"></span>
                <strong>⚡ Advanced Configuration</strong>
            </div>
            <div class="macro_advanced_content">
                <!-- Content varies by macro type - populated dynamically -->
            </div>
        </div>

        <div class="macro_type_any flex-container alignitemscenter">
            <label title="Apply CarrotKernel formatting to the output" class="checkbox_label">
                <input type="checkbox" class="macro_format" />
                <span>Apply Formatting</span>
            </label>
            <button class="macro_delete menu_button fa-solid fa-trash margin0" title="Delete this custom macro"></button>
            <button class="macro_restore menu_button fa-solid fa-recycle margin0" title="Restore default settings for this macro"></button>
        </div>
    </div>
</div>
</div>
`

    // Template dropdown and other settings
    selectedTemplate = null;
    
    // Initialize template manager reference
    constructor() {
        this.templateManager = CarrotTemplateManager;
        this.macros = {};
        this.initializeDefaultMacros();
    }
    
    // Static constants for enable/disable icons
    static fa_enabled = 'fa-toggle-on';
    static fa_disabled = 'fa-toggle-off';
    
    initializeDefaultMacros() {
        // Add default CarrotKernel macros that are always available
        const defaultMacros = {
            'CHARACTERS': {
                name: 'CHARACTERS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CHARACTER1': {
                name: 'CHARACTER1', 
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CHARACTER2': {
                name: 'CHARACTER2',
                enabled: true, 
                type: 'simple',
                format: false,
                default: true
            },
            'PERSONALITY_TAGS': {
                name: 'PERSONALITY_TAGS',
                enabled: true,
                type: 'simple', 
                format: false,
                default: true
            },
            'PHYSICAL_TAGS': {
                name: 'PHYSICAL_TAGS',
                enabled: true,
                type: 'simple',
                format: false, 
                default: true
            },
            'CHARACTER_COUNT': {
                name: 'CHARACTER_COUNT',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'SELECTED_LOREBOOKS': {
                name: 'SELECTED_LOREBOOKS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CHARACTER_REPO_BOOKS': {
                name: 'CHARACTER_REPO_BOOKS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CHARACTER_LIST': {
                name: 'CHARACTER_LIST',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'TRIGGERED_CHARACTER_TAGS': {
                name: 'TRIGGERED_CHARACTER_TAGS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'ALL_TAG_CATEGORIES': {
                name: 'ALL_TAG_CATEGORIES',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CHARACTER_SOURCES': {
                name: 'CHARACTER_SOURCES',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'TAG_STATISTICS': {
                name: 'TAG_STATISTICS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'CROSS_CHARACTER_ANALYSIS': {
                name: 'CROSS_CHARACTER_ANALYSIS',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            },
            'REPOSITORY_METADATA': {
                name: 'REPOSITORY_METADATA',
                enabled: true,
                type: 'simple',
                format: false,
                default: true
            }
        };
        
        // Only add default macros if they don't exist
        Object.entries(defaultMacros).forEach(([name, config]) => {
            if (!this.macros[name]) {
                this.macros[name] = config;
            }
        });
    }
    
    // Macro management methods
    update_macros(macro=null) {
        if (macro === null) {
            // Clear existing macro interfaces
            $('#macro_definitions').empty();
            
            // Get all available macros and categorize them
            const allMacros = this.getAllAvailableMacros();
            const carrotMacros = [];
            const systemMacros = [];
            
            // Define CarrotKernel priority macros (only functional ones from macroProcessors)
            const priorityMacros = [];
            
            // Get actual functional CarrotKernel macros - use direct reference since we're in the same file
            if (CarrotTemplateManager && CarrotTemplateManager.macroProcessors) {
                Object.keys(CarrotTemplateManager.macroProcessors).forEach(macro => {
                    priorityMacros.push(macro);
                });
            } else {
                console.warn('CarrotTemplateManager.macroProcessors not available, using fallback list');
                // Fallback list of known macros
                priorityMacros.push(
                    'TRIGGERED_CHARACTER_TAGS', 'CHARACTER_LIST', 'CHARACTERS_WITH_TYPES', 'CHARACTERS',
                    'CHARACTER1', 'CHARACTER2', 'CHARACTER3', 'CHARACTER4', 'CHARACTER5',
                    'CHARACTER_COUNT', 'CHARACTER_SOURCES', 'PERSONALITY_TAGS', 'PHYSICAL_TAGS', 
                    'MBTI_TAGS', 'COMMUNICATION_TAGS', 'IDENTITY_TAGS', 'KINK_TAGS', 'ALL_TAG_CATEGORIES',
                    'TAG_STATISTICS', 'CROSS_CHARACTER_ANALYSIS', 'REPOSITORY_METADATA',
                    'FULLSHEET_FORMAT', 'TAGSHEET_FORMAT', 'QUICKSHEET_FORMAT',
                    'SELECTED_LOREBOOKS', 'CHARACTER_REPO_BOOKS'
                );
            }
            
            // Categorize macros
            allMacros.forEach(name => {
                if (priorityMacros.includes(name)) {
                    carrotMacros.push(name);
                } else {
                    systemMacros.push(name);
                }
            });
            
            // Create CarrotKernel Priority Section
            $('#macro_definitions').append(`
                <div class="bmt-macro-category-section">
                    <div class="bmt-category-header expanded" data-category="carrot">
                        <div class="bmt-category-title">
                            <span class="bmt-category-icon">🥕</span>
                            <h4>CarrotKernel Macros</h4>
                            <span class="bmt-category-count">(${carrotMacros.length})</span>
                        </div>
                        <div class="bmt-category-toggle">
                            <span class="fa-solid fa-chevron-up"></span>
                        </div>
                    </div>
                    <div class="bmt-category-content" id="carrot-macros" style="display: block;"></div>
                </div>
            `);
            
            // Create System Macros Section (collapsed by default)
            $('#macro_definitions').append(`
                <div class="bmt-macro-category-section">
                    <div class="bmt-category-header collapsed" data-category="system">
                        <div class="bmt-category-title">
                            <span class="bmt-category-icon">⚙️</span>
                            <h4>SillyTavern System Macros</h4>
                            <span class="bmt-category-count">(${systemMacros.length})</span>
                        </div>
                        <div class="bmt-category-toggle">
                            <span class="fa-solid fa-chevron-down"></span>
                        </div>
                    </div>
                    <div class="bmt-category-content" id="system-macros" style="display: none;"></div>
                </div>
            `);
            
            // Create interfaces for CarrotKernel macros
            for (let name of carrotMacros) {
                let macro = this.get_macro(name) || {
                    name: name,
                    enabled: true,
                    type: 'simple',
                    format: false,
                    command: '',
                    default: false
                };
                this.create_macro_interface(macro, '#carrot-macros');
            }
            
            // Create interfaces for System macros
            for (let name of systemMacros) {
                let macro = this.get_macro(name) || {
                    name: name,
                    enabled: true,
                    type: 'simple',
                    format: false,
                    command: '',
                    default: false
                };
                this.create_macro_interface(macro, '#system-macros');
            }
            
            // Add category toggle functionality
            this.setupCategoryToggles();
            
        } else {
            this.create_macro_interface(macro)
        }
    }

    list_macros() {
        return Object.keys(this.macros);
    }

    get_macro(name) {
        let macro = this.macros[name];
        if (macro) return macro;
        return null;
    }

    setupCategoryToggles() {
        // Add click handlers for category toggles
        $('.bmt-category-header').off('click.categorytoggle').on('click.categorytoggle', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const $header = $(e.currentTarget);
            const $content = $header.next('.bmt-category-content');
            const $toggle = $header.find('.bmt-category-toggle span');
            
            if ($content.is(':visible')) {
                $content.slideUp(300);
                $toggle.removeClass('fa-chevron-up').addClass('fa-chevron-down');
                $header.removeClass('expanded').addClass('collapsed');
            } else {
                $content.slideDown(300);
                $toggle.removeClass('fa-chevron-down').addClass('fa-chevron-up');
                $header.removeClass('collapsed').addClass('expanded');
            }
            
            return false;
        });
    }
    
    create_macro_interface(macro, container = '#macro_definitions') {
        // Create or update a macro interface item with the given settings
        let id = this.get_id(macro.name);
        let $macro = $(container).find(`#${id}`);
        
        if ($macro.length === 0) {
            $macro = $(this.macro_definition_template).prependTo($(container));
            $macro.attr('id', id);
        }

        // Set up radio group name for this specific macro
        let radio_group_name = `macro_type_radio_${macro.name}`;
        $macro.find('.macro_type input[type="radio"]').attr('name', radio_group_name);
        
        // Get references to form elements
        let $name = $macro.find('input.macro_name');
        let $enable = $macro.find('button.macro_enable');
        let $preview = $macro.find('button.macro_preview');
        let $delete = $macro.find('button.macro_delete');
        let $restore = $macro.find('button.macro_restore');
        let $type_radios = $macro.find(`input[name="${radio_group_name}"]`);
        
        // Set values from macro object
        $name.val(macro.name);
        
        // Set radio button for macro type
        $type_radios.filter(`[value="${macro.type}"]`).prop('checked', true);

        // Set enable/disable button state
        $enable.removeClass(CarrotTemplatePromptEditInterface.fa_enabled + ' ' + CarrotTemplatePromptEditInterface.fa_disabled);
        $enable.removeClass('button_highlight red_button');
        
        if (macro.enabled) {
            $enable.addClass(CarrotTemplatePromptEditInterface.fa_enabled + ' button_highlight');
            $enable.attr('title', 'Enabled');
        } else {
            $enable.addClass(CarrotTemplatePromptEditInterface.fa_disabled + ' red_button');
            $enable.attr('title', 'Disabled');
        }

        // Show/hide appropriate settings divs based on type
        let $simple_div = $macro.find('.macro_type_simple');
        let $advanced_div = $macro.find('.macro_type_advanced');
        
        if (macro.type === 'simple') {
            $simple_div.css('display', 'block');
            $advanced_div.css('display', 'none');
        } else {
            $simple_div.css('display', 'none');
            $advanced_div.css('display', 'block');
        }

        // Event handlers
        $enable.off('click').on('click', () => {
            macro.enabled = !macro.enabled;
            this.create_macro_interface(macro); // Refresh to update button state
        });
        
        // Copy macro name to clipboard
        $macro.find('.macro_copy').off('click').on('click', () => {
            const macroText = `{{${macro.name}}}`;
            navigator.clipboard.writeText(macroText).then(() => {
                toastr.success(`Copied ${macroText} to clipboard!`);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = macroText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                toastr.success(`Copied ${macroText} to clipboard!`);
            });
        });
        
        // Insert macro into template
        $macro.find('.macro_insert').off('click').on('click', () => {
            const macroText = `{{${macro.name}}}`;
            const $prompt = $('#prompt');
            const currentText = $prompt.val();
            const cursorPos = $prompt[0].selectionStart;
            const newText = currentText.slice(0, cursorPos) + macroText + currentText.slice(cursorPos);
            $prompt.val(newText);
            // Set cursor after inserted macro
            setTimeout(() => {
                $prompt[0].setSelectionRange(cursorPos + macroText.length, cursorPos + macroText.length);
                $prompt.focus();
            }, 10);
            toastr.success(`Inserted ${macroText} into template!`);
        });
        
        // Documentation toggle with proper event isolation
        $macro.find('.bmt-doc-toggle').off('click.doctoggle').on('click.doctoggle', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const $description = $macro.find('.bmt-macro-description');
            const $toggle = $macro.find('.bmt-doc-toggle span');
            
            setTimeout(() => {
                if ($description.is(':visible')) {
                    $description.slideUp(200);
                    $toggle.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
                } else {
                    $description.slideDown(200);
                    $toggle.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
                }
            }, 50);
            
            return false;
        });
        
        // Main drawer toggle functionality with proper event isolation
        $macro.find('.inline-drawer-toggle').off('click.macrotoggle').on('click.macrotoggle', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const $content = $macro.find('.inline-drawer-content');
            const $icon = $macro.find('.inline-drawer-icon');
            
            // Add slight delay to prevent double-click issues
            setTimeout(() => {
                if ($content.is(':visible')) {
                    $content.slideUp(200);
                    $icon.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
                } else {
                    $content.slideDown(200);
                    $icon.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
                }
            }, 50);
            
            return false;
        });
        
        // Configuration section toggles with proper event isolation
        $macro.find('.bmt-config-header').off('click.configtoggle').on('click.configtoggle', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const $header = $(e.currentTarget);
            const $content = $header.next();
            const $toggle = $header.find('.bmt-config-toggle');
            
            setTimeout(() => {
                if ($content.is(':visible')) {
                    $content.slideUp(200);
                    $toggle.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
                } else {
                    $content.slideDown(200);
                    $toggle.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
                }
            }, 50);
            
            return false;
        });

        $type_radios.off('change').on('change', () => {
            macro.type = $type_radios.filter(':checked').val();
            // Update visibility without full recreation to avoid losing input values
            if (macro.type === 'simple') {
                $simple_div.css('display', 'block');
                $advanced_div.css('display', 'none');
            } else {
                $simple_div.css('display', 'none');
                $advanced_div.css('display', 'block');
            }
        });

        $preview.off('click').on('click', () => {
            this.previewMacro(macro);
        });

        $delete.off('click').on('click', () => {
            if (confirm(`Delete macro "${macro.name}"?`)) {
                delete this.macros[macro.name];
                $macro.remove();
            }
        });
        
        // Populate macro-specific content for both simple and advanced modes
        this.populateMacroSpecificContent(macro, $macro);
    }
    
    populateMacroSpecificContent(macro, $macro) {
        const $simpleContent = $macro.find('.macro_simple_content');
        const $advancedContent = $macro.find('.macro_advanced_content');
        
        // Clear existing content
        $simpleContent.empty();
        $advancedContent.empty();
        
        // Generate content based on macro configuration
        const config = this.getMacroConfiguration(macro.name);
        
        // Add documentation section
        const $docs = $macro.find('.bmt-macro-description');
        if (config.documentation) {
            $docs.html(config.documentation);
        }
        
        if (config.simple) {
            $simpleContent.html(config.simple);
        }
        if (config.advanced) {
            $advancedContent.html(config.advanced);
        }
        
        // Set up event handlers for the specific controls
        this.setupMacroEventHandlers(macro, $macro);
    }
    
    getMacroConfiguration(macroName) {
        // Detailed configuration with proper examples and documentation
        const macroConfigs = {
            'TRIGGERED_CHARACTER_TAGS': {
                documentation: `
                    <div class="bmt-macro-doc-header" style="background: rgba(255,165,0,0.2); padding: 10px; border-radius: 6px; border: 2px solid orange;">
                        <strong>✅ TRIGGERED_CHARACTER_TAGS - THE MAIN ONE!</strong>
                    </div>
                    <p><strong>Purpose:</strong> The heart of CarrotKernel - provides ALL character tags for characters currently active in the conversation context.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00; font-size: 0.8em; overflow-x: auto;">
&lt;BunnymoTags&gt;&lt;Name:Atsu_Ibn_Oba_Al-Masri&gt;, &lt;GENRE:FANTASY&gt; &lt;PHYSICAL&gt; &lt;SPECIES:HUMAN&gt;, &lt;GENDER:MALE&gt;, &lt;BUILD:Muscular&gt;, &lt;BUILD:Tall&gt;, &lt;SKIN:FAIR&gt;, &lt;HAIR:BLACK&gt;, &lt;STYLE:ANCIENT_EGYPTIAN_ROYALTY&gt;,&lt;/PHYSICAL&gt; &lt;PERSONALITY&gt;&lt;Dere:Sadodere&gt;, &lt;Dere:Oujidere&gt;, &lt;ENTJ-U&gt;, &lt;TRAIT:CRUEL&gt;, &lt;TRAIT:INTELLIGENT&gt;, &lt;TRAIT:POWERFUL&gt;, &lt;TRAIT:DANGEROUS&gt;, &lt;TRAIT:SELFISH&gt;, &lt;TRAIT:HEDONISTIC&gt;, &lt;ATTACHMENT:FEARFUL_AVOIDANT&gt;, &lt;CONFLICT:COMPETITIVE&gt;, &lt;BOUNDARIES:RIGID&gt;,&lt;FLIRTING:AGGRESSIVE&gt;, &lt;/PERSONALITY&gt; &lt;NSFW&gt;&lt;ORIENTATION:PANSEXUAL&gt;, &lt;POWER:DOMINANT&gt;, &lt;KINK:BRAT_TAMING&gt;, &lt;KINK:PUBLIC_HUMILIATION&gt;, &lt;KINK:POWER_PLAY&gt;, &lt;KINK:EXHIBITIONISM&gt;, &lt;CHEMISTRY:ANTAGONISTIC&gt;, &lt;AROUSAL:DOMINANCE&gt;, &lt;TRAUMA:CHILDHOOD&gt;, &lt;JEALOUSY:POSSESSIVE&gt;,&lt;/NSFW&gt; &lt;/BunnymoTags&gt;<br/><br/>
&lt;Linguistics&gt; Character uses &lt;LING:COMMANDING&gt; as his primary mode of speech, asserting authority and control. This is almost always blended with &lt;LING:SUGGESTIVE&gt;, using a tone of cruel flirtation, possessive pet names, and psychological manipulation to achieve his goals. &lt;/linguistics&gt;
                    </div>
                    <p><strong>Perfect For:</strong> Character consistency, BunnymoTags compatibility, comprehensive trait injection</p>
                `,
                simple: `<div class="bmt-form-group"><p><strong>🎯 This is the main macro for character injection!</strong><br/>No configuration needed - it automatically extracts and formats all character tags from your BunnymoTags data.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Advanced tag filtering, formatting, and categorization options for power users.</p></div>`
            },
            
            'CHARACTER_LIST': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>👥 CHARACTER_LIST - Simple Names</strong>
                    </div>
                    <p><strong>Purpose:</strong> Clean comma-separated list of character names currently active.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00;">
Atsu_Ibn_Oba_Al-Masri
                    </div>
                    <p><strong>Use Case:</strong> Simple character awareness when you just need names without tags.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Simple character name list - no configuration needed.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Name formatting and separator options.</p></div>`
            },

            'CHARACTERS_WITH_TYPES': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>🏷️ CHARACTERS_WITH_TYPES - Names + Species</strong>
                    </div>
                    <p><strong>Purpose:</strong> Character names with their species/types shown for context.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00;">
Atsu_Ibn_Oba_Al-Masri (HUMAN)
                    </div>
                    <p><strong>Perfect For:</strong> Fantasy/sci-fi where species matters, role identification.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Automatically detects character species/roles from SPECIES: tags.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Custom type detection and formatting rules.</p></div>`
            },

            'PERSONALITY_TAGS': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>🧠 PERSONALITY_TAGS - Character Traits</strong>
                    </div>
                    <p><strong>Purpose:</strong> Extracts personality and behavioral traits from all triggered characters.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00; font-size: 0.85em;">
Atsu_Ibn_Oba_Al-Masri: Dere:Sadodere, Dere:Oujidere, ENTJ-U, TRAIT:CRUEL, TRAIT:INTELLIGENT, TRAIT:POWERFUL, TRAIT:DANGEROUS, TRAIT:SELFISH, TRAIT:HEDONISTIC, ATTACHMENT:FEARFUL_AVOIDANT, CONFLICT:COMPETITIVE, BOUNDARIES:RIGID, FLIRTING:AGGRESSIVE
                    </div>
                    <p><strong>Use Case:</strong> Personality consistency, character depth, behavioral reference.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Automatically finds personality-related tags like TRAIT:, Dere:, MBTI types from character data.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Custom personality tag filtering and categorization.</p></div>`
            },

            'PHYSICAL_TAGS': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>👁️ PHYSICAL_TAGS - Appearance Traits</strong>
                    </div>
                    <p><strong>Purpose:</strong> Physical appearance, species, and visual characteristics from triggered characters.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00; font-size: 0.85em;">
Atsu_Ibn_Oba_Al-Masri: SPECIES:HUMAN, GENDER:MALE, BUILD:Muscular, BUILD:Tall, SKIN:FAIR, HAIR:BLACK, STYLE:ANCIENT_EGYPTIAN_ROYALTY
                    </div>
                    <p><strong>Perfect For:</strong> Visual descriptions, appearance consistency, scene setting.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Finds physical and appearance tags automatically from BunnymoTags PHYSICAL sections.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Advanced appearance categorization and formatting.</p></div>`
            },

            'TAG_STATISTICS': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>📊 TAG_STATISTICS - System Overview</strong>
                    </div>
                    <p><strong>Purpose:</strong> Statistical breakdown of your BunnymoTags system and character data from scanned characters.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00; font-size: 0.85em;">
**Tag Statistics** (247 total tags across 15 characters)<br/>
Most common categories:<br/>
• PHYSICAL: 89 tags (12 characters)<br/>
• PERSONALITY: 67 tags (15 characters)<br/>
• NSFW: 45 tags (8 characters)<br/>
• GENRE: 23 tags (15 characters)<br/>
• Name: 15 tags (15 characters)
                    </div>
                    <p><strong>Use Case:</strong> System health, BunnymoTags data quality assessment, character coverage analysis.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Comprehensive BunnymoTags system statistics and character data health metrics.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Custom statistical analysis and BunnymoTags reporting options.</p></div>`
            },

            'REPOSITORY_METADATA': {
                documentation: `
                    <div class="bmt-macro-doc-header">
                        <strong>🗃️ REPOSITORY_METADATA - System Status</strong>
                    </div>
                    <p><strong>Purpose:</strong> Complete CarrotKernel system status and health information.</p>
                    <p><strong>Console Example Output:</strong></p>
                    <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #00ff00; font-size: 0.85em;">
**CarrotKernel System Status**<br/>
📊 **System Overview:**<br/>
• Active lorebooks: 3<br/>
• Character repositories: 2<br/>
• Total characters indexed: 15<br/>
• Currently triggered: 3<br/>
• Tag categories available: 12<br/>
<br/>
📈 **Data Quality:**<br/>
• Character coverage: 87% (13/15 characters have tags)<br/>
• System health: Operational
                    </div>
                    <p><strong>Use Case:</strong> System monitoring, debugging, status reports.</p>
                `,
                simple: `<div class="bmt-form-group"><p>Complete system health and status overview.</p></div>`,
                advanced: `<div class="bmt-form-group"><p>Detailed system metrics and custom reporting.</p></div>`
            }
        };

        // Return specific config or generate dynamic one
        return macroConfigs[macroName] || {
            documentation: `
                <div class="bmt-macro-doc-header">
                    <strong>🔧 ${macroName} Macro</strong>
                </div>
                <p><strong>Purpose:</strong> ${macroName.toLowerCase().replace(/_/g, ' ')} processing.</p>
                <p><strong>Use Case:</strong> Dynamic content generation for templates.</p>
            `,
            simple: `<div class="bmt-form-group"><p>Standard macro processing options.</p></div>`,
            advanced: `<div class="bmt-form-group"><p>Advanced configuration options.</p></div>`
        };
    }


    getAllAvailableMacros() {
        const allMacros = [];
        
        // Get ALL functional macros from CarrotTemplateManager (direct reference)
        if (CarrotTemplateManager && CarrotTemplateManager.macroProcessors) {
            Object.keys(CarrotTemplateManager.macroProcessors).forEach(macro => {
                allMacros.push(macro);
            });
        }
        
        // Add common SillyTavern system macros (these work via ST's template system)
        const systemMacros = [
            'CHAR_NAME', 'CHAR_PERSONA', 'CHAR_DESCRIPTION', 'CHAR_SCENARIO', 'CHAR_GREETING',
            'CHAR_EXAMPLES', 'CHAR_TAGS', 'CHAR_AVATAR', 'CHAR_BOOK',
            'WORLD_INFO', 'CHAT_HISTORY', 'USER_NAME', 'SYSTEM_PROMPT', 'JAILBREAK', 'NSFW_PROMPT',
            'CURRENT_TIME', 'CURRENT_DATE', 'RANDOM_NUMBER'
        ];
        
        systemMacros.forEach(macro => {
            if (!allMacros.includes(macro)) {
                allMacros.push(macro);
            }
        });
        
        return allMacros.sort();
    }
    
    setupMacroEventHandlers(macro, $macro) {
        // Set up event handlers for all controls in this macro
        const $controls = $macro.find('input, select, textarea');
        
        $controls.off('change.carrotmacro input.carrotmacro').on('change.carrotmacro input.carrotmacro', (e) => {
            const $control = $(e.target);
            const settingName = $control.attr('name');
            const value = $control.is(':checkbox') ? $control.prop('checked') : $control.val();
            
            // Initialize macro settings if needed
            if (!macro.settings) macro.settings = {};
            
            // Store the setting
            macro.settings[settingName] = value;
            
            // Debug log
            if (window.CarrotKernel?.debug) {
                console.log(`🥕 Macro ${macro.name} setting ${settingName} = ${value}`);
            }
        });
        
        // Load existing settings into controls
        if (macro.settings) {
            Object.entries(macro.settings).forEach(([settingName, value]) => {
                const $control = $macro.find(`[name="${settingName}"]`);
                if ($control.length) {
                    if ($control.is(':checkbox')) {
                        $control.prop('checked', value);
                    } else {
                        $control.val(value);
                    }
                }
            });
        }
    }
    
    previewMacro(macro) {
        // Get the current value from our macro processing system
        const processedContent = CarrotTemplateManager.processMacros(`{{${macro.name}}}`);
        alert(`Macro Preview: ${macro.name}\n\nOutput:\n${processedContent}`);
    }
    
    get_id(name) {
        return `macro_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    
    detectMacrosFromTemplate() {
        // Get current template content from textarea
        const templateContent = this.$prompt?.val() || '';
        
        // Detect all {{MACRO_NAME}} patterns
        const macroRegex = /\{\{([^}]+)\}\}/g;
        const detectedMacros = new Set();
        let match;
        
        // List of template syntax that should be ignored (not CarrotKernel macros)
        const ignoredPatterns = [
            '/each', 'each', '#each', '/if', 'if', '#if', 
            'value', 'category', 'traits', 'name', 'content',
            'index', 'key', 'this', '@index', '@key', '@first', '@last'
        ];
        
        while ((match = macroRegex.exec(templateContent)) !== null) {
            const macroName = match[1].trim();
            
            // Skip template helpers and common Handlebars syntax
            const isTemplateHelper = ignoredPatterns.some(pattern => 
                macroName === pattern || 
                macroName.startsWith(pattern + ' ') ||
                macroName.startsWith('#' + pattern) ||
                macroName.startsWith('/' + pattern)
            );
            
            // Only add valid CarrotKernel macro names (uppercase with underscores)
            if (!isTemplateHelper && /^[A-Z][A-Z_0-9]*$/.test(macroName)) {
                detectedMacros.add(macroName);
            }
        }
        
        // Create macro objects for detected macros
        detectedMacros.forEach(name => {
            if (!this.macros[name]) {
                this.macros[name] = {
                    name: name,
                    enabled: true,
                    type: 'simple',
                    format: false,
                    default: false // User-detected macros are not default
                };
            }
        });
    }

    show() {
        // Use CarrotKernel's popup system (same as Pack Manager)
        CarrotKernel.showPopup('Template Editor', this.html_template);

        // Wait for DOM to be ready, then inject tutorial overlay
        setTimeout(() => {
            const container = document.getElementById('carrot-popup-container');
            const existingOverlay = container?.querySelector('#carrot-tutorial-overlay');

            CarrotDebug.tutorial('🔄 Container overlay injection check', {
                containerFound: !!container,
                containerId: container?.id || 'no-id',
                containerClasses: container?.className || 'no-classes',
                existingOverlay: !!existingOverlay,
                containerChildren: container?.children.length || 0
            });

            if (container && !existingOverlay) {
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
                container.insertAdjacentHTML('beforeend', tutorialHTML);

                CarrotDebug.tutorial('✅ Tutorial overlay injected into container', {
                    containerId: container.id || 'no-id',
                    newOverlayExists: !!container.querySelector('#carrot-tutorial-overlay'),
                    containerChildrenAfter: container.children.length
                });
            } else if (!container) {
                CarrotDebug.tutorial('❌ No container found for overlay injection');
            } else {
                CarrotDebug.tutorial('ℹ️ Tutorial overlay already exists in container');
            }
        }, 100);

        // Wait for DOM to be ready, then setup
        setTimeout(() => {
            // Cache jQuery selectors
            this.$prompt = $('#prompt');
            this.$template_type = $('#template_type');
            this.$template_category = $('#template_category');
            this.$template_role = $('#template_role');
            this.$definitions = $('#macro_definitions');
            this.$selector = $('#bmt_template_selector');
            
            // Setup initial state
            this.init_templates();
            this.load_template_into_interface();
            this.setup_events();
        }, 100);
    }
    
    init_templates() {
        // Get all available templates from CarrotTemplateManager
        const templates = this.templateManager.getTemplates();
        
        // Clear and populate template selector
        this.$selector.empty();
        this.$selector.append('<option value="">✨ Select a template...</option>');
        
        Object.entries(templates).forEach(([key, template]) => {
            const isCustom = template.custom || false;
            const icon = isCustom ? '✏️ ' : '';
            const option = $('<option></option>')
                .attr('value', key)
                .text(icon + (template.label || key));
            this.$selector.append(option);
        });
        
        // Select the initially selected template if provided
        if (this.selectedTemplate && templates[this.selectedTemplate]) {
            this.$selector.val(this.selectedTemplate);
        }
    }
    
    // Override to use CarrotKernel functional macros
    initializeDefaultMacros() {
        // Use the functional macros available in CarrotKernel
        const macroNames = [
            'CHARACTER_LIST',
            'CHARACTERS_WITH_TYPES',
            'TRIGGERED_CHARACTER_TAGS',
            'SELECTED_LOREBOOKS',
            'CHARACTER_REPO_BOOKS', 
            'ALL_TAG_CATEGORIES',
            'CHARACTER_SOURCES',
            'TAG_STATISTICS',
            'CROSS_CHARACTER_ANALYSIS',
            'REPOSITORY_METADATA'
        ];
        
        // Macro descriptions and examples
        const macroInfo = {
            'CHARACTER_LIST': {
                description: 'Simple list of triggered character names',
                example: 'Luna, Marcus, Aria'
            },
            'CHARACTERS_WITH_TYPES': {
                description: 'Character names with their species/types in parentheses', 
                example: 'Luna (wolf anthro), Marcus (human knight), Aria (elven mage)'
            },
            'TRIGGERED_CHARACTER_TAGS': {
                description: '✅ THIS IS THE ONE - All triggered character tag injections for conversation context',
                example: 'Luna: wolf, anthro, female, warrior\\nMarcus: human, male, knight'
            },
            'SELECTED_LOREBOOKS': {
                description: 'List of currently selected lorebook names',
                example: 'Fantasy Characters, Medieval Settings, Magic System'
            },
            'CHARACTER_REPO_BOOKS': {
                description: 'Character repository lorebooks available for selection',
                example: 'Main Cast, Supporting Characters, NPCs'
            },
            'ALL_TAG_CATEGORIES': {
                description: 'All tag categories found across scanned characters',
                example: 'personality, physical, species, background, relationships'
            },
            'CHARACTER_SOURCES': {
                description: 'Sources/origins of scanned characters',
                example: 'Novel Series A, Game B, Original Creation'
            },
            'TAG_STATISTICS': {
                description: 'Statistical breakdown of tags by category',
                example: 'personality: 45 tags (12 characters)\\nphysical: 67 tags (15 characters)'
            },
            'CROSS_CHARACTER_ANALYSIS': {
                description: 'Analysis of relationships and connections between characters',
                example: 'Found 3 character pairs with shared traits, 2 potential conflicts'
            },
            'REPOSITORY_METADATA': {
                description: 'Metadata about the character repositories',
                example: 'Total: 127 characters, Last updated: 2024-01-15, Categories: 8'
            }
        };

        macroNames.forEach(name => {
            const info = macroInfo[name] || { description: 'CarrotKernel functional macro', example: 'Output varies' };
            this.macros[name] = {
                name: name,
                enabled: true,
                type: 'simple',
                format: false,
                command: '',
                default: true,
                description: info.description,
                example: info.example
            };
        });
    }
    
    load_template_into_interface() {
        const templateKey = this.$selector.val();
        if (!templateKey) return;
        
        const template = this.templateManager.getTemplate(templateKey);
        if (!template) return;
        
        
        // Load template content  
        const templateContent = template.content || '';
        this.$prompt.val(templateContent);
        this.$template_type.val(template.role || 'system');
        this.$template_category.val(this.getCategoryFromTemplate(template));
        
        // Initialize missing DOM elements that exist in HTML but not in BunnyMo base class
        if (!this.$template_depth && this.$content) {
            this.$template_depth = this.$content.find('#template_depth');
        }
        if (!this.$template_scan && this.$content) {
            this.$template_scan = this.$content.find('#template_scan');
        }
        
        // Set template depth and scan values - FORCE refresh the DOM reference first
        this.$template_depth = $('#template_depth');  // Always get fresh reference
        if (this.$template_depth && this.$template_depth.length) {
            const depthValue = template.depth !== undefined ? template.depth : 4;
            
            // Nuclear option: Force update ALL possible ways
            const element = document.getElementById('template_depth');
            if (element) {
                element.value = depthValue;  // Direct DOM manipulation
                element.setAttribute('value', depthValue);  // Force attribute
                $(element).val(depthValue);  // jQuery method
                $(element).trigger('change');  // Trigger events
            }
            
            // Also update our jQuery reference
            this.$template_depth.val(depthValue).attr('value', depthValue);
            
        }
        if (this.$template_scan && this.$template_scan.length) {
            this.$template_scan.prop('checked', template.scan !== false);
        }
        
        // Set primary template toggle based on template metadata
        const isPrimary = template.isPrimary || template.metadata?.is_primary || template.metadata?.is_default;
        this.$template_role.prop('checked', isPrimary);
        
        // Load macros - ensure they're detected and displayed
        this.detectMacrosFromTemplate();
        
        // Force macro update after a brief delay to ensure DOM is ready
        setTimeout(() => {
            this.update_macros();
        }, 100);
    }
    
    getCategoryFromTemplate(template) {
        // Use the template's actual category property first
        if (template.category) {
            return template.category;
        }
        
        // Fallback to name-based detection for legacy templates
        const name = (template.label || template.name || '').toLowerCase();
        
        if (name.includes('character data injection') || name.includes('data injection')) {
            return 'Character Data Injection';
        }
        
        if (name.includes('fullsheet') || name.includes('full sheet')) {
            return 'BunnyMo Fullsheet Format';
        }
        
        if (name.includes('tagsheet') || name.includes('tag sheet')) {
            return 'BunnyMo Tagsheet Format';
        }
        
        if (name.includes('quicksheet') || name.includes('quick sheet')) {
            return 'BunnyMo Quicksheet Format';
        }
        
        if (name.includes('fullsheet injection') || name.includes('full sheet injection')) {
            return 'BunnyMo Fullsheet Injection';
        }
        
        if (name.includes('tagsheet injection') || name.includes('tag sheet injection')) {
            return 'BunnyMo Tagsheet Injection';
        }
        
        if (name.includes('quicksheet injection') || name.includes('quick sheet injection')) {
            return 'BunnyMo Quicksheet Injection';
        }
        
        // Default fallback to character injection
        return 'Character Data Injection';
    }
    
    setup_events() {
        // Template selector change
        this.$selector.off('change.carrottemplate').on('change.carrottemplate', () => {
            this.selectedTemplate = this.$selector.val();
            this.load_template_into_interface();
        });
        
        // Save template
        $('#save_template').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.save_current_template();
        });
        
        // Preview template
        $('#preview_template_prompt').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.preview_current_template();
        });
        
        // Duplicate template
        $('#duplicate_template').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.duplicate_current_template();
        });
        
        // Delete template
        $('#delete_template').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.delete_current_template();
        });
        
        // Reset template
        $('#restore_default_template').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.reset_current_template();
        });
        
        // Add new macro
        $('#add_macro').off('click.carrottemplate').on('click.carrottemplate', () => {
            this.add_new_macro();
        });
        
        // Toggle macro section
        $('.open_macros').off('click.carrottemplate').on('click.carrottemplate', () => {
            $('.toggle-macro').toggle();
        });
        
        // Don't update macros based on template content - show all macros always
        this.$prompt.off('input.carrotmacro').on('input.carrotmacro', () => {
            this.detectMacrosFromTemplate();
            // Removed: this.update_macros(); - we want consistent macro display
        });
    }
    
    add_new_macro() {
        const macroName = prompt('Enter macro name (e.g., MY_CUSTOM_MACRO):');
        if (!macroName) return;
        
        // Validate macro name format
        if (!/^[A-Z][A-Z_0-9]*$/.test(macroName)) {
            alert('Macro names must be uppercase with underscores only (e.g., MY_MACRO)');
            return;
        }
        
        if (this.macros[macroName]) {
            alert(`Macro "${macroName}" already exists`);
            return;
        }
        
        // Create new macro
        const newMacro = {
            name: macroName,
            enabled: true,
            type: 'simple',
            format: false,
            default: false
        };
        
        this.macros[macroName] = newMacro;
        this.create_macro_interface(newMacro);
    }
    
    save_current_template() {
        const templateKey = this.$selector.val();
        if (!templateKey) {
            toastr.warning('Please select a template first');
            return;
        }
        
        const isPrimary = this.$template_role.prop('checked');
        
        // Ensure we have fresh references to DOM elements
        if (!this.$template_depth || !this.$template_depth.length) {
            this.$template_depth = $('#template_depth');
        }
        if (!this.$template_scan || !this.$template_scan.length) {
            this.$template_scan = $('#template_scan');
        }
        
        // Get depth value directly from DOM if reference fails
        const depthValue = this.$template_depth?.val() || $('#template_depth').val() || 4;
        const scanValue = this.$template_scan?.prop('checked') !== false || $('#template_scan').prop('checked') !== false;
        
        
        const template = {
            label: this.templateManager.getTemplate(templateKey)?.label || templateKey,
            content: this.$prompt.val(),
            role: this.$template_type.val(),
            category: this.$template_category.val(),
            depth: parseInt(depthValue),
            scan: scanValue,
            variables: this.extractVariables(this.$prompt.val()),
            isDefault: false,
            isPrimary: isPrimary,
            metadata: {
                ...this.templateManager.getTemplate(templateKey)?.metadata,
                is_primary: isPrimary,
                modified: Date.now()
            }
        };
        
        this.templateManager.setTemplate(templateKey, template);
        toastr.success('Template saved successfully!');
    }
    
    extractVariables(content) {
        const variables = [];
        const variableRegex = /\{\{([^}]+)\}\}/g;
        let match;
        
        while ((match = variableRegex.exec(content)) !== null) {
            const variable = match[1].trim();
            if (!variables.includes(variable)) {
                variables.push(variable);
            }
        }
        
        return variables;
    }
    
    preview_current_template() {
        const content = this.$prompt.val();
        if (!content) {
            toastr.warning('No content to preview');
            return;
        }
        
        // Use CarrotKernel's real macro processing system
        let preview = CarrotTemplateManager.processMacros(content);
        
        // Show preview in CarrotKernel popup
        const previewHtml = `
            <div style="max-height: 500px; overflow-y: auto; white-space: pre-wrap; 
                        background: #f8f9fa; padding: 15px; border-radius: 5px; 
                        font-family: monospace; font-size: 12px; line-height: 1.4;">
                ${preview}
            </div>
        `;
        
        CarrotKernel.showPopup('Template Preview', previewHtml);
    }
    
    duplicate_current_template() {
        const templateKey = this.$selector.val();
        if (!templateKey) {
            toastr.warning('Please select a template first');
            return;
        }
        
        const newName = prompt('Enter name for duplicated template:', `${templateKey}_copy`);
        if (!newName || newName === templateKey) return;
        
        const template = this.templateManager.getTemplate(templateKey);
        const duplicated = {
            ...template,
            label: `${template.label || templateKey} (Copy)`,
            isDefault: false
        };
        
        this.templateManager.setTemplate(newName, duplicated);
        this.init_templates();
        this.$selector.val(newName);
        this.selectedTemplate = newName;
        this.load_template_into_interface();
        
        toastr.success('Template duplicated successfully!');
    }
    
    delete_current_template() {
        const templateKey = this.$selector.val();
        if (!templateKey) {
            toastr.warning('Please select a template first');
            return;
        }
        
        const template = this.templateManager.getTemplate(templateKey);
        if (template?.isDefault) {
            toastr.error('Cannot delete default templates');
            return;
        }
        
        if (!confirm(`Delete template "${template?.label || templateKey}"?`)) {
            return;
        }
        
        this.templateManager.deleteTemplate(templateKey);
        
        this.init_templates();
        this.$selector.val('');
        this.selectedTemplate = null;
        this.$prompt.val('');
        this.$definitions.empty();
        
        toastr.success('Template deleted successfully!');
    }
    
    reset_current_template() {
        const templateKey = this.$selector.val();
        if (!templateKey) {
            toastr.warning('Please select a template first');
            return;
        }
        
        if (!confirm('Reset template to default?')) {
            return;
        }
        
        if (this.templateManager.resetTemplate(templateKey)) {
            this.load_template_into_interface();
            toastr.success('Template reset to default!');
        } else {
            toastr.error('No default available for this template');
        }
    }

}

// Close the main CarrotKernel object
};

// =============================================================================
// BABY BUNNY MODE MESSAGE BUTTON (following qvink_memory pattern)
// =============================================================================

function initialize_baby_bunny_message_button() {
    // Add the message button to the chat messages
    console.log("🐰 Initializing message button")

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

        console.log('🐰 Baby Bunny button clicked for message:', message_id);

        // Debug: Log message info
        console.log('🐰 Debugging message lookup:', {
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
            console.warn('🐰 Could not find message in chat array after trying all methods');
            toastr.warning('Could not find message to process.');
            return;
        }

        console.log('🐰 Manual Baby Bunny Mode triggered - processing message as character sheet');
        toastr.success('🐰 Processing message with Baby Bunny Mode...');

        // Manually trigger the Baby Bunny Mode processing
        await checkForCompletedSheets(targetMessage, message_id);
    });
}

// Add Baby Bunny button to specific message (for MESSAGE_RENDERED events)
function add_baby_bunny_button_to_message(messageId) {
    console.log(`🐰 Adding button to message ${messageId}`);

    // Find the specific message by mesid attribute
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length === 0) {
        console.log(`🐰 Message ${messageId} not found in DOM`);
        return;
    }

    const extraButtons = messageElement.find('.mes_buttons .extraMesButtons');
    if (extraButtons.length === 0) {
        console.log(`🐰 No extraMesButtons found in message ${messageId}`);
        return;
    }

    // Check if button already exists
    if (extraButtons.find(`.${baby_bunny_button_class}`).length > 0) {
        console.log(`🐰 Button already exists in message ${messageId}`);
        return;
    }

    // Add the button
    let html = `<div title="🐰 Manual Baby Bunny Mode - Process this message as a character sheet" class="mes_button ${baby_bunny_button_class}" tabindex="0">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.097.298a2.19 2.19 0 0 0-2.145.687a4.03 4.03 0 0 0-.735 3.981c.534 1.742 1.517 4.657 2.264 6.743c.044.12.157.2.284.201h8.094a.31.31 0 0 0 .272-.19c.249-.627.533-1.362.83-2.144a.26.26 0 0 0-.107-.308a5.8 5.8 0 0 1-1.327-1.185a10.4 10.4 0 0 1-2.3-3.851a.1.1 0 0 0-.07-.024a.07.07 0 0 0-.071.06c-.225.912-.77 3.222-1.043 4.443a.31.31 0 0 1-.296.237a.284.284 0 0 1-.285-.237c-.438-2.086-.948-4.432-1.315-5.842C9.602.96 8.654.439 8.097.297m11.755 8.627a1.67 1.67 0 0 0 1.244-2.37a9.36 9.36 0 0 0-3.496-4.16a5.3 5.3 0 0 0-2.133-.532c-.533 0-.983.142-1.125.568c-.439 1.185 1.185 3.875 2.145 4.954a4.18 4.18 0 0 0 3.365 1.54M2.74 14.873c0 .654.531 1.185 1.186 1.185h2.192a.32.32 0 0 1 .225.094a.3.3 0 0 1 .071.237l-.794 5.522a1.6 1.6 0 0 0 .427 1.327c.349.339.817.526 1.303.522h8.177a1.85 1.85 0 0 0 1.303-.521c.356-.345.527-.837.462-1.328l-.794-5.522a.3.3 0 0 1 .071-.237a.32.32 0 0 1 .226-.094h2.488a1.185 1.185 0 1 0 0-2.37H3.878a1.185 1.185 0 0 0-1.137 1.185"/>
        </svg>
    </div>`;
    extraButtons.prepend(html);

    console.log(`🐰 ✅ Button added to message ${messageId}`);
}

// Add Baby Bunny buttons to all existing messages (called on extension load)
function add_baby_bunny_buttons_to_all_existing_messages() {
    console.log('🐰 Adding Baby Bunny buttons to all existing messages...');

    const allMessages = $("#chat .mes");
    console.log(`🐰 Found ${allMessages.length} existing messages to process`);

    let addedCount = 0;
    allMessages.each(function() {
        const messageId = $(this).attr("mesid");
        if (messageId) {
            add_baby_bunny_button_to_message(messageId);
            addedCount++;
        }
    });

    console.log(`🐰 ✅ Added Baby Bunny buttons to ${addedCount} existing messages`);
}

// Remove all Baby Bunny buttons from messages
function remove_all_baby_bunny_buttons() {
    console.log('🐰 Removing all Baby Bunny buttons...');

    const buttons = $(`.${baby_bunny_button_class}`);
    const count = buttons.length;
    buttons.remove();

    console.log(`🐰 ✅ Removed ${count} Baby Bunny buttons`);
}


// 🥕 WB TRACKER DEBUG - WORLD INFO ENTRY TRIGGER DEBUGGING
console.log('🥕 WB TRACKER DEBUG: Setting up world info trigger debugging...');

document.addEventListener('click', function(e) {
    // Log ALL clicks to see what's happening
    console.log('🥕 WB TRACKER DEBUG: Click detected on element:', {
        tagName: e.target.tagName,
        className: e.target.className,
        classList: Array.from(e.target.classList),
        hasCarrotClass: e.target.classList.contains('fa-carrot'),
        id: e.target.id,
        textContent: e.target.textContent?.substring(0, 50)
    });

    // Check for carrot icon - either fa-carrot class OR ck-trigger with carrot emoji
    const isCarrotIcon = e.target.classList.contains('fa-carrot') ||
                        (e.target.classList.contains('ck-trigger') && e.target.textContent?.includes('🥕'));

    if (isCarrotIcon) {
        console.log('🥕 WORLDBOOK TRACKER: Carrot clicked - trying to open WorldBook tracker panel...');

        // Check if CarrotKernel has a function to open the tracker
        console.log('🥕 TRACKER DEBUG: Checking for CarrotKernel tracker functions...');
        const carrotFunctions = {
            CarrotKernel: typeof window.CarrotKernel,
            openTracker: typeof window.CarrotKernel?.openTracker,
            showTracker: typeof window.CarrotKernel?.showTracker,
            openWorldBookTracker: typeof window.CarrotKernel?.openWorldBookTracker,
            showWorldBookTracker: typeof window.CarrotKernel?.showWorldBookTracker,
            popup: typeof window.CarrotKernel?.showPopup
        };
        console.log('🥕 TRACKER DEBUG: Available CarrotKernel functions:', carrotFunctions);

        // Try to find and call the tracker opening function
        if (window.CarrotKernel) {
            console.log('🥕 TRACKER DEBUG: CarrotKernel object found, trying to open tracker...');

            // Method 1: Try showPopup with proper parameters
            if (window.CarrotKernel.showPopup) {
                console.log('🥕 TRACKER OPEN: Trying CarrotKernel.showPopup with proper parameters...');
                try {
                    // Call showPopup with title and content parameters
                    window.CarrotKernel.showPopup('WorldBook Tracker', '<div class="worldbook-tracker">Loading tracker...</div>');
                    console.log('✅ TRACKER OPEN: showPopup called successfully');
                } catch (error) {
                    console.log('❌ TRACKER OPEN: showPopup failed:', error);
                }
            }

            // Method 2: Try openTracker
            if (window.CarrotKernel.openTracker) {
                console.log('🥕 TRACKER OPEN: Trying CarrotKernel.openTracker...');
                try {
                    window.CarrotKernel.openTracker();
                    console.log('✅ TRACKER OPEN: openTracker called successfully');
                } catch (error) {
                    console.log('❌ TRACKER OPEN: openTracker failed:', error);
                }
            }

            // Method 3: Try direct popup call with tracker content
            if (window.CarrotKernel.showPopup && window.CarrotKernel.generateTrackerHTML) {
                console.log('🥕 TRACKER OPEN: Trying to generate and show tracker HTML...');
                try {
                    const trackerHTML = window.CarrotKernel.generateTrackerHTML();
                    window.CarrotKernel.showPopup('WorldBook Tracker', trackerHTML);
                    console.log('✅ TRACKER OPEN: Tracker HTML generated and shown');
                } catch (error) {
                    console.log('❌ TRACKER OPEN: Tracker HTML generation failed:', error);
                }
            }

            // Method 4: Look for any CarrotKernel methods that might open the tracker
            console.log('🥕 TRACKER DEBUG: All CarrotKernel methods:', Object.getOwnPropertyNames(window.CarrotKernel));
        } else {
            console.log('❌ TRACKER DEBUG: CarrotKernel object not found on window');
        }

        // Check if the specific ck-panel tracker exists and populate it
        setTimeout(() => {
            const ckPanel = document.querySelector('.ck-panel');
            const ckContent = document.querySelector('.ck-panel .ck-content');
            const ckBadge = document.querySelector('.ck-panel .ck-header__badge');

            console.log('🥕 PANEL CHECK: ck-panel exists?', !!ckPanel);
            console.log('🥕 PANEL CHECK: ck-content exists?', !!ckContent);
            console.log('🥕 PANEL CHECK: ck-badge exists?', !!ckBadge);

            if (ckPanel && ckContent) {
                console.log('✅ PANEL FOUND: CarrotKernel tracker panel exists');
                console.log('🥕 PANEL STATUS: Badge shows:', ckBadge?.textContent);
                console.log('🥕 PANEL STATUS: Content empty?', ckContent.innerHTML.trim() === '');

                // Try to populate the tracker content
                console.log('🥕 POPULATE: Attempting to populate tracker...');

                // Check if there's a populate function
                if (window.CarrotKernel && window.CarrotKernel.populateTracker) {
                    console.log('🥕 POPULATE: Trying CarrotKernel.populateTracker...');
                    try {
                        window.CarrotKernel.populateTracker();
                        console.log('✅ POPULATE: populateTracker called');
                    } catch (error) {
                        console.log('❌ POPULATE: populateTracker failed:', error);
                    }
                }

                // Check if there's an update function
                if (window.CarrotKernel && window.CarrotKernel.updateTracker) {
                    console.log('🥕 POPULATE: Trying CarrotKernel.updateTracker...');
                    try {
                        window.CarrotKernel.updateTracker();
                        console.log('✅ POPULATE: updateTracker called');
                    } catch (error) {
                        console.log('❌ POPULATE: updateTracker failed:', error);
                    }
                }

            } else {
                console.log('❌ PANEL NOT FOUND: CarrotKernel tracker panel does not exist');
            }
        }, 300);
    }
}, true);