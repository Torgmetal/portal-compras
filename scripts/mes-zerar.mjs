#!/usr/bin/env node
/**
 * ZERAR O MES — apagar tudo e começar do zero.
 *
 * ⚠⚠ É O QUE TORNA "TESTAR EM PRODUÇÃO" UMA DECISÃO BARATA. Matheus (22/09/2026): *"posso ir
 * testando em produção e depois zerar tudo para iniciar do zero com tudo corrigido"*. Sem um
 * caminho de volta, cada teste deixaria resíduo que alguém teria de limpar à mão — e limpar à mão
 * um banco com 14 tabelas encadeadas por FK é como se apaga a tabela errada.
 *
 * ⚠⚠ NÃO ALCANÇA O PORTAL, POR CONSTRUÇÃO. Só nomeia tabelas do schema `mes`; `PecaConjunto`, OP,
 * RM e o resto estão em `public` e este script não sabe pronunciá-las. É a separação de schema
 * fazendo o trabalho dela.
 *
 * ⚠ PEDE CONFIRMAÇÃO. Rodar sem `--confirmo` só MOSTRA o que seria apagado, com as contagens. Um
 * script destrutivo que age no primeiro enter é um acidente esperando o histórico do shell.
 *
 * Uso:
 *   node scripts/mes-zerar.mjs              # só conta o que existe
 *   node scripts/mes-zerar.mjs --confirmo   # apaga
 *   node scripts/mes-zerar.mjs --confirmo --manter-cadastro   # preserva setor/posto/crachá/motivo
 */
import { PrismaClient } from "@prisma/client";

/**
 * ⚠ A ORDEM É A DAS DEPENDÊNCIAS, de folha para raiz. `TRUNCATE ... CASCADE` resolveria sozinho,
 * mas cascata não pergunta — ela apagaria também o que o `--manter-cadastro` existe para salvar.
 */
const MOVIMENTO = [
  "MesApontamentoQtd", "MesEvento", "MesCorrecao", "MesPresenca", "MesSessao",
  "MesNestingItem", "MesNestingUnidade", "MesNesting", "MesAuditoria", "MesDispositivo",
];
const CADASTRO = ["MesRecurso", "MesOperador", "MesMotivoParada", "MesSetor"];

async function contar(prisma, tabelas) {
  const linhas = [];
  for (const t of tabelas) {
    const [r] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM mes."${t}"`);
    linhas.push([t, r.n]);
  }
  return linhas;
}

async function main() {
  const confirmo = process.argv.includes("--confirmo");
  const manterCadastro = process.argv.includes("--manter-cadastro");
  const alvo = manterCadastro ? MOVIMENTO : [...MOVIMENTO, ...CADASTRO];

  const prisma = new PrismaClient();
  try {
    const antes = await contar(prisma, alvo);
    const total = antes.reduce((t, [, n]) => t + n, 0);
    for (const [t, n] of antes) if (n) console.log(`  ${t}: ${n}`);
    console.log(`[mes-zerar] ${total} linha(s) em ${alvo.length} tabela(s) do schema "mes".`);
    if (manterCadastro) console.log("[mes-zerar] cadastro preservado:", CADASTRO.join(", "));

    if (!confirmo) {
      console.log("[mes-zerar] nada foi apagado. Rode com --confirmo para apagar de verdade.");
      return;
    }
    if (!total) { console.log("[mes-zerar] já estava vazio."); return; }

    // ⚠ Uma transação só: metade apagada deixaria FK órfã e um banco pior que o de antes.
    await prisma.$transaction(async (tx) => {
      for (const t of alvo) await tx.$executeRawUnsafe(`DELETE FROM mes."${t}"`);
    }, { timeout: 60_000 });

    const depois = await contar(prisma, alvo);
    const resto = depois.reduce((t, [, n]) => t + n, 0);
    if (resto) throw new Error(`sobraram ${resto} linha(s) — o MES NÃO foi zerado`);
    console.log(`[mes-zerar] OK — ${total} linha(s) apagadas. O MES está zerado.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[mes-zerar] ⚠ FALHOU:", e.message);
  process.exit(1);
});
