// Ler a resposta de uma rota SEM quebrar quando ela não é JSON.
//
// ⚠⚠ NEM TODO ERRO VEM DA NOSSA ROTA. Vitor (04/09/2026), anexando foto no relatório de pintura:
// "Unexpected token 'A', "An error o"... is not valid JSON". Quando o upload passa do teto da
// função serverless (~4,5 MB), o código da rota NEM RODA: a plataforma responde uma página HTML
// ("An error occurred with your deployment"), e o `res.json()` estoura no meio dela. O usuário lê
// um erro de sintaxe de JavaScript no lugar de "a foto é grande demais" — e não tem o que fazer
// com isso.
//
// Aqui a resposta é lida como TEXTO e só então virada para objeto. Não sendo JSON, devolve um
// `{ error }` em português, com a causa provável quando o status entrega o motivo.
export async function lerJson(res) {
  const txt = await res.text().catch(() => "");
  try {
    return JSON.parse(txt);
  } catch {
    if (res.status === 413) return { error: "Arquivo grande demais para enviar." };
    if (res.status === 401 || res.status === 403) return { error: "Sua sessão expirou — entre de novo." };
    // 500/502 com corpo HTML é a cara do estouro de tamanho ou do timeout da função
    if (!res.ok) return { error: "O envio não foi aceito pelo servidor (arquivo grande demais ou demorou demais). Tente de novo com uma foto menor." };
    return { error: "Resposta inesperada do servidor." };
  }
}
