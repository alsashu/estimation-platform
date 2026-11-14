/**
 * Chart colours for the Estimation Performance dashboard — validated with the dataviz palette validator
 * (scripts/validate_palette.js) in light and dark mode.
 *
 *  • KPI identity (colour follows the KPI everywhere): EFA blue, EEI orange, EBI aqua are categorical slots
 *    1–3, which pass the all-pairs CVD/normal-vision checks; ED (never plotted next to the others) is violet.
 *    Aqua is below 3:1 on the light surface, so every chart using it also has a legend, tooltips and a table.
 *  • Deviation direction is a diverging pair: under-estimation red ↔ over-estimation blue, neutral grey midpoint
 *    (on target) — the grey is the diverging midpoint by design and is always labelled.
 *  • Status colours are reserved for status (always paired with an icon + label).
 */
import type { KpiKey } from './types';

export const KPI_COLORS: Record<KpiKey, { light: string; dark: string }> = {
  efa: { light: '#2a78d6', dark: '#3987e5' },
  eei: { light: '#eb6834', dark: '#d95926' },
  ebi: { light: '#1baf7a', dark: '#199e70' },
  ed:  { light: '#6250d6', dark: '#9085e9' },
};

export const DIRECTION_COLORS = {
  under:     { light: '#e34948', dark: '#e66767' },
  over:      { light: '#2a78d6', dark: '#3987e5' },
  on_target: { light: '#a8a69c', dark: '#6b6a64' },
};

/** Historical (pre-framework) vs Current (with framework, = EBI aqua) — a validated adjacent pair. */
export const HISTORICAL_COLOR = { light: '#6250d6', dark: '#9085e9' };
export const CURRENT_COLOR = { light: '#1baf7a', dark: '#199e70' };

export const STATUS_COLORS = {
  light: { good: '#0F784D', warning: '#E0A100', critical: '#C02B1E' },
  dark:  { good: '#19AA6E', warning: '#B88800', critical: '#D0352A' },
};

export const chartInk = (isDark: boolean) => ({
  axis: isDark ? '#A5AFB9' : '#788291',
  grid: isDark ? '#2c2c2a' : '#e1e0d9',
  baseline: isDark ? '#5b5b57' : '#c3c2b7',
  surface: isDark ? '#17263A' : '#ffffff',
});
