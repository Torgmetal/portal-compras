# Meu trabalho por setor

Refinamento solicitado: operador deve abrir no celular e saber o que executar, sem escolher uma OP ou interpretar carteira. A entrada é o setor/posto lembrado neste aparelho. Carteira passa à consulta de gestão.

Implementação: fonte existente do Gantt, com saldos e frações; hoje, pendências explícitas e futuro separados. OP e posto consolidados, somando faixas por peça. Montagem respeita prontidão; retorno recebido segue programação específica. VeioDe vencido mantém saldo visível no turno noturno apesar da normalização UTC da fonte. Sem alterações de programação, apontamentos ou 3D.

GET autenticado /api/producao/fila valida setor, envia apenas seu subconjunto, compartilha cache servidor30s e inclui recursos cadastrados. Cliente atualiza60s quando visível, preservando a tela na atualização. Botões de desenho/ficha usam consultas existentes.

Validação: GET realHTTP200 (14 lotes de Solda); Chrome320/390/1440 sem errosJS ou overflow; escolha de setor/posto, abertura de peças, espera e persistência após recarregar. Testes cobrem saldo, prontidão, futuro, turno noturno, retorno recebido, frações agrupadas, autorização, filtroAPI, preferências e consulta de desenho. Revisão independente resolvida. Não houve gravação de produção nos testes.
