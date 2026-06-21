import { getModelEndpoint } from './models';

export interface EndpointConfig {
  baseUrl: string;
  path: string;
  format: 'openai' | 'anthropic';
  headers: Record<string, string>;
}

export function buildChatEndpoint(config: EndpointConfig, apiKey: string): EndpointConfig {
  return {
    baseUrl: config.baseUrl,
    path: config.path,
    format: config.format,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...config.headers
    }
  };
}

export function buildCompletionEndpoint(config: EndpointConfig, apiKey: string): EndpointConfig {
  return buildChatEndpoint(config, apiKey);
}

export function getEndpointForModel(baseUrl: string, modelId: string, apiKey: string): EndpointConfig {
  const { endpoint, format } = getModelEndpoint(modelId);
  return buildChatEndpoint(
    { baseUrl, path: endpoint, format, headers: {} },
    apiKey
  );
}