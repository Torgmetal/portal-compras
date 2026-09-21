// As OBRAS que um login de cliente enxerga — e como a Torg libera ou revoga uma.
//
// Vitor (21/09/2026): "preciso deixar uma forma de conseguir liberar as OPs que eu quero que ele
// veja". O portal do cliente (`/api/cliente/meu-espaco`) lista a obra quando o e-mail do login
// aparece nela — regra do próprio Vitor, de 28/08: "sempre que for mencionado o e-mail dele em algum
// relatório, já sobe para o portal dele". Entre as fontes, a que a Torg CONTROLA é o contato da OP
// (`OP.clienteContatos`): é lá que também ficam os papéis (Pedidos e faturamento) e é de lá que
// saem os envios. Então "liberar uma obra" = pôr a pessoa nos contatos daquela OP; "revogar" =
// tirar. Nada de tabela nova de "cliente × obra" — seria um vínculo a mais para esquecer.
//
// ⚠ O e-mail PRINCIPAL da OP (`clienteEmail`, cadastro do Comercial) também dá acesso, mas não se
// mexe nele por aqui: a tela mostra a obra como liberada "pelo e-mail da OP" e a troca é no
// cadastro da obra. Assinaturas, data book e portal público também abrem a obra sozinhos — esses
// não aparecem nesta lista porque não são liberação, são histórico.

const norm = (e) => String(e || "").trim().toLowerCase();

const ehContato = (op, email) => (Array.isArray(op.clienteContatos) ? op.clienteContatos : []).some((c) => norm(c?.email) === email);

/** A lista de obras com a marca do que este e-mail já enxerga, e por onde. */
export function obrasDoLogin(ops, emailLogin) {
  const email = norm(emailLogin);
  return ops.map((op) => {
    const origem = ehContato(op, email) ? "contato" : norm(op.clienteEmail) === email ? "email" : null;
    return { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra, status: op.status, liberada: !!origem, origem };
  });
}

/**
 * O que muda em `clienteContatos` para que `opIds` sejam exatamente as obras liberadas por contato.
 * Devolve `{ mudancas: [{ id, numero, clienteContatos }], liberadas: [numero], revogadas: [numero] }`
 * — só as OPs que mudam. Idempotente: quem já está não é duplicado e não perde papéis.
 */
export function aplicarLiberacao(ops, usuario, opIds) {
  const email = norm(usuario.email);
  const querer = new Set(opIds);
  const mudancas = [], liberadas = [], revogadas = [];
  for (const op of ops) {
    const atuais = Array.isArray(op.clienteContatos) ? op.clienteContatos : [];
    const tem = ehContato(op, email);
    if (querer.has(op.id) && !tem) {
      mudancas.push({ id: op.id, numero: op.numero, clienteContatos: [...atuais, { nome: String(usuario.name || "").trim() || email, email }] });
      liberadas.push(op.numero);
    } else if (!querer.has(op.id) && tem) {
      mudancas.push({ id: op.id, numero: op.numero, clienteContatos: atuais.filter((c) => norm(c?.email) !== email) });
      revogadas.push(op.numero);
    }
  }
  return { mudancas, liberadas, revogadas };
}
