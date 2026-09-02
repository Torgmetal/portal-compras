"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Globe, Send, Save, ExternalLink, Copy, Check, Eye, Upload, X, ImagePlus, FolderOpen, Plus, Trash2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { SECOES, CAPAS, AREAS, AREAS_COM_SELETOR, TIPOS_ENGENHARIA, situacao } from "@/lib/portal-cliente";
import SeletorDocsArea from "./SeletorDocsArea";
import HistoricoPortal from "./HistoricoPortal";

// ─── CONFIGURAR O PORTAL DO CLIENTE ───────────────────────────────────────────
// Vitor (22/08/2026): "tudo que for de interesse nosso em mostrar e que seja interesse
// dele receber".
//
// As duas metades dessa frase viram esta tela: a mensagem (o que queremos dizer) e as
// seções (o que ele vai ver). Nada além disso — os DADOS não se configuram aqui, porque
// eles já vivem nos módulos e o portal os lê vivos.
function AvisoListas({ opNumero, secoes }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`/api/comercial/op/${encodeURIComponent(opNumero)}/listas-status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, [opNumero]);
  if (!d) return null;
  const faltando = [
    secoes.includes("LPC") && !d.lpc && "LPC",
    secoes.includes("LE") && !d.le && "Lista de Expedição",
  ].filter(Boolean);
  if (!faltando.length) return null;
  return (
    <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
      <b>{faltando.join(" e ")} sem itens importados nesta obra.</b> A seção não vai aparecer no
      portal — o cliente receberia uma planilha em branco. Peça à Engenharia para importar a lista;
      publicar o arquivo da pasta no lugar entrega o peso item a item.
    </p>
  );
}

export default function AbaPortalCliente({ opId, opNumero }) {
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
          destinatarios: Array.isArray(j.portal.destinatarios) ? j.portal.destinatarios : [],
          capaUrl: j.portal.capaUrl || "", logoClienteUrl: j.portal.logoClienteUrl || "",
          fotos: Array.isArray(j.portal.fotos) ? j.portal.fotos : [],
          secoes: j.portal.secoesAtivas || [], mostrarPeso: j.portal.mostrarPeso === true,
        });
      })
      .catch(() => setErro("Não consegui carregar o portal."));
  }, [opId]);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!d || !f) return <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDest = (i, k, v) => setF((p) => ({ ...p, destinatarios: p.destinatarios.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));
  const addDest = () => setF((p) => ({ ...p, destinatarios: [...(p.destinatarios || []), { nome: "", email: "" }] }));
  const rmDest = (i) => setF((p) => ({ ...p, destinatarios: p.destinatarios.filter((_, j) => j !== i) }));
  // quem realmente vai receber: o contato principal + os extras com e-mail válido, sem repetir
  const nDest = new Set([f.clienteEmail, ...(f.destinatarios || []).map((x) => x?.email)]
    .map((e) => (e || "").trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e))).size;
  const temEmail = nDest > 0;
  const st = situacao(d.portal);
  const link = d.portal.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${d.portal.token}` : null;
  // ⚠ O QUE NÓS ABRIMOS NÃO É ACESSO DO CLIENTE. `?preview=1` faz a rota do portal não contar
  // acesso, não gravar "primeiro acesso" e não tirar foto de revisão — o histórico do portal é o
  // que o CLIENTE fez. O link que se copia e se envia continua sendo `link`, sem o parâmetro.
  const linkPreview = link ? `${link}?preview=1` : null;

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
        body: JSON.stringify({ enviar, clienteEmail: f.clienteEmail, contato: f.contato, destinatarios: f.destinatarios }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao publicar");
      setD((p) => ({ ...p, portal: { ...p.portal, token: j.link.split("/").pop(), status: "PUBLICADO" } }));
      setAviso(enviar
        ? (j.enviado ? `Publicado e enviado para ${j.enviados} de ${j.total} destinatário(s).` : "Publicado — mas o e-mail falhou; o link já vale.")
        : "Publicado.");
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
              <a href={linkPreview} target="_blank" rel="noreferrer"
                title="Abre o portal sem contar como acesso do cliente"
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

        {/* ⚠ QUEM MAIS RECEBE. Obra tem engenharia, compras e fiscalização do lado do cliente:
            mandar para um só obriga o repasse, e o link repassado chega sem código — o acesso
            volta para nós como "sem identificação". Cada pessoa daqui recebe o seu. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-torg-gray mb-1.5">Outros destinatários — cada um recebe o próprio link, e o acesso aparece com o nome dele no histórico</p>
          {(f.destinatarios || []).map((dst, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
              <input value={dst.nome || ""} placeholder="nome" onChange={(e) => setDest(i, "nome", e.target.value)}
                className="col-span-5 text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
              <input value={dst.email || ""} placeholder="e-mail" type="email" onChange={(e) => setDest(i, "email", e.target.value)}
                className="col-span-6 text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
              <button onClick={() => rmDest(i)} title="Remover" className="col-span-1 text-gray-400 hover:text-red-500 flex justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addDest} className="text-[11px] font-semibold text-torg-blue hover:text-torg-dark inline-flex items-center gap-1">
            <Plus size={12} /> adicionar e-mail
          </button>
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
        {/* ⚠ PESO É PREÇO, e por isso o interruptor fica JUNTO das listas que ele afeta, não
            perdido numa aba de configuração. Vitor (22/08/2026): "a lista LPC e LE deixe a opção
            de divulgar com e sem peso, isso é importante para nós" — estrutura se cota por R$/kg,
            e o peso item a item entrega a base do nosso preço a quem vai negociar o próximo
            contrato. */}
        {(f.secoes.includes("LPC") || f.secoes.includes("LE")) && (
          <label className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 mb-2 cursor-pointer ${f.mostrarPeso ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
            <input type="checkbox" checked={!!f.mostrarPeso} onChange={(e) => set("mostrarPeso", e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-torg-dark">Divulgar o peso nas listas</span>
              <span className="block text-[11px] text-torg-gray">
                {f.mostrarPeso
                  ? "A LPC e a LE saem com a coluna de peso e o total da obra — o cliente consegue calcular o R$/kg."
                  : "As listas saem sem peso. O cliente vê marca, descrição, material e quantidade."}
              </span>
            </span>
          </label>
        )}

        {/* ⚠ AGRUPADO PELA MESMA ÁREA QUE O CLIENTE VÊ. Quem configura precisa enxergar a página
            que o cliente vai abrir — com as seções soltas numa grade, ninguém percebia que desligar
            duas caixas fazia uma ABA INTEIRA sumir do portal. */}
        <div className="space-y-3">
          {AREAS.map((a) => {
            const doGrupo = SECOES.filter((x) => x.area === a.id);
            if (!doGrupo.length) return null;
            const ligadas = doGrupo.filter((x) => f.secoes.includes(x.id)).length;
            return (
              <div key={a.id}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-torg-gray-light mb-1.5">
                  {a.nome}
                  <span className={`ml-2 font-normal ${ligadas ? "text-torg-gray" : "text-amber-700"}`}>
                    {ligadas ? `${ligadas} de ${doGrupo.length}` : "aba não aparece no portal"}
                  </span>
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {doGrupo.map((s) => {
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
            );
          })}
        </div>
      </div>

      {/* ⚠ o seletor fica JUNTO das seções, não numa tela à parte: escolher documento é parte de
          montar o portal, e separar faria alguém publicar sem nunca ter aberto a pasta. */}
      {/* ⚠ QUEM PUBLICA PRECISA SABER QUE A LISTA NÃO ENTROU. Sem este aviso, a seção some do
          portal em silêncio e a pessoa recorre a publicar o xlsx cru da pasta — que é como o peso
          vaza. O aviso aponta a causa (a Engenharia não importou a LPC/LE desta obra), que é onde
          se resolve de verdade. */}
      <AvisoListas opNumero={opNumero} secoes={f.secoes} />

      {/* ⚠ UM SELETOR POR ÁREA. Vitor (26/08/2026): "para cada parte aqui me permita acessar o
          servidor e selecionar o que eu quero colocar". Cada aba do portal do cliente tem a sua
          pasta natural no servidor, e a decisão de o que publicar é de quem responde por ela. */}
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-torg-dark">Documentos do servidor, por área</p>
        <p className="text-[11px] text-torg-gray -mt-1">
          Escolha o que o cliente vê na Engenharia e na Qualidade, com um nome mais claro que o do
          arquivo. <b>Nada é publicado sozinho.</b> Compras, Planejamento e Expedição não têm
          seleção: o portal já publica a lista de materiais, o cronograma e a Lista de Expedição
          direto do que os módulos mantêm.
        </p>
        {AREAS.filter((a) => AREAS_COM_SELETOR.includes(a.id)).map((a) => (
          // ⚠ A ENGENHARIA TEM QUATRO CAIXAS, NÃO UMA. Vitor (26/08/2026): "na Engenharia apenas
          //   permitir o Modelo 3D, memorial de cálculo, ART e Diagramas de montagem — criar uma
          //   forma de ficar separado e que eu consiga acessar as pastas respectivas". Cada caixa
          //   abre já na pasta daquele documento e não sai dela; as outras áreas seguem navegando
          //   a OP inteira.
          a.id === "ENGENHARIA" ? (
            <div key={a.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/40">
              <p className="text-[13px] font-semibold text-torg-dark inline-flex items-center gap-1.5">
                <FolderOpen size={14} className="text-torg-blue" /> {a.nome}
                <span className="text-[11px] font-normal text-torg-gray">· quatro documentos, cada um na sua pasta</span>
              </p>
              {TIPOS_ENGENHARIA.map((t) => (
                <SeletorDocsArea key={t.id} opNumero={opNumero} area={a.id} nomeArea={a.nome}
                  tipo={t.id} nomeTipo={t.nome} ondeTipo={t.onde} resumoTipo={t.resumo} />
              ))}
            </div>
          ) : (
            <SeletorDocsArea key={a.id} opNumero={opNumero} area={a.id} nomeArea={a.nome} />
          )
        ))}
      </div>

      <HistoricoPortal opNumero={opNumero} />

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
        <button onClick={() => publicar(true)} disabled={salvando || !temEmail}
          title={!temEmail ? "Informe ao menos um e-mail" : `Publica e envia o link para ${nDest} destinatário(s)`}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Send size={13} /> Publicar e enviar
        </button>
        {/* ⚠⚠ AVISAR ≠ PUBLICAR. Vitor (01/09/2026): "preciso enviar para os envolvidos sobre
            alguns arquivos que adicionei (…) pensei em um botão para mandar o alerta" e "eu só não
            faria isso sempre que algum arquivo for adicionado, e sim quando eu quiser mandar".
            Publicar coloca no ar; avisar conta que mudou. Separados de propósito: quem sobe dez
            arquivos ao longo do dia manda UM aviso, e não dez. */}
        {d.portal.status === "PUBLICADO" && <AvisoDocsNovos opId={opId} />}
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

// ─── AVISAR SOBRE DOCUMENTOS NOVOS ────────────────────────────────────────────
// O botão só existe quando HÁ novidade — e diz quanta. Botão sempre aceso, que às vezes manda
// e-mail vazio, é o que ensina o cliente a ignorar o aviso seguinte.
function AvisoDocsNovos({ opId }) {
  const [d, setD] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [abrir, setAbrir] = useState(false);
  const [sel, setSel] = useState(null); // null = todos

  const carregar = useCallback(() => {
    fetch(`/api/comercial/op/${opId}/portal/avisar`, { cache: "no-store" })
      .then((r) => r.json()).then(setD).catch(() => {});
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!d || d.error) return null;
  const alvo = sel ?? (d.destinatarios || []).map((x) => x.email);

  async function enviar() {
    setEnviando(true); setMsg("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/portal/avisar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: alvo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao enviar");
      setMsg(`Aviso enviado para ${j.enviados} pessoa(s).`);
      setAbrir(false); carregar();
    } catch (e) { setMsg(e.message); } finally { setEnviando(false); }
  }

  if (!d.novos) {
    return (
      <span className="text-[11px] text-torg-gray self-center">
        {d.avisadoEm ? `nada novo desde ${new Date(d.avisadoEm).toLocaleDateString("pt-BR")}` : "nenhum documento para avisar"}
      </span>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setAbrir((v) => !v)}
        className="text-[12px] font-semibold text-white bg-torg-orange rounded-lg px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1.5">
        <Send size={13} /> Avisar sobre {d.novos} documento(s) novo(s)
      </button>
      {abrir && (
        <div className="absolute right-0 bottom-full mb-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20 space-y-2">
          <p className="text-[11px] font-semibold text-torg-dark">O aviso vai listar:</p>
          <ul className="text-[11px] text-torg-gray space-y-0.5 max-h-28 overflow-y-auto">
            {(d.caixas || []).map((c) => (
              <li key={c.caixa}><b className="text-torg-dark">{c.caixa}</b> · {c.nomes.length} arquivo(s)</li>
            ))}
          </ul>
          <div className="border-t border-gray-100 pt-2">
            <p className="text-[11px] font-semibold text-torg-dark mb-1">Para quem:</p>
            {(d.destinatarios || []).map((p) => {
              const on = alvo.includes(p.email);
              return (
                <label key={p.id} className="flex items-center gap-2 text-[11px] py-0.5 cursor-pointer">
                  <input type="checkbox" checked={on} className="accent-torg-orange"
                    onChange={() => setSel(on ? alvo.filter((e) => e !== p.email) : [...alvo, p.email])} />
                  <span className="truncate">{p.nome || p.email}</span>
                </label>
              );
            })}
          </div>
          <button onClick={enviar} disabled={enviando || !alvo.length}
            className="w-full text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            {enviando ? "enviando…" : `Enviar para ${alvo.length}`}
          </button>
        </div>
      )}
      {msg && <p className="absolute right-0 top-full mt-1 text-[11px] text-emerald-700 whitespace-nowrap">{msg}</p>}
    </div>
  );
}
