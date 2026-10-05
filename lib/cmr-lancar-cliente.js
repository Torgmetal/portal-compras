// O "Gravar" do CMR visto do navegador (lib/cmr-lote.js é o lado do servidor).
//
// ⚠⚠ RESPOSTA PERDIDA NÃO É "NADA GRAVADO" (pedido 2054, 05/10/2026). A Vercel derrubou a função
// depois de gravar os 43 R e devolveu a página de erro dela; a tela mostrou "Unexpected token 'A'…
// is not valid JSON" e deixou "Gravar 43" de pé. Aqui essa resposta vira erro INCERTO, com uma
// mensagem que diz o que pode ter acontecido — e repetir é seguro, porque a chave do lote vai junto
// e o servidor devolve o que já gravou em vez de emitir outros R.

/** Chave de um lote: gerada uma vez e repetida a cada tentativa até um sucesso. */
export function novoLote() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`.replace(/\D/g, "").padEnd(32, "0")
    .replace(/^(.{8})(.{4})(.{3})(.{3})(.{12}).*/, "$1-$2-4$3-8$4-$5");
}

class ErroLote extends Error {
  constructor(msg, extra) { super(msg); Object.assign(this, extra); }
}

const INCERTA = "O servidor não respondeu a tempo, e o lançamento pode ter sido gravado. Clique em Gravar de novo: "
  + "o portal reconhece o mesmo lote e não duplica os R.";

export async function enviarLoteCmr({ ano, lancamentos, loteId }) {
  let r;
  try {
    r = await fetch("/api/compras/cmr", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ano, lancamentos, espelhar: false, loteId }),
    });
  } catch { throw new ErroLote(INCERTA, { incerta: true }); }
  let j = null;
  try { j = JSON.parse(await r.text()); } catch { /* página de erro da Vercel, não JSON */ }
  if (!j || j.incerta) throw new ErroLote(j?.error || INCERTA, { incerta: true });
  if (r.status === 409) throw new ErroLote(j.error || "Este lote já foi gravado.", { conflito: true, indices: j.indices || [] });
  if (!r.ok || !j.success) throw new ErroLote(j.error || `Erro ${r.status} ao gravar.`);
  return j;
}
