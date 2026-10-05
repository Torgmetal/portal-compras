import "server-only";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";

// Notifica somente entradas persistidas. R reservado ainda não é material recebido.
//
// ⚠⚠ EM LOTE, NÃO UM POR UM (pedido 2054, 05/10/2026). Era `criarNotificacao` por R — upsert mais
// destinatários, ~1 s cada no ar —, e 43 R seguraram a resposta do lançamento até a Vercel derrubar a
// função nos 60 s. Agora são três consultas para qualquer tamanho de lote.
//
// ⚠ Continua idempotente pela `chaveEvento` (um aviso por R): o reenvio de um lote não duplica
// aviso, e a busca pelas chaves ACHA o aviso que tenha nascido sem destinatário numa tentativa
// interrompida — o destinatário entra agora (`skipDuplicates` nos dois lados).
export async function notificarMateriaisRecebidos(entradas, origemUserId) {
  try {
    const validas = entradas.filter((e) => e.importRef && e.nome?.trim() && e.nome.trim() !== "(sem descrição)");
    if (!validas.length) return;
    const usuarios = await prisma.user.findMany({
      where: { ativo: true, email: { equals: "engenharia3@torg.com.br", mode: "insensitive" } },
      select: { id: true },
    });
    if (!usuarios.length) return;
    const avisos = validas.map((e) => ({
      tipo: "MATERIAL_RECEBIDO", chaveEvento: `CMR_RECEBIDO:${e.importRef}`,
      titulo: `Material recebido · ${e.opNumero ? `OP-${e.opNumero}` : "sem OP"} · R ${e.importRef}`,
      mensagem: `${e.nome} · quantidade recebida: ${e.quantidade ?? "não informada"} · corrida: ${e.numeroCorrida || "não informada"} · NF: ${e.nfNumero || "não informada"}. Confira o R antes de encaminhar ao PCP.`,
      link: `/planejamento/recebimento?r=${encodeURIComponent(e.importRef)}`,
      dados: { r: e.importRef, opNumero: e.opNumero || null }, origemUserId: origemUserId || null,
    }));
    await prisma.notificacao.createMany({ data: avisos, skipDuplicates: true });
    const criadas = await prisma.notificacao.findMany({
      where: { chaveEvento: { in: avisos.map((a) => a.chaveEvento) } }, select: { id: true },
    });
    await prisma.notificacaoDestinatario.createMany({
      data: criadas.flatMap((n) => usuarios.map((u) => ({ notificacaoId: n.id, userId: u.id }))),
      skipDuplicates: true,
    });
  } catch (e) { log("recebimento-notificacoes").erro("Falha ao avisar recebimento:", e.message); }
}
