import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { ChatViewProvider } from './chat/ChatViewProvider';
import { ApiClient } from './api/ApiClient';
import { OpenAIAdapter } from './api/adapters/OpenAIAdapter';
import { AnthropicAdapter } from './api/adapters/AnthropicAdapter';
import type { ProviderAdapter } from './api/adapters/ProviderAdapter';
import { GlobalSessionStorage, ChatSession } from './storage/globalStorage';
import { InlineCompletionProvider } from './completion/InlineCompletionProvider';
import { initLogger, logInfo, logError } from './utils/logger';

let configManager: ConfigManager;
let apiClient: ApiClient;
let sessionStorage: GlobalSessionStorage;
let currentSession: ChatSession | undefined;
let chatViewProvider: ChatViewProvider;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  process.noDeprecation = true;
  initLogger(context);
  logInfo('Activating Free AI extension');

  configManager = new ConfigManager(context);
  const adapters = new Map<string, ProviderAdapter>();
  adapters.set('openai', new OpenAIAdapter());
  adapters.set('anthropic', new AnthropicAdapter());
  apiClient = new ApiClient(configManager, adapters);
  sessionStorage = new GlobalSessionStorage(context);

  chatViewProvider = new ChatViewProvider(context);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'freeai.configure';
  context.subscriptions.push(statusBarItem);

  const inlineProvider = new InlineCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineProvider),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('freeai.openChat', () => openChat()),
    vscode.commands.registerCommand('freeai.sendSelectionToChat', () => sendSelectionToChat()),
    vscode.commands.registerCommand('freeai.configure', () => configure()),
    vscode.commands.registerCommand('freeai.clearChat', () => clearChat()),
    vscode.commands.registerCommand('freeai.selectModel', () => selectModel()),
    vscode.commands.registerCommand('freeai.selectSession', () => selectSession())
  );

  await configManager.ready();

  if (configManager.hasValidApiKey) {
    showConfiguredStatus();
  } else {
    showUnconfiguredStatus();
    setTimeout(() => {
      vscode.window.showInformationMessage(
        'Free AI: API key required to use this extension.',
        'Set up API Key'
      ).then(selection => {
        if (selection === 'Set up API Key') {
          configure();
        }
      });
    }, 1000);
  }

  logInfo('Free AI extension activated');
}

export function deactivate(): void {
  logInfo('Deactivating Free AI extension');
}

function showConfiguredStatus(): void {
  statusBarItem.text = '$(check) Free AI: Ready';
  statusBarItem.tooltip = 'Free AI - Click to reconfigure API key';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
}

function showUnconfiguredStatus(): void {
  statusBarItem.text = '$(alert) Free AI: Set API Key';
  statusBarItem.tooltip = 'Click to configure your Free AI API key';
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
}

function openChat(): void {
  vscode.commands.executeCommand('workbench.view.extension.freeai-chat');
}

async function sendSelectionToChat(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  const document = editor.document;
  const text = document.getText(selection);
  const filePath = document.uri.fsPath;
  const language = document.languageId;

  const reference = {
    filePath,
    selection: {
      start: { line: selection.start.line, character: selection.start.character },
      end: { line: selection.end.line, character: selection.end.character }
    },
    content: text,
    language
  };

  vscode.commands.executeCommand('workbench.view.extension.freeai-chat');

  setTimeout(() => {
    chatViewProvider.addReference(reference);
  }, 300);
}

async function configure(): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your OpenCode Zen API key',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-...',
    validateInput: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'API key cannot be empty';
      }
      return null;
    }
  });

  if (!apiKey) return;

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Verifying API key...',
    cancellable: false
  }, async () => {
    try {
      await configManager.setApiKey(apiKey.trim());
      showConfiguredStatus();
      const connected = await apiClient.testConnection();
      if (connected) {
        chatViewProvider.notifyApiKeyConfigured();
        vscode.window.showInformationMessage('OpenCode: ✓ API key saved and verified');
        logInfo('API key configured successfully');
      } else {
        logError('API key verification failed - connection test returned false');
        const retry = await vscode.window.showWarningMessage(
          'OpenCode: Could not verify API key at opencode.ai/zen/v1. Check that the key is valid and the server is reachable.',
          'Retry',
          'Ignore'
        );
        if (retry === 'Retry') {
          return configure();
        }
      }
    } catch (error) {
      logError('Failed to save API key', error);
      vscode.window.showErrorMessage('OpenCode: Failed to save API key. Please try again.');
    }
  });
}

async function clearChat(): Promise<void> {
  currentSession = undefined;
  await sessionStorage.setCurrentSessionId(undefined);
  vscode.window.showInformationMessage('Chat cleared');
}

async function selectModel(): Promise<void> {
  const models = configManager.selectedModels;
  const items = models.map(m => ({
    label: m,
    detail: configManager.defaultModel === m ? '(current)' : ''
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a model',
    matchOnDetail: true
  });

  if (selected) {
    await configManager.updateSetting('defaultModel', selected.label);
    vscode.window.showInformationMessage(`Model set to ${selected.label}`);
    logInfo(`Model changed to ${selected.label}`);
  }
}

async function selectSession(): Promise<void> {
  const sessions = await sessionStorage.getAllSessions();
  if (sessions.length === 0) {
    vscode.window.showInformationMessage('No saved sessions');
    return;
  }

  const items = sessions.map(s => ({
    label: s.title,
    description: new Date(s.updatedAt).toLocaleString(),
    detail: `${s.messages.length} messages • ${s.model}`,
    session: s
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a session to load',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (selected) {
    currentSession = selected.session;
    await sessionStorage.setCurrentSessionId(selected.session.id);
    vscode.window.showInformationMessage(`Loaded session: ${selected.session.title}`);
    logInfo(`Loaded session ${selected.session.id}`);
  }
}

export function getConfigManager(): ConfigManager {
  return configManager;
}

export function getApiClient(): ApiClient {
  return apiClient;
}

export function getSessionStorage(): GlobalSessionStorage {
  return sessionStorage;
}

export function getCurrentSession(): ChatSession | undefined {
  return currentSession;
}

export function setCurrentSession(session: ChatSession | undefined): void {
  currentSession = session;
}