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
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} as Config

export default config