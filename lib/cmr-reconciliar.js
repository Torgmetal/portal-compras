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
/**
 * ⚠ Quantas linhas uma rodada grava, e quantas de cada vez.
 *
 * O teto existe porque a rota tem `maxDuration`; o paralelo existe porque cada linha é uma
 * transação própria (gravação + trilha) e esperar uma de cada vez é o que estourou o tempo. Dez é
 * conservador de propósito: o Neon deste projeto satura de RAM em escrita em massa (ver o aviso do
 * CLAUDE.md), e aqui são transações pequenas, não um bulk.
 */
// ⚠ 1.500 cobre a fila inteira de uma vez (881 pendentes na primeira medição) com folga. O número
// não é o que protege — quem protege é o teto existir; ele é a rede para o dia em que a planilha
// crescer de uma vez.
const TETO_POR_RODADA = 1500;
const EM_PARALELO = 10;

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

  // A planilha manda: o que ela traz preenchido sobrescreve o portal.
  const recebidos = [];
  let completados = 0;

  // ⚠⚠ CRIAR VEM ANTES DE REMENDAR (22/09/2026). O teto por rodada existe para a função não morrer
  // no meio — mas do jeito que nasceu ele gastava o orçamento inteiro acertando a OBSERVAÇÃO das
  // linhas mais antigas e deixava a criação por último: `importados: 0` com 32 linhas da planilha
  // sem par no portal. Matheus: *"precisamos dos R para outros setores usarem"*. O R que falta é o
  // que trava gente; a observação de uma linha de fevereiro espera a próxima passada.
  //
  // ⚠ Casca (R reservado sem descrição) continua NÃO virando registro — é decisão antiga e é o que
  // impede o portal de encher de linha vazia. Ela entra quando o material chega.
  let importados = 0;
  for (const r of doExcel) {
    if (!so(r.descricao)) continue;
    try {
      const d = mapearLancamento(r, r.indiceR, userId);
      d.origem = "planilha_sharepoint";
      await prisma.documentoQualidade.create({ data: d });
      importados++;
      recebidos.push(d);
    } catch (e) {
      falhasDeCriacao.push({ indiceR: so(r.indiceR), motivo: e.message });
    }
  }

  const trocas = [];
  const falhas = [];
  const falhasDeCriacao = [];

  // ⚠⚠ O TRABALHO É MONTADO ANTES DE SER GRAVADO, e gravado em LOTES (22/09/2026). A primeira
  // versão gravava linha a linha dentro do laço: com `observacao` entrando na reconciliação, quase
  // toda linha antiga (observação nula contra o "Tipo: R" da planilha) virou trabalho, e a
  // sincronização MORREU no meio do caminho — 68 gravadas e nenhuma conclusão. Uma transação por
  // linha, em série, contra o teto de 60 s da função.
  const pendentes = [];
  for (const r of sheet) {
    const atual = porR.get(so(r.indiceR));
    if (!atual || !so(r.descricao)) continue;
    const d = mapearLancamento(r, r.indiceR, userId);
    const trocou = ehOutroMaterial(atual.nome, d.nome);
    const patch = montarPatch(atual, d, trocou);
    if (Object.keys(patch).length) pendentes.push({ indiceR: so(r.indiceR), atual, patch, trocou });
  }

  // ⚠⚠ TETO POR RODADA, E O QUE SOBRA É DITO. Meia sincronização que se anuncia é melhor que uma
  // que morre calada: o resto entra na próxima passada (o cron roda sozinho), e quem apertou o
  // botão lê quantas faltam em vez de achar que acabou.
  // ⚠⚠ DO MAIS NOVO PARA O MAIS ANTIGO. Em ordem de planilha, o teto atendia sempre janeiro e
  // fevereiro, e o material que chegou esta semana ficava para "a próxima passada" que nunca vinha
  // — foi exatamente o sintoma relatado ("a sincronização está somente até 24/08").
  pendentes.sort((a, b) => b.indiceR.localeCompare(a.indiceR));
  const daVez = pendentes.slice(0, TETO_POR_RODADA);
  for (let i = 0; i < daVez.length; i += EM_PARALELO) {
    await Promise.all(daVez.slice(i, i + EM_PARALELO).map(async ({ indiceR, atual, patch, trocou }) => {
      // ⚠⚠ A GRAVAÇÃO E A TRILHA VÃO JUNTAS, NUMA TRANSAÇÃO. Agora que a planilha SOBRESCREVE, cada
      // patch pode trocar certificado e corrida — e uma sobrescrita de rastreabilidade sem trilha é
      // um certificado trocado que ninguém consegue reconstruir depois.
      try {
        const [u] = await prisma.$transaction([
          prisma.documentoQualidade.updateMany({ where: { categoria: CMR_CAT, importRef: indiceR }, data: patch }),
          prisma.auditLog.create({
            data: {
              userId: userId || null,
              action: trocou ? "CMR_INDICE_TROCOU_DE_MATERIAL" : "CMR_PLANILHA_SOBRESCREVEU",
              entity: "DocumentoQualidade", entityId: indiceR,
              diff: { indiceR, trocouDeMaterial: trocou, antes: soOsCampos(atual, patch), planilha: patch },
            },
          }),
        ]);
        if (!u.count) return;
        completados += 1;
        if (VAZIO_NOME(atual.nome)) recebidos.push({ ...atual, ...patch });
        if (trocou) trocas.push({ indiceR, de: so(atual.nome), para: so(patch.nome) });
      } catch (e) {
        // ⚠ Falha NÃO é silêncio: ela volta no retorno, porque um R que não sincronizou é um R que
        // alguém precisa olhar.
        falhas.push({ indiceR, motivo: e.message });
      }
    }));
  }
  const restantes = pendentes.length - daVez.length;

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
    falhas: [...falhas, ...falhasDeCriacao],
    restantes,
    ignoradasSemIndice: sheet.filter((r) => !r.indiceR).length,
  };
}
