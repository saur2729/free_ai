import * as vscode from 'vscode';

const SESSIONS_KEY = 'freeai.chat.sessions';
const CURRENT_SESSION_KEY = 'freeai.chat.currentSession';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  references?: CodeReference[];
}

export interface CodeReference {
  filePath: string;
  selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  content: string;
  language: string;
}

export class GlobalSessionStorage {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getAllSessions(): Promise<ChatSession[]> {
    const data = this.context.globalState.get<ChatSession[]>(SESSIONS_KEY);
    return data ?? [];
  }

  async getSession(id: string): Promise<ChatSession | undefined> {
    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === id);
  }

  async saveSession(session: ChatSession): Promise<void> {
    const sessions = await this.getAllSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.unshift(session);
    }
    await this.context.globalState.update(SESSIONS_KEY, sessions);
  }

  async deleteSession(id: string): Promise<void> {
    const sessions = await this.getAllSessions();
    const filtered = sessions.filter(s => s.id !== id);
    await this.context.globalState.update(SESSIONS_KEY, filtered);
  }

  async clearAllSessions(): Promise<void> {
    await this.context.globalState.update(SESSIONS_KEY, []);
  }

  async getCurrentSessionId(): Promise<string | undefined> {
    return this.context.globalState.get<string>(CURRENT_SESSION_KEY);
  }

  async setCurrentSessionId(id: string | undefined): Promise<void> {
    if (id) {
      await this.context.globalState.update(CURRENT_SESSION_KEY, id);
    } else {
      await this.context.globalState.update(CURRENT_SESSION_KEY, undefined);
    }
  }

  createSession(model: string, title?: string): ChatSession {
    const now = Date.now();
    return {
      id: `session-${now}-${Math.random().toString(36).slice(2, 9)}`,
      title: title ?? 'New Chat',
      messages: [],
      model,
      createdAt: now,
      updatedAt: now
    };
  }

  generateTitle(firstMessage: string): string {
    const maxLength = 50;
    const cleaned = firstMessage.trim().replace(/\n+/g, ' ').slice(0, maxLength);
    return cleaned.length < maxLength ? cleaned : cleaned.slice(0, maxLength - 3) + '...';
  }
}