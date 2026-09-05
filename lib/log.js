// Adaptador de log do portal.
//
// ⚠ POR QUE ISTO EXISTE, se na Vercel o `console` já vai pro painel.
// Vai — e continua indo: este módulo escreve no console, não substitui o
// transporte. O que ele resolve são três coisas que `console.error` solto não
// resolve:
//
//   1. QUEM FALOU. Todo log sai com o prefixo do módulo (`[omie-pedido]`),
//      então dá pra achar a origem no painel da Vercel sem adivinhar.
//   2. NÍVEL. `LOG_NIVEL` (silent|error|warn|info|debug) corta o ruído sem
//      precisar apagar linha de log. Padrão: "info" em produção, "debug" fora.
//      ⚠ O padrão é "info" DE PROPÓSITO: tudo que imprimia com console.error /
//      warn / log antes da migração continua imprimindo igual. Abaixar o nível
//      é uma decisão explícita via env, nunca um efeito colateral da troca.
//   3. UM LUGAR SÓ. Quando alguém quiser mandar erro pra telemetria (Sentry,
//      Axiom, o que for), muda aqui, não em 200 arquivos.
//
// ⚠ NÃO é trilha de auditoria. Mutação crítica vai pro AuditLog no banco —
// log some do painel da Vercel, AuditLog não. Ver CLAUDE.md.
//
// Uso:
//   import { log } from "@/lib/log";
//   const registro = log("omie-pedido");
//   registro.erro("Falha ao incluir pedido", e.message);

const NIVEIS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function nivelAtual() {
  const bruto = String(process.env.LOG_NIVEL || "").toLowerCase();
  if (bruto in NIVEIS) return NIVEIS[bruto];
  return process.env.NODE_ENV === "production" ? NIVEIS.info : NIVEIS.debug;
}

function escrever(metodo, minimo, prefixo, args) {
  if (nivelAtual() < minimo) return;
  // ⚠ o único console.* legítimo do projeto: a regra quality/no-direct-console
  // desliga para este arquivo no eslint.config.mjs, porque ele É o adaptador.
  console[metodo](prefixo, ...args);
}

/**
 * @param {string} modulo  nome curto do módulo, vira o prefixo `[modulo]`
 */
export function log(modulo) {
  const prefixo = `[${modulo}]`;
  return {
    erro: (...args) => escrever("error", NIVEIS.error, prefixo, args),
    aviso: (...args) => escrever("warn", NIVEIS.warn, prefixo, args),
    info: (...args) => escrever("info", NIVEIS.info, prefixo, args),
    debug: (...args) => escrever("debug", NIVEIS.debug, prefixo, args),
  };
}

// Atalho para quem não quer nomear o módulo. Prefira `log("nome")`.
export const registro = log("portal");
