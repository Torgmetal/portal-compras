"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import {
  Loader2, Camera, QrCode, Search, X, Check, ChevronLeft, HardHat,
  LogOut, Trash2, AlertCircle, Tag, Upload, Ruler,
} from "lucide-react";
import { TIPOS_RELATORIO, TIPO_LABEL, marcaDoQR, marcaCasaOP } from "@/lib/qualidade-campo";
import LeitorQR from "./LeitorQR";

/**
 * PORTAL QUALIDADE FÁBRICA — a tela do celular.
 *
 * Vitor (21/08/2026): "seleciona a OP, tipo de relatório, tira a foto e informa qual peça; isso
 * sobe para o portal, e depois por computador começa o fluxo das assinaturas".
 *
 * AS DUAS ORDENS FUNCIONAM. A peça fica FIXA no topo e as fotos se acumulam numa fila até tocarem
 * em enviar — então dá pra apontar no QR e depois fotografar, ou fotografar e depois dizer a peça.
 * A peça fixa existe porque quem inspeciona fotografa a mesma peça três, quatro vezes seguidas
 * (vista geral, solda, detalhe), e perguntar a cada foto seria o triplo de toques.
 *
 * A primeira versão subia a foto no ato, o que na prática obrigava a escolher a peça antes. Vitor,
 * testando: "tirei a foto, escolhi a peça, mas não tem um botão de enviar" — e ele tinha feito
 * exatamente na ordem que descreveu no começo. Daí a fila.
 *
 * 🚫 Nenhum nome de cliente nesta tela. Vitor: "pode deixar aberto, só não deixa o nome do cliente;
 * para esse acesso deixar apenas o número da OP" — dois dos cinco usuários são inspetores externos.
 */

// Reduz no aparelho antes de subir. Resolve dois problemas de uma vez: o iPhone fotografa em HEIC
// (que o PDF do data book não lê) e a foto crua passa de 4 MB, tamanho em que a rota trava.
async function reduzImagem(file, maxDim = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("Não consegui ler essa imagem."));
      img.src = url;
    });
    let { width, height } = img;
    const escala = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * escala); height = Math.round(height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Falha ao processar a foto.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

const hora = (d) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function CampoClient({ nome }) {
  const [op, setOp] = useState(null);          // { id, numero }
  const [tipo, setTipo] = useState(null);      // id do tipo
  const [peca, setPeca] = useState(null);      // { marca, origem }
  // Vitor (21/08/2026): "além de informar a peça e a OP, ele seleciona os equipamentos que está
  // usando para compor no relatório". Fica fixo como a peça — o inspetor mede a manhã inteira com
  // a mesma trena, e remarcar a cada foto seria trabalho à toa.
  const [equipamentos, setEquipamentos] = useState([]);
  const [fotos, setFotos] = useState([]);
  // ── FILA: a foto ESPERA o envio ────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026), testando: "tirei a foto, escolhi a peça, mas não tem um botão de enviar".
  // Estava subindo na hora, o que obrigava a escolher a peça ANTES — e a ordem que ele descreveu
  // desde o começo foi a outra: "tira a foto e informa qual peça".
  //
  // Com a fila as duas ordens funcionam, dá pra conferir a foto antes de mandar, e dá pra descartar
  // a que saiu tremida sem precisar apagar depois do envio.
  const [fila, setFila] = useState([]); // { id, blob, preview }
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const fileRef = useRef(null);

  // ── retoma onde parou ──────────────────────────────────────────────────────────────────────
  // O navegador do celular descarta a aba quando o aparelho fica no bolso ou abre a câmera. Sem
  // isso, o inspetor volta pra tela inicial e refaz OP e tipo a cada foto.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("campo:sessao") || "null");
      if (s?.op?.numero) {
        setOp(s.op); setTipo(s.tipo || null); setPeca(s.peca || null);
        setEquipamentos(Array.isArray(s.equipamentos) ? s.equipamentos : []);
      }
    } catch { /* storage indisponível: segue sem retomar */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("campo:sessao", JSON.stringify({ op, tipo, peca, equipamentos })); } catch { /* ignora */ }
  }, [op, tipo, peca, equipamentos]);

  const carregarFotos = useCallback(async () => {
    if (!op?.numero || !tipo) { setFotos([]); return; }
    try {
      const r = await fetch(`/api/campo/foto?opNumero=${encodeURIComponent(op.numero)}&tipo=${tipo}`);
      const j = await r.json();
      setFotos(j.fotos || []);
    } catch { /* lista é conferência, não bloqueia fotografar */ }
  }, [op?.numero, tipo]);
  useEffect(() => { carregarFotos(); }, [carregarFotos]);

  /** A foto entra na fila (já reduzida). Nada sobe ainda. */
  async function receberFotos(e) {
    const arquivos = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = "";
    if (!arquivos.length) return;
    setErro("");
    try {
      const novas = [];
      for (const arq of arquivos) {
        const blob = await reduzImagem(arq);
        novas.push({ id: `${Date.now()}-${novas.length}`, blob, preview: URL.createObjectURL(blob) });
      }
      setFila((p) => [...p, ...novas]);
    } catch (err) { setErro(err.message); }
  }

  function descartar(id) {
    setFila((p) => {
      const alvo = p.find((f) => f.id === id);
      if (alvo) URL.revokeObjectURL(alvo.preview);
      return p.filter((f) => f.id !== id);
    });
  }

  /** Sobe a fila inteira com a peça que está selecionada agora. */
  async function enviar() {
    if (!fila.length || enviando) return;
    setErro(""); setEnviando(true);
    const restantes = [...fila];
    try {
      for (let i = 0; i < restantes.length; i++) {
        setProgresso(`${i + 1}/${restantes.length}`);
        const item = restantes[i];
        const fd = new FormData();
        fd.append("file", item.blob, "foto.jpg");
        fd.append("opId", op.id || "");
        fd.append("opNumero", op.numero);
        fd.append("tipo", tipo);
        if (peca?.marca) { fd.append("marca", peca.marca); fd.append("origemMarca", peca.origem); }
        if (equipamentos.length) fd.append("equipamentos", JSON.stringify(equipamentos));
        const r = await fetch("/api/campo/foto", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao enviar");
        setFotos((p) => [{ ...j.foto, tipo }, ...p]);
        // ⚠ tira da fila UMA A UMA. Se a conexão cair no meio (e no galpão cai), o que já subiu não
        // volta pra fila e não sobe duas vezes — o inspetor toca em enviar de novo e segue do ponto.
        URL.revokeObjectURL(item.preview);
        setFila((p) => p.filter((f) => f.id !== item.id));
      }
    } catch (err) {
      setErro(`${err.message} — toque em enviar de novo para continuar de onde parou.`);
    } finally { setEnviando(false); setProgresso(""); }
  }

  async function apagar(id) {
    if (!confirm("Apagar esta foto?")) return;
    try {
      const r = await fetch(`/api/campo/foto?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setFotos((p) => p.filter((f) => f.id !== id));
    } catch (e) { alert(e.message); }
  }

  // ── passo 1: a OP ──────────────────────────────────────────────────────────────────────────
  if (!op) return <EscolherOP onEscolher={setOp} nome={nome} />;

  // ── passo 2: o tipo ────────────────────────────────────────────────────────────────────────
  if (!tipo) {
    return (
      <Tela titulo={`OP-${op.numero}`} voltar={() => setOp(null)}>
        <p className="text-sm text-torg-gray mb-3">Que inspeção você está registrando?</p>
        <div className="space-y-2">
          {TIPOS_RELATORIO.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 text-base font-medium text-torg-dark active:bg-gray-50">
              {t.label}
            </button>
          ))}
        </div>
      </Tela>
    );
  }

  // ── passo 3: fotografar ────────────────────────────────────────────────────────────────────
  return (
    <Tela titulo={`OP-${op.numero}`} sub={TIPO_LABEL[tipo]} voltar={() => setTipo(null)}>
      <PecaAtual
        peca={peca} opNumero={op.numero} opId={op.id}
        onDefinir={(p, av) => { setPeca(p); setAviso(av || ""); }}
      />

      <Equipamentos escolhidos={equipamentos} onMudar={setEquipamentos} />

      {aviso && (
        <p className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {aviso}
        </p>
      )}
      {erro && (
        <p className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
      )}

      {/* `capture` abre a câmera direto; `multiple` deixa mandar da galeria o que já foi tirado */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={receberFotos} />
      <button onClick={() => fileRef.current?.click()} disabled={enviando}
        className="mt-4 w-full bg-white border-2 border-torg-blue text-torg-blue active:bg-torg-blue/5 rounded-2xl py-5 text-lg font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60">
        <Camera size={24} /> Tirar foto
      </button>

      {/* ── A FILA ────────────────────────────────────────────────────────────────────────────
          As fotas ficam aqui até tocarem em enviar. É o que permite fotografar primeiro e dizer a
          peça depois — a ordem que o Vitor descreveu — e conferir antes de mandar. */}
      {fila.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-3">
          <p className="text-xs font-semibold text-torg-gray mb-2">
            {fila.length} foto(s) para enviar {peca ? `em ${peca.marca}` : "sem peça (registro geral)"}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {fila.map((f) => (
              <div key={f.id} className="relative rounded-lg overflow-hidden bg-gray-100 aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="a enviar" className="w-full h-full object-cover" />
                <button onClick={() => descartar(f.id)} disabled={enviando}
                  className="absolute top-1 right-1 bg-black/55 text-white rounded-full p-1 active:bg-black/75 disabled:opacity-40">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={enviar} disabled={enviando}
            className="mt-3 w-full bg-torg-blue active:bg-torg-dark text-white rounded-2xl py-4 text-lg font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60">
            {enviando ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
            {enviando ? `enviando ${progresso}…` : `Enviar ${fila.length} foto(s)`}
          </button>
          {!peca && (
            <p className="mt-2 text-[11px] text-torg-gray text-center">
              Sem peça selecionada, elas entram como registro geral da inspeção.
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        <p className="text-xs font-semibold text-torg-gray mb-2">
          {fotos.length ? `${fotos.length} foto(s) já enviada(s)` : "Nenhuma foto enviada ainda."}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            <div key={f.id} className="relative rounded-lg overflow-hidden bg-gray-100 aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.marca || "foto"} className="w-full h-full object-cover" />
              <button onClick={() => apagar(f.id)}
                className="absolute top-1 right-1 bg-black/55 text-white rounded-full p-1 active:bg-black/75">
                <Trash2 size={12} />
              </button>
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] px-1 py-0.5 truncate">
                {f.marca || "sem peça"} · {hora(f.capturadaEm)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Tela>
  );
}

/** Moldura comum: cabeçalho fixo, conteúdo rolando. Sem menu — a tela é de uma coisa só. */
function Tela({ titulo, sub, voltar, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        {voltar ? (
          <button onClick={voltar} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
        ) : (
          <HardHat size={20} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate">{titulo}</p>
          {sub && <p className="text-[11px] text-white/70 leading-tight truncate">{sub}</p>}
        </div>
        <button onClick={() => signOut({ callbackUrl: "/campo/entrar" })} className="p-1 text-white/70"><LogOut size={18} /></button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

function EscolherOP({ onEscolher, nome }) {
  const [ops, setOps] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/campo/ops").then((r) => r.json()).then((j) => setOps(j.ops || [])).catch(() => setOps([]));
  }, []);

  const lista = (ops || []).filter((o) => !q || o.numero.toLowerCase().includes(q.toLowerCase()));

  return (
    <Tela titulo="Qualidade Fábrica" sub={nome}>
      <p className="text-sm text-torg-gray mb-3">Em qual OP você está?</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" placeholder="buscar OP…"
        className="w-full text-base border border-gray-200 rounded-xl px-3 py-3 mb-3 focus:border-torg-blue outline-none" />
      {ops === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
      <div className="grid grid-cols-3 gap-2">
        {lista.map((o) => (
          <button key={o.id} onClick={() => onEscolher(o)}
            className="bg-white border border-gray-200 rounded-xl py-4 text-base font-bold text-torg-dark active:bg-gray-50">
            {o.numero}
          </button>
        ))}
      </div>
      {ops !== null && !lista.length && <p className="text-sm text-torg-gray">Nenhuma OP encontrada.</p>}
    </Tela>
  );
}

/**
 * A peça da vez. Fica fixa no topo até trocarem — é ela que as próximas fotos recebem.
 */
function PecaAtual({ peca, opNumero, opId, onDefinir }) {
  const [lendo, setLendo] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const aoLerQR = useCallback((texto) => {
    setLendo(false);
    const marca = marcaDoQR(texto);
    if (!marca) { onDefinir(peca, "Não entendi esse código. Tente de novo ou busque a marca."); return; }
    // ⚠ AVISA, não bloqueia: sub-obra usa prefixo próprio (T67B, T67CT) e obra antiga foge do
    // padrão. Travar aqui faria o inspetor não registrar uma foto legítima no meio do galpão.
    const av = marcaCasaOP(marca, opNumero) ? "" : `A peça ${marca} parece ser de outra OP. Confira antes de fotografar.`;
    onDefinir({ marca, origem: "QR" }, av);
  }, [onDefinir, peca, opNumero]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3">
      <div className="flex items-center gap-2 min-w-0">
        <Tag size={16} className="text-torg-blue shrink-0" />
        {peca ? (
          <div className="min-w-0 flex-1">
            <p className="font-bold text-torg-dark text-base leading-tight truncate">{peca.marca}</p>
            <p className="text-[11px] text-torg-gray leading-tight">
              {peca.origem === "QR" ? "lida no QR do desenho" : peca.origem === "BUSCA" ? "escolhida na lista" : "digitada"}
            </p>
          </div>
        ) : (
          <p className="flex-1 text-sm text-torg-gray">Nenhuma peça selecionada — a foto entra como registro geral.</p>
        )}
        {peca && <button onClick={() => onDefinir(null, "")} className="text-torg-gray p-1"><X size={16} /></button>}
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setLendo(true)}
          className="flex-1 bg-torg-blue/10 text-torg-blue rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <QrCode size={16} /> Ler QR
        </button>
        <button onClick={() => setBuscando(true)}
          className="flex-1 border border-gray-200 text-torg-dark rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <Search size={16} /> Buscar
        </button>
      </div>

      {lendo && <LeitorQR onLer={aoLerQR} onFechar={() => setLendo(false)} />}
      {buscando && (
        <BuscarPeca
          opId={opId}
          onFechar={() => setBuscando(false)}
          onEscolher={(marca, origem) => { setBuscando(false); onDefinir({ marca, origem }, ""); }}
        />
      )}
    </div>
  );
}

/**
 * OS INSTRUMENTOS DA VEZ.
 *
 * Vitor (21/08/2026): "para os relatórios temos equipamentos calibrados... ele seleciona os
 * equipamentos que está usando para compor no relatório".
 *
 * A lista vem do módulo de Calibração — os mesmos certificados, com validade. Ficam gravados na
 * foto em SNAPSHOT: quando o certificado for renovado, o relatório antigo continua mostrando o que
 * estava valendo no dia da inspeção.
 *
 * ⚠ Instrumento VENCIDO aparece na lista, marcado em vermelho. Sumir com ele faria o inspetor
 * medir com o mesmo instrumento e não registrar nada — o relatório sairia sem dizer com o que foi
 * medido, que é pior. Aparece, avisa, e quem decide é quem está lá.
 */
function Equipamentos({ escolhidos, onMudar }) {
  const [abrir, setAbrir] = useState(false);
  const [lista, setLista] = useState(null);

  useEffect(() => {
    if (!abrir || lista) return;
    fetch("/api/campo/equipamentos").then((r) => r.json())
      .then((j) => setLista(j.equipamentos || []))
      .catch(() => setLista([]));
  }, [abrir, lista]);

  const marcados = new Set(escolhidos.map((e) => e.id));
  const temVencido = escolhidos.some((e) => e.vencido);

  const alternar = (eq) => {
    onMudar(marcados.has(eq.id) ? escolhidos.filter((x) => x.id !== eq.id) : [...escolhidos, eq]);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 mt-3">
      <div className="flex items-center gap-2 min-w-0">
        <Ruler size={16} className="text-torg-blue shrink-0" />
        <div className="min-w-0 flex-1">
          {escolhidos.length ? (
            <>
              <p className="text-[13px] font-semibold text-torg-dark leading-tight truncate">
                {escolhidos.map((e) => e.nome).join(" · ")}
              </p>
              <p className="text-[11px] text-torg-gray leading-tight">
                {escolhidos.length} instrumento(s) neste registro
              </p>
            </>
          ) : (
            <p className="text-sm text-torg-gray">Nenhum instrumento selecionado.</p>
          )}
        </div>
        <button onClick={() => setAbrir(true)} className="text-[12px] font-semibold text-torg-blue shrink-0 px-2 py-1">
          {escolhidos.length ? "trocar" : "escolher"}
        </button>
      </div>

      {temVencido && (
        <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Instrumento com calibração VENCIDA selecionado — o relatório vai registrar isso.
        </p>
      )}

      {abrir && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3">
            <button onClick={() => setAbrir(false)} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
            <p className="font-semibold flex-1">Instrumentos utilizados</p>
            <button onClick={() => setAbrir(false)} className="text-[13px] font-semibold px-2">pronto</button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {lista === null && <p className="p-4 text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
            {lista?.map((eq) => {
              const on = marcados.has(eq.id);
              return (
                <button key={eq.id} onClick={() => alternar(eq)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 flex items-center gap-3 ${on ? "bg-torg-blue/5" : ""}`}>
                  <span className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                    {on && <Check size={13} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-torg-dark text-[13px] truncate">{eq.nome}</span>
                    <span className={`block text-[11px] ${eq.vencido ? "text-red-600 font-semibold" : "text-torg-gray"}`}>
                      {eq.certificado ? `cert ${eq.certificado}` : "sem certificado"}
                      {eq.validade ? ` · ${eq.vencido ? "VENCIDO em" : "válido até"} ${eq.validade.split("-").reverse().join("/")}` : " · sem validade"}
                    </span>
                  </span>
                </button>
              );
            })}
            {lista && !lista.length && <p className="p-4 text-sm text-torg-gray">Nenhum instrumento com certificado cadastrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function BuscarPeca({ opId, onEscolher, onFechar }) {
  const [q, setQ] = useState("");
  const [todas, setTodas] = useState(false);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    // espera o dedo parar antes de consultar — sem isso é uma consulta por letra digitada
    const t = setTimeout(() => {
      fetch(`/api/campo/pecas?opId=${opId}&q=${encodeURIComponent(q)}${todas ? "&todas=1" : ""}`)
        .then((r) => r.json())
        .then((j) => { if (vivo) setLista(j.pecas || []); })
        .catch(() => {})
        .finally(() => vivo && setCarregando(false));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [opId, q, todas]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onFechar} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
        <p className="font-semibold flex-1">Buscar peça</p>
      </header>
      <div className="p-4 border-b border-gray-100">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="marca da peça…"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          className="w-full text-base border border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
        <label className="flex items-center gap-2 mt-2 text-[12px] text-torg-gray">
          {/* conjunto é o padrão: foto de inspeção quase sempre é do conjunto montado, e a OP tem
              três vezes mais croqui que conjunto — misturar faz rolar lista atrás do que se quer */}
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          incluir croquis e peças avulsas
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {carregando && <p className="p-4 text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> buscando…</p>}
        {!carregando && lista.map((p) => (
          <button key={p.marca} onClick={() => onEscolher(p.marca, "BUSCA")}
            className="w-full text-left px-4 py-3 border-b border-gray-50 active:bg-gray-50">
            <p className="font-semibold text-torg-dark">{p.marca}</p>
            <p className="text-[12px] text-torg-gray truncate">{[p.descricao, p.perfil].filter(Boolean).join(" · ") || "—"}</p>
          </button>
        ))}
        {!carregando && !lista.length && (
          <div className="p-4">
            <p className="text-sm text-torg-gray mb-3">Nada encontrado com esse nome.</p>
            {q.trim().length >= 2 && (
              // saída pra registro que não é peça da lista: região, eixo, vista geral
              <button onClick={() => onEscolher(q.trim().toUpperCase(), "LIVRE")}
                className="w-full border border-torg-blue text-torg-blue rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <Check size={15} /> Usar &quot;{q.trim().toUpperCase()}&quot; assim mesmo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
