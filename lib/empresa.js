// Dados da Torg Metal pra exibicao em portais externos (fornecedor, cliente).
// Edite os valores aqui quando precisar atualizar dados cadastrais.
//
// Quando uma cotacao tem faturamento = "Torg", esses dados sao mostrados
// pro fornecedor saber pra quem emitir a nota. Quando faturamento = "Cliente",
// usa-se OP.cliente* em vez disso.
export const DADOS_TORG = {
  razaoSocial: "TORG METAL INDUSTRIA E COMERCIO LTDA",
  nomeFantasia: "Torg Metal",
  cnpj: "00.000.000/0001-00", // TODO: substituir pelo CNPJ real
  inscricaoEstadual: "000.000.000.000", // TODO: substituir pela IE real
  endereco: "Endereco da Torg, n. 000", // TODO: substituir
  bairro: "",
  cidade: "Sao Paulo", // TODO: confirmar
  uf: "SP",
  cep: "00000-000", // TODO: substituir
  email: "compras@torgmetal.com.br", // TODO: confirmar
  telefone: "(00) 0000-0000", // TODO: confirmar
};
