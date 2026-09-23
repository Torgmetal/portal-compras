import { OPERACOES } from "@/lib/fiscal/cfop";

// ─── A CONFERÊNCIA DA CADEIA DE DOCUMENTOS ───────────────────────────────────
//
// Responde, para uma obra real: **o que eu localizei, e até onde consegui conferir.**
//
// ⚠⚠ ELA NUNCA DIZ "FALTA UMA NOTA". O portal enxerga o que a TORG emitiu e nada mais: a venda da
// matéria-prima pelo FORNECEDOR e a remessa SIMBÓLICA do CLIENTE (art. 406, II) não passam pelo
// Omie da TORG — e são justamente as que mais faltam na prática. Foi exatamente essa remessa
// simbólica que eu tinha omitido da cadeia e que o briefing apontou. Chamar de "ausente" o que
// nunca esteve ao alcance seria trocar um silêncio por uma afirmação falsa.
//
// ⚠⚠ E "NÃO LOCALIZADO" NÃO É "NÃO EXISTE". Nem toda nota da TORG passa por medição: a remessa
// para industrialização sai por outro caminho. Toda negativa carrega o ESCOPO em que foi
// procurada — "não localizada nas medições e romaneios desta OP", nunca "ausente da OP".

export const ESTADO = {
  /** Documento localizado, com vínculo verificável à obra. */
  ENCONTRADO: "ENCONTRADO",
  /** Procurado nas fontes declaradas e não achado. ⚠ Não significa inexistência. */
  NAO_ENCONTRADO: "NAO_ENCONTRADO",
  /** Emitente de fora, ou sem fonte/vínculo confiável — o portal não tem como conferir. */
  FORA_DO_ALCANCE: "FORA_DO_ALCANCE",
  /** ⚠⚠ A consulta falhou ou ficou incompleta. Nunca vira ausência. */
  NAO_CONSULTADO: "NAO_CONSULTADO",
};

/** ⚠ `"5925/6925"` são ALTERNATIVAS (dentro e fora do estado), não um código fundido. */
export const cfopsDaNota = (cfop) =>
  String(cfop ?? "").split("/").map((c) => c.replace(/\D/g, "")).filter((c) => c.length === 4);

/** ⚠ Documento cancelado é EVIDÊNCIA, não cumprimento da etapa. */
const valeComoCumprimento = (d) => !/CANCELAD/i.test(String(d.situacao ?? ""));

export const operacaoPorId = (id) => OPERACOES.find((o) => o.id === id) ?? null;

function classificar(nota, documentos, cobertura) {
  const alvos = cfopsDaNota(nota.cfop);
  const base = {
    quem: nota.quem, cfop: nota.cfop, papel: nota.papel, natureza: nota.natureza ?? null,
    fundamento: nota.fundamento ?? null, cita: nota.cita ?? null, obs: nota.obs ?? null,
    // ⚠⚠ NOTA CONDICIONAL NÃO É ITEM DE CHECKLIST (achado do Codex, 23/09/2026). A cadeia de "uma
    // venda e dois caminhões" descreve DOIS cenários no mesmo array, e o 5.922 só existe num
    // deles. Cobrar os dois marcaria como defeito o comportamento correto.
    condicional: nota.condicional ?? null,
    evidencias: [],
  };

  // ── Emitente de fora: não é ausência, é falta de alcance ───────────────────
  if (nota.quem !== "TORG") {
    return { ...base, estado: ESTADO.FORA_DO_ALCANCE,
      motivo: `Emitida por ${nota.quem} — não passa pelo Omie da TORG. Só se confere pelo documento recebido.` };
  }

  // ⚠ Sem CFOP declarado na cadeia não há por onde casar; dizer "não achei" seria mentir sobre
  // uma busca que nunca teve critério.
  if (!alvos.length) {
    return { ...base, estado: ESTADO.FORA_DO_ALCANCE,
      motivo: "A cadeia não fixa um CFOP para esta etapa — não há por onde localizá-la automaticamente." };
  }

  const casaram = documentos.filter((d) => (d.cfops ?? []).some((c) => alvos.includes(c)));
  const cumprem = casaram.filter(valeComoCumprimento);
  if (cumprem.length) {
    return { ...base, estado: ESTADO.ENCONTRADO, evidencias: casaram,
      motivo: `${cumprem.length} documento(s) com CFOP ${alvos.join(" ou ")} vinculado(s) a esta obra.`
        + (casaram.length > cumprem.length ? " ⚠ Há também documento cancelado, que não conta como cumprimento." : "") };
  }

  // ⚠⚠ CONSULTA QUE FALHOU NÃO VIRA AUSÊNCIA. Se nenhuma fonte respondeu, o estado é "não
  // consultado" — o pior caso de dizer isso é pedir uma nova tentativa; o de dizer "não existe" é
  // alguém deixar de emitir um documento que a cadeia exige.
  if (cobertura.falhas?.length && !cobertura.fontes?.length) {
    return { ...base, estado: ESTADO.NAO_CONSULTADO, evidencias: casaram,
      motivo: `Nenhuma fonte respondeu: ${cobertura.falhas.join("; ")}.` };
  }

  return { ...base, estado: ESTADO.NAO_ENCONTRADO, evidencias: casaram,
    motivo: `Não localizada em ${cobertura.escopo}.`
      + (casaram.length ? " ⚠ Há documento com este CFOP, mas cancelado." : "")
      + (cobertura.falhas?.length ? ` ⚠ A busca ficou incompleta: ${cobertura.falhas.join("; ")}.` : "") };
}

/**
 * @param {object} operacao  um verbete de OPERACOES
 * @param {object[]} documentos  [{ origem, cfops[], numero, serie, chave, emitidaEm, situacao, vinculo }]
 * @param {{fontes:string[], escopo:string, falhas?:string[], consultadoEm?:Date}} cobertura
 */
export function conferirCadeia(operacao, documentos, cobertura) {
  const etapas = (operacao?.notas ?? []).map((n) => classificar(n, documentos ?? [], cobertura ?? {}));
  const conta = (e) => etapas.filter((x) => x.estado === e).length;
  // ⚠ A etapa condicional fica FORA da contagem de "não localizadas": ela pode não existir neste
  // caso e estar tudo certo. Ela aparece na lista, com o seu "só se" escrito.
  const naoLocalizadas = etapas.filter((x) => x.estado === ESTADO.NAO_ENCONTRADO && !x.condicional).length;

  // ⚠⚠ QUEM CASOU SAI POR ID, NÃO POR IDENTIDADE DE OBJETO. A tela recebe tudo por JSON, e depois
  // do `JSON.parse` a evidência da etapa e o documento da lista são objetos DIFERENTES com o mesmo
  // conteúdo — um `includes` por referência devolveria "nenhum casou" e marcaria a obra inteira
  // como órfã. Peguei isto escrevendo a tela, antes de rodar.
  const casados = [...new Set(etapas.flatMap((e) => e.evidencias.map((d) => d.id)).filter(Boolean))];

  return {
    casados,
    operacao: { id: operacao?.id ?? null, titulo: operacao?.titulo ?? null, alerta: operacao?.alerta ?? null,
      fundamento: operacao?.fundamento ?? null },
    etapas,
    cobertura,
    resumo: {
      etapas: etapas.length,
      encontradas: conta(ESTADO.ENCONTRADO),
      naoLocalizadas,
      condicionaisNaoLocalizadas: etapas.filter((x) => x.estado === ESTADO.NAO_ENCONTRADO && x.condicional).length,
      foraDoAlcance: conta(ESTADO.FORA_DO_ALCANCE),
      naoConsultadas: conta(ESTADO.NAO_CONSULTADO),
    },
    // ⚠⚠ A FRASE DE FECHO NUNCA DIZ "CADEIA COMPLETA". Presença de CFOP não prova que a etapa foi
    // cumprida em quantidade, valor ou carga — e metade da cadeia nem passa por aqui.
    ressalva: "Esta conferência diz o que foi LOCALIZADO nas fontes consultadas, e até onde foi possível conferir. "
      + "Ela não afirma que a cadeia está completa: os documentos de terceiros não passam pelo Omie da TORG, e a "
      + "presença de um CFOP não prova que a etapa foi cumprida em quantidade, valor ou carga.",
  };
}
