/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: v('--ink'),
          2: v('--ink-2'),
          3: v('--ink-3'),
        },
        vellum: v('--ink-2'),
        hairline: v('--hairline'),
        'hairline-bright': v('--hairline-bright'),
        gold: {
          DEFAULT: v('--gold'),
          bright: v('--gold-bright'),
          deep: v('--gold-deep'),
          dim: v('--gold-dim'),
        },
        rubric: {
          DEFAULT: v('--rubric'),
          deep: v('--rubric-deep'),
          bright: v('--rubric-bright'),
        },
        parchment: {
          DEFAULT: v('--parchment'),
          dim: v('--parchment-dim'),
          faint: v('--parchment-faint'),
        },
        // 兼容旧类名兜底
        got: {
          bg: v('--ink'),
          panel: v('--ink-2'),
          card: v('--ink-2'),
          border: v('--hairline'),
          gold: v('--gold'),
          'gold-light': v('--gold-bright'),
          'gold-dark': v('--gold-deep'),
          crimson: v('--rubric-deep'),
          'crimson-light': v('--rubric'),
          parchment: v('--parchment'),
          'parchment-dim': v('--parchment-dim'),
          steel: '#68737d',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Cinzel"', 'Georgia', 'serif'],
        cinzel: ['"Cinzel"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        folio: '0.32em',
      },
    },
  },
  plugins: [],
}
