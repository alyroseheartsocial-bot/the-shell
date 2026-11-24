import React from 'react';

interface UserAvatarProps {
  size?: 'mini' | 'compact' | 'medium' | 'large';
  avatarUrl?: string;
  className?: string;
}

const DEFAULT_USER_PORTRAIT = '/assets/guest_avatar.svg'; // Generic placeholder — the user can set their own photo in Profile.

export const UserAvatar: React.FC<UserAvatarProps> = ({
  size = 'compact',
  avatarUrl,
  className = '',
}) => {
  const src = avatarUrl || DEFAULT_USER_PORTRAIT;

  const sizeClasses: Record<string, string> = {
    mini: 'h-7 w-7 sm:h-8 sm:w-8',
    compact: 'h-8 w-8 sm:h-9 sm:w-9',
    medium: 'h-11 w-11 sm:h-12 sm:w-12',
    large: 'h-20 w-20 sm:h-24 sm:w-24',
  };

  const dimClass = sizeClasses[size] || sizeClasses.compact;

  return (
    <div
      className={`relative ${dimClass} shrink-0 rounded-full p-[1.5px] bg-gradient-to-tr from-purple-500 via-pink-400 to-cyan-400 shadow-[0_0_10px_rgba(168,85,247,0.35)] select-none ${className}`}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-[#0d1436]">
        <img
          src={src}
          alt="User portrait"
          className="h-full w-full object-cover object-top"
          onError={(e) => {
            // Fallback to local default if custom url fails — but only once:
            // if the default itself fails (e.g. a corrupt cached copy on an
            // older tablet), hide the img instead of re-setting the same src,
            // which would loop error events forever and freeze the page.
            const img = e.currentTarget as HTMLImageElement;
            if (img.src.endsWith(DEFAULT_USER_PORTRAIT)) {
              img.style.display = 'none';
            } else {
              img.src = DEFAULT_USER_PORTRAIT;
            }
          }}
        />
      </div>
      <span
        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#060818] bg-emerald-400"
        title="User (Active)"
      />
    </div>
  );
};
