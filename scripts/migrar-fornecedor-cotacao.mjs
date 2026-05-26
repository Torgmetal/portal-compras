// Script one-time pra vincular Cotacao.fornecedorId ao cadastro de Fornecedor.
// Roda: node scripts/migrar-fornecedor-cotacao.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fornecedores = await prisma.fornecedor.findMany({
    where: { ativo: true },
    select: { id: true, razaoSocial: true, email: true, emailsAdicionais: true, cnpj: true, nCodOmie: true },
  });

  console.log(`Fornecedores cadastrados: ${fornecedores.length}`);

  // Cria indices pra busca
  const porEmail = new Map();
  const porNome = new Map();

  for (const f of fornecedores) {
    // Index por email (principal + adicionais)
    porEmail.set(f.email.toLowerCase().trim(), f);
    for (const e of f.emailsAdicionais || []) {
      porEmail.set(e.toLowerCase().trim(), f);
    }
    // Index por nome normalizado
    const nomeNorm = f.razaoSocial.toLowerCase().replace(/[^a-z0-9]/g, "");
    porNome.set(nomeNorm, f);
  }

  // Busca cotacoes sem fornecedorId
  const cotacoes = await prisma.cotacao.findMany({
    where: { fornecedorId: null },
    select: { id: true, fornecedorNome: true, fornecedorEmail: true, cnpj: true, nCodOmie: true },
  });

  console.log(`Cotacoes sem fornecedorId: ${cotacoes.length}`);

  let vinculadas = 0;
  let naoEncontradas = 0;
  const naoMatch = new Map(); // nome -> count

  for (const cot of cotacoes) {
    let match = null;

    // 1) Tenta por email
    if (cot.fornecedorEmail) {
      match = porEmail.get(cot.fornecedorEmail.toLowerCase().trim());
    }

    // 2) Tenta por nome normalizado
    if (!match && cot.fornecedorNome) {
      const norm = cot.fornecedorNome.toLowerCase().replace(/[^a-z0-9]/g, "");
      match = porNome.get(norm);
    }

    // 3) Tenta match parcial (nome contem ou esta contido)
    if (!match && cot.fornecedorNome) {
      const norm = cot.fornecedorNome.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const [key, f] of porNome) {
        if (norm.includes(key) || key.includes(norm)) {
          match = f;
          break;
        }
      }
    }

    if (match) {
      await prisma.cotacao.update({
        where: { id: cot.id },
        data: { fornecedorId: match.id },
      });
      vinculadas++;
    } else {
      naoEncontradas++;
      const nome = cot.fornecedorNome || "(sem nome)";
      naoMatch.set(nome, (naoMatch.get(nome) || 0) + 1);
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Vinculadas: ${vinculadas}`);
  console.log(`  Nao encontradas: ${naoEncontradas}`);

  if (naoMatch.size > 0) {
    console.log(`\nFornecedores sem match (cadastrar na Vendor List):`);
    for (const [nome, count] of [...naoMatch.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - "${nome}" (${count} cotacoes)`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
