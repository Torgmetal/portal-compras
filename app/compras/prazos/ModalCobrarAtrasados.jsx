"use client";

// ─── COBRAR OS ATRASADOS, ESCOLHENDO QUEM ────────────────────────────────────
//
// Matheus (17/09/2026): "um botão para disparar e-mails para os pedidos/RMs que já estão com 1 dia
// em atraso, mas eu devo conseguir escolher qual fornecedor eu quero disparar em uma lista de
// atrasados (…) preciso desse e-mail separado, um para cada fornecedor."
//
// ⚠⚠ NADA VEM MARCADO. Esta tela manda e-mail para gente de fora, e e-mail não tem desfazer —
// "marcar todos" por padrão transforma um clique distraído em oito cobranças. Quem quiser todos
// tem o atalho; quem não quiser não precisa desmarcar nada.
import { useEffect, useState, useMemo } from "react";
import { X, Mail, Loader2, AlertCircle, Send, Eye } from "lucide-react";
import LinhaFornecedorCobranca from "./LinhaFornecedorCobranca";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const diasDesde = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** A lista em si — carregando, erro, vazio ou os fornecedores. */
function Corpo({ estado }) {
  const { dados, erro, fornecedores, selecionaveis, marcadas, setMarcadas, marcar, resultadoDe } = estado;
  return (
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-2">
          {!dados && !erro && (
            <p className="py-10 text-center text-sm text-torg-gray inline-flex items-center gap-2 justify-center w-full">
              <Loader2 size={16} className="animate-spin" /> Levantando os atrasados…
            </p>
          )}
          {erro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={14} className="mt-px shrink-0" /> {erro}
            </p>
          )}

          {dados && fornecedores.length === 0 && (
            <p className="py-10 text-center text-sm text-torg-gray">
              Nenhum pedido vencido no momento — não há quem cobrar.
            </p>
          )}

          {dados && fornecedores.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 pb-1">
                {/* ⚠⚠ O NÚMERO AQUI É MAIOR QUE O DO CHIP "ATRASADO" DA TELA, E A FRASE DIZ POR QUÊ.
                    Lá o recebido parcial tem chip próprio e sai de "Atrasado"; aqui ele entra, porque
                    o que falta dele é exatamente o que precisa ser cobrado. Sem esta linha, os dois
                    números parecem uma contradição. */}
                <p className="text-xs text-torg-gray">
                  {plural(fornecedores.length, "fornecedor", "fornecedores")} com prazo vencido —
                  inclui os recebidos parcialmente.
                </p>
                <button type="button" className="text-xs text-torg-blue hover:underline shrink-0"
                  onClick={() => setMarcadas((s) =>
                    s.size === selecionaveis.length ? new Set() : new Set(selecionaveis.map((f) => f.chave)))}>
                  {marcadas.size === selecionaveis.length ? "limpar seleção" : "marcar todos"}
                </button>
              </div>

              {fornecedores.map((f) => (
                <LinhaFornecedorCobranca key={f.chave} f={f}
                  marcado={marcadas.has(f.chave)} onMarcar={marcar}
                  resultado={resultadoDe.get(f.chave)} intervaloDias={dados.intervaloDias} />
              ))}
            </>
          )}
        </div>
  );
}

/**
 * O rodapé: quem recebe cópia, a confirmação de cobrança recente e o botão.
 *
 * ⚠ Em componente próprio porque o modal passou do teto de complexidade — e porque é aqui que
 * mora a decisão irreversível.
 */
function Rodape({ estado }) {
  const { dados, marcadas, recentesMarcados, confirmar, setConfirmar, enviar, travado, enviando, totalPedidos } = estado;
  return (
          <div className="px-5 py-4 border-t border-gray-100 space-y-3">
            {/* ⚠ Quem recebe a cópia fica escrito: a pessoa precisa saber que o e-mail dela sai
                com o diretor em cópia ANTES de clicar, não depois. */}
            <p className="text-xs text-torg-gray">
              Cópia para <b className="text-torg-dark">{(dados.copias || []).join(", ") || "—"}</b> ·
              respostas vão para <b className="text-torg-dark">{dados.respostaPara}</b>
            </p>

            {recentesMarcados.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 cursor-pointer">
                <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-amber-600" />
                <span>
                  {plural(recentesMarcados.length, "fornecedor marcado foi cobrado", "fornecedores marcados foram cobrados")}
                  {" "}há menos de {plural(dados.intervaloDias, "dia", "dias")}
                  {" "}({recentesMarcados.map((f) => f.nome).join(", ")}). Cobrar de novo mesmo assim.
                </span>
              </label>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-torg-gray">
                {marcadas.size === 0 ? "Nenhum fornecedor marcado"
                  : `${plural(marcadas.size, "e-mail", "e-mails")} · ${plural(totalPedidos, "pedido", "pedidos")}`}
              </span>
              <div className="flex items-center gap-2">
                {/* ⚠⚠ TEMPORÁRIO (Matheus, 18/09/2026: "depois removemos"). Manda o MESMO e-mail
                    para quem está logado, sem cópia e sem registrar cobrança — ver como ficou não
                    pode bloquear a cobrança de verdade por dois dias. Para remover: apague este
                    botão e o `teste` da rota e da lib. */}
                {dados.testePara && (
                  <button type="button" onClick={() => enviar(true)} disabled={enviando || marcadas.size === 0}
                    title={`Manda o mesmo e-mail para ${dados.testePara}, sem cópia e sem cobrar ninguém`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-torg-dark hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Eye size={15} /> Enviar teste para mim
                  </button>
                )}
                <button type="button" onClick={() => enviar(false)} disabled={travado}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-torg-blue text-white hover:bg-torg-blue/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {enviando ? "Enviando…" : "Enviar cobranças"}
                </button>
              </div>
            </div>
            {/* ⚠ Diz para onde a prévia vai e quantas cabem: sem isso, marcar os oito e clicar em
                teste encheria a própria caixa de quem clicou. */}
            {dados.testePara && (
              <p className="text-xs text-torg-gray">
                O teste vai só para <b className="text-torg-dark">{dados.testePara}</b>
                {marcadas.size > dados.maxTeste ? ` — no máximo ${dados.maxTeste} de cada vez` : ""}, sem cópia e sem cobrar o fornecedor.
              </p>
            )}
          </div>
  );
}

export default function ModalCobrarAtrasados({ onFechar, onEnviado }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/compras/prazos-rm/cobrar");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não foi possível carregar a lista.");
        if (vivo) setDados(j);
      } catch (e) {
        if (vivo) setErro(e.message);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const fornecedores = dados?.fornecedores || [];
  const selecionaveis = useMemo(() => fornecedores.filter((f) => !f.bloqueio), [fornecedores]);
  const porChave = useMemo(() => new Map(fornecedores.map((f) => [f.chave, f])), [fornecedores]);
  const resultadoDe = useMemo(
    () => new Map((resultados || []).map((r) => [r.chave, r])), [resultados]);

  // ⚠ Só pede confirmação por quem foi cobrado HÁ POUCO e está marcado agora: pedir por causa de
  // um fornecedor que a pessoa nem selecionou ensina a marcar a caixa sem ler.
  const recentesMarcados = useMemo(
    () => [...marcadas].map((c) => porChave.get(c)).filter(
      (f) => f?.ultimaCobranca && diasDesde(f.ultimaCobranca) < (dados?.intervaloDias ?? 2)),
    [marcadas, porChave, dados]);

  const marcar = (chave, ligado) => setMarcadas((s) => {
    const n = new Set(s);
    if (ligado) n.add(chave); else n.delete(chave);
    return n;
  });

  const totalPedidos = [...marcadas].reduce((s, c) => s + (porChave.get(c)?.pedidos.length || 0), 0);
  const travado = enviando || marcadas.size === 0 || (recentesMarcados.length > 0 && !confirmar);

  // ⚠ `teste` é TEMPORÁRIO (Matheus, 18/09/2026: "acrescente um enviar teste pra mim só para eu
  // testar, depois removemos"). Ele reusa este mesmo caminho de propósito: uma prévia que passa
  // por outro código não prova nada sobre o e-mail que vai sair.
  const enviar = async (teste = false) => {
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/compras/prazos-rm/cobrar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: [...marcadas], confirmar, ...(teste ? { teste: true } : {}) }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || "Não foi possível enviar.");
      setResultados(j.resultados);
      // ⚠ A prévia não mexe na seleção: quem mandou o teste vai querer mandar a cobrança de
      // verdade para os mesmos, logo em seguida.
      if (teste) return;
      // ⚠⚠ SÓ O QUE FALHOU DE VERDADE CONTINUA MARCADO. `aceito` sai porque já foi, e
      // `indeterminado` sai porque PODE ter ido: deixá-lo marcado convidaria o segundo clique a
      // mandar de novo a mesma cobrança (achado do Codex, 18/09/2026). Para reenviar um
      // indeterminado é preciso marcá-lo outra vez, de propósito.
      const reenviaveis = new Set(["falhou", "ocupado"]);
      setMarcadas(new Set((j.resultados || []).filter((x) => reenviaveis.has(x.estado)).map((x) => x.chave)));
      setConfirmar(false);
      await onEnviado?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const corpo = { dados, erro, fornecedores, selecionaveis, marcadas, setMarcadas, marcar, resultadoDe };
  const rodape = { dados, marcadas, recentesMarcados, confirmar, setConfirmar, enviar, travado, enviando, totalPedidos };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-torg-blue/10"><Mail size={18} className="text-torg-blue" /></div>
            <div>
              <h3 className="text-base font-bold text-torg-dark">Cobrar fornecedores</h3>
              <p className="text-xs text-torg-gray">
                Um e-mail para cada fornecedor, com os pedidos e as RMs dele.
              </p>
            </div>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>

        <Corpo estado={corpo} />

        {dados && fornecedores.length > 0 && <Rodape estado={rodape} />}
      </div>
    </div>
  );
}
