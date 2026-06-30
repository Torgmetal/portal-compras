// POST /api/rh/funcionarios/reconciliar/preparar  (multipart: file, file2…)
// Lê as planilhas de fechamento, casa os ativos com o cadastro do portal e
// devolve um comparativo campo a campo (portal × planilha) com a ação sugerida.
// NÃO grava nada. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parsePlanilhaFolha, normalizar, soDigitos } from "@/lib/folha-planilha";

export const runtime = "nodejs";
export const maxDuration = 60;

// Campos reconciliáveis: os que o RH pediu (nome, CPF, e-mail, empresa) + centro
// de custo. Nascimento ficou de fora de propósito — a planilha tem datas com
// dia/mês ambíguos e não vale o risco de trocar data certa por errada.
const CAMPOS = ["nome", "cpf", "email", "empresa", "centroCusto"];

const valPortal = (f, campo) => {
  if (campo === "dataNascimento") return f.dataNascimento ? new Date(f.dataNascimento).toISOString().slice(0, 10) : "";
  if (campo === "cpf") return soDigitos(f.cpf);
  return f[campo] == null ? "" : String(f[campo]).trim();
};
const valPlanilha = (r, campo) => {
  if (campo === "cpf") return soDigitos(r.cpf);
  return r[campo] == null ? "" : String(r[campo]).trim();
};
const igual = (campo, a, b) => {
  if (campo === "cpf") return soDigitos(a) === soDigitos(b);
  if (campo === "email") return a.toLowerCase().trim() === b.toLowerCase().trim();
  // Empresa: compara o 1º token p/ tolerar "TORG" × "TORG Metal", "VMI" × "VMI Montagens".
  if (campo === "empresa") return normalizar(a).split(" ")[0] === normalizar(b).split(" ")[0];
  return normalizar(a) === normalizar(b);
};

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ success: false, error: "Envie a(s) planilha(s)" }, { status: 400 }); }
  const arquivos = form.getAll("file").filter((f) => f && typeof f.arrayBuffer === "function");
  if (arquivos.length === 0) return NextResponse.json({ success: false, error: "Nenhuma planilha enviada" }, { status: 400 });

  // Parse de todas as planilhas
  const registros = [];
  const empresas = new Set();
  for (const arq of arquivos) {
    try {
      const buf = Buffer.from(await arq.arrayBuffer());
      const { empresaGuess, registros: regs } = parsePlanilhaFolha(buf);
      if (empresaGuess) empresas.add(empresaGuess);
      registros.push(...regs);
    } catch (e) {
      return NextResponse.json({ success: false, error: `Falha ao ler ${arq.name}: ${e.message}` }, { status: 422 });
    }
  }

  // Cadastro atual do portal
  const funcs = await prisma.funcionario.findMany({
    select: {
      id: true, nome: true, cpf: true, email: true, empresa: true, centroCusto: true,
      matricula: true, dataNascimento: true, ativo: true,
    },
  });
  // Match SÓ por CPF (forte) e nome (fraco). NÃO casar por matrícula: a matrícula
  // do portal não corresponde ao ID da planilha (numerações distintas) — casaria
  // pessoas erradas e sobrescreveria dados.
  const porCpf = new Map();
  for (const f of funcs) {
    const d = soDigitos(f.cpf);
    if (d) porCpf.set(d, f);
  }

  const itens = [];
  const novos = [];
  for (const r of registros) {
    // Match: CPF (forte) → nome exato normalizado (fraco)
    let f = null, matchPor = null, confianca = "alta";
    const cpf = soDigitos(r.cpf);
    if (cpf && porCpf.has(cpf)) { f = porCpf.get(cpf); matchPor = "CPF"; }
    else {
      const alvo = normalizar(r.nome);
      f = funcs.find((x) => normalizar(x.nome) === alvo) || null;
      if (f) { matchPor = "nome"; confianca = "baixa"; }
    }

    if (!f) { novos.push({ nome: r.nome, cpf: r.cpf, cnpj: r.cnpj, empresa: r.empresa, tipoContrato: r.tipoContrato, centroCusto: r.centroCusto }); continue; }

    const campos = [];
    for (const campo of CAMPOS) {
      const pv = valPortal(f, campo);
      const sv = valPlanilha(r, campo);
      if (!sv) continue; // planilha não tem o dado → nada a sugerir
      if (igual(campo, pv, sv)) continue; // já igual
      campos.push({ campo, portal: pv, planilha: sv, acao: pv ? "corrigir" : "preencher" });
    }
    if (campos.length === 0) continue; // tudo OK, não mostra
    itens.push({
      funcionarioId: f.id, portalNome: f.nome, planilhaNome: r.nome,
      matchPor, confianca, empresa: r.empresa, tipoContrato: r.tipoContrato, ativo: f.ativo, campos,
    });
  }

  return NextResponse.json({
    success: true,
    empresas: [...empresas],
    totalPlanilha: registros.length,
    itens,
    novos,
    resumo: {
      comDivergencia: itens.length,
      novos: novos.length,
      preencher: itens.reduce((s, i) => s + i.campos.filter((c) => c.acao === "preencher").length, 0),
      corrigir: itens.reduce((s, i) => s + i.campos.filter((c) => c.acao === "corrigir").length, 0),
    },
  });
}
