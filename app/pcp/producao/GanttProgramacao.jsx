"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { baixarZipLote } from "@/lib/desenhos-zip-cliente";

// ─── O QUADRO DE PROGRAMAÇÃO DO PCP ────────────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "na página do PCP, quero que crie acima desse painel um gantt que seja
// visualmente fácil de ver… eu preciso ter como arrastar essa barra do gantt para poder programar
// ela"; depois: "ao clicar nessas barras você precisa trazer os projetos que estão programados e
// deixar fazer a impressão deles novamente caso não tenha sido impresso ainda, e é preciso podermos
// quebrar essa programação em mais bancadas caso corra algum atraso"; e "na parte das datas você
// consegue congelar como se fosse uma planilha para podermos ver essas datas em todos os setores".
//
// ⚠⚠ POR QUE ESTE COMPONENTE NÃO É JSX POR DENTRO. O quadro é uma superfície de desenho: centenas
// de barras posicionadas em pixel, arraste com captura de ponteiro, fantasma que cola na grade,
// auto-rolagem na borda e recálculo de ocupação a cada movimento. Reconstruir isso com estado do
// React re-renderizaria a grade inteira a cada pointermove — e o protótipo que o Vitor validou
// ficaria diferente, que é justamente o que ele pediu para não acontecer ("quero esse mesmo layout,
// nada diferente"). Então o React cuida da BORDA (buscar, avisar, recarregar) e entrega um <div>
// para o desenho imperativo cuidar do resto. O código aqui dentro é o mesmo do protótipo.
//
// ⚠ O CSS é embutido e todo prefixado por `.gpcp`: são regras de grade/faixa/barra que não existem
// no Tailwind do portal, e sem o prefixo elas vazariam para o resto da tela do PCP.
//
// ⚠ NÃO INVENTA PROGRAMAÇÃO: lê e grava os mesmos campos que as telas de corte, montagem e solda já
// usam (ver lib/gantt-pcp.js). Arrastar para frente conta adiamento; para trás, não.

const CSS = `
  .gpcp{
    --alt:740px; position:relative; margin:0; color:var(--tinta); font-size:13px;
    --navy:#0D1F3C; --laranja:#F4801F; --azul:#006EAB;
    --tinta:#16202e; --tinta-2:#5b6a7d; --linha:#e3e8ef; --fundo:#f4f6f9; --papel:#fff;
    --ok:#0f9d58; --alerta:#d98700; --ruim:#c62828;
    --col:106px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }
  .gpcp .wrap{height:var(--alt);display:flex;flex-direction:column}
  .gpcp .topo, .gpcp .barra{flex:0 0 auto}

  .gpcp .topo{background:var(--navy);border-radius:10px 10px 0 0;padding:10px 18px;color:#fff;
        border-bottom:3px solid var(--laranja);display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  .gpcp .topo h1{margin:0;font-size:16px;font-weight:700;letter-spacing:.2px}
  .gpcp .topo p{margin:0;font-size:11.5px;color:#a9bbd4}
  .gpcp .barra{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:9px 18px;
         background:#fff;border:1px solid var(--linha);border-top:0}
  .gpcp .btn{border:1px solid var(--linha);background:#fff;color:var(--tinta);border-radius:6px;
       padding:5px 11px;font-size:12px;cursor:pointer;font-weight:600}
  .gpcp .btn:hover{background:#f0f3f8}
  .gpcp .btn[disabled]{opacity:.4;cursor:default}
  .gpcp .btn.pri{background:var(--azul);border-color:var(--azul);color:#fff}
  .gpcp .btn.pri:hover:not([disabled]){background:#005b8e}
  .gpcp .btn.on{background:var(--navy);border-color:var(--navy);color:#fff}
  .gpcp .btn.mini{padding:3px 8px;font-size:11px}
  .gpcp .periodo{font-weight:700;font-size:13px;min-width:180px;text-align:center}
  .gpcp .sep{width:1px;height:22px;background:var(--linha)}
  .gpcp .rot{font-size:11px;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.5px;font-weight:700}
  .gpcp .leg{display:flex;gap:10px;align-items:center;font-size:11px;color:var(--tinta-2);margin-left:auto}
  .gpcp .leg i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:4px}

  .gpcp /* ── grade ─────────────────────────────────────────────────────── */
  .quadro{flex:1 1 auto;min-height:180px;display:flex;background:var(--papel);
          border:1px solid var(--linha);border-top:0;border-radius:0 0 10px 10px;overflow:hidden}
  .gpcp .rolagem{flex:1 1 auto;min-width:0;overflow:auto;overscroll-behavior:contain}
  .gpcp .linha{display:flex;align-items:stretch;border-bottom:1px solid var(--linha)}
  .gpcp .rotulo{flex:0 0 186px;position:sticky;left:0;z-index:4;background:var(--papel);
          box-shadow:3px 0 4px -3px rgba(13,31,60,.18);
          border-right:2px solid var(--linha);padding:6px 10px;display:flex;flex-direction:column;
          justify-content:center;gap:1px}
  .gpcp .rotulo b{font-size:12px;font-weight:700}
  .gpcp .rotulo small{font-size:10.5px;color:var(--tinta-2)}
  .gpcp .trilho{position:relative;flex:0 0 auto;z-index:1}
  .gpcp .celulas{display:flex;height:100%}
  .gpcp .cel{flex:0 0 var(--col);border-right:1px solid var(--linha);position:relative}
  .gpcp .cel.alvo{background:rgba(0,110,171,.10);box-shadow:inset 0 0 0 2px var(--azul)}
  .gpcp .cel.proibido{background:rgba(198,40,40,.07);box-shadow:inset 0 0 0 2px rgba(198,40,40,.45)}
  .gpcp .barras{position:absolute;left:0;right:0;top:0;bottom:16px;pointer-events:none}
  .gpcp .cargas{position:absolute;left:0;right:0;bottom:0;display:flex;height:16px;pointer-events:none;
          border-top:1px dashed #e9edf3}
  .gpcp .cg{flex:0 0 var(--col);border-right:1px solid var(--linha);position:relative;background:#fcfdfe}
  .gpcp .cg .f{position:absolute;left:0;top:0;bottom:0;background:rgba(15,157,88,.22)}
  .gpcp .cg span{position:absolute;right:4px;top:2px;font-size:9.5px;font-weight:700;color:#5b6a7d;
           font-variant-numeric:tabular-nums;letter-spacing:-.2px}
  /* ⚠⚠ VERMELHO É SÓ DE ATRASO. Vitor (05/09/2026): "vamos deixar o vermelho apenas para atraso".
     Sobrecarga vira HACHURA âmbar: continua gritando "não cabe" sem disputar significado com o atraso.
     Tirar a cor sem pôr outra deixaria a bancada estourada com a mesma cara da bancada folgada. */
  .gpcp .cg.q2 .f{background:rgba(217,135,0,.32)} .gpcp .cg.q2 span{color:#8a5600}
  .gpcp .cg.q3 .f{background:repeating-linear-gradient(135deg,rgba(217,135,0,.42),rgba(217,135,0,.42) 4px,
            rgba(217,135,0,.14) 4px,rgba(217,135,0,.14) 8px)}
  .gpcp .cg.q3 span{color:#7a4a00}
  .gpcp .linha.pousio .rotulo{background:repeating-linear-gradient(135deg,#fff,#fff 7px,#f6f8fb 7px,#f6f8fb 14px)}

  .gpcp .cabdia{position:sticky;top:0;z-index:6;background:#fbfcfe;border-bottom:2px solid var(--linha);
          box-shadow:0 3px 5px -3px rgba(13,31,60,.18);height:64px}
  .gpcp .cabdia .rotulo{background:#fbfcfe;z-index:7;font-size:11px;color:var(--tinta-2);
                  text-transform:uppercase;letter-spacing:.5px;font-weight:700}
  .gpcp .dia{flex:0 0 var(--col);border-right:1px solid var(--linha);padding:6px 8px;text-align:center}
  .gpcp .dia .dsem{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--tinta-2);font-weight:700}
  .gpcp .dia .dnum{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .gpcp .dia.hoje{background:#fff4e8} .gpcp .dia.hoje .dnum{color:var(--laranja)}
  /* ⚠ FIM DE SEMANA APARECE, MAS NÃO SE DISFARÇA DE DIA ÚTIL. A coluna é sombreada
     nas três camadas (cabeçalho, células e barra de carga) para que ninguém solte uma
     programação no sábado achando que é sexta. "hoje" ganha do sombreado. */
  .gpcp .dia.fds{background:#f2f5f9} .gpcp .dia.fds .dsem{color:#93a3b8}
  .gpcp .dia.fds .dnum{color:#8fa0b5} .gpcp .dia.hoje.fds{background:#fff4e8}
  .gpcp .cel.fds{background:#f7f9fc} .gpcp .cg.fds{background:#f2f5f9}
  .gpcp .dia .dmes{font-size:9.5px;color:var(--tinta-2);text-transform:uppercase}

  .gpcp .setor{display:flex;background:#eef2f7;border-bottom:1px solid var(--linha);border-top:1px solid var(--linha);
         position:sticky;top:64px;z-index:5}
  .gpcp .setor .rotulo{background:#eef2f7;flex-direction:row;align-items:center;gap:8px;cursor:pointer;
                 border-right:2px solid var(--linha)}
  .gpcp .setor b{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--navy)}
  .gpcp .setor .resumo{background:#eef2f7;font-size:10.5px;color:var(--tinta-2);font-weight:600;
                 padding:5px 8px;white-space:nowrap}
  .gpcp .caret{font-size:9px;color:var(--tinta-2);width:9px}

  /* ⚠⚠ A BARRA NÃO VEM PREENCHIDA. Vitor (05/09/2026): "não queria que a barra já viesse preenchida,
     queria um tom de azul no caso da 112 que ainda não iniciou opaco e conforme o apontamento do Syneco
     fosse preenchendo, igual é um gantt de cronograma". Então contorno + fundo esmaecido na cor da OP =
     PROGRAMADO, e a faixa sólida embaixo = APONTADO. O rótulo fica na cor da OP sobre fundo claro, e é
     por isso que ele não some conforme o preenchimento cresce - texto branco sobre barra meio cheia
     seria ilegível justamente no meio do avanço. */
  .gpcp .barra-op{position:absolute;height:23px;border-radius:5px;display:flex;align-items:center;gap:6px;
            padding:0 7px;cursor:grab;pointer-events:auto;overflow:hidden;user-select:none;
            background:var(--ct);color:var(--c);border:1.5px solid var(--c);
            box-shadow:0 1px 2px rgba(13,31,60,.14);touch-action:none}
  .gpcp .barra-op .prog{position:absolute;left:0;bottom:0;height:6px;background:var(--c);opacity:.9;
            border-radius:0 3px 3px 0;pointer-events:none}
  .gpcp .barra-op:active{cursor:grabbing}
  .gpcp .barra-op.arrastando{opacity:.35}
  .gpcp .barra-op.foco{outline:2px solid var(--navy);outline-offset:1px}
  .gpcp .barra-op b{font-size:11.5px;font-weight:800;white-space:nowrap}
  .gpcp .barra-op span{font-size:10.5px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                 font-variant-numeric:tabular-nums}
  .gpcp .barra-op .selo{margin-left:auto;font-size:9.5px;background:rgba(255,255,255,.82);border-radius:3px;
                  padding:1px 4px;font-weight:700;white-space:nowrap;border:1px solid var(--ct)}
  .gpcp .barra-op.mexida{outline:2px solid var(--laranja);outline-offset:-2px}
  .gpcp .fantasma{position:fixed;z-index:99;pointer-events:none;opacity:.92;
            box-shadow:0 8px 20px rgba(13,31,60,.35)}
  .gpcp .corta{position:absolute;top:0;bottom:0;width:9px;background:var(--c);
         display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff}
  .gpcp .corta.e{left:0;border-radius:5px 0 0 5px} .gpcp .corta.d{right:0;border-radius:0 5px 5px 0}
  .gpcp .semgrd{position:absolute;right:3px;top:3px;width:7px;height:7px;border-radius:50%;
          background:#ffd27a;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}

  /* ── atraso ─────────────────────────────────────────────────────────────────
     A faixa vermelha cobre o PEDAÇO da barra cujo dia já passou e ainda tem peça pendente: é o
     trabalho que devia estar pronto. A sombra tracejada é para onde a OP seguinte CAI se ninguém
     recuperar - previsão, não gravação: só vira programação quando o PCP aplicar e salvar. */
  .gpcp .barra-op .atrasado{position:absolute;left:0;top:0;bottom:0;pointer-events:none;
            background:repeating-linear-gradient(135deg,rgba(198,40,40,.34),rgba(198,40,40,.34) 5px,
                       rgba(198,40,40,.10) 5px,rgba(198,40,40,.10) 10px);
            border-right:2px solid #c62828}
  .gpcp .barra-op.atrasada{border-color:#c62828}
  .gpcp .barra-op .selo.atr{background:#c62828;color:#fff;border-color:#c62828}
  .gpcp .sombra{position:absolute;height:23px;border-radius:5px;pointer-events:none;display:flex;
          align-items:center;padding:0 7px;border:1.5px dashed var(--c);background:var(--ct);opacity:.7}
  .gpcp .sombra b{font-size:10.5px;font-weight:800;color:var(--c);white-space:nowrap}

  .gpcp /* ── alterações ────────────────────────────────────────────────── */
  .pend{flex:0 0 auto;margin-top:10px;background:var(--papel);border:1px solid var(--linha);
        border-radius:10px;overflow:hidden}
  .gpcp .pend h2{margin:0;padding:10px 16px;font-size:13px;background:#fbfcfe;border-bottom:1px solid var(--linha);
           display:flex;align-items:center;gap:10px}
  .gpcp .pend h2 .n{background:var(--laranja);color:#fff;border-radius:11px;padding:1px 9px;font-size:11px}
  .gpcp .pend h2 .acoes{margin-left:auto;display:flex;gap:8px}
  .gpcp .pend ul{list-style:none;margin:0;padding:0;max-height:20vh;overflow:auto}
  .gpcp .pend li{display:flex;align-items:center;gap:10px;padding:7px 16px;border-bottom:1px solid #f0f3f7;font-size:12px}
  .gpcp .pend li:last-child{border-bottom:0}
  .gpcp .tag{font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;
       padding:2px 6px;border-radius:4px;color:#fff}
  .gpcp .de-para{color:var(--tinta-2)} .gpcp .de-para b{color:var(--tinta);font-weight:700}
  .gpcp .seta{color:var(--laranja);font-weight:800;margin:0 3px}
  .gpcp .vazio{padding:14px 16px;color:var(--tinta-2);font-size:12px}
  .gpcp .li-x{margin-left:auto;border:0;background:none;color:var(--tinta-2);cursor:pointer;font-size:14px;padding:0 4px}
  .gpcp .li-x:hover{color:var(--ruim)}


  .gpcp /* ── painel lateral ────────────────────────────────────────────── */
  .painel{position:fixed;top:0;right:0;bottom:0;width:min(540px,96vw);background:var(--papel);
          border-left:1px solid var(--linha);box-shadow:-12px 0 34px rgba(13,31,60,.22);
          display:flex;flex-direction:column;z-index:40}
  .gpcp .painel[hidden]{display:none}
  .gpcp .painel .ph{background:var(--navy);color:#fff;padding:12px 16px}
  .gpcp .painel .ph .l1{display:flex;align-items:center;gap:10px}
  .gpcp .painel .ph b{font-size:15px}
  .gpcp .painel .ph .obra{font-size:11.5px;color:#a9bbd4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gpcp .painel .ph .x{margin-left:auto;background:none;border:0;color:#a9bbd4;font-size:18px;cursor:pointer;line-height:1}
  .gpcp .painel .ph .x:hover{color:#fff}
  .gpcp .painel .ph .l2{margin-top:5px;font-size:11.5px;color:#cbd8ea;font-variant-numeric:tabular-nums}
  .gpcp .abas{display:flex;border-bottom:1px solid var(--linha);background:#fbfcfe}
  .gpcp .abas button{flex:1;border:0;background:none;padding:9px 8px;font-size:12px;font-weight:700;
               color:var(--tinta-2);cursor:pointer;border-bottom:2px solid transparent}
  .gpcp .abas button.on{color:var(--navy);border-bottom-color:var(--laranja);background:#fff}
  .gpcp .pcorpo{flex:1 1 auto;overflow:auto;padding:0}
  .gpcp .ptool{display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid var(--linha);
         background:#fbfcfe;flex-wrap:wrap;font-size:11.5px;color:var(--tinta-2)}
  .gpcp .ptool label{display:flex;align-items:center;gap:5px;cursor:pointer}
  .gpcp table.marcas{width:100%;border-collapse:collapse;font-size:11.5px}
  .gpcp table.marcas th{position:sticky;top:0;background:#fbfcfe;text-align:left;padding:6px 8px;
                  font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--tinta-2);
                  border-bottom:1px solid var(--linha);z-index:1}
  .gpcp table.marcas td{padding:5px 8px;border-bottom:1px solid #f2f5f9;vertical-align:middle}
  .gpcp table.marcas td.num{text-align:right;font-variant-numeric:tabular-nums}
  .gpcp table.marcas tr.sel{background:#eef6fb}
  .gpcp .pilha{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;
         padding:2px 6px;border-radius:10px}
  .gpcp .pilha.ok{background:#e6f4ea;color:#136c35}
  .gpcp .pilha.nao{background:#fff3d9;color:#8a5600}
  .gpcp .pfoot{flex:0 0 auto;border-top:1px solid var(--linha);padding:11px 14px;display:flex;gap:8px;
         align-items:center;background:#fbfcfe;flex-wrap:wrap}
  .gpcp .pfoot .info{font-size:11px;color:var(--tinta-2);flex:1 1 100%;order:-1}
  .gpcp .bloco{padding:12px 14px;border-bottom:1px solid var(--linha)}
  .gpcp .bloco h4{margin:0 0 7px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--tinta-2)}
  .gpcp .chips{display:flex;flex-wrap:wrap;gap:6px}
  .gpcp .chip{border:1px solid var(--linha);border-radius:16px;padding:4px 10px;font-size:11.5px;
        cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;font-weight:600}
  .gpcp .chip.on{border-color:var(--azul);background:#eef6fb;color:#00527e}
  .gpcp .chip small{font-weight:700;font-variant-numeric:tabular-nums}
  .gpcp .chip small.q2{color:#8a5600} .gpcp .chip small.q3{color:#a01c1c} .gpcp .chip small.q1{color:#136c35}
  .gpcp .num-in{width:56px;padding:4px 7px;border:1px solid var(--linha);border-radius:6px;font-size:12px;
          font-variant-numeric:tabular-nums}
  .gpcp table.prev{width:100%;border-collapse:collapse;font-size:11.5px}
  .gpcp table.prev th{text-align:left;padding:5px 8px;font-size:10px;text-transform:uppercase;
                letter-spacing:.4px;color:var(--tinta-2);border-bottom:1px solid var(--linha)}
  .gpcp table.prev td{padding:5px 8px;border-bottom:1px solid #f2f5f9;font-variant-numeric:tabular-nums}
  .gpcp table.prev td.b{font-weight:700;font-variant-numeric:normal}
  .gpcp .oc{font-weight:800} .gpcp .oc.q1{color:#136c35} .gpcp .oc.q2{color:#8a5600} .gpcp .oc.q3{color:#a01c1c}
  .gpcp .dica{font-size:11px;color:var(--tinta-2);line-height:1.55;padding:10px 14px;background:#fbfcfe}
  .gpcp .dica b{color:var(--tinta)}

  .gpcp dialog{border:0;border-radius:10px;padding:0;max-width:780px;width:92%;
         box-shadow:0 20px 60px rgba(13,31,60,.35)}
  .gpcp dialog h3{margin:0;padding:13px 18px;background:var(--navy);color:#fff;font-size:14px;border-radius:10px 10px 0 0}
  .gpcp dialog .corpo{padding:16px 18px;max-height:62vh;overflow:auto}
  .gpcp dialog pre{background:#0f1a2b;color:#cfe3ff;padding:12px;border-radius:7px;font-size:11px;
             overflow:auto;line-height:1.5;margin:6px 0 12px;white-space:pre-wrap;word-break:break-all}
  .gpcp dialog .pe{padding:12px 18px;border-top:1px solid var(--linha);display:flex;justify-content:flex-end;gap:8px}
  .gpcp dialog p{margin:0 0 10px;font-size:12px;color:var(--tinta-2);line-height:1.6}

  .gpcp, .gpcp *{box-sizing:border-box}
  .gpcp.cheio{position:fixed;inset:0;z-index:60;background:var(--fundo);padding:10px 14px;--alt:100%}
  .gpcp .carregando{display:flex;align-items:center;justify-content:center;gap:10px;height:200px;color:var(--tinta-2)}

  .gpcp .avisoTela{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:8px 18px;
                   border:1px solid var(--linha);border-top:0;line-height:1.5}
  .gpcp .avisoTela.ok{background:#ecfdf3;border-color:#bbf0cd;color:#136c35}
  .gpcp .avisoTela.ruim{background:#fef2f2;border-color:#f6cccc;color:#a01c1c}
  .gpcp .avisoTela button{margin-left:auto;background:none;border:0;text-decoration:underline;
                          cursor:pointer;color:inherit;font-size:11px}
`;

const MARKUP = `<div class="wrap">
  <div class="topo">
    <h1>Gantt da Programação — PCP</h1>
    <p>Arraste para remanejar · clique na barra para ver os projetos e quebrar em bancadas</p>
  </div>

  <div class="barra">
    <button class="btn" id="gp-ant">‹ Semana</button>
    <div class="periodo" id="gp-periodo"></div>
    <button class="btn" id="gp-prox">Semana ›</button>
    <button class="btn" id="gp-agora">Onde tem programação</button>
    <div class="sep"></div>
    <span class="rot">Setor</span>
    <button class="btn on" data-setor="CORTE">Corte</button>
    <button class="btn on" data-setor="MONTAGEM">Montagem</button>
    <button class="btn on" data-setor="SOLDA">Solda</button>
    <div class="sep"></div>
    <button class="btn on" id="gp-regua">Ritmo normal</button>
    <div class="sep"></div>
    <button class="btn" id="gp-recarregar">Atualizar</button>
    <button class="btn" id="gp-cheio">Tela cheia</button>
    <button class="btn" id="gp-empurrar" hidden></button>
    <span class="leg">
      <span>Bancada:</span>
      <span><i style="background:rgba(15,157,88,.45)"></i>cabe</span>
      <span><i style="background:rgba(217,135,0,.55)"></i>apertado</span>
      <span><i style="background:repeating-linear-gradient(135deg,rgba(217,135,0,.5),rgba(217,135,0,.5) 3px,rgba(217,135,0,.14) 3px,rgba(217,135,0,.14) 6px)"></i>não cabe</span>
      <span class="sep"></span>
      <span><i style="background:repeating-linear-gradient(135deg,rgba(198,40,40,.45),rgba(198,40,40,.45) 3px,rgba(198,40,40,.12) 3px,rgba(198,40,40,.12) 6px)"></i>atraso</span>
    </span>
  </div>

  <div id="gp-aviso"></div>
  <div class="quadro"><div class="rolagem" id="gp-grade"></div></div>

  <div class="pend">
    <h2>Alterações desta sessão <span class="n" id="gp-nAlt">0</span>
      <span class="acoes">
        <button class="btn" id="gp-desfazer" disabled>Desfazer última</button>
        <button class="btn" id="gp-limpar" disabled>Descartar tudo</button>
        <button class="btn pri" id="gp-salvar" disabled>Salvar programação</button>
      </span>
    </h2>
    <ul id="gp-listaAlt"></ul>
    <div class="vazio" id="gp-semAlt">Nenhuma programação alterada ainda.</div>
  </div>

</div>

<aside class="painel" id="gp-painel" hidden>
  <div class="ph">
    <div class="l1"><b id="gp-pOp"></b><span class="obra" id="gp-pObra"></span>
      <button class="x" id="gp-pFechar" title="fechar">✕</button></div>
    <div class="l2" id="gp-pSub"></div>
  </div>
  <div class="abas">
    <button class="on" data-aba="projetos">Projetos programados</button>
    <button data-aba="quebrar">Quebrar a programação</button>
  </div>
  <div class="pcorpo" id="gp-pCorpo"></div>
  <div class="pfoot" id="gp-pFoot"></div>
</aside>`;

function iniciar(raiz, LOTES, HOJE, ajuda) {
  const $ = (id) => raiz.querySelector("#gp-" + id);
  const { avisar, recarregar, baixarZip } = ajuda;

  // JANELA 14 = duas semanas CHEIAS agora que sábado e domingo têm coluna. Com 13 a
  // grade cortava no meio de uma semana e o olho perdia o ritmo de sete.
  const COL = 106, JANELA = 14, MAX_LOTE = 80;

  /* ── recursos ───────────────────────────────────────────────────────────────── */
  const RECURSOS = {
    CORTE: [
      { k:null, nome:"sem máquina", obs:"atribuir laser" },
      { k:"LASER_PERFIL", nome:"Laser Perfil", cap:2843 },
      { k:"LASER_CHAPA", nome:"Laser Chapa", cap:2407 },
      { k:"LASER_TUBO", nome:"Laser Tubo", cap:1864 },
      { k:"LASER_CANTONEIRA", nome:"Laser Cantoneira", cap:1065 },
      { k:"CORTE_MANUAL", nome:"Corte Manual", cap:419 },
    ],
    MONTAGEM: [{ k:null, nome:"sem bancada", obs:"atribuir bancada" },
      ...["MONTAGEM 1","MONTAGEM 2","MONTAGEM 3","MONTAGEM 4","MONTAGEM 5"].map(n=>({k:n,nome:n,cap:1}))],
    SOLDA: [{ k:null, nome:"sem bancada", obs:"atribuir bancada" },
      ...["SOLDA 1","SOLDA 2","SOLDA 4","SOLDA 5","SOLDA 6","SOLDA 7"].map(n=>({k:n,nome:n,cap:1}))],
  };
  const SETORES = ["CORTE","MONTAGEM","SOLDA"];
  const COR_SETOR = { CORTE:"#8e5cd9", MONTAGEM:"#006EAB", SOLDA:"#c2410c" };
  const FATOR_META = { MONTAGEM:0.47, SOLDA:0.58, CORTE:1 };
  const capDe = (setor, rec)=> (RECURSOS[setor].find(r=>r.k===rec)||{}).cap || 0;
  const nomeRec = (setor, rec)=> (RECURSOS[setor].find(r=>r.k===rec)||{}).nome || "sem recurso";

  const PALETA = ["#0D1F3C","#006EAB","#0f766e","#b45309","#7c2d92","#be123c","#4d7c0f","#0369a1",
                  "#9a3412","#3730a3","#065f46","#a16207"];
  const OPS = [...new Set(LOTES.map(l=>l.op))].sort();
  const COR_OP = new Map(OPS.map((op,i)=>[op, PALETA[i%PALETA.length]]));
  const corDaOp = (op)=>COR_OP.get(op) || "#5b6a7d";
  /* o mesmo tom da OP, esmaecido: é o fundo de "programado e ainda não apontado" */
  const tintaOp = (op)=>{ const h = corDaOp(op).replace("#","");
    const n = parseInt(h.length===3 ? h.split("").map(c=>c+c).join("") : h, 16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+",.13)"; };

  /* ── calendário ─────────────────────────────────────────────────────────────── */
  const d0 = (s)=>new Date(s+"T00:00:00Z");
  const isoD = (d)=>d.toISOString().slice(0,10);
  // ⚠ SÁBADO E DOMINGO APARECEM. Matheus (05/09/2026): "coloque no gantt sábados e
  // domingo, caso for precisar trabalhar ser possível". Antes o calendário pulava o
  // fim de semana, e o que não tem coluna não pode receber uma barra — não havia como
  // programar um sábado nem para dizer que ele existe.
  //
  // Aparecer não é virar dia normal: a coluna vem sombreada, e a quebra em N dias
  // PULA o fim de semana (ver diasDaQuebra). Fim de semana é possível, nunca
  // automático — quem quiser trabalhar no sábado arrasta a barra para lá.
  const ehFimDeSemana = (d)=>{const w=d.getUTCDay();return w===0||w===6;};
  const fdsISO = (s)=>ehFimDeSemana(d0(s));
  const DSEM = ["dom","seg","ter","qua","qui","sex","sáb"];
  const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const diasComDado = [...new Set(LOTES.map(l=>l.dia))].sort();
  const dIni = d0(diasComDado[0]||HOJE); dIni.setUTCDate(dIni.getUTCDate()-40);
  const dFim = d0(diasComDado[diasComDado.length-1]||HOJE); dFim.setUTCDate(dFim.getUTCDate()+90);
  const DIAS=[]; for(const d=new Date(dIni); d<=dFim; d.setUTCDate(d.getUTCDate()+1)) DIAS.push(isoD(d));
  const IDX = new Map(DIAS.map((s,i)=>[s,i]));

  // A coluna de dia útil a partir de i (o próprio i, se já for útil).
  //
  // ⚠⚠ NADA NESTA TELA PROGRAMA UM FIM DE SEMANA — e isso é decisão, não limitação.
  //
  // Sábado e domingo têm coluna para dar o ritmo do calendário e para conferir data, mas
  // não recebem trabalho. Duas tentativas de permitir isso foram construídas e retiradas
  // pelo Matheus (05/09/2026), cada uma pelo seu motivo:
  //
  //   pontas arrastáveis  "vai dar margem para aumentarem o prazo de produção"
  //   menu no botão direito  "vai ficar confuso"
  //
  // Antes de reconstruir uma terceira, vale ler esses dois motivos: o problema nunca foi
  // técnico. Programar fim de semana precisa ser decisão de quem cuida do PCP, num lugar
  // onde isso seja pesado e visível — não um gesto a mais nesta grade.
  //
  // O que já existe pronto, se um dia for preciso: `diasDaQuebra` sabe seguir em dias
  // corridos quando o bloco começa num fim de semana.
  function encostaNoUtil(i){
    let k = Math.max(0, Math.min(DIAS.length-1, i));
    while(k < DIAS.length-1 && fdsISO(DIAS[k])) k++;
    return k;
  }

  // Os N dias que uma quebra ocupa a partir de uma coluna. Pula sábado e domingo,
  // porque "dividir em 3 dias" numa sexta significa sex/seg/ter para quem programa.
  // A exceção é começar NUM fim de semana: aí a escolha já foi deliberada e os dias
  // seguem corridos.
  function diasDaQuebra(ini, n){
    const corrido = fdsISO(DIAS[Math.min(DIAS.length-1, ini)]);
    const fora = [];
    for(let i=ini; i<DIAS.length && fora.length<n; i++){
      if(corrido || !fdsISO(DIAS[i])) fora.push(i);
    }
    while(fora.length && fora.length<n) fora.push(fora[fora.length-1]);
    return fora.length ? fora : [Math.min(DIAS.length-1, ini)];
  }

  const nkg = (n)=>Math.round(n).toLocaleString("pt-BR");
  const n1 = (n)=>(Math.round(n*10)/10).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});
  const dbr = (s)=>{const d=d0(s);return String(d.getUTCDate()).padStart(2,"0")+"/"+String(d.getUTCMonth()+1).padStart(2,"0");};

  /* ── estado ─────────────────────────────────────────────────────────────────── */
  let seq = 0;
  const novoLote = (o)=>({ ...o, uid:"L"+(++seq) });
  let lotes = LOTES.map(l=>novoLote({ ...l, recursoOrig:l.recurso, diaOrig:l.dia }));
  let alteracoes = [], setoresOn = new Set(SETORES), regua = "normal", inicio = 0;
  let painel = null, abaP = "projetos", selMarcas = new Set(), soNaoImpressos = false;
  let quebraBancadas = null, quebraDias = 1;
  const estado = new Map();

  const custoLote = (l)=> l.setor==="CORTE" ? l.kg : l.custo * (regua==="meta" ? FATOR_META[l.setor] : 1);
  const custoItem = (it, setor)=> setor==="CORTE" ? it.kg : it.c * (regua==="meta" ? FATOR_META[setor] : 1);

  function janelaMaisCheia(){
    const peso = new Map();
    for(const l of lotes){ if(!setoresOn.has(l.setor)) continue;
      const i = IDX.get(l.dia); if(i==null) continue; peso.set(i,(peso.get(i)||0)+l.pecas); }
    if(!peso.size) return 0;
    let melhor=0, soma=-1;
    for(const i of peso.keys()){ const ini=Math.max(0,i-1); let s=0;
      for(let k=ini;k<ini+JANELA;k++) s+=peso.get(k)||0; if(s>soma){soma=s;melhor=ini;} }
    return melhor;
  }
  function janelaDeHoje(){
    const i = DIAS.findIndex(d=>d>=HOJE);
    return Math.max(0, Math.min(DIAS.length-JANELA, (i<0?DIAS.length-JANELA:i)-2));
  }
  inicio = janelaDeHoje();

  /* junta lotes que ficaram no mesmo setor/recurso/OP/dia depois de um remanejo ou de uma quebra */
  function mesclar(){
    const por = new Map();
    const fora = [];
    for(const l of lotes){
      const k = l.setor+"|"+(l.recurso||"—")+"|"+l.op+"|"+l.dia;
      const a = por.get(k);
      if(!a){ por.set(k,l); fora.push(l); continue; }
      a.itens = a.itens.concat(l.itens);
      a.pecas += l.pecas; a.kg += l.kg; a.custo += l.custo; a.feitas += l.feitas;
      a.adiado = Math.max(a.adiado, l.adiado||0);
    }
    lotes = fora;
  }
  const recalc = (l)=>{
    l.pecas = l.itens.reduce((s,i)=>s+i.q,0);
    l.kg = Math.round(l.itens.reduce((s,i)=>s+i.kg,0));
    l.custo = Math.round(l.itens.reduce((s,i)=>s+i.c,0)*100)/100;
    l.feitas = l.itens.reduce((s,i)=>s+(i.f||0),0);
    return l;
  };

  /* ── runs (dias seguidos da mesma OP no mesmo recurso = 1 barra) ────────────── */
  function montarRuns(){
    const grupos = new Map();
    for(const l of lotes){
      if(!setoresOn.has(l.setor)) continue;
      const k = l.setor+"|"+(l.recurso||"—")+"|"+l.op;
      if(!grupos.has(k)) grupos.set(k,[]);
      grupos.get(k).push(l);
    }
    const runs=[];
    for(const arr of grupos.values()){
      arr.sort((a,b)=>a.dia.localeCompare(b.dia));
      let atual=null;
      for(const l of arr){
        const i = IDX.get(l.dia); if(i==null) continue;
        // ⚠ A BARRA NUNCA ATRAVESSA O FIM DE SEMANA. Matheus (05/09/2026): "o certo é que
        // a barra se divida em duas caso estiver programado para sex, seg, ter". Houve uma
        // versão que costurava o vão para não perder o bloco único de arrastar; era o
        // raciocínio errado — uma barra por cima do sábado PARECE trabalho no sábado, e num
        // quadro de produção o desenho é a informação.
        if(atual && i === atual.fim+1){ atual.fim=i; atual.lotes.push(l); }
        else { atual={ setor:l.setor, recurso:l.recurso, op:l.op, obra:l.obra, ini:i, fim:i, lotes:[l] }; runs.push(atual); }
      }
    }
    for(const r of runs){
      r.id = r.setor+"|"+(r.recurso||"—")+"|"+r.op+"|"+r.ini;
      // dias TRABALHADOS, não colunas ocupadas: uma barra que atravessa o fim de
      // semana cobre 4 colunas e trabalha 2 dias. Contar coluna diria "4 dias" e
      // ainda entraria como padrão na quebra.
      r.dias = new Set(r.lotes.map(l=>l.dia)).size;
      r.pecas = r.lotes.reduce((s,l)=>s+l.pecas,0);
      r.kg = r.lotes.reduce((s,l)=>s+l.kg,0);
      r.feitas = r.lotes.reduce((s,l)=>s+l.feitas,0);
      r.custo = r.lotes.reduce((s,l)=>s+custoLote(l),0);
      r.itens = r.lotes.flatMap(l=>l.itens);
      r.semGrd = r.itens.filter(i=>!i.g).length;
      r.mexida = r.lotes.some(l=>l.recurso!==l.recursoOrig || l.dia!==l.diaOrig);
      r.adiado = Math.max(0, ...r.lotes.map(l=>l.adiado||0));
    }
    return runs;
  }
  const acharRun = (chave)=> chave ? montarRuns().find(r=>r.setor===chave.setor && r.recurso===chave.recurso
      && r.op===chave.op && r.ini===chave.ini) : null;

  /* ── carga por célula ───────────────────────────────────────────────────────── */
  function carga(setor, recurso, dia, ignorarUids){
    let c = 0;
    for(const l of lotes){
      if(l.setor!==setor || l.recurso!==recurso || l.dia!==dia) continue;
      if(ignorarUids && ignorarUids.has(l.uid)) continue;
      c += custoLote(l);
    }
    return c;
  }
  const ocup = (setor, recurso, dia, ign)=>{ const cap = capDe(setor,recurso); return cap ? carga(setor,recurso,dia,ign)/cap : 0; };
  const classeOc = (o)=> o<=0 ? "" : o<=1 ? "q1" : o<=1.3 ? "q2" : "q3";
  /* ⚠ "532%" não diz nada sobre UM dia. Vitor (05/09/2026): "não entendi essa lógica". Acima da
     capacidade a leitura vira múltiplo - "5,3×" = cinco dias e meio de bancada empilhados num dia só. */
  const rotuloOc = (o)=> o<=1 ? Math.round(o*100)+"%"
                              : (Math.round(o*10)/10).toLocaleString("pt-BR")+"×";

  /* ── atraso e o empurrão que ele causa ──────────────────────────────────────
     ⚠ ATRASO É FATO, NÃO PALPITE: dia já passou E ainda tem peça sem apontamento no Syneco. O custo
     que sobrou consome a bancada a partir de hoje, e é isso que empurra quem vinha atrás. O empurrão
     é sempre em dias ÚTEIS inteiros, porque bancada-dia é a unidade em que a fábrica programa. */
  const fracaoFeita = (l)=> l.pecas>0 ? Math.min(1, l.feitas/l.pecas) : 0;
  const loteAtrasado = (l)=> l.dia < HOJE && l.pecas > l.feitas;
  function empurraoDoRecurso(setor, rec){
    const cap = capDe(setor, rec); if(!cap) return 0;
    let pend = 0;
    for(const l of lotes){
      if(l.setor!==setor || l.recurso!==rec || !loteAtrasado(l)) continue;
      pend += custoLote(l) * (1 - fracaoFeita(l));
    }
    return pend > 0 ? Math.ceil(pend/cap) : 0;
  }

  /* onde cada OP do recurso cai se o atraso não for recuperado (previsão, nada gravado) */
  function sombrasDoEmpurrao(runs, emp, inicio, larg){
    if(!emp) return "";
    let h = "";
    for(const r of runs){
      if(DIAS[r.ini] < HOJE) continue;
      const ni = r.ini+emp, nf = r.fim+emp;
      if(nf<inicio || ni>=inicio+larg) continue;
      const a = Math.max(ni,inicio), b = Math.min(nf, inicio+larg-1);
      const x = (a-inicio)*COL+3, w = (b-a+1)*COL-7;
      h += '<div class="sombra" style="left:'+x+'px;width:'+w+'px;top:'+(r.faixa*30+5)+'px;'
        +  '--c:'+corDaOp(r.op)+';--ct:'+tintaOp(r.op)+'" title="OP-'+r.op+' cai aqui se o atraso '
        +  'não for recuperado ('+emp+' dia útil'+(emp>1?'s':'')+' de empurrão)">'
        +  (w>=90?'<b>OP-'+r.op+' →</b>':'')+'</div>';
    }
    return h;
  }

  /* ── desenho da grade ───────────────────────────────────────────────────────── */
  const grade = $("grade");
  function desenhar(){
    const runs = montarRuns();
    const janela = DIAS.slice(inicio, inicio+JANELA);
    const larg = janela.length;
    let html = '<div class="linha cabdia"><div class="rotulo">Setor / recurso</div><div class="trilho" style="width:'+(larg*COL)+'px"><div class="celulas">';
    for(const s of janela){
      const d=d0(s);
      html += '<div class="dia'+(s===HOJE?" hoje":"")+(fdsISO(s)?" fds":"")+'"><div class="dsem">'+DSEM[d.getUTCDay()]+'</div>'
           +  '<div class="dnum">'+String(d.getUTCDate()).padStart(2,"0")+'</div>'
           +  '<div class="dmes">'+MES[d.getUTCMonth()]+'</div></div>';
    }
    html += '</div></div></div>';

    for(const setor of SETORES){
      if(!setoresOn.has(setor)) continue;
      const doSetor = runs.filter(r=>r.setor===setor);
      const pc = doSetor.reduce((s,r)=>s+r.pecas,0), kg = doSetor.reduce((s,r)=>s+r.kg,0);
      const temNaJanela = doSetor.some(r=>r.fim>=inicio && r.ini<inicio+larg);
      const e = estado.get(setor);
      const aberto = e ? e==="a" : temNaJanela;
      const resumo = doSetor.length
        ? doSetor.length+' programações · '+pc.toLocaleString("pt-BR")+' peças · '+nkg(kg)+' kg'
          + (temNaJanela ? "" : ' — <b>nada nesta janela</b>')
        : 'sem programação';
      html += '<div class="setor" data-toggle="'+setor+'"><div class="rotulo"><span class="caret">'+(aberto?"▼":"►")+'</span>'
           +  '<b>'+setor+'</b></div><div class="resumo">'+resumo+'</div></div>';
      if(!aberto) continue;

      for(const rec of RECURSOS[setor]){
        const meus = doSetor.filter(r=>r.recurso===rec.k).sort((a,b)=>a.ini-b.ini||b.fim-a.fim);
        const faixas=[];
        for(const r of meus){
          let f = faixas.findIndex(x=>x < r.ini);
          if(f<0){ f=faixas.length; faixas.push(-1); }
          faixas[f]=r.fim; r.faixa=f;
        }
        const naJanela = meus.filter(r=>r.fim>=inicio && r.ini<inicio+larg).length;
        const emp = empurraoDoRecurso(setor, rec.k);
        const alt = naJanela ? Math.max(1,faixas.length)*30 + 8 + 16 : 38;
        html += '<div class="linha'+(rec.k?"":" pousio")+'" data-setor="'+setor+'" data-rec="'+(rec.k||"")+'" '
             +  'data-row="'+setor+'|'+(rec.k||"")+'" style="min-height:'+alt+'px">';
        html += '<div class="rotulo"><b>'+rec.nome+'</b>'
             +  (rec.obs?'<small>'+rec.obs+'</small>':(rec.cap>1?'<small>meta '+nkg(rec.cap)+' kg/dia</small>':'<small>1 bancada-dia</small>'))+'</div>';
        html += '<div class="trilho" style="width:'+(larg*COL)+'px"><div class="celulas">';
        for(const s of janela) html += '<div class="cel'+(fdsISO(s)?" fds":"")+'" data-dia="'+s+'"></div>';
        html += '</div><div class="barras">';
        for(const r of meus){
          if(r.fim<inicio || r.ini>=inicio+larg) continue;
          const a = Math.max(r.ini,inicio), b = Math.min(r.fim, inicio+larg-1);
          const x = (a-inicio)*COL+3, w = (b-a+1)*COL-7;
          const cabe = w >= 200, dias = r.dias, pend = r.pecas-r.feitas;
          const fr = r.pecas>0 ? Math.min(1, r.feitas/r.pecas) : 0;
          /* a parte da barra que já venceu e não foi apontada */
          const atrasados = r.lotes.filter(loteAtrasado);
          const atrasoAte = atrasados.length ? Math.max(...atrasados.map(l=>IDX.get(l.dia))) : -1;
          const larguraAtraso = atrasoAte>=0 ? ((Math.min(atrasoAte,b)-a+1)/(b-a+1))*100 : 0;
          /* ⚠ sábado e domingo passaram a ter coluna (71cef05a), então `DIAS` já não é só dia útil:
             o atraso desconta o fim de semana. Sem isso o que venceu na sexta apareceria como 3 dias
             de atraso na segunda, e a fábrica não trabalhou nesses dois. */
          const diasAtraso = atrasoAte>=0
            ? DIAS.slice(Math.min(...atrasados.map(l=>IDX.get(l.dia))))
                  .filter(d=>d<HOJE && !fdsISO(d)).length : 0;
          const foco = painel && painel.setor===r.setor && painel.recurso===r.recurso && painel.op===r.op && painel.ini===r.ini;
          const dica = "OP-"+r.op+(r.obra?" — "+r.obra:"")+"\n"+rec.nome+" · "
            + (dias>1 ? dbr(DIAS[r.ini])+" a "+dbr(DIAS[r.fim])+" ("+dias+" dias)" : dbr(DIAS[r.ini]))
            + "\n"+r.pecas+" peças · "+nkg(r.kg)+" kg"
            + "\nSyneco apontou "+r.feitas+" de "+r.pecas+" ("+Math.round(fr*100)+"%)"
            + (diasAtraso>0 ? "\n⚠ atrasada "+diasAtraso+" dia(s) úteis — "+pend+" peça(s) pendentes" : "")
            + (r.semGrd ? "\n"+r.semGrd+" projeto(s) ainda sem GRD impressa" : "\nprojetos todos impressos")
            + "\n\nclique para ver os projetos · arraste para remanejar";
          html += '<div class="barra-op'+(r.mexida?" mexida":"")+(foco?" foco":"")+(diasAtraso>0?" atrasada":"")+'" data-run="'+r.id+'" '
               +  'title="'+dica.replace(/"/g,"&quot;")+'" style="left:'+x+'px;width:'+w+'px;top:'+(r.faixa*30+5)+'px;'
               +  '--c:'+corDaOp(r.op)+';--ct:'+tintaOp(r.op)+'">'
               +  (fr>0?'<div class="prog" style="width:'+(fr*100).toFixed(1)+'%"></div>':"")
               +  (larguraAtraso>0?'<div class="atrasado" style="width:'+larguraAtraso.toFixed(1)+'%"></div>':"")
               +  '<b>OP-'+r.op+'</b><span>'+(cabe ? r.pecas+' pç · '+nkg(r.kg)+' kg' : r.pecas+' pç')+'</span>'
               +  (cabe && diasAtraso>0?'<span class="selo atr">atrasada '+diasAtraso+' d</span>':"")
               +  (cabe && r.adiado>0?'<span class="selo">adiada '+r.adiado+'×</span>':"")
               +  (cabe && r.feitas>0?'<span class="selo">'+Math.round(fr*100)+'% · '+pend+' a fazer</span>':"")
               +  (r.semGrd?'<div class="semgrd" title="'+r.semGrd+' sem GRD"></div>':"")
               +  (r.ini<inicio?'<div class="corta e">◀</div>':"")+(r.fim>inicio+larg-1?'<div class="corta d">▶</div>':"")
               +  '</div>';
        }
        /* ⚠ SOMBRA = PREVISÃO, NÃO PROGRAMAÇÃO. Onde a OP cai se o atraso não for recuperado. Nada
           disso está no banco: vira alteração pendente só quando o PCP aplicar, e programação só
           depois do "Salvar". Desenhar direto no lugar novo faria a tela mentir sobre o que está
           gravado - foi exatamente essa confusão que escondeu 87 conjuntos da Larissa em 04/09. */
        html += sombrasDoEmpurrao(meus, emp, inicio, larg);
        html += '</div>'+(naJanela?'<div class="cargas">':'<div class="cargas" hidden>');
        for(const s of janela){
          const o = ocup(setor, rec.k, s);
          html += '<div class="cg '+classeOc(o)+(fdsISO(s)?" fds":"")+'">'
               +  (o>0 ? '<div class="f" style="width:'+Math.min(100,o*100)+'%"></div>' : "")
               +  (o>=0.005 ? '<span>'+rotuloOc(o)+'</span>' : "")+'</div>';
        }
        html += '</div></div></div>';
      }
    }
    grade.innerHTML = html;
    $("periodo").textContent = dbr(janela[0])+" a "+dbr(janela[larg-1])+" · "+d0(janela[0]).getUTCFullYear();
    for(const el of grade.querySelectorAll(".barra-op")) el.addEventListener("pointerdown", pegar);
  }

  /* ── arraste ────────────────────────────────────────────────────────────────── */
  let arr = null;
  const BORDA = 46, PASSO = 16;
  // Recebe o estado por parâmetro em vez de fechar sobre `arr`. A versão que fechava
  // sobre `arr` estourou "Cannot set properties of null" assim que existiu um segundo
  // gesto de arraste na tela; hoje só existe um de novo, mas depender de uma variável
  // global é a armadilha que já pegou uma vez.
  function autoRolar(e, st){
    if(!st) return;
    const rol = raiz.querySelector(".rolagem"), r = rol.getBoundingClientRect();
    let vy=0, vx=0;
    if(e.clientY < r.top+BORDA) vy=-PASSO; else if(e.clientY > r.bottom-BORDA) vy=PASSO;
    if(e.clientX < r.left+BORDA) vx=-PASSO; else if(e.clientX > r.right-BORDA) vx=PASSO;
    if(!vy && !vx){ st.rolando=null; return; }
    st.rolando = {vx,vy};
    if(st.raf) return;
    const passo = ()=>{ if(!st.rolando){ st.raf=null; return; }
      rol.scrollTop += st.rolando.vy; rol.scrollLeft += st.rolando.vx; st.raf = requestAnimationFrame(passo); };
    st.raf = requestAnimationFrame(passo);
  }
  function limparAlvos(){ for(const c of grade.querySelectorAll(".cel.alvo,.cel.proibido")) c.classList.remove("alvo","proibido"); }
  function pegar(e){
    if(e.button!==0) return;
    const el = e.currentTarget;
    const r = montarRuns().find(x=>x.id===el.dataset.run); if(!r) return;
    const cx = el.getBoundingClientRect();
    arr = { el, r, x0:e.clientX, y0:e.clientY, dx:e.clientX-cx.left, dy:e.clientY-cx.top, alvo:null, moveu:false,
            offCols: Math.max(0, Math.floor((e.clientX-cx.left)/COL)) };
    const g = el.cloneNode(true);
    g.className = "barra-op fantasma"; g.style.width = cx.width+"px"; g.style.height = cx.height+"px";
    g.style.left = cx.left+"px"; g.style.top = cx.top+"px"; g.style.background = el.style.background;
    raiz.appendChild(g); arr.g = g;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once:true });
    e.preventDefault();
  }
  function mover(e){
    if(!arr) return;
    if(!arr.moveu && Math.abs(e.clientX-arr.x0)+Math.abs(e.clientY-arr.y0) < 5) return;
    if(!arr.moveu){ arr.moveu = true; arr.el.classList.add("arrastando"); document.body.style.userSelect="none"; }
    autoRolar(e, arr);
    arr.g.style.left = (e.clientX-arr.dx)+"px";
    arr.g.style.top  = (e.clientY-arr.dy)+"px";
    arr.g.style.display="none";
    const sob = document.elementFromPoint(e.clientX, e.clientY);
    arr.g.style.display="";
    limparAlvos(); arr.alvo = null;
    const cel = sob && sob.closest(".cel"), lin = sob && sob.closest(".linha[data-row]");
    if(!cel || !lin) return;
    const setor = lin.dataset.setor, rec = lin.dataset.rec || null;
    const permitido = setor === arr.r.setor;
    const dur = arr.r.fim - arr.r.ini + 1;
    const cels = [...lin.querySelectorAll(".cel")];
    // ⚠ SOLTAR NO FIM DE SEMANA ESCORREGA PARA A SEGUNDA. Matheus (05/09/2026): "os
    // sábados e domingo por padrão pule eles". Mover o bloco é a operação de todo dia e
    // não pode plantar trabalho no sábado por descuido; para isso existe a ponta da
    // barra, que é deliberada. A prévia já mostra onde vai cair, então não há surpresa
    // depois de soltar.
    const jBruto = Math.max(0, cels.indexOf(cel) - arr.offCols);
    const j = Math.max(0, encostaNoUtil(inicio + jBruto) - inicio);
    for(let k=0;k<dur;k++){ const c = cels[j+k]; if(c) c.classList.add(permitido?"alvo":"proibido"); }
    if(!permitido || !cels[j]) return;
    arr.alvo = { setor, recurso:rec, iAlvo: inicio + j };
    const rc = cels[j].getBoundingClientRect();
    arr.g.style.left = (rc.left+3)+"px"; arr.g.style.top = (rc.top+5)+"px"; arr.g.style.width = (dur*COL-7)+"px";
  }
  function soltar(){
    window.removeEventListener("pointermove", mover);
    if(!arr) return;
    if(arr.raf) cancelAnimationFrame(arr.raf);
    arr.g.remove(); arr.el.classList.remove("arrastando"); limparAlvos();
    document.body.style.userSelect = "";
    const a = arr.alvo, r = arr.r, moveu = arr.moveu; arr = null;
    if(!moveu){ abrirPainel(r); return; }
    if(!a){ desenhar(); return; }
    const delta = a.iAlvo - r.ini;
    if(delta===0 && a.recurso===r.recurso){ desenhar(); return; }
    const antes = r.lotes.map(l=>({...l, itens:l.itens}));
    // Cair num sábado escorrega para a segunda. A guarda do `fdsISO(l.dia)` cobre o lote
    // que JÁ esteja num fim de semana — só se veio assim do banco, programado por fora
    // desta tela: mover o bloco não é lugar de desfazer isso em silêncio.
    const novos = r.lotes.map(l=>{
      const cru = Math.max(0, Math.min(DIAS.length-1, IDX.get(l.dia)+delta));
      const destino = fdsISO(l.dia) ? cru : encostaNoUtil(cru);
      return novoLote({ ...l, itens:l.itens, recurso: a.recurso, dia: DIAS[destino] });
    });
    registrar({
      setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg,
      rotulo: (r.recurso!==a.recurso ? '<b>'+nomeRec(r.setor,r.recurso)+'</b><span class="seta">→</span><b>'+nomeRec(a.setor,a.recurso)+'</b> · ' : '<b>'+nomeRec(a.setor,a.recurso)+'</b> · ')
             + (delta ? '<b>'+dbr(DIAS[r.ini])+'</b><span class="seta">→</span><b>'+dbr(DIAS[r.ini+delta])+'</b>' : '<b>'+dbr(DIAS[r.ini])+'</b>'),
      antes, novos,
    });
    if(painel && painel.setor===r.setor && painel.op===r.op && painel.ini===r.ini)
      painel = { setor:r.setor, recurso:a.recurso, op:r.op, ini:r.ini+delta };
    redesenhar();
  }

  /* ── aplicar / desfazer ─────────────────────────────────────────────────────── */
  function registrar(alt){
    for(const l of alt.antes){ const i = lotes.findIndex(x=>x.uid===l.uid); if(i>=0) lotes.splice(i,1); }
    for(const n of alt.novos) lotes.push(recalc(n));
    mesclar();
    alt.depois = alt.novos.map(n=>({ recurso:n.recurso, dia:n.dia, ids:n.itens.map(i=>i.id) }));
    alt.ids = new Set(alt.antes.flatMap(l=>l.itens.map(i=>i.id)));
    alteracoes.push(alt);
  }
  function desfazer(i){
    const a = alteracoes[i]; if(!a) return;
    if(alteracoes.slice(i+1).some(b=>[...b.ids].some(id=>a.ids.has(id)))){
      alert("Há uma alteração mais recente sobre as mesmas peças.\nDesfaça primeiro a de baixo.");
      return;
    }
    const restantes = [];
    for(const l of lotes){
      const fica = l.itens.filter(x=>!a.ids.has(x.id));
      if(fica.length === l.itens.length){ restantes.push(l); continue; }
      if(fica.length){ l.itens = fica; restantes.push(recalc(l)); }
    }
    lotes = restantes;
    for(const l of a.antes) lotes.push(novoLote({ ...l, itens:l.itens }));
    mesclar();
    alteracoes.splice(i,1);
    redesenhar();
  }
  /* ⚠ estes dois handlers moravam DENTRO de `redesenhar`, que não roda no init: "Atualizar" e "Tela
     cheia" ficavam mortos até o usuário navegar o período ou arrastar alguma barra. */
  $("recarregar").onclick = ()=>recarregar();
  $("cheio").onclick = ()=>{
    const c = raiz.classList.toggle("cheio");
    $("cheio").textContent = c ? "Sair da tela cheia" : "Tela cheia";
    desenhar();
  };

  function redesenhar(){ desenhar(); pintarAlteracoes(); pintarEmpurrao(); if(painel) pintarPainel(); }

  function pintarAlteracoes(){
    const ul = $("listaAlt");
    $("nAlt").textContent = alteracoes.length;
    $("semAlt").style.display = alteracoes.length ? "none" : "";
    for(const b of ["desfazer","limpar","salvar"]) $(b).disabled = !alteracoes.length;
    ul.innerHTML = alteracoes.map((a,i)=>
      '<li><span class="tag" style="background:'+COR_SETOR[a.setor]+'">'+a.setor+'</span>'
      + '<b>OP-'+a.op+'</b><span class="de-para">'+a.rotulo+'</span>'
      + '<span class="de-para">'+a.pecas+' pç · '+nkg(a.kg)+' kg</span>'
      + '<button class="li-x" data-i="'+i+'" title="desfazer esta">✕</button></li>').join("");
    for(const b of ul.querySelectorAll(".li-x")) b.onclick = ()=>desfazer(+b.dataset.i);
  }

  /* ── painel: projetos + quebra ──────────────────────────────────────────────── */
  function abrirPainel(r){
    painel = { setor:r.setor, recurso:r.recurso, op:r.op, ini:r.ini };
    abaP = "projetos"; selMarcas = new Set(); soNaoImpressos = false;
    quebraBancadas = null; quebraDias = r.dias;
    $("painel").hidden = false;
    desenhar(); pintarPainel();
  }
  function fecharPainel(){ painel = null; $("painel").hidden = true; desenhar(); }

  function pintarPainel(){
    const r = acharRun(painel);
    if(!r){ fecharPainel(); return; }
    const dias = r.dias;
    $("pOp").textContent = "OP-"+r.op;
    $("pObra").textContent = r.obra || "";
    $("pSub").innerHTML =
      nomeRec(r.setor, r.recurso)+" · " + (dias>1 ? dbr(DIAS[r.ini])+" a "+dbr(DIAS[r.fim])+" ("+dias+" dias)" : dbr(DIAS[r.ini]))
      + " · " + r.pecas.toLocaleString("pt-BR")+" peças · "+nkg(r.kg)+" kg"
      + (r.setor==="CORTE" ? "" : " · "+n1(r.custo)+" dias-bancada")
      + " · <b>"+r.feitas.toLocaleString("pt-BR")+" de "+r.pecas.toLocaleString("pt-BR")+" feitas</b>"
      + " ("+Math.round((r.pecas>0?r.feitas/r.pecas:0)*100)+"%)";
    for(const b of raiz.querySelectorAll(".abas button")) b.classList.toggle("on", b.dataset.aba===abaP);
    if(abaP==="projetos") pintarProjetos(r); else pintarQuebra(r);
  }

  function pintarProjetos(r){
    const itens = [...r.itens].sort((a,b)=> (a.g?1:0)-(b.g?1:0) || String(a.m).localeCompare(String(b.m)));
    const mostra = soNaoImpressos ? itens.filter(i=>!i.g) : itens;
    const teto = 300, corte = mostra.slice(0, teto);
    const semG = itens.filter(i=>!i.g).length;
    let h = '<div class="ptool">'
      + '<b style="color:#8a5600">'+semG+' marca(s) sem GRD</b> · <b style="color:#136c35">'+(itens.length-semG)+' já impressa(s)</b>'
      + '<label><input type="checkbox" id="gp-fSemGrd"'+(soNaoImpressos?" checked":"")+'> só os não impressos</label>'
      + '<button class="btn mini" id="gp-selTodos">Selecionar '+(soNaoImpressos?"os listados":"todos")+'</button>'
      + '<button class="btn mini" id="gp-selNenhum">Limpar</button></div>';
    const temPerfil = itens.some(i=>i.pf);
    h += '<table class="marcas"><thead><tr><th style="width:26px"></th><th>Marca</th>'
      + (temPerfil?'<th>Perfil</th>':'')
      + '<th class="num">Qte</th><th class="num" title="peças com apontamento no Syneco">Feito</th>'
      + '<th class="num">kg</th><th>GRD</th></tr></thead><tbody>';
    for(const i of corte){
      const s = selMarcas.has(i.m);
      h += '<tr class="'+(s?"sel":"")+'"><td><input type="checkbox" class="ck" data-m="'+i.m+'"'+(s?" checked":"")+'></td>'
        + '<td><b>'+i.m+'</b></td>'+(temPerfil?'<td style="color:#5b6a7d">'+(i.pf||"—")+'</td>':'')
        + '<td class="num">'+i.q+'</td>'
        /* ⚠ o `f` é o apontamento do Syneco por marca — o MESMO número que preenche a barra do
           Gantt. Se a coluna e a barra discordassem, uma das duas estaria mentindo. */
        + '<td class="num">'+(i.f
            ? (i.f>=i.q ? '<b style="color:#136c35">'+i.f+'</b>' : i.f)
            : '<span style="color:#aab4c0">—</span>')+'</td>'
        + '<td class="num">'+nkg(i.kg)+'</td>'
        + '<td>'+(i.g
            ? '<span class="pilha ok" title="impressa por '+(i.g.por||"—")+(i.g.n>1?" · "+i.g.n+" cópias":"")+'">✓ '+dbr(i.g.em)+(i.g.n>1?" ·"+i.g.n+"×":"")+'</span>'
            : '<span class="pilha nao">não impressa</span>')+'</td></tr>';
    }
    h += '</tbody></table>';
    if(mostra.length > teto) h += '<div class="dica">Mostrando '+teto+' de '+mostra.length+' marcas. Os botões abaixo agem sobre a lista inteira.</div>';
    h += '<div class="dica"><b>GRD = impressão.</b> No portal não existe estado "liberado" separado: a GRD nasce quando o '
      + 'desenho é impresso, e reimprimir a mesma marca soma uma cópia no registro em vez de criar outra GRD. '
      + 'O ponto amarelo na barra do Gantt marca a programação que ainda tem projeto sem imprimir.</div>';
    $("pCorpo").innerHTML = h;

    const alvo = soNaoImpressos ? mostra : itens;
    $("pFoot").innerHTML =
        '<div class="info">'+(selMarcas.size ? selMarcas.size+" marca(s) selecionada(s)" : "Nada selecionado — os botões usam a lista acima")+'</div>'
      + '<button class="btn pri" id="gp-impFalta"'+(semG?"":" disabled")+'>Imprimir as '+semG+' sem GRD</button>'
      + '<button class="btn" id="gp-impSel"'+(selMarcas.size?"":" disabled")+'>Reimprimir selecionados</button>';

    $("fSemGrd").onchange = (e)=>{ soNaoImpressos = e.target.checked; pintarPainel(); };
    $("selTodos").onclick = ()=>{ for(const i of alvo) selMarcas.add(i.m); pintarPainel(); };
    $("selNenhum").onclick = ()=>{ selMarcas.clear(); pintarPainel(); };
    for(const c of raiz.querySelectorAll("#gp-pCorpo .ck"))
      c.onchange = ()=>{ if(c.checked) selMarcas.add(c.dataset.m); else selMarcas.delete(c.dataset.m); pintarPainel(); };
    const im = $("impFalta");
    if(im) im.onclick = ()=>imprimir(r, itens.filter(i=>!i.g).map(i=>i.m), "primeira impressão");
    const is = $("impSel");
    if(is) is.onclick = ()=>imprimir(r, [...selMarcas], "reimpressão");
  }

  const SETOR_GRD = { CORTE:"CORTE", MONTAGEM:"MONTAGEM", SOLDA:"SOLDA" };
  async function imprimir(r, marcas, tipo){
    if(!marcas.length) return;
    if(marcas.length > MAX_LOTE){
      avisar(false, "A rota aceita no máximo "+MAX_LOTE+" marcas por vez (são "+marcas.length+"). Use a seleção para dividir em blocos.");
      return;
    }
    if(!confirm("Imprimir "+marcas.length+" desenho(s) da OP-"+r.op+" ("+tipo+")?\n\nCada um sai carimbado com a rastreabilidade e a GRD fica registrada. Pode levar alguns minutos.")) return;
    const foot = $("pFoot"); foot.querySelectorAll("button").forEach(b=>b.disabled=true);
    try{
      const bancadaPorMarca = {};
      if(r.setor!=="CORTE" && r.recurso) for(const m of marcas) bancadaPorMarca[m] = r.recurso;
      const res = await fetch("/api/producao/desenhos/lote", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ opNumero:r.op, marcas, setor: SETOR_GRD[r.setor], acao:"IMPRIMIR",
                               ...(Object.keys(bancadaPorMarca).length ? { bancadaPorMarca } : {}) }),
      });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Erro ao emitir o lote");
      const emitidas = Number(j.emitidas) || 0;
      const sem = j.semDesenho?.length || 0;
      const faltantes = sem ? " Sem desenho na pasta da OP: "+j.semDesenho.slice(0,8).join(", ")+(sem>8?" e mais "+(sem-8):"")+"." : "";
      if(!emitidas){
        avisar(false, "Nenhum desenho foi encontrado para as "+marcas.length+" marca(s), então nada foi impresso nem liberado."+faltantes
          + " Confira se os PDFs estão em 2. Engenharia › 2.5 Projetos › 2.5.2 Fabricação, com o nome começando pela marca.");
        return;
      }
      let erroZip = null;
      try{ await baixarZip(j, r.op, r.setor.toLowerCase()); }catch(e){ erroZip = e?.message || "falhou"; }
      avisar(!erroZip, emitidas+" desenho(s) liberado(s)"
        + (erroZip ? ", mas o download falhou ("+erroZip+"). A GRD está registrada; abra os arquivos pela pasta da OP."
                   : " e baixado(s) em pastas por impressora.") + faltantes);
      await recarregar();
    }catch(e){ avisar(false, e.message); }
    finally{ foot.querySelectorAll("button").forEach(b=>b.disabled=false); }
  }

  /* ── quebra da programação ──────────────────────────────────────────────────── */
  function pintarQuebra(r){
    const recs = RECURSOS[r.setor].filter(x=>x.k);
    const cortePorMaquina = r.setor==="CORTE";   // no corte a máquina é UMA só
    if(quebraBancadas===null) quebraBancadas = new Set(r.recurso ? [r.recurso] : []);
    let h = '<div class="bloco"><h4>'+(cortePorMaquina?"Máquina":"Bancadas que vão receber")+'</h4><div class="chips">';
    const meus = new Set(r.lotes.map(l=>l.uid));
    for(const x of recs){
      let o = 0;
      for(const i of diasDaQuebra(r.ini, quebraDias)) o = Math.max(o, ocup(r.setor, x.k, DIAS[i], meus));
      h += '<button class="chip'+(quebraBancadas.has(x.k)?" on":"")+'" data-b="'+x.k+'">'+x.nome
        + ' <small class="'+classeOc(o)+'">'+(o>0?rotuloOc(o):"livre")+'</small></button>';
    }
    h += '</div><div class="dica" style="padding:8px 0 0;background:none">'
      + (cortePorMaquina
          ? '<b>No corte não se reparte entre máquinas:</b> a peça vai para o laser que corta o perfil dela — chapa não vai '
            + 'para o laser de tubo. Aqui a divisão <b>espalha por mais dias</b> na mesma máquina; trocar a máquina de peças '
            + 'específicas é na tela de atribuição.'
          : 'A porcentagem é o pior dia que a bancada <b>já tem</b> no período de outras programações — a divisão desconta '
            + 'isso antes de repartir.')
      + '</div></div>';
    h += '<div class="bloco"><h4>Em quantos dias</h4>'
      + '<div style="display:flex;align-items:center;gap:9px">'
      + '<input class="num-in" type="number" min="1" max="15" id="gp-qDias" value="'+quebraDias+'">'
      + '<span style="color:#5b6a7d;font-size:11.5px">a partir de <b>'+dbr(DIAS[r.ini])+'</b>'
      + (fdsISO(DIAS[r.ini]) ? ' · dias corridos, incluindo o fim de semana' : ' · pulando sábado e domingo')+'</span>'
      + '<button class="btn mini" id="gp-qAuto" style="margin-left:auto">Achar o que cabe</button></div></div>';

    const alvos = [...quebraBancadas];
    const plano = fatiar(r, alvos, quebraDias);
    const piorDe = (pl)=>{ const c = pl.slots.filter(s=>s.itens.length).map(s=>(s.base+s.carga)/s.cap);
                           return c.length ? Math.max(...c) : 0; };
    if(!plano){
      h += '<div class="dica" style="color:#a01c1c"><b>Escolha '+(cortePorMaquina?"a máquina":"ao menos uma bancada")+' acima.</b>'
        + (r.recurso ? '' : ' Esta programação ainda está sem '+(cortePorMaquina?"máquina":"bancada")+' definida.')+'</div>';
      $("pCorpo").innerHTML = h;
      $("pFoot").innerHTML = '<button class="btn pri" disabled>Aplicar divisão</button>';
    } else {
      h += '<div class="bloco"><h4>Como ficaria</h4><table class="prev"><thead><tr>'
        + '<th>'+(cortePorMaquina?"Máquina":"Bancada")+'</th><th>Dia</th><th style="text-align:right">Peças</th>'
        + '<th style="text-align:right">kg</th><th style="text-align:right">Ocupação</th></tr></thead><tbody>';
      for(const s of plano.slots.filter(s=>s.itens.length)){
        const o = (s.base + s.carga) / s.cap;
        h += '<tr><td class="b">'+nomeRec(r.setor,s.recurso)+'</td><td>'+dbr(s.dia)+'</td>'
          + '<td style="text-align:right">'+s.itens.reduce((a,i)=>a+i.q,0)+'</td>'
          + '<td style="text-align:right">'+nkg(s.itens.reduce((a,i)=>a+i.kg,0))+'</td>'
          + '<td style="text-align:right" class="oc '+classeOc(o)+'">'+rotuloOc(o)+'</td></tr>';
      }
      h += '</tbody></table>';
      const pior = piorDe(plano);
      const cheias = plano.slots.filter(s=>!s.itens.length && s.base >= s.cap);
      h += '<div class="dica" style="padding:9px 0 0;background:none">'
        + (pior>1 ? '⚠ Mesmo dividido, o pior dia fica em <b>'+Math.round(pior*100)+'%</b>. Aumente os dias ou some outra bancada.'
                  : 'Nenhum dia passa de 100% — a divisão cabe.')
        + (cheias.length ? '<br>'+cheias.length+' bancada-dia ficou de fora por já estar cheia com outra programação: '
            + cheias.slice(0,4).map(s=>'<b>'+nomeRec(r.setor,s.recurso)+' '+dbr(s.dia)+'</b> ('+Math.round(s.base/s.cap*100)+'%)').join(", ")
            + (cheias.length>4 ? " e mais "+(cheias.length-4) : "") : "")
        + '</div></div>';
      h += '<div class="dica">A divisão usa a mesma regra do portal: <b>o conjunto mais caro entra primeiro</b>, sempre na '
        + 'bancada-dia mais livre. Equilibra <b>trabalho</b> (dias-bancada), não peso nem contagem — repartir "metade do peso '
        + 'para cada" empata por acaso e entrega a obra na mão errada.</div>';
      $("pCorpo").innerHTML = h;
      $("pFoot").innerHTML =
          '<div class="info">'+r.pecas+' peças · hoje em <b>'+r.dias+' dia(s)</b> '
        + (r.recurso ? 'na '+nomeRec(r.setor,r.recurso) : 'sem '+(cortePorMaquina?"máquina":"bancada"))
        + ' <span class="seta">→</span> passariam a ocupar <b>'+plano.usados+' '
        + (cortePorMaquina?"dia(s)":"bancada-dia(s)")+'</b>.</div>'
        + '<button class="btn pri" id="gp-aplicar">Aplicar divisão</button>';
      $("aplicar").onclick = ()=>aplicarQuebra(r, plano, cortePorMaquina);
    }
    for(const c of raiz.querySelectorAll("#gp-pCorpo .chip"))
      c.onclick = ()=>{ const b=c.dataset.b;
        if(cortePorMaquina){ quebraBancadas = quebraBancadas.has(b) ? new Set() : new Set([b]); }
        else if(quebraBancadas.has(b)) quebraBancadas.delete(b); else quebraBancadas.add(b);
        pintarPainel(); };
    const qd = $("qDias");
    if(qd) qd.onchange = ()=>{ quebraDias = Math.max(1, Math.min(15, +qd.value||1)); pintarPainel(); };
    const qa = $("qAuto");
    if(qa) qa.onclick = ()=>{
      const bcs = [...quebraBancadas];
      let escolhido = null, melhorPior = Infinity, melhorD = 1;
      for(let d=1; d<=15; d++){
        const pl = fatiar(r, bcs, d); if(!pl) break;
        const pior = piorDe(pl);
        if(pior < melhorPior - 1e-6){ melhorPior = pior; melhorD = d; }
        if(pior <= 1.0001){ escolhido = d; break; }
      }
      quebraDias = escolhido || melhorD;
      pintarPainel();
    };
  }

  /* reparte os itens do run entre (bancadas × dias), descontando o que a célula já tem de OUTRAS OPs */
  function fatiar(r, bancadas, nDias){
    bancadas = bancadas.filter(b=>b && capDe(r.setor, b) > 0);
    if(!bancadas.length) return null;
    const meus = new Set(r.lotes.map(l=>l.uid));
    const slots = [];
    const cols = diasDaQuebra(r.ini, nDias);
    for(const b of bancadas) for(const i of cols){
      const dia = DIAS[i];
      const cap = capDe(r.setor, b);
      slots.push({ recurso:b, dia, cap, base: carga(r.setor, b, dia, meus), carga:0, itens:[] });
    }
    const ord = [...r.itens].sort((a,b)=>custoItem(b,r.setor)-custoItem(a,r.setor));
    for(const it of ord){
      let alvo = slots[0], livre = -Infinity;
      for(const s of slots){ const l = s.cap - s.base - s.carga; if(l > livre + 1e-9){ livre = l; alvo = s; } }
      alvo.itens.push(it); alvo.carga += custoItem(it, r.setor);
    }
    return { slots, usados: slots.filter(s=>s.itens.length).length };
  }

  function aplicarQuebra(r, plano, cortePorMaquina){
    const antes = r.lotes.map(l=>({...l, itens:l.itens}));
    const novos = plano.slots.filter(s=>s.itens.length).map(s=>novoLote({
      setor:r.setor, recurso:s.recurso, dia:s.dia, op:r.op, obra:r.obra,
      recursoOrig: antes[0].recursoOrig, diaOrig: antes[0].diaOrig, adiado: r.adiado,
      itens: s.itens, pecas:0, kg:0, custo:0, feitas:0,
    }));
    const nB = new Set(novos.map(n=>n.recurso)).size, nD = new Set(novos.map(n=>n.dia)).size;
    registrar({
      setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg, antes, novos,
      rotulo: '<b>quebrada</b> em <b>'+nB+' '+(cortePorMaquina?"máquina":"bancada")+(nB>1?"s":"")+'</b> × <b>'+nD+' dia'+(nD>1?"s":"")+'</b>'
            + ' <span class="de-para">('+dbr(novos[0].dia)+' a '+dbr(novos[novos.length-1].dia)+')</span>',
    });
    painel = null; $("painel").hidden = true;
    redesenhar();
  }

  /* ── o que seria gravado ────────────────────────────────────────────────────── */
  $("salvar").onclick = async ()=>{
    if(!alteracoes.length) return;
    const blocos = [];
    for(const a of alteracoes) for(const d of a.depois) blocos.push({ setor:a.setor, ids:d.ids, recurso:d.recurso, dia:d.dia });
    const pecas = alteracoes.reduce((s,a)=>s+a.pecas,0);
    if(!confirm("Gravar "+alteracoes.length+" alteração(ões) de programação ("+pecas+" peças)?\n\nIsto muda o dia e o recurso das peças no portal.")) return;
    const b = $("salvar"); b.disabled = true; b.textContent = "Salvando…";
    try{
      const res = await fetch("/api/pcp/gantt", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ blocos }) });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Erro ao salvar");
      avisar(true, j.total+" peça(s) reprogramada(s).");
      alteracoes = [];
      await recarregar();
    }catch(e){ avisar(false, e.message); b.disabled=false; }
    finally{ b.textContent = "Salvar programação"; }
  };

  $("desfazer").onclick = ()=>desfazer(alteracoes.length-1);
  $("limpar").onclick = ()=>{ for(let k=alteracoes.length-1;k>=0;k--) desfazer(k); };

  /* ── controles ──────────────────────────────────────────────────────────────── */
  // 7 e não 5: o botão diz "Semana", e semana agora tem sete colunas.
  $("ant").onclick = ()=>{ inicio=Math.max(0,inicio-7); redesenhar(); };
  $("prox").onclick = ()=>{ inicio=Math.min(DIAS.length-JANELA,inicio+7); redesenhar(); };
  $("agora").onclick = ()=>{ inicio = janelaMaisCheia(); redesenhar(); };
  for(const b of raiz.querySelectorAll(".barra [data-setor]")){
    b.onclick = ()=>{ const s=b.dataset.setor;
      if(setoresOn.has(s)) setoresOn.delete(s); else setoresOn.add(s);
      b.classList.toggle("on", setoresOn.has(s)); redesenhar(); };
  }
  $("regua").onclick = ()=>{
    regua = regua==="normal" ? "meta" : "normal";
    const b=$("regua");
    b.textContent = regua==="normal" ? "Ritmo normal" : "Ritmo meta";
    b.classList.toggle("on", regua==="normal"); redesenhar();
  };
  grade.addEventListener("click",(e)=>{
    const t = e.target.closest("[data-toggle]"); if(!t) return;
    const s=t.dataset.toggle;
    estado.set(s, grade.querySelector('[data-setor="'+s+'"]') ? "f" : "a"); desenhar();
  });
  $("pFechar").onclick = fecharPainel;
  for(const b of raiz.querySelectorAll(".abas button")) b.onclick = ()=>{ abaP=b.dataset.aba; pintarPainel(); };
  const aoTeclar = (e)=>{ if(e.key==="Escape" && painel) fecharPainel(); };
  window.addEventListener("keydown", aoTeclar);

  /* ── o atraso e o empurrão que ele causa ────────────────────────────────────
     ⚠ UM LUGAR SÓ PARA A DECISÃO. Vitor (05/09/2026): "são decisões que o PCP vai analisar e irá
     decidir o que será feito, o problema é como isso iria funcionar na tela dela para não ficar um
     monte de botão e confuso para todos". Então nenhum botão novo nas barras: conviver com o atraso
     já tem gesto (arrastar), e o atalho de fazer isso de uma vez mora na barra de ferramentas, que
     já existe - aparece quando há atraso e some quando não há.
     ⚠ POR QUE NÃO NA FAIXA DE VENCIDO: ela foi removida de propósito em f1315a74, junto com o CSS
     `.aviso`. Ressuscitar a faixa só para pendurar um botão desfaria essa limpeza por baixo.
     ⚠ O EMPURRÃO NÃO GRAVA. Entra como alteração PENDENTE, igual a um arraste; quem grava continua
     sendo o "Salvar programação". Foi a escolha do Vitor em vez de o portal reescrever datas
     sozinho - programação invisível foi o que escondeu 87 conjuntos da Larissa em 04/09.
     ⚠ lê `lotes` (estado vivo), não `LOTES`: depois de um arraste o atraso muda, e um botão
     congelado no carregamento mandaria empurrar o que já foi resolvido. */
  function recursosComEmpurrao(){
    const vistos = new Map();
    for(const l of lotes){
      const k = l.setor+"|"+(l.recurso||"—");
      if(vistos.has(k)) continue;
      const d = empurraoDoRecurso(l.setor, l.recurso);
      if(d>0) vistos.set(k, { setor:l.setor, recurso:l.recurso, dias:d });
    }
    return [...vistos.values()];
  }
  function aplicarEmpurrao(){
    const porRec = new Map(recursosComEmpurrao().map(r=>[r.setor+"|"+(r.recurso||"—"), r.dias]));
    if(!porRec.size) return;
    /* ⚠ do dia mais longe para o mais perto: mover primeiro quem está atrás faria o lote pousar em
       cima de outro que ainda não saiu do lugar, e `mesclar` juntaria os dois. */
    const alvos = montarRuns()
      .filter(r=>DIAS[r.ini] >= HOJE && porRec.get(r.setor+"|"+(r.recurso||"—")))
      .sort((a,b)=>b.ini-a.ini);
    for(const r of alvos){
      const d = porRec.get(r.setor+"|"+(r.recurso||"—"));
      const antes = r.lotes.map(l=>({...l, itens:l.itens}));
      /* mesma regra do arraste: cair no sábado escorrega para a segunda, e quem JÁ estava no fim de
         semana continua lá - o empurrão não é lugar de desfazer uma decisão de alguém. */
      const novos = r.lotes.map(l=>{
        const cru = Math.max(0, Math.min(DIAS.length-1, IDX.get(l.dia)+d));
        return novoLote({ ...l, itens:l.itens, dia: DIAS[fdsISO(l.dia) ? cru : encostaNoUtil(cru)] });
      });
      registrar({ setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg,
        rotulo: '<b>'+nomeRec(r.setor,r.recurso)+'</b> · <b>'+dbr(DIAS[r.ini])+'</b><span class="seta">→</span>'
              + '<b>'+dbr(DIAS[Math.min(DIAS.length-1, r.ini+d)])+'</b> · atraso',
        antes, novos });
    }
    redesenhar();
  }
  function pintarEmpurrao(){
    const b = $("empurrar"); if(!b) return;
    const recs = recursosComEmpurrao();
    if(!recs.length){ b.hidden = true; return; }
    b.hidden = false;
    b.textContent = "Empurrar o que vem depois (+"+Math.max(...recs.map(r=>r.dias))+" d)";
    b.title = "o atraso consome " + recs.map(r=>nomeRec(r.setor,r.recurso)+": +"+r.dias+"d").join(" · ")
            + "\nentra como alteração pendente — só o Salvar grava";
  }
  $("empurrar").onclick = aplicarEmpurrao;
  pintarEmpurrao();

  desenhar(); pintarAlteracoes();

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      if(arr?.raf) cancelAnimationFrame(arr.raf);
      document.body.style.userSelect = "";
    };

}

export default function GanttProgramacao() {
  const caixa = useRef(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/gantt");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar a programação");
      setDados(j);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  // ⚠ o quadro é remontado do zero a cada carga: é o que garante que "Salvar" e "Imprimir" mostrem
  // o estado que está no banco, sem sobrar alteração pendente de uma sessão que já foi gravada.
  useEffect(() => {
    const raiz = caixa.current;
    if (!raiz || !dados) return;
    raiz.innerHTML = MARKUP;
    const avisar = (ok, texto) => {
      const el = raiz.querySelector("#gp-aviso");
      if (!el) return;
      el.innerHTML = "";
      const d = document.createElement("div");
      d.className = "avisoTela " + (ok ? "ok" : "ruim");
      d.innerHTML = "<span>" + String(texto).replace(/</g, "&lt;") + "</span>";
      const x = document.createElement("button");
      x.textContent = "fechar"; x.onclick = () => { el.innerHTML = ""; };
      d.appendChild(x); el.appendChild(d);
    };
    const limpar = iniciar(raiz, dados.lotes, dados.hoje, {
      avisar, recarregar: buscar, baixarZip: baixarZipLote,
    });
    return () => { if (typeof limpar === "function") limpar(); raiz.innerHTML = ""; };
  }, [dados, buscar]);

  if (carregando && !dados) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 flex items-center justify-center gap-3 text-torg-gray">
        <Loader2 size={20} className="animate-spin" /> Carregando a programação…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
        <button onClick={buscar} className="ml-auto text-xs underline">tentar de novo</button>
      </div>
    );
  }
  return (
    <>
      <style>{CSS}</style>
      <div className="gpcp" ref={caixa} />
    </>
  );
}
