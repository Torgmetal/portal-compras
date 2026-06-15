import "server-only";
import { prisma } from "./prisma";
import { backupDocumentoQualidade, moverParaObsoleto } from "./sharepoint-qualidade";

/**
 * Backup ISO de um documento da Qualidade no SharePoint + grava sharepointUrl.
 * Best-effort COM auditoria: não derruba o fluxo se o SharePoint falhar, mas
 * registra OK/ERRO no AuditLog e devolve o resultado pra UI avisar.
 * @returns {Promise<{ok:boolean, sharepointUrl?:string, erro?:string}>}
 */
export async function backupISODocumentoQualidade(doc, userId) {
  if (!doc.arquivoUrl) return { ok: false, erro: "sem arquivo" };
  try {
    const { webUrl, id } = await backupDocumentoQualidade({
      arquivoUrl: doc.arquivoUrl,
      arquivoNome: doc.arquivoNome,
      arquivoTipo: doc.arquivoTipo,
      vinculo: doc.vinculo,
      categoria: doc.categoria,
      tipo: doc.tipo,
    });
    await prisma.documentoQualidade.update({ where: { id: doc.id }, data: { sharepointUrl: webUrl, sharepointItemId: id || null } });
    await prisma.auditLog
      .create({ data: { userId, action: "BACKUP_DOC_QUALIDADE_OK", entity: "DocumentoQualidade", entityId: doc.id, diff: { sharepointUrl: webUrl } } })
      .catch(() => {});
    return { ok: true, sharepointUrl: webUrl };
  } catch (e) {
    console.error("[qualidade-doc-backup] falha SharePoint:", e?.message);
    await prisma.auditLog
      .create({ data: { userId, action: "BACKUP_DOC_QUALIDADE_ERRO", entity: "DocumentoQualidade", entityId: doc.id, diff: { erro: e?.message || "erro" } } })
      .catch(() => {});
    return { ok: false, erro: e?.message || "Falha no backup SharePoint" };
  }
}

/**
 * Move o arquivo de um documento (vencido) para a pasta de Obsoletos no
 * SharePoint + atualiza o sharepointUrl. Best-effort com auditoria.
 * @returns {Promise<{ok:boolean, sharepointUrl?:string, erro?:string}>}
 */
export async function moverDocumentoParaObsoleto(doc, userId) {
  if (!doc.sharepointItemId) return { ok: false, erro: "sem arquivo no SharePoint para mover" };
  try {
    const webUrl = await moverParaObsoleto(doc.sharepointItemId);
    await prisma.documentoQualidade.update({ where: { id: doc.id }, data: { sharepointUrl: webUrl } });
    await prisma.auditLog
      .create({ data: { userId, action: "DOC_QUALIDADE_OBSOLETO", entity: "DocumentoQualidade", entityId: doc.id, diff: { sharepointUrl: webUrl } } })
      .catch(() => {});
    return { ok: true, sharepointUrl: webUrl };
  } catch (e) {
    console.error("[qualidade-doc-backup] falha mover Obsoleto:", e?.message);
    await prisma.auditLog
      .create({ data: { userId, action: "DOC_QUALIDADE_OBSOLETO_ERRO", entity: "DocumentoQualidade", entityId: doc.id, diff: { erro: e?.message || "erro" } } })
      .catch(() => {});
    return { ok: false, erro: e?.message || "Falha ao mover para Obsoleto" };
  }
}
