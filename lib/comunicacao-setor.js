// Matriz de comunicação por setor: quem recebe (e-mail) as tarefas de cada setor.
// Fonte única usada pela distribuição de tarefas e pelo aviso de conclusão.
import { prisma } from "@/lib/prisma";

export const SETORES_COMUNICACAO = [
  "PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL",
  "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO",
];

export const SETOR_LABEL = {
  PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP", EXPEDICAO: "Expedição",
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras",
  ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", PLANEJAMENTO: "Planejamento",
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
