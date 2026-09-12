import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";
const ETAPAS = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

/** Ordem MES identifica a marca por item; opSka é o número da ordem, não a marca. */
export async function producaoDaMarca(opId, marca) {
  const ordens = await prisma.mesOrdem.findMany({
    where: { opId, item: marca },
    select: { setor: true, produzidoUn: true, pesoProduzido: true, dataInicio: true, dataFim: true, updatedAt: true },
  });
  const setores = new Map();
  let atualizadoEm = null;
  for (const o of ordens) {
    const atualizado = o.updatedAt?.toISOString();
    if (atualizado && (!atualizadoEm || atualizado > atualizadoEm)) atualizadoEm = atualizado;
    if (!(o.produzidoUn > 0 || o.pesoProduzido > 0)) continue;
    const normalizado = normalizeSetorSyneco(o.setor);
    const setor = ETAPAS.find(s => normalizeSetorSyneco(s) === normalizado);
    if (!ETAPAS.includes(setor)) continue;
    const g = setores.get(setor) || { setor, un: 0, kg: 0, primeiro: null, ultimo: null };
    g.un += Number(o.produzidoUn) || 0;
    g.kg += Number(o.pesoProduzido) || 0;
    const primeiro = o.dataInicio?.toISOString().slice(0, 10);
    const ultimo = (o.dataFim || o.dataInicio)?.toISOString().slice(0, 10);
    if (primeiro && (!g.primeiro || primeiro < g.primeiro)) g.primeiro = primeiro;
    if (ultimo && (!g.ultimo || ultimo > g.ultimo)) g.ultimo = ultimo;
    setores.set(setor, g);
  }
  const trilha = ETAPAS.filter(s => setores.has(s)).map(s => setores.get(s));
  return { setorAtual: trilha.at(-1)?.setor || null, trilha, fonte: "Ordens de produção do MES", atualizadoEm };
}
