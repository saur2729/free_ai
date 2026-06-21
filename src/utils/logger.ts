import * as vscode from 'vscode';

const LOG_CHANNEL = 'Free AI';

let outputChannel: vscode.LogOutputChannel | null = null;

export function initLogger(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL, { log: true });
  context.subscriptions.push(outputChannel);
}

export function getLogger(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL, { log: true });
  }
  return outputChannel;
}

export function logInfo(message: string, ...args: unknown[]): void {
  getLogger().info(message, ...args);
}

export function logError(message: string, error?: Error | unknown, ...args: unknown[]): void {
  if (error instanceof Error) {
    getLogger().error(`${message}: ${error.message}`, error.stack);
  } else if (error) {
    getLogger().error(message, error, ...args);
  } else {
    getLogger().error(message, ...args);
  }
}

export function logWarn(message: string, ...args: unknown[]): void {
  getLogger().warn(message, ...args);
}

export function logDebug(message: string, ...args: unknown[]): void {
  getLogger().debug(message, ...args);
}

export function showOutputChannel(): void {
  getLogger().show(true);
}