"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Clock, ExternalLink, FolderOpen, Paintbrush, FileText, ClipboardCheck, Check, Sparkles, AlertCircle } from "lucide-react";
import { TIPO_LABEL, TIPOS_RELATORIO } from "@/lib/qualidade-campo";
import AceitePlano from "./AceitePlano";

// ─── OS RELATÓRIOS DE INSPEÇÃO DESTA OBRA ─────────────────────────────────────
// Vitor (22/08/2026): "relatórios aprovados deverão ser guardados na aba de qualidade
// das OPs, na página geral da OP".
//
// A página de Inspeções é a fila de TRABALHO da Qualidade — nasce, preenche, aprova.
// Aqui é a outra pergunta, a que se faz meses depois: "o que essa obra tem de
// inspeção?". Quem abre a OP quer ver o que já foi aprovado e o que falta, sem
// atravessar a fila de todas as obras.
export default function AbaQualidade({ opNumero }) {
  const [pit, setPit] = useState(null);
  const [salvandoPit, setSalvandoPit] = useState(false);
  useEffect(() => {
    fetch(`/api/qualidade/pit/${encodeURIComponent(opNumero)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!j.error) setPit(j); }).catch(() => {});
  }, [opNumero]);

  async function salvarPadrao(padrao) {
    setSalvandoPit(true);
    try {
      const r = await fetch(`/api/qualidade/pit/${encodeURIComponent(opNumero)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ padrao, revisao: pit?.revisao || "0" }),
      });
      if (r.ok) setPit((p) => ({ ...p, padrao }));
    } finally { setSalvandoPit(false); }
  }

  // ── ler o documento de PLP da pasta da obra ──
  // Vitor (26/08/2026): "nessa parte do PLP preciso que você leia um documento e preencha com as
  // informações os campos que precisam".
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState(null);
  const [erroPlp, setErroPlp] = useState("");
  async function lerPlp() {
    setLendo(true); setErroPlp(""); setLeitura(null);
    try {
      const r = await fetch(`/api/qualidade/plp/${encodeURIComponent(opNumero)}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler o PLP da pasta.");
      setLeitura(j);
    } catch (e) { setErroPlp(e.message); } finally { setLendo(false); }
  }

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
      {/* ⚠ O PLP MORA AQUI. Vitor (26/08/2026): "ele será gerado na aba da OP dentro da área da
          qualidade". É o lugar certo: o PLP é documento DA OBRA, não de um relatório de inspeção —
          ele existe antes da primeira inspeção e vale para todas elas. */}
      {/* ⚠ O PIT NASCE COM A PROPOSTA, mas o padrão pode ser escolhido aqui — Vitor (26/08/2026):
          "também pode ser selecionado na aba da qualidade, igual vamos fazer no PLP". */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-1">
          <ClipboardCheck size={15} className="text-torg-blue" /> Plano de Inspeção e Testes (PIT)
        </h4>
        <p className="text-[12px] text-torg-gray mb-3">
          Escolha o padrão da obra — ele define o que a Qualidade inspeciona, com que percentual e
          contra qual norma. O documento sai no padrão Torg, com o campo de assinatura do
          <b> inspetor do cliente</b>.
        </p>
        {!pit ? (
          <p className="text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> carregando…</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              {(pit.opcoes || []).map((o) => {
                const on = pit.padrao === o.id;
                return (
                  <button key={o.id} onClick={() => salvarPadrao(o.id)} disabled={salvandoPit}
                    className={`text-left border rounded-lg px-3 py-2 disabled:opacity-60 ${on ? "border-torg-blue bg-torg-blue/5" : "border-gray-200 hover:border-torg-blue-300"}`}>
                    <span className="block text-[12px] font-semibold text-torg-dark">
                      {on && <Check size={11} className="inline -mt-0.5 mr-1 text-torg-blue" />}{o.nome}
                    </span>
                    <span className="block text-[11px] text-torg-gray">{o.resumo}</span>
                    <span className="block text-[10px] text-torg-gray-light mt-0.5">{o.itens} itens de inspeção</span>
                  </button>
                );
              })}
            </div>
            {pit.padrao ? (
              <a href={`/api/qualidade/planos/${encodeURIComponent(opNumero)}/pdf?doc=PIT`} target="_blank" rel="noreferrer"
                className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1.5">
                <FileText size={13} /> Gerar PIT (PDF)
              </a>
            ) : (
              // ⚠ sem padrão não se emite: um plano de inspeção que ninguém escolheu seria assinado
              // pelo cliente como se fosse decisão nossa.
              <p className="text-[12px] text-amber-700">Escolha um padrão acima para emitir o PIT.</p>
            )}
            {/* ⚠⚠ O PIT NÃO VALE SEM O ACEITE DO CLIENTE. Vitor (26/08/2026): "o PIT também deve
                conter o aceite por parte do cliente, não pode deixar de ter esse aceite". */}
            {pit.padrao && <AceitePlano opNumero={opNumero} doc="PIT" nome="o PIT" />}
          </>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-1">
          <Paintbrush size={15} className="text-torg-blue" /> Plano de Pintura (PLP)
        </h4>
        <p className="text-[12px] text-torg-gray mb-3">
          Sai no padrão Torg, com o quadro de aprovações (elaboração, verificação e o inspetor do
          cliente). Obra, cliente, local, Nº PC/CT e referência do cliente vêm do portal; o sistema
          de pintura e as cores por item vêm do PLP cadastrado na Qualidade.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/qualidade/planos/${encodeURIComponent(opNumero)}/pdf?doc=PLP`} target="_blank" rel="noreferrer"
            title="Gera o PLP desta obra no padrão Torg, em PDF"
            className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1.5">
            <FileText size={13} /> Gerar PLP (PDF)
          </a>
          {/* ⚠ LÊ O DOCUMENTO DA PASTA E PREENCHE. A planilha da obra raramente está no modelo
              Torg (as da OP-105 e OP-106 são do cliente, e as da OP-089 e OP-094 são PDF) — por
              isso a leitura cai na IA quando o parser do modelo não reconhece nada. */}
          <button onClick={lerPlp} disabled={lendo}
            title="Lê o documento em 8. Qualidade / 2. PLP e preenche os campos do plano"
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {lendo ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Ler o PLP da pasta da obra
          </button>
          <Link href="/qualidade/inspecoes" className="text-[11px] text-torg-blue hover:underline">
            editar o plano de pintura da obra
          </Link>
        </div>
        {erroPlp && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 inline-flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {erroPlp}
          </p>
        )}
        {leitura && (
          <div className="text-[12px] bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 mt-2">
            <p className="text-emerald-800">
              Li <b>{leitura.arquivo}</b>: {leitura.resumo?.demaos || 0} demão(ões){leitura.resumo?.itens ? `, ${leitura.resumo.itens} item(ns) da estrutura` : ""}
              {leitura.resumo?.preparo ? ` · ${leitura.resumo.preparo}` : ""}{leitura.resumo?.grau ? ` ${leitura.resumo.grau}` : ""}.
            </p>
            {/* ⚠ leitura por IA se confere ANTES de virar plano da obra: o esquema vale para a
                estrutura inteira, e um valor plausível e errado é aplicado em tudo. */}
            {leitura.via === "IA" && (
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Leitura automática do documento (o arquivo não está no modelo Torg) — <b>confira os campos</b> antes de emitir.
              </p>
            )}
          </div>
        )}
        <AceitePlano opNumero={opNumero} doc="PLP" nome="o PLP" />
      </div>

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
