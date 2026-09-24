// Conjuntos de um setor + apontamento do Syneco nesse setor e no PRÓXIMO (só
// peças da LPC). A fábrica corre unidades em vários setores ao mesmo tempo,
// então a tela considera:
//  - ADIANTADOS: apontamento > 0 aqui com status (pipeline) ainda anterior;
//  - SAÍDOS: status além do setor, ou apontamento completo + próximo iniciado
//    — ficam fora da lista e contam só no indicador geral (regra do Vitor);
//  - FUROS: mais unidades apontadas aqui do que em algum setor ANTERIOR da
//    cadeia — fisicamente impossível, é lançamento errado/faltando no Syneco.
//    Nesses casos a tela mostra alerta em vez de "adiantado" (regra do Vitor).
import { prisma } from "@/lib/prisma";
import { STATUS_OP_MORTA } from "@/lib/op-viva";
import { conferirFurosApontamento } from "@/lib/furos-apontamento";

const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
// Setores do Syneco na ordem física da fábrica (nomes exatos do MesOrdem)
const CADEIA_SYNECO = ["Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

// Setores OPCIONAIS: peças podem legitimamente não passar por eles. Por isso não
// servem de base de comparação (upstream) na detecção de furo — senão uma peça
// que foi pro Jato sem passar no Acabamento vira "furo" falso. (O gerente confere
// o Acabamento no fim, pela Pintura.) Detecção normal nos demais setores.
const SETORES_OPCIONAIS = new Set(["Acabamento"]);

/**
 * @param {string} setorAtual - status do setor da aba (ex.: "SOLDA")
 * @param {string} setorSyneco - nome do setor no Syneco (ex.: "Solda")
 * @param {string|null} setorSynecoProximo - setor seguinte no Syneco (null se não há, ex.: pós-pintura)
 * @returns {{ pecas, apontamentos, apontamentosProximo, furos }}
 */
export async function buscarConjuntosComApontamento(setorAtual, setorSyneco, setorSynecoProximo) {
  const marcasLpc = (
    await prisma.pecaConjunto.findMany({
      where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
      select: { marca: true },
    })
  ).map((m) => m.marca);

  // A cadeia inteira numa busca só — os setores anteriores são necessários
  // para detectar furo de lançamento.
  const rows = marcasLpc.length
    ? await prisma.mesOrdem.findMany({
        where: { setor: { in: CADEIA_SYNECO }, item: { in: marcasLpc } },
        select: { setor: true, item: true, produzidoUn: true, planejadoUn: true, dataFim: true, op: true, operacao: true },
      })
    : [];

  // Setores feitos FORA (inativos sem produção no Syneco) — ignorados na cadeia:
  // o "0" deles é legítimo, não furo. (Mesmo critério do painel de produção.)
  const inativos = marcasLpc.length
    ? await prisma.mesInativo.findMany({ select: { op: true, item: true, operacao: true } })
    : [];
  const inativoSet = new Set(inativos.map((r) => `${r.op}|${r.item}|${r.operacao}`));
  const ehFeitoFora = (a) => inativoSet.has(`${a.op}|${a.item}|${a.operacao}`) && (a.produzidoUn || 0) === 0;

  const porSetor = {};
  for (const a of rows) {
    if (ehFeitoFora(a)) continue; // etapa terceirizada/inativada → fora da cadeia
    const mapa = (porSetor[a.setor] = porSetor[a.setor] || {});
    const acc = (mapa[a.item] = mapa[a.item] || { produzido: 0, planejado: 0, dataFim: null });
    acc.produzido += a.produzidoUn || 0;
    acc.planejado += a.planejadoUn || 0;
    if (a.dataFim && (!acc.dataFim || a.dataFim > acc.dataFim)) acc.dataFim = a.dataFim;
  }

  const apontamentos = porSetor[setorSyneco] || {};
  const apontamentosProximo = (setorSynecoProximo && porSetor[setorSynecoProximo]) || {};

  // Furo de apontamento (cadeia inteira): uma unidade não chega a um setor sem
  // passar pelos anteriores, então o apontado deve ser não-crescente ao longo
  // da cadeia. Qualquer setor com mais unidades que algum anterior é
  // impossível — lançamento errado/faltando no Syneco. Detectado por conjunto,
  // independente da aba (setor sem registro nenhum = etapa pulada, ignorado).
  const marcasComApont = new Set();
  for (const s of CADEIA_SYNECO) for (const m of Object.keys(porSetor[s] || {})) marcasComApont.add(m);

  const furos = {};
  for (const marca of marcasComApont) {
    const cadeia = {};
    for (const s of CADEIA_SYNECO) cadeia[s] = porSetor[s]?.[marca]?.produzido ?? null;
    // pior violação: setor com valor acima do MENOR upstream que ele excede
    let pior = null;
    for (let j = 0; j < CADEIA_SYNECO.length; j++) {
      const vj = cadeia[CADEIA_SYNECO[j]];
      if (vj == null) continue;
      let menorUp = null, setorUp = null;
      for (let i = 0; i < j; i++) {
        if (SETORES_OPCIONAIS.has(CADEIA_SYNECO[i])) continue; // Acabamento é opcional — não é base de furo
        const vi = cadeia[CADEIA_SYNECO[i]];
        if (vi != null && (menorUp == null || vi < menorUp)) { menorUp = vi; setorUp = CADEIA_SYNECO[i]; }
      }
      if (menorUp != null && vj > menorUp && (!pior || vj - menorUp > pior.diff)) {
        pior = { setor: CADEIA_SYNECO[j], valor: vj, setorUp, valorUp: menorUp, diff: vj - menorUp };
      }
    }
    if (pior) {
      furos[marca] = {
        cadeia,
        resumo: `${pior.setor} ${pior.valor} acima de ${pior.setorUp} ${pior.valorUp}`,
      };
    }
  }

  // Do setor em diante: quem já passou conta no "Total geral" da tela.
  const statusList = ORDEM.slice(ORDEM.indexOf(setorAtual));
  const adiantadas = Object.keys(apontamentos).filter((m) => apontamentos[m].produzido > 0);

  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      tipoPeca: "CONJUNTO",
      OR: [
        { status: { in: statusList } },
        ...(adiantadas.length ? [{ marca: { in: adiantadas }, fonte: "LPC_IMPORT" }] : []),
      ],
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
    take: 3000,
  });

  return { pecas, apontamentos, apontamentosProximo, furos };
}

const POS_CORTE_STATUS = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

/** Um croqui está CONSUMIDO quando todos os conjuntos que ele compõe já
 *  subiram para montagem+ (virou o conjunto — regra do Vitor). Croqui sem
 *  conjunto (avulso) nunca é consumido. */
export function croquiConsumido(conjuntosDoCroqui) {
  const sts = (conjuntosDoCroqui || []).map((c) => c?.status).filter(Boolean);
  return sts.length > 0 && sts.every((s) => POS_CORTE_STATUS.includes(s));
}

/** Produzido (Syneco) por marca num setor → mapa { [marca]: produzidoUn }.
 *  Leve: um findMany filtrado pelas marcas informadas. Usado p/ trazer o
 *  "feito" do setor em telas que não carregam o apontamento (ex.: Montagem). */
export async function produzidoPorMarca(setorSyneco, marcas) {
  if (!marcas?.length) return {};
  const rows = await prisma.mesOrdem.findMany({
    where: { setor: setorSyneco, item: { in: marcas } },
    select: { item: true, produzidoUn: true },
  });
  const m = {};
  for (const r of rows) m[r.item] = (m[r.item] || 0) + (r.produzidoUn || 0);
  return m;
}

/**
 * Corte "ativo": exclui croquis já consumidos (conjunto já subiu pra montagem).
 * Soma também conjuntos/avulsas que estejam em CORTE. Só obras LPC.
 * @returns {{ count, qte, kg, consumidos }}
 */
export async function resumoCorteAtivo() {
  const [croquis, outros] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { tipoPeca: "CROQUI", status: "CORTE", fonte: "LPC_IMPORT" },
      select: {
        qte: true,
        pesoTotalKg: true,
        croquiConjuntos: { select: { conjunto: { select: { status: true } } } },
      },
    }),
    prisma.pecaConjunto.aggregate({
      where: { status: "CORTE", fonte: "LPC_IMPORT", OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }] },
      _count: true,
      _sum: { qte: true, pesoTotalKg: true },
    }),
  ]);

  let count = 0, qte = 0, kg = 0, consumidos = 0;
  for (const c of croquis) {
    if (croquiConsumido(c.croquiConjuntos.map((x) => x.conjunto))) { consumidos += 1; continue; }
    count += 1;
    qte += c.qte || 0;
    kg += c.pesoTotalKg || 0;
  }
  count += outros._count || 0;
  qte += outros._sum.qte || 0;
  kg += outros._sum.pesoTotalKg || 0;
  return { count, qte, kg, consumidos };
}

/** Diferenças entre etapas de conjuntos da LPC atual, identificadas por OP e
 * obra Syneco. São ocorrências para conferência, não ordens de baixa. */
export async function listarFurosApontamento() {
  const pecas = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", naLPC: true, opId: { not: null },
      op: { status: { notIn: STATUS_OP_MORTA } } },
    select: { id: true, marca: true, opId: true, opNumero: true, qte: true,
      terceirizado: true, destinoTerceirizado: true, encaminhadoSetor: true,
      op: { select: { numero: true } } },
  });
  if (!pecas.length) return [];
  const marcas = [...new Set(pecas.map(p => p.marca))];
  const ordens = await prisma.mesOrdem.findMany({
    where: { opId: { in: [...new Set(pecas.map(p => p.opId))] },
      setor: { in: CADEIA_SYNECO }, item: { in: marcas } },
    select: { opId: true, obra: true, setor: true, item: true, produzidoUn: true,
      planejadoUn: true, op: true, operacao: true },
  });
  const inativos = await prisma.mesInativo.findMany({
    where: { item: { in: marcas } }, select: { op: true, item: true, operacao: true },
  });
  return conferirFurosApontamento({ pecas, ordens, inativos });
}
