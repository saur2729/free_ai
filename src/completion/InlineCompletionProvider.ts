import * as vscode from 'vscode';
import { getConfigManager, getApiClient } from '../extension';
import { CompletionContextBuilder } from './CompletionContextBuilder';
import { logDebug } from '../utils/logger';

const DEBOUNCE_MS = 200;
const MAX_COMPLETION_TOKENS = 256;
const MIN_CONTEXT_LENGTH = 10;

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private contextBuilder: CompletionContextBuilder | null = null;

  private getBuilder(): CompletionContextBuilder {
    if (!this.contextBuilder) {
      this.contextBuilder = new CompletionContextBuilder(getConfigManager());
    }
    return this.contextBuilder;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    const configManager = getConfigManager();
    if (!configManager.hasValidApiKey) {
      return [];
    }

    const docKey = `${document.uri.toString()}:${position.line}:${position.character}`;

    if (this.debounceTimers.has(docKey)) {
      clearTimeout(this.debounceTimers.get(docKey)!);
    }

    return new Promise((resolve) => {
      this.debounceTimers.set(docKey, setTimeout(async () => {
        this.debounceTimers.delete(docKey);

        if (token.isCancellationRequested) {
          resolve([]);
          return;
        }

        const previousAbort = this.abortControllers.get(docKey);
        if (previousAbort) {
          previousAbort.abort();
        }

        const abortController = new AbortController();
        this.abortControllers.set(docKey, abortController);

        token.onCancellationRequested(() => {
          abortController.abort();
          this.abortControllers.delete(docKey);
        });

        try {
          const linePrefix = document.lineAt(position).text.slice(0, position.character).trim();
          if (linePrefix.length < MIN_CONTEXT_LENGTH && this.isLowContextTrigger(position)) {
            resolve([]);
            return;
          }

          const contextResult = await this.getBuilder().buildContext(document, position);
          const lineBeforeCursor = document.lineAt(position).text.slice(0, position.character);
          const lineAfterCursor = document.lineAt(position).text.slice(position.character);

          const prompt = `Complete the code at the cursor position marked by <CURSOR>. Return ONLY the completion text, no explanations, no markdown.

\`\`\`
${contextResult.prompt}
${lineBeforeCursor}<CURSOR>${lineAfterCursor}
\`\`\``;

          const client = getApiClient();
          let fullCompletion = '';

          for await (const chunk of client.inlineCompletion({
            model: configManager.defaultModel,
            prompt,
            maxTokens: MAX_COMPLETION_TOKENS,
            signal: abortController.signal,
            temperature: 0.2
          })) {
            fullCompletion += chunk.content;
            if (fullCompletion.length > 500) break;
          }

          if (fullCompletion && !token.isCancellationRequested) {
            const trimmed = fullCompletion.trim();
            if (trimmed) {
              const item = new vscode.InlineCompletionItem(
                trimmed,
                new vscode.Range(position, position)
              );
              resolve([item]);
              return;
            }
          }

          resolve([]);
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            logDebug('Inline completion error', error);
          }
          resolve([]);
        } finally {
          this.abortControllers.delete(docKey);
        }
      }, DEBOUNCE_MS));
    });
  }

  private isLowContextTrigger(position: vscode.Position): boolean {
    return position.character <= 2 || position.line === 0;
  }
}