// =============================================================================
// CARROT PACK MANAGER SYSTEM 🥕
// Manages BunnyMo pack installation, updates, and synchronization
// =============================================================================

import { saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { updateWorldInfoList } from '../../../world-info.js';
import { CarrotDebug } from './debugger.js';
import { EXTENSION_NAME } from './carrot-state.js';

// Use consistent extension name from carrot-state.js
const extensionName = EXTENSION_NAME;

export class CarrotPackManager {
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

        // If we're close to the limit, wait — but only briefly. GitHub's
        // unauthenticated limit resets hourly; silently sleeping until then made
        // the scan appear to hang for up to 60 minutes with no user feedback.
        if (this.rateLimitInfo.remaining <= 5) {
            const waitTime = Math.max(0, this.rateLimitInfo.resetTime - now);
            const MAX_WAIT_MS = 30000;
            if (waitTime > MAX_WAIT_MS) {
                const minutes = Math.ceil(waitTime / 60000);
                throw new Error(`GitHub API rate limit reached — try again in ~${minutes} minute${minutes === 1 ? '' : 's'}`);
            }
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

        // Only log if rate limit is getting low (< 10 remaining)
        if (this.rateLimitInfo.remaining < 10) {
            CarrotDebug.repo(`⚠️ Rate limit low: ${this.rateLimitInfo.remaining}/${this.rateLimitInfo.limit} remaining`);
        }
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
        CarrotDebug.repo('🧪 Testing rate limiting system...');

        const testUrl = `https://api.github.com/repos/${this.githubRepo}/contents`;
        const startTime = Date.now();

        try {
            CarrotDebug.repo('📊 Current rate limit info:', this.rateLimitInfo);
            CarrotDebug.repo('🔄 Making test request with rate limiting...');

            const response = await this.fetchWithRateLimit(testUrl);
            const endTime = Date.now();

            CarrotDebug.repo('✅ Rate-limited request completed:', {
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
            CarrotDebug.error('❌ Rate limiting test failed:', error);
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
            
            // /api/worldinfo/import only accepts multipart file uploads; /edit accepts
            // exactly the { name, data } JSON shape already built here, plus it needs
            // the CSRF token that getRequestHeaders() supplies.
            const saveResponse = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: filename.replace(/\.json$/i, ''), data: packData })
            });

            if (!saveResponse.ok) {
                throw new Error(`Failed to save lorebook: ${saveResponse.status}`);
            }

            // Track installation
            // CRITICAL: Never overwrite extension_settings completely
            if (!extension_settings[extensionName]) {
                CarrotDebug.error('⚠️ PACK MANAGER: extension_settings not initialized - this should not happen');
                extension_settings[extensionName] = {};
            }
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
            await updateWorldInfoList();

            // Auto-scan newly installed pack for characters
            if (typeof window.CarrotKernel?.scanSelectedLorebooks === 'function') {
                try {
                    await window.CarrotKernel.scanSelectedLorebooks([filename]);
                    CarrotDebug.repo(`✅ Auto-scanned newly installed pack: ${filename}`);
                } catch (error) {
                    CarrotDebug.error('Failed to auto-scan installed pack:', error);
                }
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
        CarrotDebug.repo('scanRemotePacks() called');

        try {
            CarrotDebug.repo('🔍 Scanning remote packs from GitHub...');

            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(this.packsFolder)}`;
            CarrotDebug.repo('API URL constructed:', {
                apiUrl: apiUrl,
                githubRepo: this.githubRepo,
                packsFolder: this.packsFolder
            });

            CarrotDebug.repo('Making rate-limited fetch request to GitHub API...');
            const response = await this.fetchWithRateLimit(apiUrl);

            CarrotDebug.repo('GitHub API response received:', {
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
                CarrotDebug.error('GitHub API error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: errorText
                });
                throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
            }

            CarrotDebug.repo('Parsing JSON response...');
            const contents = await response.json();

            CarrotDebug.repo('GitHub API contents parsed:', {
                isArray: Array.isArray(contents),
                length: contents?.length,
                firstFewItems: contents?.slice(0, 3)
            });

            const packs = contents.filter(item => item.type === 'dir');
            CarrotDebug.repo('Directory items filtered:', {
                totalItems: contents.length,
                packDirectories: packs.length,
                packNames: packs.map(p => p.name)
            });

            this.availablePacks.clear();

            // Fetch pack info (logging only errors to reduce console spam)
            for (const pack of packs) {
                const packInfo = await this.getPackInfo(pack.name);
                if (packInfo) {
                    this.availablePacks.set(pack.name, packInfo);
                } else {
                    CarrotDebug.repo(`⚠️ Failed to get info for pack: ${pack.name}`);
                }
            }

            CarrotDebug.repo('Pack scanning completed:', {
                totalPacksFound: this.availablePacks.size,
                packNames: Array.from(this.availablePacks.keys())
            });

            CarrotDebug.repo(`✅ Found ${this.availablePacks.size} packs on GitHub`);
            return Array.from(this.availablePacks.values());

        } catch (error) {
            CarrotDebug.error('scanRemotePacks failed:', {
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
        try {
            const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${encodeURIComponent(this.packsFolder)}/${encodeURIComponent(packName)}`;
            const response = await this.fetchWithRateLimit(apiUrl);

            if (!response.ok) {
                if (response.status === 403) {
                    CarrotDebug.repo(`Rate limit hit for pack ${packName}`);
                    CarrotDebug.error(`GitHub API rate limit exceeded for pack: ${packName}`);
                    return null;
                }
                CarrotDebug.error(`API error for pack ${packName}: ${response.status}`);
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const contents = await response.json();
            
            // Check if contents is an array (successful response)
            if (!Array.isArray(contents)) {
                CarrotDebug.error(`Invalid response format for pack: ${packName}`, contents);
                return null;
            }
            
            // Find the main pack JSON file (check root level first)
            let jsonFile = contents.find(file => file.name.endsWith('.json'));
            const readmeFile = contents.find(file => file.name.toLowerCase().includes('readme'));

            // If no JSON at root level, search in subfolders
            if (!jsonFile) {
                const subfolders = contents.filter(item => item.type === 'dir');

                for (const folder of subfolders) {
                    try {
                        const subResponse = await this.fetchWithRateLimit(folder.url);
                        if (subResponse.ok) {
                            const subContents = await subResponse.json();
                            if (Array.isArray(subContents)) {
                                jsonFile = subContents.find(file => file.name.endsWith('.json'));
                                if (jsonFile) {
                                    CarrotDebug.repo(`📁 Found JSON in subfolder: ${folder.name}/${jsonFile.name}`);
                                    break; // Found a JSON file, stop searching
                                }
                            }
                        }
                    } catch (error) {
                        // Continue searching other folders if one fails
                        CarrotDebug.repo(`⚠️ Failed to search subfolder ${folder.name}:`, error.message);
                    }
                }
            }

            if (!jsonFile) {
                CarrotDebug.repo(`⚠️ No JSON file found in pack or subfolders: ${packName}`);
                return null;
            }
            
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
            
            // Use ST's native save lorebook functionality. /api/worldinfo/import only
            // accepts multipart file uploads; /edit accepts this { name, data } JSON
            // body directly and just needs the CSRF token from getRequestHeaders().
            const saveResponse = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    name: filename.replace(/\.json$/i, ''),
                    data: packData
                })
            });
            
            if (!saveResponse.ok) {
                throw new Error(`Failed to save lorebook: ${saveResponse.status}`);
            }
            
            // Track installation in our metadata
            // CRITICAL: Never overwrite extension_settings completely
            if (!extension_settings[extensionName]) {
                CarrotDebug.error('⚠️ PACK MANAGER: extension_settings not initialized - this should not happen');
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
            await updateWorldInfoList();

            // Auto-scan newly installed pack for characters
            if (typeof window.CarrotKernel?.scanSelectedLorebooks === 'function') {
                try {
                    await window.CarrotKernel.scanSelectedLorebooks([filename]);
                    CarrotDebug.repo(`✅ Auto-scanned newly installed pack: ${filename}`);
                } catch (error) {
                    CarrotDebug.error('Failed to auto-scan installed pack:', error);
                }
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
                window.CarrotKernel?.openPackManager();
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
            
            // Update the lorebook file using ST's API. /api/worldinfo/import only
            // accepts multipart file uploads; /edit accepts this JSON body directly
            // (it always overwrites by filename — there's no server-side "overwrite"
            // flag to pass) and needs the CSRF token from getRequestHeaders().
            const updateResponse = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    name: String(localPack.filename).replace(/\.json$/i, ''),
                    data: packData
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
            await updateWorldInfoList();
            
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
        // Every install path writes to installedPacks (and never sets an `installed`
        // flag) — this used to read the never-written `packs` key, so installed
        // packs were forgotten on every page load.
        const packs = settings.installedPacks || {};

        this.localPacks.clear();

        for (const [packName, packData] of Object.entries(packs)) {
            this.localPacks.set(packName, packData);
        }

        CarrotDebug.repo(`📁 Loaded ${this.localPacks.size} local packs`);
    }
}
