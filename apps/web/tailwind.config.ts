import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import koncieBrand from '@koncie/brand/tailwind-preset';

const config: Config = {
  presets: [koncieBrand as Partial<Config>],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/brand/src/**/*.{ts,tsx}',
  ],
  plugins: [tailwindcssAnimate],
};

export default config;
