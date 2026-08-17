// Calcula o MATERIAL que deve ser enviado ao terceiro (2º romaneio, pra NF de retorno), agrupado
// por PERFIL. Só faz sentido saindo da Preparação (Corte) ou da Montagem — da Solda em diante
// manda-se o conjunto pronto (só o romaneio de peças). Regra do Vitor.
//   • CORTE     → as próprias peças selecionadas (croquis/avulsas) são o material a cortar.
//   • MONTAGEM  → expande cada conjunto nos seus croquis (× qtdNoConjunto × qtd do conjunto).
// Retorna [{ perfil, descricao(material), qtd, pesoKg }].
import { prisma } from "./prisma";

export async function computarMateriaisEnvio({ pecaIds, setorEnvio }) {
  const setor = String(setorEnvio || "").toUpperCase();
  if (!Array.isArray(pecaIds) || !pecaIds.length) return [];
  if (setor !== "CORTE" && setor !== "MONTAGEM") return [];

  const grupos = new Map(); // perfil(normalizado) → { perfil, descricao, qtd, pesoKg }
  const add = (perfil, material, qtd, pesoKg) => {
    if (!(qtd > 0)) return;
    const key = String(perfil || "SEM PERFIL").trim().toUpperCase();
    const g = grupos.get(key) || { perfil: perfil || "—", descricao: material || null, qtd: 0, pesoKg: 0 };
    g.qtd += qtd; g.pesoKg += pesoKg;
    if (!g.descricao && material) g.descricao = material;
    grupos.set(key, g);
  };

  if (setor === "CORTE") {
    const pecas = await prisma.pecaConjunto.findMany({ where: { id: { in: pecaIds } }, select: { perfil: true, material: true, qte: true, pesoUnitKg: true, pesoTotalKg: true } });
    for (const p of pecas) {
      const qtd = Number(p.qte) || 0;
      const peso = Number(p.pesoTotalKg) || qtd * (Number(p.pesoUnitKg) || 0);
      add(p.perfil, p.material, qtd, peso);
    }
  } else {
    // MONTAGEM
    const conjuntos = await prisma.pecaConjunto.findMany({ where: { id: { in: pecaIds } }, select: { id: true, qte: true } });
    const qteConj = new Map(conjuntos.map((c) => [c.id, Number(c.qte) || 1]));
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjuntoId: { in: pecaIds } },
      select: { conjuntoId: true, qtdNoConjunto: true, croqui: { select: { perfil: true, material: true, pesoUnitKg: true } } },
    });
    for (const lk of links) {
      const cr = lk.croqui;
      const qtd = (qteConj.get(lk.conjuntoId) || 1) * (Number(lk.qtdNoConjunto) || 1);
      add(cr?.perfil, cr?.material, qtd, qtd * (Number(cr?.pesoUnitKg) || 0));
    }
  }

  return [...grupos.values()]
    .map((g) => ({ perfil: g.perfil, descricao: g.descricao, qtd: Math.round(g.qtd), pesoKg: Math.round(g.pesoKg * 100) / 100 }))
    .sort((a, b) => b.pesoKg - a.pesoKg);
}
