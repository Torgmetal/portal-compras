// Sincronização do cadastro de fornecedores do Omie (geral/clientes, tag "Fornecedor")
// com a Vendor List do portal (model Fornecedor). Puxa (Omie → portal):
//   - lista todos os fornecedores do Omie (paginado, filtro por tag);
//   - casa com o que já existe no portal por nCodOmie → CNPJ → nome normalizado;
//   - cria os novos e VINCULA (grava nCodOmie) os que já existiam cadastrados na mão,
//     sem sobrescrever o que o time preencheu (e-mail, categorias, observação...).
// Fornecedor sem e-mail no Omie entra com email=null (marcado "falta e-mail" na tela).
import { prisma, prismaDirect } from "@/lib/prisma";
import { titleCaseNome, chaveNormalizacao } from "@/lib/normalizar-nome";
import { omieCall } from "@/lib/omie-call";

const URL_CLIENTES = "https://app.omie.com.br/api/v1/geral/clientes/";
const so = (v) => (v == null ? "" : String(v).trim());
const digitos = (v) => so(v).replace(/\D/g, "");

// Lista TODOS os fornecedores do Omie (tag "Fornecedor"), paginando.
export async function listarFornecedoresOmie() {
  const porPagina = 500;
  const filtro = { pagina: 1, registros_por_pagina: porPagina, apenas_importado_api: "N", clientesFiltro: { tags: [{ tag: "Fornecedor" }] } };
  const p1 = await omieCall(URL_CLIENTES, "ListarClientes", filtro);
  const totalPag = Number(p1.total_de_paginas) || 1;
  let regs = [...(p1.clientes_cadastro || [])];
  for (let pag = 2; pag <= totalPag; pag++) {
    const r = await omieCall(URL_CLIENTES, "ListarClientes", { ...filtro, pagina: pag });
    regs = regs.concat(r.clientes_cadastro || []);
  }
  // Normaliza cada registro para o formato do portal.
  const vistos = new Set();
  const out = [];
  for (const c of regs) {
    const nCod = so(c.codigo_cliente_omie);
    if (!nCod || vistos.has(nCod)) continue; // dedup por código Omie
    vistos.add(nCod);
    const ddd = so(c.telefone1_ddd), num = so(c.telefone1_numero);
    out.push({
      nCodOmie: nCod,
      razaoSocial: so(c.razao_social).toUpperCase(),
      nomeFantasia: so(c.nome_fantasia).toUpperCase() || null,
      cnpj: digitos(c.cnpj_cpf) || null,
      email: so(c.email).toLowerCase() || null,
      telefone: ddd || num ? `${ddd ? `(${ddd}) ` : ""}${num}`.trim() : null,
      contato: so(c.contato) ? titleCaseNome(c.contato) : null,
      cidade: so(c.cidade) ? titleCaseNome(c.cidade) : null,
      uf: so(c.estado).toUpperCase() || null,
      ativo: so(c.inativo).toUpperCase() !== "S",
    });
  }
  return out;
}

/**
 * Sincroniza os fornecedores do Omie para a Vendor List.
 * @param {{ dryRun?: boolean }} opts  dryRun só calcula, não grava.
 * @returns {Promise<{total,novos,vinculados,jaOk,semEmail,inativos,erros}>}
 */
export async function sincronizarFornecedoresOmie({ dryRun = false } = {}) {
  const omie = await listarFornecedoresOmie();

  const existentes = await prisma.fornecedor.findMany({
    select: { id: true, nCodOmie: true, cnpj: true, razaoSocial: true, email: true },
  });
  const porOmie = new Map(), porCnpj = new Map(), porNome = new Map();
  for (const f of existentes) {
    if (f.nCodOmie) porOmie.set(so(f.nCodOmie), f);
    const cj = digitos(f.cnpj);
    if (cj) porCnpj.set(cj, f);
    const ch = chaveNormalizacao(f.razaoSocial || "");
    if (ch && !porNome.has(ch)) porNome.set(ch, f);
  }

  const novos = [];        // criar
  const vincular = [];     // existente sem nCodOmie que casou por CNPJ/nome → gravar nCodOmie
  const jaOk = [];         // existente já com o mesmo nCodOmie → só refresca omieSyncEm
  let semEmail = 0, inativos = 0;

  for (const r of omie) {
    if (!r.email) semEmail++;
    if (!r.ativo) inativos++;
    const match = porOmie.get(r.nCodOmie)
      || (r.cnpj && porCnpj.get(r.cnpj))
      || porNome.get(chaveNormalizacao(r.razaoSocial));
    if (!match) { novos.push(r); continue; }
    if (so(match.nCodOmie) === r.nCodOmie) { jaOk.push({ id: match.id }); continue; }
    if (!match.nCodOmie) { vincular.push({ id: match.id, nCodOmie: r.nCodOmie, faltaEmail: !match.email && !r.email }); }
    else { jaOk.push({ id: match.id }); } // casou por nome/cnpj mas já aponta p/ outro Omie — não mexe
  }

  const resumo = {
    total: omie.length,
    novos: novos.length,
    vinculados: vincular.length,
    jaOk: jaOk.length,
    semEmail,
    inativos,
    erros: [],
  };
  if (dryRun) return resumo;

  const agora = new Date();
  // 1) cria os novos em lotes (createMany gera cuid; prismaDirect evita o pooler).
  for (let i = 0; i < novos.length; i += 200) {
    const lote = novos.slice(i, i + 200).map((r) => ({
      razaoSocial: r.razaoSocial, nomeFantasia: r.nomeFantasia, cnpj: r.cnpj,
      email: r.email, emailsAdicionais: [], telefone: r.telefone, contato: r.contato,
      cidade: r.cidade, uf: r.uf, categorias: [], nCodOmie: r.nCodOmie,
      ativo: r.ativo, omieSyncEm: agora,
    }));
    try { await prismaDirect.fornecedor.createMany({ data: lote, skipDuplicates: true }); }
    catch (e) { resumo.erros.push(`lote novos ${i}: ${e.message}`); }
  }
  // 2) vincula os existentes que casaram por CNPJ/nome (grava nCodOmie, não sobrescreve o resto).
  for (const v of vincular) {
    try { await prismaDirect.fornecedor.update({ where: { id: v.id }, data: { nCodOmie: v.nCodOmie, omieSyncEm: agora } }); }
    catch (e) { resumo.erros.push(`vincular ${v.id}: ${e.message}`); }
  }
  // 3) refresca a marca de sincronização nos que já estavam ok (em lote).
  const idsOk = jaOk.map((x) => x.id);
  for (let i = 0; i < idsOk.length; i += 500) {
    const lote = idsOk.slice(i, i + 500);
    try { await prismaDirect.fornecedor.updateMany({ where: { id: { in: lote } }, data: { omieSyncEm: agora } }); }
    catch (e) { resumo.erros.push(`jaOk ${i}: ${e.message}`); }
  }
  return resumo;
}
