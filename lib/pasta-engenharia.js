import "server-only";
import { getAccessToken, acharPastaOp } from "./sharepoint";

// O QUE EXISTE DE FATO NA PASTA DA ENGENHARIA — a contraprova da lista importada.
//
// Vitor (25/08/2026), depois de ver o painel da Diretoria dar a OP-106 como entregue: "não entendo
// o fato da OP-106 estar sem os projetos dentro das pastas do projeto, isso me quebra".
//
// ⚠⚠ O PORTAL SÓ SABIA DA LISTA, NÃO DO DESENHO. `PecaConjunto` com fonte LPC_IMPORT diz que
// alguém subiu a LPC; não diz que existe desenho para o setor abrir. Medido na OP-106: LPC no
// portal, 16 .nc1 e 11 .igs na pasta, e ZERO PDF de desenho. O programador conseguiu lançar porque
// a máquina lê NC1; a bancada ficou sem papel. Foi por isso que a impressão não foi.
//
// ⚠ ARQUIVO-MODELO NÃO É CONTEÚDO. As pastas nascem do template com "Mandar nessa pasta.docx",
// "Anexar memorial de cálculo e ART.docx", "TXX-...", "OP-000-...". Contar isso como entrega faz a
// pasta vazia parecer preenchida — que é exatamente o caso da 2.5.5 Cliente da OP-106.
const GRAPH = "https://graph.microsoft.com/v1.0";
const PROF_MAX = 6;

// ⚠ SUBPASTAS DE 2.5.2 QUE NÃO SÃO DESENHO. A .5 guarda aproveitamento de chapa em PDF — contar
// aquilo como desenho fazia a OP-106, que não tem desenho NENHUM, aparecer como "parcial".
const NAO_DESENHO = /2\.5\.2\.(1|4|5)\b/;

// nome do arquivo casa a marca EXATA — "T89A1.pdf", "T89A1 - CROQUI.pdf", "T89A1_R01.pdf" casam;
// "T89A10.pdf" NÃO. (Era a mesma função copiada em desenhos-lote e na rota de desenhos.)
export function casaMarca(nome, marca) {
  const up = String(nome).toUpperCase();
  const m = String(marca).toUpperCase();
  if (!m || !up.startsWith(m)) return false;
  return /^(\.[A-Z0-9]+|[ ._\-])/.test(up.slice(m.length));
}

// ⚠ A MARCA EM QUALQUER LUGAR DO NOME, delimitada. `casaMarca` exige a marca no COMEÇO porque a
// emissão precisa escolher o arquivo certo; para auditar, isso confunde "não existe" com "existe
// com nome fora do padrão" — e é a segunda que explica desenho que está lá e não imprime.
export function mencionaMarca(nome, marca) {
  const m = String(marca || "").trim();
  if (!m) return false;
  const esc = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`, "i").test(String(nome));
}

// arquivo que veio do template e nunca foi trocado por conteúdo de verdade
export function ehModelo(nome) {
  const n = String(nome || "");
  return /^(anexar|mandar|modelo)\b/i.test(n)
    || /\bT(XX|##)\b/i.test(n)
    || /\bOP-?(XX|000)\b/i.test(n)
    || /^logo_torg/i.test(n);
}

/**
 * Varre `2. Engenharia/2.5 Projetos` de uma OP e devolve o que há lá dentro, já separado por
 * natureza. Uma varredura só: com 500+ PDFs, perguntar arquivo por arquivo seria inviável.
 *
 * @returns {Promise<{achou:boolean, erro?:string, base?:string, pdfs:[], outrosPdfs:number, nc1:[], igs:[], listas:[], cliente:[], modelos:number, ultimo:string|null}>}
 */
export async function inventarioEngenharia(opNumero) {
  const base = await acharPastaOp(opNumero);
  if (!base) return { achou: false, erro: "Pasta da OP não encontrada no SharePoint.", pdfs: [], outrosPdfs: 0, nc1: [], igs: [], listas: [], cliente: [], modelos: 0, ultimo: null };

  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const raiz = `${base}/2. Engenharia/2.5 Projetos`;
  const arquivos = [];

  async function andar(caminho, pastaMae, prof) {
    if (/obsolet/i.test(pastaMae || "") || prof > PROF_MAX) return;
    const res = await fetch(
      `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=name,folder,file,size,lastModifiedDateTime&$top=999`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const { value = [] } = await res.json();
    for (const it of value) {
      if (it.folder) { await andar(`${caminho}/${it.name}`, it.name, prof + 1); continue; }
      if (!it.file) continue;
      arquivos.push({
        nome: it.name,
        rel: caminho.slice(raiz.length + 1),
        pastaMae: pastaMae || "",
        ext: (it.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase(),
        kb: Math.round((it.size || 0) / 1024),
        em: it.lastModifiedDateTime || null,
        modelo: ehModelo(it.name),
      });
    }
  }
  await andar(raiz, "", 0);

  const vale = (a) => !a.modelo && !/obsolet/i.test(a.nome);
  const naFab = arquivos.filter((a) => /^2\.5\.2/.test(a.rel));
  const noCli = arquivos.filter((a) => /^2\.5\.5/.test(a.rel));
  const datas = arquivos.map((a) => a.em).filter(Boolean).sort();

  return {
    achou: true,
    base,
    // formato pela pasta-mãe (A1..A4), como na emissão em lote — croqui cai em A4
    pdfs: naFab.filter((a) => a.ext === "pdf" && vale(a) && !NAO_DESENHO.test(a.rel)).map((a) => ({
      ...a, formato: /^A[1-4]$/i.test(a.pastaMae) ? a.pastaMae.toUpperCase() : "A4",
    })),
    outrosPdfs: naFab.filter((a) => a.ext === "pdf" && vale(a) && NAO_DESENHO.test(a.rel)).length,
    nc1: naFab.filter((a) => a.ext === "nc1"),
    igs: naFab.filter((a) => a.ext === "igs"),
    listas: naFab.filter((a) => /^xls[xm]?$/.test(a.ext) && vale(a)),
    cliente: noCli.filter(vale),
    modelos: arquivos.filter((a) => a.modelo).length,
    ultimo: datas[datas.length - 1] || null,
  };
}
