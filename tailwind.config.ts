import type { Config } from 'tailwindcss'

const config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-red-600', 'hover:bg-red-700', 'border-red-500', 'text-red-600',
    'bg-blue-600', 'hover:bg-blue-700', 'border-blue-500', 'text-blue-600',
    'bg-green-600', 'hover:bg-green-700', 'border-green-500', 'text-green-600',
    'bg-yellow-400', 'bg-yellow-50', 'border-yellow-400',
    'bg-purple-400', 'bg-purple-50', 'border-purple-400',
    'bg-gray-400', 'bg-gray-50', 'border-gray-400',
    'bg-red-400', 'bg-red-50', 'border-red-400',
    'mobile-button', 'mobile-tab', 'mobile-card', 'mobile-input', 'status-card-mobile',
    'mobile-load-card', 'mobile-nav', 'mobile-grid'
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      minHeight: {
        '44': '11rem',
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} as Config

export default config