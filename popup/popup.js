document.addEventListener('DOMContentLoaded', () => {
    // ── Element References ──────────────────────────────────────────────────
    const providerSelect    = document.getElementById('provider');
    const customUrlGroup    = document.getElementById('customUrlGroup');
    const themeColor        = document.getElementById('themeColor');
    const rainbowMode       = document.getElementById('rainbowMode');
    const logArea           = document.getElementById('logArea');
    const clearSystemLogsBtn= document.getElementById('clearSystemLogsBtn');
    const resetTokensBtn    = document.getElementById('resetTokensBtn');
    const useNushPrompt     = document.getElementById('useNushPrompt');
    const chatMessages      = document.getElementById('chatMessages');
    const chatInput         = document.getElementById('chatInput');
    const sendChatBtn       = document.getElementById('sendChatBtn');
    const chatSessionSelect = document.getElementById('chatSessionSelect');
    const newChatBtn        = document.getElementById('newChatBtn');
    const deleteChatBtn     = document.getElementById('deleteChatBtn');

    // ── View Navigation ─────────────────────────────────────────────────────
    const views = {
        settings: document.getElementById('settingsView'),
        prompts:  document.getElementById('promptsView'),
        chat:     document.getElementById('chatView'),
    };
    const navBtns = {
        settings: document.getElementById('navSettingsBtn'),
        prompts:  document.getElementById('navPromptsBtn'),
        chat:     document.getElementById('toggleChatBtn'),
    };

    function showView(name) {
        Object.entries(views).forEach(([k, el]) => {
            el.style.display = k === name ? (k === 'chat' ? 'flex' : 'block') : 'none';
        });
        Object.entries(navBtns).forEach(([k, btn]) => {
            btn.classList.toggle('active', k === name);
        });
        if (name === 'chat') {
            renderChat();
            setTimeout(() => chatInput.focus(), 100);
        }
    }

    navBtns.settings.addEventListener('click', () => showView('settings'));
    navBtns.prompts.addEventListener('click',  () => showView('prompts'));
    navBtns.chat.addEventListener('click',     () => showView('chat'));
    document.getElementById('backToSettings').addEventListener('click', () => showView('settings'));

    // ── Show / hide Custom URL field ────────────────────────────────────────
    providerSelect.addEventListener('change', () => {
        customUrlGroup.style.display = providerSelect.value === 'custom' ? 'block' : 'none';
    });

    // ── Theme Controls ──────────────────────────────────────────────────────
    themeColor.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--accent', e.target.value);
    });

    rainbowMode.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.add('theme-rainbow');
        } else {
            document.body.classList.remove('theme-rainbow');
            document.documentElement.style.setProperty('--accent', themeColor.value);
        }
    });

    // ── Clear Logs ──────────────────────────────────────────────────────────
    clearSystemLogsBtn.addEventListener('click', () => {
        chrome.storage.local.set({ sysLogs: [] }, () => { logArea.value = ''; });
    });

    // ── Reset Token Counter ─────────────────────────────────────────────────
    resetTokensBtn.addEventListener('click', () => {
        chrome.storage.local.set({ inputTokens: 0, outputTokens: 0 }, refreshData);
    });

    // ── Refresh Stats every 1s ──────────────────────────────────────────────
    function refreshData() {
        chrome.storage.local.get(['inputTokens', 'outputTokens', 'inCost', 'outCost', 'lastAiAnswer', 'sysLogs', 'panicMode'], (data) => {
            const inT  = data.inputTokens  || 0;
            const outT = data.outputTokens || 0;
            const inC  = data.inCost  !== undefined ? data.inCost  : 0.50;
            const outC = data.outCost !== undefined ? data.outCost : 3.00;
            const totalSpent = ((inT / 1_000_000) * inC) + ((outT / 1_000_000) * outC);

            document.getElementById('inCount').innerText    = inT.toLocaleString();
            document.getElementById('outCount').innerText   = outT.toLocaleString();
            document.getElementById('totalCost').innerText  = totalSpent.toFixed(4);

            if (data.lastAiAnswer) {
                document.getElementById('lastInterceptText').innerText = data.lastAiAnswer;
            }

            if (logArea) logArea.value = (data.sysLogs || []).join('\n');

            updatePanicUI(data.panicMode);
        });
    }

    setInterval(refreshData, 1000);

    // ── Load Saved Settings ─────────────────────────────────────────────────
    const settingsKeys = [
        'apiKey','model','provider','customUrl','themeColor','rainbowMode',
        'panicMode','styleBold','styleItalic','styleColor','styleFont','styleGhost',
        'cursorStyle','chatSessions','activeChatId','useNushPrompt',
        'inCost','outCost','visibilityBypass','useReasoning','reasoningEffort',
        'blooketMode'
    ];
    chrome.storage.local.get(settingsKeys, (data) => {
        if (data.apiKey)    document.getElementById('apiKey').value  = data.apiKey;
        if (data.model)     document.getElementById('model').value   = data.model;
        if (data.provider)  providerSelect.value = data.provider;
        if (data.customUrl) document.getElementById('customUrl').value = data.customUrl;

        customUrlGroup.style.display = (data.provider === 'custom') ? 'block' : 'none';

        if (data.themeColor) {
            themeColor.value = data.themeColor;
            document.documentElement.style.setProperty('--accent', data.themeColor);
        }
        if (data.rainbowMode) {
            rainbowMode.checked = true;
            document.body.classList.add('theme-rainbow');
        }

        document.getElementById('styleBold').checked   = data.styleBold !== false;
        document.getElementById('styleItalic').checked = data.styleItalic === true;
        document.getElementById('styleColor').checked  = data.styleColor  === true;
        document.getElementById('styleFont').checked   = data.styleFont   === true;
        document.getElementById('styleGhost').checked  = data.styleGhost  === true;
        if (data.cursorStyle) document.getElementById('cursorStyle').value = data.cursorStyle;

        document.getElementById('inCost').value  = data.inCost  !== undefined ? data.inCost  : 0.50;
        document.getElementById('outCost').value = data.outCost !== undefined ? data.outCost : 3.00;

        document.getElementById('visibilityBypass').checked = data.visibilityBypass === true;

        document.getElementById('useReasoning').checked = data.useReasoning === true;
        if (data.reasoningEffort) document.getElementById('reasoningEffort').value = data.reasoningEffort;

        if (data.blooketMode) document.getElementById('blooketMode').value = data.blooketMode;

        useNushPrompt.checked = data.useNushPrompt !== false;

        // Chat sessions — activeChatId stored as number
        chatSessions  = data.chatSessions  || [{ id: Date.now(), title: 'Comms 1', messages: [] }];
        activeChatId  = data.activeChatId  || chatSessions[0].id;
        updateSessionDropdown();

        updatePanicUI(data.panicMode);
        refreshData();
    });

    // ── Load Saved Prompts ──────────────────────────────────────────────────
    const promptKeys = ['promptKahoot','promptNaurok','promptClasstime','promptSniper','promptCrop','promptChat'];
    chrome.storage.local.get(promptKeys, (data) => {
        promptKeys.forEach(k => {
            const el = document.getElementById(k);
            if (el) el.value = data[k] || '';
        });
    });

    // ── Save Prompts ────────────────────────────────────────────────────────
    document.getElementById('savePrompts').addEventListener('click', () => {
        const toSave = {};
        promptKeys.forEach(k => {
            const el = document.getElementById(k);
            if (el) toSave[k] = el.value.trim();
        });
        chrome.storage.local.set(toSave, () => {
            const btn = document.getElementById('savePrompts');
            btn.innerText = '✓ Prompts Saved';
            setTimeout(() => { btn.innerText = 'Save Prompts'; }, 1500);
        });
    });

    document.getElementById('resetPrompts').addEventListener('click', () => {
        if (!confirm('Reset all prompts to built-in defaults?')) return;
        const toReset = {};
        promptKeys.forEach(k => { toReset[k] = ''; });
        chrome.storage.local.set(toReset, () => {
            promptKeys.forEach(k => {
                const el = document.getElementById(k);
                if (el) el.value = '';
            });
        });
    });

    // ── Panic Button ────────────────────────────────────────────────────────
    function updatePanicUI(isPanic) {
        const btn = document.getElementById('panicBtn');
        if (isPanic) {
            btn.innerText = 'PANIC: ON (MUTED)';
            btn.style.background = '#880000';
        } else {
            btn.innerText = 'PANIC: OFF (ACTIVE)';
            btn.style.background = '#cc0000';
        }
    }

    document.getElementById('panicBtn').addEventListener('click', () => {
        chrome.storage.local.get(['panicMode'], (data) => {
            const newMode = !data.panicMode;
            chrome.storage.local.set({ panicMode: newMode }, () => {
                updatePanicUI(newMode);
                if (newMode) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRUB_EVIDENCE' });
                    });
                }
            });
        });
    });

    // ── Save Configuration ──────────────────────────────────────────────────
    document.getElementById('save').addEventListener('click', () => {
        chrome.storage.local.set({
            apiKey:      document.getElementById('apiKey').value.trim(),
            model:       document.getElementById('model').value.trim() || 'google/gemini-2.5-flash',
            provider:    providerSelect.value,
            customUrl:   document.getElementById('customUrl').value.trim(),
            inCost:      parseFloat(document.getElementById('inCost').value)  || 0,
            outCost:     parseFloat(document.getElementById('outCost').value) || 0,
            themeColor:  themeColor.value,
            rainbowMode: rainbowMode.checked,
            styleBold:   document.getElementById('styleBold').checked,
            styleItalic: document.getElementById('styleItalic').checked,
            styleColor:  document.getElementById('styleColor').checked,
            styleFont:   document.getElementById('styleFont').checked,
            styleGhost:  document.getElementById('styleGhost').checked,
            cursorStyle: document.getElementById('cursorStyle').value,
            visibilityBypass: document.getElementById('visibilityBypass').checked,
            useReasoning:     document.getElementById('useReasoning').checked,
            reasoningEffort:  document.getElementById('reasoningEffort').value,
            blooketMode:      document.getElementById('blooketMode').value,
        }, () => {
            const btn = document.getElementById('save');
            btn.innerText = '✓ System Saved';
            setTimeout(() => { btn.innerText = 'Save Configuration'; }, 1500);
        });
    });

    // ── Test Connection ──────────────────────────────────────────────────────
    document.getElementById('testConnectionBtn').addEventListener('click', async () => {
        const btn = document.getElementById('testConnectionBtn');
        btn.innerText = 'Testing...';
        btn.disabled = true;
        try {
            const data = await chrome.storage.local.get(['apiKey', 'model', 'provider', 'customUrl']);
            if (!data.apiKey) throw new Error('API Key not set');

            const endpoint = buildEndpoint(data.provider, data.customUrl);
            const headers  = buildHeaders(data.apiKey, data.provider);

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: data.model || 'google/gemini-2.5-flash',
                    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
                    temperature: 0,
                    max_tokens: 5
                })
            });

            if (!resp.ok) {
                const errJson = await resp.json().catch(() => ({}));
                throw new Error(errJson.error?.message || `HTTP ${resp.status}`);
            }
            const json = await resp.json();
            if (!json.choices?.[0]) throw new Error(json.error?.message || 'Invalid response');

            btn.innerText = '✓ Connected — ' + json.choices[0].message.content.trim();
            btn.style.borderColor = 'var(--accent)';
        } catch (err) {
            btn.innerText = '✗ ' + err.message;
            btn.style.borderColor = '#ff3333';
        }
        btn.disabled = false;
        setTimeout(() => {
            btn.innerText = 'Test Connection';
            btn.style.borderColor = '';
        }, 4000);
    });

    // ── Clear Blooket Memory ─────────────────────────────────────────────────
    document.getElementById('clearBlooketMemoryBtn').addEventListener('click', () => {
        chrome.storage.local.set({ blooketMemory: {} }, () => {
            const btn = document.getElementById('clearBlooketMemoryBtn');
            const originalText = btn.innerText;
            btn.innerText = '✓ Memory Cleared';
            setTimeout(() => { btn.innerText = originalText; }, 1500);
        });
    });

    // ── Multi-Chat Engine ────────────────────────────────────────────────────
    let chatSessions = [];
    let activeChatId = null;

    function updateSessionDropdown() {
        chatSessionSelect.innerHTML = '';
        chatSessions.forEach((s, idx) => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.title || `Comms ${idx + 1}`;
            if (s.id === activeChatId) opt.selected = true;
            chatSessionSelect.appendChild(opt);
        });
    }

    function getActiveSession() {
        return chatSessions.find(s => s.id === activeChatId) || chatSessions[0];
    }

    function saveChats() {
        chrome.storage.local.set({
            chatSessions: chatSessions,
            activeChatId: activeChatId,
            useNushPrompt: useNushPrompt.checked
        });
    }

    chatSessionSelect.addEventListener('change', (e) => {
        // IDs are numbers; parseInt ensures type consistency
        activeChatId = parseInt(e.target.value, 10);
        saveChats();
        renderChat();
    });

    newChatBtn.addEventListener('click', () => {
        const newId = Date.now();
        chatSessions.push({ id: newId, title: `Comms ${chatSessions.length + 1}`, messages: [] });
        activeChatId = newId;
        updateSessionDropdown();
        saveChats();
        renderChat();
    });

    deleteChatBtn.addEventListener('click', () => {
        chatSessions = chatSessions.filter(s => s.id !== activeChatId);
        if (chatSessions.length === 0) {
            chatSessions.push({ id: Date.now(), title: 'Comms 1', messages: [] });
        }
        activeChatId = chatSessions[0].id;
        updateSessionDropdown();
        saveChats();
        renderChat();
    });

    useNushPrompt.addEventListener('change', saveChats);

    // ── Message Renderer ────────────────────────────────────────────────────
    function parseMessage(text) {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')  // XSS-safe
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/\$\$(.*?)\$\$/g, '<code style="color:var(--accent);background:#000;padding:2px;">$1</code>')
            .replace(/\$(.*?)\$/g, '<code style="color:var(--accent);background:#000;padding:2px;">$1</code>')
            .replace(/\\sqrt\{(.*?)\}/g, '√($1)')
            .replace(/\n/g, '<br>');
        return html;
    }

    function renderChat() {
        chatMessages.innerHTML = '';
        const session = getActiveSession();

        if (!session || session.messages.length === 0) {
            chatMessages.innerHTML = '<div style="color:#555;text-align:center;margin-top:50px;">Comms channel secure.<br>Awaiting transmission.</div>';
            return;
        }

        session.messages.forEach(msg => {
            if (msg.role === 'system') return;
            const div = document.createElement('div');
            div.className = `msg ${msg.role === 'user' ? 'user' : 'ai'}`;

            if (Array.isArray(msg.content)) {
                let inner = '';
                msg.content.forEach(part => {
                    if (part.type === 'text') inner += parseMessage(part.text) + '<br>';
                    if (part.type === 'image_url') inner += `<img src="${part.image_url.url}" alt="image">`;
                });
                div.innerHTML = inner;
            } else {
                div.innerHTML = parseMessage(msg.content);
            }

            if (msg.telemetry) {
                const telDiv = document.createElement('div');
                telDiv.className = 'msg-telemetry';
                telDiv.innerText = `${msg.telemetry.in} In | ${msg.telemetry.out} Out | $${msg.telemetry.cost}`;
                div.appendChild(telDiv);
            }

            chatMessages.appendChild(div);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ── Image Paste in Chat ─────────────────────────────────────────────────
    chatInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const session = getActiveSession();
                    await injectSystemPromptIfNeeded(session);
                    session.messages.push({
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Please analyze this image and answer the question shown:' },
                            { type: 'image_url', image_url: { url: event.target.result } }
                        ]
                    });
                    saveChats();
                    renderChat();
                    executeApiCall(session);
                };
                reader.readAsDataURL(blob);
                e.preventDefault();
                break;
            }
        }
    });

    // ── Send Message ────────────────────────────────────────────────────────
    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        sendChatBtn.disabled = true;

        const session = getActiveSession();
        await injectSystemPromptIfNeeded(session);
        session.messages.push({ role: 'user', content: text });
        saveChats();
        renderChat();
        await executeApiCall(session);
        sendChatBtn.disabled = false;
    }

    function injectSystemPromptIfNeeded(session) {
        return new Promise((resolve) => {
            if (session.messages.length > 0 || !useNushPrompt.checked) {
                resolve();
                return;
            }
            chrome.storage.local.get(['promptChat'], (data) => {
                const defaultPrompt = 'You are a helper for an 8th-grade student in Ukraine (НУШ). Reply ONLY in Ukrainian. Be brief.';
                session.messages.push({ role: 'system', content: data.promptChat || defaultPrompt });
                resolve();
            });
        });
    }

    // ── API Call ─────────────────────────────────────────────────────────────
    async function executeApiCall(session) {
        const loadDiv = document.createElement('div');
        loadDiv.className = 'msg ai';
        loadDiv.innerHTML = '<span style="color:#555">Thinking...</span>';
        chatMessages.appendChild(loadDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const data = await chrome.storage.local.get(['apiKey', 'model', 'provider', 'customUrl', 'inCost', 'outCost', 'useReasoning', 'reasoningEffort']);
            if (!data.apiKey) throw new Error('API Key not set. Configure it in Settings.');

            const endpoint = buildEndpoint(data.provider, data.customUrl);
            const headers  = buildHeaders(data.apiKey, data.provider);

            let payload = {
                model:       data.model || 'google/gemini-2.5-flash',
                messages:    session.messages,
                temperature: 0.5
            };

            // Apply provider-aware reasoning
            if (data.useReasoning) {
                const effort = data.reasoningEffort || 'medium';
                const provider = data.provider || 'openrouter';
                if (provider === 'openai') {
                    payload.reasoning_effort = effort;
                } else if (provider !== 'custom') {
                    payload.reasoning = { effort: effort, exclude: true };
                }
            }

            const resp = await fetch(endpoint, {
                method:  'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errJson = await resp.json().catch(() => ({}));
                throw new Error(errJson.error?.message || `HTTP ${resp.status}`);
            }

            const json = await resp.json();
            if (!json.choices || !json.choices[0]) throw new Error(json.error?.message || 'Invalid API response');

            let telemetryData = null;
            if (json.usage) {
                const inT  = json.usage.prompt_tokens     || 0;
                const outT = json.usage.completion_tokens || 0;
                const inC  = data.inCost  !== undefined ? data.inCost  : 0.50;
                const outC = data.outCost !== undefined ? data.outCost : 3.00;
                telemetryData = {
                    in:   inT,
                    out:  outT,
                    cost: (((inT / 1_000_000) * inC) + ((outT / 1_000_000) * outC)).toFixed(5)
                };
                // Accumulate global token counts
                chrome.storage.local.get(['inputTokens','outputTokens'], (tData) => {
                    chrome.storage.local.set({
                        inputTokens:  (tData.inputTokens  || 0) + inT,
                        outputTokens: (tData.outputTokens || 0) + outT
                    });
                });
            }

            session.messages.push({
                role:      'assistant',
                content:   json.choices[0].message.content.trim(),
                telemetry: telemetryData
            });
            saveChats();
            renderChat();
        } catch (err) {
            session.messages.pop();
            saveChats();
            loadDiv.remove();
            const errDiv = document.createElement('div');
            errDiv.className = 'msg ai';
            errDiv.innerHTML = `<span style="color:#ff5555">⚠ ${err.message}</span>`;
            chatMessages.appendChild(errDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    sendChatBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // ── Shared API Helpers ──────────────────────────────────────────────────
    function buildEndpoint(provider, customUrl) {
        if (provider === 'openai')  return 'https://api.openai.com/v1/chat/completions';
        if (provider === 'custom' && customUrl) return customUrl;
        return 'https://openrouter.ai/api/v1/chat/completions';
    }

    function buildHeaders(apiKey, provider) {
        const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        if (provider === 'openrouter') h['HTTP-Referer'] = 'https://kahoot-win.v';
        return h;
    }
});