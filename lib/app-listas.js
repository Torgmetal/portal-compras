// O APP TORG ENGENHARIA IMPORTA LE/LPC NO PORTAL — e recebe RECIBO, não previsão.
//
// ⚠⚠ "PREVISTO" E "GRAVADO" SÃO COISAS DIFERENTES, E O APP VÊ AS DUAS. A LE R01 da OP-102 foi arquivada
// dizendo "18 incluídas" e nenhuma entrou no banco (ver CLAUDE.md, "Import de lista — o recibo tem que
// ser recibo"). O diff é calculado ANTES de gravar; o que vale como recibo são os counts das escritas.
// A frase de divergência é a MESMA da tela (`alertaDeDivergencia`/`divergencia` de revisao-lista.js):
// duas regras para a mesma pergunta é como os buracos nascem.
//
// Ordem: ler o XLSX → gravar no banco → arquivar no SharePoint → recibo → AuditLog. Falha ao arquivar
// NÃO desfaz o banco (as peças já estão lá e valem); volta em `avisoArquivo` para o projetista subir à mão.
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { importarLeRows, resolverOpDaLe } from "@/lib/importar-le-core";
import { parseLPC } from "@/lib/parse-lpc";
import { importarLpcMerge } from "@/lib/importar-lpc-merge";
import { marcasDoParsed } from "@/lib/lpc-diff";
import { chaveParaOParser } from "@/lib/lpc-chave";
import { salvarListaNoServidor } from "@/lib/sharepoint-lista";
import { alertaDeDivergencia, divergencia, montarAbaRevisao } from "@/app/engenharia/listas/revisao-lista";

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status });

function lerRows(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
    return { wb, rows };
  } catch (e) {
    throw erro(400, "Não consegui ler a planilha: " + e.message);
  }
}

// ⚠⚠ OP INEXISTENTE É RECUSA, NÃO PEÇA ÓRFÃ. A tela grava a LE mesmo sem achar a OP (opId nulo) e mostra
// "OP não encontrada" na hora; o app só veria isso no recibo, DEPOIS de 500 peças gravadas sob um número
// digitado errado. Resolve ANTES de qualquer escrita, com a mesma regra do import (`resolverOpDaLe`).
async function opDaLeOuRecusa(opNumero) {
  const op = await resolverOpDaLe(opNumero);
  if (!op) throw erro(404, `OP ${opNumero} não encontrada no portal.`);
  return op;
}

async function gravarLe(rows, { opNumero, sobrescrever, userId }) {
  const op = await opDaLeOuRecusa(opNumero);
  const r = await importarLeRows(rows, { opNumero, sobrescrever, userId });
  const d = r.diff || {};
  return {
    opEncontrada: true, opCadastrada: String(op.numero), chaveGravada: String(op.numero),
    j: r, // a resposta da rota da tela, tal e qual — é o que a aba "Revisao" espera
    previsto: { incluidas: d.nIncluidas || 0, alteradas: d.nAlteradas || 0, removidas: d.nRemovidas || 0 },
    gravado: { criados: r.criados, atualizados: r.atualizados, ignorados: r.ignorados },
    alerta: divergencia(r, sobrescrever),
  };
}

async function gravarLpc(rows, { opNumero, arquivoNome, revisao, userId }) {
  // ⚠⚠ A CHAVE DA LPC É A FASE (T94A), NUNCA O NÚMERO DA OP — mesma regra da tela (lib/lpc-chave.js):
  // a OP-094 entrou sob "094" e "T94A" e duplicou 591 marcas. Sem fase no nome do arquivo nem nas
  // marcas, recusa em vez de cair no número: a tela tem como avisar a duplicação, o app não.
  const parsed = parseLPC(rows, { opNumeroForcado: chaveParaOParser({ arquivoNome, opForcada: opNumero }) });
  if (parsed.erro) throw erro(400, parsed.erro);
  if (!parsed.opNumero) throw erro(400, "Não consegui detectar a fase da LPC. Nomeie o arquivo com a fase (ex.: T83F-LPC_R01.xlsx) e envie de novo.");
  // O parser ainda pode cair no número (marca sem fase, "089"): a tela resolve isso com o banco
  // (`chaveAjustadaPeloBanco`) e avisa; o app não tem quem leia o aviso. Só fase entra.
  const chave = String(parsed.opNumero).trim().toUpperCase();
  if (!/^T\d+[A-Z]+$/.test(chave)) {
    throw erro(400, `A LPC precisa da fase (ex.: T94A) no nome do arquivo ou nas marcas — veio "${parsed.opNumero}". `
      + "O app não importa LPC sem fase: gravada sob o número da OP ela duplica as peças que já estão sob a fase (foi o que aconteceu com a OP-094).");
  }
  // ⚠ A FASE TEM QUE SER DA MESMA OP. O banco grava sob a fase (T94A), o SharePoint arquiva na pasta da OP
  // pedida e o recibo fala da OP pedida — fase de outra obra faria os três discordarem sem ninguém ver.
  const digitosFase = parseInt(chave.match(/\d+/)[0], 10);
  const digitosOp = parseInt((String(opNumero).match(/\d+/) || [])[0], 10);
  if (digitosFase !== digitosOp) {
    throw erro(400, `A fase ${chave} não é da OP ${opNumero}. Confira o nome do arquivo e a OP escolhida no app.`);
  }

  const r = await importarLpcMerge(parsed, { userId, revisao: Number(revisao.slice(1)), arquivo: arquivoNome });
  if (r.erro) throw erro(422, r.erro);

  // ⚠ O merge da LPC não tem "sobrescrever": ele sempre MESCLA (remove só o que não produziu). Por isso o
  // alerta usa o modo complementar — esperado = marcas novas previstas × criadas de fato. Com o modo
  // sobrescrever, o esperado seria o arquivo inteiro, e o merge não regrava marca inalterada: alarme falso.
  const previsto = { incluidas: r.adicionadas.length, alteradas: r.alteradas.length, removidas: r.removidas.length };
  const g = r.gravado;
  const gravado = { criados: g.criados, atualizados: g.atualizados, ignorados: Math.max(0, previsto.incluidas - g.criados) };
  const alerta = alertaDeDivergencia({
    previu: previsto.incluidas, criou: gravado.criados, atualizou: gravado.atualizados, ignorou: gravado.ignorados,
    jaNaOutraLista: [], sobrescrever: false, totalNoArquivo: r.totalNovo,
  });

  // A mesma forma da resposta da LE, para a aba "Revisao" do arquivo arquivado sair igual à da tela.
  const novas = marcasDoParsed(parsed);
  const j = {
    opNumero: r.opNumero, obra: r.obra, totalNoArquivo: r.totalNovo, ...gravado,
    diff: {
      nIncluidas: previsto.incluidas, nAlteradas: previsto.alteradas, nRemovidas: previsto.removidas,
      incluidas: r.adicionadas.map((marca) => ({ marca, peso: novas.get(marca)?.pesoTotalKg ?? "" })),
      alteradas: r.alteradas.map((marca) => ({ marca, de: "", para: novas.get(marca)?.pesoTotalKg ?? "" })),
      removidas: r.removidas.map((marca) => ({ marca, peso: "" })),
    },
  };
  return {
    j, previsto, gravado, alerta, conflitos: r.conflitos?.length || 0,
    opEncontrada: !!r.opEncontrada, opCadastrada: r.opCadastrada || null, chaveGravada: r.opNumero,
  };
}

// Revisão (R01+) leva a aba "Revisao" embutida no arquivo arquivado, como a tela faz. Falhar aqui arquiva o
// arquivo como veio — o recibo continua na resposta e no AuditLog.
function bufferParaArquivar({ wb, buffer, tipo, revisao, j, sobrescrever }) {
  if (revisao === "R00") return buffer;
  try {
    const idx = wb.SheetNames.indexOf("Revisao");
    if (idx >= 0) { wb.SheetNames.splice(idx, 1); delete wb.Sheets.Revisao; }
    const aba = montarAbaRevisao({ sigla: tipo, j, revLabel: revisao, sobrescrever: tipo === "LE" && sobrescrever });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba), "Revisao");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  } catch {
    return buffer;
  }
}

/**
 * @param {{ tipo:"LE"|"LPC", opNumero:string, revisao:string, arquivoNome:string, buffer:Buffer,
 *   sobrescrever?:boolean, userId:string, aparelhoId?:string }} p
 */
export async function importarListaDoApp({ tipo, opNumero, revisao, arquivoNome, buffer, sobrescrever = false, userId, aparelhoId = null }) {
  // ⚠ O merge da LPC não tem modo "sobrescrever" (ele sempre mescla e preserva o progresso de produção).
  // Aceitar a bandeira calado faria o projetista achar que apagou a lista anterior.
  if (tipo === "LPC" && sobrescrever) throw erro(400, "Não dá para sobrescrever: a LPC pelo app só entra em modo complementar (mescla com a lista que já está no portal).");
  const { wb, rows } = lerRows(buffer);

  const r = tipo === "LE"
    ? await gravarLe(rows, { opNumero, sobrescrever, userId })
    : await gravarLpc(rows, { opNumero, arquivoNome, revisao, userId });

  let arquivo = null;
  let avisoArquivo;
  try {
    const salvo = await salvarListaNoServidor({
      tipo, opNumero, fileNome: arquivoNome,
      buffer: bufferParaArquivar({ wb, buffer, tipo, revisao, j: r.j, sobrescrever }),
    });
    arquivo = { webUrl: salvo.webUrl, caminho: salvo.caminho };
  } catch (e) {
    avisoArquivo = `As peças foram gravadas, mas o arquivo NÃO foi arquivado na pasta da OP: ${e.message} Suba o arquivo à mão.`;
  }

  const recibo = {
    ok: true, tipo, opNumero,
    // De qual OP o banco falou e sob que chave gravou ("89" pedida → "089" cadastrada; LPC → a fase).
    opEncontrada: r.opEncontrada, opCadastrada: r.opCadastrada, chaveGravada: r.chaveGravada,
    previsto: r.previsto, gravado: r.gravado,
    divergente: !!r.alerta, alerta: r.alerta || null,
    arquivo,
    ...(avisoArquivo ? { avisoArquivo } : {}),
    ...(tipo === "LPC" && r.conflitos ? { conflitos: r.conflitos } : {}),
  };

  await prisma.auditLog.create({
    data: {
      userId, action: "IMPORTAR_LISTA_APP", entity: "PecaConjunto", entityId: String(opNumero),
      diff: { tipo, revisao, aparelhoId, arquivoNome, previsto: r.previsto, gravado: r.gravado, divergente: recibo.divergente, arquivado: !!arquivo },
    },
  }).catch(() => {}); // o registro de auditoria nunca derruba um import que já gravou

  return recibo;
}
