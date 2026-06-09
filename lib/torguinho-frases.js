// Frases do Torguinho — uma por dia, pra acolher e inspirar a galera da Torg.
//
// Tom: leve, amigável e humano, com pegada de chão de fábrica / metalurgia.
// Alinhado à NR1 (gestão de riscos psicossociais): valorizam saúde mental,
// pausas, pedir ajuda, respeito, segurança e pertencimento — SEM cobrança,
// pressão por produtividade ou "positividade tóxica". A pessoa vem antes da obra.
export const FRASES_MOTIVACIONAIS = [
  "Bom dia! Antes de qualquer entrega: você importa mais que qualquer peça. Tenha um dia leve! 💙",
  "Aço a gente molda com calma e técnica — sua jornada também. Vá no seu ritmo! ⚙️",
  "Pedir ajuda é sinal de força, não de fraqueza. O time tá aqui por você! 🤝",
  "Já respirou fundo hoje? Cuidar de você também é fazer um bom trabalho. ☕",
  "Cada pessoa da Torg importa — pelo que faz e, principalmente, por quem é. 💙",
  "Dia puxado? Tudo bem ir com calma. Uma coisa de cada vez, sem se cobrar demais. 🔧",
  "Segurança em primeiro lugar: a sua, a do colega e a da sua cabeça também. 🦺",
  "Bom ambiente se constrói com respeito e gentileza. Obrigado por cuidar do time! 🤗",
  "Não tá um bom dia? Fala com a gente. Aqui ninguém carrega o peso sozinho. 💬",
  "Você faz parte de algo grande — e o seu bem-estar vem sempre antes da obra. 🌟",
  "Errou? Faz parte. Respira, ajusta e segue. Ninguém acerta tudo, e tá tudo bem. 💡",
  "Time forte é igual estrutura bem montada: um sustenta o outro. Conte com a gente! 🏗️",
  "O trabalho que vale a pena é o feito com saúde. Cuide-se que o resto a gente alinha. 💪",
  "Que hoje tenha espaço pra trabalhar, descansar e dar boas risadas. 😄",
  "Obrigado por estar aqui, do seu jeito. Você é reconhecido e bem-vindo. 🙌",
  "No fim do expediente, desligue de verdade. Seu tempo e sua família também importam. 🏡",
  "Respeito no chão de fábrica vale mais que qualquer prazo. Cuide de quem tá do seu lado. 🤝",
  "Cabeça tranquila trabalha melhor que cabeça apertada. Vá com leveza hoje! 🧠",
  "Sua voz importa: ideia, dúvida ou desabafo, a gente quer ouvir. 👂",
  "Pequenas pausas fazem grande diferença. Estique as pernas, beba água, respira. 💧",
  "Você é peça-chave — e peça-chave também precisa de cuidado e descanso. 🔩",
  "Dia bom é dia com respeito, segurança e um colega pra dividir o café. ☕",
  "Capricho a gente faz sem se machucar e sem se cobrar demais. Equilíbrio é tudo. ⚖️",
  "Tá tudo bem não estar 100% todo dia. O que importa é a gente cuidar uns dos outros. 💙",
  "Orgulho de um time que constrói de verdade — e que cuida das pessoas de verdade. 🚀",
  "Comece o dia no seu tempo. Pressão a gente deixa pra prensa, não pras pessoas. 😉",
  "Saúde mental também é segurança do trabalho. Se precisar de uma pausa, pode parar. 🦺",
  "Gentileza não enferruja. Um bom-dia ao colega já deixa o turno mais leve. 🤗",
  "Aqui ninguém é só matrícula: você é gente, e isso é o que mais importa. 💚",
  "Faça o possível hoje — e o seu possível já é mais que suficiente. 🌟",
  "Respira fundo: a obra fica de pé, e você merece chegar inteiro no fim do dia. 🌬️",
  "Bora cuidar da gente enquanto a gente constrói junto. Tenha um ótimo dia! 💙",
];

// Retorna a frase do dia — determinística (mesma frase o dia inteiro, muda a cada dia).
export function fraseDoDia(d = new Date()) {
  const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % FRASES_MOTIVACIONAIS.length;
  return FRASES_MOTIVACIONAIS[idx];
}
