import { describe, it, expect } from "vitest";
import { marcaDoNome, obraDoArquivo } from "@/lib/mes/nesting/marca";
import { lerRelatorioTubesT, lerArquivoTubesT } from "@/lib/mes/nesting/tubest";
import { lerRelatorioLibellula, lerLxd } from "@/lib/mes/nesting/libellula";
import { conciliarBarra, planoConciliado } from "@/lib/mes/nesting/conciliar";
import { confereComRelatorio } from "@/lib/mes/nesting/libellula";

// A ENGINE DE NESTING — ler o plano do programador e saber o que tem dentro da chapa/barra.
//
// Os trechos abaixo são recortes REDUZIDOS dos arquivos reais (13/09/2026): um plano do TubesT
// (Laser Cantoneira, OP T107A) e um da Libellula (Laser Chapa). Os arquivos inteiros têm dado de
// obra e ficam fora do repositório (§12.7.6).

describe("marcaDoNome — o nome muda de plano para plano", () => {
  it("tira o sufixo de conferência do programador", () => {
    expect(marcaDoNome("T107A-P3_10")).toEqual({ marca: "T107A-P3", conferencia: 10 });
  });

  // ⚠ No Laser Perfil a marca não tem hífen nem "P". A única regra estável é "o que vem antes do
  // último _N" — por isso o casamento com PecaConjunto tem de ser EXATO, nunca por semelhança.
  it("serve para o formato do Laser Perfil também", () => {
    expect(marcaDoNome("T97A5_1").marca).toBe("T97A5");
  });

  // ⚠ Na Libellula o código vem com a pasta do projeto na frente.
  it("descarta o caminho do projeto", () => {
    expect(marcaDoNome("T107-TMSA\\T107A-P14").marca).toBe("T107A-P14");
  });

  it("nome sem sufixo continua inteiro, e sem conferência inventada", () => {
    expect(marcaDoNome("T107A-P14")).toEqual({ marca: "T107A-P14", conferencia: null });
  });

  it("a obra sai do nome do arquivo, como pista", () => {
    expect(obraDoArquivo("11-09-2026 - T107A - W150X13.pdf")).toBe("T107A");
    expect(obraDoArquivo("T107A - 9.50mm.pdf")).toBe("T107A");
  });
});

const PDF_TUBEST = `11-09-2026 - T107A - W150X13 Note Part Info Section:I-Beam 148 X 100 X 4,3 X 4,9 R11,1,45°
 Part Type:11 Part Count:35 ID Part Name Qty Part Length(mm) 1 T107A-P1_8 8/8 679,60 2 T107A-P12_2 2/2 1357,60
 11 T107A-P3_10 10/10 62,30 Tube Info Section:X ID Tube Count Tube Length(mm) Cutoff Distance(mm) 1 4/999 12000,00 0,00
 Nesting List Section:X Tube Count:4 Part Count:35
 Nesting Name Qty Parts per tube Tube Length(mm) Remnant Length(mm) Utilization
 I-Beam 148 X 100 X 4,3 X 4,9 R11,1,45°_Nest 1 1 3 12000,00 2,13 100,0%
 ID Part Name Qty Identical parts per tube Part Length(mm) 11 T107A-P3_10 1 1 62,30 2 T107A-P12_2 2 2 1357,60
 Nesting Name Qty Parts per tube Tube Length(mm) Remnant Length(mm) Utilization
 I-Beam 148 X 100 X 4,3 X 4,9 R11,1,45°_Nest 2 1 2 12000,00 11008,90 8,3%
 2026/09/11 16:21:12 1/2 ID Part Name Qty Identical parts per tube Part Length(mm) 1 T107A-P1_8 2 2 679,60`;

describe("lerRelatorioTubesT — o PDF é quem manda na quantidade", () => {
  const plano = lerRelatorioTubesT(PDF_TUBEST);

  it("lê a lista mestra com o total de cada marca", () => {
    expect(plano.tipos).toHaveLength(3);
    expect(plano.tipos[0]).toMatchObject({ marca: "T107A-P1", total: 8, feitas: 8, comprimentoMm: 679.6 });
  });

  it("lê uma barra por bloco, com sobra e aproveitamento", () => {
    expect(plano.barras).toHaveLength(2);
    expect(plano.barras[0]).toMatchObject({ indice: 1, pecas: 3, sobraMm: 2.13, aproveitamento: 100 });
    expect(plano.barras[1]).toMatchObject({ indice: 2, pecas: 2, sobraMm: 11008.9 });
  });

  // ⚠⚠ O rodapé de página cai NO MEIO do bloco quando a lista de uma barra atravessa a página —
  // foi o que aconteceu na Nest 3 do arquivo real. Sem limpar, o cabeçalho repetido vira uma linha
  // de peça e a barra ganha um item que não existe.
  it("o rodapé de página não vira peça", () => {
    expect(plano.barras[1].itens).toEqual([
      expect.objectContaining({ marca: "T107A-P1", qtd: 2 }),
    ]);
  });
});

const ZIP = {
  "info.xml": '<PackData><Application AppName="TubesT" AppVer="2025V2.12"/><SavedBy Computer="ENGENHARIA02"/></PackData>',
  "Portions/content.xml": `<Portions>
    <NestedTube Handle="1702" Name="Perfil_Nest 1">
      <PackSegments><WorkSeq><Seg Handle="10"/><Seg Handle="20"/><Seg Handle="30"/></WorkSeq></PackSegments>
    </NestedTube>
    <ExtParts><NestPart Handle="1052" Name="T107A-P3_10"/><NestPart Handle="1103" Name="T107A-P12_2"/></ExtParts>
  </Portions>`,
  "Segments/content.xml": `<Segments>
    <TubeSegment Handle="10"><Shapes><GeoCurve Handle="11"/></Shapes></TubeSegment>
    <TubeSegment Handle="20"><Shapes><Text Handle="21" ParentHandle="22"/><Text Handle="22" Erased="true"/></Shapes></TubeSegment>
    <TubeSegment Handle="30"><Shapes><Text Handle="31"/></Shapes></TubeSegment>
  </Segments>`,
  "Shapes/content.xml": `<Shapes>
    <Text Class="Text" Handle="21"><Geometry/><TextData TextFlag="1" Text="T107A-P12_2" TextHeight="15"/></Text>
    <Text Class="Text" Handle="31"><Geometry/><TextData TextFlag="1" Text="T107A-P12_2"/></Text>
  </Shapes>`,
};

describe("lerArquivoTubesT — a marca está GRAVADA na peça", () => {
  const lido = lerArquivoTubesT((nome) => ZIP[nome] || "");

  // ⚠⚠ ACHADO DE 13/09/2026, relendo o .rar inteiro: `Shapes/content.xml` tem o texto que o laser
  // grava na peça, e `Segments/content.xml` diz qual peça carrega qual texto. É o que dá a ORDEM
  // DE CORTE peça a peça — coisa que o PDF não tem.
  it("dá a ordem de corte com a marca de cada peça", () => {
    expect(lido.barras[0].cortes).toEqual([
      { segmento: "10", gravado: null },
      { segmento: "20", gravado: "T107A-P12_2" },
      { segmento: "30", gravado: "T107A-P12_2" },
    ]);
  });

  it("identifica o programa e a máquina de quem gerou", () => {
    expect(lido.programa).toBe("TubesT 2025V2.12");
    expect(lido.computador).toBe("ENGENHARIA02");
  });
});

describe("conciliarBarra — a peça curta não tem nome no arquivo da máquina", () => {
  const doArquivo = {
    cortes: [
      { segmento: "10", gravado: null },
      { segmento: "20", gravado: "T107A-P12_2" },
      { segmento: "30", gravado: "T107A-P12_2" },
    ],
  };

  // ⚠⚠ A T107A-P3 tem 62,30 mm: não cabe gravação, e o TubesT não põe texto nela. São 10 das 35
  // peças do plano real. Sem o cruzamento, o operador veria buraco na lista.
  it("deduz do relatório quando sobra UMA marca possível", () => {
    const { cortes, divergencias } = conciliarBarra(
      { pecas: 3, itens: [{ marca: "T107A-P3", qtd: 1 }, { marca: "T107A-P12", qtd: 2 }] },
      doArquivo,
    );
    expect(cortes[0]).toMatchObject({ marca: "T107A-P3", deduzida: true, gravada: false });
    expect(divergencias).toEqual([]);
  });

  // ⚠⚠ CHUTAR AQUI VIRA BAIXA NA MARCA ERRADA, e erro de baixa só aparece no inventário meses
  // depois. Com dois candidatos, o corte fica sem nome e a divergência é dita.
  it("com mais de um candidato, não inventa — deixa sem nome e avisa", () => {
    const { cortes, divergencias } = conciliarBarra(
      { pecas: 4, itens: [{ marca: "T107A-P3", qtd: 1 }, { marca: "T107A-P9", qtd: 1 }, { marca: "T107A-P12", qtd: 2 }] },
      { cortes: [...doArquivo.cortes, { segmento: "40", gravado: null }] },
    );
    expect(cortes.filter((c) => !c.marca)).toHaveLength(2);
    expect(divergencias.join(" ")).toMatch(/mais de uma marca possível/);
  });

  it("acusa quando o relatório e o arquivo discordam na contagem", () => {
    const { divergencias } = conciliarBarra(
      { pecas: 9, itens: [{ marca: "T107A-P12", qtd: 9 }] },
      doArquivo,
    );
    expect(divergencias.join(" ")).toMatch(/9 peças nesta barra e o arquivo tem 3/);
  });

  // ⚠ Marca gravada que não está no relatório é o sinal de replano: o arquivo da máquina é de uma
  // versão do plano e o PDF de outra. Passar batido faria cortar uma coisa e baixar outra.
  it("acusa marca que existe no arquivo e não no relatório", () => {
    const { divergencias } = conciliarBarra(
      { pecas: 3, itens: [{ marca: "T107A-P3", qtd: 3 }] },
      doArquivo,
    );
    expect(divergencias.join(" ")).toMatch(/T107A-P12 está gravada no arquivo/);
  });
});

const PDF_LIBELLULA = `Dim acabamento (mm) Dim xy (mm x mm) Espessura (mm) Material Notas Código da chapa
 Chapas n ° 1 AÇO 9.53 1500 x 3000 1494.1 x 1062.83 RX+:5 Nome do arquivo de trabalho Chapa (Kg)
 Número de corte Tempo de corte Qty peça 64 00:00:00 01:02:09 00:16:53 48390.66 28892.09 9003.01 185Não utilizado (%)
 Trabalho T107A - 9.50mm Fibra Laser Máquina ID Código de peça Descrição Dimensão (mm x mm)
 1 T107-TMSA\\T107A-P14 200.37 x 127.64 842.61 1.352 6 3 140.29 00:06:20 (00:01:03)
 10 T107-TMSA\\T107A-P6 150 x 127.85 742.3 1.267 26 3 130.11 00:24:06 (00:00:55)`;

describe("lerRelatorioLibellula — no Laser Chapa o PDF é a ÚNICA fonte de nome", () => {
  const plano = lerRelatorioLibellula(PDF_LIBELLULA);

  it("lê o cabeçalho do plano", () => {
    expect(plano).toMatchObject({
      trabalho: "T107A - 9.50mm", material: "AÇO", espessuraMm: 9.53, chapas: 1, pecas: 64, piercings: 185,
    });
    expect(plano.chapaMm).toEqual([1500, 3000]);
  });

  // ⚠ A coluna "Descrição" vem VAZIA nestes arquivos, então a âncora é o código com a contrabarra,
  // não a posição da coluna.
  it("lê a tabela de peças mesmo com a descrição vazia", () => {
    expect(plano.itens).toHaveLength(2);
    expect(plano.itens[0]).toMatchObject({ marca: "T107A-P14", qtd: 6, pesoKg: 1.352, projeto: "T107-TMSA" });
  });
});

describe("lerLxd — o arquivo da máquina não nomeia, mas confere", () => {
  const XML = `<LXDDocument><DocHeader/><ExtMax X="1500" Y="3000"/><Entities>
    <LwPolyline ChannelPort="1" PointCount="4"><LeadIn/></LwPolyline>
    <LwPolyline ChannelPort="1" PointCount="4"><LeadIn/></LwPolyline>
    <LwPolyline ChannelPort="2" PointCount="9"/>
    <Circle><Center/><LeadIn/></Circle>
  </Entities></LXDDocument>`;

  // ⚠⚠ A CONTA QUE FECHA: contornos de corte + furos = piercings do relatório (no arquivo real,
  // 164 + 21 = 185). É o que prova que este .lxd é deste PDF sem depender do nome do arquivo.
  it("conta corte, furo e piercing, e diz se fecha", () => {
    expect(lerLxd(XML)).toMatchObject({ corte: 2, gravacao: 1, furos: 1, piercings: 3, fecha: true });
  });

  // ⚠⚠ A CHAPA NÃO ESTÁ NO `<ExtMax>`: ele vem -50..50 nestes arquivos (o padrão do documento
  // vazio). Lendo dali, a conferência acusava "1500x3000 contra 50x50" num arquivo perfeito.
  it("a chapa sai da polilinha de contorno, não do cabeçalho", () => {
    const comContorno = `<LXDDocument><ExtMax X="50" Y="50"/><Entities>
      <LwPolyline Handle="1001" NoExport="1" PointCount="4">
        <Point/><Point X="1500"/><Point X="1500" Y="3000"/><Point Y="3000"/>
      </LwPolyline>
      <LwPolyline ChannelPort="1" PointCount="2"><LeadIn/></LwPolyline>
    </Entities></LXDDocument>`;
    expect(lerLxd(comContorno).chapaMm).toEqual([1500, 3000]);
  });

  it("a gravação é vetorizada — é por isso que não existe nome de peça no arquivo", () => {
    expect(lerLxd(XML).gravacao).toBe(1);
    expect(XML).not.toMatch(/<Text/);
  });
});


// ─── OS CASOS QUE O CODEX PEDIU (13/09/2026) ─────────────────────────────────

describe("a leitura que falha tem de parecer falha, não plano vazio", () => {
  // ⚠⚠ Basta o TubesT mudar `Tube Length(mm)` para `Tube Length (mm)` numa atualização para os
  // blocos sumirem. Sem esta checagem, o plano entraria como "plano sem trabalho" — importado com
  // sucesso, e vazio.
  it("acusa relatório sem barra nenhuma", () => {
    const plano = lerRelatorioTubesT("Part Info Section:X Part Type:2 Part Count:2 ID Part Name Qty Part Length(mm) 1 A_1 1/1 10,00");
    expect(plano.falhas.join(" ")).toMatch(/Nenhuma barra/);
  });

  it("acusa quando li menos barras do que o relatório declara", () => {
    const plano = lerRelatorioTubesT(PDF_TUBEST);
    expect(plano.barraTotal).toBe(4);
    expect(plano.falhas.join(" ")).toMatch(/4 barras e eu li 2/);
  });

  it("texto que não é do TubesT não vira plano", () => {
    expect(lerRelatorioTubesT("qualquer coisa").falhas.length).toBeGreaterThan(0);
  });

  // ⚠ A tabela da Libellula é lida por regex: um código sem contrabarra, um "×" no lugar do "x" e
  // a linha não casa. Sem a soma, o plano entraria com uma marca a menos e ninguém saberia.
  it("a Libellula acusa quando a tabela não soma o cabeçalho", () => {
    const plano = lerRelatorioLibellula(PDF_LIBELLULA);
    expect(plano.pecas).toBe(64);
    expect(plano.falhas.join(" ")).toMatch(/64 peças e a tabela soma 32/);
  });

  it("a Libellula lê a linha mesmo com a descrição preenchida", () => {
    const comDescricao = PDF_LIBELLULA.replace(
      "1 T107-TMSA\\T107A-P14 200.37", "1 T107-TMSA\\T107A-P14 CHAPA DE BASE 200.37",
    );
    const item = lerRelatorioLibellula(comDescricao).itens[0];
    expect(item).toMatchObject({ marca: "T107A-P14", descricao: "CHAPA DE BASE", qtd: 6 });
  });
});

describe("o plano inteiro, barra a barra", () => {
  const relatorio = {
    barras: [
      { indice: 1, pecas: 1, itens: [{ marca: "A", qtd: 1 }] },
      { indice: 2, pecas: 1, itens: [{ marca: "B", qtd: 1 }] },
    ],
  };
  const arquivo = (indice, gravado) => ({ barras: [{ indice, cortes: [{ segmento: "1", gravado }] }] });

  it("casa cada barra com o seu arquivo", () => {
    const plano = planoConciliado(relatorio, [arquivo(1, "A_1"), arquivo(2, "B_1")]);
    expect(plano.divergencias).toEqual([]);
    expect(plano.barras.every((b) => b.temArquivo)).toBe(true);
  });

  // ⚠⚠ ACHADO DO CODEX: dois `_Nest 1` na mesma pasta (o plano refeito e o antigo) caíam no mesmo
  // `Map` e prevalecia o ÚLTIMO lido — que depende da ordem do sistema de arquivos.
  it("dois arquivos para a mesma barra é ambiguidade, não o último que chegou", () => {
    const plano = planoConciliado(relatorio, [arquivo(1, "A_1"), arquivo(1, "Z_1"), arquivo(2, "B_1")]);
    expect(plano.barras[0].temArquivo).toBe(false);
    expect(plano.divergencias.join(" ")).toMatch(/mais de um arquivo para a Nest 1/);
  });

  // ⚠⚠ ISTO ACUSOU FALSO NAS QUATRO BARRAS DO PLANO REAL até eu rodar a engine nos arquivos de
  // verdade (13/09/2026). O `.yxy` é o plano INTEIRO e contém as mesmas barras que os `.zx`, que
  // são recortes dele — não são duas versões disputando. Vale o arquivo DA BARRA, que é o que vai
  // para a máquina.
  it("o plano inteiro (.yxy) não disputa a barra com o recorte (.zx)", () => {
    const plano = planoConciliado(relatorio, [
      { ...arquivo(1, "Z_1"), origem: "plano" },
      { ...arquivo(1, "A_1"), origem: "barra" },
      { ...arquivo(2, "B_1"), origem: "barra" },
    ]);
    expect(plano.barras[0].temArquivo).toBe(true);
    expect(plano.barras[0].cortes[0].marca).toBe("A");
    expect(plano.divergencias).toEqual([]);
  });

  it("o plano preenche a barra que não tem recorte", () => {
    const plano = planoConciliado(relatorio, [
      { ...arquivo(1, "A_1"), origem: "plano" }, { ...arquivo(2, "B_1"), origem: "barra" },
    ]);
    expect(plano.barras[0].temArquivo).toBe(true);
    expect(plano.divergencias).toEqual([]);
  });

  it("barra que só existe no arquivo aparece como divergência", () => {
    const plano = planoConciliado(relatorio, [arquivo(1, "A_1"), arquivo(2, "B_1"), arquivo(9, "X_1")]);
    expect(plano.divergencias.join(" ")).toMatch(/Nest 9, que não existe no relatório/);
  });

  it("a falha de leitura do relatório viaja junto com as divergências", () => {
    const plano = planoConciliado({ ...relatorio, falhas: ["Nenhuma marca lida."] }, []);
    expect(plano.divergencias[0]).toBe("Nenhuma marca lida.");
  });
});

describe("a dedução é desfeita se a barra não bater no resto", () => {
  // ⚠⚠ ACHADO DO CODEX: nomear a peça no meio de um plano que já não bate é carimbar palpite em
  // cima de dado suspeito. A dedução é aplicada por tentativa e DESFEITA se sobrar desacerto.
  it("com uma marca a mais no arquivo, ninguém é deduzido", () => {
    const { cortes, divergencias } = conciliarBarra(
      { pecas: 3, itens: [{ marca: "A", qtd: 1 }, { marca: "B", qtd: 2 }] },
      { cortes: [{ gravado: null }, { gravado: "B_2" }, { gravado: "Z_1" }] },
    );
    expect(cortes.some((c) => c.deduzida)).toBe(false);
    expect(divergencias.join(" ")).toMatch(/Z está gravada no arquivo/);
  });
});

describe("confereComRelatorio — conferência, não prova de identidade", () => {
  it("acusa piercing e chapa diferentes", () => {
    const avisos = confereComRelatorio(
      { piercings: 180, chapaMm: [1500, 3000] },
      { piercings: 185, chapaMm: [1500, 6000] },
    );
    expect(avisos).toHaveLength(2);
  });

  // ⚠ `0 + 0 === 0` fazia um arquivo vazio se declarar coerente. Coerência de nada não é coerência.
  it("arquivo vazio não passa por coerente", () => {
    expect(lerLxd("<LXDDocument/>").fecha).toBe(false);
    expect(confereComRelatorio({ piercings: 0 }, { piercings: 0 }).join(" ")).toMatch(/vazio/);
  });
});
