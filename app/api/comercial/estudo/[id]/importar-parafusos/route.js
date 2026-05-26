import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 30;

const COLUMN_MAP = {
  tipo: "tipo", type: "tipo",
  descricao: "descricao", descrição: "descricao", description: "descricao",
  item: "descricao", material: "descricao", produto: "descricao", nome: "descricao",
  especificacao: "especificacao", especificação: "especificacao", espec: "especificacao",
  spec: "especificacao", norma: "especificacao",
  diametro: "diametro", diâmetro: "diametro", diam: "diametro",
  comprimento: "comprimento", comp: "comprimento", length: "comprimento",
  unidade: "unidade", unid: "unidade", un: "unidade",
  quantidade: "quantidade", qtd: "quantidade", qtde: "quantidade", qty: "quantidade",
  observacao: "observacao", observação: "observacao", obs: "observacao",
};

const TIPO_MAP = {
  parafuso: "PARAFUSO", bolt: "PARAFUSO",
  porca: "PORCA", nut: "PORCA",
  arruela: "ARRUELA", washer: "ARRUELA",
  chumbador: "CHUMBADOR", anchor: "CHUMBADOR",
  "barra roscada": "BARRA_ROSCADA", tirante: "BARRA_ROSCADA",
  conector: "CONECTOR", stud: "CONECTOR",
  inserto: "INSERTO",
  outro: "OUTRO",
};

function normalizeTipo(val) {
  if (!val) return "PARAFUSO";
  const v = val.toString().trim();
  if (["PARAFUSO", "PORCA", "ARRUELA", "CHUMBADOR", "BARRA_ROSCADA", "CONECTOR", "INSERTO", "OUTRO"].includes(v.toUpperCase())) {
    return v.toUpperCase();
  }
  return TIPO_MAP[v.toLowerCase()] || "PARAFUSO";
}

function normalizeHeader(header) {
  if (!header) return null;
  const h = header.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    const keyNorm = key.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    if (h === keyNorm || h.includes(keyNorm)) return field;
  }
  return null;
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Arquivo nao enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ success: false, error: "Planilha vazia" }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma linha encontrada" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const colMapping = {};
    for (const header of headers) {
      const field = normalizeHeader(header);
      if (field && !colMapping[field]) colMapping[field] = header;
    }

    if (!colMapping.descricao) {
      return NextResponse.json(
        { success: false, error: "Coluna de descricao nao encontrada. Use 'Descricao', 'Item' ou 'Material'." },
        { status: 400 }
      );
    }

    const ultimo = await prisma.parafusoItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proxOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = [];
    for (const row of rows) {
      const descricao = (row[colMapping.descricao] || "").toString().trim();
      if (!descricao) continue;

      itensParaCriar.push({
        estudoId: id,
        descricao,
        tipo: normalizeTipo(colMapping.tipo ? row[colMapping.tipo] : null),
        especificacao: colMapping.especificacao ? (row[colMapping.especificacao] || "").toString().trim() || null : null,
        diametro: colMapping.diametro ? (row[colMapping.diametro] || "").toString().trim() || null : null,
        comprimento: colMapping.comprimento ? (row[colMapping.comprimento] || "").toString().trim() || null : null,
        unidade: colMapping.unidade ? (row[colMapping.unidade] || "").toString().trim() || "un" : "un",
        quantidade: colMapping.quantidade ? (parseFloat(row[colMapping.quantidade]) || 0) : 0,
        estimativa: false,
        observacao: colMapping.observacao ? (row[colMapping.observacao] || "").toString().trim() || null : null,
        ordem: proxOrdem++,
      });
    }

    if (itensParaCriar.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum item valido encontrado" }, { status: 400 });
    }

    await prisma.parafusoItem.createMany({ data: itensParaCriar });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_PARAFUSOS",
        entity: "ParafusoItem",
        entityId: id,
        diff: { arquivo: file.name, itensImportados: itensParaCriar.length },
      },
    });

    const todos = await prisma.parafusoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: todos, importados: itensParaCriar.length }, { status: 201 });
  } catch (e) {
    console.error("Erro ao importar parafusos:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
