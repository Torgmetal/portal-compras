// Criacao de notificacoes in-app (independente de email).
// Cada chamada registra um evento no banco que aparece no feed
// de /compras/notificacoes.
//
// Best-effort: erros sao logados mas nao propagam — uma notificacao
// que falha nao pode quebrar o fluxo principal (criar RM, submeter cotacao).
import { prisma } from "@/lib/prisma";

export async function criarNotificacao({
  tipo,
  titulo,
  mensagem,
  link,
  dados,
  origemUserId,
}) {
  try {
    return await prisma.notificacao.create({
      data: {
        tipo,
        titulo,
        mensagem,
        link: link || null,
        dados: dados || null,
        origemUserId: origemUserId || null,
      },
    });
  } catch (e) {
    console.error("[notificacao] falha ao criar:", e?.message);
    return null;
  }
}
