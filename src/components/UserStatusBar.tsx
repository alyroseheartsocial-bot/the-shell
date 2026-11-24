import React, { useEffect, useState } from 'react';
import {
  Clock,
  Eye,
  Heart,
  Moon,
  PhoneCall,
  Radio,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  Zap,
} from 'lucide-react';
import { UserPresence, UserPresenceStatus } from '../types';
import { UserAvatar } from './UserAvatar';

interface UserStatusBarProps {
  callsign: string;
  avatarUrl?: string;
  presence: UserPresence;
  onUpdatePresence: (updates: Partial<UserPresence>) => void;
  isVoiceActive?: boolean;
}

export const UserStatusBar: React.FC<UserStatusBarProps> = ({
  callsign,
  avatarUrl,
  presence,
  onUpdatePresence,
  isVoiceActive = false,
}) => {
  const [timeAgoStr, setTimeAgoStr] = useState<string>('Just now');

  // Compute live relative time
  useEffect(() => {
    const updateTime = () => {
      const diffSec = Math.floor((Date.now() - presence.lastActiveMs) / 1000);
      if (diffSec < 10) {
        setTimeAgoStr('Just now');
      } else if (diffSec < 60) {
        setTimeAgoStr(`${diffSec}s ago`);
      } else {
        const mins = Math.floor(diffSec / 60);
        if (mins < 60) {
          setTimeAgoStr(`${mins}m ago`);
        } else {
          const hrs = Math.floor(mins / 60);
          setTimeAgoStr(`${hrs}h ago`);
        }
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [presence.lastActiveMs]);

  const effectiveStatus: UserPresenceStatus = isVoiceActive ? 'call' : presence.status;

  const handleToggleManualPresence = () => {
    const newStatus: UserPresenceStatus = presence.status === 'active' ? 'away' : 'active';
    onUpdatePresence({
      status: newStatus,
      lastActiveMs: Date.now(),
      updatedAtMs: Date.now(),
      isManualOverride: true,
      note: newStatus === 'away' ? 'Manually stepped away' : 'Returned to terminal',
    });
  };

  return (
    <div className="w-full rounded-xl sm:rounded-2xl border border-pink-500/25 bg-gradient-to-r from-[#170926]/90 via-[#100826]/90 to-[#0c0926]/90 px-2.5 py-1.5 sm:px-4 sm:py-2 shadow-[0_0_16px_rgba(236,72,153,0.06)]">
      <div className="flex items-center justify-between gap-2">
        {/* Left: User Identity & Realtime Presence Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <UserAvatar size="mini" avatarUrl={avatarUrl} />
            {/* Realtime Status Ring Dot */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#120826] ${
                effectiveStatus === 'active'
                  ? 'bg-emerald-400 ring-2 ring-emerald-500/30 animate-pulse'
                  : effectiveStatus === 'call'
                    ? 'bg-cyan-400 ring-2 ring-cyan-500/30 animate-pulse'
                    : 'bg-amber-400'
              }`}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display text-xs sm:text-sm font-bold text-pink-200 truncate">
                {callsign}
              </span>
              <span className="rounded-full bg-cyan-500/15 border border-cyan-400/35 px-1.5 py-0.2 text-[9px] font-mono font-semibold text-cyan-300 hidden xs:inline">
                Human
              </span>

              {/* Status Pill */}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide ${
                  effectiveStatus === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                    : effectiveStatus === 'call'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/35'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    effectiveStatus === 'active'
                      ? 'bg-emerald-400 animate-pulse'
                      : effectiveStatus === 'call'
                        ? 'bg-cyan-400 animate-pulse'
                        : 'bg-amber-400'
                  }`}
                />
                <span>
                  {effectiveStatus === 'active'
                    ? 'ACTIVE'
                    : effectiveStatus === 'call'
                      ? 'IN CALL'
                      : 'AWAY'}
                </span>
              </div>
            </div>

            {/* Companion's Perception & Awareness Note */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-300 truncate">
              <Eye className="w-3 h-3 text-cyan-400 shrink-0" />
              <span className="text-slate-400 hidden sm:inline">Companion Awareness:</span>
              <span className="text-slate-200 truncate">
                {effectiveStatus === 'active'
                  ? 'Companion is attuned: aware you are active at terminal.'
                  : effectiveStatus === 'call'
                    ? 'Companion is listening: direct voice frequency linked.'
                    : 'Companion standing by: aware you stepped away.'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Last Input / Time Ago & Quick Manual Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden md:flex flex-col text-right font-mono text-[10px] text-slate-400">
            <span className="text-pink-300/90 font-medium">
              {effectiveStatus === 'active' ? 'Active Now' : 'Stepped Away'}
            </span>
            <span className="text-slate-400 flex items-center justify-end gap-1">
              <Clock className="w-2.5 h-2.5" />
              {timeAgoStr}
            </span>
          </div>

          {/* Quick 1-Click Manual Toggle (Active <-> Away) */}
          <button
            type="button"
            onClick={handleToggleManualPresence}
            title={
              presence.status === 'active'
                ? 'Click to set status to Away (lets Companion know you stepped away)'
                : 'Click to set status to Active (lets Companion know you are back)'
            }
            className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
              presence.status === 'active'
                ? 'border-pink-500/35 bg-pink-950/30 text-pink-200 hover:border-pink-400 hover:bg-pink-900/40'
                : 'border-emerald-500/40 bg-emerald-950/35 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-900/40'
            }`}
          >
            {presence.status === 'active' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">Set Away</span>
                <span className="sm:hidden">Away</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden sm:inline">Set Active</span>
                <span className="sm:hidden">Active</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
