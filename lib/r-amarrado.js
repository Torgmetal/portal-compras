import "server-only";
import { prisma } from "./prisma";

// ─── O R QUE ALGUÉM AMARROU À MÃO ─────────────────────────────────────────────
// `TrocaRastreabilidade` é o registro de "para este perfil, o fardo é o R X" — nasceu para a troca
// no ato da separação e virou também a saída para quando a Engenharia e o Almoxarifado escrevem o
// mesmo aço com nomes diferentes (o Z da OP-105: LPC `Z150X70X76X40X6.40`, CMR `Z 150X70X76X32X6.35`).
//
// ⚠⚠ ESTE ARQUIVO EXISTE PORQUE A REGRA JÁ ESTAVA EM DOIS LUGARES E FALTAVA NO TERCEIRO. Vitor
// (26/08/2026): "na planilha de separação vc não esta puxando as informações do lote corrida e o R".
// A liberação enxergava a amarração, o PCP passou a enxergar, e a separação — a folha que a pessoa
// leva para o rack — continuava sem. Três telas lendo o mesmo aço por critérios diferentes é como
// se perde a confiança no portal inteiro.
//
// ⚠ SÓ VALE R DA PRÓPRIA OBRA. Vitor (25/08/2026): "não vamos criar uma maneira de burlarmos e
// informar um material que não era destinado a essa obra". Quem confere isso é o chamador, que sabe
// quais R são da obra; aqui devolve-se o que foi declarado.
export async function amarracoesDaOp(opNumero) {
  const num = String(opNumero || "").trim();
  if (!num) return new Map();
  const trocas = await prisma.trocaRastreabilidade
    .findMany({ where: { opNumero: num }, select: { perfil: true, rUsado: true, trocadoPorNome: true, motivo: true } })
    .catch(() => []);
  return new Map(
    trocas.filter((t) => t.rUsado && t.perfil)
      .map((t) => [String(t.perfil).trim().toUpperCase(), { r: String(t.rUsado).trim(), por: t.trocadoPorNome || null, motivo: t.motivo || null }])
  );
}

export const amarracaoDoPerfil = (mapa, perfil) => mapa?.get(String(perfil || "").trim().toUpperCase()) || null;
