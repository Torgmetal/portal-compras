import "server-only";
import { prisma } from "./prisma";
import { custoDoConjunto as custoMontagem, RITMO_NORMAL } from "./montagem-capacidade";
import { custoDoConjunto as custoSolda, RITMO_CONSERVADOR } from "./solda-capacidade";
import { lerProduzidoPorSetor } from "./produzido-setor";

// ─── O QUE ESTÁ PROGRAMADO, EM UMA GRADE SÓ ────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "na página do PCP, quero que crie acima desse painel um gantt que seja
// visualmente fácil de ver, esse gantt tem que ser possível de migrar as programações entre setores
// e dias arrastando elas".
//
// ⚠⚠ NÃO É UMA PROGRAMAÇÃO NOVA. Os três setores já gravam dia e recurso na própria peça
// (`corteDiaProgramado`+`maquina`, `montagemDiaProgramado`+`montagemBancada`,
// `soldaDiaProgramado`+`soldaBancada`). O Gantt só LÊ esses campos e devolve agrupado; arrastar
// escreve de volta nos MESMOS campos. Criar um modelo próprio de "programação" faria o portal ter
// duas verdades sobre o mesmo dia.
//
// ⚠ A UNIDADE É O LOTE: setor + recurso + OP + dia. É assim que a fábrica enxerga ("a 097 na
// montagem 1 na quarta") e é o menor bloco que faz sentido arrastar inteiro. Dentro dele vão as
// marcas, porque é delas que sai a lista de projetos e a divisão entre bancadas.
//
// ⚠ O CUSTO VEM DAS RÉGUAS QUE JÁ EXISTEM (lib/montagem-capacidade, lib/solda-capacidade), não de
// uma conta nova aqui. Montagem = o maior entre peças/faixa e 7 t por bancada-dia; solda =
// peças/faixa. Corte não tem custo em dias: mede-se em kg contra a capacidade da máquina, e isso
// a tela resolve, porque a capacidade é do RECURSO e não da peça.

const iso = (d) => new Date(d).toISOString().slice(0, 10);

const SELECAO = {
  id: true, opId: true, opNumero: true, marca: true, qte: true, qteProduzida: true,
  pesoTotalKg: true, perfil: true, op: { select: { numero: true, obra: true } },
};

// ⚠ O "feito" NÃO sai de `qteProduzida` — aquele campo só é escrito pelo import de corte e devolve
// zero em montagem e solda. A conta canônica mora em lib/produzido-setor.js, com a medição que
// motivou a separação. Foi este quadro que expôs o problema (OP-097 mostrava "0 de 242 feitas" com
// metade da obra montada), mas o erro não era só daqui.

/** Todas as programações vivas dos três setores, agrupadas em lotes. */
export async function lotesProgramados() {
  const [corte, montagem, solda, acabamento, jato] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { corteDiaProgramado: { not: null } },
      select: { ...SELECAO, corteDiaProgramado: true, corteAdiado: true, maquina: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { montagemDiaProgramado: { not: null } },
      select: { ...SELECAO, montagemDiaProgramado: true, montagemAdiado: true, montagemBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { soldaDiaProgramado: { not: null } },
      select: { ...SELECAO, soldaDiaProgramado: true, soldaBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { acabamentoDiaProgramado: { not: null } },
      select: { ...SELECAO, acabamentoDiaProgramado: true, acabamentoBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { jatoDiaProgramado: { not: null } },
      select: { ...SELECAO, jatoDiaProgramado: true, jatoBancada: true },
    }),
  ]);

  // ⚠ A GRD É POR (opNumero da OP, marca) — é assim que lib/desenhos-lote.js grava. Sem ela o
  // Gantt não consegue responder "esse projeto já foi impresso?", que é a pergunta de quem vai
  // liberar o maço. Uma consulta só para todas as marcas: por marca seriam milhares.
  const marcas = [...new Set([...corte, ...montagem, ...solda].map((p) => p.marca))];
  const grds = marcas.length
    ? await prisma.grdLiberacao.findMany({
        where: { marca: { in: marcas } },
        select: { opNumero: true, marca: true, impressoes: true, ultimaImpressaoEm: true,
                  createdAt: true, liberadoPorNome: true, formato: true },
      })
    : [];
  const chave = (op, m) => `${op}|${String(m).trim().toUpperCase()}`;
  const porMarca = new Map();
  for (const g of grds) {
    const k = chave(g.opNumero, g.marca);
    const em = g.ultimaImpressaoEm || g.createdAt;
    const atual = porMarca.get(k);
    // a mais recente manda, mas as cópias somam: o que interessa é "quando foi a última e quantas"
    if (!atual) porMarca.set(k, { em, por: g.liberadoPorNome, n: g.impressoes, fm: g.formato });
    else { atual.n += g.impressoes; if (+em > +atual.em) { atual.em = em; atual.por = g.liberadoPorNome; atual.fm = g.formato; } }
  }

  // ⚠ uma consulta só para os três setores: por peça seriam milhares.
  const feitoDe = await lerProduzidoPorSetor([...corte, ...montagem, ...solda, ...acabamento, ...jato], SETORES_GANTT);

  const lotes = new Map();
  const juntar = (setor, recurso, dia, p, custo, adiado) => {
    const op = p.op?.numero || p.opNumero || "?";
    const k = `${setor}|${recurso || "—"}|${op}|${dia}`;
    let l = lotes.get(k);
    if (!l) {
      l = { id: k, setor, recurso: recurso || null, dia, op, obra: p.op?.obra || null,
            pecas: 0, kg: 0, custo: 0, feitas: 0, adiado: 0, itens: [] };
      lotes.set(k, l);
    }
    const qte = Math.max(1, p.qte || 1);
    const kg = p.pesoTotalKg || 0;
    const feito = Math.min(feitoDe(p, setor), qte);
    l.pecas += qte; l.kg += kg; l.feitas += feito; l.custo += custo;
    l.adiado = Math.max(l.adiado, adiado || 0);
    const g = porMarca.get(chave(op, p.marca));
    l.itens.push({
      id: p.id, m: p.marca, q: qte, kg: Math.round(kg), c: Math.round(custo * 1000) / 1000,
      ...(feito ? { f: feito } : {}),
      ...(p.perfil ? { pf: p.perfil } : {}),
      ...(g ? { g: { em: iso(g.em), por: g.por || null, n: g.n, fm: g.fm || null } } : {}),
    });
  };

  // ⚠ o custo é do que FALTA (`qtePendente`): conjunto com 4 peças e 3 prontas não custa 4 — a
  // regra já está nas duas libs de capacidade, aqui só se informa o pendente.
  // ⚠ o custo é do que FALTA (`qtePendente`): conjunto com 4 peças e 3 prontas não custa 4 — a
  // regra já está nas duas libs de capacidade, aqui só se informa o pendente. Isto também estava
  // saindo de `qteProduzida`, então a ocupação de montagem e solda vinha SUPERESTIMADA desde que o
  // quadro existe: conjunto já montado continuava contando como trabalho a fazer.
  const pendente = (p, setor) =>
    ({ ...p, qtePendente: Math.max(0, (p.qte || 1) - feitoDe(p, setor)) });

  for (const p of corte) juntar("CORTE", p.maquina, iso(p.corteDiaProgramado), p, 0, p.corteAdiado);
  for (const p of montagem) juntar("MONTAGEM", p.montagemBancada, iso(p.montagemDiaProgramado), p,
    custoMontagem(pendente(p, "MONTAGEM"), RITMO_NORMAL), p.montagemAdiado);
  for (const p of solda) juntar("SOLDA", p.soldaBancada, iso(p.soldaDiaProgramado), p,
    custoSolda(pendente(p, "SOLDA"), RITMO_CONSERVADOR), 0);
  // ⚠ acabamento e jato NÃO têm régua de peças por faixa: o custo é o próprio peso, medido contra a
  // capacidade em kg/dia do recurso — igual ao corte. A tela resolve a divisão, como já faz lá.
  for (const p of acabamento) juntar("ACABAMENTO", p.acabamentoBancada, iso(p.acabamentoDiaProgramado), p, 0, 0);
  for (const p of jato) juntar("JATO", p.jatoBancada, iso(p.jatoDiaProgramado), p, 0, 0);

  const saida = [...lotes.values()].map((l) => ({
    ...l, kg: Math.round(l.kg), custo: Math.round(l.custo * 100) / 100,
  }));
  saida.sort((a, b) => a.dia.localeCompare(b.dia) || a.setor.localeCompare(b.setor)
    || String(a.recurso).localeCompare(String(b.recurso)));
  return saida;
}

// ─── GRAVAR O QUE FOI ARRASTADO ────────────────────────────────────────────────────────────────
//
// ⚠⚠ ARRASTAR PARA FRENTE É ADIAR; PARA TRÁS NÃO É. O contador (`corteAdiado`/`montagemAdiado`) e o
// `*DiaOriginal` existem para que puxar a peça a semana inteira apareça — se o remanejo mexesse nos
// dois, o atraso sumiria do relatório. Então: o ORIGINAL só se escreve uma vez, e o contador só
// sobe quando o dia novo é DEPOIS do que estava lá.
//
// ⚠ SOLTAR NA LINHA "SEM BANCADA" TIRA SÓ O RECURSO, não o dia. É diferente da rota da solda, que
// ao limpar a bancada limpa o dia junto — lá "sem bancada" quer dizer desprogramar; aqui é uma
// LINHA do quadro, onde a programação fica esperando bancada no mesmo dia. Apagar o dia faria a
// barra sumir da tela em que a pessoa acabou de largá-la.
// ⚠⚠ ACABAMENTO E JATO ENTRARAM EM 06/09/2026. Vitor: "o Gantt ficou muito didático para
// visualizar e programar (…) teria que ficar primeiramente em uma fila sem bancada, depois
// selecionar a bancada única do acabamento e jato". Antes disto a obra sumia do quadro depois da
// solda — e é justamente onde a fila é mais longa (acabamento 18 dias, jato 14,7).
//
// ⚠ BANCADA ÚNICA ≠ SEM BANCADA. Com uma bancada NOMEADA, os dois setores ficam estruturalmente
// idênticos a montagem e solda: mesma fila de entrada, mesma faixa, mesmo arraste. O quadro não
// ganha conceito novo — só mais duas linhas.
//
// ⚠ A PINTURA FICOU DE FORA de propósito: as colunas existem no banco, mas Vitor ainda vai passar a
// regra dela ("pintura vou ajustar uma informação com você depois"). Ligar aqui sem a regra seria
// inventar uma programação que ninguém pediu.
const CAMPO = {
  CORTE: { dia: "corteDiaProgramado", original: "corteDiaOriginal", adiado: "corteAdiado", recurso: "maquina" },
  MONTAGEM: { dia: "montagemDiaProgramado", original: "montagemDiaOriginal", adiado: "montagemAdiado", recurso: "montagemBancada" },
  SOLDA: { dia: "soldaDiaProgramado", original: null, adiado: null, recurso: "soldaBancada" },
  ACABAMENTO: { dia: "acabamentoDiaProgramado", original: null, adiado: null, recurso: "acabamentoBancada" },
  JATO: { dia: "jatoDiaProgramado", original: null, adiado: null, recurso: "jatoBancada" },
};

export const SETORES_GANTT = Object.keys(CAMPO);

/**
 * Aplica os blocos remanejados. Cada bloco é `{ setor, ids[], recurso|null, dia "YYYY-MM-DD" }`.
 * Devolve quantas peças mudaram de fato, por setor.
 */
export async function aplicarRemanejo(blocos, user) {
  const agora = new Date();
  const porSetor = {};
  let total = 0;

  for (const b of blocos) {
    const campos = CAMPO[b.setor];
    if (!campos || !b.ids?.length) continue;
    const data = new Date(`${b.dia}T00:00:00Z`); // @db.Date: meia-noite UTC, sem converter fuso

    const antes = await prisma.pecaConjunto.findMany({
      where: { id: { in: b.ids } },
      select: { id: true, [campos.dia]: true, ...(campos.original ? { [campos.original]: true } : {}) },
    });
    const paraFrente = antes.filter((p) => p[campos.dia] && +new Date(p[campos.dia]) < +data).map((p) => p.id);
    const semOriginal = campos.original ? antes.filter((p) => !p[campos.original]).map((p) => p.id) : [];

    const escrita = { [campos.dia]: data, [campos.recurso]: b.recurso || null };
    if (b.setor === "MONTAGEM") {
      escrita.montagemBancadaEm = b.recurso ? agora : null;
      escrita.montagemProgramadaEm = agora;
      escrita.montagemProgramadaPor = user?.name || null;
    }
    if (b.setor === "SOLDA") {
      escrita.soldaBancadaEm = b.recurso ? agora : null;
      escrita.soldaBancadaPor = b.recurso ? (user?.name || null) : null;
    }

    const r = await prisma.pecaConjunto.updateMany({ where: { id: { in: b.ids } }, data: escrita });
    if (semOriginal.length) {
      await prisma.pecaConjunto.updateMany({ where: { id: { in: semOriginal } }, data: { [campos.original]: data } });
    }
    if (campos.adiado && paraFrente.length) {
      await prisma.pecaConjunto.updateMany({ where: { id: { in: paraFrente } }, data: { [campos.adiado]: { increment: 1 } } });
    }

    porSetor[b.setor] = (porSetor[b.setor] || 0) + r.count;
    total += r.count;
  }

  return { total, porSetor };
}
