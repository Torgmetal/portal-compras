"use client";
import { useState } from "react";
import { ChevronDown, FileSpreadsheet, Loader2, Plus, Trash2 } from "lucide-react";
import { CLASSES, ESTRUTURA_ROTULO, METODOS, METODO_ROTULO, PERFIS, coefSugerido } from "@/lib/lqc";
import { Bloco, Campo, Inp, Sel } from "./campos";
import { fmtKg, fmtR$, num } from "../_lib/formatos";
import { TipoEstrutura } from "./TipoEstrutura";
import styles from "../Lqc.module.css";

/** Um elemento do quantitativo, com a consequência de cada escolha à vista. */
export function CartaoLinha({ l, i, set, del, dup, porArea, cores, doEsquema, onImportarPeso, importando, tiposEstrutura, onTipoEstrutura }) {
  const [aberto, setAberto] = useState(i === 0 || !l.area);
  const dentro = l.ativo !== false;
  const custo = (porArea || []).find((x) => x.area === (l.area || l.item));
  // null = ainda não há esquema de acabamento para comparar
  const norma = (x) => String(x || "").trim().toUpperCase();
  const corCasa = !doEsquema?.length ? null : !l.cor ? null : doEsquema.some((x) => norma(x) === norma(l.cor));
  const classe = CLASSES.find((x) => x.nome.toUpperCase() === String(l.classificacao || "").toUpperCase());
  const perfil = PERFIS.find((p) => p.nome === l.perfil);
  // ⚠⚠ MESMA REGRA DO MOTOR, E ANTES NÃO ERA. `lib/lqc.js` calcula
  // `pesoTotal ?? quantidade × unidades × pesoUnit` — o peso lançado manda, a fórmula é o plano B.
  // A tela usava SÓ a fórmula, então card e cabeçalho podiam brigar: na LQC-290-26 a primeira área
  // tem pesoTotal 90.216 kg e quantidade 1000 × unidades 18 gravadas do import, o que dava
  // 1.623.888.000 kg no card contra 541.298 kg no topo. Três mil vezes de diferença na mesma tela.
  const pesoFormula = num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
  const peso = num(l.pesoTotal) > 0 ? num(l.pesoTotal) : pesoFormula;
  const porProjeto = String(l.metodo || "").toUpperCase() === "PESO DE PROJETO";
  const custoMat = perfil ? peso * perfil.preco : 0;
  const custoFab = classe ? peso * classe.fabricacao : 0;
  // a unidade do peso unitário SEGUE a unidade de medida — é o que evita lançar kg/m num item "unid"
  const unPeso = l.un === "m" ? "kg/m" : l.un === "m²" ? "kg/m²" : "kg/un";

  return (
    <details open={aberto} onToggle={(ev) => setAberto(ev.currentTarget.open)} className={`${styles.area} ${!dentro ? styles.fora : ""}`}>
      <summary className={styles.areaCabecalho}>
        <span className={styles.numero}>{l.item || `1.${i + 1}`}</span>
        <span className={styles.areaIdentidade}>
          <strong>{l.area || "Nova área"}</strong>
          <span>{[l.estruturaNome || ESTRUTURA_ROTULO[l.estrutura] || l.estrutura, l.elemento].filter(Boolean).join(" · ") || "Preencha a identificação e o peso da estrutura"}</span>
        </span>
        {l.cor && <span className={`text-[11px] ${corCasa === false ? "text-orange-700" : "text-torg-gray"}`}>
          {l.cor}{corCasa === false ? " · sem acabamento" : ""}
        </span>}
        <span className={styles.areaPeso}>{fmtKg(peso)}{!dentro && <small>fora do escopo</small>}</span>
        <ChevronDown size={18} className={styles.seta} />
      </summary>
      <div className={styles.areaCorpo}>
        <div className={styles.areaAcoes}>
          <label className="inline-flex items-center gap-2 text-xs text-torg-gray">
            <input type="checkbox" checked={dentro} onChange={(e) => set(i, "ativo", e.target.checked)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            Incluir esta área no escopo
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => dup(i)} title="duplicar" className={styles.acaoArea}><Plus size={14} /> Duplicar</button>
            <button type="button" onClick={() => del(i)} title="remover" className={styles.acaoArea}><Trash2 size={14} /> Remover</button>
          </div>
        </div>

        <Bloco titulo="Onde fica">
          <Campo r="Item" ajuda="numeração da proposta">
            <Inp value={l.item || ""} onChange={(ev) => set(i, "item", ev.target.value)} className="w-full" /></Campo>
          <Campo r="Área" ajuda="galpão, prédio, trecho">
            <Inp value={l.area || ""} onChange={(ev) => set(i, "area", ev.target.value)} className="w-full" /></Campo>
          <TipoEstrutura linha={l} tipos={tiposEstrutura} onEscolher={(tipo, novo) => onTipoEstrutura(i, tipo, novo)}/>
          <Campo r="Elemento" ajuda="tesoura, terça, pilar…">
            <Inp value={l.elemento || ""} onChange={(ev) => set(i, "elemento", ev.target.value)} className="w-full" /></Campo>
        </Bloco>

        {/* ⚠ O MÉTODO MANDA NO QUE APARECE. Vitor (31/08/2026): "Método manter como está com as
            duas categorias, e ao lado ter um botão para importarmos uma planilha onde terá o peso
            da área; quando for estimativa, manter os campos que já temos para preencher o peso".
            Mostrar os cinco campos sempre era o que mais confundia: em PESO DE PROJETO o peso vem
            pronto da lista, e Quantidade/Unidades/Peso unitário são ruído — pior, ficam gravados e
            brigam com o peso lançado. */}
        {/* ─── MODULAÇÃO ────────────────────────────────────────────────────────────────────────
            Vitor (31/08/2026): "criar campos para preenchermos as modulações que pede na nossa
            proposta — comprimento, altura, largura, descrição do que seria a estrutura — e deixar a
            opção para assinalar se queremos ou não que apareça na proposta".

            ⚠ NÃO ENTRA NO CÁLCULO. Modulação é descrição do que está sendo vendido, não medida de
            peso: quem dá o peso é o bloco abaixo. Se entrasse na conta, um galpão descrito como
            30 × 12 × 8 viraria volume e brigaria com o levantamento.

            ⚠⚠ O CHECKBOX É POR ÁREA, e não uma chave geral. Numa proposta com galpão e mezanino, o
            cliente quer ver a modulação do galpão e não a do corrimão — decidir isso uma vez para a
            proposta inteira obrigaria a apagar o que não deve sair. */}
        <Bloco titulo="Modulação" nota="vai para a descrição da proposta — não entra no cálculo de peso">
          <Campo r="Comprimento (m)">
            <Inp value={l.modComprimento ?? ""} onChange={(ev) => set(i, "modComprimento", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Largura (m)">
            <Inp value={l.modLargura ?? ""} onChange={(ev) => set(i, "modLargura", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Altura (m)">
            <Inp value={l.modAltura ?? ""} onChange={(ev) => set(i, "modAltura", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Descrição da estrutura" ajuda="como o cliente lê na proposta">
            <Inp value={l.modDescricao ?? ""} onChange={(ev) => set(i, "modDescricao", ev.target.value)}
              placeholder="ex.: galpão em pórticos treliçados" className="w-full" /></Campo>
          <Campo r="Na proposta">
            <label className="flex items-center gap-2 text-[12px] text-torg-dark border border-gray-200 rounded px-2 py-1 bg-white">
              <input type="checkbox" checked={l.modNaProposta === true}
                onChange={(ev) => set(i, "modNaProposta", ev.target.checked)}
                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
              mostrar
            </label>
          </Campo>
          {l.modNaProposta && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-5">
              <p className="text-[11px] text-torg-gray">
                Sai na proposta como:{" "}
                <strong className="text-torg-dark">
                  {[l.modDescricao, [l.modComprimento, l.modLargura, l.modAltura].filter(Boolean).join(" × ") &&
                    `${[l.modComprimento, l.modLargura, l.modAltura].filter(Boolean).join(" × ")} m`]
                    .filter(Boolean).join(" — ") || "preencha a descrição e as medidas"}
                </strong>
              </p>
            </div>
          )}
        </Bloco>

        <Bloco titulo="Como se mede"
          nota={porProjeto ? "o peso vem da lista de projeto" : "Quantidade × Unidades × Peso unitário = peso do elemento"}>
          <Campo r="Método">
            <Sel value={l.metodo || ""} onChange={(ev) => set(i, "metodo", ev.target.value)} opcoes={METODOS} rotulos={METODO_ROTULO} className="w-full" /></Campo>

          {porProjeto ? (
            <>
              <Campo r="Peso da área (kg)" ajuda="o peso levantado no projeto">
                <Inp value={l.pesoTotal ?? ""} onChange={(ev) => set(i, "pesoTotal", ev.target.value)} className="w-full text-right" /></Campo>
              <Campo r="Importar" ajuda="planilha com o peso desta área">
                <button type="button" onClick={() => onImportarPeso?.(i)} disabled={importando}
                  className="w-full border border-torg-blue-200 text-torg-blue rounded px-2 py-1 text-[12px] font-medium hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {importando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Importar planilha
                </button>
              </Campo>
            </>
          ) : (
            <>
              <Campo r="Unidade de medida" ajuda="define o peso unitário abaixo">
                <Sel value={l.un || ""} onChange={(ev) => set(i, "un", ev.target.value)} opcoes={["m", "m²", "unid"]} className="w-full" /></Campo>
              <Campo r="Quantidade" ajuda={l.un === "unid" ? "quantas peças" : `quantos ${l.un || "m"}`}>
                <Inp value={l.quantidade ?? ""} onChange={(ev) => set(i, "quantidade", ev.target.value)} className="w-full text-right" /></Campo>
              <Campo r="Unidades" ajuda="repetições iguais (ex.: 12 pórticos)">
                <Inp value={l.unidades ?? ""} onChange={(ev) => set(i, "unidades", ev.target.value)} className="w-full text-right" /></Campo>
              <Campo r={`Peso unitário (${unPeso})`} ajuda="peso de cada unidade de medida">
                <Inp value={l.pesoUnit ?? ""} onChange={(ev) => set(i, "pesoUnit", ev.target.value)} className="w-full text-right" /></Campo>
            </>
          )}

          {/* ⚠ QUANDO OS DOIS PESOS DIVERGEM, A TELA DIZ. É o que faltava para o número do card
              casar com o do cabeçalho sem ninguém precisar desconfiar. */}
          {!porProjeto && num(l.pesoTotal) > 0 && Math.abs(num(l.pesoTotal) - pesoFormula) > 1 && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-5">
              <p className="text-[11px] text-torg-orange-700">
                Vale o peso lançado: <strong>{fmtKg(num(l.pesoTotal))}</strong>. A conta dos campos
                acima daria {fmtKg(pesoFormula)} — confira qual está certo.
              </p>
            </div>
          )}
        </Bloco>

        {/* ⚠ ÁREA INFORMADA MANDA. Vitor (23/08/2026): "deixar o campo para preencher caso
            tenhamos essa informação da área de pintura, ou veja se conseguimos fazer uma
            estimativa de área de acordo com o peso". As duas coisas, nesta ordem: quando existe
            medição, ela vence; o coeficiente é o plano B, e a tela diz qual dos dois está valendo. */}
        {/* ⚠ SEM PREÇO AQUI. Vitor (31/08/2026): "no campo de área de pintura tirar a formação do
            preço, vamos formar preço na aba de pintura". O que fica é a MEDIDA — quantos m² esta
            área tem — porque é dela que a aba de Pintura parte. Misturar medida e preço na mesma
            caixa era metade da confusão desta tela. */}
        <Bloco titulo="Área de pintura" nota="quantos m² esta área tem — o preço se forma na aba Pintura">
          <Campo r="Área informada (m²)" ajuda="tem o levantamento? preencha e o resto é ignorado">
            <Inp value={l.areaM2 ?? ""} onChange={(ev) => set(i, "areaM2", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Coeficiente (m²/kg)" ajuda={`vazio usa ${coefSugerido(l.perfil).toFixed(4)} — média das nossas obras neste perfil`}>
            <Inp value={l.coef ?? ""} onChange={(ev) => set(i, "coef", ev.target.value)} className="w-full text-right" /></Campo>
          <div className="col-span-2 sm:col-span-3 lg:col-span-3 flex items-end">
            <p className="text-[11px] text-torg-gray">
              {num(l.areaM2) > 0
                ? <>Usando a área informada: <strong className="text-torg-dark">{Number(num(l.areaM2)).toLocaleString("pt-BR")} m²</strong>.</>
                : peso > 0
                  ? <>Estimando <strong className="text-torg-dark">{Math.round(peso * (num(l.coef) || coefSugerido(l.perfil))).toLocaleString("pt-BR")} m²</strong>{" "}
                      ({(num(l.coef) || coefSugerido(l.perfil)).toFixed(4)} m²/kg × peso){num(l.coef) > 0 ? "" : " — coeficiente sugerido, confira"}.</>
                  : "Lance o peso para estimar a área."}
            </p>
          </div>
        </Bloco>

        {/* ⚠ O R$/kg DO AÇO SAIU DAQUI (31/08/2026). Vitor: "Preço e acabamento dessa área, tirar o
            preço". Esta aba passa a responder só QUANTO e ONDE; o preço do aço se forma na aba
            Material, junto do resto do que se compra.
            ⚠⚠ O VALOR NÃO FOI APAGADO. `precoKg` continua gravado e o motor continua lendo — estudo
            antigo não perde o preço por área que alguém cotou. O que sai é o campo desta tela. */}
        <Bloco titulo="Acabamento desta área" nota="a cor que este trecho recebe">
          <Campo r="Cor da estrutura"
            ajuda={corCasa === false ? "⚠ não há acabamento nesta cor — esta área fica sem a demão final"
              : corCasa === true ? "recebe o acabamento desta cor" : "define qual acabamento vai nesta área"}>
            <>
              <Inp value={l.cor ?? ""} list={`cores-${i}`} onChange={(ev) => set(i, "cor", ev.target.value)}
                className={`w-full ${corCasa === false ? "border-torg-orange-700" : ""}`} />
              <datalist id={`cores-${i}`}>
                {(cores || []).map((x) => <option key={x} value={x} />)}
              </datalist>
            </>
          </Campo>
          {num(l.precoKg) > 0 && (
            <div className="col-span-2 sm:col-span-2 lg:col-span-4 flex items-end">
              <p className="text-[11px] text-torg-gray">
                Esta área tem R$/kg cotado ({fmtR$(num(l.precoKg))}/kg) vindo de antes — segue valendo no cálculo.
              </p>
            </div>
          )}
        </Bloco>

        <Bloco titulo="De que é feito" nota="opcional — para quem orça por categoria de perfil">
          <Campo r="Classificação" ajuda={classe ? `${classe.faixa} · fabricação ${fmtR$(classe.fabricacao)}/kg` : "faixa de peso por metro do perfil"}>
            {/* ⚠⚠ CLASSE QUE VEIO DA PLANILHA E NÃO EXISTE AQUI FICAVA INVISÍVEL. Auditoria de
                05/09/2026: a LQC-186 tem 7 linhas como "ESPECIAL"; o `select` não achava a opção,
                mostrava em branco, e a pessoa via um campo vazio que na verdade tinha valor — 38 t
                fora do frete e da cadência sem nada na tela. Agora o valor estranho aparece,
                marcado, até alguém escolher a classe certa. */}
            <select value={l.classificacao || ""} onChange={(ev) => set(i, "classificacao", ev.target.value)}
              className={`border rounded px-2 py-1 text-[12px] bg-white w-full ${l.classificacao && !classe ? "border-torg-orange-400 text-torg-orange-700" : "border-gray-200"}`}>
              <option value="">—</option>
              {CLASSES.map((x) => <option key={x.key} value={x.nome.toUpperCase()}>{x.nome} · {x.faixa}</option>)}
              {l.classificacao && !classe && <option value={l.classificacao}>{l.classificacao} — não reconhecida, escolha uma classe</option>}
            </select>
          </Campo>
          <Campo r="Perfil predominante" ajuda={perfil ? `matéria-prima ${fmtR$(perfil.preco)}/kg` : "define o preço do aço desta linha"}>
            <select value={l.perfil || ""} onChange={(ev) => set(i, "perfil", ev.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white w-full">
              <option value="">—</option>
              {PERFIS.map((p) => <option key={p.nome} value={p.nome}>{p.rotulo} · {fmtR$(p.preco)}/kg</option>)}
            </select>
          </Campo>
        </Bloco>

        {peso > 0 && (
          <p className="text-[11px] text-torg-gray border-t border-gray-100 pt-3">
            <strong className="text-torg-dark">{fmtKg(peso)}</strong>
            {perfil && <> · matéria-prima <strong className="text-torg-dark">{fmtR$(custoMat)}</strong></>}
            {classe && <> · fabricação <strong className="text-torg-dark">{fmtR$(custoFab)}</strong></>}
            {custo?.custoPorKg > 0 && (
              <> · custo <strong className="text-torg-dark">{fmtR$(custo.custo)}</strong>
                {" "}(<strong className="text-torg-dark">{fmtR$(custo.custoPorKg)}/kg</strong>)</>
            )}
            {(!perfil || !classe) && <span className="text-torg-orange-700"> · falta {[!perfil && "o perfil", !classe && "a classificação"].filter(Boolean).join(" e ")} para esta linha custar</span>}
          </p>
        )}
      </div>
    </details>
  );
}
