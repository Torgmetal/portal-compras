import "server-only";
import { prisma } from "./prisma";

// ─── QUANTO SAIU DA FÁBRICA NO MÊS ─────────────────────
//
// ⚠⚠ SÃO DUAS TABELAS, E AS DUAS CONTAM. Vitor (07/09/2026): "temos nas pastas das OPs os
// romaneios que fazemos da forma antiga ainda, eles precisam ser somados também".
//
//   · `Romaneio`      — o FORM 22 em papel, importado de {OP}/4. Expedição/4.2 Romaneios no
//                       SharePoint (ver lib/importar-romaneios.js). Data em `data`, peso em
//                       `pesoRealKg`. É por onde a fábrica embarcou a vida inteira.
//   · `RomaneioPrevio`— o fluxo do portal. Conta quando `emitidoEm` está preenchido.
//
// ⚠ SOMAR AS DUAS É SEGURO, e não por sorte: o importador de pasta RECUSA OP que já tenha
// romaneio do fluxo novo, justamente para não duplicar embarque. Conferido em 07/09/2026 —
// nenhuma OP tem registro nas duas tabelas.
//
// ⚠⚠ O NÚMERO DO MÊS CORRENTE NASCE SUBESTIMADO, e quem mostra tem de dizer isso. O romaneio de
// pasta só entra no portal quando alguém IMPORTA, e a importação é manual de propósito: o FORM 22
// pode ser emitido antes de a peça existir (caso do romaneio 02 da OP-104), então quem importa
// escolhe quais realmente saíram. Enquanto o mês não é importado, ele mostra só o que passou pelo
// portal. Medido em 07/09/2026: setembro tinha 9.745 kg (1 romaneio do portal, zero de pasta),
// contra 93.112 kg em julho e 141.016 em março — que vieram todos de pasta.
//
// Por isso `porFonte` volta junto: sem separar as duas, ninguém consegue distinguir "a fábrica
// embarcou pouco" de "ninguém importou os romaneios do mês".

/**
 * A janela do mês de `ref`, no fuso de São Paulo: `[inicio, fim)`.
 *
 * ⚠ O FIM NÃO É OPCIONAL, mesmo parecendo. A primeira versão desta função devolvia só o início e
 * filtrava por `gte` — o que dá certo para o mês corrente (não há nada depois de hoje) e ERRA em
 * qualquer mês passado, somando dali em diante. No teste, julho veio 145,8 t em vez de 93,1 e março
 * veio 573,2 em vez de 141,0. Quem for comparar mês a mês precisa da janela fechada.
 */
function janelaDoMes(ref = new Date()) {
  const ymd = ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const [y, m] = ymd.split("-").map(Number);
  return { inicio: new Date(Date.UTC(y, m - 1, 1)), fim: new Date(Date.UTC(y, m, 1)) };
}

/**
 * Peso expedido no mês, somando o romaneio de pasta e o do portal.
 *
 * @param {Date} [ref] qualquer instante dentro do mês desejado; padrão é agora
 * @returns {Promise<{kg:number, romaneios:number,
 *   porFonte:{pasta:{kg:number,romaneios:number}, portal:{kg:number,romaneios:number}},
 *   ultimoDePasta:Date|null}>}
 */
export async function expedidoNoMes(ref = new Date()) {
  const { inicio, fim } = janelaDoMes(ref);

  const [pasta, portal, ultimo] = await Promise.all([
    prisma.romaneio.aggregate({
      _count: { _all: true }, _sum: { pesoRealKg: true },
      where: { data: { gte: inicio, lt: fim } },
    }),
    prisma.romaneioPrevio.aggregate({
      _count: { _all: true }, _sum: { pesoKg: true },
      where: { emitidoEm: { gte: inicio, lt: fim }, status: { not: "CANCELADO" } },
    }),
    // ⚠ a data do romaneio de pasta MAIS RECENTE no portal — é ela que diz até quando a
    // importação está em dia. Sem isso, "0 kg no mês" é ambíguo.
    prisma.romaneio.findFirst({ select: { data: true }, orderBy: { data: "desc" } }),
  ]);

  const kgPasta = pasta._sum.pesoRealKg || 0;
  const kgPortal = portal._sum.pesoKg || 0;

  return {
    kg: kgPasta + kgPortal,
    romaneios: pasta._count._all + portal._count._all,
    porFonte: {
      pasta: { kg: kgPasta, romaneios: pasta._count._all },
      portal: { kg: kgPortal, romaneios: portal._count._all },
    },
    ultimoDePasta: ultimo?.data || null,
  };
}
