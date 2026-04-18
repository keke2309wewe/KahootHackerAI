document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('provider');
    const customUrlGroup = document.getElementById('customUrlGroup');
    const logArea = document.getElementById('logArea');

    providerSelect.addEventListener('change', (e) => {
        customUrlGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    function refreshData() {
        chrome.storage.local.get(['sysLogs', 'inputTokens', 'outputTokens', 'inCost', 'outCost'], (data) => {
            if (logArea) logArea.value = (data.sysLogs || []).join('\n');
            
            const inT = data.inputTokens || 0;
            const outT = data.outputTokens || 0;
            const inC = data.inCost !== undefined ? data.inCost : 0.30;
            const outC = data.outCost !== undefined ? data.outCost : 2.50;
            
            const totalSpent = ((inT / 1000000) * inC) + ((outT / 1000000) * outC);
            
            document.getElementById('inCount').innerText = inT;
            document.getElementById('outCount').innerText = outT;
            document.getElementById('totalCost').innerText = totalSpent.toFixed(5);
        });
    }

    chrome.storage.local.get(['apiKey', 'model', 'provider', 'customUrl', 'panicMode', 'inCost', 'outCost', 'styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        if (data.model) document.getElementById('model').value = data.model;
        if (data.provider) {
            providerSelect.value = data.provider;
            if (data.provider === 'custom') customUrlGroup.style.display = 'block';
        }
        if (data.customUrl) document.getElementById('customUrl').value = data.customUrl;
        if (data.inCost !== undefined) document.getElementById('inCost').value = data.inCost;
        if (data.outCost !== undefined) document.getElementById('outCost').value = data.outCost;
        
        document.getElementById('styleBold').checked = data.styleBold !== false; 
        document.getElementById('styleItalic').checked = data.styleItalic === true;
        document.getElementById('styleColor').checked = data.styleColor === true;
        document.getElementById('styleFont').checked = data.styleFont === true;
        document.getElementById('styleGhost').checked = data.styleGhost === true;

        updatePanicUI(data.panicMode);
        refreshData();
    });

    setInterval(refreshData, 1000); 
});

function updatePanicUI(isPanic) {
    const btn = document.getElementById('panicBtn');
    if (isPanic) {
        btn.innerText = 'PANIC: ON (AI MUTED)';
        btn.style.background = '#880000';
    } else {
        btn.innerText = 'PANIC: OFF (AI ACTIVE)';
        btn.style.background = '#ff0000';
    }
}

document.getElementById('panicBtn').addEventListener('click', () => {
    chrome.storage.local.get(['panicMode'], (data) => {
        const newMode = !data.panicMode;
        chrome.storage.local.set({ panicMode: newMode }, () => {
            updatePanicUI(newMode);
            if (newMode) {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: "SCRUB_EVIDENCE" }, () => {
                            if (chrome.runtime.lastError) {}
                        });
                    }
                });
            }
        });
    });
});

document.getElementById('clearLogsBtn').addEventListener('click', () => {
    chrome.storage.local.set({ sysLogs: [], inputTokens: 0, outputTokens: 0 }, () => {
        document.getElementById('logArea').value = '';
        document.getElementById('inCount').innerText = '0';
        document.getElementById('outCount').innerText = '0';
        document.getElementById('totalCost').innerText = '0.00000';
    });
});

document.getElementById('save').addEventListener('click', () => {
    const key = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim() || 'google/gemini-2.5-flash';
    const provider = document.getElementById('provider').value;
    const customUrl = document.getElementById('customUrl').value.trim();
    const inCost = parseFloat(document.getElementById('inCost').value) || 0.30;
    const outCost = parseFloat(document.getElementById('outCost').value) || 2.50;
    
    const styleBold = document.getElementById('styleBold').checked;
    const styleItalic = document.getElementById('styleItalic').checked;
    const styleColor = document.getElementById('styleColor').checked;
    const styleFont = document.getElementById('styleFont').checked;
    const styleGhost = document.getElementById('styleGhost').checked;

    chrome.storage.local.set({ 
        apiKey: key, model: model, provider: provider, customUrl: customUrl, inCost: inCost, outCost: outCost,
        styleBold: styleBold, styleItalic: styleItalic, styleColor: styleColor, styleFont: styleFont, styleGhost: styleGhost
    }, () => {
        const btn = document.getElementById('save');
        btn.innerText = 'Settings Saved!';
        btn.style.background = '#fff';
        setTimeout(() => {
            btn.innerText = 'Save Settings';
            btn.style.background = '#00ff00';
        }, 2000);
    });
});