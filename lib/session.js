// Helpers de sessão pra Server Components, Route Handlers e Server Actions.
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

/**
 * Nova função de controle de acesso — use em código novo.
 * @param {{ tipos?: string[], modulos?: string[] }} opts
 *   - tipos: lista de TipoUsuario permitidos (ex: ["ADMIN"])
 *   - modulos: lista de módulos; ADMIN sempre passa, USUARIO precisa ter ao menos 1
 */
export async function requireAcesso({ tipos, modulos } = {}) {
  const user = await requireUser();

  if (tipos?.length && !tipos.includes(user.tipo)) {
    throw new Error("Forbidden");
  }

  if (modulos?.length) {
    if (user.tipo === "ADMIN") return user; // ADMIN tem acesso total
    const userModulos = user.modulos ?? [];
    if (!modulos.some((m) => userModulos.includes(m))) {
      throw new Error("Forbidden");
    }
  }

  return user;
}

/**
 * Wrapper retrocompat — mantém assinatura antiga mas avalia por tipo+modulos.
 * ADMIN (tipo) sempre passa. USUARIO passa se tiver algum dos módulos da lista.
 * @param {string|string[]} roles — lista legada ex: ["ADMIN", "COMPRAS"]
 */
export async function requireRole(roles) {
  const user = await requireUser();
  const allowed = Array.isArray(roles) ? roles : [roles];

  // ADMIN tem acesso a tudo
  if (user.tipo === "ADMIN") return user;

  // USUARIO precisa ter ao menos um dos módulos listados
  // ("ADMIN" na lista é ignorado — é um tipo, não módulo)
  const allowedModulos = allowed.filter((r) => r !== "ADMIN");
  const userModulos = user.modulos ?? [];
  if (allowedModulos.some((m) => userModulos.includes(m))) return user;

  throw new Error("Forbidden");
}
