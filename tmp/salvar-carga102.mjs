import fs from 'node:fs/promises';import env from '@next/env';env.loadEnvConfig(process.cwd());
const {prisma}=await import('../lib/prisma.js');const {hashItens}=await import('../lib/carga/hash-itens.js');
const ps=JSON.parse(await fs.readFile('/tmp/carga102/previos.json'));const base=JSON.parse(await fs.readFile('/tmp/carga102/config.json'));
try{
const user=await prisma.user.findUnique({where:{email:'vitor@torg.com.br'},select:{id:true}});if(!user)throw Error('Responsável não localizado');
for(const p of ps){
 const r=JSON.parse(await fs.readFile(`/tmp/carga102/antes-${p.numero}.json`));
 if(r.cargas.some(c=>c.versaoMontagem!==6))throw Error('Resultado desatualizado');
 const original=base.sims.find(s=>s?.romaneioPrevioId===p.id);
 const salvo=await prisma.$transaction(async tx=>{
  const atual=await tx.romaneioPrevio.findUnique({where:{id:p.id}});if(!atual||JSON.stringify(atual.itens)!==JSON.stringify(p.itens))throw Error('Romaneio alterado durante a conferência');
  const ultima=await tx.cargaSimulada.findFirst({where:{romaneioPrevioId:p.id},orderBy:{createdAt:'desc'}});
  if(ultima?.avisos?.correcao==='apoios-ifc-op102-7174e7f0')return {id:ultima.id,jaSalva:true};
  if((ultima?.id||null)!==(original?.id||null))throw Error('Existe simulação mais recente; preservar trabalho do Planejamento');
  const sim=await tx.cargaSimulada.create({data:{opId:p.opId,romaneioPrevioId:p.id,perfil:r.perfil.chave,perfilNome:r.perfil.nome,itensHash:hashItens(p.itens),resumo:r.resumo,cargas:r.cargas,avisos:{especiais:r.especiais,ajustadas:r.ajustadas,semCaixa:r.semCaixa,estimadas:r.estimadas,perfil:r.perfil,gcModo:r.gcModo,porNome:[],faltantes:[],ajustes:{},correcao:'apoios-ifc-op102-7174e7f0'},criadoPorId:user.id}});
  await tx.auditLog.create({data:{userId:user.id,action:'CORRIGIR_APOIOS_SIMULACAO_CARGA',entity:'CargaSimulada',entityId:sim.id,diff:{opNumero:'102',romaneioPrevio:p.numero,antes:original?.id||null,depois:{viagens:r.resumo.viagens,especiais:r.especiais,versaoMontagem:6},motivo:'Solicitação do diretor: evitar peças em pé e sem apoio. Conferência conservadora do IFC, transporte especial pendente de definição.'}}});return {id:sim.id};
 });console.log({romaneio:p.numero,...salvo,veiculos:r.resumo.viagens,especiais:r.especiais.length});
}
}finally{await prisma.$disconnect()}
