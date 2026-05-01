# Multi-Platform AI Stealth (KahootHackerAI)

A stealthy, AI-powered browser extension designed to secretly solve online quizzes using vision models. It runs entirely in the background, takes screenshots of active quizzes, and highlights the correct answers using nearly invisible CSS modifications to avoid detection.

## 🚀 What's New in v4.9

* **Stealthy AI Steps Display:** See the AI's reasoning steps without leaving the quiz page. Choose from 4 invisible display modes:
  * **Hover Tooltip** — Steps appear when you hover over the highlighted answer.
  * **Console Whisper** — Steps are silently logged to the browser DevTools console (F12).
  * **Status Bar** — Steps appear in the browser's status bar on hover.
  * **Ghost Text** — Near-invisible micro-text appended to the answer element.
* **Quiz Answer Pre-loader:** Paste a Kahoot Quiz UUID in the 🎯 tab to fetch all answers from the Kahoot API. Instant highlight — zero AI tokens used.
* **Solve Mode (AI / Cache / Hybrid):** Choose how the extension determines correct answers:
  * **Hybrid** (recommended) — Use cached answers first, fall back to AI for cache misses.
  * **AI Only** — Always use screenshot analysis.
  * **Cache Only** — Only use pre-loaded answers, no AI calls.
* **Live Cache Status Bar:** The popup now shows a real-time indicator of whether a quiz cache is loaded, including quiz title, cached question count, and active solve mode.
* **Results Dashboard (Docker):** A self-hosted results dashboard to track quiz performance, AI accuracy, token usage, and spending. Deployed via Docker at `results.andrewshlapak.xyz`.
* **Bug Fix:** Chat error no longer removes the user's message from history.
* **Bug Fix:** Crop sniper escape key listener is now properly cleaned up.

## 🚀 What Was New in v4.8

* **Classtime Multiple Choice Support:** Now fully supports both radio buttons and checkboxes. Highlights multiple correct options simultaneously.
* **Classtime Auto-Fill & Clipboard:** For free-text questions, the AI result is now automatically typed into the answer box and copied to your clipboard.
* **Intelligent DOM Mapping:** Improved logic that distinguishes between choice indices and text answers (e.g., math solutions). Added support for Material UI specific selectors.
* **Plain Text Enforcement:** All AI outputs (Classtime, Sniper, Crop) are now strictly plain text. No LaTeX, no markdown formatting, no complex characters—guaranteed to be easy to type on any 60% keyboard.

## 🚀 What Was New in v4.7

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

* **Visual AI Processing:** Instead of reading the DOM (which is easily broken by site updates), the extension takes a screenshot of the quiz and sends it to a Vision AI model to determine the answer. The current recommended model is **`google/gemini-3-flash-preview`** — it is significantly more accurate than older Flash models, especially when **Reasoning is enabled at Medium effort**. Note that reasoning adds a few extra seconds to the response time, so expect a slightly longer wait before the answer appears.
* **Stealth Highlights:** Applies subtle CSS classes (like Ghost Ink, Eggshell Color, or Slight Bold) to the correct answer, meaning only you know what to look for. No obvious red arrows or popups!
* **Multi-Platform Support:** Works out of the box with Kahoot, Classtime, and Naurok.
* **Universal "Sniper" Mode:** Right-click any text on any website to send it to the AI for an instant, discrete answer. Also supports cropped area captures. Results are rendered with **bold**, *italic*, and math formatting.
* **Built-in Chat (Comms Hub):** A full AI chat interface in the popup with multi-session support, image paste (`Ctrl+V`), and per-message cost telemetry.
* **Custom AI Prompts:** A dedicated "Prompts" tab to completely rewrite the system instructions for each platform individually.
* **Reasoning Model Support:** Toggle reasoning on/off with configurable effort level (Low/Medium/High). Works correctly across OpenRouter, OpenAI, and Custom endpoints.
* **Tab Visibility Bypass:** Locks the browser's `visibilityState` to "visible", preventing quiz sites from knowing when you switch tabs.
* **Panic Button (Kill Switch):** Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to instantly scrub all visual evidence from the screen and pause the background scanner.
* **BYOK (Bring Your Own Key):** Supports OpenRouter, OpenAI, or any Custom API endpoint.
* **Results Dashboard:** After each game, the extension can automatically report results (correct/wrong count, model, cost, etc.) to a self-hosted Docker dashboard for historical tracking and analytics.

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
   * Leave the **AI Model** as `google/gemini-3-flash-preview` (recommended, best accuracy). You can also use `google/gemini-2.0-flash-exp` for a slightly faster but less accurate result.
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
* **Manual Capture (Classtime):** For Classtime, press `Shift+A`. The extension will analyze the screen and either highlight the correct option(s) or automatically fill the text answer box and copy it to your clipboard.
* **Text Sniper:** Highlight any text on any webpage, right-click and select **"Snipe Text with AI"**, or press `Alt+S`. The extension will process the text and return a formatted answer.
* **Crop Sniper:** Press `Alt+C` to activate the crosshair, drag to select an area, and the AI will analyze the cropped image.
* **Direct Chat:** Open the popup and click **Comms**. Ask any question or paste a screenshot for immediate help.
* **Panic Mode:** If someone is walking by, hit `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) or click the red Panic button in the popup. The extension will instantly revert any modified text or buttons back to normal and pause auto-scanning until toggled off.

## 📊 Results Dashboard (Docker)

A self-hosted dashboard to track quiz performance across all platforms. Deployed via Docker on your home server.

### Features
* **Stats Overview** — Total games, overall accuracy %, total spending, most-used model
* **Per-Platform Breakdown** — Accuracy and game count per platform (Kahoot, Naurok, Classtime)
* **Filterable Results Table** — Sort by time, accuracy, cost; filter by platform
* **Expandable Detail Rows** — Token breakdown, solve mode, reasoning config per game
* **Bearer Token Auth** — All API endpoints secured with a configurable token
* **Dark Hacker Theme** — Matches the extension's aesthetic with animated backgrounds

### Setup

```bash
cd results-dashboard

# Set your secret token in docker-compose.yml
# Then build and run:
docker compose up -d --build
```

The dashboard runs on port `3888` by default. Point your Cloudflare tunnel or reverse proxy to `localhost:3888`.

### Extension Configuration

1. Open the extension popup → **Settings**
2. Scroll to **📊 Dashboard Reporting**
3. Enable **Result Reporting**
4. Set **Dashboard URL** to `https://results.andrewshlapak.xyz`
5. Set the **Token** to match your `DASHBOARD_TOKEN` env var
6. Toggle per-platform checkboxes (Kahoot ☑ / Naurok ☑ / Classtime ☑ / Universal ☑)
7. Click **Save Configuration**

Results will be automatically reported after each game session.

---
*Disclaimer: This tool is intended for educational and proof-of-concept purposes. Use responsibly.*
