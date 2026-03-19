// This script runs in Discord's MAIN WORLD (same JS context as React/Lexical)
// Loaded via chrome.runtime.getURL() to bypass Discord's CSP

console.log('[DDU MAINWORLD] Bridge script loaded and executing');
window.dispatchEvent(new CustomEvent('ddu-bridge-ready'));

window.addEventListener('ddu-inject-message', async (e) => {
  const linkText = e.detail;
  console.log('[DDU MAINWORLD] Received inject request:', linkText);

  // 1. Get the channel ID from the current URL
  // URL format: /channels/{guild_id}/{channel_id} or /channels/@me/{channel_id}
  const pathParts = location.pathname.split('/');
  const channelId = pathParts[pathParts.length - 1];
  console.log('[DDU MAINWORLD] Channel ID:', channelId);

  if (!channelId || channelId === 'channels') {
    console.error('[DDU MAINWORLD] Could not determine channel ID from URL:', location.pathname);
    return;
  }

  // 2. Get Discord's auth token
  let token = null;

  // Method 1: iframe trick to access localStorage (bypasses extension script sandbox)
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const raw = iframe.contentWindow.localStorage.getItem('token');
    iframe.remove();
    if (raw) {
      token = raw.replace(/^"|"$/g, ''); // Strip surrounding quotes
      console.log('[DDU MAINWORLD] Token from iframe localStorage. Length:', token.length, 'Type:', typeof token);
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
              console.log('[DDU MAINWORLD] Token from webpack. Length:', token.length, 'Type:', typeof token);
            }
          }
        }
      }]);
    } catch (e) {
      console.error('[DDU MAINWORLD] Webpack token extraction failed:', e);
    }
  }

  if (!token) {
    console.error('[DDU MAINWORLD] Could not get Discord token. Falling back to paste-only.');
    // Fallback: just paste the text, user presses Enter manually
    const editor = document.querySelector('[class*="textArea"][class*="__"], [class*="channelTextArea"] textarea');
    if (editor) {
      editor.focus();
      document.execCommand('insertText', false, linkText);
    }
    return;
  }

  console.log('[DDU MAINWORLD] Token acquired. Sending message via Discord API...');

  // 3. Send the message directly via Discord's API
  try {
    const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: linkText })
    });

    if (res.ok) {
      console.log('[DDU MAINWORLD] ✅ Message sent successfully via Discord API!');
      window.dispatchEvent(new CustomEvent('ddu-send-result', { detail: { success: true } }));
    } else {
      const errText = await res.text();
      console.error('[DDU MAINWORLD] ❌ API error:', res.status, errText);
      window.dispatchEvent(new CustomEvent('ddu-send-result', { detail: { success: false, error: errText } }));
    }
  } catch (err) {
    console.error('[DDU MAINWORLD] ❌ Fetch failed:', err);
    window.dispatchEvent(new CustomEvent('ddu-send-result', { detail: { success: false, error: err.message } }));
  }
});
