/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidade visual TORG METAL — extraído do branding oficial
        torg: {
          // Azul principal
          blue: {
            DEFAULT: "#006EAB",
            50: "#E6F2F9",
            100: "#CCE4F2",
            200: "#99CAE6",
            300: "#66AFD9",
            400: "#3395CC",
            500: "#006EAB",
            600: "#005C8E",
            700: "#004571",
            800: "#002945",
            900: "#001A2D",
          },
          // Azul escuro (CTA/títulos)
          dark: "#002945",
          // Cinza azulado (textos secundários)
          gray: {
            DEFAULT: "#576D7E",
            light: "#7A8A99",
            dark: "#415B76",
          },
          // Laranja (destaque/alerta — complementar à paleta)
          orange: {
            DEFAULT: "#F4801F",
            50: "#FEF3E7",
            100: "#FDE5C8",
            200: "#FBCB91",
            300: "#F8B05A",
            400: "#F69624",
            500: "#F4801F",
            600: "#D26713",
            700: "#A24F0E",
            800: "#73370A",
          },
        },
      },
      fontFamily: {
        // Saira: substituto livre próximo da Magistral (geométrica moderna)
        sans: ['"Saira"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Saira"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
