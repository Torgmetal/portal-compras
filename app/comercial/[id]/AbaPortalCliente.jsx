"use client";
import { useEffect, useState } from "react";
import { Loader2, Globe, Send, Save, ExternalLink, Copy, Check, Eye, Upload, X, ImagePlus } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { SECOES, CAPAS, situacao } from "@/lib/portal-cliente";

// ─── CONFIGURAR O PORTAL DO CLIENTE ───────────────────────────────────────────
// Vitor (22/08/2026): "tudo que for de interesse nosso em mostrar e que seja interesse
// dele receber".
//
// As duas metades dessa frase viram esta tela: a mensagem (o que queremos dizer) e as
// seções (o que ele vai ver). Nada além disso — os DADOS não se configuram aqui, porque
// eles já vivem nos módulos e o portal os lê vivos.
export default function AbaPortalCliente({ opId }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/portal`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setErro(j.error);
        setD(j);
        setF({
          contato: j.portal.contato || "", empresa: j.portal.empresa || j.op.cliente || "",
          clienteEmail: j.portal.clienteEmail || "", mensagem: j.portal.mensagem || "",
          capaUrl: j.portal.capaUrl || "", logoClienteUrl: j.portal.logoClienteUrl || "",
          fotos: Array.isArray(j.portal.fotos) ? j.portal.fotos : [],
          secoes: j.portal.secoesAtivas || [],
        });
      })
      .catch(() => setErro("Não consegui carregar o portal."));
  }, [opId]);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!d || !f) return <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const st = situacao(d.portal);
  const link = d.portal.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${d.portal.token}` : null;

  // ⚠ SOBE DIRETO PARA O BLOB, com token. Foto de obra sai do celular com 8 a 12 MB — o dobro do
  // teto em que a rota serverless trava, e ali o erro apareceria como "não anexa" sem dizer o
  // motivo.
  async function subir(arq) {
    const b2 = await upload(arq.name, arq, {
      access: "public",
      handleUploadUrl: `/api/comercial/op/${opId}/portal/upload`,
      contentType: arq.type,
    });
    return b2.url;
  }

  async function escolherArquivo(alvo) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.multiple = alvo === "fotos";
    inp.onchange = async () => {
      const arqs = [...(inp.files || [])];
      if (!arqs.length) return;
      setSalvando(true); setErro(""); setAviso("");
      try {
        if (alvo === "fotos") {
          const novas = [];
          for (const a2 of arqs) novas.push({ url: await subir(a2), legenda: "" });
          setF((p) => ({ ...p, fotos: [...(p.fotos || []), ...novas].slice(0, 24) }));
        } else {
          set(alvo, await subir(arqs[0]));
        }
        setAviso("Imagem carregada — salve para gravar.");
      } catch (e) { setErro(e.message || "Falha ao subir a imagem."); }
      finally { setSalvando(false); }
    };
    inp.click();
  }

  async function salvar() {
    setSalvando(true); setErro(""); setAviso("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/portal`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setD((p) => ({ ...p, portal: j.portal }));
      setAviso("Configuração salva.");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function publicar(enviar) {
    setSalvando(true); setErro(""); setAviso("");
    try {
      await fetch(`/api/comercial/op/${opId}/portal`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const r = await fetch(`/api/comercial/op/${opId}/portal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enviar, clienteEmail: f.clienteEmail }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao publicar");
      setD((p) => ({ ...p, portal: { ...p.portal, token: j.link.split("/").pop(), status: "PUBLICADO" } }));
      setAviso(enviar ? (j.enviado ? "Publicado e enviado ao cliente." : "Publicado — mas o e-mail falhou; o link já vale.") : "Publicado.");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
              <Globe size={15} className="text-torg-blue" /> Portal do cliente
            </h4>
            <p className={`text-[12px] mt-0.5 ${st.cor}`}>{st.rotulo}</p>
          </div>
          {link && (
            <div className="flex items-center gap-2">
              <a href={link} target="_blank" rel="noreferrer"
                className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
                <Eye size={13} /> Ver como o cliente
              </a>
              <button onClick={() => { navigator.clipboard?.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }}
                className="text-[12px] text-torg-gray border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 inline-flex items-center gap-1.5">
                {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} {copiado ? "copiado" : "copiar link"}
              </button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Campo rot="Contato no cliente" v={f.contato} on={(v) => set("contato", v)} ph="nome de quem recebe" />
          <Campo rot="Empresa" v={f.empresa} on={(v) => set("empresa", v)} />
          <Campo rot="E-mail" v={f.clienteEmail} on={(v) => set("clienteEmail", v)} tipo="email" />

        </div>
      </div>

      {/* ── AS ARTES ─────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-torg-dark mb-1">Identidade do portal</h4>
        <p className="text-[11px] text-torg-gray mb-3">
          A capa e as duas marcas. Sem capa escolhida, o portal usa uma das nossas — ele nunca abre
          em branco.
        </p>

        <p className="text-[11px] font-semibold text-torg-gray mb-1.5">Capa</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {CAPAS.map((c) => {
            const on = (f.capaUrl || CAPAS[0].url) === c.url;
            return (
              <button key={c.url} onClick={() => set("capaUrl", c.url)}
                className={`relative rounded-lg overflow-hidden border-2 ${on ? "border-torg-blue" : "border-transparent hover:border-gray-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.nome} className="w-full h-20 object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-1 text-left truncate">{c.nome}</span>
                {on && <span className="absolute top-1 right-1 bg-torg-blue text-white rounded-full p-0.5"><Check size={11} /></span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button onClick={() => escolherArquivo("capaUrl")} disabled={salvando}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Upload size={12} /> subir outra capa
          </button>
          {f.capaUrl && !CAPAS.some((c) => c.url === f.capaUrl) && (
            <span className="text-[11px] text-torg-gray inline-flex items-center gap-1.5">
              capa própria
              <button onClick={() => set("capaUrl", "")} className="text-torg-gray hover:text-red-600"><X size={11} /></button>
            </span>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-torg-gray mb-1.5">Marca da Torg</p>
            <div className="bg-[#0D1F3C] rounded-lg px-3 py-3 inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/torg-logo-white.png" alt="Torg Metal" className="h-7" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-torg-gray mb-1.5">Marca do cliente</p>
            {f.logoClienteUrl ? (
              <div className="flex items-center gap-2">
                <span className="bg-white border border-gray-200 rounded-lg px-3 py-3 inline-flex">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.logoClienteUrl} alt="" className="h-7 object-contain" />
                </span>
                <button onClick={() => set("logoClienteUrl", "")} className="text-torg-gray hover:text-red-600"><X size={13} /></button>
              </div>
            ) : (
              <button onClick={() => escolherArquivo("logoClienteUrl")} disabled={salvando}
                className="text-[11px] font-semibold text-torg-blue border border-dashed border-torg-blue-300 rounded-lg px-3 py-3 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
                <ImagePlus size={13} /> subir o logo do cliente
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── FOTOS DA OBRA ────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h4 className="text-sm font-semibold text-torg-dark">Registro fotográfico</h4>
          <button onClick={() => escolherArquivo("fotos")} disabled={salvando}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Upload size={12} /> subir fotos
          </button>
        </div>
        <p className="text-[11px] text-torg-gray mb-3">
          A obra em imagens — fabricação, pintura, expedição. A legenda é o que dá sentido à foto.
        </p>
        {!(f.fotos || []).length ? (
          <p className="text-[12px] text-torg-gray">Nenhuma foto ainda.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {f.fotos.map((foto, i) => (
              <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url} alt="" className="w-full h-24 object-cover" />
                <div className="p-1.5 flex items-center gap-1">
                  <input value={foto.legenda || ""} placeholder="legenda"
                    onChange={(e) => set("fotos", f.fotos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))}
                    className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-torg-blue" />
                  <button onClick={() => set("fotos", f.fotos.filter((_, j) => j !== i))}
                    className="text-torg-gray hover:text-red-600 shrink-0"><X size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⚠ A MENSAGEM É O CORAÇÃO. Vitor pediu "uma mensagem forte de agradecimento e parceria" —
          e mensagem forte é a que fala DAQUELA obra. O texto que vem é um ponto de partida. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-torg-dark mb-1">Mensagem de abertura</h4>
        <p className="text-[11px] text-torg-gray mb-2">
          É a primeira coisa que o cliente lê. O texto abaixo é um ponto de partida — vale reescrever
          falando desta obra.
        </p>
        <textarea value={f.mensagem} onChange={(e) => set("mensagem", e.target.value)} rows={10}
          className="w-full text-[13px] leading-relaxed border border-gray-200 rounded-lg px-3 py-2 focus:border-torg-blue outline-none" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-torg-dark mb-1">O que o cliente vê</h4>
        <p className="text-[11px] text-torg-gray mb-3">
          Cada seção lê os dados vivos do portal — cronograma do Planejamento, certificados do
          Controle de Documentos, relatórios aprovados da Qualidade. Nada é publicado duas vezes.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SECOES.map((s) => {
            const on = f.secoes.includes(s.id);
            return (
              <label key={s.id} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer ${on ? "border-torg-blue bg-torg-blue/5" : "border-gray-200"}`}>
                <input type="checkbox" checked={on} className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  onChange={() => set("secoes", on ? f.secoes.filter((x) => x !== s.id) : [...f.secoes, s.id])} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-torg-dark">{s.nome}</span>
                  <span className="block text-[11px] text-torg-gray">{s.resumo}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {erro && <p className="text-[12px] text-red-600">{erro}</p>}
      {aviso && <p className="text-[12px] text-emerald-700">{aviso}</p>}

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button onClick={salvar} disabled={salvando}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
        </button>
        <button onClick={() => publicar(false)} disabled={salvando}
          className="text-[12px] font-semibold text-torg-dark border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5">
          <ExternalLink size={13} /> {d.portal.status === "PUBLICADO" ? "Republicar" : "Publicar"}
        </button>
        <button onClick={() => publicar(true)} disabled={salvando || !f.clienteEmail}
          title={!f.clienteEmail ? "Informe o e-mail do cliente" : "Publica e envia o link"}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Send size={13} /> Publicar e enviar
        </button>
      </div>
    </div>
  );
}

function Campo({ rot, v, on, ph = "", tipo = "text" }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rot}</span>
      <input type={tipo} value={v ?? ""} placeholder={ph} onChange={(e) => on(e.target.value)}
        className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
    </label>
  );
}
