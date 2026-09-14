// PROVA, CONTRA O BANCO DO LABORATÓRIO, que um crachá não abre em duas máquinas.
//
//   DATABASE_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//     npx vite-node -c vitest.config.mjs scripts/mes-lab/provar-cracha.mjs
//
// ⚠⚠ TESTE COM MOCK NÃO SUBSTITUI ISTO. Foi uma prova assim que achou, hoje cedo, que encerrar uma
// barra fechava marca que outra ainda cortava — com 1.239 testes verdes. O que só o banco responde:
// o índice parcial existe? a trava serializa de verdade? a transação desfaz o que deve desfazer?
import { prisma } from "@/lib/prisma";
import { entrarNoPosto, sairDoPosto, liberarPresenca } from "@/lib/mes/cracha";
import { abrirSessao, encerrarSessao } from "@/lib/mes/sessao";

const ok = (t, c) => console.log(`${c ? "✓" : "✗ FALHOU"}  ${t}`);
let falhas = 0;
const conferir = (t, c) => { ok(t, c); if (!c) falhas++; };

const [opA] = await prisma.mesOperador.findMany({ where: { ativo: true }, take: 1 });
const postos = await prisma.mesRecurso.findMany({ where: { ativo: true }, take: 2 });
const [p1, p2] = postos;
console.log(`Operador: ${opA.nome.trim()} (${opA.cracha}) · postos: ${p1.nome} / ${p2.nome}\n`);

// Limpa o que uma execução anterior possa ter deixado.
await prisma.mesPresenca.updateMany({ where: { operadorId: opA.id, status: "ABERTA" },
  data: { status: "ENCERRADA", encerradaEm: new Date(), motivoFim: "limpeza da prova" } });
const marca = `PROVA-${Date.now().toString().slice(-6)}`;

// 1 — entra no primeiro posto
const e1 = await entrarNoPosto(prisma, { operadorId: opA.id, recursoId: p1.id });
conferir("o crachá entra no primeiro posto", !e1.erro && e1.jaEstava === false);

// 2 — bipar de novo no MESMO posto não cria outro vínculo
const e2 = await entrarNoPosto(prisma, { operadorId: opA.id, recursoId: p1.id });
conferir("bipar de novo no mesmo posto devolve o mesmo vínculo", e2.jaEstava === true && e2.presenca.id === e1.presenca.id);

// 3 — abre uma marca ali
const ab = await abrirSessao(prisma, {
  recursoId: p1.id, operadorId: opA.id, marca, opNumero: "999", planejadoQtd: 5,
  presenca: { operadorId: opA.id, presencaId: e1.presenca.id },
});
conferir("abre uma marca no posto onde o crachá está", !ab.erro && !!ab.sessao);

// 4 — O PEDIDO: com marca aberta, o outro posto recusa
const e3 = await entrarNoPosto(prisma, { operadorId: opA.id, recursoId: p2.id });
conferir("o segundo posto RECUSA enquanto há marca aberta no primeiro", !!e3.erro && e3.erro.includes(p1.nome));
console.log(`     ↳ "${e3.erro}"`);

// 5 — e nem adianta mandar o comando direto para o outro posto
const noOutro = await abrirSessao(prisma, {
  recursoId: p2.id, operadorId: opA.id, marca: `${marca}-X`, opNumero: "999", planejadoQtd: 1,
  presenca: { operadorId: opA.id, presencaId: e1.presenca.id },
});
conferir("comando disparado no outro posto também é recusado", !!noOutro.erro);

// 6 — sair não solta com marca aberta
const s1 = await sairDoPosto(prisma, { operadorId: opA.id, recursoId: p1.id });
conferir("Sair NÃO solta o crachá com marca aberta", !!s1.erro);

// 7 — tela velha (id de vínculo antigo) é recusada mesmo no posto certo
const velha = await abrirSessao(prisma, {
  recursoId: p1.id, operadorId: opA.id, marca: `${marca}-V`, opNumero: "999", planejadoQtd: 1,
  presenca: { operadorId: opA.id, presencaId: "vinculo-que-morreu" },
});
conferir("tela velha é recusada mesmo no posto certo", !!velha.erro && velha.erro.includes("desatualizada"));

// 8 — encerrada a marca, o crachá sai e entra no outro posto
await encerrarSessao(prisma, { sessaoId: ab.sessao.id, operadorId: opA.id,
  presenca: { operadorId: opA.id, presencaId: e1.presenca.id } });
const sobraram = await prisma.mesSessao.count({ where: { recursoId: p1.id, status: "ABERTA" } });
const s2 = await sairDoPosto(prisma, { operadorId: opA.id, recursoId: p1.id });
conferir(`encerrada a marca (sobram ${sobraram} no posto), Sair libera`, sobraram === 0 ? !!s2.liberou : !!s2.erro);

// 9 — a corrida: dois totens, o mesmo crachá, ao mesmo tempo
await prisma.mesPresenca.updateMany({ where: { operadorId: opA.id, status: "ABERTA" },
  data: { status: "ENCERRADA", encerradaEm: new Date(), motivoFim: "limpeza da prova" } });
const [r1, r2] = await Promise.all([
  entrarNoPosto(prisma, { operadorId: opA.id, recursoId: p1.id }).catch((e) => ({ erro: e.message })),
  entrarNoPosto(prisma, { operadorId: opA.id, recursoId: p2.id }).catch((e) => ({ erro: e.message })),
]);
const ativas = await prisma.mesPresenca.count({ where: { operadorId: opA.id, status: "ABERTA" } });
conferir("dois totens ao mesmo tempo: sobra UM vínculo só", ativas === 1);
console.log(`     ↳ um passou (${!r1.erro ? p1.nome : p2.nome}), o outro ${r1.erro || r2.erro ? "foi recusado" : "TAMBÉM PASSOU"}`);

// 10 — a saída de emergência do ADMIN
const lib = await liberarPresenca(prisma, { operadorId: opA.id, porQuem: "prova" });
const depois = await prisma.mesPresenca.count({ where: { operadorId: opA.id, status: "ABERTA" } });
conferir("a liberação pelo ADMIN solta o vínculo", !!lib.liberou && depois === 0);

console.log(`\n${falhas ? `${falhas} PROVA(S) FALHARAM` : "todas as provas passaram"}`);
await prisma.$disconnect();
process.exit(falhas ? 1 : 0);
