import "server-only";
import { getAccessToken, acharPastaOp, ensureFolder } from "./sharepoint";
import { casaMarca } from "./pasta-engenharia";

// ─── AS PASTAS DO DIA, DENTRO DE 2.5.2.4 NC1 e IGS ────────────────────────────
// Vitor (26/08/2026): "quando selecionarmos um perfil e definir a data, preciso que crie dentro
// dessas pastas outras pastas com as datas que foram liberadas, nesse caso nessas subpastas
// precisamos que leia os arquivos NC1 para chapas e o IGS para perfis, e separe em outras pastas
// cada tipo de perfil".
//
// Sai assim — Vitor (26/08/2026): "quando for projetos de IGS deve ser salva dentro da pasta de
// IGS e quando for projeto NC1 dentro da pasta NC1". O dia fica DENTRO do tipo, não ao lado dele:
// quem opera já entra pela pasta do seu tipo de arquivo.
//   2.5.2.4 NC1 e IGS/
//     NC1/
//       2026-08-27/               ← o dia programado
//         CH6.4X142/  105A-P118.nc1 …
//     IGS/
//       2026-08-27/
//         W150X22.5/  105A10_1.igs …
//
// ⚠ NC1 É CHAPA E IGS É PERFIL — conferido na OP-105 antes de escrever isto, porque a intuição
// dizia o contrário: os 49 .nc1 são TODOS de marca chapa (43 croquis + 6 avulsas, 100% das chapas)
// e nenhum perfil tem .nc1; os 168 .igs, em IGS/IGS_files, são os perfis. Programar pelo palpite
// teria mandado a chapa buscar .igs que não existe.
//
// ⚠ A DATA EM ISO (2026-08-27) e não 27-08-2026: é o único formato que ordena sozinho na listagem
// do SharePoint, e essa pasta vai ser aberta pelo operador procurando "o dia de hoje".
//
// ⚠ COPIA, NÃO MOVE. O original tem que continuar onde a Engenharia o deixou — a pasta do dia é
// uma VISTA do trabalho liberado, não o arquivo mudando de dono.

const GRAPH = "https://graph.microsoft.com/v1.0";
const drive = () => process.env.SHAREPOINT_DRIVE_ID;
const encPath = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

// ⚠ o nome da subpasta varia entre obras ("2.5.2.4 NC1 e IGS", "2.5.2.4 NC1 E IGS", com ou sem
// acento). Casar o texto exato deixaria obra de fora sem dizer por quê.
const RX_RAIZ = /2\.5\.2\.4/;
const EXT_CHAPA = /\.nc1$/i;
const EXT_PERFIL = /\.(igs|iges|stp|step)$/i;
// ⚠ o nome da pasta de tipo também varia entre obras; casar por prefixo evita deixar obra de fora
const TIPOS = {
  NC1: { rx: /^NC1\b/i, pasta: "NC1" },
  IGS: { rx: /^IGS\b/i, pasta: "IGS" },
};

// ⚠⚠ O NOME DA PASTA. Vitor (26/08/2026): "se atentar com pontos, virgulas, barra e caracteres
// especiais". Medido nos 1.104 perfis distintos da base, o que aparece de não alfanumérico:
//
//   .  1007×   legal      X  6,40  — fica
//   ␣   120×   legal      "TUBO RET. 100X60X4,8" — fica, mas nunca na ponta
//   '   118×   legal      L3''X1/4''
//   /    58×   PROIBIDO   L3''X1/4''
//   "    34×   PROIBIDO   U6"x12,20 · BRØM16"
//   ,    21×   legal      CH6,30X35 · W410X46,1
//   *     6×   PROIBIDO   CH9,5*87 — os 6 casos são separador de medida
//   Ø Ç Ã      legais e com significado (BRØ = barra redonda) — ficam
//
// ⚠ VÍRGULA NÃO É PROIBIDA, MAS ERA ARMADILHA. `CH6,30X35` e `CH6.30X35` são o MESMO perfil escrito
// de dois jeitos; mantendo os dois, o dia sairia com duas pastas para o mesmo aço e o operador
// levaria metade dos arquivos. Vira ponto — não por proibição, por ser a mesma coisa.
// Pelo mesmo motivo `*` vira X: nos 6 casos ele está entre dígitos, separando medida.
//
// ⚠ E O QUE NÃO É CARACTERE: o SharePoint também recusa nome que começa ou termina em espaço,
// termina em ponto, começa com "~$", ou é nome reservado do Windows (CON, PRN, AUX, NUL, COM1-9,
// LPT1-9). Nenhum aparece hoje, mas perfil novo entra por importação e ninguém revisa.
const PROIBIDOS = /["*:<>?/\\|]/g;        // o conjunto que o SharePoint recusa
const RESERVADOS = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9]|\.lock|desktop\.ini)$/i;

export function nomeDePasta(perfil) {
  let s = String(perfil || "").trim().toUpperCase();
  s = s.replace(/(\d),(\d)/g, "$1.$2");     // vírgula decimal → ponto (mesmo perfil, um nome só)
  // ⚠⚠ ZERO À DIREITA CAI. Vitor (26/08/2026): "a engenharia gera desenhos ou listas que podem
  // conter medidas de chapa diferentes exemplo 6,3 6,30 6,35 6,40". Medido na base, e ele tem
  // razão: 6,3 mm aparece como `6,30`, `6.30` E `6,3`; 4,8 como `4.80` e `4,8`; 12,5 de três
  // jeitos; 19 como `19.0` e `19.00`. Cada grafia viraria uma pasta, e o operador levaria só um
  // pedaço dos arquivos daquela chapa.
  //
  // ⚠ SÓ O ZERO DEPOIS DA VÍRGULA. 6.35 e 6.40 são chapas DIFERENTES e continuam separadas — é o
  // erro oposto e seria pior: juntar duas espessuras faz cortar na chapa errada. `100X60` também
  // não se toca: sem ponto decimal, o zero é o número.
  s = s.replace(/(\d+)\.(\d*?)0+(?![\d])/g, (m, a, b) => (b ? `${a}.${b}` : a));
  // ⚠ "CHAPA 6.3X32" É "CH6.3X32". Vitor avisou que "outros tipos de chapas pode ocorrer" e a base
  // confirma: 7 medidas aparecem escritas dos dois jeitos (CH12.5X110 e CHAPA 12.5X110, …).
  // ⚠ O `(?=\d)` NÃO É DETALHE: sem ele, "CHAPA XADREZ 3X710" viraria "CHXADREZ 3X710" e a chapa
  // xadrez cairia junto da chapa lisa — que é outro material, não outra grafia.
  s = s.replace(/^CHAPA\s+(?=\d)/, "CH");
  s = s.replace(/(\d)\s*\*\s*(\d)/g, "$1X$2"); // 9.5*87 → 9.5X87
  // ⚠ ASPA VIRA '' — não some. É proibida, mas é a POLEGADA, e a LPC já escreve os dois jeitos:
  // `TB 1.1/4"` e `L3''X1/4''`. Trocando por "-" sairia `TB 1.1-4-`, que não se lê; apagando,
  // `L1''X1/4"` e `L1''X1/4''` virariam duas pastas do mesmo perfil.
  s = s.replace(/"/g, "''");
  s = s.replace(PROIBIDOS, "-");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[.~$]+/, "").replace(/[. ]+$/, "").trim(); // ponta suja quebra a criação
  if (!s || RESERVADOS.test(s)) return "SEM PERFIL";
  return s.slice(0, 80).trim().replace(/[. ]+$/, "") || "SEM PERFIL";
}

async function graph(url, token, init) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  return r;
}

async function listar(token, path) {
  const r = await graph(`${GRAPH}/drives/${drive()}/root:/${encPath(path)}:/children?$select=id,name,folder,file&$top=999`, token);
  if (!r.ok) return [];
  return (await r.json()).value || [];
}

// varre a 2.5.2.4 inteira: os arquivos vivem em NC1/ e IGS/IGS_files/, não na raiz
async function arquivosDaMaquina(token, raiz, prof = 0) {
  const out = [];
  for (const it of await listar(token, raiz)) {
    if (it.folder) {
      // ⚠ pasta de dia já criada não entra na varredura: senão a segunda liberação copiaria as
      // cópias da primeira, e o dia 2 nasceria com o dia 1 dentro.
      if (RX_DIA.test(it.name)) continue;
      if (prof < 2) out.push(...(await arquivosDaMaquina(token, `${raiz}/${it.name}`, prof + 1)));
    } else out.push({ id: it.id, nome: it.name, pasta: raiz });
  }
  return out;
}
const RX_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Organiza os arquivos de máquina das peças liberadas numa pasta com a data.
 * @param {string} opNumero
 * @param {string} dataISO  "2026-08-27"
 * @param {Array}  pecas    [{ marca, perfil }] — as peças da liberação
 */
export async function montarPastaDoDia(opNumero, dataISO, pecas) {
  if (!RX_DIA.test(String(dataISO || ""))) throw new Error("Data da programação inválida.");
  const base = await acharPastaOp(opNumero);
  if (!base) throw new Error("Pasta da OP não encontrada no SharePoint.");

  const token = await getAccessToken();
  const fab = `${base}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação`;
  const sub = (await listar(token, fab)).find((x) => x.folder && RX_RAIZ.test(x.name));
  if (!sub) throw new Error("Esta obra não tem a pasta 2.5.2.4 (NC1 e IGS).");
  const raiz = `${fab}/${sub.name}`;

  const arquivos = await arquivosDaMaquina(token, raiz);
  const chapas = arquivos.filter((a) => EXT_CHAPA.test(a.nome));
  const perfis = arquivos.filter((a) => EXT_PERFIL.test(a.nome));

  // marca → perfil, sem repetir: a LPC repete a marca em sub-obras
  const porMarca = new Map();
  for (const p of pecas || []) {
    const m = String(p.marca || "").trim();
    if (m && !porMarca.has(m.toUpperCase())) porMarca.set(m.toUpperCase(), { marca: m, perfil: p.perfil || "" });
  }

  // ⚠ AGRUPA POR TIPO **E** PERFIL: o destino do arquivo depende do tipo dele (NC1 ou IGS), e o
  // mesmo perfil pode, em tese, ter os dois. Agrupar só por perfil misturaria os acervos numa pasta.
  const grupos = new Map();   // "NC1|CH6.4X142" → [{ id, nome }]
  const semArquivo = [];
  for (const { marca, perfil } of porMarca.values()) {
    // ⚠ a chapa procura .nc1 e o perfil procura .igs — cada um no seu acervo. Procurar nos dois
    // acharia o arquivo errado quando um croqui de chapa e um perfil dividem o prefixo da marca.
    const chapa = /^CH/i.test(String(perfil).trim());
    const achados = (chapa ? chapas : perfis).filter((a) => casaMarca(a.nome, marca));
    if (!achados.length) { semArquivo.push({ marca, perfil }); continue; }
    const chave = `${chapa ? "NC1" : "IGS"}|${nomeDePasta(perfil)}`;
    const g = grupos.get(chave) || [];
    g.push(...achados);
    grupos.set(chave, g);
  }

  // ⚠ a pasta do TIPO já existe nas obras (é onde a Engenharia salva); criar só cobre a obra nova.
  const filhos = await listar(token, raiz);
  const pastaDoTipo = {};
  for (const [t, cfg] of Object.entries(TIPOS)) {
    const achada = filhos.find((x) => x.folder && cfg.rx.test(x.name));
    pastaDoTipo[t] = `${raiz}/${achada ? achada.name : cfg.pasta}`;
  }

  const feito = [];
  for (const [chave, itens] of grupos) {
    const [tipo, pastaPerfil] = chave.split("|");
    const destinoDia = `${pastaDoTipo[tipo]}/${dataISO}`;
    await ensureFolder(destinoDia);
    const destino = `${destinoDia}/${pastaPerfil}`;
    await ensureFolder(destino);
    const pai = await graph(`${GRAPH}/drives/${drive()}/root:/${encPath(destino)}`, token);
    if (!pai.ok) throw new Error(`Não consegui abrir a pasta ${pastaPerfil}.`);
    const paiId = (await pai.json()).id;

    // ⚠ `copy` do Graph é ASSÍNCRONO: devolve 202 e um monitor. Não se espera cada uma — o 202 já
    // diz que a cópia foi aceita, e esperar 200 monitores estouraria o tempo da rota.
    // ⚠ EM LOTES DE 8: uma a uma, 200 arquivos passam do minuto que a rota tem. Todas de uma vez, o
    // Graph responde 429 e metade se perde.
    // ⚠ `replace` porque reprogramar o mesmo dia tem que sobrescrever, não criar "arquivo (1)".
    let copiados = 0;
    for (let i = 0; i < itens.length; i += 8) {
      const rs = await Promise.all(itens.slice(i, i + 8).map((it) =>
        graph(`${GRAPH}/drives/${drive()}/items/${it.id}/copy`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentReference: { driveId: drive(), id: paiId }, name: it.nome,
                                 "@microsoft.graph.conflictBehavior": "replace" }),
        }).catch(() => ({ ok: false, status: 0 }))));
      copiados += rs.filter((r) => r.ok || r.status === 202).length;
    }
    feito.push({ tipo, perfil: pastaPerfil, pasta: destino, arquivos: copiados, de: itens.length });
  }

  return {
    pasta: raiz,
    pastasDia: [...new Set(feito.map((g) => `${g.tipo}/${dataISO}`))],
    dia: dataISO,
    grupos: feito.sort((a, b) => b.arquivos - a.arquivos),
    arquivos: feito.reduce((s, g) => s + g.arquivos, 0),
    marcas: porMarca.size,
    // ⚠ marca sem arquivo de máquina vai NOMEADA de volta: é o que o Planejamento cobra da
    // Engenharia, e um total mudo não serve para cobrar ninguém.
    semArquivo: semArquivo.slice(0, 200),
    semArquivoTotal: semArquivo.length,
  };
}
