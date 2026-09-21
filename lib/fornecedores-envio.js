// Monta a lista de fornecedores do envio de cotação a partir das duas origens
// (Vendor List + avulsos digitados na hora), deduplicando por e-mail e validando
// os avulsos. Pura — não toca em estado nem em rede. Usada pelo modal da RM e
// pelo envio consolidado do painel de Compras: uma regra só, para os dois
// caminhos falharem (e explicarem) do mesmo jeito.
//
// Retorna { fornecedores } ou { error } com a mensagem pronta pra tela.
//
// ⚠⚠ A VENDOR LIST NÃO GARANTE E-MAIL. A importação do Omie (25/08/2026) trouxe
// 435 cadastros ativos SEM e-mail e 10 com DOIS e-mails no mesmo campo
// ("a@x.com,b@y.com"), medido em 21/09/2026. Foi assim que "não estamos
// conseguindo enviar a cotação": marcar a GERDAU ACOS LONGOS (sem e-mail)
// derrubava o clique num `null.toLowerCase()` fora do try — a tela não dizia
// nada — e marcar a ARCELORMITTAL (dois e-mails) tomava 400 do servidor com o
// despejo JSON do Zod. Daí `emailPrincipal` e o erro com o NOME do fornecedor.

const RX_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * O e-mail utilizável de um campo que pode vir vazio, com espaços ou com vários
 * endereços separados por vírgula/ponto-e-vírgula (jeito do Omie). Devolve o
 * PRIMEIRO válido, minúsculo — ou null. Nunca lança.
 * @param {string|null|undefined} texto
 * @returns {string|null}
 */
export function emailPrincipal(texto) {
  return separarEmails(texto)[0] || null;
}

/**
 * Todos os e-mails válidos de um campo "a@x.com, b@y.com; c@z.com", minúsculos,
 * sem repetição e na ordem em que vieram. É o que a importação do Omie usa para
 * pôr o primeiro em `email` e os demais em `emailsAdicionais`.
 * @param {string|null|undefined} texto
 * @returns {string[]}
 */
export function separarEmails(texto) {
  const partes = String(texto ?? "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return [...new Set(partes.filter((e) => RX_EMAIL.test(e)))];
}

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
    const email = emailPrincipal(f.email);
    if (!email) {
      // ⚠ Erro com nome, não exceção: quem clicou precisa saber QUAL cadastro
      // consertar (ou digitar o fornecedor como avulso, logo abaixo na tela).
      return { error: `${f.razaoSocial} está sem e-mail no cadastro. Informe o e-mail na lista (ou digite o fornecedor como avulso) antes de enviar.` };
    }
    if (emailsVistos.has(email)) continue;
    emailsVistos.add(email);
    out.push({ fornecedorId: f.id, nome: f.razaoSocial, email, nCodOmie: f.nCodOmie || null, cnpj: f.cnpj || null });
  }
  // 2) Avulsos
  for (const f of fornecedoresLinhas) {
    const email = String(f.email || "").trim().toLowerCase();
    const nome = String(f.nome || "").trim();
    if (!email && !nome) continue;
    if (!RX_EMAIL.test(email)) {
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
