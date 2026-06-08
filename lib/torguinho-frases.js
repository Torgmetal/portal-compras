// Frases motivacionais do Torguinho — uma por dia, pra alegrar a galera da Torg.
// Tom leve, positivo e com cara de chão de fábrica / metalurgia.
export const FRASES_MOTIVACIONAIS = [
  "Bom dia! Cada peça que sai daqui é a Torg construindo algo grande. Bora com tudo! 💪",
  "Aço é forte, mas é o time da Torg que dá forma a ele. Você faz a diferença! 🔩",
  "Hoje é mais um dia pra transformar projeto em realidade. Conte comigo! 👷",
  "Trabalho bem feito não enferruja. Capricha que o resultado aparece! ✨",
  "Grandes estruturas começam com um corte preciso. Comece bem o seu dia! ⚙️",
  "Disciplina é a liga que mantém tudo no lugar. Você tá no caminho certo! 🔧",
  "Respira fundo: passo a passo, a obra fica de pé. Vamos juntos hoje! 🏗️",
  "O segredo de uma boa solda é a constância. Mantenha o ritmo! 🔥",
  "Erro faz parte do processo — o importante é seguir ajustando. Você consegue! 💡",
  "Time forte é igual estrutura bem montada: cada um sustenta o outro. Valeu por fazer parte! 🤝",
  "Que o seu dia seja produtivo igual uma linha de corte afiada! ✂️",
  "Foco no próximo passo. O resto a gente resolve uma peça de cada vez. 🛠️",
  "Sua dedicação é a matéria-prima do sucesso da Torg. Obrigado por isso! 🙌",
  "Café na mão, plano na cabeça e bora produzir! O dia é nosso. ☕",
  "Cada apontamento é uma vitória registrada. Continue marcando gols! ⚽",
  "Precisão e capricho hoje, orgulho amanhã. Mãos à obra! 👍",
  "Tá pesado? Lembra: ninguém ergue uma viga sozinho. Pode contar com o time. 🏋️",
  "Pequenos ajustes fazem grandes diferenças. Bora afinar o dia! 🎯",
  "Energia lá em cima! Hoje a gente entrega qualidade do começo ao fim. ⚡",
  "Você é peça-chave dessa engrenagem. Sem você, não roda. Valeu! 🔩",
  "Planejar é metade do caminho; executar é a parte boa. Vamos nessa! 🗺️",
  "Mantém a cabeça erguida e a chama acesa. Dia bom começa com atitude! 🔥",
  "Orgulho de fazer parte de um time que constrói de verdade. Bora pra cima! 🚀",
  "Capricho no detalhe é o que separa o comum do excelente. Faça o seu melhor! 🌟",
  "Hoje rende! Um passo de cada vez e no fim a obra fica pronta. 💪",
  "Segurança em primeiro lugar, qualidade em todas. Tenha um ótimo dia! 🦺",
  "O aço dobra, mas a sua vontade de fazer bem feito não. Mostra serviço! 🔨",
  "Sorria, respira e produz: o dia fica mais leve assim. Tô na torcida! 😄",
  "Cada obra entregue é uma história que vocês escreveram. Bora escrever mais uma! 📖",
  "Bom trabalho não tem atalho, tem capricho. E disso você entende! 👏",
];

// Retorna a frase do dia — determinística (mesma frase o dia inteiro, muda a cada dia).
export function fraseDoDia(d = new Date()) {
  const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % FRASES_MOTIVACIONAIS.length;
  return FRASES_MOTIVACIONAIS[idx];
}
