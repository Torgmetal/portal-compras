// OBRA do Syneco → número da OP no portal.
//
// O SKA escreve a obra com prefixo T (T64, T104A, T60B) e o portal guarda o número com zero à
// esquerda (064, 104, 060). Esta conversão é o ÚNICO vínculo entre o apontamento e a OP: sem ela o
// registro entra com `opId: null` e some do portal — o dado existe no banco e não aparece em lugar
// nenhum.
//
// 🚨 Foi o que aconteceu com a **OP-092**: alguém cadastrou a obra no Syneco como **"OP-92"** em vez
// de "T92". Como a regra só entendia `^T`, ficaram **1.063 ordens e 618 apontamentos órfãos
// (126.290 kg produzidos)** — e a OP aparecia em TODAS as raias da TV com 48–77%, porque o portal
// achava que nada tinha sido produzido e calculava o progresso pelo `status` velho das peças.
// (Vitor 19/08: "a 92, mesmo ela tendo passado por todos os setores, ela aparece lá ainda?")
//
// ⚠️ A regra é estreita de propósito. Varri as 39 obras órfãs da base: só a "OP-92" casa com OP do
// portal. As outras (T36, T50, T68…) são obras antigas que nunca foram cadastradas — órfãs
// legítimas. "ALM-T29" (almoxarifado) e "TORG METAL" não podem virar OP nenhuma, e não viram: o
// prefixo tem de estar no COMEÇO.

export function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const s = String(obra).trim();
  const m = s.match(/^T(\d+)/i) || s.match(/^OP[-\s_]?0*(\d+)/i);
  return m ? String(parseInt(m[1], 10)).padStart(3, "0") : s;
}
