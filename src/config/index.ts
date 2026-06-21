import * as vscode from 'vscode';
import { FREE_MODEL_IDS, FreeModelId } from './models';

export interface OpenCodeConfig {
  apiKey: string | undefined;
  baseUrl: string;
  defaultModel: FreeModelId;
  selectedModels: FreeModelId[];
  maxContextTokens: number;
  autoSaveSessions: boolean;
}

const CONFIG_SECTION = 'freeai';
const SECRET_KEY = 'freeai-api-key';
const ENV_VAR = 'OPENCODE_API_KEY';
const DEFAULT_MODELS = [...FREE_MODEL_IDS] as FreeModelId[];

export class ConfigManager {
  private context: vscode.ExtensionContext;
  private memoryApiKey: string | undefined;
  private config: OpenCodeConfig | null = null;
  private onDidChangeConfig: vscode.EventEmitter<OpenCodeConfig> = new vscode.EventEmitter();
  private readyPromise: Promise<void>;

  readonly onDidChangeConfiguration = this.onDidChangeConfig.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.memoryApiKey = this.readEnvApiKey();
    this.config = this.buildConfig(this.memoryApiKey);
    this.registerConfigListener();
    this.readyPromise = this.loadApiKeyFromSecrets();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  private async loadApiKeyFromSecrets(): Promise<void> {
    try {
      if (!this.memoryApiKey) {
        const secretKey = await this.context.secrets.get(SECRET_KEY);
        if (secretKey) {
          this.memoryApiKey = secretKey;
          this.config = this.buildConfig(this.memoryApiKey);
          this.onDidChangeConfig.fire(this.config);
        }
      }
    } catch {
      // secrets not available
    }
  }

  private readEnvApiKey(): string | undefined {
    return process.env[ENV_VAR];
  }

  private buildConfig(apiKey: string | undefined): OpenCodeConfig {
    const workspaceConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
      apiKey,
      baseUrl: workspaceConfig.get<string>('baseUrl') ?? 'https://opencode.ai/zen/v1',
      defaultModel: this.validateModel(workspaceConfig.get<string>('defaultModel')) ?? 'deepseek-v4-flash-free',
      selectedModels: this.validateModels(workspaceConfig.get<string[]>('selectedModels')) ?? DEFAULT_MODELS,
      maxContextTokens: workspaceConfig.get<number>('maxContextTokens') ?? 8000,
      autoSaveSessions: workspaceConfig.get<boolean>('autoSaveSessions') ?? true
    };
  }

  private validateModel(model?: string): FreeModelId | undefined {
    if (model && FREE_MODEL_IDS.includes(model as FreeModelId)) {
      return model as FreeModelId;
    }
    return undefined;
  }

  private validateModels(models?: string[]): FreeModelId[] | undefined {
    if (!models || models.length === 0) {
      return DEFAULT_MODELS;
    }
    const valid = models.filter(m => FREE_MODEL_IDS.includes(m as FreeModelId)) as FreeModelId[];
    return valid.length > 0 ? valid : undefined;
  }

  private registerConfigListener(): void {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this.config = this.buildConfig(this.memoryApiKey);
        this.onDidChangeConfig.fire(this.config!);
      }
    });
  }

  get apiKey(): string | undefined {
    return this.memoryApiKey ?? this.config?.apiKey;
  }

  get baseUrl(): string {
    return this.config?.baseUrl ?? 'https://opencode.ai/zen/v1';
  }

  get defaultModel(): FreeModelId {
    return this.config?.defaultModel ?? 'deepseek-v4-flash-free';
  }

  get selectedModels(): FreeModelId[] {
    return this.config?.selectedModels ?? DEFAULT_MODELS;
  }

  get maxContextTokens(): number {
    return this.config?.maxContextTokens ?? 8000;
  }

  get autoSaveSessions(): boolean {
    return this.config?.autoSaveSessions ?? true;
  }

  get hasValidApiKey(): boolean {
    const key = this.apiKey;
    return !!key && key.trim().length > 0;
  }

  async setApiKey(key: string): Promise<void> {
    this.memoryApiKey = key.trim();
    await this.context.secrets.store(SECRET_KEY, this.memoryApiKey);
    this.config = this.buildConfig(this.memoryApiKey);
    this.onDidChangeConfig.fire(this.config!);
  }

  async clearApiKey(): Promise<void> {
    this.memoryApiKey = undefined;
    await this.context.secrets.delete(SECRET_KEY);
    this.config = this.buildConfig(undefined);
    this.onDidChangeConfig.fire(this.config!);
  }

  async updateSetting<K extends keyof OpenCodeConfig>(key: K, value: OpenCodeConfig[K]): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await workspaceConfig.update(key, value, vscode.ConfigurationTarget.Global);
    this.config = this.buildConfig(this.memoryApiKey);
    this.onDidChangeConfig.fire(this.config!);
  }

  getConfig(): OpenCodeConfig {
    return { ...this.config!, apiKey: this.memoryApiKey ?? this.config?.apiKey };
  }
}