import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 30;

const COLUMN_MAP = {
  tipo: "tipoPintura", "tipo pintura": "tipoPintura", "tipo de pintura": "tipoPintura",
  tinta: "tipoPintura", paint: "tipoPintura",
  descricao: "descricao", descrição: "descricao", description: "descricao",
  item: "descricao", material: "descricao", produto: "descricao", nome: "descricao",
  especificacao: "especificacao", especificação: "especificacao", espec: "especificacao",
  area: "areaM2", "area m2": "areaM2", "area pintura": "areaM2", m2: "areaM2",
  demaos: "demaos", demãos: "demaos", "demao": "demaos", demão: "demaos", coats: "demaos",
  espessura: "espessuraMicra", micra: "espessuraMicra", "µm": "espessuraMicra",
  cor: "cor", color: "cor", ral: "cor",
  norma: "norma", norm: "norma",
  observacao: "observacao", observação: "observacao", obs: "observacao",
};

const TIPO_PINTURA_MAP = {
  primer: "PRIMER",
  esmalte: "ESMALTE",
  epoxi: "EPOXI", epoxy: "EPOXI",
  poliuretano: "POLIURETANO", pu: "POLIURETANO",
  "galvanizacao a frio": "GALVANIZACAO_FRIO", "galv frio": "GALVANIZACAO_FRIO",
  intumescente: "INTUMESCENTE",
  zarcao: "ZARCAO", zarção: "ZARCAO",
  alquidica: "ALQUIDICA", alquídica: "ALQUIDICA",
  outro: "OUTRO",
};

function normalizeTipoPintura(val) {
  if (!val) return "OUTRO";
  const v = val.toString().trim();
  const validEnums = ["PRIMER", "ESMALTE", "EPOXI", "POLIURETANO", "GALVANIZACAO_FRIO", "INTUMESCENTE", "ZARCAO", "ALQUIDICA", "OUTRO"];
  if (validEnums.includes(v.toUpperCase())) return v.toUpperCase();
  const lower = v.toLowerCase();
  for (const [key, enumVal] of Object.entries(TIPO_PINTURA_MAP)) {
    if (lower.includes(key)) return enumVal;
  }
  return "OUTRO";
}

function normalizeHeader(header) {
  if (!header) return null;
  const h = header.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "").trim();
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    const keyNorm = key.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
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

    const ultimo = await prisma.pinturaItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proxOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = [];
    for (const row of rows) {
      const descricao = (row[colMapping.descricao] || "").toString().trim();
      if (!descricao) continue;

      const areaM2 = colMapping.areaM2 ? (parseFloat(row[colMapping.areaM2]) || 0) : 0;
      const demaos = colMapping.demaos ? (parseInt(row[colMapping.demaos]) || 1) : 1;

      itensParaCriar.push({
        estudoId: id,
        descricao,
        tipoPintura: normalizeTipoPintura(colMapping.tipoPintura ? row[colMapping.tipoPintura] : null),
        especificacao: colMapping.especificacao ? (row[colMapping.especificacao] || "").toString().trim() || null : null,
        areaM2,
        demaos: Math.min(Math.max(demaos, 1), 5),
        espessuraMicra: colMapping.espessuraMicra ? (parseFloat(row[colMapping.espessuraMicra]) || null) : null,
        unidade: "m2",
        quantidade: areaM2,
        cor: colMapping.cor ? (row[colMapping.cor] || "").toString().trim() || null : null,
        norma: colMapping.norma ? (row[colMapping.norma] || "").toString().trim() || null : null,
        observacao: colMapping.observacao ? (row[colMapping.observacao] || "").toString().trim() || null : null,
        ordem: proxOrdem++,
      });
    }

    if (itensParaCriar.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum item valido encontrado" }, { status: 400 });
    }

    await prisma.pinturaItem.createMany({ data: itensParaCriar });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_PINTURA",
        entity: "PinturaItem",
        entityId: id,
        diff: { arquivo: file.name, itensImportados: itensParaCriar.length },
      },
    });

    const todos = await prisma.pinturaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: todos, importados: itensParaCriar.length }, { status: 201 });
  } catch (e) {
    console.error("Erro ao importar pintura:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
