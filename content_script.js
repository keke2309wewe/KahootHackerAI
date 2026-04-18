// ── Kahoot Content Script ─────────────────────────────────────────────────────
// Depends on: shared_utils.js (loaded first via manifest)

const sysLog = createSysLog('Kahoot');

let isAnalyzing = false;
let hasAnsweredCurrentQuestion = false;
let lastLogState = "";
let scanInterval;

sysLog("Content script injected at: " + window.location.href);

try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "SCRUB_EVIDENCE") {
            sysLog("Scrubbing UI evidence.");
            scrubAllEvidence();
        }
    });
} catch (e) {}

function scanForGameBoard() {
    try {
        if (!chrome.runtime?.id) {
            clearInterval(scanInterval);
            return;
        }

        chrome.storage.local.get(['panicMode'], (data) => {
            if (chrome.runtime.lastError) return;

            if (data.panicMode) {
                if (lastLogState !== "panic") {
                    sysLog("Panic mode active. Scanning paused.");
                    lastLogState = "panic";
                }
                return;
            }

            const url = window.location.href;

            if (url.includes("/answer/")) {
                if (lastLogState !== "result_screen") {
                    sysLog("Result screen detected. Waiting for next round.");
                    lastLogState = "result_screen";
                }
                return;
            }

            const selectors = '[data-functional-selector^="answer-"], [data-functional-selector="block-title"], [data-functional-selector*="question-choice"]';
            const answerBlocks = document.querySelectorAll(selectors);
            const isGameBlock = url.includes("gameblock");

            if (!isGameBlock && answerBlocks.length < 2 && hasAnsweredCurrentQuestion) {
                sysLog("Board cleared. Resetting question lock.");
                hasAnsweredCurrentQuestion = false;
                scrubAllEvidence();
            }

            let currentState = `Blocks: ${answerBlocks.length} | Lock: ${isAnalyzing} | Solved: ${hasAnsweredCurrentQuestion}`;
            if (currentState !== lastLogState) {
                sysLog(`[SCAN] ${currentState}`);
                lastLogState = currentState;
            }

            if ((answerBlocks.length >= 2 || isGameBlock) && !isAnalyzing && !hasAnsweredCurrentQuestion) {
                // textContent is cheaper than innerText (no layout reflow)
                const bodyText = document.body.textContent.toLowerCase();
                if (bodyText.includes("time's up") || bodyText.includes("correct") || bodyText.includes("incorrect")) {
                    return;
                }

                sysLog("🎯 Live board detected! Forcing screenshot...");
                isAnalyzing = true;

                chrome.runtime.sendMessage({ type: "REQUEST_SCREENSHOT_ANALYSIS", platform: "kahoot" }, (response) => {
                    isAnalyzing = false;
                    if (chrome.runtime.lastError) {
                        sysLog("Connection error: " + chrome.runtime.lastError.message);
                        return;
                    }

                    chrome.storage.local.get(['panicMode'], (lateData) => {
                        if (!lateData.panicMode && response && response.winningColor) {
                            highlightByColor(response.winningColor);
                            hasAnsweredCurrentQuestion = true;
                        } else if (response && response.error) {
                            sysLog("AI Error: " + response.error);
                        }
                    });
                });
            }
        });
    } catch (error) {
        if (scanInterval) clearInterval(scanInterval);
    }
}

function highlightByColor(colorStr) {
    let targetIndex = -1;
    if (colorStr === "RED") targetIndex = 0;
    if (colorStr === "BLUE") targetIndex = 1;
    if (colorStr === "YELLOW") targetIndex = 2;
    if (colorStr === "GREEN") targetIndex = 3;

    if (targetIndex === -1) {
        sysLog("Failed to map color: " + colorStr);
        return;
    }

    let targetEl = document.querySelector(`[data-functional-selector="answer-${targetIndex}"]`);

    if (!targetEl) {
        sysLog("Standard tags missing. Using fallback selection.");
        const blocks = document.querySelectorAll('button[aria-label], [data-functional-selector*="question-choice"]');
        if (blocks.length > targetIndex) {
            targetEl = blocks[targetIndex];
        }
    }

    if (targetEl) {
        applyStealthStyles(targetEl);
        sysLog(`Formatted ${colorStr} block.`);
    } else {
        sysLog(`FATAL: Could not find ${colorStr} element in DOM.`);
    }
}

scanInterval = setInterval(scanForGameBoard, 1000);