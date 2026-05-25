/**
 * Controle de versões do Portal Torg
 *
 * Atualizar este arquivo a cada release relevante.
 * Versão semântica: MAJOR.MINOR.PATCH
 *   MAJOR — mudança de arquitetura ou breaking change
 *   MINOR — nova funcionalidade
 *   PATCH — correção de bug
 */

export const VERSAO_ATUAL = "2.0.0";

export const CHANGELOG = [
  {
    versao: "2.0.0",
    data: "2025-05-25",
    titulo: "Controle de Módulos",
    itens: [
      "Migração do sistema de permissões: Role único → Tipo + Módulos",
      "Administradores têm acesso total; usuários têm módulos específicos",
      "Novo formulário de criação/edição de usuário com seleção de módulos",
      "Módulo Switcher na barra lateral para navegar entre módulos",
      "Recuperação de senha por e-mail (esqueci minha senha)",
    ],
  },
  {
    versao: "1.9.0",
    data: "2025-05-01",
    titulo: "Propostas e EPC",
    itens: [
      "Módulo de Estudo de Precificação Comercial (EPC)",
      "Análise de documentos com IA para extração de itens de peso",
      "Aba Peso Projeto com tabela editável e upload de documentos",
    ],
  },
  {
    versao: "1.8.0",
    data: "2025-04-15",
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
    data: "2025-03-01",
    titulo: "Controle de Produção",
    itens: [
      "Controle de produção semanal com romaneios",
      "Integração com SharePoint para sync do planejamento",
      "Estoque com alocação e reservas por OP",
    ],
  },
];
