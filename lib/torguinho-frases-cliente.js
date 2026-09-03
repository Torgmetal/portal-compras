// ─── AS FRASES QUE O CLIENTE LÊ ───────────────────────────────────────────────
//
// Vitor (03/09/2026): "consegue criar frases motivacionais para quando os clientes abrirem o
// Torguinho? teria algum escritor filósofo que poderíamos usar de modelo?".
//
// ⚠⚠ O MODELO DE TOM É SAINT-EXUPÉRY, MAS AS FRASES SÃO NOSSAS. Em "Terra dos Homens" e na
// "Cidadela" ele escreve sobre construir, sobre ferramenta e ofício, sobre o que se ergue em comum —
// é o registro certo: caloroso sem ser água com açúcar, grave sem ser solene. O que NÃO fazemos é
// citar: portal de obra com frase de filósofo entre aspas vira aplicativo de cartão motivacional, e
// tradução publicada tem dono. Escrever as nossas deixa falar de aço, prumo, prazo e confiança —
// que é do que essa relação trata de verdade.
//
// ⚠ E ELAS NÃO PROMETEM NADA. Nenhuma fala de prazo cumprido, entrega no dia ou qualidade
// garantida: é a mesma regra dos documentos ao cliente — o portal informa, quem promete é o
// contrato. Frase que soa a compromisso, aqui, é compromisso.
export const FRASES_CLIENTE = [
  "Toda estrutura começa muito antes do primeiro corte: começa num acordo entre quem projeta e quem constrói.",
  "Aço não perdoa pressa, mas recompensa capricho.",
  "Uma obra bem feita é a soma de mil detalhes que ninguém vai ver depois.",
  "Quem constrói aprende cedo: o prumo não se discute, se confere.",
  "A confiança se monta como estrutura — peça por peça, com folga onde precisa e rigidez onde importa.",
  "Não existe peça pequena numa obra: existe peça que ainda não foi montada.",
  "O bom projeto é aquele em que o desenho e a peça contam a mesma história.",
  "Cada marca que sai daqui leva o nome de quem a fez.",
  "Obra é trabalho de equipe que atravessa empresas: a sua e a nossa.",
  "Medir duas vezes custa minutos.",
  "Estrutura boa é a que ninguém percebe: só sustenta.",
  "O aço guarda tudo o que passou por ele — corrida, solda, tinta e cuidado.",
  "Entre o projeto e a obra existe uma ponte chamada rastreabilidade.",
  "Toda passarela já foi um risco no papel e um acordo entre pessoas.",
  "O ferro dobra; o compromisso, não.",
  "Uma boa estrutura envelhece bem — e é isso que se busca em cada peça.",
  "Trabalho bem feito é o que ainda faz sentido dez anos depois.",
  "Cada peça daqui foi pensada para o dia em que ninguém mais vai pensar nela.",
  "Transparência não atrasa obra nenhuma.",
  "Quem acompanha de perto constrói melhor — e é para isso que esta página existe.",
];

/**
 * A frase do dia — a mesma o dia inteiro, para o cliente que abre duas vezes não achar que a
 * página está falando sozinha.
 */
export function fraseDoDiaCliente(d = new Date()) {
  const i = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % FRASES_CLIENTE.length;
  return FRASES_CLIENTE[i];
}
