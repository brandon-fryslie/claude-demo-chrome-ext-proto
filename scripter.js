// MonkaiScripter functionality
let scripts = [];
let currentEditingScript = null;

// Load scripts from storage
async function loadScripts() {
  const result = await chrome.storage.local.get(['monkaiScripts']);
  if (result.monkaiScripts) {
    scripts = result.monkaiScripts;
    renderScriptList();
  }
}

// Save scripts to storage
async function saveScripts() {
  await chrome.storage.local.set({ monkaiScripts: scripts });
  // Notify content scripts to reload
  chrome.runtime.sendMessage({ action: 'scriptsUpdated' });
}

// Render script list
function renderScriptList() {
  const scriptList = document.getElementById('scriptList');
  scriptList.innerHTML = '';

  if (scripts.length === 0) {
    scriptList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No scripts yet. Create your first script!</div>';
    return;
  }

  scripts.forEach((script, index) => {
    const item = document.createElement('div');
    item.className = 'script-item';
    item.innerHTML = `
      <div class="script-item-header">
        <span class="script-item-name">${escapeHtml(script.name)}</span>
        <div class="script-item-toggle ${script.enabled ? 'enabled' : ''}" data-index="${index}"></div>
      </div>
      <div class="script-item-url">${escapeHtml(script.urlPattern)}</div>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('script-item-toggle')) {
        editScript(index);
      }
    });

    const toggle = item.querySelector('.script-item-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleScript(index);
    });

    scriptList.appendChild(item);
  });
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toggle script enabled/disabled
async function toggleScript(index) {
  scripts[index].enabled = !scripts[index].enabled;
  await saveScripts();
  renderScriptList();
}

// Edit script
function editScript(index) {
  currentEditingScript = index;
  const script = scripts[index];

  document.getElementById('scriptName').value = script.name;
  document.getElementById('scriptCode').value = script.code;
  document.getElementById('scriptUrl').value = script.urlPattern;
  document.getElementById('scriptEnabled').checked = script.enabled;

  document.getElementById('scriptList').style.display = 'none';
  document.getElementById('scriptEditor').classList.remove('hidden');
  document.getElementById('deleteScriptBtn').style.display = 'block';
}

// New script
function newScript() {
  currentEditingScript = null;

  document.getElementById('scriptName').value = '';
  document.getElementById('scriptCode').value = '// Write your JavaScript code here\n// This script will run on pages matching the URL pattern\n\nconsole.log(\'MonkaiScript running!\');';
  document.getElementById('scriptUrl').value = '*://*/*';
  document.getElementById('scriptEnabled').checked = true;

  document.getElementById('scriptList').style.display = 'none';
  document.getElementById('scriptEditor').classList.remove('hidden');
  document.getElementById('deleteScriptBtn').style.display = 'none';
}

// Close editor
function closeEditor() {
  currentEditingScript = null;
  document.getElementById('scriptList').style.display = 'flex';
  document.getElementById('scriptEditor').classList.add('hidden');
}

// Save script
async function saveScript() {
  const name = document.getElementById('scriptName').value.trim();
  const code = document.getElementById('scriptCode').value;
  const urlPattern = document.getElementById('scriptUrl').value.trim();
  const enabled = document.getElementById('scriptEnabled').checked;

  if (!name) {
    alert('Please enter a script name');
    return;
  }

  if (!urlPattern) {
    alert('Please enter a URL pattern');
    return;
  }

  const script = {
    id: currentEditingScript !== null ? scripts[currentEditingScript].id : Date.now().toString(),
    name,
    code,
    urlPattern,
    enabled
  };

  if (currentEditingScript !== null) {
    scripts[currentEditingScript] = script;
  } else {
    scripts.push(script);
  }

  await saveScripts();
  closeEditor();
  renderScriptList();
}

// Delete script
async function deleteScript() {
  if (currentEditingScript === null) return;

  if (confirm('Are you sure you want to delete this script?')) {
    scripts.splice(currentEditingScript, 1);
    await saveScripts();
    closeEditor();
    renderScriptList();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadScripts();

  document.getElementById('newScriptBtn').addEventListener('click', newScript);
  document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
  document.getElementById('saveScriptBtn').addEventListener('click', saveScript);
  document.getElementById('deleteScriptBtn').addEventListener('click', deleteScript);
});
