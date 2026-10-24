import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'white' | 'dark';
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  variant = 'white',
  onClick
}) => {
  const iconSizes = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-11 h-11 text-lg'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  const isWhite = variant === 'white';

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Circular emblem: high contrast with leaf sprout */}
      <div
        className={`${iconSizes[size]} rounded-full ${
          isWhite
            ? 'bg-white/15 border border-white/30 text-white'
            : 'bg-[#244C3A] text-[#E8F0E9]'
        } flex items-center justify-center shadow-xs transition-transform hover:scale-105`}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stylized leaf with central branching vein */}
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      </div>

      <div className="flex items-baseline">
        <span
          className={`font-serif font-bold tracking-tight ${
            isWhite ? 'text-white' : 'text-[#244C3A]'
          } ${textSizes[size]}`}
        >
          CauseConnect
        </span>
        <span
          className={`ml-1.5 font-serif font-semibold ${
            isWhite ? 'text-white' : 'text-[#315D48]'
          } ${textSizes[size]}`}
        >
          AI
        </span>
      </div>
    </div>
  );
};
