"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, X, Plus, Trash2, AlertCircle, Pencil, Upload, Sparkles } from "lucide-react";
import { METODOS_PREPARO, PLP_PADRAO, descreverSistema } from "@/lib/plp";
import { GRAUS_LIMPEZA, METODOS_APLICACAO, grauNaNorma } from "@/lib/pintura-campos";

// ─── CORRIGIR O PLANO DE PINTURA DA OBRA ──────────────────────────────────────
// Vitor (27/08/2026): "na parte do plano de pintura preciso que no botão de editar você me permita
// alterar algumas informações que talvez você puxe da pasta mas está errado".
//
// ⚠⚠ O BOTÃO NÃO EDITAVA NADA. "editar o plano de pintura da obra" era um link para a fila de
// inspeções — quem clicava caía numa lista de relatórios de todas as obras e voltava.
//
// ⚠ EDITA TUDO O QUE A LEITURA PREENCHE. O painel que existe dentro do relatório cobre preparo e
// três demãos; a leitura por IA preenche até seis demãos, os ITENS DA ESTRUTURA COM AS CORES e as
// observações — e é justamente nos itens que ela erra mais (junta descrições longas, mistura os
// sistemas). Um editor que não alcança o campo errado não corrige nada.

const so = (v) => (v === null || v === undefined ? "" : String(v));

// as três demãos do esquema mais comum — em branco, só para haver onde escrever
const VAZIAS = [{ nome: "Primer" }, { nome: "Intermediária" }, { nome: "Acabamento" }];
const REF_PADRAO = "PO-05 — Pintura · NBR 16775";
// os papéis do esquema, na ordem em que se aplicam
const NOMES_DEMAO = ["Primer", "Intermediária", "Acabamento", "Acabamento (Fábrica)", "Acabamento (Campo)", "Demão única"];
const hojeBR = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Secao({ folha, titulo, children }) {
  return (
    <section className="space-y-1.5">
      <p className="text-[11px] font-semibold text-torg-dark border-b border-gray-100 pb-1">
        <span className="text-torg-gray-light font-normal">{folha} · </span>{titulo}
      </p>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rotulo}</span>
      {children}
    </label>
  );
}

const cls = "w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-torg-blue";

function Texto({ valor, onChange, ph, tipo = "text" }) {
  return <input type={tipo} value={so(valor)} onChange={(e) => onChange(e.target.value)} placeholder={ph} className={cls} />;
}

export default function EditarPlp({ opNumero, aoSalvar }) {
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState(null);        // { plp, tintas }
  const [f, setF] = useState(null);        // formulário
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [aceite, setAceite] = useState(null);
  const [obra, setObra] = useState(null);
  const [catalogo, setCatalogo] = useState([]);   // ProdutoTinta — vem dos boletins técnicos
  const [importando, setImportando] = useState(null); // índice da demão em importação

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [rp, ra] = await Promise.all([
        fetch(`/api/qualidade/plp/${encodeURIComponent(opNumero)}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (rp.error) throw new Error(rp.error);
      setD(rp);
      setAceite(ra?.status?.PLP || null);
      setObra(ra?.dadosDaObra || null);
      fetch("/api/qualidade/tintas", { cache: "no-store" })
        .then((x) => x.json()).then((x) => setCatalogo(x.tintas || [])).catch(() => {});
      const p = rp.plp || {};
      setF({
        revisao: so(p.revisao),
        preparoMetodo: p.preparoMetodo || PLP_PADRAO.preparoMetodo,
        grauLimpeza: p.grauLimpeza || PLP_PADRAO.grauLimpeza,
        abrasivo: so(p.abrasivo),
        rugosidadeMin: so(p.rugosidadeMin ?? PLP_PADRAO.rugosidadeMin),
        rugosidadeMax: so(p.rugosidadeMax ?? PLP_PADRAO.rugosidadeMax),
        metodoAplicacao: p.metodoAplicacao || "",
        espessuraTotal: so(p.espessuraTotal),
        // ⚠ COMEÇA PRONTO PARA DIGITAR. Vitor (27/08/2026): "por que ao invés de lermos um
        // documento você não deixa para eu preencher as informações". Obra sem plano abria com
        // zero linhas e obrigava a clicar em "+ demão" antes de escrever a primeira letra.
        demaos: ((p.demaos || []).length ? p.demaos : VAZIAS).map((x, i) => ({
          ordem: x.ordem || i + 1, nome: so(x.nome) || `${i + 1}ª demão`, produto: so(x.produto),
          fabricante: so(x.fabricante), cor: so(x.cor), espessuraMin: so(x.espessuraMin), espessuraMax: so(x.espessuraMax),
        })),
        itens: (p.itens || []).map((x) => ({
          item: so(x.item), sistema: so(x.sistema), cor: so(x.cor), obs: so(x.obs),
          interno: !!x.interno, externo: !!x.externo,
        })),
        // ⚠ só é "manual" quando o total gravado NÃO é a soma das demãos: aí alguém o definiu de
        // propósito e o portal não pode sobrescrever.
        totalManual: !!p.espessuraTotal && Number(p.espessuraTotal) !== (p.demaos || []).reduce((t, x) => t + (Number(x.espessuraMin) || 0), 0),
        documentosReferencia: so(p.documentosReferencia) || REF_PADRAO,
        // ⚠ o índice de revisões nasce com a emissão inicial: documento controlado sem a linha da
        // R00 não diz quando começou a valer.
        revisoes: (p.revisoes || []).length
          ? p.revisoes.map((r) => ({ revisao: so(r.revisao), data: so(r.data), descricao: so(r.descricao), elaborado: so(r.elaborado), verificado: so(r.verificado), aprovado: so(r.aprovado) }))
          : [{ revisao: so(p.revisao) || "0", data: hojeBR(), descricao: "Emissão inicial", elaborado: "", verificado: "", aprovado: "" }],
        observacoes: so(p.observacoes),
      });
    } catch (e) { setErro(e.message); }
  }, [opNumero]);

  useEffect(() => { if (aberto && !f) carregar(); }, [aberto, f, carregar]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setDemao = (i, k, v) => setF((x) => ({ ...x, demaos: x.demaos.map((d2, j) => (j === i ? { ...d2, [k]: v } : d2)) }));
  const setItem = (i, k, v) => setF((x) => ({ ...x, itens: x.itens.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const setRev = (i, k, v) => setF((x) => ({ ...x, revisoes: x.revisoes.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  // ⚠ A ESPESSURA TOTAL É A SOMA DAS CAMADAS SECAS e segue as demãos enquanto ninguém a escrever à
  // mão. Vitor (27/08/2026): "não está dinâmico o preenchimento desse PLP". Dois campos que deviam
  // bater e são digitados em separado divergem — e é o total que o inspetor confere no medidor.
  const somaDemaos = (f?.demaos || []).reduce((t, x) => t + (Number(x.espessuraMin) || 0), 0);
  useEffect(() => {
    if (!f || f.totalManual) return;
    const alvo = somaDemaos ? String(somaDemaos) : "";
    if (so(f.espessuraTotal) !== alvo) setF((x) => ({ ...x, espessuraTotal: alvo }));
  }, [f, somaDemaos]);

  /**
   * A camada ÚMIDA pela fórmula da própria planilha da Qualidade: EPU = EPS × (100 + %DIL) / SV.
   *
   * ⚠⚠ NÃO É DADO DE TABELA, É CONTA. Com o sólidos em volume, a úmida sai para QUALQUER espessura
   * seca e QUALQUER diluição — a tabela do boletim só cobre as linhas que ele listou. Conferido no
   * INDUSTHANE RHB DF: SV 55,2% dá 181 / 199 / 208 µm contra os 181 / 200 / 209 da planilha dele.
   * Sem SV cadastrado, vale a linha da tabela; sem as duas, o campo fica livre.
   */
  function umidaDe(t, seca, pct) {
    const eps = Number(seca);
    const dil = Number(pct);
    if (t?.solidosVol > 0 && eps > 0 && Number.isFinite(dil)) return Math.round((eps * (100 + dil)) / t.solidosVol);
    const linha = (t?.camadas || []).find((c) => Number(c.diluicao) === dil);
    return linha?.umida ?? null;
  }

  /**
   * Como o diluente aparece no plano.
   *
   * ⚠ COM O NOME DA FICHA, não com o texto que veio dentro da tinta. Vitor (27/08/2026): "precisa
   * incluir tanto a ficha técnica do diluente e você descrever qual diluente vamos usar". Quando o
   * boletim do diluente também está no catálogo, é o nome DELE que vale — é o que se compra e o que
   * o almoxarifado separa.
   */
  function nomeDoDiluente(t, pct) {
    const doCatalogo = t?.diluenteId ? catalogo.find((x) => x.id === t.diluenteId) : null;
    const nome = doCatalogo ? `${doCatalogo.produto}` : t?.diluente;
    return [nome, pct === "" || pct == null ? null : `${pct}%`].filter(Boolean).join(" · ");
  }

  /** As diluições que fazem sentido para este produto: a tabela do boletim, ou a faixa dele. */
  function diluicoesDe(t) {
    if (t?.camadas?.length) return t.camadas.map((c) => Number(c.diluicao));
    const max = Number(t?.diluicaoMax);
    if (!Number.isFinite(max) || max <= 0) return [];
    const passo = max <= 10 ? 5 : 5;
    const out = [];
    for (let v = Number(t?.diluicaoMin) || 0; v <= max + 0.001; v += passo) out.push(Math.round(v));
    if (out[out.length - 1] !== max) out.push(max);
    return [...new Set(out)];
  }

  /**
   * Escolher o produto do catálogo preenche o que o BOLETIM já respondeu.
   *
   * ⚠ ESPESSURA SÓ ENTRA SE ESTIVER VAZIA. O boletim diz a faixa recomendada; a obra pode ter
   * fechado outra com o cliente. Sobrescrever o que a pessoa digitou seria o portal decidindo
   * contra o contrato.
   */
  /** As espessuras úmidas de cada diluição possível — é o que sai impresso na folha 2·2. */
  function umidasDe(t, seca) {
    return diluicoesDe(t)
      .map((dl) => ({ d: dl, u: umidaDe(t, seca, dl) }))
      .filter((x) => x.u != null);
  }

  function aplicarProduto(i, t) {
    setF((x) => ({
      ...x,
      demaos: x.demaos.map((dm, j) => {
        if (j !== i) return dm;
        const opcoes = diluicoesDe(t);
        const pct = dm.diluicaoPct !== "" && dm.diluicaoPct != null ? Number(dm.diluicaoPct) : (opcoes[0] ?? "");
        const seca = dm.espessuraMin || (t.secaMin != null ? t.secaMin : "");
        const umida = umidaDe(t, seca, pct);
        return {
          ...dm,
          produtoId: t.id, produto: t.produto, fabricante: t.fabricante || dm.fabricante,
          diluicaoPct: pct === "" ? "" : String(pct),
          diluicao: nomeDoDiluente(t, pct) || dm.diluicao,
          camadaUmida: umida != null ? String(umida) : dm.camadaUmida,
          umidas: umidasDe(t, seca),
          componentes: [t.componenteA && `A: ${t.componenteA}`, t.componenteB && `B: ${t.componenteB}`, t.proporcaoMistura]
            .filter(Boolean).join(" · ") || dm.componentes || "",
          potLife: t.potLife || dm.potLife || "",
          secagem: [t.secagemToque && `${t.secagemToque} ao toque`, t.secagemManuseio && `${t.secagemManuseio} ao manuseio`]
            .filter(Boolean).join(" · ") || dm.secagem,
          espessuraMin: dm.espessuraMin || (t.secaMin != null ? String(t.secaMin) : ""),
          espessuraMax: dm.espessuraMax || (t.secaMax != null ? String(t.secaMax) : ""),
        };
      }),
    }));
  }

  /** Trocar a % de diluição troca a camada úmida — é a tabela do boletim respondendo. */
  function aplicarDiluicao(i, pct) {
    const t = catalogo.find((x) => x.id === f.demaos[i]?.produtoId);
    setF((x) => ({
      ...x,
      demaos: x.demaos.map((dm, j) => {
        if (j !== i) return dm;
        const umida = umidaDe(t, dm.espessuraMin, pct);
        return {
          ...dm, diluicaoPct: pct === "" ? "" : String(pct),
          diluicao: nomeDoDiluente(t, pct) || dm.diluicao,
          camadaUmida: umida != null ? String(umida) : dm.camadaUmida,
          umidas: umidasDe(t, dm.espessuraMin),
        };
      }),
    }));
  }

  /**
   * Importa boletins técnicos e já usa a TINTA nesta demão.
   *
   * ⚠ ACEITA VÁRIOS DE UMA VEZ — tinta, endurecedor e diluente são três fichas do mesmo esquema, e
   * o vínculo entre elas é feito no servidor. Um por vez faria a pessoa repetir o caminho três
   * vezes e o diluente ficar solto.
   */
  async function importarBoletim(i, files) {
    const lista = [...(files || [])];
    if (!lista.length) return;
    setImportando(i); setErro(""); setOk("");
    try {
      const arquivos = await Promise.all(lista.map((file) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res({ arquivo: String(fr.result), nome: file.name, contentType: file.type || "application/pdf" });
        fr.onerror = () => rej(new Error(`Não consegui ler "${file.name}".`));
        fr.readAsDataURL(file);
      })));
      const r = await fetch("/api/qualidade/tintas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivos }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao ler o boletim.");
      const novos = j.tintas || [];
      setCatalogo((c) => [...novos, ...c.filter((x) => !novos.some((n) => n.id === x.id))]);
      const aTinta = novos.find((x) => x.categoria === "TINTA");
      if (aTinta) aplicarProduto(i, aTinta);
      const resumo = novos.map((x) => `${x.produto}${x.categoria !== "TINTA" ? ` (${x.categoria.toLowerCase()})` : ""}`).join(", ");
      setOk(`${novos.length} ficha(s) no catálogo: ${resumo}.${j.falhas ? ` Não aproveitei: ${j.falhas.join(" · ")}` : ""}`);
    } catch (e) { setErro(e.message); } finally { setImportando(null); }
  }

  // as cores e os sistemas já usados viram sugestão nos campos seguintes
  const cores = [...new Set([...(f?.demaos || []).map((x) => x.cor), ...(f?.itens || []).map((x) => x.cor)].filter(Boolean))];
  const sistemas = [...new Set((f?.itens || []).map((x) => x.sistema).filter(Boolean))];

  async function salvar() {
    setSalvando(true); setErro(""); setOk("");
    try {
      const r = await fetch(`/api/qualidade/plp/${encodeURIComponent(opNumero)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          // ⚠ linha em branco não vira demão nem item: o formulário nasce com o que a leitura trouxe
          // e a pessoa apaga o que está errado — apagar o texto tem de apagar a linha.
          demaos: f.demaos.filter((x) => x.produto || x.cor || x.espessuraMin),
          itens: f.itens.filter((x) => x.item),
          revisoes: f.revisoes.filter((x) => x.revisao || x.descricao),
        }),
      });
      const j = await r.json();
      // ⚠ o plano é da QUALIDADE: quem abre a OP pelo Comercial vê o editor e levaria um
      // "Forbidden" seco ao salvar. Dizer de quem é a permissão evita a rua sem saída.
      if (r.status === 403) throw new Error("Só a Qualidade (ou um administrador) pode alterar o plano de pintura da obra.");
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setOk("Plano de pintura salvo.");
      setD((x) => ({ ...x, plp: j.plp }));
      aoSalvar?.(j.plp);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1">
        <Pencil size={11} /> editar o plano de pintura da obra
      </button>
    );
  }

  if (!f) {
    return (
      <p className="text-[12px] text-torg-gray inline-flex items-center gap-2 mt-2">
        <Loader2 size={13} className="animate-spin" /> {erro || "abrindo o plano…"}
      </p>
    );
  }

  return (
    <div className="mt-3 border border-torg-blue-200 rounded-xl p-3.5 bg-white space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[13px] font-semibold text-torg-dark flex-1">Plano de pintura da OP-{opNumero}</p>
        <button onClick={() => { setAberto(false); setF(null); setOk(""); }} className="text-torg-gray"><X size={14} /></button>
      </div>

      {/* ⚠⚠ O QUE VEM PRONTO É SÓ A OBRA. Vitor (27/08/2026): "trazer apenas as informações da Obra
          por hora". Mostrar quais são evita a pergunta seguinte — onde digito o cliente, o local,
          o Nº PC/CT? — e deixa claro que o resto é dele. */}
      {obra && (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-torg-gray-light mb-1">Do portal, direto para o documento</p>
          <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
            {[["Cliente", obra.cliente], ["Obra", obra.obra], ["Local", obra.local],
              ["Nº PC/CT", obra.pedidoCliente], ["OP", `OP-${obra.numero}`], ["Ref. cliente", obra.refCliente]]
              .map(([r, v]) => (
                <span key={r} className="truncate"><span className="text-torg-gray-light">{r}: </span><b className="text-torg-dark">{v || "—"}</b></span>
              ))}
          </div>
        </div>
      )}

      {/* ⚠ o que sobrou de leitura automática pode estar errado — é o motivo deste editor existir. */}
      {d?.plp?.arquivoNome && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 flex-wrap">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            O que está abaixo veio de <b>{d.plp.arquivoNome}</b>, lido automaticamente — pode estar errado.
          </span>
          <button onClick={() => setF((x) => ({ ...x, demaos: VAZIAS.map((v, i) => ({ ordem: i + 1, nome: v.nome, produto: "", fabricante: "", cor: "", espessuraMin: "", espessuraMax: "" })), itens: [], observacoes: "" }))}
            className="font-semibold text-amber-900 hover:underline shrink-0">apagar e preencher do zero</button>
        </p>
      )}

      {/* ⚠⚠ MUDAR O PLANO DEPOIS DE ACEITO É REVISÃO NOVA. O cliente aceitou um conteúdo; alterar
          sem subir a revisão faria o documento aceito e o documento vigente serem coisas
          diferentes com o mesmo número — em documento controlado é o pior dos casos. */}
      {aceite?.cliente?.aceito && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          O cliente já aceitou o PLP na revisão R{String(aceite.cliente.revisao ?? 0).padStart(2, "0")}. Se mudar o
          conteúdo, <b>suba a revisão</b> abaixo e mande para verificação e aceite de novo.
        </p>
      )}

      {/* ── FOLHA 1 — capa ── */}
      <Secao folha="Folha 1" titulo="Capa: referências e índice de revisões">
        <div className="grid sm:grid-cols-2 gap-2">
          <Campo rotulo="Revisão do PLP"><Texto valor={f.revisao} onChange={(v) => set("revisao", v)} ph="0" /></Campo>
          <Campo rotulo="Documentos de referência">
            <Texto valor={f.documentosReferencia} onChange={(v) => set("documentosReferencia", v)} ph={REF_PADRAO} />
          </Campo>
        </div>

        {/* ⚠⚠ O ÍNDICE DE REVISÕES É DO DOCUMENTO. Vitor (27/08/2026): "no caso de revisão
            precisamos ter esse registro". Sem ele o cliente recebe uma R01 sem saber o que mudou
            da R00 — e é a primeira pergunta que a fiscalização faz. */}
        <p className="text-[10px] uppercase tracking-wide text-torg-gray-light mt-1">Índice de revisões</p>
        <div className="space-y-1.5">
          {f.revisoes.map((r, i) => (
            <div key={i} className="grid sm:grid-cols-[3.5rem_6rem_2fr_1fr_1fr_1fr_1.5rem] gap-1.5 items-center">
              <Texto valor={r.revisao} onChange={(v) => setRev(i, "revisao", v)} ph="0" />
              <Texto valor={r.data} onChange={(v) => setRev(i, "data", v)} ph="dd/mm/aaaa" />
              <Texto valor={r.descricao} onChange={(v) => setRev(i, "descricao", v)} ph="o que mudou nesta revisão" />
              <Texto valor={r.elaborado} onChange={(v) => setRev(i, "elaborado", v)} ph="elaborado" />
              <Texto valor={r.verificado} onChange={(v) => setRev(i, "verificado", v)} ph="verificado" />
              <Texto valor={r.aprovado} onChange={(v) => setRev(i, "aprovado", v)} ph="aprovado" />
              <button onClick={() => setF((x) => ({ ...x, revisoes: x.revisoes.filter((_, j) => j !== i) }))}
                title="Remover esta revisão" className="text-torg-gray-light hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setF((x) => ({ ...x, revisoes: [...x.revisoes, { revisao: "", data: hojeBR(), descricao: "", elaborado: "", verificado: "", aprovado: "" }] }))}
          className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={11} /> revisão</button>
      </Secao>

      {/* ── FOLHA 2 · 1a — PREPARAÇÃO (jateamento) ── */}
      {/* ⚠⚠ JATEAMENTO E PINTURA SÃO DUAS COISAS. Vitor (27/08/2026): "está confuso na edição,
          muita informação que é de jateamento está em pintura e vice-versa". Estavam na mesma
          grade de oito campos: grau de limpeza e rugosidade (que se medem ANTES de pintar, com
          pente e rugosímetro) ao lado de método de aplicação e espessura seca (que se medem
          DEPOIS, com o medidor de camada). Quem preenche faz as duas coisas em momentos
          diferentes, com instrumentos diferentes — e a folha tem de seguir isso. */}
      <Secao folha="Folha 2 · 1" titulo="Preparação de superfície (jateamento)">
        <div className="grid sm:grid-cols-4 gap-2">
          <Campo rotulo="Método de preparo">
            <select value={f.preparoMetodo} onChange={(e) => set("preparoMetodo", e.target.value)} className={cls}>
              <option value="">—</option>
              {METODOS_PREPARO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Grau de limpeza">
            <select value={f.grauLimpeza} onChange={(e) => set("grauLimpeza", e.target.value)} className={cls}>
              <option value="">—</option>
              {GRAUS_LIMPEZA.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tipo de abrasivo"><Texto valor={f.abrasivo} onChange={(v) => set("abrasivo", v)} ph="granalha de aço" /></Campo>
          <Campo rotulo="Rugosidade (µm)">
            <div className="flex items-center gap-1">
              <Texto tipo="number" valor={f.rugosidadeMin} onChange={(v) => set("rugosidadeMin", v)} ph="mín" />
              <span className="text-[11px] text-torg-gray-light">a</span>
              <Texto tipo="number" valor={f.rugosidadeMax} onChange={(v) => set("rugosidadeMax", v)} ph="máx" />
            </div>
          </Campo>
        </div>
      </Secao>

      {/* ── FOLHA 2 · 1b — PINTURA ── */}
      <Secao folha="Folha 2 · 1" titulo="Esquema de pintura">
        <div className="grid sm:grid-cols-4 gap-2">
          <Campo rotulo="Método de aplicação">
            <select value={f.metodoAplicacao} onChange={(e) => set("metodoAplicacao", e.target.value)} className={cls}>
              <option value="">—</option>
              {METODOS_APLICACAO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Campo>
          {/* ⚠ A ESPESSURA TOTAL SEGUE AS DEMÃOS. Vitor: "não está dinâmico o preenchimento desse
              PLP". É a soma das camadas secas — digitar de novo é convite a divergir do esquema
              logo acima. Segue sozinha até alguém escrever outro valor; aí para de seguir. */}
          <Campo rotulo="Espessura total (µm)">
            <div className="flex items-center gap-1.5">
              <input type="number" value={so(f.espessuraTotal)}
                onChange={(e) => { set("espessuraTotal", e.target.value); set("totalManual", true); }}
                placeholder={String(somaDemaos || "")} className={cls} />
              {f.totalManual && somaDemaos > 0 && Number(f.espessuraTotal) !== somaDemaos && (
                <button onClick={() => setF((x) => ({ ...x, espessuraTotal: String(somaDemaos), totalManual: false }))}
                  title={`Soma das demãos: ${somaDemaos} µm`}
                  className="text-[10px] text-torg-blue hover:underline shrink-0 whitespace-nowrap">= {somaDemaos}</button>
              )}
            </div>
          </Campo>
        </div>

        <p className="text-[10px] uppercase tracking-wide text-torg-gray-light mt-1">Demãos</p>
        <div className="space-y-1.5">
          {f.demaos.map((dm, i) => (
            // ⚠ CADA DEMÃO É UM CARTÃO DE DUAS LINHAS, não sete colunas espremidas: com tudo numa
            // linha só, "Acabamento (Fábrica)" aparecia como "Acabamento (Fá" e as espessuras
            // viravam duas caixinhas de 10 px onde não dava para ler o número.
            <div key={i} className="border border-gray-100 rounded-lg p-2 space-y-1.5 bg-gray-50/40">
              <div className="grid sm:grid-cols-[11rem_1fr_1fr_1.5rem] gap-1.5 items-center">
                {/* ⚠ PRIMER, INTERMEDIÁRIA E ACABAMENTO JÁ VÊM NA LISTA. Vitor (27/08/2026):
                    "precisamos deixar alguns itens pré-selecionados: primer, intermediário e
                    acabamento". Campo livre fazia a mesma demão virar "Fundo" numa obra e "Primer"
                    noutra — e o esquema deixa de ser comparável entre obras. */}
                <select value={NOMES_DEMAO.includes(dm.nome) ? dm.nome : (dm.nome ? "__outro" : "")}
                  onChange={(e) => setDemao(i, "nome", e.target.value === "__outro" ? "" : e.target.value)}
                  className={`${cls} font-semibold`}>
                  <option value="">— demão —</option>
                  {NOMES_DEMAO.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value="__outro">outro…</option>
                </select>
                {/* o produto sai do CATÁLOGO (boletins técnicos importados); texto livre continua
                    valendo para a tinta que ainda não tem boletim cadastrado */}
                <div className="flex items-center gap-1">
                  <select value={dm.produtoId || ""}
                    onChange={(e) => {
                      const t = catalogo.find((x) => x.id === e.target.value);
                      if (t) aplicarProduto(i, t);
                      else setDemao(i, "produtoId", "");
                    }} className={`${cls} text-torg-gray`}>
                    <option value="">produto do catálogo…</option>
                    {catalogo.filter((t) => t.categoria !== "DILUENTE" && t.categoria !== "ENDURECEDOR")
                      .map((t) => <option key={t.id} value={t.id}>{t.fabricante} · {t.produto}</option>)}
                  </select>
                  <label title="Importar boletins técnicos (tinta, endurecedor, diluente) — pode escolher vários"
                    className="shrink-0 text-[11px] text-torg-blue border border-torg-blue-300 rounded-lg px-2 py-1.5 hover:bg-torg-blue-50 cursor-pointer inline-flex items-center gap-1">
                    {importando === i ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    <input type="file" multiple accept="application/pdf,image/*,.xlsx,.xls" className="hidden"
                      onChange={(e) => { importarBoletim(i, e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                <Texto valor={dm.produto} onChange={(v) => { setDemao(i, "produto", v); setDemao(i, "produtoId", ""); }} ph="produto / norma" />
                <button onClick={() => setF((x) => ({ ...x, demaos: x.demaos.filter((_, j) => j !== i) }))}
                  title="Remover esta demão" className="text-torg-gray-light hover:text-red-600 justify-self-center"><Trash2 size={13} /></button>
              </div>
              <div className="grid sm:grid-cols-[11rem_1fr_1fr_1.5rem] gap-1.5 items-center">
                <Texto valor={dm.fabricante} onChange={(v) => setDemao(i, "fabricante", v)} ph="fabricante" />
                <input list="cores-plp" value={so(dm.cor)} onChange={(e) => setDemao(i, "cor", e.target.value)}
                  placeholder="cor" className={cls} />
                <div className="flex items-center gap-1">
                  {/* ⚠ mexer na espessura seca refaz a úmida: as duas são a mesma conta. */}
                  <Texto tipo="number" valor={dm.espessuraMin} onChange={(v) => {
                    const t = catalogo.find((x) => x.id === dm.produtoId);
                    const umida = umidaDe(t, v, dm.diluicaoPct);
                    const tabela = umidasDe(t, v);
                    setF((x) => ({ ...x, demaos: x.demaos.map((d2, j) => (j === i ? { ...d2, espessuraMin: v, ...(umida != null ? { camadaUmida: String(umida) } : {}), ...(tabela.length ? { umidas: tabela } : {}) } : d2)) }));
                  }} ph="µm seca mín" />
                  <span className="text-[11px] text-torg-gray-light">a</span>
                  <Texto tipo="number" valor={dm.espessuraMax} onChange={(v) => setDemao(i, "espessuraMax", v)} ph="máx" />
                </div>
                <span />
              </div>
            </div>
          ))}
        </div>
        {f.demaos.length < 6 && (
          <button onClick={() => setF((x) => ({ ...x, demaos: [...x.demaos, { ordem: x.demaos.length + 1, nome: "", produto: "", fabricante: "", cor: "", espessuraMin: "", espessuraMax: "", lote: "", diluicao: "", camadaUmida: "", secagem: "", produtoId: "", diluicaoPct: "", componentes: "", potLife: "", umidas: [] }] }))}
            className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={11} /> demão</button>
        )}
      </Secao>

      {/* ── FOLHA 2 · 2 — especificações das tintas ── */}
      {/* ⚠ AS MESMAS DEMÃOS, OUTRAS COLUNAS: é a §2 do documento. Repetir o produto aqui como campo
          faria duas verdades para o mesmo dado; ele aparece só como referência da linha. */}
      <Secao folha="Folha 2 · 2" titulo="Especificações das tintas">
        <div className="space-y-1.5">
          {f.demaos.map((dm, i) => {
            const t = catalogo.find((x) => x.id === dm.produtoId) || null;
            const faixas = diluicoesDe(t);
            return (
              <div key={i} className="grid sm:grid-cols-[9rem_1fr_7rem_6rem_1fr] gap-1.5 items-center">
                <span className="text-[11px] text-torg-dark truncate" title={dm.produto || dm.nome}>
                  <b>{dm.nome || `${i + 1}ª demão`}</b>{dm.produto ? ` · ${dm.produto}` : ""}
                </span>
                <Texto valor={dm.lote} onChange={(v) => setDemao(i, "lote", v)} ph="lote / R" />
                {/* ⚠⚠ A CAMADA ÚMIDA VEM DA DILUIÇÃO. O boletim do INDUSTHANE dá 181 µm sem diluir,
                    200 µm a 10% e 209 µm a 15% — escolher a % preenche a espessura úmida sozinha.
                    Sem boletim cadastrado, os dois campos continuam livres para digitar. */}
                {faixas.length ? (
                  <select value={so(dm.diluicaoPct)} onChange={(e) => aplicarDiluicao(i, e.target.value)} className={cls}>
                    <option value="">diluição…</option>
                    {faixas.map((c) => <option key={c} value={c}>{c}%</option>)}
                  </select>
                ) : (
                  <Texto valor={dm.diluicao} onChange={(v) => setDemao(i, "diluicao", v)} ph="diluição" />
                )}
                {(dm.umidas || []).length ? (
                  // ⚠ as três (ou N) condições, não só a escolhida: é o que o pintor lê no galpão.
                  <span className="text-[11px] text-torg-dark leading-tight">
                    {dm.umidas.map((x) => (
                      <span key={x.d} className={`inline-block mr-2 ${String(x.d) === String(dm.diluicaoPct) ? "font-semibold" : "text-torg-gray"}`}>
                        {x.d}%: {x.u} µm
                      </span>
                    ))}
                  </span>
                ) : (
                  <Texto valor={dm.camadaUmida} onChange={(v) => setDemao(i, "camadaUmida", v)} ph="úmida µm" />
                )}
                <Texto valor={dm.secagem} onChange={(v) => setDemao(i, "secagem", v)} ph="tempo de secagem" />
                {/* ⚠ componentes e pot life ocupam a linha inteira: é o que a fábrica lê para
                    misturar, e cortar num campo de 6 rem não ajuda ninguém. */}
                <div className="sm:col-span-5 grid sm:grid-cols-[9rem_1fr_10rem] gap-1.5 items-center">
                  <span />
                  <Texto valor={dm.componentes} onChange={(v) => setDemao(i, "componentes", v)} ph="componente A · componente B · proporção" />
                  <Texto valor={dm.potLife} onChange={(v) => setDemao(i, "potLife", v)} ph="vida útil da mistura" />
                </div>
              </div>
            );
          })}
          {!f.demaos.length && <p className="text-[11px] text-torg-gray">Cadastre as demãos acima.</p>}
          {/* o que o boletim respondeu, para quem preenche saber de onde veio o número */}
          {f.demaos.some((dm) => dm.produtoId) && (
            <p className="text-[10px] text-torg-gray-light">
              Diluente, camada úmida e secagem vêm do boletim técnico do fabricante — dá para
              corrigir aqui se a obra usar outra condição.
            </p>
          )}
        </div>
      </Secao>

      {/* ── FOLHA 3 — itens da estrutura ── */}
      <Secao folha="Folha 3" titulo="Sistema de pintura da estrutura metálica">
        <div className="space-y-1.5">
          {f.itens.map((it, i) => (
            <div key={i} className="grid sm:grid-cols-[2fr_4.5rem_4.5rem_5rem_1fr_1.5fr_1.5rem] gap-1.5 items-center">
              <Texto valor={it.item} onChange={(v) => setItem(i, "item", v)} ph="equipamento / conjunto" />
              <label className="text-[11px] text-torg-gray inline-flex items-center gap-1 justify-center">
                <input type="checkbox" className="accent-torg-orange" checked={!!it.interno} onChange={(e) => setItem(i, "interno", e.target.checked)} /> interno
              </label>
              <label className="text-[11px] text-torg-gray inline-flex items-center gap-1 justify-center">
                <input type="checkbox" className="accent-torg-orange" checked={!!it.externo} onChange={(e) => setItem(i, "externo", e.target.checked)} /> externo
              </label>
              <input list="sistemas-plp" value={so(it.sistema)} onChange={(e) => setItem(i, "sistema", e.target.value)}
                placeholder="sistema" className={cls} />
              <input list="cores-plp" value={so(it.cor)} onChange={(e) => setItem(i, "cor", e.target.value)}
                placeholder="cor de acabamento" className={cls} />
              <Texto valor={it.obs} onChange={(v) => setItem(i, "obs", v)} ph="observação" />
              <button onClick={() => setF((x) => ({ ...x, itens: x.itens.filter((_, j) => j !== i) }))}
                title="Remover este item" className="text-torg-gray-light hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
          {!f.itens.length && <p className="text-[11px] text-torg-gray">Nenhum item relacionado.</p>}
        </div>
        {/* ⚠ item novo já vem com o sistema em uso: as obras da Torg têm um sistema só, e digitar
            "1" em cada linha é trabalho que o portal pode poupar. */}
        <button onClick={() => setF((x) => ({ ...x, itens: [...x.itens, { item: "", sistema: sistemas[0] || "1", cor: "", obs: "", interno: false, externo: true }] }))}
          className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={11} /> item</button>
      </Secao>

      {/* sugestões que se alimentam do que já foi preenchido — nada é imposto, tudo aceita texto livre */}
      <datalist id="cores-plp">{cores.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="sistemas-plp">{sistemas.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold text-torg-gray">OBSERVAÇÕES</span>
          {/* ⚠ o texto sai DOS CAMPOS acima, não de uma leitura. Observação que repete campo
              envelhece sozinha: muda a demão e ela continua dizendo a anterior. */}
          <button onClick={() => set("observacoes", descreverSistema(f, { grauNaNorma }))}
            className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1">
            <Sparkles size={11} /> descrever o sistema
          </button>
          {f.observacoes && (
            <button onClick={() => set("observacoes", "")} className="text-[11px] text-torg-gray hover:underline">limpar</button>
          )}
        </div>
        <textarea value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={4}
          placeholder="Descreva o sistema, retoques, faixas, exigências do cliente…" className={cls} />
      </div>

      {erro && <p className="text-[12px] text-red-600 inline-flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={salvar} disabled={salvando}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar plano
        </button>
        <button onClick={() => { setF(null); carregar(); }} className="text-[11px] text-torg-gray hover:underline">descartar as alterações</button>
        {ok && <span className="text-[12px] text-emerald-700">{ok}</span>}
      </div>
      <p className="text-[10px] text-torg-gray">
        Vale para o PDF do PLP e para os PRÓXIMOS relatórios de pintura desta obra. Os relatórios já
        criados guardam o que estava especificado no dia.
      </p>
    </div>
  );
}
