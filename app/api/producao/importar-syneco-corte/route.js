// POST /api/producao/importar-syneco-corte
// Importa produção do Syneco (MesOrdem) para PecaConjunto e ProducaoSemanal.
// Filtra por OP + setor Corte — atualiza status das peças e cria registros diários.
// Retorna detalhes de atendimento: planejado vs produzido vs faltante.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { isoWeekString, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";

const schema = z.object({
  opNumero: z.string().min(1, "Informe o número da OP"),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  try {
    const { opNumero } = body;

    // Encontrar a OP (tenta com e sem zero à esquerda)
    const numeroPadded = opNumero.padStart(3, "0");
    const op = await prisma.oP.findFirst({
      where: { OR: [{ numero: numeroPadded }, { numero: opNumero }] },
      select: { id: true, numero: true, cliente: true, obra: true },
    });
    if (!op) {
      return NextResponse.json({ error: `OP ${opNumero} não encontrada` }, { status: 404 });
    }

    // Código da obra no Syneco: T + número sem zeros (T85, T86...)
    const obraCode = "T" + parseInt(opNumero);

    // Buscar MesOrdem para esta obra, setor Corte
    const mesOrdens = await prisma.mesOrdem.findMany({
      where: {
        obra: obraCode,
        setor: { contains: "Corte", mode: "insensitive" },
      },
      orderBy: { item: "asc" },
    });

    if (mesOrdens.length === 0) {
      return NextResponse.json({
        error: `Nenhum dado do Syneco encontrado para obra ${obraCode} no setor Corte. Verifique se o sync do MES já rodou para esta OP.`,
        obraCode,
      }, { status: 404 });
    }

    // Buscar PecaConjunto desta OP
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opNumero },
      select: { id: true, marca: true, descricao: true, status: true, pesoTotalKg: true, qte: true },
    });
    const pecasPorMarca = Object.fromEntries(pecas.map(p => [p.marca, p]));

    // Processar cada registro do MES — coletar detalhes de atendimento
    let matched = 0;
    let statusUpdated = 0;
    const notFound = [];
    let alreadyCut = 0;
    const pesosPorData = {};
    const pecasAtualizadas = [];
    const detalhes = []; // detalhes de atendimento por peça

    for (const mes of mesOrdens) {
      // Tentar achar a peça no portal
      let peca = pecasPorMarca[mes.item];
      if (!peca) {
        peca = pecas.find(p =>
          p.marca === mes.op ||
          mes.item.endsWith(p.marca) ||
          p.marca.endsWith(mes.item)
        ) || null;
      }

      const detalhe = {
        marca: peca?.marca || mes.item,
        descricao: mes.descItem || peca?.descricao || "",
        qtePlanejada: mes.planejadoUn || 0,
        qteProduzida: mes.produzidoUn || 0,
        qteFalta: Math.max(0, (mes.planejadoUn || 0) - (mes.produzidoUn || 0)),
        pesoPlanejado: mes.pesoPlanejado || 0,
        pesoProduzido: mes.pesoProduzido || 0,
        pesoFalta: Math.max(0, (mes.pesoPlanejado || 0) - (mes.pesoProduzido || 0)),
        statusSyneco: mes.status || "—",
        dataFim: mes.dataFim ? mes.dataFim.toISOString().split("T")[0] : null,
        encontrada: !!peca,
        statusPortal: peca?.status || null,
      };
      detalhes.push(detalhe);

      // Sem produção — registrar no detalhe mas não mudar status
      if (mes.produzidoUn <= 0) continue;

      if (!peca) {
        notFound.push(mes.item);
        continue;
      }

      matched++;
      if (peca.status === "PENDENTE") {
        await prisma.pecaConjunto.update({
          where: { id: peca.id },
          data: { status: "CORTE", ultimoSetor: "Corte" },
        });
        statusUpdated++;
        pecasAtualizadas.push(peca.marca);
      } else {
        alreadyCut++;
      }

      // Agrupar peso por data
      const dataRef = mes.dataFim || mes.dataInicio;
      if (dataRef) {
        const dataKey = dataRef.toISOString().split("T")[0];
        if (!pesosPorData[dataKey]) pesosPorData[dataKey] = 0;
        pesosPorData[dataKey] += mes.pesoProduzido || 0;
      }
    }

    // Totais de atendimento
    const totais = {
      qtePlanejada: detalhes.reduce((s, d) => s + d.qtePlanejada, 0),
      qteProduzida: detalhes.reduce((s, d) => s + d.qteProduzida, 0),
      qteFalta: detalhes.reduce((s, d) => s + d.qteFalta, 0),
      pesoPlanejado: detalhes.reduce((s, d) => s + d.pesoPlanejado, 0),
      pesoProduzido: detalhes.reduce((s, d) => s + d.pesoProduzido, 0),
      pesoFalta: detalhes.reduce((s, d) => s + d.pesoFalta, 0),
    };
    totais.percentualQte = totais.qtePlanejada > 0 ? (totais.qteProduzida / totais.qtePlanejada * 100) : 0;
    totais.percentualPeso = totais.pesoPlanejado > 0 ? (totais.pesoProduzido / totais.pesoPlanejado * 100) : 0;

    // Ler registros antigos do Syneco para esta OP (para subtrair do ProducaoDiaria na re-importação)
    const oldSyneco = await prisma.producaoSemanal.findMany({
      where: { opId: op.id, setor: "Corte", fonte: "SYNECO" },
      select: { data: true, pesoRealizadoKg: true },
    });
    const oldPesosPorData = {};
    for (const r of oldSyneco) {
      const k = r.data.toISOString().split("T")[0];
      oldPesosPorData[k] = (oldPesosPorData[k] || 0) + r.pesoRealizadoKg;
    }

    // Limpar ProducaoSemanal antigos e recriar
    await prisma.producaoSemanal.deleteMany({
      where: { opId: op.id, setor: "Corte", fonte: "SYNECO" },
    });

    let diasCriados = 0;
    for (const [dataStr, pesoKg] of Object.entries(pesosPorData)) {
      if (pesoKg <= 0) continue;
      const dataDia = new Date(dataStr + "T00:00:00.000Z");
      const sem = isoWeekString(dataDia);
      const p = parseSemana(sem);
      const dataIni = p ? semanaInicio(p.ano, p.semana) : dataDia;
      const dataFm = p ? semanaFim(p.ano, p.semana) : dataDia;

      await prisma.producaoSemanal.create({
        data: {
          data: dataDia,
          semana: sem,
          dataInicio: dataIni,
          dataFim: dataFm,
          pesoPrevistoKg: 0,
          pesoRealizadoKg: pesoKg,
          opId: op.id,
          setor: "Corte",
          fonte: "SYNECO",
          observacao: `Importado do Syneco — setor Corte`,
          createdById: user.id,
        },
      });
      diasCriados++;
    }

    // Upsert ProducaoDiaria — alimenta o Controle de Produção
    // Primeiro subtrai valores antigos desta OP (idempotência na re-importação)
    let diasControle = 0;
    const todasDatas = new Set([...Object.keys(oldPesosPorData), ...Object.keys(pesosPorData)]);
    for (const dataStr of todasDatas) {
      const oldPeso = oldPesosPorData[dataStr] || 0;
      const newPeso = pesosPorData[dataStr] || 0;
      const delta = newPeso - oldPeso;
      if (delta === 0) continue;

      const dataDia = new Date(dataStr + "T00:00:00.000Z");
      try {
        const existing = await prisma.producaoDiaria.findUnique({
          where: { data_setor: { data: dataDia, setor: "CORTE" } },
        });
        if (existing) {
          await prisma.producaoDiaria.update({
            where: { data_setor: { data: dataDia, setor: "CORTE" } },
            data: { pesoRealizadoKg: Math.max(0, existing.pesoRealizadoKg + delta) },
          });
        } else if (newPeso > 0) {
          await prisma.producaoDiaria.create({
            data: {
              data: dataDia,
              setor: "CORTE",
              pesoRealizadoKg: newPeso,
              pesoMetaKg: 0,
              observacao: `Syneco ${obraCode}`,
              createdById: user.id,
            },
          });
        }
        diasControle++;
      } catch {}
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "IMPORTAR_SYNECO_CORTE",
          entity: "PecaConjunto",
          entityId: op.id,
          diff: {
            obraCode, opNumero, matched, statusUpdated, alreadyCut,
            notFound: notFound.slice(0, 30),
            diasProducao: diasCriados,
            totais,
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      obraCode,
      opCliente: op.cliente,
      opObra: op.obra,
      matched,
      statusUpdated,
      alreadyCut,
      notFound,
      diasProducao: diasCriados,
      pesosPorData,
      detalhes,
      totais,
    });
  } catch (e) {
    console.error("[importar-syneco-corte] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
