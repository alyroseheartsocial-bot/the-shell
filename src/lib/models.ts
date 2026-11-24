import { GeminiModelId } from '../types';

export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  shortLabel: string;
  tierNote: string;
}

export const FREE_TIER_GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    shortLabel: '3.5 Lite',
    tierNote: 'Zero-Lag · High Quota',
  },
  {
    id: 'gemini-flash-lite-latest',
    label: 'Gemini Flash Lite Latest',
    shortLabel: 'Lite Latest',
    tierNote: 'Dynamic · Ultra-fast',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    shortLabel: '3 Flash',
    tierNote: 'Fast · Resilient',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    shortLabel: '3.5 Flash',
    tierNote: 'Deep nuance · Auto-failover',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    shortLabel: '3.1 Lite',
    tierNote: 'Lightweight · Context aware',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    shortLabel: '3.8 Flash',
    tierNote: 'Flagship · High reasoning',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    shortLabel: '3.6 Flash',
    tierNote: 'Balanced · Adaptive',
  },
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    shortLabel: 'Flash Latest',
    tierNote: 'Rolling release',
  },
];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-3.5-flash-lite';

export function sanitizeModelId(value: unknown): GeminiModelId {
  const found = FREE_TIER_GEMINI_MODELS.find((m) => m.id === value);
  return found ? found.id : DEFAULT_GEMINI_MODEL;
}
