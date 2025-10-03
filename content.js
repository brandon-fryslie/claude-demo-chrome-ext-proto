// Capture console logs
const consoleLogs = [];
const maxLogs = 50;

// Override console methods to capture logs
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info
};

function captureLog(type, args) {
  const message = Array.from(args).map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  consoleLogs.push(`[${type.toUpperCase()}] ${message}`);

  // Keep only the last maxLogs entries
  if (consoleLogs.length > maxLogs) {
    consoleLogs.shift();
  }
}

console.log = function(...args) {
  captureLog('log', args);
  originalConsole.log.apply(console, args);
};

console.warn = function(...args) {
  captureLog('warn', args);
  originalConsole.warn.apply(console, args);
};

console.error = function(...args) {
  captureLog('error', args);
  originalConsole.error.apply(console, args);
};

console.info = function(...args) {
  captureLog('info', args);
  originalConsole.info.apply(console, args);
};

// Capture existing errors
window.addEventListener('error', (event) => {
  consoleLogs.push(`[ERROR] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
  if (consoleLogs.length > maxLogs) {
    consoleLogs.shift();
  }
});

// Get simplified DOM structure
function getSimplifiedDOM(element = document.body, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) {
    return '';
  }

  const indent = '  '.repeat(depth);
  let result = '';

  if (element.nodeType === Node.ELEMENT_NODE) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className ? `.${element.className.split(' ').filter(c => c).join('.')}` : '';

    // Get important attributes
    let attrs = '';
    if (element.hasAttribute('href')) attrs += ` href="${element.getAttribute('href')}"`;
    if (element.hasAttribute('src')) attrs += ` src="${element.getAttribute('src')}"`;
    if (element.hasAttribute('type')) attrs += ` type="${element.getAttribute('type')}"`;
    if (element.hasAttribute('value')) attrs += ` value="${element.getAttribute('value')}"`;

    result += `${indent}<${tag}${id}${classes}${attrs}>\n`;

    // Get text content for specific elements
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'label'].includes(tag)) {
      const text = element.textContent.trim().substring(0, 100);
      if (text) {
        result += `${indent}  "${text}"\n`;
      }
    }

    // Recursively process children (limit to important elements)
    const children = Array.from(element.children).slice(0, 20);
    for (const child of children) {
      result += getSimplifiedDOM(child, depth + 1, maxDepth);
    }

    result += `${indent}</${tag}>\n`;
  }

  return result;
}

// Get meta information about the page
function getPageMetadata() {
  const metadata = {
    url: window.location.href,
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };

  return metadata;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContext') {
    try {
      const metadata = getPageMetadata();
      const dom = getSimplifiedDOM();

      const context = {
        metadata,
        dom: `Page: ${metadata.title}\nURL: ${metadata.url}\n\nDOM Structure:\n${dom}`,
        consoleLogs: [...consoleLogs]
      };

      sendResponse(context);
    } catch (error) {
      sendResponse({
        dom: 'Error accessing DOM',
        consoleLogs: [`Error: ${error.message}`]
      });
    }
    return true; // Keep the message channel open for async response
  }
});

// Notify that content script is ready
console.log('AI Assistant content script loaded');

// MonkaiScripter: Execute user scripts
async function loadAndExecuteScripts() {
  const result = await chrome.storage.local.get(['monkaiScripts']);
  const scripts = result.monkaiScripts || [];
  const currentUrl = window.location.href;

  scripts.forEach(script => {
    if (!script.enabled) return;

    // Match URL pattern
    if (matchesPattern(currentUrl, script.urlPattern)) {
      try {
        console.log(`[MonkaiScripter] Running: ${script.name}`);
        // Execute script in page context
        const scriptElement = document.createElement('script');
        scriptElement.textContent = `
          (function() {
            try {
              ${script.code}
            } catch (e) {
              console.error('[MonkaiScripter] Error in ${script.name.replace(/'/g, "\\'")}:', e);
            }
          })();
        `;
        (document.head || document.documentElement).appendChild(scriptElement);
        scriptElement.remove();
      } catch (error) {
        console.error(`[MonkaiScripter] Failed to execute ${script.name}:`, error);
      }
    }
  });
}

// Simple URL pattern matching
function matchesPattern(url, pattern) {
  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '\\?');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(url);
}

// Load scripts on page load
loadAndExecuteScripts();

// Listen for script updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scriptsUpdated') {
    console.log('[MonkaiScripter] Scripts updated, reloading...');
    loadAndExecuteScripts();
  }
});
