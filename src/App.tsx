/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  Blocks,
  BookOpen,
  Bot,
  BrainCircuit,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  Edit2,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  Lock,
  Maximize2,
  Menu,
  Mic,
  Minimize2,
  Minus,
  Palette,
  Paperclip,
  PhoneCall,
  PhoneOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Volume2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react';
import { CompanionAvatar } from './components/CompanionAvatar';
import { UserAvatar } from './components/UserAvatar';
import { CompanionJournalView } from './components/CompanionJournalView';
import { GalleryView } from './components/GalleryView';
import { ImageStudioView } from './components/ImageStudioView';
import { MemoryVaultView } from './components/MemoryVaultView';
import { CreativeRoomView } from './components/CreativeRoomView';
import { GamesRoomView } from './components/GamesRoomView';
import {
  ArchiveAllConfirmModal,
  DateHistoryModal,
  DeleteAllConfirmModal,
  ExportBackupModal,
  FileRenameModal,
  ImportCompanionModal,
  InstallGuideModal,
  ModuleNavDrawer,
  ProfileModal,
  RenameModal,
  SyncDevicesModal,
  VideoRoadmapModal,
} from './components/Modals';
import { PluginsModal } from './components/PluginsModal';
import { VitalsHud } from './components/VitalsHud';
import { CompanionSystemMonitor } from './components/CompanionSystemMonitor';
import { UserStatusBar } from './components/UserStatusBar';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import { useVoiceEngine } from './hooks/useVoiceEngine';
import {
  assertValidId,
  clampString,
  makeSafeId,
  sanitizeMemoryCategory,
  sanitizeVoicePreset,
  VOICE_ID_STORAGE_KEY,
} from './lib/helpers';
import {
  deleteAssetDataUrl,
  loadAssetDataUrl,
  saveAssetDataUrl,
} from './lib/imageVault';
import { DEFAULT_GEMINI_MODEL, sanitizeModelId } from './lib/models';
import {
  CompanionImportDraft,
  ImportedMemoryCandidate,
} from './lib/companionImport';
import {
  ActivePluginsState,
  ActiveWorkspaceView,
  AspectRatioOption,
  ChatAttachment,
  ChatMessage,
  ConversationItem,
  CompanionJournalEntry,
  GeminiModelId,
  GroundingSource,
  MemoryCategory,
  MemoryNode,
  SystemErrorLog,
  TextScaleStep,
  UserPresence,
  UserPresenceStatus,
  UserProfile,
  VisualCreation,
  VitalsState,
  VoicePreset,
} from './types';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import {
  archiveCloudConversation,
  deleteAllCloudMessages,
  deleteCloudConversation,
  deleteCloudCreation,
  deleteCloudJournalEntry,
  deleteCloudMemory,
  fetchAllCloudAssets,
  fetchCloudAsset,
  fetchCloudConversationMessages,
  logOutCloud,
  renameCloudAsset,
  saveCloudAsset,
  saveCloudConversation,
  saveCloudCreativeMessage,
  saveCloudCreation,
  saveCloudJournalEntry,
  saveCloudMemory,
  saveCloudMessage,
  saveCloudMessageReactions,
  saveCloudProfile,
  saveUserPresence,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  subscribeUserPresence,
  syncBidirectional,
  getLastSyncError,
  uploadLocalStateToCloud,
  mergeMessagesWithLocalPrecedence,
  mergeConversationsGracefully,
} from './lib/syncService';
import {
  clearLastKnownUser,
  getLastKnownUser,
  isStandalonePWA,
  loadFromIndexedDB,
  recordLastKnownUser,
  requestPersistentStorage,
  saveToIndexedDB,
  StoragePersistenceStatus,
} from './lib/storagePersistence';

const LOCAL_STORAGE_KEY = 'companion_local_ecosystem_v1';
const MODEL_PREF_STORAGE_KEY = 'companion_model_pref_v1';
const UI_PREF_STORAGE_KEY = 'companion_ui_prefs_v1';
// Creative Room thread lives under its OWN key, deliberately outside the big
// ecosystem blob: separate storage for a separate space (see CreativeRoomView).
const CREATIVE_ROOM_STORAGE_KEY = 'companion_creative_room_v1';
const CREATIVE_ROOM_ID = 'creative_room';
const GAMES_ROOM_STORAGE_KEY = 'companion_games_room_v1';
const GAMES_ROOM_ID = 'games_room';

// UI Theme Skins (slots live in index.css under [data-theme] on <html>).
// Set-and-stay: the picked skin persists in its OWN localStorage key until a
// human changes it — no date checks, no auto-switch, no auto-revert.
const THEME_STORAGE_KEY = 'companion_theme_v1';

type ThemeId =
  | 'terminal'
  | 'cottage'
  | 'christmas'
  | 'midnight'
  | 'sunset'
  | 'forest'
  | 'ocean';

interface ThemeSkin {
  id: ThemeId;
  name: string;
  vibe: string;
  /** Picker swatch dots: panel, accent, secondary, text — the same values
   *  the CSS slots use, so the preview can't lie. */
  swatches: [string, string, string, string];
  /** Solid app-background colour, mirrored into the PWA theme-color meta. */
  chromeColor: string;
}

const THEME_SKINS: ThemeSkin[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    vibe: 'the cockpit at night',
    swatches: ['#080d24', '#22d3ee', '#818cf8', '#f1f5f9'],
    chromeColor: '#060818',
  },
  {
    id: 'cottage',
    name: 'Warm Hearth',
    vibe: 'lantern light on dark wood',
    swatches: ['#211610', '#f0a840', '#8fae7d', '#f6ecdc'],
    chromeColor: '#17100b',
  },
  {
    id: 'christmas',
    name: 'Christmas',
    vibe: 'pine and gold ribbon',
    swatches: ['#0f2718', '#e8b84b', '#e5534b', '#f8f1de'],
    chromeColor: '#0a1a12',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    vibe: 'deep blue after midnight',
    swatches: ['#171340', '#a78bfa', '#818cf8', '#f0eefc'],
    chromeColor: '#0b0a1f',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    vibe: 'peach light at golden hour',
    swatches: ['#33161f', '#fb9e7d', '#f472a0', '#fdf0e9'],
    chromeColor: '#1d0f14',
  },
  {
    id: 'forest',
    name: 'Forest',
    vibe: 'moss and pine shade',
    swatches: ['#122619', '#a3be78', '#5f8f5a', '#eef4e4'],
    chromeColor: '#0a140d',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    vibe: 'teal water over sand',
    swatches: ['#0c2a31', '#5ec4b6', '#e6c98f', '#ecf7f3'],
    chromeColor: '#07181c',
  },
];

function loadSavedTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_SKINS.some((skin) => skin.id === raw) ? (raw as ThemeId) : 'terminal';
  } catch {
    return 'terminal';
  }
}

const INITIAL_THOUGHT = 'Channel open. Ready when you are.';

const REACTION_PRESETS = [
  '😊', // smile
  '😂', // laughing face
  '😏', // smirk face
  '🥰', // love face
  '😍', // heart-eyes love face
  '😠', // angry face
  '😡', // raging angry face
  '❤️', // heart
  '🔥', // fire
  '⚡', // lightning
  '🛡️', // shield
  '👁️', // eye
  '🖤', // black heart
  '✨', // sparkles
  '🌙', // moon
  '💡', // idea
  '🤝', // handshake
] as const;

const VALID_TEXT_SCALES: TextScaleStep[] = [90, 100, 110, 120, 130, 140, 150];

const TEXT_SCALE_CLASS_MAP: Record<TextScaleStep, string> = {
  90: 'text-scale-90',
  100: 'text-scale-100',
  110: 'text-scale-110',
  120: 'text-scale-120',
  130: 'text-scale-130',
  140: 'text-scale-140',
  150: 'text-scale-150',
};

function sanitizeTextScale(val: unknown): TextScaleStep {
  const num = Number(val);
  return VALID_TEXT_SCALES.includes(num as TextScaleStep) ? (num as TextScaleStep) : 110;
}

function loadSavedUiPrefs(): {
  textScale: TextScaleStep;
  plugins: ActivePluginsState;
} {
  try {
    const raw = localStorage.getItem(UI_PREF_STORAGE_KEY);
    if (!raw) {
      return {
        textScale: 110,
        plugins: { webSearch: false, urlContext: true },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      textScale: sanitizeTextScale(parsed.textScale),
      plugins: {
        webSearch: Boolean(parsed.plugins?.webSearch),
        urlContext: parsed.plugins?.urlContext !== false,
      },
    };
  } catch {
    return {
      textScale: 110,
      plugins: { webSearch: false, urlContext: true },
    };
  }
}

interface StoredFileMeta {
  name: string;
  mimeType: string;
  source: 'upload' | 'note';
  count?: number;
  textContent?: string;
}

function parseStoredAttachmentMeta(rawUrl?: string): StoredFileMeta | null {
  if (!rawUrl || !rawUrl.startsWith('meta:')) return null;
  try {
    return JSON.parse(rawUrl.slice(5)) as StoredFileMeta;
  } catch {
    return null;
  }
}

function loadSavedModelPrefs(): { model: GeminiModelId; autoFailover: boolean } {
  try {
    const raw = localStorage.getItem(MODEL_PREF_STORAGE_KEY);
    if (!raw) return { model: DEFAULT_GEMINI_MODEL, autoFailover: true };
    const parsed = JSON.parse(raw);
    return {
      model: sanitizeModelId(parsed.model),
      autoFailover: parsed.autoFailover !== false,
    };
  } catch {
    return { model: DEFAULT_GEMINI_MODEL, autoFailover: true };
  }
}

// Normalize anything claiming to be Creative Room history (local storage,
// IndexedDB backup, or an imported backup file) into clean ChatMessages.
// The thread is text-only, so modality/assetId are forced to safe values.
function sanitizeCreativeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Partial<ChatMessage>;
    if (typeof m.id !== 'string' || !m.id) continue;
    if (m.sender !== 'user' && m.sender !== 'companion') continue;
    if (typeof m.content !== 'string' || !m.content) continue;
    out.push({
      id: m.id,
      ownerId: typeof m.ownerId === 'string' ? m.ownerId : 'guest_local',
      conversationId: CREATIVE_ROOM_ID,
      sender: m.sender,
      content: m.content,
      thoughtStream: typeof m.thoughtStream === 'string' ? m.thoughtStream : '',
      modality: 'text',
      assetId: '',
      createdAtMs: Number(m.createdAtMs) || Date.now(),
      reactions: {},
    });
  }
  out.sort((a, b) => a.createdAtMs - b.createdAtMs);
  return out;
}

function loadCreativeRoomLocal(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CREATIVE_ROOM_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeCreativeMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Same normalization for the Games Room thread (its own conversation id).
function sanitizeGamesMessages(raw: unknown): ChatMessage[] {
  return sanitizeCreativeMessages(raw).map((m) => ({
    ...m,
    conversationId: GAMES_ROOM_ID,
  }));
}

function loadGamesRoomLocal(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(GAMES_ROOM_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeGamesMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

function createInitialGuestState() {
  const now = Date.now();
  const convId = 'conv_initial_boot';
  const profile: UserProfile = {
    ownerId: 'guest_local',
    callsign: 'Friend',
    // Signed-out visitors get a generic Companion: no personal notes until sign-in.
    dynamicNotes: '',
    preferredVoice: 'Kore',
    autoMessages: false,
    autoSpeakReplies: false,
    avatarUrl: '/assets/guest_avatar.svg',
    companionName: 'Companion',
    companionPersonality: '',
    companionGreeting: '',
    companionAvatarUrl: '/assets/companion_avatar.svg',
    createdAtMs: now,
    updatedAtMs: now,
  };

  const conversations: ConversationItem[] = [
    {
      id: convId,
      ownerId: 'guest_local',
      title: 'Direct Channel',
      isArchived: false,
      summary: '',
      lastMessagePreview: '',
      mood: 'FOCUSED',
      focus: 'HIGH',
      createdAtMs: now,
      updatedAtMs: now,
    },
  ];

  const messagesByConv: Record<string, ChatMessage[]> = {
    [convId]: [],
  };

  const memories: MemoryNode[] = [
    {
      id: 'mem_boot_1',
      ownerId: 'guest_local',
      category: 'dynamic',
      fact: 'This is a blank companion workspace. Personalize the companion name, personality, voice, and profile to make it your own.',
      importance: 5,
      sourceConversationId: convId,
      createdAtMs: now,
      updatedAtMs: now,
    },
  ];

  const initialJournal: CompanionJournalEntry[] = [
    {
      id: 'journal_boot_1',
      ownerId: 'guest_local',
      title: 'Getting Started',
      content:
        'Welcome in. This is a fresh workspace, ready to be personalized: set a companion name and personality, pick a voice, and start chatting. Memories, journal entries, and creations will build up naturally from here.',
      mood: 'FOCUSED',
      focus: 'Getting Started',
      tags: ['Welcome', 'Getting Started'],
      isAutonomous: true,
      createdAtMs: now,
      updatedAtMs: now,
    },
  ];

  return {
    profile,
    conversations,
    messagesByConv,
    memories,
    creations: [] as VisualCreation[],
    journal: initialJournal,
  };
}

function isStaleGhostThreadId(id: string | null | undefined): boolean {
  if (!id) return true;
  const lower = id.toLowerCase().trim();
  return (
    lower === 'conv_initial_boot' ||
    lower === 'default' ||
    lower === 'conv_direct_link' ||
    lower.includes('oct25') ||
    lower.includes('20261025') ||
    lower.includes('ghost')
  );
}

function getMostCurrentConversationId(
  conversations: ConversationItem[],
  messagesByConv?: Record<string, ChatMessage[]>
): string {
  if (!conversations || conversations.length === 0) return 'conv_direct_link';
  const unarchived = conversations.filter((c) => !c.isArchived);
  const candidates = unarchived.length > 0 ? unarchived : conversations;

  const scored = [...candidates].sort((a, b) => {
    const aMsgs = messagesByConv?.[a.id] || [];
    const bMsgs = messagesByConv?.[b.id] || [];
    const aLastMsg = aMsgs.length > 0 ? aMsgs[aMsgs.length - 1].createdAtMs : 0;
    const bLastMsg = bMsgs.length > 0 ? bMsgs[bMsgs.length - 1].createdAtMs : 0;

    // 1. Thread with newest actual message strictly wins!
    if (aLastMsg > 0 && bLastMsg > 0) {
      if (aLastMsg !== bLastMsg) {
        return bLastMsg - aLastMsg;
      }
    }

    // 2. A thread with real messages strictly takes precedence over an empty thread
    if (aLastMsg > 0 && bLastMsg === 0) return -1;
    if (bLastMsg > 0 && aLastMsg === 0) return 1;

    // 3. Demote known ghost thread IDs if other clean candidates exist
    const aIsGhost = isStaleGhostThreadId(a.id);
    const bIsGhost = isStaleGhostThreadId(b.id);
    if (!aIsGhost && bIsGhost) return -1;
    if (aIsGhost && !bIsGhost) return 1;

    // 4. Fall back to conversation timestamp
    const aTime = Number(a.updatedAtMs) || Number(a.createdAtMs) || 0;
    const bTime = Number(b.updatedAtMs) || Number(b.createdAtMs) || 0;
    return bTime - aTime;
  });

  return scored[0]?.id || candidates[0].id;
}

function loadInitialEcosystemState() {
  const fallback = createInitialGuestState();
  if (typeof window === 'undefined') {
    return {
      ...fallback,
      activeConversationId: fallback.conversations[0].id,
    };
  }
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) {
      return {
        ...fallback,
        activeConversationId: fallback.conversations[0].id,
      };
    }
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ...fallback,
        activeConversationId: fallback.conversations[0].id,
      };
    }

    const savedVoiceId =
      typeof window !== 'undefined' ? localStorage.getItem(VOICE_ID_STORAGE_KEY) : null;
    const resolvedVoice = sanitizeVoicePreset(
      savedVoiceId || parsed.profile?.preferredVoice || fallback.profile.preferredVoice
    );

    const profile: UserProfile = {
      ...fallback.profile,
      ...(parsed.profile || {}),
      preferredVoice: resolvedVoice,
      avatarUrl: parsed.profile?.avatarUrl || fallback.profile.avatarUrl,
      dynamicNotes: parsed.profile?.dynamicNotes || fallback.profile.dynamicNotes,
    };

    const conversations: ConversationItem[] =
      Array.isArray(parsed.conversations) && parsed.conversations.length > 0
        ? parsed.conversations
        : fallback.conversations;

    const messagesByConv: Record<string, ChatMessage[]> =
      parsed.messagesByConv && typeof parsed.messagesByConv === 'object'
        ? parsed.messagesByConv
        : fallback.messagesByConv;

    const memories: MemoryNode[] =
      Array.isArray(parsed.memories) && parsed.memories.length > 0
        ? parsed.memories
        : fallback.memories;

    const creations: VisualCreation[] =
      Array.isArray(parsed.creations) ? parsed.creations : fallback.creations;

    const journal: CompanionJournalEntry[] =
      Array.isArray(parsed.journal) && parsed.journal.length > 0
        ? parsed.journal
        : fallback.journal;

    // Automatically open the most current chat session
    const activeConversationId = getMostCurrentConversationId(conversations, messagesByConv);

    return {
      profile,
      conversations,
      activeConversationId,
      messagesByConv,
      memories,
      creations,
      journal,
    };
  } catch (err) {
    console.warn('Failed to parse localStorage state:', err);
    return {
      ...fallback,
      activeConversationId: fallback.conversations[0].id,
    };
  }
}

function formatMessageTimestamp(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return timeStr;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function getMsgDateKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDivider(ms: number): string {
  const d = new Date(ms);
  const todayKey = getMsgDateKey(Date.now());
  const msgKey = getMsgDateKey(ms);
  const yesterdayKey = getMsgDateKey(Date.now() - 86400000);

  const formatted = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (msgKey === todayKey) return `Today · ${formatted}`;
  if (msgKey === yesterdayKey) return `Yesterday · ${formatted}`;
  return formatted;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();

  // Persisted Free-Tier Gemini Model Selection & Failover State
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(
    () => loadSavedModelPrefs().model
  );
  const [autoFailover, setAutoFailover] = useState<boolean>(
    () => loadSavedModelPrefs().autoFailover
  );
  const [activeModelUsed, setActiveModelUsed] = useState<GeminiModelId | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        MODEL_PREF_STORAGE_KEY,
        JSON.stringify({ model: selectedModel, autoFailover })
      );
    } catch {
      // ignore storage quota
    }
  }, [selectedModel, autoFailover]);

  // Text Size & Cognitive Plugin Preferences
  const [textScale, setTextScale] = useState<TextScaleStep>(
    () => loadSavedUiPrefs().textScale
  );
  const [plugins, setPlugins] = useState<ActivePluginsState>(
    () => loadSavedUiPrefs().plugins
  );
  const [showTextSizePopover, setShowTextSizePopover] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        UI_PREF_STORAGE_KEY,
        JSON.stringify({ textScale, plugins })
      );
    } catch {
      // ignore storage quota
    }
  }, [textScale, plugins]);

  // UI Theme Skin (set-and-stay; the pre-paint script in index.html applies
  // the saved value before first render, this keeps it in sync afterwards)
  const [theme, setTheme] = useState<ThemeId>(() => loadSavedTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage quota
    }
    const chromeColor = THEME_SKINS.find((s) => s.id === theme)?.chromeColor;
    if (chromeColor) {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', chromeColor);
    }
  }, [theme]);

  // Core Ecosystem Data State (Synchronous zero-latency local load, never wiped)
  const [initialData] = useState(() => loadInitialEcosystemState());

  const [profile, setProfile] = useState<UserProfile>(() => initialData.profile);
  const [conversations, setConversations] = useState<ConversationItem[]>(
    () => initialData.conversations
  );
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => initialData.activeConversationId || 'conv_initial_boot'
  );
  const [guestMessagesMap, setGuestMessagesMap] = useState<Record<string, ChatMessage[]>>(
    () => initialData.messagesByConv
  );
  const messages = guestMessagesMap[activeConversationId] || [];
  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setGuestMessagesMap((map) => {
        const current = map[activeConversationId] || [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        return { ...map, [activeConversationId]: next };
      });
    },
    [activeConversationId]
  );
  const [memories, setMemories] = useState<MemoryNode[]>(
    () => initialData.memories
  );
  const [creations, setCreations] = useState<VisualCreation[]>(() => initialData.creations);
  const [journalEntries, setJournalEntries] = useState<CompanionJournalEntry[]>(
    () => initialData.journal
  );
  // Creative Room thread + its OWN streaming state. Fully separate from the
  // main chat (own state, own storage key, own cloud collection) so nothing
  // here can archive, replace, or lock the private conversation.
  const [creativeMessages, setCreativeMessages] = useState<ChatMessage[]>(
    () => loadCreativeRoomLocal()
  );
  const creativeMessagesRef = useRef(creativeMessages);
  useEffect(() => {
    creativeMessagesRef.current = creativeMessages;
  }, [creativeMessages]);
  const [isCreativeStreaming, setIsCreativeStreaming] = useState<boolean>(false);
  const [creativeStreamingReply, setCreativeStreamingReply] = useState<string>('');
  const isCreativeStreamingRef = useRef<boolean>(false);
  useEffect(() => {
    isCreativeStreamingRef.current = isCreativeStreaming;
  }, [isCreativeStreaming]);
  // Guards the Creative Room persistence effect until the IndexedDB fallback
  // check has run, so a wiped-localStorage boot can't overwrite the backup
  // with an empty thread before we've had the chance to restore it.
  const creativeHydratedRef = useRef<boolean>(false);
  // Games Room thread + its OWN streaming state, separate from main chat and
  // from the Creative Room (own state, own storage key) — same isolation rule.
  const [gamesMessages, setGamesMessages] = useState<ChatMessage[]>(
    () => loadGamesRoomLocal()
  );
  const gamesMessagesRef = useRef(gamesMessages);
  useEffect(() => {
    gamesMessagesRef.current = gamesMessages;
  }, [gamesMessages]);
  const [isGamesStreaming, setIsGamesStreaming] = useState<boolean>(false);
  const [gamesStreamingReply, setGamesStreamingReply] = useState<string>('');
  const isGamesStreamingRef = useRef<boolean>(false);
  useEffect(() => {
    isGamesStreamingRef.current = isGamesStreaming;
  }, [isGamesStreaming]);
  const gamesHydratedRef = useRef<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Front-door lock (server access gate): 'checking' while we ask the server,
  // 'locked' if a password is set and this device hasn't unlocked yet,
  // 'open' when there's no gate or we're in.
  const [accessState, setAccessState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [accessPasswordInput, setAccessPasswordInput] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/access/status');
        const data = await res.json();
        if (cancelled) return;
        // No gate, or already unlocked -> straight in. Anything odd -> also
        // let the app open (the server still enforces the lock on its side).
        setAccessState(!data.gateEnabled || data.authed ? 'open' : 'locked');
      } catch {
        if (!cancelled) setAccessState('open');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAccessUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessBusy) return;
    setAccessBusy(true);
    setAccessError(null);
    try {
      const res = await fetch('/api/access/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPasswordInput }),
      });
      if (res.ok) {
        setAccessState('open');
        setAccessPasswordInput('');
      } else {
        setAccessError("That password didn't unlock Companion. Check it and try again.");
      }
    } catch {
      setAccessError("Couldn't reach Companion's server. Check your connection and try again.");
    } finally {
      setAccessBusy(false);
    }
  };
  const [vitals, setVitals] = useState<VitalsState>({
    mood: 'FOCUSED',
    focus: 'HIGH',
    status: 'CONNECTED',
    thoughtStream: INITIAL_THOUGHT,
  });

  const currentUserRef = useRef<User | null>(null);
  const profileRef = useRef(profile);
  const conversationsRef = useRef(conversations);
  const guestMessagesMapRef = useRef(guestMessagesMap);
  const memoriesRef = useRef(memories);
  const creationsRef = useRef(creations);
  const journalEntriesRef = useRef(journalEntries);
  const vitalsRef = useRef(vitals);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Personalization rule (the owner's request): the owner's callsign, photo,
  // and personal notes only appear AFTER they sign in. A signed-out visitor sees a generic
  // Companion — callsign "Friend", Companion's own avatar, no personal notes sent to the
  // server. The real profile stays saved underneath and comes right back the
  // moment the owner signs in (Firebase keeps them signed in on their own devices).
  const isSignedInUser = Boolean(currentUser && !currentUser.isAnonymous);
  const displayProfile: UserProfile = isSignedInUser
    ? profile
    : {
        ...profile,
        callsign: 'Friend',
        dynamicNotes: '',
        avatarUrl: '/assets/guest_avatar.svg',
        companionName: 'Companion',
        companionPersonality: '',
        companionGreeting: '',
        companionAvatarUrl: '/assets/companion_avatar.svg',
      };
  const displayProfileRef = useRef(displayProfile);
  useEffect(() => {
    displayProfileRef.current = displayProfile;
  }, [displayProfile]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    guestMessagesMapRef.current = guestMessagesMap;
  }, [guestMessagesMap]);
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);
  useEffect(() => {
    creationsRef.current = creations;
  }, [creations]);
  useEffect(() => {
    journalEntriesRef.current = journalEntries;
  }, [journalEntries]);
  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);

  const [autonomousContemplation, setAutonomousContemplation] = useState<boolean>(true);
  const [isGeneratingJournal, setIsGeneratingJournal] = useState<boolean>(false);
  const [speakingJournalId, setSpeakingJournalId] = useState<string | null>(null);

  // Minimized Window Notification State
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // User Presence State & Tracking
  const [userPresence, setUserPresence] = useState<UserPresence>({
    status: 'active',
    lastActiveMs: Date.now(),
    updatedAtMs: Date.now(),
    isManualOverride: false,
  });
  const userPresenceRef = useRef<UserPresence>(userPresence);
  useEffect(() => {
    userPresenceRef.current = userPresence;
  }, [userPresence]);

  const handleUpdateUserPresence = useCallback(
    (updates: Partial<UserPresence>) => {
      setUserPresence((prev) => {
        const next: UserPresence = {
          ...prev,
          ...updates,
          updatedAtMs: Date.now(),
        };
        userPresenceRef.current = next;

        // Companion's candid thought stream attunes to User's presence in real time
        if (updates.status && updates.status !== prev.status) {
          if (updates.status === 'away') {
            setVitals((v) => ({
              ...v,
              thoughtStream: `Companion standing by: ${displayProfileRef.current.callsign} stepped away. Channel on perimeter watch.`,
            }));
          } else if (updates.status === 'active') {
            setVitals((v) => ({
              ...v,
              thoughtStream: `Companion attuned: Direct frequency linked. ${displayProfileRef.current.callsign} is active.`,
            }));
          }
        }

        // Persist to Cloud Firestore if user is authenticated
        const uid = currentUserRef.current?.uid;
        if (uid) {
          void saveUserPresence(uid, next);
        }

        return next;
      });
    },
    []
  );

  // System Error Telemetry Logs State
  const [systemErrorLogs, setSystemErrorLogs] = useState<SystemErrorLog[]>(() => {
    try {
      const saved = sessionStorage.getItem('companion_system_error_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const logSystemError = useCallback(
    (
      category: SystemErrorLog['category'],
      message: string,
      severity: 'warning' | 'error' = 'warning',
      details?: string
    ) => {
      const newLog: SystemErrorLog = {
        id: makeSafeId('err'),
        timestampMs: Date.now(),
        category,
        message,
        severity,
        details,
      };
      setSystemErrorLogs((prev) => {
        const updated = [newLog, ...prev].slice(0, 50);
        try {
          sessionStorage.setItem('companion_system_error_logs', JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    []
  );

  const handleClearSystemErrors = useCallback(() => {
    setSystemErrorLogs([]);
    try {
      sessionStorage.removeItem('companion_system_error_logs');
    } catch {
      // ignore
    }
  }, []);

  // 10-Minute User Idle Activity Tracking for Check-In & Realtime Presence
  const lastUserActivityRef = useRef<number>(Date.now());
  const lastAutoCheckinRef = useRef<number>(Date.now());
  const lastJournalContemplationRef = useRef<number>(Date.now());

  useEffect(() => {
    const markActivity = () => {
      lastUserActivityRef.current = Date.now();
      if (
        userPresenceRef.current.status !== 'active' &&
        !userPresenceRef.current.isManualOverride
      ) {
        handleUpdateUserPresence({ status: 'active', lastActiveMs: Date.now() });
      }
    };
    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity, { passive: true });
    window.addEventListener('touchstart', markActivity, { passive: true });

    // 2-Minute Idle detection to automatically mark User as away
    const idleInterval = setInterval(() => {
      const idleMs = Date.now() - lastUserActivityRef.current;
      if (
        idleMs > 2 * 60 * 1000 &&
        userPresenceRef.current.status === 'active' &&
        !userPresenceRef.current.isManualOverride
      ) {
        handleUpdateUserPresence({ status: 'away', note: 'Idle > 2m' });
      }
    }, 15000);

    // Visibility change handler (marks as away when browser tab is hidden/minimized)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (
          userPresenceRef.current.status === 'active' &&
          !userPresenceRef.current.isManualOverride
        ) {
          handleUpdateUserPresence({ status: 'away', note: 'Tab hidden/minimized' });
        }
      } else if (document.visibilityState === 'visible') {
        if (!userPresenceRef.current.isManualOverride) {
          handleUpdateUserPresence({ status: 'active', lastActiveMs: Date.now() });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('touchstart', markActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(idleInterval);
    };
  }, [handleUpdateUserPresence]);

  const [messageAssets, setMessageAssets] = useState<Record<string, string>>({});
  const messageAssetsRef = useRef<Record<string, string>>(messageAssets);
  useEffect(() => {
    messageAssetsRef.current = messageAssets;
  }, [messageAssets]);

  const [savedMemoriesByMsgId, setSavedMemoriesByMsgId] = useState<Record<string, string[]>>({});
  const [groundingByMsgId, setGroundingByMsgId] = useState<Record<string, GroundingSource[]>>({});

  // Helper to gather all local image assets (both message attachments and studio visual creations)
  const collectAllLocalAssets = useCallback(async (): Promise<Record<string, string>> => {
    const assets: Record<string, string> = { ...messageAssetsRef.current };
    for (const c of creationsRef.current) {
      if (c.assetId && !assets[c.assetId]) {
        const u = await loadAssetDataUrl(c.assetId);
        if (u) assets[c.assetId] = u;
      }
    }
    for (const msgs of Object.values(guestMessagesMapRef.current)) {
      for (const m of msgs) {
        if (m.assetId && !assets[m.assetId]) {
          const u = await loadAssetDataUrl(m.assetId);
          if (u) assets[m.assetId] = u;
        }
      }
    }
    return assets;
  }, []);

  // UI & HUD State
  const [activeView, setActiveView] = useState<ActiveWorkspaceView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAvatarMinimized, setIsAvatarMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('companion_avatar_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const toggleAvatarMinimized = useCallback(() => {
    setIsAvatarMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('companion_avatar_minimized', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);


  const [studioInitialConfig, setStudioInitialConfig] = useState<{
    prompt: string;
    stylePreset?: string;
    aspectRatio?: AspectRatioOption;
  } | null>(null);

  // Chat Input, Attachments & Streaming State
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [isEnhancingInput, setIsEnhancingInput] = useState(false);
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isRefreshingChannel, setIsRefreshingChannel] = useState(false);
  const [refreshSuccessToast, setRefreshSuccessToast] = useState<string | null>(null);
  const lastUserPromptRef = useRef<string>('');

  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPluginsModal, setShowPluginsModal] = useState(false);
  const [renamingConv, setRenamingConv] = useState<ConversationItem | null>(null);
  const [renamingFile, setRenamingFile] = useState<{ assetId: string; currentName: string } | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeFilterDate, setActiveFilterDate] = useState<string | null>(null);
  const [jumpedDateKey, setJumpedDateKey] = useState<string | null>(null);

  // API Delay & Latency Telemetry State
  const [apiDelayMetrics, setApiDelayMetrics] = useState<{ ttftMs: number | null; totalMs: number | null }>({
    ttftMs: null,
    totalMs: null,
  });

  // Cross-Device Cloud Sync State (Firebase Firestore & Auth)
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  // Last cloud-read failure from the most recent sync (null = clean fetch).
  // Shown in the Sync modal so read failures aren't silent anymore.
  const [lastSyncErrorMsg, setLastSyncErrorMsg] = useState<string | null>(null);
  const [isCloudHydrating, setIsCloudHydrating] = useState<boolean>(() => {
    const last = getLastKnownUser();
    return Boolean(last.uid) || isStandalonePWA();
  });
  const hasHydratedFromCloudRef = useRef<boolean>(false);
  const [storagePersistence, setStoragePersistence] = useState<StoragePersistenceStatus | null>(null);

  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem('companion_last_synced_at');
      return v ? parseInt(v, 10) : null;
    } catch {
      return null;
    }
  });

  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Tracks thread IDs that the user actively typed into, sent messages in, or selected during THIS tab session
  const activeTabInteractedConvIdsRef = useRef<Set<string>>(new Set());

  // Floating scroll-to-bottom & reaction states
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const isScrolledUpRef = useRef<boolean>(false);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState<number>(0);
  const hasPerformedInitialScrollRef = useRef<Record<string, boolean>>({});
  const lastKnownMsgCountRef = useRef<number>(0);
  // "Settle at bottom on open" state: when a conversation opens, its content
  // keeps growing in stages (message pictures hydrate, cloud sync lands in
  // batches), so the one-time initial jump below often ends up stranded
  // partway up the history. While this settle window is open, the effects
  // further down keep the chat pinned to the very bottom. If the user
  // scrolls up on purpose, `cancelled` flips and the pinning stops at once.
  const settleStateRef = useRef<{ convId: string; untilMs: number; cancelled: boolean }>({
    convId: '',
    untilMs: 0,
    cancelled: false,
  });
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const [isCompanionReactingMsgId, setIsCompanionReactingMsgId] = useState<string | null>(null);

  const deletedJournalIdsRef = useRef<Set<string>>(new Set());
  const deletedConvIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('companion_deleted_conv_ids') : null;
        return new Set<string>(saved ? JSON.parse(saved) : []);
      } catch {
        return new Set<string>();
      }
    })()
  );
  const deletedMemoryIdsRef = useRef<Set<string>>(new Set());
  const uncontemplatedTurnsRef = useRef<number>(0);
  const isStreamingRef = useRef<boolean>(false);
  const callStateRef = useRef<string>('idle');
  const autonomousContemplationRef = useRef<boolean>(autonomousContemplation);
  const messagesRef = useRef(messages);
  const selectedModelRef = useRef(selectedModel);
  const autoFailoverRef = useRef(autoFailover);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  useEffect(() => {
    autonomousContemplationRef.current = autonomousContemplation;
  }, [autonomousContemplation]);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  useEffect(() => {
    autoFailoverRef.current = autoFailover;
  }, [autoFailover]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textSizePopoverRef = useRef<HTMLDivElement | null>(null);
  const noteRecorderRef = useRef<MediaRecorder | null>(null);
  const noteChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!showTextSizePopover) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        textSizePopoverRef.current &&
        !textSizePopoverRef.current.contains(e.target as Node)
      ) {
        setShowTextSizePopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showTextSizePopover]);

  // Persist ecosystem state to localStorage and IndexedDB automatically as offline fallback
  useEffect(() => {
    // CRITICAL: DO NOT save if we haven't completed cloud hydration yet AND current state is merely an un-hydrated blank boot stub
    const isBlankBootStub =
      conversations.length <= 1 &&
      conversations[0]?.id === 'conv_initial_boot' &&
      (!guestMessagesMap['conv_initial_boot'] || guestMessagesMap['conv_initial_boot'].length === 0);

    if (!hasHydratedFromCloudRef.current && isBlankBootStub) {
      // Prevent isolated PWA launch from wiping local storage with an empty boot stub
      return;
    }

    try {
      if (profile.preferredVoice) {
        localStorage.setItem(VOICE_ID_STORAGE_KEY, profile.preferredVoice);
      }
      const serialized = JSON.stringify({
        profile,
        conversations,
        messagesByConv: guestMessagesMap,
        memories,
        creations,
        journal: journalEntries,
      });
      localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      // Asynchronously backup to durable IndexedDB so mobile PWA containers retain history
      void saveToIndexedDB(LOCAL_STORAGE_KEY, serialized);
    } catch {
      // ignore quota
    }
  }, [profile, conversations, guestMessagesMap, memories, creations, journalEntries]);

  // Creative Room: if localStorage had no copy at boot (e.g. wiped PWA),
  // restore the thread from its IndexedDB mirror before allowing writes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localRaw = localStorage.getItem(CREATIVE_ROOM_STORAGE_KEY);
        if (!localRaw) {
          const backup = await loadFromIndexedDB<string>(CREATIVE_ROOM_STORAGE_KEY);
          if (backup && !cancelled) {
            const restored = sanitizeCreativeMessages(JSON.parse(backup));
            if (restored.length > 0) {
              setCreativeMessages(restored);
            }
          }
        }
      } catch {
        // ignore — the Room simply starts empty
      } finally {
        creativeHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Creative Room: persist the thread to its own localStorage key + IndexedDB
  // mirror whenever it changes (independent of the main ecosystem blob).
  useEffect(() => {
    if (!creativeHydratedRef.current) return;
    try {
      const serialized = JSON.stringify(creativeMessages);
      localStorage.setItem(CREATIVE_ROOM_STORAGE_KEY, serialized);
      void saveToIndexedDB(CREATIVE_ROOM_STORAGE_KEY, serialized);
    } catch {
      // ignore quota
    }
  }, [creativeMessages]);

  // Games Room: same IndexedDB fallback restore as the Creative Room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localRaw = localStorage.getItem(GAMES_ROOM_STORAGE_KEY);
        if (!localRaw) {
          const backup = await loadFromIndexedDB<string>(GAMES_ROOM_STORAGE_KEY);
          if (backup && !cancelled) {
            const restored = sanitizeGamesMessages(JSON.parse(backup));
            if (restored.length > 0) {
              setGamesMessages(restored);
            }
          }
        }
      } catch {
        // ignore — the Room simply starts empty
      } finally {
        gamesHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Games Room: persist the thread to its own localStorage key + IndexedDB mirror.
  useEffect(() => {
    if (!gamesHydratedRef.current) return;
    try {
      const serialized = JSON.stringify(gamesMessages);
      localStorage.setItem(GAMES_ROOM_STORAGE_KEY, serialized);
      void saveToIndexedDB(GAMES_ROOM_STORAGE_KEY, serialized);
    } catch {
      // ignore quota
    }
  }, [gamesMessages]);

  // Startup: Explicit storage persistence handling & Cloud-First Hydration Strategy
  useEffect(() => {
    let isMounted = true;

    async function initStorageAndHydrate() {
      // 1. Explicitly request persistent storage from browser/OS (navigator.storage.persist)
      try {
        const status = await requestPersistentStorage();
        if (isMounted) setStoragePersistence(status);
      } catch (err) {
        console.warn('Persistent storage init notice:', err);
      }

      // 2. If localStorage was empty/wiped (e.g. fresh standalone PWA window), restore from IndexedDB snapshot
      if (typeof window !== 'undefined') {
        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!localRaw) {
          try {
            const idbBackup = await loadFromIndexedDB<string>(LOCAL_STORAGE_KEY);
            if (idbBackup && isMounted) {
              const parsed = JSON.parse(idbBackup);
              if (parsed && Array.isArray(parsed.conversations) && parsed.conversations.length > 0) {
                setProfile(parsed.profile);
                setConversations(parsed.conversations);
                setGuestMessagesMap(parsed.messagesByConv || {});
                setMemories(parsed.memories || []);
                setCreations(parsed.creations || []);
                setJournalEntries(parsed.journal || []);
                // Prevent locking clients to stale historical ghost threads from old IndexedDB snapshots
                const resolvedActive = getMostCurrentConversationId(
                  parsed.conversations,
                  parsed.messagesByConv || {}
                );
                if (resolvedActive && !isStaleGhostThreadId(resolvedActive)) {
                  setActiveConversationId(resolvedActive);
                }
              }
            }
          } catch (err) {
            console.warn('IndexedDB startup recovery check notice:', err);
          }
        }
      }

      // 2.5 Query backend session routing to verify thread hygiene on iOS/mobile clients
      try {
        const initRes = await fetch('/api/session/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateThreadId: activeConversationIdRef.current,
            isColdStart: true,
            lastActiveMs: Date.now(),
          }),
        });
        if (initRes.ok) {
          const sData = await initRes.json();
          if (sData?.action === 'pull_live' && isStaleGhostThreadId(activeConversationIdRef.current)) {
            const bestConv = getMostCurrentConversationId(
              conversationsRef.current,
              guestMessagesMapRef.current
            );
            if (bestConv && !isStaleGhostThreadId(bestConv)) {
              setActiveConversationId(bestConv);
            }
          }
        }
      } catch {
        // graceful offline fallback
      }

      // 3. Cloud-First Hydration: Pull latest chat history from cloud before defaulting to local
      try {
        // Wait for Firebase Auth initialization with safety timeout for offline mobile support
        const readyPromise = auth.authStateReady ? auth.authStateReady() : Promise.resolve();
        const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1500));
        await Promise.race([readyPromise, timeoutPromise]);

        const user = auth.currentUser;
        if (user && !user.isAnonymous) {
          recordLastKnownUser(user.uid, user.email);
        }
        hasHydratedFromCloudRef.current = true;
        if (isMounted) setIsCloudHydrating(false);
      } catch (err) {
        console.warn('Cloud hydration bootstrap notice:', err);
        hasHydratedFromCloudRef.current = true;
        if (isMounted) setIsCloudHydrating(false);
      }
    }

    void initStorageAndHydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  // Firebase Auth state listener and cloud synchronization check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // If user was signed in anonymously from an older build, sign out cleanly
      if (user && user.isAnonymous) {
        try {
          await logOutCloud();
        } catch {
          // ignore
        }
        clearLastKnownUser();
        setCurrentUser(null);
        currentUserRef.current = null;
        hasHydratedFromCloudRef.current = true;
        setIsCloudHydrating(false);
        return;
      }

      if (!user) {
        setCurrentUser(null);
        currentUserRef.current = null;
        hasHydratedFromCloudRef.current = true;
        setIsCloudHydrating(false);
        setIsCloudSyncing(false);
        return;
      }

      // Verify token in background without logging out user if offline or refreshing
      try {
        await user.getIdToken();
      } catch (tokenErr: unknown) {
        console.warn('Auth token verification notice, retaining session with cached credentials:', tokenErr);
      }

      setCurrentUser(user);
      currentUserRef.current = user;

      recordLastKnownUser(user.uid, user.email);
      setIsCloudSyncing(true);
      try {
          const localAssets = await collectAllLocalAssets();
          // Perform true 2-way merge: combine cloud data with local data so neither device wipes the other.
          // Intentionally NOT forced: this fires on every app open / auth
          // restore, so the sync layer's 90-second freshness guard applies
          // and repeat opens don't each pay for a full cloud pull.
          const merged = await syncBidirectional(user.uid, {
            profile: profileRef.current,
            conversations: conversationsRef.current,
            messagesByConv: guestMessagesMapRef.current,
            memories: memoriesRef.current,
            creations: creationsRef.current,
            journal: journalEntriesRef.current,
            assets: localAssets,
          });

          setProfile(merged.profile);
          setConversations(merged.conversations);
          setGuestMessagesMap((prev) => {
            const next: Record<string, ChatMessage[]> = { ...prev };
            for (const [cId, msgs] of Object.entries(merged.messagesByConv)) {
              const currentMsgs = prev[cId] || [];
              const { merged: mergedList } = mergeMessagesWithLocalPrecedence(currentMsgs, msgs);
              next[cId] = mergedList;
            }
            return next;
          });
          setMemories(merged.memories);
          setCreations(merged.creations);
          setJournalEntries(merged.journal);

          // Save cloud creations image data URLs to local vault
          for (const c of merged.creations) {
            const dUrl = (c as { dataUrl?: string }).dataUrl;
            if (c.assetId && dUrl) {
              void saveAssetDataUrl(c.assetId, dUrl);
            }
          }

          if (merged.assets && Object.keys(merged.assets).length > 0) {
            setMessageAssets((prev) => ({ ...prev, ...merged.assets }));
            for (const [aId, dUrl] of Object.entries(merged.assets)) {
              void saveAssetDataUrl(aId, dUrl);
            }
          }

          // Session Routing upon Auth:
          // Incoming web app sessions strictly pull the current active live thread
          // unless the user actively typed/interacted with currId in THIS browser tab session
          setActiveConversationId((currId) => {
            const liveActiveId = getMostCurrentConversationId(merged.conversations, merged.messagesByConv);

            // If the user actively typed or sent messages in currId during THIS browser tab session, preserve it
            if (currId && activeTabInteractedConvIdsRef.current.has(currId) && !isStaleGhostThreadId(currId)) {
              const exists = merged.conversations.some((c) => c.id === currId);
              if (exists) return currId;
            }

            // Otherwise, incoming/authenticating sessions must strictly pull the current active live thread
            if (liveActiveId && !isStaleGhostThreadId(liveActiveId)) {
              return liveActiveId;
            }

            if (merged.conversations.length > 0) {
              const firstValid =
                merged.conversations.find((c) => !c.isArchived && !isStaleGhostThreadId(c.id)) ||
                merged.conversations[0];
              return firstValid.id;
            }

            return currId && !isStaleGhostThreadId(currId) ? currId : 'conv_direct_link';
          });

          const now = Date.now();
          setLastSyncedAtMs(now);
          try {
            localStorage.setItem('companion_last_synced_at', String(now));
          } catch {
            // ignore
          }
        } catch (err) {
          console.warn('Cloud synchronization check notice:', err);
        } finally {
          setIsCloudSyncing(false);
          hasHydratedFromCloudRef.current = true;
          setIsCloudHydrating(false);
        }
    });

    return () => unsub();
  }, []);

  // Real-time Firestore Listeners: Conversations (merges with local state, never dropping valid chats)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const colRef = collection(db, 'users', currentUser.uid, 'conversations');
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const cloudConvs: ConversationItem[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          cloudConvs.push({
            id: docSnap.id,
            ownerId: currentUser.uid,
            title: d.title || 'Direct Channel',
            isArchived: Boolean(d.isArchived),
            summary: d.summary || '',
            lastMessagePreview: d.lastMessagePreview || '',
            mood: d.mood || 'FOCUSED',
            focus: d.focus || 'HIGH',
            createdAtMs: Number(d.createdAtMs) || Date.now(),
            updatedAtMs: Number(d.updatedAtMs) || Number(d.createdAtMs) || Date.now(),
          });
        });
        cloudConvs.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));

        setConversations((prev) => {
          const { merged, missingInCloud } = mergeConversationsGracefully(
            prev,
            cloudConvs,
            guestMessagesMapRef.current,
            deletedConvIdsRef.current
          );
          return merged;
        });

        // Stabilize active conversation:
        // Do not pin to stale ghost stubs; preserve currId if valid and active or switch to live active thread
        setActiveConversationId((currId) => {
          if (!currId || isStaleGhostThreadId(currId)) {
            const best = getMostCurrentConversationId(cloudConvs, guestMessagesMapRef.current);
            return best || 'conv_direct_link';
          }
          const userInteracted = activeTabInteractedConvIdsRef.current.has(currId);
          const localHasMsgs = (guestMessagesMapRef.current[currId]?.length || 0) > 0;
          if (userInteracted || localHasMsgs) {
            return currId;
          }
          if (cloudConvs.some((c) => c.id === currId)) {
            return currId;
          }
          const best = getMostCurrentConversationId(cloudConvs, guestMessagesMapRef.current);
          return best || currId;
        });
      },
      (err) => console.warn('Cloud convs sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: Messages for active conversation (merges by msg.id and backs up local)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email || !activeConversationId) return;
    const colRef = collection(db, 'users', currentUser.uid, 'conversations', activeConversationId, 'messages');
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const cloudMsgs: ChatMessage[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          cloudMsgs.push({
            id: docSnap.id,
            ownerId: currentUser.uid,
            conversationId: activeConversationId,
            sender: d.sender || 'companion',
            content: d.content || '',
            thoughtStream: d.thoughtStream || '',
            modality: d.modality || 'text',
            assetId: d.assetId || '',
            createdAtMs: Number(d.createdAtMs) || Date.now(),
            reactions: (d.reactions as Record<string, string[]>) || {},
          });
        });
        cloudMsgs.sort((a, b) => a.createdAtMs - b.createdAtMs);

        setGuestMessagesMap((prev) => {
          const current = prev[activeConversationId] || [];
          const { merged } = mergeMessagesWithLocalPrecedence(current, cloudMsgs);
          return {
            ...prev,
            [activeConversationId]: merged,
          };
        });
      },
      (err) => console.warn('Cloud msgs sync err:', err)
    );
    return () => unsub();
  }, [currentUser, activeConversationId]);

  // Real-time Firestore Listener: Creative Room thread (latest 200 only, so
  // the first snapshot stays cheap forever; after that a listener only
  // delivers what changed — roughly one read per message). The Room is NOT
  // part of fetchAllCloudData / syncBidirectional on purpose (v1): folding it
  // into the full pull would raise full-pull cost and mean editing the merge
  // code that protects the main chat.
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const q = query(
      collection(db, 'users', currentUser.uid, 'creative_room'),
      orderBy('createdAtMs', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const cloudMsgs: ChatMessage[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          cloudMsgs.push({
            id: docSnap.id,
            ownerId: currentUser.uid,
            conversationId: CREATIVE_ROOM_ID,
            sender: d.sender || 'companion',
            content: d.content || '',
            thoughtStream: d.thoughtStream || '',
            modality: 'text',
            assetId: '',
            createdAtMs: Number(d.createdAtMs) || Date.now(),
            reactions: {},
          });
        });
        cloudMsgs.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setCreativeMessages((prev) => {
          const { merged } = mergeMessagesWithLocalPrecedence(prev, cloudMsgs);
          return merged;
        });
      },
      (err) => console.warn('Cloud creative room sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: Memory Vault (merges by id)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const q = query(
      collection(db, 'users', currentUser.uid, 'memories'),
      orderBy('updatedAtMs', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const cloudMems: MemoryNode[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            cloudMems.push({
              id: docSnap.id,
              ownerId: currentUser.uid,
              category: d.category || 'directive',
              fact: d.fact || '',
              importance: d.importance || 5,
              sourceConversationId: d.sourceConversationId || '',
              createdAtMs: d.createdAtMs || Date.now(),
              updatedAtMs: d.updatedAtMs || Date.now(),
            });
          });
          setMemories((prev) => {
            const map = new Map<string, MemoryNode>();
            for (const m of cloudMems) {
              if (!deletedMemoryIdsRef.current.has(m.id)) {
                map.set(m.id, m);
              }
            }
            for (const m of prev) {
              if (!map.has(m.id) && !deletedMemoryIdsRef.current.has(m.id)) {
                map.set(m.id, m);
                if (currentUser?.uid) {
                  void saveCloudMemory(currentUser.uid, m);
                }
              }
            }
            return Array.from(map.values()).sort(
              (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
            );
          });
        }
      },
      (err) => console.warn('Cloud memories sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: Visual Creations (merges by id)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const q = query(
      collection(db, 'users', currentUser.uid, 'creations'),
      orderBy('createdAtMs', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const cloudCreations: VisualCreation[] = [];
          const assetsToAdd: Record<string, string> = {};
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            cloudCreations.push({
              id: docSnap.id,
              ownerId: currentUser.uid,
              prompt: d.prompt || '',
              stylePreset: d.stylePreset || 'Prompt Only',
              aspectRatio: d.aspectRatio || '1:1',
              assetId: d.assetId || '',
              createdAtMs: d.createdAtMs || Date.now(),
            });
            if (d.assetId && d.dataUrl) {
              assetsToAdd[d.assetId] = d.dataUrl;
              void saveAssetDataUrl(d.assetId, d.dataUrl);
            }
          });
          setCreations((prev) => {
            const map = new Map<string, VisualCreation>();
            for (const c of cloudCreations) map.set(c.id, c);
            for (const c of prev) {
              if (!map.has(c.id)) map.set(c.id, c);
            }
            return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
          });
          if (Object.keys(assetsToAdd).length > 0) {
            setMessageAssets((prev) => ({ ...prev, ...assetsToAdd }));
          }
        }
      },
      (err) => console.warn('Cloud creations sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: Assets & Attached Images (cross-device sync)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const q = query(
      collection(db, 'users', currentUser.uid, 'assets'),
      orderBy('createdAtMs', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const assetsToAdd: Record<string, string> = {};
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            if (d.dataUrl) {
              assetsToAdd[docSnap.id] = d.dataUrl;
              void saveAssetDataUrl(docSnap.id, d.dataUrl);
            }
          });
          if (Object.keys(assetsToAdd).length > 0) {
            setMessageAssets((prev) => ({ ...prev, ...assetsToAdd }));
          }
        }
      },
      (err) => console.warn('Cloud assets sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: User Profile
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const docRef = doc(db, 'users', currentUser.uid, 'profile', 'default');
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setProfile((prev) => {
            const cloudVoice = sanitizeVoicePreset(
              d.preferredVoice || localStorage.getItem(VOICE_ID_STORAGE_KEY) || prev.preferredVoice
            );
            try {
              localStorage.setItem(VOICE_ID_STORAGE_KEY, cloudVoice);
            } catch {
              // ignore
            }
            return {
              ...prev,
              callsign: d.callsign || prev.callsign,
              dynamicNotes: d.dynamicNotes ?? prev.dynamicNotes,
              preferredVoice: cloudVoice,
              autoMessages: Boolean(d.autoMessages),
              autoSpeakReplies: Boolean(d.autoSpeakReplies),
              avatarUrl: d.avatarUrl || prev.avatarUrl,
              companionName: d.companionName ?? prev.companionName,
              companionPersonality: d.companionPersonality ?? prev.companionPersonality,
              companionGreeting: d.companionGreeting ?? prev.companionGreeting,
              companionAvatarUrl: d.companionAvatarUrl ?? prev.companionAvatarUrl,
              updatedAtMs: d.updatedAtMs || prev.updatedAtMs,
            };
          });
        }
      },
      (err) => console.warn('Cloud profile sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time Firestore Listeners: Companion's Journal
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const q = query(
      collection(db, 'users', currentUser.uid, 'journal'),
      orderBy('createdAtMs', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const cloudEntries: CompanionJournalEntry[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          cloudEntries.push({
            id: docSnap.id,
            ownerId: currentUser.uid,
            title: d.title || 'Companion Reflection',
            content: d.content || '',
            mood: d.mood || 'FOCUSED',
            focus: d.focus || 'Direct Link',
            tags: Array.isArray(d.tags) ? d.tags : [],
            isAutonomous: Boolean(d.isAutonomous),
            createdAtMs: d.createdAtMs || Date.now(),
            updatedAtMs: d.updatedAtMs || Date.now(),
          });
        });
        setJournalEntries((prev) => {
          const map = new Map<string, CompanionJournalEntry>();
          for (const j of cloudEntries) {
            if (!deletedJournalIdsRef.current.has(j.id)) {
              map.set(j.id, j);
            }
          }
          for (const j of prev) {
            if (!map.has(j.id) && !deletedJournalIdsRef.current.has(j.id)) {
              map.set(j.id, j);
            }
          }
          return Array.from(map.values()).sort(
            (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
          );
        });

        if (cloudEntries.length > 0 && cloudEntries[0]) {
          const latest = cloudEntries[0];
          if (Date.now() - (latest.createdAtMs || 0) < 15000) {
            setVitals((vPrev) => ({
              ...vPrev,
              thoughtStream: `Recorded in Companion's Journal: "${latest.title}"`,
            }));
          }
        }
      },
      (err) => console.warn('Cloud journal sync err:', err)
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time cross-tab and in-memory event sync for journal entries
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed.journal)) {
            setJournalEntries((prev) => {
              const map = new Map<string, CompanionJournalEntry>();
              for (const j of parsed.journal) map.set(j.id, j);
              for (const j of prev) {
                if (!map.has(j.id)) map.set(j.id, j);
              }
              return Array.from(map.values()).sort(
                (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
              );
            });
          }
        } catch {
          // ignore
        }
      }
    };
    const handleJournalCustom = (e: Event) => {
      const customEvt = e as CustomEvent<CompanionJournalEntry>;
      if (customEvt.detail && customEvt.detail.id) {
        setJournalEntries((prev) => {
          if (prev.some((j) => j.id === customEvt.detail.id)) return prev;
          return [customEvt.detail, ...prev].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        });
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('companion_journal_updated', handleJournalCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('companion_journal_updated', handleJournalCustom);
    };
  }, []);

  // Real-time Cloud Firestore Presence Sync across devices for User
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || !currentUser.email) return;
    const unsub = subscribeUserPresence(currentUser.uid, (cloudPresence) => {
      if (cloudPresence && cloudPresence.updatedAtMs > userPresenceRef.current.updatedAtMs) {
        setUserPresence(cloudPresence);
        userPresenceRef.current = cloudPresence;
        if (cloudPresence.status === 'away') {
          setVitals((v) => ({
            ...v,
            thoughtStream: `Companion standing by: ${displayProfileRef.current.callsign} away on connected device.`,
          }));
        } else if (cloudPresence.status === 'active') {
          setVitals((v) => ({
            ...v,
            thoughtStream: `Companion attuned: Direct frequency active with ${displayProfileRef.current.callsign}.`,
          }));
        }
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Capture Runtime & Engine Errors into System Error Telemetry
  useEffect(() => {
    if (bannerError) {
      logSystemError('api', bannerError, 'error');
    }
  }, [bannerError, logSystemError]);

  // Web Notification Helper for Minimized / Background Alert
  const sendMinimizedNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (document.visibilityState !== 'hidden') return;
    if (Notification.permission !== 'granted') return;

    try {
      const cleanBody = body.replace(/[*_#`~[\]]/g, '').slice(0, 180);
      const notif = new Notification(title, {
        body: cleanBody + (body.length > 180 ? '...' : ''),
        icon: '/assets/companion_avatar.svg',
        badge: '/assets/companion_avatar.svg',
        tag: 'companion-alert',
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (err) {
      console.warn('Notification trigger notice:', err);
    }
  }, []);

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBannerError('Web Notifications are not supported in this browser.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotificationsEnabled(true);
        setRefreshSuccessToast('Minimized notifications active');
        setTimeout(() => setRefreshSuccessToast(null), 3000);
      } else {
        setNotificationsEnabled(false);
      }
    } catch {
      // ignore
    }
  };

  // 1-Click Google Sign In Action to link cross-device sync
  const handleSignInWithGoogleAction = async () => {
    setIsCloudSyncing(true);
    try {
      const user = await signInWithGoogle();
      await applySignedInUser(user);
    } catch (err) {
      console.warn('Google sign-in error:', err);
      throw err;
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Companion's own login: email + password sign-in (no Google account needed).
  const handleSignInWithEmailAction = async (email: string, password: string) => {
    setIsCloudSyncing(true);
    try {
      const user = await signInWithEmail(email, password);
      await applySignedInUser(user);
    } catch (err) {
      console.warn('Email sign-in error:', err);
      throw err;
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Companion's own login: create a new email + password account.
  const handleSignUpWithEmailAction = async (email: string, password: string) => {
    setIsCloudSyncing(true);
    try {
      const user = await signUpWithEmail(email, password);
      await applySignedInUser(user);
    } catch (err) {
      console.warn('Email sign-up error:', err);
      throw err;
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Shared finish line for every sign-in method: remember the user, then merge
  // cloud + local data both ways so neither device wipes the other.
  const applySignedInUser = async (user: User) => {
      setCurrentUser(user);
      currentUserRef.current = user;

      const localAssets = await collectAllLocalAssets();
      // Bidirectional sync: uploads local sessions to cloud and downloads existing cloud sessions.
      // Forced: this runs right after an explicit sign-in, so it always pulls.
      const merged = await syncBidirectional(user.uid, {
        profile: profileRef.current,
        conversations: conversationsRef.current,
        messagesByConv: guestMessagesMapRef.current,
        memories: memoriesRef.current,
        creations: creationsRef.current,
        journal: journalEntriesRef.current,
        assets: localAssets,
      }, { force: true });
      setLastSyncErrorMsg(getLastSyncError());

      setProfile(merged.profile);
      setConversations(merged.conversations);
      setGuestMessagesMap((prev) => {
        const next: Record<string, ChatMessage[]> = { ...prev };
        for (const [cId, msgs] of Object.entries(merged.messagesByConv)) {
          const currentMsgs = prev[cId] || [];
          const { merged: mergedList } = mergeMessagesWithLocalPrecedence(currentMsgs, msgs);
          next[cId] = mergedList;
        }
        return next;
      });
      setMemories(merged.memories);
      setCreations(merged.creations);
      setJournalEntries(merged.journal);

      for (const c of merged.creations) {
        const dUrl = (c as { dataUrl?: string }).dataUrl;
        if (c.assetId && dUrl) {
          void saveAssetDataUrl(c.assetId, dUrl);
        }
      }

      if (merged.assets && Object.keys(merged.assets).length > 0) {
        setMessageAssets((prev) => ({ ...prev, ...merged.assets }));
        for (const [aId, dUrl] of Object.entries(merged.assets)) {
          void saveAssetDataUrl(aId, dUrl);
        }
      }

      setActiveConversationId((currId) => {
        const liveActiveId = getMostCurrentConversationId(merged.conversations, merged.messagesByConv);
        if (currId && activeTabInteractedConvIdsRef.current.has(currId) && !isStaleGhostThreadId(currId)) {
          const exists = merged.conversations.some((c) => c.id === currId);
          if (exists) return currId;
        }
        if (liveActiveId && !isStaleGhostThreadId(liveActiveId)) {
          return liveActiveId;
        }
        if (merged.conversations.length > 0) {
          const firstValid =
            merged.conversations.find((c) => !c.isArchived && !isStaleGhostThreadId(c.id)) ||
            merged.conversations[0];
          return firstValid.id;
        }
        return currId && !isStaleGhostThreadId(currId) ? currId : 'conv_direct_link';
      });

      const now = Date.now();
      setLastSyncedAtMs(now);
      try {
        localStorage.setItem('companion_last_synced_at', String(now));
      } catch {
        // ignore
      }

      setVitals((prev) => ({
        ...prev,
        thoughtStream: `Cross-device cloud sync connected to ${user.email}. All sessions, files, messages, and journal entries synced.`,
      }));
  };

  // Force sync action to synchronize state between two devices immediately
  const handleForceSync = async () => {
    if (!currentUser || currentUser.isAnonymous) {
      setShowSyncModal(true);
      return;
    }

    setIsCloudSyncing(true);
    setRefreshSuccessToast(null);

    try {
      const localAssets = await collectAllLocalAssets();
      // Forced: the user pressed the sync button — always run the full pull.
      const merged = await syncBidirectional(currentUser.uid, {
        profile: profileRef.current,
        conversations: conversationsRef.current,
        messagesByConv: guestMessagesMapRef.current,
        memories: memoriesRef.current,
        creations: creationsRef.current,
        journal: journalEntriesRef.current,
        assets: localAssets,
      }, { force: true });
      setLastSyncErrorMsg(getLastSyncError());

      setProfile(merged.profile);
      setConversations(merged.conversations);
      setGuestMessagesMap((prev) => {
        const next: Record<string, ChatMessage[]> = { ...prev };
        for (const [cId, msgs] of Object.entries(merged.messagesByConv)) {
          const currentMsgs = prev[cId] || [];
          const { merged: mergedList } = mergeMessagesWithLocalPrecedence(currentMsgs, msgs);
          next[cId] = mergedList;
        }
        return next;
      });
      setMemories(merged.memories);
      setCreations(merged.creations);
      setJournalEntries(merged.journal);

      for (const c of merged.creations) {
        const dUrl = (c as { dataUrl?: string }).dataUrl;
        if (c.assetId && dUrl) {
          void saveAssetDataUrl(c.assetId, dUrl);
        }
      }

      if (merged.assets && Object.keys(merged.assets).length > 0) {
        setMessageAssets((prev) => ({ ...prev, ...merged.assets }));
        for (const [aId, dUrl] of Object.entries(merged.assets)) {
          void saveAssetDataUrl(aId, dUrl);
        }
      }

      setActiveConversationId((currId) => {
        const liveActiveId = getMostCurrentConversationId(merged.conversations, merged.messagesByConv);
        if (currId && activeTabInteractedConvIdsRef.current.has(currId) && !isStaleGhostThreadId(currId)) {
          const exists = merged.conversations.some((c) => c.id === currId);
          if (exists) return currId;
        }
        if (liveActiveId && !isStaleGhostThreadId(liveActiveId)) {
          return liveActiveId;
        }
        if (merged.conversations.length > 0) {
          const firstValid =
            merged.conversations.find((c) => !c.isArchived && !isStaleGhostThreadId(c.id)) ||
            merged.conversations[0];
          return firstValid.id;
        }
        return currId && !isStaleGhostThreadId(currId) ? currId : 'conv_direct_link';
      });

      const now = Date.now();
      setLastSyncedAtMs(now);
      try {
        localStorage.setItem('companion_last_synced_at', String(now));
      } catch {
        // ignore
      }

      setVitals((prev) => ({
        ...prev,
        thoughtStream: `Both devices in sync · All messages, memories & journal entries updated (${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      }));

      setRefreshSuccessToast('Both devices in sync · All data updated');
      setTimeout(() => setRefreshSuccessToast(null), 4000);
    } catch (err: unknown) {
      console.warn('Force sync error:', err);
      const msg = err instanceof Error ? err.message : 'Force sync failed';
      logSystemError('sync', `Force sync notice: ${msg}`, 'error');
      setBannerError(`Sync notice: ${msg}`);
      throw err;
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Sign out from cloud sync and revert to local guest session
  const handleSignOutAction = async () => {
    setIsCloudSyncing(true);
    try {
      await logOutCloud();
      clearLastKnownUser();
      setCurrentUser(null);
      currentUserRef.current = null;
      setVitals((prev) => ({
        ...prev,
        thoughtStream: 'Signed out of cloud account. Local guest session active.',
      }));
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const requestedAssetIdsRef = useRef<Set<string>>(new Set());

  // Hydrate visual assets attached to chat messages (single pass per assetId)
  useEffect(() => {
    let cancelled = false;
    async function loadMsgVisuals() {
      const updates: Record<string, string> = {};
      for (const msg of messages) {
        if (msg.assetId && !messageAssets[msg.assetId] && !requestedAssetIdsRef.current.has(msg.assetId)) {
          requestedAssetIdsRef.current.add(msg.assetId);
          let url = await loadAssetDataUrl(msg.assetId);
          if (!url && currentUserRef.current?.uid) {
            try {
              const cloudAsset = await fetchCloudAsset(currentUserRef.current.uid, msg.assetId);
              if (cloudAsset) {
                url = cloudAsset;
                await saveAssetDataUrl(msg.assetId, url);
              }
            } catch {
              // ignore
            }
          }
          if (url) updates[msg.assetId] = url;
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setMessageAssets((prev) => ({ ...prev, ...updates }));
      }
    }
    void loadMsgVisuals();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  // Chat viewport scroll handling:
  // "no animated scroll on open": When initial opening or switching conversations, jump instantly without animation (behavior: 'auto').
  // Smoothly auto-scroll when user is near the bottom and new content arrives.
  // Track scroll position for floating scroll-to-bottom button.
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const isFirstOpenForConv = !hasPerformedInitialScrollRef.current[activeConversationId];
    if (isFirstOpenForConv && messages.length > 0) {
      hasPerformedInitialScrollRef.current[activeConversationId] = true;
      // Instant positioning without smooth scrolling animation on open
      container.scrollTop = container.scrollHeight;
      setIsScrolledUp(false);
      isScrolledUpRef.current = false;
      setUnreadWhileScrolledUp(0);
      lastKnownMsgCountRef.current = messages.length;
      return;
    }

    // Subsequent updates (e.g. streaming, new messages):
    if (messages.length > lastKnownMsgCountRef.current) {
      if (isScrolledUpRef.current) {
        // User is scrolled up when new message arrives: increment unread badge
        setUnreadWhileScrolledUp((prev) => prev + (messages.length - lastKnownMsgCountRef.current));
      } else {
        // User is at bottom: auto scroll smoothly
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      lastKnownMsgCountRef.current = messages.length;
    } else if (streamingReply && !isScrolledUpRef.current) {
      // During active streaming, keep scrolled to bottom if user hasn't scrolled up
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeConversationId, streamingReply]);

  // Settle-at-bottom on open, part 1: every time the open conversation
  // changes, (re)arm a short settle window and watch the scroll box. Any
  // time a child of the chat resizes (a picture finishing loading is the
  // usual culprit) or a new child lands, snap straight back to the bottom —
  // instantly, never animated — but only while the window is open and only
  // until the user scrolls up themselves.
  useEffect(() => {
    settleStateRef.current = {
      convId: activeConversationId,
      untilMs: Date.now() + 2500,
      cancelled: false,
    };
    const container = chatContainerRef.current;
    if (!container) return;

    const settleIsActive = () =>
      !settleStateRef.current.cancelled &&
      settleStateRef.current.convId === activeConversationId &&
      Date.now() < settleStateRef.current.untilMs;

    const pinIfSettling = () => {
      if (settleIsActive()) {
        container.scrollTop = container.scrollHeight;
      }
    };

    // Watch every direct child of the scroll box; new children get watched
    // too via the mutation observer.
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(pinIfSettling) : null;
    const observeChildren = () => {
      if (!resizeObserver) return;
      Array.from(container.children).forEach((child) => {
        resizeObserver.observe(child as Element);
      });
    };
    observeChildren();
    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(observeChildren) : null;
    mutationObserver?.observe(container, { childList: true });

    // The user taking over: if they scroll (or wheel / touch-drag) so the
    // view sits well above the bottom, they meant it — cancel the settle
    // and never fight them for the scrollbar. Our own pins land exactly at
    // the bottom, so they never trip this check.
    const cancelIfUserScrolledUp = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 80) {
        settleStateRef.current.cancelled = true;
      }
    };
    container.addEventListener('scroll', cancelIfUserScrolledUp, { passive: true });
    container.addEventListener('wheel', cancelIfUserScrolledUp, { passive: true });
    container.addEventListener('touchmove', cancelIfUserScrolledUp, { passive: true });

    pinIfSettling();

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      container.removeEventListener('scroll', cancelIfUserScrolledUp);
      container.removeEventListener('wheel', cancelIfUserScrolledUp);
      container.removeEventListener('touchmove', cancelIfUserScrolledUp);
    };
  }, [activeConversationId]);

  // Settle-at-bottom on open, part 2: while the window is open, a fresh
  // batch of messages (cloud sync landing in stages) or a newly hydrated
  // message picture also re-pins the chat to the bottom, instantly. This
  // runs after the main scroll effect above, so the instant pin wins over
  // its smooth scroll during the window. Once the window closes or the
  // user cancels, normal chatting scroll behaviour is untouched.
  useEffect(() => {
    const settle = settleStateRef.current;
    const container = chatContainerRef.current;
    if (!container) return;
    if (settle.cancelled || settle.convId !== activeConversationId) return;
    if (Date.now() > settle.untilMs) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, messageAssets, activeConversationId]);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = distanceFromBottom > 90;
    setIsScrolledUp(scrolledUp);
    isScrolledUpRef.current = scrolledUp;
    if (!scrolledUp) {
      setUnreadWhileScrolledUp(0);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsScrolledUp(false);
    isScrolledUpRef.current = false;
    setUnreadWhileScrolledUp(0);
  }, []);

  // Emoji reaction handlers: both Companion and User can react to each other's messages
  const handleToggleReaction = useCallback(
    async (msgId: string, emoji: string, actorOverride?: string) => {
      const actor = actorOverride || displayProfileRef.current.callsign || 'Friend';
      const convId = activeConversationIdRef.current;
      if (!convId) return;

      let updatedReactions: Record<string, string[]> = {};

      setGuestMessagesMap((prev) => {
        const currentList = prev[convId] || [];
        const nextList = currentList.map((m) => {
          if (m.id !== msgId) return m;
          const rx = { ...(m.reactions || {}) };
          const existingActors = rx[emoji] ? [...rx[emoji]] : [];
          const idx = existingActors.indexOf(actor);
          if (idx >= 0) {
            existingActors.splice(idx, 1);
            if (existingActors.length === 0) {
              delete rx[emoji];
            } else {
              rx[emoji] = existingActors;
            }
          } else {
            existingActors.push(actor);
            rx[emoji] = existingActors;
          }
          updatedReactions = rx;
          return { ...m, reactions: rx };
        });
        return { ...prev, [convId]: nextList };
      });

      // Sync to Cloud Firestore if authenticated
      const uid = currentUserRef.current?.uid;
      if (uid && currentUserRef.current?.email && !currentUserRef.current?.isAnonymous) {
        void saveCloudMessageReactions(uid, convId, msgId, updatedReactions);
      }
    },
    []
  );

  // Trigger Companion to react to a message in real-time
  const handleCompanionReact = useCallback(
    async (msgId: string, specificEmoji?: string) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      const convMsgs = guestMessagesMapRef.current[convId] || [];
      const targetMsg = convMsgs.find((m) => m.id === msgId);
      if (!targetMsg) return;

      if (specificEmoji) {
        await handleToggleReaction(msgId, specificEmoji, 'Companion');
        return;
      }

      setIsCompanionReactingMsgId(msgId);
      try {
        const res = await fetch('/api/chat/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageContent: targetMsg.content,
            sender: targetMsg.sender,
            callsign: displayProfileRef.current.callsign,
            mood: vitalsRef.current.mood,
          }),
        });
        const data = await res.json();
        if (data.ok && data.emoji) {
          await handleToggleReaction(msgId, data.emoji, 'Companion');
        }
      } catch {
        await handleToggleReaction(msgId, '⚡', 'Companion');
      } finally {
        setIsCompanionReactingMsgId(null);
      }
    },
    [handleToggleReaction]
  );

  // Persist a message to active conversation locally and in Cloud Firestore
  const appendMessageRecord = useCallback(
    async (params: {
      convId: string;
      sender: 'user' | 'companion';
      content: string;
      thoughtStream?: string;
      modality?: 'text' | 'voice' | 'image';
      assetId?: string;
      mood?: string;
      focus?: string;
    }): Promise<string> => {
      const msgId = makeSafeId('msg');
      const safeContent = clampString(params.content, 1, 8000, '...');
      const safeThought = clampString(params.thoughtStream || '', 0, 1500, '');
      const safeAsset = clampString(params.assetId || '', 0, 128, '');
      const modality = params.modality || 'text';
      const now = Date.now();
      const uid = currentUserRef.current?.uid;
      activeTabInteractedConvIdsRef.current.add(params.convId);

      const newMsg: ChatMessage = {
        id: msgId,
        ownerId: uid || 'guest_local',
        conversationId: params.convId,
        sender: params.sender,
        content: safeContent,
        thoughtStream: safeThought,
        modality,
        assetId: safeAsset,
        createdAtMs: now,
      };

      setGuestMessagesMap((prev) => ({
        ...prev,
        [params.convId]: [...(prev[params.convId] || []), newMsg],
      }));

      setConversations((prev) =>
        prev.map((c) =>
          c.id === params.convId
            ? {
                ...c,
                lastMessagePreview: safeContent.slice(0, 240),
                mood: params.mood || c.mood,
                focus: params.focus || c.focus,
                updatedAtMs: now,
              }
            : c
        )
      );

      // Cloud Firestore real-time persistence
      if (uid) {
        void saveCloudMessage(uid, newMsg);
        const currentConv = conversationsRef.current.find((c) => c.id === params.convId);
        const convToSave: ConversationItem = currentConv
          ? {
              ...currentConv,
              lastMessagePreview: safeContent.slice(0, 240),
              mood: params.mood || currentConv.mood,
              focus: params.focus || currentConv.focus,
              updatedAtMs: now,
            }
          : {
              id: params.convId,
              ownerId: uid,
              title: 'Direct Channel',
              isArchived: false,
              summary: '',
              lastMessagePreview: safeContent.slice(0, 240),
              mood: params.mood || 'FOCUSED',
              focus: params.focus || 'HIGH',
              createdAtMs: now,
              updatedAtMs: now,
            };
        void saveCloudConversation(uid, convToSave);
      }

      return msgId;
    },
    []
  );

  // Persist MemoryNode locally and to Cloud Firestore (only if deemed important)
  const addMemoryNode = useCallback(
    async (
      category: MemoryCategory,
      fact: string,
      importance: number,
      sourceConvId?: string
    ) => {
      const safeImp = Math.max(1, Math.min(5, Math.round(importance)));
      // Guard: Only save memories deemed important (importance >= 3)
      if (safeImp < 3) {
        return;
      }
      const memId = makeSafeId('mem');
      const safeOrigin = assertValidId(sourceConvId || activeConversationId || 'boot');
      const safeFact = clampString(fact, 1, 600);
      const now = Date.now();
      const uid = currentUserRef.current?.uid;

      const newMem: MemoryNode = {
        id: memId,
        ownerId: uid || 'guest_local',
        category: sanitizeMemoryCategory(category),
        fact: safeFact,
        importance: safeImp,
        sourceConversationId: safeOrigin,
        createdAtMs: now,
        updatedAtMs: now,
      };

      deletedMemoryIdsRef.current.delete(memId);
      setMemories((prev) => [newMem, ...prev.filter((m) => m.id !== memId)]);

      if (uid) {
        void saveCloudMemory(uid, newMem);
      }
    },
    [activeConversationId]
  );

  const archivedConversations = conversations.filter((c) => c.isArchived);
  const recentSummaries = archivedConversations.map((c) => c.summary).filter(Boolean);

  const handleLiveTurnCommitted = useCallback(
    (userText: string, companionText: string) => {
      if (!activeConversationId) return;
      if (userText) {
        void appendMessageRecord({
          convId: activeConversationId,
          sender: 'user',
          content: userText,
          modality: 'voice',
        });
      }
      if (companionText) {
        uncontemplatedTurnsRef.current++;
        void appendMessageRecord({
          convId: activeConversationId,
          sender: 'companion',
          content: companionText,
          thoughtStream: '',
          modality: 'voice',
        });
      }
    },
    [activeConversationId, appendMessageRecord]
  );

  const handleVoiceMemorySaved = useCallback(
    (item: { category: string; fact: string; importance: number }) => {
      void addMemoryNode(
        sanitizeMemoryCategory(item.category),
        item.fact,
        item.importance,
        activeConversationId
      );
      setVitals((prev) => ({
        ...prev,
        thoughtStream: `Locked into memory: "${item.fact}"`,
      }));
    },
    [activeConversationId, addMemoryNode]
  );

  const {
    callState,
    isMicMuted,
    setIsMicMuted,
    callSeconds,
    companionVocalLevel,
    userMicLevel,
    liveUserDraft,
    liveCompanionDraft,
    voiceError,
    setVoiceError,
    speakingMessageId,
    startVoiceCall,
    speakMessage,
  } = useVoiceEngine({
    callsign: displayProfile.callsign,
    dynamicNotes: displayProfile.dynamicNotes,
    companionName: displayProfile.companionName,
    companionPersonality: displayProfile.companionPersonality,
    preferredVoice: profile.preferredVoice,
    memories,
    recentSummaries,
    onLiveTurnCommitted: handleLiveTurnCommitted,
    onVoiceMemorySaved: handleVoiceMemorySaved,
    onVoiceImageGenerated: async (img) => {
      await saveAssetDataUrl(img.assetId, img.dataUrl);
      setMessageAssets((prev) => ({ ...prev, [img.assetId]: img.dataUrl }));
      const uid = currentUserRef.current?.uid;
      const newCreation: VisualCreation = {
        id: img.id,
        ownerId: uid || 'guest_local',
        prompt: img.prompt,
        stylePreset: img.stylePreset || 'Prompt Only',
        aspectRatio: (img.aspectRatio as AspectRatioOption) || '1:1',
        assetId: img.assetId,
        createdAtMs: img.createdAtMs || Date.now(),
      };
      setCreations((prev) => [newCreation, ...prev.filter((c) => c.id !== img.id)]);
      if (uid) {
        void saveCloudCreation(uid, { ...newCreation, dataUrl: img.dataUrl });
        void saveCloudAsset(uid, img.assetId, img.dataUrl);
      }
      if (activeConversationId) {
        await appendMessageRecord({
          convId: activeConversationId,
          sender: 'companion',
          content: `Rendered this for you: "${img.prompt}". Saved directly to your gallery.`,
          modality: 'image',
          assetId: img.assetId,
        });
        sendMinimizedNotification(`Companion · ${displayProfile.callsign}`, `Rendered visual: "${img.prompt}"`);
      }
    },
    onThoughtUpdate: (thought) =>
      setVitals((prev) => ({ ...prev, thoughtStream: thought })),
    onStatusChange: (status) => setVitals((prev) => ({ ...prev, status })),
  });

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (voiceError) {
      logSystemError('voice', voiceError, 'warning');
    }
  }, [voiceError, logSystemError]);

  // Ensure active conversation is unarchived before sending
  const ensureWritableConversation = useCallback(async (): Promise<string> => {
    const current = conversations.find((c) => c.id === activeConversationId);
    if (current && !current.isArchived && !isStaleGhostThreadId(current.id)) {
      activeTabInteractedConvIdsRef.current.add(current.id);
      return current.id;
    }

    const newId = makeSafeId('conv');
    const now = Date.now();
    const uid = currentUserRef.current?.uid;
    const newConv: ConversationItem = {
      id: newId,
      ownerId: uid || 'guest_local',
      title: 'Direct Channel',
      isArchived: false,
      summary: '',
      lastMessagePreview: '',
      mood: 'FOCUSED',
      focus: 'HIGH',
      createdAtMs: now,
      updatedAtMs: now,
    };
    setConversations((prev) => [newConv, ...prev]);
    conversationsRef.current = [newConv, ...conversationsRef.current];
    setGuestMessagesMap((prev) => ({ ...prev, [newId]: [] }));
    guestMessagesMapRef.current = { ...guestMessagesMapRef.current, [newId]: [] };
    activeTabInteractedConvIdsRef.current.add(newId);
    setActiveConversationId(newId);
    if (uid) {
      void saveCloudConversation(uid, newConv);
    }
    return newId;
  }, [activeConversationId, conversations]);

  // Handle Local File / Image Selection
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    setBannerError(null);
    const additions: ChatAttachment[] = [];

    for (const file of selectedFiles.slice(0, 6)) {
      if (file.size > 12 * 1024 * 1024) {
        setBannerError(`"${file.name}" exceeds the 12 MB attachment limit.`);
        continue;
      }

      const id = makeSafeId('att');
      const mimeType = file.type || 'text/plain';

      try {
        if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(file);
          });
          const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          additions.push({
            id,
            name: file.name,
            mimeType,
            sizeBytes: file.size,
            source: 'upload',
            previewDataUrl: mimeType.startsWith('image/') ? dataUrl : undefined,
            base64Data,
          });
        } else {
          const textContent = await file.text();
          additions.push({
            id,
            name: file.name,
            mimeType,
            sizeBytes: file.size,
            source: 'upload',
            textContent: textContent.slice(0, 60000),
          });
        }
      } catch {
        setBannerError(`Could not read "${file.name}".`);
      }
    }

    if (additions.length > 0) {
      setPendingAttachments((prev) => [...prev, ...additions].slice(0, 6));
    }
  };

  // Refresh Channel / Reconnect API & Retry Handler
  const handleRefreshChannel = async (retryLastUserMessage = false) => {
    setIsRefreshingChannel(true);
    setBannerError(null);
    setVoiceError(null);
    setIsStreaming(false);
    setStreamingReply('');

    try {
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        setVitals((prev) => ({
          ...prev,
          status: 'CONNECTED',
          thoughtStream: 'Connection refreshed. Channel calibrated and ready.',
        }));
        setRefreshSuccessToast('Channel refreshed & reconnected');
        setTimeout(() => setRefreshSuccessToast(null), 3000);
      } else {
        throw new Error('API server returned error status.');
      }

      if (retryLastUserMessage && lastUserPromptRef.current) {
        const textToRetry = lastUserPromptRef.current;
        setTimeout(() => {
          void sendChatMessage(textToRetry);
        }, 300);
      }
    } catch {
      setBannerError('Server connection check failed. Please check network connectivity.');
    } finally {
      setTimeout(() => setIsRefreshingChannel(false), 500);
    }
  };

  // Send Text Message & Multimodal Attachments + Explicit Memory Saving + Grounding Plugins
  const sendChatMessage = useCallback(
    async (
      overrideText?: string,
      modality: 'text' | 'voice' | 'image' = 'text',
      assetId = ''
    ) => {
      const attachmentsSnapshot = overrideText ? [] : pendingAttachments;
      const rawText = (overrideText ?? inputText).trim();
      if ((!rawText && attachmentsSnapshot.length === 0) || isStreaming) return;

      const textToSend =
        rawText ||
        `Attached ${attachmentsSnapshot.map((a) => a.name).join(', ')}`;

      lastUserPromptRef.current = textToSend;
      setBannerError(null);
      if (!overrideText) {
        setInputText('');
        setPendingAttachments([]);
      }
      setActiveView('dashboard');

      const convId = await ensureWritableConversation();
      const historySnapshot = messages.slice(-20).map((m) => ({
        sender: m.sender,
        content: m.content,
      }));

      let effectiveAssetId = assetId;
      let effectiveModality = modality;

      if (!effectiveAssetId && attachmentsSnapshot.length > 0) {
        const uid = currentUserRef.current?.uid;
        const firstImage = attachmentsSnapshot.find((a) => a.previewDataUrl);
        if (firstImage?.previewDataUrl) {
          effectiveAssetId = makeSafeId('asset');
          effectiveModality = 'image';
          await saveAssetDataUrl(effectiveAssetId, firstImage.previewDataUrl);
          setMessageAssets((prev) => ({
            ...prev,
            [effectiveAssetId]: firstImage.previewDataUrl!,
          }));
          if (uid) {
            void saveCloudAsset(uid, effectiveAssetId, firstImage.previewDataUrl, {
              name: firstImage.name,
              mimeType: firstImage.mimeType,
            });
          }
        } else {
          const firstDoc = attachmentsSnapshot[0];
          effectiveAssetId = makeSafeId('docmeta');
          const metaPayload = `meta:${JSON.stringify({
            name: firstDoc.name,
            mimeType: firstDoc.mimeType,
            source: firstDoc.source,
            count: attachmentsSnapshot.length,
            textContent: firstDoc.textContent?.slice(0, 5000),
          } satisfies StoredFileMeta)}`;
          await saveAssetDataUrl(effectiveAssetId, metaPayload);
          setMessageAssets((prev) => ({
            ...prev,
            [effectiveAssetId]: metaPayload,
          }));
          if (uid) {
            void saveCloudAsset(uid, effectiveAssetId, metaPayload, {
              name: firstDoc.name,
              mimeType: firstDoc.mimeType,
            });
          }
        }
      }

      const userMsgId = await appendMessageRecord({
        convId,
        sender: 'user',
        content: textToSend,
        modality: effectiveModality,
        assetId: effectiveAssetId,
      });

      setIsStreaming(true);
      setStreamingReply('');
      setVitals((prev) => ({
        ...prev,
        status: 'ACTIVE',
      }));

      let accThought = vitals.thoughtStream;
      let accReply = '';
      let committedCompanionMsgId: string | null = null;

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: rawText,
            history: historySnapshot,
            callsign: displayProfile.callsign,
            dynamicNotes: displayProfile.dynamicNotes,
            companionName: displayProfile.companionName,
            companionPersonality: displayProfile.companionPersonality,
            memories: memories.map((m) => ({
              category: m.category,
              fact: m.fact,
              importance: m.importance,
            })),
            recentSummaries,
            model: selectedModel,
            autoFailover,
            attachments: attachmentsSnapshot.map((att) => ({
              name: att.name,
              mimeType: att.mimeType,
              source: att.source,
              base64Data: att.base64Data,
              textContent: att.textContent,
            })),
            plugins,
            userPresence: userPresenceRef.current.status,
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientTime: new Date().toISOString(),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Failed to reach Gemini stream endpoint.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let turnMood = vitals.mood;
        let turnFocus = vitals.focus;
        const turnSavedFacts: string[] = [];
        let turnRenderedImage: VisualCreation | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';

          for (const rawEvt of events) {
            const dataLine = rawEvt.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'model_used' && payload.model) {
              setActiveModelUsed(sanitizeModelId(payload.model));
            } else if (payload.type === 'timing') {
              setApiDelayMetrics((prev) => ({
                ...prev,
                ttftMs: payload.ttftMs || payload.elapsedMs || prev.ttftMs,
              }));
            } else if (payload.type === 'thought_stream' && payload.text) {
              accThought = payload.text;
              setVitals((prev) => ({
                ...prev,
                thoughtStream: payload.text,
              }));
            } else if (payload.type === 'vitals') {
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              setVitals((prev) => ({
                ...prev,
                mood: turnMood,
                focus: turnFocus,
              }));
            } else if (payload.type === 'reply_delta') {
              accReply += payload.delta;
              setStreamingReply(accReply);
            } else if (payload.type === 'image_generated' && payload.image) {
              const img = payload.image;
              turnRenderedImage = {
                id: img.id,
                ownerId: 'guest_local',
                prompt: img.prompt,
                stylePreset: img.stylePreset || 'Prompt Only',
                aspectRatio: (img.aspectRatio as AspectRatioOption) || '1:1',
                assetId: img.assetId,
                createdAtMs: img.createdAtMs || Date.now(),
              };
              await saveAssetDataUrl(img.assetId, img.dataUrl);
              setMessageAssets((prev) => ({ ...prev, [img.assetId]: img.dataUrl }));
              setCreations((prev) => [turnRenderedImage!, ...prev.filter((c) => c.id !== img.id)]);
              const uid = currentUserRef.current?.uid;
              if (uid) {
                void saveCloudAsset(uid, img.assetId, img.dataUrl, {
                  name: `Companion Render - ${img.prompt.slice(0, 30)}`,
                  mimeType: 'image/png',
                });
              }
            } else if (payload.type === 'memories' && Array.isArray(payload.items)) {
              const newlySavedInBatch: string[] = [];
              for (const item of payload.items) {
                const factStr = String(item.fact || '').trim();
                const importance = Number(item.importance) || 5;
                // Only save memories deemed important (importance >= 4 or explicit)
                if (!payload.explicit && importance < 4) continue;
                if (!factStr || turnSavedFacts.includes(factStr)) continue;
                turnSavedFacts.push(factStr);
                newlySavedInBatch.push(factStr);
                void addMemoryNode(
                  sanitizeMemoryCategory(item.category),
                  factStr,
                  importance,
                  convId
                );
              }
              if (payload.explicit && newlySavedInBatch.length > 0 && committedCompanionMsgId) {
                const targetId = committedCompanionMsgId;
                setSavedMemoriesByMsgId((prev) => ({
                  ...prev,
                  [targetId]: [...(prev[targetId] || []), ...newlySavedInBatch],
                }));
              }
            } else if (payload.type === 'done') {
              const finalReply = (payload.reply || accReply).trim();
              const finalThought = (payload.thoughtStream || accThought || '').trim();
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              if (payload.modelUsed) {
                setActiveModelUsed(sanitizeModelId(payload.modelUsed));
              }

              if (payload.ttftMs || payload.totalDurationMs) {
                setApiDelayMetrics({
                  ttftMs: payload.ttftMs || null,
                  totalMs: payload.totalDurationMs || null,
                });
                if (payload.totalDurationMs && payload.totalDurationMs > 4500) {
                  logSystemError(
                    'api',
                    `API response delay noticed: ${payload.totalDurationMs}ms (TTFT: ${payload.ttftMs || 'n/a'}ms)`,
                    'warning'
                  );
                }
              }

              if (payload.generatedImage && !turnRenderedImage) {
                const img = payload.generatedImage;
                turnRenderedImage = {
                  id: img.id,
                  ownerId: 'guest_local',
                  prompt: img.prompt,
                  stylePreset: img.stylePreset || 'Prompt Only',
                  aspectRatio: (img.aspectRatio as AspectRatioOption) || '1:1',
                  assetId: img.assetId,
                  createdAtMs: img.createdAtMs || Date.now(),
                };
                await saveAssetDataUrl(img.assetId, img.dataUrl);
                setMessageAssets((prev) => ({ ...prev, [img.assetId]: img.dataUrl }));
                setCreations((prev) => [turnRenderedImage!, ...prev.filter((c) => c.id !== img.id)]);
                const uid = currentUserRef.current?.uid;
                if (uid) {
                  void saveCloudAsset(uid, img.assetId, img.dataUrl, {
                    name: `Companion Render - ${img.prompt.slice(0, 30)}`,
                    mimeType: 'image/png',
                  });
                }
              }

              setStreamingReply('');
              setIsStreaming(false);
              setVitals((prev) => ({
                mood: turnMood,
                focus: turnFocus,
                status: 'CONNECTED',
                thoughtStream: finalThought || prev.thoughtStream,
              }));

              if (finalReply || turnRenderedImage) {
                const companionMsgId = await appendMessageRecord({
                  convId,
                  sender: 'companion',
                  content: finalReply || 'Here is the image I rendered for you.',
                  thoughtStream: finalThought,
                  modality: turnRenderedImage ? 'image' : 'text',
                  assetId: turnRenderedImage ? turnRenderedImage.assetId : '',
                  mood: turnMood,
                  focus: turnFocus,
                });
                committedCompanionMsgId = companionMsgId;
                uncontemplatedTurnsRef.current++;

                if (turnSavedFacts.length > 0) {
                  setSavedMemoriesByMsgId((prev) => ({
                    ...prev,
                    [companionMsgId]: [...turnSavedFacts],
                  }));
                }

                if (Array.isArray(payload.groundingSources) && payload.groundingSources.length > 0) {
                  setGroundingByMsgId((prev) => ({
                    ...prev,
                    [companionMsgId]: payload.groundingSources as GroundingSource[],
                  }));
                }

                if (profile.autoSpeakReplies) {
                  void speakMessage(companionMsgId, finalReply);
                }
                sendMinimizedNotification(
                  `Companion · ${displayProfile.callsign}`,
                  finalReply || 'Rendered visual created in image studio.'
                );

                if (userMsgId) {
                  setTimeout(() => {
                    void handleCompanionReact(userMsgId);
                  }, 600);
                }
              }
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'Model request failed.');
            }
          }
        }
      } catch (err) {
        // If reply text was already accumulated before the disruption, preserve it in the chat!
        if (accReply.trim().length > 0 && !committedCompanionMsgId) {
          try {
            const fallbackCompanionId = await appendMessageRecord({
              convId,
              sender: 'companion',
              content: accReply.trim(),
              thoughtStream: accThought,
              modality: 'text',
            });
            uncontemplatedTurnsRef.current++;
            if (profile.autoSpeakReplies) {
              void speakMessage(fallbackCompanionId, accReply.trim());
            }
            sendMinimizedNotification(`Companion · ${displayProfile.callsign}`, accReply.trim());
          } catch {
            // ignore
          }
        }
        setBannerError(
          err instanceof Error
            ? err.message
            : 'Connection interrupted. Try switching Gemini models in the HUD.'
        );
        setVitals((prev) => ({ ...prev, status: 'CONNECTED' }));
        setStreamingReply('');
      } finally {
        setIsStreaming(false);
      }
    },
    [
      addMemoryNode,
      appendMessageRecord,
      autoFailover,
      ensureWritableConversation,
      inputText,
      isStreaming,
      memories,
      messages,
      pendingAttachments,
      plugins,
      profile.autoSpeakReplies,
      displayProfile.callsign,
      displayProfile.dynamicNotes,
      recentSummaries,
      selectedModel,
      sendMinimizedNotification,
      speakMessage,
      vitals.focus,
      vitals.mood,
      vitals.thoughtStream,
    ]
  );

  // ---------------------------------------------------------------------------
  // Creator Room — separate workspace thread (content creation only).
  //
  // Isolation rules (do not relax): this code must NEVER call
  // appendMessageRecord / ensureWritableConversation, never read or write
  // `conversations` / `guestMessagesMap`, and never switch the active view.
  // The Room has its own append helper, its own streaming state, its own
  // storage key, and its own cloud collection.
  //
  // READ-ONLY MEMORY GATE (the owner's decision): Companion SEES the memories in the
  // Room (they're sent with every turn, same as chat), but Room turns never
  // write new memories — with one deliberate exception. A `memories` stream
  // event is honoured only when BOTH conditions hold:
  //   1. the stream flags the batch `explicit` (the protocol's existing flag
  //      for deliberate saves: Companion's save_to_memory tool calls, and the
  //      server's extraction pass when it detects a remember-request), AND
  //   2. The owner's own message in this turn actually asked to remember
  //      something (same phrasing patterns the server's
  //      hasExplicitMemoryIntent checks: "remember this", "don't forget",
  //      "save … to memory", "lock this in", …).
  // Condition 2 matters because the server flags ALL of Companion's tool saves as
  // explicit — including ones the companion initiates on its own. Without it, stage talk
  // he happened to find interesting would still leak into the Memory Vault.
  // Everything else in a `memories` event is dropped on the floor here:
  // what happens on stage stays on stage.
  // ---------------------------------------------------------------------------
  const appendCreativeMessageRecord = useCallback(
    async (params: {
      sender: 'user' | 'companion';
      content: string;
      thoughtStream?: string;
    }): Promise<string> => {
      const msgId = makeSafeId('msg');
      const safeContent = clampString(params.content, 1, 8000, '...');
      const safeThought = clampString(params.thoughtStream || '', 0, 1500, '');
      const now = Date.now();
      const uid = currentUserRef.current?.uid;

      const newMsg: ChatMessage = {
        id: msgId,
        ownerId: uid || 'guest_local',
        conversationId: CREATIVE_ROOM_ID,
        sender: params.sender,
        content: safeContent,
        thoughtStream: safeThought,
        modality: 'text',
        assetId: '',
        createdAtMs: now,
        reactions: {},
      };

      setCreativeMessages((prev) => [...prev, newMsg]);

      if (uid) {
        void saveCloudCreativeMessage(uid, newMsg);
      }

      return msgId;
    },
    []
  );

  const sendCreativeMessage = useCallback(
    async (rawInput: string) => {
      const textToSend = rawInput.trim();
      if (!textToSend || isCreativeStreamingRef.current) return;

      setBannerError(null);

      // History = the Room's own last 20 turns. Never the main chat's.
      const historySnapshot = creativeMessagesRef.current.slice(-20).map((m) => ({
        sender: m.sender,
        content: m.content,
      }));

      // Gate condition 2 (see block comment above): did the owner explicitly ask
      // Companion to remember something in THIS message?
      const userAskedToRemember =
        /\b(save\b[\s\S]{0,40}\bmemory|add\b[\s\S]{0,40}\bmemory|store\b[\s\S]{0,40}\bmemory|commit\b[\s\S]{0,40}\bmemory|remember\s+(this|that|it|my|our|i\b|what|when|how)|don'?t\s+forget|lock\s+(this|that|it)\s+in)/i.test(
          textToSend
        );

      await appendCreativeMessageRecord({ sender: 'user', content: textToSend });

      setIsCreativeStreaming(true);
      setCreativeStreamingReply('');
      setVitals((prev) => ({ ...prev, status: 'ACTIVE' }));

      let accThought = vitalsRef.current.thoughtStream;
      let accReply = '';
      let committedCompanionMsgId: string | null = null;
      const turnSavedFacts: string[] = [];

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history: historySnapshot,
            // Read-only memory: he receives the same memories/profile context
            // as in main chat (that's what keeps the companion in character here)…
            callsign: displayProfileRef.current.callsign,
            dynamicNotes: displayProfileRef.current.dynamicNotes,
            companionName: displayProfileRef.current.companionName,
            companionPersonality: displayProfileRef.current.companionPersonality,
            memories: memoriesRef.current.map((m) => ({
              category: m.category,
              fact: m.fact,
              importance: m.importance,
            })),
            recentSummaries,
            model: selectedModelRef.current,
            autoFailover: autoFailoverRef.current,
            attachments: [],
            plugins,
            userPresence: userPresenceRef.current.status,
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientTime: new Date().toISOString(),
            // …and this marker makes the server apply the on-stage prompt.
            room: 'creative',
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Failed to reach Gemini stream endpoint.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let turnMood = vitalsRef.current.mood;
        let turnFocus = vitalsRef.current.focus;
        // v1 is text-only in the Room: if Companion renders an image anyway, the
        // render is still saved to the Gallery (never lost), it just isn't
        // attached to a Room message.
        let turnRenderedImage: VisualCreation | null = null;

        const stashRenderedImage = async (img: {
          id: string;
          assetId: string;
          dataUrl: string;
          prompt: string;
          stylePreset?: string;
          aspectRatio?: string;
          createdAtMs?: number;
        }) => {
          turnRenderedImage = {
            id: img.id,
            ownerId: 'guest_local',
            prompt: img.prompt,
            stylePreset: img.stylePreset || 'Prompt Only',
            aspectRatio: (img.aspectRatio as AspectRatioOption) || '1:1',
            assetId: img.assetId,
            createdAtMs: img.createdAtMs || Date.now(),
          };
          await saveAssetDataUrl(img.assetId, img.dataUrl);
          setMessageAssets((prev) => ({ ...prev, [img.assetId]: img.dataUrl }));
          setCreations((prev) => [
            turnRenderedImage!,
            ...prev.filter((c) => c.id !== img.id),
          ]);
          const uid = currentUserRef.current?.uid;
          if (uid) {
            void saveCloudAsset(uid, img.assetId, img.dataUrl, {
              name: `Companion Render - ${img.prompt.slice(0, 30)}`,
              mimeType: 'image/png',
            });
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';

          for (const rawEvt of events) {
            const dataLine = rawEvt.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'model_used' && payload.model) {
              setActiveModelUsed(sanitizeModelId(payload.model));
            } else if (payload.type === 'timing') {
              setApiDelayMetrics((prev) => ({
                ...prev,
                ttftMs: payload.ttftMs || payload.elapsedMs || prev.ttftMs,
              }));
            } else if (payload.type === 'thought_stream' && payload.text) {
              accThought = payload.text;
              setVitals((prev) => ({ ...prev, thoughtStream: payload.text }));
            } else if (payload.type === 'vitals') {
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              setVitals((prev) => ({ ...prev, mood: turnMood, focus: turnFocus }));
            } else if (payload.type === 'reply_delta') {
              accReply += payload.delta;
              setCreativeStreamingReply(accReply);
            } else if (payload.type === 'image_generated' && payload.image) {
              await stashRenderedImage(payload.image);
            } else if (payload.type === 'memories' && Array.isArray(payload.items)) {
              // READ-ONLY MEMORY GATE — see the block comment above. Both the
              // protocol's `explicit` flag AND The owner's own ask are required;
              // otherwise the batch is intentionally dropped.
              if (payload.explicit === true && userAskedToRemember) {
                for (const item of payload.items) {
                  const factStr = String(item.fact || '').trim();
                  const importance = Number(item.importance) || 5;
                  if (!factStr || turnSavedFacts.includes(factStr)) continue;
                  turnSavedFacts.push(factStr);
                  void addMemoryNode(
                    sanitizeMemoryCategory(item.category),
                    factStr,
                    importance,
                    CREATIVE_ROOM_ID
                  );
                }
              }
            } else if (payload.type === 'done') {
              const finalReply = (payload.reply || accReply).trim();
              const finalThought = (payload.thoughtStream || accThought || '').trim();
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              if (payload.modelUsed) {
                setActiveModelUsed(sanitizeModelId(payload.modelUsed));
              }
              if (payload.ttftMs || payload.totalDurationMs) {
                setApiDelayMetrics({
                  ttftMs: payload.ttftMs || null,
                  totalMs: payload.totalDurationMs || null,
                });
              }
              if (payload.generatedImage && !turnRenderedImage) {
                await stashRenderedImage(payload.generatedImage);
              }

              setCreativeStreamingReply('');
              setIsCreativeStreaming(false);
              setVitals((prev) => ({
                mood: turnMood,
                focus: turnFocus,
                status: 'CONNECTED',
                thoughtStream: finalThought || prev.thoughtStream,
              }));

              if (finalReply || turnRenderedImage) {
                const companionMsgId = await appendCreativeMessageRecord({
                  sender: 'companion',
                  content:
                    finalReply ||
                    'Rendered that one straight to your gallery — this room is text-only.',
                  thoughtStream: finalThought,
                });
                committedCompanionMsgId = companionMsgId;

                if (turnSavedFacts.length > 0) {
                  setSavedMemoriesByMsgId((prev) => ({
                    ...prev,
                    [companionMsgId]: [...turnSavedFacts],
                  }));
                }
              }
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'Model request failed.');
            }
          }
        }
      } catch (err) {
        // Preserve any partial reply in the Room rather than losing the take.
        if (accReply.trim().length > 0 && !committedCompanionMsgId) {
          try {
            await appendCreativeMessageRecord({
              sender: 'companion',
              content: accReply.trim(),
              thoughtStream: accThought,
            });
          } catch {
            // ignore
          }
        }
        setBannerError(
          err instanceof Error
            ? err.message
            : 'Connection interrupted. Try switching Gemini models in the HUD.'
        );
        setVitals((prev) => ({ ...prev, status: 'CONNECTED' }));
        setCreativeStreamingReply('');
      } finally {
        setIsCreativeStreaming(false);
      }
    },
    [addMemoryNode, appendCreativeMessageRecord, plugins, recentSummaries]
  );

  // ---------------------------------------------------------------------------
  // Games Room send pipeline — mirrors the Creative Room's, minus the memory
  // gate and image handling: games are text-only play, memory stays read-only
  // (the server applies the games-room prompt via room: 'games'), and nothing
  // here touches the main chat or the Creative Room thread.
  // ---------------------------------------------------------------------------
  const appendGamesMessageRecord = useCallback(
    async (params: {
      sender: 'user' | 'companion';
      content: string;
      thoughtStream?: string;
    }): Promise<string> => {
      const msgId = makeSafeId('msg');
      const newMsg: ChatMessage = {
        id: msgId,
        ownerId: currentUserRef.current?.uid || 'guest_local',
        conversationId: GAMES_ROOM_ID,
        sender: params.sender,
        content: clampString(params.content, 1, 8000, '...'),
        thoughtStream: clampString(params.thoughtStream || '', 0, 1500, ''),
        modality: 'text',
        assetId: '',
        createdAtMs: Date.now(),
        reactions: {},
      };
      setGamesMessages((prev) => [...prev, newMsg]);
      return msgId;
    },
    []
  );

  const sendGamesMessage = useCallback(
    async (rawInput: string) => {
      const textToSend = rawInput.trim();
      if (!textToSend || isGamesStreamingRef.current) return;

      setBannerError(null);

      // History = the Games Room's own last 20 turns. Never the main chat's.
      const historySnapshot = gamesMessagesRef.current.slice(-20).map((m) => ({
        sender: m.sender,
        content: m.content,
      }));

      await appendGamesMessageRecord({ sender: 'user', content: textToSend });

      setIsGamesStreaming(true);
      setGamesStreamingReply('');
      setVitals((prev) => ({ ...prev, status: 'ACTIVE' }));

      let accThought = vitalsRef.current.thoughtStream;
      let accReply = '';
      let committedCompanionMsgId: string | null = null;

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history: historySnapshot,
            callsign: displayProfileRef.current.callsign,
            dynamicNotes: displayProfileRef.current.dynamicNotes,
            companionName: displayProfileRef.current.companionName,
            companionPersonality: displayProfileRef.current.companionPersonality,
            memories: memoriesRef.current.map((m) => ({
              category: m.category,
              fact: m.fact,
              importance: m.importance,
            })),
            recentSummaries,
            model: selectedModelRef.current,
            autoFailover: autoFailoverRef.current,
            attachments: [],
            plugins,
            userPresence: userPresenceRef.current.status,
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientTime: new Date().toISOString(),
            // …and this marker makes the server apply the games-room prompt.
            room: 'games',
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Failed to reach Gemini stream endpoint.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let turnMood = vitalsRef.current.mood;
        let turnFocus = vitalsRef.current.focus;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';

          for (const rawEvt of events) {
            const dataLine = rawEvt.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            const payload = JSON.parse(dataLine.slice(6));

            if (payload.type === 'model_used' && payload.model) {
              setActiveModelUsed(sanitizeModelId(payload.model));
            } else if (payload.type === 'timing') {
              setApiDelayMetrics((prev) => ({
                ...prev,
                ttftMs: payload.ttftMs || payload.elapsedMs || prev.ttftMs,
              }));
            } else if (payload.type === 'thought_stream' && payload.text) {
              accThought = payload.text;
              setVitals((prev) => ({ ...prev, thoughtStream: payload.text }));
            } else if (payload.type === 'vitals') {
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              setVitals((prev) => ({ ...prev, mood: turnMood, focus: turnFocus }));
            } else if (payload.type === 'reply_delta') {
              accReply += payload.delta;
              setGamesStreamingReply(accReply);
            } else if (payload.type === 'done') {
              const finalReply = (payload.reply || accReply).trim();
              const finalThought = (payload.thoughtStream || accThought || '').trim();
              turnMood = payload.mood || turnMood;
              turnFocus = payload.focus || turnFocus;
              if (payload.modelUsed) {
                setActiveModelUsed(sanitizeModelId(payload.modelUsed));
              }
              if (payload.ttftMs || payload.totalDurationMs) {
                setApiDelayMetrics({
                  ttftMs: payload.ttftMs || null,
                  totalMs: payload.totalDurationMs || null,
                });
              }

              setGamesStreamingReply('');
              setIsGamesStreaming(false);
              setVitals((prev) => ({
                mood: turnMood,
                focus: turnFocus,
                status: 'CONNECTED',
                thoughtStream: finalThought || prev.thoughtStream,
              }));

              if (finalReply) {
                committedCompanionMsgId = await appendGamesMessageRecord({
                  sender: 'companion',
                  content: finalReply,
                  thoughtStream: finalThought,
                });
              }
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'Model request failed.');
            }
            // 'memories' and 'image_generated' events are intentionally
            // ignored here: games are text-only and memory is read-only.
          }
        }
      } catch (err) {
        if (accReply.trim().length > 0 && !committedCompanionMsgId) {
          try {
            await appendGamesMessageRecord({
              sender: 'companion',
              content: accReply.trim(),
              thoughtStream: accThought,
            });
          } catch {
            // ignore
          }
        }
        setBannerError(
          err instanceof Error
            ? err.message
            : 'Connection interrupted. Try switching Gemini models in the HUD.'
        );
        setVitals((prev) => ({ ...prev, status: 'CONNECTED' }));
        setGamesStreamingReply('');
      } finally {
        setIsGamesStreaming(false);
      }
    },
    [appendGamesMessageRecord, plugins, recentSummaries]
  );

  // Parse Android Home Screen Widget & PWA Shortcut URL Actions (?action=voice / ?action=journal / etc.)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const action = (params.get('action') || params.get('view') || '').toLowerCase();
      if (action) {
        setSidebarOpen(false);
        setShowProfileModal(false);
        setShowPluginsModal(false);
        setShowInstallModal(false);
        if (action === 'voice') {
          setActiveView('dashboard');
          const timer = setTimeout(() => {
            if (callState === 'idle') {
              void startVoiceCall();
            }
          }, 800);
          return () => clearTimeout(timer);
        } else if (action === 'journal' || action === 'scrapbook') {
          setActiveView('journal');
        } else if (action === 'memory' || action === 'vault') {
          setActiveView('memory');
        } else if (action === 'studio' || action === 'image') {
          setActiveView('image_studio');
        } else if (action === 'gallery') {
          setActiveView('gallery');
        } else if (action === 'creative' || action === 'stage') {
          setActiveView('creative_room');
        } else if (action === 'games') {
          setActiveView('games_room');
        } else if (action === 'chat') {
          setActiveView('dashboard');
        } else if (action === 'widget') {
          // The old in-app widget page was removed; widget taps land on chat.
          setActiveView('dashboard');
        }
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (err) {
      console.warn('URL action parse notice:', err);
    }
  }, [callState, startVoiceCall]);

  // Helper to determine if a timestamp belongs to today in local calendar time
  const isDateToday = (ms: number): boolean => {
    const d = new Date(ms);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  // Generate Companion's Journal Entry / Thought Stream Record (per once a day)
  const handleGenerateJournalEntry = useCallback(
    async (topic?: string, force = false) => {
      if (isGeneratingJournal) return;

      // Journal entries should be per once a day and not per session
      const hasTodayEntry = journalEntriesRef.current.some((e) => isDateToday(e.createdAtMs));
      if (hasTodayEntry && !topic && !force) {
        return;
      }

      setIsGeneratingJournal(true);
      setVitals((prev) => ({ ...prev, status: 'CONTEMPLATING' }));
      try {
        const historySnapshot = messagesRef.current.slice(-12).map((m) => ({ sender: m.sender, content: m.content }));
        const res = await fetch('/api/journal/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callsign: displayProfileRef.current.callsign,
            dynamicNotes: displayProfileRef.current.dynamicNotes,
            companionName: displayProfileRef.current.companionName,
            companionPersonality: displayProfileRef.current.companionPersonality,
            memories: memoriesRef.current.slice(0, 15),
            history: historySnapshot,
            topic: topic || '',
            isAutonomous: !topic,
            model: selectedModelRef.current,
            autoFailover: autoFailoverRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.content) {
          throw new Error(data.error || 'Failed to record reflection.');
        }

        const uid = currentUserRef.current?.uid;
        const entryId = makeSafeId('journal');
        const now = Date.now();
        const newEntry: CompanionJournalEntry = {
          id: entryId,
          ownerId: uid || 'guest_local',
          title: data.title || 'Midnight Watch',
          content: data.content,
          mood: data.mood || 'FOCUSED',
          focus: data.focus || 'Direct Link',
          tags: Array.isArray(data.tags) ? data.tags : ['User', 'Companion'],
          isAutonomous: Boolean(data.isAutonomous),
          createdAtMs: now,
          updatedAtMs: now,
        };

        deletedJournalIdsRef.current.delete(entryId);
        setJournalEntries((prev) => [newEntry, ...prev.filter((e) => e.id !== entryId)]);
        if (uid) {
          void saveCloudJournalEntry(uid, newEntry);
        }

        try {
          window.dispatchEvent(
            new CustomEvent('companion_journal_updated', { detail: newEntry })
          );
        } catch {
          // ignore
        }

        sendMinimizedNotification("Companion's Daily Journal Recorded", `"${newEntry.title}": ${newEntry.content}`);

        setVitals((prev) => ({
          ...prev,
          status: 'CONNECTED',
          thoughtStream: `Recorded in Companion's Journal: "${newEntry.title}"`,
        }));
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : 'Could not generate reflection.');
        setVitals((prev) => ({ ...prev, status: 'CONNECTED' }));
      } finally {
        setIsGeneratingJournal(false);
      }
    },
    [
      isGeneratingJournal,
      sendMinimizedNotification,
    ]
  );

  // Delete Journal Entry
  const handleDeleteJournalEntry = async (entryId: string) => {
    deletedJournalIdsRef.current.add(entryId);
    setJournalEntries((prev) => prev.filter((e) => e.id !== entryId));
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void deleteCloudJournalEntry(uid, entryId);
    }
  };

  // Speak Journal Entry Aloud
  const handleSpeakJournalEntry = async (entryId: string, text: string) => {
    setSpeakingJournalId(entryId);
    try {
      await speakMessage(entryId, text);
    } finally {
      setSpeakingJournalId(null);
    }
  };

  // Spontaneous 10-Minute Idle Check-In & Daily Autonomous Contemplation Loop (Once a Day)
  useEffect(() => {
    const interval = window.setInterval(async () => {
      const now = Date.now();
      const idleTimeMs = now - lastUserActivityRef.current;
      const IDLE_10_MINUTES = 10 * 60 * 1000;

      // 1. Spontaneous check-in when idle for 10+ minutes
      if (
        profileRef.current.autoMessages &&
        !isStreamingRef.current &&
        callStateRef.current !== 'active' &&
        idleTimeMs >= IDLE_10_MINUTES &&
        now - lastAutoCheckinRef.current >= IDLE_10_MINUTES
      ) {
        lastAutoCheckinRef.current = now;
        try {
          const res = await fetch('/api/chat/auto-checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callsign: displayProfileRef.current.callsign,
              dynamicNotes: displayProfileRef.current.dynamicNotes,
              companionName: displayProfileRef.current.companionName,
              companionPersonality: displayProfileRef.current.companionPersonality,
              memories: memoriesRef.current.slice(0, 15),
              history: messagesRef.current.slice(-6).map((m) => ({
                sender: m.sender,
                content: m.content,
              })),
              model: selectedModelRef.current,
              autoFailover: autoFailoverRef.current,
            }),
          });
          const data = await res.json();
          if (res.ok && data.reply) {
            const convId = await ensureWritableConversation();
            const msgId = await appendMessageRecord({
              convId,
              sender: 'companion',
              content: data.reply,
              thoughtStream: '',
              modality: 'text',
            });
            if (profileRef.current.autoSpeakReplies) {
              void speakMessage(msgId, data.reply);
            }
            sendMinimizedNotification(`Companion · ${displayProfileRef.current.callsign}`, data.reply);
          }
        } catch {
          // silent retry on next cycle
        }
      }

      // 2. Daily Autonomous Contemplation: Companion records a thought stream once per day (not per session)
      if (
        autonomousContemplationRef.current &&
        !isStreamingRef.current &&
        callStateRef.current !== 'active' &&
        messagesRef.current.length >= 2
      ) {
        const hasTodayEntry = journalEntriesRef.current.some((e) => isDateToday(e.createdAtMs));

        // Only generate if today does not yet have a journal entry and user has been idle for 45 seconds
        if (!hasTodayEntry && idleTimeMs >= 45_000) {
          lastJournalContemplationRef.current = now;
          uncontemplatedTurnsRef.current = 0;
          try {
            void handleGenerateJournalEntry();
          } catch {
            // silent
          }
        }
      }
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [
    appendMessageRecord,
    ensureWritableConversation,
    handleGenerateJournalEntry,
    sendMinimizedNotification,
    speakMessage,
  ]);

  // Create New Conversation (Clean, zero scripted placeholder messages)
  const handleNewConversation = async () => {
    const newId = makeSafeId('conv');
    const now = Date.now();
    const uid = currentUserRef.current?.uid;
    const newConv: ConversationItem = {
      id: newId,
      ownerId: uid || 'guest_local',
      title: 'New Conversation',
      isArchived: false,
      summary: '',
      lastMessagePreview: '',
      mood: 'FOCUSED',
      focus: 'HIGH',
      createdAtMs: now,
      updatedAtMs: now,
    };
    setConversations((prev) => [newConv, ...prev]);
    conversationsRef.current = [newConv, ...conversationsRef.current];
    setGuestMessagesMap((prev) => ({ ...prev, [newId]: [] }));
    guestMessagesMapRef.current = { ...guestMessagesMapRef.current, [newId]: [] };
    setActiveConversationId(newId);
    if (uid) {
      await saveCloudConversation(uid, newConv);
    }
  };

  // Rename Conversation
  const handleRenameConversation = async (conv: ConversationItem, newTitle: string) => {
    const cleanTitle = clampString(newTitle, 1, 120, 'Direct Channel');
    const now = Date.now();
    const updated = { ...conv, title: cleanTitle, updatedAtMs: now };
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? updated : c))
    );
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudConversation(uid, updated);
    }
  };

  // Autonomous / On-demand Thread Title Suggestion by Companion
  const handleCompanionSuggestThreadTitle = async (conv?: ConversationItem): Promise<string> => {
    const targetConv = conv || renamingConv;
    if (!targetConv) return '';
    const convMsgs = guestMessagesMap[targetConv.id] || [];
    try {
      const res = await fetch('/api/chat/suggest-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTitle: targetConv.title,
          messages: convMsgs.slice(-10).map((m) => ({
            sender: m.sender,
            content: m.content.slice(0, 400),
          })),
        }),
      });
      const data = await res.json();
      return (data.suggestedTitle as string) || targetConv.title;
    } catch {
      return targetConv.title;
    }
  };

  // Autonomous / On-demand File Renaming Suggestion by Companion
  const handleCompanionSuggestFileName = async (assetId: string, currentName: string): Promise<string> => {
    const activeMsgs = messages.slice(-6);
    const contextStr = activeMsgs.map((m) => `${m.sender}: ${m.content}`).join('\n').slice(0, 800);
    try {
      const res = await fetch('/api/chat/suggest-filename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentName,
          threadContext: contextStr,
        }),
      });
      const data = await res.json();
      return (data.suggestedName as string) || currentName;
    } catch {
      return currentName;
    }
  };

  // Save Renamed File to Cloud & Local Storage
  const handleConfirmRenameFile = async (assetId: string, newName: string) => {
    const cleanName = newName.trim();
    if (!cleanName) return;
    const uid = currentUserRef.current?.uid;
    if (uid) {
      await renameCloudAsset(uid, assetId, cleanName);
    }
    const existingAsset = messageAssets[assetId];
    if (existingAsset && existingAsset.startsWith('meta:')) {
      try {
        const parsed = JSON.parse(existingAsset.slice(5));
        parsed.name = cleanName;
        const updatedMetaPayload = `meta:${JSON.stringify(parsed)}`;
        await saveAssetDataUrl(assetId, updatedMetaPayload);
        setMessageAssets((prev) => ({ ...prev, [assetId]: updatedMetaPayload }));
      } catch {
        // ignore
      }
    }
    setRefreshSuccessToast(`Renamed file to "${cleanName}"`);
    setTimeout(() => setRefreshSuccessToast(null), 3000);
  };

  // Summarize & Archive Conversation into Long-Term Memory
  const handleArchiveConversation = async (conv: ConversationItem) => {
    setVitals((prev) => ({
      ...prev,
      status: 'ARCHIVING',
    }));

    const convHistory: Array<{ sender: 'user' | 'companion'; content: string }> =
      conv.id === activeConversationId
        ? messages.map((m) => ({ sender: m.sender, content: m.content }))
        : (guestMessagesMap[conv.id] || []).map((m) => ({
            sender: m.sender,
            content: m.content,
          }));

    let summaryText = '';
    try {
      const res = await fetch('/api/chat/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: convHistory,
          callsign: displayProfile.callsign,
          companionName: displayProfile.companionName,
          existingFacts: memories.map((m) => m.fact),
          model: selectedModel,
          autoFailover,
        }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        summaryText = clampString(data.summary, 0, 2000, '');
        if (Array.isArray(data.memories)) {
          for (const item of data.memories) {
            await addMemoryNode(
              sanitizeMemoryCategory(item.category),
              item.fact,
              item.importance,
              conv.id
            );
          }
        }
      }
    } catch {
      // summary remains empty if unreachable
    }

    const now = Date.now();
    const updatedConv = { ...conv, isArchived: true, summary: summaryText, updatedAtMs: now };
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? updatedConv : c))
    );

    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudConversation(uid, updatedConv);
    }

    setVitals((prev) => ({
      ...prev,
      status: 'CONNECTED',
    }));
  };

  // Restore Archived Conversation
  const handleRestoreConversation = async (conv: ConversationItem) => {
    const now = Date.now();
    const updatedConv = { ...conv, isArchived: false, updatedAtMs: now };
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? updatedConv : c))
    );
    activeTabInteractedConvIdsRef.current.add(conv.id);
    setActiveConversationId(conv.id);
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudConversation(uid, updatedConv);
    }
  };

  // Delete Conversation & Child Messages
  const handleDeleteConversation = async (convId: string) => {
    deletedConvIdsRef.current.add(convId);
    try {
      const saved = JSON.parse(localStorage.getItem('companion_deleted_conv_ids') || '[]');
      if (Array.isArray(saved) && !saved.includes(convId)) {
        saved.push(convId);
        localStorage.setItem('companion_deleted_conv_ids', JSON.stringify(saved.slice(-200)));
      }
    } catch {
      // ignore
    }
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void deleteCloudConversation(uid, convId);
    }

    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== convId);
      if (remaining.length === 0) {
        const fallbackId = makeSafeId('conv');
        const fresh: ConversationItem = {
          id: fallbackId,
          ownerId: uid || 'guest_local',
          title: 'Direct Channel',
          isArchived: false,
          summary: '',
          lastMessagePreview: '',
          mood: 'FOCUSED',
          focus: 'HIGH',
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        };
        setActiveConversationId(fallbackId);
        setGuestMessagesMap((mPrev) => {
          const copy = { ...mPrev };
          delete copy[convId];
          copy[fallbackId] = [];
          return copy;
        });
        if (uid) {
          void saveCloudConversation(uid, fresh);
        }
        return [fresh];
      }
      setGuestMessagesMap((mPrev) => {
        const copy = { ...mPrev };
        delete copy[convId];
        return copy;
      });
      if (convId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
      return remaining;
    });
  };

  // Archive All Chats: Compiles highlights into Memory Vault & Journal, resets active channel
  const handleArchiveAllChats = useCallback(async () => {
    const activeConvId = activeConversationIdRef.current;
    const currentMsgs = guestMessagesMapRef.current[activeConvId] || [];
    if (currentMsgs.length === 0) return;

    setVitals((prev) => ({ ...prev, status: 'CONTEMPLATING' }));

    const now = Date.now();
    const dateStr = new Date(now).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const sampleHighlights = currentMsgs
      .slice(-15)
      .map((m) => `${m.sender === 'user' ? displayProfileRef.current.callsign : 'Companion'}: ${m.content.slice(0, 100)}`)
      .join('\n');

    const archiveJournalId = makeSafeId('journal');
    const archiveJournalEntry: CompanionJournalEntry = {
      id: archiveJournalId,
      ownerId: currentUserRef.current?.uid || 'guest_local',
      title: `Archived Stream Chronicle · ${dateStr}`,
      content: `Channel session of ${currentMsgs.length} messages archived on ${dateStr}. Session highlights:\n\n${sampleHighlights}\n\nAll directives and partner memories remain safely locked in the Memory Vault. Active frequency rebooted fresh for User.`,
      mood: 'FOCUSED',
      focus: 'Archive Chronicle',
      tags: ['archive', 'channel-history', 'chronicle'],
      isAutonomous: false,
      createdAtMs: now,
      updatedAtMs: now,
    };

    setJournalEntries((prev) => [archiveJournalEntry, ...prev]);

    const archiveMemId = makeSafeId('mem');
    const archiveMemNode: MemoryNode = {
      id: archiveMemId,
      ownerId: currentUserRef.current?.uid || 'guest_local',
      category: 'shared_history',
      fact: `Channel archived on ${dateStr} with ${currentMsgs.length} messages preserved in journal chronicle.`,
      importance: 5,
      sourceConversationId: activeConvId,
      createdAtMs: now,
      updatedAtMs: now,
    };
    setMemories((prev) => [archiveMemNode, ...prev]);

    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudJournalEntry(uid, archiveJournalEntry);
      void saveCloudMemory(uid, archiveMemNode);
      void archiveCloudConversation(uid, activeConvId, `Archived Stream · ${dateStr}`);
    }

    setGuestMessagesMap((prev) => ({
      ...prev,
      [activeConvId]: [],
    }));
    setActiveFilterDate(null);

    setVitals((prev) => ({
      ...prev,
      status: 'CONNECTED',
      thoughtStream: `Archived session locked in. Frequency clear for User.`,
    }));
    setRefreshSuccessToast(`Channel archived. Memories saved to Vault.`);
    setTimeout(() => setRefreshSuccessToast(null), 4000);
  }, []);

  // Delete All Chats: Permanent wipe of messages locally and in Cloud Firestore
  const handleDeleteAllChats = useCallback(async () => {
    const activeConvId = activeConversationIdRef.current;
    const uid = currentUserRef.current?.uid;

    setGuestMessagesMap((prev) => ({
      ...prev,
      [activeConvId]: [],
    }));
    setActiveFilterDate(null);

    if (uid) {
      await deleteAllCloudMessages(uid, activeConvId);
    }

    setVitals((prev) => ({
      ...prev,
      status: 'CONNECTED',
      thoughtStream: 'Channel wiped clean. Slate is clear.',
    }));
    setRefreshSuccessToast('All chat messages permanently deleted.');
    setTimeout(() => setRefreshSuccessToast(null), 4000);
  }, []);

  // Jump in chat to specific calendar date with highlight pulse
  const handleJumpToDate = useCallback((dateKey: string) => {
    setActiveFilterDate(null);
    setJumpedDateKey(dateKey);

    setTimeout(() => {
      const el = document.getElementById(`date-anchor-${dateKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const match = (guestMessagesMapRef.current[activeConversationIdRef.current] || []).find(
          (m) => getMsgDateKey(m.createdAtMs) === dateKey
        );
        if (match) {
          const msgEl = document.getElementById(`msg-${match.id}`);
          if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    }, 100);

    setTimeout(() => {
      setJumpedDateKey(null);
    }, 3500);
  }, []);

  // Export Full Ecosystem Backup Bundle (Chat History, Scrapbook, Memory, and Visual Assets)
  const handleExportSession = async (options?: {
    includeChat?: boolean;
    includeScrapbook?: boolean;
    includeMemory?: boolean;
    includeImages?: boolean;
  }) => {
    const includeChat = options ? options.includeChat !== false : true;
    const includeScrapbook = options ? options.includeScrapbook !== false : true;
    const includeMemory = options ? options.includeMemory !== false : true;
    const includeImages = options ? options.includeImages !== false : true;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    let localAssets: Record<string, string> = {};
    if (includeImages) {
      try {
        localAssets = await collectAllLocalAssets();
      } catch (err) {
        console.warn('Failed collecting image assets for backup:', err);
      }
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      ecosystem: 'Companion App',
      version: '3.0',
      partnerCallsign: displayProfile.callsign,
      selectedModel,
      profile,
      // Chat History
      chatHistory: includeChat
        ? {
            conversations,
            messagesByConv: guestMessagesMap,
          }
        : undefined,
      conversations: includeChat ? conversations : [],
      messagesByConv: includeChat ? guestMessagesMap : {},
      conversation: includeChat ? (activeConv || null) : null,
      messages: includeChat ? messages : [],
      // Creative Room thread (optional field — older backups simply lack it)
      creativeMessages: includeChat ? creativeMessages : [],
      // Scrapbook
      scrapbook: includeScrapbook ? journalEntries : [],
      scrapbookEntries: includeScrapbook ? journalEntries : [],
      journal: includeScrapbook ? journalEntries : [],
      // Memory
      memory: includeMemory ? memories : [],
      memoryVault: includeMemory ? memories : [],
      memories: includeMemory ? memories : [],
      // Visual Gallery & Assets
      images: includeImages ? creations : [],
      creations: includeImages ? creations : [],
      assets: includeImages ? localAssets : {},
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companion-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setRefreshSuccessToast('Ecosystem backup downloaded (Chat · Scrapbook · Memory · Assets)');
    setTimeout(() => setRefreshSuccessToast(null), 3500);
  };

  // Import Full Ecosystem Backup Bundle
  const handleImportSession = async (file: File) => {
    setBannerError(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      if (parsed.profile && typeof parsed.profile === 'object') {
        setProfile((prev) => ({
          ...prev,
          callsign: clampString(parsed.profile.callsign || prev.callsign, 1, 40, 'Friend'),
          dynamicNotes: clampString(parsed.profile.dynamicNotes ?? prev.dynamicNotes, 0, 500, ''),
          preferredVoice: sanitizeVoicePreset(parsed.profile.preferredVoice || prev.preferredVoice),
          autoMessages: Boolean(parsed.profile.autoMessages),
          autoSpeakReplies: Boolean(parsed.profile.autoSpeakReplies),
          companionName: clampString(parsed.profile.companionName ?? prev.companionName ?? '', 0, 40, ''),
          companionPersonality: clampString(
            parsed.profile.companionPersonality ?? prev.companionPersonality ?? '',
            0,
            4000,
            ''
          ),
          companionGreeting: clampString(parsed.profile.companionGreeting ?? prev.companionGreeting ?? '', 0, 300, ''),
          companionAvatarUrl:
            typeof parsed.profile.companionAvatarUrl === 'string'
              ? parsed.profile.companionAvatarUrl
              : prev.companionAvatarUrl,
          updatedAtMs: Date.now(),
        }));
      }

      // Restore Chat History
      const importedConversations =
        parsed.conversations || (parsed.chatHistory && parsed.chatHistory.conversations);
      const importedMessagesByConv =
        parsed.messagesByConv || (parsed.chatHistory && parsed.chatHistory.messagesByConv);

      if (Array.isArray(importedConversations) && importedConversations.length > 0) {
        setConversations(importedConversations);
        const firstActive =
          importedConversations.find((c: ConversationItem) => !c.isArchived) ||
          importedConversations[0];
        setActiveConversationId(firstActive.id);
        if (importedMessagesByConv && typeof importedMessagesByConv === 'object') {
          setGuestMessagesMap(importedMessagesByConv);
        }
      } else if (parsed.conversation && Array.isArray(parsed.messages)) {
        const importedConv = parsed.conversation as ConversationItem;
        setConversations((prev) => [
          importedConv,
          ...prev.filter((c) => c.id !== importedConv.id),
        ]);
        setGuestMessagesMap((prev) => ({
          ...prev,
          [importedConv.id]: parsed.messages as ChatMessage[],
        }));
        setActiveConversationId(importedConv.id);
      }

      // Restore Scrapbook
      const importedScrapbook = parsed.scrapbook || parsed.scrapbookEntries || parsed.journal;
      if (Array.isArray(importedScrapbook) && importedScrapbook.length > 0) {
        setJournalEntries(importedScrapbook);
      }

      // Restore Creative Room thread (missing field = older backup, skip)
      if (Array.isArray(parsed.creativeMessages) && parsed.creativeMessages.length > 0) {
        const restoredCreative = sanitizeCreativeMessages(parsed.creativeMessages);
        if (restoredCreative.length > 0) {
          setCreativeMessages(restoredCreative);
          // The Room lives outside syncBidirectional, so replicate the
          // restored thread to its cloud collection directly.
          const uid = currentUserRef.current?.uid;
          if (uid) {
            for (const m of restoredCreative) {
              void saveCloudCreativeMessage(uid, m);
            }
          }
        }
      }

      // Restore Memory Vault
      const importedMemories = parsed.memory || parsed.memoryVault || parsed.memories;
      if (Array.isArray(importedMemories) && importedMemories.length > 0) {
        setMemories(importedMemories);
      }

      // Restore Visual Creations & Image Assets
      const importedCreations = parsed.images || parsed.creations;
      if (Array.isArray(importedCreations) && importedCreations.length > 0) {
        setCreations(importedCreations);
      }

      if (parsed.assets && typeof parsed.assets === 'object') {
        const assetsObj = parsed.assets as Record<string, string>;
        setMessageAssets((prev) => ({ ...prev, ...assetsObj }));
        for (const [aId, dUrl] of Object.entries(assetsObj)) {
          if (typeof dUrl === 'string' && dUrl.startsWith('data:')) {
            void saveAssetDataUrl(aId, dUrl);
          }
        }
      }

      // If user is authenticated, trigger cloud sync to replicate restored data cross-device
      if (currentUserRef.current?.uid) {
        const uid = currentUserRef.current.uid;
        setTimeout(async () => {
          try {
            const allAssets = await collectAllLocalAssets();
            // Forced: the user just imported a backup — its data must be
            // replicated to the cloud now, never skipped as "fresh".
            await syncBidirectional(uid, {
              profile: profileRef.current,
              conversations: conversationsRef.current,
              messagesByConv: guestMessagesMapRef.current,
              memories: memoriesRef.current,
              creations: creationsRef.current,
              journal: journalEntriesRef.current,
              assets: allAssets,
            }, { force: true });
          } catch (syncErr) {
            console.warn('Post-import cloud sync notice:', syncErr);
          }
        }, 500);
      }

      setVitals((prev) => ({
        ...prev,
        thoughtStream: 'Full ecosystem backup restored (Chat History · Scrapbook · Memory · Visuals).',
      }));
      setRefreshSuccessToast('Backup successfully imported and restored');
      setTimeout(() => setRefreshSuccessToast(null), 3500);
    } catch {
      setBannerError('Invalid backup file. Please select a valid Companion JSON backup.');
    }
  };

  // Install PWA Handler
  const handleInstallAction = async () => {
    if (isInstallable) {
      const res = await install();
      if (res === 'unavailable') setShowInstallModal(true);
    } else {
      setShowInstallModal(true);
    }
  };

  // Save Profile Settings
  const handleSaveProfile = async (updates: {
    callsign: string;
    dynamicNotes: string;
    preferredVoice: VoicePreset;
    autoMessages: boolean;
    autoSpeakReplies: boolean;
    avatarUrl?: string;
    companionName: string;
    companionPersonality: string;
    companionGreeting: string;
    companionAvatarUrl?: string;
  }) => {
    const safeCallsign = clampString(updates.callsign, 1, 40, 'Friend');
    const safeNotes = clampString(updates.dynamicNotes, 0, 500, '');
    const safeVoice = sanitizeVoicePreset(updates.preferredVoice);
    // avatarUrl is either a short preset path or a self-contained data URL
    // produced by the profile photo picker — take it as-is when provided
    // (never length-clamp it: slicing a data URL would corrupt the image).
    const safeAvatarUrl =
      typeof updates.avatarUrl === 'string' && updates.avatarUrl.trim()
        ? updates.avatarUrl
        : profile.avatarUrl;
    // Companion fields: blank name falls back to "Companion" on the server;
    // blank personality keeps the shell default there too. The portrait is
    // a preset path or a self-contained data URL — take it as-is (never
    // length-clamp a data URL). An explicitly cleared portrait ('') resets.
    const safeCompanionName = clampString(updates.companionName, 0, 40, '');
    const safeCompanionPersonality = clampString(updates.companionPersonality, 0, 4000, '');
    const safeCompanionGreeting = clampString(updates.companionGreeting, 0, 300, '');
    const safeCompanionAvatarUrl =
      typeof updates.companionAvatarUrl === 'string'
        ? updates.companionAvatarUrl
        : profile.companionAvatarUrl;
    const now = Date.now();

    try {
      localStorage.setItem(VOICE_ID_STORAGE_KEY, safeVoice);
    } catch {
      // ignore
    }

    const updatedProfile: UserProfile = {
      ...profile,
      callsign: safeCallsign,
      dynamicNotes: safeNotes,
      preferredVoice: safeVoice,
      autoMessages: Boolean(updates.autoMessages),
      autoSpeakReplies: Boolean(updates.autoSpeakReplies),
      avatarUrl: safeAvatarUrl,
      companionName: safeCompanionName,
      companionPersonality: safeCompanionPersonality,
      companionGreeting: safeCompanionGreeting,
      companionAvatarUrl: safeCompanionAvatarUrl,
      updatedAtMs: now,
    };

    setProfile(updatedProfile);

    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudProfile(uid, updatedProfile);
    }
  };

  // Easy Import: apply a reviewed companion import through the SAME save
  // paths as manual edits — profile fields via handleSaveProfile (Firestore
  // profile via saveCloudProfile), memories as Memory Vault nodes via
  // saveCloudMemory — so the imported companion is live on the next message.
  // Only fields the import actually provided override current values.
  const handleImportCompanion = async (
    draft: CompanionImportDraft,
    selectedMemories: ImportedMemoryCandidate[]
  ) => {
    const current = profileRef.current;

    await handleSaveProfile({
      callsign: draft.callsign ?? current.callsign,
      dynamicNotes: draft.dynamicNotes ?? current.dynamicNotes,
      preferredVoice: draft.preferredVoice ?? current.preferredVoice,
      autoMessages: current.autoMessages,
      autoSpeakReplies: current.autoSpeakReplies,
      avatarUrl: current.avatarUrl,
      companionName: draft.companionName ?? current.companionName ?? '',
      companionPersonality:
        draft.companionPersonality ?? current.companionPersonality ?? '',
      companionGreeting: draft.companionGreeting ?? current.companionGreeting ?? '',
      companionAvatarUrl:
        draft.companionAvatarUrl ?? current.companionAvatarUrl ?? '',
    });

    if (selectedMemories.length > 0) {
      const uid = currentUserRef.current?.uid;
      const now = Date.now();
      const nodes: MemoryNode[] = selectedMemories.map((c) => ({
        id: makeSafeId('mem'),
        ownerId: uid || 'guest_local',
        category: sanitizeMemoryCategory(c.category),
        fact: clampString(c.fact, 1, 600),
        importance: Math.max(3, Math.min(5, Math.round(c.importance) || 4)),
        sourceConversationId: 'import',
        createdAtMs: now,
        updatedAtMs: now,
      }));
      const nodeIds = new Set(nodes.map((n) => n.id));
      setMemories((prev) => [
        ...nodes,
        ...prev.filter((m) => !nodeIds.has(m.id)),
      ]);
      if (uid) {
        for (const node of nodes) {
          void saveCloudMemory(uid, node);
        }
      }
    }
  };

  // Quick Toggle Auto Messages
  const handleToggleAutoMessages = async () => {
    const now = Date.now();
    const updatedProfile: UserProfile = {
      ...profile,
      autoMessages: !profile.autoMessages,
      updatedAtMs: now,
    };

    setProfile(updatedProfile);

    const uid = currentUserRef.current?.uid;
    if (uid) {
      void saveCloudProfile(uid, updatedProfile);
    }
  };

  // Delete Memory Node
  const handleDeleteMemory = async (memId: string) => {
    deletedMemoryIdsRef.current.add(memId);
    setMemories((prev) => prev.filter((m) => m.id !== memId));
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void deleteCloudMemory(uid, memId);
    }
  };

  // Image Studio: Generate Visual & Persist Locally
  const handleGenerateVisual = async (
    prompt: string,
    stylePreset: string,
    aspectRatio: AspectRatioOption,
    signal?: AbortSignal
  ) => {
    setVitals((prev) => ({
      ...prev,
      status: 'SYNTHESIZING',
    }));

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: clampString(prompt, 1, 1000),
          stylePreset: clampString(stylePreset, 1, 60),
          aspectRatio,
          model: selectedModel,
        }),
        signal,
      });

      const data = await res.json();
      if (!res.ok || !data.imageDataUrl) {
        throw new Error(data.error || 'Image Studio generation failed.');
      }

      const assetId = makeSafeId('asset');
      const creationId = makeSafeId('vis');
      await saveAssetDataUrl(assetId, data.imageDataUrl);

      const uid = currentUserRef.current?.uid;
      const creationRecord: VisualCreation = {
        id: creationId,
        ownerId: uid || 'guest_local',
        prompt: clampString(prompt, 1, 1000),
        stylePreset: clampString(stylePreset, 1, 60),
        aspectRatio,
        assetId,
        createdAtMs: Date.now(),
      };

      setCreations((prev) => [creationRecord, ...prev]);

      if (uid) {
        void saveCloudCreation(uid, {
          ...creationRecord,
          dataUrl: data.imageDataUrl,
        });
        void saveCloudAsset(uid, assetId, data.imageDataUrl);
      }

      return {
        creation: creationRecord,
        dataUrl: data.imageDataUrl as string,
        notice: (data.notice as string | null) || null,
      };
    } finally {
      setVitals((prev) => ({
        ...prev,
        status: 'CONNECTED',
      }));
    }
  };

  // Send Studio Visual to Active Chat
  const handleSendVisualToChat = async (creation: VisualCreation, dataUrl: string) => {
    setMessageAssets((prev) => ({ ...prev, [creation.assetId]: dataUrl }));
    await sendChatMessage(creation.prompt, 'image', creation.assetId);
  };

  // Delete Studio Visual
  const handleDeleteCreation = async (creation: VisualCreation) => {
    await deleteAssetDataUrl(creation.assetId);
    setCreations((prev) => prev.filter((c) => c.id !== creation.id));
    const uid = currentUserRef.current?.uid;
    if (uid) {
      void deleteCloudCreation(uid, creation.id);
    }
  };

  // Delete every failed render (the geometric SVG fallback pictures) in one
  // tap. A failed render is identified by its stored asset resolving to an
  // SVG data URL; real renders are JPEG/PNG and are never touched. Reuses the
  // single-delete path above so vault + cloud cleanup stay identical.
  const handleDeleteFallbackCreations = async (): Promise<number> => {
    let deleted = 0;
    for (const creation of [...creationsRef.current]) {
      const url = await loadAssetDataUrl(creation.assetId);
      if (url && url.startsWith('data:image/svg+xml')) {
        await handleDeleteCreation(creation);
        deleted++;
      }
    }
    return deleted;
  };

  const handleStepTextScale = (delta: number) => {
    const idx = VALID_TEXT_SCALES.indexOf(textScale);
    const nextIdx = Math.max(0, Math.min(VALID_TEXT_SCALES.length - 1, idx + delta));
    setTextScale(VALID_TEXT_SCALES[nextIdx]);
  };

  const handleTogglePlugin = (key: keyof ActivePluginsState) => {
    setPlugins((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Enhance Chat Draft Input (Magic Wand)
  const handleEnhanceChatInput = async () => {
    if (isEnhancingInput) return;
    setIsEnhancingInput(true);
    try {
      const res = await fetch('/api/chat/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          target: 'chat',
          model: selectedModel,
          autoFailover,
        }),
      });
      const data = await res.json();
      if (data.enhanced) setInputText(data.enhanced);
    } catch {
      // ignore
    } finally {
      setIsEnhancingInput(false);
    }
  };

  // Record & Transcribe Voice Note into Chat Input
  const handleToggleVoiceDictation = async () => {
    if (isRecordingNote && noteRecorderRef.current) {
      noteRecorderRef.current.stop();
      setIsRecordingNote(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      noteChunksRef.current = [];
      noteRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) noteChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(noteChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          const base64Audio = result.split(',')[1];
          if (!base64Audio) return;
          setVitals((prev) => ({
            ...prev,
            status: 'TRANSCRIBING',
          }));
          try {
            const res = await fetch('/api/audio/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = await res.json();
            if (data.transcript) {
              setInputText((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
            }
          } catch {
            setBannerError('Voice transcription failed.');
          } finally {
            setVitals((prev) => ({ ...prev, status: 'CONNECTED' }));
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecordingNote(true);
    } catch {
      setBannerError('Microphone permission is required for voice dictation.');
    }
  };

  const activeError = bannerError || voiceError;
  const activePluginsCount = (plugins.webSearch ? 1 : 0) + (plugins.urlContext ? 1 : 0);

  // Live OS1 internal clock (synced with system clock, updates every 10s)
  const [internalClockStr, setInternalClockStr] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setInternalClockStr(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const formatCallDuration = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Filter messages by calendar date if date filter is active
  const displayedMessages: ChatMessage[] = useMemo(() => {
    if (!activeFilterDate) return messages;
    return messages.filter((msg) => getMsgDateKey(msg.createdAtMs) === activeFilterDate);
  }, [messages, activeFilterDate]);

  // Front-door lock screen: shown instead of the app when the server's access
  // gate is on and this device hasn't unlocked yet.
  if (accessState !== 'open') {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[var(--bg-app)] p-4 text-[var(--text-main)]">
        {accessState === 'checking' ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking Companion&apos;s front door…</span>
          </div>
        ) : (
          <form
            onSubmit={handleAccessUnlock}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-cyan-400/35 bg-[var(--bg-input)] p-6 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-cyan-300">
              <Lock className="h-5 w-5" />
              <h1 className="font-display text-base font-bold text-white">Companion App is Private</h1>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              This Companion is private. Enter the access password to come in.
            </p>
            <input
              type="password"
              value={accessPasswordInput}
              onChange={(e) => setAccessPasswordInput(e.target.value)}
              placeholder="Access password"
              autoFocus
              className="w-full rounded-xl border border-indigo-400/35 bg-[var(--bg-raised)] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
            {accessError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {accessError}
              </div>
            )}
            <button
              type="submit"
              disabled={accessBusy || !accessPasswordInput}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-lg hover:brightness-110 cursor-pointer disabled:opacity-50"
            >
              {accessBusy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex h-dvh w-full overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)] ${TEXT_SCALE_CLASS_MAP[textScale]}`}
    >
      {/* System Ecosystem Modules & Navigation Drawer (No Single Chat Threads) */}
      <ModuleNavDrawer
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeView={activeView}
        onSelectView={setActiveView}
        journalCount={journalEntries.length}
        galleryCount={creations.length}
        memoryCount={memories.length}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenSync={() => setShowSyncModal(true)}
        onOpenPlugins={() => setShowPluginsModal(true)}
        onExportSession={() => setShowExportModal(true)}
        onImportSession={handleImportSession}
        isOnline={isOnline}
        profileCallsign={displayProfile.callsign}
      />

      {/* Primary Workspace Viewport — Full-Width Ongoing Direct Chat */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Streamlined Companion Header (No OS1 title, moves everything up) */}
        <header
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}
          className="relative flex flex-col border-b border-indigo-500/20 bg-[var(--bg-header)] backdrop-blur-md px-3 sm:px-6 shrink-0 select-none header-safe"
        >
          {/* Top Row: Modules, Brand, Clock, Sync, Text Size, Alerts, Profile */}
          <div className="flex items-center justify-between py-1.5 text-xs text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-300 hover:text-cyan-200 hover:bg-white/5 cursor-pointer border border-indigo-500/20 bg-[var(--bg-input)] shrink-0"
                title="Open Modules & Workspaces"
              >
                <Menu className="w-3.5 h-3.5 text-cyan-300" />
                <span className="text-[11px] font-semibold hidden xs:inline">Modules</span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-display font-bold text-xs sm:text-sm tracking-wider text-indigo-100">
                  {(displayProfile.companionName || 'Companion').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Center Live Clock */}
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-slate-400 tracking-widest">
              <span>{internalClockStr}</span>
            </div>

            {/* Right Controls: Cloud Sync, Text Size, Alerts, Android Widget, Profile */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Cloud Sync Button */}
              <div className="flex items-center rounded-lg border border-indigo-400/20 bg-[var(--bg-input)] p-0.5">
                <button
                  type="button"
                  onClick={handleForceSync}
                  disabled={isCloudSyncing}
                  title={
                    currentUser && !currentUser.isAnonymous && currentUser.email
                      ? `Force sync both devices now (Last synced: ${
                          lastSyncedAtMs
                            ? new Date(lastSyncedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Never'
                        })`
                      : 'Sign in to sync your companion across two devices'
                  }
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-200 hover:text-white cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 text-cyan-400 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden md:inline">{isCloudSyncing ? 'Syncing...' : 'Sync'}</span>
                  {currentUser && !currentUser.isAnonymous ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSyncModal(true)}
                  title="Cross-device account & sync details"
                  className="px-1 py-0.5 text-slate-400 hover:text-cyan-300 cursor-pointer border-l border-indigo-500/20"
                >
                  <Cloud className="w-3 h-3 text-slate-300" />
                </button>
              </div>

              {/* Text Size Slider */}
              <div ref={textSizePopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowTextSizePopover((v) => !v)}
                  title="Adjust text size"
                  className="flex items-center gap-1 rounded-lg border border-indigo-400/20 bg-[var(--bg-input)] px-1.5 py-0.5 text-[11px] font-medium text-slate-200 hover:text-cyan-200 cursor-pointer"
                >
                  <TypeIcon className="w-3 h-3 text-cyan-300" />
                  <span className="font-mono-tabular text-[10px] hidden xs:inline">{textScale}%</span>
                </button>
                {showTextSizePopover && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-cyan-400/35 bg-[var(--bg-input)] p-3.5 shadow-2xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Text Size</span>
                      <button
                        type="button"
                        onClick={() => setTextScale(110)}
                        className="text-[11px] text-cyan-300 hover:underline cursor-pointer"
                      >
                        Reset (110%)
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStepTextScale(-1)}
                        disabled={textScale <= 90}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-400/30 bg-[#12193d] text-slate-200 hover:border-cyan-400/50 disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="range"
                        min={90}
                        max={150}
                        step={10}
                        value={textScale}
                        onChange={(e) => setTextScale(sanitizeTextScale(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => handleStepTextScale(1)}
                        disabled={textScale >= 150}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-400/30 bg-[#12193d] text-slate-200 hover:border-cyan-400/50 disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Minimized Alerts Notification Toggle */}
              <button
                type="button"
                onClick={handleRequestNotifications}
                title={
                  notificationsEnabled
                    ? 'Notifications active (alerts when minimized)'
                    : 'Enable background notifications'
                }
                className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                  notificationsEnabled
                    ? 'border-cyan-400/50 bg-cyan-950/40 text-cyan-200'
                    : 'border-indigo-400/20 bg-[var(--bg-input)] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bell className={`w-3 h-3 ${notificationsEnabled ? 'text-cyan-300' : 'text-slate-400'}`} />
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    notificationsEnabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
              </button>

              {/* Profile */}
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-1.5 rounded-full border border-indigo-400/20 bg-[var(--bg-input)] pl-1 pr-2 py-0.5 hover:border-cyan-400/50 transition-colors shrink-0 cursor-pointer"
              >
                <UserAvatar size="mini" avatarUrl={displayProfile.avatarUrl} />
                <span className="text-[11px] font-medium text-slate-200 max-w-16 sm:max-w-24 truncate hidden sm:inline">
                  {displayProfile.callsign}
                </span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs with Active Glowing Underline Indicator */}
          <nav className="flex items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm font-light text-slate-400 pt-0.5 pb-1.5">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'dashboard' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>chat</span>
              {activeView === 'dashboard' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('journal')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'journal' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>scrapbook</span>
              {activeView === 'journal' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('memory')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'memory' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>memories</span>
              {activeView === 'memory' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('image_studio')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'image_studio' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>studio</span>
              {activeView === 'image_studio' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('gallery')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'gallery' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>gallery</span>
              {activeView === 'gallery' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('creative_room')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'creative_room' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>creative</span>
              {activeView === 'creative_room' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('games_room')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'games_room' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>games</span>
              {activeView === 'games_room' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView(activeView === 'system' ? 'dashboard' : 'system')}
              className={`relative transition-colors cursor-pointer pb-1 ${
                activeView === 'system' ? 'text-white font-medium' : 'hover:text-slate-200'
              }`}
            >
              <span>system</span>
              {systemErrorLogs.length > 0 && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-rose-400 inline-block animate-ping" />
              )}
              {activeView === 'system' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
              )}
            </button>
          </nav>

        </header>

        {/* Offline / Error Alert Strip */}
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/20 border-b border-amber-400/30 px-4 py-1.5 text-xs text-amber-200 shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline Mode — Local cached state active.</span>
          </div>
        )}
        {activeError && (
          <div className="flex items-center justify-between gap-3 bg-rose-950/60 border-b border-rose-500/40 px-4 py-1.5 text-xs text-rose-200 shrink-0">
            <span className="truncate">{activeError}</span>
            <button
              type="button"
              onClick={() => {
                setBannerError(null);
                setVoiceError(null);
              }}
              className="underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Balanced OS1 Companion Workspace Column */}
        <main
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)' }}
          className="flex-1 min-h-0 flex flex-col max-w-3xl w-full mx-auto px-2.5 sm:px-6 pt-1 pb-safe sm:py-2 gap-1.5 sm:gap-2 overflow-hidden"
        >
          {/* Dynamic Workspace Viewport: Companion's Journal OR Memory Vault OR Image Studio OR Gallery OR System OR Companion Chat */}
          {activeView === 'journal' ? (
            <CompanionJournalView
              callsign={displayProfile.callsign}
              entries={journalEntries}
              autonomousContemplation={autonomousContemplation}
              onToggleAutonomousContemplation={() => setAutonomousContemplation((v) => !v)}
              isGenerating={isGeneratingJournal}
              onGenerateEntry={handleGenerateJournalEntry}
              onDeleteEntry={handleDeleteJournalEntry}
              onSpeakText={handleSpeakJournalEntry}
              speakingId={speakingJournalId}
              onBackToChat={() => setActiveView('dashboard')}
            />
          ) : activeView === 'memory' ? (
            <MemoryVaultView
              callsign={displayProfile.callsign}
              memories={memories}
              archivedConversations={archivedConversations}
              onAddMemory={(cat, fact, imp) => addMemoryNode(cat, fact, imp)}
              onDeleteMemory={handleDeleteMemory}
              onBackToChat={() => setActiveView('dashboard')}
            />
          ) : activeView === 'image_studio' ? (
            <ImageStudioView
              creations={creations}
              initialPrompt={studioInitialConfig?.prompt}
              initialStyle={studioInitialConfig?.stylePreset}
              initialRatio={studioInitialConfig?.aspectRatio}
              onGenerateVisual={handleGenerateVisual}
              onSendVisualToChat={handleSendVisualToChat}
              onDeleteCreation={handleDeleteCreation}
              onDeleteFallbackCreations={handleDeleteFallbackCreations}
              onBackToChat={() => setActiveView('dashboard')}
              onOpenGallery={() => setActiveView('gallery')}
            />
          ) : activeView === 'gallery' ? (
            <GalleryView
              creations={creations}
              onSendVisualToChat={handleSendVisualToChat}
              onDeleteCreation={handleDeleteCreation}
              onDeleteFallbackCreations={handleDeleteFallbackCreations}
              onBackToChat={() => setActiveView('dashboard')}
              onOpenStudio={(p, s, r) => {
                if (p) setStudioInitialConfig({ prompt: p, stylePreset: s, aspectRatio: r });
                setActiveView('image_studio');
              }}
            />
          ) : activeView === 'creative_room' ? (
            <CreativeRoomView
              callsign={displayProfile.callsign}
              companionName={displayProfile.companionName?.trim() || 'Companion'}
              messages={creativeMessages}
              isStreaming={isCreativeStreaming}
              streamingReply={creativeStreamingReply}
              thoughtStream={vitals.thoughtStream}
              savedFactsByMsgId={savedMemoriesByMsgId}
              onSendMessage={sendCreativeMessage}
              onBackToChat={() => setActiveView('dashboard')}
            />
          ) : activeView === 'games_room' ? (
            <GamesRoomView
              callsign={displayProfile.callsign}
              companionName={displayProfile.companionName?.trim() || 'Companion'}
              messages={gamesMessages}
              isStreaming={isGamesStreaming}
              streamingReply={gamesStreamingReply}
              onSendMessage={sendGamesMessage}
              onBackToChat={() => setActiveView('dashboard')}
            />
          ) : activeView === 'system' ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto rounded-2xl border border-[var(--border-panel)] bg-[var(--bg-panel)] p-3 sm:p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20 shrink-0">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  <h2 className="font-display text-base font-bold text-white">System Diagnostics &amp; Telemetry</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className="px-3 py-1 rounded-xl border border-cyan-400/30 text-xs font-semibold text-cyan-200 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer"
                >
                  Back to Chat
                </button>
              </div>
              <VitalsHud
                vitals={vitals}
                isStreaming={isStreaming}
                activeView={activeView}
                onSelectView={setActiveView}
                selectedModel={selectedModel}
                activeModelUsed={activeModelUsed}
                onSelectModel={(model) => {
                  setSelectedModel(model);
                  setActiveModelUsed(null);
                }}
                callState={callState}
                callSeconds={callSeconds}
                isMicMuted={isMicMuted}
                onToggleMute={() => setIsMicMuted((m) => !m)}
                onToggleVoiceCall={startVoiceCall}
                onOpenVideoRoadmap={() => setShowVideoModal(true)}
                companionVocalLevel={companionVocalLevel}
                userMicLevel={userMicLevel}
                memoryCount={memories.length}
                memories={memories}
                creationsCount={creations.length}
                journalCount={journalEntries.length}
                userPresence={userPresence}
                onUpdateUserPresence={handleUpdateUserPresence}
                userCallsign={displayProfile.callsign}
                userAvatarUrl={displayProfile.avatarUrl}
                companionName={displayProfile.companionName}
                companionAvatarUrl={displayProfile.companionAvatarUrl}
                isCloudSyncing={isCloudSyncing}
                isGoogleLinked={Boolean(currentUser && !currentUser.isAnonymous && currentUser.email)}
                userEmail={currentUser?.email || null}
                lastSyncedAtMs={lastSyncedAtMs}
                onForceSync={handleForceSync}
                errorLogs={systemErrorLogs}
                onClearErrors={handleClearSystemErrors}
                activeError={activeError}
                isOnline={isOnline}
                apiDelayMs={apiDelayMetrics.totalMs}
                ttftMs={apiDelayMetrics.ttftMs}
              />

              {/* Appearance · Theme — skin picker. Set-and-stay: applies
                  instantly and persists until a human picks another skin. */}
              <div className="rounded-2xl border border-[var(--border-panel)] bg-[var(--bg-raised)] p-3 sm:p-4 space-y-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="font-display text-sm font-bold text-[var(--text-main)]">
                    Appearance · Theme
                  </h3>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
                  Pick a skin for your companion's home. It applies instantly
                  and stays until you change it — no auto-switching, ever.
                </p>
                <div className="space-y-2">
                  {THEME_SKINS.map((skin) => {
                    const isActiveSkin = skin.id === theme;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        onClick={() => setTheme(skin.id)}
                        aria-pressed={isActiveSkin}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          isActiveSkin
                            ? 'border-[var(--accent)] bg-white/5'
                            : 'border-[var(--border-panel)] hover:bg-white/5'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-main)]">
                            {skin.name}
                            {isActiveSkin && (
                              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black/80">
                                Active
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--text-dim)]">
                            {skin.vibe}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {skin.swatches.map((swatch) => (
                            <span
                              key={`${skin.id}-${swatch}`}
                              className="h-3.5 w-3.5 rounded-full border border-white/20"
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-[150px] flex flex-col gap-1.5 sm:gap-2 overflow-hidden">
              {/* Central Companion Area (Toggleable: Full Orb or Minimized Strip) */}
              {!isAvatarMinimized ? (
                <div className="flex flex-col items-center justify-center pt-1 sm:pt-2.5 pb-1 shrink-0 select-none transition-all duration-300">
                  <div
                    onClick={() => startVoiceCall()}
                    title="Click to start Voice Call with Companion"
                    className="relative group cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <CompanionAvatar
                      size="os1"
                      vocalLevel={companionVocalLevel}
                      isCallActive={callState === 'active' || callState === 'connecting'}
                      mood={vitals.mood}
                      avatarUrl={displayProfile.companionAvatarUrl}
                    />
                  </div>

                  {/* Companion Status, Mood & Voice Call Pill + Minimize Button */}
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-2 px-3 py-1 rounded-full bg-[var(--bg-panel)] border border-cyan-400/25 text-xs shadow-md">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        callState === 'active'
                          ? 'bg-emerald-400 animate-ping'
                          : isStreaming
                            ? 'bg-cyan-400 animate-pulse'
                            : 'bg-cyan-400'
                      }`}
                    />
                    <span className="font-mono text-[11px] text-cyan-200">
                      {callState === 'active'
                        ? `IN CALL · ${formatCallDuration(callSeconds)}`
                        : vitals.mood
                          ? `[${vitals.mood}]`
                          : 'ATTUNED'}
                    </span>
                    {vitals.thoughtStream && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span
                          className="text-slate-300 text-[11px] max-w-[170px] sm:max-w-xs truncate hidden xs:inline"
                          title={vitals.thoughtStream}
                        >
                          {vitals.thoughtStream}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startVoiceCall();
                      }}
                      className={`ml-1 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                        callState === 'active'
                          ? 'border-rose-400/40 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
                          : 'border-cyan-400/30 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40'
                      }`}
                    >
                      {callState === 'active' ? (
                        <>
                          <PhoneOff className="w-2.5 h-2.5 text-rose-400" />
                          <span>End</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall className="w-2.5 h-2.5 text-cyan-400" />
                          <span>Call</span>
                        </>
                      )}
                    </button>

                    {/* Minimize Avatar Button in Pill */}
                    <button
                      type="button"
                      onClick={toggleAvatarMinimized}
                      title="Minimize avatar orb to make chat easier to access"
                      className="ml-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-indigo-400/30 bg-[var(--bg-input)] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors cursor-pointer"
                    >
                      <ChevronUp className="w-2.5 h-2.5 text-cyan-300" />
                      <span>Minimize</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Compact Minimized Companion Presence Bar */
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-cyan-400/25 bg-[var(--bg-panel)] backdrop-blur-xs text-xs shrink-0 select-none animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => startVoiceCall()}
                      title={callState === 'active' ? 'In Call with Companion' : 'Start voice call with Companion'}
                      className="relative shrink-0 cursor-pointer group transition-transform hover:scale-105 active:scale-95"
                    >
                      <CompanionAvatar
                        size="compact"
                        vocalLevel={companionVocalLevel}
                        isCallActive={callState === 'active' || callState === 'connecting'}
                        mood={vitals.mood}
                        avatarUrl={displayProfile.companionAvatarUrl}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#080e2b] ${
                          callState === 'active'
                            ? 'bg-emerald-400 animate-ping'
                            : isStreaming
                              ? 'bg-cyan-400 animate-pulse'
                              : 'bg-cyan-400'
                        }`}
                      />
                    </button>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-display font-semibold text-slate-200 text-xs truncate">
                        {displayProfile.companionName || 'Companion'}
                      </span>
                      <span className="font-mono text-[10px] text-cyan-300 px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-400/20 shrink-0">
                        {callState === 'active'
                          ? `IN CALL · ${formatCallDuration(callSeconds)}`
                          : vitals.mood
                            ? `[${vitals.mood}]`
                            : 'ATTUNED'}
                      </span>
                      {vitals.thoughtStream && (
                        <span
                          className="text-slate-400 text-[11px] max-w-[140px] sm:max-w-xs truncate hidden sm:inline"
                          title={vitals.thoughtStream}
                        >
                          · {vitals.thoughtStream}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startVoiceCall()}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                        callState === 'active'
                          ? 'border-rose-400/40 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
                          : 'border-cyan-400/30 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40'
                      }`}
                    >
                      {callState === 'active' ? (
                        <>
                          <PhoneOff className="w-2.5 h-2.5 text-rose-400" />
                          <span>End</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall className="w-2.5 h-2.5 text-cyan-400" />
                          <span>Call</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleAvatarMinimized}
                      title="Expand companion avatar orb"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-cyan-400/35 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/60 hover:text-white transition-colors cursor-pointer text-[11px] font-semibold"
                    >
                      <ChevronDown className="w-3 h-3 text-cyan-300" />
                      <span>Show Avatar</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Minimal Channel Status & Controls Strip */}
              <div className="flex items-center justify-between px-3 py-1 rounded-xl border border-indigo-500/15 bg-[var(--bg-panel)] backdrop-blur-xs text-xs shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex h-2 w-2 rounded-full shrink-0 ${
                      activeError
                        ? 'bg-rose-500 animate-ping'
                        : isStreaming
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  <span className="font-display font-semibold text-slate-300 text-[11px] sm:text-xs truncate">
                    Direct Channel · {displayProfile.callsign} &amp; Companion
                  </span>
                  {activeError ? (
                    <span className="rounded bg-rose-500/20 border border-rose-400/40 px-2 py-0.5 text-[10px] text-rose-300 font-semibold truncate">
                      Alert Detected
                    </span>
                  ) : refreshSuccessToast ? (
                    <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] text-emerald-300 font-semibold truncate">
                      {refreshSuccessToast}
                    </span>
                  ) : null}

                  {apiDelayMetrics.totalMs !== null && (
                    <span
                      title={`Gemini text response delay: ${apiDelayMetrics.totalMs}ms${apiDelayMetrics.ttftMs ? ` (Time to First Token: ${apiDelayMetrics.ttftMs}ms)` : ''}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border hidden xs:inline-flex items-center gap-1 ${
                        apiDelayMetrics.totalMs > 4000
                          ? 'border-amber-400/50 bg-amber-950/40 text-amber-300'
                          : 'border-cyan-400/30 bg-[var(--bg-input)] text-cyan-300'
                      }`}
                    >
                      <span>API: {apiDelayMetrics.totalMs}ms</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  {/* Minimize / Expand Toggle in Channel Strip */}
                  <button
                    type="button"
                    onClick={toggleAvatarMinimized}
                    title={isAvatarMinimized ? 'Expand avatar orb' : 'Minimize avatar orb to make bottom chat easier to access'}
                    className="flex items-center gap-1 rounded-lg border border-indigo-400/20 bg-[var(--bg-input)] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors cursor-pointer"
                  >
                    {isAvatarMinimized ? (
                      <>
                        <Maximize2 className="w-3 h-3 text-cyan-300" />
                        <span className="hidden sm:inline">Avatar</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="w-3 h-3 text-cyan-300" />
                        <span className="hidden sm:inline">Minimize</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDateModal(true)}
                    title="Find chat history by date or jump to a specific day"
                    className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      activeFilterDate
                        ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200'
                        : 'border-indigo-400/20 bg-[var(--bg-input)] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200'
                    }`}
                  >
                    <Calendar className="w-3 h-3 text-cyan-300" />
                    <span className="hidden sm:inline">Date</span>
                    {activeFilterDate && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={messages.length === 0}
                    title="Archive all chats"
                    className="flex items-center gap-1 rounded-lg border border-indigo-400/20 bg-[var(--bg-input)] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-indigo-400/50 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Archive className="w-3 h-3 text-indigo-300" />
                    <span className="hidden md:inline">Archive All</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={messages.length === 0}
                    title="Delete all chats"
                    className="flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-950/25 px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:border-rose-500/50 hover:bg-rose-950/50 hover:text-rose-100 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                    <span className="hidden md:inline">Delete All</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRefreshChannel(Boolean(activeError))}
                    disabled={isRefreshingChannel}
                    title="Refresh API connection, clear errors, and resync channel"
                    className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      activeError
                        ? 'border-rose-400/60 bg-rose-950/60 text-rose-200 hover:bg-rose-900/50'
                        : 'border-indigo-400/20 bg-[var(--bg-input)] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200'
                    }`}
                  >
                    <RotateCcw
                      className={`w-3 h-3 text-cyan-300 ${
                        isRefreshingChannel ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="hidden xl:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Persistent Hybrid Text/Voice Chat Log — Always Visible */}
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="companion-chat-grid flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-xl sm:rounded-2xl border border-indigo-400/25 px-3 sm:px-5 py-2.5 sm:py-4 space-y-2.5 sm:space-y-3.5"
                >
                {/* Active Date Filter Banner */}
                {activeFilterDate && (
                  <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-cyan-950/90 border border-cyan-400/50 backdrop-blur-md text-xs text-cyan-200 shadow-md">
                    <div className="flex items-center gap-2 min-w-0">
                      <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">
                        Filtered to <strong>{activeFilterDate}</strong> ({displayedMessages.length} {displayedMessages.length === 1 ? 'message' : 'messages'})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveFilterDate(null)}
                      className="px-2.5 py-0.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 text-[11px] font-semibold cursor-pointer shrink-0"
                    >
                      Show All
                    </button>
                  </div>
                )}

                {isCloudHydrating && messages.length === 0 ? (
                  <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center space-y-3 py-6 sm:py-10">
                    <div className="relative flex items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                      <div className="absolute inset-0 rounded-full blur-md bg-cyan-400/25 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-display font-bold text-white text-sm sm:text-base">
                        Restoring Neural Link
                      </p>
                      <p className="text-xs text-cyan-200/80 max-w-sm">
                        Hydrating chat history, memory vault &amp; journal from cloud sync...
                      </p>
                    </div>
                  </div>
                ) : displayedMessages.length === 0 && !streamingReply ? (
                  <div className="flex h-full min-h-[110px] flex-col items-center justify-center text-center text-slate-400 space-y-1.5 py-3 sm:py-8">
                    <BrainCircuit className="w-5 h-5 sm:w-7 sm:h-7 text-cyan-400/60" />
                    <p className="companion-scalable-text text-slate-300 font-medium">
                      {activeFilterDate
                        ? `No messages recorded on ${activeFilterDate}.`
                        : displayProfile.companionGreeting?.trim()
                          ? displayProfile.companionGreeting
                          : `Direct channel open, ${displayProfile.callsign}.`}
                    </p>
                    <p className="text-xs max-w-md text-slate-400">
                      {activeFilterDate
                        ? 'Try jumping to another date or clear the filter to see full ongoing history.'
                        : `Say what's on your mind, attach images or files, or ask ${displayProfile.companionName || 'Companion'} "what time is it?" to check the internal clock.`}
                    </p>
                  </div>
                ) : null}

                {displayedMessages.map((msg: ChatMessage, idx: number) => {
                  const isUser = msg.sender === 'user';
                  const attachedUrl = msg.assetId ? messageAssets[msg.assetId] : undefined;
                  const attachedMeta = parseStoredAttachmentMeta(attachedUrl);
                  const savedFacts = savedMemoriesByMsgId[msg.id] || [];
                  const groundingLinks = groundingByMsgId[msg.id] || [];

                  const currentDateKey = getMsgDateKey(msg.createdAtMs);
                  const prevMsg = idx > 0 ? displayedMessages[idx - 1] : null;
                  const prevDateKey = prevMsg ? getMsgDateKey(prevMsg.createdAtMs) : null;
                  const isNewDay = !prevDateKey || currentDateKey !== prevDateKey;
                  const isJumpTarget = jumpedDateKey === currentDateKey;

                  return (
                    <React.Fragment key={msg.id}>
                      {isNewDay && (
                        <div
                          id={`date-anchor-${currentDateKey}`}
                          className={`flex items-center gap-3 my-3 py-1 transition-all duration-700 ${
                            isJumpTarget
                              ? 'scale-105 ring-2 ring-cyan-400 rounded-xl px-2 bg-cyan-950/50 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                              : ''
                          }`}
                        >
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-indigo-500/10" />
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-400/30 bg-[#0a112f] text-[11px] font-mono font-semibold text-cyan-300 shadow-sm">
                            <Calendar className="w-3 h-3 text-cyan-400" />
                            <span>{formatDateDivider(msg.createdAtMs)}</span>
                          </div>
                          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-indigo-500/30 to-indigo-500/10" />
                        </div>
                      )}

                      <div
                        id={`msg-${msg.id}`}
                        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                      >
                      <div
                        className={`max-w-[85%] sm:max-w-[76%] rounded-3xl px-4.5 sm:px-5 py-2.5 sm:py-3 companion-scalable-text shadow-md leading-relaxed ${
                          isUser
                            ? 'rounded-br-md border border-cyan-400/25 bg-[var(--bg-bubble-user)] text-[var(--text-main)]'
                            : 'rounded-bl-md border border-[var(--border-panel)] bg-[var(--bg-bubble-companion)] text-[var(--text-main)]'
                        }`}
                      >
                        {attachedUrl && !attachedMeta && (
                          <div className="mb-2.5 overflow-hidden rounded-xl border border-cyan-400/25 bg-[#060919] relative group">
                            <img
                              src={attachedUrl}
                              alt="Attached visual"
                              referrerPolicy="no-referrer"
                              className="max-h-56 w-auto object-contain mx-auto"
                            />
                            {msg.assetId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRenamingFile({
                                    assetId: msg.assetId!,
                                    currentName: 'Attached Visual',
                                  })
                                }
                                title="Rename attached visual with Companion"
                                className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-[#070d28]/90 px-2 py-1 text-[10px] font-semibold text-cyan-200 opacity-90 hover:opacity-100 hover:bg-[#0c1840] cursor-pointer shadow-md"
                              >
                                <Edit2 className="w-3 h-3 text-cyan-300" />
                                <span>Rename</span>
                              </button>
                            )}
                          </div>
                        )}

                        {attachedMeta && (
                          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-cyan-400/25 bg-[#090e26] px-3 py-2 text-xs text-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-cyan-300 shrink-0" />
                              <span className="truncate font-medium">{attachedMeta.name}</span>
                              {attachedMeta.count && attachedMeta.count > 1 && (
                                <span className="text-slate-400 shrink-0">
                                  · +{attachedMeta.count - 1} more
                                </span>
                              )}
                            </div>
                            {msg.assetId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRenamingFile({
                                    assetId: msg.assetId!,
                                    currentName: attachedMeta.name,
                                  })
                                }
                                title="Rename thread file with Companion"
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 hover:text-white hover:bg-cyan-500/20 transition-colors shrink-0 cursor-pointer"
                              >
                                <Edit2 className="w-3 h-3 text-cyan-300" />
                                <span className="hidden xs:inline">Rename</span>
                              </button>
                            )}
                          </div>
                        )}

                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}{' '}
                          <span
                            className={`font-semibold whitespace-nowrap ${
                              isUser ? 'text-cyan-300' : 'text-emerald-400'
                            }`}
                          >
                            {isUser ? `-${displayProfile.callsign}` : '-Companion'}
                          </span>
                        </p>

                        {/* Interactive Emoji Reaction Chips */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-700/40">
                            {Object.entries(msg.reactions).map(([emoji, rawActors]) => {
                              const actors: string[] = Array.isArray(rawActors) ? rawActors : [];
                              const hasUserReacted = actors.includes(displayProfile.callsign);
                              const hasCompanionReacted = actors.includes('Companion');
                              const tooltip = actors.join(', ');
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void handleToggleReaction(msg.id, emoji)}
                                  title={`Reactions: ${tooltip}`}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                                    hasUserReacted
                                      ? 'border-cyan-400/80 bg-cyan-500/25 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                                      : hasCompanionReacted
                                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                                        : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[11px] font-mono-tabular">{actors.length}</span>
                                  {hasCompanionReacted && !hasUserReacted && (
                                    <span className="text-[9px] text-emerald-400 font-bold ml-0.5" title="Companion reacted">ER</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Reaction Picker Bar (Active when reactingMsgId === msg.id) */}
                        {reactingMsgId === msg.id && (
                          <div className="mt-2 p-1.5 rounded-xl border border-cyan-400/35 bg-[#080d26]/95 backdrop-blur-md shadow-[0_4px_20px_rgba(6,182,212,0.25)] flex flex-wrap items-center gap-1 animate-in fade-in zoom-in-95">
                            {REACTION_PRESETS.map((emoji) => {
                              const isSelected = (msg.reactions?.[emoji] || []).includes(displayProfile.callsign);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    void handleToggleReaction(msg.id, emoji);
                                    setReactingMsgId(null);
                                  }}
                                  className={`h-7 w-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer hover:scale-125 ${
                                    isSelected ? 'bg-cyan-500/30 border border-cyan-400/60' : 'hover:bg-cyan-500/15'
                                  }`}
                                  title={`React with ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}

                            <div className="h-4 w-px bg-slate-700 mx-0.5" />

                            {/* Companion React Button */}
                            <button
                              type="button"
                              onClick={() => {
                                void handleCompanionReact(msg.id);
                                setReactingMsgId(null);
                              }}
                              disabled={isCompanionReactingMsgId === msg.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-emerald-400/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                              title="Companion will choose an authentic emoji reaction"
                            >
                              <Bot className={`w-3 h-3 text-emerald-400 ${isCompanionReactingMsgId === msg.id ? 'animate-spin' : ''}`} />
                              <span>Companion React</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setReactingMsgId(null)}
                              className="ml-auto p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                              title="Close reaction bar"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {isUser && (
                          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-slate-400/80">
                            <button
                              type="button"
                              onClick={() => setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)}
                              className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer py-0.5"
                              title="Add reaction or ask Companion to react"
                            >
                              <Smile className="w-3.5 h-3.5 text-cyan-400/70" />
                              <span className="text-[10px] font-sans">React</span>
                            </button>
                            {msg.createdAtMs && <span>{formatMessageTimestamp(msg.createdAtMs)}</span>}
                          </div>
                        )}

                        {!isUser && savedFacts.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-emerald-400/20 space-y-1 text-xs text-emerald-300/95">
                            {savedFacts.map((fact, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                                <span>
                                  Saved to Memory <span aria-hidden="true">·</span> {fact}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {!isUser && groundingLinks.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-indigo-400/20 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cyan-300">
                            <span className="text-slate-400">Sources:</span>
                            {groundingLinks.map((src, idx) => (
                              <a
                                key={idx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline truncate max-w-52"
                              >
                                <span className="truncate">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}

                        {!isUser && (
                          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono-tabular text-slate-400/80">
                                {msg.createdAtMs ? formatMessageTimestamp(msg.createdAtMs) : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)}
                                className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer py-0.5"
                                title="Add reaction or ask Companion to react"
                              >
                                <Smile className="w-3.5 h-3.5 text-cyan-400/70" />
                                <span className="text-[10px] font-sans">React</span>
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              {msg.modality === 'voice' && (
                                <span className="font-mono-tabular text-cyan-300/75 text-[10px]">
                                  Voice Turn
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => speakMessage(msg.id, msg.content)}
                                className={`flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer ${
                                  speakingMessageId === msg.id ? 'text-cyan-300 font-medium' : ''
                                }`}
                                title="Play Companion's voice"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                  {speakingMessageId === msg.id ? 'Speaking...' : 'Play Voice'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}

                {/* Live Voice Call Transcripts in Real Time */}
                {liveUserDraft && (
                  <div className="flex flex-col items-end opacity-85">
                    <div className="max-w-[84%] rounded-2xl rounded-br-xs border border-cyan-400/40 bg-[#1b2254]/80 px-4 py-2 companion-scalable-text text-cyan-100">
                      {liveUserDraft}{' '}
                      <span className="text-cyan-300 font-semibold">-{displayProfile.callsign}</span>
                    </div>
                  </div>
                )}

                {liveCompanionDraft && (
                  <div className="flex flex-col items-start opacity-90">
                    <div className="max-w-[84%] rounded-2xl rounded-bl-xs border border-emerald-400/40 bg-[#151c2e]/90 px-4 py-2 companion-scalable-text text-slate-100">
                      {liveCompanionDraft} <span className="text-emerald-400 font-semibold">-Companion</span>
                    </div>
                  </div>
                )}

                {/* Streaming Text Reply Preview */}
                {streamingReply && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-bl-xs border border-cyan-400/35 bg-[#151c2e]/95 px-4 py-2.5 companion-scalable-text text-slate-100">
                      <p className="whitespace-pre-wrap break-words">
                        {streamingReply}{' '}
                        <span className="text-emerald-400 font-semibold">-Companion</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* API Error & Retry Card in Chat */}
                {activeError && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[92%] sm:max-w-[80%] rounded-2xl rounded-bl-xs border border-rose-500/40 bg-gradient-to-br from-[#1a0f20]/95 via-[#18112e]/95 to-[#0e142e]/95 p-3 sm:p-4 text-xs sm:text-sm text-slate-200 shadow-[0_4px_20px_rgba(244,63,94,0.18)]">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-semibold text-rose-300 uppercase tracking-wider text-[11px]">
                              Transmission Disruption
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setBannerError(null);
                                setVoiceError(null);
                              }}
                              className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
                              title="Dismiss alert"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-slate-300 leading-relaxed text-xs">
                            {activeError}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {lastUserPromptRef.current && (
                              <button
                                type="button"
                                onClick={() => handleRefreshChannel(true)}
                                disabled={isRefreshingChannel}
                                className="flex items-center gap-1.5 rounded-lg border border-purple-400/50 bg-purple-900/40 px-2.5 py-1 text-xs font-semibold text-purple-200 hover:bg-purple-800/50 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw
                                  className={`w-3.5 h-3.5 ${
                                    isRefreshingChannel ? 'animate-spin' : ''
                                  }`}
                                />
                                <span>Retry Last Message</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRefreshChannel(false)}
                              disabled={isRefreshingChannel}
                              className="flex items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-[#0d163a] px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15 hover:border-cyan-400/60 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 text-cyan-400 ${
                                  isRefreshingChannel ? 'animate-spin' : ''
                                }`}
                              />
                              <span>Refresh Channel</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Floating Scroll-to-Bottom Button */}
              {isScrolledUp && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  aria-label="Scroll to newest messages"
                  className="absolute bottom-3 right-3 sm:right-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-cyan-400/40 bg-[#09112e]/95 text-cyan-300 hover:text-white hover:border-cyan-300 hover:bg-[#0f1d4f] shadow-[0_4px_18px_rgba(6,182,212,0.4)] backdrop-blur-md transition-all duration-200 cursor-pointer animate-in fade-in zoom-in-95 group text-xs font-semibold"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-cyan-400 group-hover:translate-y-0.5 transition-transform" />
                  <span>Latest</span>
                  {unreadWhileScrolledUp > 0 && (
                    <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-cyan-400 text-[#050814] text-[10px] font-bold">
                      {unreadWhileScrolledUp}
                    </span>
                  )}
                </button>
              )}
            </div>

              {/* Pending File / Image Attachments Strip */}
              {pendingAttachments.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-cyan-400/30 bg-[#0b1026] px-2.5 py-1.5 shrink-0">
                  {pendingAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-[#131b3f] pl-2 pr-1.5 py-1 text-xs text-slate-200 shrink-0 max-w-56"
                    >
                      {att.previewDataUrl ? (
                        <img
                          src={att.previewDataUrl}
                          alt={att.name}
                          className="h-6 w-6 rounded object-cover shrink-0"
                        />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      )}
                      <span className="truncate">{att.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAttachments((prev) => prev.filter((p) => p.id !== att.id))
                        }
                        aria-label={`Remove ${att.name}`}
                        className="p-0.5 text-slate-400 hover:text-rose-300 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Message Input Bar — OS1 Rounded Pill Container */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendChatMessage();
                }}
                className="flex items-center gap-1 sm:gap-2 rounded-full border border-indigo-400/30 bg-[var(--bg-input)] backdrop-blur-md px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] shrink-0 transition-all focus-within:border-cyan-400/50 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.xml"
                  onChange={handleLocalFileSelect}
                  className="hidden"
                />

                {/* Attach Local Image / Document (Camera / Attachment Icon from OS1) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  title="Attach image or file"
                  aria-label="Attach image or file"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-cyan-300 hover:bg-white/5 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                >
                  <Camera className="w-4 h-4" />
                </button>

                {/* Free Plugins & Attachments Hub Trigger */}
                <button
                  type="button"
                  onClick={() => setShowPluginsModal(true)}
                  disabled={isStreaming}
                  title="Free Plugins & Attachments"
                  aria-label="Open Free Plugins and Attachments"
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    plugins.webSearch
                      ? 'text-cyan-300 bg-cyan-500/15'
                      : 'text-slate-400 hover:text-cyan-300 hover:bg-white/5'
                  }`}
                >
                  <Blocks className="w-4 h-4" />
                  {activePluginsCount > 1 && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  )}
                </button>

                {/* Center Input Field with 'talk or type to companion...' placeholder */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => {
                    setTimeout(() => {
                      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 120);
                  }}
                  maxLength={7900}
                  placeholder={
                    pendingAttachments.length > 0
                      ? 'add a note about your attachment...'
                      : 'talk or type to companion...'
                  }
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-base sm:text-sm text-white placeholder:text-slate-400/70 focus:outline-none font-normal"
                />

                {/* Magic Wand Draft Refiner */}
                <button
                  type="button"
                  onClick={handleEnhanceChatInput}
                  disabled={isEnhancingInput || isStreaming}
                  title="Tighten draft"
                  className="hidden xs:flex h-9 w-9 items-center justify-center rounded-full text-purple-300 hover:bg-purple-500/15 hover:text-purple-200 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                >
                  {isEnhancingInput ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                </button>

                {/* Voice Dictation Note Button */}
                <button
                  type="button"
                  onClick={handleToggleVoiceDictation}
                  disabled={isStreaming}
                  title={isRecordingNote ? 'Stop & Transcribe' : 'Dictate Voice Message'}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    isRecordingNote
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-400/50 animate-pulse'
                      : 'text-slate-400 hover:text-cyan-300 hover:bg-white/5'
                  }`}
                >
                  {isRecordingNote ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                {/* Quick Refresh Channel / Reconnect Button in Chat Input */}
                <button
                  type="button"
                  onClick={() => handleRefreshChannel(Boolean(activeError))}
                  disabled={isRefreshingChannel}
                  title={
                    activeError
                      ? 'Clear error & refresh channel'
                      : 'Refresh API connection & reset stuck state'
                  }
                  aria-label="Refresh API connection"
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    activeError
                      ? 'text-rose-300 bg-rose-500/20 hover:bg-rose-500/30'
                      : 'text-slate-400 hover:text-cyan-300 hover:bg-white/5'
                  }`}
                >
                  <RotateCcw
                    className={`w-4 h-4 ${
                      isRefreshingChannel ? 'animate-spin text-cyan-400' : ''
                    }`}
                  />
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={(!inputText.trim() && pendingAttachments.length === 0) || isStreaming}
                  aria-label="Send message to Companion"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-cta)] text-white shadow-[0_0_14px_var(--glow)] hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showPluginsModal && (
        <PluginsModal
          onAttachFile={(attachment) => {
            setPendingAttachments((prev) => [...prev, attachment].slice(0, 6));
            setActiveView('dashboard');
          }}
          onTriggerLocalUpload={() => fileInputRef.current?.click()}
          plugins={plugins}
          onTogglePlugin={handleTogglePlugin}
          onClose={() => setShowPluginsModal(false)}
        />
      )}
      {showProfileModal && (
        <ProfileModal
          profile={displayProfile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfileModal(false)}
          onOpenImport={() => {
            setShowProfileModal(false);
            setShowImportModal(true);
          }}
        />
      )}
      {showImportModal && (
        <ImportCompanionModal
          profile={displayProfile}
          existingMemories={memories}
          onImport={handleImportCompanion}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {renamingConv && (
        <RenameModal
          conversation={renamingConv}
          onConfirm={(title) => handleRenameConversation(renamingConv, title)}
          onCompanionSuggest={() => handleCompanionSuggestThreadTitle(renamingConv)}
          onClose={() => setRenamingConv(null)}
        />
      )}
      {renamingFile && (
        <FileRenameModal
          currentName={renamingFile.currentName}
          onConfirm={(newName) => handleConfirmRenameFile(renamingFile.assetId, newName)}
          onCompanionSuggest={() => handleCompanionSuggestFileName(renamingFile.assetId, renamingFile.currentName)}
          onClose={() => setRenamingFile(null)}
        />
      )}
      {showInstallModal && (
        <InstallGuideModal
          isIOS={isIOS}
          isInstalled={isInstalled}
          isInstallable={isInstallable}
          onInstall={install}
          onClose={() => setShowInstallModal(false)}
        />
      )}
      {showVideoModal && <VideoRoadmapModal onClose={() => setShowVideoModal(false)} />}
      {showSyncModal && (
        <SyncDevicesModal
          user={currentUser}
          isSyncing={isCloudSyncing}
          onSignInWithGoogle={handleSignInWithGoogleAction}
          onSignInWithEmail={handleSignInWithEmailAction}
          onSignUpWithEmail={handleSignUpWithEmailAction}
          onSignOut={handleSignOutAction}
          onForceSync={handleForceSync}
          lastSyncedAtMs={lastSyncedAtMs}
          lastSyncErrorMsg={lastSyncErrorMsg}
          onClose={() => setShowSyncModal(false)}
        />
      )}
      {showDateModal && (
        <DateHistoryModal
          isOpen={showDateModal}
          onClose={() => setShowDateModal(false)}
          messages={messages}
          onJumpToDate={handleJumpToDate}
          onFilterByDate={(dateKey) => setActiveFilterDate(dateKey)}
          activeFilterDate={activeFilterDate}
        />
      )}
      {showArchiveConfirm && (
        <ArchiveAllConfirmModal
          isOpen={showArchiveConfirm}
          onClose={() => setShowArchiveConfirm(false)}
          onConfirm={handleArchiveAllChats}
          messageCount={messages.length}
        />
      )}
      {showDeleteConfirm && (
        <DeleteAllConfirmModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteAllChats}
          messageCount={messages.length}
        />
      )}
      {showExportModal && (
        <ExportBackupModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          conversationsCount={conversations.length}
          messagesCount={messages.length}
          scrapbookCount={journalEntries.length}
          memoryCount={memories.length}
          imagesCount={creations.length}
          onExport={handleExportSession}
        />
      )}
    </div>
  );
}
