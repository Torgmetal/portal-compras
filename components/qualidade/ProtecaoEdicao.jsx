"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/components/admin/ConfirmModal";

/** Só avisa quando o conteúdo diverge do último carregamento/salvamento confirmado. */
export default function ProtecaoEdicao({ conteudo, versaoSalva, salvar, salvando, pendencias = [] }) {
  const router = useRouter();
  const serial = JSON.stringify(conteudo);
  const [base, setBase] = useState(serial);
  const [destino, setDestino] = useState(null);
  const [salvoEm, setSalvoEm] = useState(null);
  const versao = useRef(versaoSalva);
  const liberar = useRef(false);
  // ⚠ o `salvar` MAIS RECENTE: o ouvinte de clique é registrado quando a tela fica alterada e não é
  // refeito a cada tecla — chamando o `salvar` daquele momento, gravaria o formulário de três teclas atrás.
  const salvarAtual = useRef(salvar);
  salvarAtual.current = salvar;
  useEffect(() => {
    if (versao.current !== versaoSalva) {
      versao.current = versaoSalva;
      setBase(serial);
      setSalvoEm(new Date());
    }
  }, [versaoSalva, serial]);
  const alterado = base !== serial;
  useEffect(() => {
    if (!alterado) return;
    const fechar = e => { if (!liberar.current) { e.preventDefault(); e.returnValue = ""; } };
    const clicar = e => {
      if (liberar.current || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      // ⚠⚠ O PDF ABRE EM OUTRA ABA E MOSTRA O QUE ESTÁ GRAVADO. Vitor (23/09/2026): "as informações
      // adicionadas não estão indo para o pdf" — preenchia a junta soldada, clicava em "Abrir PDF" e o
      // documento vinha sem ela, porque nada tinha sido salvo. Link marcado com `data-salvar-antes`
      // grava primeiro. A aba abre JÁ, dentro do clique: aberta depois do `await`, o navegador a
      // trataria como pop-up e bloquearia. Se a gravação falha, ela fecha — o PDF velho não aparece
      // fingindo ser o novo.
      if (a && a.target === "_blank" && a.hasAttribute("data-salvar-antes")) {
        e.preventDefault(); e.stopPropagation();
        const aba = window.open("", "_blank");
        Promise.resolve(salvarAtual.current()).then((ok) => {
          if (ok !== true) { aba?.close(); return; }
          if (aba) { aba.opener = null; aba.location.href = a.href; } else window.open(a.href, "_blank", "noopener");
        });
        return;
      }
      if (!a || a.download || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (!/^https?:$/.test(url.protocol) || (url.pathname === location.pathname && url.search === location.search && url.origin === location.origin)) return;
      e.preventDefault(); e.stopPropagation(); setDestino(url.href);
    };
    window.addEventListener("beforeunload", fechar);
    document.addEventListener("click", clicar, true);
    return () => { window.removeEventListener("beforeunload", fechar); document.removeEventListener("click", clicar, true); };
  }, [alterado]);
  function sair() {
    liberar.current = true;
    const url = new URL(destino);
    setDestino(null);
    if (url.origin === location.origin) router.push(url.pathname + url.search + url.hash);
    else location.assign(url.href);
  }
  return <>
    <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-torg-gray" role="status">
      {salvando ? "Salvando…" : alterado ? "Você tem alterações não salvas." : salvoEm ? `Salvo às ${salvoEm.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}.` : "Dados carregados. Nenhuma alteração pendente."}
      {alterado && !salvando && <button type="button" onClick={()=>salvar()} className="ml-3 py-1 font-semibold text-torg-blue">Salvar agora</button>}
    </div>
    {pendencias.length > 0 && <details className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><summary className="cursor-pointer">{pendencias.length} ponto(s) para conferir antes de finalizar</summary><ul className="mt-2 list-disc pl-5 space-y-1">{pendencias.map((p,i)=><li key={i}>{p}</li>)}</ul><p className="mt-2 text-xs">Você pode continuar preenchendo e salvar sem completar estes itens agora.</p></details>}
    <ConfirmModal open={!!destino} onClose={()=>setDestino(null)} titulo="Salvar antes de sair?" mensagem="Há alterações que ainda não foram salvas." labelCancelar="Continuar editando" labelConfirmar="Salvar e sair" acaoSecundaria={{label:"Sair sem salvar",onClick:sair}} loading={salvando} onConfirm={async()=>{if(await salvar()===true)sair();}}/>
  </>;
}
