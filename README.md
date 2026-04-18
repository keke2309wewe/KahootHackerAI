# Multi-Platform AI Stealth (KahootHackerAI)

A stealthy, AI-powered browser extension designed to secretly solve online quizzes using vision models. It runs entirely in the background, takes screenshots of active quizzes, and highlights the correct answers using nearly invisible CSS modifications to avoid detection.

## 🚀 Features

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
3. **Set Stealth Styling:**
   * Choose how you want the correct answer to be highlighted. 
   * *Tip:* **Ghost Ink** is the most secure; it will only appear if you know exactly how to look for it.

## 🎮 How to Use

* **Auto-Solve (Kahoot, Naurok, Classtime):** Simply play the game normally. When the question appears and the answer boxes load, the extension will automatically analyze the screen and apply your chosen Stealth Style to the correct box.
* **Text Sniper:** Highlight any text on any webpage, right-click, and select **"Snipe Text with AI"**. The extension will process the text and return an answer discretely.
* **Panic Mode:** If someone is walking by, hit `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac). The extension will instantly revert any modified text or buttons back to normal and pause auto-scanning until toggled off.

---
*Disclaimer: This tool is intended for educational and proof-of-concept purposes. Use responsibly.*
