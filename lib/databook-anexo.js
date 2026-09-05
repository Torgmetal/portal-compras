import { PDFDocument } from "pdf-lib";

// ─── O QUE O LIVRO CONSEGUE MESCLAR ───────────────────────────────────────────────────────────
//
// Vitor (04/09/2026), fechando o data book da OP-085: "pq está com esse problema?" — a seção
// "Pendências desta geração" acusava IPPE1088P1-LD e IPPE1088P1-LE com "Failed to parse PDF
// document (line:5338 col:...)". Os dois desenhos estavam anexados DUAS vezes: o .pdf e o .dwg
// (o fonte do CAD). O gerador tentava mesclar o .dwg como se fosse PDF, o pdf-lib estourava, e
// como o `nome` do documento é gravado sem extensão os dois pareciam o mesmo arquivo — dava a
// impressão de que o PDF do desenho tinha falhado, quando ele entrou inteiro.
//
// Duas regras nascem daí:
//   1. .dwg/.dxf/.aspx e afins NÃO são documento do livro. Não é pendência: é arquivo que nunca
//      deveria ter sido anexado. Sai da lista sem sujar o livro do cliente com furo nosso.
//   2. imagem (JPG/PNG) É documento — certificado fotografado, foto de ensaio — e o livro precisa
//      saber colocá-la numa página em vez de morrer tentando abri-la como PDF.
//
// ⚠ O TIPO VEM DO BYTE, não do nome. Nome mente (extensão trocada, arquivo sem extensão, MIME
// genérico do SharePoint); o cabeçalho do arquivo, não.

// Extensões que o data book aceita anexar. É a mesma lista usada na varredura de pastas
// (lib/databook-pastas) — uma fonte só, para a tela não oferecer o que o gerador não mescla.
// ⚠ webp fora de propósito: o pdf-lib embute PNG e JPG, e só.
export const RX_ANEXAVEL = /\.(pdf|jpe?g|png)$/i;

const A4 = [595.28, 841.89];
const MARGEM = 28;

/** Extensão (minúscula, sem ponto) do documento — pelo nome do arquivo, não pelo título. */
export function extensaoDoc(doc) {
  const fontes = [doc?.arquivoNome, doc?.arquivoUrl, doc?.sharepointUrl, doc?.nome];
  for (const f of fontes) {
    const limpo = String(f || "").split(/[?#]/)[0];
    const m = limpo.match(/\.([A-Za-z0-9]{1,5})$/);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/**
 * O documento pode entrar no livro?
 *
 * ⚠ Sem extensão conhecida = SIM. O certificado importado do CMR muitas vezes não tem nome de
 * arquivo nenhum, e barrá-lo por isso perderia anexo bom. Quem decide de verdade é o byte, na
 * hora de abrir — aqui a peneira só tira o que é claramente outra coisa (CAD, planilha, página).
 */
export function ehAnexavelNoLivro(doc) {
  const ext = extensaoDoc(doc);
  return !ext || RX_ANEXAVEL.test(`.${ext}`);
}

/** Tipo real pelo cabeçalho do arquivo: "pdf" | "png" | "jpg" | null. */
export function tipoDoBuffer(buf) {
  if (!buf || buf.length < 4) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  // %PDF pode vir depois de lixo/BOM em arquivo remendado — o pdf-lib aceita, então olhamos o começo
  if (b.slice(0, 1024).includes(Buffer.from("%PDF"))) return "pdf";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

/** Uma folha A4 retrato com a imagem centralizada e proporcional. */
async function pdfDeImagem(buf, tipo) {
  const pdf = await PDFDocument.create();
  const img = tipo === "png" ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  const page = pdf.addPage(A4);
  const esc = Math.min((A4[0] - MARGEM * 2) / img.width, (A4[1] - MARGEM * 2) / img.height, 1);
  const w = img.width * esc, h = img.height * esc;
  page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
  return pdf;
}

/**
 * Abre um anexo como PDFDocument, seja ele PDF ou imagem — para o mesclador tratar tudo igual.
 * O erro, quando o arquivo não é nem um nem outro, sai em português e diz o que é: "Failed to
 * parse PDF document (line:5338 col:12 offset:...)" não ajuda ninguém a resolver.
 */
export async function abrirAnexoComoPdf(buf, doc) {
  const tipo = tipoDoBuffer(buf);
  if (tipo === "png" || tipo === "jpg") return await pdfDeImagem(buf, tipo);
  if (tipo === "pdf") return await PDFDocument.load(buf, { ignoreEncryption: true });
  const ext = extensaoDoc(doc);
  throw new Error(ext ? `arquivo .${ext} não é PDF nem imagem` : "arquivo não é PDF nem imagem");
}
