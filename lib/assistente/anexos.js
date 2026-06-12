/**
 * lib/assistente/anexos.js
 *
 * Processa um arquivo anexado pelo usuário no chat do Torguinho, convertendo-o
 * num formato que o agente entende:
 *  - planilha (xlsx/xls/csv) → texto tabular
 *  - pdf / txt               → texto
 *  - imagem (png/jpg/…)      → base64 (visão do Claude)
 */

const MAX_CHARS = 14000;          // teto de texto injetado (controle de tokens)
const MAX_IMG = 3.5 * 1024 * 1024; // imagem: limite seguro pra base64 do Claude

export async function processarAnexo(file) {
  const nome = String(file?.name || "arquivo");
  const ext = nome.split(".").pop()?.toLowerCase() || "";
  const mime = (file?.type || "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Imagem → visão ──
  if (/^(png|jpe?g|gif|webp)$/.test(ext) || mime.startsWith("image/")) {
    if (buffer.length > MAX_IMG) return { erro: "Imagem muito grande (máx 3,5MB)." };
    const media_type = mime.startsWith("image/") ? mime : (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg");
    return { tipo: "imagem", nome, mime: media_type, base64: buffer.toString("base64") };
  }

  // ── Planilha xlsx/xls → CSV textual (SheetJS) ──
  if (/^(xlsx|xls)$/.test(ext) || mime.includes("spreadsheet") || mime.includes("ms-excel")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    let txt = "";
    for (const sheetName of wb.SheetNames.slice(0, 5)) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { blankrows: false });
      txt += `## Aba: ${sheetName}\n${csv}\n\n`;
      if (txt.length > MAX_CHARS) break;
    }
    return { tipo: "tabela", nome, conteudo: txt.slice(0, MAX_CHARS), truncado: txt.length > MAX_CHARS };
  }

  // ── CSV ──
  if (ext === "csv" || mime === "text/csv") {
    const txt = buffer.toString("utf-8");
    return { tipo: "tabela", nome, conteudo: txt.slice(0, MAX_CHARS), truncado: txt.length > MAX_CHARS };
  }

  // ── PDF → texto (unpdf, serverless) ──
  if (ext === "pdf" || mime === "application/pdf") {
    try {
      const { extractText } = await import("unpdf");
      const r = await extractText(new Uint8Array(buffer), { mergePages: true });
      const text = Array.isArray(r?.text) ? r.text.join("\n") : (r?.text || "");
      if (!text.trim()) return { erro: "Não consegui extrair texto deste PDF (pode ser escaneado/imagem)." };
      return { tipo: "texto", nome, conteudo: text.slice(0, MAX_CHARS), truncado: text.length > MAX_CHARS };
    } catch (e) {
      return { erro: `Falha ao ler o PDF: ${e.message}` };
    }
  }

  // ── Texto ──
  if (ext === "txt" || mime === "text/plain") {
    const txt = buffer.toString("utf-8");
    return { tipo: "texto", nome, conteudo: txt.slice(0, MAX_CHARS), truncado: txt.length > MAX_CHARS };
  }

  return { erro: `Tipo de arquivo não suportado: .${ext}. Aceito: xlsx, xls, csv, pdf, txt, png, jpg, gif, webp.` };
}
