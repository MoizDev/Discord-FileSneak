<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Discord-Integration-5865F2?style=for-the-badge&logo=discord&logoColor=white" />
  <img src="https://img.shields.io/badge/Google%20Drive-API-FBBC04?style=for-the-badge&logo=googledrive&logoColor=white" />
</p>

<h1 align="center">🕵️ Discord FileSneak</h1>

<p align="center">
  <strong>Seamlessly bypass Discord's file size limit by sneaking large uploads through Google Drive.</strong>
</p>

<p align="center">
  <em>Drop it. Upload it. Sneak it. — No one even notices.</em>
</p>

---

## ✨ What It Does

Discord limits file uploads to **10 MB** (or 50 MB with Nitro). FileSneak intercepts oversized files, silently uploads them to your Google Drive, and posts a direct link in chat — all in one smooth motion. The link is formatted as an invisible `[.](url)` markdown dot, making it feel completely native.

**Before FileSneak:**
> ❌ *"Your files are too powerful"* → compress, convert, re-export, give up

**After FileSneak:**
> ✅ Drop any file → progress bar → link appears in chat → done

---

## 🎬 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  You drop a 50MB file into Discord                      │
│                     ↓                                   │
│  FileSneak intercepts it before Discord sees it         │
│                     ↓                                   │
│  Beautiful overlay asks: "Upload to Drive?"             │
│                     ↓                                   │
│  File uploads to Google Drive with live progress bar    │
│                     ↓                                   │
│  Direct link is auto-sent in chat as [.](url)           │
│                     ↓                                   │
│  Your friends click the tiny dot → file downloads       │
└─────────────────────────────────────────────────────────┘
```

---

## 🧩 Features

| Feature | Description |
|---|---|
| 🚀 **Auto-upload** | Intercepts files exceeding the threshold via drag-and-drop or file picker |
| 📊 **Progress bar** | Real-time upload progress with status updates |
| 🔗 **Invisible links** | Sends as `[.](url)` — a nearly invisible dot that embeds the link |
| ⚡ **Auto-send** | Message is sent automatically via Discord's API — no Enter key needed |
| 🔐 **Google OAuth** | Secure authentication with account chooser and persistent token caching |
| ⚙️ **Settings panel** | Configurable size threshold, link format, auto-send toggle, and upload stats |
| 🧠 **Smart persistence** | Auth tokens survive browser restarts via `chrome.storage.local` |

---

## 🛠️ Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A Google Cloud project with the Drive API enabled
- A Chrome browser

### 1. Clone & Install

```bash
git clone https://github.com/MoizDev/Discord-FileSneak.git
cd Discord-FileSneak
npm install
```

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **OAuth Client ID**
5. Select **Web Application**
6. Add your extension's redirect URI to **Authorized redirect URIs**:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
   > To find your extension ID: load the unpacked extension first (step 3 below), then copy the ID from `chrome://extensions`
7. Copy your **Client ID** and update it in:
   - `manifest.json` → `oauth2.client_id`
   - `src/background.ts` → `clientId` constant

### 3. Build & Load

```bash
npm run build
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` folder
4. Pin the extension from the toolbar

### 4. Configure Redirect URI

After loading the extension for the first time:
1. Copy the extension ID from `chrome://extensions`
2. Go back to Google Cloud Console → your OAuth credential
3. Add the redirect URI: `https://<extension-id>.chromiumapp.org/`
4. Save and reload the extension

---

## ⚙️ Settings

Click the extension icon in Chrome's toolbar to access the settings panel:

- **Auto-send message** — Automatically send the link after upload (on/off)
- **Invisible link format** — Use `[.](url)` for a hidden link or show the full URL
- **Size threshold** — Set the minimum file size to trigger interception (1–500 MB)
- **Google Account** — Sign in/out of Google Drive, view token expiry
- **Stats** — Track total files uploaded and data bypassed

---

## 🏗️ Architecture

```
Discord FileSneak
├── src/
│   ├── content.ts        # Intercepts files, shows overlay, uploads to Drive
│   ├── background.ts     # Service worker — handles Google OAuth flow
│   ├── popup.html/ts/css # Settings panel UI
│   └── style.css         # Overlay styles injected into Discord
├── public/
│   └── injector.js       # Main-world bridge — sends messages via Discord API
├── manifest.json         # Chrome Extension Manifest V3
└── vite.config.ts        # Build config with @crxjs/vite-plugin
```

### Why a Main-World Bridge?

Chrome extension content scripts run in an **isolated JavaScript world**. They can see the DOM but cannot:
- Create trusted `ClipboardEvent`s (Chrome strips the data)
- Use `execCommand` without corrupting Discord's Lexical editor state
- Dispatch `KeyboardEvent`s that pass Discord's `isTrusted` check

The solution: `injector.js` is loaded as a file-based `<script>` tag (bypassing Discord's CSP) into Discord's **main world**, where it:
1. Extracts the Discord auth token via an iframe localStorage trick
2. Sends the message directly through Discord's HTTP API
3. Communicates with the content script via `CustomEvent`s across the world boundary

---

## 🔒 Privacy & Security

- **Google tokens** are cached locally via `chrome.storage.local` and never leave your browser
- **Discord tokens** are read from your own browser session (never stored or transmitted externally)
- **Uploaded files** are set to "anyone with the link can view" on Google Drive
- **No analytics, no tracking, no external servers** — everything runs locally

---

## 📦 Tech Stack

- **TypeScript** — Type-safe extension code
- **Vite** + **@crxjs/vite-plugin** — Fast builds with HMR support
- **Chrome Manifest V3** — Modern extension platform
- **Google Drive API v3** — File upload and permission management
- **Discord API v9** — Direct message sending

---

## 📄 License

MIT — do whatever you want with it.

---

<p align="center">
  <strong>Built with 🫠 and way too many hours of reverse-engineering Discord's event system.</strong>
</p>
