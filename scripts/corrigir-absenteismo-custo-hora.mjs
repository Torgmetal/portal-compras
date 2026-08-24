#!/usr/bin/env node
// Devolve o custo-hora para uma jornada possível.
//
// O campo "Absenteísmo (%)" da tela estava com 80 — cada pessoa faltando 4 dias em 5, jornada de
// 38,5 h/mês em vez de 177. O custo-hora saía 4,6× alto (SOLDAGEM a R$ 889/h em vez de R$ 193/h) e
// ia direto para o preço das propostas de serviço. Veio do fallback `num(ocupacao) || 80` do
// formulário — corrigido no código; isto aqui é a linha que ficou no banco.
//
// Também zera o `horasMes` lançado por setor: 192 h para 5 soldadores é menos de um mês de UMA
// pessoa. Os valores batem casa com `headcount × 38,5`, ou seja, são a estimativa velha congelada.
// Zerados, a conta volta a usar `headcount × horas/pessoa` e acompanha quem mexer na jornada.
// Se algum setor tiver hora medida de verdade, é só lançar de novo na tela.
//
//   node --env-file=.env.local scripts/corrigir-absenteismo-custo-hora.mjs            (simula)
//   node --env-file=.env.local scripts/corrigir-absenteismo-custo-hora.mjs --aplicar  (grava)
import { PrismaClient } from "@prisma/client";
import { ABSENTEISMO_MAX } from "../lib/custo-hora-calc.js";

const p = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const ABSENTEISMO_PADRAO = 8;

const c = (await p.$queryRaw`SELECT * FROM "ConfigCustoHora" LIMIT 1`)[0];
if (!c) {
  console.log("sem ConfigCustoHora — nada a fazer");
} else if (Number(c.ocupacaoPct) <= ABSENTEISMO_MAX) {
  console.log(`absenteísmo em ${c.ocupacaoPct}% — dentro do razoável, nada a fazer`);
} else {
  const h = (a) => (Number(c.horasDia) || 8.75) * (Number(c.diasUteis) || 22) * (1 - a / 100);
  console.log(`absenteísmo  ${c.ocupacaoPct}% → ${ABSENTEISMO_PADRAO}%`);
  console.log(`horas/pessoa ${h(Number(c.ocupacaoPct)).toFixed(1)} → ${h(ABSENTEISMO_PADRAO).toFixed(1)} h/mês\n`);
  const setores = (c.setores || []).map((s) => ({ ...s, horasMes: 0 }));
  for (const s of c.setores || []) {
    const antes = Number(s.horasMes) || 0;
    const depois = Math.round(Number(s.headcount || 0) * h(ABSENTEISMO_PADRAO));
    console.log(`  ${String(s.nome).padEnd(18)} ${String(s.headcount).padStart(3)} pes   ${String(antes).padStart(5)} h → ${String(depois).padStart(5)} h`);
  }
  if (APLICAR) {
    await p.configCustoHora.update({
      where: { id: c.id },
      data: { ocupacaoPct: ABSENTEISMO_PADRAO, setores },
    });
    console.log("\n✔ gravado");
  } else {
    console.log("\n(simulação — rode com --aplicar para gravar)");
  }
}
await p.$disconnect();
