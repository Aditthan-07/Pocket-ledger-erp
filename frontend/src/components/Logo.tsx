import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  subtitle?: string;
  theme?: 'light' | 'dark';
}

export const Logo: React.FC<LogoProps> = ({
  size = 36,
  className = '',
  showText = false,
  subtitle = 'Manufacturing & GST',
  theme = 'light',
}) => {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      {/* Bespoke Geometric Logo Emblem: Folded Pocket + Dual Ledger Lines */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Rounded square container with rich emerald tone */}
        <rect width="36" height="36" rx="9" fill="#065F46" />
        <rect x="0.5" y="0.5" width="35" height="35" rx="8.5" stroke="#10B981" strokeOpacity="0.3" />

        {/* Subtle Folded Pocket Silhouette */}
        <path
          d="M8.5 12C8.5 10.3431 9.84315 9 11.5 9H24.5C26.1569 9 27.5 10.3431 27.5 12V19.5C27.5 23.0899 24.5899 26 21 26H15C11.4101 26 8.5 23.0899 8.5 19.5V12Z"
          fill="#10B981"
        />

        {/* Pocket Flap Notch */}
        <path
          d="M8.5 12L18 18L27.5 12"
          stroke="#A7F3D0"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dual Horizontal Ledger Lines in soft mint (#A7F3D0) */}
        <line
          x1="12.5"
          y1="20.5"
          x2="23.5"
          y2="20.5"
          stroke="#A7F3D0"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="23"
          x2="22"
          y2="23"
          stroke="#A7F3D0"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />
      </svg>

      {showText && (
        <div className="flex flex-col min-w-0">
          <div
            className={`font-semibold tracking-tight text-[15px] leading-tight ${
              theme === 'dark' ? 'text-white' : 'text-[#0F172A]'
            }`}
          >
            Pocket Ledger
          </div>
          <div
            className={`text-[11px] font-medium tracking-wide mt-0.5 truncate ${
              theme === 'dark' ? 'text-emerald-400/90' : 'text-slate-500'
            }`}
          >
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );
};
