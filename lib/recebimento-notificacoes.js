import "server-only";
import { prisma } from "@/lib/prisma";
import { criarNotificacao } from "@/lib/notificacoes";
import { log } from "@/lib/log";

// Notifica somente entradas persistidas. R reservado ainda não é material recebido.
export async function notificarMateriaisRecebidos(entradas, origemUserId) {
  try {
    const validas = entradas.filter((e) => e.importRef && e.nome?.trim() && e.nome.trim() !== "(sem descrição)");
    if (!validas.length) return;
    const usuarios = await prisma.user.findMany({
      where: { ativo: true, email: { equals: "engenharia3@torg.com.br", mode: "insensitive" } },
      select: { id: true },
    });
    if (!usuarios.length) return;
    for (const e of validas) {
      await criarNotificacao({
        tipo: "MATERIAL_RECEBIDO", chaveEvento: `CMR_RECEBIDO:${e.importRef}`,
        titulo: `Material recebido · ${e.opNumero ? `OP-${e.opNumero}` : "sem OP"} · R ${e.importRef}`,
        mensagem: `${e.nome} · quantidade recebida: ${e.quantidade ?? "não informada"} · corrida: ${e.numeroCorrida || "não informada"} · NF: ${e.nfNumero || "não informada"}. Confira o R antes de encaminhar ao PCP.`,
        link: `/planejamento/recebimento?r=${encodeURIComponent(e.importRef)}`,
        dados: { r: e.importRef, opNumero: e.opNumero || null }, origemUserId,
        destinatarios: usuarios.map((u) => u.id),
      });
    }
  } catch (e) { log("recebimento-notificacoes").erro("Falha ao avisar recebimento:", e.message); }
}
