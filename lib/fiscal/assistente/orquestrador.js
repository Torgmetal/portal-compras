import "server-only";
import { rodada, custoMicros, MODELO, PRECOS } from "@/lib/fiscal/assistente/provedor";
import { ESQUEMAS, executar } from "@/lib/fiscal/assistente/ferramentas";
import { instrucao } from "@/lib/fiscal/assistente/instrucao";
import { conferirProsa } from "@/lib/fiscal/assistente/contrato";
import { corpusVigente } from "@/lib/fiscal/assistente/recuperacao";
import { referenciaAtiva } from "@/lib/fiscal/consulta";
import { decisoesVigentes } from "@/lib/fiscal/validacao-regras";
import { verbetesAprovados } from "@/lib/fiscal/registro-classificacao";

// ─── O LAÇO ──────────────────────────────────────────────────────────────────
//
// ⚠⚠ O TETO DE RODADAS É DE SEGURANÇA, NÃO DE ECONOMIA. Sem ele, um modelo confuso chama a mesma
// ferramenta em círculo até a rota morrer — e o usuário recebe HTML no lugar de JSON, que é como a
// Vercel mata uma função. Seis rodadas cobrem com folga a cadeia mais longa que desenhei
// (classificação → NCM → CFOP → regra → legislação → simulação).
const MAX_RODADAS = 6;

/**
 * ⚠⚠ O PRAZO DO MODELO TERMINA ANTES DO PRAZO DA ROTA, E A DIFERENÇA É PARA GRAVAR. A rota declara
 * `maxDuration = 60`; se o modelo pudesse usar os 60, a conclusão (transação curta, mas transação)
 * ficaria sem orçamento e a execução morreria EM_ANDAMENTO depois de a chamada já ter sido paga.
 * ⚠ Baixado de 55 s para 42 s junto com o `maxRetries: 0` do provedor (achado do Codex,
 * 24/09/2026): sem retentativa do SDK, uma rodada lenta não se multiplica mais por três, e sobra
 * folga de verdade para persistir.
 */
const ORCAMENTO_MS = 42_000;

/** ⚠ O que fica reservado para gravar a resposta e conciliar o custo depois da última rodada. */
const RESERVA_PARA_GRAVAR_MS = 8_000;

/**
 * ⚠⚠ ABAIXO DISTO NÃO SE INICIA UMA CHAMADA NOVA. Uma rodada com ferramentas leva de 5 a 20 s;
 * começar uma com 3 s sobrando é pagar por uma resposta que o `AbortSignal` vai cortar antes de
 * chegar — dinheiro gasto sem nada gravado.
 */
export const MINIMO_PARA_CHAMAR_MS = 10_000;

/**
 * ⚠⚠ AS VERSÕES SÃO RESOLVIDAS UMA VEZ POR EXECUÇÃO (parecer do Codex): *"resolva as versões uma
 * vez por execução para evitar misturar referências durante uma atualização"*. Se a sincronização
 * da TIPI terminar no meio de uma resposta, a resposta inteira continua falando da mesma versão.
 */
/**
 * ⚠⚠⚠ RESOLVER UMA VEZ SÓ NÃO BASTAVA — ERA PRECISO USAR O QUE FOI RESOLVIDO (achado do Codex,
 * 24/09/2026). A primeira versão desta função lia as versões, gravava o carimbo… e as ferramentas
 * reconsultavam tudo por conta própria: `detalharNcm` chamava `referenciaAtiva()` de novo, a
 * simulação buscava "a TIPI ATIVA agora", a legislação recarregava o corpus. Uma sincronização
 * terminando entre duas ferramentas misturava versões dentro da MESMA resposta, e o carimbo gravado
 * descrevia uma leitura diferente da que de fato aconteceu — rastreabilidade que mente.
 *
 * Agora ela devolve DUAS coisas: `referencias` (o carimbo enxuto que vai para o banco) e `contexto`
 * (os objetos resolvidos, que as ferramentas USAM em vez de reconsultar).
 */
async function referenciasDaExecucao() {
  const [ref, corpus, decisoes, verbetes] = await Promise.all([
    referenciaAtiva(), corpusVigente(), decisoesVigentes(), verbetesAprovados(),
  ]);
  const contexto = { referencia: ref, corpus, decisoes, verbetes };
  const referencias = {
    tipiVersaoId: ref.tipi?.id ?? null,
    tipiSha256: ref.tipi?.fonte?.sha256 ?? null,
    tipiObservadoEm: ref.tipi?.observadoEm ?? null,
    normas: [...new Set(corpus.map((c) => c.normaChave))],
    dispositivos: corpus.length,
    ncmVersaoId: ref.ncm?.id ?? null,
    // ⚠ Quantas decisões da contabilidade e verbetes existiam NO MOMENTO — `null` quando a leitura
    // falhou, que é diferente de zero e as ferramentas tratam como "suspenso".
    // ⚠ Pelo TIPO, não por `=== null`: o carimbo é bookkeeping, e um formato inesperado aqui não
    // pode derrubar a resposta inteira depois de a chamada já ter sido paga.
    decisoesLidas: decisoes instanceof Map ? decisoes.size : null,
    verbetesLidos: Array.isArray(verbetes) ? verbetes.length : null,
    modelo: MODELO,
    precoVersao: PRECOS.versao,
    resolvidoEm: new Date().toISOString(),
  };
  return { referencias, contexto };
}

const coberturaEmTexto = (r) =>
  `A base interna tem a TIPI federal (${r.tipiVersaoId ? "versão ativa importada" : "NÃO IMPORTADA"}), a tabela de NCM oficial e `
  + `${r.normas.length} normas jurídicas (${r.dispositivos} dispositivos): artigos do RICMS/SP, Decisão Normativa CAT e Respostas à Consulta da SEFAZ-SP. `
  + `NÃO há RIPI nem regulamento de ICMS de outros estados.`;

/**
 * Responde uma mensagem. Devolve tudo que a persistência precisa gravar.
 *
 * ⚠⚠ NADA É TRANSMITIDO AO NAVEGADOR ANTES DA CONFERÊNCIA. O Codex foi explícito: *"não transmita
 * afirmações fiscais livres antes da validação"*. O `aoProgredir` existe para a tela dizer O QUE
 * está sendo consultado — "consultando a TIPI", "procurando o fundamento legal" — e nunca para
 * adiantar texto fiscal que ainda não passou por `conferirProsa`.
 */
/**
 * @param {number} [ateMs] prazo ABSOLUTO para o modelo, calculado pela ROTA desde a entrada dela.
 *
 * ⚠⚠⚠ O PRAZO VEM DE FORA, E ESSE ERA O ÚLTIMO FURO (achado do Codex, 24/09/2026). Os 42 s
 * começavam a contar AQUI dentro — depois de autenticação, reserva, abertura da execução (que pode
 * esperar até 5 s na trava de idempotência) e leitura do histórico. Com o banco lento, 20 s de
 * preparação + 42 s de modelo passavam dos 60 s da rota: a Vercel matava a função com a chamada já
 * paga e nada gravado. Quem sabe quando a rota COMEÇOU é a rota; ela calcula e passa.
 */
export async function responder({ historico, pergunta, aoProgredir = () => {}, ateMs = null }) {
  const ate = ateMs ?? Date.now() + ORCAMENTO_MS;
  const { referencias, contexto } = await referenciasDaExecucao();
  const sistema = instrucao({
    hoje: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long" }).format(new Date()),
    cobertura: coberturaEmTexto(referencias),
  });

  const mensagens = [
    ...historico.map((m) => ({ role: m.papel === "USUARIO" ? "user" : "assistant", content: m.conteudo })),
    { role: "user", content: pergunta },
  ];

  const blocos = [];
  const executadas = [];
  const uso = { entrada: 0, saida: 0, cacheLido: 0, cacheEscrito: 0 };
  let texto = "";
  let rodadas = 0;

  for (let i = 0; i < MAX_RODADAS; i++) {
    // ⚠⚠ A CONFERÊNCIA VEM ANTES DE CADA CHAMADA, inclusive da primeira: se a preparação comeu o
    // prazo, não se inicia uma chamada paga que não teria tempo de terminar e ser gravada.
    if (ate - Date.now() < MINIMO_PARA_CHAMAR_MS) break;
    rodadas += 1;
    const r = await rodada({ sistema, mensagens, ferramentas: ESQUEMAS, ateMs: ate });
    uso.entrada += r.uso.entrada; uso.saida += r.uso.saida;
    uso.cacheLido += r.uso.cacheLido; uso.cacheEscrito += r.uso.cacheEscrito;
    if (r.texto) texto = r.texto;

    if (!r.chamadas.length) break;

    mensagens.push({ role: "assistant", content: r.bruto });
    const resultados = [];
    for (const c of r.chamadas) {
      aoProgredir({ etapa: "ferramenta", nome: c.nome });
      const saida = await executar(c.nome, c.argumentos, contexto);
      executadas.push({ nome: c.nome, argumentos: c.argumentos, estrutura: saida.estrutura });
      if (saida.bloco) blocos.push(saida.bloco);
      resultados.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(saida.estrutura).slice(0, 12_000) });
    }
    mensagens.push({ role: "user", content: resultados });

    // ⚠ Sem tempo para mais uma rodada: sai com o que tem em vez de estourar o prazo da rota.
    if (Date.now() > ate - RESERVA_PARA_GRAVAR_MS) break;
  }

  // ⚠⚠ A CONFERÊNCIA É A ÚLTIMA COISA, E ELA VÊ O TEXTO FINAL CONTRA OS BLOCOS QUE DE FATO SAÍRAM.
  const { avisos } = conferirProsa(texto, blocos);

  return {
    // ⚠ Nenhuma rodada = o prazo acabou ANTES da primeira chamada. A mensagem diz isso, e não
    // "não consegui formular" — que faria a pessoa reescrever uma pergunta que estava certa.
    conteudo: texto || (rodadas === 0
      ? "O portal demorou para preparar a consulta e não houve tempo para consultar a base fiscal com segurança. Nada foi cobrado desta tentativa — pergunte de novo."
      : "Não consegui formular uma resposta com as fontes disponíveis. Refaça a pergunta descrevendo a operação, ou consulte as abas de NCM, CFOP e Simulador."),
    blocos,
    // ⚠⚠ A EVIDÊNCIA GUARDA O TRECHO, NÃO O PONTEIRO — `FiscalNormaVersao` tem exclusão em cascata,
    // e o §22 do briefing exige preservar a base usada na resposta ORIGINAL.
    evidencias: blocos.flatMap((b) => (b.fontes ?? []).map((f) => ({ ...f, bloco: b.tipo }))),
    ferramentas: executadas,
    referencias,
    avisos,
    uso,
    modelo: MODELO,
    custoMicros: custoMicros(uso),
    rodadas,
  };
}
