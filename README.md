# Free AI - VS Code Extension

A lightweight VS Code extension that dynamically loads and aggregates free-tier AI models from OpenCode, Nvidia, and OpenRouter using just your API keys. Chat with AI, get inline code completions, and send code selections for context.

## Features

- **💬 Chat Sidebar** - Interactive chat with free models (Ctrl+Shift+C)
- **👻 Inline Completions** - Ghost text appears as you type (automatic)
- **📎 Send Code to Chat** - Select code + Ctrl+L to add as reference
- **💾 Persistent Sessions** - Chat history saved globally across workspaces
- **⚡ Slash Commands** - `/clear`, `/models`, `/sessions`, `/help`
- **🔒 Privacy First** - Zero telemetry, encrypted API key storage

## Free Models Available

| Model | Endpoint |
|-------|----------|
| DeepSeek V4 Flash Free | OpenAI-compatible |
| MiMo-V2.5 Free | OpenAI-compatible |
| Qwen3.6 Plus Free | Anthropic-compatible |
| MiniMax M3 Free | OpenAI-compatible |
| Nemotron 3 Ultra Free | OpenAI-compatible |
| North Mini Code Free | OpenAI-compatible |
| Big Pickle | OpenAI-compatible |

## Prerequisites

- VS Code 1.85+
- [OpenCode Zen API key](https://opencode.ai/auth) (free to sign up)

## Installation

### Manual Install from VSIX

1. **Build or download the VSIX**

   **Build from source:**
   ```bash
   git clone <repo-url>
   cd free-ai
   npm install
   npm run bundle
   npm run package
   ```
   The VSIX will be created in the project root.

   **Or download** the latest `.vsix` from the [Releases page](<github-releases-url>).

2. **Install in VS Code**

   - Open VS Code
   - Press `Ctrl+Shift+X` to open Extensions
   - Click the `...` (More Actions) menu
   - Select **Install from VSIX...**
   - Choose the `.vsix` file

3. **Restart VS Code**

### Quick Install (from source)

```bash
git clone <repo-url>
cd free-ai
npm install
npm run bundle
code --install-extension free-ai-0.1.0.vsix
```

## Configuration

### 1. Get Your API Key

1. Go to [OpenCode Zen](https://opencode.ai/auth)
2. Sign up and create an API key
3. Copy the key (starts with `sk-...`)

### 2. Set Up the Extension

**Option A: Environment Variable (Recommended)**
```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export OPENCODE_API_KEY="sk-your-key-here"
```
Restart VS Code.

**Option B: VS Code Command**

1. Press `Ctrl+Shift+P` → `Free AI: Configure`
2. Paste your API key when prompted
3. The key is saved encrypted in VS Code's secret storage

## Usage

### Open Chat
- Press `Ctrl+Shift+C` or click the Free AI icon in the activity bar

### Send Code for Context
1. Select code in the editor
2. Press `Ctrl+L` (or right-click → Free AI: Send Selection to Chat)
3. The code appears as a reference in the chat input area

### Chat Commands
| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear current chat session |
| `/models` | Select a different model |
| `/sessions` | Browse and load previous sessions |

### Inline Completions
- Start typing code - ghost text appears automatically after a brief pause
- Press `Tab` to accept the completion
- Keep typing to dismiss

### Select Model
- Use the dropdown in the chat header
- Or run `/models` in chat
- Or run `Ctrl+Shift+P` → `Free AI: Select Model`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open chat sidebar |
| `Ctrl+L` | Send selected code to chat |
| `Enter` | Send message (in chat input) |
| `Shift+Enter` | New line (in chat input) |

## Privacy & Security

- **No telemetry** - Zero data collection
- **No user tracking** - No analytics, no user identity
- **Encrypted storage** - API key stored in VS Code's encrypted secret storage
- **Direct API calls** - All requests go directly to `opencode.ai/zen/v1/*`
- **Open source** - Full source code available for audit

## Commands

| Command ID | Description |
|------------|-------------|
| `freeai.openChat` | Open chat sidebar |
| `freeai.sendSelectionToChat` | Send selection to chat |
| `freeai.configure` | Configure API key |
| `freeai.clearChat` | Clear current session |
| `freeai.selectModel` | Select a model |
| `freeai.selectSession` | Load a previous session |

## Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Bundle with esbuild
npm run bundle

# Package as VSIX
npm run package

# Output: free-ai-0.1.0.vsix
```

## Development

```bash
# Watch mode for TypeScript
npm run watch

# Watch mode for esbuild
npm run watch:bundle

# Run extension in debug mode
# Press F5 in VS Code (requires the extension to be open in a separate window)
```

## License

MIT
