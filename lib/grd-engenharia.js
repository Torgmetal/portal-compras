// ─── GRD DA ENGENHARIA (FORM 09) ──────────────────────────────────────────────────────────────
// Vitor (31/08/2026): "a engenharia emite uma planilha padrão do Tekla e coloca numa pasta (…) hoje
// não separamos por OP e sim por ordem numérica. Quero que puxe dessa pasta sempre que for colocada
// uma nova GRD e no portal separe por OP (…) para controlarmos o que foi liberado pelo setor, data
// e a revisão atual — fechar o que pede o procedimento da engenharia".
//
// Pasta: /Engenharia/13. GRD — 485 arquivos em 31/08/2026, no padrão
// `FORM 09 - GRD-<nº>_R<rev>.xlsx` (466 em R00, 17 em R01), mais o modelo em branco e a
// "Matriz GRD.xlsx", que é o controle feito à mão que esta tela substitui.
//
// Uma aba, e o cabeçalho carrega o que o controle precisa:
//   Nº: 481   DATA: 31/08/2026
//   De: Engenharia   Para: PCP   Referência: BIANCHINI
//   OP: T105B   Peso Total Liberado: 11071.98   Área da obra: LONGARINAS E...
//   Emitido: DIEGO
// Depois a tabela: Item | Nº do documento | Rev. | Descrição | F | S | CÓPIAS.

const txt = (v) => String(v ?? "").trim();
const limpo = (v) => txt(v).replace(/\s+/g, " ");

/** "T105B" → "105"; "T67" → "067". A OP no portal tem três dígitos (ver fmtOP). */
export function opDoCodigoTekla(codigo) {
  const m = txt(codigo).toUpperCase().match(/T\s*0*(\d+)/);
  return m ? String(m[1]).padStart(3, "0") : null;
}

/** "FORM 09 - GRD-481_R00.xlsx" → { numero: "481", revisao: 0 } */
export function dadosDoNome(nome) {
  const m = txt(nome).match(/GRD[-\s]?(\d+)[_-]?R(\d+)/i);
  if (!m) return null;
  return { numero: String(Number(m[1])), revisao: Number(m[2]) };
}

/**
 * Acha, em QUALQUER linha do bloco, o valor que vem depois de um rótulo.
 *
 * ⚠⚠ VARRE LINHA A LINHA, e a primeira versão não fazia isso: recebia o bloco inteiro e chamava
 * `map(txt)` sobre um array de arrays, o que transforma cada linha na string
 * ",,PCP,,,,,,OP: T105B,,,,". O regex casava nessa string e devolvia a linha toda como se fosse o
 * valor — "Para" virava `,,PCP,,,,,,OP: T105B,,,` e a data, o peso e a OP saíam nulos. Os itens
 * liam certo, o que tornava o erro fácil de não ver.
 */
function apos(bloco, rx) {
  for (const linha of bloco || []) {
    const cels = (Array.isArray(linha) ? linha : [linha]).map(txt);
    for (let i = 0; i < cels.length; i++) {
      const m = cels[i].match(rx);
      if (!m) continue;
      // o valor pode estar colado no rótulo ("Nº: 481") ou na próxima célula preenchida
      const colado = cels[i].slice(m.index + m[0].length).replace(/^[:\s]+/, "").trim();
      if (colado) return colado;
      for (let j = i + 1; j < cels.length; j++) if (cels[j]) return cels[j];
    }
  }
  return null;
}

/** Data em "31/08/2026" ou serial do Excel → Date (meio-dia BRT, para não virar o dia). */
function lerData(v) {
  if (v instanceof Date) return v;
  const s = txt(v);
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T15:00:00.000Z`);
  const n = Number(s);
  // serial do Excel (dias desde 30/12/1899)
  if (Number.isFinite(n) && n > 20000 && n < 60000) return new Date(Math.round((n - 25569) * 86400000) + 15 * 3600000);
  return null;
}

const numBr = (v) => {
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {any[][]} grade  linhas da planilha (sheet_to_json header:1)
 * @param {string} nomeArquivo
 */
export function lerGrd(grade, nomeArquivo = "") {
  const linhas = Array.isArray(grade) ? grade : [];
  const doNome = dadosDoNome(nomeArquivo) || {};
  const cab = linhas.slice(0, 12);

  const numero = txt(apos(cab, /N[ºo°]\s*:/i)) || doNome.numero || null;
  const opCru = apos(cab, /\bOP\s*:/i);
  const emitido = apos(linhas, /Emitido\s*:/i);

  // ⚠ O CABEÇALHO DA TABELA É A FRONTEIRA. Sem ele eu não sei onde os documentos começam, e ler
  // "por linha que tem número" pegaria a legenda de finalidade (A, B, C…) como se fosse documento.
  const iCab = linhas.findIndex((l) => (l || []).some((c) => /^n[ºo°]?\.?\s*do\s+documento/i.test(txt(c))));
  const itens = [];
  if (iCab >= 0) {
    for (let r = iCab + 1; r < linhas.length; r++) {
      const l = linhas[r] || [];
      const item = txt(l[0]);
      if (!/^\d+$/.test(item)) {
        if (/^observa/i.test(item) || /^emitido/i.test(item)) break;
        continue;
      }
      // ⚠⚠ CÉLULAS MESCLADAS REPETEM O VALOR. O Tekla mescla "Nº do documento" e "Descrição" sobre
      // três colunas, então a linha chega com o mesmo texto repetido. Deduplicar consecutivos é o
      // que devolve a linha à forma que ela tem na tela.
      const cels = l.slice(1).map(txt);
      const unicos = cels.filter((c, i2) => c && c !== cels[i2 - 1]);
      // último dos que têm 1 letra: F e S; o número final: cópias
      const copias = numBr(unicos[unicos.length - 1]);
      const letras = unicos.filter((c) => /^[A-Z]$/i.test(c));
      const semLetras = unicos.filter((c) => !/^[A-Z]$/i.test(c));
      const documento = semLetras[0] || null;
      // a revisão é o número curto logo depois do documento
      const rev = semLetras.slice(1).find((c) => /^\d{1,2}$/.test(c)) ?? null;
      const descricao = semLetras.slice(1).find((c) => c.length > 3 && c !== documento) || null;
      itens.push({
        item: Number(item),
        documento,
        revisao: rev == null ? null : String(rev),
        descricao: descricao ? limpo(descricao) : null,
        finalidade: letras[0] || null,
        situacao: letras[1] || null,
        copias: copias ?? null,
      });
    }
  }

  return {
    numero: numero ? String(numero).replace(/\D/g, "") || String(numero) : null,
    revisao: doNome.revisao ?? 0,
    data: lerData(apos(cab, /DATA\s*:/i)),
    de: apos(cab, /\bDe\s*:/i),
    para: apos(cab, /\bPara\s*:/i),
    referencia: apos(cab, /Refer[êe]ncia\s*:/i),
    opCodigo: opCru ? limpo(opCru) : null,
    opNumero: opDoCodigoTekla(opCru),
    pesoKg: numBr(apos(cab, /Peso\s+Total\s+Liberado\s*:/i)),
    area: apos(cab, /[ÁA]rea\s+da\s+obra\s*:/i),
    emitidoPor: emitido ? limpo(emitido) : null,
    itens,
  };
}
