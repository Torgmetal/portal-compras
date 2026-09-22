"use client";

import { useState } from "react";
import { Upload, FileText, TriangleAlert, CheckCircle2, Layers } from "lucide-react";
import Previa from "./Previa";
import Plano from "./Plano";

// ⚠⚠ ANALISAR E GRAVAR SÃO DOIS PASSOS, E O PRIMEIRO NÃO ESCREVE NADA. O import de lista do portal
// já ensinou o preço de misturar os dois: a aba "Revisão" dizia "18 incluídas" e nenhuma entrou,
// porque o número era uma PREVISÃO apresentada como recibo. Aqui a pessoa vê a prévia, olha as
// divergências, e só então grava.

export default function NestingClient({ iniciais, recursos = [] }) {
  const [planos, setPlanos] = useState(iniciais);
  const [previa, setPrevia] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  const enviar = async (gravar) => {
    setOcupado(true);
    setErro(null);
    try {
      const corpo = new FormData();
      for (const a of arquivos) corpo.append("arquivos", a);
      const r = await fetch(`/api/mes-lab/nesting${gravar ? "?gravar=1" : ""}`, { method: "POST", body: corpo });
      const json = await r.json();
      if (!json.success) throw new Error(json.error);
      if (gravar) {
        setPrevia(null);
        setArquivos([]);
        const lista = await (await fetch("/api/mes-lab/nesting")).json();
        setPlanos(lista.planos || []);
      } else setPrevia(json.previa);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] text-torg-dark">
      <div className="flex items-center gap-3 bg-torg-dark px-6 py-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/torg-logo-white.png" alt="Torg Metal" className="h-8 w-auto sm:h-9" />
        <div className="hidden h-6 w-px bg-white/20 sm:block" />
        <span className="hidden text-sm font-medium text-torg-blue-200 sm:block">Nesting da Preparação</span>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-2.5 h-1 w-11 rounded bg-torg-orange" />
        <h1 className="text-2xl font-extrabold leading-none sm:text-3xl">O plano de corte</h1>
        <p className="mt-1.5 text-sm text-torg-gray">
          Mande o <strong>PDF do plano</strong> — o mesmo papel que vai para a mão do operador — e,
          se tiver, os arquivos da máquina (<code>.zx</code>, <code>.zh</code>, <code>.yxy</code>,
          <code>.lxd</code>), que dão a ordem de corte peça a peça.
        </p>

        <div className="mt-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 px-5 py-6 hover:border-torg-blue/40">
            <Upload size={22} className="text-torg-blue" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Escolher os arquivos do plano</p>
              <p className="truncate text-xs text-torg-gray">
                {arquivos.length ? arquivos.map((a) => a.name).join(" · ") : "PDF + arquivos da máquina"}
              </p>
            </div>
            <input
              type="file" multiple className="hidden"
              accept=".pdf,.zx,.zh,.yxy,.lxd"
              onChange={(e) => { setArquivos([...e.target.files]); setPrevia(null); setErro(null); }}
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => enviar(false)}
              disabled={!arquivos.length || ocupado}
              className="rounded-xl bg-torg-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {ocupado && !previa ? "Lendo…" : "Ler o plano"}
            </button>
            {previa ? (
              <button
                onClick={() => enviar(true)}
                disabled={ocupado}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                <CheckCircle2 size={16} /> Gravar este plano
              </button>
            ) : null}
            {erro ? (
              <span className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                <TriangleAlert size={16} /> {erro}
              </span>
            ) : null}
          </div>

          {previa ? <Previa previa={previa} /> : null}
        </div>

        <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-extrabold">
          <Layers size={18} className="text-torg-gray" /> Planos importados
        </h2>
        {planos.length === 0 ? (
          <p className="rounded-2xl border border-gray-100 bg-white px-5 py-8 text-center text-sm text-torg-gray">
            <FileText size={20} className="mx-auto mb-2 text-gray-300" />
            Nenhum plano ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {planos.map((p) => <Plano key={p.id} plano={p} recursos={recursos} />)}
          </div>
        )}
      </div>
    </div>
  );
}
