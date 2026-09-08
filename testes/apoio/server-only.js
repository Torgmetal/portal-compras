// `server-only` é um pacote do Next que existe só para ESTOURAR se um módulo de
// servidor for importado pelo cliente. Fora do Next ele não resolve, e os 35
// geradores de PDF do portal começam com `import "server-only"` — sem este
// atalho, nenhum deles é testável.
//
// Um módulo vazio é a substituição fiel: o pacote de verdade também não exporta
// nada. A proteção que ele dá continua valendo onde importa, que é no build do
// Next, não aqui.
export {};
