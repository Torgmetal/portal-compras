import "server-only";
import { prisma } from "./prisma";
import { backupDocumentoQualidade } from "./sharepoint-qualidade";

/**
 * Backup ISO de um documento da Qualidade no SharePoint + grava sharepointUrl.
 * Best-effort COM auditoria: não derruba o fluxo se o SharePoint falhar, mas
 * registra OK/ERRO no AuditLog e devolve o resultado pra UI avisar.
 * @returns {Promise<{ok:boolean, sharepointUrl?:string, erro?:string}>}
 */
export async function backupISODocumentoQualidade(doc, userId) {
  if (!doc.arquivoUrl) return { ok: false, erro: "sem arquivo" };
  try {
    const webUrl = await backupDocumentoQualidade({
      arquivoUrl: doc.arquivoUrl,
      arquivoNome: doc.arquivoNome,
      arquivoTipo: doc.arquivoTipo,
      vinculo: doc.vinculo,
      categoria: doc.categoria,
      tipo: doc.tipo,
    });
    await prisma.documentoQualidade.update({ where: { id: doc.id }, data: { sharepointUrl: webUrl } });
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
