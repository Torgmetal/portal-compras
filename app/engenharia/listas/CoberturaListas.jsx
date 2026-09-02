"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ClipboardList, Check, X, Loader2, RefreshCw, ChevronDown, ChevronUp, DownloadCloud } from "lucide-react";

const STATUS_LABEL = {
  ABERTA: "Aberta", EM_EXECUCAO: "Em execução", ATRASADA: "Atrasada",
  ENCERRADA: "Encerrada", CANCELADA: "Cancelada",
};

// Badge ✓/✗ pra cada tipo de lista.
// ⚠⚠ "SOLTA" É UM TERCEIRO ESTADO, e existe para evitar o conserto errado. Lista solta é lista que
// EXISTE, só não está vinculada à OP (`opId` nulo) — reimportar não resolve nada e ainda substitui
// o conteúdo. Enquanto isso era mostrado como "falta", a leitura natural era reimportar; foi essa
// leitura que fez a OP-113 perder 76 marcas e o cliente receber o aviso.
function Marca({ tem, n, solta }) {
  if (solta) return (
    <span title={`${n} peça(s) existem, mas sem vínculo com esta OP. O conserto é ligar o vínculo — reimportar substituiria a lista.`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[12px] font-semibold">
      solta ({n})
    </span>
  );
  return tem ? (
    <span title={`${n} peça(s) importada(s)`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[12px] font-semibold">
      <Check size={13} /> tem
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[12px] font-semibold">
      <X size={13} /> falta
    </span>
  );
}

export default function CoberturaListas() {
  const { data: sessao } = useSession();
  // ⚠ SÓ ADMIN vê o botão (Vitor, 29/08/2026). O gate de verdade está na rota — esconder o botão é
  // conveniência, não segurança: quem descobrir a URL bate no requireRole igual.
  const ehAdmin = sessao?.user?.tipo === "ADMIN";
  const [puxando, setPuxando] = useState(null);   // OP em andamento
  const [escolher, setEscolher] = useState(null); // { numero, arquivos }

  // Carrega a LE que JA ESTA no servidor. Sem isto, obra com o arquivo salvo na pasta continuava
  // "sem LE" no portal ate alguem reenviar o mesmo arquivo pela tela — aconteceu 6 vezes.
  async function verNoServidor(numero) {
    setPuxando(numero);
    try {
      const r = await fetch(`/api/engenharia/listas/le-servidor?op=${encodeURIComponent(numero)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      if (!j.arquivos?.length) { alert(j.erro || `Nenhuma LE (.xls/.xlsx) na pasta desta OP no servidor.`); return; }
      setEscolher({ numero, arquivos: j.arquivos });
    } catch (e) { alert(e.message); } finally { setPuxando(null); }
  }

  async function importarDoServidor(numero, arq) {
    setPuxando(numero); setEscolher(null);
    try {
      // 1) o servidor le o arquivo e devolve as linhas
      const r1 = await fetch("/api/engenharia/listas/le-servidor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: numero, itemId: arq.id }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Falha ao ler o arquivo");
      // 2) e o import de SEMPRE grava — mesma rota do upload, mesmo upsert, mesmo AuditLog
      const r2 = await fetch("/api/producao/pecas/importar-le", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: j1.rows, opNumero: numero }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || "Falha ao importar");
      alert(`${arq.nome}: ${j2.criados} nova(s), ${j2.atualizados} atualizada(s)${j2.ignorados ? `, ${j2.ignorados} ignorada(s)` : ""}.`
        + (j2.avisoListaUnica ? `\n\n${j2.avisoListaUnica}` : ""));
      carregar(todas);
    } catch (e) { alert(e.message); } finally { setPuxando(null); }
  }

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [todas, setTodas] = useState(false); // incluir encerradas/canceladas
  const [soFaltantes, setSoFaltantes] = useState(true); // esconder obras 100% cobertas
  const [aberto, setAberto] = useState(true);

  async function carregar(incluirTodas) {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/engenharia/listas/cobertura${incluirTodas ? "?todas=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDados(j);
    } catch (e) {
      setErro(e.message || "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(todas); }, [todas]);

  const linhas = dados?.linhas || [];
  const visiveis = soFaltantes ? linhas.filter((l) => !l.temLE || !l.temLPC) : linhas;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 p-5 text-left">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0"><ClipboardList size={19} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-torg-dark">Obras sem lista</h2>
          <p className="text-[13px] text-torg-gray">
            {dados
              ? `${dados.semAlguma} de ${dados.total} obra(s) ${todas ? "" : "ativa(s) "}sem alguma lista · ${dados.semLPC} sem LPC · ${dados.semLE} sem LE${dados.semCobertura ? ` · ${dados.semCobertura} com a LE atrás da LPC` : ""}`
              : "Cobertura de LE e LPC por OP"}
          </p>
        </div>
        {aberto ? <ChevronUp size={18} className="text-torg-gray" /> : <ChevronDown size={18} className="text-torg-gray" />}
      </button>

      {aberto && (
        <div className="px-5 pb-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-[12px]">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-torg-dark">
              <input type="checkbox" checked={soFaltantes} onChange={(e) => setSoFaltantes(e.target.checked)} className="rounded border-gray-300" />
              Só as que faltam
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-torg-dark">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="rounded border-gray-300" />
              Incluir encerradas/canceladas
            </label>
            <button onClick={() => carregar(todas)} disabled={carregando} className="inline-flex items-center gap-1 text-torg-blue hover:underline disabled:opacity-50">
              {carregando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
            </button>
          </div>

          {/* ⚠⚠ O AVISO NÃO MANDA REIMPORTAR. Vitor (02/09/2026): "vale a pena olharmos com cuidado
              antes de sairmos incluindo novas listas, deixa bem claro isso, pois a sua informação
              estava nos fazendo errar".
              A tela dizia "falta lista" e a leitura natural era reimportar — foi assim que a OP-113
              perdeu 76 marcas e o cliente recebeu o aviso. Agora ela diz o FATO e nomeia o conserto
              certo de cada caso, que quase nunca é reimportar. */}
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
            <p className="font-semibold mb-1">Confira o arquivo antes de reimportar.</p>
            <ul className="space-y-0.5 text-amber-800">
              <li><b>solta</b> — a lista existe, só não está vinculada à OP. Reimportar não resolve; o conserto é ligar o vínculo.</li>
              <li><b>LE atrás da LPC</b> — a LE não tem marcas que a LPC tem. Confira se a revisão na pasta é mais nova antes de trazer.</li>
              <li><b>sem lista</b> — aí sim é importar. Confira que o arquivo é a revisão corrente e está completo.</li>
            </ul>
            <p className="mt-1.5 text-amber-800">Reimportar substitui a lista inteira pelo que estiver no arquivo — e o portal do cliente registra a diferença.</p>
          </div>

          {erro && <p className="text-[13px] text-red-600">Não consegui carregar: {erro}</p>}

          {!erro && carregando && !dados && (
            <p className="text-[13px] text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
          )}

          {!erro && dados && visiveis.length === 0 && (
            <p className="text-[13px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
              {soFaltantes ? "Todas as obras listadas têm LE e LPC. 🎉" : "Nenhuma obra encontrada."}
            </p>
          )}

          {!erro && dados && visiveis.length > 0 && (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-left text-torg-gray border-b border-gray-100">
                    <th className="py-2 pr-3 font-semibold">OP</th>
                    <th className="py-2 pr-3 font-semibold">Obra / Cliente</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Status</th>
                    <th className="py-2 pr-3 font-semibold text-center">LPC</th>
                    <th className="py-2 pr-3 font-semibold text-center">LE</th>
                    <th className="py-2 font-semibold text-center whitespace-nowrap" title="Toda marca da LPC que não é croqui tem de estar na LE. O que a LE tem a mais são os acessórios — sobrar é esperado, faltar não.">LE cobre a LPC?</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 font-bold text-torg-dark whitespace-nowrap">{l.numero}</td>
                      <td className="py-2 pr-3">
                        <div className="text-torg-dark truncate max-w-[260px]">{l.obra || "—"}</div>
                        <div className="text-[11px] text-torg-gray truncate max-w-[260px]">{l.cliente}</div>
                      </td>
                      <td className="py-2 pr-3 text-torg-gray whitespace-nowrap">{STATUS_LABEL[l.status] || l.status}</td>
                      <td className="py-2 pr-3 text-center"><Marca tem={l.temLPC} n={l.nLPC} solta={l.soltaLPC} /></td>
                      <td className="py-2 pr-3 text-center">
                        <Marca tem={l.temLE} n={l.nLE} solta={l.soltaLE} />
                        {/* o arquivo costuma JA ESTAR no servidor — o que falta e carregar */}
                        {ehAdmin && !l.temLE && (
                          <button onClick={() => verNoServidor(l.numero)} disabled={puxando === l.numero}
                            className="block mx-auto mt-1 text-[11px] text-torg-blue hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                            {puxando === l.numero ? <Loader2 size={11} className="animate-spin" /> : <DownloadCloud size={11} />}
                            buscar no servidor
                          </button>
                        )}
                      </td>
                      {/* ⚠ o fato, sem receita: quantas marcas da LPC a LE não tem. O que fazer
                          depende da revisão que está na pasta, e isso a tela não sabe. */}
                      <td className="py-2 text-center">
                        {!l.temLPC || !l.temLE ? (
                          <span className="text-torg-gray-light text-[12px]">—</span>
                        ) : l.faltamNaLE > 0 ? (
                          <span title="Marcas da LPC (fora croqui) que a LE não tem. Confira a revisão na pasta antes de reimportar."
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[12px] font-semibold">
                            {l.faltamNaLE} faltando
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[12px] font-semibold">
                            <Check size={13} /> cobre
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {escolher && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setEscolher(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-10">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-torg-dark">LE da OP-{escolher.numero} no servidor</p>
              <p className="text-[11px] text-torg-gray mt-0.5">O mais recente primeiro. Carregar usa o mesmo import do upload.</p>
            </div>
            <div className="px-4 py-3 space-y-1 max-h-[50vh] overflow-y-auto">
              {escolher.arquivos.map((a) => (
                <button key={a.id} onClick={() => importarDoServidor(escolher.numero, a)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-torg-blue-50 border border-gray-100">
                  <p className="text-[12.5px] font-medium text-torg-dark">{a.nome}</p>
                  <p className="text-[11px] text-torg-gray">
                    {new Date(a.modificadoEm).toLocaleDateString("pt-BR")} · {Math.round(a.tamanho / 1024)} kB
                  </p>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 text-right">
              <button onClick={() => setEscolher(null)} className="text-[12px] text-torg-gray hover:text-torg-dark">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
