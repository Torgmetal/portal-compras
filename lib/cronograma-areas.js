// Gestão das Áreas do cronograma (Cronograma.areas = [{nome, cor}]).
// A COR é fixa por área (índice da paleta) — renomear mantém a cor; a mesma área
// tem a mesma cor em todos os setores. Funções recebem `prisma` (testáveis).
import { normArea, proximaCorArea } from "@/lib/cronograma-area-cor";

// Garante que a área está cadastrada (com cor fixa). Idempotente. Devolve a lista.
export async function registrarArea(prisma, cronogramaId, nome) {
  const key = normArea(nome);
  if (!key) return null;
  const c = await prisma.cronograma.findUnique({ where: { id: cronogramaId }, select: { areas: true } });
  if (!c) return null;
  const areas = Array.isArray(c.areas) ? c.areas : [];
  if (areas.some((a) => normArea(a?.nome) === key)) return areas; // já existe → não mexe na cor
  const nova = [...areas, { nome: String(nome).trim(), cor: proximaCorArea(areas) }];
  await prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas: nova } });
  return nova;
}

// Define a lista de áreas (criação / gestão em bloco). Cores por ordem, sem duplicar nome.
export async function definirAreas(prisma, cronogramaId, nomes) {
  const vistos = new Set();
  const lista = [];
  for (const n of Array.isArray(nomes) ? nomes : []) {
    const nome = String(n || "").trim();
    const key = normArea(nome);
    if (!nome || vistos.has(key)) continue;
    vistos.add(key);
    lista.push({ nome, cor: lista.length % 10 });
  }
  await prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas: lista } });
  return lista;
}

// Troca a cor de uma área (cadastra se ainda não existir).
export async function recolorArea(prisma, cronogramaId, nome, cor) {
  const key = normArea(nome);
  const idx = Number(cor);
  if (!key || !Number.isInteger(idx)) return null;
  const corOk = ((idx % 10) + 10) % 10;
  const c = await prisma.cronograma.findUnique({ where: { id: cronogramaId }, select: { areas: true } });
  const areas = Array.isArray(c?.areas) ? c.areas : [];
  const i = areas.findIndex((a) => normArea(a?.nome) === key);
  const nova = i >= 0
    ? areas.map((a, k) => (k === i ? { ...a, cor: corOk } : a))
    : [...areas, { nome: String(nome).trim(), cor: corOk }];
  await prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas: nova } });
  return nova;
}

// Cadastra (com cores DISTINTAS) todas as áreas em uso nas tarefas que ainda não
// estão na lista. Idempotente — não mexe nas já cadastradas. Corrige cor repetida.
export async function sincronizarAreas(prisma, cronogramaId) {
  const c = await prisma.cronograma.findUnique({ where: { id: cronogramaId }, select: { areas: true } });
  const areas = Array.isArray(c?.areas) ? [...c.areas] : [];
  const vistos = new Set(areas.map((a) => normArea(a?.nome)));
  const tarefas = await prisma.cronogramaTarefa.findMany({ where: { cronogramaId, area: { not: null } }, select: { area: true } });
  const registradas = [];
  for (const t of tarefas) {
    const nome = String(t.area || "").trim();
    const key = normArea(nome);
    if (!key || vistos.has(key)) continue;
    vistos.add(key);
    areas.push({ nome, cor: proximaCorArea(areas) }); // próxima cor livre → distinta
    registradas.push(nome);
  }
  if (registradas.length) await prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas } });
  return { areas, registradas: registradas.length };
}

// Renomeia uma área: MANTÉM a cor (identidade) e atualiza o nome nas tarefas.
export async function renomearArea(prisma, cronogramaId, de, para) {
  const keyDe = normArea(de);
  const nomePara = String(para || "").trim();
  const keyPara = normArea(nomePara);
  if (!keyDe || !nomePara || keyDe === keyPara) return { atualizadas: 0 };

  const c = await prisma.cronograma.findUnique({ where: { id: cronogramaId }, select: { areas: true } });
  const areas = Array.isArray(c?.areas) ? c.areas : [];
  const idx = areas.findIndex((a) => normArea(a?.nome) === keyDe);
  const existeDestino = areas.some((a, i) => i !== idx && normArea(a?.nome) === keyPara);
  let novaAreas = areas;
  if (idx >= 0) {
    // Se o destino já existe, funde (some a antiga, mantém a cor do destino);
    // senão renomeia a entry mantendo a MESMA cor.
    novaAreas = existeDestino
      ? areas.filter((_, i) => i !== idx)
      : areas.map((a, i) => (i === idx ? { ...a, nome: nomePara } : a));
  } else if (!existeDestino) {
    // Área antiga não estava cadastrada: registra o novo nome com cor livre.
    novaAreas = [...areas, { nome: nomePara, cor: proximaCorArea(areas) }];
  }

  const tarefas = await prisma.cronogramaTarefa.findMany({ where: { cronogramaId }, select: { id: true, area: true } });
  const alvo = tarefas.filter((t) => normArea(t.area) === keyDe);

  await prisma.$transaction([
    prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas: novaAreas } }),
    ...alvo.map((t) => prisma.cronogramaTarefa.update({ where: { id: t.id }, data: { area: nomePara } })),
  ]);
  return { atualizadas: alvo.length };
}

/**
 * Traz as FASES da OP (lotes de entrega) para as áreas do cronograma.
 *
 * ⚠⚠ POR QUE ISTO EXISTE. Vitor (07/09/2026), depois de criar "Fase 1 - TC 4706", "Fase 2 - TC 4707"
 * etc. na aba Engenharia da OP: "quando criamos essas fases são as que vamos usar no cronograma,
 * correto?" — não eram. `LoteExpedicao` e `Cronograma.areas` eram dois cadastros paralelos que só
 * coincidiam se alguém digitasse o mesmo nome nos dois. Ele então pediu: "precisamos ter isso
 * ligado".
 *
 * ⚠ TRAZ, NÃO SINCRONIZA. A cópia acontece quando alguém manda, não a cada carregamento. Sincronia
 * automática desfaria renomeação feita aqui dentro na primeira vez que a tela abrisse — e o
 * cronograma é documento que vai ao cliente. Quem renomeia aqui está corrigindo de propósito.
 *
 * ⚠ NÃO DUPLICA E NÃO SOBRESCREVE: área que já existe (comparando sem acento e sem caixa) fica como
 * está, com a cor que tem. Só entra o que falta.
 *
 * ⚠ A ORDEM DA FASE VIRA A ORDEM DA COR, para o Gantt do cronograma ler na mesma sequência da
 * prioridade de fabricação — e não por acaso de quem foi cadastrado primeiro.
 *
 * @returns {Promise<{areas: Array, adicionadas: string[], jaExistiam: string[]}>}
 */
export async function importarFasesDaOP(prisma, cronogramaId) {
  const c = await prisma.cronograma.findUnique({
    where: { id: cronogramaId }, select: { areas: true, opId: true },
  });
  if (!c?.opId) return { areas: Array.isArray(c?.areas) ? c.areas : [], adicionadas: [], jaExistiam: [], semOp: true };

  const fases = await prisma.loteExpedicao.findMany({
    where: { opId: c.opId }, select: { nome: true, ordem: true }, orderBy: { ordem: "asc" },
  });
  const areas = Array.isArray(c.areas) ? [...c.areas] : [];
  const tem = new Set(areas.map((a) => normArea(a?.nome)));
  const usados = new Set(areas.map((a) => a?.cor).filter((x) => Number.isInteger(x)));

  const adicionadas = [], jaExistiam = [];
  for (const f of fases) {
    const nome = String(f.nome || "").trim();
    if (!nome) continue;
    if (tem.has(normArea(nome))) { jaExistiam.push(nome); continue; }
    let cor = 0; while (usados.has(cor) && cor < 9) cor++;
    usados.add(cor);
    areas.push({ nome, cor });
    tem.add(normArea(nome));
    adicionadas.push(nome);
  }
  if (adicionadas.length) await prisma.cronograma.update({ where: { id: cronogramaId }, data: { areas } });
  return { areas, adicionadas, jaExistiam };
}
