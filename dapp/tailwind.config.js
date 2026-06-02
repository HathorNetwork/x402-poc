/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        // Hathor brand colors
        'hathor-orange': '#FF7300',
        'hathor-orange-light': '#FFA600',
        'hathor-green': '#059669',
      },
      backgroundImage: {
        'hathor-gradient': 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)',
      },
    },
  },
  plugins: [],
}
