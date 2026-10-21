const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
const formatoFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

export const moneda = (n: number): string => formatoMoneda.format(n);

export function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return formatoFecha.format(new Date(a, m - 1, d));
}

// Fecha local AAAA-MM-DD (toISOString usaría UTC y podría dar el día siguiente)
export function aISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export const hoyISO = (): string => aISO(new Date());

export function rangoMes(): [string, string] {
  const h = new Date();
  return [aISO(new Date(h.getFullYear(), h.getMonth(), 1)), aISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))];
}

export function rangoAnio(): [string, string] {
  const a = new Date().getFullYear();
  return [`${a}-01-01`, `${a}-12-31`];
}

export const suma = (items: { monto: number }[]): number => items.reduce((s, g) => s + g.monto, 0);

export interface Barra {
  nombre: string;
  total: number;
  pct: number;
}

// Agrupa gastos por una clave y calcula el porcentaje de cada grupo sobre el total
export function agrupar<T extends { monto: number }>(items: T[], clave: (g: T) => string): Barra[] {
  const mapa = new Map<string, number>();
  items.forEach((g) => mapa.set(clave(g), (mapa.get(clave(g)) ?? 0) + g.monto));
  const total = suma(items) || 1;
  return [...mapa.entries()]
    .map(([nombre, t]) => ({ nombre, total: t, pct: Math.round((t / total) * 100) }))
    .sort((a, b) => b.total - a.total);
}
