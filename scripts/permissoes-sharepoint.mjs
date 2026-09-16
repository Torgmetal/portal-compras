// Tira (ou só confere) o acesso de UMA pessoa a um conjunto de subpastas das OPs no SharePoint.
//
//   node scripts/permissoes-sharepoint.mjs entrar
//   node scripts/permissoes-sharepoint.mjs levantar --usuario="Leandro" --pastas="1. Comercial,3. Compras"
//   node scripts/permissoes-sharepoint.mjs remover  --usuario="Leandro" --pastas="..." --aplicar
//   node scripts/permissoes-sharepoint.mjs conceder --email="qualidade@torg.com.br" --pastas="1. Comercial" --papel=leitura --aplicar
//
// ⚠⚠ SEM `--aplicar` NADA É ESCRITO. "remover" sem a bandeira imprime o que faria e sai — é o
// ensaio, e é onde se descobre que o filtro pegou pasta demais ANTES de pegar.
//
// ⚠⚠ NÃO USA O APP DO PORTAL, E NÃO PODE. O `Torg Portal SharePoint` tem Sites.ReadWrite.All, e
// quebrar herança de permissão exige Sites.FullControl.All na API REST do SharePoint — que o
// Graph não expõe em versão nenhuma. Daí a ponte pelo navegador: quem escreve é a SUA sessão,
// com a SUA permissão, e fica no log do SharePoint com o seu nome (14/09/2026).
//
// ⚠ O perfil do navegador (`--perfil`) guarda a sessão do M365 e fica FORA do repositório.
// As decisões (identidade, escopo, aceite) moram em lib/permissoes-pastas.js, com testes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { casaOp, casaPasta, escolherPrincipal, avaliarResultado, acharRoleDefId, jaTemAcesso, avaliarConcessao, opExcluida, PAPEIS } from "../lib/permissoes-pastas.js";

const LIBS = path.join(os.homedir(), ".local/share/torg-playwright/lib");
if (fs.existsSync(LIBS)) process.env.LD_LIBRARY_PATH = [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const SITE = process.env.SP_SITE || "https://torgmetal637.sharepoint.com/sites/TorgMetal";
const RAIZ = process.env.SP_RAIZ || "/sites/TorgMetal/SERVIDOR/Ordem de Servico/01. OP";
const API = `${new URL(SITE).pathname}/_api`;
const PERFIL_PADRAO = path.join(os.homedir(), ".config/torg/perfil-sharepoint");

const AJUDA = `
Ajusta em massa o acesso de UMA pessoa às subpastas das OPs no SharePoint.

  entrar     abre o navegador e guarda a sessão do M365 no perfil (faça uma vez)
  levantar   só relata quem tem acesso a quê
  remover    tira o acesso — ENSAIO por padrão, escreve apenas com --aplicar
  conceder   DÁ o acesso — ENSAIO por padrão, escreve apenas com --aplicar

  --usuario="Leandro"            trecho do nome; tem que resolver UMA identidade de usuário
  --email="fulano@torg.com.br"   quem RECEBE o acesso (só em "conceder"; e-mail é único, nome não)
  --papel=leitura|colaboracao|edicao   o que conceder (padrão: leitura — o menor privilégio)
                                 ⚠ colaboracao ≠ edicao: "Editar" também gerencia a lista
  --pastas="1. Comercial,9. Seguros"   nomes EXATOS das subpastas (sem acento/caixa importa não)
  --ops="OP-119"                 opcional; casa o nome inteiro ou prefixo até fronteira
  --exceto="OP-000"              opcional; tira OPs do escopo (o molde PADRÃO, tipicamente)
  --aplicar                      escreve de verdade
  --diario=<arquivo.json>        onde gravar o antes/depois (padrão: permissoes-<data>.json)
  --perfil=<dir>                 sessão do navegador (padrão: ~/.config/torg/perfil-sharepoint)

Site e raiz vêm de SP_SITE / SP_RAIZ. Sessão expirada: rode "entrar" de novo.
Sai com código != 0 se o levantamento estiver incompleto ou alguma pasta não fechar.
`;

const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
};
const esc = (p) => p.replace(/'/g, "''");
const lista = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

async function abrirSessao({ perfil, visivel }) {
  const { chromium } = await import("playwright");
  const ctx = await chromium.launchPersistentContext(perfil, { headless: !visivel, viewport: { width: 1500, height: 950 } });
  const pg = ctx.pages()[0] || (await ctx.newPage());
  await pg.goto(SITE, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
  const ler = (caminho) =>
    pg.evaluate(async (c) => {
      const r = await fetch(c, { headers: { Accept: "application/json;odata=nometadata" }, cache: "no-store" });
      const t = await r.text();
      try {
        return r.ok ? JSON.parse(t) : { erro: r.status, corpo: t.slice(0, 300) };
      } catch {
        return { erro: "resposta não-JSON", corpo: t.slice(0, 300) };
      }
    }, caminho);
  // ⚠ `corpo` existe para o `ensureuser`, que é o único POST daqui que manda JSON. Sem
  // Content-Type o SharePoint responde 400 sem dizer por quê.
  const escrever = (caminho, metodo = "POST", corpo = null) =>
    pg.evaluate(async ([c, m, api, body]) => {
      const d = await fetch(`${api}/contextinfo`, { method: "POST", headers: { Accept: "application/json;odata=nometadata" } });
      const digest = (await d.json()).FormDigestValue;
      const cab = { Accept: "application/json;odata=nometadata", "X-RequestDigest": digest };
      if (body) cab["Content-Type"] = "application/json;odata=verbose";
      const r = await fetch(c, { method: m, headers: cab, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      let json = null;
      try { json = JSON.parse(t); } catch { /* nem toda resposta é JSON */ }
      return { ok: r.ok, status: r.status, corpo: t.slice(0, 300), json };
    }, [caminho, metodo, API, corpo]);
  return { ctx, pg, ler, escrever };
}

/** ⚠ Erro de listagem NÃO vira lista vazia: sessão expirada devolveria "0 pastas" e sucesso. */
async function pastasDe(ler, rel) {
  const r = await ler(`${API}/web/GetFolderByServerRelativeUrl('${esc(rel)}')/Folders?$select=Name&$top=500`);
  if (r.erro) throw new Error(`não consegui listar "${rel}": ${r.erro} ${r.corpo || ""}`);
  return r.value || [];
}

async function lerAcl(ler, rel) {
  const r = await ler(
    `${API}/web/GetFolderByServerRelativeUrl('${esc(rel)}')/ListItemAllFields` +
      `?$select=Id,HasUniqueRoleAssignments,RoleAssignments/PrincipalId,RoleAssignments/Member/Title,` +
      `RoleAssignments/Member/PrincipalType,RoleAssignments/RoleDefinitionBindings/Name` +
      `&$expand=RoleAssignments/Member,RoleAssignments/RoleDefinitionBindings`,
  );
  if (r.erro) return { erro: `${r.erro} ${r.corpo || ""}` };
  const mapa = {};
  for (const ra of r.RoleAssignments || []) {
    const nomes = (ra.RoleDefinitionBindings || []).map((d) => d.Name).sort();
    mapa[ra.PrincipalId] = {
      titulo: ra.Member?.Title,
      tipo: ra.Member?.PrincipalType,
      papeis: nomes.join(","),
      // "Acesso Limitado" é passagem que o SharePoint cria/recolhe sozinho — não é acesso.
      real: nomes.filter((n) => n !== "Acesso Limitado").join(","),
    };
  }
  return { unica: r.HasUniqueRoleAssignments, mapa };
}

const quemCasa = (mapa, rx) =>
  Object.keys(mapa).filter((k) => rx.test(mapa[k].titulo || "")).map((k) => ({ pid: k, ...mapa[k] }));

async function levantar(ler, { rxUsuario, pastas, filtroOp, excecoes }) {
  const ops = (await pastasDe(ler, RAIZ))
    .filter((f) => /^OP-/i.test(f.Name) && casaOp(f.Name, filtroOp) && !opExcluida(f.Name, excecoes));
  const linhas = [];
  const erros = [];
  for (const op of ops.sort((a, b) => a.Name.localeCompare(b.Name))) {
    for (const s of (await pastasDe(ler, `${RAIZ}/${op.Name}`)).filter((f) => casaPasta(f.Name, pastas))) {
      const caminho = `${RAIZ}/${op.Name}/${s.Name}`;
      const acl = await lerAcl(ler, caminho);
      if (acl.erro) {
        erros.push(`${caminho}: ${acl.erro}`);
        continue;
      }
      const achados = quemCasa(acl.mapa, rxUsuario);
      linhas.push({ op: op.Name, sub: s.Name, caminho, unica: acl.unica, achados, mapa: acl.mapa });
    }
  }
  return { linhas, erros, ops: ops.length };
}

/** ⚠ Nunca restaura herança em falha: devolver a herança devolve o acesso que se quer tirar. */
async function removerDe({ ler, escrever }, caminho, pid) {
  const reg = { caminho, estado: "pendente", passos: [] };
  const antes = await lerAcl(ler, caminho);
  if (antes.erro) return { ...reg, estado: "erro-leitura", detalhe: antes.erro };
  if (!antes.mapa[pid]) return { ...reg, estado: "ja-limpa" };
  reg.antes = { unica: antes.unica, principais: Object.keys(antes.mapa).length };

  const alvo = `${API}/web/GetFolderByServerRelativeUrl('${esc(caminho)}')/ListItemAllFields`;
  if (!antes.unica) {
    const r = await escrever(`${alvo}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)`);
    reg.passos.push({ passo: "breakroleinheritance", status: r.status });
    if (!r.ok) return { ...reg, estado: "falha-quebra", detalhe: r.corpo };
  }
  let r = await escrever(`${alvo}/roleassignments/removeroleassignment(principalid=${pid})`);
  reg.passos.push({ passo: "removeroleassignment", status: r.status });
  let depois = await lerAcl(ler, caminho);
  if (!depois.erro && depois.mapa[pid]) {
    r = await escrever(`${alvo}/roleassignments(${pid})`, "DELETE");
    reg.passos.push({ passo: "DELETE roleassignments", status: r.status });
    depois = await lerAcl(ler, caminho);
  }
  if (depois.erro) return { ...reg, estado: "erro-releitura", detalhe: depois.erro };

  const veredito = avaliarResultado(antes.mapa, depois.mapa, pid);
  reg.depois = { unica: depois.unica, principais: Object.keys(depois.mapa).length, ...veredito };
  return { ...reg, estado: veredito.ok ? "validado" : "ATENCAO" };
}

/**
 * Resolve QUEM vai receber o acesso, pelo e-mail.
 *
 * ⚠⚠ `ensureuser` É O JEITO CERTO, e não um `siteusers/getbyemail`: quem nunca abriu o site ainda
 * não existe na coleção de usuários dele, e o getby devolveria 404 numa pessoa que existe no
 * tenant. O ensureuser cria a referência local se precisar — é o que a própria tela "Compartilhar"
 * faz por baixo.
 */
async function resolverDestinatario({ escrever }, email) {
  const r = await escrever(`${API}/web/ensureuser`, "POST", { logonName: email });
  if (!r.ok) return { erro: `não consegui resolver "${email}": ${r.status} ${r.corpo}` };
  const u = r.json?.d || r.json;
  if (!u?.Id) return { erro: `resposta sem Id para "${email}": ${r.corpo}` };
  // ⚠ Mesma trava do escolherPrincipal: conceder a um GRUPO dá acesso a todos os membros, e
  // ninguém pediu isso. PrincipalType 1 = usuário.
  if (u.PrincipalType !== 1) {
    return { erro: `"${u.Title}" não é um usuário (PrincipalType ${u.PrincipalType}) — conceder a um grupo libera todos os membros` };
  }
  return { principal: { pid: u.Id, titulo: u.Title, tipo: u.PrincipalType, login: u.LoginName } };
}

/** O id do papel neste site — o nome muda com o idioma e o id muda por site. */
async function resolverPapel({ ler }, papel) {
  const r = await ler(`${API}/web/roledefinitions?$select=Id,Name`);
  if (r.erro) return { erro: `não consegui ler os papéis do site: ${r.erro} ${r.corpo || ""}` };
  return acharRoleDefId(r.value || [], papel);
}

/** ⚠ Nunca restaura herança em falha — pela mesma razão do removerDe, e mais uma: restaurar aqui
 *  apagaria a concessão recém-feita nas pastas vizinhas que dependem da mesma quebra. */
async function concederEm({ ler, escrever }, caminho, pid, roleDefId) {
  const reg = { caminho, estado: "pendente", passos: [] };
  const antes = await lerAcl(ler, caminho);
  if (antes.erro) return { ...reg, estado: "erro-leitura", detalhe: antes.erro };
  if (jaTemAcesso(antes.mapa, pid)) return { ...reg, estado: "ja-tem" };
  reg.antes = { unica: antes.unica, principais: Object.keys(antes.mapa).length };

  const alvo = `${API}/web/GetFolderByServerRelativeUrl('${esc(caminho)}')/ListItemAllFields`;
  // ⚠ Conceder numa pasta que HERDA obriga a quebrar a herança — não há meio-termo no SharePoint.
  // `copyRoleAssignments=true` leva a ACL inteira junto, então ninguém perde o que tinha.
  if (!antes.unica) {
    const r = await escrever(`${alvo}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)`);
    reg.passos.push({ passo: "breakroleinheritance", status: r.status });
    if (!r.ok) return { ...reg, estado: "falha-quebra", detalhe: r.corpo };
  }
  const r = await escrever(`${alvo}/roleassignments/addroleassignment(principalid=${pid},roledefid=${roleDefId})`);
  reg.passos.push({ passo: "addroleassignment", status: r.status });
  if (!r.ok) return { ...reg, estado: "falha-concessao", detalhe: r.corpo };

  const depois = await lerAcl(ler, caminho);
  if (depois.erro) return { ...reg, estado: "erro-releitura", detalhe: depois.erro };
  const veredito = avaliarConcessao(antes.mapa, depois.mapa, pid);
  reg.depois = { unica: depois.unica, principais: Object.keys(depois.mapa).length, ...veredito };
  return { ...reg, estado: veredito.ok ? "validado" : "ATENCAO" };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const comando = process.argv[2];
if (!comando || ["--help", "-h", "ajuda"].includes(comando)) {
  console.log(AJUDA);
  process.exit(comando ? 0 : 2);
}
const perfil = arg("perfil", PERFIL_PADRAO);
const usuario = (arg("usuario", "") || "").trim();
const pastas = lista(arg("pastas"));
const filtroOp = arg("ops", "");
const exceto = lista(arg("exceto"));
const email = (arg("email", "") || "").trim();
const papel = (arg("papel", "leitura") || "").trim().toLowerCase();

// ⚠ Validar ANTES de abrir navegador: erro de argumento não deve custar um login.
if (!["entrar", "levantar", "remover", "conceder"].includes(comando)) {
  console.error(`comando desconhecido: ${comando}\n${AJUDA}`);
  process.exit(2);
}
// ⚠ "conceder" pede --email (o alvo ainda NÃO está nas pastas, então não há nome para casar lá
// dentro); os demais pedem --usuario. Validar antes de abrir navegador: erro de argumento não
// deve custar um login.
if (comando === "conceder") {
  if (!email || !pastas.length) {
    console.error(`faltou --email e/ou --pastas.\n${AJUDA}`);
    process.exit(2);
  }
  if (!PAPEIS[papel]) {
    console.error(`papel desconhecido: "${papel}". Use ${Object.keys(PAPEIS).join(" ou ")}.\n${AJUDA}`);
    process.exit(2);
  }
} else if (comando !== "entrar" && (!usuario || !pastas.length)) {
  console.error(`faltou --usuario e/ou --pastas.\n${AJUDA}`);
  process.exit(2);
}
fs.mkdirSync(perfil, { recursive: true });
const ponte = await abrirSessao({ perfil, visivel: comando === "entrar" });
let codigo = 0;

try {
  if (comando === "entrar") {
    console.log("Entre com a sua conta da Torg na janela aberta. Aguardo até 15 minutos.");
    const ate = Date.now() + 15 * 60 * 1000;
    let web = null;
    while (Date.now() < ate) {
      web = await ponte.ler(`${API}/web?$select=Title,Url`);
      if (web?.Url) break;
      await ponte.pg.waitForTimeout(3000);
    }
    console.log(web?.Url ? `LOGADO em ${web.Title}. A sessão fica em ${perfil}.` : "Não confirmei o login.");
    codigo = web?.Url ? 0 : 1;
  } else if (comando === "conceder") {
    // ⚠⚠ RESOLVER A PESSOA E O PAPEL ANTES DE VARRER. São duas chamadas que ou funcionam ou
    // derrubam tudo — descobrir no meio de 47 pastas que o e-mail não existe deixaria o lote pela
    // metade, que é o pior dos estados.
    const quem = await resolverDestinatario(ponte, email);
    if (quem.erro) throw new Error(quem.erro);
    const pap = await resolverPapel(ponte, papel);
    if (pap.erro) throw new Error(pap.erro);
    console.log(`Alvo: ${quem.principal.titulo} <${email}> (id ${quem.principal.pid}) · papel "${pap.nome}" (id ${pap.id})`);

    const { linhas, erros, ops } = await levantar(ponte.ler, { rxUsuario: /$^/, pastas, filtroOp, excecoes: exceto });
    const faltando = linhas.filter((l) => !jaTemAcesso(l.mapa, quem.principal.pid));
    const jaTem = linhas.length - faltando.length;
    console.log(`OPs no escopo: ${ops} | subpastas examinadas: ${linhas.length} | já tem acesso: ${jaTem} | a conceder: ${faltando.length}`);
    for (const l of faltando) console.log(`  ${l.op} / ${l.sub}${l.unica ? "" : " (herda — a herança será quebrada)"}`);

    if (erros.length) {
      console.error(`\n⚠ ${erros.length} pasta(s) não puderam ser lidas — levantamento INCOMPLETO, não aplico nada:`);
      for (const e of erros) console.error(`   ${e}`);
      codigo = 1;
    } else if (!faltando.length) {
      console.log("\nNada a fazer.");
    } else if (!process.argv.includes("--aplicar")) {
      console.log("\nENSAIO — nada foi escrito. Repita com --aplicar para valer.");
    } else {
      const saida = arg("diario", `permissoes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`);
      if (fs.existsSync(saida)) throw new Error(`o diário "${saida}" já existe — escolha outro com --diario`);
      console.log(`Diário: ${saida}`);
      const diario = [];
      const gravar = () => fs.writeFileSync(saida, JSON.stringify({ antes: linhas, diario }, null, 2));
      for (const l of faltando) {
        const reg = await concederEm(ponte, l.caminho, quem.principal.pid, pap.id);
        diario.push(reg);
        gravar();
        console.log(`${{ validado: "✓", "ja-tem": "·" }[reg.estado] || "✗"} ${l.op} / ${l.sub} — ${reg.estado}`);
        if (!["validado", "ja-tem"].includes(reg.estado)) {
          console.error(`\n⚠ parei no primeiro problema: ${reg.detalhe || JSON.stringify(reg.depois)}`);
          codigo = 1;
          break;
        }
      }
      const conta = (e) => diario.filter((d) => d.estado === e).length;
      console.log(`\nvalidadas: ${conta("validado")} | já tinham: ${conta("ja-tem")} | pendentes: ${faltando.length - diario.length}`);
    }
  } else {
    const rxUsuario = new RegExp(usuario.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const { linhas, erros, ops } = await levantar(ponte.ler, { rxUsuario, pastas, filtroOp, excecoes: exceto });
    const comAcesso = linhas.filter((l) => l.achados.length);
    console.log(`OPs no escopo: ${ops} | subpastas examinadas: ${linhas.length} | com "${usuario}": ${comAcesso.length}`);
    for (const l of comAcesso) {
      console.log(`  ${l.op} / ${l.sub} — ${l.achados.map((a) => a.real || "(só Acesso Limitado)").join(", ")}${l.unica ? "" : " (herdada)"}`);
    }
    if (erros.length) {
      console.error(`\n⚠ ${erros.length} pasta(s) não puderam ser lidas — levantamento INCOMPLETO, não aplico nada:`);
      for (const e of erros) console.error(`   ${e}`);
      codigo = 1;
    } else if (!comAcesso.length) {
      console.log("\nNada a fazer.");
    } else {
      const escolha = escolherPrincipal(comAcesso.flatMap((l) => l.achados));
      if (escolha.erro) {
        console.error(`\n⚠ não dá para aplicar: ${escolha.erro}`);
        codigo = 1;
      } else if (comando === "levantar" || !process.argv.includes("--aplicar")) {
        console.log(`\nAlvo: ${escolha.principal.titulo} (id ${escolha.principal.pid}).`);
        if (comando === "remover") console.log("ENSAIO — nada foi escrito. Repita com --aplicar para valer.");
      } else {
        const saida = arg("diario", `permissoes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`);
        if (fs.existsSync(saida)) throw new Error(`o diário "${saida}" já existe — escolha outro com --diario`);
        console.log(`\nAlvo: ${escolha.principal.titulo} (id ${escolha.principal.pid}). Diário: ${saida}`);
        const diario = [];
        // ⚠ Grava a cada pasta: se o lote morrer no meio, o registro do que já mudou sobrevive.
        const gravar = () => fs.writeFileSync(saida, JSON.stringify({ antes: linhas, diario }, null, 2));
        for (const l of comAcesso) {
          const reg = await removerDe(ponte, l.caminho, escolha.principal.pid);
          diario.push(reg);
          gravar();
          console.log(`${{ validado: "✓", "ja-limpa": "·" }[reg.estado] || "✗"} ${l.op} / ${l.sub} — ${reg.estado}`);
          if (!["validado", "ja-limpa"].includes(reg.estado)) {
            console.error(`\n⚠ parei no primeiro problema: ${reg.detalhe || JSON.stringify(reg.depois)}`);
            codigo = 1;
            break;
          }
        }
        const conta = (e) => diario.filter((d) => d.estado === e).length;
        console.log(`\nvalidadas: ${conta("validado")} | já limpas: ${conta("ja-limpa")} | pendentes: ${comAcesso.length - diario.length}`);
      }
    }
  }
} catch (e) {
  console.error("FALHOU:", e.message);
  codigo = 1;
} finally {
  await ponte.ctx.close();
}
process.exit(codigo);
