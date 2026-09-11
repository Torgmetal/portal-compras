// Acesso ao vínculo comercial da OP segue as permissões da API de edição.
export function podeGerenciarComercialOP(user) {
  return user?.tipo === "ADMIN" || (user?.modulos || []).some(
    (m) => (typeof m === "string" ? m : m?.modulo) === "COMERCIAL",
  );
}

/** Remove os dados restritos antes de serializar a OP para o navegador. */
export function protegerDadosObra(op, { podeVerFinanceiro = false, podeGerenciarComercial = false }) {
  for (const dados of [op, ...(op.aditivos || [])]) {
    if (!podeVerFinanceiro) {
      delete dados.valorTotalContrato;
      delete dados.valorFaturarPorKg;
    }
    if (!podeGerenciarComercial) {
      delete dados.orcamentoPasta;
      delete dados.orcamentoRef;
      delete dados.propostas;
      delete dados.estudoArquivo;
      delete dados.estudoDados;
    }
  }
}
