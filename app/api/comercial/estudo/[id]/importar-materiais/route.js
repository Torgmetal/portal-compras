import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";
import { isLevantamentoEstrutura, parseLevantamentoEstrutura } from "@/lib/parse-levantamento-estrutura";

export const runtime = "nodejs";
export const maxDuration = 30;

// Mapeamento de nomes de coluna para campos do modelo (importacao generica)
const COLUMN_MAP = {
  descricao: "descricao", "descrição": "descricao", description: "descricao",
  perfil: "descricao", bitola: "descricao", item: "descricao",
  tipo: "tipoMaterial", "tipo material": "tipoMaterial", type: "tipoMaterial",
  material: "norma", norma: "norma", aco: "norma", "aço": "norma",
  quantidade: "quantidade", qtd: "quantidade", qtde: "quantidade", qty: "quantidade",
  comprimento: "comprimento", comp: "comprimento", "compr.": "comprimento",
  "comprimento unitario": "comprimento", "compr unit": "comprimento",
  "peso unitario": "pesoUnitario", "peso un": "pesoUnitario", "kg/m": "pesoUnitario",
  "peso total": "pesoTotal", "peso kg": "pesoTotal",
  setor: "setor", area: "setor",
};

const TIPO_MAP = {
  "viga w": "PERFIL_W", "vigas w": "PERFIL_W", "perfil w": "PERFIL_W", w: "PERFIL_W",
  "perfil hp": "PERFIL_W", hp: "PERFIL_W",
  "viga i": "PERFIL_W", "vigas i": "PERFIL_W", i: "PERFIL_W",
  "perfil h": "PERFIL_W", h: "PERFIL_W", heb: "PERFIL_W",
  "u laminado": "PERFIL_U", u: "PERFIL_U", udc: "PERFIL_U", ude: "PERFIL_U",
  "perfil c": "PERFIL_U", c: "PERFIL_U",
  "perfil z": "OUTRO", z: "OUTRO",
  cantoneira: "PERFIL_L", "cantoneira l": "PERFIL_L", l: "PERFIL_L",
  "barra chata": "BARRA_CHATA", chata: "BARRA_CHATA",
  "ferro redondo": "BARRA_REDONDA", redondo: "BARRA_REDONDA",
  "barra redonda": "BARRA_REDONDA",
  "tubo redondo": "TUBO_REDONDO",
  "tubo quadrado": "TUBO_QUADRADO",
  "tubo retangular": "TUBO_RETANGULAR",
  chapa: "CHAPA", "barra roscada": "BARRA_ROSCADA",
  tela: "TELA", "grade piso": "GRADE_PISO", degrau: "DEGRAU",
};

const VALID_TIPOS = [
  "PERFIL_W", "PERFIL_U", "PERFIL_L", "TUBO_REDONDO", "TUBO_QUADRADO",
  "TUBO_RETANGULAR", "CHAPA", "BARRA_REDONDA", "BARRA_CHATA",
  "BARRA_QUADRADA", "BARRA_ROSCADA", "TELA", "GRADE_PISO", "DEGRAU", "OUTRO",
];

function normalizeTipo(val) {
  if (!val) return "OUTRO";
  const upper = val.toString().trim().toUpperCase();
  if (VALID_TIPOS.includes(upper)) return upper;
  const t = val.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [key, tipo] of Object.entries(TIPO_MAP)) {
    if (t === key || t.includes(key)) return tipo;
  }
  return "OUTRO";
}

function normalizeHeader(header) {
  if (!header) return null;
  const h = header.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 /]/g, "");
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    const keyNorm = key.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 /]/g, "");
    if (h === keyNorm || h.includes(keyNorm)) return field;
  }
  return null;
}

// Parse generico (planilha com colunas nomeadas)
function parseGenerico(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { itens: [], erros: ["Planilha vazia"] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) return { itens: [], erros: ["Nenhuma linha encontrada"] };

  const headers = Object.keys(rows[0]);
  const colMapping = {};
  for (const header of headers) {
    const field = normalizeHeader(header);
    if (field && !colMapping[field]) colMapping[field] = header;
  }

  if (!colMapping.descricao) {
    return { itens: [], erros: ["Coluna de descricao/perfil nao encontrada. A planilha precisa ter uma coluna chamada 'Perfil', 'Descricao', 'Bitola' ou 'Item'."] };
  }

  const itens = [];
  let ordem = 0;
  for (const row of rows) {
    const descricao = (row[colMapping.descricao] || "").toString().trim();
    if (!descricao) continue;

    const colA = descricao.toUpperCase();
    if (colA.includes("SUBTOTAL") || colA.includes("TOTAL")) continue;

    const quantidade = colMapping.quantidade ? (parseInt(row[colMapping.quantidade]) || 1) : 1;
    const comprimento = colMapping.comprimento ? (parseFloat(row[colMapping.comprimento]) || null) : null;
    const pesoUnitario = colMapping.pesoUnitario ? (parseFloat(row[colMapping.pesoUnitario]) || 0) : 0;
    let pesoTotal = colMapping.pesoTotal ? (parseFloat(row[colMapping.pesoTotal]) || 0) : 0;

    if (pesoTotal === 0 && pesoUnitario > 0 && comprimento > 0) {
      pesoTotal = quantidade * comprimento * pesoUnitario;
    } else if (pesoTotal === 0 && pesoUnitario > 0) {
      pesoTotal = quantidade * pesoUnitario;
    }

    const tipoStr = colMapping.tipoMaterial ? (row[colMapping.tipoMaterial] || "").toString().trim() : "";
    const tipoMaterial = normalizeTipo(tipoStr);
    const norma = colMapping.norma ? (row[colMapping.norma] || "").toString().trim() || null : null;
    const setor = colMapping.setor ? (row[colMapping.setor] || "").toString().trim() || null : null;

    itens.push({
      tipoMaterial,
      descricao,
      norma,
      setor,
      quantidade,
      comprimento,
      pesoUnitario,
      pesoTotal,
      ordem: ordem++,
    });
  }

  return { itens, erros: itens.length === 0 ? ["Nenhum item valido encontrado"] : [] };
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const preview = searchParams.get("preview") === "true";

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Arquivo nao enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Auto-detect formato
    const isLevantamento = isLevantamentoEstrutura(buffer);
    const { itens, erros } = isLevantamento
      ? parseLevantamentoEstrutura(buffer)
      : parseGenerico(buffer);

    if (erros.length > 0 && itens.length === 0) {
      return NextResponse.json({ success: false, error: erros[0] }, { status: 400 });
    }

    // Se preview, retornar itens sem salvar
    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        formato: isLevantamento ? "levantamento-estrutura" : "generico",
        data: itens,
        avisos: erros,
      });
    }

    // Salvar itens via batch no endpoint de itens (createMany)
    const ultimo = await prisma.pesoProjetoItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proxOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = itens.map((item) => ({
      estudoId: id,
      tipoMaterial: item.tipoMaterial || "OUTRO",
      descricao: item.descricao,
      norma: item.norma || null,
      setor: item.setor || null,
      quantidade: item.quantidade || 1,
      comprimento: item.comprimento || null,
      pesoUnitario: item.pesoUnitario || 0,
      pesoTotal: item.pesoTotal || 0,
      ordem: proxOrdem++,
    }));

    await prisma.pesoProjetoItem.createMany({ data: itensParaCriar });

    // Recalcular totais do estudo
    const totais = await prisma.pesoProjetoItem.aggregate({
      where: { estudoId: id },
      _sum: { pesoTotal: true, areaPintura: true },
    });

    await prisma.propostaEstudo.update({
      where: { id },
      data: {
        pesoTotal: totais._sum.pesoTotal || 0,
        areaTotal: totais._sum.areaPintura || 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_MATERIAIS",
        entity: "PesoProjetoItem",
        entityId: id,
        diff: {
          arquivo: file.name,
          formato: isLevantamento ? "levantamento-estrutura" : "generico",
          itensImportados: itensParaCriar.length,
        },
      },
    });

    const todos = await prisma.pesoProjetoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: todos,
      importados: itensParaCriar.length,
    }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
