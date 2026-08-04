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

// ── Especificação (forma + espessura/bitola) pra casar o certificado ESPECÍFICO ──
const numsOf = (s) => (String(s || "").toUpperCase().match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
const shapeOf = (s) => (String(s || "").toUpperCase().match(/^[A-Z]+/) || [""])[0];
const ROLADO = /^(W|HP|H|I)$/; // laminados (casam por bitola); resto (CH, U, L, Z, T…) sai de chapa (espessura)
// espessura do croqui = a MENOR dimensão (chapa CH{esp}X{larg}; dobrado U{h}X{larg}X{esp})
const espessuraCroqui = (perfil) => { const ns = numsOf(perfil); return ns.length ? Math.min(...ns) : null; };
// bitola do perfil laminado (W310, HP310) = forma + 1ª dimensão
const bitolaCroqui = (perfil) => { const ns = numsOf(perfil); return ns.length ? shapeOf(perfil) + Math.round(ns[0]) : shapeOf(perfil); };
// espec do certificado a partir do nome ("CHAPA … ESPESSURA 9,50MM" / "PERFIL W … DN. W310 X …")
function certEspec(nome) {
  const N = String(nome || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const esp = N.match(/ESPESSURA\s*(\d+(?:[.,]\d+)?)/);
  const w = N.match(/\bDN\.?\s*(W|HP|H|I)\s*(\d{2,4})/) || N.match(/\b(W|HP|H|I)\s*(\d{2,4})\b/);
  return { isChapa: /CHAPA/.test(N), thick: esp ? parseFloat(esp[1].replace(",", ".")) : null, prof: w ? w[1] + w[2] : null };
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
      select: { importRef: true, norma: true, nome: true, numeroDocumento: true, numeroCorrida: true, fornecedor: true },
    }),
  ]);

  // Grau + ESPECIFICAÇÃO (espessura da chapa / bitola do perfil) casados por norma +
  // DESCRIÇÃO. Registros vazios (compra sem certificado) ficam de fora.
  const certsMat = certs
    .filter((c) => c.numeroCorrida || c.numeroDocumento)
    .map((c) => ({ ...c, grades: gradesDoTexto(`${c.norma || ""} ${c.nome || ""}`), espec: certEspec(c.nome) }));

  // Casa o certificado ESPECÍFICO da posição: grau + forma + espessura/bitola.
  // - Perfil laminado (W/HP/H/I) → bitola (W310, HP310).
  // - Chapa e perfis DOBRADOS (CH, U, L, Z… feitos de chapa) → espessura (a menor
  //   dimensão do croqui), casada por PROXIMIDADE (~0,3mm) com "ESPESSURA X,XXmm".
  const certsDaPosicao = (material, perfil) => {
    const sp = specsDoMaterial(material);
    const sh = shapeOf(perfil);
    const rolado = ROLADO.test(sh);
    const esp = rolado ? null : espessuraCroqui(perfil);
    const bit = rolado ? bitolaCroqui(perfil) : null;
    const vistos = new Set();
    const res = [];
    for (const c of certsMat) {
      if (!sp.some((s) => c.grades.has(s))) continue; // grau
      if (rolado) {
        if (!c.espec.prof || c.espec.prof !== bit) continue;
      } else {
        if (!c.espec.isChapa || c.espec.thick == null || esp == null || Math.abs(c.espec.thick - esp) > 0.3) continue;
      }
      const chave = c.importRef || `${c.numeroCorrida || ""}|${c.numeroDocumento || ""}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      res.push({ indiceR: c.importRef || null, certificado: c.numeroDocumento || null, corrida: c.numeroCorrida || null, fornecedor: c.fornecedor || null });
    }
    return res;
  };

  let totalPosicoes = 0, semCertificado = 0;
  const out = [];
  for (const cj of conjuntos) {
    const posicoes = (cj.conjuntoCroquis || []).map((cc) => {
      const c = cc.croqui || {};
      totalPosicoes++;
      const cs = certsDaPosicao(c.material, c.perfil);
      if (!cs.length) semCertificado++;
      return { marca: c.marca || "—", material: c.material || null, perfil: c.perfil || null, qtd: cc.qtdNoConjunto || 1, certificados: cs };
    });
    if (posicoes.length) out.push({ marca: cj.marca, descricao: cj.descricao || null, qte: cj.qte || 1, posicoes });
  }

  return { conjuntos: out, totalPosicoes, semCertificado, totalCertificados: certs.length, geradoEm: new Date().toISOString() };
}
