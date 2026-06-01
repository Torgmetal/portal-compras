import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const maxDuration = 60;

const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID;
const BASE_PATH = "/Ordem de Servico/01. OP";

/**
 * GET /api/romaneios/sharepoint?op=087
 * Lista romaneios do SharePoint para uma OP.
 * Retorna metadados de cada arquivo .xlsm na pasta 4. Expedição/4.2 Romaneios.
 *
 * GET /api/romaneios/sharepoint?op=087&arquivo=01. ROMANEIO...xlsm
 * Baixa e parseia um .xlsm específico, retornando cabeçalho + itens (marcas/pesos).
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "EXPEDICAO", "COMERCIAL", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const opParam = searchParams.get("op");
  const arquivo = searchParams.get("arquivo");

  if (!opParam) {
    return NextResponse.json({ success: false, error: "Parametro 'op' obrigatorio" }, { status: 400 });
  }

  const token = await getAccessToken();

  // Encontrar pasta da OP (nome começa com "OP-{num}")
  const opNum = opParam.replace(/^0+/, "").padStart(3, "0");
  const opPrefix = `OP-${opNum}`;

  let opFolderName;
  try {
    opFolderName = await findOpFolder(token, opPrefix);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 404 });
  }

  const romaneiosPath = `${BASE_PATH}/${opFolderName}/4. Expedição/4.2 Romaneios`;

  // Se pediu arquivo específico, faz parse do .xlsm
  if (arquivo) {
    try {
      const data = await parseRomaneioXlsm(token, `${romaneiosPath}/${arquivo}`);
      return NextResponse.json({ success: true, ...data });
    } catch (e) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // Caso contrário, lista todos os romaneios da pasta
  try {
    const files = await listRomaneios(token, romaneiosPath);
    return NextResponse.json({ success: true, op: opPrefix, pasta: opFolderName, romaneios: files });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Pasta de romaneios nao encontrada: " + e.message }, { status: 404 });
  }
}

/** Encontra o nome completo da pasta da OP (ex: "OP-087 - Marko - Shopp. Center Norte") */
async function findOpFolder(token, opPrefix) {
  const encodedPath = BASE_PATH.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$select=name,folder&$top=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Erro ao acessar SharePoint");
  const data = await res.json();
  const folder = data.value?.find((f) => f.folder && f.name.startsWith(opPrefix));
  if (!folder) throw new Error(`Pasta ${opPrefix} nao encontrada no SharePoint`);
  return folder.name;
}

/** Lista arquivos .xlsm e .pdf na pasta de romaneios */
async function listRomaneios(token, folderPath) {
  const encodedPath = folderPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$select=name,file,size,lastModifiedDateTime,webUrl&$top=100&$orderby=name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Pasta nao acessivel");
  const data = await res.json();

  const files = (data.value || []).filter((f) => f.file);

  // Agrupar por número do romaneio (01., 02., etc.)
  const grouped = {};
  for (const f of files) {
    const match = f.name.match(/^(\d+)\.\s*/);
    const num = match ? match[1] : f.name;
    if (!grouped[num]) grouped[num] = { numero: num, xlsm: null, pdf: null };
    if (f.name.toLowerCase().endsWith(".xlsm")) {
      grouped[num].xlsm = { name: f.name, size: f.size, modified: f.lastModifiedDateTime, webUrl: f.webUrl };
    } else if (f.name.toLowerCase().endsWith(".pdf")) {
      grouped[num].pdf = { name: f.name, size: f.size, modified: f.lastModifiedDateTime, webUrl: f.webUrl };
    }
  }

  return Object.values(grouped).sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));
}

/** Baixa e parseia o conteúdo de um .xlsm (cabeçalho + tabela de peças) */
async function parseRomaneioXlsm(token, filePath) {
  const encodedPath = filePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Erro ao baixar arquivo");
  const buffer = Buffer.from(await res.arrayBuffer());

  // Parse com ExcelJS
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("ROMANEIO");
  if (!ws) throw new Error("Aba ROMANEIO nao encontrada");

  const getVal = (r, c) => {
    const v = ws.getRow(r).getCell(c).value;
    if (v === null || v === undefined) return null;
    if (typeof v === "object") {
      if (v.result !== undefined) return v.result;
      if (v.richText) return v.richText.map((t) => t.text).join("");
      if (v instanceof Date) return v.toISOString();
      return null;
    }
    return v;
  };

  // Cabeçalho
  const cabecalho = {
    op: String(getVal(11, 3) || "").trim(),
    numeroRomaneio: String(getVal(11, 10) || "").trim(),
    cliente: String(getVal(14, 5) || "").trim(),
    obra: String(getVal(14, 10) || "").trim(),
    dataSaida: getVal(19, 10) || null,
    transportador: String(getVal(22, 5) || "").trim(),
  };

  // Itens (a partir de R33 até "Total Geral")
  const itens = [];
  let pesoTotal = 0;
  let qtdTotal = 0;

  for (let r = 33; r <= 600; r++) {
    const totalGeral = getVal(r, 3);
    if (totalGeral && String(totalGeral).includes("Total")) {
      pesoTotal = Number(getVal(r, 10)) || 0;
      break;
    }
    const marca = getVal(r, 4);
    if (!marca || marca === "(vazio)") continue;

    const qtd = Number(getVal(r, 5)) || 0;
    const peso = Number(getVal(r, 10)) || 0;
    qtdTotal += qtd;

    itens.push({
      volume: getVal(r, 2),
      marca: String(marca).trim(),
      qtd,
      unidade: String(getVal(r, 6) || "PÇ").trim(),
      descricao: String(getVal(r, 8) || "").trim(),
      amarrado: String(getVal(r, 9) || "").trim(),
      pesoKg: peso,
    });
  }

  // Se pesoTotal não foi encontrado via "Total Geral", calcular
  if (pesoTotal === 0 && itens.length > 0) {
    pesoTotal = itens.reduce((s, i) => s + i.pesoKg, 0);
  }

  return { cabecalho, itens, pesoTotal, qtdTotal, totalMarcas: itens.length };
}
