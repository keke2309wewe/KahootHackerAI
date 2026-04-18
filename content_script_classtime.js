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

function applyClasstimeFormatting(indexStr) {
    let targetIndex = parseInt(indexStr) - 1;

    if (isNaN(targetIndex) || targetIndex < 0) {
        sysLog("Failed to map index: " + indexStr);
        return;
    }

    let radioInputs = Array.from(document.querySelectorAll('input[type="radio"]'));

    let visibleRadios = radioInputs.filter(el => {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.left > (window.innerWidth * 0.2)
        );
    });

    visibleRadios.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    sysLog(`Debug: Found ${visibleRadios.length} valid radio inputs in viewport.`);

    if (visibleRadios.length > targetIndex) {
        let targetRadio = visibleRadios[targetIndex];
        let targetContainer = targetRadio.closest('label') || targetRadio.parentElement;

        applyStealthStyles(targetContainer);

        let tagInfo = `${targetContainer.tagName.toLowerCase()}.${targetContainer.className.replace(/\s+/g, '.')}`;
        sysLog(`Formatted option ${targetIndex + 1}. Target applied to: ${tagInfo}`);
    } else {
        sysLog(`DOM fail: Could not find index ${targetIndex}. Only saw ${visibleRadios.length} valid radios in view.`);
    }
}