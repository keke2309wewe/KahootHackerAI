# Multi-Platform AI Stealth (KahootHackerAI)

A stealthy, AI-powered browser extension designed to secretly solve online quizzes using vision models. It runs entirely in the background, takes screenshots of active quizzes, and highlights the correct answers using nearly invisible CSS modifications to avoid detection.

## 🚀 What's New in v4.7

* **Sniper History Panel:** A new 📋 tab in the popup lets you browse all past Text Sniper and Crop Sniper Q&A results. Click any entry to expand the full answer. Clear all history with one button.
* **OpenRouter Live Cost Estimator:** The stats panel now automatically fetches live $/1M pricing for your exact model directly from the OpenRouter API and displays a real-time cost breakdown. Falls back to manual values for OpenAI / Custom providers.
* **Smarter Token Display:** The settings panel now shows In tokens, Out tokens, $/1M rates (OpenRouter only), and total estimated spend — all in one clean panel.

## 🚀 What Was New in v4.3

* **Shared Utility Architecture:** All platform content scripts now use a single shared utility file (`shared_utils.js`), eliminating code duplication and making updates easier.
* **Naurok-Specific AI Prompt:** Naurok now gets its own vision prompt that correctly describes its color layout (Pink → Yellow → Blue → Green), improving accuracy.
* **Retry on AI Failure:** If the AI fails on a screenshot analysis, the extension automatically retries once after 2 seconds before giving up.
* **Test Connection Button:** A new button in the popup to instantly verify your API key, model, and endpoint are working — no more guessing.
* **Race Condition Fix:** The chat system prompt injection is now properly async, preventing potential message ordering bugs.
* **Performance Fix:** Kahoot's scanner now uses `textContent` instead of `innerText`, avoiding expensive layout reflows every second.
* **Permission Cleanup:** Removed the unused `desktopCapture` permission — fewer scary warnings on install.

## 🌟 Core Features

* **Visual AI Processing:** Instead of reading the DOM (which is easily broken by site updates), the extension takes a screenshot of the quiz and sends it to a Vision AI model to determine the answer. The current recommended model is **`google/gemini-2.5-flash-preview-05-20`** (Gemini 3 Flash Preview) — it is significantly more accurate than Gemini 2.5 Flash, especially when **Reasoning is enabled at Medium effort**. Note that reasoning adds a few extra seconds to the response time, so expect a slightly longer wait before the answer appears.
* **Stealth Highlights:** Applies subtle CSS classes (like Ghost Ink, Eggshell Color, or Slight Bold) to the correct answer, meaning only you know what to look for. No obvious red arrows or popups!
* **Multi-Platform Support:** Works out of the box with Kahoot, Classtime, and Naurok.
* **Universal "Sniper" Mode:** Right-click any text on any website to send it to the AI for an instant, discrete answer. Also supports cropped area captures. Results are rendered with **bold**, *italic*, and math formatting.
* **Built-in Chat (Comms Hub):** A full AI chat interface in the popup with multi-session support, image paste (`Ctrl+V`), and per-message cost telemetry.
* **Custom AI Prompts:** A dedicated "Prompts" tab to completely rewrite the system instructions for each platform individually.
* **Reasoning Model Support:** Toggle reasoning on/off with configurable effort level (Low/Medium/High). Works correctly across OpenRouter, OpenAI, and Custom endpoints.
* **Tab Visibility Bypass:** Locks the browser's `visibilityState` to "visible", preventing quiz sites from knowing when you switch tabs.
* **Panic Button (Kill Switch):** Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to instantly scrub all visual evidence from the screen and pause the background scanner.
* **BYOK (Bring Your Own Key):** Supports OpenRouter, OpenAI, or any Custom API endpoint.

## 🛠️ How to Install (Developer Mode)

Because this extension uses powerful background features, it is not listed on the Chrome Web Store. You must install it manually:

1. **Download the Code:**
   * Clone this repository using Git: `git clone https://github.com/keke2309wewe/KahootHackerAI.git`
   * OR download the repository as a ZIP file from the [Releases](https://github.com/keke2309wewe/KahootHackerAI/releases) page.
2. **Open Extensions Page:**
   * Open your Chrome (or Chromium-based) browser and go to `chrome://extensions/`.
3. **Enable Developer Mode:**
   * Toggle the **Developer mode** switch in the top right corner.
4. **Load the Extension:**
   * Click the **Load unpacked** button in the top left.
   * Select the `KahootHackerAI` folder that you downloaded/cloned.
   * The extension should now appear in your list! Pin it to your toolbar for easy access.

## ⚙️ Configuration & Getting Started

Before the extension can solve anything, you need to provide it with an AI brain.

1. **Get an API Key:**
   * The easiest and cheapest method is using [OpenRouter](https://openrouter.ai/). Create an account, add a few cents in credits, and generate an API key.
   * Alternatively, you can use an OpenAI API key.
2. **Configure the Extension:**
   * Click the extension icon in your browser toolbar to open the popup.
   * Select your **API Provider** (OpenRouter, OpenAI, or Custom).
   * Paste your **API Key**.
   * Leave the **AI Model** as `google/gemini-2.5-flash-preview-05-20` (Gemini 3 Flash Preview — **recommended**, best accuracy). You can also use `google/gemini-2.5-flash` for a slightly faster but less accurate result.
   * **Tip:** Turn on **Reasoning** at **Medium** effort for a major accuracy boost. Be aware this adds a few extra seconds to each answer — that's normal.
3. **Test Your Connection:**
   * Click the **Test Connection** button. If you see "✓ Connected", you're good to go!
4. **Set Stealth Styling & Anti-Detection:**
   * Choose how you want the correct answer to be highlighted (e.g. Ghost Ink, Custom Color, Rainbow mode).
   * Turn on **Tab Visibility Bypass** if you're taking a strict test that tracks tab switching.
5. **Tweak Prompts (Optional):**
   * Go to the **Prompts** tab if you want to modify how the AI thinks or formats its answers. Each platform (Kahoot, Naurok, Classtime) has its own customizable prompt.

## 🎮 How to Use

* **Auto-Solve (Kahoot, Naurok):** Simply play the game normally. When the question appears and the answer boxes load, the extension will automatically analyze the screen and apply your chosen Stealth Style to the correct box.
* **Manual Capture (Classtime):** For Classtime, wait for the question to load and press `Shift+A`. The extension will then capture the screen and highlight the correct answer using your chosen Stealth Style.
* **Text Sniper:** Highlight any text on any webpage, right-click and select **"Snipe Text with AI"**, or press `Alt+S`. The extension will process the text and return a formatted answer.
* **Crop Sniper:** Press `Alt+C` to activate the crosshair, drag to select an area, and the AI will analyze the cropped image.
* **Direct Chat:** Open the popup and click **Comms**. Ask any question or paste a screenshot for immediate help.
* **Panic Mode:** If someone is walking by, hit `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) or click the red Panic button in the popup. The extension will instantly revert any modified text or buttons back to normal and pause auto-scanning until toggled off.

---
*Disclaimer: This tool is intended for educational and proof-of-concept purposes. Use responsibly.*
