// O middleware e os gates das páginas continuam verificando a permissão do destino.
export function callbackInterno(callback, origin) {
  if (!callback) return null;
  try {
    const base = new URL(origin);
    const url = new URL(callback, base);
    if (url.origin !== base.origin || url.username || url.password) return null;
    if (["/", "/entrar"].includes(url.pathname) || url.pathname.startsWith("/api/")) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function destinoLogin(user, callback, origin) {
  const destino = callbackInterno(callback, origin);
  if (user?.tipo === "FUNCIONARIO") return "/colaborador";
  if (user?.tipo === "CLIENTE") return destino || "/cliente";
  const modulos = (user?.modulos ?? []).map(m => typeof m === "string" ? m : m.modulo);
  if (user?.tipo !== "ADMIN" && modulos.length === 1 && modulos[0] === "QUALIDADE_CAMPO") {
    const path = destino?.split(/[?#]/)[0];
    return path && ["/qualidade/inspecoes", "/campo"].some(p => path === p || path.startsWith(p + "/")) ? destino : "/campo";
  }
  return destino || "/modulos";
}
