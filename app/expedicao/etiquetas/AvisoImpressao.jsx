// O AVISO DE COMO IMPRIMIR — texto, e só.
//
// ⚠⚠ MORA NUM ARQUIVO PRÓPRIO PORQUE É O QUE MAIS CRESCE. Cada impressão real que dá errado
// acrescenta um parágrafo aqui — papel "4 x 6", escala, formulário do Windows — e essa preciosidade
// custou duas tardes na Argox. Deixar isso dentro do `EtiquetasClient` fazia a tela estourar o teto
// de 350 linhas por causa de prosa, não de lógica.
//
// A explicação completa do porquê (a lista do driver é em POLEGADAS, "4 x 2" não existe nela) está
// no CLAUDE.md, seção "Etiquetas de carregamento".

export default function AvisoImpressao() {
  return (

      <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-4 py-3 text-[12.5px] text-torg-dark mb-5 mt-4">
        <b>Antes de imprimir</b>, no diálogo do navegador: impressora <b>Argox OS-214 plus</b>,
        <b> Tamanho do papel: USER</b>, <b>Escala: Padrão</b> (nunca &quot;ajustar à área de
        impressão&quot;) e margens <b>nenhuma</b>. A página do PDF já tem o tamanho exato da etiqueta.
        <br />
        {/* ⚠⚠ A LISTA DE PAPEL DO DRIVER ESTÁ EM POLEGADAS, E É POR ISSO QUE NADA CASA. Matheus,
            10/09/2026: a etiqueta saiu deitada e esticada por três etiquetas do rolo. O diálogo
            estava em "4 x 6" — que são 4 × 6 POLEGADAS (101,6 × 152,4 mm, em pé). A nossa etiqueta
            de 100 × 50 mm são 3,94 × 1,97 pol, ou seja "4 x 2", e ESSE TAMANHO NÃO EXISTE na lista
            do driver (2x1, 2x4, 2.25x1.25, 2.50x0.50, 4x1, 4x3, 4x4, 4x5, 4x6). Sobra o USER, que
            precisa ser definido uma vez nas preferências da impressora.

            ⚠ Um aviso anterior mandava procurar "100 × 50 mm" na lista. Nunca ia aparecer — a lista
            é em polegadas e não tem tamanho equivalente. Instrução que manda procurar o que não
            existe é pior que instrução nenhuma: faz quem está imprimindo achar que errou. */}
        <span className="block mt-1.5 text-torg-gray">
          <b>Saiu deitada, ocupando várias etiquetas?</b> Não é o PDF — é o tamanho do papel. A lista
          do driver está em <b>polegadas</b>: &quot;4 x 6&quot; são 4 × 6 pol (101,6 × 152,4 mm, em
          pé), e o navegador gira a etiqueta deitada para caber nesse papel. Os 100 × 50 mm da
          etiqueta equivalem a <b>4 × 2 pol</b>, que <b>não existe na lista</b> — por isso se usa o
          <b> USER</b>. Defina-o uma vez em <i>Painel de Controle → Dispositivos e Impressoras →
          Argox → Preferências de impressão</i> como <b>100 mm de largura × 50 mm de altura</b>,
          depois <b>recarregue esta página</b> (o diálogo só lê a lista ao abrir).
        </span>
      </div>
  );
}
