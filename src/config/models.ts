export interface ModelInfo {
  id: string;
  name: string;
  endpoint: 'chat/completions' | 'messages';
  format: 'openai' | 'anthropic';
  free: boolean;
}

export const FREE_MODEL_IDS = [
  'deepseek-v4-flash-free',
  'mimo-v2.5-free',
  'qwen3.6-plus-free',
  'minimax-m3-free',
  'nemotron-3-ultra-free',
  'north-mini-code-free',
  'big-pickle'
] as const;

export type FreeModelId = typeof FREE_MODEL_IDS[number];

export const MODEL_ENDPOINTS: Record<FreeModelId, { endpoint: 'chat/completions' | 'messages'; format: 'openai' | 'anthropic' }> = {
  'deepseek-v4-flash-free': { endpoint: 'chat/completions', format: 'openai' },
  'mimo-v2.5-free': { endpoint: 'chat/completions', format: 'openai' },
  'qwen3.6-plus-free': { endpoint: 'messages', format: 'anthropic' },
  'minimax-m3-free': { endpoint: 'chat/completions', format: 'openai' },
  'nemotron-3-ultra-free': { endpoint: 'chat/completions', format: 'openai' },
  'north-mini-code-free': { endpoint: 'chat/completions', format: 'openai' },
  'big-pickle': { endpoint: 'chat/completions', format: 'openai' }
};

export const MODEL_DISPLAY_NAMES: Record<FreeModelId, string> = {
  'deepseek-v4-flash-free': 'DeepSeek V4 Flash Free',
  'mimo-v2.5-free': 'MiMo-V2.5 Free',
  'qwen3.6-plus-free': 'Qwen3.6 Plus Free',
  'minimax-m3-free': 'MiniMax M3 Free',
  'nemotron-3-ultra-free': 'Nemotron 3 Ultra Free',
  'north-mini-code-free': 'North Mini Code Free',
  'big-pickle': 'Big Pickle'
};

export function isFreeModel(modelId: string): modelId is FreeModelId {
  return FREE_MODEL_IDS.includes(modelId as FreeModelId);
}

export function getModelEndpoint(modelId: string): { endpoint: 'chat/completions' | 'messages'; format: 'openai' | 'anthropic' } {
  if (isFreeModel(modelId)) {
    return MODEL_ENDPOINTS[modelId];
  }
  return { endpoint: 'chat/completions', format: 'openai' };
}

export function getModelDisplayName(modelId: string): string {
  if (isFreeModel(modelId)) {
    return MODEL_DISPLAY_NAMES[modelId];
  }
  return modelId;
}

export async function fetchFreeModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/v1.*$/, '')}/v1/models`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    const data = await response.json() as { data: Array<{ id: string }> };
    return data.data
      .filter(m => isFreeModel(m.id))
      .map(m => ({
        id: m.id,
        name: getModelDisplayName(m.id),
        endpoint: getModelEndpoint(m.id).endpoint,
        format: getModelEndpoint(m.id).format,
        free: true
      }));
  } catch {
    return FREE_MODEL_IDS.map(id => ({
      id,
      name: getModelDisplayName(id),
      endpoint: getModelEndpoint(id).endpoint,
      format: getModelEndpoint(id).format,
      free: true
    }));
  }
}