// Contatos para os envios do portal (lembrete de tarefa, cronograma, ata, lista de expedição).
//
// ⚠⚠ NÃO É MAIS LISTA FIXA. Até 25/08/2026 esta lista vivia no código e concorria com a matriz de
// setores do banco — e as duas já discordavam (Gabriel era Engenharia aqui e PCP lá; Larissa era
// PCP aqui e Planejamento lá). Quem recebia um aviso do "PCP" dependia de qual fluxo disparou.
//
// Agora tudo lê a mesma tabela, editável em Admin › Contatos por setor. O que sobrou aqui é só o
// que NÃO é contato: o mapa setor→área e a semente da migração.
import { getAreasContatos, SETOR_LABEL } from "@/lib/comunicacao-setor";

// ⚠ A SEMENTE, guardada como registro do que existia. Não é lida em runtime — serve para provar
// de onde vieram os contatos migrados e para reconstruir se alguém esvaziar a tabela por engano.
export const SEMENTE_CONTATOS = [
  {
    area: "Comercial",
    contatos: [
      { nome: "Matheus Lima", email: "matheus.lima@torg.com.br" },
      { nome: "Patricia Maiochi", email: "comercial@torg.com.br" },
    ],
  },
  {
    area: "Engenharia",
    contatos: [
      { nome: "Diego Dias", email: "engenharia@torg.com.br" },
      { nome: "Mike Braga", email: "engenharia2@torg.com.br" },
      { nome: "Gabriel Rodrigues", email: "engenharia3@torg.com.br" },
      { nome: "John Cornia", email: "engenharia4@torg.com.br" },
    ],
  },
  {
    area: "Qualidade",
    contatos: [
      { nome: "Geraldo Tank", email: "qualidade@torg.com.br" },
    ],
  },
  {
    area: "PCP",
    contatos: [
      { nome: "Larissa Mantovani", email: "pcp@torg.com.br" },
    ],
  },
  {
    area: "Diretoria",
    contatos: [
      { nome: "Vitor Costa", email: "vitor@torg.com.br" },
      { nome: "Guilherme Campos", email: "guilherme@torg.com.br" },
      { nome: "Fabrine Susigan", email: "fabrine@torg.com.br" },
    ],
  },
];

// Setor da tarefa → área a pré-marcar no modal (o setor responsável já vem
// selecionado; as outras áreas ficam disponíveis pra marcar).
// ⚠ o rótulo vem do SETOR_LABEL da matriz: dois nomes para a mesma área voltaria a criar
// divergência silenciosa, que é justamente o que esta unificação foi corrigir.
export const SETOR_AREA_TAREFA = Object.fromEntries(
  ["COMERCIAL", "ENGENHARIA", "PCP", "QUALIDADE"].map((s) => [s, SETOR_LABEL[s]])
);

/** Áreas com contatos, da matriz — o que os modais de envio mostram. */
export async function getContatosTarefas() {
  return getAreasContatos();
}

// CÓPIA PADRÃO DA COBRANÇA DE ATRASO — a direção, e só ela.
//
// Vitor (19/08/2026): "no aviso de atraso do cronograma estamos copiando pessoas que não precisam
// quando vamos cobrar os setores. Deixar sempre o responsável do setor + eu, a Fabrine e o
// Guilherme, com opção de selecionar ou não".
//
// O que fazia isso errado: o CC era "todos os usuários ADMIN". São cinco — entravam também o
// Matheus e o Caio, que não têm nada a ver com a cobrança de prazo. E ADMIN é permissão de
// sistema, não cargo: quem ganhasse acesso administrativo passaria a receber cobrança de todo
// setor, sem ninguém decidir isso.
//
// Vem MARCADO por padrão e dá pra desmarcar um a um na hora de enviar.
// ⚠ vem do setor DIRETORIA da matriz — entrar ou sair alguém da direção deixa de ser deploy.
// Se a tabela estiver vazia, cai no fixo: cobrança sem cópia da direção é pior que cópia demais.
const CC_DIRECAO_FIXO = [
  { nome: "Vitor Costa", email: "vitor@torg.com.br" },
  { nome: "Fabrine Susigan", email: "fabrine@torg.com.br" },
  { nome: "Guilherme Campos", email: "guilherme@torg.com.br" },
];

export async function getCcDirecao() {
  const [area] = await getAreasContatos(["DIRETORIA"]);
  return area?.contatos?.length ? area.contatos : CC_DIRECAO_FIXO;
}
