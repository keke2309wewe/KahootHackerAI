let sniperToast = null;

function showSniperToast(msg, status = "success") {
    if (sniperToast) sniperToast.remove();

    sniperToast = document.createElement('div');
    sniperToast.id = 'ai-sniper-toast';
    sniperToast.className = status === 'error' ? 'ai-error' : (status === 'loading' ? 'ai-loading' : '');
    sniperToast.innerText = msg;

    // Click to dismiss
    sniperToast.addEventListener('click', () => {
        sniperToast.remove();
        sniperToast = null;
    });

    document.body.appendChild(sniperToast);

    // Auto-destruct after 20 seconds unless it's a loading message
    if (status !== 'loading') {
        setTimeout(() => {
            if (sniperToast) {
                sniperToast.remove();
                sniperToast = null;
            }
        }, 20000);
    }
}

// Listen for Alt+S to snipe highlighted text
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyS') {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            showSniperToast("Target acquired. Processing...", "loading");
            chrome.runtime.sendMessage({ type: "TEXT_SNIPER", text: selectedText });
        }
    }
});

// Listen for response from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SNIPER_RESULT") {
        showSniperToast(request.result, "success");
    } else if (request.type === "SNIPER_ERROR") {
        showSniperToast(`Error: ${request.error}`, "error");
    }
});

// --- AREA IMAGE SNIPER (ALT+C) ---
let isCropping = false;
let startX, startY, overlayBox, selectorBox;

document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyC' && !document.getElementById('sniper-overlay')) {
        initAreaSniper();
    }
});

function initAreaSniper() {
    showSniperToast("Crosshair active. Drag to capture.", "loading");
    
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
        selectorBox.style.left = startX + 'px';
        selectorBox.style.top = startY + 'px';
        selectorBox.style.width = '0px';
        selectorBox.style.height = '0px';
    });

    overlayBox.addEventListener('mousemove', (e) => {
        if (!isCropping) return;
        const currentX = e.clientX;
        const currentY = e.clientY;
        selectorBox.style.width = Math.abs(currentX - startX) + 'px';
        selectorBox.style.height = Math.abs(currentY - startY) + 'px';
        selectorBox.style.left = Math.min(currentX, startX) + 'px';
        selectorBox.style.top = Math.min(currentY, startY) + 'px';
    });

    overlayBox.addEventListener('mouseup', (e) => {
        isCropping = false;
        const rect = selectorBox.getBoundingClientRect();
        overlayBox.remove();
        
        if (rect.width > 15 && rect.height > 15) {
            showSniperToast("Crop secured. Processing image...", "loading");
            // Multiply by devicePixelRatio for high-res displays like Retina
            const dpr = window.devicePixelRatio || 1;
            chrome.runtime.sendMessage({
                type: "CROP_SNIPER",
                coords: { 
                    x: rect.left * dpr, 
                    y: rect.top * dpr, 
                    w: rect.width * dpr, 
                    h: rect.height * dpr 
                }
            });
        } else {
            showSniperToast("Crop too small, aborted.", "error");
        }
    });
}