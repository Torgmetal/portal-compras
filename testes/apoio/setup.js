// Roda antes de cada arquivo de teste.
//
// ⚠ Trava de segurança: se algum teste tentar abrir conexão com o banco, o
// DATABASE_URL aponta pra lugar nenhum e a falha é imediata e óbvia, em vez de
// silenciosamente escrever na produção. Para testar código que usa Prisma,
// mocke com testes/apoio/prisma.js — nunca aponte isto pro Neon.
process.env.DATABASE_URL = "postgresql://ninguem@localhost:1/teste-sem-banco";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.LOG_NIVEL = "silent";
