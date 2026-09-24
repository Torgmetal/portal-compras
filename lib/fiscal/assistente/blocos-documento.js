import { BLOCO, ORIGEM, lastro } from "@/lib/fiscal/assistente/contrato";

// ─── O QUE O PORTAL LEU DO XML ANEXADO ───────────────────────────────────────
//
// ⚠⚠ DOIS BLOCOS COM DUAS ORIGENS, E A SEPARAÇÃO É O PONTO. O bloco DOCUMENTO diz o que a nota
// DECLARA — o CFOP que ela usou, o NCM que ela escreveu — com origem `DOCUMENTO`, que respalda
// transcrição e nunca recomendação. O bloco AUDITORIA diz o que a TIPI e as regras do portal
// concluem SOBRE a nota, com origem `TIPI`. Misturar os dois faria o CFOP da remessa parecer
// recomendado para o retorno.
//
// ⚠ Sempre com a ressalva de autenticidade: o portal leu um arquivo que alguém enviou. Estrutura
// válida não é nota autorizada pela SEFAZ — assinatura e protocolo não foram conferidos.

export const RESSALVA_AUTENTICIDADE = "Dados do XML enviado. A autenticidade não foi verificada — assinatura digital e autorização da SEFAZ não foram conferidas pelo portal.";

const unicos = (xs) => [...new Set(xs.filter(Boolean))];
const fmtCfop = (c) => (c && c.length === 4 ? `${c[0]}.${c.slice(1)}` : c);
const fmtNcm = (n) => (n && n.length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n);

export function blocoDocumento(doc, { nome, tamanho, sha256, problemas = [], suspeito = false } = {}) {
  const cfops = unicos(doc.itens.map((i) => i.cfop));
  const ncms = unicos(doc.itens.map((i) => i.ncm));
  const linhas = [
    { rotulo: "NF-e", valor: `nº ${doc.numero ?? "—"}${doc.serie ? ` · série ${doc.serie}` : ""}`, ressalva: RESSALVA_AUTENTICIDADE },
    { rotulo: "Emitente", valor: `${doc.emitente?.nome ?? "—"}${doc.emitente?.uf ? ` (${doc.emitente.uf})` : ""}`, ressalva: null },
    { rotulo: "Destinatário", valor: `${doc.destinatario?.nome ?? "—"}${doc.destinatario?.uf ? ` (${doc.destinatario.uf})` : ""}`, ressalva: null },
    { rotulo: "Natureza", valor: doc.naturezaOperacao ?? "—", ressalva: null },
    // ⚠ "DECLARADO", e escrito na tela: é o que a nota diz, não o que o portal recomenda.
    { rotulo: "CFOP declarado", valor: cfops.map(fmtCfop).join(", ") || "—", ressalva: "Como a nota foi emitida — não é recomendação para a próxima operação." },
    { rotulo: "NCM declarado", valor: ncms.map(fmtNcm).join(", ") || "—", ressalva: null },
    { rotulo: "Itens", valor: String(doc.itens.length), ressalva: null },
  ];
  if (doc.referenciadas?.length) linhas.push({ rotulo: "NF referenciada", valor: doc.referenciadas.join(", "), ressalva: null });
  if (problemas.length) linhas.push({ rotulo: "Campos fora do formato", valor: problemas.slice(0, 5).join("; "), ressalva: "Estes campos ficaram fora da análise." });
  return {
    tipo: BLOCO.DOCUMENTO, titulo: "Documento anexado",
    linhas,
    // ⚠⚠ ORIGEM DOCUMENTO: respalda "a nota declara X", nunca "use X".
    lastro: lastro(ORIGEM.DOCUMENTO, {
      cfops, ncms,
      aliquotas: doc.itens.map((i) => i.ipi?.aliquota),
      csts: doc.itens.flatMap((i) => [i.ipi?.cst, i.icms?.cst]),
    }),
    // ⚠ "Possível instrução", não "ataque": a heurística erra para os dois lados, e a tela diz que
    // o texto foi tratado como conteúdo — não que o portal está protegido por causa dela.
    aviso: suspeito ? "O texto do documento contém algo parecido com uma instrução. Ele foi tratado como conteúdo da nota, não como comando." : null,
    fontes: [{ rotulo: nome ?? "XML anexado", url: null, sha256: sha256 ?? null, tamanho: tamanho ?? null }],
  };
}

/**
 * A conferência da nota contra a TIPI — o motor `auditar` de sempre, o mesmo da aba Auditoria.
 * ⚠ As alíquotas do lastro vêm da TIPI (`tipiDaNota`), não da nota: é o que a TABELA diz.
 */
export function blocoAuditoria(r, tipiDaNota = []) {
  if (!r) return null;
  const linhas = [];
  for (const a of (r.achados ?? []).filter((x) => x.gravidade !== "INFO").slice(0, 12)) {
    linhas.push({ rotulo: `${a.gravidade === "ALTA" ? "⚠ " : ""}Item ${a.item ?? "—"}`, valor: a.titulo, ressalva: a.detalhe ?? null });
  }
  if (!linhas.length) linhas.push({ rotulo: "Resultado", valor: "Nenhuma divergência de IPI/NCM contra a TIPI de referência.", ressalva: null });
  if (r.resumo?.diferencaEstimada) {
    linhas.push({ rotulo: "Diferença estimada", valor: `R$ ${r.resumo.diferencaEstimada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      ressalva: "Soma das contas óbvias dos achados, para dimensionar — não é imposto devido nem apuração." });
  }
  return {
    tipo: BLOCO.AUDITORIA, titulo: `Conferência contra a TIPI (${r.resumo?.alta ?? 0} alta · ${r.resumo?.media ?? 0} média)`,
    linhas,
    lastro: lastro(ORIGEM.TIPI, {
      ncms: tipiDaNota.map((t) => t.ncm),
      aliquotas: tipiDaNota.flatMap((t) => t.aliquotas),
    }),
    fontes: [],
  };
}
