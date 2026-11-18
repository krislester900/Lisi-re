import React from 'react';
import { SalonEmblemType } from '../lib/themes';

interface SalonEmblemProps {
  type: SalonEmblemType;
  color?: string;
  className?: string;
}

export function SalonEmblem({
  type,
  color = 'currentColor',
  className = 'w-6 h-6',
}: SalonEmblemProps) {
  switch (type) {
    case 'bridge':
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <path
            d="M4 22H28"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 22C8.5 13 23.5 13 26 22"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M4 15H28"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M11 15V22M16 15V18M21 15V22"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'horizon':
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <path
            d="M4 21H28"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M9 21C9 17.134 12.134 14 16 14C19.866 14 23 17.134 23 21"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M16 7V10M8.5 11.5L10.6 13.6M23.5 11.5L21.4 13.6"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M9 25H23"
            stroke={color}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'chairs':
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <circle
            cx="12.5"
            cy="16"
            r="6.5"
            stroke={color}
            strokeWidth="1.5"
          />
          <circle
            cx="19.5"
            cy="16"
            r="6.5"
            stroke={color}
            strokeWidth="1.5"
          />
          <path
            d="M16 11.2V20.8"
            stroke={color}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'leaf':
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <path
            d="M8 24C8 14.5 14.5 8 24 8C24 17.5 17.5 24 8 24Z"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M7 25L18.5 13.5"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M14 18H19M16 16V11.5"
            stroke={color}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'cup':
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <path
            d="M7 14H21V19C21 22.314 18.314 25 15 25H13C9.686 25 7 22.314 7 19V14Z"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M21 15.5H23.2C24.47 15.5 25.5 16.53 25.5 17.8C25.5 19.07 24.47 20.1 23.2 20.1H21"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M11 10C11 8.5 12.2 8.2 12.2 6.8M16 10C16 8.5 17.2 8.2 17.2 6.8"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
