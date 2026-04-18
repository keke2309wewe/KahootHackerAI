function writeLog(msg) {
    chrome.storage.local.get(['sysLogs'], (data) => {
        let logs = data.sysLogs || [];
        let time = new Date().toLocaleTimeString();
        logs.unshift(`[${time}] ${msg}`);
        if (logs.length > 50) logs.pop(); 
        chrome.storage.local.set({ sysLogs: logs });
    });
}

writeLog("V3.4 ENGINE START.");

chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-panic") {
        chrome.storage.local.get(['panicMode'], (data) => {
            const newMode = !data.panicMode;
            writeLog(`Hotkey pressed. Panic Mode: ${newMode}`);
            chrome.storage.local.set({ panicMode: newMode }, () => {
                if (newMode) {
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "SCRUB_EVIDENCE" });
                    });
                }
            });
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "LOG") {
        writeLog(request.message);
        return false;
    }

    if (request.type === "REQUEST_SCREENSHOT_ANALYSIS") {
        writeLog(`Taking screenshot for ${request.platform || "default"}...`);
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 50 }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                writeLog("Screenshot failed: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "No data"));
                sendResponse({ error: "Screenshot failed" });
                return;
            }

            writeLog("Screenshot acquired. Asking AI...");
            analyzeImage(dataUrl, request.platform).then(answer => {
                writeLog(`AI says: ${answer}`);
                sendResponse({ winningColor: answer });
            }).catch(err => {
                writeLog(`API Error: ${err.message}`);
                sendResponse({ error: err.message });
            });
        });
        return true; 
    }
});

async function analyzeImage(base64Image, platform) {
    const data = await chrome.storage.local.get(["apiKey", "model", "provider", "customUrl"]);
    if (!data.apiKey) throw new Error("API Key missing");

    const model = data.model || "google/gemini-2.5-flash"; 
    const provider = data.provider || "openrouter";
    let endpoint = "https://openrouter.ai/api/v1/chat/completions";
    let headers = {
        "Authorization": `Bearer ${data.apiKey}`,
        "Content-Type": "application/json"
    };

    if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://kahoot-win.v";
    } else if (provider === "openai") {
        endpoint = "https://api.openai.com/v1/chat/completions";
    } else if (provider === "custom" && data.customUrl) {
        endpoint = data.customUrl;
    }

    let promptText = "";
    if (platform === "classtime") {
        promptText = "Look at this screenshot of a quiz. Read the question and the available text options. Determine the correct answer. Output ONLY the number of the correct option, counting from the top down (1 for the first option, 2 for the second, etc.). Your response must be exactly one digit (e.g., 1, 2, 3, or 4).";
    } else {
        promptText = "You are a Kahoot player. Look at this screenshot of a Kahoot game. Read the question and the four answers provided in the colored boxes (Red Triangle, Blue Diamond, Yellow Circle, Green Square). Determine the correct answer. Output ONLY the color of the correct answer box. Your response must be exactly one word: RED, BLUE, YELLOW, or GREEN.";
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": promptText },
                        { "type": "image_url", "image_url": { "url": base64Image } }
                    ]
                }
            ],
            "temperature": 0.0
        })
    });

    const json = await response.json();
    if (!json.choices) throw new Error(json.error ? json.error.message : "API Limit or Unknown Error");
    
    if (json.usage) {
        const inTokens = json.usage.prompt_tokens || 0;
        const outTokens = json.usage.completion_tokens || 0;
        chrome.storage.local.get(['inputTokens', 'outputTokens'], (tData) => {
            chrome.storage.local.set({ 
                inputTokens: (tData.inputTokens || 0) + inTokens,
                outputTokens: (tData.outputTokens || 0) + outTokens
            });
        });
    }
    
    let result = json.choices[0].message.content.trim().toUpperCase();
    
    if (platform === "classtime") {
        let match = result.match(/\d+/);
        return match ? match[0] : result;
    } else {
        if(result.includes("RED")) return "RED";
        if(result.includes("BLUE")) return "BLUE";
        if(result.includes("YELLOW")) return "YELLOW";
        if(result.includes("GREEN")) return "GREEN";
        return result;
    }
}

// --- TEXT SNIPER MODULE ---

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "text-sniper",
        title: "Snipe Text with AI",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "text-sniper" && info.selectionText) {
        chrome.tabs.sendMessage(tab.id, { type: "SNIPER_RESULT", result: "Target acquired. Processing..." });
        processTextSniper(info.selectionText, tab.id);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "TEXT_SNIPER") {
        processTextSniper(request.text, sender.tab.id);
    }
});

async function processTextSniper(text, tabId) {
    writeLog(`Sniping text: ${text.substring(0, 30)}...`);
    try {
        const answer = await analyzeTextOnly(text);
        chrome.tabs.sendMessage(tabId, { type: "SNIPER_RESULT", result: answer });
        writeLog("Snipe successful.");
    } catch (err) {
        chrome.tabs.sendMessage(tabId, { type: "SNIPER_ERROR", error: err.message });
        writeLog(`Snipe Error: ${err.message}`);
    }
}

async function analyzeTextOnly(textQuery) {
    const data = await chrome.storage.local.get(["apiKey", "model", "provider", "customUrl"]);
    if (!data.apiKey) throw new Error("API Key missing");

    const model = data.model || "google/gemini-2.5-flash"; 
    const provider = data.provider || "openrouter";
    let endpoint = "https://openrouter.ai/api/v1/chat/completions";
    let headers = {
        "Authorization": `Bearer ${data.apiKey}`,
        "Content-Type": "application/json"
    };

    if (provider === "openrouter") headers["HTTP-Referer"] = "https://kahoot-win.v";
    else if (provider === "openai") endpoint = "https://api.openai.com/v1/chat/completions";
    else if (provider === "custom" && data.customUrl) endpoint = data.customUrl;

    const promptText = "You are a helper for an 8th-grade student in Ukraine (НУШ). Reply ONLY in Ukrainian. If it is a general question, give the shortest possible correct answer. If it is a math, algebra, or physics problem, provide the clear step-by-step solution so it can be copied into a notebook. Use '-' instead of long dashes. Do not use markdown formatting like bolding or headers, just plain text.";

    const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "model": model,
            "messages": [
                { "role": "system", "content": promptText },
                { "role": "user", "content": textQuery }
            ],
            "temperature": 0.2
        })
    });

    const json = await response.json();
    if (!json.choices) throw new Error(json.error ? json.error.message : "API Limit Error");
    
    // Update Token Ledger
    if (json.usage) {
        chrome.storage.local.get(['inputTokens', 'outputTokens'], (tData) => {
            chrome.storage.local.set({ 
                inputTokens: (tData.inputTokens || 0) + (json.usage.prompt_tokens || 0),
                outputTokens: (tData.outputTokens || 0) + (json.usage.completion_tokens || 0)
            });
        });
    }
    
    return json.choices[0].message.content.trim();
}

// --- AREA CROP SNIPER MODULE ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CROP_SNIPER") {
        processCropSniper(request.coords, sender.tab.id);
    }
});

async function processCropSniper(coords, tabId) {
    writeLog("Taking full screen capture for cropping...");
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 100 }, async (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
            chrome.tabs.sendMessage(tabId, { type: "SNIPER_ERROR", error: "Failed to capture screen" });
            return;
        }

        try {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            const canvas = new OffscreenCanvas(coords.w, coords.h);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, coords.x, coords.y, coords.w, coords.h, 0, 0, coords.w, coords.h);

            const blobCrop = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Crop = reader.result;
                writeLog("Crop processed. Asking AI vision model...");
                try {
                    const answer = await analyzeCroppedImage(base64Crop);
                    chrome.tabs.sendMessage(tabId, { type: "SNIPER_RESULT", result: answer });
                } catch (err) {
                    chrome.tabs.sendMessage(tabId, { type: "SNIPER_ERROR", error: err.message });
                }
            };
            reader.readAsDataURL(blobCrop);
        } catch (err) {
            chrome.tabs.sendMessage(tabId, { type: "SNIPER_ERROR", error: err.message });
        }
    });
}

async function analyzeCroppedImage(base64Crop) {
    const data = await chrome.storage.local.get(["apiKey", "model", "provider", "customUrl"]);
    if (!data.apiKey) throw new Error("API Key missing");

    const model = data.model || "google/gemini-2.5-flash"; 
    const provider = data.provider || "openrouter";
    let endpoint = "https://openrouter.ai/api/v1/chat/completions";
    let headers = { "Authorization": `Bearer ${data.apiKey}`, "Content-Type": "application/json" };

    if (provider === "openrouter") headers["HTTP-Referer"] = "https://kahoot-win.v";
    else if (provider === "openai") endpoint = "https://api.openai.com/v1/chat/completions";
    else if (provider === "custom" && data.customUrl) endpoint = data.customUrl;

    const promptText = "Look at this cropped image from a test or assignment. It may contain a math problem, a graph, or text. Solve the problem or answer the question shown. Give ONLY the final answer or the essential steps if it's math. Keep it extremely concise. Reply in Ukrainian.";

    const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": promptText },
                        { "type": "image_url", "image_url": { "url": base64Crop } }
                    ]
                }
            ],
            "temperature": 0.0
        })
    });

    const json = await response.json();
    if (!json.choices) throw new Error(json.error ? json.error.message : "API Limit Error");
    
    if (json.usage) {
        chrome.storage.local.get(['inputTokens', 'outputTokens'], (tData) => {
            chrome.storage.local.set({ 
                inputTokens: (tData.inputTokens || 0) + (json.usage.prompt_tokens || 0),
                outputTokens: (tData.outputTokens || 0) + (json.usage.completion_tokens || 0)
            });
        });
    }
    return json.choices[0].message.content.trim();
}