// Exact copy of BunnyMoTags TemplatePromptEditInterface class
class TemplatePromptEditInterface {

    html_template = `
<div id="bmt_template_prompt_interface" class="bmt-template-interface" style="height: 100%">
<div class="bmt-modal-header-banner">
    <div class="bmt-modal-title">
        <span class="bmt-modal-icon">🐰</span>
        <h3>BunnyMo Template Editor</h3>
        <span class="bmt-modal-subtitle">Configure templates and macros</span>
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
                        <option value="character">👤 Character</option>
                        <option value="world">🌍 World</option>
                    </select>
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
        <textarea id="prompt" placeholder="✨ Enter your template content here...&#10;&#10;Use {{MACRO_NAME}} for dynamic variables that will be replaced with configured values.&#10;&#10;Example:&#10;Character: {{CHARACTER_NAME}}&#10;Personality: {{PERSONALITY}}&#10;Available traits: {{AVAILABLE_TAGS}}"></textarea>
    </div>
    
    <div class="bmt-macro-section toggle-macro">
        <div class="bmt-panel-header">
            <div class="bmt-panel-title">
                <span class="bmt-panel-icon">🔧</span>
                <h3>Macro Configuration</h3>
            </div>
            <div class="bmt-panel-controls">
                <button id="add_macro" class="bmt-action-btn bmt-add-btn" title="Add a new custom macro">
                    <i class="fa-solid fa-plus"></i> New Macro
                </button>
            </div>
        </div>
        <div id="macro_definitions" class="bmt-macro-definitions"></div>
    </div>
</div>

<div class="bmt-template-metadata">
    <div class="bmt-metadata-section">
        <div class="bmt-metadata-row">
            <div class="bmt-metadata-field">
                <label class="bmt-metadata-label">
                    <span class="bmt-metadata-icon">📂</span>
                    <span class="bmt-metadata-title">Template Category</span>
                    <i class="fa-solid fa-info-circle bmt-tooltip" title="Select which BunnyMo feature this template is for:&#10;• BunnyRecc System Prompt: Main character generation prompt&#10;• Selected Traits Context: How selected traits are formatted&#10;• Character Data Injection: How character data gets injected&#10;• BunnyMo Fullsheet Format: Complete character sheet format&#10;• etc. - Choose the feature you want to customize"></i>
                </label>
                <select id="template_category" class="bmt-metadata-select">
                    <option value="BunnyRecc System Prompt">🐰 BunnyRecc System Prompt</option>
                    <option value="Selected Traits Context">🎯 Selected Traits Context</option>
                    <option value="BunnyMo System Information">📋 BunnyMo System Information</option>
                    <option value="Character Context Information">👤 Character Context Information</option>
                    <option value="World Information Context">🌍 World Information Context</option>
                    <option value="Chat Messages Context">💬 Chat Messages Context</option>
                    <option value="Lorebook Content Context">📚 Lorebook Content Context</option>
                    <option value="Available Tags Context">🏷️ Available Tags Context</option>
                    <option value="Character Data Injection">💉 Character Data Injection</option>
                    <option value="Generation Important Notes">📝 Generation Important Notes</option>
                    <option value="BunnyMo Fullsheet Format">📄 BunnyMo Fullsheet Format</option>
                    <option value="BunnyMo Quicksheet Format">⚡ BunnyMo Quicksheet Format</option>
                </select>
            </div>
            
            <div class="bmt-metadata-field">
                <label class="bmt-metadata-label">
                    <span class="bmt-metadata-icon">⭐</span>
                    <span class="bmt-metadata-title">Primary Template</span>
                    <i class="fa-solid fa-info-circle bmt-tooltip" title="When BunnyMo needs a template of this category, it will use the primary one first. Only one template per category should be marked as primary."></i>
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
    // Template dropdown and other settings
    selectedTemplate = null;
    
    macro_definition_template = `

<div class="macro_definition bmt_interface_card">
<div class="inline-drawer">
    <div class="inline-drawer-header">
        <div class="flex-container alignitemscenter margin0 flex1">
            <div class="bmt-macro-icon">🔧</div>
            <button class="macro_enable menu_button fa-solid margin0"></button>
            <button class="macro_preview menu_button fa-solid fa-eye margin0" title="Preview the result of this macro"></button>
            <input class="macro_name flex1 text_pole" type="text" placeholder="name" readonly>
        </div>
        <div class="inline-drawer-toggle">
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
    </div>

    <div class="inline-drawer-content">
        <!-- Macro Documentation -->
        <div class="bmt-macro-docs">
            <div class="bmt-macro-description"></div>
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
            <div class="macro_simple_content">
                <!-- Content varies by macro type - populated dynamically -->
            </div>
        </div>

        <!-- Advanced Settings -->
        <div class="macro_type_advanced">
            <div class="macro_advanced_content">
                <!-- Content varies by macro type - populated dynamically -->
            </div>
        </div>

        <div class="macro_type_any flex-container alignitemscenter">
            <label title="Apply BunnyMo formatting to the output" class="checkbox_label">
                <input class="macro_format" type="checkbox">
                <span>🎨 Format Output</span>
            </label>

            <button class="macro_delete menu_button red_button fa-solid fa-trash" title="Delete custom macro" style="margin-left: auto;"></button>
            <button class="macro_restore menu_button red_button fa-solid fa-recycle" title="Restore default BunnyMo macro" style="margin-left: auto;"></button>
        </div>

    </div>
</div>
</div>

    `
    ctx = getContext();

    // enable/disable icons
    static fa_enabled = "fa-check"
    static fa_disabled = "fa-xmark"

    default_macro_settings = {
        name: "new_macro",
        enabled: true,
        type: "simple",
        value: "",
        format: false,
        command: "",
        // Macro-specific settings will be added based on macro type
    }

    constructor() {
        this.macros = {};
        this.initializeDefaultMacros();
        this.from_settings()
    }
    
    initializeDefaultMacros() {
        // Add some default BunnyMo macros that are always available
        const defaultMacros = {
            'CHARACTER_NAME': {
                name: 'CHARACTER_NAME',
                enabled: true,
                type: 'simple',
                charNameFormat: 'display',
                format: false,
                command: '',
                default: true
            },
            'USER_NAME': {
                name: 'USER_NAME',
                enabled: true,
                type: 'simple',
                nameFormat: 'display',
                format: false,
                command: '',
                default: true
            },
            'PERSONALITY': {
                name: 'PERSONALITY',
                enabled: true,
                type: 'simple',
                personalityStyle: 'traits',
                format: false,
                command: '',
                default: true
            }
        };
        
        // Only add default macros if they don't exist
        Object.entries(defaultMacros).forEach(([name, macro]) => {
            if (!this.macros[name]) {
                this.macros[name] = macro;
            }
        });
    }
    
    async init() {
        this.popup = new this.ctx.Popup(this.html_template, this.ctx.POPUP_TYPE.TEXT, undefined, {
            wider: true, 
            large: true,
            allowVerticalScrolling: true,
            okButton: 'Save', 
            cancelButton: 'Cancel'
        });
        this.$content = $(this.popup.content)
        this.$buttons = this.$content.find('.popup-controls')
        this.$preview = this.$content.find('#preview_template_prompt')
        this.$save = this.$content.find('#save_template')
        this.$duplicate = this.$content.find('#duplicate_template')
        this.$delete = this.$content.find('#delete_template')
        this.$restore = this.$content.find('#restore_default_template')
        this.$definitions = this.$content.find('#macro_definitions')
        this.$add_macro = this.$content.find('#add_macro')
        this.$open_macros = this.$content.find('.open_macros')

        // settings
        this.$prompt = this.$content.find('#prompt')
        this.$template_type = this.$content.find('#template_type')
        this.$template_category = this.$content.find('#template_category')
        this.$template_role = this.$content.find('#template_role')
        this.$template_selector = this.$content.find('#bmt_template_selector')


        // buttons
        this.$preview.on('click', () => this.preview_prompt())
        this.$save.on('click', () => this.save_template())
        this.$duplicate.on('click', () => this.duplicate_template())
        this.$delete.on('click', () => this.delete_template())
        this.$add_macro.on('click', () => this.new_macro())
        this.$restore.on('click', () => this.restore_default())
        this.$open_macros.on('click', () => {
            this.$content.find('.toggle-macro').toggle()
        })

        // manually add tooltips to the popout buttons
        this.$buttons.find('.popup-button-ok').attr('title', 'Save changes to the template and macros')
        this.$buttons.find('.popup-button-cancel').attr('title', 'Discard changes to the template and macros')

        // set the prompt text and the macro settings
        this.from_settings()
        
        // Populate template selector dropdown
        this.populateTemplateSelector();
        
        // Template selector change handler
        this.$template_selector.on('change', () => {
            this.selectedTemplate = this.$template_selector.val();
            this.from_settings(); // Reload template content
            this.update_macros(); // Update macro list
        });
        
        // Add real-time macro detection
        this.$prompt.on('input', () => {
            this.detectMacrosFromTemplate();
            this.update_macros();
        });
    }
}