// ── Logging ──────────────────────────────────────────────────────────────────
function writeLog(msg) {
    chrome.storage.local.get(['sysLogs'], (data) => {
        const logs = data.sysLogs || [];
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (logs.length > 100) logs.length = 100;
        chrome.storage.local.set({ sysLogs: logs });
    });
}

writeLog("V4.9 ENGINE START.");

// ── Shared API Helpers ────────────────────────────────────────────────────────
function buildEndpoint(provider, customUrl) {
    if (provider === 'openai')  return 'https://api.openai.com/v1/chat/completions';
    if (provider === 'custom' && customUrl) return customUrl;
    return 'https://openrouter.ai/api/v1/chat/completions';
}

function buildHeaders(apiKey, provider) {
    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (provider === 'openrouter' || (!provider || provider === '')) {
        h['HTTP-Referer'] = 'https://kahoot-win.v';
    }
    return h;
}

async function getApiConfig() {
    return chrome.storage.local.get([
        'apiKey', 'model', 'provider', 'customUrl', 'useReasoning', 'reasoningEffort'
    ]);
}

function applyReasoning(payload, data) {
    if (!data.useReasoning) return payload;
    const effort = data.reasoningEffort || 'medium';
    const provider = data.provider || 'openrouter';

    if (provider === 'openai') {
        // OpenAI o-series models use a top-level reasoning_effort param
        payload.reasoning_effort = effort;
    } else if (provider === 'custom') {
        // Custom endpoints — skip reasoning to avoid breaking unknown APIs
        writeLog('Reasoning skipped for custom provider.');
    } else {
        // OpenRouter format
        payload.reasoning = { effort: effort, exclude: true };
    }
    return payload;
}

function accumulateTokens(usage) {
    if (!usage) return;
    const inT  = usage.prompt_tokens     || 0;
    const outT = usage.completion_tokens || 0;

    // Log reasoning tokens if present (for transparency in logs)
    const details = usage.completion_tokens_details;
    if (details && details.reasoning_tokens) {
        writeLog(`Reasoning tokens used: ${details.reasoning_tokens}`);
    }

    chrome.storage.local.get(['inputTokens', 'outputTokens'], (d) => {
        chrome.storage.local.set({
            inputTokens:  (d.inputTokens  || 0) + inT,
            outputTokens: (d.outputTokens || 0) + outT
        });
    });
}

// ── Default Prompts ───────────────────────────────────────────────────────────
const DEFAULTS = {
    promptKahoot:   "You are a Kahoot player. Look at this screenshot of a Kahoot game. Read the question and the four answers provided in the colored boxes (Red Triangle, Blue Diamond, Yellow Circle, Green Square). Determine the correct answer. Output ONLY the color of the correct answer box. Your response must be exactly one word: RED, BLUE, YELLOW, or GREEN.",
    promptNaurok:   "Look at this screenshot of a Naurok quiz. Read the question and the four answer options displayed in colored boxes from left to right: Pink/Red, Yellow/Orange, Light Blue, Light Green. Determine the correct answer. Output ONLY the color of the correct answer box. Your response must be exactly one word: RED, YELLOW, BLUE, or GREEN.",
    promptClasstime:"Look at this screenshot of a quiz on Classtime. 1. If it's a multiple-choice question (radio buttons or checkboxes), identify the correct option(s). Output ONLY the index number(s) of the correct option(s), counting from top down (1 for first, 2 for second, etc.). If multiple answers are correct, list them separated by commas (e.g., '1,3'). 2. If it's a text-based question, provide the correct text answer in plain text. NO LaTeX, no markdown, no formatting. Use simple characters typeable on a 60% keyboard.",
    promptSniper:   "You are a helper for an 8th-grade student in Ukraine (НУШ). Reply ONLY in Ukrainian. Give the shortest possible correct answer. If it's math/physics, provide clear steps but use ONLY plain text. NO LaTeX, no bolding, no markdown. Use simple characters (e.g., ^ for powers, / for fractions). Ensure it can be typed on a basic 60% keyboard.",
    promptCrop:     "Look at this cropped image from a test. Solve the problem or answer the question. Give ONLY the final answer or essential steps. Reply in Ukrainian. Use plain text ONLY. NO LaTeX, no formatting, no markdown. Must be typeable on a 60% keyboard.",
};

async function getPrompt(key) {
    const data = await chrome.storage.local.get([key]);
    return (data[key] && data[key].trim()) ? data[key].trim() : DEFAULTS[key];
}

// ── Commands (Hotkeys) ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-panic') {
        chrome.storage.local.get(['panicMode'], (data) => {
            const newMode = !data.panicMode;
            writeLog(`Hotkey: Panic Mode → ${newMode}`);
            chrome.storage.local.set({ panicMode: newMode }, () => {
                if (newMode) broadcastToActiveTab({ type: 'SCRUB_EVIDENCE' });
            });
        });
    }
});

// ── Context Menu ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    // Remove existing to avoid duplicate-key errors on reload
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id:       'text-sniper',
            title:    'Snipe Text with AI',
            contexts: ['selection']
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'text-sniper' && info.selectionText) {
        chrome.tabs.sendMessage(tab.id, { type: 'SNIPER_RESULT', result: 'Target acquired. Processing...' });
        processTextSniper(info.selectionText, tab.id);
    }
});

// ── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG') {
        writeLog(request.message);
        return false;
    }

    if (request.type === 'REQUEST_SCREENSHOT_ANALYSIS') {
        writeLog(`Screenshot request for platform: ${request.platform || 'default'}`);
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 55 }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                const msg = chrome.runtime.lastError?.message || 'No data returned';
                writeLog('Screenshot failed: ' + msg);
                sendResponse({ error: 'Screenshot failed: ' + msg });
                return;
            }
            writeLog('Screenshot acquired. Querying AI...');
            analyzeImageWithRetry(dataUrl, request.platform)
                .then(answer => {
                    writeLog(`AI answer: ${answer}`);
                    sendResponse({ winningColor: answer });
                })
                .catch(err => {
                    writeLog(`API Error (after retry): ${err.message}`);
                    sendResponse({ error: err.message });
                });
        });
        return true; // keep channel open for async sendResponse
    }

    if (request.type === 'TEXT_SNIPER') {
        if (!sender.tab?.id) return false;
        processTextSniper(request.text, sender.tab.id);
        return false;
    }

    if (request.type === 'CROP_SNIPER') {
        if (!sender.tab?.id) return false;
        processCropSniper(request.coords, sender.tab.id);
        return false;
    }

    if (request.type === 'TOGGLE_PANIC_FROM_PAGE') {
        chrome.storage.local.get(['panicMode'], (data) => {
            const newMode = !data.panicMode;
            writeLog(`Page hotkey: Panic Mode → ${newMode}`);
            chrome.storage.local.set({ panicMode: newMode }, () => {
                if (newMode) broadcastToActiveTab({ type: 'SCRUB_EVIDENCE' });
            });
        });
        return false;
    }

    // ── Quiz Answer Pre-loader (Kitty-Tools / kahoot-answer-bot approach) ────────
    if (request.type === 'FETCH_QUIZ_ANSWERS') {
        const quizId = (request.quizId || '').trim();
        if (!quizId) {
            sendResponse({ error: 'No Quiz ID provided.' });
            return false;
        }
        writeLog(`Fetching quiz answers for ID: ${quizId}`);
        fetchQuizAnswers(quizId)
            .then(result => {
                writeLog(`Quiz loaded: "${result.title}" — ${result.cache.length} questions`);
                // Persist cache for content_script to use
                chrome.storage.local.set({ quizAnswerCache: result.cache, quizTitle: result.title });
                sendResponse({ ok: true, title: result.title, questions: result.questions });
            })
            .catch(err => {
                writeLog(`Quiz fetch error: ${err.message}`);
                sendResponse({ error: err.message });
            });
        return true; // async
    }

    if (request.type === 'CLEAR_QUIZ_CACHE') {
        chrome.storage.local.remove(['quizAnswerCache', 'quizTitle']);
        writeLog('Quiz answer cache cleared.');
        return false;
    }

});

// ── Broadcast Helper ──────────────────────────────────────────────────────────
function broadcastToActiveTab(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg);
    });
}

// ── Kahoot Public API — Quiz Answer Fetcher ────────────────────────────────────
// Uses the same endpoint as Kitty-Tools & kahoot-answer-bot:
//   GET https://create.kahoot.it/rest/kahoots/{quizUUID}
// Index → color:  0=RED  1=BLUE  2=YELLOW  3=GREEN  (matches in-game button order)
const COLOR_MAP = ['RED', 'BLUE', 'YELLOW', 'GREEN'];

async function fetchQuizAnswers(quizId) {
    const url = `https://create.kahoot.it/rest/kahoots/${encodeURIComponent(quizId)}`;
    const resp = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    if (resp.status === 400) throw new Error('Invalid Quiz UUID — check the ID and try again.');
    if (resp.status === 403) throw new Error('Quiz is private or requires login.');
    if (resp.status === 404) throw new Error('Quiz not found.');
    if (!resp.ok)            throw new Error(`Kahoot API returned HTTP ${resp.status}`);

    const quiz = await resp.json();
    if (!quiz.questions || !Array.isArray(quiz.questions)) {
        throw new Error('Unexpected API response — no questions array.');
    }

    // Detect randomised answer order (cache is unreliable in this case)
    const randomized = quiz.options?.questionAndAnswerCountdown === false
                    || quiz.randomizeAnswers === true;

    const cache = [];
    const questions = [];

    quiz.questions.forEach((q, idx) => {
        const type = q.type || q.questionLayout;
        // Types that have indexable choices: quiz, multiple_select_quiz
        const hasChoices = q.choices && Array.isArray(q.choices) && q.choices.length > 0;

        if (!hasChoices) {
            cache.push(null); // non-standard question type
            questions.push({ index: idx, question: q.question, answer: '(no choices)', color: null, type });
            return;
        }

        let correctIndex = -1;
        let correctAnswer = '';
        q.choices.forEach((c, i) => {
            if (c.correct && correctIndex === -1) {
                correctIndex = i;
                correctAnswer = c.answer || '';
            }
        });

        const color = correctIndex >= 0 ? (COLOR_MAP[correctIndex] || null) : null;
        cache.push(randomized ? null : color); // null = force AI fallback for randomised
        questions.push({
            index: idx,
            question: q.question || `Question ${idx + 1}`,
            answer: correctAnswer,
            color,
            randomized,
            type
        });
    });

    return { title: quiz.title || 'Unknown Quiz', cache, questions };
}

// ── Retry Wrapper ─────────────────────────────────────────────────────────────
async function analyzeImageWithRetry(base64Image, platform, retries = 1) {
    try {
        return await analyzeImage(base64Image, platform);
    } catch (err) {
        if (retries > 0) {
            writeLog(`AI failed: ${err.message}. Retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            return analyzeImageWithRetry(base64Image, platform, retries - 1);
        }
        throw err;
    }
}

// ── Image Analysis (Kahoot / Classtime / Naurok) ──────────────────────────────
async function analyzeImage(base64Image, platform) {
    const data = await getApiConfig();
    if (!data.apiKey) throw new Error('API Key missing');

    let promptText;
    if (platform === 'classtime') {
        promptText = await getPrompt('promptClasstime');
    } else if (platform === 'naurok') {
        promptText = await getPrompt('promptNaurok');
    } else {
        promptText = await getPrompt('promptKahoot');
    }

    const payload = applyReasoning({
        model:       data.model || 'google/gemini-3-flash-preview',
        messages: [{
            role: 'user',
            content: [
                { type: 'text',      text: promptText },
                { type: 'image_url', image_url: { url: base64Image } }
            ]
        }],
        temperature: 0.0
    }, data);

    const resp = await fetch(buildEndpoint(data.provider, data.customUrl), {
        method:  'POST',
        headers: buildHeaders(data.apiKey, data.provider),
        body:    JSON.stringify(payload)
    });

    if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (!json.choices?.[0]) throw new Error(json.error?.message || 'API Limit or Unknown Error');

    accumulateTokens(json.usage);
    let result = json.choices[0].message.content.trim();
    chrome.storage.local.set({ lastAiAnswer: result });

    if (platform === 'classtime') {
        // If result is just digits and commas, it's multiple choice
        if (/^[\d,\s]+$/.test(result)) {
            return result;
        }
        // If it's a single digit (possibly with extra text), try to extract it
        const digitMatch = result.match(/^\s*(\d+)\s*$/);
        if (digitMatch) return digitMatch[1];
        
        // Otherwise return the whole text (for free text)
        return result;
    }

    const upperResult = result.toUpperCase();
    if (upperResult.includes('RED'))    return 'RED';
    if (upperResult.includes('BLUE'))   return 'BLUE';
    if (upperResult.includes('YELLOW')) return 'YELLOW';
    if (upperResult.includes('GREEN'))  return 'GREEN';
    return result;
}

// ── Text Sniper ───────────────────────────────────────────────────────────────
async function processTextSniper(text, tabId) {
    writeLog(`Text snipe: "${text.substring(0, 40)}..."`);
    try {
        const answer = await analyzeTextOnly(text);
        chrome.tabs.sendMessage(tabId, { type: 'SNIPER_RESULT', result: answer });
        storeSniperResult(text, answer);
        writeLog('Text snipe successful.');
    } catch (err) {
        chrome.tabs.sendMessage(tabId, { type: 'SNIPER_ERROR', error: err.message });
        writeLog(`Text snipe error: ${err.message}`);
    }
}

// ── Sniper History ────────────────────────────────────────────────────────────
function storeSniperResult(question, answer) {
    chrome.storage.local.get(['sniperHistory'], (data) => {
        const history = data.sniperHistory || [];
        history.unshift({
            q: question.substring(0, 200),
            a: answer.substring(0, 500),
            time: new Date().toLocaleTimeString()
        });
        if (history.length > 30) history.length = 30;
        chrome.storage.local.set({ sniperHistory: history });
    });
}

async function analyzeTextOnly(textQuery) {
    const data = await getApiConfig();
    if (!data.apiKey) throw new Error('API Key missing');

    const promptText = await getPrompt('promptSniper');

    const payload = applyReasoning({
        model:       data.model || 'google/gemini-3-flash-preview',
        messages: [
            { role: 'system', content: promptText },
            { role: 'user',   content: textQuery }
        ],
        temperature: 0.2
    }, data);

    const resp = await fetch(buildEndpoint(data.provider, data.customUrl), {
        method:  'POST',
        headers: buildHeaders(data.apiKey, data.provider),
        body:    JSON.stringify(payload)
    });

    if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (!json.choices?.[0]) throw new Error(json.error?.message || 'API Limit Error');

    accumulateTokens(json.usage);
    return json.choices[0].message.content.trim();
}

// ── Crop Sniper ───────────────────────────────────────────────────────────────
async function processCropSniper(coords, tabId) {
    writeLog('Crop snipe: capturing screen...');
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, async (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
            const msg = chrome.runtime.lastError?.message || 'No data';
            chrome.tabs.sendMessage(tabId, { type: 'SNIPER_ERROR', error: 'Screen capture failed: ' + msg });
            return;
        }

        try {
            const response = await fetch(dataUrl);
            const blob     = await response.blob();
            const bitmap   = await createImageBitmap(blob);

            const canvas = new OffscreenCanvas(Math.ceil(coords.w), Math.ceil(coords.h));
            const ctx    = canvas.getContext('2d');
            ctx.drawImage(bitmap, coords.x, coords.y, coords.w, coords.h, 0, 0, coords.w, coords.h);

            const blobCrop = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
            const buffer   = await blobCrop.arrayBuffer();
            const bytes    = new Uint8Array(buffer);

            // Service Worker compatible base64 encoding
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            const base64Crop = 'data:image/jpeg;base64,' + btoa(binary);

            writeLog('Crop ready. Sending to AI...');
            const answer = await analyzeCroppedImage(base64Crop);
            chrome.tabs.sendMessage(tabId, { type: 'SNIPER_RESULT', result: answer });
        } catch (err) {
            writeLog(`Crop error: ${err.message}`);
            chrome.tabs.sendMessage(tabId, { type: 'SNIPER_ERROR', error: err.message });
        }
    });
}

async function analyzeCroppedImage(base64Crop) {
    const data = await getApiConfig();
    if (!data.apiKey) throw new Error('API Key missing');

    const promptText = await getPrompt('promptCrop');

    const payload = applyReasoning({
        model:       data.model || 'google/gemini-3-flash-preview',
        messages: [{
            role: 'user',
            content: [
                { type: 'text',      text: promptText },
                { type: 'image_url', image_url: { url: base64Crop } }
            ]
        }],
        temperature: 0.0
    }, data);

    const resp = await fetch(buildEndpoint(data.provider, data.customUrl), {
        method:  'POST',
        headers: buildHeaders(data.apiKey, data.provider),
        body:    JSON.stringify(payload)
    });

    if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (!json.choices?.[0]) throw new Error(json.error?.message || 'API Limit Error');

    accumulateTokens(json.usage);
    return json.choices[0].message.content.trim();
}