// =============================================================================
// CARROT TEMPLATE PROMPT EDITOR INTERFACE
// Template editing system for CarrotKernel
// Extracted from index.js for better modularity
// =============================================================================

import { CarrotDebug } from './debugger.js';

// Template editor interface class
export class CarrotTemplatePromptEditInterface {

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
                    <input type="number" id="template_depth" class="bmt-depth-input" min="0" max="100" value="0" />
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
                    <option value="BunnyMo Memsheet Injection">🚨 BunnyMo Memsheet Injection</option>
                    <option value="BunnyMo Updatesheet Injection">🚨 BunnyMo Updatesheet Injection</option>
                    <option value="BunnyMo Physsheet Injection">🚨 BunnyMo Physsheet Injection</option>
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
            'BUNNYMO_PACK_TAGS': {
                name: 'BUNNYMO_PACK_TAGS',
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
                    // Helper method for the *_OPTIONS processors, not a standalone
                    // macro — don't surface it as a bogus {{getBunnyMoPackOptions}} card.
                    if (macro === 'getBunnyMoPackOptions') return;
                    priorityMacros.push(macro);
                });
            } else {
                CarrotDebug.error('CarrotTemplateManager.macroProcessors not available, using fallback list');
                // Fallback list of known macros
                priorityMacros.push(
                    'TRIGGERED_CHARACTER_TAGS', 'CHARACTER_LIST', 'CHARACTERS_WITH_TYPES', 'CHARACTERS',
                    'CHARACTER1', 'CHARACTER2', 'CHARACTER3', 'CHARACTER4', 'CHARACTER5',
                    'CHARACTER_COUNT', 'CHARACTER_SOURCES', 'PERSONALITY_TAGS', 'PHYSICAL_TAGS',
                    'MBTI_TAGS', 'COMMUNICATION_TAGS', 'IDENTITY_TAGS', 'KINK_TAGS', 'ALL_TAG_CATEGORIES',
                    'TAG_STATISTICS', 'CROSS_CHARACTER_ANALYSIS', 'REPOSITORY_METADATA',
                    'FULLSHEET_FORMAT', 'TAGSHEET_FORMAT', 'QUICKSHEET_FORMAT',
                    'SELECTED_LOREBOOKS', 'CHARACTER_REPO_BOOKS', 'BUNNYMO_PACK_TAGS'
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
                // Helper method for the *_OPTIONS processors, not a standalone
                // macro — don't surface it as a bogus {{getBunnyMoPackOptions}} card.
                if (macro === 'getBunnyMoPackOptions') return;
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
                CarrotDebug.ui(`🥕 Macro ${macro.name} setting ${settingName} = ${value}`);
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
    
    async previewMacro(macro) {
        // Get the current value from our macro processing system. processMacros is
        // async (it awaits each processor internally), so this must be awaited too —
        // otherwise the alert renders the literal text "[object Promise]".
        const processedContent = await CarrotTemplateManager.processMacros(`{{${macro.name}}}`);
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

        if (name.includes('memsheet injection') || name.includes('mem sheet injection')) {
            return 'BunnyMo Memsheet Injection';
        }

        if (name.includes('updatesheet injection') || name.includes('update sheet injection')) {
            return 'BunnyMo Updatesheet Injection';
        }

        if (name.includes('physsheet injection') || name.includes('phys sheet injection') || name.includes('physical sheet')) {
            return 'BunnyMo Physsheet Injection';
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
    
    async preview_current_template() {
        const content = this.$prompt.val();
        if (!content) {
            toastr.warning('No content to preview');
            return;
        }

        // Use CarrotKernel's real macro processing system. processMacros is async
        // (it awaits each processor internally), so this must be awaited too —
        // otherwise the popup renders the literal text "[object Promise]".
        let preview = await CarrotTemplateManager.processMacros(content);
        
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

        let newName = prompt('Enter name for duplicated template:', `${templateKey}_copy`);
        if (!newName) return;

        // Trim whitespace
        newName = newName.trim();

        // Check if same as original
        if (newName === templateKey) {
            toastr.warning('New name must be different from original');
            return;
        }

        // Check if name already exists
        if (this.templateManager.getTemplate(newName)) {
            toastr.error(`Template "${newName}" already exists`);
            return;
        }

        const template = this.templateManager.getTemplate(templateKey);
        const duplicated = {
            ...template,
            label: newName,
            isDefault: false
        };

        this.templateManager.setTemplate(newName, duplicated);
        this.init_templates();
        this.$selector.val(newName);
        this.selectedTemplate = newName;
        this.load_template_into_interface();

        toastr.success(`Template duplicated as "${newName}"!`);
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

