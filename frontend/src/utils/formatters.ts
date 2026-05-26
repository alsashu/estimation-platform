export const fmt = {
  days: (v: number | string) => { const n = Number(v); return `${parseFloat(n.toFixed(2))} day${n !== 1 ? 's' : ''}`; },
  hours: (v: number | string) => { const n = Number(v); return `${parseFloat(n.toFixed(1))} hr${n !== 1 ? 's' : ''}`; },
  pct: (v: number | string) => `${parseFloat((Number(v) * 100).toFixed(1))}%`,
  accuracy: (v: number | string) => `${parseFloat(Number(v).toFixed(1))}%`,
  variance: (v: number | string) => { const n = Number(v); return `${n >= 0 ? '+' : ''}${parseFloat(n.toFixed(1))} hrs`; },
  date: (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  datetime: (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  range: (min: number | string, max: number | string, unit: string) => `${parseFloat(Number(min).toFixed(1))}–${parseFloat(Number(max).toFixed(1))} ${unit}`,
};

export function accuracyColor(pct: number): string {
  if (pct >= 90) return 'text-greenline';
  if (pct >= 70) return 'text-gold';
  return 'text-vibrant';
}

export function accuracyBg(pct: number): string {
  if (pct >= 90) return 'bg-greenline/10 text-greenline border-greenline/20';
  if (pct >= 70) return 'bg-gold/10 text-gold border-gold/20';
  return 'bg-vibrant/10 text-vibrant border-vibrant/20';
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
