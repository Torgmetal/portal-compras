// POST /api/producao/pecas/importar-lpc
// Recebe { rows: [...], opNumero?: string, sobrescrever?: boolean }
// Parseia LPC, cria PecaConjunto + ConjuntoCroqui
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseLPC } from "@/lib/parse-lpc";
import { chaveParaOParser, chaveAjustadaPeloBanco, ehSoNumero } from "@/lib/lpc-chave";
import { classificarMaquina } from "@/lib/maquina-corte";
import { chaveDaPeca } from "@/lib/liberacao-pecas";
import { gravarPecasLpc, gravarRelacoesLpc, emParalelo, PARALELO } from "@/lib/lpc-gravar";
import { log } from "@/lib/log";

const registro = log("api/producao/pecas/importar-lpc");

export const runtime = "nodejs";
export const maxDuration = 300; // a gravação é em lote (lib/lpc-gravar.js); peça a peça, a T118B estourava até os 300 s

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { rows, opNumero: opForcada, sobrescrever, arquivoNome } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Envie 'rows' como array da planilha parseada" }, { status: 400 });
  }

  // A CHAVE da lista é a FASE (ex.: T83F), NÃO a OP (083): cada fase é uma lista
  // própria (T83F e T83D coexistem). Prioridade: fase no nome do arquivo
  // (T83F-LPC) > fase/OP selecionada > detecção automática pela marca.
  // ⚠⚠ O NÚMERO DA OP ESCOLHIDO NA TELA ("094") NÃO É A CHAVE — a chave é a FASE (T94A). Ver lib/lpc-chave.js
  // (OP-094, 14/09/2026: 591 marcas duplicadas por a mesma LPC ter entrado sob "094" e sob "T94A").
  const chave = chaveParaOParser({ arquivoNome, opForcada });
  let parsed = parseLPC(rows, { opNumeroForcado: chave });
  if (!parsed.erro && !parsed.opNumero && opForcada) parsed = parseLPC(rows, { opNumeroForcado: opForcada });
  if (parsed.erro) {
    return NextResponse.json({ error: parsed.erro }, { status: 400 });
  }

  let opNumero = parsed.opNumero;
  if (!opNumero) {
    return NextResponse.json({ error: "Não consegui detectar a fase/OP. Nomeie o arquivo com a fase (ex.: T83F-LPC) ou selecione a OP e importe de novo." }, { status: 400 });
  }

  const totalPecas = parsed.conjuntos.length + parsed.croquis.length + parsed.avulsas.length;
  if (totalPecas === 0) {
    return NextResponse.json({ error: "Nenhuma peca encontrada na planilha." }, { status: 400 });
  }

  // Resolve o opId pela OP correspondente aos DÍGITOS (todas as fases da OP —
  // T83F, T83D… — compartilham o mesmo opId). Usa a OP selecionada, senão os
  // dígitos da fase. Sem isso, a chave por fase (T83F) não acharia a OP.
  const digitosDe = (s) => (String(s || "").match(/\d+/) || [])[0];
  const cands = new Set();
  for (const src of [opForcada, opNumero]) { const d = digitosDe(src); if (d) { cands.add(d); cands.add(d.padStart(3, "0")); cands.add(String(Number(d))); } }
  const op = cands.size ? await prisma.oP.findFirst({ where: { numero: { in: [...cands] } } }) : null;
  // chave só numérica com uma lista já gravada sob a fase (ex.: "094" × "T94A" existente): usa a existente
  let chaveAjustada = null;
  let chaveConflito = null;
  if (op && ehSoNumero(opNumero)) {
    const existentes = (await prisma.pecaConjunto.groupBy({ by: ["opNumero"], where: { opId: op.id, fonte: "LPC_IMPORT" } })).map((e) => e.opNumero);
    const para = chaveAjustadaPeloBanco(opNumero, existentes);
    if (para) { chaveAjustada = { de: opNumero, para }; opNumero = para; parsed = { ...parsed, opNumero }; }
    else {
      /* ⚠⚠ DUAS CHAVES PARA A MESMA MARCA = LINHA DUPLICADA, E ISSO PASSAVA CALADO (OP-83, 17/09/2026).
       * A engenharia subiu a lista corrigida cobrindo VÁRIAS fases, então nenhuma fase isolada servia
       * de chave e sobrou o número da obra ("083"). Como a peça é única por (opNumero, marca), as
       * marcas que já existiam sob "T83A".."T83D" NÃO foram atualizadas: nasceram linhas paralelas, e
       * 83 conjuntos passaram a aparecer DUAS vezes na fila do Planejamento. Vitor: "o portal não
       * reconheceu isso e as peças erradas permanecem na fila do planejamento ainda".
       *
       * Não dá para escolher a fase sozinho quando o arquivo mistura várias — mas dá para DIZER, com
       * nome e número, em vez de duplicar em silêncio. A tela mostra o aviso e o Planejamento tira a
       * linha que não vale (o cartão marca as repetidas). */
      const porFase = existentes.filter((e) => e && e !== opNumero && !ehSoNumero(e));
      if (porFase.length) {
        const marcasDoArquivo = new Set([...parsed.conjuntos, ...parsed.croquis, ...parsed.avulsas].map((x) => String(x.marca || "").trim().toUpperCase()).filter(Boolean));
        const jaExistem = marcasDoArquivo.size
          ? await prisma.pecaConjunto.findMany({
              where: { opId: op.id, opNumero: { in: porFase }, marca: { in: [...marcasDoArquivo] } },
              select: { marca: true, opNumero: true }, take: 3000,
            })
          : [];
        if (jaExistem.length) {
          chaveConflito = {
            chave: opNumero,
            fases: [...new Set(jaExistem.map((x) => x.opNumero))].sort(),
            marcas: jaExistem.length,
            exemplos: jaExistem.slice(0, 5).map((x) => `${x.marca} (${x.opNumero})`),
          };
        }
      }
    }
  }

  // Diff da revisão (o que mudou vs a lista anterior): snapshot das marcas+peso
  // ANTES do upsert. incluídas = novas; removidas = sumiram; alteradas = peso mudou.
  const antesPecas = await prisma.pecaConjunto.findMany({ where: { opNumero, fonte: "LPC_IMPORT" }, select: { marca: true, pesoTotalKg: true } });
  const pesoAntes = new Map(antesPecas.map((p) => [p.marca, Number(p.pesoTotalKg) || 0]));
  const novasPecas = new Map();
  for (const c of [...parsed.conjuntos, ...parsed.croquis, ...parsed.avulsas]) novasPecas.set(c.marca, Number(c.pesoTotalKg) || 0);
  const diffIncluidas = [], diffAlteradas = [];
  for (const [marca, peso] of novasPecas) {
    if (!pesoAntes.has(marca)) diffIncluidas.push({ marca, peso });
    else if (Math.abs(pesoAntes.get(marca) - peso) > 0.01) diffAlteradas.push({ marca, de: pesoAntes.get(marca), para: peso });
  }
  const diffRemovidas = [...pesoAntes.entries()].filter(([m]) => !novasPecas.has(m)).map(([marca, peso]) => ({ marca, peso }));
  const diff = {
    incluidas: diffIncluidas, removidas: diffRemovidas, alteradas: diffAlteradas,
    nIncluidas: diffIncluidas.length, nRemovidas: diffRemovidas.length, nAlteradas: diffAlteradas.length,
  };

  // Sobrescrever: a marca sai da LPC — mas SÓ SOME se não estiver também na LE.
  //
  // ⚠⚠ APAGAR POR `fonte` ERA O QUE DESTRUÍA A OUTRA LISTA. Vitor (02/09/2026): "precisamos
  // consertar isso, não pode ser feito gambiarra mais". Uma marca que está nas duas listas mora
  // numa linha só (por causa do @@unique[opNumero, marca]); apagá-la porque saiu da LPC levava
  // junto a presença dela na LE. Agora: quem está nas duas perde só o `naLPC`; quem era só da LPC
  // é apagada de fato.
  // ⚠⚠ QUEM VAI SER APAGADO, GUARDADO ANTES — é o que salva a programação do Planejamento.
  //
  // Vitor (03/09/2026): "me explica melhor o porquê elas viram fantasma?". `LiberacaoProducao`
  // guarda o **id** da peça em `pecaIds` (Json, sem chave estrangeira — o banco não sabe que
  // aquilo aponta para PecaConjunto, então nada avisa e nada bloqueia). Reimportar a LPC apaga a
  // marca que só existe na LPC e a recria a partir do arquivo, com id NOVO: a marca é a mesma, o
  // desenho é o mesmo, o peso é o mesmo — só o ponteiro morreu.
  //
  // E todo CROQUI é LPC-only por natureza (croqui não se expede, então nunca está na LE). Ou seja:
  // toda reimportação de LPC apagava todos os croquis da obra. Medido em 03/09/2026: 147 peças em
  // três OPs tinham perdido a programação em silêncio — a 113 perdeu dois lotes inteiros (79 no
  // corte de 03/09 e 47 na montagem de 30/09) e ninguém soube por dois dias.
  //
  // Como a marca sobrevive e o id não, o conserto é traduzir: id velho → marca (antes de apagar),
  // marca → id novo (depois de recriar). Ver `remapearLiberacoes`, logo abaixo dos creates.
  const marcaDoIdApagado = new Map();
  // ⚠⚠ QUEM JÁ EXISTIA, PARA SABER QUEM É NOVO. Vitor (03/09/2026): "o correto é apenas alertar as
  // peças novas, não tirar tudo da programação; deixar em aberto para programar apenas as peças
  // novas importadas".
  //
  // A programação das marcas ANTIGAS é preservada pelo remapeamento (id velho → marca → id novo),
  // então reimportar não deve custar retrabalho. O que sobra sem programação é o que a revisão
  // TROUXE — e isso ninguém tinha como saber: a lista voltava com 900 marcas e nada dizia quais
  // eram as 12 novas. Guardando o retrato de antes, o import passa a dizer exatamente o que falta
  // programar.
  const marcasAntes = new Set(
    (await prisma.pecaConjunto.findMany({ where: { opNumero, naLPC: true }, select: { marca: true } }))
      .map((x) => x.marca),
  );
  /* ⚠⚠ O QUE A FÁBRICA DECIDIU NÃO PODE MORRER NA REIMPORTAÇÃO. Vitor (08/09/2026): "na OP-97 já
     descemos alguns projetos e por alguma razão quando a engenharia reimporta as listas dá esse
     problema e começa tudo novamente".

     A peça recriada nascia com `status: PENDENTE` e nada mais: sem dia programado, sem bancada, sem
     baixa do portal. As LIBERAÇÕES já eram remapeadas (03 e 04/09) — a peça em si, não. Medido na
     OP-097: as peças foram recriadas SEIS vezes (quatro blocos em 01/09, dois em 03/09), 571 das
     789 GRDs têm a peça recriada depois da GRD, e a OP inteira ficou com ZERO dias de corte
     programados.

     ⚠ Fotografa por MARCA, que é o que sobrevive à reimportação — o id não. E só campos de DECISÃO
     (dia, posto, baixa, destino) e de PRODUÇÃO; nada do que a lista nova traz (peso, perfil, qte,
     descrição), senão a revisão da Engenharia não valeria de nada. */
  const producaoAntes = new Map();
  if (sobrescrever) {
    for (const x of await prisma.pecaConjunto.findMany({
      where: { opNumero, naLPC: true },
      select: {
        marca: true, status: true, ultimoSetor: true, prioridade: true, ordemCampo: true,
        statusPrep: true, statusEstoque: true, maquina: true,
        corteOrdem: true, corteDataMetaInicio: true, corteDataMetaFim: true,
        corteDiaProgramado: true, corteDiaOriginal: true, corteAdiado: true,
        corteIniciadoEm: true, corteConcluidoEm: true, qteProduzida: true, pesoProduzido: true, dataProducao: true,
        montagemDiaProgramado: true, montagemDiaOriginal: true, montagemAdiado: true,
        montagemProgramadaEm: true, montagemProgramadaPor: true, montagemBancada: true, montagemBancadaEm: true,
        soldaDiaProgramado: true, soldaBancada: true, soldaBancadaEm: true, soldaBancadaPor: true,
        acabamentoDiaProgramado: true, acabamentoBancada: true,
        jatoDiaProgramado: true, jatoBancada: true,
        pinturaDiaProgramado: true, pinturaBancada: true,
        baixaSetores: true, encaminhadoSetor: true, encaminhadoEm: true, encaminhadoPor: true,
        destino: true, destinoEm: true, destinoPor: true, destinoObs: true,
        terceirizado: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true, terceiroRetornoPrevisto: true,
      },
    })) {
      const { marca, ...resto } = x;
      producaoAntes.set(marca, resto);
    }
    const aApagar = await prisma.pecaConjunto.findMany({
      where: { opNumero, naLPC: true, naLE: false },
      select: { id: true, marca: true },
    });
    for (const x of aApagar) marcaDoIdApagado.set(x.id, x.marca);
    await prisma.pecaConjunto.updateMany({
      where: { opNumero, naLPC: true, naLE: true },
      data: { naLPC: false, fonte: "LE_IMPORT" },
    });
    await prisma.pecaConjunto.deleteMany({
      where: { opNumero, naLPC: true, naLE: false },
    });
  }

  // ⚠⚠ EM LOTE. Peça a peça — uma busca e uma gravação cada, ~120 ms por ida e volta até o banco em
  // São Paulo — a LPC da T118B (1.240 peças) esgotou os 300 s antes das ligações (25/09/2026). Os
  // campos gravados são os mesmos de antes; ver lib/lpc-gravar.js.
  const { pieceIds, criados, atualizados, ignorados } = await gravarPecasLpc(prisma, {
    opId: op?.id || null, opNumero, parsed,
    maquinaDe: (x) => classificarMaquina(x.descricao, x.pesoUnitKg, x.comprimentoMm),
  });
  const relacoesCriadas = await gravarRelacoesLpc(prisma, { parsed, pieceIds });

  // ⚠⚠ A PROGRAMAÇÃO SEGUE A MARCA, NÃO O ID. Traduz cada liberação viva desta OP: id apagado →
  // marca → id recriado. A marca que saiu da lista de verdade (não veio no arquivo novo) não tem
  // para onde apontar — ela sai da liberação e é CONTADA, para o Planejamento saber que precisa
  // reprogramar aquilo em vez de descobrir semanas depois que a peça não estava na fila de ninguém.
  //
  // ⚠ Só mexe em liberação LIBERADA/EM_PRODUCAO: cancelada é histórico e não se reescreve.
  // ⚠ AS NOVAS DA REVISÃO — o que a lista trouxe e ainda não está na fila de ninguém. Só marca de
  // FABRICAÇÃO conta: croqui e avulsa é o que desce para o corte; conjunto entra pela montagem.
  /* ⚠⚠ DEVOLVE A PRODUÇÃO À PEÇA RECRIADA. Sem isto o dia programado, a bancada e a baixa morriam a
     cada revisão de lista — e a fábrica recomeçava do zero uma obra que já estava andando.

     ⚠ Só para marca que EXISTIA antes: o que a revisão trouxe é novo e tem de ficar sem programação
     mesmo, para o Planejamento ver o que falta descer (é o `novasMarcas` logo abaixo).
     ⚠ Só campos nulos/zerados são preenchidos? NÃO — sobrescreve, porque a peça acabou de nascer em
     branco. O que a lista nova traz (peso, perfil, qte) não está nesta lista e continua intacto. */
  let restauradas = 0;
  if (sobrescrever && producaoAntes.size) {
    await emParalelo([...producaoAntes], PARALELO, async ([marca, dados]) => {
      const id = pieceIds.get(marca);
      if (!id) return;                         // marca saiu da lista: nada a restaurar
      try { await prisma.pecaConjunto.update({ where: { id }, data: dados }); restauradas++; }
      catch (e) { registro.erro("[importar-lpc] restaurar produção falhou:", marca, e?.message); }
    });
  }

  const novasMarcas = [...pieceIds.keys()].filter((m) => !marcasAntes.has(m));
  const remap = { liberacoes: 0, pecas: 0, perdidas: 0, marcasPerdidas: [], restauradas,
                  novas: novasMarcas.length, amostraNovas: novasMarcas.slice(0, 50) };
  if (sobrescrever && op && marcaDoIdApagado.size) {
    try {
      const libs = await prisma.liberacaoProducao.findMany({
        where: { opId: op.id, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
        select: { id: true, pecaIds: true },
      });
      for (const l of libs) {
        const ids = Array.isArray(l.pecaIds) ? l.pecaIds : [];
        if (!ids.length) continue;
        let mudou = false;
        const novos = [];
        for (const id of ids) {
          const marca = marcaDoIdApagado.get(id);
          if (!marca) { novos.push(id); continue; }  // não foi apagada: segue igual
          const idNovo = pieceIds.get(marca);
          if (idNovo) { novos.push(idNovo); mudou = true; remap.pecas++; }
          else { mudou = true; remap.perdidas++; if (remap.marcasPerdidas.length < 50) remap.marcasPerdidas.push(marca); }
        }
        if (!mudou) continue;
        await prisma.liberacaoProducao.update({ where: { id: l.id }, data: { pecaIds: novos } });
        remap.liberacoes++;
      }
    } catch (e) {
      // ⚠ não aborta a importação: a lista já foi gravada, e falhar aqui só deixaria o remapeamento
      // para a próxima. Mas registra, porque silêncio foi exatamente o que criou este problema.
      registro.erro("[importar-lpc] remapeamento das liberações falhou:", e?.message);
      remap.erro = e?.message || "falhou";
    }
  }

  // ⚠⚠ REDE DE SEGURANÇA PELA MARCA — vale para QUALQUER apagamento, não só o desta importação.
  //
  // O remapeamento acima só conserta o que ELE apagou (`marcaDoIdApagado`). Peça apagada por outro
  // caminho — outra importação, exclusão manual, lista trocada de opNumero — deixava o lote
  // apontando para o nada, calado: em 04/09/2026 eram 275 ponteiros mortos em 11 lotes, a OP-113
  // com 254 de 260. Aqui os ids são reescritos a partir da CHAVE NATURAL gravada na liberação
  // (`pecaMarcas`), que a reimportação não muda. Ver lib/liberacao-pecas.js.
  if (op) {
    try {
      // ⚠ filtra em JS e não no `where`: campo Json nulo em Prisma distingue JsonNull de DbNull, e
      // errar isso aqui derrubaria a importação inteira por causa da rede de segurança.
      const libs = (await prisma.liberacaoProducao.findMany({
        where: { opId: op.id, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
        select: { id: true, pecaIds: true, pecaMarcas: true },
      })).filter((l) => Array.isArray(l.pecaMarcas) && l.pecaMarcas.length);
      if (libs.length) {
        const vivas = await prisma.pecaConjunto.findMany({
          where: { opId: op.id }, select: { id: true, marca: true, opNumero: true },
        });
        const porChave = new Map(vivas.map((p) => [chaveDaPeca(p), p.id]));
        for (const l of libs) {
          const chaves = Array.isArray(l.pecaMarcas) ? l.pecaMarcas : [];
          if (!chaves.length) continue;
          const novos = chaves.map((c) => porChave.get(c)).filter(Boolean);
          const antes = Array.isArray(l.pecaIds) ? l.pecaIds : [];
          if (novos.length === antes.length && novos.every((id, i) => id === antes[i])) continue;
          await prisma.liberacaoProducao.update({ where: { id: l.id }, data: { pecaIds: novos } });
          remap.porMarca = (remap.porMarca || 0) + 1;
        }
      }
    } catch (e) {
      registro.erro("[importar-lpc] recasamento por marca falhou:", e?.message);
      remap.erroMarca = e?.message || "falhou";
    }
  }

  // Audit log (nao-fatal — nao pode abortar uma importacao bem-sucedida)
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_LPC",
        entity: "PecaConjunto",
        entityId: opNumero,
        diff: {
          opNumero,
          obra: parsed.obra,
          cliente: parsed.cliente,
          conjuntos: parsed.conjuntos.length,
          croquis: parsed.croquis.length,
          avulsas: parsed.avulsas.length,
          relacoes: relacoesCriadas,
          criados,
          atualizados,
          ignorados,
          sobrescrever: !!sobrescrever,
          pesoTotal: parsed.pesoTotal,
          areaTotal: parsed.areaTotal,
        },
      },
    });
  } catch (auditErr) {
    registro.erro("[importar-lpc] falha no audit log:", auditErr?.message);
  }

  return NextResponse.json({
    ok: true,
    opNumero,
    chaveAjustada,
    // ⚠ conflito de chave: a importação VAI duplicar essas marcas — quem importou precisa saber
    chaveConflito,
    opEncontrada: !!op,
    obra: parsed.obra,
    cliente: parsed.cliente,
    conjuntos: parsed.conjuntos.length,
    croquis: parsed.croquis.length,
    avulsas: parsed.avulsas.length,
    relacoes: relacoesCriadas,
    criados,
    atualizados,
    ignorados,
    pesoTotal: parsed.pesoTotal,
    areaTotal: parsed.areaTotal,
    diff,
    // o que aconteceu com a programação do Planejamento nesta importação
    remap,
  });

  } catch (e) {
    registro.erro("[importar-lpc] erro inesperado:", e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message || "Erro interno ao importar LPC" },
      { status: 500 }
    );
  }
}
