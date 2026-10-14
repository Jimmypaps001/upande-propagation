/**
 * Upande design tokens — canonical across all Upande mobile apps.
 *
 * The reference implementation is the Upande Coffee app's theme. This file
 * is that one minus the coffee-specific accent tokens (cherry, parchment,
 * roast), which are only meaningful for coffee charts and illustrations.
 *
 * Chrome stays monochrome: headers, tab bars, buttons and the drawer are black
 * on white, the same as Upande Harvest and Upande Coffee, so the three apps on
 * one phone read as one family.
 *
 * What a crop app may add is its own accent set, as Coffee adds cherry /
 * parchment / roast. They colour DATA -- a stage, a severity, a section's icon
 * -- and never chrome. The rule that was here before ("no per-feature accents")
 * was stricter than Coffee's own theme and left nothing to tell a callusing
 * batch from one ready to leave.
 */

const colorsRaw = {
  // Surfaces
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  primaryMuted: '#F5F5F5',

  // Text
  text: '#171717',
  textSecondary: '#525252',
  textMuted: '#A3A3A3',
  textOnPrimary: '#FFFFFF',

  // Action
  primary: '#171717',

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',

  // Chrome
  border: '#E5E5E5',
  overlay: 'rgba(0, 0, 0, 0.4)',

  // Propagation-flavoured accents, the counterpart to Coffee's cherry /
  // parchment / roast. Used for stages, findings and section icons; never for
  // chrome. Each has a soft tint for the background behind its own colour.
  leaf: '#2F7A3E',
  leafSoft: '#E8F3EA',
  root: '#8A5A2B',
  rootSoft: '#F5ECE1',
  mist: '#2E6E8E',
  mistSoft: '#E7F0F6',
  bloom: '#A33A6B',
  bloomSoft: '#F9E9F1',
} as const;

/**
 * The propagation ladder, in order, each with the accent that stands for it.
 *
 * Cutting and sticking are handwork on a bench (root brown); callusing and
 * rooting happen under mist (mist blue); nursery and hardening are growing on
 * (leaf green); ready and completed are the end of it (bloom).
 *
 * Keyed by the Propagation Batch `current_stage` Select, so a stage the server
 * adds and this does not know falls back to neutral rather than breaking.
 */
export const colors = colorsRaw;

export const stageAccent: Record<string, { fg: string; bg: string }> = {
  Cutting: { fg: colorsRaw.root, bg: colorsRaw.rootSoft },
  Sticking: { fg: colorsRaw.root, bg: colorsRaw.rootSoft },
  Callusing: { fg: colorsRaw.mist, bg: colorsRaw.mistSoft },
  Rooting: { fg: colorsRaw.mist, bg: colorsRaw.mistSoft },
  Nursery: { fg: colorsRaw.leaf, bg: colorsRaw.leafSoft },
  Hardening: { fg: colorsRaw.leaf, bg: colorsRaw.leafSoft },
  'Ready for Dispatch': { fg: colorsRaw.bloom, bg: colorsRaw.bloomSoft },
  Completed: { fg: colorsRaw.textMuted, bg: colorsRaw.surfaceAlt },
};

/** Neutral for anything the ladder does not name. */
export function accentFor(stage: string | null | undefined): { fg: string; bg: string } {
  return (stage && stageAccent[stage]) || { fg: colorsRaw.textSecondary, bg: colorsRaw.surfaceAlt };
}

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text } as const,
  h2: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text } as const,
  h3: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text } as const,
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text } as const,
  bodySmall: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary } as const,
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted } as const,
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text } as const,
  mono: { fontFamily: 'monospace', fontSize: fontSize.md, color: colors.text } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
