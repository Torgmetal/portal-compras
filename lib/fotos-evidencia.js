// ─── ÁREAS DE EVIDÊNCIA FOTOGRÁFICA DO RELATÓRIO ─────────────────────────────────────────────
//
// Vitor (04/09/2026): "para o preenchimento das fotos dos testes precisa ter campo de fotos
// específico para cada área; hoje você permite a inclusão mas cria campos novos, precisa ficar em
// cada área de tipo de evidência, pode conter mais de 1 foto".
//
// ⚠⚠ O RELATÓRIO DE PINTURA JÁ TINHA AS SEIS MOLDURAS ROTULADAS na folha 2 — e elas saíam SEMPRE
// VAZIAS: o gerador lia `foto.imagem`, propriedade que ninguém nunca preencheu (`embutirFotos`
// devolve `img`). Toda foto caía na folha extra de registro fotográfico, genérica, na ordem de
// upload. Quem preenchia via campo novo aparecendo, sem entender que existia lugar certo pra cada
// ensaio.
//
// Estas chaves são a ligação entre o formulário (onde se anexa) e o PDF (onde a moldura tem o
// rótulo). Rótulo mudou aqui, muda nos dois — que é exatamente o que faltava.
export const EVIDENCIAS = {
  PINTURA: [
    { k: "rugosidade", rot: "Rugosidade / Jateamento" },
    { k: "salinidade", rot: "Teste de Salinidade - BRESLE" },
    { k: "espessura", rot: "Medição de Espessura" },
    { k: "aderenciaX", rot: "Aderência - Teste X" },
    { k: "pullOff", rot: "Aderência - Pull Off" },
    { k: "outros", rot: "Outros / Observações" },
  ],
};

/** As áreas daquele tipo de relatório. Vazio = o tipo não separa por área (bucket único). */
export const evidenciasDoTipo = (tipo) => EVIDENCIAS[tipo] || [];

export const rotuloEvidencia = (tipo, k) => evidenciasDoTipo(tipo).find((e) => e.k === k)?.rot || null;

/**
 * ⚠ Foto SEM área continua válida: é o que já está no banco (todas as anteriores a 04/09/2026) e é
 * o que o celular manda quando o inspetor fotografa antes de existir relatório. Ela cai no bloco
 * "sem área" da tela, de onde se classifica com um clique.
 */
export const evidenciaValida = (tipo, k) => !k || evidenciasDoTipo(tipo).some((e) => e.k === k);

// ─── A NUMERAÇÃO DAS FOTOS ───────────────────────────────────────────────────────────────────
//
// ⚠⚠ A CONTAGEM ERA PROMETIDA E NUNCA CUMPRIDA. Vitor (22/09/2026): "as fotos estão ficando com
// marcação errada, temos duas fotos 102-002 ele marcar 1/8 2/8". No RIP-102-002 a moldura da folha
// 2 dizia "Medição de Espessura · 1 de 8" — e as outras SETE fotos do mesmo ensaio saíam na folha
// de registro fotográfico sem número nenhum, todas com a MESMA legenda. Quem confere via um "1 de
// 8" e sete quadros indistinguíveis: não dá para dizer qual é a 2ª medição nem se alguma faltou.
//
// ⚠ O ÍNDICE É DENTRO DO ENSAIO, não no total do relatório: a 3ª foto de espessura é "3 de 8" ainda
// que seja a 5ª foto do documento. É por ensaio que se confere.
//
// ⚠ A numeração mora AQUI, junto dos rótulos, porque quem desenha são dois lugares — a moldura da
// folha 2 e a folha de registro fotográfico. Calculada em cada um, foi exatamente assim que uma
// metade ficou com número e a outra sem.

const normalizar = (t) =>
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A legenda de um ensaio já repetida na legenda do inspetor não se escreve duas vezes. */
const repeteORotulo = (obs, rot) => {
  const a = normalizar(obs), b = normalizar(rot);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
};

/**
 * A legenda que sai embaixo da foto: `<ensaio> · <i> de <n> · <o que o inspetor escreveu>`.
 *
 * ⚠ "1 de 1" não se escreve: contagem de um item só é ruído.
 * ⚠ Foto sem ensaio não ganha número — ela não pertence a nenhuma contagem, e inventar uma
 *   ("2 de 3" de quê?) é pior que não ter.
 */
export function legendaDaFoto(tipo, foto, indice = 1, total = 1) {
  const rot = rotuloEvidencia(tipo, foto?.evidencia);
  const obs = String(foto?.observacao || "").trim();
  const partes = [];
  if (rot) partes.push(total > 1 ? `${rot} · ${indice} de ${total}` : rot);
  if (obs && !(rot && repeteORotulo(obs, rot))) partes.push(obs);
  return partes.join(" · ") || null;
}

/** As fotos com `indiceEnsaio`, `totalEnsaio` e a `legenda` pronta — na ordem em que chegaram. */
export function numerarPorEvidencia(tipo, fotos = []) {
  const lista = (Array.isArray(fotos) ? fotos : []).filter(Boolean);
  const totais = new Map();
  for (const f of lista) {
    const k = f.evidencia || null;
    totais.set(k, (totais.get(k) || 0) + 1);
  }
  const vistos = new Map();
  return lista.map((f) => {
    const k = f.evidencia || null;
    const indice = (vistos.get(k) || 0) + 1;
    vistos.set(k, indice);
    const total = totais.get(k) || 1;
    return { ...f, indiceEnsaio: indice, totalEnsaio: total, legenda: legendaDaFoto(tipo, f, indice, total) };
  });
}
