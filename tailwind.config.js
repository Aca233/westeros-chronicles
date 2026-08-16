/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        got: {
          bg: '#0a0908',
          panel: '#13100d',
          card: '#1a1612',
          border: '#33271d',
          gold: '#c89d54',
          'gold-light': '#e5be6c',
          'gold-dark': '#8a652a',
          crimson: '#8a1c14',
          'crimson-light': '#b3261b',
          parchment: '#e6ded1',
          'parchment-dim': '#a89f91',
          steel: '#68737d',
        }
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Cinzel"', 'Georgia', 'serif'],
        cinzel: ['"Cinzel"', 'serif'],
      },
    },
  },
  plugins: [],
}
