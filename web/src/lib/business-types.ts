import { CarFront, Milk, Scissors, Sprout, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';

export type BusinessTypeId = 'taller' | 'barberia' | 'agro' | 'inversiones' | 'ganaderia' | 'carwash';

export interface BusinessTypeConfig {
  id: BusinessTypeId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  color: string; // tailwind color name usado en classes dinámicas ya resueltas
  accent: string; // hex para estilos inline / gradientes
  accentSoft: string;
}

export const BUSINESS_TYPES: BusinessTypeConfig[] = [
  {
    id: 'taller',
    label: 'Taller de Motos y Vehículos',
    tagline: 'POS, créditos, citas e inventario para tu taller.',
    icon: Wrench,
    color: 'orange',
    accent: '#f97316',
    accentSoft: '#fed7aa',
  },
  {
    id: 'barberia',
    label: 'Barbería',
    tagline: 'Agenda, cuentas por silla y control de barberos.',
    icon: Scissors,
    color: 'amber',
    accent: '#d4af37',
    accentSoft: '#facc15',
  },
  {
    id: 'agro',
    label: 'Agropecuario',
    tagline: 'Insumos, pedidos y cotizadores de dron y cercas.',
    icon: Sprout,
    color: 'green',
    accent: '#16a34a',
    accentSoft: '#86efac',
  },
  {
    id: 'inversiones',
    label: 'Catálogo de Inversiones',
    tagline: 'Oportunidades, cupos e interesados en un solo lugar.',
    icon: TrendingUp,
    color: 'blue',
    accent: '#2563eb',
    accentSoft: '#93c5fd',
  },
  {
    id: 'ganaderia',
    label: 'Ganadería y Lechería',
    tagline: 'Hato, producción de leche, sanidad y reproducción.',
    icon: Milk,
    color: 'emerald',
    accent: '#059669',
    accentSoft: '#a7f3d0',
  },
  {
    id: 'carwash',
    label: 'Carwash',
    tagline: 'Cola de turnos, servicios y membresías ilimitadas.',
    icon: CarFront,
    color: 'cyan',
    accent: '#06b6d4',
    accentSoft: '#a5f3fc',
  },
];

export function getBusinessType(id?: string | null): BusinessTypeConfig | undefined {
  return BUSINESS_TYPES.find((b) => b.id === id);
}
