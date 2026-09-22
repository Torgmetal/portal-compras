// ─── O CLIENTE DO MES — OUTRO SCHEMA, O MESMO BANCO ───────────────────────────────────────────
//
// ⚠⚠ DOIS CLIENTES, NÃO `multiSchema` (Codex, 20-21/09/2026). Ligar `multiSchema` no schema do
// portal obriga `@@schema` em TODO model e TODO enum: 218 models + 21 enums, medidos. O cliente
// próprio entrega a mesma fronteira sem encostar em nada do portal — ver `prisma/mes/schema.prisma`.
//
// ⚠⚠ É O MESMO BANCO NEON, COM `schema=mes` NA URL. Matheus (21/09/2026): "dois sistemas que se
// integram nativamente". Um banco separado custaria outra compute e tornaria impossível ler a
// programação do portal na mesma transação — que é justamente o que a integração vai precisar.
import { PrismaClient as MesPrismaClient } from ".prisma/mes-client";

const globalParaMes = globalThis;

/**
 * A URL do MES: a do portal com `schema=mes`.
 *
 * ⚠⚠ DERIVADA, NÃO UMA VARIÁVEL NOVA OBRIGATÓRIA. Exigir `MES_DATABASE_URL` no Vercel criaria um
 * jeito novo de o deploy quebrar — e um segredo a mais para manter em dia em duas máquinas, com o
 * risco de as duas URLs apontarem para bancos diferentes sem ninguém notar. `MES_DATABASE_URL`
 * existe como ESCAPE, para o dia do gateway local na fábrica; sem ela, o MES mora ao lado do
 * portal, por construção.
 *
 * ⚠ `schema=mes` é parâmetro do Prisma, não do Postgres: ele vira o `search_path` da conexão. Se a
 * URL já trouxer um `schema`, ele é trocado — senão a URL do portal (`schema=public`, quando
 * explícito) mandaria o MES escrever no schema do portal, que é exatamente o que separar evita.
 */
export function urlDoMes(base = process.env.DATABASE_URL) {
  if (process.env.MES_DATABASE_URL) return process.env.MES_DATABASE_URL;
  if (!base) return undefined;
  try {
    const u = new URL(base);
    u.searchParams.set("schema", "mes");
    return u.toString();
  } catch {
    // URL que o `URL` não parseia não é consertada no escuro: sem saber onde acaba a query, um
    // append cego mandaria o MES escrever no schema errado. Melhor falhar na conexão, com a
    // mensagem do Prisma, do que gravar no lugar errado em silêncio.
    return undefined;
  }
}

export const mesPrisma =
  globalParaMes.mesPrisma ??
  new MesPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url: urlDoMes() } },
  });

if (process.env.NODE_ENV !== "production") {
  globalParaMes.mesPrisma = mesPrisma;
}
