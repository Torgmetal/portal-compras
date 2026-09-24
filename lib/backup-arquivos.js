import "server-only";
import { prisma } from "./prisma";
import { ensureFolder, uploadFileToFolder } from "./sharepoint";
import { isBlobUrlSegura } from "./blob-url";
import { PASTA_BACKUP } from "./backup-banco";

// ─── SEGUNDA CÓPIA DOS ARQUIVOS QUE SÓ EXISTIAM NO VERCEL BLOB ────────────────
// Vitor (24/09/2026): "como está nossos backups?" — e depois, "pode atacar". Medido: 323 anexos de
// Data Book e 293 fotos de inspeção existiam SÓ no Vercel Blob, que não tem lixeira nem versão:
// apagou (por engano, por script, por bug), sumiu. O dump semanal do banco guarda o ENDEREÇO do
// arquivo, não o arquivo. RH e os documentos da Qualidade cadastrados pela tela já tinham cópia no
// SharePoint; o anexo do Data Book e a foto do celular entram por outros caminhos, que não copiavam.
//
// ⚠ A CÓPIA VAI PARA A ÁREA DE BACKUP, ao lado do dump do banco, uma pasta por OP — não para a pasta
// da obra nem para a de documentos do SGQ. Lá ela viraria material de trabalho: alguém renomeia,
// move, apaga, e a cópia deixa de ser cópia.
// ⚠ Roda de madrugada e é IDEMPOTENTE: copia só o que ainda não tem cópia, com nome fixo por id
// (substitui, nunca duplica). O que não couber no tempo fica para a noite seguinte.

export const PASTA_ARQUIVOS = `${PASTA_BACKUP}/Arquivos`;
export const PASTA_DATABOOK = `${PASTA_ARQUIVOS}/Data Book`;
export const PASTA_FOTOS = `${PASTA_ARQUIVOS}/Fotos de inspeção`;
// ⚠ a foto não tem coluna para a cópia (seria DDL em produção): o registro é o AuditLog, como já é
// para a impressão de etiqueta e a cobrança de fornecedor.
export const ACAO_FOTO_COPIADA = "BACKUP_FOTO_INSPECAO_OK";

const SIMULTANEOS = 4;
// a função vive 300 s; para aos 240 e deixa o resto para a noite seguinte
const TETO_MS = 240_000;
const LOTE = 800;

const pastaDaOp = (numero) => `OP-${String(numero || "").trim() || "sem OP"}`;
const nomeSeguro = (s) => String(s || "").replace(/[\\/:*?"<>|#%]/g, "_").replace(/\s+/g, " ").trim();

function extensaoDa(url) {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|heic)$/i);
    return m ? `.${m[1].toLowerCase()}` : ".jpg";
  } catch { return ".jpg"; }
}
const TIPO_IMAGEM = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

/**
 * Cria as pastas ABAIXO da área de backup, nível a nível.
 *
 * ⚠ Em produção o `ensureFolder` só cria a última pasta e exige que a de cima exista — de propósito,
 * para um caminho digitado errado não virar pasta nova no servidor. Aqui a cadeia inteira é nossa.
 * ⚠ Guarda a PROMESSA, não o resultado: quatro cópias em paralelo na mesma OP pediriam a mesma
 * pasta ao mesmo tempo, e duas criações simultâneas colidem.
 */
function criadorDePastas(ensure) {
  const pedidas = new Map();
  const criar = (caminho) => {
    if (!pedidas.has(caminho)) pedidas.set(caminho, ensure(caminho));
    return pedidas.get(caminho);
  };
  return async (pasta) => {
    let atual = PASTA_BACKUP;
    for (const parte of pasta.slice(PASTA_BACKUP.length).split("/").filter(Boolean)) {
      atual += `/${parte}`;
      await criar(atual);
    }
  };
}

async function baixarDoBlob(url, buscar) {
  // ⚠ só o Blob — este job busca por URL guardada no banco, e buscar qualquer endereço é SSRF
  if (!isBlobUrlSegura(url)) throw new Error("endereço fora do Vercel Blob");
  const r = await buscar(url);
  if (!r.ok) throw new Error(`Blob HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** O que ainda não tem cópia — anexos do Data Book e fotos de inspeção. */
export async function arquivosSemCopia({ limite = LOTE } = {}) {
  const [anexos, fotos] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { origem: "anexo_databook", ativo: true, sharepointUrl: null, arquivoUrl: { contains: "blob.vercel-storage.com" } },
      select: { id: true, opNumero: true, arquivoUrl: true, arquivoNome: true, arquivoTipo: true },
      orderBy: { createdAt: "asc" },
      take: limite,
    }),
    prisma.$queryRaw`
      SELECT f.id, f."opNumero", f.url, f."relatorioId" FROM "FotoInspecao" f
      WHERE NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a.action = ${ACAO_FOTO_COPIADA} AND a."entityId" = f.id)
      ORDER BY f."createdAt" ASC LIMIT ${limite}`,
  ]);
  return { anexos, fotos };
}

/**
 * Copia para o SharePoint o que ainda só existe no Blob. Devolve o placar da noite.
 *
 * `enviar`, `criarPasta`, `buscar`, `agora`, `tetoMs` e `simultaneos` existem para o teste.
 */
export async function copiarArquivosSemBackup({
  enviar = uploadFileToFolder, criarPasta = ensureFolder, buscar = fetch,
  agora = Date.now, tetoMs = TETO_MS, simultaneos = SIMULTANEOS,
} = {}) {
  const inicio = agora();
  const pasta = criadorDePastas(criarPasta);
  const { anexos, fotos } = await arquivosSemCopia();

  const relIds = [...new Set(fotos.map((f) => f.relatorioId).filter(Boolean))];
  const codigos = new Map(relIds.length
    ? (await prisma.relatorioInspecao.findMany({ where: { id: { in: relIds } }, select: { id: true, codigo: true } }))
      .map((r) => [r.id, r.codigo])
    : []);

  const placar = { anexos: 0, fotos: 0, adiados: 0, falhas: [] };

  const copiarAnexo = async (d) => {
    const destino = `${PASTA_DATABOOK}/${pastaDaOp(d.opNumero)}`;
    const buffer = await baixarDoBlob(d.arquivoUrl, buscar);
    await pasta(destino);
    const { webUrl, id } = await enviar({
      folderPath: destino, fileName: `${d.id} - ${nomeSeguro(d.arquivoNome) || "anexo"}`.slice(0, 180),
      buffer, contentType: d.arquivoTipo || "application/octet-stream", conflict: "replace",
    });
    // ⚠ os MESMOS campos da cópia ISO: é por eles que se mede a cobertura, e o gerador do Data Book
    // cai nesta cópia se o arquivo sumir do Blob (lib/databook-arquivo.js)
    await prisma.documentoQualidade.update({ where: { id: d.id }, data: { sharepointUrl: webUrl, sharepointItemId: id || null } });
    await prisma.auditLog.create({
      data: { userId: null, action: "BACKUP_DOC_QUALIDADE_OK", entity: "DocumentoQualidade", entityId: d.id, diff: { sharepointUrl: webUrl, via: "backup-arquivos" } },
    }).catch(() => {});
    placar.anexos++;
  };

  const copiarFoto = async (f) => {
    const destino = `${PASTA_FOTOS}/${pastaDaOp(f.opNumero)}`;
    const buffer = await baixarDoBlob(f.url, buscar);
    const ext = extensaoDa(f.url);
    await pasta(destino);
    const { webUrl } = await enviar({
      folderPath: destino, fileName: `${nomeSeguro(codigos.get(f.relatorioId) || "sem relatório")} - ${f.id}${ext}`,
      buffer, contentType: TIPO_IMAGEM[ext] || "image/jpeg", conflict: "replace",
    });
    // ⚠ o registro É o controle do que já foi copiado. Falhar aqui só faz a foto ser copiada de
    // novo na noite seguinte — mesmo nome, `replace`, sem duplicar.
    await prisma.auditLog.create({
      data: { userId: null, action: ACAO_FOTO_COPIADA, entity: "FotoInspecao", entityId: f.id, diff: { sharepointUrl: webUrl, pasta: destino } },
    }).catch(() => {});
    placar.fotos++;
  };

  const fila = [...anexos.map((d) => ["anexo", d]), ...fotos.map((f) => ["foto", f])];
  let proxima = 0;
  const trabalhador = async () => {
    for (let i = proxima++; i < fila.length; i = proxima++) {
      if (agora() - inicio > tetoMs) { placar.adiados++; continue; }
      const [tipo, item] = fila[i];
      try {
        await (tipo === "anexo" ? copiarAnexo(item) : copiarFoto(item));
      } catch (e) {
        placar.falhas.push({ tipo, id: item.id, erro: String(e?.message || e).slice(0, 160) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, simultaneos) }, trabalhador));
  placar.segundos = Math.round((agora() - inicio) / 1000);
  return placar;
}
