import TotemClient from "./TotemClient";

// O TOTEM DE UM POSTO. `/mes-lab/totem/<codigo>` — ADMIN-only pelo middleware.
//
// ⚠ A ROTA CARREGA O CÓDIGO DO RECURSO, não um id: é o que vai na configuração do navegador do
// totem, e o que alguém consegue conferir olhando a máquina ("SOLDA 5"). Um cuid na barra de
// endereço tornaria impossível saber, do lado de fora, se o totem está apontando no posto certo.

export const metadata = { title: "Totem (laboratório)", robots: { index: false, follow: false } };

export default function TotemPage({ params }) {
  return <TotemClient codigo={decodeURIComponent(params.codigo)} />;
}
