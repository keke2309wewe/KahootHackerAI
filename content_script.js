// ── Kahoot Content Script ─────────────────────────────────────────────────────
// Depends on: shared_utils.js (loaded first via manifest)

const sysLog = createSysLog('Kahoot');

let isAnalyzing = false;
let hasAnsweredCurrentQuestion = false;
let lastLogState = "";
let scanInterval;

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

            // ── Game-over detection ──────────────────────────────────────
            if ((url.includes("/ranking") || url.includes("/podium")) && !sessionReported && sessionQuestions > 0) {
                sysLog(`🏁 Game over detected! Reporting: ${sessionCorrect}/${sessionQuestions}`);
                sessionReported = true;
                reportKahootResult();
                return;
            }

            if (url.includes("/answer/")) {
                if (lastLogState !== "result_screen") {
                    sysLog("Result screen detected. Waiting for next round.");
                    lastLogState = "result_screen";

                    // Detect correct/incorrect from the result screen
                    setTimeout(() => {
                        const bodyText = document.body.textContent.toLowerCase();
                        sessionQuestions++;
                        if (bodyText.includes("correct") && !bodyText.includes("incorrect")) {
                            sessionCorrect++;
                            sysLog(`Session: ✓ correct (${sessionCorrect}/${sessionQuestions})`);
                        } else {
                            sessionWrong++;
                            sysLog(`Session: ✗ wrong (${sessionWrong}/${sessionQuestions})`);
                        }
                    }, 1500);
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
                            highlightByColor(response.winningColor, response.steps);
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

function highlightByColor(colorStr, steps) {
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
        applyStealthStyles(targetEl, steps);
        sysLog(`Formatted ${colorStr} block.`);
    } else {
        sysLog(`FATAL: Could not find ${colorStr} element in DOM.`);
    }
}

// ── Report game result to dashboard ──────────────────────────────────────────
function reportKahootResult() {
    chrome.storage.local.get(['inputTokens', 'outputTokens', 'inCost', 'outCost'], (data) => {
        const inC = data.inCost !== undefined ? data.inCost : 0.50;
        const outC = data.outCost !== undefined ? data.outCost : 3.00;
        const cost = ((data.inputTokens || 0) / 1_000_000 * inC) + ((data.outputTokens || 0) / 1_000_000 * outC);

        chrome.runtime.sendMessage({
            type: 'REPORT_GAME_RESULT',
            data: {
                platform: 'kahoot',
                quizTitle: document.title || 'Kahoot Game',
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