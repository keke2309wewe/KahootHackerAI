// ── Classtime Content Script ──────────────────────────────────────────────────
// Depends on: shared_utils.js (loaded first via manifest)

const sysLog = createSysLog('Classtime');

let isAnalyzingClasstime = false;

sysLog("Content script injected at: " + window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SCRUB_EVIDENCE") {
        sysLog("Scrubbing UI evidence.");
        scrubAllEvidence();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.code === 'KeyA' && !isAnalyzingClasstime && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {

        chrome.storage.local.get(['panicMode'], (data) => {
            if (chrome.runtime.lastError || data.panicMode) return;

            sysLog("Shift+A detected. Forcing manual screenshot visual analysis...");
            isAnalyzingClasstime = true;

            scrubAllEvidence();

            chrome.runtime.sendMessage({ type: "REQUEST_SCREENSHOT_ANALYSIS", platform: "classtime" }, (response) => {
                isAnalyzingClasstime = false;

                if (chrome.runtime.lastError || !response) {
                    sysLog("Connection error or empty response.");
                    return;
                }

                if (response.winningColor) {
                    sysLog(`AI says the answer is option: ${response.winningColor}`);
                    applyClasstimeFormatting(response.winningColor);
                } else if (response.error) {
                    sysLog("AI Error: " + response.error);
                }
            });
        });
    }
});

function applyClasstimeFormatting(result) {
    if (!result) return;

    // 1. Identify valid inputs for multiple choice / single choice
    const inputSelectors = [
        'input[type="radio"]', 
        'input[type="checkbox"]',
        'input.PrivateSwitchBase-input',
        '.MuiRadio-root input',
        '.MuiCheckbox-root input'
    ];
    
    let allInputs = Array.from(document.querySelectorAll(inputSelectors.join(', ')));
    
    // Filter for visible/relevant inputs
    let visibleInputs = allInputs.filter(el => {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.left > (window.innerWidth * 0.1)
        );
    });

    // Remove duplicates and sort
    visibleInputs = [...new Set(visibleInputs)];
    visibleInputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    // 2. Decide if the result is indices or text answer
    let isLikelyIndices = false;
    let targetIndices = [];

    if (visibleInputs.length > 0 && /^[\d,\s]+$/.test(result)) {
        targetIndices = result.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        // Only treat as indices if ALL of them are within range of visible inputs
        if (targetIndices.length > 0 && targetIndices.every(n => n >= 1 && n <= visibleInputs.length)) {
            isLikelyIndices = true;
        }
    }

    if (isLikelyIndices) {
        sysLog(`Highlighting options: ${targetIndices.join(', ')}`);
        targetIndices.forEach(idx => {
            const targetInput = visibleInputs[idx - 1];
            const targetContainer = targetInput.closest('label') || targetInput.parentElement;
            applyStealthStyles(targetContainer);
        });
    } else {
        // 3. Handle as text answer
        sysLog("Handling as text answer.");
        
        // Copy to clipboard
        navigator.clipboard.writeText(result).then(() => {
            sysLog("Copied to clipboard: " + result);
        }).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = result;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            sysLog("Copied to clipboard (fallback).");
        });
        
        // Try to find the text input and fill it
        const textSelectors = [
            'textarea[placeholder*="answer"]',
            'textarea[placeholder*="відповідь"]',
            'textarea.MuiInputBase-input',
            'input[type="text"].MuiInputBase-input',
            '[contenteditable="true"]'
        ];
        
        const textInput = document.querySelector(textSelectors.join(', '));
        if (textInput) {
            if (textInput.tagName === 'TEXTAREA' || textInput.tagName === 'INPUT') {
                textInput.value = result;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
                textInput.dispatchEvent(new Event('change', { bubbles: true }));
                sysLog("Filled text input automatically.");
            } else if (textInput.isContentEditable) {
                textInput.innerText = result;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
                sysLog("Filled contenteditable input.");
            }
        }
    }
}