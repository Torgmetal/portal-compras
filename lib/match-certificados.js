import "server-only";
import { resolveSharedFolder, listChildrenByPath } from "./sharepoint";

// Casa os PDFs escaneados (pasta "Certificados Digitalizados") com os documentos
// importados do CMR pelo ÍNDICE R (= importRef). Nomes:
//   "R 260001.pdf"        → índice 260001
//   "R 260007 á 008.pdf"  → faixa 260007..260008 (um PDF p/ vários índices)

const SUBPASTA = "Certificados Digitalizados";

// "260007" + "008" → 260007..260008 (o 2º número herda o prefixo do 1º)
function expandirFaixa(base, segundo) {
  if (segundo.length >= base.length) return [base];
  const ini = parseInt(base, 10);
  const fimStr = base.slice(0, base.length - segundo.length) + segundo;
  const fim = parseInt(fimStr, 10);
  if (!(fim > ini) || fim - ini > 200) return [base]; // sanidade
  const out = [];
  for (let n = ini; n <= fim; n++) out.push(String(n));
  return out;
}

export function parseIndicesDoNome(nome) {
  const semExt = String(nome).replace(/\.[a-z0-9]+$/i, "");
  const nums = semExt.match(/\d+/g);
  if (!nums || !nums.length) return [];
  if (nums.length === 1) return [nums[0]];
  return expandirFaixa(nums[0], nums[1]);
}

/**
 * Lê a pasta de certificados e mapeia índice → PDF.
 * @returns {{ driveId, pasta, arquivos: Array, porIndice: Map<string,object>, totalPdfs:number }}
 */
export async function mapearCertificados(shareUrl) {
  const { driveId, absPath } = await resolveSharedFolder(shareUrl);
  const pasta = `${absPath}/${SUBPASTA}`;
  const filhos = await listChildrenByPath(driveId, pasta);
  const arquivos = filhos
    .filter((it) => it.file && /\.pdf$/i.test(it.name))
    .map((it) => ({ id: it.id, name: it.name, webUrl: it.webUrl, indices: parseIndicesDoNome(it.name) }));

  const porIndice = new Map();
  for (const a of arquivos) for (const idx of a.indices) if (!porIndice.has(idx)) porIndice.set(idx, a);

  return { driveId, pasta, arquivos, porIndice, totalPdfs: arquivos.length };
}
