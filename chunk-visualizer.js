// =============================================================================
// CHUNK VISUALIZER MODULE 🥕
// RAG chunk viewer, editor, and manager
// =============================================================================

import { extension_settings } from '../../../extensions.js';
import { EXTENSION_NAME } from './carrot-state.js';
import { CarrotDebug } from './debugger.js';
import { escapeHtml } from '../../../utils.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { highlightRegex } from '../../../utils.js';
import { parseRegexFromString } from '../../../world-info.js';

const extensionName = EXTENSION_NAME;
const CUSTOM_KEYWORD_PRIORITY = 140;

// Module-level state
let currentEditingCollection = null;
let modifiedChunks = {};
let hasUnsavedChanges = false;
let chunkFormattingEnabled = false;
let fullsheetAPI = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function ensureArrayValue(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value);
    if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
    return [];
}

function getCharacterNameFromCollectionId(collectionId) {
    const customName = extension_settings[extensionName]?.rag?.collectionNames?.[collectionId];
    if (customName) return customName;

    const match = collectionId.match(/char_([^_]+)/);
    if (match) {
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    return collectionId;
}

function formatChunkText(text) {
    if (!text) return '';
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/\n/g, '<br>');
    formatted = formatted.replace(/^### (.+?)(<br>|$)/gm, '<h4 style="margin: 12px 0 6px; font-weight: 600;">$1</h4>');
    formatted = formatted.replace(/^## (.+?)(<br>|$)/gm, '<h3 style="margin: 14px 0 8px; font-weight: 600;">$1</h3>');
    formatted = formatted.replace(/^# (.+?)(<br>|$)/gm, '<h2 style="margin: 16px 0 10px; font-weight: 600;">$1</h2>');
    return formatted;
}

function normalizeKeywordClient(word) {
    if (!word) return '';
    let normalized = word.toLowerCase();
    const replacements = [
        /(?:ing|ingly)$/, /(?:edly)$/, /(?:tion|tions)$/, /(?:ment|ments)$/,
        /(?:ness|nesses)$/, /(?:ally)$/, /(?:ies)$/, /(?:ers|er)$/,
        /(?:less)$/, /(?:ful)$/, /(?:ous)$/, /(?:ly)$/, /(?:ed)$/, /(?:es)$/, /(?:s)$/
    ];
    for (const regex of replacements) {
        normalized = normalized.replace(regex, '');
    }
    return normalized;
}

function initializeChunkKeywordMetadata(chunk) {
    if (!chunk) return;
    chunk.systemKeywords = ensureArrayValue(chunk.systemKeywords);
    chunk.customKeywords = ensureArrayValue(chunk.customKeywords);
    chunk.disabledKeywords = ensureArrayValue(chunk.disabledKeywords);
    if (!chunk.customWeights) chunk.customWeights = {};

    const disabledSet = new Set(chunk.disabledKeywords.map(normalizeKeywordClient));
    const customKeywordSet = new Set(chunk.customKeywords.map(normalizeKeywordClient));
    const active = [
        ...chunk.systemKeywords.filter(k => !disabledSet.has(normalizeKeywordClient(k))),
        ...chunk.customKeywords
    ];
    chunk.keywords = active;
}

function isValidRegex(str) {
    if (!str) return false;
    return parseRegexFromString(str) !== null;
}

function normalizeRegexList(regexData) {
    if (!regexData) return [];
    if (Array.isArray(regexData)) return regexData;
    if (typeof regexData === 'string') {
        try {
            const parsed = JSON.parse(regexData);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function formatRegexList(regexArray) {
    return regexArray.map(r => `/${r.pattern}/${r.flags || 'i'}`).join(', ');
}

function getSearchTerm() {
    return $('#carrot-rag-chunk-search').val() || '';
}

// =============================================================================
// INITIALIZATION
// =============================================================================

export function initializeChunkVisualizer(ragAPI) {
    fullsheetAPI = ragAPI;
    CarrotDebug.init('✅ Chunk Visualizer initialized');
}

// =============================================================================
// MAIN MODAL FUNCTIONS
// =============================================================================

export function openChunkVisualizer(collectionId) {
    if (!fullsheetAPI) {
        toastr.error('Chunk Visualizer not properly initialized');
        return;
    }

    const library = fullsheetAPI.getContextualLibrary();
    const chunks = library[collectionId];

    if (!chunks) {
        toastr.warning('No chunks found for this collection.');
        return;
    }

    const characterName = getCharacterNameFromCollectionId(collectionId);
    const contextLevel = fullsheetAPI.getCurrentContextLevel ? fullsheetAPI.getCurrentContextLevel() : 'global';

    currentEditingCollection = collectionId;
    modifiedChunks = JSON.parse(JSON.stringify(chunks));
    hasUnsavedChanges = false;

    CarrotDebug.ui('🔍 Loading chunks for editing:', Object.keys(modifiedChunks).length, 'chunks');

    Object.entries(modifiedChunks).forEach(([hash, chunk]) => {
        if (chunk.customWeights && Object.keys(chunk.customWeights).length > 0) {
            CarrotDebug.ui(`📊 Chunk ${hash} has custom weights:`, chunk.customWeights);
        }
        initializeChunkKeywordMetadata(chunk);
        chunk._editing = false;
    });

    // Update modal title
    $('#carrot-rag-modal-title').html(
        `<i class="fa-solid fa-cube"></i> ${escapeHtml(characterName)} <span style="font-size: 0.7em; color: #8b5cf6; text-transform: uppercase;">[${contextLevel}]</span>`
    );
    $('#carrot-rag-modal-subtitle').text(`${Object.keys(chunks).length} chunks`);

    // Initialize format toggle button state
    const ragState = extension_settings[extensionName].rag;
    const $formatBtn = $('#carrot-rag-format-toggle');
    const $formatLabel = $formatBtn.find('.chunk-format-label');
    chunkFormattingEnabled = ragState.chunkFormattingEnabled || false;
    $formatLabel.text(chunkFormattingEnabled ? 'Formatted' : 'Plain');

    // Initialize case-sensitivity toggle button state
    const $caseBtn = $('#carrot-rag-case-toggle');
    const $caseLabel = $caseBtn.find('.chunk-case-label');
    if (ragState.caseSensitiveKeywords) {
        $caseLabel.text('Case: Match');
        $caseBtn.attr('title', 'Keyword matching is case-sensitive (click to ignore case)');
    } else {
        $caseLabel.text('Case: Ignore');
        $caseBtn.attr('title', 'Keyword matching ignores case (click for case-sensitive)');
    }

    renderChunks(modifiedChunks);
    bindChunkVisualizerEvents();

    // Show modal
    $('#carrot-rag-visualizer-modal')
        .addClass('is-visible')
        .fadeIn(200, function () {
            $(this).css('display', 'flex');
        });
    $('body').css('overflow', 'hidden');
}

export function closeChunkVisualizer() {
    if (hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Close anyway?')) {
            return;
        }
    }

    $('#carrot-rag-visualizer-modal').fadeOut(200, function () {
        $(this).removeClass('is-visible');
    });
    $('body').css('overflow', '');

    currentEditingCollection = null;
    modifiedChunks = {};
    hasUnsavedChanges = false;
}

export async function saveChunkChanges() {
    if (!fullsheetAPI || !currentEditingCollection) {
        toastr.error('No collection to save');
        return;
    }

    try {
        await fullsheetAPI.updateChunksInLibrary(currentEditingCollection, modifiedChunks);
        hasUnsavedChanges = false;
        toastr.success('Chunks saved successfully');
    } catch (error) {
        CarrotDebug.error('Failed to save chunks:', error);
        toastr.error('Failed to save chunks: ' + error.message);
    }
}

// =============================================================================
// RENDERING FUNCTIONS
// =============================================================================

function renderChunks(chunks, searchTerm = '') {
    const chunkArray = Object.entries(chunks || {}).map(([hash, data]) => {
        const chunk = { hash, ...data };
        initializeChunkKeywordMetadata(chunk);
        return chunk;
    });

    // Filter chunks by search term
    const normalizedSearch = (searchTerm ?? '').toLowerCase().trim();
    const filtered = normalizedSearch
        ? chunkArray.filter(chunk => {
            const text = (chunk.text || '').toLowerCase();
            const section = (chunk.section || '').toLowerCase();
            const topic = (chunk.topic || '').toLowerCase();
            const tags = ensureArrayValue(chunk.tags).map(tag => tag.toLowerCase());
            const keywords = ensureArrayValue(chunk.keywords).map(keyword => keyword.toLowerCase());
            const customKeywords = ensureArrayValue(chunk.customKeywords).map(keyword => keyword.toLowerCase());
            return (
                text.includes(normalizedSearch) ||
                section.includes(normalizedSearch) ||
                topic.includes(normalizedSearch) ||
                tags.some(tag => tag.includes(normalizedSearch)) ||
                keywords.some(keyword => keyword.includes(normalizedSearch)) ||
                customKeywords.some(keyword => keyword.includes(normalizedSearch))
            );
        })
        : chunkArray;

    // Calculate stats
    const totalSize = filtered.reduce((sum, c) => sum + (c.text?.length || 0), 0);
    const avgSize = filtered.length ? Math.round(totalSize / filtered.length) : 0;
    const sectionCount = [...new Set(filtered.map(c => c.section).filter(Boolean))].length;

    // Update stats display
    $('#carrot-rag-chunk-stats').html(`
        <div class="chunk-stat">
            <i class="fa-solid fa-layer-group"></i>
            <span class="chunk-stat__label">Showing</span>
            <span class="chunk-stat__value">${filtered.length}</span>
            <span class="chunk-stat__divider">/</span>
            <span class="chunk-stat__value">${chunkArray.length}</span>
        </div>
        <div class="chunk-stat">
            <i class="fa-solid fa-ruler-horizontal"></i>
            <span class="chunk-stat__label">Total</span>
            <span class="chunk-stat__value">${totalSize.toLocaleString()} chars</span>
        </div>
        <div class="chunk-stat">
            <i class="fa-solid fa-scale-balanced"></i>
            <span class="chunk-stat__label">Average</span>
            <span class="chunk-stat__value">${avgSize} chars</span>
        </div>
        <div class="chunk-stat">
            <i class="fa-solid fa-diagram-project"></i>
            <span class="chunk-stat__label">Sections</span>
            <span class="chunk-stat__value">${sectionCount}</span>
        </div>
    `);

    const container = $('#carrot-rag-chunks-container');
    if (!filtered.length) {
        container.html(`
            <div class="chunk-empty-state">
                <i class="fa-solid fa-eye-slash"></i>
                <p>No chunks match your filters.</p>
            </div>
        `);
        return;
    }

    // Render all chunks
    const html = filtered.map(chunk => renderChunkCard(chunk)).join('');
    container.html(html);

    // Initialize keyword input mode setting
    if (typeof extension_settings[extensionName] === 'undefined') {
        extension_settings[extensionName] = {};
    }
    if (typeof extension_settings[extensionName].keyword_input_plaintext === 'undefined') {
        extension_settings[extensionName].keyword_input_plaintext = false;
    }

    // Initialize select2 on all keyword selects after DOM is ready
    setTimeout(() => {
        filtered.forEach(chunk => {
            initializeKeywordSelector(chunk);
            updateTokenCount(chunk.hash);
        });
    }, 10);
}

function renderChunkCard(chunk) {
    const chunkHashAttr = escapeHtml(chunk.hash);
    const sectionTitle = escapeHtml(chunk.section || 'Untitled');
    const topicTitle = chunk.topic ? ` &bull; ${escapeHtml(chunk.topic)}` : '';
    const isEditing = !!chunk._editing;

    const systemKeywords = ensureArrayValue(chunk.systemKeywords);
    const customKeywords = ensureArrayValue(chunk.customKeywords);
    const disabledSet = new Set(ensureArrayValue(chunk.disabledKeywords).map(normalizeKeywordClient));
    const customKeywordSet = new Set(customKeywords.map(normalizeKeywordClient));
    const activeKeywords = ensureArrayValue(chunk.keywords);
    const systemRegex = normalizeRegexList(chunk.keywordRegex);
    const customRegex = normalizeRegexList(chunk.customRegex);

    if (!chunk.linkedSections) chunk.linkedSections = [];
    if (!chunk.customWeights) chunk.customWeights = {};
    if (!chunk.chunkLinks) chunk.chunkLinks = [];

    const getWeight = (keyword, normalized) => {
        const defaultPriority = fullsheetAPI.getKeywordPriority ? fullsheetAPI.getKeywordPriority(keyword) : 20;
        const customWeight = chunk.customWeights[normalized];
        return customWeight !== undefined
            ? customWeight
            : (customKeywordSet.has(normalized) ? CUSTOM_KEYWORD_PRIORITY : defaultPriority);
    };

    // Sort keywords by weight
    const sortedKeywords = [...activeKeywords].sort((a, b) => {
        const aNorm = normalizeKeywordClient(a);
        const bNorm = normalizeKeywordClient(b);
        return getWeight(b, bNorm) - getWeight(a, aNorm);
    });

    // Collapsed keyword preview (top 5)
    const topKeywords = sortedKeywords.slice(0, 5);
    const remainingCount = Math.max(0, sortedKeywords.length - 5);
    const collapsedKeywordDisplay = topKeywords.length > 0
        ? `<div class="chunk-keywords-preview">${topKeywords.map(k => {
            const normalized = normalizeKeywordClient(k);
            const weight = getWeight(k, normalized);
            return `<span class="chunk-keyword-mini-badge" title="${escapeHtml(k)} (weight: ${weight})">${escapeHtml(k)}<sup>${weight}</sup></span>`;
        }).join('')}${remainingCount > 0 ? `<span class="chunk-keyword-more-badge" title="Click to expand ${remainingCount} more keywords">+${remainingCount}</span>` : ''}</div>`
        : `<span class="chunk-keywords-preview empty">No keywords</span>`;

    // Metadata badges
    const metadataBadges = `
        <div class="chunk-metadata-badges">
            <span class="chunk-meta-badge chunk-token-counter" data-hash="${chunkHashAttr}" title="Character count">
                <i class="fa-solid fa-cube" style="font-size: 0.8em; margin-right: 2px;"></i>
                <span class="token-count">...</span>
            </span>
            ${chunk.index !== undefined ? `<span class="chunk-meta-badge" title="Chunk index">#${chunk.index}</span>` : ''}
        </div>
    `;

    // Active keyword chips
    const activeKeywordChips = sortedKeywords.map(keyword => {
        const normalized = normalizeKeywordClient(keyword);
        const weight = getWeight(keyword, normalized);
        const isCustom = customKeywordSet.has(normalized);
        const isDisabled = disabledSet.has(normalized);
        const classes = ['chunk-keyword-chip'];
        if (isCustom) classes.push('is-custom');
        if (isDisabled) classes.push('is-disabled');
        return `<span class="${classes.join(' ')}">${escapeHtml(keyword)}<span class="chunk-keyword-chip__weight">${weight}</span></span>`;
    }).join('');

    const activeKeywordHtml = activeKeywordChips
        ? `
            <section class="chunk-keyword-panel">
                <header class="chunk-keyword-panel__header">
                    <span>Active keywords</span>
                    <span>${sortedKeywords.length}</span>
                </header>
                <div class="chunk-keyword-panel__body">
                    ${activeKeywordChips}
                </div>
            </section>
        `
        : '';

    const customKeywordsValue = customKeywords.join(', ');
    const customRegexValue = formatRegexList(customRegex);

    // System keyword grid
    const systemKeywordGrid = systemKeywords.length
        ? systemKeywords.map(keyword => {
            const normalized = normalizeKeywordClient(keyword);
            const checked = !disabledSet.has(normalized);
            const weight = getWeight(keyword, normalized);
            const defaultPriority = fullsheetAPI.getKeywordPriority ? fullsheetAPI.getKeywordPriority(keyword) : 20;
            const hasCustomWeight = chunk.customWeights[normalized] !== undefined;
            return `
                <div class="chunk-weight-row${checked ? '' : ' is-disabled'}">
                    <label class="chunk-weight-row__toggle">
                        <input type="checkbox" class="chunk-weight-row__checkbox carrot-system-keyword-toggle" data-hash="${chunkHashAttr}" data-keyword="${escapeHtml(keyword)}" ${checked ? 'checked' : ''}>
                        <span class="chunk-weight-row__name">${escapeHtml(keyword)}</span>
                    </label>
                    <div class="chunk-weight-row__controls">
                        <input type="number" class="chunk-weight-row__input carrot-keyword-weight-input" data-hash="${chunkHashAttr}" data-keyword="${escapeHtml(keyword)}" value="${weight}" min="1" max="200" title="${hasCustomWeight ? 'Custom weight' : `Default weight: ${defaultPriority}`}">
                        ${hasCustomWeight ? `<button type="button" class="chunk-weight-row__reset carrot-reset-weight-btn" data-hash="${chunkHashAttr}" data-keyword="${escapeHtml(keyword)}" title="Reset to default"><i class="fa-solid fa-rotate"></i></button>` : ''}
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="chunk-keyword-empty">No system keywords detected</div>';

    // Build chunk links
    const chunkLinksArray = ensureArrayValue(chunk.chunkLinks);
    const chunkLinksMap = new Map(chunkLinksArray.map(link => [link.targetHash, link.mode]));

    const incomingLinks = Object.entries(modifiedChunks)
        .filter(([h, c]) => h !== chunk.hash && ensureArrayValue(c.chunkLinks).some(link => link.targetHash === chunk.hash))
        .map(([h, c]) => ({
            hash: h,
            title: c.comment || c.section || 'Untitled',
            mode: ensureArrayValue(c.chunkLinks).find(link => link.targetHash === chunk.hash)?.mode || 'soft'
        }));

    const outgoingLinks = chunkLinksArray.map(link => ({
        hash: link.targetHash,
        title: modifiedChunks[link.targetHash]?.comment || modifiedChunks[link.targetHash]?.section || 'Untitled',
        mode: link.mode
    })).filter(link => modifiedChunks[link.hash]);

    const availableChunks = Object.entries(modifiedChunks)
        .filter(([h, c]) => h !== chunk.hash)
        .map(([h, c]) => ({
            hash: h,
            title: c.comment || c.section || 'Untitled',
            linked: chunkLinksMap.has(h),
            mode: chunkLinksMap.get(h) || 'soft'
        }));

    // Editing content
    const editingContent = `
        <div class="world_entry_edit">
            <div class="flex-container wide100p alignitemscenter">
                <div class="world_entry_form_control keyprimary flex1">
                    <small class="textAlignCenter">Primary Keywords</small>
                    <select class="keyprimaryselect keyselect carrot-chunk-keywords" name="key" data-hash="${chunkHashAttr}" placeholder="Keywords or Regexes" multiple="multiple" style="display: none;"></select>
                    <textarea class="text_pole carrot-chunk-keywords-plaintext" name="key" data-hash="${chunkHashAttr}" rows="2" placeholder="Comma separated list" style="display: none;"></textarea>
                    <button type="button" class="carrot-switch-input-type-icon" data-hash="${chunkHashAttr}" tabindex="-1" title="Switch to plaintext mode" data-icon-on="✨" data-icon-off="⌨️" data-tooltip-on="Switch to fancy mode" data-tooltip-off="Switch to plaintext mode">⌨️</button>
                </div>
            </div>

            <div class="world_entry_thin_controls flex-container flexFlowColumn">
                <div class="world_entry_form_control flex1">
                    <label for="content">
                        <small><span data-i18n="Content">Content</span></small>
                    </label>
                    ${chunkFormattingEnabled
                        ? `<div class="chunk-formatted-display" data-hash="${chunkHashAttr}" style="cursor: pointer; padding: 10px; border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1)); border-radius: 4px; min-height: 100px;" title="Click to edit">${formatChunkText(chunk.text || '')}</div>`
                        : `<textarea class="text_pole autoSetHeight carrot-chunk-text-edit" name="content" data-hash="${chunkHashAttr}" placeholder="Chunk content...">${escapeHtml(chunk.text || '')}</textarea>`
                    }
                </div>
            </div>

            <div class="world_entry_thin_controls" style="margin-top: 12px; border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1)); border-radius: 6px; padding: 10px; background: var(--black10a, rgba(0,0,0,0.1));">
                <div class="flex-container alignitemscenter wide100p" style="gap: 10px; margin-bottom: 8px;">
                    <div class="flex1">
                        <div class="flex-container alignitemscenter" style="gap: 6px; margin-bottom: 6px;">
                            <span class="fa-solid fa-circle-info" style="color: #3b82f6; font-size: 0.9em;" title="Only one entry with the same label will be activated"></span>
                            <small>Inclusion Group</small>
                        </div>
                        <input type="text" class="text_pole carrot-inclusion-group-input" data-hash="${chunkHashAttr}" placeholder="Group label..." value="${escapeHtml(chunk.inclusionGroup || '')}" />
                    </div>
                    <label class="checkbox_label flex-container alignitemscenter" title="Prioritize this chunk within its inclusion group" style="flex-shrink: 0; gap: 4px;">
                        <span class="fa-solid fa-circle" style="color: #3b82f6; font-size: 0.6em;"></span>
                        <input type="checkbox" class="carrot-inclusion-prioritize" data-hash="${chunkHashAttr}" ${chunk.inclusionPrioritize ? 'checked' : ''}>
                        <small>Prioritize</small>
                    </label>
                </div>
                <small style="opacity: 0.7; font-size: 0.85em; display: block;">Only one entry with the same label will be activated</small>
            </div>

            ${(incomingLinks.length > 0 || outgoingLinks.length > 0) ? `
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
            ` : ''}

            <div class="inline-drawer wide100p flexFlowColumn" style="margin-top: 12px;">
                <div class="inline-drawer-toggle inline-drawer-header" style="cursor: pointer;" data-hash="${chunkHashAttr}">
                    <strong>Linked Chunks ${outgoingLinks.length > 0 ? `<span style="opacity: 0.6;">(${outgoingLinks.length})</span>` : ''}</strong>
                    <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                </div>
                <div class="inline-drawer-content paddingBottom5px" style="display: none; padding: 10px; max-height: 400px; overflow-y: auto;">
                    ${availableChunks.length === 0 ? `
                        <small style="opacity: 0.6;">No other chunks available to link</small>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            ${availableChunks.map(target => `
                                <label class="checkbox flex-container alignItemsCenter flexNoGap" title="${escapeHtml(target.title)}${target.linked ? ` (${target.mode === 'force' ? 'Force' : 'Soft'} link)` : ''}" style="word-break: break-word;">
                                    <input type="checkbox" class="carrot-chunk-link-checkbox" data-hash="${chunkHashAttr}" data-target="${escapeHtml(target.hash)}" ${target.linked ? 'checked' : ''}>
                                    <span style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                        <span style="word-break: break-word;">${escapeHtml(target.title)}</span>
                                        ${target.linked ? `<span class="fa-solid fa-${target.mode === 'force' ? 'bolt' : 'arrow-up'}" style="color: ${target.mode === 'force' ? 'var(--SmartThemeQuoteColor)' : 'var(--SmartThemeEmColor)'}; font-size: 0.7em;"></span>` : ''}
                                    </span>
                                </label>
                            `).join('')}
                        </div>
                    `}
                </div>
                ${availableChunks.length > 0 ? `
                    <div class="flex-container alignitemscenter" style="gap: 12px; padding: 10px 10px 5px 10px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1)); display: none;">
                        <small style="opacity: 0.7;">Link Mode:</small>
                        <label class="checkbox_label flex-container alignitemscenter flexNoGap" style="gap: 4px;">
                            <input type="radio" name="chunk-link-mode-${chunkHashAttr}" value="soft" class="carrot-link-mode-radio" data-hash="${chunkHashAttr}" checked>
                            <small><span class="fa-solid fa-arrow-up" style="color: var(--SmartThemeEmColor);"></span> Soft</small>
                        </label>
                        <label class="checkbox_label flex-container alignitemscenter flexNoGap" style="gap: 4px;">
                            <input type="radio" name="chunk-link-mode-${chunkHashAttr}" value="force" class="carrot-link-mode-radio" data-hash="${chunkHashAttr}">
                            <small><span class="fa-solid fa-bolt" style="color: var(--SmartThemeQuoteColor);"></span> Force</small>
                        </label>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    const isOpen = !!isEditing;
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
                            <div class="inline-drawer-toggle fa-fw fa-solid ${chevronClass} inline-drawer-icon carrot-chunk-toggle-drawer" data-hash="${chunkHashAttr}" aria-expanded="${isOpen ? 'true' : 'false'}"></div>
                            <div class="fa-solid ${chunk.disabled ? 'fa-toggle-off' : 'fa-toggle-on'} carrot-chunk-toggle-enabled" data-hash="${chunkHashAttr}" title="${chunk.disabled ? 'Chunk is disabled - click to enable' : 'Chunk is enabled - click to disable'}" style="cursor: pointer; color: ${chunk.disabled ? 'var(--grey70)' : 'var(--SmartThemeQuoteColor)'}"></div>
                            <div class="flex-container alignitemscenter wide100p flexNoGap">
                                <div class="WIEntryTitleAndStatus flex-container flex1 alignitemscenter">
                                    <div class="flex-container flex1">
                                        <textarea class="text_pole chunk-title-field carrot-chunk-title-edit" data-hash="${chunkHashAttr}" rows="1" placeholder="Entry Title/Memo" style="resize: none;">${chunk.comment || sectionTitle}${topicTitle}</textarea>
                                    </div>
                                </div>
                                <div class="chunk-header-right">
                                    ${collapsedKeywordDisplay}
                                    ${metadataBadges}
                                </div>
                            </div>
                        </div>
                        <i class="menu_button fa-solid fa-arrows-rotate carrot-chunk-refresh-btn" data-hash="${chunkHashAttr}" title="Regenerate keywords from current content" style="margin-right: 8px;"></i>
                        <i class="menu_button fa-solid fa-trash-can carrot-chunk-delete-btn" data-hash="${chunkHashAttr}" title="Delete chunk"></i>
                    </div>
                    <div class="${bodyClasses.join(' ')}" ${bodyStyle}>
                        ${editingContent}
                    </div>
                </div>
            </form>
        </div>
    `;
}

// =============================================================================
// SELECT2 INITIALIZATION
// =============================================================================

function initializeKeywordSelector(chunk) {
    const hash = chunk.hash;
    const $select = $(`.carrot-chunk-keywords[data-hash="${hash}"]`);
    const $textarea = $(`.carrot-chunk-keywords-plaintext[data-hash="${hash}"]`);
    const $switchBtn = $(`.carrot-switch-input-type-icon[data-hash="${hash}"]`);

    if (!$select.length) return;

    const isPlaintext = extension_settings[extensionName].keyword_input_plaintext || false;

    const systemKeywords = ensureArrayValue(chunk.systemKeywords);
    const customKeywords = ensureArrayValue(chunk.customKeywords);
    const allKeywords = [...new Set([...systemKeywords, ...customKeywords])];
    const customKeywordSet = new Set(customKeywords.map(normalizeKeywordClient));
    const disabledSet = new Set(ensureArrayValue(chunk.disabledKeywords).map(normalizeKeywordClient));

    if (!chunk.customWeights) chunk.customWeights = {};

    const getWeight = (keyword) => {
        const normalized = normalizeKeywordClient(keyword);
        const defaultPriority = fullsheetAPI.getKeywordPriority ? fullsheetAPI.getKeywordPriority(keyword) : 20;
        const customWeight = chunk.customWeights[normalized];
        return customWeight !== undefined
            ? customWeight
            : (customKeywordSet.has(normalized) ? CUSTOM_KEYWORD_PRIORITY : defaultPriority);
    };

    if (!isPlaintext) {
        // Initialize select2
        $select.select2({
            tags: true,
            tokenSeparators: [','],
            placeholder: $select.attr('placeholder'),
            width: '100%',
            templateResult: function(item) {
                const content = $('<span>').addClass('item').text(item.text);
                const isRegex = isValidRegex(item.text);
                if (isRegex) {
                    content.html(highlightRegex(item.text));
                    content.addClass('regex_item').prepend($('<span>').addClass('regex_icon').text('•*').attr('title', 'Regex'));
                }
                return content;
            },
            templateSelection: function(item) {
                const keyword = item.text;
                const isRegex = isValidRegex(keyword);
                const normalized = normalizeKeywordClient(keyword);
                const weight = getWeight(keyword);

                if (isRegex) {
                    const $regexTag = $('<span>').addClass('item').addClass('regex_item');
                    $regexTag.prepend($('<span>').addClass('regex_icon').text('•*'));
                    $regexTag.append(' ').append($(highlightRegex(keyword)));
                    const $weight = createWeightBadge(keyword, hash, weight);
                    $regexTag.append(' [').append($weight).append(']');
                    return $regexTag;
                }

                const isCustom = customKeywordSet.has(normalized);
                const isDisabled = disabledSet.has(normalized);
                const $tag = $('<span>').addClass('item');
                const $text = $('<span>').addClass('keyword-text').text(keyword);
                const $weight = createWeightBadge(keyword, hash, weight);
                $tag.append($text).append(' [').append($weight).append(']');

                if (isCustom) $tag.css('color', 'var(--SmartThemeQuoteColor)');
                if (isDisabled) $tag.css('opacity', '0.5');

                return $tag;
            }
        });

        // Populate with current keywords WITH WEIGHTS
        allKeywords.forEach(keyword => {
            const option = new Option(keyword, keyword, true, true);
            $select.append(option);
        });
        $select.trigger('change');

        $select.show();
        $textarea.hide();
        $switchBtn.text('⌨️').attr('title', 'Switch to plaintext mode');
    } else {
        // Plaintext mode - show keyword:weight format
        const keywordsWithWeights = allKeywords.map(keyword => {
            const weight = getWeight(keyword);
            return `${keyword}:${weight}`;
        }).join(', ');
        $textarea.val(keywordsWithWeights);
        $textarea.show();
        $select.hide();
        $switchBtn.text('✨').attr('title', 'Switch to fancy mode');
    }

    // Switch button handler
    $switchBtn.off('click').on('click', function() {
        extension_settings[extensionName].keyword_input_plaintext = !extension_settings[extensionName].keyword_input_plaintext;
        // Only re-render this specific chunk
        const $chunkCard = $(`.world_entry[data-hash="${hash}"]`);
        if ($chunkCard.length) {
            const chunkData = modifiedChunks[hash];
            if (chunkData) {
                chunkData._editing = true; // Keep it expanded
                const newCard = renderChunkCard(chunkData);
                $chunkCard.replaceWith(newCard);
                // Re-initialize select2 for this chunk only
                setTimeout(() => {
                    initializeKeywordSelector(chunkData);
                }, 10);
            }
        }
    });

    // Save on change - DON'T re-render
    $select.off('change').on('change', function() {
        const selectedKeywords = $(this).val() || [];
        chunk.customKeywords = selectedKeywords.filter(k => !systemKeywords.includes(k));
        initializeChunkKeywordMetadata(chunk);
        hasUnsavedChanges = true;
        CarrotDebug.ui('Keywords updated:', chunk.customKeywords);
    });

    $textarea.off('change').on('change', function() {
        const keywordsText = $(this).val().trim();
        if (!keywordsText) {
            chunk.customKeywords = [];
            initializeChunkKeywordMetadata(chunk);
            hasUnsavedChanges = true;
            return;
        }

        // Parse keyword:weight format
        const entries = keywordsText.split(',').map(k => k.trim()).filter(Boolean);
        const keywords = [];

        entries.forEach(entry => {
            const parts = entry.split(':');
            const keyword = parts[0].trim();
            const weight = parts[1] ? parseInt(parts[1].trim()) : null;

            if (keyword) {
                keywords.push(keyword);

                // Save custom weight if provided
                if (weight !== null && !isNaN(weight)) {
                    const normalized = normalizeKeywordClient(keyword);
                    if (!chunk.customWeights) chunk.customWeights = {};
                    chunk.customWeights[normalized] = Math.max(1, Math.min(200, weight));
                }
            }
        });

        chunk.customKeywords = keywords.filter(k => !systemKeywords.includes(k));
        initializeChunkKeywordMetadata(chunk);
        hasUnsavedChanges = true;
    });
}

function createWeightBadge(keyword, hash, weight) {
    return $('<span>')
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
        .on('mousedown', e => e.stopPropagation())
        .on('click', function(e) {
            e.stopPropagation();
            $(this).select();
        })
        .on('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                $(this).blur();
            }
            if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                e.preventDefault();
            }
        })
        .on('blur', function() {
            const newWeight = parseInt($(this).text()) || weight;
            const clampedWeight = Math.max(1, Math.min(200, newWeight));
            const normalized = normalizeKeywordClient(keyword);
            if (!modifiedChunks[hash].customWeights) modifiedChunks[hash].customWeights = {};
            modifiedChunks[hash].customWeights[normalized] = clampedWeight;
            hasUnsavedChanges = true;
            $(this).text(clampedWeight); // Update display without re-rendering
            CarrotDebug.ui(`✅ Weight saved for "${keyword}": ${clampedWeight}`);
        });
}

// =============================================================================
// TOKEN COUNTING
// =============================================================================

async function updateTokenCount(hash) {
    const chunk = modifiedChunks[hash];
    if (!chunk) return;

    const $counter = $(`.chunk-token-counter[data-hash="${hash}"] .token-count`);
    if (!$counter.length) return;

    try {
        const count = await getTokenCountAsync(chunk.text || '');
        $counter.text(count);
    } catch {
        $counter.text((chunk.text || '').length);
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function bindChunkVisualizerEvents() {
    const $container = $('#carrot-rag-chunks-container');

    // Close/Cancel buttons
    $('#carrot-rag-modal-close, #carrot-rag-modal-cancel').off('click').on('click', closeChunkVisualizer);

    // Save button
    $('#carrot-rag-modal-save').off('click').on('click', saveChunkChanges);

    // Search
    $('#carrot-rag-chunk-search').off('input').on('input', function() {
        renderChunks(modifiedChunks, $(this).val());
    });

    // Format toggle
    $('#carrot-rag-format-toggle').off('click').on('click', function() {
        chunkFormattingEnabled = !chunkFormattingEnabled;
        const $label = $(this).find('.chunk-format-label');
        $label.text(chunkFormattingEnabled ? 'Formatted' : 'Plain');
        extension_settings[extensionName].rag.chunkFormattingEnabled = chunkFormattingEnabled;
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Add Chunk functionality
    $('#carrot-rag-add-chunk').off('click').on('click', function() {
        // Create a new chunk with template structure
        const newHash = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newChunk = {
            text: '',
            comment: 'New Chunk',
            section: 'Custom Section',
            topic: null,
            tags: [],
            keywords: [],
            systemKeywords: [],
            defaultSystemKeywords: [],
            keywordGroups: [],
            defaultKeywordGroups: [],
            keywordRegex: [],
            defaultKeywordRegex: [],
            customKeywords: [],
            customRegex: [],
            disabledKeywords: [],
            customWeights: {},
            index: Object.keys(modifiedChunks).length,
            _editing: true, // Open by default
        };

        modifiedChunks[newHash] = newChunk;
        hasUnsavedChanges = true;
        toastr.success('New chunk created! Remember to save when done.');
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Toggle chunk expansion
    $container.off('click', '.carrot-chunk-toggle-drawer').on('click', '.carrot-chunk-toggle-drawer', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk._editing = !chunk._editing;
            renderChunks(modifiedChunks, getSearchTerm());
        }
    });

    // Toggle chunk enabled/disabled
    $container.off('click', '.carrot-chunk-toggle-enabled').on('click', '.carrot-chunk-toggle-enabled', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk.disabled = !chunk.disabled;
            hasUnsavedChanges = true;
            renderChunks(modifiedChunks, getSearchTerm());
        }
    });

    // Delete chunk
    $container.off('click', '.carrot-chunk-delete-btn').on('click', '.carrot-chunk-delete-btn', function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        if (confirm('Delete this chunk? This cannot be undone.')) {
            delete modifiedChunks[hash];
            hasUnsavedChanges = true;
            renderChunks(modifiedChunks, getSearchTerm());
            toastr.success('Chunk deleted');
        }
    });

    // Refresh keywords
    $container.off('click', '.carrot-chunk-refresh-btn').on('click', '.carrot-chunk-refresh-btn', async function(e) {
        e.stopPropagation();
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (!chunk || !fullsheetAPI.regenerateChunkKeywords) return;

        const $btn = $(this);
        $btn.addClass('fa-spin');

        try {
            await fullsheetAPI.regenerateChunkKeywords(chunk);
            initializeChunkKeywordMetadata(chunk);
            hasUnsavedChanges = true;
            renderChunks(modifiedChunks, getSearchTerm());
            toastr.success('Keywords regenerated');
        } catch (error) {
            CarrotDebug.error('Failed to regenerate keywords:', error);
            toastr.error('Failed to regenerate keywords');
        } finally {
            $btn.removeClass('fa-spin');
        }
    });

    // Edit title
    $container.off('change', '.carrot-chunk-title-edit').on('change', '.carrot-chunk-title-edit', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk.comment = $(this).val().trim();
            hasUnsavedChanges = true;
        }
    });

    // Edit chunk text
    $container.off('change', '.carrot-chunk-text-edit').on('change', '.carrot-chunk-text-edit', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk.text = $(this).val();
            hasUnsavedChanges = true;
            updateTokenCount(hash);
        }
    });

    // Click formatted text to edit
    $container.off('click', '.chunk-formatted-display').on('click', '.chunk-formatted-display', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (!chunk) return;

        const newText = prompt('Edit chunk text:', chunk.text || '');
        if (newText !== null && newText !== chunk.text) {
            chunk.text = newText;
            hasUnsavedChanges = true;
            renderChunks(modifiedChunks, getSearchTerm());
        }
    });

    // Edit inclusion group
    $container.off('change', '.carrot-inclusion-group-input').on('change', '.carrot-inclusion-group-input', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk.inclusionGroup = $(this).val().trim();
            hasUnsavedChanges = true;
        }
    });

    // Toggle inclusion prioritize
    $container.off('change', '.carrot-inclusion-prioritize').on('change', '.carrot-inclusion-prioritize', function() {
        const hash = $(this).data('hash');
        const chunk = modifiedChunks[hash];
        if (chunk) {
            chunk.inclusionPrioritize = $(this).is(':checked');
            hasUnsavedChanges = true;
        }
    });

    // Toggle linked chunks drawer (FIXED - only respond to click, not hover)
    $container.off('click', '.inline-drawer-toggle.inline-drawer-header').on('click', '.inline-drawer-toggle.inline-drawer-header', function(e) {
        e.stopPropagation();

        // Don't trigger if clicking the main chunk toggle
        if ($(e.target).closest('.carrot-chunk-toggle-drawer').length) return;

        const $drawer = $(this).closest('.inline-drawer');
        const $content = $drawer.find('.inline-drawer-content').first();
        const $icon = $(this).find('.inline-drawer-icon');
        const $linkMode = $drawer.find('.flex-container.alignitemscenter[style*="border-top"]');

        if ($content.is(':visible')) {
            $content.slideUp(200);
            if ($linkMode.length) $linkMode.slideUp(200);
            $icon.removeClass('up fa-circle-chevron-up').addClass('down fa-circle-chevron-down');
        } else {
            $content.slideDown(200);
            if ($linkMode.length) $linkMode.slideDown(200);
            $icon.removeClass('down fa-circle-chevron-down').addClass('up fa-circle-chevron-up');
        }
    });

    // Chunk linking checkboxes
    $container.off('change', '.carrot-chunk-link-checkbox').on('change', '.carrot-chunk-link-checkbox', function() {
        const hash = $(this).data('hash');
        const targetHash = $(this).data('target');
        const chunk = modifiedChunks[hash];
        if (!chunk) return;

        if (!chunk.chunkLinks) chunk.chunkLinks = [];

        if ($(this).is(':checked')) {
            const mode = $(`input[name="chunk-link-mode-${hash}"]:checked`).val() || 'soft';
            const existingIndex = chunk.chunkLinks.findIndex(link => link.targetHash === targetHash);
            if (existingIndex >= 0) {
                chunk.chunkLinks[existingIndex].mode = mode;
            } else {
                chunk.chunkLinks.push({ targetHash, mode });
            }
        } else {
            chunk.chunkLinks = chunk.chunkLinks.filter(link => link.targetHash !== targetHash);
        }

        hasUnsavedChanges = true;
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Link mode radio buttons
    $container.off('change', '.carrot-link-mode-radio').on('change', '.carrot-link-mode-radio', function() {
        const hash = $(this).data('hash');
        const mode = $(this).val();
        const chunk = modifiedChunks[hash];
        if (!chunk || !chunk.chunkLinks) return;

        // Update all currently checked links to use this mode
        const $checkedBoxes = $(`.carrot-chunk-link-checkbox[data-hash="${hash}"]:checked`);
        $checkedBoxes.each(function() {
            const targetHash = $(this).data('target');
            const link = chunk.chunkLinks.find(l => l.targetHash === targetHash);
            if (link) link.mode = mode;
        });

        hasUnsavedChanges = true;
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // System keyword toggle (enable/disable a detected keyword)
    $container.off('change', '.carrot-system-keyword-toggle').on('change', '.carrot-system-keyword-toggle', function() {
        const hash = $(this).data('hash');
        const keyword = $(this).data('keyword');
        const chunk = modifiedChunks[hash];
        if (!chunk) return;

        const normalized = normalizeKeywordClient(keyword);
        chunk.disabledKeywords = ensureArrayValue(chunk.disabledKeywords).map(normalizeKeywordClient);

        if (this.checked) {
            chunk.disabledKeywords = chunk.disabledKeywords.filter(value => value !== normalized);
        } else if (!chunk.disabledKeywords.includes(normalized)) {
            chunk.disabledKeywords.push(normalized);
        }
        initializeChunkKeywordMetadata(chunk);
        hasUnsavedChanges = true;
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Keyword weight input
    $container.off('change', '.carrot-keyword-weight-input').on('change', '.carrot-keyword-weight-input', function() {
        const hash = $(this).data('hash');
        const keyword = $(this).data('keyword');
        const chunk = modifiedChunks[hash];
        if (!chunk) return;

        const newWeight = parseInt($(this).val(), 10);
        const normalized = normalizeKeywordClient(keyword);
        const defaultPriority = fullsheetAPI.getKeywordPriority ? fullsheetAPI.getKeywordPriority(keyword) : 20;

        if (!chunk.customWeights) {
            chunk.customWeights = {};
        }

        // Only store if different from default
        if (newWeight !== defaultPriority && !isNaN(newWeight)) {
            chunk.customWeights[normalized] = newWeight;
        } else {
            delete chunk.customWeights[normalized];
        }

        hasUnsavedChanges = true;
        renderChunks(modifiedChunks, getSearchTerm());
    });

    // Reset weight to default
    $container.off('click', '.carrot-reset-weight-btn').on('click', '.carrot-reset-weight-btn', function() {
        const hash = $(this).data('hash');
        const keyword = $(this).data('keyword');
        const chunk = modifiedChunks[hash];
        if (!chunk || !chunk.customWeights) return;

        const normalized = normalizeKeywordClient(keyword);
        delete chunk.customWeights[normalized];

        hasUnsavedChanges = true;
        renderChunks(modifiedChunks, getSearchTerm());
    });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    formatChunkText,
    normalizeKeywordClient,
    initializeChunkKeywordMetadata,
    ensureArrayValue
};
