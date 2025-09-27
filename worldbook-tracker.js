// =============================================================================
// CARROTKERNEL WORLDBOOK TRACKER 🥕📚
// Enhanced worldbook tracking and trigger analysis system
// =============================================================================

// ✨ CARROTKERNEL GLASS - COMPLETELY REDESIGNED VISUAL UX EXPERIENCE ✨
const carrotStyleSheet = document.createElement('style');
carrotStyleSheet.textContent = `
    /* 🎨 ===== CARROTKERNEL GLASS UX SYSTEM ===== 🎨 */

    /* ⚡ Enhanced CSS Variables - Modern Glassmorphism Design */
    :root {
        /* 🥕 CarrotKernel Brand Colors */
        --ck-primary: #ff6b35;
        --ck-primary-light: #ff8c42;
        --ck-primary-dark: #e85a2e;
        --ck-primary-gradient: linear-gradient(135deg, #ff6b35 0%, #ff8c42 50%, #ff9a52 100%);
        --ck-primary-alpha: rgba(255, 107, 53, 0.12);
        --ck-primary-alpha-heavy: rgba(255, 107, 53, 0.25);

        /* 🌊 Glass & Depth System */
        --ck-glass-light: rgba(255, 255, 255, 0.08);
        --ck-glass-medium: rgba(255, 255, 255, 0.15);
        --ck-glass-heavy: rgba(255, 255, 255, 0.25);
        --ck-blur-light: blur(8px);
        --ck-blur-medium: blur(12px);
        --ck-blur-heavy: blur(20px);

        /* 📐 Modern Spacing & Geometry */
        --ck-radius-xs: 4px;
        --ck-radius-sm: 8px;
        --ck-radius-md: 12px;
        --ck-radius-lg: 16px;
        --ck-radius-xl: 24px;
        --ck-spacing-xs: 4px;
        --ck-spacing-sm: 8px;
        --ck-spacing-md: 12px;
        --ck-spacing-lg: 16px;
        --ck-spacing-xl: 24px;
        --ck-spacing-2xl: 32px;

        /* 🎭 Advanced Shadow System */
        --ck-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.06);
        --ck-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        --ck-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.12);
        --ck-shadow-xl: 0 16px 64px rgba(0, 0, 0, 0.24), 0 8px 32px rgba(0, 0, 0, 0.16);
        --ck-shadow-glow: 0 0 24px rgba(255, 107, 53, 0.3), 0 0 12px rgba(255, 107, 53, 0.2);

        /* ⚡ Smooth Animation System */
        --ck-transition-fast: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        --ck-transition-smooth: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        --ck-transition-bounce: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        --ck-transition-spring: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);

        /* 📝 Typography Scale */
        --ck-text-xs: 10px;
        --ck-text-sm: 11px;
        --ck-text-base: 12px;
        --ck-text-md: 13px;
        --ck-text-lg: 14px;
        --ck-text-xl: 16px;
        --ck-text-2xl: 18px;
        --ck-text-3xl: 24px;
    }

    /* 🌟 Advanced Keyframe Animation System */
    @keyframes ck-fade-in {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes ck-slide-in-right {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes ck-bounce-scale {
        0%, 100% { transform: scale(1); }
        25% { transform: scale(0.95); }
        50% { transform: scale(1.05); }
        75% { transform: scale(0.98); }
    }

    @keyframes ck-glow-pulse {
        0%, 100% { box-shadow: var(--ck-shadow-md); }
        50% { box-shadow: var(--ck-shadow-glow); }
    }

    @keyframes ck-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
    }

    @keyframes ck-badge-appear {
        0% { transform: scale(0.8) rotate(-12deg); opacity: 0; }
        50% { transform: scale(1.1) rotate(2deg); opacity: 0.8; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }

    @keyframes ck-badge-disappear {
        0% { transform: scale(1) rotate(0deg); opacity: 1; }
        50% { transform: scale(1.1) rotate(-2deg); opacity: 0.3; }
        100% { transform: scale(0.7) rotate(8deg); opacity: 0; }
    }

    @keyframes ck-debug-expand {
        from {
            max-height: 0;
            opacity: 0;
            transform: translateY(-8px);
        }
        to {
            max-height: 600px;
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 🎯 Glassmorphism Trigger Button */
    .ck-trigger {
        position: fixed;
        top: 0.125em;
        left: 0.25em;
        width: 56px;
        height: 56px;
        background: var(--ck-glass-medium);
        backdrop-filter: var(--ck-blur-medium);
        border: 1px solid var(--ck-glass-light);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 24px;
        color: var(--ck-primary);
        box-shadow: var(--ck-shadow-lg);
        transition: var(--ck-transition-bounce);
        z-index: 9999;
        overflow: visible;
        user-select: none;
        opacity: 0.85;
        box-sizing: border-box;
        animation: ck-glow-pulse 4s ease-in-out infinite;
    }

    .ck-trigger:hover {
        opacity: 1;
        transform: translateY(-2px) scale(1.05);
        box-shadow: var(--ck-shadow-xl), var(--ck-shadow-glow);
        background: var(--ck-glass-heavy);
        border-color: var(--ck-primary-alpha);
    }

    .ck-trigger:active {
        transform: translateY(0) scale(0.98);
        transition: var(--ck-transition-fast);
    }

    /* 🏷️ Floating Badge System */
    .ck-trigger::after {
        content: attr(data-ck-badge-count);
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 20px;
        height: 20px;
        background: var(--ck-primary-gradient);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--ck-text-xs);
        font-weight: 700;
        box-shadow: var(--ck-shadow-md), 0 0 0 2px var(--SmartThemeBlurTintColor);
        opacity: 0;
        transform: scale(0.8);
        transition: var(--ck-transition-spring);
        pointer-events: none;
    }

    .ck-trigger:not([data-ck-badge-count="0"])::after {
        opacity: 1;
        transform: scale(1);
    }

    /* 🎨 Revolutionary Panel Design */
    .ck-panel {
        position: fixed;
        top: 64px;
        left: 16px;
        width: 400px;
        max-width: calc(100vw - 32px);
        min-height: 200px;
        max-height: calc(100vh - 140px);
        background: linear-gradient(145deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.05) 100%);
        backdrop-filter: var(--ck-blur-heavy);
        border: 1px solid var(--ck-glass-light);
        border-radius: var(--ck-radius-xl);
        box-shadow: var(--ck-shadow-xl);
        display: none;
        flex-direction: column;
        overflow: auto;
        transition: var(--ck-transition-spring);
        z-index: 9998;
        opacity: 0;
        transform: translateY(-16px) scale(0.95);
        box-sizing: border-box;
    }



    .ck-panel--active {
        display: flex;
        animation: ck-fade-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    /* 🔗 Simple Connection Line */
    .ck-connection {
        position: fixed;
        width: 2px;
        background: var(--ck-primary);
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 9997;
    }

    .ck-panel--active + .ck-connection {
        opacity: 0.4;
    }

    .ck-panel--large {
        width: 480px;
        max-height: 80vh;
    }




    /* 🎭 Stunning Header Design */
    .ck-header {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-md);
        padding: var(--ck-spacing-lg) var(--ck-spacing-lg);
        background: linear-gradient(135deg,
            var(--ck-glass-heavy) 0%,
            var(--ck-glass-medium) 100%);
        border-bottom: 1px solid var(--ck-glass-light);
        backdrop-filter: var(--ck-blur-light);
        position: relative;
        overflow: hidden;
        word-wrap: break-word;
        min-height: 48px;
    }

    .ck-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg,
            transparent 0%,
            var(--ck-primary-alpha) 50%,
            transparent 100%);
        animation: ck-header-shine 3s ease-in-out infinite;
    }

    @keyframes ck-header-shine {
        0% { left: -100%; }
        50% { left: 100%; }
        100% { left: 100%; }
    }

    .ck-header__icon {
        font-size: var(--ck-text-xl);
        color: var(--ck-primary);
        filter: drop-shadow(0 2px 4px rgba(255, 107, 53, 0.3));
        z-index: 1;
    }

    .ck-header__title {
        font-size: var(--ck-text-md);
        font-weight: 700;
        color: var(--SmartThemeBodyColor);
        flex: 1;
        z-index: 1;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        letter-spacing: 0.025em;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
    }

    .ck-header__badge {
        background: var(--ck-primary-gradient);
        color: white;
        padding: var(--ck-spacing-xs) var(--ck-spacing-md);
        border-radius: var(--ck-radius-lg);
        font-size: var(--ck-text-xs);
        font-weight: 700;
        box-shadow: var(--ck-shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        z-index: 1;
        border: 1px solid rgba(255, 255, 255, 0.2);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    /* 🎛️ Revolutionary Size Controls */
    .ck-size-controls {
        display: flex;
        gap: var(--ck-spacing-sm);
        align-items: center;
        z-index: 1;
        background: var(--ck-glass-light);
        padding: var(--ck-spacing-xs) var(--ck-spacing-sm);
        border-radius: var(--ck-radius-lg);
        border: 1px solid var(--ck-glass-medium);
        backdrop-filter: var(--ck-blur-medium);
        box-shadow: var(--ck-shadow-sm);
    }

    .ck-size-toggle {
        width: 36px;
        height: 28px;
        background: linear-gradient(135deg,
            var(--ck-glass-medium) 0%,
            var(--ck-glass-light) 100%);
        border: 1px solid var(--ck-glass-medium);
        border-radius: var(--ck-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: var(--ck-text-xs);
        font-weight: 600;
        color: var(--SmartThemeBodyColor);
        transition: var(--ck-transition-bounce);
        backdrop-filter: var(--ck-blur-light);
        position: relative;
        overflow: hidden;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .ck-size-toggle::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg,
            transparent 0%,
            var(--ck-primary-alpha) 50%,
            transparent 100%);
        transition: var(--ck-transition-smooth);
    }

    .ck-size-toggle:hover {
        background: var(--ck-primary-gradient);
        border-color: var(--ck-primary);
        color: white;
        transform: translateY(-2px) scale(1.05);
        box-shadow: var(--ck-shadow-md), 0 0 12px var(--ck-primary-alpha);
    }

    .ck-size-toggle:hover::before {
        left: 100%;
    }

    .ck-size-toggle:active {
        transform: translateY(0) scale(0.98);
        transition: var(--ck-transition-fast);
    }

    .ck-size-toggle--active {
        background: var(--ck-primary-gradient);
        color: white;
        border-color: var(--ck-primary-light);
        box-shadow: var(--ck-shadow-md), inset 0 2px 4px rgba(0,0,0,0.2);
    }

    /* 📱 Revolutionary Content Area */
    .ck-content {
        flex: 1;
        overflow-y: auto;
        background: linear-gradient(180deg,
            rgba(255, 255, 255, 0.02) 0%,
            rgba(255, 255, 255, 0.01) 100%);
        backdrop-filter: var(--ck-blur-light);
    }

    .ck-content::-webkit-scrollbar {
        width: 6px;
    }

    .ck-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
    }

    .ck-content::-webkit-scrollbar-thumb {
        background: var(--ck-primary-alpha);
        border-radius: 3px;
        transition: var(--ck-transition-smooth);
    }

    .ck-content::-webkit-scrollbar-thumb:hover {
        background: var(--ck-primary-alpha-heavy);
    }

    /* 🌍 Futuristic World Headers */
    .ck-world-header {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-md);
        padding: var(--ck-spacing-md) var(--ck-spacing-xl);
        background: linear-gradient(135deg,
            var(--ck-glass-medium) 0%,
            var(--ck-glass-light) 100%);
        border-bottom: 1px solid var(--ck-glass-light);
        border-left: 4px solid var(--ck-primary);
        backdrop-filter: var(--ck-blur-light);
        position: sticky;
        top: 0;
        z-index: 10;
    }

    .ck-world-header__icon {
        font-size: var(--ck-text-lg);
        color: var(--ck-primary);
        filter: drop-shadow(0 1px 2px rgba(255, 107, 53, 0.3));
    }

    .ck-world-header__title {
        font-size: var(--ck-text-base);
        font-weight: 600;
        color: var(--SmartThemeBodyColor);
        flex: 1;
        letter-spacing: 0.02em;
    }

    .ck-world-header__badge {
        background: var(--ck-primary-gradient);
        color: white;
        padding: var(--ck-spacing-xs) var(--ck-spacing-sm);
        border-radius: var(--ck-radius-md);
        font-size: var(--ck-text-xs);
        font-weight: 600;
        box-shadow: var(--ck-shadow-sm);
        border: 1px solid rgba(255, 255, 255, 0.2);
        min-width: 20px;
        text-align: center;
    }

    /* ✨ Clean Modern Entry Cards */
    .ck-entry {
        background: color-mix(in srgb, var(--SmartThemeChatTintColor) 92%, var(--SmartThemeQuoteColor));
        border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 30%, transparent);
        border-left: 4px solid var(--SmartThemeQuoteColor);
        margin: var(--ck-spacing-xs) 0;
        border-radius: var(--ck-radius-md);
        padding: 1rem;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        position: relative;
        backdrop-filter: blur(calc(var(--SmartThemeBlurStrength) * 0.5));
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--SmartThemeShadowColor) 8%, transparent);
    }

    /* 📱 Compact Mode - Clean and Minimal */
    .ck-panel--compact .ck-entry {
        padding: 8px 12px;
        margin: 2px 0;
        border-radius: var(--ck-radius-sm);
        min-height: 40px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-left: 3px solid var(--SmartThemeQuoteColor);
        border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 25%, transparent);
        background: color-mix(in srgb, var(--SmartThemeChatTintColor) 94%, var(--SmartThemeQuoteColor));
        flex-direction: row;
        box-shadow: 0 1px 3px color-mix(in srgb, var(--SmartThemeShadowColor) 8%, transparent);
    }

    .ck-panel--compact .ck-entry:last-child {
        border-bottom: none;
    }

    .ck-panel--compact .ck-entry__top-row {
        flex: 1;
        gap: 10px;
        margin: 0;
        min-width: 0; /* Allow flex items to shrink below content size */
        align-items: center;
    }

    .ck-panel--compact .ck-entry__icon {
        width: 24px;
        height: 24px;
        font-size: 1rem;
        border-radius: var(--ck-radius-xs);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 15%, transparent);
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 25%, transparent);
        color: var(--SmartThemeQuoteColor);
    }

    .ck-panel--compact .ck-entry__title {
        font-size: 0.875rem;
        margin: 0;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
        color: var(--SmartThemeBodyColor);
        flex: 1;
        min-width: 0; /* Allow flex item to shrink */
    }

    .ck-panel--compact .ck-summary {
        display: none;
    }

    .ck-panel--compact .ck-debug {
        display: none;
    }

    .ck-entry__indicators {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .ck-entry__trigger-indicator {
        font-size: 1rem;
        opacity: 0.8;
        cursor: help;
    }

    .ck-panel--compact .ck-entry__indicators {
        gap: 4px;
        display: flex !important;
        align-items: center;
        flex-shrink: 0;
    }

    .ck-panel--compact .ck-entry__trigger-indicator {
        font-size: 0.875rem;
        display: inline-block !important;
        opacity: 1;
    }

    .ck-entry__trigger-reason {
        font-size: 0.75rem;
        color: color-mix(in srgb, var(--SmartThemeBodyColor) 70%, transparent);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .ck-panel--compact .ck-entry__trigger-reason {
        font-size: 0.625rem;
        display: inline-block;
    }

    /* Hide trigger reason in detailed mode to avoid clutter */
    .ck-panel:not(.ck-panel--compact) .ck-entry__trigger-reason {
        display: none;
    }

    .ck-panel--compact .ck-entry__sticky {
        font-size: 0.75rem;
        padding: 1px 4px;
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 20%, transparent);
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 35%, transparent);
        border-radius: var(--ck-radius-xs);
        color: var(--SmartThemeQuoteColor);
        font-weight: 600;
    }

    /* Color coding for compact mode - title only */
    .ck-panel--compact .ck-entry[data-strategy="constant"] .ck-entry__title {
        color: #6366f1;
        font-weight: 600;
    }

    .ck-panel--compact .ck-entry[data-strategy="vector"] .ck-entry__title {
        color: #8b5cf6;
        font-weight: 600;
    }

    .ck-panel--compact .ck-entry[data-strategy="normal"] .ck-entry__title {
        color: #10b981;
        font-weight: 600;
    }

    .ck-panel--compact .ck-entry[data-strategy="forced"] .ck-entry__title {
        color: #f59e0b;
        font-weight: 600;
    }

    .ck-panel--compact .ck-entry[data-strategy="sticky"] .ck-entry__title {
        color: #ef4444;
        font-weight: 600;
    }

    .ck-panel--compact .ck-entry[data-strategy="removed"] .ck-entry__title {
        color: #f97316;
        font-weight: 600;
    }

    .ck-entry::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--ck-primary-alpha);
        opacity: 0;
        transition: var(--ck-transition-smooth);
        border-radius: var(--ck-radius-md);
    }

    .ck-entry:hover {
        transform: translateY(-2px);
        border-left-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 80%, var(--SmartThemeBodyColor));
        border-color: color-mix(in srgb, var(--SmartThemeBorderColor) 50%, var(--SmartThemeQuoteColor));
        background: color-mix(in srgb, var(--SmartThemeChatTintColor) 88%, var(--SmartThemeQuoteColor));
        box-shadow: 0 4px 16px color-mix(in srgb, var(--SmartThemeShadowColor) 15%, transparent);
    }

    .ck-entry:hover::before {
        opacity: 1;
    }

    .ck-entry:active {
        transform: translateY(0) scale(0.98);
    }

    .ck-entry__top-row {
        display: flex;
        align-items: flex-start;
        gap: var(--ck-spacing-md);
        position: relative;
        z-index: 1;
    }

    .ck-entry__icon {
        font-size: 1.5rem;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 20%, transparent);
        border-radius: var(--ck-radius-sm);
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 30%, transparent);
        flex-shrink: 0;
        color: var(--SmartThemeQuoteColor);
    }

    .ck-entry__title {
        flex: 1;
        font-size: 1rem;
        font-weight: 500;
        color: var(--SmartThemeBodyColor);
        line-height: 1.4;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        max-width: 100%;
    }

    .ck-entry__sticky {
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 25%, transparent);
        color: var(--SmartThemeQuoteColor);
        padding: 4px 8px;
        border-radius: var(--ck-radius-sm);
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 40%, transparent);
    }

    /* 📊 Enhanced Summary Tags */
    .ck-summary {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-sm);
        margin-top: var(--ck-spacing-md);
        margin-left: 56px;
        flex-wrap: wrap;
        position: relative;
        z-index: 1;
    }

    .ck-summary__tag {
        background: var(--ck-glass-medium);
        border: 1px solid var(--ck-glass-light);
        backdrop-filter: var(--ck-blur-light);
        color: var(--SmartThemeBodyColor);
        padding: var(--ck-spacing-xs) var(--ck-spacing-sm);
        border-radius: var(--ck-radius-sm);
        font-size: var(--ck-text-xs);
        font-weight: 500;
        transition: var(--ck-transition-smooth);
    }

    .ck-summary__tag:hover {
        background: var(--ck-primary-alpha);
        border-color: var(--ck-primary);
        color: var(--ck-primary);
        transform: scale(1.05);
    }

    /* 🔬 Advanced Debug Container */
    .ck-debug {
        margin-top: var(--ck-spacing-lg);
        margin-left: 56px;
        background: linear-gradient(135deg,
            rgba(0, 0, 0, 0.1) 0%,
            rgba(0, 0, 0, 0.05) 100%);
        border: 1px solid var(--ck-glass-light);
        border-radius: var(--ck-radius-md);
        backdrop-filter: var(--ck-blur-medium);
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: var(--ck-transition-spring);
        position: relative;
        z-index: 1;
    }

    .ck-entry--expanded .ck-debug {
        max-height: 600px;
        opacity: 1;
        animation: ck-debug-expand 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .ck-debug__content {
        padding: var(--ck-spacing-lg);
        font-size: var(--ck-text-sm);
        line-height: 1.6;
        color: var(--SmartThemeEmColor);
    }

    .ck-debug__section {
        margin-bottom: var(--ck-spacing-lg);
    }

    .ck-debug__heading {
        font-size: var(--ck-text-base);
        font-weight: 700;
        color: var(--ck-primary);
        margin-bottom: var(--ck-spacing-sm);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .ck-debug__field {
        background: var(--ck-glass-light);
        border: 1px solid var(--ck-glass-medium);
        border-radius: var(--ck-radius-sm);
        padding: var(--ck-spacing-md);
        font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
        font-size: var(--ck-text-sm);
        backdrop-filter: var(--ck-blur-light);
        word-break: break-all;
    }

    /* 🎭 Beautiful Empty State */
    .ck-empty {
        padding: var(--ck-spacing-2xl);
        text-align: center;
        background: linear-gradient(135deg,
            rgba(255, 255, 255, 0.03) 0%,
            rgba(255, 255, 255, 0.01) 100%);
        backdrop-filter: var(--ck-blur-light);
        min-height: 300px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: relative;
        overflow: hidden;
    }

    .ck-empty::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 200px;
        height: 200px;
        background: radial-gradient(circle, var(--ck-primary-alpha) 0%, transparent 70%);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        opacity: 0.3;
        animation: ck-glow-pulse 3s ease-in-out infinite;
    }

    .ck-empty__icon {
        font-size: 48px;
        color: var(--ck-primary);
        margin-bottom: var(--ck-spacing-lg);
        opacity: 0.7;
        filter: drop-shadow(0 4px 8px rgba(255, 107, 53, 0.3));
        z-index: 1;
    }

    .ck-empty__title {
        font-size: var(--ck-text-2xl);
        font-weight: 700;
        color: var(--SmartThemeBodyColor);
        margin-bottom: var(--ck-spacing-md);
        z-index: 1;
    }

    .ck-empty__description {
        font-size: var(--ck-text-lg);
        color: var(--SmartThemeEmColor);
        opacity: 0.8;
        line-height: 1.6;
        max-width: 320px;
        z-index: 1;
    }

    /* 🎚️ Modern Debug Toggle */
    .ck-debug-toggle {
        position: absolute;
        top: var(--ck-spacing-md);
        right: var(--ck-spacing-md);
        width: 36px;
        height: 36px;
        background: var(--ck-glass-medium);
        border: 1px solid var(--ck-glass-light);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: var(--ck-text-sm);
        font-weight: 600;
        transition: var(--ck-transition-bounce);
        backdrop-filter: var(--ck-blur-medium);
        z-index: 100;
        color: #ff6b6b;
    }

    .ck-debug-toggle:hover {
        transform: scale(1.1) rotate(5deg);
        background: var(--ck-glass-heavy);
        box-shadow: var(--ck-shadow-md);
        color: #ff4757;
    }

    .ck-debug-toggle--active {
        background: var(--ck-primary-gradient);
        color: white;
        box-shadow: var(--ck-shadow-glow);
    }

    /* ⚙️ Sophisticated Config Panel */
    .ck-config-panel {
        position: fixed;
        top: 70px;
        left: 16px;
        width: 300px;
        background: var(--SmartThemeBlurTintColor);
        border: 1px solid var(--SmartThemeBorderColor);
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        display: none;
        opacity: 0;
        transform: translateY(-8px) scale(0.95);
        transition: all 0.2s ease;
    }

    .ck-config-panel--active {
        display: block;
        opacity: 1;
        transform: translateY(0) scale(1);
    }

    .ck-config-row {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-md);
        padding: var(--ck-spacing-lg);
        margin-bottom: var(--ck-spacing-md);
        background: var(--ck-glass-light);
        border: 1px solid var(--ck-glass-medium);
        border-radius: var(--ck-radius-md);
        cursor: pointer;
        transition: var(--ck-transition-smooth);
        backdrop-filter: var(--ck-blur-light);
        border-left: 4px solid transparent;
    }

    .ck-config-row:hover {
        background: var(--ck-glass-medium);
        border-left-color: var(--ck-primary);
        transform: translateX(4px);
        box-shadow: var(--ck-shadow-sm);
    }

    .ck-config-row input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--ck-primary);
        cursor: pointer;
    }

    .ck-config-row label {
        font-size: var(--ck-text-md);
        font-weight: 600;
        color: var(--SmartThemeBodyColor);
        cursor: pointer;
        flex: 1;
    }

    /* 🎪 Animation Classes */
    .ck-badge--bounce { animation: ck-bounce-scale 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
    .ck-badge--in { animation: ck-badge-appear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .ck-badge--out { animation: ck-badge-disappear 0.4s cubic-bezier(0.55, 0.055, 0.675, 0.19); }

    /* 📱 Responsive Mobile Optimizations */
    @media (max-width: 768px) {
        .ck-panel {
            max-width: calc(100vw - 2em);
            right: 1em;
            left: unset;
            top: 1em;
        }

        .ck-trigger {
            font-size: 1.8em;
        }
    }

    /* 🎨 High-contrast mode support */
    @media (prefers-contrast: high) {
        .ck-panel, .ck-entry, .ck-config-panel {
            border-width: 2px;
        }

        .ck-glass-light { --ck-glass-light: rgba(255, 255, 255, 0.2); }
        .ck-glass-medium { --ck-glass-medium: rgba(255, 255, 255, 0.3); }
        .ck-glass-heavy { --ck-glass-heavy: rgba(255, 255, 255, 0.4); }
    }

    /* ⚡ Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
        .ck-trigger, .ck-panel, .ck-entry, .ck-debug {
            transition: none !important;
            animation: none !important;
        }
    }

    /* 🎯 HOLISTIC REDESIGN - Clean Header & Content Components */

    .ck-header {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-md);
        padding: var(--ck-spacing-md) var(--ck-spacing-lg);
        background: linear-gradient(135deg,
            color-mix(in srgb, var(--SmartThemeBlurTintColor) 90%, var(--SmartThemeQuoteColor)) 0%,
            color-mix(in srgb, var(--SmartThemeBlurTintColor) 95%, transparent) 100%);
        border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 60%, var(--SmartThemeQuoteColor));
        border-radius: var(--ck-radius-sm) var(--ck-radius-sm) 0 0;
        backdrop-filter: blur(calc(var(--SmartThemeBlurStrength) * 0.5));
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .ck-header__icon {
        font-size: 16px;
        color: var(--SmartThemeQuoteColor);
        flex-shrink: 0;
    }

    .ck-header__title {
        font-weight: 600;
        font-size: var(--ck-text-md);
        color: var(--SmartThemeBodyColor);
        flex: 1;
    }

    .ck-header__badge {
        background: linear-gradient(135deg, var(--SmartThemeQuoteColor) 0%, color-mix(in srgb, var(--SmartThemeQuoteColor) 80%, var(--SmartThemeBlurTintColor)) 100%);
        color: var(--SmartThemeBlurTintColor);
        padding: 3px 8px;
        border-radius: 12px;
        font-size: var(--ck-text-xs);
        font-weight: 600;
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 60%, transparent);
        box-shadow: 0 2px 4px color-mix(in srgb, var(--SmartThemeShadowColor) 60%, var(--SmartThemeQuoteColor));
        flex-shrink: 0;
    }

    .ck-size-controls {
        display: flex;
        gap: var(--ck-spacing-xs);
        margin-right: var(--ck-spacing-sm);
    }

    .ck-size-toggle {
        background: color-mix(in srgb, var(--SmartThemeChatTintColor) 80%, transparent);
        border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 40%, transparent);
        color: var(--SmartThemeBodyColor);
        padding: 4px 8px;
        border-radius: var(--ck-radius-xs);
        font-size: var(--ck-text-xs);
        font-weight: 500;
        cursor: pointer;
        transition: var(--ck-transition-fast);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .ck-size-toggle:hover {
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 20%, var(--SmartThemeChatTintColor));
        border-color: var(--SmartThemeQuoteColor);
        transform: translateY(-1px);
    }

    .ck-size-toggle--active {
        background: var(--SmartThemeQuoteColor);
        color: var(--SmartThemeBlurTintColor);
        border-color: var(--SmartThemeQuoteColor);
        font-weight: 600;
        box-shadow: 0 2px 6px color-mix(in srgb, var(--SmartThemeQuoteColor) 40%, transparent);
    }

    .ck-content {
        background: linear-gradient(145deg,
            color-mix(in srgb, var(--SmartThemeChatTintColor) 90%, transparent) 0%,
            color-mix(in srgb, var(--SmartThemeChatTintColor) 95%, var(--SmartThemeQuoteColor)) 100%);
        padding: var(--ck-spacing-lg);
        border-radius: 0 0 var(--ck-radius-sm) var(--ck-radius-sm);
        max-height: 600px;
        overflow-y: auto;
        backdrop-filter: blur(var(--SmartThemeBlurStrength));
    }

    /* 📋 Clean Entries Container */
    .ck-entries-list {
        padding: var(--ck-spacing-md);
        display: flex;
        flex-direction: column;
        gap: var(--ck-spacing-sm);
    }

    .ck-world-header {
        display: flex;
        align-items: center;
        gap: var(--ck-spacing-sm);
        padding: 10px var(--ck-spacing-lg);
        margin: 0;
        background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 95%, var(--SmartThemeQuoteColor));
        border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 70%, var(--SmartThemeQuoteColor));
        border-left: 3px solid var(--SmartThemeQuoteColor);
        font-weight: 600;
        font-size: var(--ck-text-base);
        color: var(--SmartThemeBodyColor);
        backdrop-filter: blur(calc(var(--SmartThemeBlurStrength) * 0.3));
    }


    /* ✨ Clean Summary with Emojis Preserved */
    .ck-summary {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ck-spacing-xs);
        margin-top: var(--ck-spacing-xs);
    }

    .ck-summary__tag {
        background: color-mix(in srgb, var(--SmartThemeQuoteColor) 15%, var(--SmartThemeChatTintColor));
        color: var(--SmartThemeBodyColor);
        padding: 2px 6px;
        border-radius: var(--ck-radius-xs);
        font-size: var(--ck-text-xs);
        font-weight: 500;
        border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 30%, transparent);
    }

    /* 🔍 Clean Debug Container with Emojis */
    .ck-debug {
        margin-top: var(--ck-spacing-sm);
        padding: var(--ck-spacing-sm);
        background: color-mix(in srgb, var(--SmartThemeChatTintColor) 95%, var(--SmartThemeQuoteColor));
        border-radius: var(--ck-radius-xs);
        border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 30%, transparent);
        font-size: var(--ck-text-sm);
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: var(--ck-transition-smooth);
    }

    .ck-debug--expanded {
        max-height: 600px;
        opacity: 1;
        animation: ck-debug-expand 0.3s ease-out;
    }

    .ck-debug__section {
        margin-bottom: var(--ck-spacing-sm);
    }

    .ck-debug__heading {
        font-weight: 600;
        color: var(--SmartThemeQuoteColor);
        margin-bottom: var(--ck-spacing-xs);
        font-size: var(--ck-text-xs);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .ck-debug__field {
        color: var(--SmartThemeBodyColor);
        line-height: 1.4;
        font-size: var(--ck-text-sm);
    }


    /* 📭 Empty State Styling */
    .ck-empty-state {
        padding: 48px 24px;
        text-align: center;
        background: linear-gradient(145deg,
            color-mix(in srgb, var(--SmartThemeChatTintColor) 90%, transparent) 0%,
            color-mix(in srgb, var(--SmartThemeChatTintColor) 95%, var(--SmartThemeQuoteColor)) 100%);
        border: none;
        border-radius: 0 0 var(--ck-radius-sm) var(--ck-radius-sm);
        color: var(--SmartThemeEmColor);
        min-height: 300px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        backdrop-filter: blur(var(--SmartThemeBlurStrength));
    }

    .ck-empty-state__icon {
        margin-bottom: 20px;
        color: color-mix(in srgb, var(--SmartThemeQuoteColor) 70%, var(--SmartThemeEmColor));
        display: flex;
        justify-content: center;
        opacity: 0.6;
    }

    .ck-empty-state__title {
        font-size: 18px;
        font-weight: 600;
        color: var(--SmartThemeBodyColor);
        margin-bottom: 12px;
        opacity: 0.9;
    }

    .ck-empty-state__desc {
        font-size: 14px;
        color: var(--SmartThemeEmColor);
        opacity: 0.8;
        line-height: 1.6;
        max-width: 300px;
        margin: 0 auto;
    }
`;

if (!document.head.querySelector('style[data-carrot-kernel]')) {
    carrotStyleSheet.setAttribute('data-carrot-kernel', 'true');
    document.head.appendChild(carrotStyleSheet);
}

import { chat, chat_metadata, event_types, eventSource, main_api, saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import { metadata_keys } from '../../../authors-note.js';
import { extension_settings } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay } from '../../../utils.js';
import { world_info_position } from '../../../world-info.js';

const strategy = {
    constant: '🔵',
    normal: '🟢',
    vectorized: '🔗',
    rag: '🧠',
    decorator_activate: '⚡',
    decorator_suppress: '🚫',
    persona_trigger: '👁️',
    character_trigger: '🎭',
    scenario_trigger: '🎬',
    sticky_active: '📌',
    // recursion_triggered removed
    unknown: '❓'
};

const getStrategy = (entry)=>{
    // Check for enhanced trigger analysis first
    if (entry.triggerAnalysis?.triggerReason) {
        return entry.triggerAnalysis.triggerReason;
    }

    // Recursion detection removed

    // Fallback to basic detection
    if (entry.constant === true) {
        return 'constant';
    } else if (entry.vectorized === true) {
        return 'vectorized';
    } else {
        return 'normal';
    }
};

let generationType;
eventSource.on(event_types.GENERATION_STARTED, (genType)=>generationType = genType);

// Worldbook trigger classification system - focusing on reliable detections

// Helper function to translate position numbers to names (based on research)
const getPositionName = (position) => {
    const positions = {
        0: 'Before Character',
        1: 'After Character',
        2: 'Author\'s Note Top',
        3: 'Author\'s Note Bottom',
        4: 'At Depth',
        5: 'Extension Module Top',
        6: 'Extension Module Bottom'
    };
    return positions[position] || `Unknown (${position})`;
};

// 🛡️ SAFER ST WORLDBOOK INTEGRATION - NO GLOBAL PROTOTYPE PATCHING
const entrySourceTracker = new Map(); // uid -> source info
const nativeTriggerReasons = new Map(); // uid -> native ST trigger reason

// 🎯 PRECISE ST NATIVE LOG INTERCEPTION - CAPTURE EXACT TRIGGER REASONS
const nativeSTTriggerReasons = new Map(); // uid -> {reason, timestamp}
// Recursion detection system removed




// Get the native ST trigger reason for an entry
function getNativeSTTriggerReason(entry) {
    const nativeReason = nativeSTTriggerReasons.get(entry.uid);
    if (!nativeReason) {
        return null;
    }

    // Check if the reason is recent (within 10 seconds - increased from 5)
    const isRecent = (Date.now() - nativeReason.timestamp) < 10000;
    if (!isRecent) {
        nativeSTTriggerReasons.delete(entry.uid);
        return null;
    }

    // Map ST's native reasons to our trigger types
    const reason = nativeReason.reason.toLowerCase();

    if (reason.includes('externally activated')) {
        return 'vector';
    } else if (reason.includes('activated by @@activate decorator')) {
        return 'system';
    } else if (reason.includes('activated because of constant')) {
        return 'constant';
    } else if (reason.includes('activated because active sticky')) {
        return 'sticky';
    } else if (reason.includes('activated by primary key match')) {
        return 'normal_key_match';
    } else if (reason.includes('activated. (and any)') ||
               reason.includes('activated. (not all)') ||
               reason.includes('activated. (not any)') ||
               reason.includes('activated. (and all)')) {
        return 'secondary_key_match';
    }

    return null;
}

// 🎯 TRIGGER CLASSIFICATION
function getProperTriggerReason(entry) {
    // Get native ST trigger reason first
    const nativeReason = getNativeSTTriggerReason(entry);
    if (nativeReason) {
        return nativeReason;
    }

    // Fallback to entry analysis
    if (entry.constant === true) return 'constant';
    if (entry.decorators && entry.decorators.includes('@@activate')) return 'system';
    if (entry.sticky && entry.sticky !== 0) return 'sticky';

    return 'normal_key_match';
}

// SOURCE-BASED TRIGGER TRACKING - Track entries by which event activated them
const classifyTriggerReasonFromEntry = (entry, contextData = {}) => {
    // Use proper trigger reason classification
    const properTriggerReason = getProperTriggerReason(entry);
    if (properTriggerReason !== 'normal_key_match') {
        return properTriggerReason;
    }

    // Check source tracker for vector entries
    const sourceInfo = entrySourceTracker.get(entry.uid);
    if (sourceInfo && sourceInfo.source === 'WORLDINFO_FORCE_ACTIVATE') {
        return 'vector';
    }

    // Use ST's native match flags
    if (entry.matchPersonaDescription === true) return 'persona';
    if (entry.matchCharacterDescription === true) return 'character';
    if (entry.matchCharacterPersonality === true) return 'character';
    if (entry.matchCharacterDepthPrompt === true) return 'character';
    if (entry.matchScenario === true) return 'scenario';
    if (entry.matchCreatorNotes === true) return 'character';
    if (entry.constant === true) return 'constant';
    if (entry.decorators && entry.decorators.includes('@@activate')) return 'system';
    if (entry.sticky && entry.sticky !== 0) return 'sticky';

    return 'normal_key_match';
};

// Analyze entry settings/properties (separate from trigger reason)
const analyzeEntrySettings = (entry) => {
    const settings = {
        recursion: {
            delayUntilRecursion: entry.delayUntilRecursion,
            excludeRecursion: entry.excludeRecursion,
            preventRecursion: entry.preventRecursion
        },
        scanning: {
            scanPersona: entry.scanPersona,
            scanCharacter: entry.scanCharacter,
            scanStory: entry.scanStory,
            scanAuthorNote: entry.scanAuthorNote || entry.scanAN, // Check both possible property names
            scanDepth: entry.scanDepth
        },
        activation: {
            probability: entry.probability,
            group: entry.group,
            caseSensitive: entry.caseSensitive,
            selectiveLogic: entry.selectiveLogic
        },
        positioning: {
            position: entry.position,
            depth: entry.depth,
            order: entry.order
        }
    };

    return settings;
};

// OLD function - keeping for reference but using new one above
const classifyTriggerType = (entry, triggerAnalysis) => {
    // Check for recursive triggers (entry triggered by another entry's content)
    if (triggerAnalysis.triggeringMessages?.some(msg =>
        msg.messageSource === 'worldbook_content' ||
        msg.preview?.includes('[Lorebook]') ||
        msg.preview?.includes('Lorebook:')
    )) {
        return 'recursive';
    }

    // Check for forced activation
    if (triggerAnalysis.triggerReason === 'decorator_activate') {
        return 'forced';
    }

    // Check for suppressed
    if (triggerAnalysis.triggerReason === 'decorator_suppress') {
        return 'suppressed';
    }

    // Check for constant
    if (triggerAnalysis.triggerReason === 'constant') {
        return 'constant';
    }

    // Check for RAG/Vector
    if (triggerAnalysis.triggerReason === 'rag') {
        return 'vector';
    }

    // Check for sticky
    if (triggerAnalysis.triggerReason === 'sticky_active') {
        return 'sticky';
    }

    // Check for persona/character specific
    if (triggerAnalysis.triggerReason === 'persona_trigger') {
        return 'persona';
    }
    if (triggerAnalysis.triggerReason === 'character_trigger') {
        return 'character';
    }
    if (triggerAnalysis.triggerReason === 'scenario_trigger') {
        return 'scenario';
    }

    // Check message source patterns
    if (triggerAnalysis.triggeringMessages?.length > 0) {
        const lastMsg = triggerAnalysis.lastMessage;
        if (lastMsg?.messageSource === 'system_injection') return 'system';
        if (lastMsg?.messageSource === 'authors_note') return 'authors_note';
        if (lastMsg?.messageSource === 'user_message') return 'user';
        if (lastMsg?.messageSource === 'character_message') return 'character';
    }

    return 'normal';
};

// Enhanced comprehensive trigger analysis for all possible activation sources
const analyzeTriggerSource = (entry, recentMessages) => {
    const analysis = {
        matchedKeys: [],
        triggeringMessages: [],
        lastMessage: null,
        allMatches: [],
        triggerReason: 'normal',
        triggerSource: 'unknown',
        triggerDetails: {}
    };

    // 1. Check for decorator-based activation
    if (entry.decorators && Array.isArray(entry.decorators)) {
        if (entry.decorators.includes('@@activate')) {
            analysis.triggerReason = 'decorator_activate';
            analysis.triggerSource = 'decorator';
            analysis.triggerDetails = {
                decorator: '@@activate',
                note: 'Force activated by @@activate decorator'
            };
            return analysis;
        }
        if (entry.decorators.includes('@@dont_activate')) {
            analysis.triggerReason = 'decorator_suppress';
            analysis.triggerSource = 'decorator';
            analysis.triggerDetails = {
                decorator: '@@dont_activate',
                note: 'Suppressed by @@dont_activate decorator'
            };
            return analysis;
        }
    }

    // 2. Check for constant activation
    if (entry.constant === true) {
        analysis.triggerReason = 'constant';
        analysis.triggerSource = 'constant';
        analysis.triggerDetails = {
            note: 'Always active constant entry'
        };
        return analysis;
    }

    // 3. Check for vectorized/RAG activation
    if (entry.vectorized === true) {
        analysis.triggerReason = 'rag';
        analysis.triggerSource = 'vectorized';
        analysis.triggerDetails = {
            note: 'Activated by RAG/Vector extension using embeddings similarity'
        };
        return analysis;
    }

    // 4. Check for sticky effects
    if (entry.sticky && entry.sticky > 0) {
        analysis.triggerReason = 'sticky_active';
        analysis.triggerSource = 'sticky';
        analysis.triggerDetails = {
            stickyTurns: entry.sticky,
            note: `Active due to sticky effect (${entry.sticky} turns remaining)`
        };
        return analysis;
    }

    // 5. Check for specific scanning contexts
    if (entry.matchPersonaDescription) {
        analysis.triggerReason = 'persona_trigger';
        analysis.triggerSource = 'persona';
        analysis.triggerDetails = {
            note: 'Triggered by content in user persona description'
        };
    }

    if (entry.matchCharacterDescription) {
        analysis.triggerReason = 'character_trigger';
        analysis.triggerSource = 'character_card';
        analysis.triggerDetails = {
            note: 'Triggered by content in character card description'
        };
    }

    if (entry.matchScenario) {
        analysis.triggerReason = 'scenario_trigger';
        analysis.triggerSource = 'scenario';
        analysis.triggerDetails = {
            note: 'Triggered by content in chat scenario text'
        };
    }

    if (!entry.key || !Array.isArray(entry.key) || entry.key.length === 0) {
        return { ...analysis, error: 'Entry has no keys defined' };
    }

    // Check each recent message for matches
    recentMessages.forEach((msg, index) => {
        if (!msg.mes) return;

        const messageContent = msg.mes.toLowerCase();
        const matchedKeysInMsg = [];

        // Check each key in the entry
        entry.key.forEach(key => {
            // Handle regex keys
            if (key.startsWith('/') && key.endsWith('/')) {
                try {
                    const regexPattern = key.slice(1, -1);
                    const regex = new RegExp(regexPattern, 'gi');
                    const matches = [...messageContent.matchAll(regex)];
                    if (matches.length > 0) {
                        matchedKeysInMsg.push({
                            key: key,
                            type: 'regex',
                            matches: matches.map(m => m[0])
                        });
                    }
                } catch (e) {
                    // Invalid regex, treat as literal
                    if (messageContent.includes(key.toLowerCase())) {
                        matchedKeysInMsg.push({
                            key: key,
                            type: 'literal_fallback',
                            matches: [key]
                        });
                    }
                }
            }
            // Handle regex keys with flags
            else if (key.startsWith('/') && key.includes('/')) {
                try {
                    const lastSlash = key.lastIndexOf('/');
                    const regexPattern = key.slice(1, lastSlash);
                    const flags = key.slice(lastSlash + 1);
                    const regex = new RegExp(regexPattern, flags);
                    const matches = [...messageContent.matchAll(regex)];
                    if (matches.length > 0) {
                        matchedKeysInMsg.push({
                            key: key,
                            type: 'regex_with_flags',
                            matches: matches.map(m => m[0])
                        });
                    }
                } catch (e) {
                    // Invalid regex, treat as literal
                    if (messageContent.includes(key.toLowerCase())) {
                        matchedKeysInMsg.push({
                            key: key,
                            type: 'literal_fallback',
                            matches: [key]
                        });
                    }
                }
            }
            // Handle literal string keys
            else {
                if (messageContent.includes(key.toLowerCase())) {
                    matchedKeysInMsg.push({
                        key: key,
                        type: 'literal',
                        matches: [key]
                    });
                }
            }
        });

        if (matchedKeysInMsg.length > 0) {
            // Determine message source type for enhanced analysis
            let messageSource = 'chat_message';
            let sourceDetails = {};

            if (msg.is_system) {
                messageSource = 'system_message';
                sourceDetails = { type: 'system', description: 'System-generated message' };
            } else if (msg.is_user) {
                messageSource = 'user_message';
                sourceDetails = { type: 'user', description: 'User input message', sender: msg.name };
            } else if (msg.name) {
                messageSource = 'character_message';
                sourceDetails = { type: 'character', description: 'Character response', character: msg.name };
            }

            // Check for injection patterns
            if (msg.mes.includes('System:') || msg.mes.includes('[System]')) {
                messageSource = 'system_injection';
                sourceDetails = { type: 'injection', description: 'System prompt injection' };
            } else if (msg.mes.includes('Author\'s Note:') || msg.mes.includes('[Author\'s Note]')) {
                messageSource = 'authors_note';
                sourceDetails = { type: 'injection', description: 'Author\'s Note injection' };
            } else if (msg.mes.includes('Lorebook:') || msg.mes.includes('[Lorebook]')) {
                messageSource = 'worldbook_content';
                sourceDetails = { type: 'worldbook', description: 'Another worldbook entry content' };
            }

            analysis.triggeringMessages.push({
                index: recentMessages.length - 1 - index, // Reverse index (0 = most recent)
                sender: msg.name,
                isSystem: msg.is_system,
                preview: msg.mes.substring(0, 100) + (msg.mes.length > 100 ? '...' : ''),
                matchedKeys: matchedKeysInMsg,
                messageSource: messageSource,
                sourceDetails: sourceDetails
            });

            analysis.allMatches.push(...matchedKeysInMsg);

            // Track if this was the very last message (scan depth 1 scenario)
            if (index === recentMessages.length - 1) {
                analysis.lastMessage = {
                    sender: msg.name,
                    isSystem: msg.is_system,
                    matchedKeys: matchedKeysInMsg,
                    messageSource: messageSource,
                    sourceDetails: sourceDetails
                };
            }

            // Update trigger source based on message analysis
            if (!analysis.triggerSource || analysis.triggerSource === 'unknown') {
                analysis.triggerSource = messageSource;
                analysis.triggerDetails = { ...analysis.triggerDetails, ...sourceDetails };
            }
        }
    });

    // Extract unique matched keys
    analysis.matchedKeys = [...new Set(analysis.allMatches.map(m => m.key))];

    return analysis;
};

// Helper function to get icons for message sources
const getMessageSourceIcon = (messageSource) => {
    const icons = {
        'user_message': '👤',
        'character_message': '🎭',
        'system_message': '⚙️',
        'system_injection': '💉',
        'authors_note': '📝',
        'worldbook_content': '📚',
        'chat_message': '💬'
    };
    return icons[messageSource] || '❓';
};

const init = ()=>{
    const trigger = document.createElement('div'); {
        trigger.classList.add('ck-trigger');
        trigger.textContent = '🥕';
        trigger.title = '🥕 CarrotKernel WorldBook Tracker\n---\nright click for options';
        trigger.addEventListener('click', ()=>{
            panel.classList.toggle('ck-panel--active');
        });
        trigger.addEventListener('contextmenu', (evt)=>{
            evt.preventDefault();
            configPanel.classList.toggle('ck-config-panel--active');
        });
        document.body.append(trigger);
    }

    // Create visual connection line
    const connectionLine = document.createElement('div');
    connectionLine.classList.add('ck-connection');
    document.body.append(connectionLine);

    const panel = document.createElement('div'); {
        panel.classList.add('ck-panel');

        // Will be initialized after updatePanel function is defined

        // No longer needed - modal has its own click handling

        // Dynamic positioning is now handled by the external positionPanel function
        // (duplicate function disabled)
        /*
            const triggerRect = trigger.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Get current panel width or use default
            const currentWidth = panel.offsetWidth || 400;
            const maxWidth = Math.min(currentWidth, viewportWidth - 32);

            // Don't override width if user is resizing
            if (!panel.style.width || panel.style.width === 'auto') {
                panel.style.width = `${maxWidth}px`;
            }

            // Always align panel with trigger button (left edge aligned)
            const leftPosition = Math.max(16, triggerRect.left);
            panel.style.left = `${leftPosition}px`;
            panel.style.right = 'auto';

            // Vertical positioning - position below trigger with gap
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;
            const minPanelHeight = 300;
            const maxPanelHeight = Math.min(600, viewportHeight * 0.8);

            let panelTop;
            if (spaceBelow >= minPanelHeight + 20) {
                // Position below trigger
                panelTop = triggerRect.bottom + 10;
                panel.style.top = `${panelTop}px`;
                panel.style.bottom = 'auto';
                panel.style.maxHeight = `${Math.min(maxPanelHeight, spaceBelow - 20)}px`;
            } else if (spaceAbove >= minPanelHeight + 20) {
                // Position above trigger
                panel.style.bottom = `${viewportHeight - triggerRect.top + 10}px`;
                panel.style.top = 'auto';
                panel.style.maxHeight = `${Math.min(maxPanelHeight, spaceAbove - 20)}px`;
                panelTop = triggerRect.top - 10 - Math.min(maxPanelHeight, spaceAbove - 20);
            } else {
                // Position to the right of trigger if no vertical space
                panel.style.left = `${triggerRect.right + 15}px`;
                panelTop = Math.max(20, triggerRect.top - 50);
                panel.style.top = `${panelTop}px`;
                panel.style.bottom = 'auto';
                panel.style.maxHeight = `${viewportHeight - 40}px`;
            }

            // Position connection line between trigger and panel
            if (panel.classList.contains('ck-panel--active')) {
                const triggerCenterX = triggerRect.left + triggerRect.width / 2;
                const triggerCenterY = triggerRect.top + triggerRect.height / 2;

                connectionLine.style.left = `${triggerCenterX - 1}px`;
                connectionLine.style.top = `${triggerRect.bottom - 2}px`;
                connectionLine.style.height = `${Math.abs(panelTop - triggerRect.bottom) + 4}px`;
            }
        };
        */

        // Position on first show and on window resize
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (panel.classList.contains('ck-panel--active')) {
                        setTimeout(positionPanel, 0); // Allow DOM to update first
                    }
                }
            });
        });
        observer.observe(panel, { attributes: true });

        window.addEventListener('resize', () => {
            if (panel.classList.contains('ck-panel--active')) {
                positionPanel();
            }
        });

        // Add debug toggle button at the top of the panel
        const debugToggle = document.createElement('div'); {
            debugToggle.classList.add('ck-debug-toggle');
            debugToggle.textContent = '🔍';
            debugToggle.title = 'Click to toggle debug mode - shows what triggered each entry';
            debugToggle.addEventListener('click', (evt)=>{
                evt.stopPropagation();
                if (!extension_settings.CarrotKernel) {
                    extension_settings.CarrotKernel = {};
                }
                extension_settings.CarrotKernel.worldBookDebug = !extension_settings.CarrotKernel.worldBookDebug;

                // Update toggle appearance
                if (extension_settings.CarrotKernel.worldBookDebug) {
                    debugToggle.style.background = '#4ecdc4';
                    debugToggle.style.borderColor = 'rgba(255,255,255,0.5)';
                    debugToggle.textContent = '🔍ON';
                    debugToggle.title = 'Debug mode ON - click to disable';
                } else {
                    debugToggle.style.background = '#ff6b6b';
                    debugToggle.style.borderColor = 'rgba(255,255,255,0.3)';
                    debugToggle.textContent = '🔍';
                    debugToggle.title = 'Click to toggle debug mode - shows what triggered each entry';
                }

                updatePanel(currentEntryList);
                saveSettingsDebounced();
            });

            // Set initial state
            if (extension_settings.CarrotKernel?.worldBookDebug) {
                debugToggle.style.background = '#4ecdc4';
                debugToggle.style.borderColor = 'rgba(255,255,255,0.5)';
                debugToggle.textContent = '🔍ON';
                debugToggle.title = 'Debug mode ON - click to disable';
            }

            // Add clear highlights button
            const clearHighlightsButton = document.createElement('button');
            clearHighlightsButton.classList.add('ck-clear-highlights');
            clearHighlightsButton.style.cssText = `
                position: absolute;
                top: 8px;
                right: 40px;
                background: rgba(231, 76, 60, 0.1);
                border: 1px solid rgba(231, 76, 60, 0.3);
                color: #ef4444;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10;
                transition: all 0.2s ease;
                font-size: 14px;
            `;
            clearHighlightsButton.textContent = '✖';
            clearHighlightsButton.title = 'Clear all trigger word highlights in chat';
            clearHighlightsButton.addEventListener('click', (e) => {
                e.stopPropagation();
                clearTriggerHighlights();
                toastr.info('Trigger highlights cleared', 'CarrotKernel', { timeOut: 2000 });
            });

            // Hover effects
            clearHighlightsButton.addEventListener('mouseenter', () => {
                clearHighlightsButton.style.background = 'rgba(231, 76, 60, 0.2)';
                clearHighlightsButton.style.borderColor = 'rgba(231, 76, 60, 0.5)';
            });
            clearHighlightsButton.addEventListener('mouseleave', () => {
                clearHighlightsButton.style.background = 'rgba(231, 76, 60, 0.1)';
                clearHighlightsButton.style.borderColor = 'rgba(231, 76, 60, 0.3)';
            });

            panel.style.position = 'relative'; // Ensure panel can contain the absolute positioned elements
        }

        document.body.append(panel);
    }

    // Dynamic positioning function - moved outside panel block for accessibility
    const positionPanel = () => {
        const triggerRect = trigger.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Get current panel width or use default
        const currentWidth = panel.offsetWidth || 400;
        const maxWidth = Math.min(currentWidth, viewportWidth - 32);

        // Don't override width if user is resizing
        if (!panel.style.width || panel.style.width === 'auto') {
            panel.style.width = `${maxWidth}px`;
        }

        // Always align panel with trigger button (left edge aligned)
        const leftPosition = Math.max(16, triggerRect.left);
        panel.style.left = `${leftPosition}px`;
        panel.style.right = 'auto';

        // Vertical positioning - position below trigger with gap
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        const minPanelHeight = 300;
        const maxPanelHeight = Math.min(600, viewportHeight * 0.8);

        let panelTop;
        if (spaceBelow >= minPanelHeight + 20) {
            // Position below trigger
            panelTop = triggerRect.bottom - 30;
            panel.style.setProperty('top', `${panelTop}px`, 'important');
            panel.style.setProperty('transform', 'translateY(0) scale(1)', 'important');
            panel.style.setProperty('margin-top', '0px', 'important');
            panel.style.bottom = 'auto';
            panel.style.maxHeight = `${Math.min(maxPanelHeight, spaceBelow - 20)}px`;
        } else if (spaceAbove >= minPanelHeight + 20) {
            // Position above trigger
            panel.style.bottom = `${viewportHeight - triggerRect.top + 10}px`;
            panel.style.top = 'auto';
            panel.style.maxHeight = `${Math.min(maxPanelHeight, spaceAbove - 20)}px`;
            panelTop = triggerRect.top - 10; // Approximate for connection line
        } else {
            // Position to the right of trigger if no vertical space
            panel.style.left = `${triggerRect.right + 15}px`;
            panelTop = Math.max(20, triggerRect.top - 50);
            panel.style.top = `${panelTop}px`;
            panel.style.bottom = 'auto';
            panel.style.maxHeight = `${viewportHeight - 40}px`;
        }

        // Position connection line between trigger and panel
        if (panel.classList.contains('ck-panel--active')) {
            const triggerCenterX = triggerRect.left + triggerRect.width / 2;
            const triggerCenterY = triggerRect.top + triggerRect.height / 2;

            connectionLine.style.left = `${triggerCenterX - 1}px`;
            connectionLine.style.top = `${triggerRect.bottom - 2}px`;
            connectionLine.style.height = `${Math.abs(panelTop - triggerRect.bottom) + 4}px`;
        }
    };


    const configPanel = document.createElement('div'); {
        configPanel.classList.add('ck-config-panel');
        const rowGroup = document.createElement('label'); {
            rowGroup.classList.add('ck-config-row');
            rowGroup.title = 'Group entries by World Info book';
            const cb = document.createElement('input'); {
                cb.type = 'checkbox';
                cb.checked = extension_settings.CarrotKernel?.worldBookGroup ?? true;
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.CarrotKernel) {
                        extension_settings.CarrotKernel = {};
                    }
                    extension_settings.CarrotKernel.worldBookGroup = cb.checked;
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                rowGroup.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Group by book';
                rowGroup.append(lbl);
            }
            configPanel.append(rowGroup);
        }
        const orderRow = document.createElement('label'); {
            orderRow.classList.add('ck-config-row');
            orderRow.title = 'Show in insertion depth / order instead of alphabetically';
            const cb = document.createElement('input'); {
                cb.type = 'radio';
                cb.name = 'ck-sort-method';
                cb.value = 'order';
                cb.checked = extension_settings.CarrotKernel?.sortMethod === 'order';
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.CarrotKernel) {
                        extension_settings.CarrotKernel = {};
                    }
                    extension_settings.CarrotKernel.sortMethod = 'order';
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                orderRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Insertion order';
                orderRow.append(lbl);
            }
            configPanel.append(orderRow);
        }
        const tokenRow = document.createElement('label'); {
            tokenRow.classList.add('ck-config-row');
            tokenRow.title = 'Sort by character count - shortest entries first';
            const cb = document.createElement('input'); {
                cb.type = 'radio';
                cb.name = 'ck-sort-method';
                cb.value = 'chars';
                cb.checked = extension_settings.CarrotKernel?.sortMethod === 'chars';
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.CarrotKernel) {
                        extension_settings.CarrotKernel = {};
                    }
                    extension_settings.CarrotKernel.sortMethod = 'chars';
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                tokenRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Sort by character count';
                tokenRow.append(lbl);
            }
            configPanel.append(tokenRow);
        }
        const alphabetRow = document.createElement('label'); {
            alphabetRow.classList.add('ck-config-row');
            alphabetRow.title = 'Sort alphabetically by entry name';
            const cb = document.createElement('input'); {
                cb.type = 'radio';
                cb.name = 'ck-sort-method';
                cb.value = 'alpha';
                cb.checked = !extension_settings.CarrotKernel?.sortMethod || extension_settings.CarrotKernel?.sortMethod === 'alpha';
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.CarrotKernel) {
                        extension_settings.CarrotKernel = {};
                    }
                    extension_settings.CarrotKernel.sortMethod = 'alpha';
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                alphabetRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Alphabetical';
                alphabetRow.append(lbl);
            }
            configPanel.append(alphabetRow);
        }
        document.body.append(configPanel);
    }

    let entries = [];

    let count = -1;
    const updateBadge = async(newEntries)=>{
        if (count != newEntries.length) {
            if (newEntries.length == 0) {
                trigger.classList.add('ck-badge--out');
                await delay(510);
                trigger.setAttribute('data-ck-badge-count', newEntries.length.toString());
                trigger.classList.remove('ck-badge--out');
            } else if (count == 0) {
                trigger.classList.add('ck-badge--in');
                trigger.setAttribute('data-ck-badge-count', newEntries.length.toString());
                await delay(510);
                trigger.classList.remove('ck-badge--in');
            } else {
                trigger.setAttribute('data-ck-badge-count', newEntries.length.toString());
                trigger.classList.add('ck-badge--bounce');
                await delay(1010);
                trigger.classList.remove('ck-badge--bounce');
            }
            count = newEntries.length;
        } else if (new Set(newEntries).difference(new Set(entries)).size > 0) {
            trigger.classList.add('ck-badge--bounce');
            await delay(1010);
            trigger.classList.remove('ck-badge--bounce');
        }
        entries = newEntries;
    };
    let currentEntryList = [];
    let currentChat = [];

    eventSource.on(event_types.WORLD_INFO_ACTIVATED, async(entryList)=>{

        // Track all entries from this event as standard activation
        entryList.forEach(entry => {
            entrySourceTracker.set(entry.uid, {
                source: 'WORLD_INFO_ACTIVATED',
                timestamp: Date.now(),
                triggerType: 'standard'
            });
        });

        panel.innerHTML = 'Updating...';
        updateBadge(entryList.map(it=>`${it.world}§§§${it.uid}`));

        // Process entries with source-based trigger classification and context analysis
        const context = getContext();

        // Check Author's Note scanning status (key for proper detection)
        const authorNotePrompt = context?.extensionPrompts?.['2_floating_prompt'];
        const isAuthorNoteScanEnabled = authorNotePrompt?.scan === true;
        const authorNoteContent = authorNotePrompt?.value || '';

        // Classify and analyze all entries
        for (const entry of entryList) {
            // DON'T overwrite vector entries that were already classified by WORLDINFO_FORCE_ACTIVATE
            if (entry.triggerReason === 'vector') {
            } else {
                entry.triggerReason = classifyTriggerReasonFromEntry(entry, {
                    isAuthorNoteScanEnabled,
                    authorNoteContent,
                    context,
                    chat: chat || []
                });
            }
            entry.entrySettings = analyzeEntrySettings(entry);
        }

        for (const entry of entryList) {
            entry.type = 'wi';
        }
        currentEntryList = [...entryList];
        updatePanel(entryList, true);
    });

    // Also listen for WORLDINFO_FORCE_ACTIVATE (vectors extension)
    eventSource.on(event_types.WORLDINFO_FORCE_ACTIVATE, async(entryList)=>{

        // Track all entries from this event as vector activation
        entryList.forEach(entry => {
            entrySourceTracker.set(entry.uid, {
                source: 'WORLDINFO_FORCE_ACTIVATE',
                timestamp: Date.now(),
                triggerType: 'vector'
            });
        });

        // Mark all force-activated entries as vector-triggered
        for (const entry of entryList) {
            entry.type = 'wi';
            entry.triggerReason = 'vector'; // Force vector classification
        }

        // Update panel with force-activated entries
        currentEntryList = [...entryList];
        updatePanel(entryList, true);
        updateBadge(entryList.map(it=>`${it.world}§§§${it.uid}`));
    });


    const updatePanel = (entryList, newChat = false) => {
        panel.innerHTML = '';

        // Always create the header structure
        // Clean CarrotKernel header with CSS classes
        const header = document.createElement('div');
        header.className = 'ck-header';

        // Clean CarrotKernel icon
        const icon = document.createElement('div');
        icon.className = 'ck-header__icon';
        icon.textContent = '🥕';

        const title = document.createElement('span');
        title.className = 'ck-header__title';
        title.textContent = 'CarrotKernel WorldBook Tracker';

        const badge = document.createElement('span');
        badge.className = 'ck-header__badge';
        badge.textContent = entryList.length.toString();

        // Clean size control buttons
        const sizeControls = document.createElement('div');
        sizeControls.className = 'ck-size-controls';

        // Simple 2-mode system: Compact (grid), Detailed (list)
        const buttons = [
            {
                mode: 'compact',
                icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>',
                title: 'Compact mode - Color indicators only',
                classes: ['ck-panel--compact']
            },
            {
                mode: 'detailed',
                icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
                title: 'Detailed mode - Full information display',
                classes: []
            }
        ];

        const sizeButtons = {};

        buttons.forEach(({ mode, icon, title, classes }) => {
            const btn = document.createElement('button');
            btn.classList.add('ck-size-toggle');
            btn.innerHTML = icon;
            btn.title = title;
            btn.dataset.mode = mode;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();

                // Remove all size classes
                panel.classList.remove('ck-panel--compact');
                Object.values(sizeButtons).forEach(b => b.classList.remove('ck-size-toggle--active'));

                // Add new classes and set active state
                classes.forEach(cls => panel.classList.add(cls));
                btn.classList.add('ck-size-toggle--active');

                setTimeout(() => positionPanel(), 100);
            });

            sizeButtons[mode] = btn;
            sizeControls.appendChild(btn);
        });

        // Set default active state (compact mode)
        sizeButtons.compact.classList.add('ck-size-toggle--active');
        panel.classList.add('ck-panel--compact');

        header.appendChild(icon);
        header.appendChild(title);
        header.appendChild(sizeControls);
        header.appendChild(badge);
        panel.appendChild(header);


        // Clean content container
        const content = document.createElement('div');
        content.className = 'ck-content';
        panel.appendChild(content);

        // Group entries by world (or not, based on setting)
        const shouldGroup = extension_settings.CarrotKernel?.worldBookGroup ?? true;
        const grouped = shouldGroup ?
            Object.groupBy(entryList, entry => entry.world || 'Unknown') :
            { 'All Entries': entryList };

        for (const [worldName, entries] of Object.entries(grouped)) {
            // Apply sorting based on user preferences
            const sortMethod = extension_settings.CarrotKernel?.sortMethod || 'alpha';
            switch (sortMethod) {
                case 'chars':
                    // Sort by content length (character count - shortest first)
                    entries.sort((a, b) => {
                        const aLength = (a.content || '').length;
                        const bLength = (b.content || '').length;
                        return aLength - bLength;
                    });
                    break;
                case 'order':
                    // Sort by insertion order (preserves original order)
                    entries.sort((a, b) => (a.order || 0) - (b.order || 0));
                    break;
                case 'alpha':
                default:
                    // Alphabetical sort
                    entries.sort((a, b) => (a.comment || a.content || '').localeCompare(b.comment || b.content || ''));
                    break;
            }
            // World header
            const worldHeader = document.createElement('div');
            worldHeader.className = 'ck-world-header';

            // Add repository icon SVG
            const repoIcon = document.createElement('div');
            repoIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="color: #ff6b35; opacity: 0.9;">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
            `;
            worldHeader.appendChild(repoIcon);

            // World name
            const worldTitle = document.createElement('span');
            worldTitle.textContent = worldName;
            worldHeader.appendChild(worldTitle);

            // Entry count badge
            const countBadge = document.createElement('span');
            countBadge.className = 'ck-header__badge';
            countBadge.textContent = entries.length.toString();
            countBadge.style.marginLeft = 'auto';
            worldHeader.appendChild(countBadge);

            // Close button is now handled in the createModal function

            content.appendChild(worldHeader);

            // Create entries container with CSS Grid
            const entriesContainer = document.createElement('div');
            entriesContainer.className = 'ck-entries-container';

            // Process each entry with original working structure
            for (const entry of entries) {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'ck-entry';

                // Add strategy data attribute for compact mode color coding
                const entryStrategy = getStrategy(entry);
                entryDiv.dataset.strategy = entryStrategy;

                // Top row: Strategy icon + Title + Sticky
                const topRow = document.createElement('div');
                topRow.className = 'ck-entry__top-row';

                // Strategy icon
                const strategyDiv = document.createElement('div');
                strategyDiv.className = 'ck-entry__icon';
                const triggerIcon = strategy[entryStrategy] || strategy.unknown;
                strategyDiv.textContent = triggerIcon;
                strategyDiv.title = 'Entry trigger strategy';


                topRow.appendChild(strategyDiv);

                // Title
                const titleDiv = document.createElement('div');
                titleDiv.className = 'ck-entry__title';
                titleDiv.textContent = entry.comment?.length ? entry.comment : entry.key?.join(', ') || 'Unnamed Entry';
                topRow.appendChild(titleDiv);

                // Compact indicators container
                const indicatorsDiv = document.createElement('div');
                indicatorsDiv.className = 'ck-entry__indicators';

                // Trigger indicator for compact mode
                const triggerIndicator = document.createElement('span');
                triggerIndicator.className = 'ck-entry__trigger-indicator';

                // Get trigger emoji based on entry type - enhanced detection
                let triggerEmoji = '🟢'; // Default to normal key match
                let triggerReason = 'key match';


                // Use the triggerReason that was set by classifyTriggerReasonFromEntry
                if (entry.triggerReason === 'constant') {
                    triggerEmoji = '🔵';
                    triggerReason = 'CONSTANT';
                } else if (entry.triggerReason === 'vector') {
                    triggerEmoji = '🧠';
                    triggerReason = 'VECTOR/RAG';
                } else if (entry.triggerReason === 'forced') {
                    triggerEmoji = '⚡';
                    triggerReason = 'FORCED';
                } else if (entry.triggerReason === 'suppressed') {
                    triggerEmoji = '🚫';
                    triggerReason = 'SUPPRESSED';
                } else if (entry.triggerReason === 'persona') {
                    triggerEmoji = '🪪';
                    triggerReason = 'PERSONA';
                } else if (entry.triggerReason === 'character') {
                    triggerEmoji = '🎭';
                    triggerReason = 'CHARACTER';
                } else if (entry.triggerReason === 'scenario') {
                    triggerEmoji = '🎬';
                    triggerReason = 'SCENARIO';
                } else if (entry.triggerReason === 'authors_note') {
                    triggerEmoji = '📝';
                    triggerReason = 'AUTHOR\'S NOTE';
                } else if (entry.triggerReason === 'probability') {
                    triggerEmoji = '🎲';
                    triggerReason = 'PROBABILITY';
                } else if (entry.triggerReason === 'system') {
                    triggerEmoji = '⚙️';
                    triggerReason = 'SYSTEM';
                } else if (entry.triggerReason === 'sticky') {
                    triggerEmoji = '📌';
                    triggerReason = 'STICKY';
                } else if (entry.triggerReason === 'secondary_key_match') {
                    triggerEmoji = '🔗';
                    triggerReason = 'SECONDARY KEYS';
                } else if (entry.triggerReason === 'constant') {
                    triggerEmoji = '🔵';
                    triggerReason = 'CONSTANT';
                } else if (false) { // recursion detection removed
                    triggerEmoji = '🔄';
                    triggerReason = 'RECURSION-TRIGGERED';
                } else if (entry.triggerReason === 'generation_trigger') {
                    triggerEmoji = '🎯';
                    triggerReason = 'GENERATION';
                } else if (entry.triggerReason === 'normal_key_match') {
                    triggerEmoji = '🟢';
                    triggerReason = 'KEY MATCH';
                } else {
                    // Fallback for any unknown trigger reasons
                    triggerEmoji = '❓';
                    triggerReason = entry.triggerReason ? entry.triggerReason.toUpperCase() : 'UNKNOWN';
                }

                // Handle sticky modifier separately (it's not a trigger reason, it's a modifier)
                if (entry.sticky && entry.sticky !== 0) {
                    if (entry.sticky > 0) {
                        triggerReason += ` (STICKY ${entry.sticky})`;
                    } else {
                        triggerReason += ` (STICKY ${entry.sticky}!)`;
                    }
                }

                triggerIndicator.textContent = triggerEmoji;
                triggerIndicator.title = `Triggered by: ${triggerReason}`;
                indicatorsDiv.appendChild(triggerIndicator);

                // Add trigger reason text for compact mode
                const triggerReasonText = document.createElement('span');
                triggerReasonText.className = 'ck-entry__trigger-reason';
                triggerReasonText.textContent = triggerReason;
                indicatorsDiv.appendChild(triggerReasonText);

                // Sticky info - preserving emoji 📌
                if (entry.sticky && entry.sticky !== 0) {
                    const stickyDiv = document.createElement('span');
                    stickyDiv.className = 'ck-entry__sticky';

                    let stickyText, stickyTitle;
                    if (entry.sticky > 0) {
                        stickyText = `📌${entry.sticky}`;
                        stickyTitle = `Sticky: ${entry.sticky} turns remaining`;
                    } else if (entry.sticky < 0) {
                        stickyText = `📌${entry.sticky}`;
                        stickyTitle = `Sticky: Expired ${Math.abs(entry.sticky)} turns ago`;
                    } else {
                        stickyText = `📌${entry.sticky}`;
                        stickyTitle = `Sticky: Not active`;
                    }

                    stickyDiv.textContent = stickyText;
                    stickyDiv.title = stickyTitle;
                    indicatorsDiv.appendChild(stickyDiv);
                }

                topRow.appendChild(indicatorsDiv);

                entryDiv.appendChild(topRow);

                // ✨ ENHANCED SUMMARY TAGS - glassmorphism tag system
                const summaryBar = document.createElement('div');
                summaryBar.classList.add('ck-summary');

                const keyCount = entry.key?.length || 0;
                const tags = [];

                // Core trigger reason tag
                if (entry.triggerReason) {
                    const triggerReasons = {
                        'forced': { label: '⚡ FORCED', color: 'var(--ck-primary)' },
                        'suppressed': { label: '🚫 SUPPRESSED', color: '#64748b' },
                        'constant': { label: '🔵 CONSTANT', color: '#6366f1' },
                        'vector': { label: '🧠 VECTOR/RAG', color: '#8b5cf6' },
                        'sticky': { label: '📌 STICKY', color: '#ef4444' },
                        // 'recursion_triggered' removed
                        'secondary_key_match': { label: '🔗 SECONDARY KEYS', color: '#06b6d4' },
                        'system': { label: '⚙️ SYSTEM', color: '#475569' },
                        'persona': { label: '👁️ PERSONA', color: '#d946ef' },
                        'character': { label: '🎭 CHARACTER', color: '#f59e0b' },
                        'scenario': { label: '🎬 SCENARIO', color: '#84cc16' },
                        'authors_note': { label: '📝 AUTHOR\'S NOTE', color: '#8b5cf6' },
                        'normal_key_match': { label: '🟢 KEY MATCH', color: '#10b981' }
                    };

                    const triggerReason = triggerReasons[entry.triggerReason] || triggerReasons.normal_key_match;
                    tags.push(`<span class="ck-summary__tag" style="background: ${triggerReason.color}; color: white; border-color: ${triggerReason.color};">${triggerReason.label}</span>`);
                }

                // Key count tag
                tags.push(`<span class="ck-summary__tag">🔑 ${keyCount}</span>`);

                // Sorting indicators
                const sortMethod = extension_settings.CarrotKernel?.sortMethod || 'alpha';
                if (sortMethod === 'order') {
                    tags.push(`<span class="ck-summary__tag" style="background: #6366f1; color: white;">#${entry.order || 0}</span>`);
                }
                if (sortMethod === 'chars') {
                    const charCount = (entry.content || '').length;
                    tags.push(`<span class="ck-summary__tag" style="background: #8b5cf6; color: white;">📝 ${charCount} chars</span>`);
                }

                // Probability tag (if not 100%)
                if (entry.probability && entry.probability < 100) {
                    tags.push(`<span class="ck-summary__tag">🎲 ${entry.probability}%</span>`);
                }

                // Group tag
                if (entry.group) {
                    tags.push(`<span class="ck-summary__tag">👥 ${entry.group}</span>`);
                }

                // Settings tags
                if (entry.entrySettings) {
                    const settings = entry.entrySettings;

                    if (settings.recursion.delayUntilRecursion !== undefined && settings.recursion.delayUntilRecursion !== false) {
                        tags.push(`<span class="ck-summary__tag" title="Delayed until recursion">⏳ DELAYED</span>`);
                    }
                    if (settings.recursion.excludeRecursion === true) {
                        tags.push(`<span class="ck-summary__tag" title="Excludes recursion">🚫 NO-RECURSE</span>`);
                    }
                    if (settings.scanning.scanPersona === true) {
                        tags.push(`<span class="ck-summary__tag" title="Scans persona">🪪 PERSONA-SCAN</span>`);
                    }
                    if (settings.scanning.scanCharacter === true) {
                        tags.push(`<span class="ck-summary__tag" title="Scans character">🎭 CHAR-SCAN</span>`);
                    }
                    if (settings.scanning.scanStory === true) {
                        tags.push(`<span class="ck-summary__tag" title="Scans scenario">🎬 STORY-SCAN</span>`);
                    }
                }

                // Sticky modifier tag
                if (entry.stickyModifier && entry.stickyTurns > 0) {
                    tags.push(`<span class="ck-summary__tag" style="background: var(--ck-primary-gradient); color: white;">📌 ${entry.stickyTurns} turns</span>`);
                }

                summaryBar.innerHTML = tags.join('');
                entryDiv.appendChild(summaryBar);

                // ✨ ADVANCED DEBUG CONTAINER - glassmorphism styling
                const debugContainer = document.createElement('div');
                debugContainer.classList.add('ck-debug');

                const debugContent = document.createElement('div');
                debugContent.classList.add('ck-debug__content');

                // ✨ BUILD CLEAN DEBUG SECTIONS

                // Recursion analysis section removed

                // 🔑 Trigger Keys Section
                if (entry.key && Array.isArray(entry.key)) {
                    const keySection = document.createElement('div');
                    keySection.classList.add('ck-debug__section');

                    const keyHeading = document.createElement('div');
                    keyHeading.classList.add('ck-debug__heading');
                    keyHeading.textContent = `🔑 TRIGGER KEYS (${entry.key.length})`;

                    const keyField = document.createElement('div');
                    keyField.classList.add('ck-debug__field');
                    keyField.innerHTML = entry.key.map(k =>
                        `<span style="background: var(--ck-primary); color: white; padding: 2px 6px; border-radius: 3px; margin-right: 6px; font-weight: 500; font-size: 10px;">${k}</span>`
                    ).join('');

                    keySection.appendChild(keyHeading);
                    keySection.appendChild(keyField);
                    debugContent.appendChild(keySection);
                }

                // 📝 Content Preview Section
                if (entry.content) {
                    const contentSection = document.createElement('div');
                    contentSection.classList.add('ck-debug__section');

                    const contentHeading = document.createElement('div');
                    contentHeading.classList.add('ck-debug__heading');
                    contentHeading.textContent = '📝 CONTENT PREVIEW';

                    const contentField = document.createElement('div');
                    contentField.classList.add('ck-debug__field');
                    const contentPreview = entry.content.length > 150 ? entry.content.substring(0, 150) + '...' : entry.content;
                    contentField.textContent = contentPreview;

                    contentSection.appendChild(contentHeading);
                    contentSection.appendChild(contentField);
                    debugContent.appendChild(contentSection);
                }

                // 🎯 Activation Details Section
                const activationSection = document.createElement('div');
                activationSection.classList.add('ck-debug__section');

                const activationHeading = document.createElement('div');
                activationHeading.classList.add('ck-debug__heading');
                activationHeading.textContent = '🎯 ACTIVATION DETAILS';

                const activationField = document.createElement('div');
                activationField.classList.add('ck-debug__field');

                const details = [];
                if (entry.position !== undefined) details.push(`📍 Position: ${getPositionName(entry.position)}`);
                if (entry.depth !== undefined) details.push(`🏗️ Depth: ${entry.depth}`);
                if (entry.order !== undefined) details.push(`🔢 Order: ${entry.order}`);
                if (entry.probability && entry.probability < 100) details.push(`🎲 Probability: ${entry.probability}%`);

                activationField.textContent = details.join(' • ');
                activationSection.appendChild(activationHeading);
                activationSection.appendChild(activationField);
                debugContent.appendChild(activationSection);

                // ✨ FINALIZE DEBUG CONTAINER

                // 🔬 TRIGGER REASON SECTION (if available)
                if (entry.triggerReason) {
                    const reasonSection = document.createElement('div');
                    reasonSection.classList.add('ck-debug__section');

                    const reasonHeading = document.createElement('div');
                    reasonHeading.classList.add('ck-debug__heading');
                    reasonHeading.textContent = '🔬 WHY IT TRIGGERED';

                    const reasonField = document.createElement('div');
                    reasonField.classList.add('ck-debug__field');

                    const reasonDescriptions = {
                        'forced': 'Force activated by @@activate decorator',
                        'suppressed': 'Suppressed by @@dont_activate decorator',
                        'constant': 'Always active constant entry',
                        'vector': 'Triggered by RAG/Vector similarity',
                        'sticky': 'Active due to sticky effect',
                        'persona': 'Keys found in user persona',
                        'character': 'Keys found in character card',
                        'scenario': 'Keys found in scenario text',
                        'authors_note': 'Keys found in Author\'s Note',
                        'normal_key_match': 'Standard key-based trigger'
                    };

                    const description = reasonDescriptions[entry.triggerReason] || 'Unknown activation reason';
                    reasonField.textContent = `${entry.triggerReason.toUpperCase()}: ${description}`;

                    reasonSection.appendChild(reasonHeading);
                    reasonSection.appendChild(reasonField);
                    debugContent.appendChild(reasonSection);
                }

                // ✨ All debug sections are complete above

                // Keep old debug system functional for compatibility
                const debugLines = [];

                // Add fallback for settings variable if it doesn't exist
                const settings = entry.entrySettings || { scanning: {}, recursion: {} };

                        debugLines.push('<br><strong>🔍 Scanning Settings:</strong>');

                        const scanTargets = [];
                        if (settings.scanning.scanPersona === true) scanTargets.push('🪪 User Persona');
                        if (settings.scanning.scanCharacter === true) scanTargets.push('🎭 Character Card');
                        if (settings.scanning.scanStory === true) scanTargets.push('🎬 Scenario/Story');
                        if (settings.scanning.scanAuthorNote === true) scanTargets.push('📝 Author\'s Note');

                        if (scanTargets.length > 0) {
                            debugLines.push(`🎯 <strong>Scan Targets:</strong> ${scanTargets.join(', ')}`);
                        }

                        if (settings.scanning.scanDepth !== null && settings.scanning.scanDepth !== undefined) {
                            debugLines.push(`📏 <strong>Custom Scan Depth:</strong> ${settings.scanning.scanDepth} messages (overrides global setting)`);
                        }

                // Show additional technical properties
                debugLines.push('<br><strong>📊 ADDITIONAL PROPERTIES:</strong>');

                // Generation context (what type of generation was happening)
                if (entry.trigger && entry.trigger !== 'normal') {
                    const generationTypes = {
                        'continue': '➡️ Continue Generation - extending existing response',
                        'impersonate': '🎭 Impersonate Generation - generating as user',
                        'swipe': '🔄 Swipe Generation - generating alternative response',
                        'regenerate': '🔁 Regenerate - creating new response',
                        'quiet': '🤫 Quiet Generation - background generation without UI updates'
                    };
                    const generationContext = generationTypes[entry.trigger] || `Generation type: ${entry.trigger}`;
                    debugLines.push(`🎯 <strong>Generation Context:</strong> ${generationContext}`);
                }

                // Position/insertion information (this is a SETTING, not trigger reason)
                if (entry.position !== undefined) {
                    const positionLabels = {
                        0: '↑ Before Character',
                        1: '↓ After Character',
                        2: '↑ Author\'s Note Top',
                        3: '↓ Author\'s Note Bottom',
                        4: '📍 At Depth Position',
                        5: '↑ Extension Module Top',
                        6: '↓ Extension Module Bottom'
                    };
                    const positionLabel = positionLabels[entry.position] || `Position ${entry.position}`;
                    debugLines.push(`📍 <strong>Insertion Position:</strong> ${positionLabel} - where content is inserted in prompt`);
                }

                if (entry.probability !== undefined && entry.probability < 100) {
                    debugLines.push(`🎲 <strong>Probability:</strong> ${entry.probability}% chance to activate on each scan`);
                }

                if (entry.group) {
                    debugLines.push(`👥 <strong>Inclusion Group:</strong> "${entry.group}" - only one entry per group activates per scan`);
                }

                if (entry.selectiveLogic !== undefined) {
                    const logicTypes = ['AND ANY', 'NOT ALL', 'NOT ANY', 'AND ALL'];
                    debugLines.push(`🧠 <strong>Key Logic:</strong> ${logicTypes[entry.selectiveLogic] || 'Unknown'} - how multiple trigger keys are combined`);
                }

                if (entry.caseSensitive) {
                    debugLines.push(`🔤 <strong>Case Sensitive:</strong> Key matching respects letter case (A ≠ a)`);
                }

                if (entry.extensions) {
                    debugLines.push(`🔌 <strong>Extensions:</strong> Has extension-specific metadata configured`);
                }

                // Show recursion context if this entry has any recursion settings
                if (entry.entrySettings &&
                    (entry.entrySettings.recursion.delayUntilRecursion !== undefined && entry.entrySettings.recursion.delayUntilRecursion !== false ||
                     entry.entrySettings.recursion.excludeRecursion === true ||
                     entry.entrySettings.recursion.preventRecursion === true)) {

                    debugLines.push(`<div style="margin-top: 12px; padding: 12px; background: rgba(255,193,7,0.1); border-left: 3px solid #ffc107; border-radius: 4px;">
                        <strong>🔄 Recursion System Info:</strong><br>
                        SillyTavern's recursion system allows worldbook entries to trigger other entries by adding content that contains new trigger keys.
                        This entry has special recursion behavior configured (see settings above).
                    </div>`);
                }

                // Debug content is already built with DOM elements above
                // Also append any additional debugLines content for compatibility
                if (debugLines.length > 0) {
                    const additionalDebugDiv = document.createElement('div');
                    additionalDebugDiv.innerHTML = debugLines.join('<br>');
                    debugContent.appendChild(additionalDebugDiv);
                }
                debugContainer.appendChild(debugContent);

                // Click to expand/collapse - proper implementation
                entryDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = debugContainer.style.maxHeight !== '0px' && debugContainer.style.maxHeight !== '';
                    const expandIndicator = summaryBar.querySelector('.expand-indicator');

                    if (isExpanded) {
                        // Collapse
                        debugContainer.style.maxHeight = '0';
                        entryDiv.classList.remove('ck-entry--expanded');
                        if (expandIndicator) expandIndicator.textContent = '▼ Click for details';
                    } else {
                        // Expand
                        debugContainer.style.maxHeight = debugContainer.scrollHeight + 'px';
                        entryDiv.classList.add('ck-entry--expanded');
                        if (expandIndicator) expandIndicator.textContent = '▲ Click to collapse';
                    }
                });

                entryDiv.appendChild(debugContainer);

                // Add entry to the grid container
                entriesContainer.appendChild(entryDiv);
            }

            // Add the entries container to content
            content.appendChild(entriesContainer);
        }
    };

    //! HACK: no event when no entries are activated, only a debug message
    const original_debug = console.debug;
    console.debug = function(...args) {
        if (args[0] == '[WI] Found 0 world lore entries. Sorted by strategy') {
            // Create modern empty state with GitHub-inspired styling
            panel.innerHTML = '';

            const emptyState = document.createElement('div');
            emptyState.className = 'ck-empty-state';

            // Empty state icon
            const emptyIcon = document.createElement('div');
            emptyIcon.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    <circle cx="12" cy="12" r="2" fill="none" stroke="#ff6b35" stroke-width="2"/>
                </svg>
            `;
            emptyIcon.className = 'ck-empty-state__icon';

            const emptyTitle = document.createElement('div');
            emptyTitle.className = 'ck-empty-state__title';
            emptyTitle.textContent = 'No WorldBook entries active';

            const emptyDesc = document.createElement('div');
            emptyDesc.className = 'ck-empty-state__desc';
            emptyDesc.textContent = 'Start chatting to trigger worldbook entries';

            emptyState.appendChild(emptyIcon);
            emptyState.appendChild(emptyTitle);
            emptyState.appendChild(emptyDesc);
            panel.appendChild(emptyState);

            updateBadge([]);
        }
        return original_debug.bind(this)(...args);
    };

    // Initialize panel with proper header structure
    updatePanel([]);
};

// Export for CarrotKernel integration
export const CarrotWorldBookTracker = {
    init,
    analyzeTriggerSource,
    strategy,
    getStrategy
};