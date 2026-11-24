import React, { useEffect, useId, useState } from 'react';

interface CompanionAvatarProps {
  size?: 'mini' | 'compact' | 'hud' | 'os1';
  vocalLevel?: number;
  isCallActive?: boolean;
  mood?: string;
  className?: string;
  // Owner's in-app companion portrait (profile.companionAvatarUrl). Falls
  // back to the generic placeholder when unset or blank.
  avatarUrl?: string;
}

const PORTRAIT_ASSET = '/assets/companion_avatar.svg'; // Generic placeholder portrait, used when the owner has not set a companion portrait in the app.

export const CompanionAvatar: React.FC<CompanionAvatarProps> = ({
  size = 'hud',
  vocalLevel = 0,
  isCallActive = false,
  mood = 'FOCUSED',
  className = '',
  avatarUrl,
}) => {
  const portraitAsset = avatarUrl && avatarUrl.trim() ? avatarUrl : PORTRAIT_ASSET;
  const clipId = useId().replace(/:/g, '');
  const [isBlinking, setIsBlinking] = useState(false);

  // Periodic natural blinking cycle for HUD and OS1 avatar
  useEffect(() => {
    if (size === 'mini' || size === 'compact') return;
    let blinkTimeout: number;
    let nextCycleTimeout: number;

    const scheduleBlink = () => {
      const delay = 3200 + Math.random() * 3400;
      nextCycleTimeout = window.setTimeout(() => {
        setIsBlinking(true);
        blinkTimeout = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 135);
      }, delay);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimeout);
      window.clearTimeout(nextCycleTimeout);
    };
  }, [size]);

  if (size === 'mini' || size === 'compact') {
    const dimClass = size === 'compact' ? 'h-10 w-10' : 'h-8 w-8 sm:h-9 sm:w-9';
    return (
      <div
        className={`relative ${dimClass} shrink-0 rounded-full p-[1.5px] ${
          isCallActive || vocalLevel > 0.05
            ? 'bg-gradient-to-tr from-emerald-400 via-cyan-400 to-purple-500 shadow-[0_0_12px_rgba(0,229,255,0.4)]'
            : 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500'
        }`}
      >
        <svg
          viewBox="0 0 220 220"
          className="h-full w-full rounded-full bg-[#090f26] block"
          aria-label="Companion avatar"
        >
          <defs>
            <clipPath id={`mini_${clipId}`}>
              <circle cx="110" cy="110" r="108" />
            </clipPath>
          </defs>
          <g clipPath={`url(#mini_${clipId})`}>
            <rect width="220" height="220" fill="#0d1536" />
            <image
              href={portraitAsset}
              x="-45"
              y="-12"
              width="310"
              height="232"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        </svg>
      </div>
    );
  }

  const activeGlow = Math.min(1, vocalLevel * 1.35 + (isCallActive ? 0.25 : 0));
  const ringAccent = mood === 'FIERCE' ? '#ec4899' : '#00e5ff';

  const defaultDimension = size === 'os1' ? 'w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44' : 'w-20 h-20 sm:w-44 sm:h-44';
  const containerClass = className || defaultDimension;

  return (
    <div className={`relative flex items-center justify-center select-none ${containerClass} shrink-0`}>
      {/* Soft atmospheric blue/cyan backlight halo for OS1 companion aesthetic */}
      {size === 'os1' && (
        <div
          className="absolute -inset-4 sm:-inset-6 rounded-full pointer-events-none transition-all duration-300 blur-xl opacity-80 animate-orb-pulse"
          style={{
            background:
              activeGlow > 0.2
                ? 'radial-gradient(circle, rgba(6,182,212,0.45) 0%, rgba(59,130,246,0.3) 45%, rgba(13,21,54,0) 70%)'
                : 'radial-gradient(circle, rgba(6,182,212,0.28) 0%, rgba(30,58,138,0.2) 45%, rgba(13,21,54,0) 70%)',
          }}
        />
      )}

      {/* Dynamic audio wave ripple rings radiating outward when vocalLevel > 0.05 or call is active */}
      {size === 'os1' && (isCallActive || vocalLevel > 0.05) && (
        <>
          <div className="absolute inset-0 rounded-full border border-cyan-400/50 pointer-events-none animate-wave-ripple" />
          <div className="absolute -inset-2 rounded-full border border-indigo-400/40 pointer-events-none animate-wave-ripple [animation-delay:600ms]" />
        </>
      )}

      {/* Subtle reactive vocal aura */}
      <div
        className={`absolute inset-1.5 sm:inset-2 rounded-full pointer-events-none transition-opacity duration-150 ${
          activeGlow > 0.2
            ? 'bg-cyan-400/25 opacity-100'
            : 'bg-cyan-400/10 opacity-75'
        }`}
      />

      <svg
        viewBox="0 0 300 300"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label="Companion Live Cyber HUD Portrait"
      >
        <defs>
          <clipPath id={`hud_${clipId}`}>
            <circle cx="150" cy="150" r="102" />
          </clipPath>
          <linearGradient id={`ringGrad_${clipId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={ringAccent} />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        {/* Outer Concentric HUD Telemetry Rings */}
        <circle
          cx="150"
          cy="150"
          r="142"
          fill="none"
          stroke="rgba(34, 211, 238, 0.18)"
          strokeWidth="1.2"
          strokeDasharray="3 5"
        />

        <g className="animate-hud-spin">
          <circle
            cx="150"
            cy="150"
            r="132"
            fill="none"
            stroke={`url(#ringGrad_${clipId})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="84 36 44 28 110 42"
            opacity={0.85}
          />
        </g>

        <g className="animate-hud-spin-reverse">
          <circle
            cx="150"
            cy="150"
            r="120"
            fill="none"
            stroke="#00e5ff"
            strokeWidth={2 + vocalLevel * 2.5}
            strokeLinecap="round"
            strokeDasharray="68 22 18 22 92 30"
            opacity={0.65 + activeGlow * 0.35}
          />
        </g>

        {/* Inner dark metallic bezel */}
        <circle
          cx="150"
          cy="150"
          r="108"
          fill="#070b1e"
          stroke="rgba(0, 229, 255, 0.55)"
          strokeWidth="2"
        />

        {/* Clipped Portrait with Subtle Breathing, Blinking, and Lip-Sync Articulation */}
        <g clipPath={`url(#hud_${clipId})`}>
          <rect x="48" y="48" width="204" height="204" fill="#0d1536" />
          <g className="animate-avatar-breathe">
            <image
              href={portraitAsset}
              x="-58"
              y="20"
              width="415"
              height="310"
              preserveAspectRatio="xMidYMid slice"
            />

            {/* Subtle Eyelid Blinking Layer aligned to portrait eye-line */}
            <ellipse
              cx="150"
              cy="127"
              rx="34"
              ry="7"
              fill="#1a1210"
              opacity={isBlinking ? 0.68 : 0}
              className="transition-opacity duration-75 ease-out"
            />

            {/* Subtle Jaw / Lip-Sync Vocal Articulation Shadow & Cyan Rim Resonance */}
            {vocalLevel > 0.03 && (
              <>
                <ellipse
                  cx="151"
                  cy="166"
                  rx={10 + vocalLevel * 4}
                  ry={2 + vocalLevel * 5.5}
                  fill="#0b0708"
                  opacity={Math.min(0.55, vocalLevel * 0.65)}
                />
                <circle
                  cx="150"
                  cy="150"
                  r="100"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth={1.5 + vocalLevel * 4}
                  opacity={Math.min(0.85, vocalLevel * 0.9)}
                />
              </>
            )}
          </g>
        </g>

        {/* Bright Cyan Arc Highlights Top & Bottom */}
        <path
          d="M 92 59 A 108 108 0 0 1 208 59"
          fill="none"
          stroke="#00e5ff"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 102 247 A 108 108 0 0 0 198 247"
          fill="none"
          stroke="#00e5ff"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
