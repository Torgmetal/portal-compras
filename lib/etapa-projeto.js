// ─── A ESTEIRA DO PROJETO ─────────────────────────────────────────────────────
// Vitor (29/08/2026): "hoje temos a modelagem; na modelagem enviamos para o cliente aprovar o
// projeto; nesse caso quando ele retorna precisamos detalhar para fabricar; depois de detalhado
// temos que fazer o diagrama de montagem, por aí vai (...) então quando uma tarefa for atendida
// precisamos puxar a outra".
//
// ⚠⚠ A ETAPA É DEDUZIDA DO NOME, POR ENQUANTO. O certo é uma coluna `etapa` na CronogramaTarefa —
// nome livre não encadeia e não mede. Mas medindo antes de construir: das 52 tarefas de Engenharia
// em aberto hoje, **48 casam** com um destes padrões e só 4 caem em OUTRO. Ou seja, a esteira já
// está escrita nos nomes; dá para mostrá-la hoje e tipar o campo depois sem retrabalho.
//
// ⚠ ORDEM IMPORTA na lista: "Lista de LPC" tem "lpc" e "lista"; "Liberar projeto para fabricação"
// tem "liberar". Quem casa primeiro ganha, então o mais específico vem antes.
export const ETAPAS_PROJETO = [
  { id: "MODELO",       label: "Modelo",       rx: /\bmodel(o|agem|ar)\b|\bmazanino\b/i },
  { id: "APROVACAO",    label: "Aprovação",    rx: /aprova[çc]|para aprova/i },
  { id: "DETALHAMENTO", label: "Detalhamento", rx: /detalha/i },
  { id: "DIAGRAMA",     label: "Diagrama",     rx: /diagrama/i },
  { id: "LISTAS",       label: "Listas",       rx: /\blistas?\b|mat[ée]ria[ -]?prima|\ble e lpc\b|\blpc\b|lista de (materiais|expedi|pe[çc]as|compra|prioridade)/i },
  { id: "LIBERACAO",    label: "Liberação",    rx: /liber(ar|a[çc][ãa]o)/i },
];

/** A etapa da esteira em que esta tarefa está. `null` quando o nome não diz. */
export function etapaDaTarefa(nome) {
  const n = String(nome || "");
  // ⚠ "Liberar projeto para fabricação" antes de "Listar Matéria Prima": as duas têm "li…", e a
  // liberação é a que fecha o ciclo. Por isso a checagem específica vem primeiro.
  if (/liber(ar|a[çc][ãa]o)/i.test(n)) return "LIBERACAO";
  for (const e of ETAPAS_PROJETO) if (e.rx.test(n)) return e.id;
  return null;
}

export const ETAPA_LABEL = Object.fromEntries(ETAPAS_PROJETO.map((e) => [e.id, e.label]));

/**
 * A etapa que esta destrava ao ser concluída.
 *
 * ⚠ Isto é INFORMAÇÃO, não automação. Enquanto a etapa não for um campo, o portal mostra a ordem
 * mas não dá baixa sozinho — dizer "libera X" numa tela que não libera nada seria mentira na
 * interface. A tela escreve "próxima: X", que é verdade hoje.
 */
export const PROXIMA_ETAPA = {
  MODELO: "APROVACAO",
  APROVACAO: "DETALHAMENTO",
  DETALHAMENTO: "DIAGRAMA",
  DIAGRAMA: "LISTAS",
  LISTAS: "LIBERACAO",
};

/**
 * A tarefa está em ESPERA (hold), e não em atraso?
 *
 * ⚠⚠ ESPERA NÃO É ATRASO. Vitor (29/08/2026): "as tarefas em hold não podemos deixar como
 * atrasadas, pois isso é indefinição do projeto". São 17 das 52 — um terço do que a tela mostrava
 * como dívida da Engenharia era decisão pendente do cliente. O relógio continua correndo, mas
 * contra quem está devendo a resposta.
 */
export const emEspera = (t) => !!(t?.motivoBloqueio && !t?.dataLiberacao);
