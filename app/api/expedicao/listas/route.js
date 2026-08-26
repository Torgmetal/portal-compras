// GET /api/expedicao/listas
//
// Obras com peça em aberto pra enviar, lidas da LISTA DE EXPEDIÇÃO.
//
// Vitor (19/08/2026): "no portal da expedição você consegue deixar uma aba chamada Listas de
// Expedição? Essa página tem que aparecer as obras que estão com peças em aberto para envio —
// nesse caso você pode usar a lista onde contém todos os itens".
//
// A lista é a fonte certa porque ela tem 100% do que a obra entrega: estrutura, cobertura, grade,
// fixação. O portal por OP mostra o que o Planejamento direcionou; aqui mostra o que a OBRA ainda
// deve, direcionado ou não. São perguntas diferentes e as duas telas precisam existir.
//
// ⚠ FALTANTE = marca com peso e SEM baixa. `expedidoRomaneio` (romaneio do portal) ou
// `expedidoArquivo` (baixa na planilha do SharePoint) — qualquer um dos dois já conta como saiu.
// Ver lib/expedicao-estrutura.js, que é onde essa regra mora pro cronograma.
//
// ⚠ DEDUP POR MARCA entre frentes: uma OP pode ter várias listas (T64A, T64B…) e a mesma marca
// aparecer em mais de uma. Somar cru inflaria o faltante.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { grupoMarca } from "@/lib/expedicao-estrutura";
import { mapaSetorReal } from "@/lib/prioridades-setor";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 60;

// ONDE A PEÇA ESTÁ PARADA — Vitor (19/08/2026): "preciso que traga o status das peças como
// expedido e informar, de acordo com o apontamento, o local que está parado".
//
// O setor vem do APONTAMENTO do Syneco, não do `status` da peça: o status automático só anda até
// o CORTE, então usar ele diria "PENDENTE" para peça que já está pintada. `mapaSetorReal` devolve
// o setor MAIS AVANÇADO com produção — é onde a peça chegou e onde ela está.
//
// Pra quem embarca isso é a diferença entre "posso carregar hoje" e "ainda está na fábrica":
// marca parada na Pintura já pode sair; parada na Solda ainda tem duas etapas pela frente.
const SETOR_LABEL = {
  CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição",
};
// Depois da pintura a peça está pronta pro caminhão.
const PRONTA = new Set(["PINTURA", "EXPEDICAO"]);

const GRUPO_LABEL = {
  estrutura: "Estrutura",
  "guarda-corpo-reto": "Guarda-corpo",
  "guarda-corpo-inclinado": "Guarda-corpo inclinado",
  cobertura: "Cobertura",
  grade: "Grade de piso",
  fixacao: "Fixação",
};

const pesoMarca = (m) => (m?.pesoTotal ?? (m?.pesoUnit || 0) * (m?.qte ?? m?.qtd ?? 1)) || 0;
const saiu = (m) => !!(m?.expedidoRomaneio || m?.expedidoArquivo);

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  // ?todas=1 traz também as obras já 100% embarcadas (o padrão é só o que falta)
  const todas = new URL(req.url).searchParams.get("todas") === "1";

  const [listas, ops, pedidos] = await Promise.all([
    prisma.listaExpedicao.findMany({
      select: { id: true, frente: true, opNumero: true, opId: true, arquivo: true, revisao: true, importadoEm: true, marcasJson: true },
      orderBy: { frente: "asc" },
    }),
    prisma.oP.findMany({ select: { id: true, numero: true, cliente: true, obra: true, status: true } }),
    prisma.pedidoExpedicao.findMany({ select: { opNumero: true, status: true } }),
  ]);

  // apontamentos do Syneco (só o que TEM produção) e status das peças, pra dizer onde cada marca
  // parou. Uma consulta só pra base inteira — filtrar por OP daria N consultas.
  const [syneco, pecas] = await Promise.all([
    prisma.mesOrdem.groupBy({
      by: ["opId", "item", "setor"],
      where: { opId: { not: null }, produzidoUn: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.pecaConjunto.findMany({
      select: { opId: true, marca: true, status: true },
    }),
  ]);
  const synPorOp = new Map();
  for (const l of syneco) {
    const arr = synPorOp.get(l.opId) || [];
    arr.push({ item: l.item, setor: l.setor });
    synPorOp.set(l.opId, arr);
  }
  const statusPorOp = new Map();
  for (const p of pecas) {
    const m = statusPorOp.get(p.opId) || new Map();
    m.set(String(p.marca || "").trim().toUpperCase(), p.status);
    statusPorOp.set(p.opId, m);
  }

  const opPorId = new Map(ops.map((o) => [o.id, o]));
  const opPorNumero = new Map(ops.map((o) => [o.numero, o]));
  const statusPedido = new Map(pedidos.map((p) => [p.opNumero, p.status]));
  // a OP aparece como "64", "064" e "T64" nas listas — normaliza pra 3 dígitos
  const normalizar = (n) => String(n || "").replace(/^T/i, "").replace(/\D/g, "").padStart(3, "0");

  const porOp = new Map();
  for (const l of listas) {
    const op = (l.opId && opPorId.get(l.opId)) || opPorNumero.get(normalizar(l.opNumero));
    const chave = op?.numero || normalizar(l.opNumero) || l.frente;

    const g = porOp.get(chave) || {
      opNumero: op?.numero || normalizar(l.opNumero) || null,
      opId: op?.id || null,
      cliente: op?.cliente || null,
      obra: op?.obra || null,
      statusOP: op?.status || null,
      pedidoExpedicao: statusPedido.get(op?.numero) || null,
      frentes: [],
      vistas: new Set(),
      marcas: 0, faltantes: 0,
      totalKg: 0, expedidoKg: 0, faltanteKg: 0,
      porGrupo: {},
      porSetor: {},
      prontasMarcas: 0, prontasKg: 0,
      itensFaltantes: [],
      ultimaExpedicao: null,
      importadoEm: null,
    };

    const setorDaMarca = op?.id ? mapaSetorReal(synPorOp.get(op.id) || [], normalizeSetorSyneco) : new Map();
    const statusDaMarca = op?.id ? statusPorOp.get(op.id) || new Map() : new Map();

    const arr = Array.isArray(l.marcasJson) ? l.marcasJson : [];
    let faltaNaFrente = 0;
    for (const m of arr) {
      const k = String(m.marca || "").trim().toUpperCase();
      if (!k || g.vistas.has(k)) continue; // dedup entre frentes da mesma OP
      g.vistas.add(k);

      const kg = pesoMarca(m);
      g.marcas++;
      g.totalKg += kg;

      if (saiu(m)) {
        g.expedidoKg += kg;
        const d = m.dataExpedicao ? new Date(m.dataExpedicao) : null;
        if (d && !isNaN(d) && (!g.ultimaExpedicao || d > g.ultimaExpedicao)) g.ultimaExpedicao = d;
        continue;
      }

      g.faltantes++;
      g.faltanteKg += kg;
      faltaNaFrente++;
      const grupo = grupoMarca(m.descricao);
      const gr = (g.porGrupo[grupo] ||= { grupo, label: GRUPO_LABEL[grupo] || grupo, marcas: 0, qtd: 0, kg: 0 });
      gr.marcas++;
      gr.qtd += Number(m.qte ?? m.qtd ?? 1) || 0;
      gr.kg += kg;

      // guarda o detalhe pra tela abrir sem uma segunda chamada — a lista da obra é curta o
      // bastante (a maior tem ~750 faltantes) e o corte evita payload absurdo
      // ONDE PAROU: setor do apontamento; null = nunca apontada (ainda não entrou na fábrica,
      // ou o apontamento não chegou). O status do portal vai junto porque quando ele diz EXPEDIDO
      // e a lista diz que falta, é divergência que alguém precisa ver.
      const setor = setorDaMarca.get(m.marca) || null;
      const statusPortal = statusDaMarca.get(k) || null;
      const sk = setor || "SEM_APONTAMENTO";
      const ps = (g.porSetor[sk] ||= {
        setor: sk, label: setor ? SETOR_LABEL[setor] || setor : "Sem apontamento",
        pronta: !!setor && PRONTA.has(setor), marcas: 0, kg: 0,
      });
      ps.marcas++;
      ps.kg += kg;
      if (setor && PRONTA.has(setor)) { g.prontasMarcas++; g.prontasKg += kg; }

      // ⚠ o teto era 400 por obra, do tempo em que a tela era cartão com tabela dentro. Agora a
      // tela é planilha com export, e uma planilha truncada em silêncio é pior que não ter: são
      // 1.890 faltantes em toda a casa, então 2.000 cobre tudo com folga.
      if (g.itensFaltantes.length < 2000) {
        g.itensFaltantes.push({
          marca: m.marca, descricao: m.descricao || null,
          qtd: Number(m.qte ?? m.qtd ?? 1) || 0, pesoKg: kg,
          // ⚠ o RÓTULO vai junto: a planilha filtra pelo que a pessoa lê, e ninguém procura por
          // "ESTR" numa lista de opções.
          grupo, grupoLabel: GRUPO_LABEL[grupo] || grupo, frente: l.frente,
          setor, setorLabel: setor ? SETOR_LABEL[setor] || setor : null,
          pronta: !!setor && PRONTA.has(setor),
          statusPortal,
        });
      }
    }

    g.frentes.push({ frente: l.frente, arquivo: l.arquivo, revisao: l.revisao || null, faltantes: faltaNaFrente });
    if (l.importadoEm && (!g.importadoEm || l.importadoEm > g.importadoEm)) g.importadoEm = l.importadoEm;
    porOp.set(chave, g);
  }

  const obras = [...porOp.values()]
    .map((g) => {
      delete g.vistas;
      return {
        ...g,
        pctExpedido: g.totalKg > 0 ? Math.round((g.expedidoKg / g.totalKg) * 100) : null,
        porGrupo: Object.values(g.porGrupo).sort((a, b) => b.kg - a.kg || b.marcas - a.marcas),
        // prontas primeiro — é o que a Expedição pode carregar hoje
        porSetor: Object.values(g.porSetor).sort((a, b) => (b.pronta ? 1 : 0) - (a.pronta ? 1 : 0) || b.kg - a.kg),
        itensFaltantes: g.itensFaltantes.sort((a, b) => b.pesoKg - a.pesoKg),
        // a lista pode ter mais faltantes do que o detalhe carregado
        detalheTruncado: g.faltantes > g.itensFaltantes.length,
        ultimaExpedicao: g.ultimaExpedicao ? g.ultimaExpedicao.toISOString() : null,
        importadoEm: g.importadoEm ? g.importadoEm.toISOString() : null,
      };
    })
    .filter((g) => todas || g.faltantes > 0)
    // quem tem mais peso parado primeiro — é o que trava a obra
    .sort((a, b) => b.faltanteKg - a.faltanteKg);

  return NextResponse.json({
    obras,
    totais: {
      obras: obras.length,
      marcasFaltantes: obras.reduce((s, o) => s + o.faltantes, 0),
      faltanteKg: obras.reduce((s, o) => s + o.faltanteKg, 0),
      prontasMarcas: obras.reduce((s, o) => s + o.prontasMarcas, 0),
      prontasKg: obras.reduce((s, o) => s + o.prontasKg, 0),
    },
    geradoEm: new Date().toISOString(),
  });
}
