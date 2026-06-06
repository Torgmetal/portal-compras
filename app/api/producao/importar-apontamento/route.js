// POST /api/producao/importar-apontamento
// Importa apontamentos de producao via planilha (modelo OPR / Syneco).
// Atualiza qteProduzida, pesoProduzido, status e dataProducao em PecaConjunto.
// Tambem atualiza ProducaoDiaria para o setor correspondente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_VALIDOS = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

const rowSchema = z.object({
  opNumero: z.string().min(1),
  marca: z.string().min(1),
  setor: z.enum(STATUS_VALIDOS),
  qteProduzida: z.number().int().min(0),
  pesoProduzido: z.number().min(0).optional().default(0),
  dataProducao: z.string().optional().nullable(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1, "Envie pelo menos 1 linha"),
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
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados invalidos" }, { status: 400 });
  }

  const { rows } = body;

  // Buscar todas as pecas mencionadas de uma vez
  const chaves = [...new Set(rows.map((r) => `${r.opNumero}||${r.marca}`))];
  const opNumeros = [...new Set(rows.map((r) => r.opNumero))];

  const pecas = await prisma.pecaConjunto.findMany({
    where: { opNumero: { in: opNumeros } },
    select: { id: true, opNumero: true, marca: true, qte: true, pesoTotalKg: true, status: true, qteProduzida: true },
  });
  const pecaMap = Object.fromEntries(pecas.map((p) => [`${p.opNumero}||${p.marca}`, p]));

  // Processar linha a linha
  const resultados = [];
  let atualizados = 0;
  let naoEncontrados = 0;
  let erros = 0;
  const pesosPorSetorData = {}; // {setor_data: pesoKg}

  for (const row of rows) {
    const chave = `${row.opNumero}||${row.marca}`;
    const peca = pecaMap[chave];

    if (!peca) {
      resultados.push({ op: row.opNumero, marca: row.marca, status: "NAO_ENCONTRADA" });
      naoEncontrados++;
      continue;
    }

    // Parsear data de producao
    let dataProd = null;
    if (row.dataProducao) {
      const s = row.dataProducao.trim();
      // dd/mm/yyyy
      const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m1) {
        dataProd = new Date(`${m1[3]}-${String(m1[2]).padStart(2, "0")}-${String(m1[1]).padStart(2, "0")}T12:00:00`);
      } else {
        // yyyy-mm-dd
        const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m2) dataProd = new Date(`${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}T12:00:00`);
        else {
          const d = new Date(s);
          if (!isNaN(d)) dataProd = d;
        }
      }
    }

    // Montar dados de update
    const updateData = {
      qteProduzida: row.qteProduzida,
      pesoProduzido: row.pesoProduzido || 0,
      status: row.setor,
    };

    if (dataProd) updateData.dataProducao = dataProd;

    // Se status nao eh PENDENTE nem EXPEDIDO, salvar ultimoSetor
    if (row.setor !== "PENDENTE" && row.setor !== "EXPEDIDO") {
      updateData.ultimoSetor = row.setor;
    }
    if (row.setor === "EXPEDIDO") {
      updateData.dataConcluida = new Date();
    }

    try {
      await prisma.pecaConjunto.update({
        where: { id: peca.id },
        data: updateData,
      });

      // Acumular peso por setor+data para ProducaoDiaria
      if (row.pesoProduzido > 0 && dataProd) {
        const dataKey = dataProd.toISOString().slice(0, 10);
        const chaveSD = `${row.setor}_${dataKey}`;
        if (!pesosPorSetorData[chaveSD]) {
          pesosPorSetorData[chaveSD] = { setor: row.setor, data: dataKey, pesoKg: 0 };
        }
        pesosPorSetorData[chaveSD].pesoKg += row.pesoProduzido;
      }

      resultados.push({ op: row.opNumero, marca: row.marca, status: "ATUALIZADO", setor: row.setor });
      atualizados++;
    } catch (e) {
      resultados.push({ op: row.opNumero, marca: row.marca, status: "ERRO", erro: e.message });
      erros++;
    }
  }

  // Atualizar ProducaoDiaria (peso realizado por setor/dia)
  for (const entry of Object.values(pesosPorSetorData)) {
    try {
      await prisma.producaoDiaria.upsert({
        where: { data_setor: { data: new Date(entry.data + "T12:00:00"), setor: entry.setor } },
        update: { pesoRealizadoKg: { increment: entry.pesoKg } },
        create: {
          data: new Date(entry.data + "T12:00:00"),
          setor: entry.setor,
          pesoRealizadoKg: entry.pesoKg,
          pesoMetaKg: 0,
        },
      });
    } catch {
      // ProducaoDiaria nao-fatal
    }
  }

  // Audit log
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_APONTAMENTO",
        entity: "PecaConjunto",
        entityId: "bulk",
        diff: { total: rows.length, atualizados, naoEncontrados, erros },
      },
    });
  } catch {
    // Nao-fatal
  }

  return NextResponse.json({
    resumo: { total: rows.length, atualizados, naoEncontrados, erros },
    resultados,
  });
}
