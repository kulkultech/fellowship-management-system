import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        kulkul: {
          orange: '#fe900d',
          'orange-hover': '#e67e05',
          'orange-light': '#fff8ee',
          'orange-subtle': '#ffedd5',
          purple: '#33125d',
          'purple-hover': '#260c47',
          'purple-light': '#f5f0fa',
          'purple-subtle': '#ede4f7',
          'purple-surface': '#1e083a',
        },
        stitch: {
          blue: '#1a73e8',
          'blue-light': '#e8f0fe',
          green: '#1e8e3e',
          'green-light': '#e6f4ea',
          yellow: '#f9ab00',
          'yellow-light': '#fef7e0',
          red: '#d93025',
          'red-light': '#fce8e6',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
