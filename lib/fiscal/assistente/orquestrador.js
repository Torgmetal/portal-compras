import "server-only";
import { rodada, custoMicros, MODELO, PRECOS } from "@/lib/fiscal/assistente/provedor";
import { ESQUEMAS, executar } from "@/lib/fiscal/assistente/ferramentas";
import { instrucao } from "@/lib/fiscal/assistente/instrucao";
import { conferirProsa } from "@/lib/fiscal/assistente/contrato";
import { corpusVigente } from "@/lib/fiscal/assistente/recuperacao";
import { referenciaAtiva } from "@/lib/fiscal/consulta";

// ─── O LAÇO ──────────────────────────────────────────────────────────────────
//
// ⚠⚠ O TETO DE RODADAS É DE SEGURANÇA, NÃO DE ECONOMIA. Sem ele, um modelo confuso chama a mesma
// ferramenta em círculo até a rota morrer — e o usuário recebe HTML no lugar de JSON, que é como a
// Vercel mata uma função. Seis rodadas cobrem com folga a cadeia mais longa que desenhei
// (classificação → NCM → CFOP → regra → legislação → simulação).
const MAX_RODADAS = 6;

/** ⚠ Prazo ABSOLUTO, repassado a cada chamada. A rota declara `maxDuration`; isto fica abaixo. */
const ORCAMENTO_MS = 55_000;

/**
 * ⚠⚠ AS VERSÕES SÃO RESOLVIDAS UMA VEZ POR EXECUÇÃO (parecer do Codex): *"resolva as versões uma
 * vez por execução para evitar misturar referências durante uma atualização"*. Se a sincronização
 * da TIPI terminar no meio de uma resposta, a resposta inteira continua falando da mesma versão.
 */
async function referenciasDaExecucao() {
  const [ref, corpus] = await Promise.all([referenciaAtiva(), corpusVigente()]);
  return {
    tipiVersaoId: ref.tipi?.id ?? null,
    tipiSha256: ref.tipi?.fonte?.sha256 ?? null,
    tipiObservadoEm: ref.tipi?.observadoEm ?? null,
    normas: [...new Set(corpus.map((c) => c.normaChave))],
    dispositivos: corpus.length,
    modelo: MODELO,
    precoVersao: PRECOS.versao,
    resolvidoEm: new Date().toISOString(),
  };
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
export async function responder({ historico, pergunta, aoProgredir = () => {} }) {
  const ate = Date.now() + ORCAMENTO_MS;
  const referencias = await referenciasDaExecucao();
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

  for (let i = 0; i < MAX_RODADAS; i++) {
    const r = await rodada({ sistema, mensagens, ferramentas: ESQUEMAS, ateMs: ate });
    uso.entrada += r.uso.entrada; uso.saida += r.uso.saida;
    uso.cacheLido += r.uso.cacheLido; uso.cacheEscrito += r.uso.cacheEscrito;
    if (r.texto) texto = r.texto;

    if (!r.chamadas.length) break;

    mensagens.push({ role: "assistant", content: r.bruto });
    const resultados = [];
    for (const c of r.chamadas) {
      aoProgredir({ etapa: "ferramenta", nome: c.nome });
      const saida = await executar(c.nome, c.argumentos);
      executadas.push({ nome: c.nome, argumentos: c.argumentos, estrutura: saida.estrutura });
      if (saida.bloco) blocos.push(saida.bloco);
      resultados.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(saida.estrutura).slice(0, 12_000) });
    }
    mensagens.push({ role: "user", content: resultados });

    // ⚠ Sem tempo para mais uma rodada: sai com o que tem em vez de estourar o prazo da rota.
    if (Date.now() > ate - 8_000) break;
  }

  // ⚠⚠ A CONFERÊNCIA É A ÚLTIMA COISA, E ELA VÊ O TEXTO FINAL CONTRA OS BLOCOS QUE DE FATO SAÍRAM.
  const { avisos } = conferirProsa(texto, blocos);

  return {
    conteudo: texto || "Não consegui formular uma resposta com as fontes disponíveis. Refaça a pergunta descrevendo a operação, ou consulte as abas de NCM, CFOP e Simulador.",
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
  };
}
