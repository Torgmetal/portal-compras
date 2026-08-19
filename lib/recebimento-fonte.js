import "server-only";
import { prisma } from "./prisma";

// QUEM PODE DAR BAIXA DE RECEBIMENTO EM CADA ITEM.
//
// Vitor (19/08/2026): "para deixarmos o Omie apenas para esses itens seria um problema?" — não é,
// e é a divisão certa: **cada fonte manda onde ela de fato sabe**.
//
//   material que o Almoxarifado lança no CMR  → o CMR manda; o Omie NÃO escreve
//   item que nunca passa pelo CMR             → o Omie é a única fonte automática
//
// Por que o Omie não pode opinar sobre o primeiro grupo: ele marca recebimento que o CMR não
// confirma. Em 10 grupos de material o OMIE_SYNC diz que chegou MAIS do que o Almoxarifado
// lançou — na OP-097 são 6.233 kg de perfil H contra 445 kg no CMR.
//
// ⚠️ A lista de "o que passa pelo CMR" sai DO PRÓPRIO CMR, não de um cadastro à mão: as famílias
// (duas primeiras palavras) das 3.705 linhas lançadas. Assim ela se atualiza sozinha — se o
// Almoxarifado começar a lançar um material novo, ele sai do domínio do Omie no dia seguinte.
//
// 🚨 Corrigindo o que eu tinha assumido: **parafuso, porca, arruela e diluente ENTRAM no CMR**
// (406 linhas de PARAFUSO SEXT, 217 de ARRUELA LISA, 134 de PORCA A194, 89 de DILUENTE). Os itens
// de parafuso que não casaram na conciliação são compras que ainda não chegaram, não material
// fora do CMR. Quem fica de fora é consumível de oficina e serviço: prisioneiro, bico de solda,
// disco de corte, autobrocante, luva, "serviço de…".

// Cara de aço: perfil, chapa, tubo, barra, cantoneira — e a forma curta que a Engenharia usa
// (W150X22.5, CH12.50, L2"X1/4"). Item assim é domínio do CMR MESMO que a família não apareça
// lá ainda: a descrição pode estar escrita de um jeito que o parser de família não reconhece, e
// deixar o Omie baixar aço é exatamente o erro que estamos tirando.
const RX_ACO = /\b(perfil|chapa|tubo|barra|cantoneira|viga|trilho|telha|grade)\b|^\s*(w|hp|ch|l|u|i|fc|tb|fr|br)\s*\d/i;

let cache = { familias: null, em: 0 };
const TTL = 10 * 60 * 1000;

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
export const familiaMaterial = (s) => norm(s).split(/[\s.,\-(]/).filter(Boolean).slice(0, 2).join(" ");

/** Famílias de material que o CMR já recebeu alguma vez (cache de 10 min). */
export async function familiasDoCmr() {
  if (cache.familias && Date.now() - cache.em < TTL) return cache.familias;
  const linhas = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL" },
    select: { nome: true },
  });
  const set = new Set(linhas.map((l) => familiaMaterial(l.nome)).filter(Boolean));
  cache = { familias: set, em: Date.now() };
  return set;
}

/**
 * O Omie pode lançar o recebimento deste item?
 * Só quando o CMR nunca viu nada parecido E o item não tem cara de aço.
 */
export async function omiePodeBaixar(descricao) {
  const d = String(descricao || "").trim();
  if (!d) return false;
  if (RX_ACO.test(d)) return false;              // aço é do CMR, ponto
  const fams = await familiasDoCmr();
  return !fams.has(familiaMaterial(d));
}
