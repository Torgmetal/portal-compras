import { notificarMateriaisRecebidos } from "@/lib/recebimento-notificacoes";
// Reconciliação CMR planilha (SharePoint) ↔ portal, chaveada pelo ÍNDICE R.
// LÓGICA ÚNICA usada pelo cron (/api/cron/cmr-reconciliar) E pelo botão manual
// (/api/compras/cmr/reconciliar) — pra os dois NUNCA divergirem (foi o que deu ruim:
// o cron pulava casca e o botão importava). Regras:
//   - Excel → portal: cria só linhas COM descrição. Casca (só o R reservado, sem
//     descrição) NÃO vira registro — é preenchida quando o material chega.
//   - A PLANILHA MANDA. Matheus (22/09/2026): "o correto vai ser sempre o que foi lançado na
//     planilha". Campo com valor na planilha SOBRESCREVE o do portal; célula vazia não apaga o
//     que o portal tem. Era o contrário até aqui ("o portal manda"), e foi isso que fabricou um
//     registro híbrido — ver `ehOutroMaterial` e o comentário do laço.
//   - portal → Excel: anexa no fim da planilha os R do portal que faltam lá (com descrição).
import { CMR_CAT, prefixoAno, mapearLancamento, aprenderReferencias } from "@/lib/cmr";
import { lerLinhasCmr, appendLinhasCmr } from "@/lib/cmr-sharepoint";

const so = (v) => (v == null ? "" : String(v).trim());
export function parseObsCmr(o) {
  const s = so(o);
  const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
  return m ? { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() } : { rc: "", obs: s };
}
export const VAZIO_NOME = (v) => !so(v) || so(v) === "(sem descrição)";
// "casca" = R reservado sem NENHUMA informação (só o índice).
export function ehCascaVazia(r) {
  return VAZIO_NOME(r.nome)
    && !so(r.norma) && !so(r.opNumero) && !so(r.numeroCorrida) && !so(r.numeroDocumento)
    && !so(r.fornecedor) && !so(r.pedidoCompra) && !so(r.nfNumero)
    && !r.dataRecebimento && !r.pesoKg && !r.quantidade
    && !so(parseObsCmr(r.observacao).obs);
}

// ⚠⚠ `observacao` ENTROU (achado do Codex, 22/09/2026): é ela que carrega a SÉRIE ("Tipo: R" /
// "Tipo: RC"), e sem ela a PORCA virava CHAPA mantendo o carimbo de RC — o registro dizia uma coisa
// no nome e outra na série. A série vem da coluna R/RC da planilha, via `mapearLancamento`.
const CAMPOS = ["nome", "norma", "opNumero", "numeroCorrida", "numeroDocumento", "fornecedor",
                "pedidoCompra", "nfNumero", "dataRecebimento", "pesoKg", "quantidade", "observacao"];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} ano
 * @param {{ userId?: string|null }} [opts]
 */
/**
 * A DESCRIÇÃO MUDOU DE MATERIAL, ou só ganhou um detalhe?
 *
 * ⚠⚠ "CHAPA A-36 9,50MM" no lugar de "PORCA A563 3/8" é troca de dono do índice; "CHAPA A-36
 * 9,50MM" no lugar de "(sem descrição)" é a casca sendo preenchida, que é o fluxo normal. Tratar
 * os dois igual encheria o alerta de ruído — e alarme cheio de ruído ninguém lê.
 *
 * ⚠ A comparação é pela PRIMEIRA PALAVRA (o substantivo do material) porque é ela que separa uma
 * chapa de uma porca. Diferença de bitola, acabamento ou grafia no resto do texto não é troca.
 */
export function ehOutroMaterial(antes, depois) {
  if (VAZIO_NOME(antes) || VAZIO_NOME(depois)) return false;
  const chave = (v) => so(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ").trim().split(/\s+/)[0] || "";
  return chave(antes) !== chave(depois);
}


/**
 * O QUE A PLANILHA MANDA GRAVAR.
 *
 * ⚠⚠ TROCA DE MATERIAL LIMPA O QUE SOBROU DO ANTERIOR (achado do Codex, 22/09/2026 — o defeito
 * voltando pela outra porta). "Célula vazia não apaga" vale enquanto é o MESMO material sendo
 * completado aos poucos; quando o índice troca de dono, o certificado, a corrida, a NF e a obra que
 * lá estavam são de OUTRA coisa. Mantê-los porque a planilha ainda não preencheu aquela coluna
 * recria exatamente o híbrido que se está consertando: uma CHAPA com o certificado da PORCA.
 *
 * ⚠ Sem troca, célula vazia continua não apagando: "o correto é o que foi lançado na planilha" fala
 * do que ESTÁ lá, não do que ainda falta.
 */
export function montarPatch(atual, daPlanilha, trocou) {
  const patch = {};
  for (const c of CAMPOS) {
    const novo = daPlanilha[c];
    const vazioNaPlanilha = novo == null || so(novo) === "";
    const velho = atual[c];
    if (vazioNaPlanilha) {
      // nome nunca é apagado: sem descrição a linha não chega aqui.
      if (!trocou || c === "nome") continue;
      if (velho == null || so(velho) === "") continue;
      patch[c] = null;
      continue;
    }
    const igual = velho instanceof Date && novo instanceof Date
      ? velho.getTime() === novo.getTime()
      : so(velho) === so(novo);
    if (!igual) patch[c] = novo;
  }
  return patch;
}

/** Só os campos que o patch toca — a trilha diz o que MUDOU, não a linha inteira de novo. */
const soOsCampos = (atual, patch) =>
  Object.fromEntries(Object.keys(patch).map((c) => [c, atual[c] instanceof Date ? atual[c].toISOString() : atual[c] ?? null]));

export async function reconciliarCmr(prisma, ano, { userId = null } = {}) {
  const pre = prefixoAno(ano);
  const [sheet, dbRows] = await Promise.all([
    lerLinhasCmr(ano),
    prisma.documentoQualidade.findMany({
      where: { categoria: CMR_CAT, importRef: { startsWith: pre } },
      select: {
        importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true,
        numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true,
        dataRecebimento: true, pesoKg: true, quantidade: true, observacao: true,
      },
    }),
  ]);
  const porR = new Map(dbRows.map((r) => [so(r.importRef), r]));
  const sheetSet = new Set(sheet.map((r) => so(r.indiceR)).filter(Boolean));
  const doExcel = sheet.filter((r) => r.indiceR && !porR.has(so(r.indiceR)));
  // portal → Excel: R do portal que faltam na planilha — só os que TÊM descrição (não anexa casca).
  const doPortal = dbRows.filter((r) => !sheetSet.has(so(r.importRef)) && !VAZIO_NOME(r.nome));

  // Completa cascas já existentes: preenche só os campos vazios do portal com a planilha.
  const recebidos = [];
  let completados = 0;
  const trocas = [];
  const falhas = [];
  for (const r of sheet) {
    const atual = porR.get(so(r.indiceR));
    if (!atual || !so(r.descricao)) continue;
    const d = mapearLancamento(r, r.indiceR, userId);
    // ⚠⚠ A PLANILHA MANDA (Matheus, 22/09/2026). Até aqui o portal só preenchia campo VAZIO, e foi
    // essa regra que fabricou o registro híbrido do R 261547: o índice nasceu como uma PORCA (RC),
    // a planilha trouxe uma CHAPA com o mesmo número, e o "só preenche o que está vazio" completou
    // a PORCA com o CERTIFICADO e a CORRIDA da CHAPA. Identidade de um material, rastreabilidade de
    // outro — no campo que o data book leva ao cliente.
    const trocou = ehOutroMaterial(atual.nome, d.nome);
    const patch = montarPatch(atual, d, trocou);
    if (!Object.keys(patch).length) continue;

    // ⚠⚠ A GRAVAÇÃO E A TRILHA VÃO JUNTAS, NUMA TRANSAÇÃO (achado do Codex, 22/09/2026). Agora que
    // a planilha SOBRESCREVE, cada patch pode trocar certificado e corrida — e antes disto a
    // auditoria só era gravada quando o MATERIAL mudava, com `.catch(() => {})` por cima. Uma
    // sobrescrita de rastreabilidade sem trilha é um certificado trocado que ninguém consegue
    // reconstruir depois.
    try {
      const [u] = await prisma.$transaction([
        prisma.documentoQualidade.updateMany({ where: { categoria: CMR_CAT, importRef: so(r.indiceR) }, data: patch }),
        prisma.auditLog.create({
          data: {
            userId: userId || null,
            action: trocou ? "CMR_INDICE_TROCOU_DE_MATERIAL" : "CMR_PLANILHA_SOBRESCREVEU",
            entity: "DocumentoQualidade", entityId: so(r.indiceR),
            diff: { indiceR: so(r.indiceR), trocouDeMaterial: trocou, antes: soOsCampos(atual, patch), planilha: patch },
          },
        }),
      ]);
      completados += u.count ? 1 : 0;
      if (u.count && VAZIO_NOME(atual.nome)) recebidos.push({ ...atual, ...patch });
      if (u.count && trocou) trocas.push({ indiceR: so(r.indiceR), de: so(atual.nome), para: so(patch.nome) });
    } catch (e) {
      // ⚠ Falha NÃO é silêncio: ela volta no retorno, porque um R que não sincronizou é um R que
      // alguém precisa olhar.
      falhas.push({ indiceR: so(r.indiceR), motivo: e.message });
    }
  }

  // Excel → portal: cria os que faltam, SÓ com descrição (casca não vira registro).
  let importados = 0;
  for (const r of doExcel) {
    if (!so(r.descricao)) continue;
    try {
      const d = mapearLancamento(r, r.indiceR, userId);
      d.origem = "planilha_sharepoint";
      await prisma.documentoQualidade.create({ data: d });
      importados++;
      recebidos.push(d);
    } catch {}
  }
  await notificarMateriaisRecebidos(recebidos, userId);
  await aprenderReferencias(doExcel).catch(() => {});

  // portal → Excel: anexa no fim da planilha.
  let enviados = 0;
  if (doPortal.length) {
    const linhas = doPortal.map((r) => {
      const { rc, obs } = parseObsCmr(r.observacao);
      return {
        rc, indiceR: so(r.importRef), descricao: so(r.nome), certificado: so(r.numeroDocumento),
        loteCorrida: so(r.numeroCorrida), especificacao: so(r.norma), pedidoCompra: so(r.pedidoCompra),
        dataRecebimento: r.dataRecebimento, nf: so(r.nfNumero), fornecedor: so(r.fornecedor),
        obra: so(r.opNumero), qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs,
      };
    });
    try { const rr = await appendLinhasCmr(ano, linhas); enviados = rr.anexadas || 0; } catch {}
  }

  return {
    ano,
    planilhaLinhas: sheet.length,
    portalLinhas: dbRows.length,
    importados,
    completados,
    enviados,
    // ⚠ Sai no retorno para a tela e o cron poderem MOSTRAR: índice que trocou de material é o
    // sintoma de numeração repetida entre as séries R e RC, e some se ninguém contar.
    trocas,
    falhas,
    ignoradasSemIndice: sheet.filter((r) => !r.indiceR).length,
  };
}
