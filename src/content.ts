console.log('Discord Drive Uploader content script loaded.');

let isUploading = false;

// UI Overlay functions
function showOverlay(file: File) {
  const existing = document.getElementById('ddu-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ddu-overlay';
  overlay.innerHTML = `
    <div class="ddu-modal">
      <h2>File is too powerful! 🚀</h2>
      <p><b>${file.name}</b></p>
      <p>Size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
      <p>Would you like to bypass the Discord limit by uploading to Google Drive?</p>
      <div id="ddu-progress-container" style="display: none; margin-top: 16px;">
        <p id="ddu-status" style="margin-bottom: 8px; font-weight: 500;">Starting upload...</p>
        <div style="width: 100%; background: #2b2d31; border-radius: 6px; height: 12px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
          <div id="ddu-progress-fill" style="width: 0%; height: 100%; background: #5865F2; transition: width 0.2s ease-out;"></div>
        </div>
      </div>
      <div id="ddu-buttons">
        <button id="ddu-btn-cancel" class="ddu-button" style="background: #3c3f45; margin-right: 8px;">Cancel</button>
        <button id="ddu-btn-upload" class="ddu-button">Upload to Drive</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('ddu-btn-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('ddu-btn-upload')?.addEventListener('click', async () => {
    const btnContainer = document.getElementById('ddu-buttons');
    const progContainer = document.getElementById('ddu-progress-container');
    const status = document.getElementById('ddu-status');
    
    if (btnContainer && progContainer) {
      btnContainer.style.display = 'none';
      progContainer.style.display = 'block';
    }

    try {
      await uploadToDrive(file, status!);
      overlay.remove();
    } catch (err: any) {
      if (status) status.innerText = 'Error: ' + err.message;
      if (btnContainer) btnContainer.style.display = 'block';
    }
  });
}

async function uploadToDrive(file: File, statusEl: HTMLElement) {
  return new Promise<void>((resolve, reject) => {
    statusEl.innerText = 'Authenticating...';
    // Ask background script for the auth token
    chrome.runtime.sendMessage({ action: 'getAuthToken' }, async (response) => {
      if (response?.error) {
        return reject(new Error(response.error));
      }

      const token = response.token;
      if (!token) return reject(new Error('Failed to get auth token.'));

      try {
        statusEl.innerText = 'Preparing to upload...';
        
        // Multipart upload form data
        const metadata = new Blob([JSON.stringify({ name: file.name })], { type: 'application/json' });
        const formData = new FormData();
        formData.append('metadata', metadata);
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            const fill = document.getElementById('ddu-progress-fill');
            if (fill) fill.style.width = percent + '%';
            statusEl.innerText = `Uploading to Google Drive... ${percent}%`;
          }
        };

        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const fileId = data.id;

              statusEl.innerText = 'Setting link permissions...';
              await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + token,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: 'reader', type: 'anyone' })
              });

              const isImage = file.type.startsWith('image/');
              const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

              // For images, use 'view' instead of 'download' so Google doesn't force attachment headers.
              // We also append the image extension as a hash (e.g., #.png) so Discord's scraper parses it natively!
              const exportAction = isImage ? 'view' : 'download';
              const extHash = isImage ? (file.name.match(/\.[0-9a-z]+$/i)?.[0] || '.png') : '';
              
              const directLink = `https://drive.google.com/uc?export=${exportAction}&id=${fileId}${extHash}`;

              // Track upload stats
              chrome.storage.local.get({ uploadCount: 0, dataSavedMB: 0 }, (stats) => {
                chrome.storage.local.set({
                  uploadCount: stats.uploadCount + 1,
                  dataSavedMB: +(stats.dataSavedMB + file.size / 1024 / 1024).toFixed(2)
                });
              });

              // Read user preferences for link format and auto-send
              chrome.storage.local.get({ hiddenLink: true, autoSend: true, pdfFormat: true }, (prefs) => {
                let linkText = directLink;

                if (isPdf && prefs.pdfFormat) {
                  linkText = `[[${file.name}]](${directLink})`;
                } else if (prefs.hiddenLink) {
                  linkText = `[⠀](${directLink})`;
                }

                if (prefs.autoSend) {
                  injectLink(linkText);
                } else {
                  // Just paste into textarea, don't auto-send
                  navigator.clipboard.writeText(linkText).then(() => {
                    alert('Upload complete! Link copied to clipboard. Paste it with Ctrl+V.');
                  });
                }
                resolve();
              });
            } catch (innerErr) {
              reject(innerErr);
            }
          } else {
            reject(new Error('Upload failed: ' + xhr.responseText));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);

      } catch (err) {
        reject(err);
      }
    });
  });
}
// ─── MAIN WORLD BRIDGE (File-based to bypass Discord's CSP) ─────

let bridgeReady = false;

function injectMainWorldBridge() {
  console.log('[DDU ISOLATED] Injecting bridge via file URL (bypasses CSP)...');

  // Listen for the bridge's "I'm alive" signal
  window.addEventListener('ddu-bridge-ready', () => {
    bridgeReady = true;
    console.log('[DDU ISOLATED] ✅ Bridge is alive in main world!');
  });

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injector.js');
  script.onload = () => {
    console.log('[DDU ISOLATED] ✅ injector.js loaded successfully');
    script.remove();
  };
  script.onerror = (err) => {
    console.error('[DDU ISOLATED] ❌ Failed to load injector.js:', err);
  };
  (document.head || document.documentElement).appendChild(script);
}

injectMainWorldBridge();

function injectLink(linkText: string) {
  console.log('[DDU ISOLATED] injectLink called. Bridge alive?', bridgeReady);

  if (!bridgeReady) {
    navigator.clipboard.writeText(linkText).then(() => {
      alert('Upload complete! Link copied to clipboard. Press Ctrl+V to paste it.');
    });
    return;
  }

  // Listen for the result from the main world bridge
  const onResult = ((e: CustomEvent) => {
    window.removeEventListener('ddu-send-result', onResult as EventListener);
    if (e.detail?.success) {
      console.log('[DDU ISOLATED] Message sent successfully!');
    } else {
      console.error('[DDU ISOLATED] Send failed:', e.detail?.error);
      navigator.clipboard.writeText(linkText).then(() => {
        alert('Auto-send failed. Link copied to clipboard — press Ctrl+V and Enter.');
      });
    }
  }) as EventListener;
  window.addEventListener('ddu-send-result', onResult);

  window.dispatchEvent(new CustomEvent('ddu-inject-message', { detail: linkText }));
}

// Helper: get the threshold in bytes from settings
function getSizeThreshold(callback: (bytes: number) => void) {
  chrome.storage.local.get({ sizeThreshold: 10 }, (data) => {
    callback(data.sizeThreshold * 1024 * 1024);
  });
}

// 1. Intercept standard File Input triggers (clicking the + button)
document.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.type === 'file' && target.files?.length) {
    const file = target.files[0];
    getSizeThreshold((threshold) => {
      if (file.size > threshold) {
        e.preventDefault();
        e.stopPropagation();
        target.value = '';
        showOverlay(file);
      }
    });
  }
}, { capture: true });

// 2. Intercept Drag and Drop
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  const files = Array.from(e.dataTransfer.files);
  getSizeThreshold((threshold) => {
    const largeFile = files.find(f => f.size > threshold);
    if (largeFile) {
      // Check if it's a .txt file — offer chunked send instead
      if (largeFile.name.toLowerCase().endsWith('.txt') || largeFile.type === 'text/plain') {
        chrome.storage.local.get({ longTextSplit: true }, (prefs) => {
          if (prefs.longTextSplit) {
            e.preventDefault();
            e.stopPropagation();
            handleTextFile(largeFile);
            return;
          }
        });
      }
      e.preventDefault();
      e.stopPropagation();
      showOverlay(largeFile);
    }
  });
}, { capture: true });

// ─── LONG TEXT SPLITTING ────────────────────────────────────────

const DISCORD_CHAR_LIMIT = 2000;

function splitTextIntoChunks(text: string, limit: number = DISCORD_CHAR_LIMIT): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    let splitAt = limit;

    // Try to split at a double newline (paragraph boundary)
    const doubleNewline = remaining.lastIndexOf('\n\n', limit);
    if (doubleNewline > limit * 0.5) {
      splitAt = doubleNewline + 2;
    } else {
      // Try to split at a single newline
      const singleNewline = remaining.lastIndexOf('\n', limit);
      if (singleNewline > limit * 0.3) {
        splitAt = singleNewline + 1;
      } else {
        // Try to split at a space (word boundary)
        const space = remaining.lastIndexOf(' ', limit);
        if (space > limit * 0.3) {
          splitAt = space + 1;
        }
        // Else: hard cut at the limit
      }
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

function sendChunks(chunks: string[]) {
  if (!bridgeReady) {
    navigator.clipboard.writeText(chunks.join('')).then(() => {
      alert('Bridge not ready. Full text copied to clipboard.');
    });
    return;
  }

  const onResult = ((e: CustomEvent) => {
    window.removeEventListener('ddu-chunks-result', onResult as EventListener);
    if (e.detail?.success) {
      console.log(`[DDU ISOLATED] All ${e.detail.count} chunks sent!`);
    } else {
      console.error('[DDU ISOLATED] Chunk send failed:', e.detail?.error);
      alert('Failed to send some chunks: ' + (e.detail?.error || 'Unknown error'));
    }
  }) as EventListener;
  window.addEventListener('ddu-chunks-result', onResult);

  window.dispatchEvent(new CustomEvent('ddu-send-chunks', { detail: chunks }));
}

// Cache the long text setting synchronously so we can use it in the keydown handler
let longTextSplitEnabled = true;
chrome.storage.local.get({ longTextSplit: true }, (data) => {
  longTextSplitEnabled = data.longTextSplit;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.longTextSplit) {
    longTextSplitEnabled = changes.longTextSplit.newValue;
  }
});

// Intercept Enter on long messages in Discord's textarea
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  if (!longTextSplitEnabled) return;

  const textarea = document.querySelector('[class*="textArea"][class*="__"] [role="textbox"], [class*="channelTextArea"] textarea') as HTMLElement;
  if (!textarea) return;

  const text = (textarea as HTMLTextAreaElement).value || textarea.innerText || textarea.textContent || '';
  if (text.length <= DISCORD_CHAR_LIMIT) return;

  // Block the event synchronously BEFORE any async work
  e.preventDefault();
  e.stopImmediatePropagation();

  const chunks = splitTextIntoChunks(text);

  const proceed = confirm(
    `Your message is ${text.length.toLocaleString()} characters (${(text.length - DISCORD_CHAR_LIMIT).toLocaleString()} over limit).\n\n` +
    `Split into ${chunks.length} messages and send?\n\n` +
    `Cancel to go back and edit.`
  );

  if (!proceed) return;

  console.log(`[DDU ISOLATED] Long text: ${text.length} chars → ${chunks.length} chunks`);

  // Clear the editor using select-all + delete so React/Lexical stays in sync
  textarea.focus();
  document.execCommand('selectAll', false);
  document.execCommand('delete', false);

  sendChunks(chunks);
}, { capture: true });

// Handle .txt file uploads — read and send as chunked messages
function handleTextFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    if (text.length <= DISCORD_CHAR_LIMIT) {
      // Small enough to send as one message
      if (bridgeReady) {
        window.dispatchEvent(new CustomEvent('ddu-inject-message', { detail: text }));
      }
      return;
    }

    const chunks = splitTextIntoChunks(text);
    const proceed = confirm(
      `📄 "${file.name}" is ${text.length.toLocaleString()} characters.\n\n` +
      `This will be split into ${chunks.length} messages and sent sequentially.\n\n` +
      `Continue?`
    );

    if (proceed) {
      sendChunks(chunks);
    }
  };
  reader.readAsText(file);
}

