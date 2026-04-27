// ── Shared Utilities ──────────────────────────────────────────────────────────
// Loaded before every platform-specific content script via manifest.json.

/**
 * Creates a prefixed logger that forwards messages to the background service worker.
 * Usage: const sysLog = createSysLog('Kahoot');
 */
function createSysLog(prefix) {
    return function sysLog(msg) {
        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({ type: 'LOG', message: `[${prefix}] ${msg}` });
            }
        } catch (e) {
            // Extension context invalidated — scanner intervals will catch this
        }
    };
}

/**
 * Removes all AI-injected stealth classes and inline styles from the page.
 */
function scrubAllEvidence() {
    document.querySelectorAll('.ai-stealth, .ai-stealth-ghost, .ai-stealth-rainbow').forEach(el => {
        el.classList.remove(
            'ai-stealth', 'ai-stealth-bold', 'ai-stealth-italic',
            'ai-stealth-color', 'ai-stealth-font', 'ai-stealth-ghost',
            'ai-stealth-rainbow'
        );
        el.style.removeProperty('color');
        el.style.removeProperty('text-shadow');
        el.style.removeProperty('cursor');

        // Clean up steps artifacts
        el.removeAttribute('title');
        if (el._aiStepsOver) {
            el.removeEventListener('mouseover', el._aiStepsOver);
            el.removeEventListener('mouseout',  el._aiStepsOut);
            delete el._aiStepsOver;
            delete el._aiStepsOut;
        }
    });
    // Remove ghost text spans
    document.querySelectorAll('.ai-steps-ghost').forEach(s => s.remove());
    // Clear statusbar
    window.status = '';
}

/**
 * Applies the user's chosen stealth formatting to a target DOM element.
 * Reads settings from chrome.storage.local.
 */
function applyStealthStyles(targetEl, steps) {
    chrome.storage.local.get(
        ['styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost', 'cursorStyle', 'themeColor', 'rainbowMode', 'stepsMode'],
        (data) => {
            if (data.styleBold !== false) targetEl.classList.add('ai-stealth-bold');
            if (data.styleItalic) targetEl.classList.add('ai-stealth-italic');
            if (data.styleFont) targetEl.classList.add('ai-stealth-font');

            if (data.styleColor) {
                if (data.rainbowMode) {
                    // Inject rainbow keyframes once
                    if (!document.getElementById('ai-rainbow-style')) {
                        const style = document.createElement('style');
                        style.id = 'ai-rainbow-style';
                        style.innerHTML = `@keyframes ai-rainbow-pulse { 0% {color: #ff0000; text-shadow: 0 0 5px #ff0000;} 16% {color: #ffff00; text-shadow: 0 0 5px #ffff00;} 33% {color: #00ff00; text-shadow: 0 0 5px #00ff00;} 50% {color: #00ffff; text-shadow: 0 0 5px #00ffff;} 66% {color: #0000ff; text-shadow: 0 0 5px #0000ff;} 83% {color: #ff00ff; text-shadow: 0 0 5px #ff00ff;} 100% {color: #ff0000; text-shadow: 0 0 5px #ff0000;} } .ai-stealth-rainbow { animation: ai-rainbow-pulse 3s linear infinite !important; }`;
                        document.head.appendChild(style);
                    }
                    targetEl.classList.add('ai-stealth-rainbow');
                } else {
                    const hex = data.themeColor || '#00ff00';
                    targetEl.style.setProperty('color', hex, 'important');
                    targetEl.style.setProperty('text-shadow', '1px 1px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9)', 'important');
                }
            }

            if (data.styleGhost) {
                targetEl.classList.add('ai-stealth-ghost');
                targetEl.style.setProperty('cursor', data.cursorStyle || 'text', 'important');
            }

            targetEl.classList.add('ai-stealth');

            // Inject steps if provided
            if (steps) {
                _injectSteps(targetEl, steps, data.stepsMode || 'steps_title');
            }
        }
    );
}

/**
 * Injects AI steps into the DOM using the chosen display mode.
 * @param {HTMLElement} el - The highlighted answer element.
 * @param {string} steps - Plain text steps (e.g. '2^2 = 2x2 = 4').
 * @param {string} mode - One of: steps_title, steps_console, steps_statusbar, steps_ghost, none.
 */
function _injectSteps(el, steps, mode) {
    if (!steps || mode === 'none') return;

    switch (mode) {
        case 'steps_title':
            el.setAttribute('title', steps);
            break;

        case 'steps_console':
            console.log('[AI STEPS] ' + steps);
            break;

        case 'steps_statusbar':
            el._aiStepsOver = () => { window.status = steps; };
            el._aiStepsOut  = () => { window.status = ''; };
            el.addEventListener('mouseover', el._aiStepsOver);
            el.addEventListener('mouseout',  el._aiStepsOut);
            break;

        case 'steps_ghost': {
            const span = document.createElement('span');
            span.className = 'ai-steps-ghost';
            span.textContent = ' ' + steps;
            el.appendChild(span);
            break;
        }

        default:
            el.setAttribute('title', steps);
            break;
    }
}
