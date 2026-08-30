import "server-only";
import { getAccessToken } from "./sharepoint";

// ─── ABRIR ORÇAMENTO: COPIAR A PASTA E NUMERAR ────────────────────────────────
// Vitor (30/08/2026): "hoje copiamos a pasta toda que te dei o caminho, pegamos a última que foi
// emitida para numerar, e começamos a preencher".
//
// É exatamente isso que esta lib faz — o mesmo gesto, sem o trabalho manual e sem o risco que ele
// carrega: copiar a pasta errada, esquecer uma subpasta, ou repetir um número já usado.
//
// ⚠⚠ O MODELO NUNCA É TOCADO. A cópia LÊ a pasta 000-26 e escreve num destino novo; nada é movido,
// renomeado ou gravado dentro dela. Vitor: "para podermos editar sem você mexer no modelo padrão".
//
// ⚠ A CÓPIA DO GRAPH É ASSÍNCRONA. `POST /items/{id}/copy` devolve 202 com um `Location` para
// acompanhar — a pasta 000-26 tem 7 subpastas e ~700 KB, e a resposta volta antes de terminar.
// Quem chama recebe o monitor e decide se espera.
const GRAPH = "https://graph.microsoft.com/v1.0";
const RAIZ = process.env.SHAREPOINT_ORCAMENTOS_BASE || "/Comercial/1. Orçamento";
export const PASTA_MODELO = "1. Solicitados/000-26-CLIENTE-OBRA";
export const PASTA_DESTINO = "1. Solicitados";

const drive = () => process.env.SHAREPOINT_DRIVE_ID;

async function item(token, caminho) {
  const r = await fetch(`${GRAPH}/drives/${drive()}/root:${encodeURI(caminho)}?$select=id,name,folder`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok ? r.json() : null;
}

/**
 * O nome da pasta, no padrão do Comercial: "287-26-TMSA-CALHAS".
 *
 * ⚠ Sem acento, sem barra e com espaço virando hífen — é como as 298 pastas existentes se chamam,
 * e é o que o leitor de e-mails e o de LQC usam para achar o orçamento depois. Um nome fora do
 * padrão não quebra nada na hora; ele some das buscas semanas depois.
 */
export function nomeDaPasta({ numero, cliente, obra }) {
  const limpa = (s, max) => String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
  const partes = [numero, limpa(cliente, 24), limpa(obra, 32)].filter(Boolean);
  return partes.join("-").replace(/-+/g, "-");
}

/**
 * Os números já usados no ano, lidos das PASTAS do SharePoint.
 *
 * ⚠ Devolve o conjunto, não só o maior: quem chama precisa saber se um número específico está
 * ocupado, e não só qual é o topo.
 */
export async function numerosUsados(ano = new Date().getFullYear()) {
  const token = await getAccessToken();
  const aa = String(ano).slice(-2);
  let maior = 0;
  const usados = new Set();
  for (const fase of ["1. Solicitados", "2. Concluidos", "3. Declinados", "1.Solicitados", "2.Concluídos"]) {
    const r = await fetch(`${GRAPH}/drives/${drive()}/root:${encodeURI(`${RAIZ}/ORÇAMENTOS_${ano}/${fase}`)}:/children?$select=name,folder&$top=999`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) continue;
    for (const it of (await r.json()).value || []) {
      if (!it.folder) continue;
      const m = String(it.name).match(/(?:^|\D)(\d{3})[-_ ]?(\d{2})\b/);
      if (!m || m[2] !== aa) continue;
      const n = Number(m[1]);
      usados.add(n);
      if (n > maior) maior = n;
    }
  }
  return { usados, maior, aa };
}

/**
 * O próximo número do ano.
 *
 * ⚠⚠ O MAIOR DOS DOIS LADOS, e o teste mostrou por quê. Lendo só as pastas, o próximo saiu 291-26
 * — e o 291-26 JÁ EXISTE no portal (veio da planilha do Comercial), só ainda não tinha pasta.
 * Numerar por uma fonte só entrega um número já usado: o SharePoint atrasa quando a pasta ainda
 * não foi criada, e o banco atrasa quando a planilha ainda não foi sincronizada. Número repetido
 * de orçamento é confusão que dura a obra inteira.
 *
 * @param {Function} numerosDoBanco  () => Promise<number[]> — injetado, porque esta lib não fala
 *                                   com o Prisma (ela é do SharePoint)
 */
export async function proximoNumero(ano = new Date().getFullYear(), numerosDoBanco = null) {
  const { usados, maior, aa } = await numerosUsados(ano);
  let maiorGeral = maior;
  if (numerosDoBanco) {
    for (const n of (await numerosDoBanco()) || []) {
      usados.add(n);
      if (n > maiorGeral) maiorGeral = n;
    }
  }
  return {
    proximo: `${String(maiorGeral + 1).padStart(3, "0")}-${aa}`,
    maior: maiorGeral, maiorNaPasta: maior, quantas: usados.size,
  };
}

/**
 * Copia a pasta-modelo para um orçamento novo.
 *
 * @returns {{ nome, caminho, monitor }} `monitor` é a URL do Graph para acompanhar a cópia.
 */
export async function abrirPastaDoOrcamento({ numero, cliente, obra, ano = new Date().getFullYear() }) {
  const token = await getAccessToken();
  const base = `${RAIZ}/ORÇAMENTOS_${ano}`;
  const nome = nomeDaPasta({ numero, cliente, obra });

  // ⚠⚠ A TRAVA É PELO NÚMERO, NÃO PELO NOME. Primeira versão comparava o nome montado e não pegou
  // nada: a pasta do 286-26 se chama "24_08 -286-26- AYOSHII-WEST-ROCK" — o Comercial prefixa a
  // data e espaça diferente. Só o número identifica o orçamento; o resto do nome é estilo de quem
  // criou. E sem esta trava o Graph cria "pasta 1" em silêncio, e passam a existir duas pastas do
  // mesmo orçamento — pior que o erro.
  const alvo = Number(String(numero).match(/(\d{3})/)?.[1]);
  const { usados } = await numerosUsados(ano);
  if (alvo && usados.has(alvo)) throw new Error(`O orçamento ${numero} já tem pasta no SharePoint.`);

  const modelo = await item(token, `${base}/${PASTA_MODELO}`);
  if (!modelo) throw new Error(`Pasta-modelo não encontrada: ${base}/${PASTA_MODELO}`);
  const destino = await item(token, `${base}/${PASTA_DESTINO}`);
  if (!destino) throw new Error(`Pasta de destino não encontrada: ${base}/${PASTA_DESTINO}`);

  const r = await fetch(`${GRAPH}/drives/${drive()}/items/${modelo.id}/copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { driveId: drive(), id: destino.id }, name: nome }),
  });
  if (r.status !== 202 && !r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Falha ao copiar a pasta (${r.status})`);
  }
  return { nome, caminho: `${base}/${PASTA_DESTINO}/${nome}`, monitor: r.headers.get("location") || null };
}

/** Acompanha a cópia. `null` quando não há monitor (cópia já concluída). */
export async function statusDaCopia(monitor) {
  if (!monitor) return { status: "concluido" };
  const r = await fetch(monitor);
  if (!r.ok) return { status: "desconhecido" };
  const j = await r.json().catch(() => ({}));
  return { status: j.status || "desconhecido", porcentagem: j.percentageComplete ?? null };
}
