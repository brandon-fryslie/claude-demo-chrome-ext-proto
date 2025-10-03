let conversationHistory = [];
let isListening = false;
let recognition = null;
let currentAudio = null;
let isSpeaking = false;
let userHasScrolledUp = false;
let lastScrollHeight = 0;
let promptHistory = [];
let promptHistoryIndex = -1;
let currentInput = '';

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
  const result = await chrome.storage.local.get([
    'apiKey', 'model', 'conversationHistory', 'ttsVoice', 'voiceSelect',
    'includeDom', 'includeConsole', 'enableTts', 'ttsSpeed', 'ttsModel', 'promptHistory',
    'apiProvider', 'claudeApiKey'
  ]);

  // API Provider
  const provider = result.apiProvider || 'openai';
  document.querySelector(`input[name="apiProvider"][value="${provider}"]`).checked = true;

  if (provider === 'claude') {
    document.getElementById('openaiSettings').classList.add('hidden');
    document.getElementById('claudeSettings').classList.remove('hidden');
  }

  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
  if (result.claudeApiKey) {
    document.getElementById('claudeApiKey').value = result.claudeApiKey;
  }
  if (result.model) {
    document.getElementById('model').value = result.model;
  }

  // Voice selection
  const voice = result.voiceSelect || result.ttsVoice || 'nova';
  document.getElementById('ttsVoice').value = voice;
  document.getElementById('voiceSelect').value = voice;

  // Speed slider
  const speed = result.ttsSpeed || 1.25;
  document.getElementById('speedSlider').value = speed;
  document.getElementById('speedValue').textContent = speed.toFixed(2) + 'x';

  // HD model checkbox
  if (result.ttsModel === 'hd') {
    document.getElementById('useHDModel').checked = true;
  }

  // Restore checkbox states
  if (result.includeDom !== undefined) {
    document.getElementById('includeDom').checked = result.includeDom;
  }
  if (result.includeConsole !== undefined) {
    document.getElementById('includeConsole').checked = result.includeConsole;
  }
  if (result.enableTts !== undefined) {
    document.getElementById('enableTts').checked = result.enableTts;
  }

  if (result.conversationHistory) {
    conversationHistory = result.conversationHistory;
    renderMessages();
  }

  // Load prompt history
  if (result.promptHistory) {
    promptHistory = result.promptHistory;
  }
}

// Save settings
async function saveSettings() {
  const apiProvider = document.querySelector('input[name="apiProvider"]:checked').value;
  const apiKey = document.getElementById('apiKey').value;
  const claudeApiKey = document.getElementById('claudeApiKey').value;
  const model = document.getElementById('model').value;
  const ttsVoice = document.getElementById('ttsVoice').value;

  if (apiProvider === 'openai' && !apiKey) {
    alert('Please enter an OpenAI API key');
    return;
  }

  if (apiProvider === 'claude' && !claudeApiKey) {
    alert('Please enter a Claude API key');
    return;
  }

  await chrome.storage.local.set({ apiProvider, apiKey, claudeApiKey, model, ttsVoice });
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

// Auto-scroll detection
function checkScrollPosition() {
  const container = document.getElementById('chatContainer');
  const threshold = 100; // pixels from bottom
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  userHasScrolledUp = distanceFromBottom > threshold;
}

// Smart scroll - only scroll if user hasn't scrolled up
function smartScroll() {
  if (!userHasScrolledUp) {
    const container = document.getElementById('chatContainer');
    container.scrollTop = container.scrollHeight;
  }
}

// Add message to chat
function addMessage(role, content, messageId = null) {
  const messagesDiv = document.getElementById('messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  if (messageId) {
    messageDiv.id = messageId;
  }

  const roleLabel = document.createElement('div');
  roleLabel.className = 'role-label';
  roleLabel.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;

  messageDiv.appendChild(roleLabel);
  messageDiv.appendChild(contentDiv);
  messagesDiv.appendChild(messageDiv);

  smartScroll();
  return messageDiv;
}

// Update existing message content
function updateMessage(messageId, content) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.textContent = content;
      smartScroll();
    }
  }
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

// Add to prompt history
async function addToPromptHistory(prompt) {
  promptHistory.unshift(prompt);
  if (promptHistory.length > 20) {
    promptHistory = promptHistory.slice(0, 20);
  }
  await chrome.storage.local.set({ promptHistory });
  promptHistoryIndex = -1;
}

// Send message with streaming (supports OpenAI and Claude)
async function sendMessage(userMessage) {
  const settings = await chrome.storage.local.get(['apiKey', 'model', 'apiProvider', 'claudeApiKey']);

  const provider = settings.apiProvider || 'openai';

  if (provider === 'openai' && !settings.apiKey) {
    addMessage('system', 'Please set your OpenAI API key in settings first.');
    document.getElementById('settingsPanel').classList.remove('hidden');
    return;
  }

  if (provider === 'claude' && !settings.claudeApiKey) {
    addMessage('system', 'Please set your Claude API key in settings first.');
    document.getElementById('settingsPanel').classList.remove('hidden');
    return;
  }

  // Add to prompt history
  await addToPromptHistory(userMessage);

  const includeDom = document.getElementById('includeDom').checked;
  const includeConsole = document.getElementById('includeConsole').checked;

  // Save checkbox states
  await saveCheckboxStates();

  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });
  addMessage('user', userMessage);

  // Reset scroll detection for new message
  userHasScrolledUp = false;

  // Get page context if enabled
  let systemMessage = `You are a code writing specialist AI assistant integrated into a web browser. You excel at:
- Writing clean, efficient, and well-documented code
- Debugging and fixing code issues
- Explaining technical concepts clearly
- Creating browser scripts and automation
- Web development (HTML, CSS, JavaScript)
- Using modern frameworks and libraries

Always provide working code examples when relevant. Format code blocks properly for readability.`;

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

  // Create placeholder for streaming response
  const messageId = 'streaming-' + Date.now();
  addMessage('assistant', '', messageId);

  let fullResponse = '';
  let ttsStarted = false;
  const enableTts = document.getElementById('enableTts').checked;

  try {
    let response;

    if (provider === 'claude') {
      // Claude API
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          temperature: 0.7,
          stream: true,
          system: systemMessage,
          messages: conversationHistory.slice(-10).map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          })).concat([{
            role: 'user',
            content: userMessage
          }])
        })
      });
    } else {
      // OpenAI API - use GPT-4.1
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo-2024-04-09',
          messages: messages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true
        })
      });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        let content = null;

        if (provider === 'claude') {
          // Parse Claude streaming format
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                content = parsed.delta.text;
              }
            } catch (e) {
              console.error('Error parsing Claude stream:', e);
            }
          }
        } else {
          // Parse OpenAI streaming format
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              content = parsed.choices[0]?.delta?.content;
            } catch (e) {
              console.error('Error parsing OpenAI stream:', e);
            }
          }
        }

        if (content) {
          fullResponse += content;
          updateMessage(messageId, fullResponse);

          // Start TTS after we have at least a sentence worth of text
          if (enableTts && !ttsStarted && fullResponse.length > 50) {
            ttsStarted = true;
            speak(fullResponse);
          }
        }
      }
    }

    // Save complete response to history
    conversationHistory.push({ role: 'assistant', content: fullResponse });
    await chrome.storage.local.set({ conversationHistory });

    // If TTS wasn't started during streaming (response too short), start it now
    if (enableTts && !ttsStarted && fullResponse) {
      speak(fullResponse);
    }

  } catch (error) {
    // Remove placeholder message
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
      messageDiv.remove();
    }
    addMessage('system', `Error: ${error.message}`);
  }
}

// Save checkbox states
async function saveCheckboxStates() {
  const includeDom = document.getElementById('includeDom').checked;
  const includeConsole = document.getElementById('includeConsole').checked;
  const enableTts = document.getElementById('enableTts').checked;

  await chrome.storage.local.set({ includeDom, includeConsole, enableTts });
}

// Stop speaking
function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isSpeaking = false;
  showSpeakingIndicator(false);
}

// Text-to-speech using OpenAI with streaming
async function speak(text) {
  // Stop any ongoing speech
  stopSpeaking();

  const settings = await chrome.storage.local.get(['apiKey', 'voiceSelect', 'ttsSpeed', 'ttsModel']);
  if (!settings.apiKey) {
    console.error('No API key found for TTS');
    return;
  }

  // Get voice from control panel selector
  const voiceSelect = document.getElementById('voiceSelect');
  const selectedVoice = voiceSelect ? voiceSelect.value : (settings.voiceSelect || 'nova');

  // Get speed from control panel
  const speedSlider = document.getElementById('speedSlider');
  const speed = speedSlider ? parseFloat(speedSlider.value) : (settings.ttsSpeed || 1.25);

  // Get model (HD or standard)
  const useHD = settings.ttsModel === 'hd';
  const model = useHD ? 'tts-1-hd' : 'tts-1';

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
        model: model,
        voice: selectedVoice,
        input: text,
        speed: speed,
        response_format: 'opus'
      })
    });

    if (!response.ok) {
      throw new Error('TTS API request failed');
    }

    // Stream audio chunks as they arrive
    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks into blob
    const audioBlob = new Blob(chunks, { type: 'audio/opus' });
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

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
    if (content.id === tabName + 'Tab') {
      content.classList.remove('hidden');
    }
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Scroll detection
  const chatContainer = document.getElementById('chatContainer');
  chatContainer.addEventListener('scroll', checkScrollPosition);

  // Save checkbox states when changed
  document.getElementById('includeDom').addEventListener('change', saveCheckboxStates);
  document.getElementById('includeConsole').addEventListener('change', saveCheckboxStates);
  document.getElementById('enableTts').addEventListener('change', saveCheckboxStates);

  // Voice selector
  document.getElementById('voiceSelect').addEventListener('change', async (e) => {
    const selectedVoice = e.target.value;
    await chrome.storage.local.set({ voiceSelect: selectedVoice, ttsVoice: selectedVoice });
    // Update settings panel selector too
    document.getElementById('ttsVoice').value = selectedVoice;
  });

  // Speed slider
  document.getElementById('speedSlider').addEventListener('input', async (e) => {
    const speed = parseFloat(e.target.value);
    document.getElementById('speedValue').textContent = speed.toFixed(2) + 'x';
    await chrome.storage.local.set({ ttsSpeed: speed });
  });

  // HD model checkbox
  document.getElementById('useHDModel').addEventListener('change', async (e) => {
    const useHD = e.target.checked;
    await chrome.storage.local.set({ ttsModel: useHD ? 'hd' : 'standard' });
  });

  // Stop speaking button
  document.getElementById('stopSpeakingBtn').addEventListener('click', stopSpeaking);

  // API Provider switching
  document.querySelectorAll('input[name="apiProvider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const provider = e.target.value;
      if (provider === 'claude') {
        document.getElementById('openaiSettings').classList.add('hidden');
        document.getElementById('claudeSettings').classList.remove('hidden');
      } else {
        document.getElementById('openaiSettings').classList.remove('hidden');
        document.getElementById('claudeSettings').classList.add('hidden');
      }
    });
  });

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

  // Enter to send (Shift+Enter for new line), Arrow keys for history
  document.getElementById('userInput').addEventListener('keydown', async (e) => {
    const input = e.target;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (promptHistory.length === 0) return;

      // Save current input if we're starting to navigate history
      if (promptHistoryIndex === -1) {
        currentInput = input.value;
      }

      promptHistoryIndex = Math.min(promptHistoryIndex + 1, promptHistory.length - 1);
      input.value = promptHistory[promptHistoryIndex];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (promptHistoryIndex === -1) return;

      promptHistoryIndex = Math.max(promptHistoryIndex - 1, -1);
      if (promptHistoryIndex === -1) {
        input.value = currentInput;
      } else {
        input.value = promptHistory[promptHistoryIndex];
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = input.value.trim();

      if (message) {
        input.value = '';
        promptHistoryIndex = -1;
        currentInput = '';
        await sendMessage(message);
      }
    } else {
      // Reset history navigation if user types
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
        promptHistoryIndex = -1;
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
      stopSpeaking();
    }
  });
});
