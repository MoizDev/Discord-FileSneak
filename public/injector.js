// This script runs in Discord's MAIN WORLD (same JS context as React/Lexical)
// Loaded via chrome.runtime.getURL() to bypass Discord's CSP

console.log('[DDU MAINWORLD] Bridge script loaded and executing');
window.dispatchEvent(new CustomEvent('ddu-bridge-ready'));

// ── Shared helpers ───────────────────────────────────────────────

function getChannelId() {
  const pathParts = location.pathname.split('/');
  return pathParts[pathParts.length - 1];
}

function getDiscordToken() {
  let token = null;

  // Method 1: iframe trick to access localStorage
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const raw = iframe.contentWindow.localStorage.getItem('token');
    iframe.remove();
    if (raw) {
      token = raw.replace(/^"|"$/g, '');
    }
  } catch (e) {
    console.error('[DDU MAINWORLD] iframe localStorage failed:', e);
  }

  // Method 2: webpack module internals
  if (!token) {
    try {
      webpackChunkdiscord_app.push([["ddu_extract"], {}, (req) => {
        for (const id in req.c) {
          const mod = req.c[id]?.exports;
          if (mod?.default?.getToken) {
            const t = mod.default.getToken();
            if (typeof t === 'string' && t.length > 10) {
              token = t;
            }
          }
        }
      }]);
    } catch (e) {
      console.error('[DDU MAINWORLD] Webpack token extraction failed:', e);
    }
  }

  return token;
}

async function sendSingleMessage(channelId, token, content) {
  const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText}`);
  }
  return res;
}

// ── Single message send (existing) ───────────────────────────────

window.addEventListener('ddu-inject-message', async (e) => {
  const linkText = e.detail;
  console.log('[DDU MAINWORLD] Received inject request:', linkText);

  const channelId = getChannelId();
  if (!channelId || channelId === 'channels') {
    console.error('[DDU MAINWORLD] Could not determine channel ID');
    return;
  }

  const token = getDiscordToken();
  if (!token) {
    console.error('[DDU MAINWORLD] Could not get Discord token. Falling back to paste.');
    const editor = document.querySelector('[class*="textArea"][class*="__"], [class*="channelTextArea"] textarea');
    if (editor) {
      editor.focus();
      document.execCommand('insertText', false, linkText);
    }
    return;
  }

  console.log('[DDU MAINWORLD] Token acquired. Sending message via Discord API...');

  try {
    await sendSingleMessage(channelId, token, linkText);
    console.log('[DDU MAINWORLD] ✅ Message sent successfully!');
    window.dispatchEvent(new CustomEvent('ddu-send-result', { detail: { success: true } }));
  } catch (err) {
    console.error('[DDU MAINWORLD] ❌ Send failed:', err);
    window.dispatchEvent(new CustomEvent('ddu-send-result', { detail: { success: false, error: err.message } }));
  }
});

// ── Chunked message send (new — for long text) ──────────────────

window.addEventListener('ddu-send-chunks', async (e) => {
  const chunks = e.detail; // string[]
  console.log(`[DDU MAINWORLD] Received ${chunks.length} chunks to send`);

  const channelId = getChannelId();
  if (!channelId || channelId === 'channels') {
    window.dispatchEvent(new CustomEvent('ddu-chunks-result', { detail: { success: false, error: 'No channel ID' } }));
    return;
  }

  const token = getDiscordToken();
  if (!token) {
    window.dispatchEvent(new CustomEvent('ddu-chunks-result', { detail: { success: false, error: 'No token' } }));
    return;
  }

  try {
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[DDU MAINWORLD] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      await sendSingleMessage(channelId, token, chunks[i]);
      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
    console.log('[DDU MAINWORLD] ✅ All chunks sent!');
    window.dispatchEvent(new CustomEvent('ddu-chunks-result', { detail: { success: true, count: chunks.length } }));
  } catch (err) {
    console.error('[DDU MAINWORLD] ❌ Chunk send failed:', err);
    window.dispatchEvent(new CustomEvent('ddu-chunks-result', { detail: { success: false, error: err.message } }));
  }
});

