// O mapa de estados mudou de casa: agora vive em `lib/mes/estado-visual.js`, porque o monitor da
// supervisão lê o MESMO mapa que o totem. Este arquivo continua existindo para não mexer nos
// imports da tela do totem — e porque o caminho curto é o que se procura estando dentro da pasta.
export { ESTADO_VISUAL, visualDo } from "@/lib/mes/estado-visual";
