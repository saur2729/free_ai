import { ConfigManager } from '../config';
import { getEndpointForModel } from '../config/endpoints';
import { fetchStream } from './streaming';
import { ProviderAdapter } from './adapters/ProviderAdapter';
import { logInfo } from '../utils/logger';

export interface ChatCompletionOptions {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionOptions {
  model: string;
  prompt: string;
  suffix?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export class ApiClient {
  private adapters: Map<string, ProviderAdapter>;

  constructor(
    private configManager: ConfigManager,
    adapters?: Map<string, ProviderAdapter>
  ) {
    this.adapters = adapters ?? new Map();
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.format, adapter);
  }

  private getAdapter(format: string): ProviderAdapter {
    const adapter = this.adapters.get(format);
    if (!adapter) {
      throw new Error(`No adapter registered for format: ${format}`);
    }
    return adapter;
  }

  async *chatCompletion(options: ChatCompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const apiKey = this.configManager.apiKey;
    if (!apiKey) throw new Error('API key not configured');

    const endpoint = getEndpointForModel(this.configManager.baseUrl, options.model, apiKey);
    const url = `${this.configManager.baseUrl.replace(/\/+$/, '')}/${endpoint.path}`;
    const adapter = this.getAdapter(endpoint.format);

    const requestBody = JSON.stringify(
      adapter.buildChatRequest(options.model, options.messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: true
      })
    );

    logInfo('→ chat request', { model: options.model, url, messages: options.messages.length });
    logInfo('→ request body', { body: requestBody });

    let fullContent = '';

    try {
      for await (const chunk of fetchStream<unknown>(url, {
        method: 'POST',
        headers: endpoint.headers,
        body: requestBody,
        signal: options.signal
      }, (data) => adapter.parseChunk(data))) {
        const content = adapter.extractContent(chunk);
        const done = adapter.isDone(chunk);
        if (content) {
          fullContent += content;
          yield { content, done, usage: undefined };
        }
        if (done) break;
      }
      logInfo('← response', { chars: fullContent.length, content: fullContent });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logInfo('← stream aborted', { chars: fullContent.length });
        return;
      }
      logInfo('← stream error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async *inlineCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const apiKey = this.configManager.apiKey;
    if (!apiKey) throw new Error('API key not configured');

    const endpoint = getEndpointForModel(this.configManager.baseUrl, options.model, apiKey);
    const url = `${this.configManager.baseUrl.replace(/\/+$/, '')}/${endpoint.path}`;
    const adapter = this.getAdapter(endpoint.format);

    const messages = [
      { role: 'system' as const, content: 'You are a code completion engine. Complete the code based on context. Return only the completion, no explanations.' },
      { role: 'user' as const, content: options.prompt }
    ];

    const requestBody = JSON.stringify(
      adapter.buildChatRequest(options.model, messages, {
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 512,
        stream: true
      })
    );

    try {
      for await (const chunk of fetchStream<unknown>(url, {
        method: 'POST',
        headers: endpoint.headers,
        body: requestBody,
        signal: options.signal
      }, (data) => adapter.parseChunk(data))) {
        const content = adapter.extractContent(chunk);
        const done = adapter.isDone(chunk);
        if (content) {
          yield { content, done, usage: undefined };
        }
        if (done) break;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      throw error;
    }
  }

  async fetchModels(): Promise<Array<{ id: string; name: string }>> {
    const apiKey = this.configManager.apiKey;
    if (!apiKey) throw new Error('API key not configured');

    const url = `${this.configManager.baseUrl.replace(/\/v1.*$/, '')}/v1/models`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ id: string }> };
    return data.data.map(m => ({ id: m.id, name: m.id }));
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.fetchModels();
      return true;
    } catch {
      return false;
    }
  }
}
