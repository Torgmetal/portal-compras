// Ler a resposta como TEXTO antes de interpretar.
//
// ⚠⚠ NASCEU DE UM ERRO EM PRODUÇÃO. Matheus (08/09/2026): "retornou esse erro a listagem que tinha
// abaixo do Gantt: Unexpected end of JSON input". O padrão de sempre era
//
//     const j = await r.json();
//     if (!r.ok) throw new Error(j.error);
//
// e ele tem o defeito de só funcionar quando dá certo: quando o servidor responde 500 com corpo
// vazio, ou a Vercel devolve uma página de erro em HTML, o `r.json()` explode ANTES da linha que
// trataria o erro. Quem está na tela lê "Unexpected end of JSON input" em vez do que aconteceu.
//
// Aqui o corpo é lido como texto primeiro, então a mensagem sempre diz o status e o começo do que
// veio — que é o que permite descobrir se caiu o banco, se a rota nem existe, ou se foi 403.

/**
 * @param {Response} r      a resposta do fetch (já resolvida)
 * @param {string} oQue     o que estava sendo buscado, para a mensagem ("Peças da OP")
 */
export async function lerJson(r, oQue) {
  const bruto = await r.text().catch(() => "");
  if (!bruto.trim()) throw new Error(`${oQue}: o servidor respondeu ${r.status} sem conteúdo.`);
  let j;
  try { j = JSON.parse(bruto); }
  catch { throw new Error(`${oQue}: resposta ${r.status} não é JSON — "${bruto.slice(0, 100)}"`); }
  if (!r.ok) throw new Error(j.error || `${oQue}: erro ${r.status}`);
  return j;
}
