import React from 'react';

interface LisiereLogoProps {
  className?: string;
}

export function LisiereLogo({ className = 'h-7 w-auto' }: LisiereLogoProps) {
  return (
    <span className="inline-flex items-center">
      <svg
        viewBox="0 0 168 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* L */}
        <path
          d="M10 10.5V47.4C10 48.9 10.7 49.4 12.2 49.4H24.5"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />

        {/* i + s semi-connected */}
        <circle cx="32.5" cy="14" r="3.1" fill="currentColor" />
        <path
          d="M32.5 24V43.5C32.5 50.6 39.2 51.4 43.2 44.5L50.8 27.6C51.3 26.5 52.3 26.4 53.1 27.3C57.8 32.8 62.2 38.4 61.6 44.2C61.1 49.6 54.6 51.2 49.4 48.5"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />

        {/* second i */}
        <circle cx="72.5" cy="14" r="3.1" fill="currentColor" />
        <path
          d="M72.5 24V52"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
        />

        {/* è */}
        <path
          d="M88 12.2L96 18.2"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinecap="butt"
        />
        <path
          d="M83 38.5H103.5C103.5 30 99 26.5 93.5 26.5C86.8 26.5 82.5 31.5 82.5 38.5C82.5 45.8 87.2 49.6 94 49.6C98.2 49.6 101.2 48.2 103 46.2"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />

        {/* r flowing toward e */}
        <path
          d="M112.5 26.5H126C127.2 26.5 127.4 27.4 126.4 29.2L119.5 43.5C117.8 47.2 119.4 50 123.5 49.8C127.6 49.6 131.2 46 134 41.2"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />

        {/* final e */}
        <path
          d="M138.5 38.5H158.5C158.5 30 154 26.5 148.5 26.5C141.8 26.5 137.5 31.5 137.5 38.5C137.5 45.8 142.2 49.6 149 49.6C153.2 49.6 156.2 48.2 158 46.2"
          stroke="currentColor"
          strokeWidth="5.1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">Lisière</span>
    </span>
  );
}
