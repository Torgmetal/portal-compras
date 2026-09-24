"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Plus, Loader2, MessageSquare, Bot, Trash2, AlertTriangle, Paperclip, FileCode2, X } from "lucide-react";
import Mensagem from "./Mensagem";
import { tentativaPara } from "./tentativa";

// ─── O ASSISTENTE FISCAL TORG ────────────────────────────────────────────────
//
// ⚠⚠ A TELA NÃO CALCULA NADA E NÃO GUARDA NADA. Ela manda a pergunta, mostra o progresso e desenha
// o que o servidor gravou. Todo número fiscal chega pronto dentro de `blocos` — o navegador nunca
// deriva alíquota, CFOP nem citação, pela mesma razão que a Conferência de Peça nunca soma saldo.

/** ⚠ O mesmo teto do servidor (`LIMITES.bytes`): recusar aqui poupa o envio de 4 MB que voltaria 413. */
const TETO_XML = 4 * 1024 * 1024;

const SUGESTOES = [
  { titulo: "IPI de um NCM", texto: "Qual é a alíquota de IPI do NCM 8437.90.00?" },
  { titulo: "CFOP de uma venda", texto: "A TORG comprou o aço e fabricou uma estrutura metálica para um cliente em São Paulo. Qual CFOP devo usar?" },
  { titulo: "Industrialização por encomenda", texto: "O meu cliente comprou o aço e o fornecedor entregou diretamente aqui na TORG. Como fica a documentação fiscal?" },
  { titulo: "Remessa para jateamento", texto: "Vou enviar material para jateamento e depois ele vai direto para outro fornecedor fazer a pintura. Quais notas preciso emitir?" },
  { titulo: "Venda para outro estado", texto: "Vou vender uma estrutura metálica para um cliente no Rio Grande do Sul. Quais impostos preciso analisar?" },
  { titulo: "Conferir uma regra", texto: "O CFOP 5.101 já foi conferido pela contabilidade?" },
];

/** ⚠ Uma chave por TENTATIVA, num ref: reenviar depois de uma falha manda a MESMA chave — e o MESMO
 *  conteúdo (ver `tentativa.js`) —, e a rota devolve a execução que já existe em vez de cobrar outra
 *  chamada à API. */
const novaChave = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function AssistenteFiscal({ showToast }) {
  const [conversas, setConversas] = useState([]);
  const [atual, setAtual] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState(null);
  const [ambiente, setAmbiente] = useState({ disponivel: true, consumo: null });
  const [arquivo, setArquivo] = useState(null);
  const seletor = useRef(null);
  const pendente = useRef(null);
  const fim = useRef(null);
  const campo = useRef(null);

  const carregarLista = useCallback(async () => {
    const r = await fetch("/api/fiscal/assistente/conversas").then((x) => x.json()).catch(() => null);
    if (r?.success) {
      setConversas(r.conversas);
      setAmbiente({ disponivel: r.disponivel, consumo: r.consumo, modelo: r.modelo });
    }
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens, etapa]);

  const abrir = async (id) => {
    setAtual(id); setEtapa(null); pendente.current = null;
    const r = await fetch(`/api/fiscal/assistente/conversas/${id}`).then((x) => x.json()).catch(() => null);
    setMensagens(r?.success ? r.conversa.mensagens : []);
  };

  const nova = () => { pendente.current = null; setAtual(null); setMensagens([]); setPergunta(""); setEtapa(null); campo.current?.focus(); };

  const arquivar = async (id, e) => {
    e.stopPropagation();
    const r = await fetch(`/api/fiscal/assistente/conversas/${id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.success) { if (atual === id) nova(); carregarLista(); showToast?.("Conversa arquivada.", "sucesso"); }
  };

  /** ⚠ Conferência de conveniência, não de segurança — quem decide é o servidor. Poupa a espera de
   *  subir 4 MB para ouvir "não é XML". */
  const escolherArquivo = (f) => {
    if (!f) return;
    if (!/\.xml$/i.test(f.name)) { showToast?.("Anexe o arquivo XML da NF-e.", "erro"); return; }
    if (f.size > TETO_XML) { showToast?.("O XML passa de 4 MB.", "erro"); return; }
    setArquivo(f);
    // ⚠ Trocar o anexo é OUTRA tentativa: a chave antiga, reusada com outro arquivo, daria 409.
    pendente.current = null;
  };

  async function enviar(texto) {
    const p = String(texto ?? pergunta).trim();
    if (!p || enviando) return;
    const t = tentativaPara(pendente.current, { pergunta: p, conversaId: atual, arquivo }, novaChave);
    pendente.current = t;
    const anexado = t.arquivo;
    setEnviando(true); setEtapa({ etapa: "inicio" }); setPergunta("");
    setMensagens((m) => [...m, { id: `tmp-${Date.now()}`, papel: "USUARIO", conteudo: p, estado: "CONCLUIDA", anexo: anexado?.name ?? null }]);

    let recusada = false;
    try {
      // ⚠ Sem anexo continua JSON; com anexo, multipart — o servidor aceita os dois e termina no
      // mesmo lugar. ⚠ Tudo sai de `t`, nunca do estado da tela: ver `tentativa.js`.
      let requisicao;
      if (anexado) {
        const form = new FormData();
        form.append("pergunta", t.pergunta);
        form.append("chave", t.chave);
        if (t.conversaId) form.append("conversaId", t.conversaId);
        form.append("xml", anexado);
        requisicao = { method: "POST", body: form };
      } else {
        requisicao = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta: t.pergunta, conversaId: t.conversaId, chave: t.chave }) };
      }
      const resp = await fetch("/api/fiscal/assistente/mensagem", requisicao);
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        // ⚠ 409 = esta chave já foi usada com outro conteúdo. A próxima tentativa precisa de chave nova.
        if (resp.status === 409) { pendente.current = null; recusada = true; }
        throw new Error(e.error || "Não foi possível falar com o assistente.");
      }
      setArquivo(null);
      // ⚠ Resposta de reenvio idêntico volta como JSON, não como fluxo: a execução já existia.
      if (resp.headers.get("content-type")?.includes("application/json")) {
        const j = await resp.json();
        if (j.conversa) { setAtual(j.conversaId); setMensagens(j.conversa.mensagens); }
        pendente.current = null;
        return;
      }
      await consumirFluxo(resp);
      pendente.current = null;
      carregarLista();
    } catch (e) {
      showToast?.(e.message, "erro");
      setMensagens((m) => [...m, { id: `err-${Date.now()}`, papel: "ASSISTENTE", estado: "FALHOU", erro: e.message }]);
      // ⚠ A pergunta volta para o campo: reenviar é um Enter, e com o mesmo texto a tentativa
      // guardada é reaproveitada — sem nova cobrança.
      // O anexo volta junto, para a tela mostrar o que o reenvio vai mandar; tirá-lo pelo X é
      // tentativa nova.
      if (!recusada) { setPergunta((atualCampo) => atualCampo || p); if (t.arquivo) setArquivo(t.arquivo); }
    } finally {
      setEnviando(false); setEtapa(null);
    }
  }

  /** ⚠⚠ O FLUXO TRAZ PROGRESSO, NUNCA TEXTO FISCAL NÃO CONFERIDO — a resposta só chega no `pronta`,
   *  depois de o servidor conferir a prosa contra as evidências e gravar. */
  async function consumirFluxo(resp) {
    const leitor = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const partes = buffer.split("\n\n");
      buffer = partes.pop() ?? "";
      for (const bloco of partes) {
        const ev = bloco.match(/^event: (.+)$/m)?.[1];
        const dado = bloco.match(/^data: (.+)$/m)?.[1];
        if (!ev || !dado) continue;
        const d = JSON.parse(dado);
        if (ev === "etapa") { setEtapa(d); if (d.conversaId) setAtual(d.conversaId); }
        if (ev === "erro") throw new Error(d.erro);
        if (ev === "pronta") {
          setAtual(d.conversaId);
          setMensagens((m) => [...m, { id: d.mensagemId, papel: "ASSISTENTE", estado: "CONCLUIDA", conteudo: d.conteudo, blocos: d.blocos, avisos: d.avisos, ferramentas: d.ferramentas }]);
        }
      }
    }
  }

  const ETAPAS = {
    consultar_ncm: "Consultando a TIPI…", buscar_ncm: "Procurando o NCM…",
    consultar_cfop: "Consultando a tabela de CFOP…", buscar_legislacao: "Procurando o fundamento legal…",
    consultar_regra_e_situacao: "Conferindo a situação da regra…", simular_operacao: "Simulando a operação…",
    consultar_classificacao: "Consultando o registro de classificação…",
    ler_documento_anexado: "Lendo a nota anexada…",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
      {/* ── Histórico ── */}
      <aside className="space-y-2">
        <button type="button" onClick={nova}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-torg-blue px-3 py-2 text-sm font-medium text-white transition hover:bg-torg-blue/90">
          <Plus size={15} />Nova conversa
        </button>
        <div className="max-h-[480px] space-y-0.5 overflow-y-auto">
          {conversas.map((c) => (
            <div key={c.id} onClick={() => abrir(c.id)}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition ${atual === c.id ? "bg-torg-blue/10 text-torg-dark" : "text-torg-gray hover:bg-gray-50"}`}>
              <MessageSquare size={12} className="shrink-0" />
              <span className="flex-1 truncate">{c.titulo}</span>
              <button type="button" onClick={(e) => arquivar(c.id, e)} title="Arquivar"
                className="shrink-0 text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
            </div>
          ))}
          {!conversas.length && <p className="px-2.5 py-2 text-xs text-gray-400">Nenhuma conversa ainda.</p>}
        </div>
        {/* ⚠ O consumo fica à vista SEMPRE — teto que só aparece quando estoura é teto que surpreende. */}
        {ambiente.consumo && (
          <p className="border-t border-gray-100 pt-2 text-[11px] text-torg-gray">
            Hoje: {ambiente.consumo.meu.chamadas} pergunta(s) · R$ {ambiente.consumo.meu.reais.toFixed(2)} de R$ {ambiente.consumo.meu.tetoReais.toFixed(2)}
          </p>
        )}
      </aside>

      {/* ── Conversa ── */}
      <section className="flex min-h-[520px] flex-col rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
        {!ambiente.disponivel && (
          <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            O assistente está desligado neste ambiente: a chave da API de IA não está configurada. As abas de NCM, CFOP, Simulador e Auditoria continuam funcionando.
          </p>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {!mensagens.length && (
            <div className="py-6 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-torg-blue/10 text-torg-blue"><Bot size={24} /></span>
              <h3 className="text-lg font-semibold text-torg-dark">Assistente Fiscal TORG</h3>
              <p className="mt-1 text-sm text-torg-gray">Como posso ajudar com a sua operação fiscal?</p>
              <p className="mx-auto mt-2 max-w-md text-xs text-torg-gray/80">
                Descreva a operação como ela acontece. Eu consulto a TIPI, a tabela de CFOP e a legislação
                guardada no portal — e digo quando não tenho fundamento para responder.
              </p>
              <div className="mx-auto mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
                {SUGESTOES.map((s) => (
                  <button key={s.titulo} type="button" onClick={() => enviar(s.texto)} disabled={enviando || !ambiente.disponivel}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-torg-blue/40 hover:shadow-sm disabled:opacity-50">
                    <p className="text-xs font-semibold text-torg-dark">{s.titulo}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-torg-gray">{s.texto}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((m) => <Mensagem key={m.id} m={m} />)}

          {etapa && (
            <p className="flex items-center gap-2 text-sm text-torg-gray">
              <Loader2 size={14} className="animate-spin" />
              {ETAPAS[etapa.nome] ?? "Pensando…"}
            </p>
          )}
          <div ref={fim} />
        </div>

        {/* ⚠ O anexo aparece ANTES de enviar, com nome e tamanho: quem anexou a nota errada precisa ver
            isso antes de pagar por uma resposta sobre ela. */}
        {arquivo && (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 self-start rounded-lg border border-torg-blue/20 bg-torg-blue/5 px-2.5 py-1.5 text-xs text-torg-dark">
            <FileCode2 size={13} className="shrink-0 text-torg-blue" />
            <span className="truncate">{arquivo.name}</span>
            <span className="shrink-0 text-torg-gray">{(arquivo.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => { setArquivo(null); pendente.current = null; }} disabled={enviando}
              className="shrink-0 text-torg-gray hover:text-red-600" title="Remover anexo"><X size={13} /></button>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="mt-3 flex items-end gap-2">
          <input ref={seletor} type="file" accept=".xml,text/xml,application/xml" className="hidden"
            onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => seletor.current?.click()} disabled={enviando || !ambiente.disponivel}
            title="Anexar o XML de uma NF-e"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-torg-gray transition hover:border-torg-blue/40 hover:text-torg-blue disabled:opacity-40">
            <Paperclip size={17} />
          </button>
          <textarea
            ref={campo} rows={2} value={pergunta} onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            disabled={enviando || !ambiente.disponivel}
            placeholder="Descreva a operação… (Enter envia, Shift+Enter quebra linha)"
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-torg-blue disabled:bg-gray-50"
          />
          <button type="submit" disabled={enviando || !pergunta.trim() || !ambiente.disponivel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-torg-blue text-white transition hover:bg-torg-blue/90 disabled:opacity-40">
            {enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </form>
      </section>
    </div>
  );
}
