import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  Images,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  Wand2,
  Zap,
} from 'lucide-react';
import { FREE_TIER_GEMINI_MODELS } from '../lib/models';
import {
  ActiveWorkspaceView,
  GeminiModelId,
  MemoryNode,
  SystemErrorLog,
  UserPresence,
  VitalsState,
} from '../types';
import { CompanionAvatar } from './CompanionAvatar';
import { UserAvatar } from './UserAvatar';
import { CompanionSystemMonitor } from './CompanionSystemMonitor';
import { UserStatusBar } from './UserStatusBar';

interface VitalsHudProps {
  vitals: VitalsState;
  isStreaming: boolean;
  activeView: ActiveWorkspaceView;
  onSelectView: (view: ActiveWorkspaceView) => void;
  selectedModel: GeminiModelId;
  activeModelUsed: GeminiModelId | null;
  onSelectModel: (model: GeminiModelId) => void;
  callState: 'idle' | 'connecting' | 'active' | 'error';
  callSeconds: number;
  isMicMuted: boolean;
  onToggleMute: () => void;
  onToggleVoiceCall: () => void;
  onOpenVideoRoadmap: () => void;
  companionVocalLevel: number;
  userMicLevel: number;
  memoryCount: number;
  memories?: MemoryNode[];
  creationsCount?: number;
  journalCount?: number;
  userPresence?: UserPresence;
  onUpdateUserPresence?: (updates: Partial<UserPresence>) => void;
  userCallsign?: string;
  userAvatarUrl?: string;
  companionName?: string;
  companionAvatarUrl?: string;
  isCloudSyncing?: boolean;
  isGoogleLinked?: boolean;
  userEmail?: string | null;
  lastSyncedAtMs?: number | null;
  onForceSync?: () => Promise<void>;
  errorLogs?: SystemErrorLog[];
  onClearErrors?: () => void;
  activeError?: string | null;
  isOnline?: boolean;
  apiDelayMs?: number | null;
  ttftMs?: number | null;
}

function formatDuration(totalSec: number): string {
  const mins = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export const VitalsHud: React.FC<VitalsHudProps> = ({
  vitals,
  isStreaming,
  activeView,
  onSelectView,
  selectedModel,
  activeModelUsed,
  onSelectModel,
  callState,
  callSeconds,
  isMicMuted,
  onToggleMute,
  onToggleVoiceCall,
  onOpenVideoRoadmap,
  companionVocalLevel,
  userMicLevel,
  memoryCount,
  memories = [],
  creationsCount,
  journalCount,
  userPresence,
  onUpdateUserPresence,
  userCallsign = 'User',
  userAvatarUrl,
  companionName,
  companionAvatarUrl,
  isCloudSyncing = false,
  isGoogleLinked = false,
  userEmail,
  lastSyncedAtMs,
  onForceSync,
  errorLogs = [],
  onClearErrors,
  activeError,
  isOnline = true,
  apiDelayMs,
  ttftMs,
}) => {
  const isVoiceLive = callState === 'active' || callState === 'connecting';
  // Keep HUD compact by default so the chat viewport has maximum vertical room and is completely unblocked
  const [isExpanded, setIsExpanded] = useState(false);

  const totalErrors = errorLogs.length + (activeError ? 1 : 0);
  const isSystemNominal = totalErrors === 0 && isOnline;

  // Convert memoryCount into ticker digits e.g. 42 -> ['0', '4', '2']
  const paddedCount = String(Math.max(0, memoryCount)).padStart(3, '0');
  const digits = paddedCount.split('');

  const currentPresence = userPresence?.status || 'active';

  return (
    <section aria-label="Companion & User Telemetry Deck" className="shrink-0 space-y-1.5">
      {/* 1. Ultra-Slim Persistent Cyber-Ribbon (Only ~38-42px high — Never blocks the chat) */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-[#090e29]/95 via-[#0b1336]/95 to-[#080d26]/95 px-2 sm:px-3 py-1.5 shadow-[0_0_16px_rgba(0,229,255,0.06)]">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
          {/* Left: Companion Mini Avatar + User Status Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Companion Mini Portrait */}
            <div className="flex items-center gap-1.5 shrink-0">
              <CompanionAvatar
                size="mini"
                vocalLevel={companionVocalLevel}
                isCallActive={isVoiceLive}
                mood={vitals.mood}
                avatarUrl={companionAvatarUrl}
              />
              <div className="hidden xs:flex flex-col text-[10px] font-mono leading-none">
                <span className="text-cyan-300 font-bold">{(companionName || 'Companion').toUpperCase()}</span>
                <span className="text-emerald-400 font-semibold">{vitals.mood}</span>
              </div>
            </div>

            <span className="text-slate-600 hidden xs:inline" aria-hidden="true">
              |
            </span>

            {/* User Live Status Pill with 1-Click Toggle */}
            <button
              type="button"
              onClick={() => {
                if (onUpdateUserPresence) {
                  const newStatus = currentPresence === 'active' ? 'away' : 'active';
                  onUpdateUserPresence({
                    status: newStatus,
                    lastActiveMs: Date.now(),
                    isManualOverride: true,
                  });
                }
              }}
              title={`User is ${currentPresence.toUpperCase()} (Click to toggle Away / Active)`}
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg border text-[10px] font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
                currentPresence === 'active'
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : currentPresence === 'call'
                    ? 'border-cyan-400/40 bg-cyan-950/30 text-cyan-300'
                    : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  currentPresence === 'active'
                    ? 'bg-emerald-400 animate-pulse'
                    : currentPresence === 'call'
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-amber-400'
                }`}
              />
              <span className="truncate max-w-[80px] sm:max-w-none">
                {userCallsign}:{' '}
                {currentPresence === 'active'
                  ? 'Active'
                  : currentPresence === 'call'
                    ? 'In Call'
                    : 'Away'}
              </span>
            </button>
          </div>

          {/* Center: Live Thought Stream Snippet (Single line truncate) */}
          <div
            onClick={() => setIsExpanded((prev) => !prev)}
            title="Click to view Companion's full telemetry & thoughts"
            className="hidden md:flex flex-1 items-center gap-1.5 px-2 py-0.5 rounded-lg border border-indigo-500/20 bg-[#060a1f] min-w-0 cursor-pointer hover:border-cyan-400/40 transition-colors"
          >
            <span className="text-[9px] font-display font-semibold text-cyan-400/80 uppercase shrink-0">
              THOUGHT:
            </span>
            <span className="text-[11px] text-slate-300 truncate italic">
              {vitals.thoughtStream || 'On your frequency.'}
            </span>
          </div>

          {/* Right: Memory Ticker + Sync/Error Indicators + Voice Call + Expand Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            {/* Memory Ticker (Compact) */}
            <button
              type="button"
              onClick={() => onSelectView('memory')}
              title={`Memory Index: ${memoryCount} Nodes (Click to open vault)`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-cyan-500/30 bg-[#040817] text-[10px] font-mono cursor-pointer hover:border-cyan-400"
            >
              <span className="text-[8px] font-display text-cyan-400/80 hidden sm:inline uppercase">
                MEM:
              </span>
              <div className="flex items-center gap-0.5">
                {digits.map((d, i) => (
                  <span
                    key={i}
                    className="inline-flex h-4 w-3.5 sm:h-4.5 sm:w-4 items-center justify-center rounded bg-[#020512] border border-cyan-400/35 text-cyan-300 font-bold text-[10px] sm:text-[11px] font-mono-tabular"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </button>

            {/* System Health Pulse */}
            <span
              title={
                isSystemNominal
                  ? 'Companion System Nominal (0 errors)'
                  : `${totalErrors} internal error/warning logged`
              }
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-mono font-semibold ${
                isSystemNominal
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-950/30 text-rose-300 animate-pulse'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isSystemNominal ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span className="hidden sm:inline">{isSystemNominal ? 'SYS: OK' : 'SYS: ALERT'}</span>
            </span>

            {/* Compact Voice Call Shortcut Button */}
            <button
              type="button"
              onClick={onToggleVoiceCall}
              title={isVoiceLive ? 'End Voice Call' : 'Start Live Voice Call'}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                isVoiceLive
                  ? 'border-rose-400/60 bg-rose-950/40 text-rose-200'
                  : 'border-cyan-400/40 bg-[#0d1c3d] text-cyan-200 hover:border-cyan-300'
              }`}
            >
              {isVoiceLive ? (
                <>
                  <PhoneOff className="w-3.5 h-3.5 text-rose-300" />
                  <span className="text-[10px] font-mono">{formatDuration(callSeconds)}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="hidden lg:inline text-[10px]">CALL</span>
                </>
              )}
            </button>

            {/* Expand / Collapse Full Telemetry Deck */}
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? 'Hide Telemetry Deck' : 'Expand Full Telemetry Deck'}
              title={isExpanded ? 'Hide Telemetry Deck' : 'Expand Full Telemetry Deck'}
              className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border border-indigo-400/30 bg-[#060b1e] text-slate-300 hover:text-cyan-300 hover:border-cyan-400/50 transition-colors cursor-pointer text-[10px] sm:text-xs font-medium"
            >
              <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Deck'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Expandable Telemetry & Status Deck (Shown ONLY when the user clicks 'Deck' — Never blocks chat by default) */}
      {isExpanded && (
        <div className="rounded-xl sm:rounded-2xl border border-cyan-400/35 bg-gradient-to-b from-[#0c1636]/98 via-[#091129]/98 to-[#080d22]/98 p-3 sm:p-4 space-y-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Deck Top: Companion Portrait, Vitals, Thought Stream & Model Switcher */}
          <div className="flex flex-col md:flex-row items-center gap-3 sm:gap-5 pb-3 border-b border-indigo-500/20">
            {/* Companion Portrait */}
            <div className="flex items-center justify-center shrink-0">
              <CompanionAvatar
                size="hud"
                vocalLevel={companionVocalLevel}
                isCallActive={isVoiceLive}
                mood={vitals.mood}
                avatarUrl={companionAvatarUrl}
              />
            </div>

            {/* Vitals, Thought Stream & Model */}
            <div className="flex-1 min-w-0 space-y-1.5 w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm sm:text-base font-bold text-white">
                    Companion Vitals
                  </h3>
                  <span className="text-emerald-400 font-mono text-xs font-semibold">
                    [{vitals.status}]
                  </span>
                </div>

                {/* Model Picker */}
                <div className="flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-[#060b1e] px-2 py-0.5 text-xs font-mono">
                  <Cpu className="w-3 h-3 text-cyan-300 shrink-0" />
                  <select
                    value={selectedModel}
                    onChange={(e) => onSelectModel(e.target.value as GeminiModelId)}
                    className="bg-transparent text-[11px] text-cyan-200 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-none truncate"
                  >
                    {FREE_TIER_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#080d24] text-white">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thought Stream Box */}
              <div className="rounded-lg border border-cyan-400/25 bg-[#050a1d] p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-display text-cyan-300 font-semibold tracking-wider">
                  <span>COMPANION&apos;S CANDID THOUGHT STREAM</span>
                  {isStreaming && <span className="text-cyan-400 animate-pulse font-mono">STREAMING LIVE</span>}
                </div>
                <p className="text-xs text-slate-200 font-normal leading-relaxed max-h-16 overflow-y-auto pr-1">
                  {vitals.thoughtStream || 'Attuned to your frequency.'}
                </p>
              </div>
            </div>
          </div>

          {/* User Presence & Status Bar */}
          {userPresence && onUpdateUserPresence && (
            <UserStatusBar
              callsign={userCallsign}
              avatarUrl={userAvatarUrl}
              presence={userPresence}
              onUpdatePresence={onUpdateUserPresence}
              isVoiceActive={isVoiceLive}
            />
          )}

          {/* Companion System Monitor */}
          <CompanionSystemMonitor
            memoryCount={memoryCount}
            memories={memories}
            onSelectView={onSelectView}
            isCloudSyncing={isCloudSyncing}
            isGoogleLinked={isGoogleLinked}
            userEmail={userEmail}
            lastSyncedAtMs={lastSyncedAtMs}
            onForceSync={onForceSync}
            errorLogs={errorLogs}
            onClearErrors={onClearErrors}
            activeError={activeError}
            isOnline={isOnline}
            apiDelayMs={apiDelayMs}
            ttftMs={ttftMs}
          />

          {/* Quick Communication & Workspace Toolbar */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-1 border-t border-indigo-500/20">
            <button
              type="button"
              onClick={() => onSelectView('memory')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                activeView === 'memory'
                  ? 'border-purple-400 bg-purple-600/30 text-white'
                  : 'border-purple-400/30 bg-[#121030] text-purple-200 hover:bg-purple-900/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Memory ({memoryCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectView('journal')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                activeView === 'journal'
                  ? 'border-indigo-400 bg-indigo-600/30 text-white'
                  : 'border-indigo-400/30 bg-[#0e1436] text-indigo-200 hover:bg-indigo-900/30'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Journal ({journalCount ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectView('image_studio')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                activeView === 'image_studio'
                  ? 'border-cyan-400 bg-cyan-600/30 text-white'
                  : 'border-cyan-400/30 bg-[#0c1836] text-cyan-200 hover:bg-cyan-900/30'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Studio</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectView('gallery')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                activeView === 'gallery'
                  ? 'border-purple-400 bg-purple-600/30 text-white'
                  : 'border-purple-400/30 bg-[#121030] text-purple-200 hover:bg-purple-900/30'
              }`}
            >
              <Images className="w-3.5 h-3.5" />
              <span>Gallery ({creationsCount ?? 0})</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
