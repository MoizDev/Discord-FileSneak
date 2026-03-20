const DEFAULTS = {
  autoSend: true,
  hiddenLink: true,
  pdfFormat: true,
  sizeThreshold: 10,
  uploadCount: 0,
  dataSavedMB: 0
};

// ── Load settings ─────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get(DEFAULTS, (data) => {
    // Toggles
    (document.getElementById('autoSend') as HTMLInputElement).checked = data.autoSend;
    (document.getElementById('hiddenLink') as HTMLInputElement).checked = data.hiddenLink;
    (document.getElementById('pdfFormat') as HTMLInputElement).checked = data.pdfFormat;

    // Number
    (document.getElementById('sizeThreshold') as HTMLInputElement).value = String(data.sizeThreshold);

    // Stats
    document.getElementById('uploadCount')!.textContent = String(data.uploadCount);
    const saved = data.dataSavedMB;
    document.getElementById('dataSaved')!.textContent = saved >= 1024 
      ? (saved / 1024).toFixed(1) + ' GB' 
      : saved.toFixed(1) + ' MB';

    // Auth status
    checkAuthStatus();
  });
}

// ── Check Auth ────────────────────────────────────────
function checkAuthStatus() {
  chrome.storage.local.get(['driveToken', 'driveTokenExpiry'], (data) => {
    const btn = document.getElementById('authBtn')!;
    const info = document.getElementById('token-info')!;

    if (data.driveToken && data.driveTokenExpiry && Date.now() < data.driveTokenExpiry) {
      btn.textContent = 'Sign Out';
      btn.className = 'action-btn signed-in';

      const mins = Math.round((data.driveTokenExpiry - Date.now()) / 60000);
      info.textContent = `Token expires in ${mins} min`;
    } else {
      btn.textContent = 'Sign In';
      btn.className = 'action-btn';
      info.textContent = 'Manage your Google Drive connection';
    }
  });
}

// ── Save a single setting ─────────────────────────────
function saveSetting(key: string, value: any) {
  chrome.storage.local.set({ [key]: value }, () => {
    showToast('Settings saved');
  });
}

// ── Toast notification ────────────────────────────────
function showToast(msg: string) {
  let toast = document.querySelector('.toast') as HTMLElement;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}

// ── Event Listeners ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Toggle: Auto-send
  document.getElementById('autoSend')!.addEventListener('change', (e) => {
    saveSetting('autoSend', (e.target as HTMLInputElement).checked);
  });

  // Toggle: Hidden link
  document.getElementById('hiddenLink')!.addEventListener('change', (e) => {
    saveSetting('hiddenLink', (e.target as HTMLInputElement).checked);
  });

  // Toggle: PDF Format
  document.getElementById('pdfFormat')!.addEventListener('change', (e) => {
    saveSetting('pdfFormat', (e.target as HTMLInputElement).checked);
  });

  // Number: Size threshold
  const sizeInput = document.getElementById('sizeThreshold') as HTMLInputElement;

  sizeInput.addEventListener('change', () => {
    let val = parseInt(sizeInput.value) || 10;
    val = Math.max(1, Math.min(500, val));
    sizeInput.value = String(val);
    saveSetting('sizeThreshold', val);
  });

  document.getElementById('sizeDown')!.addEventListener('click', () => {
    let val = parseInt(sizeInput.value) || 10;
    val = Math.max(1, val - 5);
    sizeInput.value = String(val);
    saveSetting('sizeThreshold', val);
  });

  document.getElementById('sizeUp')!.addEventListener('click', () => {
    let val = parseInt(sizeInput.value) || 10;
    val = Math.min(500, val + 5);
    sizeInput.value = String(val);
    saveSetting('sizeThreshold', val);
  });

  // Auth button
  document.getElementById('authBtn')!.addEventListener('click', () => {
    chrome.storage.local.get(['driveToken', 'driveTokenExpiry'], (data) => {
      if (data.driveToken && data.driveTokenExpiry && Date.now() < data.driveTokenExpiry) {
        // Sign out — clear the token
        chrome.storage.local.remove(['driveToken', 'driveTokenExpiry'], () => {
          checkAuthStatus();
          showToast('Signed out');
        });
      } else {
        // Sign in — trigger the OAuth flow via background script
        chrome.runtime.sendMessage({ action: 'getAuthToken' }, (response) => {
          if (response?.token) {
            checkAuthStatus();
            showToast('Connected!');
          } else {
            showToast('Auth failed: ' + (response?.error || 'Unknown'));
          }
        });
      }
    });
  });

  // Reset button
  document.getElementById('resetBtn')!.addEventListener('click', () => {
    if (confirm('Reset all settings and clear saved data?')) {
      chrome.storage.local.clear(() => {
        loadSettings();
        showToast('Everything reset');
      });
    }
  });

  // Listen for background stats updates in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.uploadCount || changes.dataSavedMB) {
        loadSettings();
      }
    }
  });
});
