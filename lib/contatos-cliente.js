const emailNormalizado = (valor) => String(valor || "").trim().toLowerCase();

// A matriz é uma agenda de consulta; não seleciona destinatários nem concede acesso.
export function contatoParaEnvioAutomatico(contato) {
  return contato?.apenasConsulta !== true;
}

export function atualizarContatosCliente(atuais, recebidos) {
  const anteriores = new Map((atuais || []).map(c => [emailNormalizado(c.email), c]));
  const resultado = new Map();
  for (const c of recebidos) {
    const email = emailNormalizado(c.email);
    if (email) resultado.set(email, { ...anteriores.get(emailNormalizado(c.emailAnterior) || email), nome: String(c.nome || "").trim(), email });
  }
  return [...resultado.values()];
}
