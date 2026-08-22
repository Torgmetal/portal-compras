"use client";
import { useEffect, useState, useCallback } from "react";
import { FolderOpen, Folder, FileText, Loader2, ArrowLeft, X, Check } from "lucide-react";

// ─── ESCOLHER O PROJETO NA PASTA DA OBRA ──────────────────────────────────────
// Vitor (22/08/2026): "você precisa deixar para eu selecionar a peça também; na pasta
// da engenharia temos uma pasta chamada Montagem, lá ficam os diagramas de montagem, e
// os conjuntos também preciso ter a permissão para poder selecionar".
//
// ⚠ ESCOLHER É MELHOR QUE ANEXAR, e por isso é o botão da frente. Subir uma cópia cria
// uma segunda versão do projeto, solta do controle da Engenharia — quando o desenho for
// revisado, o relatório continuaria mostrando a versão velha e ninguém saberia.
// Escolhendo, o portal aponta para o arquivo original. O anexo fica para o caso em que o
// arquivo realmente não está no servidor.
export default function EscolherProjeto({ relatorioId, onEscolhido, onFechar }) {
  const [raizes, setRaizes] = useState(null);
  const [pasta, setPasta] = useState(null);   // { path, label }
  const [pilha, setPilha] = useState([]);     // para o "voltar"
  const [conteudo, setConteudo] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");

  useEffect(() => {
    fetch(`/api/qualidade/inspecoes/${relatorioId}/projetos`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setRaizes(j.raizes || [])))
      .catch(() => setErro("Não consegui falar com o servidor."));
  }, [relatorioId]);

  const abrir = useCallback(async (alvo, empilhar = true) => {
    setConteudo(null); setErro("");
    if (empilhar && pasta) setPilha((p) => [...p, pasta]);
    setPasta(alvo);
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/projetos?pasta=${encodeURIComponent(alvo.path)}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setConteudo(j);
    } catch (e) { setErro(e.message); }
  }, [relatorioId, pasta]);

  const voltar = () => {
    const ant = pilha[pilha.length - 1];
    setPilha((p) => p.slice(0, -1));
    if (ant) abrir(ant, false); else { setPasta(null); setConteudo(null); }
  };

  async function escolher(arq) {
    setSalvando(arq.path); setErro("");
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/projetos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: arq.path }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao escolher.");
      onEscolhido?.();
    } catch (e) { setErro(e.message); setSalvando(""); }
  }

  return (
    <div className="mt-2 border border-torg-blue-200 rounded-xl bg-torg-blue-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-bold text-torg-dark inline-flex items-center gap-1.5 min-w-0">
          <FolderOpen size={12} className="text-torg-blue shrink-0" />
          {pasta ? <span className="truncate">{pasta.label || pasta.path.split("/").pop()}</span> : "Projetos desta OP"}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {(pasta || pilha.length > 0) && (
            <button onClick={voltar} className="text-[11px] text-torg-blue inline-flex items-center gap-1">
              <ArrowLeft size={11} /> voltar
            </button>
          )}
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={13} /></button>
        </div>
      </div>

      {erro && <p className="text-[11px] text-red-600 mb-1.5">{erro}</p>}

      {!pasta ? (
        raizes === null ? (
          <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> procurando as pastas…</p>
        ) : (
          <div className="space-y-1">
            {raizes.map((r) => (
              <button key={r.path} onClick={() => abrir(r)}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-torg-blue">
                <Folder size={12} className="text-torg-blue shrink-0" />
                <span className="text-[12px] text-torg-dark truncate">{r.label}</span>
              </button>
            ))}
            {!raizes.length && <p className="text-[11px] text-torg-gray">Nenhuma pasta de projetos encontrada nesta OP.</p>}
          </div>
        )
      ) : conteudo === null ? (
        <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> abrindo…</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {conteudo.pastas.map((p) => (
            <button key={p.path} onClick={() => abrir({ path: p.path, label: p.nome })}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-torg-blue">
              <Folder size={12} className="text-torg-blue shrink-0" />
              <span className="text-[12px] text-torg-dark truncate">{p.nome}</span>
            </button>
          ))}
          {conteudo.arquivos.map((a) => (
            <button key={a.path} onClick={() => escolher(a)} disabled={!!salvando}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-torg-blue disabled:opacity-60">
              {salvando === a.path
                ? <Loader2 size={12} className="animate-spin text-torg-blue shrink-0" />
                : <FileText size={12} className="text-torg-gray shrink-0" />}
              <span className="text-[12px] text-torg-dark truncate flex-1">{a.nome}</span>
              <Check size={11} className="text-torg-blue shrink-0 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
          {!conteudo.pastas.length && !conteudo.arquivos.length && (
            <p className="text-[11px] text-torg-gray">Pasta vazia — ou sem PDF.</p>
          )}
        </div>
      )}
    </div>
  );
}
