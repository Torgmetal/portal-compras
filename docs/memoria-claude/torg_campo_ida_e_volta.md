---
name: torg_campo_ida_e_volta
description: Portal de campo (/campo) — todo campo tem IDA (rota grava) e VOLTA (tela recarrega); três listas que divergiam e faziam a informação da Lais "sumir"; lixeira pelo índice do banco; enviado em assinatura abre para completar
metadata:
  type: project
---

**Vitor (23/09/2026):** *"a questão que a Lais comentou de estar sumindo algumas informações que ela
colocou"* e *"a OP-102 precisa verificar pois ela mencionou que as informações não estavam ficando"*.
Em 22/09 ele já tinha dito ao Codex, sobre o US: *"as demais informações que a Lais colocou não estão
aparecendo"*. (A conta é stival2112@gmail.com, "Alexandre Stival" — ver [[torg_pintura_duas_telas]].)

**O celular grava por listas FECHADAS, e cada campo precisa estar nas três:**
1. **Ida — condições** (`resultados`): lista na rota `PATCH /api/campo/relatorios/[id]`.
2. **Volta — condições**: `lib/campo-condicoes.js` (`condicoesDoRelatorio`), que a tela usa ao abrir.
   Até 23/09 era um objeto escrito à mão no `Medir.jsx` e ficou para trás: processo de soldagem, metal
   de adição, tipo de junta, chanfro e **a marca do cabeçote** eram gravados e voltavam EM BRANCO — e o
   seletor do cabeçote abria em "Selecione…", porque a opção só se reconhece com a marca
   (`chaveCabecote`). O teste `testes/lib/campo-condicoes.teste.js` varre as telas e cobra cada `cond.X`.
3. **Linhas**: `lib/campo-linhas.js` (`linhasDoCampo`). A indicação do LP (nº, local, tamanho, tipo)
   **nunca** foi gravada pelo celular — a tela pedia, a rota descartava. Mesmos tetos do computador.

⚠ **Carregar só o que alguma tela do campo EDITA.** O que se carrega volta na gravação e a rota corta
texto em 120: carregar `desenho` de um relatório com 50 marcas devolveria a lista truncada.

⚠⚠ **A lixeira da junta desalinhava tudo.** A rota mescla pela posição; a tela recontava as posições
depois de apagar, e os dados da 2ª junta iam por cima da 1ª (a apagada não saía, a última duplicava).
Agora cada linha leva o índice do banco (`__i`), as apagadas vão à parte (`removidas`, com a marca,
conferida — posição que mudou no computador não é apagada às cegas) e junta nova entra no fim sem
buraco. Cota do dimensional não se apaga pelo celular.

⚠ **Enviado para assinatura abre para completar no celular** enquanto o envio está EM_ANDAMENTO
(chip "em assinatura" e aviso de que a alteração fica registrada). CONCLUÍDO continua só PDF — mexer
depois de todos assinarem é revisão, no computador. Ver [[torg_relatorio_editar_assinado]].

⚠ **"Quem monta faz isso no computador" só vale para COTA.** A frase aparecia no EVS/US/LP (onde a
junta nasce no celular, por Ler QR/Digitar) e até na pintura, que não tem junta. O EVS-102-001 foi
salvo pelo celular com 0 juntas; as 4 que ele tem foram criadas em 21/09 pelo script do Codex que
atualizou o modelo (laudo "A" copiado do resultado geral, soldador/EPS vazios).

**OP-102, medido em 23/09:** pintura (RIP-102-001/002) íntegra — tudo o que ela digitou em 22/09 está
no banco e no PDF (ela mesma limpou a 3ª demão, que o PLP numerava como 1 e 3). Nenhuma gravação
desfez outra (a auditoria da memória de padrões prova a ordem). Os campos novos do modelo LP/EVS de
21/09 (EPS, RQS, metal de adição, processo, tipo de junta, data) só existem no formulário do computador.

**How to apply:** campo novo numa tela do campo → entra na rota E em `lib/campo-condicoes.js` (ou em
`lib/campo-linhas.js`, se for da linha). Os dois testes acusam se faltar um lado.
