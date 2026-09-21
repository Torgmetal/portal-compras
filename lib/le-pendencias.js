// ─── A L.E. DO SERVIDOR CONTRA A DO PORTAL ───────────────────────────────────
//
// O import da Lista de Expedição é MANUAL, e ninguém percebe quando atrasa. Duas obras provaram o
// custo em setembro de 2026: a OP-084 passou TRÊS SEMANAS com a R07 no portal enquanto o servidor
// já tinha a R08 (9 marcas a mais, que sumiriam da expedição), e a OP-104 teve o arquivo TROCADO
// sob o mesmo nome de revisão — caso que nem olhando o nome do arquivo alguém pegaria.
//
// ⚠⚠ ISTO SÓ AVISA, NUNCA IMPORTA. Decisão do Matheus (14/09/2026), e é a decisão certa: a revisão
// mexe em marca que já tem etiqueta impressa e peça conferida (a OP-105 mostrou isso na prática).
// Trocar a lista de uma obra sem ninguém olhar é pior que o atraso que o aviso resolve.

/** As situações que o cron reporta. A ordem aqui é a ordem de gravidade. */
export const SITUACAO = {
  NUNCA_IMPORTADA: "nunca-importada",
  REVISAO_NOVA: "revisao-nova",
  ARQUIVO_TROCADO: "arquivo-trocado",
  EM_DIA: "em-dia",
  SEM_ARQUIVO: "sem-arquivo",
};

const quando = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * Compara o que está no SharePoint com o que o portal importou.
 *
 * ⚠⚠ RECEBE TODOS OS REGISTROS DA OBRA, NÃO SÓ O ÚLTIMO — e isso é um conserto, não zelo. A mesma
 * OP pode ter mais de uma FRENTE (`ListaExpedicao.frente`): a OP-085 tem `T85-LE` e
 * `T85-LE-R01 GALV`, cada uma com seu arquivo. Comparando o arquivo do servidor contra a
 * importação mais RECENTE da obra, o arquivo que já estava importado pela outra frente aparecia
 * como "revisão nova" — falso positivo na primeira execução real (15/09/2026, achado do Codex).
 * Procurar o arquivo do servidor ENTRE TODOS os registros é o que faz a pergunta significar
 * "este arquivo já entrou?".
 *
 * @param {{nome:string, itemId?:string, modificadoEm?:string|Date}[]} arquivos  do servidor
 * @param {{arquivo?:string, frente?:string, fileModificado?:Date, importadoEm?:Date}[]} registros  do portal
 */
export function compararLista(arquivos, registros) {
  const doServidor = (arquivos || [])
    .slice()
    .sort((a, b) => (quando(b.modificadoEm) ?? 0) - (quando(a.modificadoEm) ?? 0))[0];
  const todos = registros || [];

  if (!doServidor) return { situacao: SITUACAO.SEM_ARQUIVO, arquivo: null };
  if (!todos.length) {
    return { situacao: SITUACAO.NUNCA_IMPORTADA, arquivo: doServidor.nome, modificadoEm: doServidor.modificadoEm };
  }

  const mesmoNome = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const registro = todos.find((r) => mesmoNome(r.arquivo, doServidor.nome));
  const base = { arquivo: doServidor.nome, modificadoEm: doServidor.modificadoEm };

  // ⚠ Nome nenhum bateu: o arquivo vigente do servidor nunca entrou. O que o portal tem é o
  // registro mais recente — é o que a frase mostra, para quem lê saber de onde ele está saindo.
  if (!registro) {
    return { ...base, situacao: SITUACAO.REVISAO_NOVA, noPortal: todos[0]?.arquivo || null };
  }

  // ⚠⚠ MESMO NOME NÃO QUER DIZER MESMO ARQUIVO — foi o que aconteceu na OP-104. A engenharia
  // corrige a planilha e salva por cima, mantendo a revisão. Só a data de modificação denuncia.
  const noServidor = quando(doServidor.modificadoEm);
  const conhecido = quando(registro.fileModificado);
  // Sem uma das duas datas não dá para afirmar nada: registro antigo não guardava `fileModificado`,
  // e chamar isso de "trocado" encheria o aviso de obra que está em dia.
  if (noServidor !== null && conhecido !== null && noServidor > conhecido) {
    return { ...base, situacao: SITUACAO.ARQUIVO_TROCADO, noPortal: registro.arquivo, conhecidoEm: registro.fileModificado };
  }

  return { ...base, situacao: SITUACAO.EM_DIA, noPortal: registro.arquivo };
}

/** Só o que merece aviso — `em-dia` e `sem-arquivo` não viram linha de e-mail. */
export const pendentes = (linhas) =>
  (linhas || []).filter((l) => [SITUACAO.NUNCA_IMPORTADA, SITUACAO.REVISAO_NOVA, SITUACAO.ARQUIVO_TROCADO]
    .includes(l.situacao));

const FRASE = {
  [SITUACAO.NUNCA_IMPORTADA]: "nunca importada no portal",
  [SITUACAO.REVISAO_NOVA]: "revisão mais nova no servidor",
  [SITUACAO.ARQUIVO_TROCADO]: "arquivo trocado com o mesmo nome",
};

/** A frase de uma linha, como sai no e-mail e no sino. */
export function frase(linha) {
  const o = FRASE[linha.situacao] || linha.situacao;
  if (linha.situacao === SITUACAO.REVISAO_NOVA) return `${o}: ${linha.arquivo} (o portal tem ${linha.noPortal})`;
  return `${o}: ${linha.arquivo}`;
}
