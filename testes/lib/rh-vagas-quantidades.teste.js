import {expect,it} from 'vitest';
import {aplicarQuantidadesVaga,resumoVaga} from '@/lib/rh-vagas-quantidades';
const vaga={quantidade:3,quantidadePreenchida:0,status:'EM_RECRUTAMENTO',updatedAt:new Date('2026-09-08T12:00:00Z')};
const agora=new Date('2026-09-09T00:00:00Z');
const baixa=n=>({quantidadeContratada:n,versaoEsperada:vaga.updatedAt.toISOString()});
it('baixa parcial mantém o recrutamento e duas posições abertas',()=>{
 const data=aplicarQuantidadesVaga(vaga,baixa(1),agora);
 expect(data).toMatchObject({quantidadePreenchida:1,status:'EM_RECRUTAMENTO',dataFechamento:null});
 expect(resumoVaga({...vaga,...data})).toEqual({total:3,preenchidas:1,abertas:2,restantes:2});
});
it('última contratação encerra o pedido na data da baixa',()=>{expect(aplicarQuantidadesVaga({...vaga,quantidadePreenchida:2},baixa(1),agora)).toMatchObject({quantidadePreenchida:3,status:'PREENCHIDA',dataFechamento:agora});});
it('recusa quantidade maior que o saldo',()=>{expect(()=>aplicarQuantidadesVaga({...vaga,quantidadePreenchida:2},baixa(2),agora)).toThrow(/saldo/i);});
it.each([0,-1,1.5])('recusa contratação inválida %s',n=>{expect(()=>aplicarQuantidadesVaga(vaga,baixa(n),agora)).toThrow();});
it('recusa repetição de uma baixa ou tela desatualizada',()=>{expect(()=>aplicarQuantidadesVaga({...vaga,updatedAt:agora},baixa(1),agora)).toThrow(/atualiz/i);});
it('não permite baixar vaga cancelada',()=>{expect(()=>aplicarQuantidadesVaga({...vaga,status:'CANCELADA'},baixa(1),agora)).toThrow(/recrutamento/i);});
it('não reduz total para menos que o já contratado',()=>{expect(()=>aplicarQuantidadesVaga({...vaga,quantidadePreenchida:2},{quantidade:1},agora)).toThrow(/contrat/i);});
it('aumento de pedido preenchido reabre só o saldo adicional',()=>{
 const data=aplicarQuantidadesVaga({...vaga,quantidadePreenchida:3,status:'PREENCHIDA'},{quantidade:5},agora);
 expect(data).toMatchObject({quantidade:5,quantidadePreenchida:3,status:'EM_RECRUTAMENTO',dataFechamento:null});
});
it('cancelamento preserva contratados e tira o restante das vagas abertas',()=>{
 const data=aplicarQuantidadesVaga({...vaga,quantidadePreenchida:1},{status:'CANCELADA'},agora);
 expect(resumoVaga({...vaga,...data})).toEqual({total:3,preenchidas:1,restantes:2,abertas:0});
});
it('preserva pedidos antigos preenchidos e fechamento via cliente antigo',()=>{
 expect(resumoVaga({quantidade:3,status:'PREENCHIDA'}).preenchidas).toBe(3);
 expect(aplicarQuantidadesVaga(vaga,{status:'PREENCHIDA'},agora).quantidadePreenchida).toBe(3);
});
it('preserva os nomes anteriores ao registrar outra contratação',()=>{
 expect(aplicarQuantidadesVaga({...vaga,funcionarioContratadoNome:'Ana'},{...baixa(1),funcionarioContratadoNome:'Bruno'},agora).funcionarioContratadoNome).toBe('Ana\nBruno');
});
it('não reabre vaga fechada por versão antiga após a criação da coluna',()=>{
 const legada={...vaga,status:'PREENCHIDA',quantidadePreenchida:0,dataFechamento:agora};
 expect(resumoVaga(legada).preenchidas).toBe(3);
 expect(aplicarQuantidadesVaga(legada,{titulo:'Auxiliar'},agora)).toMatchObject({status:'PREENCHIDA',quantidadePreenchida:3,dataFechamento:agora});
});
