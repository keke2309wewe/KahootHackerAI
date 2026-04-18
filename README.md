# Multi-Platform AI Stealth (KahootHackerAI)

A stealthy, AI-powered browser extension designed to secretly solve online quizzes using vision models. It runs entirely in the background, takes screenshots of active quizzes, and highlights the correct answers using nearly invisible CSS modifications to avoid detection.

## 🚀 What's New in V2 (Engine v4.3)
* **Built-in Chat & Comms Hub:** A brand new "Comms" tab in the popup. Directly chat with your AI, paste images (`Ctrl+V`), and manage multiple chat sessions.
* **Custom AI Prompts:** A dedicated "Prompts" tab to completely rewrite the system instructions. Change how the AI solves Kahoot, how it replies to text snipes, or customize its persona.
* **Tab Visibility Bypass:** An anti-detection feature that locks the browser's `visibilityState` to "visible", preventing quiz sites from knowing when you switch tabs.
* **Reasoning Model Support:** Built-in support for AI models that use "reasoning effort" (e.g., `gemini-2.0-pro-exp`).
* **Advanced Stealth Styling:** Added a Color Picker for custom stealth colors, "Rainbow Mode", and "Ghost Cursor" (hide your cursor or change it to an I-beam over the correct answer).

## 🌟 Core Features

* **Visual AI Processing:** Instead of reading the DOM (which is easily broken by site updates), the extension takes a screenshot of the quiz and sends it to a Vision AI model (like Gemini 2.5 Flash) to determine the answer.
* **Stealth Highlights:** Applies subtle CSS classes (like Ghost Ink, Eggshell Color, or Slight Bold) to the correct answer, meaning only you know what to look for. No obvious red arrows or popups!
* **Multi-Platform Support:** Works out of the box with Kahoot, Classtime, and Naurok. 
* **Universal "Sniper" Mode:** Right-click any text on any website to send it to the AI for an instant, discrete answer. Also supports cropped area captures.
* **Panic Button (Kill Switch):** Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to instantly scrub all visual evidence from the screen and pause the background scanner.
* **BYOK (Bring Your Own Key):** Supports OpenRouter, OpenAI, or any Custom API endpoint.

## 🛠️ How to Install (Developer Mode)

Because this extension uses powerful background features, it is not listed on the Chrome Web Store. You must install it manually:

1. **Download the Code:**
   * Clone this repository using Git: `git clone https://github.com/keke2309wewe/KahootHackerAI.git`
   * OR download the repository as a ZIP file and extract it.
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
   * Leave the **AI Model** as `google/gemini-2.5-flash` (recommended for speed and cost), or change it if you prefer.
3. **Set Stealth Styling & Anti-Detection:**
   * Choose how you want the correct answer to be highlighted (e.g. Ghost Ink, Custom Color, Rainbow mode). 
   * Turn on **Tab Visibility Bypass** if you're taking a strict test that tracks tab switching.
4. **Tweak Prompts (Optional):**
   * Go to the **Prompts** tab if you want to modify how the AI thinks or formats its answers.

## 🎮 How to Use

* **Auto-Solve (Kahoot, Naurok):** Simply play the game normally. When the question appears and the answer boxes load, the extension will automatically analyze the screen and apply your chosen Stealth Style to the correct box.
* **Manual Capture (Classtime):** For Classtime, wait for the question to load and press `Shift+A`. The extension will then capture the screen and highlight the correct answer using your chosen Stealth Style.
* **Text Sniper:** Highlight any text on any webpage, right-click, and select **"Snipe Text with AI"**. The extension will process the text and return an answer discretely.
* **Direct Chat:** Open the popup and click **Comms**. Ask any question or paste a screenshot for immediate help.
* **Panic Mode:** If someone is walking by, hit `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) or click the red Panic button in the popup. The extension will instantly revert any modified text or buttons back to normal and pause auto-scanning until toggled off.

---
*Disclaimer: This tool is intended for educational and proof-of-concept purposes. Use responsibly.*
