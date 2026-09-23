"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, HelpCircle, MinusCircle, Link2, RefreshCw, Search } from "lucide-react";

// ─── A CADEIA DE DOCUMENTOS DE UMA OBRA (PARTE 15) ───────────────────────────
//
// ⚠⚠ A TELA NUNCA ESCREVE "FALTA UMA NOTA". Metade da cadeia é emitida por terceiros e nunca passa
// pelo Omie da TORG — a remessa simbólica do cliente (art. 406, II) é o exemplo que o briefing
// apontou. Chamar de ausente o que nunca esteve ao alcance seria trocar um silêncio por uma
// afirmação falsa, e é o tipo de afirmação que alguém copia para um parecer.

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

const ESTILO = {
  ENCONTRADO: { rotulo: "Localizado", Icone: CheckCircle2, classe: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  NAO_ENCONTRADO: { rotulo: "Não localizado", Icone: AlertTriangle, classe: "border-amber-200 bg-amber-50 text-amber-800" },
  FORA_DO_ALCANCE: { rotulo: "Fora do alcance do portal", Icone: MinusCircle, classe: "border-gray-200 bg-gray-50 text-torg-gray" },
  NAO_CONSULTADO: { rotulo: "Não consultado", Icone: HelpCircle, classe: "border-red-200 bg-red-50 text-red-800" },
};

function Etapa({ e }) {
  const s = ESTILO[e.estado] ?? ESTILO.FORA_DO_ALCANCE;
  return (
    <div className={`rounded-xl border p-4 ${s.classe}`}>
      <div className="flex items-start gap-2">
        <s.Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {e.cfop ?? "sem CFOP fixo"} · {e.papel}
            <span className="ml-2 rounded border border-current/20 px-1.5 py-0.5 text-[10px] font-medium opacity-80">{s.rotulo}</span>
          </p>
          <p className="text-[11px] opacity-80">Emitente: {e.quem}{e.natureza ? ` · nota ${e.natureza}` : ""}</p>
          <p className="mt-1 text-xs">{e.motivo}</p>
          {/* ⚠⚠ O "SÓ SE" FICA NA ETAPA, não num rodapé: é ele que impede alguém de ler uma etapa
              condicional não localizada como pendência. */}
          {e.condicional && <p className="mt-1 text-xs font-medium">⚠ Esta etapa só é esperada quando: {e.condicional}.</p>}
          {e.fundamento && <p className="mt-1 text-[11px] opacity-80">Fundamento: {e.fundamento}</p>}
          {e.evidencias?.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px]">
              {e.evidencias.map((d, i) => (
                <li key={i} className="rounded border border-current/15 bg-white/50 px-2 py-1">
                  NF {d.numero ?? "?"}{d.serie ? `/${d.serie}` : ""} · {d.situacao ?? "situação não informada"} · {fmt(d.emitidaEm)}
                  <span className="opacity-70"> ({d.dataDeQue})</span> · {d.vinculo}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AbaCadeia() {
  const [opcoes, setOpcoes] = useState({ ops: [], operacoes: [] });
  const [f, setF] = useState({ opId: "", operacaoId: "" });
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/fiscal/inteligencia/cadeia").then((x) => x.json())
      .then((d) => { if (d.success) setOpcoes(d); else setErro(d.error); })
      .catch(() => setErro("Não foi possível carregar as obras e operações."));
  }, []);

  const conferir = useCallback(async () => {
    if (!f.opId || !f.operacaoId) { setErro("Escolha a obra e a operação."); return; }
    setCarregando(true); setErro(null);
    try {
      const resp = await fetch("/api/fiscal/inteligencia/cadeia", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await resp.json();
      if (!d.success) { setErro(d.error); setR(null); } else setR(d);
    } catch { setErro("Falha de rede."); } finally { setCarregando(false); }
  }, [f]);

  const escolhida = opcoes.operacoes.find((o) => o.id === f.operacaoId);
  // ⚠ Por ID, nunca por identidade de objeto — a tela recebe tudo por JSON.
  const orfaos = r ? r.documentos.filter((d) => !r.casados.includes(d.id)) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-torg-gray">Obra (OP)</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark"
              value={f.opId} onChange={(e) => setF({ ...f, opId: e.target.value })}>
              <option value="">— escolha —</option>
              {opcoes.ops.map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.cliente}{o.clienteUF ? ` (${o.clienteUF})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-torg-gray">Operação</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-torg-dark"
              value={f.operacaoId} onChange={(e) => setF({ ...f, operacaoId: e.target.value })}>
              <option value="">— escolha —</option>
              {opcoes.operacoes.map((o) => <option key={o.id} value={o.id}>{o.titulo} — {o.documentos} documento(s)</option>)}
            </select>
          </div>
        </div>
        {/* ⚠ Quantos EMITENTES a cadeia tem aparece antes da conferência: é o número que explica
            por que conferir só as notas da TORG nunca fecha a operação do art. 406. */}
        {escolhida && (
          <p className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-torg-gray">
            {escolhida.resumo} <strong className="text-torg-dark">{escolhida.documentos} documentos, {escolhida.emitentes.length} emitente(s): {escolhida.emitentes.join(", ")}.</strong>
          </p>
        )}
        <button onClick={conferir} disabled={carregando}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Conferir a cadeia
        </button>
      </div>

      {erro && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {erro}</p>
          <button onClick={conferir} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {r && (
        <>
          <div className="rounded-xl border border-torg-blue/20 bg-torg-blue/5 p-4">
            <p className="text-sm font-semibold text-torg-dark">OP {r.obra.numero} · {r.obra.cliente} — {r.operacao.titulo}</p>
            <p className="mt-1 text-xs text-torg-gray">
              {r.resumo.encontradas} localizada(s) · {r.resumo.naoLocalizadas} não localizada(s) ·
              {" "}{r.resumo.foraDoAlcance} fora do alcance
              {r.resumo.naoConsultadas > 0 ? ` · ${r.resumo.naoConsultadas} não consultada(s)` : ""}
              {r.resumo.condicionaisNaoLocalizadas > 0 ? ` · ${r.resumo.condicionaisNaoLocalizadas} condicional(is) não localizada(s)` : ""}
            </p>
            {r.operacao.alerta && <p className="mt-2 text-xs font-medium text-amber-800">{r.operacao.alerta}</p>}
            <p className="mt-2 text-[11px] text-torg-gray">
              <strong>Onde procurei:</strong> {r.cobertura.escopo}.
              {r.cobertura.falhas?.length > 0 && <> <strong className="text-red-700">A busca ficou incompleta:</strong> {r.cobertura.falhas.join("; ")}.</>}
            </p>
          </div>

          <div className="space-y-2">{r.etapas.map((e, i) => <Etapa key={i} e={e} />)}</div>

          {orfaos.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {/* ⚠ Documento da obra que não casou com etapa nenhuma é uma pergunta por si só:
                  ou a operação escolhida não é a desta obra, ou saiu um CFOP que a cadeia não prevê. */}
              <p className="text-sm font-semibold text-torg-dark">{orfaos.length} documento(s) da obra que não casaram com nenhuma etapa</p>
              <p className="text-[11px] text-torg-gray">Ou a operação escolhida não é a desta obra, ou saiu um CFOP que esta cadeia não prevê.</p>
              <ul className="mt-2 space-y-1 text-xs text-torg-gray">
                {orfaos.map((d, i) => (
                  <li key={i} className="flex items-center gap-2"><Link2 className="h-3 w-3" />
                    NF {d.numero ?? "?"} · CFOP {d.cfops?.join(", ") || "não legível"} · {d.vinculo}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ⚠⚠ A RESSALVA DE FECHO NÃO É RODAPÉ DECORATIVO — é o que impede a tela de ser lida
              como "a cadeia está completa". */}
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">{r.ressalva}</p>
        </>
      )}
    </div>
  );
}
