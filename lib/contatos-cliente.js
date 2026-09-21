const emailNormalizado = (valor) => String(valor || "").trim().toLowerCase();

// A matriz é uma agenda de consulta; não seleciona destinatários nem concede acesso.
export function contatoParaEnvioAutomatico(contato) {
  return contato?.apenasConsulta !== true;
}

// Campos de agenda que a tela de contatos edita. Só entram quando VÊM no pedido: quem manda só
// nome+e-mail (o modal do cronograma) não apaga a função e os telefones de quem já estava.
const CAMPOS_AGENDA = ["funcao", "telefone", "celular"];

export function atualizarContatosCliente(atuais, recebidos) {
  const anteriores = new Map((atuais || []).map(c => [emailNormalizado(c.email), c]));
  const resultado = new Map();
  for (const c of recebidos) {
    const email = emailNormalizado(c.email);
    if (!email) continue;
    const contato = { ...anteriores.get(emailNormalizado(c.emailAnterior) || email), nome: String(c.nome || "").trim(), email };
    for (const campo of CAMPOS_AGENDA) {
      if (c[campo] === undefined) continue;
      const v = String(c[campo] ?? "").trim();
      // ⚠ `null`, não ausente: apagar um telefone tem que sobreviver ao `...anterior`
      contato[campo] = v || null;
    }
    resultado.set(email, contato);
  }
  return [...resultado.values()];
}
