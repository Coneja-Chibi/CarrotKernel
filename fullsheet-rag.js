/**
 * ============================================================================
 * CARROTKERNEL FULLSHEET RAG SYSTEM
 * ============================================================================
 * Vectorizes character fullsheets and injects semantically relevant chunks
 * instead of the entire fullsheet, reducing context consumption by 80-90%.
 *
 * Features:
 * - Per-character vector collections (prevents trait mixing)
 * - Semantic chunking by section headers (8 sections per fullsheet)
 * - Top-K retrieval (default 3 chunks ~2400 chars vs 15000+ full sheet)
 * - Independent system with experimental toggle
 * - BunnymoTags format compatible
 *
 * Collection Pattern: carrotkernel_char_${characterName}
 *
 * @author CarrotKernel
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================
import {
    eventSource,
    event_types,
    chat,
    saveSettingsDebounced,
    getRequestHeaders,
    setExtensionPrompt,
    extension_prompt_types,
    extension_prompt_roles,
} from '../../../../script.js';
import { getStringHash } from '../../../utils.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { textgen_types, textgenerationwebui_settings } from '../../../textgen-settings.js';
import { oai_settings } from '../../../openai.js';
import { WebLlmVectorProvider } from '../../vectors/webllm.js';

// ============================================================================
// CONSTANTS
// ============================================================================
const extensionName = 'CarrotKernel';
const MODULE_NAME = 'fullsheet-rag';

// Collection ID prefix for CarrotKernel fullsheets
const COLLECTION_PREFIX = 'carrotkernel_char_';

// Section header regex for fullsheet chunking - LANGUAGE-AGNOSTIC & VERY PERMISSIVE
// \S+ matches ANY Unicode non-whitespace (Chinese/Japanese/Korean/Arabic/Cyrillic/etc.)
// Examples: "## SECTION 1/8", "##セクション 1/8", "# 部分 1/8", "SECCIÓN 1/8", "##Раздел 1/8"
const SECTION_HEADER_REGEX = /^#{1,2}\s*\S+\s+\d+\/\d+/mi;

// Minimum size to be considered a fullsheet (3000 chars - more permissive)
const FULLSHEET_MIN_SIZE = 3000;

// BunnymoTags pattern - UNIVERSAL TAG STRUCTURE (works for ALL languages)
// [^\s>]+ matches ANY Unicode non-whitespace (not just English letters)
// Examples: <NAME:John>, <名前:太郎>, <NOMBRE:Juan>, <ИМЯ:Иван>, <이름:철수>, <اسم:أحمد>
const BUNNYMOTAGS_PATTERN = /<[^\s>]+:[^>]+>/;

// Prompt tag used when injecting results into the model
const RAG_PROMPT_TAG = 'carrotkernel_rag';
const RAG_BUTTON_CLASS = 'carrot-rag-fullsheet-button';
const vectorApiSourcesRequiringUrl = ['ollama', 'llamacpp', 'vllm', 'koboldcpp'];
const DEFAULT_SECTION_TITLE = 'Fullsheet';
const MAX_DEBUG_PREVIEW = 180;

const webllmProvider = new WebLlmVectorProvider();

function getCurrentContextLevel() {
    const settings = extension_settings[extensionName]?.rag || {};
    return settings.contextLevel || 'global';
}

function ensureRagState() {
    // CRITICAL: Never overwrite extension_settings[extensionName] completely
    // This would destroy all user settings on page refresh
    if (!extension_settings[extensionName]) {
        // Only initialize if it truly doesn't exist (first-time setup)
        console.warn('⚠️ RAG: extension_settings[extensionName] does not exist - initializing empty object. This should only happen on first load.');
        extension_settings[extensionName] = {};
    }
    if (!extension_settings[extensionName].rag) {
        extension_settings[extensionName].rag = {};
    }
    if (!extension_settings[extensionName].rag.library) {
        extension_settings[extensionName].rag.library = {};
    }
    return extension_settings[extensionName].rag;
}

function getContextualLibrary() {
    const contextLevel = getCurrentContextLevel();
    const context = getContext();

    // Ensure base structure exists
    ensureRagState();
    const ragState = extension_settings[extensionName].rag;

    if (!ragState.libraries) {
        ragState.libraries = {
            global: {},
            character: {},
            chat: {}
        };
    }

    // Get the appropriate library based on context level
    switch (contextLevel) {
        case 'character':
            const charId = context?.characterId;
            if (charId !== null && charId !== undefined) {
                if (!ragState.libraries.character[charId]) {
                    ragState.libraries.character[charId] = {};
                }
                return ragState.libraries.character[charId];
            }
            // Fallback to global if no character
            return ragState.libraries.global;

        case 'chat':
            const chatId = context?.chatId;
            if (chatId) {
                if (!ragState.libraries.chat[chatId]) {
                    ragState.libraries.chat[chatId] = {};
                }
                return ragState.libraries.chat[chatId];
            }
            // Fallback to global if no chat
            return ragState.libraries.global;

        case 'global':
        default:
            return ragState.libraries.global;
    }
}

/**
 * Get ALL contextual libraries relevant to the current chat context
 * Returns: { global: {...}, character: {...}, chat: {...} } with actual library objects
 */
function getAllContextualLibraries() {
    const context = getContext();
    ensureRagState();
    const ragState = extension_settings[extensionName].rag;

    if (!ragState.libraries) {
        ragState.libraries = {
            global: {},
            character: {},
            chat: {}
        };
    }

    const result = {
        global: ragState.libraries.global || {},
        character: null,
        chat: null
    };

    // Add character library if we have a character context
    const charId = context?.characterId;
    if (charId !== null && charId !== undefined) {
        if (!ragState.libraries.character[charId]) {
            ragState.libraries.character[charId] = {};
        }
        result.character = ragState.libraries.character[charId];
    }

    // Add chat library if we have a chat context
    const chatId = context?.chatId;
    if (chatId) {
        if (!ragState.libraries.chat[chatId]) {
            ragState.libraries.chat[chatId] = {};
        }
        result.chat = ragState.libraries.chat[chatId];
    }

    return result;
}

// ============================================================================
// VECTOR API HELPERS
// ============================================================================

/**
 * Retrieve vector settings, preferring the core SillyTavern vectors extension configuration
 * so CarrotKernel stays perfectly in sync with the built-in RAG pipeline.
 * Falls back to local overrides only if the core extension isn't available yet.
 */
function getVectorSettings() {
    const defaults = {
        source: 'transformers',
        use_alt_endpoint: false,
        alt_endpoint_url: '',
        togetherai_model: 'togethercomputer/m2-bert-80M-32k-retrieval',
        openai_model: 'text-embedding-ada-002',
        cohere_model: 'embed-english-v3.0',
        ollama_model: 'mxbai-embed-large',
        ollama_keep: false,
        vllm_model: '',
        webllm_model: '',
        google_model: 'text-embedding-005',
    };

    const coreVectorSettings = extension_settings?.vectors;
    if (coreVectorSettings) {
        return {
            source: coreVectorSettings.source ?? defaults.source,
            use_alt_endpoint: coreVectorSettings.use_alt_endpoint ?? defaults.use_alt_endpoint,
            alt_endpoint_url: coreVectorSettings.alt_endpoint_url ?? defaults.alt_endpoint_url,
            togetherai_model: coreVectorSettings.togetherai_model ?? defaults.togetherai_model,
            openai_model: coreVectorSettings.openai_model ?? defaults.openai_model,
            cohere_model: coreVectorSettings.cohere_model ?? defaults.cohere_model,
            ollama_model: coreVectorSettings.ollama_model ?? defaults.ollama_model,
            ollama_keep: coreVectorSettings.ollama_keep ?? defaults.ollama_keep,
            vllm_model: coreVectorSettings.vllm_model ?? defaults.vllm_model,
            webllm_model: coreVectorSettings.webllm_model ?? defaults.webllm_model,
            google_model: coreVectorSettings.google_model ?? defaults.google_model,
        };
    }

    const ragSettings = extension_settings[extensionName]?.rag || {};
    return {
        source: ragSettings.vectorSource || defaults.source,
        use_alt_endpoint: ragSettings.useAltUrl ?? defaults.use_alt_endpoint,
        alt_endpoint_url: ragSettings.altUrl || defaults.alt_endpoint_url,
        togetherai_model: ragSettings.togetheraiModel || defaults.togetherai_model,
        openai_model: ragSettings.openaiModel || defaults.openai_model,
        cohere_model: ragSettings.cohereModel || defaults.cohere_model,
        ollama_model: ragSettings.ollamaModel || defaults.ollama_model,
        ollama_keep: ragSettings.ollamaKeep ?? defaults.ollama_keep,
        vllm_model: ragSettings.vllmModel || defaults.vllm_model,
        webllm_model: ragSettings.webllmModel || defaults.webllm_model,
        google_model: ragSettings.googleModel || defaults.google_model,
    };
}

/**
 * Builds the base body shared across vector API calls.
 * Mirrors native Vectors extension logic so all backend providers keep working.
 * @param {object} overrides
 * @returns {object}
 */
function getVectorsRequestBody(overrides = {}) {
    const vectors = getVectorSettings();
    const body = Object.assign({}, overrides);

    switch (vectors.source) {
        case 'extras':
            body.extrasUrl = extension_settings.apiUrl;
            body.extrasKey = extension_settings.apiKey;
            break;
        case 'togetherai':
            body.model = vectors.togetherai_model;
            break;
        case 'openai':
        case 'mistral':
            body.model = vectors.openai_model;
            break;
        case 'nomicai':
            // No client configuration required; handled server-side with stored secret
            break;
        case 'cohere':
            body.model = vectors.cohere_model;
            break;
        case 'ollama':
            body.model = vectors.ollama_model;
            body.apiUrl = vectors.use_alt_endpoint && vectors.alt_endpoint_url
                ? vectors.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.OLLAMA];
            body.keep = !!vectors.ollama_keep;
            break;
        case 'llamacpp':
            body.apiUrl = vectors.use_alt_endpoint && vectors.alt_endpoint_url
                ? vectors.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP];
            break;
        case 'vllm':
            body.model = vectors.vllm_model;
            body.apiUrl = vectors.use_alt_endpoint && vectors.alt_endpoint_url
                ? vectors.alt_endpoint_url
                : textgenerationwebui_settings.server_urls[textgen_types.VLLM];
            break;
        case 'webllm':
            body.model = vectors.webllm_model;
            break;
        case 'palm':
            body.model = vectors.google_model;
            body.api = 'makersuite';
            break;
        case 'vertexai':
            body.model = vectors.google_model;
            body.api = 'vertexai';
            body.vertexai_auth_mode = oai_settings.vertexai_auth_mode;
            body.vertexai_region = oai_settings.vertexai_region;
            body.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
            break;
        default:
            break;
    }

    return body;
}

/**
 * Build additional arguments required by some embeddings backends.
 * @param {string[]} items
 * @returns {Promise<object>}
 */
async function getAdditionalVectorArgs(items) {
    const vectors = getVectorSettings();

    switch (vectors.source) {
        case 'webllm': {
            if (!items.length) return {};
            const embeddings = await webllmProvider.embedTexts(items, vectors.webllm_model);
            const result = {};
            for (let i = 0; i < items.length; i++) {
                result[items[i]] = embeddings[i];
            }
            return { embeddings: result };
        }
        case 'koboldcpp': {
            if (!items.length) return {};
            const response = await fetch('/api/backends/kobold/embed', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    items: items,
                    server: vectors.use_alt_endpoint && vectors.alt_endpoint_url
                        ? vectors.alt_endpoint_url
                        : textgenerationwebui_settings.server_urls[textgen_types.KOBOLDCPP],
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get KoboldCpp embeddings');
            }

            const { embeddings, model } = await response.json();
            return { embeddings, model };
        }
        default:
            return {};
    }
}

/**
 * Basic validation to help users notice incomplete configuration (e.g. Ollama without URL).
 */
function ensureVectorConfig() {
    const vectors = getVectorSettings();
    if (vectorApiSourcesRequiringUrl.includes(vectors.source) && !vectors.use_alt_endpoint && !vectors.alt_endpoint_url) {
        console.warn(`CarrotKernel RAG: Source "${vectors.source}" usually needs a server URL. Set one in the Vectors extension if you see embedding errors.`);
    }
}

/**
 * Get saved hashes for a collection (checks if collection exists)
 */
async function apiGetSavedHashes(collectionId) {
    ensureVectorConfig();
    const body = {
        ...getVectorsRequestBody(await getAdditionalVectorArgs([])),
        collectionId: collectionId,
        source: getVectorSettings().source,
    };
    debugLog('[API] apiGetSavedHashes request body:', body); // ADDED

    const response = await fetch('/api/vector/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(body), // MODIFIED to use body var
    });

    if (!response.ok) {
        const errorText = await response.text(); // ADDED
        debugLog('[API] apiGetSavedHashes ERROR:', { status: response.status, text: errorText }); // ADDED
        throw new Error(`Failed to get saved hashes for collection ${collectionId}. Status: ${response.status}. Message: ${errorText}`); // MODIFIED
    }

    const jsonResponse = await response.json(); // ADDED
    debugLog('[API] apiGetSavedHashes SUCCESS response:', jsonResponse); // ADDED
    return jsonResponse; // MODIFIED
}

/**
 * Insert vector items into a collection
 */
async function apiInsertVectorItems(collectionId, items) {
    ensureVectorConfig();

    const args = await getAdditionalVectorArgs(items.map(item => item.text));
    const body = {
        ...getVectorsRequestBody(args),
        collectionId: collectionId,
        items: items.map(item => ({
            hash: item.hash,
            text: item.text,
            index: item.index,
        })),
        source: getVectorSettings().source,
    };
    debugLog('[API] apiInsertVectorItems request body:', body); // ADDED

    const response = await fetch('/api/vector/insert', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(body), // MODIFIED
    });

    if (!response.ok) {
        const errorText = await response.text(); // ADDED
        debugLog('[API] apiInsertVectorItems ERROR:', { status: response.status, text: errorText }); // ADDED
        throw new Error(`Failed to insert vector items for collection ${collectionId}. Status: ${response.status}. Message: ${errorText}`); // MODIFIED
    }
    debugLog('[API] apiInsertVectorItems SUCCESS'); // ADDED
}

/**
 * Query a vector collection
 */
async function apiQueryCollection(collectionId, searchText, topK, threshold = 0.2) {
    ensureVectorConfig();

    const args = await getAdditionalVectorArgs([searchText]);

    const response = await fetch('/api/vector/query', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionId: collectionId,
            searchText: searchText,
            topK: topK,
            source: getVectorSettings().source,
            threshold: threshold,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to query collection ${collectionId}`);
    }

    return await response.json();
}

/**
 * Delete specific hashes from a vector collection
 */
async function apiDeleteVectorHashes(collectionId, hashes) {
    ensureVectorConfig();

    const response = await fetch('/api/vector/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            collectionId: collectionId,
            hashes: hashes,
            source: getVectorSettings().source,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete vectors from ${collectionId}. Status: ${response.status}. Message: ${errorText}`);
    }

    return await response.json();
}

/**
 * Delete an entire vector collection
 */
async function apiDeleteCollection(collectionId) {
    ensureVectorConfig();

    const response = await fetch('/api/vector/purge', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            collectionId: collectionId,
            source: getVectorSettings().source,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to purge collection ${collectionId}. Status: ${response.status}. Message: ${errorText}`);
    }

    return await response.json();
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get RAG settings with defaults
 */
function getRAGSettings() {
    const ragState = ensureRagState();

    return {
        enabled: ragState.enabled ?? false,
        simpleChunking: ragState.simpleChunking ?? false,
        chunkSize: ragState.chunkSize ?? 1000,
        chunkOverlap: ragState.chunkOverlap ?? 300,
        topK: ragState.topK ?? 3,
        scoreThreshold: ragState.scoreThreshold ?? 0.15,
        queryContext: ragState.queryContext ?? 3, // Number of recent messages to use for query
        injectionDepth: ragState.injectionDepth ?? 4,
        injectionRole: ragState.injectionRole ?? 'system',
        autoVectorize: ragState.autoVectorize ?? true,
        debugMode: ragState.debugMode ?? false,
        smartCrossReference: ragState.smartCrossReference ?? true,
        crosslinkThreshold: ragState.crosslinkThreshold ?? 0.25,
        lastEmbeddingSource: ragState.lastEmbeddingSource ?? null,
        lastEmbeddingModel: ragState.lastEmbeddingModel ?? null,
        keywordFallback: ragState.keywordFallback ?? true,
        keywordFallbackPriority: ragState.keywordFallbackPriority ?? false,
        keywordFallbackLimit: ragState.keywordFallbackLimit ?? 2,
    };
}

/**
 * Save RAG settings
 */
function saveRAGSettings(ragSettings) {
    const ragState = ensureRagState();
    Object.assign(ragState, ragSettings);
    saveSettingsDebounced();
}

/**
 * Debug logging helper
 */
function debugLog(message, data = null) {
    const settings = getRAGSettings();
    if (settings.debugMode) {
        console.log(`🔍 [CarrotKernel RAG] ${message}`, data || '');
    }
}

// ============================================================================
// CHARACTER NAME & COLLECTION
// ============================================================================

/**
 * Generate collection ID for a character
 *
 * @param {string} characterName - Character name
 * @returns {string} Collection ID (e.g., "carrotkernel_char_Atsu")
 */
function generateCollectionId(characterName, contextOverride = null) {
    // Sanitize character name (keep Unicode letters, numbers, and underscores)
    // This preserves non-English characters while removing only problematic symbols
    const sanitized = characterName
        .replace(/[\s\-]+/g, '_')  // Replace spaces and hyphens with underscores
        .replace(/[^\p{L}\p{N}_]/gu, '_')  // Keep Unicode letters (\p{L}), numbers (\p{N}), and underscores
        .replace(/_+/g, '_')  // Collapse multiple underscores
        .replace(/^_|_$/g, '')  // Remove leading/trailing underscores
        .toLowerCase();

    // Include context level in collection ID to prevent cross-contamination
    const contextLevel = contextOverride || getCurrentContextLevel();
    const context = getContext();

    let collectionId = `${COLLECTION_PREFIX}${sanitized}`;

    // Add context suffix based on storage level
    switch(contextLevel) {
        case 'chat':
            const chatId = context?.chatId;
            if (chatId) {
                // Include chat ID to keep chat-level embeddings separate
                const safeChatId = String(chatId).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
                collectionId += `_chat_${safeChatId}`;
            }
            break;
        case 'character':
            const charId = context?.characterId;
            if (charId !== null && charId !== undefined) {
                // Include character ID to keep character-level embeddings separate
                collectionId += `_charid_${charId}`;
            }
            break;
        case 'global':
        default:
            // Global uses just the character name (shared across all contexts)
            break;
    }

    return collectionId;
}

// ============================================================================
// FULLSHEET CHUNKING
// ============================================================================

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
    'his', 'her', 'their', 'he', 'she', 'they', 'them', 'we', 'you', 'i'
]);

/**
 * Very lightweight stemming to help keyword overlap (handles plural/past variations).
 * @param {string} word
 * @returns {string}
 */
function normalizeKeyword(word) {
    // Check if case-sensitive matching is enabled
    const caseSensitive = extension_settings[extensionName]?.rag?.caseSensitiveKeywords || false;

    // If case-sensitive, preserve original case; otherwise lowercase
    let normalized = caseSensitive ? word : word.toLowerCase();

    // Apply stemming only if not case-sensitive (stemming requires lowercase)
    if (!caseSensitive) {
        const replacements = [
            /(?:ing|ingly)$/,
            /(?:edly|edly)$/,
            /(?:edly)$/,
            /(?:tion|tions)$/,
            /(?:ment|ments)$/,
            /(?:ness|nesses)$/,
            /(?:ally|ally)$/,
            /(?:ies)$/,
            /(?:ers|er)$/,
            /(?:less)$/,
            /(?:ful)$/,
            /(?:ous)$/,
            /(?:ly)$/,
            /(?:ed)$/,
            /(?:es)$/,
            /(?:s)$/,
        ];

        for (const regex of replacements) {
            if (regex.test(normalized)) {
                normalized = normalized.replace(regex, '');
                break;
            }
        }

        if (normalized.length < 4) {
            normalized = word.toLowerCase();
        }
    }

    return normalized;
}

const KEYWORD_GROUPS = {
    identity: {
        priority: 35,
        keywords: ['identity', 'introduction', 'name', 'titles', 'title', 'role', 'occupation', 'species', 'gender', 'pronouns', 'age', 'core context', 'summary', 'overview', 'genre', 'archetype'],
    },
    physical: {
        priority: 45,
        keywords: ['physical', 'appearance', 'body', 'physique', 'build', 'height', 'weight', 'hair', 'eyes', 'skin', 'hands', 'aura', 'presence', 'intimate details', 'style', 'fashion'],
        tagHints: ['PHYS', 'BUILD', 'SKIN', 'HAIR', 'STYLE'],
        regexes: [
            { pattern: '\\bphysic(?:al|s)?\\b', flags: 'i' },
            { pattern: '\\bappearance\\b', flags: 'i' },
            { pattern: '\\baura\\b', flags: 'i' },
        ],
    },
    psyche: {
        priority: 55,
        keywords: ['psyche', 'behavior', 'psychology', 'motivation', 'moral', 'value system', 'personality', 'desire', 'fear', 'habit', 'vulnerability', 'growth'],
    },
    relational: {
        priority: 60,
        keywords: ['relationship', 'dynamic', 'bond', 'social', 'loyalty', 'alliances', 'power dynamic', 'manipulation', 'possessive', 'protective', 'interaction'],
        tagHints: ['CHEMISTRY', 'RELATIONSHIP', 'CONFLICT'],
        regexes: [
            { pattern: '\\bpower dynamic', flags: 'i' },
            { pattern: '\\brelationship\\b', flags: 'i' },
        ],
    },
    linguistic: {
        priority: 40,
        keywords: ['linguistic', 'voice', 'tone', 'speech', 'language', 'dialect', 'accent', 'phrases', 'expressions', 'kaomoji', 'verbal', 'communication', 'words', 'word choice'],
    },
    origin: {
        priority: 35,
        keywords: ['origin', 'history', 'backstory', 'timeline', 'legacy', 'heritage', 'ancestry', 'milestones', 'past', 'foundation'],
    },
    aesthetic: {
        priority: 30,
        keywords: ['aesthetic', 'style', 'presentation', 'fashion', 'silhouette', 'design', 'color palette', 'visual identity'],
    },
    chemistry: {
        priority: 90,
        keywords: ['chemistry', 'spark', 'connection', 'compatibility', 'resonance', 'magnetism', 'charge'],
        regexes: [
            { pattern: '\\bchemistry\\b', flags: 'i' },
            { pattern: '\\bmagn(?:etism|etic)\\b', flags: 'i' },
        ],
    },
    dere: {
        priority: 85,
        keywords: ['dere', 'sadodere', 'tsundere', 'yandere', 'oujidere', 'kuudere', 'dandere', 'archetype'],
        tagHints: ['Dere'],
        regexes: [{ pattern: '\\bdere\\b', flags: 'i' }],
    },
    attachment: {
        priority: 95,
        keywords: ['attachment', 'bonding', 'fearful-avoidant', 'anxious', 'security', 'validation', 'trust', 'connection approach', 'conflict integration'],
        tagHints: ['ATTACHMENT'],
        regexes: [
            { pattern: '\\battachment\\b', flags: 'i' },
            { pattern: '\\bavoidant\\b', flags: 'i' },
        ],
    },
    trauma: {
        priority: 120,
        keywords: ['trauma', 'wound', 'wounds', 'scar', 'scarred', 'trigger', 'triggered', 'ptsd', 'flashback', 'fight response', 'freeze response', 'flight response', 'healing', 'coping', 'psychological wound', 'resilience'],
        tagHints: ['TRAUMA', 'WOUND'],
        regexes: [
            { pattern: '\\btrauma\\b', flags: 'i' },
            { pattern: '\\btrigger(?:ed|s)?\\b', flags: 'i' },
            { pattern: '\\bflashback\\b', flags: 'i' },
            { pattern: '\\bptsd\\b', flags: 'i' },
        ],
    },
    boundaries: {
        priority: 130,
        keywords: ['boundary', 'boundaries', 'limit', 'limits', 'consent', 'personal space', 'crossing the line', 'violation', 'respect', 'perimeter', 'barrier', 'invasion', 'permission'],
        tagHints: ['BOUNDARIES', 'CONSENT'],
        regexes: [
            { pattern: '\\bboundar(?:y|ies)\\b', flags: 'i' },
            { pattern: '\\bhard\\s+limit(s)?\\b', flags: 'i' },
            { pattern: '\\bsoft\\s+limit(s)?\\b', flags: 'i' },
            { pattern: '\\bcross(?:ed)?\\s+the\\s+line\\b', flags: 'i' },
            { pattern: '\\bconsent\\b', flags: 'i' },
            { pattern: '\\bpersonal\\s+space\\b', flags: 'i' },
        ],
    },
    flirting: {
        priority: 100,
        keywords: ['flirt', 'flirting', 'seduce', 'seduction', 'tease', 'teasing', 'coax', 'coquette', 'playful touch', 'cruel flirting', 'charm'],
        tagHints: ['FLIRTING'],
        regexes: [
            { pattern: '\\bflirt(?:ing|s)?\\b', flags: 'i' },
            { pattern: '\\bseduce(?:s|d|r)?\\b', flags: 'i' },
            { pattern: '\\bteas(?:e|ing)\\b', flags: 'i' },
        ],
    },
    jealousy: {
        priority: 110,
        keywords: ['jealous', 'jealousy', 'envious', 'possessive', 'territorial', 'threatened', 'insecure', 'clingy'],
        tagHints: ['JEALOUSY'],
        regexes: [
            { pattern: '\\bjealous(?:y)?\\b', flags: 'i' },
            { pattern: '\\bpossessive\\b', flags: 'i' },
            { pattern: '\\bterritorial\\b', flags: 'i' },
        ],
    },
    arousal: {
        priority: 105,
        keywords: ['arousal', 'aroused', 'turned on', 'excited', 'lust', 'desire', 'yearning', 'heated', 'breathless', 'horny'],
        tagHints: ['AROUSAL', 'NSFW'],
        regexes: [
            { pattern: '\\barous(?:al|ed)\\b', flags: 'i' },
            { pattern: '\\blust(?:ful)?\\b', flags: 'i' },
            { pattern: '\\bturned\\s+on\\b', flags: 'i' },
        ],
    },
    conflict: {
        priority: 90,
        keywords: ['conflict', 'resolution', 'de-escalation', 'deescalation', 'mediation', 'negotiation', 'intervention', 'hostility', 'argument', 'dispute', 'reconciliation'],
        tagHints: ['CONFLICT', 'RESOLUTION'],
        regexes: [
            { pattern: '\bconflicts?\b', flags: 'i' },
            { pattern: '\bresolution\b', flags: 'i' },
            { pattern: '\bde-?escalat', flags: 'i' },
        ],
    },
    hiddenDepths: {
        priority: 45,
        keywords: ['hidden', 'secret', 'depths', 'private', 'shame', 'fear', 'mask', 'reality', 'vulnerable', 'concealed'],
    },
    tagSynthesis: {
        priority: 25,
        keywords: ['tag', 'synthesis', 'metadata', 'bunnymotags', 'summary', 'consolidated'],
    },
};

const KEYWORD_PRESETS = [
    { match: /Character Title|Core Identity|Context/i, groups: ['identity'] },
    { match: /Physical Manifestation/i, groups: ['physical'] },
    { match: /Psyche|Behavioral Matrix|Psychological Analysis/i, groups: ['psyche'] },
    { match: /Relational Dynamics|Social Architecture|Relationship/i, groups: ['relational', 'jealousy', 'boundaries'] },
    { match: /Linguistic Signature|Communication DNA/i, groups: ['linguistic'] },
    { match: /Origin Story|Historical Tapestry/i, groups: ['origin'] },
    { match: /Aesthetic Expression|Style Philosophy/i, groups: ['aesthetic'] },
    { match: /Trauma|Resilience/i, groups: ['trauma'] },
    { match: /Boundar/i, groups: ['boundaries'] },
    { match: /Flirt|Flirtation|Flirtation Signature/i, groups: ['flirting', 'arousal'] },
    { match: /Attachment/i, groups: ['attachment'] },
    { match: /Chemistry/i, groups: ['chemistry', 'arousal', 'flirting'] },
    { match: /Dere/i, groups: ['dere', 'flirting'] },
    { match: /Jealousy Dynamics/i, groups: ['jealousy'] },
    { match: /Arousal Architecture/i, groups: ['arousal'] },
    { match: /Conflict Resolution/i, groups: ['conflict', 'boundaries'] },
    { match: /Boundary Architecture/i, groups: ['boundaries'] },
    { match: /Hidden Depths|Secret Architecture/i, groups: ['hiddenDepths'] },
    { match: /Tag Synthesis/i, groups: ['tagSynthesis'] },
];

const KEYWORD_GROUP_REGEX_RULES = KEYWORD_PRESETS
    .filter(preset => preset.regexes)
    .flatMap(preset => preset.regexes || []);

const KEYWORD_PRIORITY_CACHE = new Map();
const KEYWORD_REGEX_LOOKUP = [];

for (const [groupKey, data] of Object.entries(KEYWORD_GROUPS)) {
    const priority = data.priority ?? 20;
    if (Array.isArray(data.keywords)) {
        for (const keyword of data.keywords) {
            KEYWORD_PRIORITY_CACHE.set(normalizeKeyword(keyword), priority);
        }
    }
    if (Array.isArray(data.regexes)) {
        for (const regexEntry of data.regexes) {
            KEYWORD_REGEX_LOOKUP.push({
                group: groupKey,
                pattern: regexEntry.pattern,
                flags: regexEntry.flags || 'i',
                priority,
            });
        }
    }
}

const CUSTOM_KEYWORD_PRIORITY = 140;

function getKeywordPriority(keyword) {
    return KEYWORD_PRIORITY_CACHE.get(normalizeKeyword(keyword)) ?? 20;
}

/**
 * Extract ONLY truly semantic keywords from text - not every single word!
 * Uses frequency analysis and importance weighting.
 * @param {string} text
 * @returns {string[]}
 */
/**
 * Extract keywords using hybrid approach:
 * 1. Title/topic words (language-agnostic)
 * 2. Frequency analysis (language-agnostic)
 * 3. Semantic mapping for English enhancement
 */
function extractKeywords(text, sectionTitle = '', topic = '') {
    // Case-insensitive keyword map for deduplication
    const keywordMap = new Map(); // lowercase -> original word

    // STEP 1: Extract words from title/topic (language-agnostic, high priority)
    const titleText = (sectionTitle + ' ' + topic)
        .replace(/[^\p{L}\s]/gu, ' ') // Keep all letters (Unicode), remove punctuation
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));

    titleText.forEach(word => {
        const lower = word.toLowerCase();
        if (!keywordMap.has(lower)) {
            keywordMap.set(lower, word.toLowerCase());
        }
    });

    // STEP 2: Frequency analysis from text (language-agnostic)
    const tokens = text
        .replace(/[<>]/g, ' ')
        .match(/[\p{L}]{3,}/gu) || []; // Match 3+ letter words (any language)

    const frequency = new Map();
    tokens.forEach(word => {
        const lower = word.toLowerCase();
        if (!STOP_WORDS.has(lower)) {
            frequency.set(lower, (frequency.get(lower) || 0) + 1);
        }
    });

    // Add words that appear 2+ times (balanced threshold)
    for (const [word, count] of frequency.entries()) {
        if (count >= 2 && !keywordMap.has(word)) {
            keywordMap.set(word, word);
        }
    }

    // STEP 3: Only add title-specific semantic keywords if they ACTUALLY appear in the text
    const TITLE_KEYWORD_MAP = {
        'aesthetic': ['aesthetic', 'style'],
        'expression': ['expression'],
        'philosophy': ['philosophy'],
        'origin': ['origin'],
        'history': ['history'],
        'psyche': ['psyche'],
        'behavioral': ['behavior'],
        'relational': ['relationship'],
        'linguistic': ['linguistic'],
        'physical': ['physical'],
        'identity': ['identity'],
        'emotional': ['emotion'],
        'arousal': ['arousal'],
        'trauma': ['trauma'],
    };

    const lowerText = text.toLowerCase();
    const lowerTitle = (sectionTitle + ' ' + topic).toLowerCase();

    for (const [titleKey, semanticWords] of Object.entries(TITLE_KEYWORD_MAP)) {
        // Only add semantic keywords if the title contains the key AND the text contains related terms
        if (lowerTitle.includes(titleKey)) {
            for (const semanticWord of semanticWords) {
                // Only add if it actually appears in THIS chunk's text
                if (lowerText.includes(semanticWord) && !keywordMap.has(semanticWord)) {
                    keywordMap.set(semanticWord, semanticWord);
                }
            }
        }
    }

    // Sort by frequency and limit to 12 keywords (increased from 8)
    const sortedKeywords = Array.from(keywordMap.values()).sort((a, b) => {
        const freqA = frequency.get(a) || 0;
        const freqB = frequency.get(b) || 0;
        return freqB - freqA;
    });

    return sortedKeywords.slice(0, 12);
}

const EMOJI_HEADER_REGEX = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
const UPPERCASE_HEADER_REGEX = /^[A-Z0-9][A-Z0-9\s&'\/:,-]{4,}$/;
const BULLET_LINE_REGEX = /^[\s]*[•\-–*·]/;
const TAG_REGEX = /<([^>]+:[^>]+)>/g;

function isSectionHeaderLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        return false;
    }
    if (SECTION_HEADER_REGEX.test(trimmed)) {
        return true;
    }
    if (EMOJI_HEADER_REGEX.test(trimmed)) {
        return true;
    }
    if (/^SECTION\s+\d+\/\d+/i.test(trimmed)) {
        return true;
    }
    return UPPERCASE_HEADER_REGEX.test(trimmed) && !trimmed.includes('.');
}

function normalizeSectionHeader(line) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^##\s+SECTION\s+\d+\/\d+:\s*(.+)$/i);
    if (sectionMatch) {
        return sectionMatch[1].trim();
    }
    return trimmed.replace(/^##\s*/, '').trim();
}

function collectTags(text) {
    const tags = new Set();
    const matches = text.matchAll(TAG_REGEX);
    for (const match of matches) {
        if (match[1]) {
            tags.add(match[1]);
        }
    }
    return Array.from(tags);
}

function sanitizeDescriptor(value) {
    // Remove markdown formatting and section headers (language-agnostic)
    return (value || '')
        .replace(/[*_`~<>[\]#]/g, '')  // Remove markdown chars
        .replace(/\S+\s+\d+\/\d+:/gi, '')  // Remove any "WORD #/#:" pattern
        .trim();
}

function buildKeywordSetsFromGroups(groups, keywordsSet, regexSet) {
    for (const groupKey of groups) {
        const group = KEYWORD_GROUPS[groupKey];
        if (!group) continue;

        // Limit keywords per group to top 3 to prevent explosion (reduced from 5)
        if (Array.isArray(group.keywords)) {
            const limitedKeywords = group.keywords.slice(0, 3);
            for (const keyword of limitedKeywords) {
                keywordsSet.add(keyword);
            }
        }

        // Add all regexes with weighting support
        if (Array.isArray(group.regexes)) {
            for (const regexEntry of group.regexes) {
                regexSet.add(JSON.stringify({
                    pattern: regexEntry.pattern,
                    flags: regexEntry.flags || 'i',
                    group: groupKey,
                    priority: regexEntry.priority ?? group.priority ?? 20,
                    source: 'preset',
                }));
            }
        }
    }
}

function buildDefaultKeywordMetadata(sectionTitle, topic, chunkText, tags) {
    const keywordsSet = new Set();
    const regexSet = new Set();
    const detectedGroups = new Set();

    const sanitizedSection = sanitizeDescriptor(sectionTitle);
    const sanitizedTopic = sanitizeDescriptor(topic);

    for (const preset of KEYWORD_PRESETS) {
        if (preset.match && (preset.match.test(sanitizedSection) || preset.match.test(sanitizedTopic))) {
            if (preset.groups) {
                preset.groups.forEach(group => detectedGroups.add(group));
            }
            if (preset.keywords) {
                preset.keywords.forEach(keyword => keywordsSet.add(keyword));
            }
            if (preset.regexes) {
                preset.regexes.forEach(pattern => regexSet.add(JSON.stringify({
                    pattern,
                    flags: 'i',
                    priority: 60,
                    source: 'preset',
                })));
            }
        }
    }

    if (Array.isArray(tags)) {
        for (const tag of tags) {
            const parts = tag.split(':').map(part => sanitizeDescriptor(part));
            parts.forEach(part => {
                if (!part) return;
                const keywordCandidate = part.replace(/_/g, ' ');
                keywordsSet.add(keywordCandidate);

                for (const [groupKey, data] of Object.entries(KEYWORD_GROUPS)) {
                    if (data.tagHints && data.tagHints.some(hint => new RegExp(hint, 'i').test(keywordCandidate))) {
                        detectedGroups.add(groupKey);
                    }
                }
            });

            if (/boundar/i.test(tag)) detectedGroups.add('boundaries');
            if (/trauma/i.test(tag)) detectedGroups.add('trauma');
            if (/flirt/i.test(tag)) detectedGroups.add('flirting');
            if (/arous/i.test(tag)) detectedGroups.add('arousal');
            if (/jealous/i.test(tag)) detectedGroups.add('jealousy');
            if (/attachment/i.test(tag)) detectedGroups.add('attachment');
        }
    }

    // REMOVED: Don't scan entire chunk text for keyword groups
    // This was causing keyword bleeding between sections
    // Only detect groups based on section title and tags, not full text

    // Only build keyword groups if they match the section title/topic SPECIFICALLY
    const lowerSection = (sanitizedSection + ' ' + sanitizedTopic).toLowerCase();

    // Manual heuristics - ONLY check section title, not entire chunk text
    if (lowerSection.includes('boundar') || lowerSection.includes('consent')) detectedGroups.add('boundaries');
    if (lowerSection.includes('trauma') || lowerSection.includes('trigger') || lowerSection.includes('ptsd')) detectedGroups.add('trauma');
    if (lowerSection.includes('flirt') || lowerSection.includes('seduc')) detectedGroups.add('flirting');
    if (lowerSection.includes('arous') || lowerSection.includes('lust') || lowerSection.includes('desire')) detectedGroups.add('arousal');
    if (lowerSection.includes('jealous') || lowerSection.includes('possessive')) detectedGroups.add('jealousy');
    if (lowerSection.includes('attachment') || lowerSection.includes('avoidant')) detectedGroups.add('attachment');

    // Limit keywords per group to prevent explosion (reduced from 5 to 3)
    buildKeywordSetsFromGroups(detectedGroups, keywordsSet, regexSet);

    return {
        keywords: Array.from(keywordsSet),
        regex: Array.from(regexSet).map(entry => JSON.parse(entry)),
        groups: Array.from(detectedGroups),
    };
}

/**
 * Get the stem/root of a word by stripping common suffixes
 * Examples: "psychological" -> "psych", "psychology" -> "psych", "psyche" -> "psych"
 */
function getWordStem(word) {
    const lower = word.toLowerCase();

    // Strip common suffixes to find root (order matters - longest first)
    const suffixes = [
        'ological', 'ology', 'ical', 'ation', 'ness', 'ment', 'ship', 'able', 'ible',
        'ing', 'ed', 'ies', 'es', 's', 'ly', 'al', 'ic', 'y', 'e'
    ];

    for (const suffix of suffixes) {
        if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
            return lower.slice(0, -suffix.length);
        }
    }

    return lower;
}

/**
 * Convert keywords to regex patterns ONLY when we find actual related words
 * Strategy:
 * 1. Find words in the list that share a common prefix (function + functionally -> /\bfunction(?:ally)?\b/i)
 * 2. Find phrase overlaps (interdimensional + interdimensional being)
 * 3. Convert multi-word keywords to regex with word boundaries
 * 4. Leave simple keywords as plain keywords (NO unintelligent suffix guessing)
 */
function convertKeywordsToRegex(keywords) {
    console.log('🔍 [convertKeywordsToRegex] Input:', { count: keywords.length, keywords: keywords });

    const regexPatterns = [];
    const used = new Set();
    const sorted = [...keywords].sort((a, b) => b.length - a.length); // Longest first

    // PASS 1: Find ACTUAL word families by looking at what keywords we HAVE
    // If we have both "function" and "functionally", group them
    // If we only have "species", DON'T add made-up suffixes
    for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue;

        const word1 = sorted[i].toLowerCase();
        if (word1.includes(' ')) continue; // Skip multi-word for this pass

        const family = [{ word: word1, idx: i }];

        // Find other keywords that share a common root with this word
        for (let j = 0; j < sorted.length; j++) {
            if (i === j || used.has(j)) continue;
            const word2 = sorted[j].toLowerCase();
            if (word2.includes(' ')) continue;

            // Check if they share a common root (at least 4 characters)
            let commonRoot = '';
            const minLen = Math.min(word1.length, word2.length);
            for (let k = 0; k < minLen; k++) {
                if (word1[k] === word2[k]) {
                    commonRoot += word1[k];
                } else {
                    break;
                }
            }

            // If they share a meaningful root (4+ chars), they're likely related
            // psyche (5), psychology (10), psychological (13) -> common root "psych" (5 chars)
            if (commonRoot.length >= 4) {
                family.push({ word: word2, idx: j });
            }
        }

        // If we found a real family (2+ members from our ACTUAL keywords), create regex
        if (family.length >= 2) {
            family.forEach(f => used.add(f.idx));

            // Sort by length to get base word first
            const words = family.map(f => f.word).sort((a, b) => a.length - b.length);
            const baseWord = words[0];

            // Find the common root among ALL words in the family
            let commonRoot = baseWord;
            for (const word of words) {
                let newRoot = '';
                for (let k = 0; k < Math.min(commonRoot.length, word.length); k++) {
                    if (commonRoot[k] === word[k]) {
                        newRoot += commonRoot[k];
                    } else {
                        break;
                    }
                }
                commonRoot = newRoot;
            }

            // Create suffixes from the common root
            const suffixes = words.map(w => w.slice(commonRoot.length)).filter(s => s);

            // Check if the bare root (common root without suffix) is in the family
            const hasBareRoot = words.some(w => w === commonRoot);

            // Use word boundaries for precision
            // If bare root exists: /\bpsych(?:e|ology|ological)?\b/i (? makes suffixes optional)
            // If no bare root: /\bpsych(?:e|ology|ological)\b/i (no ?, must have suffix)
            const pattern = suffixes.length > 0
                ? `\\b${commonRoot}(?:${suffixes.join('|')})${hasBareRoot ? '?' : ''}\\b`
                : `\\b${baseWord}\\b`;

            regexPatterns.push({
                pattern,
                flags: 'i',
                priority: 30,
                source: 'word-family',
            });

            console.log(`🔍 Created word family regex: /${pattern}/i from:`, words, `(bare root: ${hasBareRoot})`);
        }
    }

    // PASS 2: Find phrase-based overlaps (interdimensional + interdimensional being)
    for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue;

        const base = sorted[i].toLowerCase();
        const baseWords = base.split(/\s+/);
        const variants = [];

        // Find all keywords that extend this base phrase
        for (let j = 0; j < sorted.length; j++) {
            if (i === j || used.has(j)) continue;
            const candidate = sorted[j].toLowerCase();

            if (candidate.startsWith(base + ' ')) {
                const suffix = candidate.slice(base.length).trim();
                variants.push(suffix);
                used.add(j);
            }
        }

        // Create regex for phrase variants
        if (variants.length > 0) {
            const escapedBase = base.replace(/\s+/g, '\\s+');
            const escapedVariants = variants.map(v => v.replace(/\s+/g, '\\s+'));
            const pattern = `\\b${escapedBase}(?:\\s+(?:${escapedVariants.join('|')}))?\\b`;
            regexPatterns.push({
                pattern,
                flags: 'i',
                priority: 25,
                source: 'phrase-family',
            });
            used.add(i);
        } else if (baseWords.length > 1) {
            // Multi-word keyword: add word boundaries
            const escapedBase = base.replace(/\s+/g, '\\s+');
            regexPatterns.push({
                pattern: `\\b${escapedBase}\\b`,
                flags: 'i',
                priority: 20,
                source: 'multiword',
            });
            used.add(i);
        }
        // REMOVED: The unintelligent single-word suffix additions (no more speciesed/genreing!)
    }

    // PASS 3: Keep remaining keywords as-is (lowercase, no regex conversion)
    const remainingKeywords = sorted
        .filter((_, i) => !used.has(i))
        .map(kw => kw.toLowerCase());

    console.log('🔍 [convertKeywordsToRegex] Output:', {
        regexCount: regexPatterns.length,
        regexes: regexPatterns.map(r => `/${r.pattern}/${r.flags} (${r.source})`),
        remainingCount: remainingKeywords.length,
        remaining: remainingKeywords,
        conversionRate: `${Math.round((regexPatterns.length / keywords.length) * 100)}%`
    });

    return {
        keywords: remainingKeywords,
        regexes: regexPatterns
    };
}

function buildChunkMetadata(sectionTitle, topic, chunkText, tags, characterName = null) {
    const autoKeywords = extractKeywords(chunkText, sectionTitle, topic);
    const keywordMeta = buildDefaultKeywordMetadata(sectionTitle, topic, chunkText, tags);

    // Create filter set for unwanted keywords
    const filterSet = new Set();
    if (characterName) {
        // Filter out character name and its variations
        filterSet.add(characterName.toLowerCase());
        // Also filter out parts of the name (e.g., "Atsu" from "Atsu Ibn Oba Al-Masri")
        characterName.split(/\s+/).forEach(part => {
            if (part.length >= 3) {
                filterSet.add(part.toLowerCase());
            }
        });
    }

    // Merge and deduplicate (case-insensitive) - store as lowercase
    const keywordMap = new Map();
    [...autoKeywords, ...keywordMeta.keywords].forEach(kw => {
        const lower = kw.toLowerCase();
        // Skip if it's the character name or a common word
        if (!keywordMap.has(lower) && !filterSet.has(lower)) {
            keywordMap.set(lower, lower); // Store lowercase version
        }
    });

    const allKeywords = Array.from(keywordMap.values());

    // Convert keywords to regex patterns for flexible matching
    const { keywords: remainingKeywords, regexes: autoRegexes } = convertKeywordsToRegex(allKeywords);

    console.log('🔍 [buildChunkMetadata] Keyword conversion results:', {
        totalInputKeywords: allKeywords.length,
        inputKeywords: allKeywords,
        remainingKeywords: remainingKeywords,
        autoRegexesCount: autoRegexes.length,
        autoRegexes: autoRegexes.map(r => ({ pattern: r.pattern, flags: r.flags, source: r.source }))
    });

    // Format regex patterns as strings for display in UI: /pattern/flags
    const regexStrings = autoRegexes.map(r => `/${r.pattern}/${r.flags || 'i'}`);

    console.log('🔍 [buildChunkMetadata] Formatted regex strings:', regexStrings);

    // Combine: Plain keywords + regex patterns (formatted as /pattern/flags)
    const systemKeywords = [
        ...remainingKeywords,  // Keywords that weren't converted to regex
        ...regexStrings         // Regex patterns as /pattern/flags strings
    ];

    console.log('🔍 [buildChunkMetadata] Final systemKeywords:', systemKeywords);

    // Store regex objects separately for programmatic access
    const keywordRegex = [
        ...keywordMeta.regex.map(entry => ({ ...entry })),
        ...autoRegexes,
    ];

    return {
        section: sectionTitle,
        topic: topic ?? null,
        tags,
        keywords: [...systemKeywords], // All keywords (lowercase)
        systemKeywords, // All keywords (lowercase)
        defaultSystemKeywords: [...systemKeywords],
        keywordGroups: keywordMeta.groups,
        defaultKeywordGroups: [...keywordMeta.groups],
        keywordRegex,
        defaultKeywordRegex: keywordRegex.map(entry => ({ ...entry })),
        customKeywords: [],
        customRegex: [],
        disabledKeywords: [],
    };
}

function looksLikeBulletBlock(block) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
        return false;
    }
    const bulletCount = lines.filter(line => BULLET_LINE_REGEX.test(line)).length;
    return bulletCount && bulletCount >= Math.ceil(lines.length / 2);
}

function splitIntoSentences(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
        return [];
    }
    const sentences = cleaned.match(/[^.!?]+[.!?]?/g);
    return sentences ? sentences.map(sentence => sentence.trim()).filter(Boolean) : [cleaned];
}

function splitByLength(text, targetLength) {
    const words = text.split(/\s+/);
    const pieces = [];
    let buffer = '';

    for (const word of words) {
        if (!word) {
            continue;
        }
        const candidate = buffer ? `${buffer} ${word}` : word;
        if (candidate.length > targetLength && buffer) {
            pieces.push(buffer.trim());
            buffer = word;
        } else if (word.length > targetLength) {
            pieces.push(word);
            buffer = '';
        } else {
            buffer = candidate;
        }
    }

    if (buffer.trim().length) {
        pieces.push(buffer.trim());
    }

    return pieces;
}

function splitTextToSizedChunks(text, targetLength, overlap) {
    const trimmed = text.trim();
    if (!trimmed) {
        return [];
    }

    if (trimmed.length <= targetLength) {
        return [trimmed];
    }

    const sentences = splitIntoSentences(trimmed);
    const chunks = [];
    let buffer = '';

    const pushBuffer = () => {
        const clean = buffer.trim();
        if (clean.length) {
            chunks.push(clean);
        }
        buffer = '';
    };

    for (const sentence of sentences) {
        const candidate = buffer ? `${buffer} ${sentence}` : sentence;
        if (candidate.length > targetLength && buffer.length) {
            pushBuffer();
            const overlapText = overlap > 0 && chunks.length
                ? chunks[chunks.length - 1].slice(-Math.min(overlap, targetLength))
                : '';
            buffer = overlapText ? `${overlapText.trim()} ${sentence}`.trim() : sentence;
            if (buffer.length > targetLength) {
                splitByLength(buffer, targetLength).forEach(piece => chunks.push(piece));
                buffer = '';
            }
        } else {
            buffer = candidate;
        }
    }

    pushBuffer();

    const normalized = [];
    for (const chunk of chunks) {
        if (chunk.length > targetLength) {
            normalized.push(...splitByLength(chunk, targetLength));
        } else {
            normalized.push(chunk);
        }
    }

    return normalized;
}

function buildChunkText(section, topic, tags, body) {
    const headerParts = [];
    if (section) {
        headerParts.push(`Section: ${section}`);
    }
    if (topic) {
        headerParts.push(`Focus: ${topic}`);
    }
    if (tags && tags.length) {
        headerParts.push(`Tags: ${tags.join(', ')}`);
    }

    const header = headerParts.length ? `[${headerParts.join(' | ')}]` : '';
    return header ? `${header}\n${body.trim()}` : body.trim();
}

/**
 * Strip out TAG SYNTHESIS section - not for chunking
 * @param {string} content
 * @returns {string}
 */
function stripTagSynthesis(content) {
    // Remove TAG SYNTHESIS section (# 🎯**TAG SYNTHESIS**🎯 and everything after it until next main section or end)
    // Language-agnostic: look for the emoji pattern, not English text
    const tagSynthesisRegex = /^#\s*🎯\*\*[^*]+\*\*🎯.*?(?=^##\s+\S+\s+\d+\/\d+:|^##\s+[🤫💕🔗⚗️🌊😘🔥💚⚖️🚧]|\s*$)/gims;
    let cleaned = content.replace(tagSynthesisRegex, '');

    // Also remove if it appears as a subsection
    const subsectionTagSynthesisRegex = /^##\s*🎯\*\*[^*]+\*\*🎯.*?(?=^##\s+|^#\s+|\s*$)/gims;
    cleaned = cleaned.replace(subsectionTagSynthesisRegex, '');

    return cleaned;
}

/**
 * Simple chunking: Split by ## headers only
 */
function chunkFullsheetSimple(content, characterName) {
    // Strip TAG SYNTHESIS before chunking
    content = stripTagSynthesis(content);

    const normalized = content.replace(/\r\n/g, '\n');
    const chunks = [];
    let chunkIndex = 0;

    // Split by any ## or # header - VERY PERMISSIVE
    const headerRegex = /^#{1,2}\s*(.+)$/gm;
    const sections = [];

    // Collect all matches first
    const matches = [];
    let match;
    while ((match = headerRegex.exec(normalized)) !== null) {
        matches.push({
            index: match.index,
            length: match[0].length,
            title: match[1].trim()
        });
    }

    debugLog(`Simple chunking: Found ${matches.length} header matches`);

    // IMPORTANT: Track what content we've captured to ensure nothing is lost
    let capturedRanges = [];

    // Store any content before first header
    if (matches.length > 0 && matches[0].index > 0) {
        const preContent = normalized.substring(0, matches[0].index).trim();
        if (preContent && preContent.length >= 10) { // Only skip if truly empty (allow very short content)
            sections.push({
                title: 'Header',
                content: preContent
            });
            capturedRanges.push({ start: 0, end: matches[0].index });
        }
    }

    // Process each match
    matches.forEach((currentMatch, idx) => {
        const nextMatch = matches[idx + 1];
        const endIndex = nextMatch ? nextMatch.index : normalized.length;
        const sectionContent = normalized.substring(currentMatch.index + currentMatch.length, endIndex).trim();

        // ALWAYS include the section, even if content is empty or just whitespace
        // This ensures every header gets chunked
        sections.push({
            title: currentMatch.title,
            content: sectionContent || '(Empty section)' // Placeholder for empty sections
        });
        capturedRanges.push({ start: currentMatch.index, end: endIndex });
    });

    // FAILSAFE: If no sections found, treat entire content as one chunk
    if (sections.length === 0) {
        sections.push({
            title: DEFAULT_SECTION_TITLE,
            content: normalized.trim() || '(Empty content)'
        });
    }

    // VALIDATION: Check if we missed any content
    const totalContentLength = normalized.length;
    const capturedLength = capturedRanges.reduce((sum, range) => sum + (range.end - range.start), 0);
    if (capturedLength < totalContentLength * 0.9) { // If we missed more than 10% of content
        console.warn(`⚠️ Simple chunking may have missed content: Captured ${capturedLength}/${totalContentLength} chars (${Math.round(capturedLength/totalContentLength*100)}%)`);
    }

    debugLog(`Simple chunking: Found ${sections.length} sections, captured ${capturedLength}/${totalContentLength} chars`);

    // Create one chunk per section - NEVER skip sections
    sections.forEach(section => {
        const tags = collectTags(section.content);
        const chunkText = `[${section.title}]\n${section.content}`;
        const hash = getStringHash(`${characterName}|${section.title}|${chunkIndex}|${chunkText}`);
        const metadata = buildChunkMetadata(section.title, null, chunkText, tags, characterName);

        chunks.push({
            text: chunkText,
            hash,
            index: chunkIndex++,
            metadata,
        });
    });

    debugLog(`Simple chunked fullsheet for ${characterName}`, {
        totalChunks: chunks.length,
        averageSize: chunks.length ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length) : 0,
        sections: sections.map(s => ({ title: s.title, length: s.content.length })),
    });

    return chunks;
}

/**
 * Split fullsheet content into semantic chunks respecting SECTION 1-8 structure.
 * @param {string} content
 * @param {string} characterName
 * @param {number} targetChunkSize
 * @param {number} overlapSize
 * @returns {{text: string, hash: number, index: number, metadata: object}[]}
 */
function chunkFullsheet(content, characterName, targetChunkSize = 1000, overlapSize = 300) {
    const settings = getRAGSettings();

    // Use section-based chunking if enabled
    if (settings.simpleChunking) {
        return chunkFullsheetSimple(content, characterName);
    }

    // Math-based chunking: Split entire content into equal-sized chunks
    return chunkFullsheetMathBased(content, characterName, targetChunkSize, overlapSize);
}

/**
 * Pure math-based chunking: Split entire content into equal-sized chunks with overlap
 * Ignores section headers, just splits by size
 */
function chunkFullsheetMathBased(content, characterName, targetChunkSize = 1000, overlapSize = 300) {
    // Strip TAG SYNTHESIS before chunking
    content = stripTagSynthesis(content);

    const normalized = content.replace(/\r\n/g, '\n').trim();
    const chunks = [];

    if (!normalized) {
        return chunks;
    }

    debugLog(`Math-based chunking: Total content length = ${normalized.length} chars`);

    // Split the entire content into chunks using the math-based splitter
    const fragments = splitTextToSizedChunks(normalized, targetChunkSize, overlapSize);

    debugLog(`Math-based chunking: Split into ${fragments.length} chunks`);

    fragments.forEach((fragment, idx) => {
        const chunkText = fragment.trim();
        if (!chunkText || chunkText.length < 50) {
            return; // Skip tiny/empty chunks
        }

        const hash = getStringHash(`${characterName}|math|${idx}|${chunkText}`);
        const tags = collectTags(chunkText);

        // Build metadata for math-based chunk
        const metadata = buildChunkMetadata(
            `Chunk ${idx + 1}/${fragments.length}`,
            null,
            chunkText,
            tags,
            characterName
        );

        chunks.push({
            text: chunkText,
            hash,
            index: idx,
            metadata,
        });
    });

    debugLog(`Math-based chunking complete for ${characterName}`, {
        totalChunks: chunks.length,
        averageSize: chunks.length ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length) : 0,
        targetSize: targetChunkSize,
        overlap: overlapSize,
    });

    return chunks;
}

/**
 * Section-based chunking with intelligent subsection handling
 * This is the OLD chunkFullsheet logic, now renamed for clarity
 */
function chunkFullsheetSectionBased(content, characterName, targetChunkSize = 1000, overlapSize = 300) {
    // Strip TAG SYNTHESIS before chunking
    content = stripTagSynthesis(content);

    const normalized = content.replace(/\r\n/g, '\n');
    const chunks = [];
    let chunkIndex = 0;

    // Split by numbered section headers - VERY PERMISSIVE & LANGUAGE-AGNOSTIC
    // Matches ANY word followed by numbers (works for all languages):
    // ## SECTION 1/8:, ##セクション 1/8, # 部分 1/8, SECCIÓN 1/8:, etc.
    // \S+ matches any non-whitespace = works for Chinese, Japanese, Korean, Arabic, Cyrillic, etc.
    const sectionRegex = /^#{0,2}\s*(\S+)\s+(\d+)\s*\/\s*(\d+):?\s*(.*)$/gim;
    const sections = [];
    let sectionKeyword = 'Section'; // Will be extracted from first match

    // Collect all matches first to avoid lastIndex issues
    const matches = [];
    let match;
    while ((match = sectionRegex.exec(normalized)) !== null) {
        matches.push({
            index: match.index,
            length: match[0].length,
            keyword: match[1],
            sectionNum: parseInt(match[2]),
            totalSections: parseInt(match[3]),
            sectionTitle: match[4].trim()
        });
    }

    debugLog(`Found ${matches.length} section headers in fullsheet`);

    // Store any content before the first section (title, header, etc.)
    if (matches.length > 0 && matches[0].index > 0) {
        const preContent = normalized.substring(0, matches[0].index).trim();
        if (preContent) {
            sections.push({
                number: 0,
                title: 'Header',
                content: preContent
            });
        }
    }

    // Process each match
    matches.forEach((currentMatch, idx) => {
        if (sections.length === 0) {
            sectionKeyword = currentMatch.keyword; // Remember the keyword used
        }

        const nextMatch = matches[idx + 1];
        const endIndex = nextMatch ? nextMatch.index : normalized.length;
        const sectionContent = normalized.substring(currentMatch.index + currentMatch.length, endIndex).trim();

        sections.push({
            number: currentMatch.sectionNum,
            title: currentMatch.sectionTitle,
            content: sectionContent,
            fullTitle: `${sectionKeyword} ${currentMatch.sectionNum}/${currentMatch.totalSections}: ${currentMatch.sectionTitle}`
        });
    });

    // If no sections found, treat entire content as one chunk
    if (sections.length === 0) {
        sections.push({
            number: 1,
            title: DEFAULT_SECTION_TITLE,
            content: normalized.trim(),
            fullTitle: DEFAULT_SECTION_TITLE
        });
    }

    debugLog(`Found ${sections.length} main sections in fullsheet`);

    // Filter function to check if content should be chunked
    function shouldChunkContent(content, title) {
        const trimmed = content.trim();

        // Skip empty or nearly empty content
        if (!trimmed || trimmed.length < 50 || trimmed === '---') {
            return false;
        }

        // Skip metadata sections (strip markdown formatting first)
        const cleanTitle = title.replace(/[\*\#\~\_]/g, '').trim();
        const metadataTitles = [
            /ANALYSIS\s*COMPLETE/i,
            /TAG\s*SYNTHESIS/i,
            /\bsection\b\s*$/i,  // Just the word "section"
            /BunnymoTags/i,
            /^(Header|Footer|Metadata)$/i,
        ];

        for (const pattern of metadataTitles) {
            if (pattern.test(cleanTitle)) {
                return false;
            }
        }

        // Skip sections that are mostly BunnymoTags closing blocks
        if (/<\/BunnymoTags>/i.test(trimmed) || /<Genre>/i.test(trimmed)) {
            return false;
        }

        return true;
    }

    // Process each section
    sections.forEach(section => {
        // Skip empty or metadata sections
        if (!shouldChunkContent(section.content, section.fullTitle || section.title)) {
            return;
        }

        const tags = collectTags(section.content);

        // Last section special handling - split by emoji subsection headers
        // Works for any total (8, 6, 10, etc.) - just check if it's the last numbered section
        const isLastSection = sections.length > 0 && section.number === Math.max(...sections.map(s => s.number));
        if (isLastSection) {
            // Match any ## header with optional emoji prefix
            const subsectionRegex = /^##\s+([^\n]+)$/gim;
            const subsections = [];
            let subLastIndex = 0;
            let subMatch;

            while ((subMatch = subsectionRegex.exec(section.content)) !== null) {
                subsectionRegex.lastIndex = subMatch.index + subMatch[0].length;
                const nextSubMatch = subsectionRegex.exec(section.content);
                subsectionRegex.lastIndex = subMatch.index + subMatch[0].length;

                const subEndIndex = nextSubMatch ? nextSubMatch.index : section.content.length;
                const subsectionContent = section.content.substring(subMatch.index + subMatch[0].length, subEndIndex).trim();
                const subsectionTitle = subMatch[1].trim()
                    .replace(/\*/g, '')  // Remove asterisks
                    .replace(/^[💕🔗⚗️🌊😘🔥💚⚖️🚧🎯]\s*/, '');  // Remove leading emojis

                // Skip metadata subsections
                if (shouldChunkContent(subsectionContent, subsectionTitle)) {
                    subsections.push({
                        title: subsectionTitle,
                        content: subsectionContent
                    });
                }

                subLastIndex = subEndIndex;
            }

            // Create chunks for each subsection
            if (subsections.length > 0) {
                debugLog(`Last section split into ${subsections.length} subsections`);
                subsections.forEach(subsection => {
                    const chunkText = `[${section.fullTitle} > ${subsection.title}]\n${subsection.content}`;
                    const hash = getStringHash(`${characterName}|${section.fullTitle}|${subsection.title}|${chunkIndex}|${chunkText}`);
                    const tags = collectTags(subsection.content);
                    const metadata = buildChunkMetadata(section.fullTitle, subsection.title, chunkText, tags, characterName);

                    chunks.push({
                        text: chunkText,
                        hash,
                        index: chunkIndex++,
                        metadata,
                    });
                });
            } else {
                // No subsections found, treat as single chunk
                const chunkText = `[${section.fullTitle}]\n${section.content}`;
                const hash = getStringHash(`${characterName}|${section.fullTitle}|${chunkIndex}|${chunkText}`);
                const metadata = buildChunkMetadata(section.fullTitle, null, chunkText, tags, characterName);

                chunks.push({
                    text: chunkText,
                    hash,
                    index: chunkIndex++,
                    metadata,
                });
            }
        } else {
            // Other sections: Keep as single chunks, or split if too large
            if (section.content.length <= targetChunkSize * 1.5) {
                // Small enough to keep as single chunk
                const chunkText = `[${section.fullTitle}]\n${section.content}`;
                const hash = getStringHash(`${characterName}|${section.fullTitle}|${chunkIndex}|${chunkText}`);
                const metadata = buildChunkMetadata(section.fullTitle, null, chunkText, tags, characterName);

                chunks.push({
                    text: chunkText,
                    hash,
                    index: chunkIndex++,
                    metadata,
                });
            } else {
                // Too large, split into smaller chunks with overlap
                const fragments = splitTextToSizedChunks(section.content, targetChunkSize, overlapSize);
                fragments.forEach((fragment, fragIdx) => {
                const chunkText = `[${section.fullTitle}${fragments.length > 1 ? ` (Part ${fragIdx + 1}/${fragments.length})` : ''}]\n${fragment}`;
                const hash = getStringHash(`${characterName}|${section.fullTitle}|${fragIdx}|${chunkIndex}|${chunkText}`);
                const tags = collectTags(fragment);
                const metadata = buildChunkMetadata(section.fullTitle, fragments.length > 1 ? `Part ${fragIdx + 1}/${fragments.length}` : null, chunkText, tags, characterName);

                chunks.push({
                    text: chunkText,
                    hash,
                    index: chunkIndex++,
                    metadata,
                });
                });
            }
        }
    });

    debugLog(`Chunked fullsheet for ${characterName}`, {
        totalChunks: chunks.length,
        averageSize: chunks.length ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length) : 0,
        mainSections: sections.length,
    });

    return chunks;
}

function getChunkLibrary(collectionId) {
    const library = getContextualLibrary();
    return library?.[collectionId] || null;
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function libraryEntryToChunk(hash, data, additional = {}) {
    if (!data) {
        return null;
    }

    const sectionTitle = data.section || DEFAULT_SECTION_TITLE;
    const topic = data.topic ?? null;
    const tags = ensureArray(data.tags);
    const baseMetadata = buildChunkMetadata(sectionTitle, topic, data.text || '', tags);

    const systemKeywords = Array.from(new Set([
        ...ensureArray(data.systemKeywords),
        ...ensureArray(data.defaultSystemKeywords),
        ...ensureArray(data.keywords),
        ...baseMetadata.systemKeywords,
    ]));

    const defaultSystemKeywords = Array.from(new Set([
        ...baseMetadata.defaultSystemKeywords,
        ...ensureArray(data.defaultSystemKeywords),
    ]));

    const customKeywords = ensureArray(data.customKeywords);
    const disabledKeywords = ensureArray(data.disabledKeywords).map(normalizeKeyword);

    const keywordGroups = Array.from(new Set([
        ...ensureArray(data.keywordGroups),
        ...baseMetadata.keywordGroups,
    ]));
    const defaultKeywordGroups = Array.from(new Set([
        ...baseMetadata.defaultKeywordGroups,
        ...ensureArray(data.defaultKeywordGroups),
    ]));

    const keywordRegex = Array.from(new Set([
        ...ensureArray(data.keywordRegex).map(entry => JSON.stringify(entry)),
        ...baseMetadata.keywordRegex.map(entry => JSON.stringify(entry)),
    ])).map(entry => JSON.parse(entry));
    const defaultKeywordRegex = Array.from(new Set([
        ...baseMetadata.defaultKeywordRegex.map(entry => JSON.stringify(entry)),
        ...ensureArray(data.defaultKeywordRegex).map(entry => JSON.stringify(entry)),
    ])).map(entry => JSON.parse(entry));

    const customRegex = ensureArray(data.customRegex);

    const finalKeywords = Array.from(new Set([...systemKeywords, ...customKeywords])).filter(keyword => !disabledKeywords.includes(normalizeKeyword(keyword)));

    return Object.assign({
        hash: Number(hash),
        text: data.text,
        section: sectionTitle,
        topic,
        tags,
        keywords: finalKeywords,
        systemKeywords,
        defaultSystemKeywords,
        keywordGroups,
        defaultKeywordGroups,
        keywordRegex,
        defaultKeywordRegex,
        customKeywords,
        customRegex,
        disabledKeywords,
        index: data.index ?? additional.index ?? 0,
    }, additional);
}

function scoreCrosslink(base, candidate) {
    const baseTags = new Set(base.tags || []);
    const candidateTags = new Set(candidate.tags || []);
    const sharedTags = [...baseTags].filter(tag => candidateTags.has(tag));

    const baseKeywords = new Set(base.keywords || []);
    const candidateKeywords = new Set(candidate.keywords || []);
    const sharedKeywords = [...baseKeywords].filter(keyword => candidateKeywords.has(keyword));

    const keywordScore = baseKeywords.size ? sharedKeywords.length / baseKeywords.size : 0;
    const tagScore = sharedTags.length ? Math.min(0.5, sharedTags.length * 0.25) : 0;

    return {
        score: Number((keywordScore + tagScore).toFixed(3)),
        sharedKeywords,
        sharedTags,
    };
}

function deriveCrosslinks(library, primaryChunks, settings) {
    if (!settings.smartCrossReference) {
        return [];
    }

    const threshold = settings.crosslinkThreshold ?? 0.25;
    const selectedHashes = new Set(primaryChunks.map(chunk => chunk.hash));
    const extras = new Map();

    for (const baseChunk of primaryChunks) {
        for (const [hashKey, candidate] of Object.entries(library)) {
            const hash = Number(hashKey);
            if (selectedHashes.has(hash) || extras.has(hash)) {
                continue;
            }

            const scoreInfo = scoreCrosslink(baseChunk, candidate);
            if (scoreInfo.score >= threshold) {
                extras.set(hash, libraryEntryToChunk(hash, candidate, {
                    inferred: true,
                    reason: scoreInfo,
                }));
            }
        }
    }

    return Array.from(extras.values());
}

/**
 * Adds keyword-based fallback chunks when semantic search misses.
 * @param {string[]} queryKeywords Keywords extracted from the query text
 * @param {Record<string, any>} library Stored chunk library
 * @param {Set<number>} selectedHashes Already selected chunk hashes
 * @param {number} limit Maximum fallback chunks to include
 * @returns {ReturnType<typeof libraryEntryToChunk>[]} Fallback chunks
 */
function deriveKeywordFallback(queryKeywords, queryText, library, selectedHashes, limit, settings) {
    if ((!queryKeywords || queryKeywords.length === 0) && !queryText) {
        return [];
    }

    /** @type {Map<string, {priority: number, originals: Set<string>}>} */
    const keywordPriorityMap = new Map();
    for (const keyword of queryKeywords || []) {
        const normalized = normalizeKeyword(keyword);
        const priority = Math.max(getKeywordPriority(keyword), 20);
        if (!keywordPriorityMap.has(normalized)) {
            keywordPriorityMap.set(normalized, { priority, originals: new Set([keyword]) });
        } else {
            keywordPriorityMap.get(normalized).originals.add(keyword);
        }
    }

    const loweredQueryText = (queryText || '').toLowerCase();

    /** @type {{hash: number, score: number, chunk: ReturnType<typeof libraryEntryToChunk>}[]} */
    const candidates = [];

    for (const [hashKey, data] of Object.entries(library)) {
        const hash = Number(hashKey);
        if (selectedHashes.has(hash)) {
            continue;
        }
        const effectiveData = libraryEntryToChunk(hash, data);
        if (!effectiveData) {
            continue;
        }

        const disabledSet = new Set((data.disabledKeywords || []).map(normalizeKeyword));
        const customKeywords = Array.isArray(data.customKeywords) ? data.customKeywords : [];
        const systemKeywords = Array.isArray(data.systemKeywords) ? data.systemKeywords : Array.isArray(data.keywords) ? data.keywords : [];
        const combinedKeywords = [...systemKeywords, ...customKeywords];

        let score = 0;
        const matchedKeywords = [];
        const matchedFromQuery = [];

        combinedKeywords.forEach(keyword => {
            const normalized = normalizeKeyword(keyword);
            if (disabledSet.has(normalized)) {
                return;
            }

            const mapEntry = keywordPriorityMap.get(normalized);
            if (mapEntry) {
                const isCustom = customKeywords.some(custom => normalizeKeyword(custom) === normalized);

                // Check for custom weight override first
                let effectivePriority;
                if (data.customWeights && data.customWeights[normalized] !== undefined) {
                    effectivePriority = data.customWeights[normalized];
                } else if (isCustom) {
                    effectivePriority = Math.max(CUSTOM_KEYWORD_PRIORITY, mapEntry.priority);
                } else {
                    effectivePriority = Math.max(mapEntry.priority, getKeywordPriority(keyword));
                }

                score += effectivePriority;
                matchedKeywords.push(keyword);
                matchedFromQuery.push(...mapEntry.originals);
            }
        });

        const regexEntries = [];
        if (Array.isArray(data.keywordRegex)) {
            for (const entry of data.keywordRegex) {
                if (entry && entry.pattern) {
                    regexEntries.push({ ...entry, source: entry.source || 'preset' });
                }
            }
        }
        if (Array.isArray(data.customRegex)) {
            for (const pattern of data.customRegex) {
                if (!pattern) continue;
                if (typeof pattern === 'string') {
                    regexEntries.push({ pattern, flags: 'i', priority: CUSTOM_KEYWORD_PRIORITY, source: 'custom' });
                } else if (pattern.pattern) {
                    regexEntries.push({ ...pattern, source: 'custom', priority: pattern.priority ?? CUSTOM_KEYWORD_PRIORITY });
                }
            }
        }

        const regexMatches = [];
        for (const entry of regexEntries) {
            try {
                const regex = new RegExp(entry.pattern, entry.flags || 'i');
                if (regex.test(loweredQueryText)) {
                    const regexPriority = entry.priority ?? (entry.source === 'custom' ? CUSTOM_KEYWORD_PRIORITY : 80);
                    score += regexPriority;
                    regexMatches.push(entry.pattern);
                }
            } catch {
                // ignore malformed regex
            }
        }

        if (score <= 0) {
            continue;
        }

        const chunk = libraryEntryToChunk(hash, data, {
            inferred: true,
            reason: {
                source: 'keyword-fallback',
                sharedKeywords: matchedKeywords,
                queryKeywords: Array.from(new Set(matchedFromQuery)),
                regexMatches,
                weight: score,
            },
        });

        candidates.push({ hash, score, chunk });
    }

    candidates.sort((a, b) => b.score - a.score || a.hash - b.hash);
    const limited = candidates.slice(0, Math.max(0, limit));
    return limited.map(entry => entry.chunk);
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

/**
 * Check if a collection exists
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<boolean>} True if collection exists
 */
async function collectionExists(collectionId) {
    try {
        const hashes = await apiGetSavedHashes(collectionId);
        return hashes && hashes.length > 0;
    } catch (error) {
        debugLog(`Collection ${collectionId} does not exist`, error);
        return false;
    }
}

/**
 * Query RAG collection for relevant chunks
 *
 * @param {string} characterName - Character name
 * @param {string} queryText - Query text (recent chat messages)
 * @returns {Promise<Array>} Array of relevant chunks with scores
 */
async function queryRAG(characterName, queryText) {
    const settings = getRAGSettings();

    if (!settings.enabled) {
        debugLog('RAG disabled, skipping query');
        return [];
    }

    const collectionId = generateCollectionId(characterName);

    // Check if this collection is disabled
    if (settings.disabledCollections?.includes(collectionId)) {
        debugLog(`Collection ${collectionId} is disabled, skipping query`);
        return [];
    }

    const allLibraries = getAllContextualLibraries();

    debugLog(`Querying RAG for ${characterName} across all contextual libraries`, {
        collectionId,
        queryLength: queryText.length,
        topK: settings.topK,
        availableLibraries: Object.keys(allLibraries),
        libraryContents: Object.entries(allLibraries).map(([name, lib]) => ({
            name,
            hasLibrary: !!lib,
            hasCollection: lib ? !!lib[collectionId] : false,
            collectionKeys: lib ? Object.keys(lib).slice(0, 5) : []
        }))
    });

    const queryKeywords = extractKeywords(queryText);

    // ============================================================================
    // COLLECTION ACTIVATION SYSTEM
    // Determines WHICH collections to query based on activation triggers
    // (Similar to how lorebook entries activate based on triggers)
    // ============================================================================

    // Detect which collections should be activated based on triggers
    const queryLower = queryText.toLowerCase();
    const queryWords = queryLower.split(/\s+/); // Split into words for whole-word matching

    // Get collection metadata (contains activation triggers)
    ensureRagState();
    const ragState = extension_settings[extensionName].rag;
    const collectionMetadata = ragState.collectionMetadata || {};

    const activatedCollections = new Set();
    const allCollectionNames = [];

    for (const [, library] of Object.entries(allLibraries)) {
        if (library && typeof library === 'object') {
            allCollectionNames.push(...Object.keys(library));
        }
    }

    // Check each collection to see if it should be activated
    for (const collectionId of allCollectionNames) {
        const metadata = collectionMetadata[collectionId];

        // Legacy collections without metadata won't activate (user needs to set triggers)
        if (!metadata) {
            continue;
        }

        // Check if collection is always active (ignores triggers)
        if (metadata.alwaysActive) {
            activatedCollections.add(collectionId);
            continue;
        }

        // Check if any activation triggers match (case-insensitive)
        const triggers = metadata.keywords || []; // NOTE: Still called 'keywords' in data for backwards compatibility

        // No triggers = collection won't activate (user must explicitly set triggers or enable "Always Active")
        if (triggers.length === 0) {
            continue;
        }

        // Check if any trigger appears in query
        for (const trigger of triggers) {
            const triggerLower = trigger.toLowerCase().trim();
            // Support both substring and whole-word matching
            if (queryLower.includes(triggerLower)) {
                activatedCollections.add(collectionId);
                break;
            }
        }
    }

    debugLog(`Collection activation based on triggers:`, {
        queryText: queryText,
        totalCollections: allCollectionNames.length,
        activatedCollections: activatedCollections.size,
        activatedList: Array.from(activatedCollections)
    });

    // Build parallel queries for each library that has this collection
    const libraryQueries = [];
    const libraryNames = [];

    for (const [libName, library] of Object.entries(allLibraries)) {
        if (!library || typeof library !== 'object') {
            debugLog(`Skipping ${libName}: not a valid library object`);
            continue;
        }

        // Filter to only activated collections (based on keywords/alwaysActive)
        let collectionsInLibrary = Object.keys(library).filter(collectionId => {
            return activatedCollections.has(collectionId);
        });
        debugLog(`Checking ${libName} library:`, {
            hasLibrary: true,
            collectionsCount: collectionsInLibrary.length,
            collections: collectionsInLibrary.slice(0, 10) // Show first 10
        });

        if (collectionsInLibrary.length === 0) {
            debugLog(`Skipping ${libName}: no collections in library`);
            continue;
        }

        // Query each collection in this library
        for (const currentCollectionId of collectionsInLibrary) {
            libraryNames.push(`${libName}:${currentCollectionId}`);
            libraryQueries.push(
                (async () => {
                    try {
                        const exists = await collectionExists(currentCollectionId);
                        if (!exists) {
                            debugLog(`Collection ${currentCollectionId} not found in vector DB`);
                            return { libName: `${libName}:${currentCollectionId}`, chunks: [] };
                        }

                        const response = await apiQueryCollection(currentCollectionId, queryText, settings.topK, settings.scoreThreshold);

                        // Debug: Log raw response to see what we're actually getting
                        console.log('🔍 RAG SCORE DEBUG: Raw vector DB response:', {
                            collectionId: currentCollectionId,
                            response: response,
                            hasScores: response?.scores ? 'YES' : 'NO',
                            hasSimilarities: response?.similarities ? 'YES' : 'NO',
                            hasMetadata: response?.metadata ? 'YES' : 'NO',
                            responseKeys: Object.keys(response || {})
                        });

                        const metadata = Array.isArray(response?.metadata) ? response.metadata : [];
                        const hashes = Array.isArray(response?.hashes) ? response.hashes : [];
                        const scores = Array.isArray(response?.scores) ? response.scores : (Array.isArray(response?.similarities) ? response.similarities : []);

                        const chunks = [];
                        for (let i = 0; i < Math.max(metadata.length, hashes.length, scores.length); i++) {
                            const meta = metadata[i] || {};
                            const hash = Number(hashes[i] ?? meta.hash);
                            if (Number.isNaN(hash)) continue;

                            // Score can come from: metadata[i].score, scores array, or similarities array
                            const score = meta.score ?? scores[i] ?? null;

                            console.log(`🔍 RAG SCORE DEBUG: Chunk ${i} score=${score}, meta.score=${meta.score}, scores[${i}]=${scores[i]}`);

                            // ⚠️ CRITICAL: Enforce scoreThreshold client-side
                            // If score is null/0, we can't filter properly - warn but allow through
                            if (score !== null && score < settings.scoreThreshold) {
                                console.log(`🔍 RAG SCORE DEBUG: Filtered out chunk ${i} - score ${score} below threshold ${settings.scoreThreshold}`);
                                continue;
                            }

                            if (score === null || score === 0) {
                                console.warn(`⚠️ RAG WARNING: Chunk ${i} has null/zero score - cannot filter by threshold. Check vector DB configuration.`);
                            }

                            const entry = libraryEntryToChunk(hash, library[currentCollectionId][hash], {
                                reason: {
                                    score: score,
                                    rank: i,
                                    source: `${libName}:${currentCollectionId}`,
                                },
                            });
                            if (entry) {
                                chunks.push(entry);
                            }
                        }

                        debugLog(`Queried ${currentCollectionId} in ${libName}: found ${chunks.length} chunks`);
                        return { libName: `${libName}:${currentCollectionId}`, chunks, library: library[currentCollectionId] };
                    } catch (error) {
                        console.error(`Failed to query ${currentCollectionId} in ${libName} library:`, error);
                        return { libName: `${libName}:${currentCollectionId}`, chunks: [] };
                    }
                })()
            );
        }
    }

    if (libraryQueries.length === 0) {
        debugLog(`No libraries contain collection ${collectionId}; vectorize the fullsheet first.`);
        return [];
    }

    try {
        // Run all library queries in parallel for performance
        const results = await Promise.all(libraryQueries);

        // Merge all primary chunks, deduplicating by hash (prefer higher scores)
        const primaryChunksMap = new Map();
        let totalPrimary = 0;

        for (const { libName, chunks } of results) {
            for (const chunk of chunks) {
                totalPrimary++;
                const existing = primaryChunksMap.get(chunk.hash);
                if (!existing || (chunk.reason?.score ?? 0) > (existing.reason?.score ?? 0)) {
                    primaryChunksMap.set(chunk.hash, chunk);
                }
            }
        }

        const primaryChunks = Array.from(primaryChunksMap.values());

        // Merge all libraries for crosslinking and fallback
        const mergedLibrary = {};
        for (const { library } of results) {
            if (library) {
                Object.assign(mergedLibrary, library);
            }
        }

        // Apply crosslinking across merged library
        const crosslinked = deriveCrosslinks(mergedLibrary, primaryChunks, settings);
        const selectedHashes = new Set(primaryChunks.map(chunk => chunk.hash));
        crosslinked.forEach(chunk => selectedHashes.add(chunk.hash));

        const combined = [];
        const seen = new Set();
        const pushUnique = (chunk) => {
            if (!chunk || !chunk.text) return;
            if (seen.has(chunk.hash)) return;
            seen.add(chunk.hash);
            combined.push(chunk);
        };

        // Filter out disabled chunks before adding to results
        primaryChunks.filter(chunk => !chunk.disabled).forEach(pushUnique);
        crosslinked.filter(chunk => !chunk.disabled).forEach(pushUnique);

        // Apply keyword fallback across merged library
        let fallbackCount = 0;
        let fallbackChunks = [];
        if ((settings.keywordFallback ?? true) && (settings.keywordFallbackLimit ?? 0) > 0) {
            fallbackChunks = deriveKeywordFallback(
                queryKeywords,
                queryText,
                mergedLibrary,
                selectedHashes,
                settings.keywordFallbackLimit ?? 2,
                settings,
            );
            const before = combined.length;
            fallbackChunks.forEach(chunk => {
                pushUnique(chunk);
                if (chunk?.hash !== undefined) {
                    selectedHashes.add(Number(chunk.hash));
                }
            });
            fallbackCount = combined.length - before;
        }

        // Prioritize keyword fallback if enabled
        if ((settings.keywordFallbackPriority ?? false) && fallbackChunks.length) {
            const fallbackHashes = new Set(fallbackChunks.filter(Boolean).map(chunk => Number(chunk.hash)));
            combined.sort((a, b) => {
                const aIsFallback = fallbackHashes.has(Number(a.hash));
                const bIsFallback = fallbackHashes.has(Number(b.hash));
                if (aIsFallback === bIsFallback) return 0;
                return aIsFallback ? -1 : 1;
            });
        }

        // Process chunk links (force and soft modes)
        const linkedChunks = [];
        const softLinkedHashes = new Set();

        for (const chunk of combined) {
            const chunkLinks = Array.isArray(chunk.chunkLinks) ? chunk.chunkLinks : [];

            for (const link of chunkLinks) {
                const targetChunk = mergedLibrary[link.targetHash];
                if (!targetChunk || targetChunk.disabled) continue;

                if (link.mode === 'force') {
                    // Force mode: add chunk immediately if not already present
                    if (!seen.has(link.targetHash)) {
                        const linkedChunk = libraryEntryToChunk(link.targetHash, targetChunk, {
                            inferred: true,
                            reason: { type: 'force-link', source: chunk.hash },
                        });
                        linkedChunks.push(linkedChunk);
                        seen.add(link.targetHash);
                    }
                } else if (link.mode === 'soft') {
                    // Soft mode: mark for priority boosting
                    softLinkedHashes.add(link.targetHash);
                }
            }
        }

        // Add force-linked chunks
        linkedChunks.forEach(chunk => combined.push(chunk));

        // Soft-link boost: if soft-linked chunks exist in the result set, move them up
        if (softLinkedHashes.size > 0) {
            combined.sort((a, b) => {
                const aIsSoft = softLinkedHashes.has(a.hash);
                const bIsSoft = softLinkedHashes.has(b.hash);
                if (aIsSoft === bIsSoft) return 0;
                return aIsSoft ? -1 : 1; // Soft-linked chunks come first
            });
        }

        // Apply inclusion group filtering (only one chunk per group)
        const inclusionGroups = {};
        const filteredByInclusion = [];

        for (const chunk of combined) {
            const group = chunk.inclusionGroup;

            if (!group || group.trim() === '') {
                // No inclusion group - always include
                filteredByInclusion.push(chunk);
                continue;
            }

            if (!inclusionGroups[group]) {
                // First chunk in this group
                inclusionGroups[group] = chunk;
                filteredByInclusion.push(chunk);
            } else {
                // Another chunk with same group exists
                const existing = inclusionGroups[group];

                // If this chunk is prioritized and existing isn't, replace it
                if (chunk.inclusionPrioritize && !existing.inclusionPrioritize) {
                    const existingIndex = filteredByInclusion.indexOf(existing);
                    if (existingIndex !== -1) {
                        filteredByInclusion[existingIndex] = chunk;
                    }
                    inclusionGroups[group] = chunk;
                }
                // Otherwise skip this chunk (existing one stays)
            }
        }

        // ⚠️ CRITICAL: Enforce topK limit on final combined results
        // This is separate from the per-collection topK sent to the vector DB
        // We need to limit the TOTAL number of chunks returned across all collections
        let finalResults = filteredByInclusion;

        // Sort by score (highest first) before limiting
        finalResults.sort((a, b) => {
            const scoreA = a.reason?.score ?? 0;
            const scoreB = b.reason?.score ?? 0;
            return scoreB - scoreA;
        });

        // Apply global topK limit if we have too many results
        if (finalResults.length > settings.topK) {
            console.log(`🔍 RAG LIMITING: Trimming ${finalResults.length} results down to topK=${settings.topK}`);
            finalResults = finalResults.slice(0, settings.topK);
        }

        debugLog(`Multi-library query results for ${characterName}`, {
            libraries: libraryNames.join(', '),
            totalPrimary,
            deduplicated: primaryChunks.length,
            crosslinked: crosslinked.length,
            linkedChunks: linkedChunks.length,
            beforeInclusion: combined.length,
            afterInclusion: filteredByInclusion.length,
            afterTopKLimit: finalResults.length,
            delivered: finalResults.length,
            fallback: fallbackCount,
        });

        return finalResults;
    } catch (error) {
        console.error(`Failed to query RAG for ${characterName}:`, error);
        return [];
    }
}

// ============================================================================
// QUERY CONTEXT BUILDING
// ============================================================================

/**
 * Build query context from recent chat messages
 *
 * @param {number} messageCount - Number of recent messages to include
 * @returns {string} Query text for RAG
 */
function buildQueryContext(messageCount = 3) {
    if (!chat || chat.length === 0) {
        return '';
    }

    // Filter to only non-system messages (matching ST's native lorebook behavior)
    // This excludes: system messages, narrator messages, and any other is_system=true messages
    const activeMessages = chat.filter(x => !x.is_system);

    // Get last N active messages
    const recentMessages = activeMessages.slice(-messageCount);

    // Combine message text
    const queryText = recentMessages
        .map(msg => msg.mes || '')
        .filter(text => text.length > 0)
        .join('\n\n');

    debugLog('Built query context', {
        totalMessages: chat.length,
        activeMessages: activeMessages.length,
        selectedMessages: recentMessages.length,
        queryLength: queryText.length,
        preview: queryText.substring(0, 100)
    });

    return queryText;
}

// ============================================================================
// RAG INJECTION
// ============================================================================

/**
 * Inject RAG results into AI context
 *
 * @param {string} characterName - Character name
 * @param {Array} results - RAG query results
 */
async function injectRAGResults(characterName, results) {
    const settings = getRAGSettings();
    const roleKey = settings.injectionRole?.toUpperCase?.() || 'SYSTEM';
    const promptRole = extension_prompt_roles?.[roleKey] ?? extension_prompt_roles.SYSTEM;

    if (!settings.enabled || !results.length) {
        debugLog('Skipping RAG injection', {
            enabled: settings.enabled,
            resultsCount: results.length,
        });
        setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);
        return;
    }

    const uniqueChunks = [];
    const seen = new Set();
    for (const chunk of results) {
        if (!chunk || !chunk.text) {
            continue;
        }
        if (seen.has(chunk.hash)) {
            continue;
        }
        seen.add(chunk.hash);
        uniqueChunks.push(chunk);
    }

    if (!uniqueChunks.length) {
        debugLog('No unique RAG chunks to inject');
        setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);
        return;
    }

    const formatted = uniqueChunks
        .map((chunk) => {
            const headerParts = [chunk.section || DEFAULT_SECTION_TITLE];
            if (chunk.topic) {
                headerParts.push(chunk.topic);
            }
            if (chunk.inferred) {
                headerParts.push('linked');
            }

            const lines = ['### ' + headerParts.join(' � ')];

            if (chunk.tags?.length) {
                lines.push('Tags: ' + chunk.tags.join(', '));
            }

            if (settings.debugMode && chunk.reason) {
                const reasonParts = [];
                if (typeof chunk.reason.rank === 'number') {
                    reasonParts.push('rank ' + (chunk.reason.rank + 1));
                }
                if (chunk.reason.score) {
                    reasonParts.push('score ' + chunk.reason.score);
                }
                if (chunk.reason.sharedKeywords?.length) {
                    reasonParts.push('keywords ' + chunk.reason.sharedKeywords.slice(0, 4).join(', '));
                }
                if (chunk.reason.sharedTags?.length) {
                    reasonParts.push('tags ' + chunk.reason.sharedTags.join(', '));
                }
                if (reasonParts.length) {
                    reasonParts.push('hash ' + chunk.hash);
                    lines.push('Reason: ' + reasonParts.join(' | '));
                }
            }

            lines.push(chunk.text.trim());
            return lines.join('\\n');
        })
        .join('\\n\\n');

    setExtensionPrompt(
        RAG_PROMPT_TAG,
        formatted,
        extension_prompt_types.IN_PROMPT,
        settings.injectionDepth,
        false,
        promptRole,
    );

    debugLog(`Injected RAG results for ${characterName}`, {
        injectedChunks: uniqueChunks.length,
    });

    if (settings.debugMode) {
        console.log('[CarrotKernel RAG] Injection', { characterName, injectedChunks: uniqueChunks.length });
        console.log(formatted);
    }
}

function detectFullsheetInMessage(messageText) {
    console.log('🔍 [detectFullsheetInMessage] Starting detection...');
    console.log(`   Message length: ${messageText?.length || 0} chars`);
    console.log(`   Min size required: ${FULLSHEET_MIN_SIZE}`);

    // Very permissive - if there's ANY structured content, try to parse it
    if (!messageText || messageText.length < 1000) {
        console.log('❌ [detectFullsheetInMessage] Message too short or empty');
        return null;
    }

    // Check for section headers with pattern - VERY PERMISSIVE & LANGUAGE-AGNOSTIC
    console.log('🔍 [detectFullsheetInMessage] Looking for numbered section headers...');
    console.log(`   Pattern: [##] [ANY-WORD] number/number (works for all languages)`);
    console.log(`   Examples: "## SECTION 1/8", "##セクション 1/8", "# 部分 1/8", "SECCIÓN 1/8"`);
    console.log(`   Message sample:`, messageText.substring(0, 500));

    // Match any header with format - allows with/without ##, with/without colon, spaces around /
    // \S+ matches ANY non-whitespace characters (Chinese/Japanese/Korean/Arabic/Cyrillic/etc.)
    const sectionMatches = messageText.match(/^#{0,2}\s*\S+\s+\d+\s*\/\s*\d+/gim);
    console.log(`   Found ${sectionMatches?.length || 0} numbered section headers`);
    if (sectionMatches) {
        console.log(`   Matches:`, sectionMatches);
    }

    // Check for BunnymoTags - UNIVERSAL & LANGUAGE-AGNOSTIC
    console.log('🔍 [detectFullsheetInMessage] Looking for BunnymoTags...');
    console.log(`   Checking for tag structure <TAG:content> (works for ALL languages)`);
    console.log(`   Examples: <NAME:John>, <名前:太郎>, <NOMBRE:Juan>, <ИМЯ:Иван>`);

    // [^\s>]+ matches ANY non-whitespace non-> characters (works for all Unicode)
    const tagMatches = messageText.match(/<[^\s>]+:[^>]+>/g);
    const tagCount = tagMatches ? tagMatches.length : 0;
    console.log(`   Found ${tagCount} tags with format <TAG:content>`);

    // VERY PERMISSIVE: Need either 2+ sections OR 3+ tags
    const hasSections = sectionMatches && sectionMatches.length >= 2;
    const hasTags = tagCount >= 3;

    console.log(`   Has sufficient sections: ${hasSections} (${sectionMatches?.length || 0} found, need 2+)`);
    console.log(`   Has sufficient tags: ${hasTags} (${tagCount} found, need 3+)`);

    if (!hasSections && !hasTags) {
        console.log('❌ [detectFullsheetInMessage] Not enough structure (need 2+ sections OR 3+ tags)');
        return null;
    }

    console.log('✅ [detectFullsheetInMessage] Fullsheet structure detected!');

    // Try to extract character name from the FIRST tag - LANGUAGE-AGNOSTIC
    console.log('🔍 [detectFullsheetInMessage] Extracting character name as suggestion...');

    // Universal name extraction: Find the first tag in the document (usually the name tag)
    // Works for ANY language: <NAME:John>, <名前:太郎>, <NOMBRE:Juan>, <ИМЯ:Иван>, etc.
    // [^\s>]+ matches any non-whitespace characters (all Unicode scripts)
    const firstTagMatch = messageText.match(/<[^\s>]+:\s*([^>]+)>/);
    console.log(`   First tag match:`, firstTagMatch);

    const characterName = firstTagMatch ? firstTagMatch[1].trim().replace(/_/g, ' ') : 'Unknown';
    console.log(`   Extracted name suggestion: "${characterName}" (user can override this)`);

    const result = {
        characterName,
        content: messageText,
        sectionCount: sectionMatches?.length || 0
    };

    console.log('✅ [detectFullsheetInMessage] Fullsheet detected!', result);
    debugLog('Fullsheet detected in message', result);

    return result;
}

/**
 * Add RAG button to a message containing a fullsheet
 *
 * @param {number} messageId - Message ID
 */
function addRAGButtonToMessage(messageId) {
    const settings = getRAGSettings();
    if (!settings.enabled) {
        return;
    }

    // Find the message element
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length === 0) {
        debugLog(`Message ${messageId} not found in DOM`);
        return;
    }

    // Check if button already exists
    if (messageElement.find(`.${RAG_BUTTON_CLASS}`).length > 0) {
        return;
    }

    // Get message data
    const message = chat.find(msg => msg.index === messageId);
    if (!message || !message.mes) {
        return;
    }

    // Detect fullsheet
    const fullsheetInfo = detectFullsheetInMessage(message.mes);
    if (!fullsheetInfo) {
        return;
    }

    debugLog(`Adding RAG button to message ${messageId}`, fullsheetInfo);

    // Create the button
    const button = $('<div>')
        .addClass(RAG_BUTTON_CLASS)
        .attr('data-message-id', messageId)
        .css({
            'position': 'absolute',
            'top': '5px',
            'right': '40px', // Position to the left of Baby Bunny button if it exists
            'padding': '6px 12px',
            'background': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            'color': 'white',
            'border-radius': '6px',
            'cursor': 'pointer',
            'font-size': '0.85em',
            'font-weight': '600',
            'display': 'flex',
            'align-items': 'center',
            'gap': '6px',
            'z-index': '10',
            'transition': 'all 0.2s'
        })
        .html('<i class="fa-solid fa-cube"></i> Vectorize Fullsheet')
        .on('click', async function(e) {
            e.stopPropagation();
            await handleRAGButtonClick(messageId, fullsheetInfo);
        })
        .on('mouseenter', function() {
            $(this).css({
                'background': 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                'transform': 'translateY(-2px)',
                'box-shadow': '0 4px 12px rgba(139, 92, 246, 0.4)'
            });
        })
        .on('mouseleave', function() {
            $(this).css({
                'background': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                'transform': 'translateY(0)',
                'box-shadow': 'none'
            });
        });

    // Add button to message
    messageElement.css('position', 'relative').append(button);
}

/**
 * Handle RAG button click - vectorize the fullsheet
 *
 * @param {number} messageId - Message ID
 * @param {Object} fullsheetInfo - Fullsheet information
 */
async function handleRAGButtonClick(messageId, fullsheetInfo) {
    const button = $(`.${RAG_BUTTON_CLASS}[data-message-id="${messageId}"]`);

    try {
        // Prompt user for character name
        const characterName = prompt(
            'Enter character name for this fullsheet:',
            fullsheetInfo.characterName || ''
        );

        if (!characterName || characterName.trim() === '') {
            toastr.info('Vectorization cancelled');
            return;
        }

        const trimmedName = characterName.trim();

        button.html('<i class="fa-solid fa-spinner fa-spin"></i> Vectorizing...')
              .css('pointer-events', 'none');

        debugLog(`Vectorizing fullsheet for ${trimmedName}`);

        // Vectorize the fullsheet with user-provided name
        const success = await vectorizeFullsheetFromMessage(
            trimmedName,
            fullsheetInfo.content
        );

        if (success) {
            button.html('<i class="fa-solid fa-check"></i> Vectorized!')
                  .css('background', 'linear-gradient(135deg, #10b981, #059669)');

            setTimeout(() => {
                button.fadeOut(300, function() {
                    $(this).remove();
                });
            }, 2000);

            // Show success toast
            if (typeof toastr !== 'undefined') {
                toastr.success(`✅ ${trimmedName} fullsheet vectorized!`);
            }
        } else {
            throw new Error('Vectorization failed');
        }

    } catch (error) {
        console.error('RAG vectorization error:', error);
        const originalHTML = button.html();
        button.html('<i class="fa-solid fa-xmark"></i> Failed')
              .css('background', 'linear-gradient(135deg, #ef4444, #dc2626)');

        setTimeout(() => {
            button.html(originalHTML).css({
                'background': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                'pointer-events': 'auto'
            });
        }, 2000);

        if (typeof toastr !== 'undefined') {
            toastr.error(`Failed to vectorize fullsheet: ${error.message}`);
        }
    }
}

/**
 * Vectorize a fullsheet from message content
 *
 * @param {string} characterName - Character name
 * @param {string} content - Fullsheet content
 * @returns {Promise<boolean>} Success status
 */
async function vectorizeFullsheetFromMessage(characterName, content) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 VECTORIZATION STARTED');
    console.log(`   Character: ${characterName}`);
    console.log(`   Content length: ${content.length} chars`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const settings = getRAGSettings();
    const collectionId = generateCollectionId(characterName);

    console.log(`📋 Settings:`, {
        enabled: settings.enabled,
        simpleChunking: settings.simpleChunking,
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
        contextLevel: getCurrentContextLevel()
    });
    console.log(`🗂️  Collection ID: ${collectionId}`);

    try {
        // Step 1: Chunk the fullsheet
        console.log('\n📦 STEP 1: Chunking fullsheet...');
        const chunks = chunkFullsheet(content, characterName, settings.chunkSize, settings.chunkOverlap);

        if (!chunks || chunks.length === 0) {
            console.error('❌ STEP 1 FAILED: Chunking resulted in 0 chunks');
            throw new Error('Fullsheet chunking resulted in 0 chunks');
        }

        console.log(`✅ STEP 1 COMPLETE: Created ${chunks.length} chunks`);
        console.log(`   First chunk preview:`, chunks[0].text.substring(0, 100) + '...');
        console.log(`   Chunk hashes:`, chunks.map(c => c.hash));

        // Step 2: Get existing hashes
        console.log('\n🔍 STEP 2: Checking for existing chunks in vector DB...');
        const savedHashes = await apiGetSavedHashes(collectionId);
        const savedHashSet = new Set(savedHashes.map(h => h.hash));
        console.log(`✅ STEP 2 COMPLETE: Found ${savedHashes.length} existing hashes`);
        if (savedHashes.length > 0) {
            console.log(`   Existing hashes:`, Array.from(savedHashSet));
        }

        // Step 3: Filter new chunks
        console.log('\n🔢 STEP 3: Filtering for new chunks...');
        const newChunks = chunks.filter(chunk => !savedHashSet.has(chunk.hash));
        console.log(`✅ STEP 3 COMPLETE:`);
        console.log(`   Total chunks: ${chunks.length}`);
        console.log(`   Already saved: ${chunks.length - newChunks.length}`);
        console.log(`   New chunks to insert: ${newChunks.length}`);

        // Step 4: Insert new chunks
        if (newChunks.length > 0) {
            console.log(`\n💾 STEP 4: Inserting ${newChunks.length} new chunks into vector DB...`);
            console.log(`   New chunk hashes:`, newChunks.map(c => c.hash));

            await apiInsertVectorItems(collectionId, newChunks);

            console.log(`✅ STEP 4 COMPLETE: Vector insertion successful`);
        } else {
            console.log('\n⏭️  STEP 4 SKIPPED: No new chunks to insert');
        }

        // Step 5: Update local library
        console.log('\n📚 STEP 5: Updating local library...');
        const library = getContextualLibrary();
        console.log(`   Current library keys:`, Object.keys(library));

        if (!library[collectionId]) {
            console.log(`   Creating new collection entry: ${collectionId}`);
            library[collectionId] = {};
        } else {
            console.log(`   Collection already exists, updating...`);
        }

        chunks.forEach(chunk => {
            library[collectionId][chunk.hash] = {
                text: chunk.text,
                ...chunk.metadata
            };
        });

        console.log(`   Updated library with ${chunks.length} chunks`);
        console.log(`   Library now has ${Object.keys(library[collectionId]).length} total entries for this collection`);

        // Initialize collection metadata if it doesn't exist
        ensureRagState();
        const ragState = extension_settings[extensionName].rag;
        if (!ragState.collectionMetadata) {
            ragState.collectionMetadata = {};
        }
        if (!ragState.collectionMetadata[collectionId]) {
            // Initialize with character name as default trigger (user can edit/remove it)
            const defaultTriggers = characterName ? [characterName] : [];

            ragState.collectionMetadata[collectionId] = {
                keywords: defaultTriggers, // Activation triggers (determines IF collection activates - like lorebook triggers)
                alwaysActive: false, // If true, ignores triggers and always queries this collection
                characterName: characterName,
                createdAt: Date.now(),
                lastModified: Date.now()
            };
        } else {
            // Update lastModified timestamp
            ragState.collectionMetadata[collectionId].lastModified = Date.now();
        }

        saveSettingsDebounced();
        console.log(`✅ STEP 5 COMPLETE: Local library updated and saved`);

        // Step 6: Track current embedding provider
        console.log('\n🏷️  STEP 6: Tracking embedding provider...');
        const vectorSettings = getVectorSettings();
        // ragState already declared above, just reuse it
        ragState.lastEmbeddingSource = vectorSettings.source;
        ragState.lastEmbeddingModel = vectorSettings.model || null;
        saveSettingsDebounced();
        console.log(`✅ STEP 6 COMPLETE: Tracked embedding provider`);
        console.log(`   Source: ${vectorSettings.source}`);
        console.log(`   Model: ${vectorSettings.model || 'default'}`);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ VECTORIZATION SUCCESSFUL: ${characterName}`);
        console.log(`   Total chunks: ${chunks.length}`);
        console.log(`   Collection ID: ${collectionId}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Show success toast only if new chunks were added
        if (newChunks.length > 0) {
            toastr.success(`Chunked ${characterName}'s fullsheet (${chunks.length} chunks)`);
            return true;
        } else {
            toastr.info(`${characterName}'s fullsheet already chunked`);
            return false;
        }

    } catch (error) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ VECTORIZATION FAILED:', characterName);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        toastr.error(`Failed to chunk ${characterName}: ${error.message}`);
        return false;
    }
}

/**
 * Add RAG buttons to all existing messages
 */
function addRAGButtonsToAllMessages() {
    const settings = getRAGSettings();
    if (!settings.enabled) {
        return;
    }

    debugLog('Adding RAG buttons to all existing messages');

    chat.forEach((message, index) => {
        if (!message.is_user && message.mes) {
            addRAGButtonToMessage(index);
        }
    });
}

/**
 * Remove all RAG buttons
 */
function removeAllRAGButtons() {
    $(`.${RAG_BUTTON_CLASS}`).remove();
    debugLog('Removed all RAG buttons');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the RAG system
 */
function initializeRAG() {
    debugLog('Initializing CarrotKernel RAG system');

    // Register RAG interceptor for generation events
    eventSource.on(event_types.GENERATION_STARTED, carrotKernelRagInterceptor);
    debugLog('✅ RAG interceptor registered for GENERATION_STARTED');

    // Hook into message events for button detection
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        const settings = getRAGSettings();
        if (settings.enabled) {
            addRAGButtonToMessage(messageId);

            // Auto-vectorize if enabled
            if (settings.autoVectorize) {
                autoVectorizeMessage(messageId);
            }
        }
    });

    // Hook into chat changed event to add buttons to existing messages
    eventSource.on(event_types.CHAT_CHANGED, () => {
        const settings = getRAGSettings();
        if (settings.enabled) {
            setTimeout(() => {
                addRAGButtonsToAllMessages();
            }, 500);
        }
    });

    // Add buttons to current chat on init
    setTimeout(() => {
        addRAGButtonsToAllMessages();
    }, 1000);

    debugLog('✅ CarrotKernel RAG system initialized');
}

/**
 * Auto-vectorize a message if it contains a fullsheet
 *
 * @param {number} messageId - Message ID
 */
async function autoVectorizeMessage(messageId) {
    const message = chat.find(msg => msg.index === messageId);
    if (!message || !message.mes || message.is_user) {
        return;
    }

    const fullsheetInfo = detectFullsheetInMessage(message.mes);
    if (!fullsheetInfo) {
        return;
    }

    const collectionId = generateCollectionId(fullsheetInfo.characterName);
    const exists = await collectionExists(collectionId);

    // Only auto-vectorize if collection doesn't exist yet
    if (!exists) {
        debugLog(`Auto-vectorizing fullsheet for ${fullsheetInfo.characterName}`);

        const success = await vectorizeFullsheetFromMessage(
            fullsheetInfo.characterName,
            fullsheetInfo.content
        );

        if (success && typeof toastr !== 'undefined') {
            toastr.info(`🔬 Auto-vectorized ${fullsheetInfo.characterName} fullsheet`);
        }
    }
}

async function carrotKernelRagInterceptor(chatArray, contextSize, abort, type) {
    const settings = getRAGSettings();
    const roleKey = settings.injectionRole?.toUpperCase?.() || 'SYSTEM';
    const promptRole = extension_prompt_roles?.[roleKey] ?? extension_prompt_roles.SYSTEM;

    // Clear any existing prompt first
    setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);

    if (!settings.enabled) {
        return false;
    }

    // Only process on actual user-initiated generation (not dry runs, not impersonate, etc)
    if (!type || type === 'dry' || type === 'quiet' || type === 'impersonate') {
        return false;
    }

    console.log('┌─────────────────────────────────────────────────────');
    console.log('│ 🥕 CARROTKERNEL RAG INTERCEPTOR ACTIVATED');
    console.log('└─────────────────────────────────────────────────────');

    try {
        const context = getContext();
        const activeCharacter = context?.characters?.[context.characterId];
        const characterName = activeCharacter?.name || context?.character?.name || null;

        if (!characterName) {
            console.log('⚠️  RAG: No active character found');
            debugLog('No active character found for RAG interceptor');
            setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);
            return false;
        }

        console.log(`📝 RAG: Character = ${characterName}`);

        const queryText = buildQueryContext(settings.queryContext).trim();
        if (!queryText.length) {
            console.log('⚠️  RAG: No recent messages to query');
            debugLog('Empty query context for RAG interceptor');
            setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);
            return false;
        }

        console.log(`🔍 RAG: Query = "${queryText.substring(0, 100)}..."`);

        const ragChunks = await queryRAG(characterName, queryText);

        if (ragChunks.length > 0) {
            console.log(`✅ RAG: Found ${ragChunks.length} relevant chunk${ragChunks.length > 1 ? 's' : ''}`);
            console.log('📦 RAG: Chunks being injected:');
            ragChunks.forEach((chunk, i) => {
                console.log(`   ${i + 1}. [${chunk.section}] ${chunk.text.substring(0, 60)}... (${chunk.text.length} chars)`);
            });
        } else {
            console.log('⚠️  RAG: No relevant chunks found for this query');
        }

        await injectRAGResults(characterName, ragChunks);

        console.log('✅ RAG: Injection complete');
        console.log('─────────────────────────────────────────────────────\n');
    } catch (error) {
        console.error('❌ RAG: Interceptor failed', error);
        setExtensionPrompt(RAG_PROMPT_TAG, '', extension_prompt_types.IN_PROMPT, settings.injectionDepth, false, promptRole);
    }

    return false;
}

window.carrotKernelRagInterceptor = carrotKernelRagInterceptor;

/**
 * Purge orphaned vectors from a collection
 * Called when chunks are deleted from the library to clean up vector DB
 */
async function purgeOrphanedVectors(collectionId, deletedHashes) {
    if (!Array.isArray(deletedHashes) || deletedHashes.length === 0) {
        return;
    }

    debugLog(`Purging ${deletedHashes.length} orphaned vectors from ${collectionId}`, { deletedHashes });

    try {
        const exists = await collectionExists(collectionId);
        if (!exists) {
            debugLog(`Collection ${collectionId} doesn't exist, nothing to purge`);
            return;
        }

        await apiDeleteVectorHashes(collectionId, deletedHashes);
        debugLog(`Successfully purged ${deletedHashes.length} vectors from ${collectionId}`);
    } catch (error) {
        console.error(`Failed to purge orphaned vectors from ${collectionId}:`, error);
        throw error;
    }
}

/**
 * Delete an entire collection from the vector database
 */
async function deleteEntireCollection(collectionId) {
    debugLog(`Deleting entire collection: ${collectionId}`);

    try {
        const exists = await collectionExists(collectionId);
        if (!exists) {
            debugLog(`Collection ${collectionId} doesn't exist, nothing to delete`);
            return;
        }

        await apiDeleteCollection(collectionId);
        debugLog(`Successfully deleted collection ${collectionId}`);
    } catch (error) {
        console.error(`Failed to delete collection ${collectionId}:`, error);
        throw error;
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

globalThis.CarrotKernelFullsheetRag = {
    getRAGSettings,
    saveRAGSettings,
    generateCollectionId,
    chunkFullsheet,
    collectionExists,
    queryRAG,
    injectRAGResults,
    addRAGButtonsToAllMessages,
    removeAllRAGButtons,
    detectFullsheetInMessage,
    vectorizeFullsheetFromMessage,
    getCurrentContextLevel,
    getContextualLibrary,
    getAllContextualLibraries,
    purgeOrphanedVectors,
    deleteEntireCollection,
    apiInsertVectorItems,
};

// ES6 Module Exports (for dynamic import)
export {
    initializeRAG,
    saveRAGSettings,
    addRAGButtonsToAllMessages,
    removeAllRAGButtons,
    detectFullsheetInMessage,
    vectorizeFullsheetFromMessage,
    getCurrentContextLevel,
    getContextualLibrary,
    getAllContextualLibraries,
    getKeywordPriority,
    normalizeKeyword,
    getRAGSettings,
    chunkFullsheet,
    generateCollectionId,
    buildChunkMetadata,
};









