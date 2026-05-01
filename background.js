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
    if (!provider || provider === 'openrouter') {
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
    promptClasstime:"Look at this screenshot of a quiz on Classtime. 1. If it's a multiple-choice question (radio buttons or checkboxes), identify the correct option(s). Output ONLY the index number(s) of the correct option(s), counting from top down (1 for first, 2 for second, etc.). If multiple answers are correct, list them separated by commas (e.g., '1,3'). 2. If it's a grid/matrix question (rows of statements with columns of options), output the correct column index for each row in the format 'RowIndex:ColumnIndex' separated by semicolons (e.g., '1:2; 2:1; 3:2'). Row 1 is the first statement row. Column 1 is the first choice column. 3. If it's a text-based question, provide the correct text answer in plain text. NO LaTeX, no markdown, no formatting. Use simple characters typeable on a 60% keyboard.",
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
                .then(result => {
                    writeLog(`AI answer: ${result.answer} | Steps: ${result.steps || 'none'}`);
                    sendResponse({ winningColor: result.answer, steps: result.steps || '' });
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

    // ── Dashboard Result Reporting ────────────────────────────────────────────
    if (request.type === 'REPORT_GAME_RESULT') {
        reportGameResult(request.data);
        return false;
    }

});

// ── Dashboard Result Reporting ────────────────────────────────────────────────
async function reportGameResult(resultData) {
    try {
        const config = await chrome.storage.local.get([
            'dashboardUrl', 'dashboardToken', 'reportResults',
            'reportKahoot', 'reportNaurok', 'reportClasstime', 'reportUniversal',
            'model', 'provider', 'useReasoning', 'reasoningEffort',
            'inputTokens', 'outputTokens', 'inCost', 'outCost'
        ]);

        // Check if reporting is enabled
        if (!config.reportResults) return;
        if (!config.dashboardUrl || !config.dashboardToken) return;

        // Check per-platform toggle
        const platform = resultData.platform || 'unknown';
        const platformKey = `report${platform.charAt(0).toUpperCase() + platform.slice(1)}`;
        if (config[platformKey] === false) return;

        const payload = {
            timestamp: new Date().toISOString(),
            platform: platform,
            quizTitle: resultData.quizTitle || '',
            totalQuestions: resultData.totalQuestions || 0,
            correctAnswers: resultData.correctAnswers || 0,
            wrongAnswers: resultData.wrongAnswers || 0,
            skipped: resultData.skipped || 0,
            solveMode: resultData.solveMode || 'ai',
            model: config.model || '',
            provider: config.provider || 'openrouter',
            inputTokens: resultData.inputTokens || 0,
            outputTokens: resultData.outputTokens || 0,
            estimatedCost: resultData.estimatedCost || 0,
            reasoningEnabled: config.useReasoning || false,
            reasoningEffort: config.reasoningEffort || 'medium'
        };

        const dashUrl = config.dashboardUrl.replace(/\/+$/, '');
        const resp = await fetch(`${dashUrl}/api/results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.dashboardToken}`
            },
            body: JSON.stringify(payload)
        });

        if (resp.ok) {
            writeLog(`📊 Result reported to dashboard: ${platform} — ${resultData.correctAnswers}/${resultData.totalQuestions} correct`);
        } else {
            writeLog(`Dashboard report failed: HTTP ${resp.status}`);
        }
    } catch (err) {
        writeLog(`Dashboard report error: ${err.message}`);
    }
}

// ── Broadcast Helper ──────────────────────────────────────────────────────────
function broadcastToActiveTab(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg);
    });
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

// ── Steps Suffix (appended to all vision prompts at call time) ────────────────
const STEPS_SUFFIX = "\n\nAlso, on the very last line of your response, show the minimal working step(s) that lead to the answer (e.g. '2^2 = 2x2 = 4'). Use ONLY plain ASCII characters. Prefix that line exactly with: STEPS: ";

function parseSteps(rawText) {
    const idx = rawText.lastIndexOf('\nSTEPS:');
    if (idx === -1) {
        // Try without newline prefix (AI might put it at the very start)
        if (rawText.startsWith('STEPS:')) {
            return { answer: '', steps: rawText.slice(6).trim() };
        }
        return { answer: rawText.trim(), steps: '' };
    }
    return {
        answer: rawText.slice(0, idx).trim(),
        steps:  rawText.slice(idx + 7).trim()   // 7 = '\nSTEPS:'.length
    };
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

    // Append STEPS instruction so the AI provides working steps
    promptText += STEPS_SUFFIX;

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
    const rawContent = json.choices[0].message.content.trim();
    const { answer: answerPart, steps } = parseSteps(rawContent);

    // Store the raw answer (without STEPS suffix) for the popup display
    const result = answerPart || rawContent;
    chrome.storage.local.set({ lastAiAnswer: result });

    if (platform === 'classtime') {
        // If it's a grid result (e.g., 1:2; 2:1), return it as is
        if (/^(\s*\d+:\d+\s*;?)+$/.test(result)) {
            return { answer: result, steps };
        }

        // If result is just digits and commas, it's multiple choice
        if (/^[\d,\s]+$/.test(result)) {
            return { answer: result, steps };
        }
        // If it's a single digit (possibly with extra text), try to extract it
        const digitMatch = result.match(/^\s*(\d+)\s*$/);
        if (digitMatch) return { answer: digitMatch[1], steps };
        
        // Otherwise return the whole text (for free text)
        return { answer: result, steps };
    }

    const upperResult = result.toUpperCase();
    if (upperResult.includes('RED'))    return { answer: 'RED',    steps };
    if (upperResult.includes('BLUE'))   return { answer: 'BLUE',   steps };
    if (upperResult.includes('YELLOW')) return { answer: 'YELLOW', steps };
    if (upperResult.includes('GREEN'))  return { answer: 'GREEN',  steps };
    return { answer: result, steps };
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