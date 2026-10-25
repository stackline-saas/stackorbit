import React from 'react';

interface StackOrbitLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const StackOrbitLogo: React.FC<StackOrbitLogoProps> = ({
  size = 32,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          <linearGradient id="so-grad-icon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <linearGradient id="so-stack-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id="so-stack-mid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
          <linearGradient id="so-stack-bot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
        </defs>

        {/* Back Orbit Ring */}
        <ellipse
          cx="120"
          cy="120"
          rx="98"
          ry="36"
          transform="rotate(-30 120 120)"
          stroke="url(#so-grad-icon)"
          strokeWidth="8"
          strokeDasharray="8 6"
          strokeOpacity="0.45"
          fill="none"
        />

        {/* Isometric Stack */}
        {/* Layer 3 - Bot */}
        <path d="M 120 152 L 176 122 L 120 92 L 64 122 Z" fill="url(#so-stack-bot)" opacity="0.9" />
        <path d="M 64 122 L 120 152 L 120 166 L 64 136 Z" fill="#581C87" />
        <path d="M 120 152 L 176 122 L 176 136 L 120 166 Z" fill="#6B21A8" />

        {/* Layer 2 - Mid */}
        <path d="M 120 116 L 176 86 L 120 56 L 64 86 Z" fill="url(#so-stack-mid)" opacity="0.95" />
        <path d="M 64 86 L 120 116 L 120 128 L 64 98 Z" fill="#3730A3" />
        <path d="M 120 116 L 176 86 L 176 98 L 120 128 Z" fill="#4338CA" />

        {/* Layer 1 - Top */}
        <path d="M 120 80 L 176 50 L 120 20 L 64 50 Z" fill="url(#so-stack-top)" />
        <path d="M 64 50 L 120 80 L 120 92 L 64 62 Z" fill="#0369A1" />
        <path d="M 120 80 L 176 50 L 176 62 L 120 92 Z" fill="#0284C7" />

        {/* Front Orbit Arc */}
        <path
          d="M 38 166 C 70 206 172 200 204 134"
          stroke="url(#so-grad-icon)"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="204" cy="132" r="12" fill="#38BDF8" />
        <circle cx="204" cy="132" r="6" fill="#FFFFFF" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="text-base font-extrabold tracking-tight text-white leading-none">
            Stack<span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">Orbit</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5">
            Multi-Host PaaS
          </span>
        </div>
      )}
    </div>
  );
};
