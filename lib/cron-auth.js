// Autenticação dos endpoints de cron/sync.
//
// ANTES: aceitava a requisição se o header `User-Agent` contivesse "vercel-cron".
// Isso NÃO é segurança — qualquer cliente pode enviar esse User-Agent e disparar
// os syncs pesados (Omie/estoque) → DoS/custo/OOM do Neon (SEC-01).
//
// AGORA: só autoriza com `Authorization: Bearer <CRON_SECRET>`. A Vercel injeta
// esse header automaticamente nas invocações de cron quando a env `CRON_SECRET`
// existe — então o segredo PRECISA estar configurado na Vercel (prod).
import { timingSafeEqual } from "node:crypto";

function safeEq(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * True se a requisição traz o Bearer CRON_SECRET válido. NÃO confia no User-Agent.
 * Se `CRON_SECRET` não estiver configurado, retorna false (nunca autoriza por aqui).
 */
export function temCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return safeEq(m[1], secret);
}
