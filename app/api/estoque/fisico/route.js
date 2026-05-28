// GET  /api/estoque/fisico — lista estoque físico (MP) importado do SharePoint
// POST /api/estoque/fisico — dispara sync: baixa planilha do SharePoint e reimporta
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { downloadFileByPath, getAccessToken } from "@/lib/sharepoint";
import * as XLSX from "xlsx";

export const maxDuration = 60;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} nao configurado`);
  return v;
}

// Excel serial → Date
function excelDateToJS(serial) {
  if (!serial || typeof serial !== "number") return null;
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return isNaN(d.getTime()) ? null : d;
}

function parseSheet(ws, sheetTag) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  // Pula header rows (row 0 = titulo, row 1 = total, row 2 = cabeçalho)
  const headerRow = data.findIndex((r) =>
    String(r[0]).toUpperCase().includes("PERFIL")
  );
  if (headerRow < 0) return [];

  const rows = data.slice(headerRow + 1);
  const items = [];
  for (const r of rows) {
    const perfil = String(r[0] || "").trim();
    if (!perfil) continue;

    const bitola = String(r[1] || "").trim();
    const qtd = parseInt(r[2]) || 1;
    const compr = parseFloat(r[3]) || null;
    const larg = parseFloat(r[4]) || null;
    const area = parseFloat(r[5]) || null;
    const peso = parseFloat(r[6]) || 0;

    // Colunas 7-12 variam entre as abas:
    // SAÍDA ESTOQUE: [7]=DESTINO, [8]=OBRA, [9]=AÇO, [10]=DATA, [11]=INSP, [12]=OP
    // ESTOQUE 01:    [7]=ORIGEM,  [8]=DESTINO, [9]=AÇO, [10]=DATA, [11]=INSP, [12]=OP
    let origem, destino, obra, aco, dataLanc, inspCorr, opReserva;
    if (sheetTag === "SAIDA_ESTOQUE") {
      destino = String(r[7] || "").trim() || null;
      obra = String(r[8] || "").trim() || null;
      aco = String(r[9] || "").trim() || null;
      dataLanc = excelDateToJS(r[10]);
      inspCorr = String(r[11] || "").trim() || null;
      opReserva = String(r[12] || "").trim() || null;
    } else {
      origem = String(r[7] || "").trim() || null;
      destino = String(r[8] || "").trim() || null;
      aco = String(r[9] || "").trim() || null;
      dataLanc = excelDateToJS(r[10]);
      inspCorr = String(r[11] || "").trim() || null;
      opReserva = String(r[12] || "").trim() || null;
    }

    // Perfis W, H e HP sao sempre A572-Gr 50 na Torg
    const PERFIS_A572 = ["W", "H", "HP"];
    if (PERFIS_A572.includes(perfil) && (!aco || aco.toUpperCase().includes("A36") || aco.toUpperCase() === "A-36")) {
      aco = "A572-Gr 50";
    }

    items.push({
      perfil,
      bitola,
      qtd,
      comprimento: compr,
      largura: larg,
      area,
      peso,
      origem: origem || null,
      destino: destino || null,
      obra: obra || null,
      aco: aco || null,
      dataLanc,
      inspCorr: inspCorr || null,
      opReserva: opReserva || null,
      sheet: sheetTag,
    });
  }
  return items;
}

// ─── GET ─────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS", "PRODUCAO", "ALMOXARIFADO"]);

    const [itensEstoque, itensSaida, syncInfo] = await Promise.all([
      prisma.estoqueFisico.findMany({
        where: { sheet: "ESTOQUE_01" },
        orderBy: [{ perfil: "asc" }, { bitola: "asc" }],
      }),
      prisma.estoqueFisico.findMany({
        where: { sheet: "SAIDA_ESTOQUE" },
        orderBy: [{ perfil: "asc" }, { bitola: "asc" }],
      }),
      prisma.estoqueFisicoSync.findFirst({ where: { id: "singleton" } }),
    ]);

    // ── Agrega ESTOQUE 01 (saldo real em patio) ──
    const agrupado = {};
    let pesoTotal = 0;
    let qtdTotal = 0;
    for (const item of itensEstoque) {
      const key = `${item.perfil}|${item.bitola}|${item.aco || ""}`;
      if (!agrupado[key]) {
        agrupado[key] = {
          perfil: item.perfil,
          bitola: item.bitola,
          aco: item.aco,
          qtdTotal: 0,
          pesoTotal: 0,
          comprimento: item.comprimento,
          lotes: [],
        };
      }
      agrupado[key].qtdTotal += item.qtd;
      agrupado[key].pesoTotal += item.peso;
      agrupado[key].lotes.push({
        id: item.id,
        qtd: item.qtd,
        peso: item.peso,
        comprimento: item.comprimento,
        largura: item.largura,
        area: item.area,
        obra: item.obra,
        destino: item.destino,
        origem: item.origem,
        opReserva: item.opReserva,
        inspCorr: item.inspCorr,
        dataLanc: item.dataLanc,
        sheet: item.sheet,
      });
      pesoTotal += item.peso;
      qtdTotal += item.qtd;
    }

    const materiais = Object.values(agrupado).sort((a, b) => {
      if (a.perfil !== b.perfil) return a.perfil.localeCompare(b.perfil);
      return a.bitola.localeCompare(b.bitola);
    });

    // Resumo por perfil (somente estoque)
    const porPerfil = {};
    for (const m of materiais) {
      if (!porPerfil[m.perfil]) porPerfil[m.perfil] = { qtd: 0, peso: 0, itens: 0 };
      porPerfil[m.perfil].qtd += m.qtdTotal;
      porPerfil[m.perfil].peso += m.pesoTotal;
      porPerfil[m.perfil].itens++;
    }

    // ── Resumo de saidas (referencia) ──
    let pesoSaida = 0;
    let qtdSaida = 0;
    for (const item of itensSaida) {
      pesoSaida += item.peso;
      qtdSaida += item.qtd;
    }

    return NextResponse.json({
      success: true,
      materiais,
      resumo: {
        totalItens: itensEstoque.length,
        totalMateriais: materiais.length,
        pesoTotal,
        qtdTotal,
        porPerfil,
        // Saidas como referencia separada
        saida: { totalItens: itensSaida.length, pesoTotal: pesoSaida, qtdTotal: qtdSaida },
      },
      ultimaSync: syncInfo?.ultimaSync || null,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ─── POST (sync) ─────────────────────────────────────────────────────────
export async function POST() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const driveId = env("SHAREPOINT_DRIVE_ID");

    // Baixa o arquivo
    const buffer = await downloadFileByPath({
      driveId,
      fullPath: "/Estoque/Estoque MP.xlsx",
    });

    // Parse
    const wb = XLSX.read(buffer, { type: "buffer" });
    const allItems = [];
    const sheetsImportadas = [];

    // ESTOQUE 01
    if (wb.Sheets["ESTOQUE 01"]) {
      const items = parseSheet(wb.Sheets["ESTOQUE 01"], "ESTOQUE_01");
      allItems.push(...items);
      sheetsImportadas.push("ESTOQUE 01");
    }

    // SAÍDA ESTOQUE
    if (wb.Sheets["SAÍDA ESTOQUE"]) {
      const items = parseSheet(wb.Sheets["SAÍDA ESTOQUE"], "SAIDA_ESTOQUE");
      allItems.push(...items);
      sheetsImportadas.push("SAÍDA ESTOQUE");
    }

    if (allItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum item encontrado na planilha" },
        { status: 400 }
      );
    }

    const pesoTotal = allItems.reduce((s, i) => s + i.peso, 0);

    // Transação: limpa tudo e insere de novo
    await prisma.$transaction(async (tx) => {
      await tx.estoqueFisico.deleteMany();
      // createMany em batches de 100
      for (let i = 0; i < allItems.length; i += 100) {
        await tx.estoqueFisico.createMany({ data: allItems.slice(i, i + 100) });
      }
      await tx.estoqueFisicoSync.upsert({
        where: { id: "singleton" },
        update: {
          ultimaSync: new Date(),
          totalItens: allItems.length,
          pesoTotalKg: pesoTotal,
          sheets: sheetsImportadas,
        },
        create: {
          id: "singleton",
          ultimaSync: new Date(),
          totalItens: allItems.length,
          pesoTotalKg: pesoTotal,
          sheets: sheetsImportadas,
        },
      });
    });

    return NextResponse.json({
      success: true,
      importados: allItems.length,
      pesoTotalKg: pesoTotal,
      sheets: sheetsImportadas,
    });
  } catch (e) {
    console.error("Erro sync estoque fisico:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
