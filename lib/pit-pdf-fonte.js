export const ORIGEM_PIT = "pit_portal";

const CAMINHO = /^\/api\/qualidade\/planos\/(\d+)\/pdf\/?$/;

export function fonteDePit(doc) {
  if (!doc || doc.origem !== ORIGEM_PIT || !doc.opNumero) return null;
  let url;
  try { url = new URL(String(doc.arquivoUrl || ""), "http://portal.invalido"); } catch { return null; }
  const match = url.pathname.match(CAMINHO);
  if (!match || url.searchParams.get("doc") !== "PIT") return null;
  const opNumero = match[1].padStart(3, "0");
  return opNumero === String(doc.opNumero).replace(/\D/g, "").padStart(3, "0") ? { opNumero } : null;
}

export async function pdfDoPit(prisma, fonte) {
  const { pdfDoPlano } = await import("./planos-aceite");
  const pdf = await pdfDoPlano(prisma, "PIT", fonte.opNumero, { minuta: true });
  if (!pdf) throw Object.assign(new Error("O PIT desta OP não está configurado."), { status: 404 });
  return pdf;
}
