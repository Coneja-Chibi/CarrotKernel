// =============================================================================
// REPOSITORY MANAGER MODULE
// Character repository browsing and management
// Extracted from index.js for better modularity
// =============================================================================

import { extension_settings } from '../../../extensions.js';
import { EXTENSION_NAME } from './carrot-state.js';
import {
    currentRepoView,
    selectedCharacter,
    selectedRepository,
    setCurrentRepoView,
    setSelectedCharacter,
    setSelectedRepository,
    scannedCharacters,
    characterRepoBooks,
    selectedLorebooks
} from './carrot-state.js';

// Module variables
const extensionName = EXTENSION_NAME;
let showCarrotPopup = null;
let closeCarrotPopup = null;
let scanSelectedLorebooks = null;
let updateStatusPanels = null;

// Initialize repository manager with required dependencies
export function initializeRepositoryManager(showPopupFn, closePopupFn, scanFn, updatePanelsFn) {
    showCarrotPopup = showPopupFn;
    closeCarrotPopup = closePopupFn;
    scanSelectedLorebooks = scanFn;
    updateStatusPanels = updatePanelsFn;
}

// Repository manager main entry point
export function openRepositoryManager() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        showCarrotPopup('CarrotKernel Disabled', `
            <p>CarrotKernel is currently disabled. Please enable it first to manage repositories.</p>
            <p>Click the <strong>Master Enable</strong> toggle in the Feature Controls section.</p>
        `);
        return;
    }

    cleanupStaleRepositories();
    setCurrentRepoView('home');
    setSelectedCharacter(null);
    setSelectedRepository(null);
    renderRepositoryManager();
}

// Remove repositories that are no longer in selected lorebooks
function cleanupStaleRepositories() {
    const reposToRemove = [];
    characterRepoBooks.forEach(repoName => {
        if (!selectedLorebooks.has(repoName)) {
            reposToRemove.push(repoName);
        }
    });

    if (reposToRemove.length > 0) {
        CarrotDebug.ui('🥕 Cleaning up stale repositories:', reposToRemove);
        reposToRemove.forEach(repo => {
            characterRepoBooks.delete(repo);
            const charsToRemove = [];
            scannedCharacters.forEach((char, name) => {
                if (char.source === repo) {
                    charsToRemove.push(name);
                }
            });
            charsToRemove.forEach(name => scannedCharacters.delete(name));
        });

        extension_settings[extensionName].characterRepoBooks = Array.from(characterRepoBooks);
        saveSettingsDebounced();
    }
}

// Render the repository manager with Pack Manager-style two-panel layout
function renderRepositoryManager() {
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
            <div class="carrot-repo-header-card">
                <div class="carrot-repo-title-section">
                    <div class="carrot-repo-title-text">
                        <h2>🥕 Character Repository Manager</h2>
                        <p class="carrot-repo-subtitle">Manage indexed characters and lorebook repositories</p>
                    </div>
                    <div class="carrot-repo-header-actions">
                        <button onclick="manualRepositoryScan()" class="carrot-repo-header-btn">
                            <i class="fa-solid fa-rotate"></i> Rescan
                        </button>
                        <button onclick="closeCarrotPopup(); openRepositoryTutorial()" class="carrot-repo-header-btn">
                            <i class="fa-solid fa-graduation-cap"></i> Tutorial
                        </button>
                        <button onclick="closeCarrotPopup()" class="carrot-repo-header-btn carrot-repo-close-btn">
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
            <div class="carrot-repo-main-content">
                <div class="carrot-repo-browser-card">
                    <div class="carrot-repo-card-header">
                        <div class="carrot-repo-breadcrumb">
                            ${renderRepositoryBreadcrumb()}
                        </div>
                    </div>
                    <div class="carrot-repo-file-list" id="carrot-repo-file-list">
                        ${renderRepositoryContents()}
                    </div>
                </div>
                <div class="carrot-repo-preview-card">
                    <div class="carrot-repo-card-header">
                        <h3><i class="fa-solid fa-eye"></i> Preview</h3>
                    </div>
                    <div class="carrot-repo-preview-content" id="carrot-repo-preview">
                        ${renderRepositoryPreview()}
                    </div>
                </div>
            </div>
        </div>
    `;

    showCarrotPopup('Character Repository Manager', content);
}

// Manual scan function
async function manualRepositoryScan() {
    const selected = Array.from(selectedLorebooks);
    if (selected.length === 0) {
        alert('No lorebooks selected. Please select at least one lorebook to scan.');
        return;
    }

    const scanBtn = document.querySelector('button[onclick="manualRepositoryScan()"]');
    const originalButtonText = scanBtn ? scanBtn.textContent : '';
    if (scanBtn) {
        scanBtn.textContent = '⏳ Scanning...';
        scanBtn.style.pointerEvents = 'none';
    }

    try {
        const results = await scanSelectedLorebooks(selected);
        updateStatusPanels();
        updateRepositoryManagerContent();

        setTimeout(() => {
            forceShowCharacterCards();
        }, 500);

        const characterCount = scannedCharacters.size;
        if (characterCount > 0 && scanBtn) {
            scanBtn.textContent = `✅ Found ${characterCount} characters`;
            scanBtn.style.background = 'rgba(76, 175, 80, 0.3)';
            setTimeout(() => {
                scanBtn.textContent = '🔄 Rescan Repositories';
                scanBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                scanBtn.style.pointerEvents = 'auto';
            }, 2000);
        }
    } catch (error) {
        CarrotDebug.error('Scan error:', error);
        alert('Scan failed: ' + error.message);
        if (scanBtn) {
            scanBtn.textContent = originalButtonText;
            scanBtn.style.pointerEvents = 'auto';
        }
    }
}

// Render breadcrumb navigation
function renderRepositoryBreadcrumb() {
    if (currentRepoView === 'home') {
        return `
            <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                <i class="fa-solid fa-folder"></i> Repository Contents
            </span>
        `;
    } else if (currentRepoView === 'repository') {
        return `
            <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="navigateRepoHome()">
                <i class="fa-solid fa-folder"></i> Repositories
            </span>
            <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
            <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                ${selectedRepository}
            </span>
        `;
    } else if (currentRepoView === 'character') {
        return `
            <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="navigateRepoHome()">
                <i class="fa-solid fa-folder"></i> Repositories
            </span>
            <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
            <span class="carrot-repo-breadcrumb-item carrot-clickable" onclick="navigateToRepository('${selectedRepository}')">
                ${selectedRepository}
            </span>
            <i class="fa-solid fa-chevron-right carrot-repo-breadcrumb-sep"></i>
            <span class="carrot-repo-breadcrumb-item carrot-repo-breadcrumb-active">
                ${selectedCharacter}
            </span>
        `;
    }
}

// Render repository contents (left panel)
function renderRepositoryContents() {
    if (currentRepoView === 'home') {
        return renderRepositoryList();
    } else if (currentRepoView === 'repository') {
        return renderCharacterList();
    } else if (currentRepoView === 'character') {
        return renderCharacterDetails();
    }
}

// Render preview (right panel)
function renderRepositoryPreview() {
    if (selectedCharacter && currentRepoView === 'character') {
        return `<div class="carrot-repo-empty-preview">Character details shown in left panel</div>`;
    } else if (selectedRepository) {
        const characters = Array.from(scannedCharacters.values())
            .filter(c => c.source === selectedRepository)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const totalTags = characters.reduce((sum, c) => {
            const tagCount = c.tags ? (c.tags instanceof Map ? c.tags.size : Object.keys(c.tags).length) : 0;
            return sum + tagCount;
        }, 0);

        let characterListHTML = characters.slice(0, 10).map(c => {
            const tagCount = c.tags ? (c.tags instanceof Map ? c.tags.size : Object.keys(c.tags).length) : 0;
            const isActive = c.isActive ? '🟢 ' : '';
            return `<li>${isActive}<strong>${c.name || 'Unknown'}</strong> - ${tagCount} tags</li>`;
        }).join('');

        if (characters.length > 10) {
            characterListHTML += `<li style="margin-top: 8px; font-style: italic; opacity: 0.7;">+ ${characters.length - 10} more characters...</li>`;
        }

        return `
            <div class="carrot-repo-preview-info">
                <h4><i class="fa-solid fa-folder"></i> ${selectedRepository}</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                    <div>
                        <div style="font-size: 24px; font-weight: 600; color: var(--SmartThemeEmColor);">${characters.length}</div>
                        <div style="font-size: 12px; opacity: 0.8;">Characters</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 600; color: var(--SmartThemeEmColor);">${totalTags}</div>
                        <div style="font-size: 12px; opacity: 0.8;">Total Tags</div>
                    </div>
                </div>
                <p style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">
                    <strong>Double-click</strong> the repository to browse characters
                </p>
                <div style="max-height: 400px; overflow-y: auto;">
                    <h5 style="margin: 12px 0 8px 0; font-size: 14px; font-weight: 600;">Characters:</h5>
                    <ul class="carrot-repo-character-quick-list" style="margin: 0; padding-left: 20px; line-height: 1.8;">
                        ${characterListHTML}
                    </ul>
                </div>
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
}

// Navigation functions
function navigateRepoHome() {
    setCurrentRepoView('home');
    setSelectedCharacter(null);
    setSelectedRepository(null);
    renderRepositoryManager();
}

function selectRepository(repoName) {
    // Just update the preview, don't navigate
    setSelectedRepository(repoName);
    updateRepositoryPreview();

    // Highlight selected item
    document.querySelectorAll('.carrot-repo-file-item').forEach(item => {
        item.classList.remove('carrot-repo-selected');
    });
    const selectedItem = document.querySelector(`.carrot-repo-file-item[data-repo="${repoName}"]`);
    if (selectedItem) {
        selectedItem.classList.add('carrot-repo-selected');
    }
}

function updateRepositoryPreview() {
    const previewEl = document.getElementById('carrot-repo-preview');
    if (previewEl) {
        previewEl.innerHTML = renderRepositoryPreview();
    }
}

function navigateToRepository(repoName) {
    setCurrentRepoView('repository');
    setSelectedRepository(repoName);
    setSelectedCharacter(null);
    renderRepositoryManager();
}

function navigateToCharacter(characterName, repoName) {
    setCurrentRepoView('character');
    setSelectedCharacter(`${repoName}::${characterName}`);
    setSelectedRepository(repoName);
    renderRepositoryManager();
}

// Render repository list
function renderRepositoryList() {
    // Get unique repository names from scanned characters
    const repoSet = new Set();
    scannedCharacters.forEach(char => {
        if (char.source) {
            repoSet.add(char.source);
        }
    });
    const repos = Array.from(repoSet);

    if (repos.length === 0) {
        return `
            <div class="carrot-repo-empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>No character repositories found</p>
                <p style="font-size: 12px; opacity: 0.7;">Select lorebooks and mark them as Character Repositories</p>
            </div>
        `;
    }

    let html = '<div class="carrot-repo-summary">';
    html += `<p>${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'} • ${scannedCharacters.size} ${scannedCharacters.size === 1 ? 'character' : 'characters'} total</p>`;
    html += '</div>';

    repos.forEach(repoName => {
        const characters = Array.from(scannedCharacters.values()).filter(c => c.source === repoName);
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
}

// Render character list
function renderCharacterList() {
    const characters = Array.from(scannedCharacters.values()).filter(c => c.source === selectedRepository);
    if (characters.length === 0) {
        return `
            <div class="carrot-repo-empty-state">
                <i class="fa-solid fa-user-slash"></i>
                <p>No characters found in this repository</p>
            </div>
        `;
    }

    let html = '<div class="carrot-repo-summary">';
    html += `<p>${characters.length} ${characters.length === 1 ? 'character' : 'characters'} in this repository</p>`;
    html += '</div>';

    characters.forEach(char => {
        const tagCount = char.tags ? (char.tags instanceof Map ? char.tags.size : Object.keys(char.tags).length) : 0;
        const isActive = char.isActive;
        html += `
            <div class="carrot-repo-file-item carrot-clickable" onclick="CarrotKernel.navigateToCharacter('${char.name.replace(/'/g, "\\'")}', '${selectedRepository.replace(/'/g, "\\'")}')">
                <div class="carrot-repo-file-icon">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="carrot-repo-file-info">
                    <div class="carrot-repo-file-name">
                        ${isActive ? '<span class="carrot-repo-status-active">🟢</span> ' : ''}${char.name || 'Unknown'}
                    </div>
                    <div class="carrot-repo-file-meta">${tagCount} ${tagCount === 1 ? 'tag' : 'tags'}</div>
                </div>
            </div>
        `;
    });

    return html;
}

// Render character details
function renderCharacterDetails() {
    const char = scannedCharacters.get(selectedCharacter);
    if (!char) {
        return `
            <div class="carrot-repo-empty-state">
                <i class="fa-solid fa-user-slash"></i>
                <p>Character not found</p>
            </div>
        `;
    }

    const tags = char.tags instanceof Map ? Array.from(char.tags.entries()) : Object.entries(char.tags || {});

    // Character header with stats
    let html = `
        <div class="carrot-repo-summary">
            <p><i class="fa-solid fa-user"></i> ${char.name || 'Unknown'} • ${tags.length} ${tags.length === 1 ? 'category' : 'categories'}</p>
        </div>
        <div style="margin: 16px 0; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                    <div style="font-size: 20px; font-weight: 600; color: var(--SmartThemeEmColor);">${tags.length}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Tag Categories</div>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: 600; color: var(--SmartThemeEmColor);">${char.isActive ? '🟢 Active' : 'Inactive'}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Status</div>
                </div>
            </div>
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="font-size: 11px; opacity: 0.7;">Source Repository</div>
                <div style="font-size: 13px; font-weight: 500;">${char.source}</div>
            </div>
        </div>
    `;

    // Tags organized as file-item style entries
    tags.forEach(([category, values]) => {
        const valuesArray = values instanceof Set ? Array.from(values) : (Array.isArray(values) ? values : [values]);
        const valueCount = valuesArray.length;

        html += `
            <div class="carrot-repo-file-item">
                <div class="carrot-repo-file-icon">
                    <i class="fa-solid fa-tag"></i>
                </div>
                <div class="carrot-repo-file-info">
                    <div class="carrot-repo-file-name">${category}</div>
                    <div class="carrot-repo-file-meta">${valueCount} ${valueCount === 1 ? 'tag' : 'tags'}</div>
                </div>
            </div>
            <div style="padding: 8px 16px 16px 56px; display: flex; flex-wrap: wrap; gap: 6px;">
                ${valuesArray.map(val => `<span style="display: inline-block; padding: 4px 10px; background: rgba(102, 126, 234, 0.2); border: 1px solid rgba(102, 126, 234, 0.4); border-radius: 12px; font-size: 12px; color: #a5b4fc;">${val}</span>`).join('')}
            </div>
        `;
    });

    return html;
}

// Update repository manager content without closing popup
function updateRepositoryManagerContent() {
    const popupContainer = document.getElementById('carrot-popup-container');
    if (!popupContainer) return;

    const characterCount = scannedCharacters.size;
    const selectedCount = selectedLorebooks.size;

    const statsCards = popupContainer.querySelectorAll('[style*="font-size: 28px"]');
    if (statsCards.length >= 3) {
        statsCards[0].textContent = characterCount;
        statsCards[1].textContent = selectedCount;
        statsCards[2].textContent = characterRepoBooks.size;
    }

    if (characterCount > 0) {
        const gettingStarted = popupContainer.querySelector('h5[style*="Getting Started"]');
        if (gettingStarted) {
            const gettingStartedContainer = gettingStarted.closest('div[style*="background: linear-gradient"]');
            if (gettingStartedContainer) {
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
}

// Force show character cards
function forceShowCharacterCards() {
    const popupContainer = document.getElementById('carrot-popup-container');
    if (!popupContainer || scannedCharacters.size === 0) {
        if (extension_settings[extensionName]?.debugMode) {
            CarrotDebug.ui('Cannot show character cards:', { popupContainer: !!popupContainer, characterCount: scannedCharacters.size });
        }
        return;
    }

    updateCharacterCountStats();
    addCharactersList();
    hideGettingStartedSection();

    if (extension_settings[extensionName]?.debugMode) {
        CarrotDebug.ui(`✅ Character data updated - ${scannedCharacters.size} characters available`);
    }
}

// Add characters list
function addCharactersList() {
    const popupContainer = document.getElementById('carrot-popup-container');
    if (!popupContainer || scannedCharacters.size === 0) return;

    const existingList = popupContainer.querySelector('#carrot-characters-list');
    if (existingList) existingList.remove();

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
            " onclick="showCharacterDetails('${characterName}')"
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

    const purpleSection = popupContainer.querySelector('div[style*="background: linear-gradient"][style*="SmartThemeEmColor"]');
    if (purpleSection) {
        purpleSection.parentNode.insertBefore(charactersList, purpleSection.nextSibling);
    } else {
        popupContainer.appendChild(charactersList);
    }
}

// Update character count stats
function updateCharacterCountStats() {
    const popupContainer = document.getElementById('carrot-popup-container');
    if (!popupContainer) return;

    const statsCards = popupContainer.querySelectorAll('[style*="font-size: 28px"]');
    if (statsCards.length >= 1) {
        statsCards[0].textContent = scannedCharacters.size;
    }
}

// Show character details
function showCharacterDetails(characterName) {
    const char = scannedCharacters.get(characterName);
    if (!char) {
        alert('Character not found: ' + characterName);
        return;
    }

    const tags = char.tags instanceof Map ? Array.from(char.tags.entries()) : Object.entries(char.tags || {});
    let tagsHTML = '';
    tags.forEach(([key, value]) => {
        tagsHTML += `<div class="carrot-tag-item"><strong>${key}:</strong> ${value}</div>`;
    });

    const detailsHTML = `
        <div style="padding: 20px; max-width: 800px;">
            <h2 style="margin-bottom: 16px;">🎭 ${characterName}</h2>
            <p><strong>Source:</strong> ${char.source}</p>
            <h3 style="margin-top: 24px; margin-bottom: 12px;">Tags (${tags.length})</h3>
            <div style="display: grid; gap: 8px;">
                ${tagsHTML}
            </div>
            <div style="margin-top: 24px;">
                <button onclick="returnToRepositoryManager()" class="menu_button">
                    <i class="fa-solid fa-arrow-left"></i> Back to Repository Manager
                </button>
            </div>
        </div>
    `;

    showCarrotPopup(`Character Details - ${characterName}`, detailsHTML);
}

// Return to repository manager
function returnToRepositoryManager() {
    closeCarrotPopup();
    openRepositoryManager();
}

// Hide getting started section
function hideGettingStartedSection() {
    const popupContainer = document.getElementById('carrot-popup-container');
    if (!popupContainer) return;

    const gettingStarted = popupContainer.querySelector('h5[style*="Getting Started"]');
    if (gettingStarted) {
        const container = gettingStarted.closest('div[style*="background: linear-gradient"]');
        if (container) container.style.display = 'none';
    }
}

// Make repository functions globally accessible for onclick handlers
window.openRepositoryManager = openRepositoryManager;
window.cleanupStaleRepositories = cleanupStaleRepositories;
window.renderRepositoryManager = renderRepositoryManager;
window.manualRepositoryScan = manualRepositoryScan;
window.renderRepositoryBreadcrumb = renderRepositoryBreadcrumb;
window.navigateRepoHome = navigateRepoHome;
window.navigateToRepository = navigateToRepository;
window.navigateToCharacter = navigateToCharacter;
window.showCharacterDetails = showCharacterDetails;
window.returnToRepositoryManager = returnToRepositoryManager;


// Export all public functions
export {
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
};
