import { redirect } from "next/navigation";

// A LISTA DE ESTUDOS VIROU A LISTA DE PROPOSTAS ESTRUTURAS.
//
// Vitor (29/08/2026): "a estrutura LQC na verdade é o que gera a proposta". Eram duas telas para a
// mesma coisa — "Estudos (LQC)" e "Propostas Estruturas" — e ninguém tinha como saber em qual
// clicar. O estudo continua sendo o estudo; ele só deixou de ter uma lista própria.
//
// ⚠ O DETALHE CONTINUA EM /estudos/[id]. Só a LISTA foi embora. Redirecionar em vez de apagar
// preserva os links que já foram enviados por e-mail e os que estão no histórico do navegador.
export default function EstudosPage() {
  redirect("/comercial/orcamentos/propostas");
}
