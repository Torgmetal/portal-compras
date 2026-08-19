/**
 * recalcular-estudo-op.mjs
 *
 * REFAZ os itens (verba de COMPRA) e as receitas (o que se FATURA) de uma OP a partir da
 * planilha de estudo do Comercial.
 *
 * Existe por causa de um erro real: as OPs importadas antes de 19/08/2026 gravaram o valor de
 * VENDA da planilha como verba de compra. Na OP-116 isso liberava R$ 447.210,50 para um teto de
 * compra que é de R$ 327.632,98 — e deixava "Receitas do contrato" zerado, que é justamente onde
 * a venda deveria estar (Vitor, 19/08: "a receita do contrato seria o valor a ser faturado e itens
 * de contrato seria o valor que o compras deveria comprar").
 *
 * Uso:
 *   node --env-file=.env.local scripts/recalcular-estudo-op.mjs 116 ~/Downloads/LQC-249-...xlsx
 *   node --env-file=.env.local scripts/recalcular-estudo-op.mjs 116 <planilha> --aplicar
 *
 * Sem `--aplicar` só simula e mostra o antes/depois.
 *
 * 🚫 SE RECUSA A RODAR quando algum item já tem RM ou solicitação de verba vinculada — apagar o
 * item nesse caso levaria o histórico de compra junto. Nesses casos o ajuste é manual, item a item.
 *
 * ⚠ Confere que a planilha informada é a MESMA já gravada na OP (compara o total geral). Trocar o
 * estudo por engano reescreveria a obra inteira com números de outra obra.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// `lib/estudo-comercial.js` e `lib/op-categorias.js` são módulos do app (o primeiro tem
// `import "server-only"`, que o node puro não resolve). Carrega por shim temporário.
async function carregarLibs() {
  const shim = (origem, destino, trocas = []) => {
    let src = fs.readFileSync(origem, "utf8").replace(/^import "server-only";\s*$/m, "");
    for (const [de, para] of trocas) src = src.replaceAll(de, para);
    fs.writeFileSync(destino, src);
  };
  shim("lib/estudo-comercial.js", "lib/_tmp-ec.mjs");
  shim("lib/op-categorias.js", "lib/_tmp-oc.mjs", [['from "./estudo-comercial"', 'from "./_tmp-ec.mjs"']]);
  try {
    return {
      ...(await import("../lib/_tmp-ec.mjs")),
      ...(await import("../lib/_tmp-oc.mjs")),
    };
  } finally {
    for (const f of ["lib/_tmp-ec.mjs", "lib/_tmp-oc.mjs"]) fs.rmSync(f, { force: true });
  }
}

const [numero, planilha] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--aplicar");
if (!numero || !planilha) {
  console.error("uso: recalcular-estudo-op.mjs <numero-da-op> <planilha.xlsx> [--aplicar]");
  process.exit(1);
}

const { lerEstudoComercial, receitasDaPlanilhaComercial, itensDaPlanilhaComercial } = await carregarLibs();

const op = await prisma.oP.findFirst({
  where: { numero: String(numero).padStart(3, "0") },
  select: {
    id: true, numero: true, cliente: true, estudoArquivo: true, estudoDados: true,
    itens: {
      select: {
        id: true, descricao: true, valorVerba: true,
        rmItens: { select: { id: true } },
        solicitacoesVerba: { select: { id: true } },
      },
    },
    receitas: { select: { id: true, valor: true } },
  },
});
if (!op) { console.error(`OP-${numero} não encontrada.`); process.exit(1); }

console.log(`OP-${op.numero} — ${op.cliente}`);
console.log(`estudo gravado: ${op.estudoArquivo?.nome || op.estudoArquivo || "(nenhum)"}`);

const presos = op.itens.filter((i) => i.rmItens?.length || i.solicitacoesVerba?.length);
if (presos.length) {
  console.error(`\n🚫 ${presos.length} item(ns) já têm RM ou solicitação de verba vinculada:`);
  for (const i of presos) console.error(`   · ${i.descricao}`);
  console.error("   Apagar levaria o histórico de compra junto — ajuste manual nesses itens.");
  process.exit(1);
}

const estudo = await lerEstudoComercial(fs.readFileSync(planilha));

// a planilha informada tem de ser a MESMA já gravada na OP
const totalGravado = op.estudoDados?.comercial?.totalGeral?.valor;
const totalArquivo = estudo.comercial?.totalGeral?.valor;
if (totalGravado && Math.abs(totalGravado - (totalArquivo || 0)) >= 1) {
  console.error(`\n🚫 Estudo diferente do que está na OP: gravado ${money(totalGravado)} × arquivo ${money(totalArquivo)}.`);
  process.exit(1);
}

const receitas = receitasDaPlanilhaComercial(estudo.comercial, estudo.bdi);
const itens = itensDaPlanilhaComercial(estudo.comercial, estudo.custos);
const soma = (l, c) => l.reduce((s, x) => s + (x[c] || 0), 0);

console.log(`\nANTES  · ${op.itens.length} itens = ${money(soma(op.itens, "valorVerba"))} de verba`);
console.log(`         ${op.receitas.length} receitas = ${money(soma(op.receitas, "valor"))}`);
console.log(`\nDEPOIS · ${itens.length} itens = ${money(soma(itens, "valorVerba"))} de verba (o que o Compras pode gastar)`);
for (const i of itens) console.log(`         ${i.categoria.padEnd(24)} ${String(i.descricao).slice(0, 42).padEnd(44)} ${money(i.valorVerba).padStart(15)}`);
console.log(`\n         ${receitas.length} receitas = ${money(soma(receitas, "valor"))} (o que vai ser faturado)`);
for (const r of receitas) console.log(`         ${r.categoria.padEnd(24)} ${String(r.descricao).slice(0, 42).padEnd(44)} ${money(r.valor).padStart(15)}`);

if (!APLICAR) {
  console.log("\n(simulação — rode de novo com --aplicar para gravar)");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction([
  prisma.oPItem.deleteMany({ where: { opId: op.id } }),
  prisma.oPReceita.deleteMany({ where: { opId: op.id } }),
  prisma.oPItem.createMany({ data: itens.map((it, i) => ({ ...it, opId: op.id, ordem: i })) }),
  prisma.oPReceita.createMany({ data: receitas.map((r) => ({ ...r, opId: op.id })) }),
  // regrava o estudo com a aba BDI (as importações antigas foram lidas antes de ela existir)
  prisma.oP.update({ where: { id: op.id }, data: { estudoDados: estudo } }),
]);

console.log(`\n✓ OP-${op.numero} recalculada.`);
await prisma.$disconnect();
