// SEMEIA SETORES E RECURSOS DO MES — a partir do vocabulário do GANTT, não do Syneco.
//
//   MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//   node --experimental-loader ./scripts/mes-lab/alias-loader.mjs \
//        --env-file=.env.local scripts/mes-lab/semear-cadastro.mjs
//
// ⚠⚠ BOOTSTRAP DE UMA VEZ, NÃO FONTE PERMANENTE. Depois deste script, quem manda é o banco — é lá
// que as telas de criar/excluir setor e bancada vão escrever (`docs/mes-proprio.md` §11.4). Rodar
// de novo NÃO desfaz edição feita por tela: recurso que já existe é deixado como está.
//
// ⚠ Matheus (10/09/2026): "o ideal não é usar os dados do Syneco para fazer nosso MES, o ideal é
// usar as funcionalidades dele para criar o nosso com nossa cara". Por isso o código do recurso é
// a chave do Gantt ("SOLDA 5", "LASER_CHAPA") — a mesma que `PecaConjunto.soldaBancada` já grava —
// e o código do Syneco ("40E", "09") entra só como campo de reconciliação.

import { PrismaClient } from "@prisma/client";
import { exigirLaboratorio, exigirOrigem } from "./destino.mjs";
import { RECURSOS, SETORES, COR_SETOR } from "@/app/pcp/producao/_gantt/recursos";

let ORIGEM, LAB;
try {
  ORIGEM = exigirOrigem(process.env.DATABASE_URL);
  LAB = exigirLaboratorio(process.env.MES_LAB_URL);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}

const origem = new PrismaClient({ datasources: { db: { url: ORIGEM } } });
const lab = new PrismaClient({ datasources: { db: { url: LAB } } });

/**
 * ⚠⚠ CORTE VIRA PREPARAÇÃO, E ABSORVE AS MÁQUINAS `20x`. Matheus (10/09/2026): "o Corte vai ser
 * Preparação o nome do setor". No Syneco eram DOIS setores — Corte (op 10, os lasers, ativo hoje)
 * e Preparação (op 20, furadeira/plasma/rosqueadeira, parada desde 05/02/2026). Os dois viraram um.
 * Ver `docs/mes-proprio.md` §11.3, com a conferência que provou que não é só troca de rótulo.
 */
const SETOR_DO_GANTT = { CORTE: "PREPARACAO" };
/** Nomes de setor como o Syneco grava → o nosso código de setor. */
const SETOR_DO_SYNECO = {
  Corte: "PREPARACAO", "Preparação": "PREPARACAO", Montagem: "MONTAGEM", Solda: "SOLDA",
  Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA",
};
const NOME_DO_SETOR = {
  PREPARACAO: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento",
  JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição",
};

const chave = (s) => String(s ?? "").toUpperCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");

async function semearSetores() {
  // A ordem da lista do Gantt É a cadeia física da fábrica — e é por isso que ela vira `ordem` no
  // banco em vez de um array fixo no código (ver o comentário do model MesSetor).
  const criados = [];
  for (const [i, gantt] of SETORES.entries()) {
    const codigo = SETOR_DO_GANTT[gantt] || gantt;
    const dados = { nome: NOME_DO_SETOR[codigo] || codigo, ordem: (i + 1) * 10, cor: COR_SETOR[gantt] || null };
    criados.push(await lab.mesSetor.upsert({ where: { codigo }, update: dados, create: { codigo, ...dados } }));
  }
  console.log(`Setores: ${criados.map((s) => s.nome).join(", ")}`);
  return new Map(criados.map((s) => [s.codigo, s.id]));
}

/**
 * As máquinas que o portal viu apontar, com o código do Syneco.
 *
 * ⚠ VEM DO NOSSO `MesApontamento`, não da API do SKA. É o histórico que o portal já recebe há 19
 * meses — dado nosso, sem credencial de fornecedor no meio.
 */
async function maquinasVistas() {
  const linhas = await origem.mesApontamento.groupBy({
    by: ["codigoMaquina", "maquina", "setor"],
    _count: { _all: true },
  });
  return linhas
    .filter((l) => l.codigoMaquina && l.maquina)
    .map((l) => ({ codigoSyneco: l.codigoMaquina, nome: l.maquina, setor: l.setor, vezes: l._count._all }));
}

/** O recurso do Gantt casa com a máquina do Syneco pela CHAVE ou pelo NOME — "SOLDA 5" ou "Laser Chapa". */
function acharSyneco(vistas, { k, nome }) {
  const alvos = [chave(k), chave(nome)].filter(Boolean);
  return vistas.find((v) => alvos.includes(chave(v.nome))) || null;
}

/**
 * ⚠⚠ ONDE O GANTT PLANEJA EM BALDE, O TOTEM PRECISA DO POSTO FÍSICO.
 *
 * O Gantt e o totem medem coisas diferentes, e isso só apareceu com o dado na mão:
 *
 * - **Acabamento**: o Gantt tem UMA bancada — decisão do Vitor (06/09/2026: "não temos bancadas
 *   (…) a bancada única do acabamento"), certa para PLANEJAR, porque ali a capacidade é kg/dia. Mas
 *   o chão teve **7 postos apontando no mesmo dia**. Com um recurso só e a trava de uma sessão
 *   aberta por recurso, a segunda pessoa do dia não conseguiria abrir sessão — a trava viraria
 *   impedimento.
 * - **Pintura**: o Gantt fala em GALPÃO (onde) e o apontamento em MÁQUINA (com o quê). São eixos
 *   diferentes, e a Air-less, com 8.440 apontamentos, é a máquina mais movimentada da fábrica.
 *
 * Planejamento e execução podem ter granularidades diferentes sem virar duas verdades: o vínculo
 * entre elas é o SETOR. Matheus decidiu por estes dois em 10/09/2026.
 *
 * ⚠ O JATO NÃO ENTRA AQUI, e a exceção é deliberada. O Gantt tem Turbina e Manual — duas máquinas
 * FÍSICAS (Vitor: "temos dois jatos, o turbina e o manual") — enquanto o Syneco cadastra as duas
 * sob um `60A` só. Ali o Gantt é o mais PRECISO dos dois, não o mais grosso. Trocar pelos dados do
 * histórico perderia a distinção e faria o totem não achar o `jatoBancada = "JATO_MANUAL"` que o
 * Gantt já gravou em 22 peças.
 */
const POSTOS_DO_HISTORICO = new Set(["ACABAMENTO", "PINTURA"]);

async function semearRecursos(setores) {
  const vistas = await maquinasVistas();
  const usadas = new Set();
  let novos = 0, existentes = 0;

  for (const gantt of SETORES) {
    const codigoSetor = SETOR_DO_GANTT[gantt] || gantt;
    if (POSTOS_DO_HISTORICO.has(codigoSetor)) continue;   // semeado do histórico, mais abaixo
    const setorId = setores.get(codigoSetor);
    // ⚠ Entradas com `k: null` são o "sem bancada / atribuir" da tela do Gantt — opção de interface,
    // não recurso. Semear isso criaria uma máquina fantasma chamada "sem bancada".
    for (const rec of (RECURSOS[gantt] || []).filter((r) => r.k)) {
      const syneco = acharSyneco(vistas, rec);
      if (syneco) usadas.add(syneco.codigoSyneco);
      const criado = await lab.mesRecurso.upsert({
        where: { codigo: rec.k },
        update: {},                       // já existe → respeita o que a tela editou
        create: {
          codigo: rec.k, nome: rec.nome, setorId,
          codigoSyneco: syneco?.codigoSyneco || null,
          tipo: gantt === "MONTAGEM" || gantt === "SOLDA" ? "BANCADA" : "MAQUINA",
        },
      });
      criado.createdAt.getTime() === criado.updatedAt.getTime() ? novos++ : existentes++;
    }
  }

  await semearPostosFisicos(setores, vistas, usadas);

  // ⚠⚠ SÓ AS MÁQUINAS DA PREPARAÇÃO DO SYNECO ENTRAM ALÉM DO GANTT — o resto do histórico FICA DE
  // FORA, e isso é o ponto todo.
  //
  // A primeira versão semeava toda máquina vista no histórico e trouxe 28 a mais: 10 bancadas de
  // ACABAMENTO (onde o Vitor decidiu que há UMA — "não temos bancadas (…) a bancada única do
  // acabamento"), a SOLDA 3 e a SOLDA 8 (que a lista `BANCADAS` exclui de propósito), um terceiro
  // JATO e duas PINTURAs somadas aos dois galpões. Ou seja: eu tinha recriado os "recursos mortos"
  // que adotar o vocabulário do Gantt existia justamente para descartar.
  //
  // O Gantt é lista CURADA — o que não está nela, não está por decisão de quem programa. A única
  // exceção é a que o Matheus pediu (§11.3): as máquinas que o Syneco chamava de "Preparação"
  // (furadeira magnética, plasma manual, rosqueadeira) juntam-se aos lasers no setor Preparação.
  // Elas apontam de verdade e o Gantt nunca as programou, então sem esta linha o totem delas não
  // existiria.
  const doHistorico = vistas.filter((v) => !usadas.has(v.codigoSyneco) && SETOR_DO_SYNECO[v.setor]);
  const entram = doHistorico.filter((v) => v.setor === "Preparação");
  for (const m of entram) {
    await lab.mesRecurso.upsert({
      where: { codigo: chave(m.nome) },
      update: {},
      create: {
        codigo: chave(m.nome), nome: m.nome, setorId: setores.get("PREPARACAO"),
        codigoSyneco: m.codigoSyneco, tipo: "MAQUINA",
      },
    });
  }
  console.log(`Recursos do Gantt: ${novos} novo(s), ${existentes} já existia(m)`);
  console.log(`Máquinas da Preparação do Syneco: ${entram.length}`);
  relatarDeFora(doHistorico.filter((v) => v.setor !== "Preparação"));
}

/** Os postos que só o histórico conhece: Acabamento e Pintura (ver `POSTOS_DO_HISTORICO`). */
async function semearPostosFisicos(setores, vistas, usadas) {
  const alvo = vistas.filter((v) => POSTOS_DO_HISTORICO.has(SETOR_DO_SYNECO[v.setor] || ""));
  for (const m of alvo) {
    usadas.add(m.codigoSyneco);
    await lab.mesRecurso.upsert({
      where: { codigo: chave(m.nome) },
      update: {},
      create: {
        codigo: chave(m.nome), nome: m.nome, codigoSyneco: m.codigoSyneco,
        setorId: setores.get(SETOR_DO_SYNECO[m.setor]),
        tipo: SETOR_DO_SYNECO[m.setor] === "ACABAMENTO" ? "BANCADA" : "MAQUINA",
      },
    });
  }
  console.log(`Postos físicos (Acabamento e Pintura, do histórico): ${alvo.length}`);
}

/**
 * O QUE FICOU DE FORA É RELATÓRIO, NÃO SILÊNCIO.
 *
 * ⚠ Estas máquinas apontaram de verdade no Syneco e NÃO entram no cadastro, porque o Gantt não as
 * lista. Isso é uma decisão de quem programa a fábrica, não um bug — mas precisa ser VISÍVEL: se
 * uma delas ainda for usada no chão, o totem dela não vai existir e alguém vai descobrir isso na
 * pior hora. Imprimir a lista é o que transforma "esqueci" em "decidi".
 */
function relatarDeFora(deFora) {
  if (!deFora.length) return;
  console.log(`\nVistas no histórico e NÃO cadastradas (${deFora.length}) — o Gantt não as lista:`);
  const porSetor = new Map();
  for (const m of deFora.sort((a, b) => b.vezes - a.vezes)) {
    if (!porSetor.has(m.setor)) porSetor.set(m.setor, []);
    porSetor.get(m.setor).push(`${m.nome} [${m.codigoSyneco}] ×${m.vezes}`);
  }
  for (const [setor, itens] of porSetor) console.log(`  ${setor}: ${itens.join(" · ")}`);
  console.log("  → se alguma ainda for usada no chão, cadastre pela tela (ou acrescente ao Gantt).");
}

async function conferir() {
  console.log("\nNo laboratório, contado no destino:");
  for (const s of await lab.mesSetor.findMany({ orderBy: { ordem: "asc" }, include: { recursos: true } })) {
    const nomes = s.recursos.map((r) => `${r.nome}${r.codigoSyneco ? ` [${r.codigoSyneco}]` : ""}`);
    console.log(`  ${String(s.ordem).padStart(3)} ${s.nome.padEnd(12)} ${s.recursos.length} recurso(s)`);
    if (nomes.length) console.log(`      ${nomes.join(" · ")}`);
  }
  const semSyneco = await lab.mesRecurso.count({ where: { codigoSyneco: null } });
  console.log(`\nSem código do Syneco (nunca apontaram, ou o Gantt inventou): ${semSyneco}`);
}

semearSetores()
  .then(semearRecursos)
  .then(conferir)
  .catch((e) => { console.error("\nERRO:", e.message); process.exitCode = 1; })
  .finally(async () => { await origem.$disconnect(); await lab.$disconnect(); });
