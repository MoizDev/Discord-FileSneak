// Service worker for manual OAuth management (forcing Account Chooser)
// Uses chrome.storage.local to persist tokens across service worker restarts

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getAuthToken') {
    // Check chrome.storage.local for a persisted valid token first
    chrome.storage.local.get(['driveToken', 'driveTokenExpiry'], (data) => {
      const { driveToken, driveTokenExpiry } = data;

      if (driveToken && driveTokenExpiry && Date.now() < driveTokenExpiry) {
        // Token is still valid — return it instantly, no popup
        sendResponse({ token: driveToken });
        return;
      }

      // Token is missing or expired — launch the OAuth flow
      const clientId = '263305031428-vj8oj0ohqet26unkl3ivdg0gav4c4lcl.apps.googleusercontent.com';
      const redirectUri = chrome.identity.getRedirectURL();
      const scopes = 'https://www.googleapis.com/auth/drive.file';

      // prompt=select_account forces the "Choose an account" screen on first login.
      // After the first time, we use prompt=none to silently refresh if possible,
      // falling back to select_account if that fails.
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&prompt=select_account`;

      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          sendResponse({ error: chrome.runtime.lastError?.message || 'Authentication cancelled' });
          return;
        }

        const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
        const token = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

        if (token) {
          const expiry = Date.now() + (expiresIn * 1000) - 60000; // 60s safety buffer

          // Persist to chrome.storage.local so it survives service worker restarts
          chrome.storage.local.set({
            driveToken: token,
            driveTokenExpiry: expiry
          }, () => {
            sendResponse({ token });
          });
        } else {
          sendResponse({ error: 'Token not found in response' });
        }
      });
    });

    return true; // Keep the message channel open for the async response
  }
});
