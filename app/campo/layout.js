// Portal Qualidade Fábrica — tela cheia, sem a moldura do portal.
//
// Vitor (21/08/2026) pediu "algo separado". O portal interno é desenhado pra monitor, com menu
// lateral e módulos; no celular, no meio do galpão, isso não se usa. Aqui não entra nada além da
// tela de captura — e os dois inspetores EXTERNOS não enxergam mais nada do portal.
export const metadata = {
  title: "Qualidade Fábrica — Torg",
  description: "Registro de inspeção pelo celular.",
  // "Adicionar à tela de início" transforma a página em ícone, sem loja e sem instalar — e ela
  // continua atualizando sozinha a cada deploy. `apple-mobile-web-app-capable` é o que faz o
  // iPhone abrir sem a barra do Safari, ganhando a altura que a tela de captura usa.
  manifest: "/campo.webmanifest",
  appleWebApp: { capable: true, title: "Qualidade", statusBarStyle: "black-translucent" },
};

// impede o zoom-ao-focar do iOS e trava a escala: a tela é de trabalho, não de leitura
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0D1F3C",
};

export default function CampoLayout({ children }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}
