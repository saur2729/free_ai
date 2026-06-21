import { ProviderAdapter, ChatRequestOptions } from './ProviderAdapter';

interface AnthropicChunk {
  type: 'message_start' | 'content_block_delta' | 'message_delta' | 'message_stop';
  delta?: { type: 'text_delta'; text: string };
  index?: number;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly format = 'anthropic';

  buildChatRequest(model: string, messages: { role: string; content: string }[], options: ChatRequestOptions): object {
    const systemMsg = messages.find(m => m.role === 'system');
    const userAssistantMessages = messages.filter(m => m.role !== 'system');
    return {
      model,
      messages: userAssistantMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      system: options.system ?? systemMsg?.content,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      stream: options.stream ?? true
    };
  }

  parseChunk(data: string): AnthropicChunk | null {
    try {
      return JSON.parse(data) as AnthropicChunk;
    } catch {
      return null;
    }
  }

  extractContent(chunk: unknown): string {
    const c = chunk as AnthropicChunk;
    return c.delta?.text ?? '';
  }

  isDone(chunk: unknown): boolean {
    const c = chunk as AnthropicChunk;
    return c.type === 'message_stop' || c.type === 'message_delta';
  }

  async testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
