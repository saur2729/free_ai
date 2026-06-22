<p align="center">
  <img src="https://raw.githubusercontent.com/saur2729/free_ai/main/media/icon.png" width="128" height="128" alt="Free AI logo">
</p>

<h1 align="center">Free AI — VS Code Extension</h1>

<p align="center">
  A lightweight extension that aggregates free-tier AI models — chat, inline completions, code references, and session management in a privacy-first package.
</p>

## Features

- **Chat Sidebar** (`Ctrl+Shift+C`) — Full-featured chat with model failover, message queuing, and keyboard-navigable session history
- **Inline Completions** — Ghost text as you type (accept with `Tab`, dismiss by continuing)
- **Send Code to Chat** — Select code → `Ctrl+L` or right-click → *Free AI: Send Selection to Chat*
- **Message Queuing** — Type while a response is pending; messages are batched and sent together in one API call
- **Slash Commands** — `/help`, `/clear`, `/new`, `/models`, `/sessions` with autocomplete popup
- **Model Failover** — Unavailable models auto-retry with the next model; colored system messages show retry status
- **Syntax Highlighting** — Code blocks rendered with highlight.js (11 languages)
- **Session Management** — Persistent sessions with search, keyboard navigation (Arrow keys, Enter to select)
- **Privacy First** — Zero telemetry, no user tracking, encrypted API key storage via VS Code secrets
- **Customizable** — Resizable input area, model picker with provider grouping, dark/light theme support

## Free Models

| Model | Endpoint |
|-------|----------|
| DeepSeek V4 Flash Free | OpenAI-compatible |
| MiMo-V2.5 Free | OpenAI-compatible |
| Qwen3.6 Plus Free | Anthropic-compatible |
| MiniMax M3 Free | OpenAI-compatible |
| Nemotron 3 Ultra Free | OpenAI-compatible |
| North Mini Code Free | OpenAI-compatible |
| Big Pickle | OpenAI-compatible |

## Quick Start

### 1. Install

```bash
git clone https://github.com/saur2729/free_ai.git
cd free_ai
npm install
npm run bundle
code --install-extension free-ai-0.1.0.vsix
```

Or install the `.vsix` from the [Releases page](https://github.com/saur2729/free_ai/releases).

### 2. Get an API Key

[Sign up at OpenCode Zen](https://opencode.ai/auth) and create a free API key.

### 3. Configure

**Option A — Environment Variable (recommended)**
```bash
export OPENCODE_API_KEY="sk-your-key-here"
```

**Option B — VS Code Command**
`Ctrl+Shift+P` → `Free AI: Configure` → paste your key

## Usage

### Open Chat
- **Keyboard:** `Ctrl+Shift+C`
- **Mouse:** Click the Free AI icon in the activity bar

### Send Code
1. Select code in the editor
2. `Ctrl+L` (or right-click → *Free AI: Send Selection to Chat*)
3. The selection appears as a reference in the chat input

### Commands
| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/clear` | Clear current chat |
| `/new` | Start a new session |
| `/models` | Open the model picker |
| `/sessions` | Browse and load past sessions |

Tip: Type `/` in the chat input to see the command popup.

### Message Queuing
Type additional messages while waiting for a response — they appear as a centered "N msgs queued" indicator and are batched into a single API call when the current response completes.

### Model Selection
- Dropdown in chat header
- `/models` slash command
- `Ctrl+Shift+P` → `Free AI: Select Model`

Failed models are automatically skipped for the remainder of the session.

## Commands

| ID | Description |
|----|-------------|
| `freeai.openChat` | Open chat sidebar |
| `freeai.sendSelectionToChat` | Send selection to chat |
| `freeai.configure` | Configure API key |
| `freeai.clearChat` | Clear current session |
| `freeai.selectModel` | Select a model |
| `freeai.selectSession` | Load a previous session |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+C` | Open chat sidebar |
| `Ctrl+L` | Send selected code to chat |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Escape` | Close modals / slash menu |

## Development

```bash
npm install
npm run compile     # TypeScript check
npm run bundle      # esbuild (parallel extension + highlight.js)
npm run package     # VSIX output
npm run watch       # TypeScript watch mode
```

Run with **F5** in VS Code with the extension workspace open.

## Privacy

- No telemetry, no analytics, no user tracking
- API keys stored in VS Code's encrypted secret storage
- All requests go directly to the configured API base URL
- Full source available for audit

## License

[MIT](LICENSE)
