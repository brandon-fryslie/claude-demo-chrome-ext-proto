// Background service worker for the AI Assistant extension

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AI Assistant extension installed');

    // Set default values
    chrome.storage.local.set({
      model: 'gpt-3.5-turbo',
      ttsVoice: 'nova',
      voiceSelect: 'nova',
      ttsSpeed: 1.25,
      ttsModel: 'hd',
      conversationHistory: []
    });
  }
});

// Keep service worker alive (if needed)
chrome.runtime.onStartup.addListener(() => {
  console.log('AI Assistant extension started');
});

// Open sidebar when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from content scripts or sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle any background tasks if needed
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
  }
  return true;
});
