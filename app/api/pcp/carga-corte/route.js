// GET /api/pcp/carga-corte — carga do corte POR MÁQUINA: o que está comprometido
// (kg/peças não cortadas), o que está em andamento (Syneco agora), a capacidade
// real (kg/dia, 30d), os dias de carga e o próximo slot livre (data). Mostra
// onde há espaço para encaixar uma obra.
import { NextResponse } from "next/server";
import { OP_VIVA } from "@/lib/op-viva";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MAQUINAS, MAQUINA_LABEL } from "@/lib/maquina-corte";

export const maxDuration = 30;

// Meta de produção da PREPARAÇÃO (corte) — kg/dia do setor inteiro.
// É a base dos "dias de carga": o ritmo histórico do Syneco (kg/dia medido)
// subestima a capacidade porque inclui dias de baixa alimentação da máquina,
// então usamos a meta do setor como capacidade de planejamento. O ritmo real
// medido continua exposto (ritmoRealKgDia) só como referência.
const META_PREPARACAO_KG_DIA = 6000;

// Soma N dias úteis (seg–sex) a partir de hoje (BRT), retorna ISO YYYY-MM-DD
function slotLivreISO(diasUteis) {
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const d = new Date(hojeIso + "T12:00:00Z");
  let add = 0;
  const n = Math.ceil(diasUteis || 0);
  while (add < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) add++;
  }
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  try {
    const [backlogRaw, capacidadeRaw, emAndamentoRaw, pendentes] = await Promise.all([
      // Backlog: peças em CORTE ainda não concluídas (a baixa total no Syneco é filtrada em JS)
      prisma.pecaConjunto.findMany({
        // ⚠ sem o filtro de OP viva, 2.631 peças / 399.178 kg de obra ENCERRADA entravam no
        // backlog e inflavam os "dias de carga" em 66 dias. Ver lib/op-viva.js.
        where: { status: "CORTE", corteConcluidoEm: null, ...OP_VIVA },
        select: { maquina: true, qte: true, qteProduzida: true, pesoTotalKg: true, corteIniciadoEm: true },
      }),
      // Capacidade média kg/dia por máquina (30 dias)
      prisma.$queryRaw`
        SELECT maquina, COUNT(DISTINCT DATE("dataInicio"))::int dias, SUM("pesoProduzido") kg
        FROM "MesOrdem"
        WHERE setor ILIKE '%corte%' AND "pesoProduzido" > 0
          AND "dataInicio" >= NOW() - INTERVAL '30 days'
          AND maquina IS NOT NULL AND maquina != '' AND maquina != '---'
        GROUP BY maquina
      `,
      // Em andamento agora (Syneco "Produzindo")
      prisma.mesOrdem.findMany({
        where: { setor: { contains: "Corte", mode: "insensitive" }, status: "Produzindo" },
        select: { maquina: true, produzidoUn: true, pesoProduzido: true },
      }),
      // Aguardando liberação (sem máquina ainda)
      //
      // ⚠⚠ SÓ A LPC, E SÓ OBRA VIVA. Este número vira "dias de carga" na tela do PCP, e ele estava
      // somando a LISTA DE EXPEDIÇÃO junto: 2.378 peças / 570 t = 95 dias, quando a fila real de
      // fabricação é 197 peças / 26 t = 4,4 dias. Noventa dias de carga que não existem, e o PCP
      // planeja o corte por eles. A LE não se corta — ver lib/lista-pecas.
      prisma.pecaConjunto.aggregate({ where: { status: "PENDENTE", ...SO_FABRICACAO, ...OP_VIVA }, _count: { id: true }, _sum: { pesoTotalKg: true } }),
    ]);

    // Capacidade por nome Syneco (uppercase, sem _)
    const capMap = new Map();
    for (const c of capacidadeRaw) {
      capMap.set(String(c.maquina).toUpperCase(), (Number(c.kg) || 0) / Math.max(1, Number(c.dias)));
    }

    // Backlog por máquina (só não cortadas). Conta o peso RESTANTE (não o cheio):
    // peça meio cortada só compromete o que falta.
    const backlog = {};
    for (const p of backlogRaw) {
      const qte = Number(p.qte) || 0, prod = Number(p.qteProduzida) || 0;
      if (qte > 0 && prod >= qte) continue; // já cortada
      const m = p.maquina || "SEM_MAQUINA";
      const acc = (backlog[m] = backlog[m] || { pecas: 0, kg: 0, iniciadas: 0 });
      const peso = Number(p.pesoTotalKg) || 0;
      acc.pecas += 1;
      acc.kg += qte > 0 ? peso * Math.max(0, qte - prod) / qte : peso;
      if (p.corteIniciadoEm || prod > 0) acc.iniciadas += 1;
    }

    // Em andamento por máquina (Syneco)
    const andamento = {};
    for (const a of emAndamentoRaw) {
      const m = String(a.maquina || "").toUpperCase().replace(/ /g, "_");
      const acc = (andamento[m] = andamento[m] || { pecas: 0, kg: 0 });
      acc.pecas += a.produzidoUn || 0;
      acc.kg += a.pesoProduzido || 0;
    }

    // Dias de carga = peso comprometido ÷ meta da preparação (6.000 kg/dia do setor).
    // Como o setor todo roda nessa meta, os dias de cada máquina são a fatia dela
    // (somam os dias da preparação). O ritmo real medido fica só como referência.
    const maquinas = Object.keys(MAQUINAS).map((enumMaq) => {
      const nomeSyneco = enumMaq.replace(/_/g, " ");
      const ritmoRealKgDia = capMap.get(nomeSyneco) || 0;
      const b = backlog[enumMaq] || { pecas: 0, kg: 0, iniciadas: 0 };
      const a = andamento[enumMaq] || { pecas: 0, kg: 0 };
      const diasCarga = b.kg > 0 ? b.kg / META_PREPARACAO_KG_DIA : 0;
      return {
        maquina: enumMaq,
        label: MAQUINA_LABEL[enumMaq] || enumMaq,
        backlogKg: b.kg,
        backlogPecas: b.pecas,
        iniciadas: b.iniciadas,
        emAndamentoKg: a.kg,
        emAndamentoPecas: a.pecas,
        ritmoRealKgDia: Math.round(ritmoRealKgDia),
        diasCarga: Math.round(diasCarga * 10) / 10,
        slotLivre: slotLivreISO(diasCarga),
      };
    }).sort((x, y) => (y.diasCarga || 0) - (x.diasCarga || 0));

    // Peças em CORTE SEM máquina definida — não entram em card de máquina nenhum.
    // Antes sumiam da tela inteira (a fila ficava subestimada); agora são expostas,
    // igual ao "sem máquina" do Dashboard.
    const sm = backlog["SEM_MAQUINA"] || { pecas: 0, kg: 0, iniciadas: 0 };
    const semMaquina = {
      pecas: sm.pecas, kg: sm.kg, iniciadas: sm.iniciadas,
      diasCarga: Math.round((sm.kg / META_PREPARACAO_KG_DIA) * 10) / 10,
    };
    const totalBacklogKg = maquinas.reduce((s, m) => s + m.backlogKg, 0) + semMaquina.kg;

    return NextResponse.json({
      maquinas,
      semMaquina,
      metaKgDia: META_PREPARACAO_KG_DIA,
      preparacao: {
        backlogKg: totalBacklogKg,
        dias: Math.round((totalBacklogKg / META_PREPARACAO_KG_DIA) * 10) / 10,
      },
      pendentes: { pecas: pendentes._count.id, kg: pendentes._sum.pesoTotalKg || 0 },
      hoje: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}
