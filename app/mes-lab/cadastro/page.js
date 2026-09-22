import CadastroClient from "./CadastroClient";

// O cadastro do MES — `/mes-lab/cadastro`, ADMIN-only pelo middleware.
//
// ⚠ É daqui que o totem lê o chão de fábrica: setor, posto, motivo de parada e operador. Até esta
// tela existir, tudo isso só nascia do `scripts/mes-lab/semear-cadastro.mjs`, que é bootstrap de uma
// vez e não fonte permanente (`docs/mes-proprio.md` §11.4).

export const metadata = { title: "Cadastro do MES (laboratório)", robots: { index: false, follow: false } };

export default function CadastroPage() {
  return <CadastroClient />;
}
