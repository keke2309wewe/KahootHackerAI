let isAnalyzingClasstime = false;

function sysLog(msg) {
    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: "LOG", message: `[Classtime] ${msg}` });
    }
}

function scrubAllEvidence() {
    document.querySelectorAll('.ai-stealth, .ai-stealth-ghost').forEach(el => {
        el.classList.remove('ai-stealth', 'ai-stealth-bold', 'ai-stealth-italic', 'ai-stealth-color', 'ai-stealth-font', 'ai-stealth-ghost');
        el.style.removeProperty('color');
        el.style.removeProperty('text-shadow');
        el.style.removeProperty('cursor');
    });
}

function applyStealthStyles(targetEl) {
    chrome.storage.local.get(['styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost', 'cursorStyle', 'themeColor', 'rainbowMode'], (data) => {
        if (data.styleBold !== false) targetEl.classList.add('ai-stealth-bold');
        if (data.styleItalic) targetEl.classList.add('ai-stealth-italic');
        if (data.styleFont) targetEl.classList.add('ai-stealth-font');
        
        if (data.styleColor) {
            if (data.rainbowMode) {
                // Dynamically build the rainbow animation if it doesn't exist
                if (!document.getElementById('ai-rainbow-style')) {
                    const style = document.createElement('style');
                    style.id = 'ai-rainbow-style';
                    style.innerHTML = `@keyframes ai-rainbow-pulse { 0% {color: #ff0000; text-shadow: 0 0 5px #ff0000;} 16% {color: #ffff00; text-shadow: 0 0 5px #ffff00;} 33% {color: #00ff00; text-shadow: 0 0 5px #00ff00;} 50% {color: #00ffff; text-shadow: 0 0 5px #00ffff;} 66% {color: #0000ff; text-shadow: 0 0 5px #0000ff;} 83% {color: #ff00ff; text-shadow: 0 0 5px #ff00ff;} 100% {color: #ff0000; text-shadow: 0 0 5px #ff0000;} } .ai-stealth-rainbow { animation: ai-rainbow-pulse 3s linear infinite !important; }`;
                    document.head.appendChild(style);
                }
                targetEl.classList.add('ai-stealth-rainbow');
            } else {
                const hex = data.themeColor || '#00ff00';
                targetEl.style.setProperty('color', hex, 'important');
                targetEl.style.setProperty('text-shadow', '1px 1px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9)', 'important');
            }
        }
        
        if (data.styleGhost) {
            targetEl.classList.add('ai-stealth-ghost');
            targetEl.style.setProperty('cursor', data.cursorStyle || 'text', 'important');
        }
        
        targetEl.classList.add('ai-stealth'); 
    });
}

sysLog("Content script injected at: " + window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SCRUB_EVIDENCE") {
        sysLog("Scrubbing UI evidence.");
        scrubAllEvidence();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.code === 'KeyA' && !isAnalyzingClasstime && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        
        chrome.storage.local.get(['panicMode'], (data) => {
            if (chrome.runtime.lastError || data.panicMode) return; 

            sysLog("Shift+A detected. Forcing manual screenshot visual analysis...");
            isAnalyzingClasstime = true;
            
            scrubAllEvidence();

            chrome.runtime.sendMessage({ type: "REQUEST_SCREENSHOT_ANALYSIS", platform: "classtime" }, (response) => {
                isAnalyzingClasstime = false; 
                
                if (chrome.runtime.lastError || !response) {
                    sysLog("Connection error or empty response.");
                    return;
                }

                if (response.winningColor) {
                    sysLog(`AI says the answer is option: ${response.winningColor}`);
                    applyClasstimeFormatting(response.winningColor);
                } else if (response.error) {
                    sysLog("AI Error: " + response.error);
                }
            });
        });
    }
});

function applyClasstimeFormatting(indexStr) {
    let targetIndex = parseInt(indexStr) - 1; 

    if (isNaN(targetIndex) || targetIndex < 0) {
        sysLog("Failed to map index: " + indexStr);
        return;
    }

    let radioInputs = Array.from(document.querySelectorAll('input[type="radio"]'));

    let visibleRadios = radioInputs.filter(el => {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 && 
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.left > (window.innerWidth * 0.2) 
        );
    });

    visibleRadios.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    sysLog(`Debug: Found ${visibleRadios.length} valid radio inputs in viewport.`);

    if (visibleRadios.length > targetIndex) {
        let targetRadio = visibleRadios[targetIndex];
        let targetContainer = targetRadio.closest('label') || targetRadio.parentElement;

        applyStealthStyles(targetContainer);
        
        let tagInfo = `${targetContainer.tagName.toLowerCase()}.${targetContainer.className.replace(/\s+/g, '.')}`;
        sysLog(`Formatted option ${targetIndex + 1}. Target applied to: ${tagInfo}`);
    } else {
        sysLog(`DOM fail: Could not find index ${targetIndex}. Only saw ${visibleRadios.length} valid radios in view.`);
    }
}