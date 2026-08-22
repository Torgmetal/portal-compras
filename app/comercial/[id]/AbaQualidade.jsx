"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Clock, ExternalLink, FolderOpen } from "lucide-react";
import { TIPO_LABEL, TIPOS_RELATORIO } from "@/lib/qualidade-campo";

// ─── OS RELATÓRIOS DE INSPEÇÃO DESTA OBRA ─────────────────────────────────────
// Vitor (22/08/2026): "relatórios aprovados deverão ser guardados na aba de qualidade
// das OPs, na página geral da OP".
//
// A página de Inspeções é a fila de TRABALHO da Qualidade — nasce, preenche, aprova.
// Aqui é a outra pergunta, a que se faz meses depois: "o que essa obra tem de
// inspeção?". Quem abre a OP quer ver o que já foi aprovado e o que falta, sem
// atravessar a fila de todas as obras.
export default function AbaQualidade({ opNumero }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/qualidade/inspecoes?opNumero=${encodeURIComponent(opNumero)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setDados(j)))
      .catch(() => setErro("Não consegui carregar os relatórios."));
  }, [opNumero]);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!dados) {
    return <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>;
  }

  const rels = dados.relatorios || [];
  const aprovados = rels.filter((r) => r.resultadoInspecao === "APROVADO");
  const pendentes = rels.filter((r) => r.resultadoInspecao !== "APROVADO");
  const ordem = TIPOS_RELATORIO.map((t) => t.id);
  const porTipo = (lista) => {
    const m = new Map();
    for (const r of lista) m.set(r.tipo, [...(m.get(r.tipo) || []), r]);
    return [...m.entries()].sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]));
  };

  const Linha = ({ r }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <Link href={`/qualidade/inspecoes/${r.id}`} className="font-mono text-[12px] font-semibold text-torg-blue hover:text-torg-dark">
          {r.codigo}
        </Link>
        {r.marcas?.length ? <span className="text-[12px] text-torg-dark"> · {r.marcas.slice(0, 3).join(", ")}{r.marcas.length > 3 ? ` +${r.marcas.length - 3}` : ""}</span> : null}
        <p className="text-[10px] text-torg-gray">{r.inspetor || r.criadoPorNome || "—"}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* ⚠ o link do arquivo aponta para o PDF na PASTA DA OBRA, não para o gerado na hora:
            é a cópia que sobrevive ao portal, e é ela que o auditor vai abrir. */}
        {r.arquivoUrl && (
          <a href={r.arquivoUrl} target="_blank" rel="noreferrer" title="PDF guardado na pasta da obra"
            className="text-[11px] text-torg-gray hover:text-torg-blue inline-flex items-center gap-1">
            <FolderOpen size={12} /> servidor
          </a>
        )}
        <a href={`/api/qualidade/inspecoes/${r.id}/pdf`} target="_blank" rel="noreferrer"
          className="text-[11px] text-torg-blue inline-flex items-center gap-1"><ExternalLink size={12} /> PDF</a>
      </div>
    </div>
  );

  const Bloco = ({ titulo, icone: Icone, cor, lista, vazio }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h4 className={`text-sm font-semibold ${cor} flex items-center gap-2 mb-3`}>
        <Icone size={15} /> {titulo} <span className="text-torg-gray font-normal">{lista.length}</span>
      </h4>
      {!lista.length ? (
        <p className="text-[12px] text-torg-gray">{vazio}</p>
      ) : (
        porTipo(lista).map(([tipo, rs]) => (
          <div key={tipo} className="mb-2 last:mb-0">
            <p className="text-[11px] font-semibold text-torg-gray mb-0.5">{TIPO_LABEL[tipo] || tipo}</p>
            <div className="border border-gray-100 rounded-lg">
              {rs.map((r) => <Linha key={r.id} r={r} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Bloco titulo="Relatórios aprovados" icone={ShieldCheck} cor="text-emerald-700" lista={aprovados}
        vazio="Nenhum relatório aprovado nesta obra ainda." />
      <Bloco titulo="Aguardando aprovação" icone={Clock} cor="text-torg-dark" lista={pendentes}
        vazio="Nada pendente — todos os relatórios desta obra já foram aprovados." />
      <p className="text-[11px] text-torg-gray">
        O PDF de cada relatório aprovado é guardado também na pasta da obra, em{" "}
        <span className="font-mono">8. Qualidade / 3. Relatórios de Inspeção</span> — é a cópia de backup,
        fora do portal.
      </p>
    </div>
  );
}
