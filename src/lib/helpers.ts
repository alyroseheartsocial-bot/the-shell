import { MemoryCategory, VoicePreset } from '../types';

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const raw = `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return raw.slice(0, 120);
}

export function assertValidId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!clean || !ID_REGEX.test(clean)) {
    return makeSafeId('id');
  }
  return clean;
}

export function clampString(val: string, minLen: number, maxLen: number, fallback = '-'): string {
  const trimmed = (val ?? '').toString().slice(0, maxLen);
  if (trimmed.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return trimmed;
}

export const VOICE_ID_STORAGE_KEY = 'companion_voice_id_v1';
export const VALID_VOICE_PRESETS: readonly VoicePreset[] = [
  'Zephyr',
  'Puck',
  'Kore',
  'Fenrir',
  'Leda',
  'Aoede',
  'Callirrhoe',
  'Orus',
] as const;

export function sanitizeVoicePreset(val?: unknown): VoicePreset {
  return VALID_VOICE_PRESETS.includes(val as VoicePreset)
    ? (val as VoicePreset)
    : 'Kore';
}

export function sanitizeMemoryCategory(val: string): MemoryCategory {
  const allowed: MemoryCategory[] = [
    'personal',
    'shared_history',
    'dynamic',
    'preference',
    'directive',
  ];
  return allowed.includes(val as MemoryCategory) ? (val as MemoryCategory) : 'personal';
}
