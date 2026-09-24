const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
let tabela={empresas:['TMSA','Vale'],fases:[{fase:'A',descricao:'Apoios',referencias:['T-100','V-100']},{fase:'B',descricao:'Treliça',referencias:['T-200','V-200']}]},gravou=false;
await page.route('**/api/comercial/op/validacao-fases/fases',async route=>{if(route.request().method()==='PUT'){tabela=route.request().postDataJSON().tabela;gravou=true;}await route.fulfill({json:{tabela,versao:'2026-09-17T12:00:00.000Z',podeEditar:true}});});
await page.goto('http://localhost:3000/estrutura-3d/validacao-fases');
await page.getByRole('button',{name:'Editar fases'}).click();await page.getByRole('button',{name:'Subir fase B'}).click();await page.getByRole('button',{name:'Salvar fases'}).click();await page.getByRole('button',{name:'Editar fases'}).waitFor();
if(!gravou||tabela.fases[0].fase!=='B'||tabela.fases[0].referencias[0]!=='T-200')throw Error('Ordem ou referências incorretas');
await page.screenshot({path:'/tmp/fases-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/fases-mobile.png',fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Página estoura largura do celular');console.log('Validado: renderização, reordenação, salvamento simulado e largura mobile.');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
