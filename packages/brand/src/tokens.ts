/**
 * Koncie brand tokens — lifted from the live Lovable prototype at
 * https://koncierge-portal-mockup.lovable.app (captured 2026-04-23).
 *
 * Tokens are the single source of truth for colour, type, radius, and
 * spacing decisions. Do not hard-code these values elsewhere in the app —
 * import from here or consume via the Tailwind preset.
 */

export const colors = {
  /** Primary brand — headers, primary buttons, logomark */
  navy: '#001F3D',
  /** Secondary surface — muted backgrounds, cards */
  sand: '#F7F3E9',
  /** Accent — success, highlights, primary CTAs */
  green: '#2DC86E',
  /** Default surface */
  white: '#FFFFFF',
  /** Primary body text */
  charcoal: '#333333',
  /** Warm sand border */
  border: '#E4DECD',
  /** Destructive/error */
  destructive: '#EF4444',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * HSL variants — exported separately because the prototype uses HSL for
 * CSS custom properties. Kept in sync with the hex values above.
 */
export const colorsHsl = {
  navy: '210 100% 12%',
  sand: '45 45% 94%',
  green: '145 63% 48%',
  white: '0 0% 100%',
  charcoal: '0 0% 20%',
  border: '45 30% 85%',
  destructive: '0 84% 60%',
} as const;

export const typography = {
  fontFamily: {
    /** Koncie body + heading face. Loaded via next/font/google in apps/web. */
    sans: ['var(--font-poppins)', 'Poppins', 'system-ui', '-apple-system', 'sans-serif'],
  },
} as const;

export const radius = {
  /** Applied everywhere in the prototype — buttons, cards, inputs */
  DEFAULT: '1rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
} as const;

export const spacing = {
  /** Page gutter on mobile */
  gutter: '1rem',
  /** Page gutter on desktop */
  gutterLg: '2rem',
} as const;

/** Consolidated token export for consumers that prefer one import. */
export const tokens = {
  colors,
  colorsHsl,
  typography,
  radius,
  spacing,
} as const;
