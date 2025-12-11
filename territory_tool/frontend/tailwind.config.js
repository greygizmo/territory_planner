/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Territory colors - distinctive, high-contrast palette
        't1': '#3B82F6', // Blue
        't2': '#10B981', // Emerald
        't3': '#F59E0B', // Amber
        't4': '#EF4444', // Red
        't5': '#8B5CF6', // Violet
        't6': '#EC4899', // Pink
        't7': '#06B6D4', // Cyan
        't8': '#84CC16', // Lime
        't9': '#F97316', // Orange
        't10': '#6366F1', // Indigo
        // UI colors
        'surface': {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        }
      },
      fontFamily: {
        'sans': ['JetBrains Mono', 'Fira Code', 'SF Mono', 'monospace'],
        'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}


