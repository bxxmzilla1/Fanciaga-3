/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#08080c',
        panel: '#101017',
        panel2: '#16161f',
        edge: '#23232f',
        accent: '#7c6cff',
        accent2: '#c061ff'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        glow: '0 10px 40px -10px rgba(124, 108, 255, 0.5)',
        card: '0 8px 30px -12px rgba(0, 0, 0, 0.6)'
      },
      borderRadius: {
        '2xl': '1.1rem',
        '3xl': '1.6rem'
      }
    }
  },
  plugins: []
}
