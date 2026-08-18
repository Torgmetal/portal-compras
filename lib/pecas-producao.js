// Regras de UNIVERSO das peças no fluxo de PRODUÇÃO (painel de Liberar + telas de produção).
//
// DEDUPE LPC × LE (Vitor 18/08, OP-67): a MESMA marca pode existir em duas linhas — a da LPC
// (estrutura de fabricação, canônica) e a da Lista de Expedição. No fluxo de produção vale a
// LPC; a linha da LE só entra quando a marca NÃO existe na LPC (ex.: guarda-corpo que ainda não
// tem croqui na LPC). Sem isso a peça aparece — e é despachada/encaminhada — DUAS vezes,
// dobrando contagem e peso (na OP-67, 400 "linhas" enviadas ao Jato eram 200 peças reais).
export function dedupLpcLe(pecas) {
  const lista = pecas || [];
  const naLpc = new Set();
  for (const p of lista) {
    if (p.fonte === "LPC_IMPORT" && p.marca) naLpc.add(String(p.marca).trim().toUpperCase());
  }
  if (!naLpc.size) return lista; // OP 100% LE → tudo vale
  return lista.filter((p) => !(p.fonte === "LE_IMPORT" && naLpc.has(String(p.marca || "").trim().toUpperCase())));
}
