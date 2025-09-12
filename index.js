import { eventSource, event_types, chat, saveSettingsDebounced, chat_metadata, addOneMessage } from '../../../../script.js';
import { extension_settings, getContext, writeExtensionField, saveMetadataDebounced } from '../../../extensions.js';
import { loadWorldInfo, world_names } from '../../../world-info.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { getMessageTimeStamp } from '../../../RossAscends-mods.js';

const extensionName = 'CarrotKernel';

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
    console.log('🥕 SHEET COMMAND DEBUG: processSheetCommand called with:', sheetData);
    
    const { type, entry } = sheetData;
    
    console.log('🥕 SHEET COMMAND DEBUG: Processing sheet command type:', type);
    
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
5. Use carrots when referencing or applying the character information: "🥕 Luna is wolf anthro, so she'd react protectively..."

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
            variables: template.variables || []
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
        this.saveSettings();
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
        this.saveSettings();
        CarrotDebug.ui(`Template '${template.name}' deleted successfully`);
        return true;
    },

    resetTemplate(id) {
        const defaultTemplate = this.defaultTemplates[id];
        if (!defaultTemplate) return false;

        if (extension_settings[extensionName]?.templates?.[id]) {
            delete extension_settings[extensionName].templates[id];
            this.saveSettings();
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
        this.saveSettings();
        CarrotDebug.ui(`Template '${updatedTemplate.name}' updated successfully`);
        return true;
    },

    // Compatibility method for BunnyMoTags interface
    setTemplate(id, template) {
        console.log('🥕 SETTEMPLATE DEBUG: Input template depth:', template.depth, 'full template:', template);
        
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
        
        console.log('🥕 SETTEMPLATE DEBUG: Converted template depth:', convertedTemplate.depth, 'inject_depth:', convertedTemplate.settings.inject_depth);
        
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

    saveSettings() {
        saveSettingsDebounced();
    },

    // Helper function to get currently triggered/active characters
    getTriggeredCharacters() {
        if (!lastInjectedCharacters || lastInjectedCharacters.length === 0) {
            return [];
        }
        return lastInjectedCharacters.filter(name => scannedCharacters.has(name))
            .map(name => ({ name, data: scannedCharacters.get(name) }));
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
                
                const charData = scannedCharacters.get(charName);
                if (!charData) return `Character ${charName} not found`;
                
                return generateFullSheet(charName, charData);
            },
            
            'TAGSHEET_FORMAT': (charName) => {
                if (!charName && CarrotTemplateManager.getTriggeredCharacters().length > 0) {
                    charName = CarrotTemplateManager.getTriggeredCharacters()[0].name;
                }
                if (!charName) return 'No character specified for tagsheet format';
                
                const charData = scannedCharacters.get(charName);
                if (!charData) return `Character ${charName} not found`;
                
                return generateTagSheet(charName, charData);
            },
            
            'QUICKSHEET_FORMAT': (charName) => {
                if (!charName && CarrotTemplateManager.getTriggeredCharacters().length > 0) {
                    charName = CarrotTemplateManager.getTriggeredCharacters()[0].name;
                }
                if (!charName) return 'No character specified for quicksheet format';
                
                const charData = scannedCharacters.get(charName);
                if (!charData) return `Character ${charName} not found`;
                
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
    injectionDepth: 4, // GuidedGenerations uses 4 consistently
    injectionRole: 'system',
    maxCharactersShown: 6,
    debugMode: false,
    filterFromContext: true  // Hide BunnyMoTags from AI context (like ST's reasoning system)
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
    
    // Reset character_consistency template to show updated default prompt
    CarrotTemplateManager.resetTemplateToDefault('character_consistency');
    
    // Ensure all default properties exist
    Object.keys(defaultSettings).forEach(key => {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    });
    
    // Restore lorebook sets from settings
    selectedLorebooks.clear();
    if (extension_settings[extensionName].selectedLorebooks) {
        extension_settings[extensionName].selectedLorebooks.forEach(book => selectedLorebooks.add(book));
    }
    
    characterRepoBooks.clear();
    if (extension_settings[extensionName].characterRepoBooks) {
        extension_settings[extensionName].characterRepoBooks.forEach(book => characterRepoBooks.add(book));
    }
    
    CarrotDebug.repo('Settings loaded', {
        selectedLorebooks: selectedLorebooks.size,
        characterRepos: characterRepoBooks.size
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
            const charData = scannedCharacters.get(charName);
            if (charData) {
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
            const charData = scannedCharacters.get(charName);
            if (charData) {
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

    charactersToShow.forEach(charName => {
        const charData = scannedCharacters.get(charName);
        
        if (charData) {
            renderedCharacters++;
            
            // Add collapsible character section with simple HTML details/summary
            content += `<details open style="margin-bottom: 12px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 8px; display: block;">`;
            content += `<summary style="cursor: pointer !important; font-weight: bold !important; color: var(--SmartThemeBodyColor) !important; font-size: 1.1em !important; text-shadow: 0 0 8px currentColor !important; margin-bottom: 8px !important; list-style: none !important; display: list-item !important; list-style-type: none !important;">🏷️ ${charName}</summary>`;
            content += `<div class="character-tags-content" style="display: block;">`;
            
            // Debug the character data structure
            CarrotDebug.ui(`🔍 DEBUG: Character data for ${charName}`, {
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
                CarrotDebug.ui(`🔧 Converting tags object to Map for ${charName}`);
                tagsToProcess = new Map(Object.entries(tagsToProcess || {}));
            }
            
            // Create BunnyMoTags-style grouped sections (EXACT copy of BunnyMoTags grouping)
            const groupedSections = createBunnyMoTagsStyleSections(tagsToProcess);
            content += groupedSections;
            
            content += `</div></details>`;
            
            CarrotDebug.ui(`Rendered character data: ${charName}`, {
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
        <details class="mes_reasoning_details" data-state="done" data-type="manual" ${openAttr}>
            <summary class="mes_reasoning_summary flex-container">
                <div class="mes_reasoning_header_block flex-container">
                    <div class="mes_reasoning_header flex-container">
                        <span class="mes_reasoning_header_title" style="color: var(--SmartThemeQuoteColor);">🥕 BunnyMoTags</span>
                        <div class="mes_reasoning_arrow fa-solid fa-chevron-up"></div>
                    </div>
                </div>
            </summary>
            <div class="mes_reasoning">
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
                    
                    // Mark the message properly
                    messageElement.classList.add('reasoning');
                    messageElement.setAttribute('data-reasoning-state', 'done');
                    
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
        console.log('🧠 CARROT DEBUG: About to call renderAsThinkingBox with:', injectedCharacters);
        CarrotDebug.ui('🧠 DISPLAY: Rendering thinking box');
        renderedContent = renderAsThinkingBox(injectedCharacters);
        console.log('🧠 CARROT DEBUG: renderAsThinkingBox returned:', {
            contentLength: renderedContent?.length,
            hasContent: !!renderedContent,
            content: renderedContent
        });
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
        
        console.log('🎯 CARROT DEBUG: DOM injection details:', {
            contentLength: renderedContent.length,
            lastMessageExists: !!lastMessage,
            totalMessages: allMessages.length,
            lastMessageId: lastMessage?.getAttribute('mesid'),
            content: renderedContent.substring(0, 200) + '...'
        });
        
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
            const existing = lastMessage.querySelector('.carrot-reasoning-details, .mes_reasoning_details[data-type="manual"], .carrot-cards-container');
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
                console.log('🎯 CARROT DEBUG: Inserting HTML before mesText element');
                mesText.insertAdjacentHTML('beforebegin', renderedContent);
                console.log('✅ CARROT DEBUG: HTML insertion completed, checking if element exists in DOM');
                
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
                
                // Verify the thinking block was actually added (look for ST's native reasoning class)
                const insertedElement = lastMessage.querySelector('.mes_reasoning_details[data-type="manual"]');
                console.log('🔍 CARROT DEBUG: Verification - ST-native thinking block element found:', !!insertedElement);
                if (insertedElement) {
                    console.log('📏 CARROT DEBUG: Thinking block dimensions:', {
                        offsetHeight: insertedElement.offsetHeight,
                        offsetWidth: insertedElement.offsetWidth,
                        display: getComputedStyle(insertedElement).display,
                        visibility: getComputedStyle(insertedElement).visibility
                    });
                    
                    // Mark the message as having reasoning for ST's native system
                    lastMessage.classList.add('reasoning');
                    lastMessage.setAttribute('data-reasoning-state', 'done');
                    
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
            console.log('🧠 CARROT DEBUG: Storing thinking block data:', characterNames);
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
    
    const characterName = entry.comment || entry.key?.[0] || 'Unknown';
    console.log('🔍 CARROT DEBUG: Extracting character from entry:', {
        entryComment: entry.comment,
        entryKey: entry.key,
        extractedName: characterName,
        entryTitle: entry.title || entry.comment
    });
    
    const character = {
        name: characterName,
        tags: {},
        source: entry.world,
        uid: entry.uid
    };
    
    // Parse BunnyMoTags from the entry content (FIX: correct case-sensitive matching)
    console.log('🔍 CARROT DEBUG: Entry content preview:', entry.content.substring(0, 200));
    
    // Try both case variations to be safe
    const bunnyTagsMatch = entry.content.match(/<BunnyMoTags>(.*?)<\/BunnyMoTags>/s) || 
                          entry.content.match(/<BunnymoTags>(.*?)<\/BunnymoTags>/s);
    
    if (bunnyTagsMatch) {
        const tagsContent = bunnyTagsMatch[1];
        console.log('🔍 CARROT DEBUG: Found BunnyMoTags content:', tagsContent.substring(0, 100));
        
        const tagMatches = tagsContent.match(/<([^:>]+):([^>]+)>/g);
        
        if (tagMatches) {
            console.log('🔍 CARROT DEBUG: Found tag matches:', tagMatches);
            
            tagMatches.forEach(tagMatch => {
                const match = tagMatch.match(/<([^:>]+):([^>]+)>/);
                if (match) {
                    const category = match[1].toUpperCase().trim(); // Keep original case for display
                    const value = match[2].trim();
                    
                    if (!character.tags[category]) {
                        character.tags[category] = [];
                    }
                    character.tags[category].push(value);
                    
                    console.log(`🔍 CARROT DEBUG: Added tag - ${category}: ${value}`);
                }
            });
        } else {
            console.log('⚠️ CARROT DEBUG: BunnyMoTags block found but no individual tags matched');
        }
    } else {
        console.log('⚠️ CARROT DEBUG: No BunnyMoTags block found in entry content');
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
    console.log('🔧 CARDS EMERGENCY DEBUG: Function called', { messageIndex, characterData });
    
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
    console.log('🚨 DEBUG appendChild: container.appendChild(accentLayer)', { container, accentLayer });
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
    console.log('🚨 DEBUG appendChild: header.appendChild(headerTitle)', { header, headerTitle });
    header.appendChild(headerTitle);
    console.log('🚨 DEBUG appendChild: header.appendChild(headerInfo)', { header, headerInfo });
    header.appendChild(headerInfo);
    console.log('🚨 DEBUG appendChild: header.appendChild(toggleButton)', { header, headerTitle, headerInfo, toggleButton });
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
        console.log('🚨 DEBUG appendChild: tabNavigation.appendChild(tabButton)', { tabNavigation, tabButton, tabId: tab.id });
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
    
    console.log('🚨 DEBUG appendChild: collapsibleContent.appendChild(tabNavigation)', { collapsibleContent, tabNavigation });
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
        console.log('🚨 DEBUG appendChild: contentContainer.appendChild(tabContent)', { contentContainer, tabContent, tabId: tab.id });
        contentContainer.appendChild(tabContent);
        tabContents[tab.id] = tabContent; // Store reference
    });
    
    // Process characters and organize by tabs - show first character initially
    console.log(`[BMT CARDS] Creating tabbed interface for ${characters.length} characters`);
    console.log(`[BMT CARDS] First character data:`, characters[0]);
    
    if (characters.length > 0) {
            // Characters from our system have different format - need to convert
        const firstChar = characters[0];
        
        // Check if it's already a proper character object or just a name
        let formattedChar;
        if (typeof firstChar === 'string') {
            // It's just a character name, need to get data from scannedCharacters
            const charData = scannedCharacters.get(firstChar);
            if (charData) {
                formattedChar = {
                    name: firstChar,
                    tags: charData.tags instanceof Map ? Object.fromEntries(charData.tags) : charData.tags
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
        
        console.log(`[BMT CARDS] Formatted character:`, formattedChar);
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

    console.log('🚨 DEBUG appendChild: mainContent.appendChild(header)', { mainContent, header });
    mainContent.appendChild(header);
    console.log('🚨 DEBUG appendChild: mainContent.appendChild(collapsibleContent)', { mainContent, collapsibleContent });
    mainContent.appendChild(collapsibleContent);
    console.log('🚨 DEBUG appendChild: container.appendChild(mainContent)', { container, mainContent });
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
        console.log(`[BMT CARDS] Already showing ${character.name}, skipping refresh`);
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
                console.log(`[BMT CARDS] MBTI MATCH: "${tag}" -> "${category}"`);
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
                console.log(`[BMT CARDS] Added "${displayTag}" to "${category}"`);
            } else {
                console.log(`[BMT CARDS] SKIPPING "${tag}" - category "${category}" not available for ${tabType} tab and no Other section`);
            }
        });
    });
    
    // DEBUG: Log final organization
    console.log(`[BMT CARDS] Final organized tags for ${tabType}:`, organizedTags);
    
    // Create sections for each category that has tags
    Object.entries(organizedTags).forEach(([categoryName, categoryTags]) => {
        if (categoryTags.length === 0) return;
        
        console.log(`[BMT CARDS] Creating section for category: ${categoryName} with ${categoryTags.length} tags:`, categoryTags);
        
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
    console.log(`[BMT CARDS] Selected theme for category "${categoryName}":`, theme);
    
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
            console.log(`[BMT SYSTEM] Searching WorldBook for tag: ${tag}`);
            
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
            console.log(`[BMT SYSTEM] WorldBook search not available for tag: ${tag}`);
            
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
    
    // Extract the BunnyMoTags content
    let content = mesText.innerHTML;
    const bunnyTagsMatch = content.match(/&lt;BunnyMoTags&gt;([\s\S]*?)&lt;\/BunnyMoTags&gt;/);
    
    if (!bunnyTagsMatch) return;
    
    const tagsContent = bunnyTagsMatch[1];
    const parsedCharacters = parseBunnyMoTagsContent(tagsContent);
    
    // Also extract Linguistics blocks and add to character data
    const linguisticsMatch = content.match(/&lt;linguistics&gt;([\s\S]*?)&lt;\/linguistics&gt;/i);
    if (linguisticsMatch && parsedCharacters.length > 0) {
        const linguisticsContent = linguisticsMatch[1].trim();
        
        // Extract LING: tags from the description
        const lingMatches = linguisticsContent.match(/&lt;LING:([^&]+)&gt;/g);
        if (lingMatches) {
            // Add extracted LING tags to the first character
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
    
    // Replace the raw tags with the rendered block
    content = content.replace(bunnyTagsMatch[0], reasoningBlock);
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

// Initialize extension
jQuery(async () => {
    try {
        console.log('🚨 CARROT KERNEL LOADING - NEW CODE VERSION! 🚨');
        CarrotDebug.init('Starting CarrotKernel initialization...');
        
        // Initialize context and storage managers first
        CarrotContext = new CarrotContextManager();
        await CarrotContext.initialize();
        
        CarrotStorage = new CarrotStorageManager(CarrotContext);
        
        // Initialize settings
        initializeSettings();
        
        // Load settings HTML
        const settingsHtml = await $.get(`scripts/extensions/third-party/${extensionName}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        
        // Update lorebook list
        updateLorebookList();
        
        // Bind settings events
        bindSettingsEvents();
        
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
            
            // ALWAYS log this event, even if disabled, to debug activation issues
            console.log('🔥 CARROT DEBUG: WORLD_INFO_ACTIVATED fired with', entryList?.length || 0, 'entries');
            console.log('🔥 CARROT DEBUG: Settings enabled:', settings.enabled, 'Display mode:', settings.displayMode);
            console.log('🔥 CARROT DEBUG: Entry list:', entryList);
            
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
        
        // Hook into CHARACTER_MESSAGE_RENDERED to display thinking blocks and add persistent tags
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            const settings = extension_settings[extensionName];
            
            // CHARACTER_MESSAGE_RENDERED fires for AI messages, but we only want to show cards 
            // when we have pending data from a previous user message that triggered WORLD_INFO_ACTIVATED
            const message = chat.find(msg => msg.index === messageId);
            
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
                    const existingThinkingBlock = document.querySelector(`[mesid="${messageId}"] .mes_reasoning_details[data-type="manual"]`);
                    
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
        });
        
        // Hook into CHAT_CHANGED to restore thinking blocks after page refresh/chat switch
        eventSource.on(event_types.CHAT_CHANGED, async () => {
            const settings = extension_settings[extensionName];
            
            if (!settings.enabled || settings.displayMode !== 'thinking') return;
            
            CarrotDebug.ui('📝 CHAT_CHANGED: Checking for thinking blocks to restore');
            
            // Wait a moment for chat to fully load, then restore thinking blocks
            setTimeout(() => {
                restoreThinkingBlocksFromChat();
            }, 500);
        });
        
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
    // Disable/enable all CarrotKernel UI elements
    const uiElements = [
        '#carrot_send_to_ai',
        '#carrot_display_mode', 
        '#carrot_auto_expand',
        '#carrot_debug_mode',
        '#carrot_injection_depth',
        '#carrot_max_characters',
        '#carrot-scan-btn',
        '#carrot-test-display',
        '.carrot-lorebook-toggle',
        '.carrot-repo-btn',
        '#carrot-search-lorebooks'
    ];
    
    uiElements.forEach(selector => {
        $(selector).prop('disabled', !isEnabled);
    });
    
    // Add visual indication to the entire settings panel
    if (isEnabled) {
        $('#carrot_settings').removeClass('carrot-disabled');
        CarrotDebug.ui('UI elements ENABLED');
    } else {
        $('#carrot_settings').addClass('carrot-disabled');
        
        // Clear all existing character displays when disabled
        document.querySelectorAll('.carrot-reasoning-details, .carrot-cards-container').forEach(el => {
            el.remove();
        });
        
        // Clear scanned character data
        scannedCharacters.clear();
        
        CarrotDebug.ui('UI elements DISABLED and data cleared');
    }
}

// Bind all settings UI events
function bindSettingsEvents() {
    const settings = extension_settings[extensionName];
    
    // Master enable toggle
    $('#carrot_enabled').prop('checked', settings.enabled).on('change', function() {
        const isEnabled = Boolean($(this).prop('checked'));
        extension_settings[extensionName].enabled = isEnabled;
        
        // Apply master enable state
        applyMasterEnableState(isEnabled);
        
        // Update status panels
        updateStatusPanels();
        
        saveSettingsDebounced();
        CarrotDebug.setting('masterEnable', !isEnabled, isEnabled);
    });
    
    // Display mode
    $('#carrot_display_mode').val(settings.displayMode).on('change', function() {
        extension_settings[extensionName].displayMode = String($(this).val());
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
    
    // Filter from context
    $('#carrot_filter_context').prop('checked', settings.filterFromContext).on('change', function() {
        const newValue = Boolean($(this).prop('checked'));
        CarrotDebug.setting('filterFromContext', settings.filterFromContext, newValue);
        extension_settings[extensionName].filterFromContext = newValue;
        saveSettingsDebounced();
    });
    
    // Injection depth
    $('#carrot_injection_depth').val(settings.injectionDepth).on('change', function() {
        extension_settings[extensionName].injectionDepth = parseInt($(this).val()) || 4;
        saveSettingsDebounced();
    });
    
    
    // Max characters
    $('#carrot_max_characters').val(settings.maxCharactersShown).on('change', function() {
        extension_settings[extensionName].maxCharactersShown = parseInt($(this).val()) || 6;
        saveSettingsDebounced();
    });
    
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
    
    // Add loadout manager status card (4th card next to System Status, Character Repository, AI Injection)
    addLoadoutManagerCard();
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
                        
                        <div class="carrot-status-panel carrot-status-tutorial carrot-clickable" 
                             data-context="tutorial" 
                             data-tooltip="Click to open comprehensive tutorial about Character vs Chat settings"
                             onclick="openLoadoutTutorial()">
                            <div class="carrot-status-icon">
                                <i class="fa-solid fa-graduation-cap"></i>
                            </div>
                            <div class="carrot-status-content">
                                <div class="carrot-status-title">Loadout Tutorial</div>
                                <div class="carrot-status-value">Character vs Chat</div>
                                <div class="carrot-status-detail">Click to learn the differences</div>
                            </div>
                            <div class="carrot-status-indicator info">
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

        console.log('🥕 LOADOUT DEBUG: Simplified event binding completed (using inline onclick for context switching)');
        CarrotDebug.ui('Loadout manager events bound successfully');
    }, 100);
}

// Switch context in loadout manager
async function switchLoadoutContext(selectedContext, context, currentSettings) {
    console.log(`🥕 LOADOUT DEBUG: Switching to context: ${selectedContext}`);
    
    // Check if clicking the same active context (deselection)
    const contextCards = document.querySelectorAll('.carrot-status-panel[data-context="character"], .carrot-status-panel[data-context="chat"]');
    const currentActiveCard = document.querySelector('.carrot-status-panel.active[data-context]');
    const isDeselecting = currentActiveCard && currentActiveCard.dataset.context === selectedContext;
    
    console.log(`🥕 LOADOUT DEBUG: Found ${contextCards.length} context cards, deselecting: ${isDeselecting}`);
    
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
                console.log(`🥕 LOADOUT DEBUG: Activated card for context: ${selectedContext}`);
            }
        }
    });
    
    // If deselecting, use global/default settings and update interface
    if (isDeselecting) {
        updateLoadoutInterface('global', currentSettings, context);
        updateLoadoutsDisplay(context);
        console.log(`🥕 LOADOUT DEBUG: Deselected context, reverted to global settings`);
        CarrotDebug.ui('Deselected context - reverted to default settings');
        return;
    }

    // Get context-specific settings
    let contextSettings;
    switch (selectedContext) {
        case 'character':
            contextSettings = await CarrotStorage.getSettingsAt('character') || currentSettings;
            console.log(`🥕 LOADOUT DEBUG: Character settings loaded:`, contextSettings);
            break;
        case 'chat':
            contextSettings = await CarrotStorage.getSettingsAt('chat') || currentSettings;
            console.log(`🥕 LOADOUT DEBUG: Chat settings loaded:`, contextSettings);
            break;
        default:
            contextSettings = currentSettings;
            console.log(`🥕 LOADOUT DEBUG: Using default settings for context: ${selectedContext}`);
            break;
    }

    // Update the interface content for the selected context
    updateLoadoutInterface(selectedContext, contextSettings, context);
    
    console.log(`🥕 LOADOUT DEBUG: Interface updated for context: ${selectedContext}`);
    CarrotDebug.ui(`Switched loadout context to: ${selectedContext}`);
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
                <input type="checkbox" id="carrot_context_enabled" checked>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">CarrotKernel Enabled</span>
            </label>
            <div class="carrot-help-text">Enable CarrotKernel for this ${contextMode}</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_ai_injection" checked>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">AI Injection</span>
            </label>
            <div class="carrot-help-text">Send character data to AI context for consistency</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-label">
                <span class="carrot-label-text">Display Mode</span>
                <span class="carrot-label-hint">How to show injected character data</span>
            </label>
            <select id="carrot_context_display_mode" class="carrot-select">
                <option value="none">No Display</option>
                <option value="thinking" selected>Thinking Box Style</option>
                <option value="cards">Character Cards</option>
            </select>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_auto_expand">
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Auto-expand thinking boxes</span>
            </label>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_filter" checked>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Filter tags from AI context</span>
            </label>
            <div class="carrot-help-text">Hide BunnyMoTags from AI (like ST's reasoning system)</div>
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_scan_startup" ${currentSettings.scanOnStartup ? 'checked' : ''}>
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Auto-scan on startup</span>
            </label>
            <div class="carrot-help-text">Automatically scan lorebooks when ST loads</div>
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
    return `
        <div class="carrot-setting-item">
            <label class="carrot-label">
                <span class="carrot-label-text">Max Characters Displayed</span>
                <span class="carrot-label-hint">Limit characters shown to prevent clutter (affects both injection and display)</span>
            </label>
            <input type="number" id="carrot_context_max_characters" class="carrot-input" min="1" max="20" value="6">
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-label">
                <span class="carrot-label-text">Injection Depth</span>
                <span class="carrot-label-hint">How deep to inject character data (4 = GuidedGenerations standard)</span>
            </label>
            <input type="number" id="carrot_context_injection_depth" class="carrot-input" min="1" max="20" value="4">
        </div>
        <div class="carrot-setting-item">
            <label class="carrot-toggle">
                <input type="checkbox" id="carrot_context_debug_mode">
                <span class="carrot-toggle-slider"></span>
                <span class="carrot-toggle-label">Debug Mode</span>
            </label>
            <div class="carrot-help-text">Enable detailed console logging for this context</div>
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
                    target: '#carrot-feature-controls',
                    title: 'System Configuration',
                    content: `
                        <p>Welcome to <strong>CarrotKernel System Configuration</strong>! This panel controls the entire extension.</p>
                        <ul>
                            <li><strong>Master Enable:</strong> The main on/off switch - must be ON for all functionality</li>
                            <li><strong>AI Injection:</strong> Controls whether character data gets sent to AI context</li>
                            <li><strong>Display Mode:</strong> Choose how character data appears in your chats</li>
                            <li><strong>Debug Mode:</strong> Enables detailed logging for troubleshooting</li>
                        </ul>
                        <p><strong>💡 Tip:</strong> Start by enabling the Master Enable toggle!</p>
                    `
                },
                {
                    target: '#carrot-lorebook-management',
                    title: 'Lorebook Management',
                    content: `
                        <p>This is where you <strong>select and configure</strong> your character repositories.</p>
                        <ul>
                            <li><strong>Search:</strong> Find specific lorebooks quickly</li>
                            <li><strong>Checkbox:</strong> Enable/disable lorebooks</li>
                            <li><strong>👤/📚 Button:</strong> Mark as character repository or tag library</li>
                        </ul>
                        <p>Character repositories contain <code>&lt;BunnymoTags&gt;</code> blocks with character data.</p>
                    `
                },
                {
                    target: '#carrot-advanced-settings',
                    title: 'Advanced Settings',
                    content: `
                        <p>Fine-tune how CarrotKernel works with these <strong>Advanced Settings</strong>:</p>
                        <ul>
                            <li><strong>Max Characters:</strong> Limit how many characters are processed (prevents spam)</li>
                            <li><strong>Injection Depth:</strong> How deep to inject in AI context (4 is standard)</li>
                        </ul>
                        <p>The defaults work well for most users - only change if you understand the impact!</p>
                    `
                }
            ]
        },
        
        'repository-management': {
            title: 'Repository Management Tutorial',
            steps: [
                {
                    target: '#carrot-lorebook-management',
                    title: 'Two Types of Lorebooks',
                    content: `
                        <p><strong>CHARACTER REPOSITORIES</strong> hold individual character data with trigger names:</p>
                        <div style="background: rgba(255, 215, 0, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #ff6b35;">
                            <code>&lt;BunnymoTags&gt;&lt;NAME:Alice Cooper&gt;, &lt;SPECIES:Human&gt;, &lt;PERSONALITY:Tsundere&gt;&lt;/BunnymoTags&gt;</code>
                        </div>
                        
                        <p><strong>TAG LIBRARIES</strong> are data sources like BunnMBTI-Pack or BunnyCo-Pack:</p>
                        <div style="background: rgba(76, 175, 80, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #4caf50;">
                            <code>Contains: &lt;ELF&gt;, &lt;DWARF&gt;, &lt;TSUNDERE&gt;, &lt;INTJ&gt;, etc.</code>
                        </div>
                        
                        <p>Character repos <em>pull data</em> from tag libraries when character names are mentioned!</p>
                    `
                },
                {
                    target: '.carrot-lorebook-actions',
                    title: 'Marking Repository Types',
                    content: `
                        <p>Use the <strong>👤/📚 button</strong> to identify lorebook types:</p>
                        <ul>
                            <li><strong>👤 Character Repository:</strong> Contains characters with &lt;BunnymoTags&gt; blocks</li>
                            <li><strong>📚 Tag Library:</strong> Contains species, personality, MBTI data (like BunnMBTI-Pack, BunnyCo-Pack)</li>
                        </ul>
                        
                        <p><strong>How it works:</strong></p>
                        <ol>
                            <li>You mention "Alice" in chat</li>
                            <li>Character repo triggers and finds Alice's data</li>
                            <li>CarrotKernel pulls &lt;TSUNDERE&gt; details from BunnDere-Pack</li>
                            <li>Combined data gets injected to AI context</li>
                        </ol>
                    `
                },
                {
                    target: '.carrot-action-bar',
                    title: 'Scanning and Data Flow',
                    content: `
                        <p><strong>IMPORTANT:</strong> Select both types for complete functionality!</p>
                        <ul>
                            <li><strong>Character Repositories:</strong> Mark with 👤 - these have your characters</li>
                            <li><strong>Tag Libraries:</strong> Mark with 📚 - these provide the detailed descriptions</li>
                        </ul>
                        
                        <p>When you scan, CarrotKernel builds a database linking character names to their tag data sources. This creates the "trigger mechanism" - mentioning character names fires their associated lorebook entries!</p>
                        
                        <div style="background: rgba(255, 193, 7, 0.1); padding: 8px; border-radius: 4px; font-size: 0.9em;">
                            💡 Think of Character Repos as the <em>index</em> and Tag Libraries as the <em>encyclopedia</em>
                        </div>
                    `
                }
            ]
        },
        
        'loadout-manager': {
            title: 'Loadout Manager Tutorial',
            steps: [
                {
                    target: '#carrot-loadout-manager .carrot-status-panels',
                    title: 'Character vs Chat Settings',
                    content: `
                        <p>Welcome to <strong>CarrotKernel Loadout Manager</strong>! This lets you create context-specific settings.</p>
                        
                        <p><strong>🧑 Character Settings:</strong> Apply to ALL chats with a specific character</p>
                        <ul>
                            <li><strong>Use case:</strong> "Eliza always needs Psychology lorebook enabled"</li>
                            <li><strong>Scope:</strong> Every conversation with this character</li>
                        </ul>
                        
                        <p><strong>💬 Chat Settings:</strong> Apply ONLY to this specific conversation</p>
                        <ul>
                            <li><strong>Use case:</strong> "This medieval roleplay needs different lorebooks"</li>
                            <li><strong>Scope:</strong> This conversation only</li>
                        </ul>
                        
                        <p><strong>💡 Priority:</strong> Chat Settings > Character Settings > Global Settings</p>
                    `
                },
                {
                    target: '#carrot-loadout-manager #carrot-context-controls',
                    title: 'Context-Specific Settings',
                    content: `
                        <p>Once you select Character or Chat context, you can <strong>override global settings</strong>:</p>
                        <ul>
                            <li><strong>Toggle OFF:</strong> Disable CarrotKernel for this context</li>
                            <li><strong>AI Injection:</strong> Turn off character data injection</li>
                            <li><strong>Display Mode:</strong> Change how data appears in chats</li>
                            <li><strong>Filter Context:</strong> Hide BunnyMoTags from AI</li>
                        </ul>
                        
                        <p>These settings <strong>override</strong> your global settings when you're in this specific context.</p>
                        
                        <div style="background: rgba(255, 193, 7, 0.1); padding: 8px; border-radius: 4px;">
                            💡 <strong>Pro Tip:</strong> Most users leave settings ON and just change lorebooks per context
                        </div>
                    `
                },
                {
                    target: '#carrot-loadout-manager #carrot-context-lorebooks',
                    title: 'Context-Specific Lorebooks',
                    content: `
                        <p>This is the <strong>main power</strong> of the Loadout Manager - different lorebooks per context!</p>
                        
                        <p><strong>Examples:</strong></p>
                        <ul>
                            <li><strong>Character "Eliza":</strong> Always enable Psychology + Therapy lorebooks</li>
                            <li><strong>Medieval Chat:</strong> Enable Medieval + Fantasy lorebooks for this roleplay</li>
                            <li><strong>Sci-fi Chat:</strong> Enable Space + Technology lorebooks for this story</li>
                        </ul>
                        
                        <p>Select different lorebooks here, then <strong>save your profile</strong> - CarrotKernel will auto-load these when you enter this context!</p>
                        
                        <div style="background: rgba(76, 175, 80, 0.1); padding: 8px; border-radius: 4px;">
                            ✅ <strong>This replaces</strong> manually enabling/disabling lorebooks every time you switch contexts
                        </div>
                    `
                },
                {
                    target: '#carrot-loadout-manager #carrot-profile-management',
                    title: 'Profile Management & Templates',
                    content: `
                        <p><strong>Save your configurations!</strong> After setting up your context:</p>
                        
                        <ol>
                            <li><strong>Save Profile:</strong> Store your custom context settings</li>
                            <li><strong>Auto-loading:</strong> Settings activate when you enter this context</li>
                            <li><strong>Export/Import:</strong> Share profiles with other users</li>
                            <li><strong>Clear Profile:</strong> Reset to global settings</li>
                        </ol>
                        
                        <div style="background: rgba(76, 175, 80, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #4caf50;">
                            <strong>🚀 Profile Templates (Quick Start):</strong><br>
                            • <strong>General Purpose:</strong> All features ON, 6 character limit, depth 4<br>
                            • <strong>Roleplay Focus:</strong> Card display mode, 10 character limit, auto-expand<br>
                            • <strong>Minimal Setup:</strong> Essential only, 3 character limit, basic injection
                        </div>
                        
                        <div style="background: rgba(76, 175, 80, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #4caf50;">
                            <strong>🎯 Current Loadout System:</strong><br>
                            • <strong>Shows current assigned loadout</strong> for this character/chat with cool blinking indicator<br>
                            • <strong>Assign Loadout:</strong> Choose which loadout should auto-apply to this context<br>
                            • <strong>None Selected:</strong> Uses default/global settings when no loadout assigned
                        </div>
                        
                        <div style="background: rgba(255, 193, 7, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #ffc107;">
                            <strong>📚 Loadout Library:</strong><br>
                            • <strong>Save Current Settings:</strong> Create named loadouts with all settings + lorebook selections<br>
                            • <strong>Quick Apply:</strong> Instantly apply any loadout to current interface<br>
                            • <strong>Manage Loadouts:</strong> Rename, copy, delete, export your saved configurations
                        </div>
                        
                        <div style="background: rgba(255, 215, 0, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #ff6b35;">
                            <strong>🚀 Complete Workflow:</strong><br>
                            1. Configure settings + select lorebooks → 2. "Save Current Settings" as named loadout → 3. "Assign Loadout" to character/chat → 4. Auto-applies when you return!
                        </div>
                        
                        <div style="background: rgba(156, 39, 176, 0.1); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #9c27b0;">
                            <strong>💡 Pro Example:</strong> Create "Medieval Roleplay" loadout with Medieval + Fantasy lorebooks. Assign to character "Eliza". Now every chat with Eliza automatically uses Medieval settings!
                        </div>
                        
                        <p><strong>True loadout assignment system - your loadouts follow contexts automatically!</strong></p>
                    `
                }
            ]
        },
        
        'injection-system': {
            title: 'AI Injection System Tutorial',
            steps: [
                {
                    target: '.carrot-status-injection',
                    title: 'How AI Injection Works',
                    content: `
                        <p>CarrotKernel automatically injects character data when mentioned in chat:</p>
                        <ul>
                            <li><strong>Detection:</strong> Scans messages for character names</li>
                            <li><strong>Injection:</strong> Sends relevant data to AI context</li>
                            <li><strong>Ephemeral:</strong> Doesn't clutter your chat history</li>
                            <li><strong>Depth 4:</strong> High priority like GuidedGenerations</li>
                        </ul>
                        <p>This ensures the AI maintains character consistency automatically!</p>
                    `
                },
                {
                    target: '#carrot_display_mode',
                    title: 'Display Modes',
                    content: `
                        <p>Choose how injected character data appears:</p>
                        <ul>
                            <li><strong>No Display:</strong> Inject silently (recommended for clean chats)</li>
                            <li><strong>Thinking Box:</strong> Show in expandable reasoning boxes</li>
                            <li><strong>Character Cards:</strong> Display as visual character cards</li>
                        </ul>
                        <p>Most users prefer "No Display" - the AI gets the data without visual clutter!</p>
                    `
                },
                {
                    target: '#carrot_injection_depth',
                    title: 'Injection Depth Explained',
                    content: `
                        <p>Injection depth controls <strong>where</strong> character data appears in AI context:</p>
                        <ul>
                            <li><strong>Depth 4:</strong> Same as GuidedGenerations (recommended)</li>
                            <li><strong>Lower depths:</strong> Higher priority, but may interfere</li>
                            <li><strong>Higher depths:</strong> Lower priority, may be ignored</li>
                        </ul>
                        <p>Depth 4 is the sweet spot - trusted by GuidedGenerations users!</p>
                    `
                }
            ]
        },
        'template-editor': {
            title: 'Template Editor Tutorial',
            steps: [
                {
                    target: '#bmt_template_selector',
                    title: 'Template Selection',
                    content: `
                        <p>Welcome to the <strong>CarrotKernel Template Editor</strong>! This is your control center for customizing AI injection templates.</p>
                        <p>The <strong>Template Selector</strong> lets you choose which template to edit. Templates control how character data is formatted when sent to the AI.</p>
                        <p>Currently, only "Character Consistency" templates are supported, but more categories will be added!</p>
                    `
                },
                {
                    target: '#template_type',
                    title: 'Template Type',
                    content: `
                        <p>The <strong>Template Type</strong> determines where your template appears in the AI context:</p>
                        <ul>
                            <li><strong>⚙️ System:</strong> High priority, appears in system context</li>
                            <li><strong>👤 Character:</strong> Character-specific context</li>
                            <li><strong>🌍 World:</strong> World/environment context</li>
                        </ul>
                        <p>Most character injection templates use "System" for maximum impact.</p>
                    `
                },
                {
                    target: '#prompt',
                    title: 'Template Content Editor',
                    content: `
                        <p>This is the heart of your template - the <strong>Template Content Editor</strong>!</p>
                        <p>Write your injection prompt here using special <strong>{{MACRO_NAME}}</strong> variables that get replaced with real data:</p>
                        <ul>
                            <li><strong>{{TRIGGERED_CHARACTER_TAGS}}</strong> - All character tags for active characters</li>
                            <li><strong>{{CHARACTER_LIST}}</strong> - Simple list of character names</li>
                            <li><strong>{{REPOSITORY_METADATA}}</strong> - Repository information</li>
                        </ul>
                        <p>The editor is resizable - drag the bottom corner to make it larger!</p>
                    `
                },
                {
                    target: '.bmt-button-group',
                    title: 'Template Actions',
                    content: `
                        <p>These buttons help you manage your templates:</p>
                        <ul>
                            <li><strong>👁️ Preview:</strong> See how your template looks with real data</li>
                            <li><strong>💾 Save:</strong> Save your changes to the template</li>
                            <li><strong>📋 Duplicate:</strong> Create a copy of this template</li>
                            <li><strong>🗑️ Delete:</strong> Remove custom templates (can't delete defaults)</li>
                            <li><strong>🔄 Reset:</strong> Restore template to default content</li>
                        </ul>
                        <p><strong>Tip:</strong> Always Preview before Save to see your changes!</p>
                    `
                },
                {
                    target: '.bmt-macro-section',
                    title: 'Macro Configuration',
                    content: `
                        <p>The <strong>Macro Configuration</strong> section shows all available macros and their settings.</p>
                        <p>Each macro can be:</p>
                        <ul>
                            <li><strong>Enabled/Disabled:</strong> Toggle the ❌/✅ button</li>
                            <li><strong>Previewed:</strong> Click the 👁️ button to see output</li>
                            <li><strong>Customized:</strong> Expand to see Simple/Advanced options</li>
                        </ul>
                        <p>Macros are automatically detected when you use <strong>{{MACRO_NAME}}</strong> in your template!</p>
                    `
                },
                {
                    target: '#template_category',
                    title: 'Template Categories',
                    content: `
                        <p>Template Categories organize templates by their function:</p>
                        <p><strong>💉 Character Data Injection</strong> templates control how character information is sent to the AI.</p>
                        <p>Future updates will add more categories like "Selected Traits Context" and "Generation Notes".</p>
                    `
                },
                {
                    target: '#template_role',
                    title: 'Primary Template Setting',
                    content: `
                        <p>The <strong>Primary Template</strong> toggle marks which template CarrotKernel uses for this category.</p>
                        <p>You can create multiple templates for the same category, but only one can be "Primary" (active).</p>
                        <p>This allows you to experiment with different templates without losing your working version!</p>
                    `
                },
                {
                    target: '#bmt_template_prompt_interface',
                    title: 'Template System Complete!',
                    content: `
                        <p><strong>🎉 Congratulations!</strong> You now understand the CarrotKernel Template System!</p>
                        <p><strong>Quick Tips:</strong></p>
                        <ul>
                            <li>Start with the default template and modify it gradually</li>
                            <li>Use Preview frequently to test your changes</li>
                            <li>Duplicate templates before major changes</li>
                            <li>Check macro documentation for examples</li>
                        </ul>
                        <p>Happy templating! Your AI interactions just got a lot more powerful! 🥕</p>
                    `
                }
            ]
        }
    },
    
    // Open system tutorial - shows basic setup and configuration tutorial
    openSystemTutorial() {
        this.startTutorial('basic-setup');
    },
    
    // Open repository tutorial - shows character repository vs tag library tutorial
    openRepositoryTutorial() {
        this.startTutorial('repository-management');
    },
    
    // Open injection tutorial - shows AI injection system tutorial
    openInjectionTutorial() {
        this.startTutorial('injection-system');
    },

    // Open loadout manager tutorial - shows character vs chat context tutorial
    openLoadoutTutorial() {
        this.startTutorial('loadout-manager');
    },

    // Open template editor tutorial - shows how to use the template system
    openTemplateEditorTutorial() {
        this.startTutorial('template-editor');
    },
    
    // Open repository manager popup with tutorial option
    openRepositoryManager() {
        const settings = extension_settings[extensionName];
        if (!settings.enabled) {
            this.showPopup('CarrotKernel Disabled', `
                <p>CarrotKernel is currently disabled. Please enable it first to manage repositories.</p>
                <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
            `);
            return;
        }
        
        const characterCount = scannedCharacters.size;
        const selectedCount = selectedLorebooks.size;
        
        let content = `
            <h4>📊 Repository Status</h4>
            <div style="background: rgba(var(--active-rgb), 0.1); padding: 16px; border-radius: 8px; margin: 12px 0;">
                <p><strong>Characters Indexed:</strong> ${characterCount}</p>
                <p><strong>Selected Lorebooks:</strong> ${selectedCount}</p>
                <p><strong>Character Repositories:</strong> ${characterRepoBooks.size}</p>
            </div>
        `;
        
        content += `
            <div style="text-align: center; margin: 16px 0;">
                <button onclick="CarrotKernel.closePopup(); CarrotKernel.openRepositoryTutorial()" style="
                    background: linear-gradient(135deg, #4caf50 0%, rgba(76, 175, 80, 0.85) 100%);
                    color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;
                    font-weight: 500; transition: all 0.3s ease; margin-right: 12px;">
                    📚 Repository Tutorial
                </button>
        `;
        
        if (characterCount === 0) {
            content += `
                <button onclick="CarrotKernel.manualScan()" style="
                    background: linear-gradient(135deg, var(--active) 0%, rgba(var(--active-rgb), 0.85) 100%);
                    color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;
                    font-weight: 500; transition: all 0.3s ease;">
                    🔍 Setup Repositories
                </button>
            </div>
            
                <h5>🚀 Getting Started</h5>
                <p>No characters indexed yet. Here's how to set up your repositories:</p>
                <ol>
                    <li>Select lorebooks in the <strong>glowing section below</strong></li>
                    <li>Mark character repositories with the 👤 button</li>
                    <li>Click <strong>"Setup Repositories"</strong> button above</li>
                </ol>
            `;
            
            // Highlight the lorebook management section
            setTimeout(() => {
                $('#carrot-lorebook-management').addClass('carrot-tutorial-highlight');
                setTimeout(() => {
                    $('#carrot-lorebook-management').removeClass('carrot-tutorial-highlight');
                }, 3000);
            }, 500);
        } else {
            content += `
                <button onclick="CarrotKernel.manualScan()" style="
                    background: linear-gradient(135deg, var(--active) 0%, rgba(var(--active-rgb), 0.85) 100%);
                    color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;
                    font-weight: 500; transition: all 0.3s ease;">
                    🔄 Rescan Repositories
                </button>
            </div>
            
                <h5>✅ Repository Active</h5>
                <p>Your character repositories are working! CarrotKernel will automatically:</p>
                <ul>
                    <li>Detect when you mention these ${characterCount} characters</li>
                    <li>Inject their data into AI context for consistency</li>
                    <li>Display results based on your chosen display mode</li>
                </ul>
            `;
        }
        
        this.showPopup('Character Repository Manager', content);
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
        this.closePopup();
        $('#carrot-scan-btn').click();
    },
    
    // Start a tutorial
    startTutorial(tutorialId) {
        if (!this.tutorials[tutorialId]) {
            CarrotDebug.error('Unknown tutorial', tutorialId);
            return;
        }
        
        this.currentTutorial = tutorialId;
        this.currentStep = 0;
        this.tutorialSteps = this.tutorials[tutorialId].steps;
        
        this.showTutorialOverlay();
        this.showTutorialStep();
    },
    
    // Get tutorial overlay - check modal context first, then document
    getTutorialOverlay() {
        CarrotDebug.tutorial('Getting tutorial overlay', {
            timestamp: Date.now(),
            location: 'getTutorialOverlay'
        });
        
        // First check if we're in a modal context
        const modal = document.querySelector('.popup:not(.popup_template)');
        CarrotDebug.tutorial('Modal context check', {
            modalExists: !!modal,
            modalSelector: '.popup:not(.popup_template)',
            allPopups: document.querySelectorAll('.popup').length
        });
        
        if (modal) {
            const modalOverlay = modal.querySelector('#carrot-tutorial-overlay');
            CarrotDebug.tutorial('Modal overlay search', {
                modalOverlayFound: !!modalOverlay,
                modalChildren: modal.children.length,
                modalId: modal.id || 'no-id',
                modalClasses: modal.className
            });
            
            if (modalOverlay) {
                CarrotDebug.tutorial('✅ Using modal tutorial overlay', {
                    overlayId: modalOverlay.id,
                    overlayParent: modalOverlay.parentElement?.tagName || 'unknown',
                    overlayDisplay: modalOverlay.style.display
                });
                return modalOverlay;
            }
        }
        
        // Fall back to document-level overlay
        const documentOverlay = document.getElementById('carrot-tutorial-overlay');
        CarrotDebug.tutorial('Document overlay fallback', {
            documentOverlayFound: !!documentOverlay,
            documentOverlayParent: documentOverlay?.parentElement?.tagName || 'unknown',
            documentOverlayDisplay: documentOverlay?.style.display || 'unknown'
        });
        
        return documentOverlay;
    },

    // Show tutorial overlay - no scroll control
    showTutorialOverlay() {
        const overlay = this.getTutorialOverlay();
        
        CarrotDebug.tutorial('Showing tutorial overlay', {
            overlayExists: !!overlay,
            overlayId: overlay?.id || 'no-id',
            overlayCurrentDisplay: overlay?.style.display || 'unknown',
            overlayCurrentClasses: overlay?.className || 'no-classes'
        });
        
        if (!overlay) {
            CarrotDebug.error('❌ Tutorial overlay not found! Cannot show tutorial');
            return;
        }
        
        // Enable tutorial mode
        this.enableTutorialMode();
        
        overlay.style.display = 'block';
        // Force reflow to ensure display change takes effect
        overlay.offsetHeight;
        overlay.classList.add('active');
        
        CarrotDebug.tutorial('Tutorial overlay activated', {
            newDisplay: overlay.style.display,
            newClasses: overlay.className,
            offsetHeight: overlay.offsetHeight,
            boundingRect: overlay.getBoundingClientRect()
        });
        
        // Add resize handler for repositioning
        this.addResizeHandler();
    },
    
    // Simple tutorial mode - no scroll locking
    enableTutorialMode() {
        // Just add tutorial class for styling
        document.body.classList.add('carrot-tutorial-active');
    },
    
    // Exit tutorial mode
    disableTutorialMode() {
        // Remove tutorial class
        document.body.classList.remove('carrot-tutorial-active');
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
    
    // Hide tutorial overlay with proper cleanup
    closeTutorial() {
        const overlay = this.getTutorialOverlay();
        const spotlight = overlay.querySelector('#carrot-tutorial-spotlight');
        
        // Remove active classes
        overlay.classList.remove('active');
        spotlight.classList.remove('active');
        
        // Clean up after animation completes
        setTimeout(() => {
            overlay.style.display = 'none';
            
            // Remove all highlights
            document.querySelectorAll('.carrot-tutorial-highlight')
                .forEach(el => el.classList.remove('carrot-tutorial-highlight'));
            
            // Reset spotlight position
            spotlight.style.cssText = '';
            
            // Reset popup position and remove arrows
            const popup = overlay.querySelector('#carrot-tutorial-popup');
            popup.style.cssText = '';
            popup.className = popup.className.replace(/carrot-popup-\w+/g, '');
            
            // Remove any arrows
            const arrow = popup.querySelector('.carrot-popup-arrow');
            if (arrow) arrow.remove();
        }, 400);
        
        // Exit tutorial mode
        this.disableTutorialMode();
        
        // Remove resize handler
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        
        this.currentTutorial = null;
        this.currentStep = 0;
        this.tutorialSteps = [];
    },
    
    // Show current tutorial step with modern positioning
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
        const popup = `
            <div style="background: var(--SmartThemeBlurTintColor); border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, var(--active) 0%, rgba(var(--active-rgb), 0.85) 100%); 
                           color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 1.1em;">${title}</h4>
                    <button onclick="CarrotKernel.closePopup()" style="
                        background: none; border: none; color: white; font-size: 1.1em; cursor: pointer;
                        padding: 4px; border-radius: 4px; transition: background 0.2s ease;">
                        ✕
                    </button>
                </div>
                <div style="padding: 20px; color: var(--SmartThemeBodyColor); line-height: 1.6;">
                    ${content}
                </div>
            </div>
        `;
        
        $('#carrot-popup-container').html(popup);
        $('#carrot-popup-overlay').addClass('active').show();
    },
    
    // Close popup
    closePopup() {
        $('#carrot-popup-overlay').removeClass('active');
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
    console.log('🥕 LOADOUT DEBUG: Character context clicked via onclick');
    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    await switchLoadoutContext('character', context, currentSettings);
};

window.switchToChatContext = async function() {
    console.log('🥕 LOADOUT DEBUG: Chat context clicked via onclick');
    const context = CarrotContext.getCurrentContext();
    const currentSettings = await CarrotStorage.getSettings();
    await switchLoadoutContext('chat', context, currentSettings);
};

// Placeholder functions for loadout manager functionality

// Open tutorial for loadout manager
window.openLoadoutTutorial = function() {
    console.log('🥕 LOADOUT DEBUG: Opening proper tutorial system');
    CarrotKernel.openLoadoutTutorial();
}

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
        filterContext: document.getElementById('carrot_context_filter')?.checked || false,
        maxCharacters: parseInt(document.getElementById('carrot_context_max_characters')?.value || '6'),
        injectionDepth: parseInt(document.getElementById('carrot_context_injection_depth')?.value || '4')
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
            filterContext: false,
            maxCharacters: 6,
            injectionDepth: 4,
            description: 'General Purpose - All features enabled with moderate limits'
        },
        'roleplay': {
            enabled: true,
            sendToAI: true,
            displayMode: 'cards',
            autoExpand: true,
            filterContext: false,
            maxCharacters: 10,
            injectionDepth: 4,
            description: 'Roleplay Focus - Enhanced for immersive storytelling'
        },
        'minimal': {
            enabled: true,
            sendToAI: true,
            displayMode: 'none',
            autoExpand: false,
            filterContext: true,
            maxCharacters: 3,
            injectionDepth: 2,
            description: 'Minimal Setup - Lightweight, essential features only'
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

    const filterCheckbox = document.getElementById('carrot_context_filter');
    if (filterCheckbox) filterCheckbox.checked = template.filterContext;

    const maxCharInput = document.getElementById('carrot_context_max_characters');
    if (maxCharInput) maxCharInput.value = template.maxCharacters;

    const injectionDepthInput = document.getElementById('carrot_context_injection_depth');
    if (injectionDepthInput) injectionDepthInput.value = template.injectionDepth;

    // Show success message
    toastr.success(`Applied ${template.description}`, 'Profile Template');
    console.log(`🥕 LOADOUT DEBUG: Applied ${templateType} template`, template);
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
    console.log(`🥕 LOADOUT DEBUG: Saved loadout: ${loadoutName}`, loadout);
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
    console.log(`🥕 LOADOUT DEBUG: Assigned loadout "${loadoutName}" to context "${contextKey}"`);
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

    console.log(`🥕 LOADOUT DEBUG: Applied loadout "${loadoutName}" to interface`, loadout);
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
        // Ensure popup containers exist
        if (!document.getElementById('carrot-popup-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'carrot-popup-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.8); z-index: 10000; display: none;
                align-items: center; justify-content: center;
            `;
            
            const container = document.createElement('div');
            container.id = 'carrot-popup-container';
            container.style.cssText = `
                max-width: 90%; max-height: 90%; overflow-y: auto;
                margin: 20px; background: white; border-radius: 10px;
            `;
            
            overlay.appendChild(container);
            document.body.appendChild(overlay);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    CarrotKernel.closePopup();
                }
            });
        }
        
        // Use SillyTavern's popup system for proper sizing
        const context = getContext();
        context.callGenericPopup(this.html_template, context.POPUP_TYPE.DISPLAY, '', {
            wider: true,
            large: true,
            allowVerticalScrolling: true,
            allowHorizontalScrolling: true
        });
        
        // Wait for modal to be created, then inject tutorial overlay into it
        setTimeout(() => {
            const modal = document.querySelector('.popup:not(.popup_template)');
            const existingOverlay = modal?.querySelector('#carrot-tutorial-overlay');
            
            CarrotDebug.tutorial('🔄 Modal overlay injection check', {
                modalFound: !!modal,
                modalId: modal?.id || 'no-id',
                modalClasses: modal?.className || 'no-classes',
                existingOverlay: !!existingOverlay,
                modalChildren: modal?.children.length || 0
            });
            
            if (modal && !existingOverlay) {
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
                
                CarrotDebug.tutorial('✅ Tutorial overlay injected into modal', {
                    modalId: modal.id || 'no-id',
                    newOverlayExists: !!modal.querySelector('#carrot-tutorial-overlay'),
                    modalChildrenAfter: modal.children.length
                });
            } else if (!modal) {
                CarrotDebug.tutorial('❌ No modal found for overlay injection');
            } else {
                CarrotDebug.tutorial('ℹ️ Tutorial overlay already exists in modal');
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
        
        console.log('🥕 LOAD DEBUG: Loading template:', templateKey, 'template name:', template.name, 'template data:', template);
        
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
            
            console.log('🥕 LOAD DEBUG: NUCLEAR OPTION - Set depth value:', depthValue, 'from template.depth:', template.depth);
            console.log('🥕 LOAD DEBUG: Element value:', element?.value, 'Element attribute:', element?.getAttribute('value'));
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
        
        console.log('🥕 SAVE DEBUG: Depth value being saved:', depthValue, 'from element:', this.$template_depth?.val(), 'direct:', $('#template_depth').val());
        
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
    
    add_new_macro() {
        const name = prompt('Enter macro name (e.g., CUSTOM_MACRO):');
        if (!name) return;
        
        const upperName = name.toUpperCase().replace(/[^A-Z_]/g, '_');
        
        if (!this.macros) this.macros = {};
        
        this.macros[upperName] = {
            name: upperName,
            enabled: true,
            type: 'simple',
            value: ''
        };
        
        this.create_macro_interface(this.macros[upperName]);
        toastr.success(`Macro ${upperName} added!`);
    }
}