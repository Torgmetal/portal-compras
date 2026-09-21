// O projeto ANEXADO à mão a um relatório de inspeção (PDF subido para o blob).
//
// Vitor (22/08/2026), sobre a pré-montagem: "vamos ter que puxar alguns projetos diferentes,
// podendo ser conjuntos ou diagrama de montagem; nesse caso preciso de uma opção para anexar o
// projeto". O arquivo sobe direto do navegador para o Vercel Blob (token de cliente — desenho A1
// passa dos 4,5 MB em que a rota serverless trava) e o que fica no relatório é o VÍNCULO: uma
// linha em `desenhos` com `url` no lugar de `caminho` (quem lê aceita os dois).
//
// ⚠⚠ O VÍNCULO NUNCA FOI GRAVADO EM PRODUÇÃO (medido em 21/09/2026: 0 relatórios com anexo, e o
// mesmo PDF da OP-105 subido duas vezes para o blob, em 18/09 e 21/09). Ele só era escrito no
// `onUploadCompleted` — o webhook que o Vercel Blob chama de fora, SEM sessão — e a rota exigia
// login antes de tudo: o webhook tomava 401, silenciosamente. Agora o vínculo é gravado por DOIS
// caminhos, ambos por esta função: o navegador chama `PUT` assim que o upload termina (funciona
// inclusive em localhost, onde webhook não chega) e o webhook continua como reserva. Repetir a
// mesma URL não duplica, então os dois podem correr.

/** Nome de arquivo limpo, a partir do pathname do blob (que leva sufixo aleatório) ou de um nome dado. */
export function nomeDoAnexo({ nome, pathname, url } = {}) {
  let bruto = String(nome || "").trim();
  if (!bruto) {
    const p = String(pathname || "").trim() || (() => { try { return new URL(url).pathname; } catch { return ""; } })();
    bruto = decodeURIComponent(p.split("/").pop() || "projeto.pdf");
    // `addRandomSuffix` cola "-x1y2z3…" antes da extensão: "T105 - Montagem-087xBJz….pdf"
    bruto = bruto.replace(/-[A-Za-z0-9]{20,}(?=\.pdf$)/i, "");
  }
  return bruto.slice(0, 120);
}

/**
 * Os `desenhos` do relatório depois de anexar `{url, nome}`.
 * ⚠ Na PRÉ-MONTAGEM soma (o relatório cobre o arranjo: conjuntos e diagrama convivem); nos outros
 * tipos troca (o dimensional é de UM conjunto — anexar é corrigir o desenho). Teto de 12, como na
 * abertura do relatório. A mesma URL de novo não duplica.
 */
export function desenhosComAnexo(desenhosAtuais, tipo, { url, nome, pathname }) {
  const atuais = Array.isArray(desenhosAtuais) ? desenhosAtuais : [];
  const nomeLimpo = nomeDoAnexo({ nome, pathname, url });
  const novo = { marca: nomeLimpo.replace(/\.pdf$/i, "").slice(0, 60), nome: nomeLimpo, url, anexado: true };
  if (tipo !== "PRE_MONTAGEM") return [novo];
  if (atuais.some((d) => d.url === url)) return atuais;
  return [...atuais, novo].slice(0, 12);
}

/** Só aceita o que está no NOSSO blob e é PDF — a URL vem do navegador. */
export function urlDeAnexoValida(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && /\.public\.blob\.vercel-storage\.com$/i.test(u.hostname) && /\.pdf$/i.test(u.pathname);
  } catch { return false; }
}

/** Grava o vínculo no relatório. Devolve a lista gravada. */
export async function vincularAnexo(prisma, relatorioId, { url, nome, pathname }) {
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id: relatorioId }, select: { tipo: true, desenhos: true } });
  if (!rel) throw new Error("Relatório não encontrado.");
  const desenhos = desenhosComAnexo(rel.desenhos, rel.tipo, { url, nome, pathname });
  await prisma.relatorioInspecao.update({ where: { id: relatorioId }, data: { desenhos } });
  return desenhos;
}
