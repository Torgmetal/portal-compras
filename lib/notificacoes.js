import "server-only";
import { prisma } from "@/lib/prisma";
import { MODULOS_VALIDOS } from "@/lib/modulos";
import { log } from "@/lib/log";

const registro = log("notificacoes");

// ─── O SINO ────────────────────────────────────────────────────────────────
//
// Matheus (09/09/2026): "vai receber as notificações de informações que forem
// importantes para ele do módulo dele ou forem destinadas a ele".
//
// ⚠⚠ ESTE MODEL JÁ EXISTIU, MORREU E VOLTOU — ver a nota em `prisma/schema.prisma` no model
// `Notificacao`. A causa da morte não foi o dado, foi não ter onde ler: a tela ficava em
// `/compras/notificacoes`, um link que ninguém clicava. Desta vez o sino mora em toda sidebar.
//
// ⚠ POR MÓDULO OU POR PESSOA, NUNCA GLOBAL. A versão antiga gravava uma linha só; se o sino
// tivesse existido, TODO MUNDO veria "Nova RM T118" — inclusive RH e Financeiro. Aqui o
// destinatário é resolvido NA CRIAÇÃO, em `NotificacaoDestinatario`: uma linha por pessoa que
// deveria ver aquilo, com leitura própria. ADMIN sempre entra também (mesma regra de
// `requireRole`: acesso a tudo) — é quem mais precisa enxergar o portal inteiro de um lugar só.
//
// ⚠ Best-effort, como todo o resto da casa (AuditLog, email): notificação que falha não pode
// derrubar o fluxo que a originou. Nunca dar `throw`.

/**
 * Os usuários que devem ver uma notificação de determinado(s) módulo(s).
 * ADMIN entra sempre — é a mesma regra de `requireRole`.
 */
async function usuariosDosModulos(modulos) {
  if (!modulos?.length) return [];
  const usuarios = await prisma.user.findMany({
    where: {
      ativo: true,
      OR: [
        { tipo: "ADMIN" },
        { modulos: { some: { modulo: { in: modulos } } } },
      ],
    },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/**
 * Cria uma notificação e resolve os destinatários dela.
 *
 * @param {Object} opts
 * @param {string} opts.tipo         um valor do enum NotificacaoTipo
 * @param {string} opts.titulo
 * @param {string} opts.mensagem
 * @param {string} [opts.link]       para onde o clique leva
 * @param {Object} [opts.dados]
 * @param {string} [opts.origemUserId]  quem causou o evento (pode não ser destinatário)
 * @param {string[]} [opts.destinatarios]  ids de usuário — "destinada a ele"
 * @param {string[]} [opts.modulos]        módulos do MODULOS_VALIDOS — "do módulo dele"
 *
 * Pelo menos um de `destinatarios`/`modulos` precisa render gente — sem destinatário a
 * notificação nasceria e nunca apareceria pra ninguém, um jeito silencioso de perder o evento.
 */
export async function criarNotificacao({
  tipo, titulo, mensagem, link, dados, origemUserId, destinatarios, modulos,
}) {
  try {
    if (modulos?.some((m) => !MODULOS_VALIDOS.includes(m))) {
      throw new Error(`módulo inválido em criarNotificacao: ${modulos.filter((m) => !MODULOS_VALIDOS.includes(m))}`);
    }

    const doModulo = await usuariosDosModulos(modulos);
    const ids = new Set([...(destinatarios || []), ...doModulo]);
    if (!ids.size) {
      registro.erro(`${tipo}: nenhum destinatário resolvido (nada a notificar)`);
      return null;
    }

    const notificacao = await prisma.notificacao.create({
      data: { tipo, titulo, mensagem, link: link || null, dados: dados || null, origemUserId: origemUserId || null },
    });

    await prisma.notificacaoDestinatario.createMany({
      data: [...ids].map((userId) => ({ notificacaoId: notificacao.id, userId })),
      skipDuplicates: true,
    });

    return notificacao;
  } catch (e) {
    registro.erro("falha ao criar:", e?.message);
    return null;
  }
}
