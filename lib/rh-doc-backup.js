import "server-only";
import { prisma } from "./prisma";
import { backupDocumentoRh } from "./sharepoint-rh";

/**
 * Backup ISO de um documento de RH no SharePoint + grava sharepointUrl.
 * Best-effort COM auditoria: não derruba o fluxo se o SharePoint falhar, mas
 * registra OK/ERRO no AuditLog (backup ISO não pode falhar em silêncio) e
 * retorna o resultado pra UI avisar.
 * @returns {Promise<{ok:boolean, sharepointUrl?:string, erro?:string}>}
 */
export async function backupISODocumento(doc, userId) {
  if (!doc.arquivoUrl) return { ok: false, erro: "sem arquivo" };

  let funcionarioNome = null;
  if (doc.funcionarioId) {
    const f = await prisma.funcionario.findUnique({
      where: { id: doc.funcionarioId },
      select: { nome: true },
    });
    funcionarioNome = f?.nome || null;
  }

  try {
    const webUrl = await backupDocumentoRh({
      arquivoUrl: doc.arquivoUrl,
      arquivoNome: doc.arquivoNome,
      arquivoTipo: doc.arquivoTipo,
      funcionarioNome,
      tipo: doc.tipo,
    });
    await prisma.documento.update({ where: { id: doc.id }, data: { sharepointUrl: webUrl } });
    await prisma.auditLog.create({
      data: { userId, action: "BACKUP_DOC_SHAREPOINT_OK", entity: "Documento", entityId: doc.id, diff: { sharepointUrl: webUrl } },
    }).catch(() => {});
    return { ok: true, sharepointUrl: webUrl };
  } catch (e) {
    console.error("[rh-doc-backup] falha SharePoint:", e?.message);
    await prisma.auditLog.create({
      data: { userId, action: "BACKUP_DOC_SHAREPOINT_ERRO", entity: "Documento", entityId: doc.id, diff: { erro: e?.message || "erro" } },
    }).catch(() => {});
    return { ok: false, erro: e?.message || "Falha no backup SharePoint" };
  }
}
