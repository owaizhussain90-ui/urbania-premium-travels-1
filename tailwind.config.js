/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1A2E4A',
        amber: { DEFAULT: '#F5A623', dark: '#D98E0F' },
        surface: '#F7F8FA',
        success: '#27AE60',
        danger: '#E74C3C',
        pending: '#F39C12',
        ink: '#2C3E50',
        muted: '#7F8C8D',
      },
      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
      keyframes: {
        slideIn: { from: { opacity: 0, transform: 'translateX(24px)' }, to: { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(0)' }, '70%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { slideIn: 'slideIn .3s ease-out', pop: 'pop .5s ease-out' },
    },
  },
  plugins: [],
};
