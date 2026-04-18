let isAnalyzingClasstime = false;

function sysLog(msg) {
    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: "LOG", message: `[Classtime] ${msg}` });
    }
}

function scrubAllEvidence() {
    // Target anything that has stealth or ghost classes and strip them bare
    document.querySelectorAll('.ai-stealth, .ai-stealth-ghost').forEach(el => {
        el.classList.remove('ai-stealth', 'ai-stealth-bold', 'ai-stealth-italic', 'ai-stealth-color', 'ai-stealth-font', 'ai-stealth-ghost');
    });
}

function applyStealthStyles(targetEl) {
    chrome.storage.local.get(['styleBold', 'styleItalic', 'styleColor', 'styleFont', 'styleGhost'], (data) => {
        if (data.styleBold !== false && !data.styleGhost) targetEl.classList.add('ai-stealth-bold');
        if (data.styleItalic && !data.styleGhost) targetEl.classList.add('ai-stealth-italic');
        if (data.styleColor && !data.styleGhost) targetEl.classList.add('ai-stealth-color');
        if (data.styleFont && !data.styleGhost) targetEl.classList.add('ai-stealth-font');
        
        // Ghost mode overrides the loud styles
        if (data.styleGhost) targetEl.classList.add('ai-stealth-ghost');
        
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