// ─── O FORMATO DAS RESPOSTAS DA IA NAS ROTAS ──────────────────────────────────
//
// Os schemas das rotas moram aqui (rota do Next só pode exportar handler e configuração); os das
// bibliotecas `lib/extrair-*.js` moram ao lado do prompt de cada uma. Como são montados, e os
// limites da API que eles respeitam: `lib/ia-json.js` (`Esquema`, `pedirJson`).
//
// ⚠ As listas de tipos ESPELHAM os enums do `prisma/schema.prisma` — o item que a IA devolve é
// gravado depois nesses campos, e valor fora do enum estoura na gravação. O teste
// `testes/lib/ia-esquemas.teste.js` compara as duas.
import { Esquema } from "@/lib/ia-json";
import { TIPO_MATERIAL_LABEL } from "@/lib/perfil-perimetro";

export const TIPOS_MATERIAL = Object.keys(TIPO_MATERIAL_LABEL);
export const TIPOS_PARAFUSO = ["PARAFUSO", "PORCA", "ARRUELA", "CHUMBADOR", "BARRA_ROSCADA", "CONECTOR", "INSERTO", "OUTRO"];
export const CATEGORIAS_ACESSORIO = ["TELHA", "CALHA", "RUFO", "GRADE_PISO", "GALVANIZACAO", "STEEL_DECK", "POLICARBONATO", "ISOLAMENTO", "OUTRO"];

/** Estudo › análise de peso (app/api/comercial/estudo/[id]/analisar). */
export const ESQUEMA_PESO_PROJETO = Esquema.objeto({
  pesoTotalProjeto: Esquema.numeroOuNulo,
  composicao: Esquema.textoOuNulo,
  observacoes: Esquema.textoOuNulo,
  itens: Esquema.lista(Esquema.objeto({
    descricao: Esquema.texto,
    setor: Esquema.textoOuNulo,
    tipoMaterial: Esquema.umDe(TIPOS_MATERIAL),
    norma: Esquema.textoOuNulo,
    comprimento: Esquema.numeroOuNulo,
    pesoUnitario: Esquema.numeroOuNulo,
    quantidade: Esquema.numero,
    pesoTotal: Esquema.numeroOuNulo,
  })),
});

/** Estudo › produtividade: os ids vêm da tabela de tipos estruturais da própria rota. */
export const esquemaProdutividade = (idsDosTipos) => Esquema.objeto({
  pesoTotalEstimado: Esquema.numeroOuNulo,
  observacoes: Esquema.texto,
  composicao: Esquema.lista(Esquema.objeto({
    tipoObraId: Esquema.umDe(idsDosTipos),
    pesoKg: Esquema.numeroOuNulo,
    kgmMedio: Esquema.numeroOuNulo,
    elementosIdentificados: Esquema.texto,
  })),
});

/** Estudo › parafusos e fixadores. `tipo` espelha o enum TipoParafuso. */
export const ESQUEMA_PARAFUSOS = Esquema.objeto({
  observacoes: Esquema.textoOuNulo,
  itens: Esquema.lista(Esquema.objeto({
    tipo: Esquema.umDe(TIPOS_PARAFUSO),
    descricao: Esquema.texto,
    especificacao: Esquema.textoOuNulo,
    diametro: Esquema.textoOuNulo,
    comprimento: Esquema.textoOuNulo,
    unidade: Esquema.texto,
    quantidade: Esquema.numero,
    estimativa: Esquema.logico,
    observacao: Esquema.textoOuNulo,
  })),
});

/** Estudo › acessórios. `categoria` espelha o enum CategoriaAcessorio. */
export const ESQUEMA_ACESSORIOS = Esquema.objeto({
  observacoes: Esquema.textoOuNulo,
  itens: Esquema.lista(Esquema.objeto({
    categoria: Esquema.umDe(CATEGORIAS_ACESSORIO),
    descricao: Esquema.texto,
    especificacao: Esquema.textoOuNulo,
    unidade: Esquema.texto,
    quantidade: Esquema.numero,
    observacao: Esquema.textoOuNulo,
  })),
});

/**
 * Kick Off da OP (app/api/comercial/op/[id]/kickoff/extrair).
 *
 * ⚠ Ausente é texto VAZIO e número ZERO: são mais de dezesseis campos que podem faltar, acima do
 * teto da API para campos "ou null". A sanitização da rota já lê "" e 0 como ausente (`str`,
 * `Number(x) || null`), e zero não é valor possível em nenhum destes números.
 */
export const ESQUEMA_KICKOFF = Esquema.objeto({
  escopo: Esquema.texto,
  escopoIncluso: Esquema.lista(Esquema.texto),
  escopoExcluso: Esquema.lista(Esquema.texto),
  resumoPesos: Esquema.lista(Esquema.objeto({ descricao: Esquema.texto, qtd: Esquema.numero, pesoKg: Esquema.numero })),
  dataEntregaAcordada: Esquema.texto,
  tipoFaturamento: Esquema.texto,
  faturamentoEventos: Esquema.lista(Esquema.objeto({
    descricao: Esquema.texto,
    percentual: Esquema.numero,
    valor: Esquema.numero,
    prazoPagamento: Esquema.texto,
    medicao: Esquema.texto,
    obsNF: Esquema.texto,
  })),
  retencaoContratual: Esquema.texto,
  segurosObrigatorios: Esquema.texto,
  padraoPintura: Esquema.texto,
  inspecao: Esquema.texto,
  entregaEndereco: Esquema.texto,
  frete: Esquema.umDe(["TORG", "CLIENTE", ""]),
  pedidoCompraCliente: Esquema.texto,
  notaRetorno: Esquema.logicoOuNulo,
  faturamentoObs: Esquema.texto,
});

/** Retorno de peças enviadas a terceiro (app/api/expedicao/terceiros/[id]/importar-retorno). */
export const ESQUEMA_RETORNO_TERCEIRO = Esquema.objeto({
  linhas: Esquema.lista(Esquema.objeto({ op: Esquema.textoOuNulo, marca: Esquema.texto, qte: Esquema.numeroOuNulo })),
});
