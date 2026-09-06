import { medirVistas } from './medir';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VisualizadorIfc from '../../components/VisualizadorIfc';

function Ensaio() {
  const local = new URLSearchParams(location.search).get('modelo') === 'local';
  const sufixo = local ? '&modelo=local' : '';
  const perfil = new URLSearchParams(location.search).get('perfil') || 'atual';
  const [inicio] = useState(() => performance.now());
  const [abertura, setAbertura] = useState(null);
  const serie = JSON.parse(sessionStorage.getItem('ifc-abertura') || 'null');
  const [medicao, medir] = useState(null);
  const [url, setUrl] = useState(local ? '/modelo-local.ifc' : '/fixture.ifc');
  const [selecionada, selecionar] = useState(null);
  const [dados, indice] = useState(null);
  const [filtrar, filtro] = useState(false);
  const [esconder, esconderResto] = useState(false);
  const [modo, cor] = useState('modelo');
  const receberIndice = dadosNovos => {
    const tempo = Math.round(performance.now() - inicio);
    indice(dadosNovos); setAbertura(tempo);
    if (new URLSearchParams(location.search).get('abertura') === '1' && serie?.ativo) {
      serie.resultados.push({ perfil, tempoMs: tempo });
      const proximo = serie.fila.shift();
      serie.ativo = !!proximo;
      sessionStorage.setItem('ifc-abertura', JSON.stringify(serie));
      if (proximo) setTimeout(() => location.assign(`?perfil=${proximo}${sufixo}&abertura=1`), 750);
    }
  };
  window.ensaio = { pronto: !!dados, itens: dados?.indice.length, selecionada };
  return <main style={local ? { width: 1000, maxWidth: "none" } : undefined}>
    <h1>IFC · ensaio local · {perfil}</h1>
    <p><a href={`?perfil=atual${sufixo}`}>Atual</a> · <a href={`?perfil=refinado${sufixo}`}>Refinado</a> · <a href={`?perfil=nitido${sufixo}`}>Nítido</a> · {local ? 'IFC local da obra · comparação' : 'Arquivo sintético, sem dados de obra.'}</p>
    <label>Testar IFC local (somente neste navegador): <input type="file" accept=".ifc" onChange={e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      indice(null); selecionar(null); setUrl(URL.createObjectURL(arquivo));
    }} /></label>
    <p><button onClick={() => filtro(!filtrar)}>Filtrar primeiro conjunto</button> <button onClick={() => esconderResto(!esconder)}>Ocultar resto</button> <button onClick={() => cor(modo === 'modelo' ? 'andamento' : 'modelo')}>Cor por andamento</button></p>
    <VisualizadorIfc key={url} url={url} altura={640} perfilVisual={perfil} onIndice={receberIndice}
      onSelecionar={item => selecionar(item?.id || null)} selecionada={selecionada}
      visiveis={filtrar && dados ? new Set([dados.indice[0].id]) : null} esconderResto={esconder}
      modo={modo} cores={Object.fromEntries((dados?.indice || []).map(i => [i.marca, '#0e7a5f']))} />
    <p><button disabled={!dados || medicao === "Medindo..."} onClick={async () => { medir("Medindo..."); medir(await medirVistas()); }}>Medir 120 vistas</button></p>
    <p>Abertura até primeiro desenho: {abertura == null ? 'carregando' : `${abertura} ms`}</p>
    <button disabled={!dados || serie?.ativo} onClick={() => {
      sessionStorage.setItem('ifc-abertura', JSON.stringify({ ativo: true, fila: ['nitido','atual','nitido','atual','nitido'], resultados: [] }));
      location.assign(`?perfil=atual${sufixo}&abertura=1`);
    }}>Comparar abertura (6 cargas)</button>
    <pre id="aberturas">{JSON.stringify(serie, null, 2)}</pre>
    <pre id="medicao">{JSON.stringify(medicao, null, 2)}</pre>
    <p id="resultado">{dados ? `${dados.indice.length} conjuntos carregados` : 'Carregando'} · Seleção: {selecionada || 'nenhuma'}</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<Ensaio />);
