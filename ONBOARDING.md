# Workspace Torg — Guia de Onboarding

Aplicação Next.js que gerencia o fluxo Comercial → Engenharia → Compras → Produção da Torg Metal, integrada ao Omie ERP.

**Produção**: https://workspace-torg.vercel.app

---

## 1. Visão geral

O Workspace centraliza 4 grandes domínios:

1. **Comercial** — OPs (Ordens de Produção), contratos, verbas, receitas, medições no Omie
2. **Engenharia** — Cria RMs (Requisições de Material) vinculadas às OPs
3. **Compras** — Recebe RMs, faz cotação com fornecedores (via portal público), escolhe vencedor, gera pedido no Omie
4. **Produção / Almoxarifado** — Acompanhamento de produção semanal, estoque

Integrações:
- **Omie ERP** (pedidos de venda/compra, OS, estoque, posição) via API REST
- **Resend** (e-mails transacionais — quando configurado)
- **Vercel Blob** (armazenamento de PDFs anexados)
- **Anthropic Claude** (parse de PDFs de cotação via IA)

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 App Router (JavaScript) |
| Database | PostgreSQL (Neon) via Prisma 6 |
| Auth | NextAuth (credentials) |
| Styling | Tailwind CSS |
| Deploy | Vercel (Production) |
| Storage | Vercel Blob (PDFs/imagens) |
| Email | Resend (opcional) |
| IA | Anthropic Claude (parse PDFs) |

---

## 3. Setup local

### Pré-requisitos
- Node.js 18+
- Git
- Acesso ao repositório GitHub, Vercel e Neon (peça pro admin)

### Instalação

```bash
git clone git@github.com:Torgmetal/portal-compras.git
cd portal-compras
npm install
```

### Variáveis de ambiente

Crie `.env` na raiz com os valores que estão no Vercel:

```bash
# Banco de dados (Neon)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."

# Omie ERP
OMIE_APP_KEY="..."
OMIE_APP_SECRET="..."

# Armazenamento de arquivos
BLOB_READ_WRITE_TOKEN="..."

# IA pra parse de PDFs (opcional)
ANTHROPIC_API_KEY="..."

# Email (opcional)
RESEND_API_KEY="..."
EMAIL_FROM="Workspace Torg <noreply@torgmetal.com.br>"

# URL base (usado em emails)
NEXT_PUBLIC_BASE_URL="https://workspace-torg.vercel.app"
```

Pra puxar do Vercel automaticamente:
```bash
npx vercel link    # vincula ao projeto
npx vercel env pull .env
```

### Rodando

```bash
npx prisma generate   # gera tipos do Prisma
npm run dev           # http://localhost:3000
```

---

## 4. Estrutura de pastas

```
portal-compras/
├── app/                          # App Router (Next.js 14)
│   ├── api/                      # Endpoints REST
│   │   ├── cotacao/              # Fluxo de cotação (fornecedor + admin)
│   │   ├── op/                   # Ações de OP (gerar pedidos, sugerir vencedores)
│   │   ├── rm/                   # Criar/editar RMs
│   │   ├── comercial/            # OPs do comercial, medições
│   │   ├── estoque/              # Sync Omie, posições
│   │   ├── omie/                 # Helpers Omie (busca produto, etc)
│   │   └── ...
│   ├── comercial/                # Painel do Comercial (OPs, medições)
│   ├── compras/                  # Painel do Compras (RMs, cotações, pedidos)
│   ├── rm/nova/                  # Criação de RM pela Engenharia
│   ├── fornecedores/c/[token]/   # Portal público do fornecedor (cotação)
│   ├── producao/, financeiro/, expedicao/, almoxarifado/   # Outros setores
│   ├── entrar/                   # Login
│   └── layout.js, page.js
├── components/                   # Componentes React compartilhados
│   ├── FDAvulsosSection.jsx      # Cadastro de FDs avulsos
│   ├── PedidosOmieSection.jsx    # Listagem unificada de pedidos
│   ├── Sidebar.jsx               # Menu lateral
│   └── ...
├── lib/                          # Business logic + helpers
│   ├── prisma.js                 # Singleton Prisma
│   ├── auth.js, session.js       # NextAuth + role guards (requireRole)
│   ├── omie-pedido-compra.js     # criarPedidoOmie, anexarAoPedido
│   ├── omie-pedido-venda.js      # consultarPedidoVenda (medições)
│   ├── omie-ordem-servico.js     # consultarOrdemServico (medições OS)
│   ├── omie-estoque.js           # Sync de produtos/movimentações
│   ├── op-categorias.js          # Categorias de item OP (Materiais/Serviços/Aluguéis)
│   ├── fornecedor-categorias.js  # Categorias da Vendor List
│   ├── email.js                  # Resend + notificarEvento()
│   ├── notificacoes.js           # Feed in-app de atividades
│   ├── empresa.js                # Dados da Torg (Razão social, CNPJ)
│   ├── parse-tekla.js            # Importação XLSX de Engenharia
│   └── pdf-parser-server.js      # Fallback regex pra parse de PDF
├── prisma/
│   └── schema.prisma             # Modelo de dados
├── public/                       # Estáticos (logos, imagens)
└── package.json
```

---

## 5. Modelo de dados (resumo)

Principais entidades em `prisma/schema.prisma`:

- **User** — usuários com role (ADMIN, COMERCIAL, COMPRAS, ENGENHARIA, PRODUCAO, ALMOXARIFADO, FINANCEIRO, EXPEDICAO)
- **OP** — Ordem de Produção, com itens, aditivos, receitas, medições
- **OPItem** — item do escopo da OP (categoria, qtd, valorVerba, faturamentoDireto)
- **Aditivo / AditivoItem** — aditivos contratuais
- **RM / RMItem** — requisição de material (Engenharia → Compras)
- **Cotacao / CotacaoItem** — proposta dos fornecedores (acesso via token público)
- **PedidoOmie** — pedido sincronizado/criado no Omie (via cotação ou FD avulso manual)
- **OPMedicao** — Pedido de Venda ou OS do Omie vinculado como medição
- **Fornecedor** — Vendor List (Razão Social, CNPJ, categorias)
- **CategoriaFornecedor** — categorias customizadas (além das 9 built-in)
- **EstoqueItem / EstoqueReserva / EstoqueMovimentacao** — Estoque Torg (matéria-prima)
- **Notificacao** — feed in-app (RM_CRIADA, COTACAO_RESPONDIDA)
- **EmailNotificacao** — inscritos pra receber por e-mail
- **AuditLog** — auditoria de mudanças

Foreign keys importantes:
- `OP.rms[] → RM.opId`
- `RM.itens[] → RMItem.rmId`
- `RMItem.opItemId → OPItem.id` (vínculo direto) **OU** `RM.categoriasOP[]` (fallback)
- `Cotacao.itens[] → CotacaoItem.cotacaoId, .rmItemId`
- `PedidoOmie.rmAtendidaId → RM.id` (FD avulso vinculado a uma RM)

---

## 6. Roles e permissões

Definidas via `requireRole(["ROLE_A", "ROLE_B"])` em cada endpoint/page.

| Role | Acessa |
|---|---|
| ADMIN | Tudo |
| COMERCIAL | OPs (criar, editar, finalizar), receitas, medições, FDs avulsos |
| ENGENHARIA | Criar RMs vinculadas a OPs, importar XLSX Tekla |
| COMPRAS | Painel de RMs, cotações, mapa comparativo, gerar pedidos no Omie |
| PRODUCAO | Lançamento de produção semanal |
| ALMOXARIFADO | Estoque, movimentações |
| FINANCEIRO | KPIs financeiros |
| EXPEDICAO | Romaneios |

`User.podeAlterarVerba` (boolean) — quando true, COMERCIAL altera verba direto sem aprovação master.

---

## 7. Deploy

Vercel está configurada com **deploy automático** quando há push na branch `main`.

### Manual

```bash
git add -A
git commit -m "mensagem clara"
git push origin main
# Vercel deploya em ~1 min
```

### Forçar redeploy

```bash
npx vercel --prod --yes
```

### Atualizar alias (production)

Após deploy, pegar o URL gerado e:

```bash
npx vercel alias set https://workspace-torg-XXXXXXX-torg.vercel.app workspace-torg.vercel.app
```

### Migrations Prisma

Mudanças no schema:

```bash
# Local: edita prisma/schema.prisma, depois:
npx prisma db push --accept-data-loss   # aplica direto sem migration history

# OU se quiser migration formal (recomendado prod):
npx prisma migrate dev --name nome_da_mudanca
```

Após `db push` em produção, **redeploy** o Vercel pra que o Prisma Client seja regenerado.

---

## 8. Acessos a configurar pra dev novo

1. **GitHub** — github.com/Torgmetal/portal-compras → Settings → Collaborators → Add (Write permission)
2. **Vercel** — vercel.com/torg/workspace-torg → Settings → Members → Invite (Developer role)
3. **Neon** — console.neon.tech → projeto → Settings → Members → Invite

### Após receber os acessos

```bash
git clone git@github.com:Torgmetal/portal-compras.git
cd portal-compras
npm install
npx vercel link              # vincula ao projeto na Vercel
npx vercel env pull .env     # baixa as ENV vars
npx prisma generate
npm run dev
```

---

## 9. Fluxos principais (resumo)

### Comercial cria OP
1. `/comercial/nova` → preenche cliente, obra, itens do escopo, faturamento direto por item
2. Receitas (marcos contratuais)
3. Geração de OP, vinculação ao Omie

### Engenharia cria RM
1. `/rm/nova` → escolhe OP, categorias da solicitação, itens
2. Pode importar XLSX do Tekla (parse automático)
3. RM aparece no painel de Compras

### Compras envia cotação
1. `/compras` → seleciona RMs (consolidadas se quiser) → envia
2. Cria `Cotacao` com `token` único por fornecedor
3. Fornecedor acessa `/fornecedores/c/[token]` → preenche preços
4. Sistema parseia PDF via IA (Claude) se anexado

### Compras escolhe vencedor + gera pedido
1. Mapa Comparativo em `/compras/painel-ops/[opId]` ou `/compras/rm/[id]`
2. Marca células vencedoras (manual ou "Sugerir menor preço")
3. Considera FD vs Torg pra comparação correta (custo Torg)
4. "Gerar Pedidos Omie" → cria PedidoOmie + anexos no Omie via API

### FD avulso (regularização)
1. `/compras/painel-ops/[opId]` → "Incluir FD avulso"
2. Anexa PDF, valor, categoria, vincula a RM opcional
3. Modo manual quando Omie bloqueia consulta

---

## 10. Comandos úteis

```bash
# Logs do Vercel em tempo real
npx vercel logs https://workspace-torg.vercel.app

# Conectar ao Neon via psql
psql $DATABASE_URL

# Prisma Studio (UI pra ver o banco)
npx prisma studio

# Listar deployments
npx vercel ls

# Inspecionar deployment específico
npx vercel inspect <deployment-url>
```

---

## 11. Onde ficam as credenciais

**As senhas dos usuários estão criptografadas (bcrypt)** — não dá pra recuperar a original. Reset via script:

```js
// Em scripts-reset-senha.js (use npm install bcryptjs)
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const hash = await bcrypt.hash("nova-senha", 10);
await prisma.user.update({ where: { email: "..." }, data: { password: hash } });
```

ADMIN pode (futuramente) resetar via UI em `/admin/usuarios` — não implementado ainda.

---

## 12. Convenções de código

- JavaScript (não TypeScript) — JSDoc quando necessário
- Sem console.log em prod, exceto debug intencional (`[modulo]` prefixo)
- Endpoints validam input com `zod` (`z.object`)
- `requireRole()` em todo endpoint mutativo
- `AuditLog` em mutações importantes (criar OP, gerar pedido, alterar verba, etc)
- Tailwind direto nos componentes (não CSS modules)
- Componentes client têm `"use client"` no topo

---

## 13. Domínios externos / Limites

- **Omie API**: bloqueia consultas redundantes em < 30s (REDUNDANT). Sistema tem cache 30s + retry com backoff.
- **Resend free**: só envia pra e-mail da própria conta (sem domínio verificado). Pra mandar pra fornecedores, verificar `torgmetal.com.br` em resend.com/domains.
- **Vercel Hobby**: 1 cron por dia, 10s de timeout default (algumas rotas usam `maxDuration = 60`).

---

## 14. Quem mantém

- **Vitor Costa** — Diretor, ADMIN principal
- **Anthropic Claude** (via Claude Code CLI) — IA que tem feito a maior parte do desenvolvimento iterativo

Pra mudanças via IA, basta abrir o repositório com Claude Code (`claude` no terminal) ou Cursor — descrever o que quer mudar.
