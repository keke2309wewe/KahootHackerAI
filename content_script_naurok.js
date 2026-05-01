// ── Naurok Content Script ─────────────────────────────────────────────────────
// Depends on: shared_utils.js (loaded first via manifest)

const sysLog = createSysLog('Naurok');

let isAnalyzing = false;
let hasAnsweredCurrentQuestion = false;
let lastLogState = "";
let lastQuestionText = "";
let scanInterval;
let questionReadyTime = 0;

// ── Session tracking for dashboard reporting ─────────────────────────────────
let sessionCorrect = 0;
let sessionWrong = 0;
let sessionQuestions = 0;
let sessionReported = false;

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

                    // Report result to dashboard
                    if (!sessionReported && sessionQuestions > 0) {
                        sessionReported = true;
                        sysLog(`🏁 Naurok complete! Reporting: ${sessionCorrect}/${sessionQuestions}`);
                        reportNaurokResult();
                    }
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
                            highlightByColor(response.winningColor, answerBlocks, response.steps);
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

function highlightByColor(colorStr, validBlocks, steps) {
    let targetIndex = -1;

    // Naurok layout: Pink(RED)=0, Yellow=1, Blue=2, Green=3
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
        applyStealthStyles(targetEl, steps);
        sysLog(`Formatted block ${targetIndex} for ${colorStr}.`);
    } else {
        sysLog(`FATAL: Could not find block ${targetIndex} in DOM. Blocks found: ${validBlocks.length}`);
    }
}

// ── Report game result to dashboard ──────────────────────────────────────────
function reportNaurokResult() {
    chrome.storage.local.get(['inputTokens', 'outputTokens', 'inCost', 'outCost'], (data) => {
        const inC = data.inCost !== undefined ? data.inCost : 0.50;
        const outC = data.outCost !== undefined ? data.outCost : 3.00;
        const cost = ((data.inputTokens || 0) / 1_000_000 * inC) + ((data.outputTokens || 0) / 1_000_000 * outC);

        chrome.runtime.sendMessage({
            type: 'REPORT_GAME_RESULT',
            data: {
                platform: 'naurok',
                quizTitle: document.title || 'Naurok Test',
                totalQuestions: sessionQuestions,
                correctAnswers: sessionCorrect,
                wrongAnswers: sessionWrong,
                skipped: Math.max(0, sessionQuestions - sessionCorrect - sessionWrong),
                solveMode: 'ai',
                inputTokens: data.inputTokens || 0,
                outputTokens: data.outputTokens || 0,
                estimatedCost: cost
            }
        });
    });
}

scanInterval = setInterval(scanForGameBoard, 1000);