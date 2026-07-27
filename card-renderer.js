// =============================================================================
// CARROT CARD RENDERER SYSTEM 🥕
// Character card rendering and display system for BunnyMo format
// =============================================================================

import { CarrotDebug } from './debugger.js';
import { generateFullSheet, generateTagSheet, generateQuickSheet } from './sheet-generator.js';
import { extension_settings } from '../../../extensions.js';
import { EXTENSION_NAME } from './carrot-state.js';

const extensionName = EXTENSION_NAME;

// Forward declarations - provided by index.js via initializeCardRenderer() to avoid
// a circular dependency (mirrors the same pattern sheet-generator.js and
// repository-manager.js already use for their own index.js-owned dependencies).
let findCharacterByName = null;
let refreshTabContent = null;

/**
 * Initialize the card renderer with required dependencies
 * Called by index.js after it defines findCharacterByName/refreshTabContent
 * @param {Function} findCharFn - The findCharacterByName function from index.js
 * @param {Function} refreshTabFn - The refreshTabContent function from index.js
 */
export function initializeCardRenderer(findCharFn, refreshTabFn) {
    findCharacterByName = findCharFn;
    refreshTabContent = refreshTabFn;
    CarrotDebug.init('Card renderer initialized with dependencies');
}

function renderAsCards(activeCharacters) {
    const settings = extension_settings[extensionName];
    
    // Respect maxCharactersDisplay limit  
    const maxChars = Math.min(activeCharacters.length, settings.maxCharactersDisplay);
    const charactersToShow = activeCharacters.slice(0, maxChars);
    
    // Load CSS styles first (create style element if needed)
    loadCarrotCardStyles();
    
    // createCharacterCard returns a DOM element, not a string — without .outerHTML
    // this joins to the literal text "[object HTMLDivElement]" for every card.
    const cardsHTML = charactersToShow
        .map((charName, index) => createCharacterCard(charName, index))
        .map(el => el.outerHTML)
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
function attachExternalCardsToMessage(messageIndex, characterData) {
    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui('🔧 CARDS EMERGENCY DEBUG: Function called', { messageIndex, characterData });
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
    }
    header.appendChild(headerTitle);
    if (extension_settings[extensionName]?.debugMode) {
    }
    header.appendChild(headerInfo);
    if (extension_settings[extensionName]?.debugMode) {
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
        }
        contentContainer.appendChild(tabContent);
        tabContents[tab.id] = tabContent; // Store reference
    });
    
    // Process characters and organize by tabs - show first character initially
    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui(`[BMT CARDS] Creating tabbed interface for ${characters.length} characters`);
    }
    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui(`[BMT CARDS] First character data:`, characters[0]);
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
                CarrotDebug.error(`[BMT CARDS] No data found for character: ${firstChar}`);
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
            CarrotDebug.ui(`[BMT CARDS] Formatted character:`, formattedChar);
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
    }
    mainContent.appendChild(header);
    if (extension_settings[extensionName]?.debugMode) {
    }
    mainContent.appendChild(collapsibleContent);
    if (extension_settings[extensionName]?.debugMode) {
    }
    container.appendChild(mainContent);

    CarrotDebug.ui(`Container created successfully`, {
        characterCount: characters.length,
        containerId: container.id,
        containerChildren: container.children.length
    });

    return container;
}
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
    CarrotDebug.ui('🔍 DEBUG createTabSpecificContent called with:', { tags, tabType });
    
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
                pattern: /^(SKIN|SKINCOLOR|HAIR|HAIRCOLOR|EYECOLOR|STYLE|FONT|AGE):/,
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
    CarrotDebug.ui('🔍 DEBUG: Processing tags for categorization:', tags);
    CarrotDebug.ui('🔍 DEBUG: Available tag categories:', Object.keys(tags));
    
    Object.entries(tags).forEach(([tagCategory, tagList]) => {
        CarrotDebug.ui(`🔍 DEBUG: Processing category "${tagCategory}" with tags:`, tagList);
        CarrotDebug.ui('🚨 CARROT KERNEL UPDATE TEST - NEW CODE IS RUNNING! 🚨');
        
        if (!Array.isArray(tagList)) {
            CarrotDebug.ui(`🔍 DEBUG: Skipping non-array category: ${tagCategory}`, tagList);
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
                    CarrotDebug.ui(`[BMT CARDS] MBTI MATCH: "${tag}" -> "${category}"`);
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
            else if (['skin', 'skincolor', 'hair', 'haircolor', 'eyecolor', 'age', 'style', 'font'].includes(tagCategory.toLowerCase())) {
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
            else if (tagCategory === 'skin' || tagCategory === 'skincolor' || tagCategory === 'hair' || tagCategory === 'haircolor' || tagCategory === 'eyecolor' || tagCategory === 'age' || tagCategory === 'font' || tag.startsWith('SKIN:') || tag.startsWith('SKINCOLOR:') || tag.startsWith('HAIR:') || tag.startsWith('HAIRCOLOR:') || tag.startsWith('EYECOLOR:') || tag.startsWith('AGE:') || tag.startsWith('STYLE:') || tag.startsWith('FONT:')) {
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
                    CarrotDebug.ui(`[BMT CARDS] Added "${displayTag}" to "${category}"`);
                }
            } else {
                if (extension_settings[extensionName]?.debugMode) {
                    CarrotDebug.ui(`[BMT CARDS] SKIPPING "${tag}" - category "${category}" not available for ${tabType} tab and no Other section`);
                }
            }
        });
    });
    
    // DEBUG: Log final organization
    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui(`[BMT CARDS] Final organized tags for ${tabType}:`, organizedTags);
    }
    
    // Create sections for each category that has tags
    Object.entries(organizedTags).forEach(([categoryName, categoryTags]) => {
        if (categoryTags.length === 0) return;
        
        if (extension_settings[extensionName]?.debugMode) {
            CarrotDebug.ui(`[BMT CARDS] Creating section for category: ${categoryName} with ${categoryTags.length} tags:`, categoryTags);
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
        CarrotDebug.ui(`[BMT CARDS] Selected theme for category "${categoryName}":`, theme);
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

        // Special handling for FONT tag - extract and apply color
        if (tag.toUpperCase().startsWith('FONT:')) {
            const colorMatch = tag.match(/FONT:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|[a-zA-Z]+)/i);
            if (colorMatch && colorMatch[1]) {
                const fontColor = colorMatch[1];
                // Apply the font color to the tag text
                tagElement.style.color = fontColor;
                tagElement.style.fontWeight = '900';
                tagElement.style.textShadow = `0 0 8px ${fontColor}, 0 0 16px ${fontColor}`;
                displayText = `FONT: Color Sample`;
                tagElement.style.fontSize = '1em';
            }
        }

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
                CarrotDebug.ui(`[BMT SYSTEM] Searching WorldBook for tag: ${tag}`);
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
                CarrotDebug.ui(`[BMT SYSTEM] WorldBook search not available for tag: ${tag}`);
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
        CarrotDebug.error('[BunnyMoTags] Error searching WorldBook:', error);
    }
}
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

// Export for module use
export {
    renderAsCards,
    loadCarrotCardStyles,
    attachExternalCardsToMessage,
    ensureBunnyMoAnimations,
    createExternalCardContainer,
    createTabbedCharacterCard,
    createCharacterCard
};
