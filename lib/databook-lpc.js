import "server-only";
import { prisma } from "./prisma";

// Monta o conteúdo da §02 (Desenhos as-built) do Data Book a partir da LPC
// (PecaConjunto + ConjuntoCroqui) cruzada com os certificados de matéria-prima.
// Por CONJUNTO, lista as POSIÇÕES (croquis) que o compõem, com material, qtd no
// conjunto, RASTREABILIDADE (nº da corrida) e Nº DO CERTIFICADO.
//
// Casamento do certificado é POR MATERIAL (o código do material — A36, A572,
// SAE 1020, USI CIVIL 350 — dentro da norma do certificado), a mesma regra da
// §04 (rastreabilidade). Um material pode ter várias corridas → a posição lista
// todas. Ver [[torg_qualidade]].

const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[^A-Z0-9]/g, "");
const extractOP = (t) => (String(t).match(/\d+/)?.[0] || "").padStart(3, "0");

export function specsDoMaterial(mat) {
  const n = norm(mat);
  const out = [];
  const a = n.match(/A\d{2,4}/g); if (a) out.push(...a);       // A36, A572, A1011…
  const sae = n.match(/SAE(\d+)/); if (sae) out.push("SAE" + sae[1], sae[1]); // SAE1020
  const civil = n.match(/CIVIL(\d+)/); if (civil) out.push("CIVIL" + civil[1]); // USI CIVIL 350
  if (n.includes("XADREZ")) out.push("A36");                   // chapa xadrez = A36
  if (!out.length) out.push(n);
  return [...new Set(out)];
}

// Graus (A36, A572, SAE1020, CIVIL350…) presentes num TEXTO livre (norma + descrição
// do certificado). ⚠️ O grau real costuma estar na DESCRIÇÃO, não na norma: a chapa
// A-36 é certificada sob "ASTM A1018"/"TUB300"/etc., mas o nome diz "A-36". Casa o
// grau só quando o "A"/"SAE"/"CIVIL" está no INÍCIO de uma palavra — evita o falso
// "A36" de "espessurA 36".
export function gradesDoTexto(txt) {
  const t = String(txt || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const out = new Set();
  for (const m of t.matchAll(/\bA[\s.\-]?(\d{2,4})\b/g)) out.add("A" + m[1]);
  for (const m of t.matchAll(/\bSAE[\s.\-]?(\d+)\b/g)) out.add("SAE" + m[1]);
  for (const m of t.matchAll(/\bCIVIL[\s.\-]?(\d+)\b/g)) out.add("CIVIL" + m[1]);
  if (/XADREZ/.test(t)) out.add("A36");
  return out;
}

export async function montarSecaoLpc(opNumeroBook) {
  const op = extractOP(opNumeroBook);
  const allObras = (await prisma.pecaConjunto.findMany({ distinct: ["opNumero"], select: { opNumero: true } }))
    .map((o) => o.opNumero).filter(Boolean).filter((o) => extractOP(o) === op);
  if (!allObras.length) return { conjuntos: [], totalPosicoes: 0, semCertificado: 0, totalCertificados: 0, geradoEm: null };

  const [conjuntos, certs] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opNumero: { in: allObras }, tipoPeca: "CONJUNTO" },
      select: {
        marca: true, descricao: true, qte: true,
        conjuntoCroquis: { select: { qtdNoConjunto: true, croqui: { select: { marca: true, descricao: true, material: true, perfil: true } } } },
      },
      orderBy: { marca: "asc" },
    }),
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", ativo: true, opNumero: op },
      select: { norma: true, nome: true, numeroDocumento: true, numeroCorrida: true, fornecedor: true },
    }),
  ]);

  // Grau casado por norma + DESCRIÇÃO (a corrida vem só de cert com corrida ou nº —
  // registros vazios, tipo compra sem certificado, ficam de fora).
  const certsMat = certs
    .filter((c) => c.numeroCorrida || c.numeroDocumento)
    .map((c) => ({ ...c, grades: gradesDoTexto(`${c.norma || ""} ${c.nome || ""}`) }));
  const certsDoMaterial = (mat) => {
    if (!mat) return [];
    const sp = specsDoMaterial(mat);
    const vistos = new Set();
    const res = [];
    for (const c of certsMat) {
      if (!sp.some((s) => c.grades.has(s))) continue;
      const chave = `${c.numeroCorrida || ""}|${c.numeroDocumento || ""}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      res.push({ corrida: c.numeroCorrida || null, certificado: c.numeroDocumento || null, fornecedor: c.fornecedor || null });
    }
    return res;
  };

  let totalPosicoes = 0, semCertificado = 0;
  const out = [];
  for (const cj of conjuntos) {
    const posicoes = (cj.conjuntoCroquis || []).map((cc) => {
      const c = cc.croqui || {};
      totalPosicoes++;
      const cs = certsDoMaterial(c.material);
      if (!cs.length) semCertificado++;
      return { marca: c.marca || "—", material: c.material || null, perfil: c.perfil || null, qtd: cc.qtdNoConjunto || 1, certificados: cs };
    });
    if (posicoes.length) out.push({ marca: cj.marca, descricao: cj.descricao || null, qte: cj.qte || 1, posicoes });
  }

  return { conjuntos: out, totalPosicoes, semCertificado, totalCertificados: certs.length, geradoEm: new Date().toISOString() };
}
