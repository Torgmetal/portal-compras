const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1280,height:800}});
 const chamadas=[];
 await p.route('**/api/qualidade/pit/validacao**',async r=>{
  const q=r.request();chamadas.push(q.method());
  await r.fulfill({json:q.method()!=='GET'?{ok:true}:q.url().endsWith('/cliente')?{documentos:[{id:'teste',nome:'PIT recebido',arquivoNome:'pit.pdf'}]}:{podeGerenciar:true,padrao:'TORG',revisao:'0',opcoes:[{id:'TORG',nome:'PIT Torg'}]}});
 });
 await p.goto('http://localhost:3000/estrutura-3d/validacao-pit');
 await p.getByRole('button',{name:'Excluir PIT Torg',exact:true}).click();
 if(chamadas.includes('PUT'))throw Error('Excluiu sem confirmação');
 await p.getByRole('button',{name:'Cancelar',exact:true}).click();
 await p.setViewportSize({width:390,height:844});
 if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow mobile');
 await p.getByRole('button',{name:'Excluir PIT Torg',exact:true}).click();
 await p.screenshot({path:'/tmp/pit-excluir-mobile.png'});
 await p.getByRole('button',{name:'Excluir PIT',exact:true}).click();
 await p.getByText('Criar PIT Torg',{exact:true}).waitFor();
 await p.getByText('PIT recebido',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Excluir',exact:true}).click();
 await p.getByRole('button',{name:'Excluir anexo',exact:true}).click();
 await p.getByText('Nenhum PIT disponibilizado para esta obra.').waitFor();
 console.log('Local validado: cancelar, excluir PIT Torg, preservar cliente, excluir cliente e mobile. API simulada, nenhuma gravação real.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
