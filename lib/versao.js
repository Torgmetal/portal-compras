/**
 * Controle de versões do Portal Torg
 *
 * - VERSAO_ATUAL e CHANGELOG são atualizados manualmente a cada release significativo.
 * - O hash e a data do build são injetados automaticamente pelo next.config.js
 *   a cada `git push` → deploy no Vercel.
 *
 * Versão semântica: MAJOR.MINOR.PATCH
 *   MAJOR — mudança de arquitetura ou breaking change
 *   MINOR — nova funcionalidade
 *   PATCH — correção de bug
 */

export const VERSAO_ATUAL = "2.0.0";

// Injetados pelo next.config.js no momento do build — atualizados automaticamente
export const BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH ?? "local";
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? "—";

export const CHANGELOG = [
  {
    versao: "2.0.0",
    data: "25/05/2025",
    titulo: "Controle de Módulos",
    itens: [
      "Migração do sistema de permissões: Role único → Tipo + Módulos",
      "Administradores têm acesso total; usuários têm módulos específicos",
      "Novo formulário de criação/edição de usuário com seleção de módulos",
      "Módulo Switcher na barra lateral para navegar entre módulos",
      "Recuperação de senha por e-mail (esqueci minha senha)",
      "Gates de acesso por módulo: cada rota bloqueada para módulo específico",
    ],
  },
  {
    versao: "1.9.0",
    data: "01/05/2025",
    titulo: "Propostas e EPC",
    itens: [
      "Módulo de Estudo de Precificação Comercial (EPC)",
      "Análise de documentos com IA para extração de itens de peso",
      "Aba Peso Projeto com tabela editável e upload de documentos",
    ],
  },
  {
    versao: "1.8.0",
    data: "15/04/2025",
    titulo: "Central de Orçamentos e Expedição",
    itens: [
      "Central de Orçamentos com pipeline visual",
      "Checklist de expedição de OPs",
      "KPIs comercial e pipeline de vendas",
      "Metas mensais por módulo com distribuição semanal",
    ],
  },
  {
    versao: "1.7.0",
    data: "01/03/2025",
    titulo: "Controle de Produção",
    itens: [
      "Controle de produção semanal com romaneios",
      "Integração com SharePoint para sync do planejamento",
      "Estoque com alocação e reservas por OP",
    ],
  },
];
