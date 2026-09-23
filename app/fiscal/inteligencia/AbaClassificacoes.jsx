"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Ban, Plus, BookMarked, RefreshCw } from "lucide-react";

// ─── O REGISTRO DE CLASSIFICAÇÃO DE PRODUTO (§14) ────────────────────────────
//
// ⚠⚠ A TELA NÃO CLASSIFICA NADA — ela guarda quem classificou. Matheus (22/09/2026): *"utilizamos o
// item ARMAÇÃO DE ESTRUTURA METÁLICA para todos os faturamentos, só alteramos o NCM conforme o
// cliente solicita"*. Enquanto essa decisão mora na cabeça de quem emite, não há o que auditar; o
// que esta aba faz é dar onde escrevê-la, com fundamento, aprovador e data.
//
// ⚠⚠ E NÃO HÁ CAMPO DE CLIENTE, DE PROPÓSITO. Classificação segue a natureza do produto; um campo
// de cliente transformaria em cadastro justamente a prática que o registro existe para questionar.

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const ncmFmt = (n) => (String(n ?? "").length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n || "—");

const SELO = {
  PROPOSTA: { texto: "Proposta", classe: "bg-amber-50 text-amber-700 border-amber-200" },
  APROVADA: { texto: "Aprovada", classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REVOGADA: { texto: "Revogada", classe: "bg-gray-100 text-torg-gray border-gray-200" },
};

const VAZIO = { codigoProduto: "", padraoDescricao: "", ncm: "", fundamento: "", normaChave: "", observacao: "" };

function Selo({ status }) {
  const s = SELO[status] ?? SELO.REVOGADA;
  return <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${s.classe}`}>{s.texto}</span>;
}

/** ⚠ O formulário é curto de propósito: padrão, NCM e fundamento. Os três são a decisão. */
function Formulario({ onSalvar, salvando }) {
  const [f, setF] = useState(VAZIO);
  const campo = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const pronto = f.padraoDescricao.trim().length >= 3 && /^\d{4}\.?\d{2}\.?\d{2}$/.test(f.ncm.trim()) && f.fundamento.trim().length >= 10;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-torg-dark"><Plus className="h-4 w-4" /> Registrar uma classificação</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs text-torg-gray">
          Natureza da peça <span className="text-red-500">*</span>
          <input {...campo("padraoDescricao")} placeholder="FLANGE" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark" />
          <span className="mt-1 block text-[11px]">O texto que identifica a peça na descrição do item.</span>
        </label>
        <label className="text-xs text-torg-gray">
          NCM <span className="text-red-500">*</span>
          <input {...campo("ncm")} placeholder="7307.29.00" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark" />
        </label>
        <label className="text-xs text-torg-gray">
          Código do produto no Omie
          <input {...campo("codigoProduto")} placeholder="vazio = qualquer código" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark" />
        </label>
      </div>
      <label className="mt-3 block text-xs text-torg-gray">
        Fundamento <span className="text-red-500">*</span>
        <textarea {...campo("fundamento")} rows={2} placeholder="RGI 1 — acessório de tubulação de ferro ou aço." className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark" />
        {/* ⚠⚠ OBRIGATÓRIO. Sem fundamento o registro vira uma lista de NCMs sem quem responda por eles. */}
        <span className="mt-1 block text-[11px]">É o que sustenta a decisão quando alguém perguntar por quê.</span>
      </label>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-torg-gray">Nasce como <strong>proposta</strong> — só orienta emissão depois de aprovada.</p>
        <button disabled={!pronto || salvando} onClick={() => onSalvar(f, () => setF(VAZIO))}
          className="inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Propor
        </button>
      </div>
    </div>
  );
}

function Linha({ c, agindo, onAcao }) {
  // ⚠ Quando propositor e aprovador são a mesma pessoa, a tela DIZ. O time são duas pessoas e a
  // coincidência é legítima — escondê-la é que faria o registro parecer mais revisado do que é.
  const mesmaPessoa = c.status === "APROVADA" && c.aprovadoPorId === c.criadoPorId;
  return (
    <tr className="align-top">
      <td className="px-3 py-3">
        <p className="text-sm font-semibold text-torg-dark">{c.padraoDescricao}</p>
        <p className="text-[11px] text-torg-gray">{c.codigoProduto ? `Código ${c.codigoProduto}` : "Qualquer código de produto"}</p>
      </td>
      <td className="px-3 py-3 font-mono text-sm text-torg-dark tabular-nums">{ncmFmt(c.ncm)}</td>
      <td className="px-3 py-3 text-xs text-torg-gray">{c.fundamento}</td>
      <td className="px-3 py-3 text-xs text-torg-gray">
        <Selo status={c.status} />
        <p className="mt-1">Proposta por {c.criadoPorNome} em {fmt(c.criadoEm)}</p>
        {c.aprovadoEm && <p>Aprovada por {c.aprovadoPorNome} em {fmt(c.aprovadoEm)}</p>}
        {mesmaPessoa && <p className="text-amber-700">⚠ Proposta e aprovação da mesma pessoa.</p>}
        {c.revogadoEm && <p>Revogada por {c.revogadoPorNome} em {fmt(c.revogadoEm)}{c.motivoRevogacao ? ` — ${c.motivoRevogacao}` : ""}</p>}
      </td>
      <td className="px-3 py-3 text-right">
        {c.status === "PROPOSTA" && (
          <button disabled={agindo} onClick={() => onAcao(c.id, "aprovar")}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40">
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
          </button>
        )}
        {c.status !== "REVOGADA" && (
          <button disabled={agindo} onClick={() => onAcao(c.id, "revogar")}
            className="ml-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-torg-gray disabled:opacity-40">
            <Ban className="h-3.5 w-3.5" /> Revogar
          </button>
        )}
      </td>
    </tr>
  );
}

export default function AbaClassificacoes({ showToast }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [agindo, setAgindo] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/inteligencia/classificacoes");
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Não foi possível ler o registro.");
      setLista(j.classificacoes);
    } catch (e) {
      // ⚠⚠ ERRO NÃO É LISTA VAZIA. Tela vazia diz "ninguém classificou nada"; isso é uma afirmação
      // sobre o cadastro, e o cadastro não foi lido. A mesma lição do autocomplete e das medições.
      setErro(e.message);
      setLista(null);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const propor = async (f, limpar) => {
    setSalvando(true);
    try {
      const r = await fetch("/api/fiscal/inteligencia/classificacoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      limpar();
      showToast?.("Classificação proposta — ela ainda não orienta emissão.", "success");
      await carregar();
    } catch (e) {
      showToast?.(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const acao = async (id, tipo) => {
    if (tipo === "revogar" && !confirm("Revogar esta classificação? Ela deixa de orientar, mas fica no histórico.")) return;
    setAgindo(id);
    try {
      const r = await fetch(`/api/fiscal/inteligencia/classificacoes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: tipo }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      showToast?.(tipo === "aprovar" ? "Classificação aprovada." : "Classificação revogada.", "success");
      await carregar();
    } catch (e) {
      showToast?.(e.message, "error");
    } finally {
      setAgindo(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-torg-blue/20 bg-torg-blue/5 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark"><BookMarked className="h-4 w-4" /> Classificação dos produtos</h2>
        <p className="mt-1 text-xs text-torg-gray">
          Todos os faturamentos saem no mesmo item (<strong>ARMAÇÃO DE ESTRUTURA METÁLICA</strong>) e o que distingue cada peça é a
          descrição. Este registro guarda <strong>qual NCM foi decidido para cada natureza de peça, com que fundamento e por quem</strong> —
          é contra ele que a auditoria compara o NCM declarado.
        </p>
        {/* ⚠⚠ O LIMITE FICA ESCRITO NA TELA, não só no código. */}
        <p className="mt-2 text-[11px] text-torg-gray">
          ⚠ A busca é por texto: ela <strong>localiza</strong> a decisão, não prova que a decisão fala daquela peça. E a conferência é
          sempre contra o cadastro de <strong>hoje</strong> — não contra o que valia na data de uma nota antiga.
        </p>
      </div>

      <Formulario onSalvar={propor} salvando={salvando} />

      {erro && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {erro}</p>
          <button onClick={carregar} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {!erro && lista === null && (
        <p className="flex items-center gap-2 p-8 text-sm text-torg-gray"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o registro…</p>
      )}

      {lista?.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <BookMarked className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-torg-dark">Nenhuma classificação registrada ainda</p>
          <p className="text-xs text-torg-gray">Enquanto o registro estiver vazio, a auditoria aponta os itens como “sem classificação aprovada”.</p>
        </div>
      )}

      {lista?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50/60 text-left text-[11px] uppercase tracking-wide text-torg-gray">
              <tr>
                <th className="px-3 py-2">Natureza da peça</th><th className="px-3 py-2">NCM</th>
                <th className="px-3 py-2">Fundamento</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map((c) => <Linha key={c.id} c={c} agindo={agindo === c.id} onAcao={acao} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
