"use client";
import { useState } from "react";
import { PenLine, Upload, RotateCw, Trash2, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { prepararAssinatura } from "@/lib/assinatura-imagem";

/**
 * A IMAGEM DA ASSINATURA DA PESSOA — a que sai no campo de assinatura dos documentos.
 *
 * ⚠ O tratamento é feito AQUI, no navegador: a foto do carimbo vem deitada, com fundo de papel e
 * 4000px de lado. A prévia mostra o resultado TRATADO, não o arquivo original — é o que vai para o
 * documento, e é sobre isso que se decide se está bom.
 *
 * ⚠⚠ A imagem cadastrada nunca aparece por URL do Blob: vem de /api/usuarios/assinatura/[id], que
 * confere se quem pede é o dono dela (ou um ADMIN). Vitor (28/08/2026): "essa assinatura tem que
 * ficar restrita a esse usuário, não sendo possível ser usada por mais ninguém".
 *
 * Em `novo` (usuário ainda sendo criado) não há id para onde subir: o componente só prepara a
 * imagem e entrega o arquivo pronto ao formulário, que sobe depois de criar o usuário.
 */
export default function AssinaturaUsuario({ id = null, tem = false, onMudar = null, novo = false, aoPreparar = null }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState(null);   // o original escolhido, para poder girar de novo
  const [rotacao, setRotacao] = useState(0);
  const [previa, setPrevia] = useState(null);     // { url, blob }
  const [versao, setVersao] = useState(0);        // força recarregar depois de trocar
  const [salvo, setSalvo] = useState(false);

  const srcCadastrada = tem && id ? `/api/usuarios/assinatura/${id}?v=${versao}` : null;
  const mostrar = previa?.url || srcCadastrada;

  async function tratar(file, rot) {
    setErro(""); setProcessando(true); setSalvo(false);
    try {
      const blob = await prepararAssinatura(file, { rotacao: rot });
      setPrevia((p) => { if (p?.url) URL.revokeObjectURL(p.url); return { url: URL.createObjectURL(blob), blob }; });
      if (novo) aoPreparar?.(blob);
    } catch (e) { setErro(e.message); setPrevia(null); if (novo) aoPreparar?.(null); }
    finally { setProcessando(false); }
  }

  async function escolher(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setArquivo(file); setRotacao(0);
    await tratar(file, 0);
  }

  async function girar() {
    const r = (rotacao + 90) % 360;
    setRotacao(r);
    if (arquivo) await tratar(arquivo, r);
  }

  async function salvar() {
    if (!previa?.blob || !id) return;
    setErro(""); setProcessando(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([previa.blob], "assinatura.png", { type: "image/png" }));
      const r = await fetch(`/api/admin/usuarios/${id}/assinatura`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Erro ao salvar.");
      if (previa.url) URL.revokeObjectURL(previa.url);
      setPrevia(null); setArquivo(null); setSalvo(true);
      setVersao((v) => v + 1);
      onMudar?.(true);
    } catch (e) { setErro(e.message); } finally { setProcessando(false); }
  }

  async function remover() {
    if (!id) return;
    setErro(""); setProcessando(true);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}/assinatura`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Erro ao remover.");
      onMudar?.(false); setSalvo(false);
    } catch (e) { setErro(e.message); } finally { setProcessando(false); }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-torg-dark mb-1.5">
        <PenLine size={14} className="inline mb-0.5 mr-1 text-torg-blue" />
        Assinatura <span className="text-torg-gray font-normal">(opcional — sai no campo de assinatura dos documentos que esta pessoa assinar)</span>
      </label>

      <div className="border border-gray-200 rounded-lg p-3 space-y-2.5">
        {mostrar ? (
          <div className="flex items-start gap-3 flex-wrap">
            {/* xadrez atrás: mostra que o fundo ficou mesmo transparente */}
            <div className="rounded border border-gray-200 p-2 bg-white"
              style={{ backgroundImage: "linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%),linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,6px 6px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mostrar} alt="assinatura" className="h-16 object-contain" />
            </div>
            <div className="flex flex-col gap-1.5">
              {previa ? (
                <>
                  <p className="text-[11px] text-torg-gray max-w-xs">
                    Prévia tratada — fundo removido e recortada. Se estiver deitada, gire.
                    {novo && " Ela é salva junto com o usuário."}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={girar} disabled={processando}
                      className="text-[11px] font-semibold text-torg-dark border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1">
                      <RotateCw size={12} /> girar
                    </button>
                    {!novo && (
                      <button type="button" onClick={salvar} disabled={processando}
                        className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1">
                        {processando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} usar esta
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {salvo && <p className="text-[11px] text-emerald-700">Assinatura salva.</p>}
                  <button type="button" onClick={remover} disabled={processando}
                    className="text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1">
                    <Trash2 size={12} /> remover
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-torg-gray">
            Sem assinatura cadastrada — os documentos que esta pessoa assinar saem com nome e data, e a linha para assinar à mão.
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 cursor-pointer inline-flex items-center gap-1">
            <Upload size={12} /> {mostrar ? "trocar imagem" : "subir imagem"}
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={escolher} disabled={processando} />
          </label>
          {processando && <span className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> tratando…</span>}
          <span className="text-[10px] text-torg-gray">PNG ou JPG · foto da assinatura em papel serve (o fundo é removido aqui)</span>
        </div>

        <p className="text-[10px] text-torg-gray inline-flex items-start gap-1">
          <ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-600" />
          A assinatura é desta pessoa: só entra em documento que <b className="font-semibold">ela mesma</b> assinar pelo link dela, e a imagem só é acessível a ela e ao administrador.
        </p>

        {erro && <p className="text-[11px] text-red-600 inline-flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" /> {erro}</p>}
      </div>
    </div>
  );
}
