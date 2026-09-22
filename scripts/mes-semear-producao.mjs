// SEMEIA O CADASTRO DO MES EM PRODUÇÃO — setores, postos e crachás.
//
//   node --experimental-loader ./scripts/mes-lab/alias-loader.mjs \
//        --env-file=.env.local scripts/mes-semear-producao.mjs --confirmo
//
// Matheus (22/09/2026): *"crie você mesmo o restante dos cadastros (…) preenche o restante conforme
// já falamos: os setores, máquinas e funcionários da fábrica"*.
//
// ⚠⚠ AS REGRAS SÃO AS MESMAS DO LABORATÓRIO (`scripts/mes-lab/semear-cadastro.mjs` e
// `semear-operadores.mjs`), e estão lá explicadas uma a uma. O que muda aqui é o DESTINO — o
// schema `mes` da produção — e o `ambiente`, que lá não existia e aqui é obrigatório.
//
// ⚠⚠ ESCREVE EM PRODUÇÃO, E POR ISSO EXIGE `--confirmo`. Idempotente: o que já existe é deixado
// como está (`update: {}`), então rodar de novo nunca desfaz uma edição feita pela tela. Para
// recomeçar do zero, `scripts/mes-zerar.mjs --confirmo`.
//
// ⚠⚠ SÓ O QUE ESTÁ NO GANTT (Matheus, 22/09/2026: *"crie somente o que está no Gantt, esqueça o
// Syneco por hora"*). A primeira versão trazia também os postos que só o histórico do Syneco
// conhece — ACABAMENTO 1…10, PINTURA AIR-LESS, furadeiras, plasmas, rosqueadeira. Saíram: o MES
// nasce com o vocabulário de quem PROGRAMA, e quem quiser um posto a mais cadastra pela tela.
//
// ⚠ O Syneco continua entrando como RÓTULO nos postos do Gantt (`codigoSyneco`, "40E", "09"),
// porque é o que permite conferir um contra o outro enquanto os dois rodam. Nenhum posto NASCE
// dele.
//
// ⚠ NÃO SEMEIA MOTIVO DE PARADA. O vocabulário de parada da fábrica não está medido em lugar
// nenhum do portal — inventá-lo aqui seria plantar uma lista que ninguém escolheu, no lugar onde o
// operador justifica máquina parada. Fica para a tela.

import { PrismaClient } from "@prisma/client";
import { PrismaClient as MesClient } from "../node_modules/.prisma/mes-client/index.js";
import { urlDoMes } from "@/lib/mes/prisma";
import { AMBIENTE } from "@/lib/mes/ambiente";
import { RECURSOS, SETORES, COR_SETOR } from "@/app/pcp/producao/_gantt/recursos";

const AMB = AMBIENTE.PROD;

if (!process.argv.includes("--confirmo")) {
  console.error("\n✗ Isto ESCREVE no MES de produção. Repita com --confirmo.\n");
  process.exit(1);
}

const portal = new PrismaClient();
const mes = new MesClient({ datasources: { db: { url: urlDoMes() } } });

/** ⚠ O Corte do Gantt é a PREPARAÇÃO do MES (Matheus, 10/09/2026) — ver §11.3 do doc. */
const SETOR_DO_GANTT = { CORTE: "PREPARACAO" };
const SETOR_DO_SYNECO = {
  Corte: "PREPARACAO", "Preparação": "PREPARACAO", Montagem: "MONTAGEM", Solda: "SOLDA",
  Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA",
};
const NOME_DO_SETOR = {
  PREPARACAO: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento",
  JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição",
};
/** Os setores do RH que são CHÃO DE FÁBRICA. ⚠ "Montagem Externa" fica fora: é montador de CAMPO. */
const SETOR_DA_FABRICA = {
  "Preparação": "PREPARACAO", "Montagem Interna": "MONTAGEM", Solda: "SOLDA",
  Acabamento: "ACABAMENTO", Acabador: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA",
  "Expedição": "EXPEDICAO",
};
const chave = (s) => String(s ?? "").toUpperCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
// ⚠⚠ "QUANTOS NASCERAM" É DIFERENÇA DE CONTAGEM, NÃO `createdAt === updatedAt` (corrigido na
// primeira execução real, 22/09/2026). Com `update: {}` o Prisma não toca em `updatedAt`, então
// uma linha que JÁ EXISTIA e nunca foi editada tem os dois carimbos iguais e se passava por nova:
// o script disse "7 setores novos" onde um deles tinha sido criado à mão pelo Matheus minutos
// antes. Contar antes e depois não tem como mentir.

async function semearSetores() {
  const antes = await mes.mesSetor.count();
  const criados = [];
  for (const [i, gantt] of SETORES.entries()) {
    const codigo = SETOR_DO_GANTT[gantt] || gantt;
    const dados = { nome: NOME_DO_SETOR[codigo] || codigo, ordem: (i + 1) * 10, cor: COR_SETOR[gantt] || null };
    criados.push(await mes.mesSetor.upsert({ where: { codigo }, update: {}, create: { codigo, ...dados } }));
  }
  console.log(`Setores: ${(await mes.mesSetor.count()) - antes} novo(s), ${criados.length} conferido(s)`);
  return new Map(criados.map((s) => [s.codigo, s.id]));
}

/** As máquinas que o portal VIU apontar no Syneco — dado nosso, sem credencial de fornecedor. */
async function maquinasVistas() {
  const linhas = await portal.mesApontamento.groupBy({
    by: ["codigoMaquina", "maquina", "setor"], _count: { _all: true },
  });
  return linhas.filter((l) => l.codigoMaquina && l.maquina)
    .map((l) => ({ codigoSyneco: l.codigoMaquina, nome: l.maquina, setor: l.setor }));
}

const acharSyneco = (vistas, { k, nome }) => {
  const alvos = [chave(k), chave(nome)].filter(Boolean);
  return vistas.find((v) => alvos.includes(chave(v.nome))) || null;
};

const porAmbiente = (codigo) => ({ codigo_ambiente: { codigo, ambiente: AMB } });

async function criarRecurso({ codigo, nome, setorId, codigoSyneco, tipo }) {
  return mes.mesRecurso.upsert({
    where: porAmbiente(codigo),
    update: {},                       // já existe → respeita o que a tela editou
    create: { codigo, nome, setorId, codigoSyneco: codigoSyneco || null, tipo, ambiente: AMB },
  });
}

async function semearRecursos(setores) {
  const antes = await mes.mesRecurso.count({ where: { ambiente: AMB } });
  const vistas = await maquinasVistas();
  const usadas = new Set();
  const feitos = [];

  for (const gantt of SETORES) {
    const codigoSetor = SETOR_DO_GANTT[gantt] || gantt;
    // ⚠ Entradas com `k: null` são o "sem bancada / atribuir" da tela do Gantt — opção de
    // interface, não recurso. Semear isso criaria uma máquina fantasma chamada "sem bancada".
    for (const rec of (RECURSOS[gantt] || []).filter((r) => r.k)) {
      const syneco = acharSyneco(vistas, rec);
      if (syneco) usadas.add(syneco.codigoSyneco);
      feitos.push(await criarRecurso({
        codigo: rec.k, nome: rec.nome, setorId: setores.get(codigoSetor),
        codigoSyneco: syneco?.codigoSyneco,
        tipo: gantt === "MONTAGEM" || gantt === "SOLDA" ? "BANCADA" : "MAQUINA",
      }));
    }
  }

  console.log(`Postos: ${(await mes.mesRecurso.count({ where: { ambiente: AMB } })) - antes} novo(s), ${feitos.length} conferido(s)`);
  await tirarOsQueNaoSaoDoGantt(feitos.map((r) => r.codigo));
}

/**
 * O QUE NÃO É DO GANTT SAI — mas só se nunca tiver sido usado.
 *
 * ⚠⚠ APAGAR POSTO COM APONTAMENTO SERIA APAGAR PRODUÇÃO. O `MesEvento` e a `MesSessao` apontam
 * para o recurso; um posto que já registrou trabalho vira dado histórico, não linha de cadastro.
 * Por isso a exclusão é CONDICIONADA e o que sobra é RELATADO — desativar ou renomear à mão é
 * decisão de quem olha, não de um script.
 */
async function tirarOsQueNaoSaoDoGantt(doGantt) {
  const forasteiros = await mes.mesRecurso.findMany({
    where: { ambiente: AMB, codigo: { notIn: doGantt } },
    select: { id: true, codigo: true, nome: true, _count: { select: { sessoes: true, eventos: true } } },
  });
  if (!forasteiros.length) return;

  const limpos = forasteiros.filter((r) => !r._count.sessoes && !r._count.eventos);
  const usados = forasteiros.filter((r) => r._count.sessoes || r._count.eventos);
  if (limpos.length) {
    await mes.mesRecurso.deleteMany({ where: { id: { in: limpos.map((r) => r.id) } } });
    console.log(`  ${limpos.length} posto(s) fora do Gantt removido(s): ${limpos.map((r) => r.nome).join(", ")}`);
  }
  if (usados.length) {
    console.log(`  ⚠ ${usados.length} posto(s) fora do Gantt MANTIDO(S) — já têm trabalho registrado:`);
    for (const r of usados) console.log(`      ${r.nome} (${r._count.sessoes} sessão/ões, ${r._count.eventos} evento(s))`);
  }
}

/**
 * OS CRACHÁS SÃO A MATRÍCULA DO RH.
 *
 * ⚠⚠ SÓ MATRÍCULA, NOME E O ID — a ficha de RH não viaja. O totem precisa de três campos para
 * reconhecer quem bipou; copiar CPF e salário para cá seria arrastar o RH para onde ele não é
 * preciso.
 *
 * ⚠ SEM MATRÍCULA NÃO HÁ CRACHÁ, e isso é RELATÓRIO, não descarte silencioso: a pessoa trabalha na
 * fábrica e simplesmente não vai conseguir abrir sessão. Quem lê precisa do nome para resolver no
 * RH, senão o problema aparece no totem, no meio do turno.
 */
async function semearOperadores() {
  const pessoas = await portal.funcionario.findMany({
    where: { ativo: true, status: "ATIVO", setor: { nome: { in: Object.keys(SETOR_DA_FABRICA) } } },
    select: { id: true, nome: true, matricula: true, setor: { select: { nome: true } } },
    orderBy: { nome: "asc" },
  });
  const antes = await mes.mesOperador.count({ where: { ambiente: AMB } });
  const semMatricula = pessoas.filter((p) => !p.matricula);
  const comCracha = pessoas.filter((p) => p.matricula);

  const feitos = [];
  for (const p of comCracha) {
    const cracha = String(p.matricula).trim();
    feitos.push(await mes.mesOperador.upsert({
      where: { cracha_ambiente: { cracha, ambiente: AMB } },
      update: {},
      create: { cracha, nome: p.nome, funcionarioId: p.id, ambiente: AMB },
    }));
  }
  console.log(`Crachás: ${(await mes.mesOperador.count({ where: { ambiente: AMB } })) - antes} novo(s), ${comCracha.length} com matrícula no RH`);
  porSetor(comCracha);
  if (semMatricula.length) {
    console.log(`  ⚠ Sem matrícula no RH (${semMatricula.length}) — não conseguem bipar:`);
    for (const p of semMatricula) console.log(`      ${p.nome} (${p.setor.nome})`);
  }
}

function porSetor(pessoas) {
  const mapa = new Map();
  for (const p of pessoas) {
    const s = SETOR_DA_FABRICA[p.setor.nome];
    mapa.set(s, (mapa.get(s) || 0) + 1);
  }
  console.log(`  por setor: ${[...mapa].sort().map(([s, n]) => `${s} ${n}`).join(" · ")}`);
}

async function main() {
  console.log(`MES de PRODUÇÃO, ambiente ${AMB}\n`);
  const setores = await semearSetores();
  await semearRecursos(setores);
  await semearOperadores();

  // ⚠⚠ CONTAR NO DESTINO, e não somar as gravações — é a diferença entre "mandei criar" e "existe".
  const [s, r, o] = await Promise.all([
    mes.mesSetor.count(), mes.mesRecurso.count({ where: { ambiente: AMB } }),
    mes.mesOperador.count({ where: { ambiente: AMB } }),
  ]);
  console.log(`\nContado no banco: ${s} setores · ${r} postos · ${o} crachás`);
}

main()
  .catch((e) => { console.error("\nERRO:", e.message); process.exitCode = 1; })
  .finally(async () => { await portal.$disconnect(); await mes.$disconnect(); });
