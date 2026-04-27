// ── Classtime Content Script ──────────────────────────────────────────────────
// Depends on: shared_utils.js (loaded first via manifest)

const sysLog = createSysLog('Classtime');

let isAnalyzingClasstime = false;

sysLog("Content script injected at: " + window.location.href);

try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "SCRUB_EVIDENCE") {
            sysLog("Scrubbing UI evidence.");
            scrubAllEvidence();
        }
    });
} catch (e) {}

document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.code === 'KeyA' && !isAnalyzingClasstime && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {

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
                    applyClasstimeFormatting(response.winningColor, response.steps);
                } else if (response.error) {
                    sysLog("AI Error: " + response.error);
                }
            });
        });
    }
});

function applyClasstimeFormatting(result, steps) {
    if (!result) return;

    // 1. Check if it's a grid/matrix response (e.g., "1:2; 2:1")
    if (/^(\s*\d+:\d+\s*;?)+$/.test(result)) {
        sysLog("Detected grid question format.");
        const pairs = result.split(';').map(s => s.trim()).filter(s => s.includes(':'));
        
        // Find all visible grids
        const grids = Array.from(document.querySelectorAll('table[role="grid"], table'));
        const activeGrid = grids.find(g => {
            const rect = g.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
        });

        if (activeGrid) {
            const rows = Array.from(activeGrid.querySelectorAll('tbody tr'));
            pairs.forEach(pair => {
                const [rowIdx, colIdx] = pair.split(':').map(Number);
                const targetRow = rows[rowIdx - 1];
                if (targetRow) {
                    // Find the colIdx-th input in this row
                    const inputs = Array.from(targetRow.querySelectorAll('input'));
                    const targetInput = inputs[colIdx - 1];
                    if (targetInput) {
                        const targetContainer = targetInput.closest('label') || targetInput.parentElement;
                        applyStealthStyles(targetContainer, steps);
                        sysLog(`Highlighted Grid Row ${rowIdx}, Column ${colIdx}`);
                    }
                }
            });
            return; // Finished grid handling
        } else {
            sysLog("No active grid found in view.");
        }
    }

    // 2. Identify valid inputs for multiple choice / single choice (legacy logic)
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

    // 3. Decide if the result is indices or text answer
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
            applyStealthStyles(targetContainer, steps);
        });
    } else {
        // 4. Handle as text answer
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