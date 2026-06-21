import * as vscode from 'vscode';
import { getConfigManager, getApiClient, getSessionStorage, setCurrentSession } from '../extension';
import { ChatSession, ChatMessage, CodeReference, GlobalSessionStorage } from '../storage/globalStorage';
import { ApiClient } from '../api/ApiClient';
import { logError, logInfo } from '../utils/logger';
import { FreeModelId, getModelDisplayName } from '../config/models';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'freeai.chatView';
  private context: vscode.ExtensionContext;
  private view?: vscode.WebviewView;
  private currentSession: ChatSession | undefined;
  private abortController: AbortController | null = null;
  private failedModels: Set<string> = new Set();
  private processing: boolean = false;
  private messageQueue: { content: string; model: string }[] = [];
  private processingMessage: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refreshView();
      }
    });

    const sessionStorage = getSessionStorage();
    const sessionId = await sessionStorage.getCurrentSessionId();
    if (sessionId) {
      const session = await sessionStorage.getSession(sessionId);
      if (session) {
        this.currentSession = session;
        setCurrentSession(session);
      }
    }

    logInfo('resolveWebviewView', { failedModels: Array.from(this.failedModels), available: this.getAvailableModels(), hasApiKey: getConfigManager().hasValidApiKey });
    webviewView.webview.html = await this.getHtmlForWebview(webviewView.webview);
  }

  addReference(reference: CodeReference): void {
    this.postMessage({ type: 'addReference', payload: reference });
  }

  async notifyApiKeyConfigured(): Promise<void> {
    if (this.view) {
      this.view.webview.html = await this.getHtmlForWebview(this.view.webview);
    }
  }

  private async handleMessage(message: { type: string; payload: unknown }): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this.handleSendMessage(message.payload as { content: string; model?: string; references?: CodeReference[] });
        break;
      case 'newSession':
        await this.handleNewSession();
        break;
      case 'loadSession':
        await this.handleLoadSession((message.payload as { sessionId: string }).sessionId);
        break;
      case 'deleteSession':
        await this.handleDeleteSession((message.payload as { sessionId: string }).sessionId);
        break;
      case 'selectModel':
        await this.handleSelectModel((message.payload as { modelId: string }).modelId);
        break;
      case 'clearChat':
        await this.handleClearChat();
        break;
      case 'getSessions':
        await this.sendSessionsToWebview();
        break;
      case 'configure':
        vscode.commands.executeCommand('freeai.configure');
        break;
      case 'ready':
        this.refreshView();
        break;
    }
  }

  private async sendSessionsToWebview(): Promise<void> {
    const sessions = await getSessionStorage().getAllSessions();
    this.postMessage({ type: 'sessionList', payload: sessions });
  }

  private async handleSendMessage(payload: { content: string; model?: string; references?: CodeReference[] }): Promise<void> {
    const configManager = getConfigManager();

    if (!configManager.hasValidApiKey) {
      this.postMessage({ type: 'error', payload: 'No API key configured. Please run OpenCode: Configure' });
      return;
    }

    const model = payload.model ?? configManager.defaultModel;

    if (this.processingMessage) {
      this.messageQueue.push({ content: payload.content, model });
      return;
    }

    if (!this.currentSession) {
      this.currentSession = getSessionStorage().createSession(model, 'New Chat');
      setCurrentSession(this.currentSession);
    }

    this.processingMessage = true;
    this.processing = true;
    this.messageQueue.push({ content: payload.content, model });
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    const apiClient = getApiClient();

    let isFirstBatch = true;

    while (this.messageQueue.length > 0) {
      let items: { content: string; model: string }[];
      if (isFirstBatch) {
        items = [this.messageQueue.shift()!];
        isFirstBatch = false;
      } else {
        items = this.messageQueue.splice(0);
      }

      this.processing = true;

      if (!this.currentSession) {
        this.currentSession = getSessionStorage().createSession(items[0].model, 'New Chat');
        setCurrentSession(this.currentSession);
      }

      const combinedContent = items.map(i => i.content).join('\n');
      const model = items[0].model;

      this.currentSession!.messages.push({
        role: 'user', content: combinedContent, timestamp: Date.now(), model
      });
      this.currentSession!.updatedAt = Date.now();
      this.currentSession!.model = model;
      if (this.currentSession!.messages.length === 1) {
        this.currentSession!.title = getSessionStorage().generateTitle(items[0].content);
      }
      await getSessionStorage().saveSession(this.currentSession!);
      await getSessionStorage().setCurrentSessionId(this.currentSession!.id);

      this.abortController = new AbortController();
      const timeout = setTimeout(() => this.abortController?.abort(), 30000);

      try {
        await this.tryModelChain(model, getSessionStorage(), apiClient);
      } catch (e) {
        logError('Queue processing error', e);
      } finally {
        clearTimeout(timeout);
      }

      const isEmpty = this.messageQueue.length === 0;
      if (isEmpty) {
        this.processing = false;
      }
      await this.replaceHtml();
    }

    this.processingMessage = false;
    this.processing = false;
  }

  private async tryModelChain(modelId: string, sessionStorage: GlobalSessionStorage, apiClient: ApiClient): Promise<boolean> {
    const tryModel = async (tryModelId: string): Promise<boolean> => {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        model: tryModelId
      };
      this.currentSession!.messages.push(assistantMessage);

      try {
        let fullContent = '';
        for await (const chunk of apiClient.chatCompletion({
          model: tryModelId,
          messages: this.currentSession!.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
          signal: this.abortController!.signal
        })) {
          fullContent += chunk.content;
          assistantMessage.content = fullContent;
        }
        this.currentSession!.updatedAt = Date.now();
        this.currentSession!.model = tryModelId;
        await sessionStorage.saveSession(this.currentSession!);
        return true;
      } catch (error) {
        this.currentSession!.messages.pop();
        if (error instanceof Error && error.name === 'AbortError') {
          return true;
        }
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('not supported') || msg.includes('promotion has ended') || msg.includes('ModelError')) {
          this.failedModels.add(tryModelId);
          logInfo(`← model retired`, { model: tryModelId, reason: msg });
          const available = this.getAvailableModels();
          if (available.length > 0 && available[0] !== tryModelId) {
            logInfo(`← retrying with`, { model: available[0] });
            this.currentSession!.messages.push({ role: 'system', content: `<span style="color:#f14c4c"><b>"${tryModelId}"</b> unavailable</span><br><span style="color:#4ec9b0">retrying with <b>${available[0]}</b></span>`, timestamp: Date.now() });
            this.processing = true;
            this.replaceHtml();
            return tryModel(available[0]);
          }
        }
        logError('Chat completion error', error);
        this.currentSession!.messages.push({ role: 'system', content: `<span style="color:#f14c4c"><b>"${tryModelId}"</b> ${msg}</span>`, timestamp: Date.now() });
        return false;
      }
    };

    const result = await tryModel(modelId);
    if (!result) {
      logInfo('← all models failed');
    }
    return result;
  }

  private async handleNewSession(): Promise<void> {
    const configManager = getConfigManager();
    const sessionStorage = getSessionStorage();

    if (this.currentSession && this.currentSession.messages.length > 0) {
      this.currentSession.updatedAt = Date.now();
      await sessionStorage.saveSession(this.currentSession);
    }

    this.currentSession = sessionStorage.createSession(configManager.defaultModel);
    setCurrentSession(this.currentSession);
    await sessionStorage.setCurrentSessionId(this.currentSession.id);
    this.refreshView();
  }

  private async handleLoadSession(sessionId: string): Promise<void> {
    const sessionStorage = getSessionStorage();
    const session = await sessionStorage.getSession(sessionId);
    if (session) {
      this.currentSession = session;
      setCurrentSession(session);
      await sessionStorage.setCurrentSessionId(sessionId);
      this.refreshView();
    }
  }

  private async handleDeleteSession(sessionId: string): Promise<void> {
    const sessionStorage = getSessionStorage();
    await sessionStorage.deleteSession(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.currentSession = undefined;
      setCurrentSession(undefined);
      await sessionStorage.setCurrentSessionId(undefined);
    }
    this.refreshView();
  }

  private async handleSelectModel(modelId: string): Promise<void> {
    const configManager = getConfigManager();
    await configManager.updateSetting('defaultModel', modelId as typeof configManager.defaultModel);
    if (this.currentSession) {
      this.currentSession.model = modelId as typeof configManager.defaultModel;
      this.currentSession.messages.push({ role: 'system', content: `<span style="color:#4ec9b0">switched to <b>${modelId}</b></span>`, timestamp: Date.now() });
      this.currentSession.updatedAt = Date.now();
      await getSessionStorage().saveSession(this.currentSession);
      this.replaceHtml();
    }
  }

  private async handleClearChat(): Promise<void> {
    if (this.currentSession) {
      const sessionStorage = getSessionStorage();
      await sessionStorage.deleteSession(this.currentSession.id);
    }
    this.currentSession = undefined;
    setCurrentSession(undefined);
    const sessionStorage = getSessionStorage();
    await sessionStorage.setCurrentSessionId(undefined);
    this.refreshView();
  }

  private async refreshView(): Promise<void> {
    if (!this.view) return;
    this.view.webview.html = await this.getHtmlForWebview(this.view.webview);
  }

  private postMessage(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private getAvailableModels(): FreeModelId[] {
    const configManager = getConfigManager();
    return configManager.selectedModels.filter(m => !this.failedModels.has(m));
  }

  private async replaceHtml(): Promise<void> {
    if (this.view) {
      this.view.webview.html = await this.getHtmlForWebview(this.view.webview);
    }
  }

  private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    try {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'chat.css')
    );
    const markdownUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'markdown.js')
    );
    const highlightUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'highlight.min.js')
    );
    const chatUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'chat.js')
    );
    const configManager = getConfigManager();
    const sessions = await getSessionStorage().getAllSessions();
    const availableModels = this.getAvailableModels();
    logInfo('getHtmlForWebview', { availableModels, failedModels: Array.from(this.failedModels), selectedModels: configManager.selectedModels });
    const initialModel = availableModels.includes(configManager.defaultModel as FreeModelId) ? configManager.defaultModel : availableModels[0] ?? 'deepseek-v4-flash-free';
    const providerName = configManager.baseUrl.replace(/\/v1.*$/, '').replace(/^https?:\/\//, '');
    const modelObjects = availableModels.map(function(id) {
      return { id: id, name: getModelDisplayName(id), provider: providerName };
    });
    const initData = encodeURIComponent(JSON.stringify({
      models: modelObjects,
      defaultModel: initialModel,
      hasApiKey: configManager.hasValidApiKey,
      processing: this.processing,
      currentSession: this.currentSession || null,
      sessions: sessions.map(function(s) { return { id: s.id, title: s.title, model: s.model, updatedAt: s.updatedAt, messageCount: s.messages.length }; })
    }));

    logInfo('getHtmlForWebview complete', { modelCount: modelObjects.length });
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <script src="${highlightUri}"></script>
  <script src="${markdownUri}"></script>
  <title>Free AI Chat</title>
</head>
<body>
  <div id="app">
    <header class="chat-header">
      <div class="header-left">
        <span class="title">Free AI</span>
      </div>
      <div class="header-center">
        <select id="model-select" class="model-select" title="Select model"></select>
      </div>
      <div class="header-right">
        <button id="new-session-btn" class="icon-btn" title="New Chat" aria-label="New Chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button id="session-btn" class="icon-btn" title="Sessions" aria-label="Sessions">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>
        <button id="clear-btn" class="icon-btn" title="Clear chat" aria-label="Clear chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </header>

    <div id="configure-banner" class="configure-banner" hidden>
      <span>API key not configured</span>
      <button id="configure-btn" class="configure-btn">Set up API Key</button>
    </div>

    <div id="messages" class="messages-container" role="log" aria-live="polite"></div>

    <div id="references" class="references-bar" hidden></div>

    <footer class="chat-footer">
      <div id="slash-menu" class="slash-menu" hidden>
        <div id="slash-items" class="slash-items"></div>
      </div>
      <div class="input-wrapper">
        <div class="input-field">
          <textarea
            id="message-input"
            class="message-input"
            placeholder="Message... (Enter to send, Shift+Enter for new line)"
            aria-label="Chat message"
          ></textarea>
          <div id="resize-handle" class="resize-handle" title="Drag to resize">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 9L9 1M4 9L9 4M7 9L9 7" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
          </div>
        </div>
        <button id="send-btn" class="send-btn" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div class="hint-bar">
        <span class="hint">Commands: </span>
        <button class="hint-btn" data-cmd="/help">/help</button>
        <button class="hint-btn" data-cmd="/clear">/clear</button>
        <button class="hint-btn" data-cmd="/models">/models</button>
        <button class="hint-btn" data-cmd="/sessions">/sessions</button>
      </div>
    </footer>
  </div>

  <div id="session-modal" class="modal" tabindex="-1" hidden>
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <header class="modal-header">
        <h3>Sessions</h3>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>
      <div class="modal-body">
        <input type="text" id="session-search" placeholder="Search sessions..." class="modal-search" />
        <div id="session-list" class="session-list"></div>
        <button id="new-session-btn" class="new-session-btn">New Chat</button>
      </div>
    </div>
  </div>

  <div id="model-modal" class="modal" hidden>
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <header class="modal-header">
        <h3>Select Model</h3>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>
      <div class="modal-body">
        <div id="model-list" class="model-list"></div>
      </div>
    </div>
  </div>

  <script>window.__freeaiInit=JSON.parse(decodeURIComponent("${initData}"));window.vscodeApi=acquireVsCodeApi();</script>
  <script src="${chatUri}"></script>
</body>
</html>`;
    } catch (e) {
      logError('getHtmlForWebview error', e);
      return '<!DOCTYPE html><html><body><p>Error rendering chat. Check the Free AI output channel.</p></body></html>';
    }
  }
}