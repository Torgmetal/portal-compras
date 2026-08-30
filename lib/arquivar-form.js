import "server-only";
import { uploadFileToFolder, getAccessToken } from "./sharepoint";

// ─── ARQUIVAR O FORMULÁRIO NO SHAREPOINT ──────────────────────────────────────
// Vitor (30/08/2026): "os que não estiverem salvando vamos verificar para começarmos a salvar" e,
// sobre onde: "criei em quase todos os setores uma pasta azul escrito workspace (…) o ideal seria
// separarmos por pastas do que se trata cada documento e dentro colocar outras pastas mencionando
// qual OP seria".
//
// Dos sete formulários que o portal emite, só dois iam para o SharePoint — os romaneios, que são
// justamente os que SAEM da empresa. Os cinco internos existiam só como registro no banco mais um
// PDF gerado no clique.
//
// ⚠⚠ PDF GERADO SOB DEMANDA NÃO É REGISTRO, É VISTA. Se a RNC for editada depois, imprimir de novo
// devolve um documento diferente, e ninguém consegue provar o que estava escrito quando ela foi
// enviada ao fornecedor. A §7.5.3.2 pede proteção contra alteração não intencional; documento que se
// reescreve a cada impressão não tem isso. O arquivo congela o que foi dito na hora em que valeu.
//
// ⚠ ARQUIVA NO ATO QUE TORNA OFICIAL, não a cada preview — mesma regra que o `relatorio-arquivo.js`
// já segue. Rascunho aberto dez vezes por dia encheria a pasta e ninguém saberia qual vale.
//
// ⚠ E NUNCA DERRUBA O FLUXO DE QUEM CHAMOU. Encerrar uma RNC não pode falhar porque o SharePoint
// está fora do ar — isso transformaria o SharePoint em dependência de disponibilidade do portal. A
// falha volta no retorno e fica registrada; quem confere vê pelo `arquivadoEm` vazio.

const nn = (v) => String(v ?? "").replace(/\D/g, "").padStart(3, "0");

/**
 * O caminho do documento: `/<Setor>/Workspace/<Tipo>/<OP-nnn | ano>`.
 *
 * ⚠ NEM TODO DOCUMENTO TEM OP, e forçar uma pasta de obra em quem não tem criaria uma "Sem OP"
 * gigante que não ajuda ninguém a achar nada. Cronograma de auditoria é do ano; relatório de
 * auditoria é do setor auditado; plano de ação nascido de indicador não tem obra. Para esses o
 * segundo nível é o ANO — que é, aliás, como a própria pasta `/Qualidade/RNC/1_RNC TORG` já se
 * organiza hoje (tem uma subpasta `2025`).
 */
export function pastaDoc({ setor, tipo, opNumero, ano }) {
  const base = `/${setor}/Workspace/${tipo}`;
  if (opNumero) return `${base}/OP-${nn(opNumero)}`;
  return `${base}/${ano || new Date().getUTCFullYear()}`;
}

/** Os tipos que o portal arquiva hoje, por setor. */
export const DOCS = {
  RNC:                 { setor: "Qualidade", tipo: "RNC" },
  PLANO_ACAO:          { setor: "Qualidade", tipo: "Planos de Ação" },
  AUDITORIA_INTERNA:   { setor: "Qualidade", tipo: "Auditorias Internas" },
};

/** Monta o caminho de um dos tipos conhecidos. */
export const pastaDe = (chave, { opNumero, ano } = {}) =>
  pastaDoc({ ...DOCS[chave], opNumero, ano });

// O `ensureFolder` de `sharepoint.js` só cria a pasta-folha (assume o pai existente). Aqui a cadeia
// inteira pode não existir: a pasta Workspace do setor está criada, mas `RNC/OP-089` não.
async function garantirCadeia(caminho) {
  const partes = caminho.replace(/^\/|\/+$/g, "").split("/").filter(Boolean);
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  let acumulado = "";
  for (const parte of partes) {
    const pai = acumulado;
    acumulado = `${acumulado}/${parte}`;
    const alvo = pai
      ? `https://graph.microsoft.com/v1.0/drives/${drive}/root:${encodeURI(pai)}:/children`
      : `https://graph.microsoft.com/v1.0/drives/${drive}/root/children`;
    const r = await fetch(alvo, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // "fail" e não "replace": se a pasta já existe, o certo é seguir em frente e não recriá-la
      // vazia por cima do que já está guardado ali.
      body: JSON.stringify({ name: parte, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!r.ok && r.status !== 409) {
      throw new Error(`não consegui criar ${acumulado}: ${r.status}`);
    }
  }
}

/**
 * Guarda o documento na pasta e devolve o que aconteceu — sem lançar.
 *
 * @param {{pasta: string, nomeArquivo: string, bytes: Uint8Array|Buffer, contentType?: string}} p
 * @returns {Promise<{ok: boolean, path: string|null, erro: string|null}>}
 */
export async function arquivarForm({ pasta, nomeArquivo, bytes, contentType }) {
  if (!pasta || !nomeArquivo || !bytes?.length) {
    return { ok: false, path: null, erro: "chamada sem pasta, nome ou conteúdo" };
  }
  try {
    await garantirCadeia(pasta);
    await uploadFileToFolder({
      folderPath: pasta,
      fileName: nomeArquivo,
      buffer: Buffer.from(bytes),
      contentType: contentType || "application/pdf",
      // ⚠ "replace": o documento oficial de um registro é UM. Reemitir depois de uma revisão tem de
      // substituir, não criar "RNC-017-26 1.pdf" ao lado — duas cópias divergentes é pior que uma
      // desatualizada, porque ninguém sabe qual foi a que valeu.
      conflict: "replace",
    });
    return { ok: true, path: `${pasta}/${nomeArquivo}`, erro: null };
  } catch (e) {
    return { ok: false, path: null, erro: e?.message || "falha ao arquivar" };
  }
}

/**
 * Arquiva e já grava o rastro no próprio registro, em um passo.
 *
 * `atualizar` recebe `{ arquivadoEm, arquivadoPath }` e persiste — quem chama decide a tabela. Só
 * grava quando deu certo: `arquivadoEm` vazio é a evidência de que ficou faltando, e é por ele que
 * dá para varrer depois o que precisa ser reenviado.
 */
export async function arquivarERegistrar({ pasta, nomeArquivo, bytes, contentType }, atualizar) {
  const r = await arquivarForm({ pasta, nomeArquivo, bytes, contentType });
  if (r.ok && typeof atualizar === "function") {
    await atualizar({ arquivadoEm: new Date(), arquivadoPath: r.path }).catch(() => {});
  }
  return r;
}
