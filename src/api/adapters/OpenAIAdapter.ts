import { ProviderAdapter, ChatRequestOptions } from './ProviderAdapter';

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly format = 'openai';

  buildChatRequest(model: string, messages: { role: string; content: string }[], options: ChatRequestOptions): object {
    return {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: options.stream ?? true,
      stream_options: options.stream ? { include_usage: true } : undefined
    };
  }

  parseChunk(data: string): ChatCompletionChunk | null {
    try {
      return JSON.parse(data) as ChatCompletionChunk;
    } catch {
      return null;
    }
  }

  extractContent(chunk: unknown): string {
    const c = chunk as ChatCompletionChunk;
    return c.choices?.[0]?.delta?.content ?? '';
  }

  isDone(chunk: unknown): boolean {
    const c = chunk as ChatCompletionChunk;
    return c.choices?.[0]?.finish_reason != null;
  }

  async testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const url = `${baseUrl.replace(/\/v1.*$/, '')}/v1/models`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
