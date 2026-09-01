"use client";
// ─── BAIXAR O LOTE DE DESENHOS EM ZIP (lado do navegador) ─────────────────────
// Vitor (19/08/2026): abrir uma aba por arquivo era bloqueado pelo navegador e ainda deixava a
// pessoa imprimindo um por um. O lote vem em ZIP, por pastas de impressora.
//
// ⚠ HÁ DUAS CÓPIAS ANTIGAS DESTA MESMA FUNÇÃO — em app/pcp/dashboard-prioridades/DespachoPanel.jsx
// e app/pcp/producao/ProducaoClient.jsx. Esta lib nasceu na terceira chamada (impressão dos
// conjuntos para a montagem) justamente para não virar a terceira cópia; migrar as duas antigas
// para cá é dívida conhecida, não esquecimento.

// ⚠ 60 por ZIP: acima disso a rota estoura o tempo da Vercel montando o arquivo.
const POR_ZIP = 60;

/**
 * Baixa o lote emitido, quebrado em partes numeradas.
 * @param {{arquivos: {itemId:string,nome:string,formato:string}[]}} lote resposta de /api/producao/desenhos/lote
 * @param {string} opNumero para nomear o arquivo
 * @param {string} [rotulo] sufixo do nome (ex.: "conjuntos") — some quando não informado
 */
export async function baixarZipLote(lote, opNumero, rotulo) {
  const todos = (lote?.arquivos || []).map((a) => ({ itemId: a.itemId, nome: a.nome, formato: a.formato }));
  if (!todos.length) throw new Error("Nenhum desenho para baixar.");
  const partes = [];
  for (let i = 0; i < todos.length; i += POR_ZIP) partes.push(todos.slice(i, i + POR_ZIP));
  const base = `OP-${opNumero} - ${rotulo ? `${rotulo} ` : ""}desenhos`;

  for (let k = 0; k < partes.length; k++) {
    const r = await fetch("/api/producao/desenhos/lote/zip", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opNumero, arquivos: partes[k] }),
    });
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).error || "Erro ao montar o ZIP";
      throw new Error(partes.length > 1 ? `Lote ${k + 1} de ${partes.length}: ${msg}` : msg);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // ⚠ o nome numera a parte: com vários downloads na pasta, "desenhos.zip (1)" não diz nada
    // sobre ordem nem sobre se veio tudo.
    a.download = partes.length > 1 ? `${base} ${k + 1} de ${partes.length}.zip` : `${base}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    // ⚠ respiro entre downloads: o navegador bloqueia downloads em rajada e engole os do fim.
    if (k < partes.length - 1) await new Promise((res) => setTimeout(res, 800));
  }
  return partes.length;
}
