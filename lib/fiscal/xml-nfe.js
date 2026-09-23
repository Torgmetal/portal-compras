import { DOMParser } from "@xmldom/xmldom";
import { ncmNaDescricao } from "@/lib/fiscal/pedido-omie";

// ─── O XML DA NF-e, LIDO ─────────────────────────────────────────────────────
//
// Este arquivo NÃO julga nada: transforma o XML no documento normalizado que o motor de auditoria
// consome. Separado de propósito — quem lê o formato não pode ser quem decide o que está certo.
//
// ⚠⚠ POR QUE O XML E NÃO O OMIE. Medido na NF-e 973 (22/09/2026): o `ListarNF` do Omie devolve NCM,
// CFOP, valores e alíquotas, mas **não devolve `CST`, `cEnq` nem `infAdProd`**. E os 24 itens da 973
// têm o MESMO código de produto (`ARM000010`) e a MESMA descrição — Matheus: *"usamos o item ARMAÇÃO
// DE ESTRUTURA METÁLICA para todos os faturamentos; o que é cada um vai na descrição do item"*. Sem
// o `infAdProd`, os itens são indistinguíveis. O Omie ACHA a divergência; o XML diz o que ela é.
//
// ⚠ DOM de verdade, não regex. É documento com valor legal: entidade escapada, namespace e ordem de
// tags são detalhes que uma expressão regular erra em silêncio — e errar aqui vira apontamento
// fiscal errado.

const texto = (no, tag) => {
  const e = no?.getElementsByTagName(tag)?.[0];
  return e ? (e.textContent ?? "").trim() : null;
};
const numero = (no, tag) => {
  const t = texto(no, tag);
  if (t == null || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * O grupo de IPI do item.
 *
 * ⚠⚠ O CST MORA DENTRO DE `IPITrib` OU `IPINT`, e a escolha entre os dois JÁ É a declaração: `IPINT`
 * é "não tributado / isento / suspenso" e `IPITrib` é "tributado". Ler só o `<IPI>` de fora perderia
 * justamente o que a auditoria precisa comparar.
 *
 * ⚠ `cEnq` fica no nível do `<IPI>`, fora dos dois — é do enquadramento legal, não da tributação.
 */
function lerIpi(det) {
  const ipi = det.getElementsByTagName("IPI")?.[0];
  if (!ipi) return { grupo: null, cst: null, cEnq: null, aliquota: null, valor: null, base: null };
  const trib = ipi.getElementsByTagName("IPITrib")?.[0];
  const nt = ipi.getElementsByTagName("IPINT")?.[0];
  const dentro = trib ?? nt ?? ipi;
  return {
    grupo: trib ? "IPITrib" : nt ? "IPINT" : null,
    cst: texto(dentro, "CST"),
    cEnq: texto(ipi, "cEnq"),
    aliquota: trib ? numero(trib, "pIPI") : null,
    valor: trib ? numero(trib, "vIPI") : 0,
    base: trib ? numero(trib, "vBC") : null,
  };
}

/** ⚠ O CST de ICMS vive num dos ~10 grupos (`ICMS00`, `ICMS20`, `ICMSSN101`…). Pegamos o primeiro
 *  filho de `<ICMS>`, que é como o layout da NF-e o define — sem listar grupo por grupo. */
function lerIcms(det) {
  const icms = det.getElementsByTagName("ICMS")?.[0];
  if (!icms) return { cst: null, aliquota: null, valor: null, base: null };
  const grupo = Array.from(icms.childNodes).find((n) => n.nodeType === 1) ?? icms;
  return {
    grupo: grupo.nodeName,
    cst: texto(grupo, "CST") ?? texto(grupo, "CSOSN"),
    aliquota: numero(grupo, "pICMS"),
    valor: numero(grupo, "vICMS"),
    base: numero(grupo, "vBC"),
  };
}

/**
 * O XML inteiro, normalizado.
 *
 * @returns {{erro:string}|{chave,numero,serie,emitidaEm,emitente,destinatario,itens,referenciadas,totais}}
 */
export function lerNfe(xml) {
  const bruto = String(xml ?? "");
  if (!bruto.includes("<NFe") && !bruto.includes("<infNFe")) {
    return { erro: "O arquivo não parece uma NF-e (não há `infNFe`)." };
  }
  let doc;
  try {
    doc = new DOMParser({ onError: () => {} }).parseFromString(bruto, "text/xml");
  } catch (e) {
    return { erro: `XML inválido: ${e.message}` };
  }
  const inf = doc.getElementsByTagName("infNFe")?.[0];
  if (!inf) return { erro: "XML sem o bloco `infNFe`." };

  const ide = inf.getElementsByTagName("ide")?.[0];
  const emit = inf.getElementsByTagName("emit")?.[0];
  const dest = inf.getElementsByTagName("dest")?.[0];

  // ⚠ A chave vem do atributo `Id` ("NFe" + 44 dígitos) — é a identidade do documento na Receita.
  const chave = soDigitos(inf.getAttribute?.("Id") ?? "");

  const itens = Array.from(inf.getElementsByTagName("det")).map((det) => {
    const prod = det.getElementsByTagName("prod")?.[0];
    return {
      item: Number(det.getAttribute?.("nItem") ?? 0) || null,
      codigo: texto(prod, "cProd"),
      descricao: texto(prod, "xProd"),
      // ⚠⚠ É AQUI QUE MORA O QUE A PEÇA É DE VERDADE (ver o cabeçalho).
      descricaoItem: texto(det, "infAdProd"),
      // ⚠⚠ E O NCM ESCRITO NA DESCRIÇÃO SAI NOS DOIS LEITORES (achado do Codex, 23/09/2026). Eu
      // tinha posto a extração só no pedido do Omie: o mesmo conflito — campo fiscal dizendo um
      // NCM e a descrição dizendo outro — desaparecia ao auditar o XML da nota JÁ EMITIDA. A regra
      // vale para o documento, não para a porta por onde ele entrou.
      ncmDaDescricao: ncmNaDescricao(texto(det, "infAdProd")),
      ncm: soDigitos(texto(prod, "NCM")),
      cfop: soDigitos(texto(prod, "CFOP")),
      unidade: texto(prod, "uCom"),
      quantidade: numero(prod, "qCom"),
      valorUnitario: numero(prod, "vUnCom"),
      valor: numero(prod, "vProd"),
      pedido: texto(prod, "xPed"),
      ipi: lerIpi(det),
      icms: lerIcms(det),
    };
  });

  // ⚠ NF referenciada — é o que amarra remessa a venda, e o que a venda à ordem exige.
  const referenciadas = Array.from(inf.getElementsByTagName("refNFe")).map((r) => soDigitos(r.textContent));

  const total = inf.getElementsByTagName("ICMSTot")?.[0];
  return {
    chave,
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    emitidaEm: texto(ide, "dhEmi") ?? texto(ide, "dEmi"),
    naturezaOperacao: texto(ide, "natOp"),
    emitente: { cnpj: soDigitos(texto(emit, "CNPJ")), nome: texto(emit, "xNome"), uf: texto(emit, "UF") },
    destinatario: { cnpj: soDigitos(texto(dest, "CNPJ") ?? texto(dest, "CPF")), nome: texto(dest, "xNome"), uf: texto(dest, "UF"), ie: texto(dest, "IE") },
    itens,
    referenciadas,
    totais: total ? { produtos: numero(total, "vProd"), ipi: numero(total, "vIPI"), icms: numero(total, "vICMS"), nota: numero(total, "vNF") } : null,
  };
}
