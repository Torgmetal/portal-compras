"use client";
import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { CAMADAS_TINTA, ESTRUTURA_ROTULO, FATURAMENTO, FATURAMENTO_ROTULO, coefSugerido, custoCamada, perdaDaEstrutura, rendimentoTinta } from "@/lib/lqc";
import { CotacaoTinta } from "./CotacaoTinta";
import { Campo, Inp, Quadro, Sel } from "./campos";
import { fmtKg, fmtR$, num } from "../_lib/formatos";
import { EscopoDePintura } from "./EscopoDePintura";
import { LeituraDoSistema } from "./LeituraDoSistema";

/**
 * PINTURA — tudo de tinta num lugar só.
 *
 * ⚠ ESTAVA ESPALHADO EM TRÊS ABAS. Vitor (23/08/2026): "falamos de pintura em uma área, você joga
 * para outra nada a ver para preencher o custo". Era verdade: a área pintada ficava no
 * quantitativo, a tinta na MC_TINTAS e o preço da mão de obra na industrialização. A planilha
 * organiza assim porque as fórmulas dela precisam; quem monta o custo, não.
 */
export function Pintura({ c, res, setComp, estudoId }) {
  const t = Array.isArray(c.tintas) ? c.tintas : [];
  // ─── LEVANTAMENTO DE PINTURA ANEXADO ────────────────────────────────────────────────────────
  // Vitor (31/08/2026): "na parte da pintura nessa página preciso da opção para que seja possível
  // subir um PDF ou planilha com as informações de pintura".
  //
  // ⚠ ANEXO É PROVA, NÃO CÁLCULO. O que o cliente manda (esquema do fabricante da tinta, memorial
  // de pintura, planilha de áreas) fica guardado ao lado das camadas para consulta e para a
  // proposta — quem calcula continuam sendo os campos abaixo. Ler o PDF e mexer no preço sozinho
  // seria adivinhar em cima do que o cliente escreveu.
  //
  // ⚠⚠ SOBE DIRETO PARA O BLOB (client token). Memorial de pintura passa fácil de 4,5 MB, que é o
  // teto do corpo de uma função serverless — pelo caminho normal ele falharia sem dizer por quê.
  const anexos = Array.isArray(c.pinturaAnexos) ? c.pinturaAnexos : [];
  const [subindo, setSubindo] = useState(false);
  const [leitura, setLeitura] = useState(null);   // o que foi lido da planilha, à espera do OK
  const refArquivo = useRef(null);

  // ⚠⚠ ANEXAR E LER SÃO A MESMA AÇÃO. Vitor (31/08/2026): "tentei importar um plano de pintura na
  // proposta 290 e não reconheceu". Ele estava certo: eu tinha entregado só o anexo, guardando o
  // arquivo sem abrir, quando o pedido era "importar o sistema de pintura para que seja avaliado
  // qual o tipo de tinta e qual a quantidade". Agora a planilha é lida na hora.
  //
  // ⚠ O ARQUIVO CONTINUA GUARDADO mesmo quando a leitura falha — é o documento do cliente, e vale
  // como prova do que foi especificado, independentemente de eu conseguir interpretá-lo.
  //
  // ⚠ E NÃO SOBRESCREVE SEM PERGUNTAR: as camadas já preenchidas são trabalho de alguém. A tela
  // mostra o que leu e só aplica com confirmação.
  async function anexar(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length) return;
    setSubindo(true);
    const novos = [];
    try {
      const { upload } = await import("@vercel/blob/client");
      for (const file of files) {
        const seguro = file.name.replace(/[^\w.\- ]+/g, "_");
        const blob = await upload(`estudos-pintura/${Date.now()}-${seguro}`, file, {
          access: "public", handleUploadUrl: "/api/comercial/estudos/upload-token",
        });
        novos.push({ nome: file.name, url: blob.url, tamanho: file.size, em: new Date().toISOString() });
      }
      setComp({ pinturaAnexos: [...anexos, ...novos] });

      // tenta LER a especificação da primeira planilha do lote
      const planilha = files.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (planilha) await lerEspec(planilha);
    } catch (e) { alert("Falha ao anexar: " + e.message); } finally { setSubindo(false); }
  }

  async function lerEspec(file) {
    try {
      const [XLSX, { lerEspecificacaoPintura }] = await Promise.all([
        import("xlsx"), import("@/lib/pintura-especificacao"),
      ]);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grade = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const lido = lerEspecificacaoPintura(grade);
      if (!lido.camadas.length) {
        alert(
          "Anexei o arquivo, mas não reconheci o sistema de pintura nele.\n\n" +
          lido.avisos.join("\n") +
          "\n\nEle continua guardado — preencha as camadas à mão, ou me mande o formato para eu ensinar a ler."
        );
        return;
      }
      setLeitura(lido);
    } catch (e) {
      alert("Anexei o arquivo, mas não consegui abrir a planilha: " + e.message);
    }
  }

  function aplicarLeitura() {
    const lido = leitura;
    if (!lido) return;
    const corAcab = lido.cores?.[0]?.cor || "";
    const novas = lido.camadas.map((cm, i) => ({
      ...(t[i] || {}),
      camada: cm.camada,
      produto: cm.produto || t[i]?.produto || "",
      peliculaSeca: cm.peliculaSeca ?? t[i]?.peliculaSeca ?? null,
      solidos: cm.solidos ?? t[i]?.solidos ?? null,
      // ⚠ CINZA EMBAIXO, COR DO CLIENTE EM CIMA. Vitor (31/08/2026): "primer e intermediário é
      // melhor considerar sempre cinza". Só o acabamento puxa a cor da §2 da planilha.
      cor: cm.camada === "ACABAMENTO" ? (cm.cor || corAcab) : (cm.cor || "Cinza"),
      perda: t[i]?.perda ?? 45,
      nome: (t[i]?.perda ?? 45) === 85 ? "ESTRUTURA — FATOR DE PERDA: 85%" : "ESTRUTURA — FATOR DE PERDA: 45%",
    }));
    // camadas que já existiam além das lidas continuam onde estão
    setComp({ tintas: [...novas, ...t.slice(novas.length)], pinturaFabricante: lido.fabricante || null });
    setLeitura(null);
  }

  const remover = (i) => {
    if (!confirm("Remover este anexo do estudo?")) return;
    setComp({ pinturaAnexos: anexos.filter((_, j) => j !== i) });
  };
  const linha = (i) => t[i] || {};
  const set = (i, campo, v) => {
    const novo = [...t];
    for (let k = 0; k <= i; k++) if (!novo[k]) novo[k] = {};
    const perda = linha(i).perda ?? (i === 0 ? 45 : 85);
    novo[i] = { ...linha(i), [campo]: v, perda,
      nome: perda === 85 ? "ESTRUTURA — FATOR DE PERDA: 85%" : "ESTRUTURA — FATOR DE PERDA: 45%" };
    setComp({ tintas: novo });
  };

  return (
    <div className="space-y-4">
      <CotacaoTinta estudoId={estudoId} c={c} res={res} />
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        {/* ─── O QUE VAI SER PINTADO ──────────────────────────────────────────────────────────
            Vitor (31/08/2026): "na aba pintura precisa vir o resumo da aba quantitativo e deixar
            separado o total de cada área e a soma de todas; as cores de cada área também é
            importante".

            ⚠ A COR É O QUE DECIDE A DEMÃO DE ACABAMENTO, e ela era escolhida numa aba e usada em
            outra sem nunca aparecer junto do cálculo. Quem monta a pintura precisa ver, na mesma
            tela, que a passarela é RAL 7035 e o guarda-corpo é amarelo — senão precifica uma cor
            só e a obra recebe duas.

            ⚠⚠ AS MESMAS REGRAS DO MOTOR, e não uma segunda conta: peso é `pesoTotal ?? fórmula`,
            área é `areaM2 informada ?? coeficiente × peso`, perda é a da estrutura (85% em guarda-
            corpo e escada marinheiro, 45% no resto). Uma tabela-resumo que calcula por conta
            própria vira a terceira versão da verdade. */}
        {(() => {
          const linhas = (Array.isArray(c.resumos) ? c.resumos : []).filter((l) => l.ativo !== false);
          if (!linhas.length) return null;
          const daLinha = (l) => {
            const kg = num(l.pesoTotal) > 0 ? num(l.pesoTotal) : num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
            const m2 = num(l.areaM2) > 0 ? num(l.areaM2) : (num(l.coef) > 0 ? num(l.coef) : coefSugerido(l.perfil)) * kg;
            return { kg, m2, informada: num(l.areaM2) > 0, perda: perdaDaEstrutura(l.estrutura) };
          };
          const tot = linhas.reduce((a2, l) => { const d = daLinha(l); return { kg: a2.kg + d.kg, m2: a2.m2 + d.m2 }; }, { kg: 0, m2: 0 });
          return (
            <div className="mb-3 border border-gray-100 rounded-lg overflow-hidden">
              <p className="text-[12px] font-bold text-torg-dark px-3 py-2 bg-gray-50">
                O que vai ser pintado <span className="font-normal text-torg-gray">· vem do Quantitativo</span>
              </p>
              <table className="w-full text-[12px]">
                <thead className="text-[10px] uppercase text-torg-gray">
                  <tr>
                    <th className="text-left px-3 py-1.5">Área</th>
                    <th className="text-left px-2 py-1.5">Cor</th>
                    <th className="text-right px-2 py-1.5">Peso</th>
                    <th className="text-right px-2 py-1.5">Área (m²)</th>
                    <th className="text-right px-3 py-1.5">Perda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {linhas.map((l, i) => {
                    const d = daLinha(l);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-1">
                          <span className="font-mono text-[11px] text-torg-blue mr-1">{l.item || `1.${i + 1}`}</span>
                          {l.area || "—"}
                          {l.estrutura && <span className="text-torg-gray"> · {ESTRUTURA_ROTULO[l.estrutura] || l.estrutura}</span>}
                        </td>
                        <td className="px-2 py-1">
                          {l.cor
                            ? <span className="text-[11px] rounded px-1.5 py-0.5 bg-white border border-gray-200 text-torg-dark">{l.cor}</span>
                            : <span className="text-[11px] text-torg-orange-700">sem cor definida</span>}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(d.kg)}</td>
                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                          {Math.round(d.m2).toLocaleString("pt-BR")}
                          {!d.informada && <span className="text-[10px] text-torg-gray"> est.</span>}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">
                          <span className={d.perda === 85 ? "text-torg-orange-700 font-semibold" : "text-torg-gray"}>{d.perda}%</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-1.5">Total · {linhas.length} {linhas.length === 1 ? "área" : "áreas"}</td>
                    <td className="px-2 py-1.5 font-normal text-[11px] text-torg-gray">
                      {[...new Set(linhas.map((l) => l.cor).filter(Boolean))].join(" · ") || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(tot.kg)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Math.round(tot.m2).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-1.5" />
                  </tr>
                </tbody>
              </table>
              {linhas.some((l) => !l.cor) && (
                <p className="px-3 py-1.5 text-[11px] text-torg-orange-700 bg-[#FFF8F0]">
                  Área sem cor não recebe demão de acabamento no cálculo — defina a cor no Quantitativo.
                </p>
              )}
            </div>
          );
        })()}

        {/* ⚠ VEIO DA ABA MATERIAL (31/08/2026). Vitor: "tire essa opção da tinta [do Material], pois
            vamos tratar disso em outra aba". Quem fatura a tinta é decisão de pintura — aqui ela
            fica ao lado das camadas que definem quanto de tinta a obra leva. É o MESMO campo
            (`faturamento.tintas`): mudou de tela, não de valor. */}
        <label className="block text-[11px] font-semibold text-torg-dark mb-3">Quem fatura a tinta
          <Sel value={c.faturamento?.tintas || ""}
            onChange={(ev) => setComp({ faturamento: { ...(c.faturamento || {}), tintas: ev.target.value } })}
            opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="block mt-1 w-52" />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[12px] font-semibold text-torg-dark">Levantamento de pintura</p>
            <p className="text-[11px] text-torg-gray">
              Esquema do fabricante, memorial ou planilha de áreas — fica guardado aqui para consulta.
              Não altera o cálculo abaixo.
            </p>
          </div>
          <input ref={refArquivo} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
            className="hidden" onChange={anexar} />
          <button type="button" onClick={() => refArquivo.current?.click()} disabled={subindo}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {subindo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {subindo ? "Enviando…" : "Anexar PDF ou planilha"}
          </button>
        </div>
        {/* ⚠ O QUE FOI LIDO APARECE ANTES DE VALER. Aplicar direto sobrescreveria camadas que
            alguém preencheu à mão — e numa planilha do cliente, um campo mal lido vira preço
            errado sem ninguém ver. Aqui ele confere as três demãos e decide. */}
        {leitura && (
          <LeituraDoSistema
            aplicarLeitura={aplicarLeitura}
            leitura={leitura}
            setLeitura={setLeitura}
          />
        )}

        {anexos.length > 0 && (
          <div className="mb-3 divide-y divide-gray-50 border border-gray-100 rounded-lg">
            {anexos.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <FileSpreadsheet size={13} className="text-torg-gray shrink-0" />
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[12px] text-torg-blue hover:underline">{a.nome}</a>
                <span className="text-[11px] text-torg-gray whitespace-nowrap">
                  {(Number(a.tamanho || 0) / 1048576).toFixed(1)} MB
                </span>
                <button onClick={() => remover(i)} title="remover" className="text-gray-300 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-[12px] text-torg-dark">
            Área a pintar: <strong className="tabular-nums whitespace-nowrap">{Number(res.areaM2 || 0).toLocaleString("pt-BR")} m²</strong>
          </p>
          <p className="text-[12px] text-torg-dark">
            Demãos: <strong>{res.demaos || 1}</strong> <span className="text-torg-gray">(uma por camada preenchida abaixo)</span>
          </p>
        </div>
        <p className="text-[11px] text-torg-gray mt-1">
          A área vem do quantitativo — informada por linha, ou estimada pelo perfil. Para mudá-la,
          é lá que se mexe.
        </p>
      </div>

      {/* ⚠ as camadas vêm do estudo (produto, cor, sólidos, película): projeto define, custo não.
          Importando a LQC, elas chegam prontas — inclusive um acabamento por cor da obra. */}
      {Array.from({ length: Math.max(2, t.length) }, (_, i) => i).map((i) => {
        const cam = { ...linha(i), perda: linha(i).perda ?? (i === 0 ? 45 : 85) };
        const areaCamada = num(cam.areaM2) > 0 ? num(cam.areaM2) : (res?.areaM2 || 0);
        const rend = rendimentoTinta(cam);
        const calc = custoCamada(cam, areaCamada);
        const pesoTinta = num(cam.pesoKg) > 0 ? num(cam.pesoKg) : (res?.pesoTotal || 0);
        return (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-[12px] font-bold text-torg-dark mb-1">
              {cam.camada ? `${cam.camada.charAt(0) + cam.camada.slice(1).toLowerCase()}` : `Camada ${i + 1}`}
              {cam.cor ? <span className="text-torg-gray"> · {cam.cor}</span> : null}
            </p>
            <p className="text-[11px] text-torg-gray mb-3">
              Perda {cam.perda}% — {cam.perda === 85 ? "guarda-corpo e escada marinheiro" : "estrutura em geral"}; vem da área, não se escolhe.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Campo r="Camada"><Sel value={cam.camada || ""} onChange={(e) => set(i, "camada", e.target.value)} opcoes={CAMADAS_TINTA} className="w-full" /></Campo>
              {[["produto", "Produto", ""], ["cor", "Cor", ""], ["solidos", "Sólidos por volume (%)", ""],
                ["peliculaSeca", "Película seca (µm)", ""], ["precoLitro", "Preço por litro (R$)", ""],
                ["areaM2", "Área desta camada (m²)", "vazio usa a área da obra"],
                ["precoKg", "Custo (R$/kg)", "vazio calcula pelo rendimento"]].map(([k, r, ajuda]) => (
                <Campo key={k} r={r} ajuda={ajuda}>
                  <Inp value={linha(i)[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} className="w-full text-right" /></Campo>
              ))}
            </div>
            {/* ⚠ os passos aparecem para o número poder ser conferido: rendimento errado é o tipo de
                engano que só se descobre quando a tinta acaba no meio da obra. */}
            {rend.teorico > 0 && (
              <p className="text-[11px] text-torg-gray mt-3 pt-3 border-t border-gray-100">
                Rendimento teórico <strong className="text-torg-dark">{rend.teorico} m²/L</strong>
                {" "}({cam.solidos}% × 10 ÷ {cam.peliculaSeca} µm) · com {i === 0 ? 45 : 85}% de perda,
                prático <strong className="text-torg-dark">{rend.pratico} m²/L</strong> ·
                {" "}<strong className="text-torg-dark">{Number(areaCamada).toLocaleString("pt-BR")} m²</strong> pedem
                {" "}<strong className="text-torg-dark">{Number(calc.litros).toLocaleString("pt-BR")} L</strong>
                {cam.precoLitro ? <> = <strong className="text-torg-dark">{fmtR$(calc.total)}</strong>{pesoTinta > 0 ? <> ({fmtR$(calc.total / pesoTinta)}/kg)</> : null}</> : null}
              </p>
            )}
          </div>
        );
      })}

      {/* ⚠ A TINTA POR ÁREA, que é como a obra é comprada e aplicada. Vitor (23/08/2026): "trazer
          as áreas de pintura mencionadas na primeira parte e trazer a quantidade de tinta que
          vamos usar em cada área". Quem compra tinta compra por cor e por trecho, não um número
          único da obra — e é aqui que se vê que o guarda-corpo, com 8% da área, leva 25% da tinta. */}
      {res.pinturaPorArea?.length > 0 && (
        <EscopoDePintura
          res={res}
        />
      )}

      <Quadro titulo="Tinta (material)" grupo={res.grupos?.tintas} vazio="Preencha uma camada acima." />
      <button onClick={() => setComp({ tintas: [...t, { perda: 45, camada: "" }] })}
        className="text-[12px] font-semibold text-torg-blue border border-dashed border-torg-blue/40 rounded-xl px-4 py-2 w-full hover:bg-torg-blue-50 inline-flex items-center justify-center gap-1.5">
        <Plus size={14} /> Acrescentar camada
      </button>

      <Quadro titulo={`Mão de obra de pintura — ${res.demaos || 1} ${res.demaos === 1 ? "demão" : "demãos"}`}
        grupo={res.grupos?.pintura} vazio="Lance a classificação nas linhas do quantitativo." />
    </div>
  );
}
