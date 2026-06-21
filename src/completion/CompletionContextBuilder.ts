import * as vscode from 'vscode';
import { getConfigManager } from '../extension';

interface ContextResult {
  prompt: string;
  tokenCount: number;
  files: string[];
}

const CHARS_PER_TOKEN = 4;

export class CompletionContextBuilder {
  private configManager: ReturnType<typeof getConfigManager>;

  constructor(configManager: ReturnType<typeof getConfigManager>) {
    this.configManager = configManager;
  }

  async buildContext(document: vscode.TextDocument, position: vscode.Position): Promise<ContextResult> {
    const files: string[] = [];
    const parts: string[] = [];
    let totalChars = 0;

    const maxChars = this.configManager.maxContextTokens * CHARS_PER_TOKEN;

    const beforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const afterCursor = document.getText(new vscode.Range(position, new vscode.Position(document.lineCount, 0)));

    const fileFramework = this.getFileFramework(document.fileName);
    const imports = this.extractImports(beforeCursor);

    if (imports.length > 0) {
      const importBlock = imports.join('\n');
      parts.push(importBlock);
      totalChars += importBlock.length;
      files.push(document.fileName);
    }

    if (totalChars < maxChars) {
      const beforeContext = beforeCursor.slice(Math.max(0, beforeCursor.length - maxChars / 2));
      parts.push(beforeContext);
      totalChars += beforeContext.length;
      files.push(document.fileName);
    }

    if (totalChars < maxChars && afterCursor) {
      const afterContext = afterCursor.slice(0, maxChars / 4);
      parts.push(afterCursor);
      totalChars += afterContext.length;
    }

    if (totalChars < maxChars && fileFramework) {
      const langInfo = this.getLanguageComments(document.languageId);
      parts.unshift(`${langInfo.file}: ${document.fileName}\n${langInfo.framework}: ${fileFramework}\n`);
    }

    const result = parts.join('\n');
    const tokenCount = Math.ceil(result.length / CHARS_PER_TOKEN);

    return {
      prompt: result,
      tokenCount,
      files: [...new Set(files)]
    };
  }

  private extractImports(text: string): string[] {
    const importRegex = /^(import |from |require\()/gm;
    const lines: string[] = [];
    let match;

    while ((match = importRegex.exec(text)) !== null) {
      const lineStart = text.lastIndexOf('\n', match.index) + 1;
      const lineEnd = text.indexOf('\n', match.index);
      const line = text.slice(lineStart, lineEnd !== -1 ? lineEnd : undefined).trim();
      if (line) lines.push(line);
    }

    return lines.slice(0, 20);
  }

  private getFileFramework(filename: string): string | null {
    const name = filename.toLowerCase();
    if (name.endsWith('.tsx') || name.endsWith('.jsx')) return 'React/JSX';
    if (name.endsWith('.vue')) return 'Vue';
    if (name.endsWith('.svelte')) return 'Svelte';
    if (name.endsWith('.angular.ts')) return 'Angular';
    if (name.endsWith('.py')) return 'Python';
    if (name.endsWith('.rs')) return 'Rust';
    if (name.endsWith('.go')) return 'Go';
    if (name.endsWith('.java')) return 'Java';
    return null;
  }

  private getLanguageComments(langId: string): { file: string; framework: string } {
    const commentMap: Record<string, string> = {
      javascript: '//',
      typescript: '//',
      javascriptreact: '//',
      typescriptreact: '//',
      python: '#',
      rust: '//',
      go: '//',
      java: '//',
      c: '//',
      cpp: '//',
      csharp: '//',
      php: '//',
      ruby: '#',
      shellscript: '#',
      yaml: '#',
      markdown: '<!--',
      html: '<!--',
      css: '/*',
      scss: '/*'
    };

    const comment = commentMap[langId] || '//';
    return { file: `${comment} file`, framework: `${comment} framework` };
  }
}