// Série mensal de peso faturado, direto da NF-e de saída do Omie.
//
// ⚠ ESTE É O MEDIDOR DE PESO MAIS CONFIÁVEL DA EMPRESA — e o único que não depende de ninguém
// apontar nada. Não se embarca sem nota; a nota tem chave de acesso; e os produtos da Torg são
// faturados em KG. Rode com:
//
//   node --env-file=.env.local scripts/nfe-saida-serie.mjs [meses]
//
// ⚠ SEM SEPARAR CFOP E SEM TIRAR CANCELADA, O NÚMERO TRIPLICA. Foi o que produziu a lembrança
// dos "330 t/mês": somando tudo dá 304.550 kg/mês, mas a maior parte é remessa a terceiro que
// volta como retorno e só depois sai como venda — o mesmo quilo contado três vezes. E uma única
// nota cancelada (NF 744, 06/05/2026, CFOP 5101) carregava 113.125 kg sozinha.
import { serieNFeSaida } from "../lib/omie-nfe-saida.js";

const meses = Number(process.argv[2]) || 13;
const K = (v) => Math.round(v).toLocaleString("pt-BR").padStart(11);
const serie = await serieNFeSaida(meses);
const comNota = serie.filter((m) => m.nfs > 0);

console.log(`mês       ${"NFs".padStart(4)} ${"VENDA kg".padStart(11)} ${"trânsito".padStart(11)} ${"portão".padStart(11)} ${"R$/kg".padStart(7)}`);
for (const m of serie)
  console.log(`${m.mes}  ${String(m.nfs).padStart(4)} ${K(m.kgVenda)} ${K(m.kgTransito + m.kgOutros)} ${K(m.kgPortao)} ${String(m.precoPorKg || "—").padStart(7)}`);

if (!comNota.length) process.exit(0);
const venda = comNota.reduce((a, m) => a + m.kgVenda, 0);
const portao = comNota.reduce((a, m) => a + m.kgPortao, 0);
const valor = comNota.reduce((a, m) => a + m.valorVenda, 0);
let melhorSem = null;
for (let i = 0; i + 5 < comNota.length; i++) {
  const v = comNota.slice(i, i + 6).reduce((a, m) => a + m.kgVenda, 0) / 6;
  if (!melhorSem || v > melhorSem.v) melhorSem = { v, de: comNota[i].mes, ate: comNota[i + 5].mes };
}
console.log(`\nmédia em ${comNota.length} meses: VENDA ${K(venda / comNota.length)} kg/mês · portão ${K(portao / comNota.length)} kg/mês · R$ ${(valor / venda).toFixed(2)}/kg`);
if (melhorSem) console.log(`melhor semestre de venda: ${K(melhorSem.v)} kg/mês (${melhorSem.de} a ${melhorSem.ate})`);
console.log(`\n⚠ "portão" NÃO é produção: inclui remessa e retorno, o mesmo quilo mais de uma vez.`);
