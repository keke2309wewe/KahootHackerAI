let isAnalyzing = false;
let hasAnsweredCurrentQuestion = false;
let lastLogState = "";
let lastQuestionText = "";
let scanInterval; 
let questionReadyTime = 0;

function sysLog(msg) {
    try {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ type: "LOG", message: `[Naurok] ${msg}` });
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

            if (url.includes("/complete") || url.includes("/result")) {
                if (lastLogState !== "complete_screen") {
                    sysLog("Test complete screen detected. Shutting down scanner.");
                    lastLogState = "complete_screen";
                }
                return;
            }

            const qElem = document.querySelector('.question-text, .question-content, [class*="question"] p, .test-play--question, .question, h1, h2, h3');
            const currentQuestionText = qElem ? qElem.innerText.trim() : "";
            
            if (currentQuestionText && currentQuestionText !== lastQuestionText && currentQuestionText.length > 2) {
                sysLog("New question detected. Waiting 2.5s for animations to clear...");
                hasAnsweredCurrentQuestion = false;
                lastQuestionText = currentQuestionText;
                questionReadyTime = Date.now() + 2500; 
                scrubAllEvidence();
            }

            const allBlocks = Array.from(document.querySelectorAll('[class*="option"], [class*="answer"], .options > div')).filter(el => el.clientHeight > 40 && el.offsetParent !== null);
            const answerBlocks = allBlocks.filter(block => !allBlocks.some(other => other !== block && block.contains(other)));

            const isQuizVisible = currentQuestionText !== "" && answerBlocks.length >= 2;

            let currentState = `Blocks: ${answerBlocks.length} | Solved: ${hasAnsweredCurrentQuestion}`;
            if (currentState !== lastLogState) {
                sysLog(`[SCAN] ${currentState}`);
                lastLogState = currentState;
            }

            if (isQuizVisible && !isAnalyzing && !hasAnsweredCurrentQuestion) {
                if (Date.now() < questionReadyTime) return; 

                sysLog("🎯 Animations clear! Forcing screenshot...");
                isAnalyzing = true;

                chrome.runtime.sendMessage({ type: "REQUEST_SCREENSHOT_ANALYSIS", platform: "naurok" }, (response) => {
                    isAnalyzing = false; 
                    if (chrome.runtime.lastError) {
                        sysLog("Connection error: " + chrome.runtime.lastError.message);
                        return;
                    }

                    chrome.storage.local.get(['panicMode'], (lateData) => {
                        if (!lateData.panicMode && response && response.winningColor) {
                            highlightByColor(response.winningColor, answerBlocks);
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

function highlightByColor(colorStr, validBlocks) {
    let targetIndex = -1;
    
    if (colorStr === "RED") targetIndex = 0;
    if (colorStr === "YELLOW") targetIndex = 1;
    if (colorStr === "BLUE") targetIndex = 2;
    if (colorStr === "GREEN") targetIndex = 3;

    if (targetIndex === -1) {
        sysLog("Failed to map color: " + colorStr);
        return;
    }

    if (validBlocks.length > targetIndex) {
        const targetEl = validBlocks[targetIndex];
        applyStealthStyles(targetEl);
        sysLog(`Formatted block ${targetIndex} for ${colorStr}.`);
    } else {
        sysLog(`FATAL: Could not find block ${targetIndex} in DOM. Blocks found: ${validBlocks.length}`);
    }
}

scanInterval = setInterval(scanForGameBoard, 1000);