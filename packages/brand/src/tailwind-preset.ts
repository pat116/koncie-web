import type { Config } from 'tailwindcss';
import { colors, radius, typography } from './tokens.js';

/**
 * Tailwind preset for Koncie apps.
 *
 * Consumed by `apps/web/tailwind.config.ts`:
 *
 *   import koncie from '@koncie/brand/tailwind-preset';
 *   export default { presets: [koncie], content: [...] } satisfies Config;
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        'koncie-navy': colors.navy,
        'koncie-sand': colors.sand,
        'koncie-green': colors.green,
        'koncie-green-cta': colors.greenCta,
        'koncie-charcoal': colors.charcoal,
        'koncie-border': colors.border,

        // Semantic aliases — prefer these in app code.
        background: colors.sand,
        foreground: colors.charcoal,
        primary: {
          DEFAULT: colors.navy,
          foreground: colors.white,
        },
        secondary: {
          DEFAULT: colors.sand,
          foreground: colors.navy,
        },
        accent: {
          DEFAULT: colors.green,
          foreground: colors.white,
        },
        muted: {
          DEFAULT: colors.sand,
          foreground: colors.charcoal,
        },
        border: colors.border,
        destructive: {
          DEFAULT: colors.destructive,
          foreground: colors.white,
        },
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
      },
      borderRadius: {
        DEFAULT: radius.DEFAULT,
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
      },
    },
  },
};

export default preset;
