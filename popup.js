let conversationHistory = [];
let isListening = false;
let recognition = null;
let currentAudio = null;
let isSpeaking = false;

// Initialize speech recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
}

// Load settings and conversation history
async function loadSettings() {
  const result = await chrome.storage.local.get(['apiKey', 'model', 'conversationHistory', 'ttsVoice']);
  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
  if (result.model) {
    document.getElementById('model').value = result.model;
  }
  if (result.ttsVoice) {
    document.getElementById('ttsVoice').value = result.ttsVoice;
  }
  if (result.conversationHistory) {
    conversationHistory = result.conversationHistory;
    renderMessages();
  }
}

// Save settings
async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const ttsVoice = document.getElementById('ttsVoice').value;

  if (!apiKey) {
    alert('Please enter an API key');
    return;
  }

  await chrome.storage.local.set({ apiKey, model, ttsVoice });
  document.getElementById('settingsPanel').classList.add('hidden');

  // Show success message
  addMessage('system', 'Settings saved successfully!');
}

// Get current tab DOM and console logs
async function getPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
    return response;
  } catch (error) {
    console.error('Error getting page context:', error);
    return { dom: 'Unable to access page DOM', consoleLogs: [] };
  }
}

// Add message to chat
function addMessage(role, content) {
  const messagesDiv = document.getElementById('messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const roleLabel = document.createElement('div');
  roleLabel.className = 'role-label';
  roleLabel.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;

  messageDiv.appendChild(roleLabel);
  messageDiv.appendChild(contentDiv);
  messagesDiv.appendChild(messageDiv);

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Render all messages
function renderMessages() {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';
  conversationHistory.forEach(msg => {
    if (msg.role !== 'system') {
      addMessage(msg.role, msg.content);
    }
  });
}

// Send message to OpenAI
async function sendMessage(userMessage) {
  const settings = await chrome.storage.local.get(['apiKey', 'model']);

  if (!settings.apiKey) {
    addMessage('system', 'Please set your OpenAI API key in settings first.');
    document.getElementById('settingsPanel').classList.remove('hidden');
    return;
  }

  const includeDom = document.getElementById('includeDom').checked;
  const includeConsole = document.getElementById('includeConsole').checked;

  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });
  addMessage('user', userMessage);

  // Get page context if enabled
  let systemMessage = 'You are a helpful AI assistant integrated into a web browser. ';

  if (includeDom || includeConsole) {
    const context = await getPageContext();

    if (includeDom && context.dom) {
      systemMessage += `\n\nCurrent page DOM structure (simplified):\n${context.dom}\n`;
    }

    if (includeConsole && context.consoleLogs && context.consoleLogs.length > 0) {
      systemMessage += `\n\nRecent console logs:\n${context.consoleLogs.join('\n')}\n`;
    }

    systemMessage += '\nUse this context to answer questions about the current webpage.';
  }

  // Prepare messages for API
  const messages = [
    { role: 'system', content: systemMessage },
    ...conversationHistory.slice(-10) // Keep last 10 messages for context
  ];

  // Show loading indicator
  addMessage('assistant', 'Thinking...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    // Remove loading indicator
    const messagesDiv = document.getElementById('messages');
    messagesDiv.removeChild(messagesDiv.lastChild);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    conversationHistory.push({ role: 'assistant', content: assistantMessage });
    addMessage('assistant', assistantMessage);

    // Save conversation history
    await chrome.storage.local.set({ conversationHistory });

    // Text-to-speech if enabled
    const enableTts = document.getElementById('enableTts').checked;
    if (enableTts) {
      speak(assistantMessage);
    }

  } catch (error) {
    // Remove loading indicator
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv.lastChild) {
      messagesDiv.removeChild(messagesDiv.lastChild);
    }
    addMessage('system', `Error: ${error.message}`);
  }
}

// Text-to-speech using OpenAI
async function speak(text) {
  // Stop any ongoing speech
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const settings = await chrome.storage.local.get(['apiKey', 'ttsVoice']);
  if (!settings.apiKey) {
    console.error('No API key found for TTS');
    return;
  }

  isSpeaking = true;
  showSpeakingIndicator(true);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: settings.ttsVoice || 'onyx',
        input: text,
        speed: 1.0
      })
    });

    if (!response.ok) {
      throw new Error('TTS API request failed');
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(audioUrl);

    currentAudio.onended = () => {
      isSpeaking = false;
      showSpeakingIndicator(false);
      URL.revokeObjectURL(audioUrl);
    };

    currentAudio.onerror = () => {
      isSpeaking = false;
      showSpeakingIndicator(false);
      URL.revokeObjectURL(audioUrl);
    };

    await currentAudio.play();
  } catch (error) {
    console.error('TTS error:', error);
    isSpeaking = false;
    showSpeakingIndicator(false);
  }
}

// Show/hide speaking indicator
function showSpeakingIndicator(show) {
  const indicator = document.getElementById('speakingIndicator');
  if (indicator) {
    indicator.style.display = show ? 'flex' : 'none';
  }
}

// Voice input
function startListening() {
  if (!recognition) {
    alert('Speech recognition is not supported in your browser.');
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  isListening = true;
  document.getElementById('voiceBtn').style.color = '#e74c3c';

  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('userInput').value = transcript;
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById('voiceBtn').style.color = '';
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isListening = false;
    document.getElementById('voiceBtn').style.color = '';
  };
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('hidden');
  });

  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  document.getElementById('cancelSettings').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.add('hidden');
  });

  // Send message
  document.getElementById('sendBtn').addEventListener('click', async () => {
    const input = document.getElementById('userInput');
    const message = input.value.trim();

    if (message) {
      input.value = '';
      await sendMessage(message);
    }
  });

  // Enter to send (Shift+Enter for new line)
  document.getElementById('userInput').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = e.target.value.trim();

      if (message) {
        e.target.value = '';
        await sendMessage(message);
      }
    }
  });

  // Voice input
  document.getElementById('voiceBtn').addEventListener('click', startListening);

  // Clear chat
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Clear conversation history?')) {
      conversationHistory = [];
      await chrome.storage.local.set({ conversationHistory });
      document.getElementById('messages').innerHTML = '';

      // Stop any ongoing speech
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
    }
  });
});
