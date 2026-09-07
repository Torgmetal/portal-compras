// ─── IMPORTAR OS ROMANEIOS DE PASTA QUE FALTAVAM ───────────────────────────────────────────────
//
// Vitor (07/09/2026): "temos nas pastas das OPs os romaneios que fazemos da forma antiga ainda,
// eles precisam ser somados também". O "Expedido no mês" do painel do PCP contava só o fluxo do
// portal e mostrava 9,7 t em setembro — o que lê como fábrica parada, e não era.
//
// ⚠⚠ A ESCOLHA É EXPLÍCITA PORQUE FORM 22 EMITIDO NÃO É FORM 22 EMBARCADO. O importador se recusa
// a gravar sem uma lista de números (ver lib/importar-romaneios.js): o romaneio pode ser emitido
// antes de a peça existir — foi o caso do romaneio 02 da OP-104, que o próprio Vitor pegou em
// agosto. A lista abaixo é a confirmação dele, romaneio a romaneio, em 07/09/2026.
//
// Resultado medido depois de rodar:
//   setembro/26   9,7 → 16,9 t     julho/26    93,1 → 114,3 t
//   agosto/26    42,9 → 60,2 t     último romaneio de pasta no portal: 14/08 → 04/09
//
// ⚠ MARCA SEM CASAR NÃO TIRA O PESO DA CONTA, mas deixa a peça na fila do PCP. O peso do romaneio
// vem do arquivo (`pesoRealKg`), então o "expedido no mês" fica certo de qualquer jeito; o que não
// acontece é a baixa da peça. Nesta importação: 338 marcas da OP-067 (PC1, PC2, … — nomenclatura
// que não existe na LPC) e 1 da OP-083 (T8D5). Vale conferir se são peças de fato ou linhas de
// controle do arquivo.
//
// Uso:  node --import ./_loader-reg.mjs scripts/importar-romaneios-pasta.mjs --aplicar
//       (sem --aplicar apenas lista o que seria gravado)
import { importarRomaneiosDaOp } from "../lib/importar-romaneios.js";
import { prisma } from "../lib/prisma.js";

const ESCOLHA = {
  "067": ["26R1"],
  "083": ["R14", "R15"],
  "084": ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"],
};
const aplicar = process.argv.includes("--aplicar");
const user = { id: null, name: "Vitor Costa · import de romaneios de pasta" };

for (const [op, numeros] of Object.entries(ESCOLHA)) {
  try {
    const r = await importarRomaneiosDaOp(op, { gravar: aplicar, somente: aplicar ? numeros : null, user });
    if (!aplicar) {
      const alvo = (r.romaneios || []).filter((x) => numeros.includes(String(x.numero)));
      console.log(`OP-${op}: ${alvo.length} de ${numeros.length} encontrados na pasta`);
      for (const x of alvo) console.log(`   ${x.numero}  ${new Date(x.dataSaida).toLocaleDateString("pt-BR")}  ${Math.round(x.pesoKg)} kg`);
    } else {
      console.log(`OP-${op}: gravado · ${r.casadas} marca(s) casada(s)` + (r.semCasar?.length ? ` · ${r.semCasar.length} sem casar` : ""));
    }
  } catch (e) {
    console.log(`OP-${op}: ERRO — ${e.message}`);
  }
}
await prisma.$disconnect();
