// ─── CSS DO QUADRO DE PROGRAMAÇÃO ──────────────────────────────────────────────────────────────
//
// ⚠ TODO PREFIXADO POR `.gpcp`: são regras de grade/faixa/barra que não existem no Tailwind do
// portal, e sem o prefixo elas vazariam para o resto da tela do PCP.
//
// Vive em arquivo próprio porque são ~230 linhas de string que ninguém lê junto com a lógica —
// separá-las é o que deixa o resto do quadro caber num arquivo que se lê de uma sentada.

export const CSS = `
  .gpcp{
    --alt:max(740px, calc(100dvh - 32px)); position:relative; margin:0; color:var(--tinta); font-size:13px;
    --navy:#0D1F3C; --laranja:#F4801F; --azul:#006EAB;
    --tinta:#16202e; --tinta-2:#5b6a7d; --linha:#e3e8ef; --fundo:#f4f6f9; --papel:#fff;
    --ok:#0f9d58; --alerta:#d98700; --ruim:#c62828;
    --col:106px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }
  .gpcp .wrap{height:var(--alt);min-height:0;display:flex;flex-direction:column}
  .gpcp .topo, .gpcp .barra{flex:0 0 auto}

  .gpcp .topo{background:var(--navy);border-radius:10px 10px 0 0;padding:10px 18px;color:#fff;
        border-bottom:3px solid var(--laranja);display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap}
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
  /* ⚠ APAGAR PROGRAMAÇÃO é destrutivo e fica ao lado de botões que não são — a cor é o que separa
     "distribuir" de "sair da fila" num rodapé onde os dois ficam a um clique de distância. */
  .gpcp .btn.perigo{border-color:#dc2626;color:#b91c1c}
  .gpcp .btn.perigo:hover:not([disabled]){background:#fee2e2}
  .gpcp dialog .pe .btn.perigo{background:#dc2626;border-color:#dc2626;color:#fff}
  .gpcp dialog .pe .btn.perigo:hover:not([disabled]){background:#b91c1c}
  .gpcp .btn.on{background:var(--navy);border-color:var(--navy);color:#fff}
  .gpcp .btn.mini{padding:3px 8px;font-size:11px}
  .gpcp .topo .ampliar{margin-left:auto;background:var(--laranja);border-color:var(--laranja);color:#fff;padding:7px 14px;white-space:nowrap}
  .gpcp .topo .ampliar:hover{background:#d96a12;border-color:#d96a12}
  .gpcp .periodo{font-weight:700;font-size:13px;min-width:180px;text-align:center}
  .gpcp .sep{width:1px;height:22px;background:var(--linha)}
  .gpcp .rot{font-size:11px;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.5px;font-weight:700}
  .gpcp .leg{display:flex;gap:10px;align-items:center;font-size:11px;color:var(--tinta-2);margin-left:auto}
  .gpcp .leg i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:4px}

  .gpcp /* ── grade ─────────────────────────────────────────────────────── */
  .quadro{flex:1 1 auto;min-height:0;display:flex;background:var(--papel);
          border:1px solid var(--linha);border-top:0;border-radius:0 0 10px 10px;overflow:hidden}
  .gpcp .rolagem{flex:1 1 auto;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
  .gpcp .linha{display:flex;align-items:stretch;border-bottom:1px solid var(--linha)}
  .gpcp .rotulo{flex:0 0 186px;position:sticky;left:0;z-index:4;background:var(--papel);
          box-shadow:3px 0 4px -3px rgba(13,31,60,.18);
          border-right:2px solid var(--linha);padding:6px 10px;display:flex;flex-direction:column;
          justify-content:center;gap:1px}
  .gpcp .rotulo b{font-size:12px;font-weight:700}
  .gpcp .rotulo small{font-size:10.5px;color:var(--tinta-2)}
  /* ⚠ os dois botões da lista do posto (dia · semana). Sem estilo eles saíam como texto colado —
     o rótulo do Laser Perfil aparecia "diasemana" embaixo do nome, e ninguém entendia o que era. */
  .gpcp .rotulo .lista{display:flex;gap:4px;margin:3px 0 1px}
  .gpcp .rotulo .lista .mini{font-size:9.5px;line-height:1;padding:3px 6px;border-radius:5px;
    border:1px solid var(--linha);background:#fff;color:var(--tinta-2);cursor:pointer}
  .gpcp .rotulo .lista .mini:hover{background:#eef2f7;color:var(--tinta);border-color:#c7d2e0}
  .gpcp .rotulo .lista .mini:disabled{opacity:.5;cursor:default}
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
  /* justify-content:flex-start anula o center do .rotulo base: com flex-direction:row ele passa a
     centralizar na horizontal e cada setor fica deslocado pela largura do proprio nome (escadinha). */
  .gpcp .setor .rotulo{background:#eef2f7;flex-direction:row;align-items:center;justify-content:flex-start;
                 gap:8px;cursor:pointer;border-right:2px solid var(--linha)}
  .gpcp .setor b{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--navy)}
  .gpcp .setor .resumo{background:#eef2f7;font-size:10.5px;color:var(--tinta-2);font-weight:600;
                 padding:5px 8px;white-space:nowrap}
  .gpcp .caret{font-size:9px;color:var(--tinta-2);width:9px}

  /* Avanço apontado preenche toda a altura, na cor da OP em tom suave.
     Texto escuro e posicionado acima mantém a leitura de 0 a 100%. */
  .gpcp .barra-op{position:absolute;height:23px;border-radius:5px;display:flex;align-items:center;gap:6px;
            padding:0 7px;cursor:grab;pointer-events:auto;overflow:hidden;user-select:none;
            background:#f6f8fa;color:#122b40;border:1.5px solid var(--c);
            box-shadow:0 1px 2px rgba(13,31,60,.14);touch-action:none}
  .gpcp .barra-op .prog{position:absolute;left:0;top:0;bottom:0;height:100%;background:var(--c);opacity:.26;
            border-radius:0;pointer-events:none;z-index:1}
  .gpcp .barra-op.terceiro-previsto{border-style:dashed;background:#fff5e8;cursor:pointer}
  .gpcp .barra-op:active{cursor:grabbing}
  .gpcp .barra-op.arrastando{opacity:.35}
  .gpcp .barra-op.foco{outline:2px solid var(--navy);outline-offset:1px}
  /* ⚠⚠ O TEXTO PRECISA DE 'position:relative'. '.prog' e '.atrasado' são absolutos, e elemento
     POSICIONADO pinta por cima de estático mesmo vindo antes no HTML — a faixa de apontamento e a
     hachura de atraso estavam cobrindo o rótulo. Vitor (06/09/2026): "está um pouco ruim para
     visualizar as escritas dentro das barras". */
  .gpcp .barra-op b,
  .gpcp .barra-op span{position:relative; z-index:2}
  .gpcp .barra-op b{font-size:11.5px;font-weight:800;white-space:nowrap;
            color:#122b40;text-shadow:none;flex-shrink:0}
  .gpcp .barra-op span{font-size:10.5px;opacity:1;color:#263f52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                 font-variant-numeric:tabular-nums}
  .gpcp .barra-op .selo{position:relative;z-index:2;margin-left:auto;font-size:9.5px;
                  background:rgba(255,255,255,.87);color:#18354b;flex-shrink:0;border-radius:3px;
                  padding:1px 4px;font-weight:700;white-space:nowrap;border:1px solid transparent}
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
  /* ⚠⚠ NADA DE TEXTURA ATRÁS DO TEXTO. Vitor (06/09/2026): "os atrasados estão ruins ainda" — e
     estava certo: hachura diagonal por trás de letra é ilegível em qualquer opacidade, e numa barra
     100% vencida ela cobria o rótulo inteiro. Eu tinha escrito no comentário anterior que quem
     grita o atraso é a borda e o selo, e mesmo assim mantive a textura.
     O atraso mantém uma faixa sólida no topo:
       topo vermelho   = o pedaço que já venceu
       fundo na cor   = o pedaço que o Syneco já apontou
     A largura da faixa de atraso continua dizendo QUANTO
     venceu, que é a informação que a hachura carregava. */
  .gpcp .barra-op .atrasado{position:absolute;left:0;top:0;height:4px;pointer-events:none;z-index:1;
            background:#c62828;border-radius:0 0 2px 0}
  /* a borda inteira em vermelho é o que identifica a barra atrasada de longe */
  .gpcp .barra-op.atrasada{border-color:#c62828;box-shadow:0 1px 2px rgba(198,40,40,.28)}
  .gpcp .barra-op .selo.atr{background:#c62828;color:#fff;border-color:#c62828}
  .gpcp .sombra{position:absolute;height:23px;border-radius:5px;pointer-events:none;display:flex;
          align-items:center;padding:0 7px;border:1.5px dashed var(--c);background:var(--ct);opacity:.7}
  .gpcp .sombra b{position:relative;z-index:2;font-size:10.5px;font-weight:800;color:var(--c);
            white-space:nowrap}

  .gpcp /* ── alterações ────────────────────────────────────────────────── */
  .pend{flex:0 0 auto;margin-top:6px;background:var(--papel);border:1px solid var(--linha);
        border-radius:10px;overflow:hidden}
  .gpcp .pend h2{margin:0;padding:7px 12px;font-size:12px;background:#fbfcfe;border-bottom:1px solid var(--linha);
           display:flex;align-items:center;gap:10px}
  .gpcp .pend h2 .n{background:var(--laranja);color:#fff;border-radius:11px;padding:1px 9px;font-size:11px}
  .gpcp .pend h2 .acoes{margin-left:auto;display:flex;gap:8px}
  .gpcp .pend ul{list-style:none;margin:0;padding:0;max-height:min(110px,14dvh);overflow:auto}
  .gpcp[data-pendente="false"] .pend .vazio{display:none}
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
  .gpcp .filtro-resumo{justify-content:space-between;background:#f6f9fc}
  .gpcp dialog.filtro-excel{position:fixed;margin:0;padding:14px;width:310px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border:1px solid #ccd9e4;border-radius:10px;box-shadow:0 12px 40px #0e233340;color:var(--navy);font-size:12px;background:white;overflow:auto}
  .gpcp dialog.filtro-excel::backdrop{background:#09243c12}
  .gpcp .filtro-excel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .gpcp .filtro-excel header button{border:0;background:none;font-size:22px;color:#5b6a7d;cursor:pointer}
  .gpcp .filtro-excel input[type=search]{width:100%;padding:8px 10px;border:1px solid #ccd9e4;border-radius:5px;margin-bottom:10px;font:inherit}
  .gpcp .filtro-excel label{display:flex;gap:8px;align-items:center;padding:7px 4px;cursor:pointer;text-align:left}
  .gpcp .filtro-excel input[type=checkbox]{accent-color:#006eab;flex-shrink:0}
  .gpcp .filtro-excel .todos{border-bottom:1px solid #e5edf3;font-weight:600}
  .gpcp .filtro-excel .valores{max-height:min(240px,35dvh);overflow:auto;min-height:45px}
  .gpcp .filtro-excel .valores span{overflow-wrap:anywhere}
  .gpcp .filtro-excel .valores label:hover{background:#eef6fb}
  .gpcp .filtro-excel .contagem{padding:9px 0;color:#5b6a7d;font-size:11px}
  .gpcp .filtro-excel footer{display:flex;justify-content:flex-end;gap:6px;padding-top:10px;border-top:1px solid #e5edf3}
  .gpcp .filtro-coluna.ativo{color:#006eab;background:#e4f2fa;border-radius:4px}
  .gpcp .ptool label{display:flex;align-items:center;gap:5px;cursor:pointer}
  .gpcp table.marcas{width:100%;border-collapse:collapse;font-size:11.5px}
  .gpcp table.marcas th{position:sticky;top:0;background:#fbfcfe;text-align:left;padding:6px 8px;
                  font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--tinta-2);
                  border-bottom:1px solid var(--linha);z-index:1}
  .gpcp .filtro-coluna{display:inline-flex;align-items:center;gap:5px;border:0;background:none;padding:2px 0;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer}
  .gpcp .filtro-coluna span{color:#006eab;font-size:13px}
  .gpcp .filtro-coluna:focus-visible{outline:2px solid #006eab;outline-offset:3px}
  .gpcp table.marcas td{padding:5px 8px;border-bottom:1px solid #f2f5f9;vertical-align:middle}
  .gpcp table.marcas td.num{text-align:right;font-variant-numeric:tabular-nums}
  .gpcp table.marcas tr.sel{background:#eef6fb}
  /* ⚠ o total fica GRUDADO no fim da tabela. O mesmo número existe no cabeçalho do painel, mas ele
     rola para fora assim que a lista anda - e é olhando a lista que se pergunta "quanto disso já
     saiu?". Vitor (05/09/2026): "eu havia pedido que nessa tela você colocasse a quantidade de peças
     totais e quantas foram produzidas". */
  .gpcp table.marcas tfoot td{position:sticky;bottom:0;background:#f4f7fa;padding:7px 8px;
                  border-top:2px solid var(--linha);border-bottom:0;z-index:1}
  .gpcp table.marcas tfoot td.num{text-align:right;font-variant-numeric:tabular-nums}
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

  /* ── a trava do material, antes de imprimir ─────────────────────────────────
     ⚠ O R É POR PERFIL, não por marca (TrocaRastreabilidade é único em opNumero+perfil). Uma
     confirmação solta TODAS as marcas daquele perfil — e a tela diz isso, senão a pessoa confirma
     dez vezes o mesmo aço. */
  .gpcp .trava{width:100%;border-collapse:collapse;font-size:12px}
  .gpcp .trava th{text-align:left;padding:6px 8px;font-size:9.5px;text-transform:uppercase;
            letter-spacing:.06em;color:var(--tinta-2);border-bottom:1px solid var(--linha)}
  .gpcp .trava td{padding:8px;border-bottom:1px solid #f2f5f9;vertical-align:middle}
  .gpcp .trava tr.ok td{background:rgba(19,108,53,.07)}
  .gpcp .trava tr.travada td{background:rgba(198,40,40,.06)}
  .gpcp .trava .rin{width:92px;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;
            padding:4px 7px;border-radius:6px;border:1px solid var(--linha);background:#fbfcfe}
  .gpcp .trava .org{font-size:10px;color:var(--tinta-2);margin-top:2px}
  .gpcp .trava .mot{font-size:10.5px;color:#a01c1c;line-height:1.45}

  .gpcp, .gpcp *{box-sizing:border-box}
  /* O space-y da página não pode acrescentar margem ao quadro fixo e cortar o rodapé. */
  .gpcp.cheio{position:fixed;inset:0;margin:0!important;z-index:60;background:var(--fundo);padding:8px 10px;--alt:calc(100dvh - 16px)}
  .gpcp.cheio .topo p{display:none}
  .gpcp.cheio .barra{gap:6px;padding:6px 10px}
  .gpcp.cheio .topo{padding:7px 12px}
  @media(max-width:900px){
    .gpcp .topo p{display:none}
    .gpcp .pend h2{flex-wrap:wrap;gap:6px}
    .gpcp .pend h2 .acoes{flex-wrap:wrap}
    .gpcp .leg{display:none}
  }
  .gpcp .carregando{display:flex;align-items:center;justify-content:center;gap:10px;height:200px;color:var(--tinta-2)}

  .gpcp .avisoTela{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:8px 18px;
                   border:1px solid var(--linha);border-top:0;line-height:1.5}
  .gpcp .avisoTela.ok{background:#ecfdf3;border-color:#bbf0cd;color:#136c35}
  .gpcp .avisoTela.ruim{background:#fef2f2;border-color:#f6cccc;color:#a01c1c}
  .gpcp .avisoTela button{margin-left:auto;background:none;border:0;text-decoration:underline;
                          cursor:pointer;color:inherit;font-size:11px}
  .gpcp .barra-op.croquis-pendentes{--c:#ffe4e8!important;--ct:#9f1239!important;
    border-color:#e88a9d;animation:gp-croquis-pendentes 2.8s ease-in-out infinite}
  .gpcp .alerta-croqui{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
    width:16px;height:16px;border:1px solid currentColor;border-radius:50%}
  .gpcp .prontidao-pendente{color:#b42336}
  .gpcp .prontidao-ok{color:#136c35}
  .gpcp .prontidao-aviso{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
  @keyframes gp-croquis-pendentes{0%,100%{background:#fff1f2}50%{background:#fecdd3}}
  @media(prefers-reduced-motion:reduce){.gpcp .barra-op.croquis-pendentes{animation:none}}
`;
