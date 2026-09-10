// Análise Crítica de Projeto (PO-13) — regras e formato do registro.
//
// Vitor (10/09/2026): "temos o FORM 08, porém acho ele meio raso, precisamos fazer uma análise
// mais profunda e de verdade (…) na pasta da OP, na aba de Engenharia, para não ficar alguma
// coisa a mais". O registro vive na OP (aba Engenharia), um por OP, e o FORM 08 sai DELE.
//
// Sete blocos, cada um uma lista de linhas com `id`. De onde vem cada bloco:
//   1 entradas     PO-13 §5.2 e Nota 1 (suficiência, ambiguidade, regulamentares) + campo "Entradas" do FORM 08
//   2 requisitos   PO-13 Nota 1 e Nota 2 (a)
//   3 areas        PO-13 §5.3 — as áreas que o procedimento chama para a reunião
//   4 riscos       FORM 06 "Análise de Risco e Ações" Rev.01 (probabilidade × impacto, 1–4)
//   5 saidas       PO-13 Nota 2 e §5.5 — as linhas do FORM 08, com revisão/quem/quando
//   6 comentarios  PO-13 Nota 3 (cliente) e §5.7 (alterações)
//   7 reunioes     PO-13 §5.3 (FORM 10) · acoes → 5W2H
// Os blocos são JSON de propósito: o formato ainda muda com o uso ("vamos vendo como será no
// dia a dia"). Nada aqui toca o banco.
import { z } from "zod";
import { pesoRealPecas } from "@/lib/peso-op";

export const STATUS_REGISTRO = {
  EM_ANALISE: { label: "Em análise", cls: "bg-amber-50 text-amber-700" },
  VERIFICADA: { label: "Verificada", cls: "bg-torg-blue-50 text-torg-blue" },
  APROVADA: { label: "Aprovada", cls: "bg-emerald-50 text-emerald-700" },
};

// situação de uma linha (mesma escala em todos os blocos, para o resumo fechar)
export const SITUACOES = {
  OK: { label: "OK", cls: "bg-emerald-50 text-emerald-700" },
  ATENCAO: { label: "Atenção", cls: "bg-amber-50 text-amber-700" },
  PENDENTE: { label: "Pendente", cls: "bg-amber-50 text-amber-700" },
  CONFLITO: { label: "Conflito", cls: "bg-red-50 text-red-700" },
  BLOQUEADO: { label: "Bloqueado", cls: "bg-gray-100 text-torg-gray" },
  NA: { label: "Não se aplica", cls: "bg-gray-100 text-torg-gray" },
};
export const SITUACAO_ACAO = {
  A_FAZER: { label: "A fazer", cls: "bg-gray-100 text-torg-gray" },
  EM_CURSO: { label: "Em curso", cls: "bg-amber-50 text-amber-700" },
  CONCLUIDA: { label: "Concluída", cls: "bg-emerald-50 text-emerald-700" },
};

// As áreas do PO-13 §5.3 e o procedimento que cada uma aplica. Vem pré-criado no registro.
export const AREAS_PADRAO = [
  { area: "Cálculo e estabilidade", setor: "Engenharia", procedimento: "Memorial de cálculo" },
  { area: "Fabricação", setor: "Produção", procedimento: "PO-02 · PO-04" },
  { area: "Transporte e embalagem", setor: "Expedição", procedimento: "PO-08" },
  { area: "Compras e prazos", setor: "Compras · PCP", procedimento: "PO-10" },
  { area: "Pintura e acabamento", setor: "Qualidade", procedimento: "PO-05 · PLP" },
  { area: "Inspeção e Data Book", setor: "Qualidade", procedimento: "PIT" },
  { area: "Montagem", setor: "Comercial · Cliente", procedimento: "Diagrama de montagem" },
];

// As saídas do FORM 08 R1, na ordem do formulário. Vem pré-criado; o que não se aplica marca NA.
export const SAIDAS_PADRAO = [
  "Análise da proposta enviada", "Lista de matéria-prima", "Área de pintura", "Lista de fixadores da estrutura metálica",
  "Lista de telhas, calhas e rufos", "Lista de fixadores e selantes", "Lista de grade de pisos e degraus", "Lista de lanternim e domus",
  "Lista de material para linha de vida", "Lista de steel deck", "Lista de painel wall", "Desenhos de locação de bases",
  "Projeto executivo", "Desenhos de fabricação", "Diagramas de montagem da estrutura", "Diagrama de montagem de linha de vida",
  "Paginação de cobertura", "Paginação de pisos", "Memoriais de cálculo", "Envio de documentos para o Data Book",
];

export const ENTRADAS_PADRAO = [
  "Ordem de Produção / Proposta Técnica Comercial", "Documentação do cliente / equalização técnica",
  "Requisitos regulamentares e estatutários (normas)", "Projetos similares", "Aditivos",
];

const novoId = () => Math.random().toString(36).slice(2, 10);

/** Registro novo, já com as linhas fixas do PO-13 e do FORM 08. */
export function registroInicial() {
  return {
    entradas: ENTRADAS_PADRAO.map((documento) => ({ id: novoId(), documento, revisao: "", analisadoPor: "", data: "", achado: "", situacao: "PENDENTE" })),
    requisitos: [],
    areas: AREAS_PADRAO.map((a) => ({ id: novoId(), ...a, responsavel: "", parecer: "", situacao: "PENDENTE" })),
    riscos: [],
    saidas: SAIDAS_PADRAO.map((documento) => ({ id: novoId(), documento, revisao: "", verificacao: "", verificadoPor: "", data: "", situacao: "PENDENTE" })),
    comentarios: [],
    reunioes: [],
    acoes: [],
  };
}

// ─── validação do que a tela manda (PUT) ────────────────────────────────────
const s = (max) => z.string().max(max).optional().default("");
const situacao = z.enum(Object.keys(SITUACOES)).optional().default("PENDENTE");
const linha = (campos) => z.array(z.object({ id: z.string().min(1).max(24), ...campos }).passthrough()).max(400);
export const registroSchema = z.object({
  entradas: linha({ documento: z.string().min(1).max(200), revisao: s(40), analisadoPor: s(80), data: s(10), achado: s(1000), situacao }),
  requisitos: linha({ codigo: s(12), requisito: z.string().min(1).max(300), origem: s(120), evidencia: s(600), dono: s(80), situacao }),
  areas: linha({ area: z.string().min(1).max(80), setor: s(80), procedimento: s(80), responsavel: s(80), parecer: s(1000), situacao }),
  riscos: linha({ risco: z.string().min(1).max(300), probabilidade: z.number().int().min(1).max(4), impacto: z.number().int().min(1).max(4), tratativa: s(600), acaoId: s(24) }),
  saidas: linha({ documento: z.string().min(1).max(200), revisao: s(40), verificacao: s(600), verificadoPor: s(80), data: s(10), situacao }),
  comentarios: linha({ data: s(10), origem: s(120), texto: z.string().min(1).max(600), analise: s(600), impacto: s(200), situacao }),
  reunioes: linha({ codigo: s(12), data: s(10), participantes: s(400), pauta: s(1000), decisoes: s(1500), ataAceita: z.boolean().optional().default(false) }),
  acoes: linha({ codigo: s(12), acao: z.string().min(1).max(300), quem: s(80), quando: s(10), situacao: z.enum(Object.keys(SITUACAO_ACAO)).optional().default("A_FAZER") }),
  responsavelNome: s(120),
});

// ─── verificações que o portal faz sozinho ──────────────────────────────────
// Cada uma diz o que comparou e de onde veio; sem dado, diz que não tem dado — não inventa OK.
const kg = (v) => `${Math.round(v).toLocaleString("pt-BR")} kg`;
const pct = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(1).replace(".", ",")} %` : "—");

/** Peso contratado em kg: itens em KG que não são parafusos (o item de parafusos usa o peso da estrutura só como base de preço). */
export function pesoContratado(itens = []) {
  return itens
    .filter((i) => String(i.unidade || "").toUpperCase() === "KG" && i.categoria !== "PARAFUSOS")
    .reduce((t, i) => t + (Number(i.qtdContratada) || 0), 0);
}

export function verificacoesAutomaticas({ itens = [], pecas = [] } = {}) {
  const out = [];
  // 1) Lista de Expedição × contrato
  const contrato = pesoContratado(itens), le = pecas.filter((p) => p.fonte === "LE_IMPORT");
  const pesoLE = pesoRealPecas(le);
  if (!le.length) out.push({ chave: "le_contrato", titulo: "Lista de Expedição × peso contratado", resultado: "Lista de Expedição ainda não importada no portal.", situacao: "BLOQUEADO", fonte: "Engenharia › Listas" });
  else if (!contrato) out.push({ chave: "le_contrato", titulo: "Lista de Expedição × peso contratado", resultado: `LE ${kg(pesoLE)} em ${le.length} marcas; a OP não tem item em kg para comparar.`, situacao: "ATENCAO", fonte: "OP › itens" });
  else {
    const razao = pesoLE / contrato;
    out.push({ chave: "le_contrato", titulo: "Lista de Expedição × peso contratado", resultado: `LE ${kg(pesoLE)} (${le.length} marcas) × contrato ${kg(contrato)} = ${pct(pesoLE, contrato)}`,
      situacao: razao >= 0.97 && razao <= 1.03 ? "OK" : razao > 1.03 ? "CONFLITO" : "ATENCAO", fonte: "LE do portal · itens da OP" });
  }
  // 2) LPC × LE — o LPC (fabricação) cobre a estrutura da LE?
  const lpc = pecas.filter((p) => p.fonte !== "LE_IMPORT" && p.tipoPeca !== "CROQUI");
  const pesoLPC = lpc.reduce((t, p) => t + (Number(p.pesoTotalKg) || 0), 0);
  if (!lpc.length) out.push({ chave: "lpc_le", titulo: "Lista de peças (LPC) × Lista de Expedição", resultado: "LPC ainda não importado.", situacao: "BLOQUEADO", fonte: "Engenharia › Listas" });
  else if (!le.length) out.push({ chave: "lpc_le", titulo: "Lista de peças (LPC) × Lista de Expedição", resultado: `LPC ${kg(pesoLPC)}; sem LE para comparar.`, situacao: "ATENCAO", fonte: "Engenharia › Listas" });
  else { const razao = pesoLPC / (pesoLE || 1); out.push({ chave: "lpc_le", titulo: "Lista de peças (LPC) × Lista de Expedição", resultado: `LPC ${kg(pesoLPC)} × LE ${kg(pesoLE)} = ${pct(pesoLPC, pesoLE)}`, situacao: razao >= 0.95 && razao <= 1.05 ? "OK" : "ATENCAO", fonte: "Engenharia › Listas" }); }
  // 3) Área de pintura × orçado
  const tinta = itens.filter((i) => i.categoria === "TINTA" && /M/i.test(String(i.unidade || ""))).reduce((t, i) => t + (Number(i.qtdContratada) || 0), 0);
  const areaPecas = pecas.reduce((t, p) => t + (Number(p.areaPinturaM2) || 0), 0);
  if (!tinta) out.push({ chave: "pintura", titulo: "Área de pintura × orçado", resultado: "OP sem item de pintura em m².", situacao: "NA", fonte: "OP › itens" });
  else if (!areaPecas) out.push({ chave: "pintura", titulo: "Área de pintura × orçado", resultado: `Orçado ${tinta.toLocaleString("pt-BR")} m²; as listas ainda não trazem área por peça.`, situacao: "BLOQUEADO", fonte: "Engenharia › Listas" });
  else { const razao = areaPecas / tinta; out.push({ chave: "pintura", titulo: "Área de pintura × orçado", resultado: `Listas ${Math.round(areaPecas).toLocaleString("pt-BR")} m² × orçado ${tinta.toLocaleString("pt-BR")} m² = ${pct(areaPecas, tinta)}`, situacao: razao <= 1.03 ? "OK" : razao <= 1.1 ? "ATENCAO" : "CONFLITO", fonte: "Engenharia › Listas · OP › itens" }); }
  // 4) Gabarito de transporte (carreta 12,4 m; 12,4–14 m só na carreta especial; > 14 m transporte especial)
  const comComp = pecas.filter((p) => Number(p.comprimentoMm) > 0);
  if (!comComp.length) out.push({ chave: "transporte", titulo: "Peças fora do gabarito de transporte", resultado: "As listas não trazem comprimento por peça; usar a prévia de carga.", situacao: "BLOQUEADO", fonte: "Expedição › prévia de carga" });
  else {
    const longas = comComp.filter((p) => Number(p.comprimentoMm) > 12400), especiais = comComp.filter((p) => Number(p.comprimentoMm) > 14000);
    out.push({ chave: "transporte", titulo: "Peças fora do gabarito de transporte", resultado: `${longas.length} marca(s) acima de 12,4 m${especiais.length ? `, ${especiais.length} acima de 14 m (transporte especial)` : ""}${longas.length ? ": " + longas.slice(0, 6).map((p) => p.marca).join(", ") : ""}`, situacao: especiais.length ? "CONFLITO" : longas.length ? "ATENCAO" : "OK", fonte: "Engenharia › Listas" });
  }
  return out;
}

// ─── resumo para a faixa de KPIs e para o PDF ───────────────────────────────
export const nivelRisco = (r) => (Number(r.probabilidade) || 0) * (Number(r.impacto) || 0);
export function resumo(reg) {
  const conta = (lista, f) => (lista || []).filter(f).length;
  const entradas = reg.entradas || [], requisitos = reg.requisitos || [], saidas = reg.saidas || [], riscos = reg.riscos || [], acoes = reg.acoes || [];
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    entradas: { total: entradas.length, ok: conta(entradas, (e) => e.situacao === "OK"), conflito: conta(entradas, (e) => e.situacao === "CONFLITO") },
    requisitos: { total: requisitos.length, ok: conta(requisitos, (r) => r.situacao === "OK"), pendentes: conta(requisitos, (r) => r.situacao === "PENDENTE" || r.situacao === "ATENCAO"), conflito: conta(requisitos, (r) => r.situacao === "CONFLITO") },
    saidas: { total: conta(saidas, (x) => x.situacao !== "NA"), ok: conta(saidas, (x) => x.situacao === "OK") },
    riscos: { total: riscos.length, altos: conta(riscos, (r) => nivelRisco(r) >= 9), medios: conta(riscos, (r) => nivelRisco(r) >= 4 && nivelRisco(r) < 9) },
    acoes: { total: acoes.length, atrasadas: conta(acoes, (a) => a.situacao !== "CONCLUIDA" && a.quando && a.quando < hoje), abertas: conta(acoes, (a) => a.situacao !== "CONCLUIDA") },
  };
}
