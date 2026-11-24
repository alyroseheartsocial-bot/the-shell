export type VoicePreset =
  | 'Zephyr'
  | 'Puck'
  | 'Kore'
  | 'Fenrir'
  | 'Leda'
  | 'Aoede'
  | 'Callirrhoe'
  | 'Orus';

export const DEFAULT_VOICE: VoicePreset = 'Kore';

export type GeminiModelId =
  | 'gemini-3.5-flash-lite'
  | 'gemini-flash-lite-latest'
  | 'gemini-3-flash-preview'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.8-flash'
  | 'gemini-3.6-flash'
  | 'gemini-flash-latest';

export type TextScaleStep = 90 | 100 | 110 | 120 | 130 | 140 | 150;

export type MemoryCategory =
  | 'personal'
  | 'shared_history'
  | 'dynamic'
  | 'preference'
  | 'directive';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  source: 'upload' | 'note';
  previewDataUrl?: string;
  base64Data?: string;
  textContent?: string;
}

export interface ActivePluginsState {
  webSearch: boolean;
  urlContext: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface UserProfile {
  ownerId: string;
  callsign: string;
  dynamicNotes: string;
  preferredVoice: VoicePreset;
  autoMessages: boolean;
  autoSpeakReplies: boolean;
  avatarUrl?: string;
  // Companion identity — editable in-app from the Profile modal (Companion
  // section), saved with the rest of the profile. All optional: older saved
  // profiles simply fall back to the shell's defaults.
  companionName?: string;
  companionPersonality?: string;
  companionGreeting?: string;
  companionAvatarUrl?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ConversationItem {
  id: string;
  ownerId: string;
  title: string;
  isArchived: boolean;
  summary: string;
  lastMessagePreview: string;
  mood: string;
  focus: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ChatMessage {
  id: string;
  ownerId: string;
  conversationId: string;
  sender: 'user' | 'companion';
  content: string;
  thoughtStream: string;
  modality: 'text' | 'voice' | 'image';
  assetId: string;
  createdAtMs: number;
  reactions?: Record<string, string[]>;
}

export interface MemoryNode {
  id: string;
  ownerId: string;
  category: MemoryCategory;
  fact: string;
  importance: number;
  sourceConversationId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface VisualCreation {
  id: string;
  ownerId: string;
  prompt: string;
  stylePreset: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '3:4' | '4:3';
  assetId: string;
  dataUrl?: string;
  createdAtMs: number;
}

export interface CompanionJournalEntry {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  mood: string;
  focus?: string;
  tags: string[];
  isAutonomous: boolean;
  createdAtMs: number;
  updatedAtMs?: number;
}

export interface VitalsState {
  mood: string;
  focus: string;
  status: string;
  thoughtStream: string;
}

export type ActiveWorkspaceView = 'dashboard' | 'memory' | 'image_studio' | 'gallery' | 'journal' | 'system' | 'creative_room' | 'games_room';

export type AspectRatioOption = '1:1' | '16:9' | '9:16' | '3:4' | '4:3';

export type UserPresenceStatus = 'active' | 'away' | 'call';

export interface UserPresence {
  status: UserPresenceStatus;
  lastActiveMs: number;
  updatedAtMs: number;
  isManualOverride?: boolean;
  note?: string;
}

export interface SystemErrorLog {
  id: string;
  timestampMs: number;
  category: 'api' | 'voice' | 'sync' | 'storage' | 'system';
  message: string;
  severity: 'warning' | 'error';
  details?: string;
}
