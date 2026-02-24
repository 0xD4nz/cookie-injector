# 🍪 Cookie Injector

A sleek Chrome extension for managing cookies and spoofing User-Agent strings. Built with a premium dark UI.

## ✨ Features

### Cookie Manager
- **Export** cookies in 3 formats: JSON, Netscape, Header String
- **Import** cookies from JSON, Netscape, or Header String
- **Copy** to clipboard with one click
- **Save File** — download cookies as `.json` or `.txt`
- **Load File** — import cookies from file (`.json`, `.txt`, `.cookies`)
- **Paste** from clipboard directly into import area
- **Auto-refresh** — export view updates in real-time
- **Clear** all cookies for the current domain
- **Inject** imported cookies and auto-reload the page

### User-Agent Spoofer
- Quick switch presets: **Windows**, **MacOS**, **Linux**, **iPhone**, **Android**, **Random**
- **Custom UA** input with Enter key support
- **Reset** to default User-Agent
- Removes `sec-ch-ua` headers for cleaner spoofing
- Persists active UA across popup sessions

## 📦 Installation

1. Download or clone this repository
2. Open `chrome://extensions/` in your browser
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `cookie-injector-pro` folder

## 🔐 Permissions

| Permission | Usage |
|---|---|
| `cookies` | Read, write, and delete cookies |
| `activeTab` | Access the current tab's URL |
| `storage` | Persist active User-Agent selection |
| `declarativeNetRequest` | Modify request headers for UA spoofing |
| `host_permissions: <all_urls>` | Operate on any website |

## 🛠 Tech Stack

- **Manifest V3** — latest Chrome extension standard
- **Vanilla JS** — no frameworks, fast and lightweight
- **Inter + JetBrains Mono** — premium typography
- **CSS Variables** — consistent theming

## 📄 License

MIT
