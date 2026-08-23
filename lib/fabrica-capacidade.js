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
//
// ⚠⚠ E NÃO SE SOMA SETOR COM SETOR — foi o erro que o Vitor pegou (23/08/2026): "696 t no mês não
// é uma realidade; você deve estar somando a produção de cada setor, pois uma peça que passa na
// montagem passa na solda, depois acabamento, e por aí vai".
//
// Exato. Jan–jul/2026, por setor: pintura 142.688 · corte 141.941 · montagem 121.688 ·
// acabamento 118.245 · jato 107.911 · solda 106.158 kg/mês. Somando dá 738 t/mês — a MESMA peça
// contada seis vezes. A fábrica faz da ordem de 110 a 142 t/mês, não 700.
//
// E entre os setores vale o GARGALO, não a média nem o maior: a fábrica não entrega mais rápido
// que o setor mais lento. Usar o corte (que é entrada) daria um prazo otimista, e prazo otimista
// num orçamento é o mesmo que margem que não existe.
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

  // kg por SETOR e por mês — a peça aparece uma vez em cada setor por onde passa
  const porSetorMes = new Map();
  const mesesVistos = new Set();
  for (const a of ap) {
    if (!a.dataInicio) continue;
    const mes = a.dataInicio.toISOString().slice(0, 7);
    if (mes === mesCorrente) continue; // mês em curso não entra na média
    mesesVistos.add(mes);
    const setor = (a.setor || a.operacao || "—").trim();
    const chave = `${setor}|${mes}`;
    porSetorMes.set(chave, (porSetorMes.get(chave) || 0) + (Number(a.produzidoKg) || 0));
  }
  const nMeses = mesesVistos.size || 1;

  const porSetor = {};
  for (const [chave, kg] of porSetorMes) {
    const setor = chave.split("|")[0];
    porSetor[setor] = (porSetor[setor] || 0) + kg;
  }
  const setores = Object.entries(porSetor)
    .map(([setor, kg]) => ({ setor, kgMes: Math.round(kg / nMeses) }))
    .sort((a, b) => b.kgMes - a.kgMes);

  // ⚠ setor residual fica de fora do gargalo. "Preparação" aponta 14 kg/mês — é registro solto,
  // não capacidade; eleger isso como gargalo travaria a fábrica inteira num número sem sentido.
  const maior = setores[0]?.kgMes || 0;
  const relevantes = setores.filter((s) => s.kgMes >= maior * 0.2);
  const gargalo = relevantes.length ? relevantes[relevantes.length - 1] : null;

  const dados = {
    capacidadeKgMes: gargalo?.kgMes || 0,
    setorGargalo: gargalo?.setor || null,
    setores: relevantes,
    setoresIgnorados: setores.filter((s) => s.kgMes < maior * 0.2),
    mesesConsiderados: nMeses,
    periodo: mesesVistos.size ? `${[...mesesVistos].sort()[0]} a ${[...mesesVistos].sort().pop()}` : null,
    custoOperacionalMes: Math.round(Number(cfg?.custoTotalMensal) || 0),
  };
  cache = { em: Date.now(), dados };
  return dados;
}
