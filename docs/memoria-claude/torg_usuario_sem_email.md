---
name: torg_usuario_sem_email
description: Conta do portal para funcionário sem e-mail — vínculo com o RH em Admin › Usuários faz o login por CPF; e-mail interno cpf@funcionario.torg
metadata:
  type: project
---

Vitor (14/09/2026): "preciso criar um usuário para um funcionário, mas sem e-mail". Dois caminhos:

- **Só autoatendimento** (holerite, mural): RH › Funcionários › Habilitar acesso — cria User tipo FUNCIONARIO, login por CPF,
  confinado a /colaborador pelo middleware.
- **Módulo do ERP** (Expedição, Produção…): Admin › Usuários › Novo → campo **Funcionário do RH** (`SeletorFuncionario`).
  Com o vínculo (`User.funcionarioId`), o e-mail fica opcional: a conta nasce com `cpf@funcionario.torg` (só chave
  única, sem caixa postal) e a pessoa entra com **CPF + senha** — lib/auth.js já resolvia CPF → Funcionario → usuário
  para qualquer tipo. A tela de edição também vincula/desvincula; a lista mostra "sem e-mail · entra pelo CPF".
- Regras em `lib/usuario-funcionario.js`: funcionário precisa de CPF de 11 dígitos e não pode estar vinculado a outro
  usuário. Conta sem e-mail não recebe reset por e-mail nem notificação: o admin reseta a senha na tela.
