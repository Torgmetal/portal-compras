/**
 * lib/assistente/gerar-planilha.js
 *
 * Gera uma planilha Excel (template ISO 9001 da Torg) a partir dos dados que o
 * Torguinho coletou, salva no Vercel Blob e devolve a URL de download.
 */
import { put } from "@vercel/blob";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, adicionarRodapeISO,
} from "@/lib/excel-relatorio";

const MAX_LINHAS = 2000;

/**
 * @param {{ titulo:string, subtitulo?:string, colunas:string[], linhas:any[][], totais?:any[], codigoDoc?:string }} args
 * @param {{ name?:string }} [user]
 * @returns {Promise<{ ok?:boolean, url?:string, nome?:string, linhas?:number, erro?:string }>}
 */
export async function gerarPlanilhaTorg(args, user) {
  const { titulo, subtitulo, colunas, linhas, totais, codigoDoc } = args || {};
  if (!titulo || !Array.isArray(colunas) || colunas.length === 0) {
    return { erro: "Para gerar a planilha, informe 'titulo' e 'colunas' (lista de cabeçalhos)." };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { erro: "Storage de arquivos não configurado (BLOB_READ_WRITE_TOKEN ausente no servidor)." };
  }

  const dados = (Array.isArray(linhas) ? linhas : []).slice(0, MAX_LINHAS);
  // O template ISO precisa de no mínimo 4 colunas (logo + título + controle).
  // Se vier menos, completamos com colunas vazias.
  const totalColunas = Math.max(colunas.length, 4);
  const cols = colunas.map(String);
  while (cols.length < totalColunas) cols.push("");

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo,
    subtitulo: subtitulo || "",
    nomePlanilha: String(titulo).replace(/[^\w\d \-]/g, "").slice(0, 28) || "Relatorio",
    codigoDoc: codigoDoc || "REL-TORG-001",
    totalColunas,
  });

  // Larguras automáticas (limitadas)
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(String(c).length + 4, 12), 42);
  });

  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, cols);
  row++;

  for (const [idx, linha] of dados.entries()) {
    const arr = Array.isArray(linha) ? linha : [linha];
    const valores = cols.map((_, i) => {
      const v = arr[i];
      return v === null || v === undefined ? "" : v;
    });
    adicionarLinhaTabela(ws, row, valores, { fillColor: idx % 2 === 1 ? "F8FAFC" : undefined, wrapText: true });
    row++;
  }

  if (Array.isArray(totais) && totais.length) {
    const tot = cols.map((_, i) => { const v = totais[i]; return v === null || v === undefined ? "" : v; });
    adicionarLinhaTotais(ws, row, tot);
    row++;
  }

  // Rodapé ISO (elaborado pelo Torguinho a pedido do usuário)
  adicionarRodapeISO(ws, row + 1, totalColunas, {
    elaboradoPor: `Torguinho (p/ ${user?.name?.split(" ")[0] || "usuário"})`,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = Date.now();
  const safe = String(titulo).replace(/[^\w\d.\- ]/g, "_").slice(0, 60).trim() || "relatorio";
  const pathname = `torguinho/${stamp}-${safe}.xlsx`;

  try {
    const blob = await put(pathname, Buffer.from(buffer), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return { ok: true, url: blob.url, nome: `${safe}.xlsx`, linhas: dados.length };
  } catch (e) {
    return { erro: `Falha ao salvar a planilha: ${e.message}` };
  }
}
