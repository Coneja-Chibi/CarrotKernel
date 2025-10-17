/**
 * Baby Bunny Chunking Mode - Visual chunk preview and editor
 * Allows users to preview, edit, and configure chunks before finalizing
 * Layout copied from chunk viewer for consistency
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { parseRegexFromString } from '../../../world-info.js';
import { highlightRegex } from '../../../utils.js';
import { regenerateChunkKeywords } from './fullsheet-rag.js';

const extensionName = 'CarrotKernel';
const CUSTOM_KEYWORD_PRIORITY = 100; // Default weight for custom keywords

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
    console.log('🐰 CHUNKING: openBabyBunnyChunking called', { charName, contentLength: content?.length });

    characterName = charName;
    fullsheetContent = content;

    try {
        // Generate initial chunk preview
        console.log('🐰 CHUNKING: Generating chunk preview...');
        await generateChunkPreview();
        console.log('🐰 CHUNKING: Generated', previewChunks.length, 'chunks');

        // Show the modal
        console.log('🐰 CHUNKING: Showing modal...');
        showChunkingModal();
        console.log('🐰 CHUNKING: Modal should be visible now');
    } catch (error) {
        console.error('🐰 CHUNKING ERROR:', error);
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
    console.log('🐰 CHUNKING: showChunkingModal called');
    createModalIfNeeded();
    console.log('🐰 CHUNKING: Modal created, element exists?', $('#carrot-baby-chunking-modal').length > 0);

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

    console.log('🐰 CHUNKING: Modal display set, is visible?', $modal.is(':visible'));
    console.log('🐰 CHUNKING: Modal has active class?', $modal.hasClass('active'));
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

                            console.log(`✅ Regex weight saved for "${keyword}": ${clampedWeight}`);
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

                        console.log(`✅ Weight saved for "${keyword}": ${clampedWeight}`);
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
        console.error('Failed to finalize chunks:', error);
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
