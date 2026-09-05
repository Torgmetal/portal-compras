// GET  /api/planejamento/liberacao/pecas?opId=…  → as peças da obra, para a planilha de seleção
// POST /api/planejamento/liberacao/pecas         → marca/desmarca prioridade num lote de peças
//
// Vitor (25/08/2026): "quero que deixe como planilha com filtro e um botão de podermos marcar quais
// peças são prioridades, uma opção de filtro para selecionar só as a fazer".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { portaoDoDesenho, temDesenhoNaPasta, temMaquinaNaPasta } from "@/lib/pasta-engenharia";
import { analisarMaterial } from "@/lib/material-liberacao";
import { requireRole } from "@/lib/session";
import { pecaCortada, poolDaPeca, POOLS } from "@/lib/liberacao-producao";
import { DO_CMR, ORDEM_FIFO_CMR } from "@/lib/cmr-origens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];
const TETO = 12000; // acima disso o navegador não monta a tabela

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const brutas = await prisma.pecaConjunto.findMany({
    where: { opId, fonte: "LPC_IMPORT" },
    select: {
      id: true, marca: true, opNumero: true, descricao: true, tipoPeca: true, perfil: true, material: true,
      comprimentoMm: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, status: true, statusEstoque: true,
      prioridade: true, corteOrdem: true, corteConcluidoEm: true, qteProduzida: true, maquina: true,
    },
    take: TETO + 1,
  });
  if (!brutas.length) return NextResponse.json({ op, temLpc: false, pecas: [], pools: POOLS });

  // ⚠⚠ ESTAR NA LPC NÃO É TER DESENHO. Vitor (25/08/2026): "quando marcamos as marcas é porque já
  // temos projeto na pasta, ou apenas por ter o projeto listado na lista LPC?". Era só a LPC — e a
  // diferença é enorme: a OP-106 tem a lista importada e ZERO desenho em 2.5.2 Fabricação; a
  // OP-064 tem 2.449 marcas e nenhuma casa com PDF. Liberar isso manda o PCP imprimir o que não
  // existe.
  //
  // ⚠ AGORA BLOQUEIA. Vitor (26/08/2026): "só pode ser liberado as marcas que possuem projetos nas
  // pastas". Era aviso; virou portão. O critério mora em `portaoDoDesenho` para a tela pintar
  // exatamente o que o POST vai cobrar — e 2.5.5 continua não contando, que é a outra metade do
  // pedido ("vamos ignorar os projetos da pasta 2.5.5").
  // ⚠ o que JÁ FOI PROGRAMADO sai da escolha do próximo dia — senão "preencher o dia" devolveria
  // sempre o mesmo lote e a semana nunca avançaria.
  const abertas = await prisma.liberacaoProducao.findMany({
    where: { opId, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { id: true, frente: true, dataProgramada: true, pecaIds: true, liberadoEm: true },
    orderBy: [{ dataProgramada: "asc" }, { liberadoEm: "asc" }],
  });
  const programada = new Map();
  for (const l of abertas) {
    for (const id of (Array.isArray(l.pecaIds) ? l.pecaIds : [])) {
      if (!programada.has(id)) programada.set(id, l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "sem data");
    }
  }

  const portao = await portaoDoDesenho(prisma, opId);

  // ⚠ MATERIAL AQUI É INFORMAÇÃO, NÃO PORTÃO. Vitor (26/08/2026): "aqui no planejamento já seria
  // importante o status do material tbm se foi entregue ou não" — ele pediu o STATUS.
  //
  // ⚠⚠ E QUEM TRAVA POR MATERIAL É O PCP, por decisão dele mesmo (25/08/2026): "o planejamento
  // solta a lista, pcp recebe a solicitação, manda separar o material, analisa se está tudo em
  // estoque (…) caso não tenha o material não libera aquele projeto para preparar". Barrar aqui
  // tiraria do PCP a etapa que é dele — e material chega no meio da semana, então o Planejamento
  // precisa poder programar o que ainda está a caminho.
  //
  // A conta é a MESMA do painel do PCP (lib/material-liberacao.js): duas leituras diferentes do
  // mesmo aço fariam as duas telas discordarem sobre a mesma peça.
  const material = await analisarMaterial(op.numero, brutas).catch(() => null);

  // ⚠ conjunto composto fica FORA da planilha de corte: ele não se corta, é montado a partir dos
  // croquis. Quem escolhe o dia da Preparação escolhe peça P e avulsa. (Vitor, 25/08/2026)
  const comCroqui = new Set(
    (await prisma.conjuntoCroqui.findMany({ where: { conjunto: { opId } }, select: { conjuntoId: true }, distinct: ["conjuntoId"] }))
      .map((x) => x.conjuntoId)
  );

  // peso por peça, para somar o kg de cada dia já programado (ver `dias`, no fim da resposta)
  const pesoPorPeca = new Map(brutas.map((p) => [p.id, Number(p.pesoTotalKg) || 0]));

  const pecas = brutas.slice(0, TETO).map((p) => {
    const natureza = p.tipoPeca === "CROQUI" ? "croqui"
      : p.tipoPeca === "CONJUNTO" && comCroqui.has(p.id) ? "conjunto"
      : "avulsa";
    const cortada = pecaCortada(p);
    const mat = material?.porPeca?.get(p.id) || null;
    return {
      id: p.id, marca: p.marca, frente: p.opNumero, descricao: p.descricao || "",
      // ⚠ `aco` é o AÇO da peça (A36, ASTM…). Chamava-se `material` e o status do material o
      // sobrescrevia calado — dois significados no mesmo nome.
      natureza, perfil: p.perfil || "", aco: p.material || "",
      comprimentoMm: p.comprimentoMm || null, qte: p.qte, pesoUnitKg: p.pesoUnitKg,
      pesoTotalKg: Math.round((p.pesoTotalKg || 0) * 10) / 10,
      pool: poolDaPeca(p.perfil),
      status: p.status, statusEstoque: p.statusEstoque || null, maquina: p.maquina || null,
      prioridade: p.prioridade, corteOrdem: p.corteOrdem,
      cortada, feito: p.qteProduzida || 0,
      // ⚠ "a fazer" é o filtro que o Vitor pediu: o que ainda não passou pelo corte.
      aFazer: !cortada,
      // desenho na pasta 2.5.2 Fabricação — null = a obra nunca foi conferida
      temDesenho: temDesenhoNaPasta(portao, p.marca),
      desenhoForaPadrao: portao.foraPadrao.get(String(p.marca || "").trim().toUpperCase()) || null,
      // desenhado, mas fora da fabricação — o dado fica, a tela não mostra
      desenhoSoEnvio: portao.soEnvio.has(String(p.marca || "").trim().toUpperCase()),
      // ⚠ NC1/DXF/IGS: o que a MÁQUINA lê. Ter desenho não é ter arquivo de máquina.
      temMaquina: temMaquinaNaPasta(portao, p.marca, false),
      // material: NA_OP (chegou nesta obra) · ESTOQUE (existe, é de outra OP) · SEM_MATERIAL
      // dia já programado para esta peça — "sem data" = liberada sem marcar o dia
      programadaEm: programada.get(p.id) || null,
      material: mat ? mat.estado : null,
      materialFalta: mat?.falta || null,
      materialRs: mat?.rs?.length || 0,
      // ⚠⚠ O R DECLARADO TEM DE VOLTAR PARA A LINHA. Vitor (02/09/2026): "não gravou, selecionei e
      // dei salvar e não aparece nada aqui". Tinha gravado — a célula é que continuava lendo só o
      // `estado` (ESTOQUE), que não muda quando alguém aponta o fardo. Sem este campo a tela oferece
      // "usar de estoque" para sempre, mesmo já tendo sido usado, e quem declarou acha que perdeu.
      materialRInformado: mat?.rInformado || null,
    };
  });

  // ⚠⚠ OS FARDOS QUE DÁ PARA DECLARAR, POR PERFIL. Vitor (02/09/2026), olhando a linha da T113A-P64
  // com "✕ não comprado": "onde eu informo o R aqui?" — e não havia onde. O material existe no CMR,
  // só está no nome de outra obra; a decisão de usar estoque não tinha lugar para morar, então a
  // marca ficava barrada para sempre.
  //
  // ⚠ POR PERFIL, NUNCA POR MARCA. A OP-113 tem 197 marcas em 40 perfis — o mesmo R seria digitado
  // cinco vezes em média, 28 no UE200X75X20X3.00. A célula da linha é só a PORTA; o que ela abre
  // vale para todas as marcas daquele perfil de uma vez, e a tela diz isso antes de gravar.
  //
  // ⚠ SÓ ESTOQUE ENTRA AQUI. "Não comprado" na tela cobre dois casos que parecem um: o material que
  // existe em outra obra (ESTOQUE — dá para declarar) e o que não existe em lugar nenhum
  // (SEM_MATERIAL — não há o que declarar, e oferecer o botão seria mentir).
  let materiais = [];
  if (material?.porPerfil) {
    const doEstoque = [...material.porPerfil.values()].filter((v) => v.estado === "ESTOQUE");
    const descricoes = [...new Set(doEstoque.map((v) => v.descricaoCmr).filter(Boolean))];
    // ⚠ sem `distinct`: é justamente a lista de FARDOS que interessa, não a de descrições. O
    // `cmrGeral` de analisarMaterial é distinto por nome e devolveria uma opção só.
    const linhas = descricoes.length
      ? await prisma.documentoQualidade.findMany({
          where: { categoria: "MATERIAL", ...DO_CMR, nome: { in: descricoes } },
          select: { importRef: true, nome: true, opNumero: true, dataRecebimento: true, pesoKg: true, numeroCorrida: true },
          orderBy: ORDEM_FIFO_CMR,
          take: 400,
        })
      : [];
    const porNome = new Map();
    for (const l of linhas) {
      if (!l.importRef) continue;
      (porNome.get(l.nome) || porNome.set(l.nome, []).get(l.nome)).push({
        r: l.importRef, opNumero: l.opNumero || null,
        recebidoEm: l.dataRecebimento ? l.dataRecebimento.toISOString().slice(0, 10) : null,
        pesoKg: l.pesoKg == null ? null : Math.round(l.pesoKg),
        corrida: l.numeroCorrida || null,
      });
    }
    materiais = doEstoque.map((v) => {
      const dele = pecas.filter((x) => String(x.perfil || "").trim().toUpperCase() === String(v.perfil || "").trim().toUpperCase());
      return {
        perfil: v.perfil, descricaoCmr: v.descricaoCmr || null,
        falta: v.falta || null, faltaRotulo: v.faltaRotulo || null,
        rInformado: v.rInformado || null,
        marcas: dele.length, pesoKg: Math.round(dele.reduce((t, x) => t + (x.pesoTotalKg || 0), 0)),
        fardos: (porNome.get(v.descricaoCmr) || []).slice(0, 12),
      };
    }).sort((a, b) => b.pesoKg - a.pesoKg);
  }

  // material que a obra ainda deve: entregue resolve, e estoque com o fardo apontado também.
  const pendenteDeMaterial = (x) => x.material && x.material !== "ENTREGUE" && !(x.material === "ESTOQUE" && x.materialRInformado);

  return NextResponse.json({
    op, temLpc: true, pecas, pools: POOLS, materiais,
    truncado: brutas.length > TETO ? brutas.length - TETO : 0,
    // ⚠ O PORTÃO VAI NA RESPOSTA para a tela desenhar exatamente o que o POST vai cobrar.
    pasta: {
      conferida: portao.conferida, confiavel: portao.confiavel, truncado: portao.truncado || 0,
      marcasConferidas: portao.marcas || 0, marcasHoje: portao.marcasHoje || 0,
      veredito: portao.veredito, checadoEm: portao.checadoEm, erro: portao.erroPasta || null,
      semDesenho: pecas.filter((x) => x.temDesenho === false).length,
      maquinaMedida: portao.maquinaMedida, semMaquina: pecas.filter((x) => x.temMaquina === false).length,
      soEnvio: pecas.filter((x) => x.desenhoSoEnvio).length,
    },
    // ⚠ o resumo do material vem do MESMO cálculo do painel do PCP
    material: material ? {
      ...material.resumo,
      // ⚠ o resumo do lib conta ESTOQUE à parte; aqui ele já entrou na fila de compra
      // ⚠⚠ menos o estoque JÁ DECLARADO: contá-lo como pendente deixaria o aviso vermelho
      // "N peça(s) sem material entregue" na tela depois de a pessoa ter resolvido — e um aviso
      // que não some quando o problema acaba é o jeito mais rápido de ensinar a ignorá-lo.
      naoEntregue: pecas.filter(pendenteDeMaterial).length,
      kgNaoEntregue: Math.round(pecas.filter(pendenteDeMaterial).reduce((a, x) => a + (x.pesoTotalKg || 0), 0)),
    } : null,
    // os dias já programados desta obra, para a tela mostrar a semana montada
    // ⚠⚠ O DIA PRECISA DIZER O PESO, NÃO SÓ A CONTAGEM. O Planejamento (03/09/2026, via Vitor):
    // "nessa tela não fica muito claro quanto de peso eu já soltei por dia (…) ou eu só devo
    // imaginar mesmo já que limitei os 12.000 kg lá?".
    // A meta do setor é em kg/dia e a esteira do corte é em kg — contar peça não responde nada:
    // 33 peças podem ser 800 kg de cantoneira ou 9 t de chapa. Quem programa estava conferindo a
    // própria meta de cabeça.
    dias: [...abertas.reduce((m, l) => {
      const k = l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "";
      const g = m.get(k) || { dia: k || null, lotes: 0, pecas: 0, kg: 0, orfas: 0 };
      g.lotes++;
      const ids = Array.isArray(l.pecaIds) ? l.pecaIds : [];
      // ⚠⚠ CONTA SÓ O QUE AINDA EXISTE — e diz quanto sumiu. Medido na OP-113 em 03/09/2026: das
      // 250 peças liberadas, **126 apontam para ids que não existem mais** em PecaConjunto. Duas
      // liberações inteiras estão órfãs (79 peças no corte de 03/09, 47 na montagem de 30/09), e a
      // data bate com a reimportação da LPC daquela manhã, que recriou os croquis com ids novos.
      //
      // A liberação guarda o ID da peça; reimportar a lista troca o id e o ponteiro morre. O
      // trabalho continua existindo (mesma marca, id novo) — o que se perdeu foi a PROGRAMAÇÃO
      // dela, e a peça voltou para a fila de "a fazer" sem ninguém saber.
      //
      // Contar o id órfão como peça programada era mentir duas vezes: inflava o dia (123 onde há
      // 44) e, agora que o peso entra, faria o chip dizer "123 pç · 9.728 kg" — número que não
      // fecha e que quem lê conclui, com razão, que a tela está quebrada. O órfão sai da conta e
      // aparece à parte, que é o único jeito de alguém ir reprogramar.
      for (const id of ids) {
        const kg = pesoPorPeca.get(id);
        if (kg === undefined) { g.orfas++; continue; }
        g.pecas++; g.kg += kg;
      }
      return m.set(k, g);
    }, new Map()).values()]
      .map((g) => ({ ...g, kg: Math.round(g.kg) }))
      .sort((a, b) => String(a.dia).localeCompare(String(b.dia))),
  });
}

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
  prioridade: z.number().int().min(1).max(999).nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });

  const { count } = await prisma.pecaConjunto.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { prioridade: parsed.data.prioridade },
  });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: parsed.data.prioridade == null ? "TIRAR_PRIORIDADE_PECA" : "MARCAR_PRIORIDADE_PECA",
      entity: "PecaConjunto", entityId: parsed.data.ids[0],
      diff: { pecas: count, prioridade: parsed.data.prioridade } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, alteradas: count });
}
