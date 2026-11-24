import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Calendar,
  Check,
  Cloud,
  Copy,
  Download,
  Filter,
  History,
  Images,
  Laptop,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  ActiveWorkspaceView,
  ChatMessage,
  ConversationItem,
  MemoryNode,
  UserProfile,
  VoicePreset,
} from '../types';
import { sanitizeVoicePreset, VALID_VOICE_PRESETS } from '../lib/helpers';
import {
  COMPANION_IMPORT_EXAMPLE,
  CompanionImportDraft,
  ImportedMemoryCandidate,
  parseCompanionImport,
} from '../lib/companionImport';
import { isStandalonePWA } from '../lib/storagePersistence';
import { UserAvatar } from './UserAvatar';

interface ProfileModalProps {
  profile: UserProfile;
  onSave: (updates: {
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
  }) => Promise<void>;
  onClose: () => void;
  /** Opens the easy Import flow (rendered by App alongside this modal). */
  onOpenImport?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ profile, onSave, onClose, onOpenImport }) => {
  const [callsign, setCallsign] = useState(profile.callsign);
  const [dynamicNotes, setDynamicNotes] = useState(profile.dynamicNotes);
  const [preferredVoice, setPreferredVoice] = useState<VoicePreset>(() =>
    sanitizeVoicePreset(profile.preferredVoice)
  );
  const [autoMessages, setAutoMessages] = useState(profile.autoMessages);
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(profile.autoSpeakReplies);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [companionName, setCompanionName] = useState(profile.companionName || '');
  const [companionPersonality, setCompanionPersonality] = useState(
    profile.companionPersonality || ''
  );
  const [companionGreeting, setCompanionGreeting] = useState(profile.companionGreeting || '');
  const [companionAvatarUrl, setCompanionAvatarUrl] = useState(profile.companionAvatarUrl || '');
  const [saving, setSaving] = useState(false);

  const handlePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setUrl: (url: string) => void = setAvatarUrl
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const encode = (maxSide: number, quality: number): string => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };
        // Keep the stored photo small enough to live inside the profile
        // (Firestore docs cap at ~1MB), retrying smaller if needed.
        let url = encode(512, 0.85);
        if (url.length > 700 * 1024) {
          url = encode(384, 0.7);
        }
        if (url) setUrl(url);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        callsign: callsign.trim() || 'Friend',
        dynamicNotes: dynamicNotes.trim(),
        preferredVoice,
        autoMessages,
        autoSpeakReplies,
        avatarUrl,
        companionName: companionName.trim(),
        companionPersonality: companionPersonality.trim(),
        companionGreeting: companionGreeting.trim(),
        companionAvatarUrl,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/35 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
          <h3 className="font-display text-base font-bold text-white">
            {profile.callsign}&apos;s Profile &amp; Voice Calibration
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Portrait Identity Card */}
        <div className="flex items-start gap-3.5 rounded-xl border border-indigo-400/25 bg-[#070b1e] p-3.5">
          <UserAvatar size="large" avatarUrl={avatarUrl} />
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-white truncate">{profile.callsign}</span>
              <span className="rounded-full bg-cyan-500/15 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                Human
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {dynamicNotes || profile.dynamicNotes || 'No bio saved yet.'}
            </p>
          </div>
        </div>

        {/* Profile Photo Picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">Profile photo</label>
          <div className="flex items-end gap-2.5">
            {(
              [
                { src: '/assets/guest_avatar.svg', label: 'Default' },
                { src: '/assets/companion_avatar.svg', label: 'Companion' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.src}
                type="button"
                onClick={() => setAvatarUrl(preset.src)}
                className="flex flex-col items-center gap-1 cursor-pointer"
              >
                <img
                  src={preset.src}
                  alt={preset.label}
                  className={`h-11 w-11 rounded-full object-cover ${
                    avatarUrl === preset.src
                      ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a102b]'
                      : 'ring-1 ring-indigo-400/40 hover:ring-cyan-300/70'
                  }`}
                />
                <span
                  className={`text-[10px] ${avatarUrl === preset.src ? 'text-cyan-300 font-semibold' : 'text-slate-400'}`}
                >
                  {preset.label}
                </span>
              </button>
            ))}
            {avatarUrl.startsWith('data:') && (
              <div className="flex flex-col items-center gap-1">
                <img
                  src={avatarUrl}
                  alt="Custom photo"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a102b]"
                />
                <span className="text-[10px] text-cyan-300 font-semibold">Custom</span>
              </div>
            )}
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-dashed ring-indigo-400/50 text-slate-300 hover:ring-cyan-300/70 hover:text-white">
                <Upload className="w-4 h-4" />
              </span>
              <span className="text-[10px] text-slate-400">Upload…</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">
              Your Callsign (the name your companion uses for you)
            </label>
            <input
              type="text"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              maxLength={40}
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">
              Bio
            </label>
            <textarea
              rows={3}
              value={dynamicNotes}
              onChange={(e) => setDynamicNotes(e.target.value)}
              maxLength={500}
              placeholder="e.g., Late-night builder, prefers direct answers, dry humor, and short replies..."
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] p-3 text-xs text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none resize-none"
            />
          </div>

          {/* Companion Identity — saved with the profile and sent to the
              server with every request, so edits apply on the next message
              with no code change or redeploy. */}
          <div className="space-y-3 rounded-xl border border-purple-400/25 bg-[#070b1e] p-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-300" />
              <span className="font-display text-sm font-bold text-white">Your Companion</span>
              <span className="rounded-full bg-purple-500/15 border border-purple-400/40 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                AI
              </span>
            </div>

            {/* Companion Portrait Picker (same shrink-to-fit upload as yours) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Companion portrait</label>
              <div className="flex items-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCompanionAvatarUrl('')}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <img
                    src="/assets/companion_avatar.svg"
                    alt="Default companion portrait"
                    className={`h-11 w-11 rounded-full object-cover ${
                      !companionAvatarUrl
                        ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0a102b]'
                        : 'ring-1 ring-indigo-400/40 hover:ring-purple-300/70'
                    }`}
                  />
                  <span
                    className={`text-[10px] ${!companionAvatarUrl ? 'text-purple-300 font-semibold' : 'text-slate-400'}`}
                  >
                    Default
                  </span>
                </button>
                {companionAvatarUrl.startsWith('data:') && (
                  <div className="flex flex-col items-center gap-1">
                    <img
                      src={companionAvatarUrl}
                      alt="Custom companion portrait"
                      className="h-11 w-11 rounded-full object-cover ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0a102b]"
                    />
                    <span className="text-[10px] text-purple-300 font-semibold">Custom</span>
                  </div>
                )}
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-dashed ring-indigo-400/50 text-slate-300 hover:ring-purple-300/70 hover:text-white">
                    <Upload className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] text-slate-400">Upload…</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, setCompanionAvatarUrl)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Companion name</label>
              <input
                type="text"
                value={companionName}
                onChange={(e) => setCompanionName(e.target.value)}
                maxLength={40}
                placeholder="Companion"
                className="w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Greeting</label>
              <input
                type="text"
                value={companionGreeting}
                onChange={(e) => setCompanionGreeting(e.target.value)}
                maxLength={300}
                placeholder="Shown on an empty chat instead of the default welcome line"
                className="w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Personality</label>
              <textarea
                rows={6}
                value={companionPersonality}
                onChange={(e) => setCompanionPersonality(e.target.value)}
                maxLength={4000}
                placeholder="Who your companion is, how they talk, what they care about — in your own words. Leave blank to keep the shell's generic default personality."
                className="w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] p-3 text-xs text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none resize-y"
              />
              <p className="text-[11px] text-slate-400 leading-snug">
                Changes apply on the next message — no restart or redeploy needed.
              </p>
            </div>

            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-purple-400/40 bg-purple-500/10 px-3 py-2.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/20 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import a companion — moving from another app?</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
              <span>Companion Vocal Engine (Live &amp; TTS)</span>
            </label>
            <select
              value={preferredVoice}
              onChange={(e) => setPreferredVoice(sanitizeVoicePreset(e.target.value))}
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
              aria-label="Companion voice"
            >
              {VALID_VOICE_PRESETS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 leading-snug">
              Pick any voice for live calls and read-aloud replies. You can change it any time — try a few and keep the one that sounds right for your companion.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
              <span>Auto-vocalize Companion&apos;s text replies</span>
              <input
                type="checkbox"
                checked={autoSpeakReplies}
                onChange={(e) => setAutoSpeakReplies(e.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
              <span>Autonomous idle check-in messages</span>
              <input
                type="checkbox"
                checked={autoMessages}
                onChange={(e) => setAutoMessages(e.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-indigo-400/30 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ImportCompanionModalProps {
  profile: UserProfile;
  existingMemories: MemoryNode[];
  onImport: (
    draft: CompanionImportDraft,
    selectedMemories: ImportedMemoryCandidate[]
  ) => Promise<void>;
  onClose: () => void;
}

/**
 * Easy companion import — paste or pick a file, check one review screen,
 * tap Import. Parsing lives in lib/companionImport.ts; applying goes
 * through App's normal profile/memory save paths, so an imported companion
 * is live in chat the moment this finishes.
 */
export const ImportCompanionModal: React.FC<ImportCompanionModalProps> = ({
  profile,
  existingMemories,
  onImport,
  onClose,
}) => {
  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');
  const [rawText, setRawText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Editable review state — snapshotted from the parse when Review opens.
  const [draftSnapshot, setDraftSnapshot] = useState<CompanionImportDraft>({});
  const [rName, setRName] = useState('');
  const [rGreeting, setRGreeting] = useState('');
  const [rPersonality, setRPersonality] = useState('');
  const [rCallsign, setRCallsign] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rVoice, setRVoice] = useState<VoicePreset>('Kore');
  const [candidates, setCandidates] = useState<ImportedMemoryCandidate[]>([]);
  const [importedName, setImportedName] = useState('');
  const [importedMemoryCount, setImportedMemoryCount] = useState(0);

  const existingFacts = useMemo(
    () => existingMemories.map((m) => m.fact),
    [existingMemories]
  );

  // Auto-detect as soon as there's text — no "parse" button to hunt for.
  const parseResult = useMemo(
    () => (rawText.trim() ? parseCompanionImport(rawText, existingFacts) : null),
    [rawText, existingFacts]
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      setFileError(
        "That file is too large to import here. Try copying its text and pasting it into the box instead."
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (!text.trim() || text.includes('\0')) {
        setFileError(
          "That file couldn't be read as text. Try a .txt, .md or .json file — or open it, copy the text, and paste it into the box."
        );
        return;
      }
      setFileError(null);
      setRawText(text);
    };
    reader.onerror = () => {
      setFileError(
        "That file couldn't be read. Try again, or paste the text into the box instead."
      );
    };
    reader.readAsText(file);
  };

  const handleCopyExample = async () => {
    try {
      await navigator.clipboard.writeText(COMPANION_IMPORT_EXAMPLE);
      setCopiedExample(true);
      setTimeout(() => setCopiedExample(false), 2000);
    } catch {
      // Clipboard unavailable (older browser) — the example is visible in
      // the <details> block below, so it can still be copied by hand.
    }
  };

  const openReview = () => {
    if (!parseResult || !parseResult.ok) return;
    const { draft, memories } = parseResult.parsed;
    setDraftSnapshot(draft);
    setRName(draft.companionName || '');
    setRGreeting(draft.companionGreeting || '');
    setRPersonality(draft.companionPersonality || '');
    setRCallsign(draft.callsign || '');
    setRNotes(draft.dynamicNotes || '');
    setRVoice(draft.preferredVoice || 'Kore');
    setCandidates(memories);
    setImportError(null);
    setStep('review');
  };

  const handleConfirm = async () => {
    // Blank review fields mean "leave my current value alone" — only what
    // the import actually provided (and the user kept) is applied.
    const finalDraft: CompanionImportDraft = {};
    if (draftSnapshot.companionName !== undefined && rName.trim()) {
      finalDraft.companionName = rName.trim();
    }
    if (draftSnapshot.companionGreeting !== undefined && rGreeting.trim()) {
      finalDraft.companionGreeting = rGreeting.trim();
    }
    if (draftSnapshot.companionPersonality !== undefined && rPersonality.trim()) {
      finalDraft.companionPersonality = rPersonality.trim();
    }
    if (draftSnapshot.callsign !== undefined && rCallsign.trim()) {
      finalDraft.callsign = rCallsign.trim();
    }
    if (draftSnapshot.dynamicNotes !== undefined && rNotes.trim()) {
      finalDraft.dynamicNotes = rNotes.trim();
    }
    if (draftSnapshot.preferredVoice !== undefined) {
      finalDraft.preferredVoice = rVoice;
    }
    if (draftSnapshot.companionAvatarUrl) {
      finalDraft.companionAvatarUrl = draftSnapshot.companionAvatarUrl;
    }
    const selected = candidates.filter((c) => c.selected);

    setImporting(true);
    setImportError(null);
    try {
      await onImport(finalDraft, selected);
      setImportedName(finalDraft.companionName || profile.companionName || '');
      setImportedMemoryCount(selected.length);
      setStep('done');
    } catch {
      setImportError(
        "Something went wrong while saving the import — nothing was changed. Please try once more."
      );
    } finally {
      setImporting(false);
    }
  };

  const toggleCandidate = (idx: number) => {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c))
    );
  };

  const inputFieldClass =
    'w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-purple-400/35 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
          <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300" />
            Import a Companion
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'input' && (
          <div className="space-y-3.5">
            <p className="text-xs text-slate-300 leading-relaxed">
              Already have a companion somewhere else? Paste their profile,
              character card, or memory notes below — or pick the file — and
              we&apos;ll sort it into the right places. Nothing changes until
              you&apos;ve checked the next screen.
            </p>

            <textarea
              rows={9}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste a companion profile, character card, or memory notes here…"
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] p-3 text-xs text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none resize-y"
            />

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 rounded-xl border border-indigo-400/30 px-3.5 py-2 text-xs font-medium text-slate-200 hover:text-white cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose a file (.txt, .md, .json)</span>
                <input
                  type="file"
                  accept=".txt,.md,.json,text/plain,application/json"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
              {parseResult?.ok && (
                <span className="rounded-full bg-purple-500/15 border border-purple-400/40 px-2.5 py-1 text-[11px] font-medium text-purple-200">
                  {parseResult.parsed.kind === 'json'
                    ? `Saved profile found — ${Object.keys(parseResult.parsed.draft).length} profile fields, ${parseResult.parsed.memories.length} memories`
                    : `Notes found — personality + ${parseResult.parsed.memories.length} memory lines pulled out`}
                </span>
              )}
            </div>

            {fileError && (
              <p className="flex items-start gap-1.5 text-xs text-amber-300 leading-snug">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{fileError}</span>
              </p>
            )}
            {parseResult && !parseResult.ok && (
              <p className="flex items-start gap-1.5 text-xs text-amber-300 leading-snug">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{parseResult.error}</span>
              </p>
            )}

            <details className="rounded-xl border border-indigo-400/20 bg-[#070b1e] p-3">
              <summary className="text-xs font-medium text-slate-200 cursor-pointer">
                See the tidy format (optional — messy notes work too)
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">
                {COMPANION_IMPORT_EXAMPLE}
              </pre>
              <button
                type="button"
                onClick={handleCopyExample}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-indigo-400/30 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:text-white cursor-pointer"
              >
                {copiedExample ? (
                  <Check className="w-3 h-3 text-emerald-300" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedExample ? 'Copied!' : 'Copy example'}</span>
              </button>
            </details>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-indigo-400/30 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openReview}
                disabled={!parseResult?.ok}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-45 cursor-pointer"
              >
                <span>Review import</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3.5">
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-3 text-[11px] text-slate-300 leading-relaxed">
              Importing fills in the fields below — replacing what&apos;s there
              now — and adds the ticked memories to your Memory Vault.{' '}
              <span className="text-slate-100 font-medium">
                Nothing is ever deleted.
              </span>{' '}
              Clear a field to leave your current value alone.
            </div>

            {draftSnapshot.companionName !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Companion name</label>
                <input
                  type="text"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  maxLength={40}
                  className={inputFieldClass}
                />
              </div>
            )}

            {draftSnapshot.companionGreeting !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Greeting</label>
                <input
                  type="text"
                  value={rGreeting}
                  onChange={(e) => setRGreeting(e.target.value)}
                  maxLength={300}
                  className={inputFieldClass}
                />
              </div>
            )}

            {draftSnapshot.companionPersonality !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Personality</label>
                <textarea
                  rows={6}
                  value={rPersonality}
                  onChange={(e) => setRPersonality(e.target.value)}
                  maxLength={4000}
                  className="w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] p-3 text-xs text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none resize-y"
                />
              </div>
            )}

            {draftSnapshot.companionAvatarUrl && (
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <img
                  src={draftSnapshot.companionAvatarUrl}
                  alt="Imported companion portrait"
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-purple-400/50"
                />
                <span>A portrait came with this import — it will replace the current one.</span>
              </div>
            )}

            {draftSnapshot.callsign !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">
                  Your callsign (what they call you)
                </label>
                <input
                  type="text"
                  value={rCallsign}
                  onChange={(e) => setRCallsign(e.target.value)}
                  maxLength={40}
                  className={inputFieldClass}
                />
              </div>
            )}

            {draftSnapshot.dynamicNotes !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">About you (bio)</label>
                <textarea
                  rows={3}
                  value={rNotes}
                  onChange={(e) => setRNotes(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-xl border border-indigo-400/35 bg-[#0a102b] p-3 text-xs text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none resize-none"
                />
              </div>
            )}

            {draftSnapshot.preferredVoice !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Voice</label>
                <select
                  value={rVoice}
                  onChange={(e) => setRVoice(sanitizeVoicePreset(e.target.value))}
                  className={`${inputFieldClass} cursor-pointer`}
                  aria-label="Imported companion voice"
                >
                  {VALID_VOICE_PRESETS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {Object.keys(draftSnapshot).length === 0 && (
              <p className="text-xs text-slate-400">
                No profile fields came with this import — only memories below.
                Your current profile stays exactly as it is.
              </p>
            )}

            {candidates.length > 0 && (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                  <BrainCircuit className="w-3.5 h-3.5 text-cyan-300" />
                  <span>
                    Memories to add ({candidates.filter((c) => c.selected).length} of{' '}
                    {candidates.length} ticked)
                  </span>
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {candidates.map((c, idx) => (
                    <label
                      key={`${idx}-${c.fact.slice(0, 24)}`}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                        c.selected
                          ? 'border-purple-400/35 bg-purple-500/10'
                          : 'border-indigo-400/15 bg-[#070b1e] opacity-70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleCandidate(idx)}
                        className="mt-0.5 h-3.5 w-3.5 accent-purple-500 cursor-pointer shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-100 leading-snug">{c.fact}</span>
                        {c.isDuplicate && (
                          <span className="mt-0.5 inline-block rounded-full bg-slate-500/20 border border-slate-400/30 px-1.5 py-0.5 text-[10px] text-slate-300">
                            Already in your Memory Vault
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {importError && (
              <p className="flex items-start gap-1.5 text-xs text-amber-300 leading-snug">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </p>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('input')}
                className="rounded-xl border border-indigo-400/30 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={importing}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-45 cursor-pointer"
              >
                {importing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{importing ? 'Moving in…' : 'Import — move them in'}</span>
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/40">
              <Check className="w-6 h-6 text-emerald-300" />
            </div>
            <div className="space-y-1.5">
              <p className="font-display text-base font-bold text-white">
                {importedName ? `${importedName} has moved in` : 'Your companion has moved in'}
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {importedMemoryCount > 0
                  ? `${importedMemoryCount} ${importedMemoryCount === 1 ? 'memory' : 'memories'} added to the Memory Vault. `
                  : ''}
                Say hello in Chat — they&apos;re live right now.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
            >
              Go to Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface RenameModalProps {
  conversation: ConversationItem;
  onConfirm: (newTitle: string) => Promise<void>;
  onCompanionSuggest?: () => Promise<string>;
  onClose: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  conversation,
  onConfirm,
  onCompanionSuggest,
  onClose,
}) => {
  const [title, setTitle] = useState(conversation.title);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleCompanionSuggest = async () => {
    if (!onCompanionSuggest) return;
    setIsSuggesting(true);
    try {
      const suggested = await onCompanionSuggest();
      if (suggested && suggested.trim()) {
        setTitle(suggested.trim());
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onConfirm(title.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-cyan-400/35 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-white">Rename Conversation</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoFocus
          className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
        />

        {onCompanionSuggest && (
          <button
            type="button"
            onClick={handleCompanionSuggest}
            disabled={isSuggesting}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-900/40 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${isSuggesting ? 'animate-spin' : ''}`} />
            <span>{isSuggesting ? 'Companion is analyzing thread...' : 'Companion Suggest Title'}</span>
          </button>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-indigo-400/30 px-3.5 py-1.5 text-xs text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

interface FileRenameModalProps {
  currentName: string;
  onConfirm: (newName: string) => Promise<void>;
  onCompanionSuggest?: () => Promise<string>;
  onClose: () => void;
}

export const FileRenameModal: React.FC<FileRenameModalProps> = ({
  currentName,
  onConfirm,
  onCompanionSuggest,
  onClose,
}) => {
  const [fileName, setFileName] = useState(currentName);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCompanionSuggest = async () => {
    if (!onCompanionSuggest) return;
    setIsSuggesting(true);
    try {
      const suggested = await onCompanionSuggest();
      if (suggested && suggested.trim()) {
        setFileName(suggested.trim());
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;
    setSaving(true);
    try {
      await onConfirm(fileName.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-cyan-400/35 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-white">Rename Chat Thread File</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-slate-300">
          Rename this file across your cloud-synced thread storage.
        </p>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          maxLength={120}
          autoFocus
          className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
        />

        {onCompanionSuggest && (
          <button
            type="button"
            onClick={handleCompanionSuggest}
            disabled={isSuggesting}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-900/40 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${isSuggesting ? 'animate-spin' : ''}`} />
            <span>{isSuggesting ? 'Companion is generating name...' : 'Ask Companion to Rename File'}</span>
          </button>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-indigo-400/30 px-3.5 py-1.5 text-xs text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer disabled:opacity-50"
          >
            Save File Name
          </button>
        </div>
      </form>
    </div>
  );
};

interface InstallGuideModalProps {
  isIOS: boolean;
  isInstalled: boolean;
  isInstallable?: boolean;
  onInstall?: () => void;
  onClose: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({
  isIOS,
  isInstalled,
  isInstallable,
  onInstall,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'apple'>(isIOS ? 'apple' : 'android');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
          <div className="flex items-center gap-2 text-cyan-300">
            <Download className="w-5 h-5" />
            <h3 className="font-display text-base font-bold text-white">
              Install Companion Standalone App
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#060a1e] p-1 border border-indigo-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android / Chrome</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apple')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'apple'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Apple iOS / iPad</span>
          </button>
        </div>

        {isInstalled ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-3.5 text-xs text-emerald-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Standalone App Active</span>
            </div>
            <p className="text-[11px] text-emerald-200/80 leading-relaxed">
              Companion is installed and running in dedicated standalone mode with persistent storage enabled.
            </p>
          </div>
        ) : activeTab === 'android' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              Optimized for Android smartphones, tablets, and Chromebooks. Runs in borderless standalone display mode with zero browser chrome and instant home-screen launch.
            </p>

            {isInstallable && onInstall && (
              <button
                type="button"
                onClick={() => {
                  onInstall();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>1-Tap Install on Android Device</span>
              </button>
            )}

            <div className="rounded-xl border border-indigo-400/25 bg-[#070b1e] p-3 text-xs text-slate-300 space-y-2">
              <div className="font-semibold text-cyan-300">How to install via Android Chrome:</div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-200 text-[11px]">
                <li>Tap the three vertical dots (menu) in top right of Chrome.</li>
                <li>Tap <strong className="text-white">Install app</strong> or <strong className="text-white">Add to Home screen</strong>.</li>
                <li>Tap <strong className="text-white">Install</strong> to confirm. Companion will appear on your Android home screen.</li>
                <li><strong className="text-emerald-300">Homepage Widget:</strong> Long-press the Companion home screen icon to reveal and drag the 1-tap <strong className="text-white">Voice Link, Chat, Scrapbook, or Studio</strong> widgets directly to your home screen!</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              Optimized for Apple iPhone &amp; iPad Safari as a full-screen Web App with black-translucent status bar and touch icon.
            </p>

            <div className="rounded-xl border border-indigo-400/25 bg-[#070b1e] p-3 text-xs text-slate-300 space-y-2">
              <div className="font-semibold text-purple-300">How to install on iPhone &amp; iPad:</div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-200 text-[11px]">
                <li>Open this site directly in Apple Safari.</li>
                <li>Tap the <strong className="text-white">Share</strong> icon (square with arrow pointing up) in the Safari bottom bar.</li>
                <li>Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.</li>
                <li>Tap <strong className="text-white">Add</strong> in the top-right corner.</li>
              </ol>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-2.5 text-[11px] text-cyan-200/90 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Cloud-First Hydration:</strong> Even if iOS or Android resets local app cache, your chat history, memories, and journal are safeguarded in the cloud and restored upon launch.
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-indigo-600/80 hover:bg-indigo-600 py-2 text-xs font-semibold text-white transition-all cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};


export const VideoRoadmapModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
    <div className="w-full max-w-sm rounded-2xl border border-indigo-400/35 bg-[var(--bg-input)] p-5 shadow-2xl space-y-3.5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-purple-300">
          <Video className="w-4 h-4" />
          <h3 className="font-display text-sm font-bold text-white">
            Video Call · Future Update
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        Full-frame neural Live2D / 3D spatial video streaming with synchronized eye-tracking and camera grounding is scheduled for the upcoming Video Link module.
      </p>
      <div className="rounded-xl border border-cyan-400/25 bg-[#070b1e] p-3 text-xs text-cyan-200 flex items-start gap-2">
        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Companion&apos;s HUD Portrait already features real-time vocal lip-sync and natural blinking during Voice Calls and TTS playback.
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
      >
        Back to Dashboard
      </button>
    </div>
  </div>
);

interface SyncDevicesModalProps {
  user: User | null;
  isSyncing: boolean;
  onSignInWithGoogle: () => Promise<void>;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignUpWithEmail: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onForceSync?: () => Promise<void>;
  lastSyncedAtMs?: number | null;
  lastSyncErrorMsg?: string | null;
  onClose: () => void;
}

export const SyncDevicesModal: React.FC<SyncDevicesModalProps> = ({
  user,
  isSyncing,
  onSignInWithGoogle,
  onSignInWithEmail,
  onSignUpWithEmail,
  onSignOut,
  onForceSync,
  lastSyncedAtMs,
  lastSyncErrorMsg,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Turn Firebase's cryptic error codes into plain, friendly sentences.
  const friendlyAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (msg.includes('auth/operation-not-allowed')) {
      return "Email login isn't switched on yet in the Firebase console (Authentication \u2192 Sign-in method \u2192 Email/Password).";
    }
    if (
      msg.includes('auth/invalid-credential') ||
      msg.includes('auth/wrong-password') ||
      msg.includes('auth/user-not-found')
    ) {
      return "That email and password don't match an account. Check them and try again \u2014 or use Create account if you're new here.";
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'That email already has an account. Use Sign in instead.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'That password is too short \u2014 Firebase needs at least 6 characters.';
    }
    if (msg.includes('auth/invalid-email')) {
      return "That doesn't look like a complete email address.";
    }
    if (msg.includes('auth/too-many-requests')) {
      return 'Too many tries in a row \u2014 Firebase is making us wait a bit. Try again in a few minutes.';
    }
    return msg || 'Sign-in failed. Please retry.';
  };

  const handleEmailClick = async (mode: 'signin' | 'signup') => {
    const email = emailInput.trim();
    if (!email || !passwordInput) {
      setErrorMsg('Type your email and a password first.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      if (mode === 'signin') {
        await onSignInWithEmail(email, passwordInput);
      } else {
        await onSignUpWithEmail(email, passwordInput);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const isGoogleLinked = user && !user.isAnonymous && user.email;

  const handleGoogleClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onSignInWithGoogle();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onSignOut();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-out failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForceSyncClick = async () => {
    if (!onForceSync) return;
    setErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      await onForceSync();
      setSyncSuccessMsg('Both devices in sync · All data updated');
      setTimeout(() => setSyncSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync failed. Please retry.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
          <div className="flex items-center gap-2 text-cyan-300">
            <Cloud className="w-5 h-5" />
            <h3 className="font-display text-base font-bold text-white">
              Cross-Device Session Sync
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Sync your conversations with Companion, long-term memory vault, and image gallery across your phone, tablet, and desktop browsers so your companion stays identical on both devices.
        </p>

        {/* Sync Status Badge */}
        <div className="rounded-xl border border-indigo-400/25 bg-[#070b1e] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">Current Device Status:</span>
              {isGoogleLinked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300 border border-emerald-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Cloud Synced
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Local Guest Session
                </span>
              )}
            </div>
            {isSyncing && (
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            )}
          </div>

          {isGoogleLinked ? (
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                All messages, memories, and gallery images are stored in Cloud Firestore and sync live to any device where you sign into this account.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Connect your Google account with 1 click to save your ongoing chats and memories to the cloud so they are accessible on any other phone or browser.
            </p>
          )}
        </div>

        {/* Last sync read problem (surfaced instead of silently swallowed) */}
        {lastSyncErrorMsg && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-300">
            Last sync problem: {lastSyncErrorMsg}
          </p>
        )}

        {/* Two-Way Force Sync Card (Shown when Google is linked) */}
        {isGoogleLinked && (
          <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-indigo-950/50 to-purple-950/40 p-3.5 space-y-2.5 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Two-Way Force Sync</span>
              </div>
              {lastSyncedAtMs ? (
                <span className="text-[10px] text-slate-400 font-mono">
                  Last: {new Date(lastSyncedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Hit this on either device to immediately upload all local messages, memories, and journal entries to the cloud and download any new content from your other device.
            </p>
            <button
              type="button"
              onClick={handleForceSyncClick}
              disabled={isSyncing || loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-950/50 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing Both Devices...' : 'Force Sync Both Devices Now'}</span>
            </button>
          </div>
        )}

        {/* Device Sync Features Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-[#0c1230] p-2">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Mobile Phone Ready</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-[#0c1230] p-2">
            <Laptop className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Desktop &amp; Laptop</span>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-2.5 text-xs text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {!isGoogleLinked ? (
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-lg shadow-purple-900/30"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{loading ? 'Connecting Google Account...' : 'Sign In with Google to Sync Devices'}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSignOutClick}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect Account</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Home-screen (standalone) heads-up: Google's sign-in pop-up cannot
            complete inside an installed app on iPhone, so point them at the
            email login, which works in this container. */}
        {!isGoogleLinked && isStandalonePWA() && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            You&apos;re in the home-screen app — Google sign-in can&apos;t finish in
            here (its pop-up window is blocked), so use the email login below.
            It signs you into the same account and syncs the same data.
          </p>
        )}

        {/* Companion's own login: email + password (only shown while signed out) */}
        {!isGoogleLinked && (
          <div className="space-y-2 border-t border-indigo-500/20 pt-3">
            <p className="text-center text-[11px] font-medium text-slate-300">
              …or use Companion&apos;s own login — no Google account needed
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-indigo-400/35 bg-[#070b1e] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleEmailClick('signin')}
                disabled={loading}
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 py-2.5 text-xs font-semibold text-white hover:brightness-110 cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Working\u2026' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => void handleEmailClick('signup')}
                disabled={loading}
                className="flex-1 rounded-xl border border-indigo-400/40 bg-[#0e163b] py-2.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer disabled:opacity-50"
              >
                Create account
              </button>
            </div>
            <p className="text-center text-[10px] leading-relaxed text-slate-500">
              New here? Create the account once, then sign in with the same email on your other device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// CHAT HISTORY BY DATE MODAL
// ==========================================
interface DateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onJumpToDate: (dateKey: string) => void;
  onFilterByDate: (dateKey: string | null) => void;
  activeFilterDate: string | null;
}

export const DateHistoryModal: React.FC<DateHistoryModalProps> = ({
  isOpen,
  onClose,
  messages,
  onJumpToDate,
  onFilterByDate,
  activeFilterDate,
}) => {
  const [customDate, setCustomDate] = useState<string>('');

  // Group messages by local calendar date (YYYY-MM-DD)
  const dateGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        formattedLabel: string;
        count: number;
        firstMsgTime: string;
        lastMsgTime: string;
        preview: string;
      }
    >();

    const todayKey = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayKey = yesterday.toISOString().split('T')[0];

    messages.forEach((msg) => {
      const d = new Date(msg.createdAtMs);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;

      let label = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      if (key === todayKey) {
        label = `Today · ${label}`;
      } else if (key === yesterdayKey) {
        label = `Yesterday · ${label}`;
      }

      const existing = map.get(key);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const snippet = msg.content.slice(0, 75).trim();

      if (!existing) {
        map.set(key, {
          dateKey: key,
          formattedLabel: label,
          count: 1,
          firstMsgTime: timeStr,
          lastMsgTime: timeStr,
          preview: snippet,
        });
      } else {
        existing.count++;
        existing.lastMsgTime = timeStr;
        if (snippet) existing.preview = snippet;
      }
    });

    // Sort dates descending (most recent first)
    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [messages]);

  if (!isOpen) return null;

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDate) return;
    onJumpToDate(customDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-400/40 bg-[var(--bg-panel)] p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-white">
                Find Chat History by Date
              </h3>
              <p className="text-[11px] text-slate-400">
                Browse or jump directly to messages from any day in your ongoing chat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Date Picker Input */}
        <form
          onSubmit={handleCustomDateSubmit}
          className="flex items-center gap-2 p-2.5 rounded-xl border border-indigo-500/25 bg-[#0d1438] shrink-0"
        >
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none cursor-pointer [color-scheme:dark]"
          />
          <button
            type="submit"
            disabled={!customDate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Jump to Date</span>
          </button>
        </form>

        {/* Filter State Banner if currently filtered */}
        {activeFilterDate && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-400/40 text-xs text-cyan-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">
                Currently filtered to <strong>{activeFilterDate}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onFilterByDate(null);
                onClose();
              }}
              className="text-[11px] font-semibold text-cyan-300 hover:underline shrink-0 cursor-pointer"
            >
              Show All Messages
            </button>
          </div>
        )}

        {/* Dates Index List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {dateGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No chat messages recorded yet.
            </div>
          ) : (
            dateGroups.map((group) => {
              const isFiltered = activeFilterDate === group.dateKey;
              return (
                <div
                  key={group.dateKey}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border transition-all ${
                    isFiltered
                      ? 'border-cyan-400/60 bg-cyan-950/30'
                      : 'border-indigo-500/20 bg-[#0d1438] hover:border-indigo-400/40'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white font-mono">
                        {group.formattedLabel}
                      </span>
                      <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.2 text-[10px] font-medium text-cyan-300">
                        {group.count} {group.count === 1 ? 'msg' : 'msgs'}
                      </span>
                    </div>
                    {group.preview && (
                      <p className="text-[11px] text-slate-400 truncate max-w-sm">
                        &quot;{group.preview}&quot;
                      </p>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono">
                      {group.firstMsgTime} &ndash; {group.lastMsgTime}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToDate(group.dateKey);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-cyan-400/35 bg-[#121c4b] text-cyan-200 hover:bg-cyan-500/20 hover:border-cyan-400 text-xs font-medium transition-colors cursor-pointer"
                    >
                      <span>Jump</span>
                      <ArrowRight className="w-3 h-3 text-cyan-300" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFilterByDate(isFiltered ? null : group.dateKey);
                        onClose();
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        isFiltered
                          ? 'border-indigo-400/40 bg-indigo-900/40 text-slate-200 hover:bg-indigo-900/60'
                          : 'border-indigo-500/30 bg-[#0c1230] text-slate-300 hover:text-white'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      <span>{isFiltered ? 'Reset' : 'Filter'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-indigo-500/20 pt-3 text-xs text-slate-400 shrink-0">
          <span>{messages.length} total messages in channel</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-indigo-500/30 text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// ARCHIVE ALL CONFIRM MODAL
// ==========================================
interface ArchiveAllConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  messageCount: number;
}

export const ArchiveAllConfirmModal: React.FC<ArchiveAllConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  messageCount,
}) => {
  const [archiving, setArchiving] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setArchiving(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-indigo-400/40 bg-[var(--bg-input)] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-indigo-500/20 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 shrink-0">
            <Archive className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-white">
              Archive Active Chat Channel?
            </h3>
            <p className="text-[11px] text-slate-400">
              Preserves memories and journal chronicles before resetting
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-[#060a1d] p-3.5 rounded-xl border border-indigo-500/20">
          <p>
            You are about to archive <strong>{messageCount}</strong> messages from this channel.
          </p>
          <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
            <li>
              Companion will summarize and lock all key highlights into your permanent{' '}
              <strong className="text-cyan-300">Memory Vault</strong>.
            </li>
            <li>
              A permanent chronicle of this channel session will be saved in{' '}
              <strong className="text-cyan-300">Companion&apos;s Journal</strong>.
            </li>
            <li>
              The active stream will restart clean and fresh with Companion ready for your next conversation.
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={archiving}
            className="px-3.5 py-2 rounded-xl border border-indigo-500/30 text-xs text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={archiving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-xs font-semibold text-white shadow-lg shadow-indigo-950/60 hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {archiving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Archiving Stream...</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span>Archive &amp; Start Fresh</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// DELETE ALL CONFIRM MODAL
// ==========================================
interface DeleteAllConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  messageCount: number;
}

export const DeleteAllConfirmModal: React.FC<DeleteAllConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  messageCount,
}) => {
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/50 bg-[#0d0714] p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-rose-500/20 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-white">
              Delete All Chat Messages?
            </h3>
            <p className="text-[11px] text-rose-300/80">
              Permanent purge of active channel message history
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-[#140b1e] p-3.5 rounded-xl border border-rose-500/30">
          <p className="text-rose-200 font-semibold">
            Warning: This action is permanent and cannot be undone.
          </p>
          <p className="text-[11px] text-slate-300">
            All <strong>{messageCount}</strong> messages in this chat will be completely removed from your local storage and wiped from Cloud Firestore.
          </p>
          <div className="rounded-lg bg-emerald-950/40 border border-emerald-400/30 p-2 text-[11px] text-emerald-200">
            ✓ Your <strong>Memory Vault</strong>, <strong>Companion&apos;s Journal</strong>, and <strong>Gallery Images</strong> will remain 100% safe and intact.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-950/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            {deleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting Messages...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete All Messages</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// SYSTEM MODULES & NAVIGATION DRAWER (NO CHAT THREADS)
// ==========================================
interface ModuleNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveWorkspaceView;
  onSelectView: (view: ActiveWorkspaceView) => void;
  journalCount: number;
  galleryCount: number;
  memoryCount: number;
  onOpenProfile: () => void;
  onOpenSync: () => void;
  onOpenPlugins: () => void;
  onExportSession: () => void;
  onImportSession: (file: File) => void;
  isOnline: boolean;
  profileCallsign: string;
}

export const ModuleNavDrawer: React.FC<ModuleNavDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  journalCount,
  galleryCount,
  memoryCount,
  onOpenProfile,
  onOpenSync,
  onOpenPlugins,
  onExportSession,
  onImportSession,
  isOnline,
  profileCallsign,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <aside
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)',
        }}
        className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--border-panel)] bg-[var(--bg-raised)] pt-safe shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-500/20 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
            <span className="font-display text-sm font-bold tracking-wide text-white">
              COMPANION ECOSYSTEM
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspaces List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
            Workspaces &amp; Tools
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectView('dashboard');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'dashboard'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Direct Ongoing Chat</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Live</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('journal');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'journal'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>Companion&apos;s Journal</span>
            </div>
            <span className="text-[10px] rounded-full bg-indigo-500/25 px-2 py-0.5 text-cyan-300 font-mono">
              {journalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('memory');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'memory'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BrainCircuit className="w-4 h-4 text-purple-400" />
              <span>Memory Vault</span>
            </div>
            <span className="text-[10px] rounded-full bg-indigo-500/25 px-2 py-0.5 text-purple-300 font-mono">
              {memoryCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('image_studio');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'image_studio'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Palette className="w-4 h-4 text-emerald-400" />
              <span>Image Studio</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('gallery');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'gallery'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Images className="w-4 h-4 text-pink-400" />
              <span>Visual Gallery</span>
            </div>
            <span className="text-[10px] rounded-full bg-indigo-500/25 px-2 py-0.5 text-pink-300 font-mono">
              {galleryCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('creative_room');
              onClose();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'creative_room'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Video className="w-4 h-4 text-rose-300" />
              <span>Creative Room</span>
            </div>
            <span className="text-[10px] text-rose-300 font-mono">ON AIR</span>
          </button>

          <div className="pt-3 px-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
            System &amp; Settings
          </div>

          <button
            type="button"
            onClick={() => {
              onOpenSync();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-cyan-300" />
            <span>Cross-Device Cloud Sync</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('system');
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Palette className="w-4 h-4 text-cyan-300" />
            <span>Appearance &amp; Theme</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenProfile();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Settings className="w-4 h-4 text-indigo-300" />
            <span>User</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenPlugins();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Search &amp; Knowledge Plugins</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onExportSession();
              onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Export Ecosystem Backup</span>
            </div>
            <span className="text-[10px] text-cyan-300 font-mono">Chat · Scrapbook · Memory</span>
          </button>
        </div>

        {/* Footer */}
        <div className="border-t border-indigo-500/20 p-3 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isOnline ? 'Direct Link Active' : 'Offline Cache'}</span>
          </div>
          <span className="font-mono text-[10px]">v3.2</span>
        </div>
      </aside>
    </>
  );
};

export interface ExportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationsCount: number;
  messagesCount: number;
  scrapbookCount: number;
  memoryCount: number;
  imagesCount: number;
  onExport: (options: {
    includeChat: boolean;
    includeScrapbook: boolean;
    includeMemory: boolean;
    includeImages: boolean;
  }) => Promise<void> | void;
}

export const ExportBackupModal: React.FC<ExportBackupModalProps> = ({
  isOpen,
  onClose,
  conversationsCount,
  messagesCount,
  scrapbookCount,
  memoryCount,
  imagesCount,
  onExport,
}) => {
  const [includeChat, setIncludeChat] = useState(true);
  const [includeScrapbook, setIncludeScrapbook] = useState(true);
  const [includeMemory, setIncludeMemory] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExportClick = async () => {
    setIsExporting(true);
    try {
      await onExport({
        includeChat,
        includeScrapbook,
        includeMemory,
        includeImages,
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const hasAtLeastOne = includeChat || includeScrapbook || includeMemory || includeImages;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-indigo-500/30 bg-[var(--bg-input)] p-5 sm:p-6 shadow-2xl text-slate-100 space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-white">
                Export Ecosystem Backup
              </h3>
              <p className="text-xs text-slate-400">
                Package chat history, scrapbook entries, memory vault &amp; images into a portable bundle.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Selection */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">Select components to include:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIncludeChat(true);
                  setIncludeScrapbook(true);
                  setIncludeMemory(true);
                  setIncludeImages(true);
                }}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                Select All
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {/* 1. Chat History */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                includeChat
                  ? 'border-cyan-500/40 bg-cyan-950/25 text-white'
                  : 'border-indigo-500/15 bg-[#060a20] text-slate-400 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={includeChat}
                onChange={(e) => setIncludeChat(e.target.checked)}
                className="mt-0.5 rounded border-indigo-400/40 bg-[#0c1236] text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-100">Chat History &amp; Messages</span>
                  <span className="rounded bg-cyan-500/15 border border-cyan-400/30 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                    {conversationsCount} convs · {messagesCount} msgs
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  All ongoing conversations, messages, timestamps, and model thought streams.
                </p>
              </div>
            </label>

            {/* 2. Scrapbook Entries */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                includeScrapbook
                  ? 'border-emerald-500/40 bg-emerald-950/25 text-white'
                  : 'border-indigo-500/15 bg-[#060a20] text-slate-400 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={includeScrapbook}
                onChange={(e) => setIncludeScrapbook(e.target.checked)}
                className="mt-0.5 rounded border-indigo-400/40 bg-[#0c1236] text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-100">Companion&apos;s Scrapbook (Daily Journal)</span>
                  <span className="rounded bg-emerald-500/15 border border-emerald-400/30 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                    {scrapbookCount} entries
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Autonomous daily reflections, contemplative logs, mood records, and tagged scrapbook chronicles.
                </p>
              </div>
            </label>

            {/* 3. Memory Vault */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                includeMemory
                  ? 'border-purple-500/40 bg-purple-950/25 text-white'
                  : 'border-indigo-500/15 bg-[#060a20] text-slate-400 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={includeMemory}
                onChange={(e) => setIncludeMemory(e.target.checked)}
                className="mt-0.5 rounded border-indigo-400/40 bg-[#0c1236] text-purple-500 focus:ring-0 cursor-pointer"
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-100">Memory Vault Facts</span>
                  <span className="rounded bg-purple-500/15 border border-purple-400/30 px-1.5 py-0.5 text-[10px] font-mono text-purple-300">
                    {memoryCount} facts
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Long-term durable memories, directives, user preferences, and shared history nodes.
                </p>
              </div>
            </label>

            {/* 4. Visual Gallery & Images */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                includeImages
                  ? 'border-pink-500/40 bg-pink-950/25 text-white'
                  : 'border-indigo-500/15 bg-[#060a20] text-slate-400 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                className="mt-0.5 rounded border-indigo-400/40 bg-[#0c1236] text-pink-500 focus:ring-0 cursor-pointer"
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-100">Visual Gallery Artwork &amp; Images</span>
                  <span className="rounded bg-pink-500/15 border border-pink-400/30 px-1.5 py-0.5 text-[10px] font-mono text-pink-300">
                    {imagesCount} artworks
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Rendered Studio artwork, cyber-vector synth imagery, and image data URLs.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Security & Restore Notice */}
        <div className="rounded-xl border border-indigo-400/20 bg-[#06091e] p-3 text-[11px] text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Cross-Device Compatibility</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            The exported file can be imported into Companion on any phone, tablet, or browser to restore your chat history, scrapbook, and memories seamlessly.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-indigo-500/20">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-indigo-400/30 bg-[#0c1230] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExportClick}
            disabled={!hasAtLeastOne || isExporting}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-cyan-600 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Exporting Bundle...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download Backup (.json)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};



