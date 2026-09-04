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
