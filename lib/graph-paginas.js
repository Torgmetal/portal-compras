// Todas as páginas de uma listagem do Microsoft Graph (SharePoint).
//
// ⚠⚠ O GRAPH DEVOLVE A PASTA EM PÁGINAS — o resto vem em `@odata.nextLink`, e quem lê só a primeira
// vê a pasta pela metade, em silêncio. Achado em 26/09/2026 na OP-118 (Gabriel, Engenharia: "tem sim,
// no servidor … aí não conseguimos liberar desenho pro Alex"): a pasta "2.5.2.2 Croqui/B" tem 1.762
// arquivos em duas páginas; a conferência da pasta lia 996, e os croquis da segunda — T118B-P382,
// P383, P470 e outros 766 arquivos — apareciam como "sem desenho" e não desciam para o PCP. A
// impressão em lote e a pasta do dia da liberação liam a mesma pasta do mesmo jeito.
//
// ⚠ Falha em QUALQUER página devolve `ok: false`: pasta pela metade não pode passar por pasta inteira.

const PAGINAS_MAX = 100; // trava contra laço, não limite real (100 páginas ≈ 100 mil itens)

/**
 * @param {string} url  a primeira página (`…/children?$select=…&$top=…`)
 * @param {string} token
 * @returns {Promise<{ itens: object[], ok: boolean, status?: number }>}
 */
export async function todasAsPaginas(url, token) {
  const itens = [];
  let proxima = url;
  for (let n = 0; proxima && n < PAGINAS_MAX; n++) {
    const res = await fetch(proxima, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { itens, ok: false, status: res.status };
    const j = await res.json();
    itens.push(...(j.value || []));
    proxima = j["@odata.nextLink"] || null;
  }
  return { itens, ok: true };
}
