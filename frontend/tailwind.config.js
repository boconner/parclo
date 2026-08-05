/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Set as CSS variables in index.css and re-applied at runtime from
        // OrgSettings.primaryColor (see lib/brand.tsx) so the accent is
        // per-deployment config, not a build-time constant.
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          light:   'var(--accent-light)',
          hover:   'var(--accent-hover)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-5px)' },
          '40%':      { transform: 'translateX(5px)' },
          '60%':      { transform: 'translateX(-4px)' },
          '80%':      { transform: 'translateX(3px)' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
}