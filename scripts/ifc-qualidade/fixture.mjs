// Estrutura sintética IFC2X3 em metros: perfis I, colunas e chapas, sem dados de clientes.
export function criarFixture() {
  const linhas = [];
  const add = (s) => { linhas.push(`#${linhas.length + 1}=${s};`); return `#${linhas.length}`; };
  let seq = 0;
  const guid = () => `'${String(++seq).padStart(22, "0")}'`;
  const ponto = (x, y, z) => add(`IFCCARTESIANPOINT((${x}.,${y}.,${z}.))`);
  const origem = ponto(0, 0, 0);
  const z = add('IFCDIRECTION((0.,0.,1.))');
  const x = add('IFCDIRECTION((1.,0.,0.))');
  const eixo = add(`IFCAXIS2PLACEMENT3D(${origem},${z},${x})`);
  const contexto = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,${eixo},$)`);
  const unidade = add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const unidades = add(`IFCUNITASSIGNMENT((${unidade}))`);
  add(`IFCPROJECT(${guid()},$,'Ensaio sintetico',$,$,$,$,(${contexto}),${unidades})`);
  const perfil = add("IFCISHAPEPROFILEDEF(.AREA.,'I 300',$,0.18,0.3,0.012,0.02,0.008)");
  const chapa = add("IFCRECTANGLEPROFILEDEF(.AREA.,'Chapa',$,0.5,0.5)");
  function peca(tipo, px, py, pz, direcao, comprimento, perfilId, rgb) {
    const pos = add(`IFCAXIS2PLACEMENT3D(${ponto(px, py, pz)},${direcao},${direcao === x ? z : x})`);
    const local = add(`IFCLOCALPLACEMENT($,${pos})`);
    const solido = add(`IFCEXTRUDEDAREASOLID(${perfilId},${eixo},${z},${comprimento})`);
    const cor = add(`IFCCOLOURRGB($,${rgb.join(',')})`);
    const render = add(`IFCSURFACESTYLERENDERING(${cor},0.,$,$,$,$,$,$,.NOTDEFINED.)`);
    const estilo = add(`IFCSURFACESTYLE($,.BOTH.,(${render}))`);
    const atribuicao = add(`IFCPRESENTATIONSTYLEASSIGNMENT((${estilo}))`);
    add(`IFCSTYLEDITEM(${solido},(${atribuicao}),$)`);
    const repr = add(`IFCSHAPEREPRESENTATION(${contexto},'Body','SweptSolid',(${solido}))`);
    const forma = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${repr}))`);
    const id = add(`${tipo}(${guid()},$,'Peca',$,$,${local},${forma},'P${seq}')`);
    const asm = add(`IFCELEMENTASSEMBLY(${guid()},$,'Conjunto',$,$,$,$,'M${seq}',.FACTORY.,.USERDEFINED.)`);
    add(`IFCRELAGGREGATES(${guid()},$,$,$,${asm},(${id}))`);
  }
  for (let i = 0; i < 5; i++) for (const y of [0, 4]) {
    peca('IFCCOLUMN', i * 4, y, 0, z, '4.', perfil, [0.18,0.49,0.36]);
    peca('IFCPLATE', i * 4, y, 0, z, '0.04', chapa, [0.76,0.6,0.17]);
    if (i < 4) {
      peca('IFCBEAM', i * 4, y, 4, x, '4.', perfil, [0.24,0.44,0.65]);
      peca('IFCBEAM', i * 4, y, 2, x, '4.', perfil, [0.54,0.42,0.69]);
    }
  }
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Ensaio sintetico'),'2;1');\nFILE_NAME('estrutura.ifc','2026-09-06T00:00:00',('Torg'),('Torg'),'Teste','Teste','');\nFILE_SCHEMA(('IFC2X3'));\nENDSEC;\nDATA;\n${linhas.join('\n')}\nENDSEC;\nEND-ISO-10303-21;`;
}
