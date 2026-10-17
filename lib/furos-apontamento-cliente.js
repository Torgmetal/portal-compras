import { criarExcelTabular } from './excel-tabular';

/** Arquivo de conferência; diferenças entre setores nunca são uma baixa automática. */
export async function criarPlanilhaFurosApontamento(furos) {
  return criarExcelTabular({
    titulo: 'Conferência de apontamentos — Produção',
    subtitulo: 'LPC atual · obras ativas · conferir as duas etapas antes de lançar no Syneco.',
    abas: [{
      nome: 'Conferência',
      headers: ['OP Torg', 'Obra no Syneco', 'Fase / lista LPC', 'Marca', 'Qtd na LPC',
        'Etapa anterior', 'Apontado anterior', 'Etapa adiante', 'Apontado adiante',
        'Diferença a conferir', 'Orientação'],
      linhas: furos.map(f => [f.op ?? '', f.obraSyneco ?? '', f.opNumero ?? '', f.marca,
        f.qte ?? '', f.setorUp, f.valorUp, f.setor, f.valor, f.diff, f.observacao]),
      larguras: [12, 17, 20, 23, 14, 18, 17, 18, 17, 19, 60],
    }],
  });
}
