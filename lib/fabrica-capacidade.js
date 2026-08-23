import "server-only";
import { prisma } from "./prisma";

// ─── QUANTO A FÁBRICA FAZ POR MÊS, E QUANTO ELA CUSTA ─────────────────────────
// Vitor (23/08/2026): "quantos meses temos para fabricar isso para garantir esse lucro?".
//
// A resposta precisa de dois números que o portal já tem — e que não devem ser digitados de novo
// num orçamento, porque digitado envelhece e ninguém percebe:
//
//   CADÊNCIA   o que a fábrica produziu de verdade, mês a mês (apontamento do Syneco).
//   CUSTO/MÊS  o custo operacional mensal da configuração de custo-hora do Comercial — a mesma
//              base que forma o preço por hora de cada setor.
//
// ⚠ A MÉDIA IGNORA MÊS PARCIAL. O mês corrente ainda está acontecendo: entrar na média puxaria a
// capacidade para baixo e faria toda proposta parecer mais lenta do que a fábrica é.
const TTL_MS = 30 * 60 * 1000;
let cache = null;

export async function capacidadeDaFabrica(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.dados;

  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);
  const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [ap, cfg] = await Promise.all([
    prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: inicio } },
      select: { dataInicio: true, produzidoKg: true },
      take: 500000,
    }),
    prisma.configCustoHora.findUnique({ where: { id: "default" }, select: { custoTotalMensal: true } }),
  ]);

  const porMes = {};
  for (const a of ap) {
    if (!a.dataInicio) continue;
    const k = a.dataInicio.toISOString().slice(0, 7);
    porMes[k] = (porMes[k] || 0) + (Number(a.produzidoKg) || 0);
  }
  const meses = Object.entries(porMes)
    .filter(([m, kg]) => m !== mesCorrente && kg > 1000)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const valores = meses.map(([, kg]) => kg);
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;

  const dados = {
    capacidadeKgMes: Math.round(media),
    melhorMes: valores.length ? Math.round(Math.max(...valores)) : 0,
    mesesConsiderados: valores.length,
    periodo: meses.length ? `${meses[0][0]} a ${meses[meses.length - 1][0]}` : null,
    custoOperacionalMes: Math.round(Number(cfg?.custoTotalMensal) || 0),
    serie: meses.map(([m, kg]) => ({ mes: m, kg: Math.round(kg) })),
  };
  cache = { em: Date.now(), dados };
  return dados;
}
