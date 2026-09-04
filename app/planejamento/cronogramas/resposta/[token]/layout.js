// ⚠ O `noindex` MORA AQUI, e não na página: a página de resposta é um client component
// ("use client"), e client component não exporta `metadata` — o Next ignora em silêncio. O layout
// do mesmo segmento resolve sem transformar a tela em server component.
//
// Vitor (03/09/2026), sobre os links públicos: "o quanto estamos vulneráveis?". Link com token é
// impossível de adivinhar (256 bits), mas basta um cliente colar a URL num lugar rastreável para o
// Google indexar a obra — e aí o segredo do link acabou.
export const metadata = { robots: { index: false, follow: false }, title: "Resposta do cronograma — Torg Metal" };

export default function Layout({ children }) {
  return children;
}
