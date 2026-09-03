// POST /api/producao/pecas/importar-lpc
// Recebe { rows: [...], opNumero?: string, sobrescrever?: boolean }
// Parseia LPC, cria PecaConjunto + ConjuntoCroqui
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseLPC } from "@/lib/parse-lpc";
import { classificarMaquina } from "@/lib/maquina-corte";

export const runtime = "nodejs";
export const maxDuration = 300; // LPC grande faz upsert peça a peça; 60s estourava (timeout → HTML → "token JSON")

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
  const faseArquivo = String(arquivoNome || "").toUpperCase().match(/T\d+[A-Z]*/)?.[0] || null;
  const chave = faseArquivo || opForcada || null;
  const parsed = parseLPC(rows, { opNumeroForcado: chave });
  if (parsed.erro) {
    return NextResponse.json({ error: parsed.erro }, { status: 400 });
  }

  const opNumero = parsed.opNumero;
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
  if (sobrescrever) {
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

  const pieceIds = new Map(); // marca -> id
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  // --- Upsert conjuntos ---
  for (const c of parsed.conjuntos) {
    try {
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: c.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: c.descricao,
            qte: c.qte,
            pesoUnitKg: c.pesoUnitKg,
            pesoTotalKg: c.pesoTotalKg,
            tipoPeca: "CONJUNTO",
            areaPinturaM2: c.areaPinturaM2,
            observacao: c.observacao ?? undefined, // undefined = não mexe (preserva no update; null no create)
            naLPC: true, fonte: "LPC_IMPORT", // ⚠ pertencimento — ver o bloco naLE/naLPC no schema
          },
        });
        pieceIds.set(c.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: c.marca,
            descricao: c.descricao,
            qte: c.qte,
            pesoUnitKg: c.pesoUnitKg,
            pesoTotalKg: c.pesoTotalKg,
            tipoPeca: "CONJUNTO",
            areaPinturaM2: c.areaPinturaM2,
            observacao: c.observacao ?? undefined, // undefined = não mexe (preserva no update; null no create)
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
            naLPC: true,
          },
        });
        pieceIds.set(c.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Upsert croquis (ja deduplicados pelo parser) ---
  for (const cr of parsed.croquis) {
    try {
      const maq = classificarMaquina(cr.descricao, cr.pesoUnitKg, cr.comprimentoMm);
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: cr.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: cr.descricao,
            material: cr.material,
            perfil: cr.perfil,
            qte: cr.qte,
            comprimentoMm: cr.comprimentoMm,
            pesoUnitKg: cr.pesoUnitKg,
            pesoTotalKg: cr.pesoTotalKg,
            tipoPeca: "CROQUI",
            areaPinturaM2: cr.areaPinturaM2,
            observacao: cr.observacao ?? undefined,
            statusPrep: existing.statusPrep || "PENDENTE",
            maquina: maq || existing.maquina,
            naLPC: true, fonte: "LPC_IMPORT",
          },
        });
        pieceIds.set(cr.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: cr.marca,
            descricao: cr.descricao,
            material: cr.material,
            perfil: cr.perfil,
            qte: cr.qte,
            comprimentoMm: cr.comprimentoMm,
            pesoUnitKg: cr.pesoUnitKg,
            pesoTotalKg: cr.pesoTotalKg,
            tipoPeca: "CROQUI",
            areaPinturaM2: cr.areaPinturaM2,
            observacao: cr.observacao ?? undefined,
            statusPrep: "PENDENTE",
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
            naLPC: true,
            maquina: maq,
          },
        });
        pieceIds.set(cr.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Upsert avulsas ---
  for (const a of parsed.avulsas) {
    try {
      const maq = classificarMaquina(a.descricao, a.pesoUnitKg, a.comprimentoMm);
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: a.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: a.descricao,
            material: a.material,
            perfil: a.perfil,
            qte: a.qte,
            comprimentoMm: a.comprimentoMm,
            pesoUnitKg: a.pesoUnitKg,
            pesoTotalKg: a.pesoTotalKg,
            areaPinturaM2: a.areaPinturaM2,
            observacao: a.observacao ?? undefined,
            maquina: maq || existing.maquina,
            // ⚠ A LINHA PASSA A PERTENCER À LPC. Sem isto, a marca que a LE criou primeiro
            // continuava carimbada LE e sumia da lista de produção — o caso da OP-113.
            // O `fonte` acompanha porque, para o fluxo de fábrica, a LPC é a lista que manda:
            // peça que está na LPC é peça que se fabrica, tenha vindo por onde tiver vindo.
            naLPC: true,
            fonte: "LPC_IMPORT",
            naLPC: true,
          },
        });
        pieceIds.set(a.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: a.marca,
            descricao: a.descricao,
            material: a.material,
            perfil: a.perfil,
            qte: a.qte,
            comprimentoMm: a.comprimentoMm,
            pesoUnitKg: a.pesoUnitKg,
            pesoTotalKg: a.pesoTotalKg,
            areaPinturaM2: a.areaPinturaM2,
            observacao: a.observacao ?? undefined,
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
            naLPC: true,
            maquina: maq,
          },
        });
        pieceIds.set(a.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Criar relacoes ConjuntoCroqui ---
  // Limpar juncoes existentes dos conjuntos importados
  const conjuntoIds = parsed.conjuntos.map((c) => pieceIds.get(c.marca)).filter(Boolean);
  if (conjuntoIds.length > 0) {
    await prisma.conjuntoCroqui.deleteMany({
      where: { conjuntoId: { in: conjuntoIds } },
    });
  }

  let relacoesCriadas = 0;
  for (const rel of parsed.relacoes) {
    const conjuntoId = pieceIds.get(rel.conjuntoMarca);
    const croquiId = pieceIds.get(rel.croquiMarca);
    if (conjuntoId && croquiId) {
      try {
        await prisma.conjuntoCroqui.create({
          data: {
            conjuntoId,
            croquiId,
            qtdNoConjunto: rel.qtdNoConjunto,
          },
        });
        relacoesCriadas++;
      } catch {
        // unique constraint — nao deveria acontecer apos deleteMany
      }
    }
  }

  // ⚠⚠ A PROGRAMAÇÃO SEGUE A MARCA, NÃO O ID. Traduz cada liberação viva desta OP: id apagado →
  // marca → id recriado. A marca que saiu da lista de verdade (não veio no arquivo novo) não tem
  // para onde apontar — ela sai da liberação e é CONTADA, para o Planejamento saber que precisa
  // reprogramar aquilo em vez de descobrir semanas depois que a peça não estava na fila de ninguém.
  //
  // ⚠ Só mexe em liberação LIBERADA/EM_PRODUCAO: cancelada é histórico e não se reescreve.
  // ⚠ AS NOVAS DA REVISÃO — o que a lista trouxe e ainda não está na fila de ninguém. Só marca de
  // FABRICAÇÃO conta: croqui e avulsa é o que desce para o corte; conjunto entra pela montagem.
  const novasMarcas = [...pieceIds.keys()].filter((m) => !marcasAntes.has(m));
  const remap = { liberacoes: 0, pecas: 0, perdidas: 0, marcasPerdidas: [],
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
      console.error("[importar-lpc] remapeamento das liberações falhou:", e?.message);
      remap.erro = e?.message || "falhou";
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
    console.error("[importar-lpc] falha no audit log:", auditErr?.message);
  }

  return NextResponse.json({
    ok: true,
    opNumero,
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
    console.error("[importar-lpc] erro inesperado:", e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message || "Erro interno ao importar LPC" },
      { status: 500 }
    );
  }
}
