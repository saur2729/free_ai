export interface ChatRequestOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  system?: string;
}

export interface ProviderAdapter {
  readonly format: string;
  buildChatRequest(model: string, messages: { role: string; content: string }[], options: ChatRequestOptions): object;
  parseChunk(data: string): unknown | null;
  extractContent(chunk: unknown): string;
  isDone(chunk: unknown): boolean;
  testConnection(baseUrl: string, apiKey: string): Promise<boolean>;
}
