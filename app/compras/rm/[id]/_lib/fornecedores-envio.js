// Monta a lista de fornecedores do envio de cotacao a partir das duas origens
// (Vendor List + avulsos digitados na hora), deduplicando por email e validando
// os avulsos. Pura — nao toca em estado nem em rede.
//
// Retorna { fornecedores } ou { error } com a mensagem pronta pra tela.
export function montarFornecedoresEnvio({
  fornSelecionadosIds,
  fornecedoresCadastrados,
  fornecedoresLinhas,
}) {
  const out = [];
  const emailsVistos = new Set();
  // 1) Da Vendor List
  for (const id of fornSelecionadosIds) {
    const f = fornecedoresCadastrados.find((x) => x.id === id);
    if (!f) continue;
    const email = f.email.toLowerCase();
    if (emailsVistos.has(email)) continue;
    emailsVistos.add(email);
    out.push({ fornecedorId: f.id, nome: f.razaoSocial, email, nCodOmie: f.nCodOmie || null, cnpj: f.cnpj || null });
  }
  // 2) Avulsos
  for (const f of fornecedoresLinhas) {
    const email = String(f.email || "").trim().toLowerCase();
    const nome = String(f.nome || "").trim();
    if (!email && !nome) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: `Email inválido: "${email || "(em branco)"}"${nome ? ` — fornecedor "${nome}"` : ""}` };
    }
    if (!nome) {
      return { error: `Preencha o nome do fornecedor pro email "${email}"` };
    }
    if (emailsVistos.has(email)) continue;
    emailsVistos.add(email);
    out.push({ nome, email });
  }
  return { fornecedores: out };
}
