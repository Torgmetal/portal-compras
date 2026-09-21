"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Upload, Loader2, X, AlertTriangle } from "lucide-react";

// ─── ANEXAR O PROJETO À MÃO ───────────────────────────────────────────────────
// Vitor (22/08/2026), sobre a pré-montagem: "vamos ter que puxar alguns projetos
// diferentes, podendo ser conjuntos ou diagrama de montagem; nesse caso preciso de uma
// opção para anexar o projeto, para você me deixar tirar as informações sobressalentes
// igual fazemos no conjunto do relatório dimensional".
//
// O portal acha o desenho varrendo a pasta da OP pela MARCA da peça — funciona para
// conjunto e croqui, que têm marca. O diagrama de montagem não tem: é o desenho do
// arranjo, não de uma peça, e às vezes nem está na pasta de projetos. Sem esta porta o
// inspetor de pré-montagem fica sem desenho, e o relatório perde justamente as cotas.
//
// ⚠ SOBE DIRETO PARA O BLOB, com token. Desenho A1 passa de 4,5 MB com facilidade — o
// tamanho em que a rota serverless trava. Pela rota, o inspetor veria "não anexa" sem
// entender que o problema era o tamanho.
// ⚠⚠ O VÍNCULO É GRAVADO PELO PRÓPRIO NAVEGADOR (PUT), logo depois do upload. A versão anterior
// confiava só no webhook `onUploadCompleted` do Vercel Blob — que chega sem sessão e tomava 401 da
// rota — e por isso nenhum anexo chegou ao banco em um mês (OP-105, 21/09/2026: o PDF subiu duas
// vezes e o relatório continuou sem ele). O webhook segue como reserva; repetir não duplica.
//
// `marca` = qual anexo este botão remove (na pré-montagem há vários desenhos); `somaVarios` muda o
// rótulo: lá anexar acrescenta, nos outros tipos troca.
export default function AnexarProjeto({ relatorioId, anexado, marca, somaVarios = false, onMudou, travado }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const ref = useRef(null);

  async function enviar(e) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!/\.pdf$/i.test(arq.name)) { setErro("O projeto precisa ser um PDF."); return; }
    setEnviando(true); setErro("");
    try {
      const blob = await upload(arq.name, arq, {
        access: "public",
        handleUploadUrl: `/api/qualidade/inspecoes/${relatorioId}/desenho-anexo`,
        contentType: "application/pdf",
      });
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/desenho-anexo`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, nome: arq.name }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "O arquivo subiu, mas não consegui vinculá-lo ao relatório.");
      onMudou?.();
    } catch (e2) {
      setErro(e2.message || "Falha ao anexar o projeto.");
    } finally { setEnviando(false); }
  }

  async function remover() {
    if (!confirm(somaVarios ? "Remover este projeto anexado do relatório?" : "Remover o projeto anexado? O portal volta a procurar o desenho na pasta da OP.")) return;
    setEnviando(true); setErro("");
    try {
      const alvo = somaVarios && marca ? `?marca=${encodeURIComponent(marca)}` : "";
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/desenho-anexo${alvo}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao remover.");
      onMudou?.();
    } catch (e2) { setErro(e2.message); } finally { setEnviando(false); }
  }

  if (travado) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <input ref={ref} type="file" accept="application/pdf" className="hidden" onChange={enviar} />
      <button onClick={() => ref.current?.click()} disabled={enviando}
        title="Sobe um PDF de projeto (conjunto ou diagrama de montagem) para marcar as cotas em cima dele"
        className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2 py-0.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1">
        {enviando ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        {somaVarios ? "anexar projeto" : anexado ? "trocar projeto" : "anexar projeto"}
      </button>
      {anexado && !enviando && (
        <button onClick={remover} title={somaVarios ? "Remove este anexo do relatório" : "Volta a usar o desenho da pasta da OP"}
          className="text-torg-gray hover:text-red-600"><X size={12} /></button>
      )}
      {erro && (
        <span className="text-[10px] text-red-600 inline-flex items-center gap-1"><AlertTriangle size={10} /> {erro}</span>
      )}
    </span>
  );
}
