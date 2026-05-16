/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#141414',
        card: '#1c1c1e',
        border: '#2c2c2e',
        primary: '#6366f1',
        'primary-dark': '#4f46e5',
        accent: '#22d3ee',
        muted: '#8e8e93',
        danger: '#ef4444',
        success: '#22c55e',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
