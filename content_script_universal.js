// ── Sniper Toast Notification ─────────────────────────────────────────────────
let sniperToast = null;

function parseSniperMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')  // XSS-safe
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')                               // **bold**
        .replace(/\*(.*?)\*/g, '<i>$1</i>')                                    // *italic*
        .replace(/\$\$(.*?)\$\$/g, '<code class="sniper-math">$1</code>')      // $$math$$
        .replace(/\$(.*?)\$/g, '<code class="sniper-math">$1</code>')          // $math$
        .replace(/`(.*?)`/g, '<code class="sniper-code">$1</code>')            // `code`
        .replace(/\n/g, '<br>');                                                // newlines
}

function showSniperToast(msg, status = 'success') {
    if (sniperToast) sniperToast.remove();

    sniperToast = document.createElement('div');
    sniperToast.id = 'ai-sniper-toast';
    sniperToast.className = status === 'error' ? 'ai-error' : (status === 'loading' ? 'ai-loading' : '');

    if (status === 'loading') {
        sniperToast.innerText = msg;
    } else {
        sniperToast.innerHTML = parseSniperMarkdown(msg);
    }

    sniperToast.addEventListener('click', () => {
        if (sniperToast) { sniperToast.remove(); sniperToast = null; }
    });

    document.body.appendChild(sniperToast);

    if (status !== 'loading') {
        setTimeout(() => {
            if (sniperToast) { sniperToast.remove(); sniperToast = null; }
        }, 20000);
    }
}

// ── Text Sniper (Alt+S) ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyS') {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            showSniperToast('Target acquired. Processing...', 'loading');
            chrome.runtime.sendMessage({ type: 'TEXT_SNIPER', text: selectedText });
        }
    }
});

// ── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'SNIPER_RESULT') {
        showSniperToast(request.result, 'success');
    } else if (request.type === 'SNIPER_ERROR') {
        showSniperToast(`Error: ${request.error}`, 'error');
    }
});

// ── Area Image Sniper (Alt+C) ─────────────────────────────────────────────────
let isCropping = false;
let startX, startY, overlayBox, selectorBox;

document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyC' && !document.getElementById('sniper-overlay')) {
        initAreaSniper();
    }
});

function initAreaSniper() {
    showSniperToast('Crosshair active. Drag to capture.', 'loading');

    overlayBox = document.createElement('div');
    overlayBox.id = 'sniper-overlay';

    selectorBox = document.createElement('div');
    selectorBox.id = 'sniper-selector';
    overlayBox.appendChild(selectorBox);
    document.body.appendChild(overlayBox);

    overlayBox.addEventListener('mousedown', (e) => {
        isCropping = true;
        startX = e.clientX;
        startY = e.clientY;
        selectorBox.style.cssText = `left:${startX}px;top:${startY}px;width:0;height:0;`;
    });

    overlayBox.addEventListener('mousemove', (e) => {
        if (!isCropping) return;
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        selectorBox.style.width  = w + 'px';
        selectorBox.style.height = h + 'px';
        selectorBox.style.left   = Math.min(e.clientX, startX) + 'px';
        selectorBox.style.top    = Math.min(e.clientY, startY) + 'px';
    });

    overlayBox.addEventListener('mouseup', (e) => {
        isCropping = false;
        const rect = selectorBox.getBoundingClientRect();
        overlayBox.remove();

        if (rect.width > 15 && rect.height > 15) {
            showSniperToast('Crop secured. Processing image...', 'loading');
            const dpr = window.devicePixelRatio || 1;
            chrome.runtime.sendMessage({
                type:   'CROP_SNIPER',
                coords: {
                    x: rect.left * dpr,
                    y: rect.top  * dpr,
                    w: rect.width  * dpr,
                    h: rect.height * dpr
                }
            });
        } else {
            showSniperToast('Crop too small, aborted.', 'error');
        }
    });

    // Escape cancels crop
    document.addEventListener('keydown', function cancelCrop(e) {
        if (e.code === 'Escape' && document.getElementById('sniper-overlay')) {
            overlayBox.remove();
            isCropping = false;
            showSniperToast('Crop cancelled.', 'error');
            document.removeEventListener('keydown', cancelCrop);
        }
    });
}

// ── Panic Hotkey (Ctrl+Shift+X) ───────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') {
        chrome.runtime.sendMessage({ type: 'TOGGLE_PANIC_FROM_PAGE' });
    }
});

// ── Tab Visibility Bypass ─────────────────────────────────────────────────────
(function initVisibilityBypass() {
    chrome.storage.local.get(['visibilityBypass'], (data) => {
        if (!data.visibilityBypass) return;

        // Override document.visibilityState to always appear visible
        try {
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true });
        } catch (e) { /* already defined, skip */ }

        // Intercept and suppress visibilitychange, blur, and focus-loss events
        const suppress = (e) => { e.stopImmediatePropagation(); };
        document.addEventListener('visibilitychange', suppress, true);
        window.addEventListener('blur',              suppress, true);
        window.addEventListener('focusout',          suppress, true);

        // Re-dispatch focus so page thinks it's always focused
        window.addEventListener('blur', () => {
            window.dispatchEvent(new Event('focus'));
        }, true);
    });
})();