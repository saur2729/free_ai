export async function* parseSSEStream<T>(
  response: Response,
  parser: (data: string) => T | null
): AsyncGenerator<T, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          const parsed = parser(data);
          if (parsed) {
            yield parsed;
          }
        }
      }
    }

    if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
      if (buffer.startsWith('data: ')) {
        const parsed = parser(buffer.slice(6));
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* fetchStream<T>(
  url: string,
  options: RequestInit,
  parser: (data: string) => T | null
): AsyncGenerator<T, void, unknown> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'text/event-stream',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  yield* parseSSEStream(response, parser);
}

export function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export class StreamBuffer {
  private buffer = '';

  append(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter(l => l.trim());
  }

  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    return remaining;
  }
}