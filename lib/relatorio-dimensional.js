import "server-only";
import { prisma } from "./prisma";
import { resolverPastasDaSecao, listarPasta } from "./databook-pastas";
import { downloadFileByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
import { lerListaMateriais } from "./lista-materiais-desenho";

// RELATÓRIO DE INSPEÇÃO DIMENSIONAL E VISUAL — montado do PROJETO, não de fotos.
//
// Vitor (21/08/2026): "no relatório de dimensional não vamos usar fotos; o campo que deixamos em
// aberto seria para trazer como se fosse um print do conjunto com as informações das cotas do
// projeto. As dimensões do projeto você deve preencher; já as dimensões encontradas você deve
// deixar para o elaborador do relatório preencher".
//
// E sobre o agrupamento: "pode ser [um por conjunto], mas no caso das peças avulsas podemos
// agrupá-las para facilitar, pois senão iríamos gerar inúmeros relatórios".
//
// Então há dois escopos:
//   CONJUNTO → um relatório por conjunto, com o desenho dele embutido
//   AVULSAS  → várias peças num relatório só, cada uma com o seu croqui
//
// ⚠ A dimensão de projeto sai da LISTA DE MATERIAIS DO DESENHO DO CONJUNTO.
//
// ⚠⚠ E ATENÇÃO AO 1 mm — a história é mais interessante do que parecia. Para a T83A-P1:
//
//     LPC (lista de peças)              1035
//     croqui da própria peça (cota)     1035
//     lista de materiais do conjunto    1034
//
// Ou seja: a LPC e o croqui CONCORDAM; quem destoa é a lista do conjunto. O mesmo acontece na
// T83A-P2 (cota do conjunto 2379, lista do conjunto 2378). É comportamento conhecido do Tekla: a
// coluna COMPR. da lista traz o comprimento de CORTE, e a cota desenhada traz a dimensão externa.
//
// Isso importa porque o inspetor mede contra a COTA, não contra o comprimento de corte. Enquanto o
// Vitor não decidir qual das duas é a "dimensão de projeto" do relatório, este módulo usa a lista
// (que é a única extraível com segurança) e o desenho vai embutido no documento — assim a cota fica
// visível ao lado, e a diferença nunca fica escondida.
//
// 🚫 CROQUI NÃO TEM LISTA DE MATERIAIS. O desenho da peça avulsa traz "QTD. | RASTREABILIDADE MAT."
// e as cotas soltas, sem quadro. Por isso o agrupamento de avulsas ainda cai no aviso "preencha à
// mão" — ler cota solta exige outra técnica, e só vale a pena depois da decisão acima.

/** Referência de tolerância. Vitor: "no lugar da norma vamos usar a referência do procedimento". */
export async function procedimentoTolerancia() {
  const doc = await prisma.documentoQualidade.findFirst({
    where: { ativo: true, nome: { contains: "Tolerância", mode: "insensitive" } },
    select: { nome: true },
    orderBy: { createdAt: "desc" },
  });
  // o nome já carrega a revisão ("PO-04 Tolerâncias de Fabricação - R1")
  return doc?.nome || "PO-04 Tolerâncias de Fabricação";
}

/** Acha o PDF do desenho de uma marca na pasta da OP. */
async function acharDesenho(driveId, raizes, marca) {
  const alvo = String(marca).toUpperCase();
  const visto = new Set();
  const busca = async (path, nivel) => {
    if (nivel > 4 || visto.has(path)) return null;
    visto.add(path);
    let c;
    try { c = await listarPasta(driveId, path); } catch { return null; }
    // "T83A13.pdf" ou "T83A-P1 - CROQUI.pdf" — casa pelo começo do nome, sem a extensão
    const hit = c.arquivos.find((a) => {
      if (!/\.pdf$/i.test(a.nome)) return false;
      const base = a.nome.replace(/\.pdf$/i, "").toUpperCase();
      return base === alvo || base.startsWith(`${alvo} `) || base.startsWith(`${alvo}-CROQUI`) || base.startsWith(`${alvo} -`);
    });
    if (hit) return { ...hit, pasta: path };
    for (const p of c.pastas) {
      const r = await busca(p.path, nivel + 1);
      if (r) return r;
    }
    return null;
  };
  for (const raiz of raizes) {
    const r = await busca(raiz.path, 0);
    if (r) return r;
  }
  return null;
}

/**
 * Monta as linhas do relatório dimensional a partir dos desenhos das marcas.
 *
 * @param {string} opNumero
 * @param {string[]} marcas
 * @returns {Promise<{linhas:Array, desenhos:Array, erros:string[]}>}
 */
export async function montarDimensional(opNumero, marcas) {
  const { driveId, fontes, erros: errosPasta } = await resolverPastasDaSecao("02", opNumero);
  const erros = [...(errosPasta || [])];
  if (!driveId || !fontes.length) {
    return { linhas: [], desenhos: [], erros: [...erros, "Não achei a pasta de projetos desta OP no servidor."] };
  }
  // procura primeiro nos atalhos (conjunto/montagem), depois na Engenharia inteira
  const raizes = [...fontes.filter((f) => !/toda/i.test(f.label)), ...fontes.filter((f) => /toda/i.test(f.label))];

  const linhas = [];
  const desenhos = [];

  for (const marca of marcas) {
    const d = await acharDesenho(driveId, raizes, marca);
    if (!d) { erros.push(`Desenho de ${marca} não encontrado na pasta da OP.`); continue; }

    let bytes;
    try { bytes = Buffer.from(await downloadFileByPath({ driveId, fullPath: `${d.pasta}/${d.nome}` })); }
    catch (e) { erros.push(`Não consegui abrir o desenho de ${marca}: ${e.message}`); continue; }

    desenhos.push({ marca, itemId: d.id, nome: d.nome, caminho: `${d.pasta}/${d.nome}` });

    let lista = null;
    try { lista = await lerListaMateriais(bytes); } catch { /* quadro ilegível cai no aviso abaixo */ }
    if (!lista?.itens?.length) {
      erros.push(`Não consegui ler a lista de materiais do desenho de ${marca} — preencha as dimensões à mão.`);
      linhas.push({ marca, descricao: null, projetoMm: null, encontradoMm: null, obs: null });
      continue;
    }

    for (const it of lista.itens) {
      // ⚠ a primeira linha do quadro é o PRÓPRIO conjunto (só peso, sem comprimento). Ela não é uma
      // dimensão a medir — vira o cabeçalho do grupo, não uma linha de medição.
      const ehOProprio = String(it.marca).toUpperCase() === String(marca).toUpperCase();
      if (ehOProprio && it.comprimento == null) continue;
      linhas.push({
        marca: it.marca,
        conjunto: ehOProprio ? null : marca,
        qtd: it.qtd ?? null,
        descricao: it.descricao || null,
        material: it.material || null,
        projetoMm: it.comprimento ?? null,
        // 🚫 nasce VAZIO de propósito: Vitor pediu que a dimensão encontrada seja do elaborador
        encontradoMm: null,
        obs: null,
      });
    }
  }

  return { linhas, desenhos, erros };
}

/**
 * Baixa os bytes de um desenho já resolvido (para embutir no PDF).
 * Resolve o drive direto — não passa por `resolverPastasDaSecao`, que precisa de uma OP.
 */
export async function baixarDesenho(caminho) {
  if (!caminho) return null;
  const driveId = await resolveServidorDriveId();
  if (!driveId) return null;
  try { return Buffer.from(await downloadFileByPath({ driveId, fullPath: caminho })); }
  catch { return null; }
}
