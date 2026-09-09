"use client";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";

// O SINO — no rodapé de toda sidebar, perto do nome. Matheus (09/09/2026): "vai receber as
// notificações de informações que forem importantes para ele do módulo dele ou forem
// destinadas a ele".
//
// ⚠⚠ ISTO JÁ EXISTIU E FOI TIRADO PORQUE NINGUÉM VIA. A tela ficava em /compras/notificacoes,
// um link que ninguém clicava — ver a nota em prisma/schema.prisma no model Notificacao. A
// aposta desta vez é a visibilidade: o sino mora em TODA sidebar, com contador, não atrás de
// um link. Quem decide o que cada pessoa vê é o servidor (lib/notificacoes.js) — aqui é só
// exibir e marcar como lido.
//
// ⚠ O PAINEL É `fixed`, MEDIDO PELO BOTÃO — não `absolute`. Mesmo motivo do FiltroColuna: a
// sidebar tem `overflow-y-auto` num pedaço dela, e um menu absoluto seria cortado na borda.
// Como o sino sempre vive no rodapé (perto do fim da tela), o painel abre para CIMA.

const MIN_INTERVALO_POLL = 45_000;

/** Onde o painel abre — sempre acima do botão, clampado às bordas da viewport. */
function usarPosicaoDoPainel(aberto, btnRef) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const medir = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const LARG = 360, MARGEM = 12;
      const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - LARG - MARGEM));
      setPos({ bottom: window.innerHeight - r.top + 8, left, largura: Math.min(LARG, window.innerWidth - MARGEM * 2) });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto, btnRef]);
  return pos;
}

/** Clique fora ou Esc fecha o painel. */
function usarFecharAoClicarFora(aberto, onFechar, refs) {
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (refs.some((ref) => ref.current?.contains(e.target))) return;
      onFechar();
    };
    const esc = (e) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto, onFechar, refs]);
}

/** Os dados do sino e as ações sobre eles — a UI só liga fios. */
function useNotificacoes() {
  const [itens, setItens] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setItens(j.itens || []);
      setNaoLidas(j.naoLidas || 0);
    } catch { /* poll silencioso — uma falha aqui não pode virar erro na tela */ }
  }, []);

  // Contador sempre atualizado, mesmo com o painel fechado — é o que faz o sino ter sentido
  // de "olhar de relance" em vez de precisar abrir para saber se tem algo novo.
  useEffect(() => {
    carregar();
    const id = setInterval(carregar, MIN_INTERVALO_POLL);
    return () => clearInterval(id);
  }, [carregar]);

  const abrir = useCallback(() => {
    setCarregando(true);
    carregar().finally(() => setCarregando(false));
  }, [carregar]);

  const marcarLida = useCallback(async (id) => {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, lida: true } : it)));
    setNaoLidas((n) => Math.max(0, n - 1));
    await fetch("/api/notificacoes", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
  }, []);

  const marcarTodas = useCallback(async () => {
    setMarcandoTodas(true);
    setItens((prev) => prev.map((it) => ({ ...it, lida: true })));
    setNaoLidas(0);
    await fetch("/api/notificacoes", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todas: true }),
    }).catch(() => {}).finally(() => setMarcandoTodas(false));
  }, []);

  return { itens, naoLidas, carregando, marcandoTodas, abrir, marcarLida, marcarTodas };
}

function tempoRelativo(iso) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function NotificationBell() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const btnRef = useRef(null);
  const painelRef = useRef(null);
  const n = useNotificacoes();

  const pos = usarPosicaoDoPainel(aberto, btnRef);
  const fechar = useCallback(() => setAberto(false), []);
  usarFecharAoClicarFora(aberto, fechar, [painelRef, btnRef]);

  const alternar = () => {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    n.abrir();
  };

  const clicarItem = (it) => {
    if (!it.lida) n.marcarLida(it.id);
    setAberto(false);
    if (it.link) router.push(it.link);
  };

  return (
    <div className="relative shrink-0">
      <button ref={btnRef} onClick={alternar}
        aria-label={n.naoLidas > 0 ? `Notificações — ${n.naoLidas} não lida(s)` : "Notificações"}
        className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
          aberto ? "bg-torg-blue-50 text-torg-blue" : "text-torg-gray hover:bg-gray-50 hover:text-torg-dark"}`}>
        <Bell size={16} />
        {n.naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-torg-orange text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {n.naoLidas > 9 ? "9+" : n.naoLidas}
          </span>
        )}
      </button>

      {aberto && pos && (
        <PainelNotificacoes ref={painelRef} pos={pos} n={n} onClicarItem={clicarItem} />
      )}
    </div>
  );
}

const PainelNotificacoes = forwardRef(function PainelNotificacoes({ pos, n, onClicarItem }, ref) {
  return (
    <div ref={ref}
      style={{ position: "fixed", bottom: pos.bottom, left: pos.left, width: pos.largura, maxHeight: 420 }}
      className="z-[100] bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100 shrink-0">
        <span className="text-[13px] font-bold text-torg-dark">Notificações</span>
        {n.naoLidas > 0 && (
          <button onClick={n.marcarTodas} disabled={n.marcandoTodas}
            className="text-[11px] font-semibold text-torg-blue hover:underline disabled:opacity-40 flex items-center gap-1">
            {n.marcandoTodas && <Loader2 size={11} className="animate-spin" />}
            marcar todas como lidas
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ListaNotificacoes n={n} onClicarItem={onClicarItem} />
      </div>
    </div>
  );
});

function ListaNotificacoes({ n, onClicarItem }) {
  if (n.carregando && !n.itens.length) {
    return (
      <div className="flex items-center justify-center py-8 text-torg-gray">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }
  if (!n.itens.length) {
    return (
      <p className="text-[12.5px] text-torg-gray text-center py-8 px-4">
        Nenhuma notificação por aqui ainda.
      </p>
    );
  }
  return n.itens.map((it) => (
    <button key={it.id} onClick={() => onClicarItem(it)}
      className={`w-full text-left px-3.5 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
        it.lida ? "" : "bg-torg-blue-50/40"}`}>
      <div className="flex items-start gap-2">
        {!it.lida && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-torg-blue shrink-0" />}
        <div className={`min-w-0 flex-1 ${it.lida ? "pl-3.5" : ""}`}>
          <div className={`text-[12.5px] leading-snug ${it.lida ? "text-torg-gray font-medium" : "text-torg-dark font-bold"}`}>
            {it.titulo}
          </div>
          <div className="text-[12px] text-torg-gray leading-snug mt-0.5 line-clamp-2">
            {it.mensagem}
          </div>
          <div className="text-[10.5px] text-torg-gray-light mt-1">{tempoRelativo(it.criadoEm)}</div>
        </div>
        {it.lida && <Check size={13} className="text-emerald-500 shrink-0 mt-1" />}
      </div>
    </button>
  ));
}
