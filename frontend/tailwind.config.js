/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Primary palette
        carbon:    { DEFAULT: '#1E3246', 50: '#E8ECF0', 100: '#C5CDD7', 200: '#9EAEBE', 300: '#778FA5', 400: '#576F87', 500: '#3A5168', 600: '#1E3246', 700: '#17263A', 800: '#101B2C', 900: '#0A1020' },
        vibrant:   { DEFAULT: '#DC3223', 50: '#FDECEA', 100: '#FAC9C5', 200: '#F59B95', 300: '#EE6D65', 400: '#E74C3E', 500: '#DC3223', 600: '#C02B1E', 700: '#A02319', 800: '#801C14', 900: '#60140F' },
        gold:      { DEFAULT: '#9B875F', 50: '#F5F1EA', 100: '#E6DBCA', 200: '#D3C2A3', 300: '#BFA87C', 400: '#AFA082', 500: '#9B875F', 600: '#86724E', 700: '#6E5D3F', 800: '#574832', 900: '#403524' },
        greenline: { DEFAULT: '#19AA6E', 50: '#E5F7EF', 100: '#BEEBD5', 200: '#90DCBA', 300: '#61CD9E', 400: '#3DC088', 500: '#19AA6E', 600: '#14915D', 700: '#0F784D', 800: '#0B5F3C', 900: '#07462C' },
        // Secondary palette
        slate:     { DEFAULT: '#4B5A69', 100: '#D0D5DB', 200: '#A1AAB5', 300: '#72808F', 400: '#4B5A69' },
        softred:   '#E15A50',
        mutedgold: '#AFA082',
        softgreen: '#A6B98C',
        coolslate: '#788291',
        coral:     '#EB827D',
        beige:     '#C3B9A0',
        mint:      '#73CDAA',
        lgrayblue: '#D2D7DC',
        softpink:  '#FAD7D2',
        offwhite:  '#EBE6DC',
        pastegreen:'#D2F0E1',
      },
      animation: {
        'fade-in':      'fadeIn 0.2s ease-in-out',
        'slide-in':     'slideIn 0.25s ease-out',
        'slide-up':     'slideUp 0.25s ease-out',
        'scale-in':     'scaleIn 0.2s ease-out',
        'pulse-soft':   'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 },                   to: { opacity: 1 } },
        slideIn:   { from: { transform: 'translateX(-16px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        slideUp:   { from: { transform: 'translateY(16px)',  opacity: 0 }, to: { transform: 'translateY(0)',  opacity: 1 } },
        scaleIn:   { from: { transform: 'scale(0.95)',       opacity: 0 }, to: { transform: 'scale(1)',       opacity: 1 } },
        pulseSoft: { '0%,100%': { opacity: 1 },              '50%': { opacity: 0.6 } },
      },
      boxShadow: {
        'card':      '0 1px 3px rgba(30,50,70,0.08), 0 4px 16px rgba(30,50,70,0.06)',
        'card-hover':'0 4px 12px rgba(30,50,70,0.12), 0 8px 24px rgba(30,50,70,0.08)',
        'modal':     '0 8px 32px rgba(30,50,70,0.18), 0 2px 8px rgba(30,50,70,0.1)',
        'sidebar':   '2px 0 16px rgba(30,50,70,0.1)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1E3246 0%, #2A4560 100%)',
        'gradient-success': 'linear-gradient(135deg, #19AA6E 0%, #14915D 100%)',
        'gradient-gold':    'linear-gradient(135deg, #9B875F 0%, #AFA082 100%)',
        'gradient-danger':  'linear-gradient(135deg, #DC3223 0%, #E15A50 100%)',
      },
    },
  },
  plugins: [],
};
