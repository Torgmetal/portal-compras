// CONTATOS POR SETOR — quem recebe e-mail do portal em nome de cada setor.
//
// ⚠⚠ FONTE ÚNICA. Até 25/08/2026 havia DUAS listas para a mesma coisa: esta (editável em tela) e
// `lib/contatos-tarefas.js` (fixa no código). Elas já discordavam — Gabriel (engenharia3@) era PCP
// numa e Engenharia na outra; Larissa (pcp@) era Planejamento numa e PCP na outra. Quem recebia um
// aviso destinado ao "PCP" dependia de qual fluxo tinha disparado, e ninguém via isso.
//
// Vitor (25/08/2026): "vamos criar essa função no painel do adm, assim se entrar ou sair pessoas
// conseguimos editar com mais facilidade". Editar contato deixa de exigir deploy.
import { prisma } from "@/lib/prisma";

export const SETORES_COMUNICACAO = [
  "PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL",
  "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO",
  // ⚠ QUALIDADE e DIRETORIA vieram da lista fixa: existiam só no código, e sem elas a unificação
  // apagaria o Geraldo dos avisos e a direção da cópia de cobrança.
  "QUALIDADE", "DIRETORIA",
];

export const SETOR_LABEL = {
  PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP", EXPEDICAO: "Expedição",
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras",
  ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", PLANEJAMENTO: "Planejamento",
  QUALIDADE: "Qualidade", DIRETORIA: "Diretoria",
};

// normaliza/valida uma lista de contatos [{ nome, email }]
export function normalizarContatos(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  const vistos = new Set();
  for (const c of lista) {
    const email = String(c?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (vistos.has(email)) continue;
    vistos.add(email);
    out.push({ nome: String(c?.nome || "").trim().slice(0, 120), email });
    if (out.length >= 30) break;
  }
  return out;
}

// retorna os contatos [{nome,email}] de um setor (vazio se não configurado/inativo)
export async function getContatosSetor(setor) {
  if (!SETORES_COMUNICACAO.includes(setor)) return [];
  const reg = await prisma.comunicacaoSetor.findUnique({ where: { setor } });
  if (!reg || !reg.ativo) return [];
  return normalizarContatos(reg.contatos);
}

// só os e-mails de um setor
export async function getEmailsSetor(setor) {
  return (await getContatosSetor(setor)).map((c) => c.email);
}

// mapa completo { setor: [{nome,email}] } para todos os setores (UI)
export async function getMatrizCompleta() {
  const regs = await prisma.comunicacaoSetor.findMany();
  const porSetor = new Map(regs.map((r) => [r.setor, r]));
  const matriz = {};
  for (const setor of SETORES_COMUNICACAO) {
    const r = porSetor.get(setor);
    matriz[setor] = { contatos: r ? normalizarContatos(r.contatos) : [], ativo: r ? r.ativo : true };
  }
  return matriz;
}

/**
 * A matriz no formato que os modais de envio esperam: [{ area, setor, contatos[] }].
 * Setor sem contato NÃO entra — área vazia no modal é ruído.
 * @param {string[]} [apenas] restringe a estes setores, na ordem pedida
 */
export async function getAreasContatos(apenas) {
  const regs = await prisma.comunicacaoSetor.findMany({ where: { ativo: true } });
  const porSetor = new Map(regs.map((r) => [r.setor, r]));
  const ordem = apenas?.length ? apenas.filter((s) => SETORES_COMUNICACAO.includes(s)) : SETORES_COMUNICACAO;
  const out = [];
  for (const setor of ordem) {
    const contatos = normalizarContatos(porSetor.get(setor)?.contatos);
    if (contatos.length) out.push({ area: SETOR_LABEL[setor] || setor, setor, contatos });
  }
  return out;
}
