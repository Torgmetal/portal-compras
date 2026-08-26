import "server-only";
import { getAccessToken, acharPastaOp, ensureFolder } from "./sharepoint";
import { casaMarca } from "./pasta-engenharia";

// ─── AS PASTAS DO DIA, DENTRO DE 2.5.2.4 NC1 e IGS ────────────────────────────
// Vitor (26/08/2026): "quando selecionarmos um perfil e definir a data, preciso que crie dentro
// dessas pastas outras pastas com as datas que foram liberadas, nesse caso nessas subpastas
// precisamos que leia os arquivos NC1 para chapas e o IGS para perfis, e separe em outras pastas
// cada tipo de perfil".
//
// Sai assim:
//   2.5.2.4 NC1 e IGS/
//     2026-08-27/                 ← o dia programado
//       CH6.40X142/  105A-P118.nc1 …
//       W150X22.5/   105A10_1.igs …
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

// ⚠ SharePoint recusa " * : < > ? / \ | no nome. Perfil tem os dois piores: L3''X1/4'' traz a
// barra e BRØM16" traz a aspa. Sem trocar, a criação falha e o dia sai sem a pasta daquele perfil.
export function nomeDePasta(perfil) {
  const s = String(perfil || "").trim().replace(/["*:<>?/\\|]/g, "-").replace(/\s+/g, " ").replace(/\.+$/, "");
  return s.slice(0, 80) || "SEM PERFIL";
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

  const grupos = new Map();   // pasta do perfil → [{ id, nome }]
  const semArquivo = [];
  for (const { marca, perfil } of porMarca.values()) {
    // ⚠ a chapa procura .nc1 e o perfil procura .igs — cada um no seu acervo. Procurar nos dois
    // acharia o arquivo errado quando um croqui de chapa e um perfil dividem o prefixo da marca.
    const acervo = /^CH/i.test(String(perfil).trim()) ? chapas : perfis;
    const achados = acervo.filter((a) => casaMarca(a.nome, marca));
    if (!achados.length) { semArquivo.push({ marca, perfil }); continue; }
    const chave = nomeDePasta(perfil);
    const g = grupos.get(chave) || [];
    g.push(...achados);
    grupos.set(chave, g);
  }

  const destinoDia = `${raiz}/${dataISO}`;
  await ensureFolder(destinoDia);

  const feito = [];
  for (const [pastaPerfil, itens] of grupos) {
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
    feito.push({ perfil: pastaPerfil, arquivos: copiados, de: itens.length });
  }

  return {
    pasta: destinoDia,
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
