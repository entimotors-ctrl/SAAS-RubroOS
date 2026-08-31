const HEX_POINTS = '21,12 16.5,19.79 7.5,19.79 3,12 7.5,4.21 16.5,4.21';

/**
 * Marca de RubroOS: un hexágono (los rubros del sistema) con un núcleo central
 * (la plataforma que los une). Se usa como favicon y como logomark en headers.
 */
export function LogoMark({ className = '', gradientId = 'rubroos-logo' }: { className?: string; gradientId?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <polygon points={HEX_POINTS} stroke={`url(#${gradientId})`} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.1" fill={`url(#${gradientId})`} />
    </svg>
  );
}

export function LogoBadge({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white/5 ${className}`}
      style={{ width: size, height: size }}
    >
      <LogoMark className="h-[62%] w-[62%]" />
    </span>
  );
}
