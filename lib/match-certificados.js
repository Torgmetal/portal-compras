import "server-only";
import { resolveSharedFolder, listChildrenByPath } from "./sharepoint";
import { prismaDirect } from "./prisma";
import { ORIGENS_CMR } from "./cmr-origens";

// Casa os PDFs escaneados (pasta "Certificados Digitalizados") com os documentos
// importados do CMR pelo ÍNDICE R (= importRef). Nomes:
//   "R 260001.pdf"        → índice 260001
//   "R 260007 á 008.pdf"  → faixa 260007..260008 (um PDF p/ vários índices)

const SUBPASTA = "Certificados Digitalizados";

// Pasta dos certificados fica sempre no mesmo lugar (por ano, override por env).
const ANO = new Date().getFullYear();
const CERTS_FOLDER_PATH = process.env.SHAREPOINT_CERTS_FOLDER_PATH || `/Almoxarifado/01. Rastreabilidade/Certificados ${ANO}`;
const RAIZ_RASTREABILIDADE = "/Almoxarifado/01. Rastreabilidade";

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
  // ⚠⚠ SEM LINK = A ÁRVORE INTEIRA, não uma pasta do ano. Achado em 04/09/2026: o casamento
  // automático (botão "Casar PDFs", tarefa da Manutenção e o cron) olhava só
  // `Certificados {ano corrente}/Certificados Digitalizados` — 944 dos 1.767 arquivos. A tela de
  // Conferência de Rastreabilidade, que varre `01. Rastreabilidade` inteira, achava certificado que
  // o casamento não conseguia vincular (os R 251152 e 251158 da OP-057, em "Certificados 2025").
  // Pior: em 1º de janeiro o `new Date().getFullYear()` viraria para uma pasta que nem existe e o
  // cron passaria a casar zero, sem erro nenhum. Agora as duas pontas leem o MESMO índice.
  if (!shareUrl) {
    // import tardio de propósito: rastreabilidade-certificados importa `parseIndicesDoNome` daqui,
    // e um import estático fecharia o ciclo na carga do módulo.
    const { indiceCertificados } = await import("./rastreabilidade-certificados");
    const { indice, arquivos, pastas } = await indiceCertificados(false);
    const porIndice = new Map();
    for (const [r, lista] of indice) {
      // com duplicata fica o MAIS RECENTE — redigitalizar costuma ser correção do anterior.
      // (mesma regra da tela de conferência, para as duas nunca escolherem arquivos diferentes)
      const a = lista
        .filter((x) => /\.pdf$/i.test(x.nome || ""))
        .sort((x, y) => new Date(y.modificadoEm || 0) - new Date(x.modificadoEm || 0))[0];
      if (a) porIndice.set(r, { id: a.id, name: a.nome, webUrl: a.url, indices: [r] });
    }
    const pdfs = arquivos.filter((a) => /\.pdf$/i.test(a.nome || ""));
    return { driveId: null, pasta: `${RAIZ_RASTREABILIDADE} (${pastas.length} pastas)`, arquivos: pdfs, porIndice, totalPdfs: pdfs.length };
  }

  let driveId, absPath;
  if (shareUrl) {
    ({ driveId, absPath } = await resolveSharedFolder(shareUrl));
  } else {
    // sem link → usa a pasta fixa de certificados
    driveId = process.env.SHAREPOINT_DRIVE_ID;
    if (!driveId) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
    absPath = CERTS_FOLDER_PATH;
  }
  const pasta = `${absPath}/${SUBPASTA}`;
  const filhos = await listChildrenByPath(driveId, pasta);
  const arquivos = filhos
    .filter((it) => it.file && /\.pdf$/i.test(it.name))
    .map((it) => ({ id: it.id, name: it.name, webUrl: it.webUrl, indices: parseIndicesDoNome(it.name) }));

  const porIndice = new Map();
  for (const a of arquivos) for (const idx of a.indices) if (!porIndice.has(idx)) porIndice.set(idx, a);

  return { driveId, pasta, arquivos, porIndice, totalPdfs: arquivos.length };
}

const pgArr = (arr) =>
  "{" + arr.map((v) => (v == null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",") + "}";

/**
 * Lê a pasta de certificados e vincula os PDFs aos documentos do CMR pelo Índice R
 * (importRef) num único UPDATE (UNNEST). Só preenche docs ainda sem arquivo.
 * Usado pelo endpoint casar-pdfs e automaticamente pelo import do CMR.
 * @returns {Promise<{ casados:number, totalPdfs:number, pasta:string }>}
 */
export async function casarCertificados(shareUrl = null) {
  const url = shareUrl || process.env.SHAREPOINT_CERTS_URL || null;
  const mapa = await mapearCertificados(url);
  const refs = [], itemIds = [], urls = [], nomes = [];
  for (const [indice, a] of mapa.porIndice) {
    if (!a) continue;
    refs.push(indice); itemIds.push(a.id); urls.push(a.webUrl || null); nomes.push(a.name || null);
  }
  let casados = 0;
  if (refs.length) {
    casados = await prismaDirect.$executeRawUnsafe(
      `UPDATE "DocumentoQualidade" AS d
          SET "sharepointItemId" = v.item_id,
              "sharepointUrl"    = v.url,
              "arquivoNome"      = v.nome,
              "arquivoTipo"      = 'application/pdf'
        FROM (SELECT unnest($1::text[]) AS ref,
                     unnest($2::text[]) AS item_id,
                     unnest($3::text[]) AS url,
                     unnest($4::text[]) AS nome) AS v
       WHERE d."importRef" = v.ref
         -- ⚠ as DUAS origens do CMR: o cron cmr-reconciliar grava 'planilha_sharepoint', e filtrar
         -- só a primeira fazia o certificado escaneado nunca colar nessas 130 entradas — a leitura
         -- virava "o Almoxarifado não digitalizou". Ver lib/cmr-origens.js.
         AND d."origem" = ANY($5::text[])
         AND d."sharepointItemId" IS NULL
         AND d."ativo" = true`,
      pgArr(refs), pgArr(itemIds), pgArr(urls), pgArr(nomes), pgArr(ORIGENS_CMR)
    );
  }
  return { casados, totalPdfs: mapa.totalPdfs, pasta: mapa.pasta };
}
