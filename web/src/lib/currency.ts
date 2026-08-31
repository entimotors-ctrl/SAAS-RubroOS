export function formatL(value: number | null | undefined): string {
  const n = Number(value || 0);
  return `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') || value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}
