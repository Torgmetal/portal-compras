// A MATRIZ DE COMUNICAÇÃO DA TORG — quem atende o quê, por setor.
//
// Vitor (28/08/2026), abrindo o portal do cliente: "preciso que coloque a primeira aba com a
// matriz de comunicação da Torg". É a primeira coisa que o cliente procura quando algo trava: um
// nome e um telefone. Por isso ela abre o portal e existe mesmo numa obra que ainda não publicou
// nada — as outras abas dependem de conteúdo; esta, não.
//
// ⚠⚠ É DADO, NÃO FIGURA. Nome, cargo, e-mail, WhatsApp e substituto mudam quando alguém troca de
// função — e o portal é público. Por isso a matriz mora AQUI, num arquivo que se edita numa linha,
// e não dentro do componente nem num HTML exportado de ferramenta de design: congelada num layout,
// ela envelhece calada, e ninguém confere a página que "já estava pronta".
//
// ⚠ NÃO VARIA POR OBRA (Vitor, 28/08/2026: "não muda, sempre será esses setores e as mesmas
// pessoas"). Se um dia variar, o caminho é sobrescrever por OP em cima desta lista — não duplicá-la.
//
// ⚠ FOTO É OPCIONAL. Basta pôr o arquivo em `public/equipe/` e apontar `foto: "/equipe/nome.jpg"`.
// Sem foto (ou se o arquivo sumir), o avatar cai nas INICIAIS — nunca numa imagem quebrada: a
// página é a primeira que o cliente vê, e meia dúzia de ícones de imagem faltando diz mais sobre
// nós do que a foto que faltou.

export const MATRIZ_COMUNICACAO = [
  {
    setor: "Comercial",
    resumo: "propostas, contratos, pós-venda",
    responsabilidades: [
      { titulo: "Elaboração de propostas", texto: "Estudo da solicitação do cliente, precificação e emissão da proposta comercial com prazos e condições." },
      { titulo: "Negociação e contratos", texto: "Alinhamento de escopo, condições comerciais e formalização do contrato ou pedido." },
      { titulo: "Acompanhamento do pedido", texto: "Ponto de contato do cliente durante todo o pedido, do aceite à entrega." },
      { titulo: "Pós-venda", texto: "Atendimento após a entrega: dúvidas, novas demandas e satisfação do cliente." },
      { titulo: "Prazos e comunicação", texto: "Retorno das solicitações comerciais e comunicação oficial de datas ao cliente." },
      { titulo: "Interface com os setores", texto: "Encaminhamento interno das demandas do cliente aos focais de cada setor." },
    ],
    pessoas: [
      { nome: "Matheus Lima", cargo: "Comercial", email: "matheus.lima@torg.com.br", tel: "(19) 99410-7082", backup: "Patricia Maiochi",
        escopo: ["Estudo e escopo do projeto", "Itens inclusos / exclusos", "Elaboração de proposta", "Negociação de contratos"] },
      { nome: "Patricia Maiochi", cargo: "Comercial", email: "comercial@torg.com.br", tel: "(19) 99248-2076", backup: "Matheus Lima",
        escopo: ["Acompanhamento do pedido", "Follow-ups comerciais", "Pós-venda", "Interface com os setores"] },
    ],
  },
  {
    setor: "Compras",
    resumo: "cotações, fornecedores",
    responsabilidades: [],
    pessoas: [
      { nome: "Matheus Martha", cargo: "Compras", email: "matheus.martha@torg.com.br", tel: "(19) 99852-2099", backup: "Patricia Maiochi (Comercial)",
        escopo: ["Cotações", "Acompanhamento de pedidos"] },
    ],
  },
  {
    setor: "Engenharia",
    resumo: "desenhos, alterações técnicas",
    responsabilidades: [
      { titulo: "Cálculos estruturais", texto: "Dimensionamento e verificação de cálculos que garantem a segurança e o desempenho do projeto." },
      { titulo: "Detalhes técnicos", texto: "Definição e esclarecimento de detalhes técnicos do projeto junto ao cliente." },
      { titulo: "Solicitações de desenhos", texto: "Recebimento e atendimento das solicitações de desenhos técnicos e revisões." },
      { titulo: "Liberações para fábrica", texto: "Liberação dos desenhos e documentos aprovados para o início da produção." },
      { titulo: "Listas de controle", texto: "Emissão e gestão das listas de controle que acompanham a fabricação." },
      { titulo: "Alterações de projeto", texto: "Análise e resposta às alterações solicitadas durante o andamento do projeto." },
    ],
    pessoas: [
      { nome: "Guilherme Campos", cargo: "Diretor Técnico", email: "guilherme@torg.com.br", tel: "(19) 99774-6292", backup: "Diego Dias",
        escopo: ["Cálculos", "Detalhes técnicos"] },
      { nome: "Diego Dias", cargo: "Coordenador de Engenharia", email: "engenharia@torg.com.br", tel: "(19) 99418-4382", backup: "John Cornia (engenharia4@torg.com.br)",
        escopo: ["Solicitações de desenhos", "Liberações para fábrica", "Listas de controle", "Alterações de projetos"] },
    ],
  },
  {
    setor: "Planejamento",
    resumo: "cronogramas, status, cargas",
    responsabilidades: [
      { titulo: "Elaboração e acompanhamento de cronograma", texto: "Montagem do cronograma do projeto e acompanhamento do avanço frente aos prazos acordados." },
      { titulo: "Report de status", texto: "Comunicação periódica do andamento do projeto ao cliente." },
      { titulo: "Programação de cargas", texto: "Planejamento e programação das cargas para expedição e entrega." },
    ],
    pessoas: [
      { nome: "Larissa Mantovani", cargo: "Planejamento", email: "pcp@torg.com.br", tel: "(19) 2023-0207", backup: "Geraldo Tank",
        escopo: ["Elaboração e acompanhamento de cronograma", "Report de status", "Programação de cargas"] },
    ],
  },
  {
    setor: "Produção",
    resumo: "programação, entregas",
    responsabilidades: [
      { titulo: "Programação da produção", texto: "Sequenciamento das ordens de produção conforme o cronograma e a capacidade da fábrica." },
      { titulo: "Alinhamento de frentes de trabalho", texto: "Organização e priorização das frentes de trabalho junto ao cliente e às equipes internas." },
      { titulo: "Status de fabricação", texto: "Acompanhamento e informação do andamento da fabricação de cada item." },
      { titulo: "Prazos de entrega", texto: "Garantia do cumprimento das datas acordadas e sinalização antecipada de desvios." },
      { titulo: "Expedição", texto: "Preparação, conferência e liberação das cargas para transporte." },
    ],
    pessoas: [
      { nome: "Fabrine Susigan", cargo: "Gestora de Contrato", email: "fabrine@torg.com.br", tel: "(19) 97105-8769", backup: "Gabriel Rodrigues",
        escopo: ["Alinhamento e programação de frentes de trabalho"] },
      { nome: "Gabriel Rodrigues", cargo: "Programador de Produção", email: "engenharia3@torg.com.br", tel: "(19) 2023-0207", backup: "Fabrine Susigan",
        escopo: ["Programação da produção"] },
    ],
  },
  {
    setor: "Qualidade",
    resumo: "relatórios, RNCs, treinamentos",
    responsabilidades: [
      { titulo: "Geração de relatórios", texto: "Emissão dos relatórios de qualidade que acompanham o projeto e a fabricação." },
      { titulo: "Tratamento e abertura de RNCs", texto: "Registro, análise e tratamento das não conformidades identificadas." },
      { titulo: "Treinamento de processos", texto: "Capacitação das equipes nos processos e padrões de qualidade." },
    ],
    pessoas: [
      { nome: "Geraldo Tank", cargo: "Qualidade", email: "qualidade@torg.com.br", tel: "(11) 96413-7308", backup: "Fabrine Susigan",
        escopo: ["Gerar relatórios", "Tratamento e abertura de RNCs", "Treinamento de processos"] },
    ],
  },
];

/** Todas as pessoas, com o setor junto — é a lista que o mural mostra. */
export const FOCAIS = MATRIZ_COMUNICACAO.flatMap((s) =>
  s.pessoas.map((p) => ({ ...p, setor: s.setor, setorResumo: s.resumo })),
);

/** Iniciais para o avatar (duas letras: primeiro e último nome). */
export function iniciais(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** Só os dígitos, com o 55 na frente — o link do WhatsApp precisa assim. */
export const zap = (tel) => {
  const d = String(tel || "").replace(/\D/g, "");
  return d ? `https://wa.me/55${d}` : null;
};
