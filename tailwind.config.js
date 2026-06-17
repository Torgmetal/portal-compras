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
      // #5 — legibilidade: os dois tamanhos dominantes da UI eram pequenos
      // (text-xs 12px, text-sm 14px). Sobem 1px cada; títulos (base/lg/xl…)
      // ficam no padrão do Tailwind. Os literais text-[9..13px] têm piso no
      // globals.css. Reversível: basta remover este bloco.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }], // 13px
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],   // 15px
      },
      keyframes: {
        "logo-fade": {
          "0%, 100%": { opacity: "0.18" },
          "50%":       { opacity: "1" },
        },
      },
      animation: {
        "logo-fade": "logo-fade 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
