/**
 * Marca de RubroOS: una "R" construida dentro de un bloque redondeado.
 * La columna firme representa el orden de la operación y los dos cortes del
 * trazo representan los flujos que se conectan en el negocio: atención y caja.
 * Es vectorial, se lee bien desde un favicon hasta un panel grande.
 */
export function LogoMark({ className = '', gradientId = 'rubroos-logo' }: { className?: string; gradientId?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#37E0B4" />
          <stop offset="1" stopColor="#4D8DFF" />
        </linearGradient>
        <linearGradient id={`${gradientId}-shine`} x1="12" y1="10" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".98" />
          <stop offset="1" stopColor="#DDEAFF" stopOpacity=".9" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="14" fill={`url(#${gradientId})`} />
      <path d="M14 35V13h10.1c6.2 0 10.1 3.45 10.1 8.58 0 3.3-1.63 5.88-4.5 7.2L35 35h-7.74l-4.28-5.9H20.6V35H14Zm6.6-11.42h3.03c2.52 0 4.03-.93 4.03-2.67 0-1.78-1.5-2.74-4.03-2.74H20.6v5.41Z" fill={`url(#${gradientId}-shine)`} />
      <circle cx="36" cy="12" r="2.25" fill="#F6D675" />
    </svg>
  );
}

export function LogoBadge({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[30%] bg-white/5 ${className}`}
      style={{ width: size, height: size }}
    >
      <LogoMark className="h-[62%] w-[62%]" />
    </span>
  );
}
