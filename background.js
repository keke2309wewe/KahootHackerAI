// ── Logging ──────────────────────────────────────────────────────────────────
function writeLog(msg) {
    chrome.storage.local.get(['sysLogs'], (data) => {
        const logs = data.sysLogs || [];
        logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (logs.length > 100) logs.length = 100;
        chrome.storage.local.set({ sysLogs: logs });
    });
}

writeLog("V4.3 ENGINE START.");

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
    if (data.useReasoning) {
        payload.reasoning = { effort: data.reasoningEffort || 'medium', exclude: true };
    }
    return payload;
}

function accumulateTokens(usage) {
    if (!usage) return;
    const inT  = usage.prompt_tokens     || 0;
    const outT = usage.completion_tokens || 0;
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
    promptClasstime:"Look at this screenshot of a quiz. Read the question and the available text options. Determine the correct answer. Output ONLY the number of the correct option, counting from the top down (1 for the first option, 2 for the second, etc.). Your response must be exactly one digit (e.g., 1, 2, 3, or 4).",
    promptSniper:   "You are a helper for an 8th-grade student in Ukraine (НУШ). Reply ONLY in Ukrainian. If it is a general question, give the shortest possible correct answer. If it is a math, algebra, or physics problem, provide the clear step-by-step solution so it can be copied into a notebook. Use '-' instead of long dashes. Do not use markdown formatting like bolding or headers, just plain text.",
    promptCrop:     "Look at this cropped image from a test or assignment. It may contain a math problem, a graph, or text. Solve the problem or answer the question shown. Give ONLY the final answer or the essential steps if it's math. Keep it extremely concise. Reply in Ukrainian.",
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
            analyzeImage(dataUrl, request.platform)
                .then(answer => {
                    writeLog(`AI answer: ${answer}`);
                    sendResponse({ winningColor: answer });
                })
                .catch(err => {
                    writeLog(`API Error: ${err.message}`);
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
});

// ── Broadcast Helper ──────────────────────────────────────────────────────────
function broadcastToActiveTab(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg);
    });
}

// ── Image Analysis (Kahoot / Classtime / Naurok) ──────────────────────────────
async function analyzeImage(base64Image, platform) {
    const data = await getApiConfig();
    if (!data.apiKey) throw new Error('API Key missing');

    const promptText = platform === 'classtime'
        ? await getPrompt('promptClasstime')
        : await getPrompt('promptKahoot');

    const payload = applyReasoning({
        model:       data.model || 'google/gemini-2.5-flash',
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
    let result = json.choices[0].message.content.trim().toUpperCase();
    chrome.storage.local.set({ lastAiAnswer: result });

    if (platform === 'classtime') {
        const match = result.match(/\d+/);
        return match ? match[0] : result;
    }
    if (result.includes('RED'))    return 'RED';
    if (result.includes('BLUE'))   return 'BLUE';
    if (result.includes('YELLOW')) return 'YELLOW';
    if (result.includes('GREEN'))  return 'GREEN';
    return result;
}

// ── Text Sniper ───────────────────────────────────────────────────────────────
async function processTextSniper(text, tabId) {
    writeLog(`Text snipe: "${text.substring(0, 40)}..."`);
    try {
        const answer = await analyzeTextOnly(text);
        chrome.tabs.sendMessage(tabId, { type: 'SNIPER_RESULT', result: answer });
        writeLog('Text snipe successful.');
    } catch (err) {
        chrome.tabs.sendMessage(tabId, { type: 'SNIPER_ERROR', error: err.message });
        writeLog(`Text snipe error: ${err.message}`);
    }
}

async function analyzeTextOnly(textQuery) {
    const data = await getApiConfig();
    if (!data.apiKey) throw new Error('API Key missing');

    const promptText = await getPrompt('promptSniper');

    const payload = applyReasoning({
        model:       data.model || 'google/gemini-2.5-flash',
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
        model:       data.model || 'google/gemini-2.5-flash',
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