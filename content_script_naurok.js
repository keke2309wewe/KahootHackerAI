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
    document.querySelectorAll('.ai-stealth, .ai-stealth-ghost').forEach(el => {
        el.classList.remove('ai-stealth', 'ai-stealth-bold', 'ai-stealth-italic', 'ai-stealth-color', 'ai-stealth-font', 'ai-stealth-ghost');
        el.style.removeProperty('color');
        el.style.removeProperty('text-shadow');
        el.style.removeProperty('cursor');
    });
}

function applyStealthStyles(targetEl) {
    chrome.storage.local.get(['styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost', 'cursorStyle', 'themeColor', 'rainbowMode'], (data) => {
        if (data.styleBold !== false) targetEl.classList.add('ai-stealth-bold');
        if (data.styleItalic) targetEl.classList.add('ai-stealth-italic');
        if (data.styleFont) targetEl.classList.add('ai-stealth-font');
        
        if (data.styleColor) {
            if (data.rainbowMode) {
                // Dynamically build the rainbow animation if it doesn't exist
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