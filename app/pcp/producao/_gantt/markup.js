// ─── ESQUELETO HTML DO QUADRO ──────────────────────────────────────────────────────────────────
//
// ⚠ Os ids são todos `gp-*` e o acesso passa pelo helper `$` de `iniciar`, que já prefixa. Trocar
// um id aqui quebra silenciosamente o `$("...")` do outro lado — não há checagem de compilação
// entre os dois.

export const MARKUP = `<div class="wrap">
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
    <button class="btn on" data-setor="ACABAMENTO">Acabamento</button>
    <button class="btn on" data-setor="JATO">Jato</button>
    <button class="btn on" data-setor="PINTURA">Pintura</button>
    <button class="btn on" data-setor="EXPEDICAO">Retorno à Expedição</button>
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
      <span><i style="background:#c62828"></i>atraso</span>
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
