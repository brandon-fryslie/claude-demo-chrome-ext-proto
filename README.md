# AI Assistant Chrome Extension

An OpenAI-powered Chrome extension that brings conversational AI directly into your browser with DOM/console access and voice capabilities.

## Features

- **ChatGPT-style Conversational Interface**: Natural back-and-forth conversations with AI
- **DOM Access**: AI can see and analyze the current webpage structure
- **Console Log Access**: AI can review JavaScript console logs for debugging
- **Voice Input**: Speak to the AI using speech-to-text
- **Voice Output**: AI responds with natural text-to-speech
- **Conversation History**: Maintains context across messages
- **Customizable**: Choose your preferred OpenAI model (GPT-3.5, GPT-4)

## Installation

### Step 1: Create Extension Icons

1. Open `create-icons.html` in your browser
2. Three icon files will automatically download: `icon16.png`, `icon48.png`, and `icon128.png`
3. Move these icon files to the extension directory

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the extension directory containing all the files
5. The AI Assistant extension should now appear in your extensions list

### Step 3: Configure API Key

1. Click the extension icon in your browser toolbar
2. Click the settings gear icon (⚙️)
3. Enter your OpenAI API key (get one from https://platform.openai.com/api-keys)
4. Select your preferred model
5. Click "Save"

## Usage

### Basic Chat

1. Click the extension icon to open the chat interface
2. Type your message in the input box
3. Press Enter or click the send button (➤)
4. The AI will respond based on the current page context

### Voice Interaction

1. Click the microphone button (🎤) to start voice input
2. Speak your question
3. The transcribed text will appear in the input box
4. Send the message to get an AI response
5. If "Voice Response" is enabled, the AI will speak the response aloud

### Page Context

- **Include DOM**: When enabled, the AI can see the structure of the current webpage
- **Include Console**: When enabled, the AI can see recent console logs
- **Voice Response**: When enabled, the AI will speak responses using text-to-speech

### Example Questions

- "What is this webpage about?"
- "Summarize the main content of this page"
- "Are there any JavaScript errors in the console?"
- "What form fields are on this page?"
- "Explain what this website does"

## Files Structure

```
chrome-extension-demo/
├── manifest.json          # Extension configuration
├── popup.html            # Chat interface UI
├── popup.css             # Styling
├── popup.js              # Main chat logic & OpenAI integration
├── content.js            # DOM/console access script
├── background.js         # Background service worker
├── create-icons.html     # Icon generator utility
├── icon16.png           # Extension icon (16x16)
├── icon48.png           # Extension icon (48x48)
├── icon128.png          # Extension icon (128x128)
└── README.md            # This file
```

## Privacy & Security

- Your OpenAI API key is stored locally in Chrome's storage
- No data is sent to any server except OpenAI's API
- DOM and console data is only collected when you explicitly ask questions
- Conversation history is stored locally and can be cleared anytime

## Troubleshooting

**Extension won't load:**
- Make sure all files are in the same directory
- Ensure you've created the icon files using `create-icons.html`
- Check that Developer Mode is enabled in Chrome

**Voice input not working:**
- Grant microphone permissions when prompted
- Voice recognition requires an internet connection
- Only works in browsers that support Web Speech API

**AI not responding:**
- Verify your OpenAI API key is correct and has credits
- Check your internet connection
- Look for error messages in the chat interface

**Can't access page DOM/console:**
- Refresh the page after installing the extension
- Some pages (like chrome:// URLs) restrict extension access
- Check the browser console for any errors

## Requirements

- Google Chrome (or Chromium-based browser)
- OpenAI API key with available credits
- Internet connection

## License

This is a demonstration project. Modify and use as needed.
