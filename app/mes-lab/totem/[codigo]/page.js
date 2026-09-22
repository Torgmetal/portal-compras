import TotemClient from "./TotemClient";

// O TOTEM DE UM POSTO. `/mes-lab/totem/<codigo>` — ADMIN-only pelo middleware.
//
// ⚠ A ROTA CARREGA O CÓDIGO DO RECURSO, não um id: é o que vai na configuração do navegador do
// totem, e o que alguém consegue conferir olhando a máquina ("SOLDA 5"). Um cuid na barra de
// endereço tornaria impossível saber, do lado de fora, se o totem está apontando no posto certo.

export const metadata = { title: "Totem (laboratório)", robots: { index: false, follow: false } };

// ⚠⚠ O AMBIENTE VEM DA URL E SEGUE PARA A TELA (achado do Codex, 22/09/2026). O código do posto
// deixou de identificar sozinho — "SOLDA 5" existe em PROD e em DEMO. A página ignorava
// `searchParams`, e como ausência vale PROD, o totem do laboratório abria o posto de VERDADE.
export default function TotemPage({ params, searchParams }) {
  const pedido = String(searchParams?.ambiente || "").trim().toUpperCase();
  const ambiente = pedido === "DEMO" ? "DEMO" : "PROD";
  return <TotemClient codigo={decodeURIComponent(params.codigo)} ambiente={ambiente} />;
}
