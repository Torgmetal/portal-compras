// POST /api/producao/importar-syneco-corte
// Importa produção do Syneco (MesOrdem) para PecaConjunto e ProducaoSemanal.
// Filtra por OP + setor Corte — atualiza status das peças e cria registros diários.
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
      select: { id: true, marca: true, status: true, pesoTotalKg: true, qte: true },
    });
    const pecasPorMarca = Object.fromEntries(pecas.map(p => [p.marca, p]));

    // Processar cada registro do MES
    let matched = 0;
    let statusUpdated = 0;
    const notFound = [];
    let alreadyCut = 0;
    let semProducao = 0;
    const pesosPorData = {}; // { "2026-05-04": totalPesoKg }
    const pecasAtualizadas = []; // marcas que tiveram status atualizado

    for (const mes of mesOrdens) {
      if (mes.produzidoUn <= 0) {
        semProducao++;
        continue;
      }

      const peca = pecasPorMarca[mes.item];
      if (!peca) {
        // Tentar match parcial — o item do Syneco pode ter sufixo ou prefixo diferente
        const pecaAlt = pecas.find(p =>
          p.marca === mes.op || // op pode ser a marca
          mes.item.endsWith(p.marca) ||
          p.marca.endsWith(mes.item)
        );
        if (!pecaAlt) {
          notFound.push(mes.item);
          continue;
        }
        // Match alternativo encontrado
        matched++;
        if (pecaAlt.status === "PENDENTE") {
          await prisma.pecaConjunto.update({
            where: { id: pecaAlt.id },
            data: { status: "CORTE", ultimoSetor: "Corte" },
          });
          statusUpdated++;
          pecasAtualizadas.push(pecaAlt.marca);
        } else {
          alreadyCut++;
        }
      } else {
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
      }

      // Agrupar peso produzido por data (usar dataFim preferencialmente)
      const dataRef = mes.dataFim || mes.dataInicio;
      if (dataRef) {
        const dataKey = dataRef.toISOString().split("T")[0];
        if (!pesosPorData[dataKey]) pesosPorData[dataKey] = 0;
        pesosPorData[dataKey] += mes.pesoProduzido || 0;
      }
    }

    // Criar ProducaoSemanal por data de produção
    // Primeiro limpar registros anteriores do Syneco para esta OP + Corte (permite re-importar)
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

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "IMPORTAR_SYNECO_CORTE",
          entity: "PecaConjunto",
          entityId: op.id,
          diff: {
            obraCode,
            opNumero,
            totalMes: mesOrdens.length,
            comProducao: mesOrdens.length - semProducao,
            matched,
            statusUpdated,
            alreadyCut,
            notFound: notFound.slice(0, 30),
            diasProducao: diasCriados,
            pecasAtualizadas: pecasAtualizadas.slice(0, 30),
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      obraCode,
      opCliente: op.cliente,
      opObra: op.obra,
      totalMes: mesOrdens.length,
      comProducao: mesOrdens.length - semProducao,
      semProducao,
      matched,
      statusUpdated,
      alreadyCut,
      notFound,
      diasProducao: diasCriados,
      pesosPorData,
    });
  } catch (e) {
    console.error("[importar-syneco-corte] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
