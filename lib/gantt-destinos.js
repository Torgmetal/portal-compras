// O banco guarda um destino por peça/setor. Movimentos intermediários da sessão
// não devem ser regravados, nem a mesma peça contada duas vezes no mesmo bloco.
export function destinosFinais(blocos) {
  const porPeca = new Map();
  for (const b of blocos) for (const id of b.ids) porPeca.set(`${b.setor}|${id}`, { ...b, id });
  const grupos = new Map();
  for (const b of porPeca.values()) {
    const chave = JSON.stringify([b.setor, b.recurso, b.dia]);
    if (!grupos.has(chave)) grupos.set(chave, { setor: b.setor, recurso: b.recurso, dia: b.dia, ids: [] });
    grupos.get(chave).ids.push(b.id);
  }
  return [...grupos.values()];
}
