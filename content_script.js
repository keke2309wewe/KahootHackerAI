let isAnalyzing = false;
let hasAnsweredCurrentQuestion = false;
let lastLogState = "";
let scanInterval; 

function sysLog(msg) {
    try {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ type: "LOG", message: `[Kahoot] ${msg}` });
        }
    } catch (e) {
        if (scanInterval) clearInterval(scanInterval);
    }
}

function scrubAllEvidence() {
    // Target anything that has stealth or ghost classes and strip them bare
    document.querySelectorAll('.ai-stealth, .ai-stealth-ghost').forEach(el => {
        el.classList.remove('ai-stealth', 'ai-stealth-bold', 'ai-stealth-italic', 'ai-stealth-color', 'ai-stealth-font', 'ai-stealth-ghost');
    });
}

function applyStealthStyles(targetEl) {
    chrome.storage.local.get(['styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost'], (data) => {
        if (data.styleBold !== false && !data.styleGhost) targetEl.classList.add('ai-stealth-bold');
        if (data.styleItalic && !data.styleGhost) targetEl.classList.add('ai-stealth-italic');
        if (data.styleColor && !data.styleGhost) targetEl.classList.add('ai-stealth-color');
        if (data.styleFont && !data.styleGhost) targetEl.classList.add('ai-stealth-font');
        
        // Ghost mode overrides the loud styles
        if (data.styleGhost) targetEl.classList.add('ai-stealth-ghost');
        
        targetEl.classList.add('ai-stealth'); 
    });
}

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

            if (!isGameBlock && hasAnsweredCurrentQuestion) {
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
                const bodyText = document.body.innerText.toLowerCase();
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