// Planilha de perfis e parafusos do Omie para o Tekla. Vitor (24/09/2026): "sempre que um novo tipo de
// perfil for cadastrado no Omie, cadastrou vc cria uma planilha nova (…) somente com perfis e
// parafusos". As descrições abaixo são do cadastro real do Omie.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/omie-produtos", () => ({ listarProdutosOmie: vi.fn() }));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: vi.fn(), downloadFileById: vi.fn(), uploadFileToFolder: vi.fn() }));

import {
  grupoDoProduto, lerPerfil, lerParafuso, linhasDaPlanilha, codigosNovos, nomeDoArquivo,
  gerarPlanilhaMateriaisTekla, codigosDaPlanilha, descricoesDaPlanilha, mudancasDoCadastro, PASTA_TEKLA,
} from "@/lib/materiais-tekla";
import { publicarMateriaisTekla } from "@/lib/materiais-tekla-publicar";
import { listarProdutosOmie } from "@/lib/omie-produtos";
import { listChildrenByPath, downloadFileById, uploadFileToFolder } from "@/lib/sharepoint";

const MP = "Matéria Prima", FX = "Fixadores";
const prod = (codigo, descricao, familia = MP, extra = {}) => ({ codigo, descricao, familia, unidade: familia === FX ? "UN" : "KG", inativo: false, ...extra });

describe("o que entra: só perfis e parafusos", () => {
  it.each([
    [prod("501000049", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W530 X 85,0KG/M"), "PERFIL"],
    [prod("401000021", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/8 X 3POL"), "PERFIL"],
    [prod("201000091", "TUBO ACO CARBONO Ø5\" SCH40"), "PERFIL"],
    [prod("301000015", "BARRA CHATA ACO CARBONO LAMINADA A-36 DN. 1/4 X 5/8POL"), "PERFIL"],
    [prod("x1", "VS850X300X19.0X9.5"), "PERFIL"],
    [prod("x2", "TRILHO TR 25"), "PERFIL"],
    [prod("120000164", "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", FX), "PARAFUSO"],
    [prod("x3", "PARAF. SEXT 1/2\"X2\"", FX), "PARAFUSO"],
  ])("%s → %s", (p, g) => expect(grupoDoProduto(p)).toBe(g));

  it.each([
    ["chapa", prod("101000007", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 12,50MM")],
    ["porca", prod("x", "PORCA SEXT. A563 - 7/8\" - GF", FX)],
    ["barra roscada (é fixador)", prod("150000047", "BARRA ROSCADA 1/4\" - 1m - GF", FX)],
    ["chumbador", prod("x", "CHUMBADOR PARABOLT 5/8 X 3.1/2", FX)],
    ["cópia do Omie", prod("x", "Cópia de PERFIL DOBRADO UDC 200X25X2,65 em 01/09/2026 às 17:31:47")],
    ["borracha", prod("x", "PERFIL ESPONJOSO 50X80X1900MM - D18 CINZA")],
    ["sem família", prod("01.42.00318", "PERFIL ESTRUTURAL HP310 X 79 X", null)],
    ["inativo", prod("x", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3KG/M", MP, { inativo: true })],
    ["degrau pronto", prod("x", "DEGRAU - CONFORME DESENHO")],
  ])("fica de fora: %s", (_n, p) => expect(grupoDoProduto(p)).toBeNull());
});

describe("lendo a descrição do perfil", () => {
  it.each([
    ["PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3KG/M", "Perfil W", "W 200 x 31,3", 31.3, "ASTM A572 GR.50"],
    ["PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. HP200 X 53,0KG/M", "Perfil HP", "HP 200 x 53,0", 53, "ASTM A572 GR.50"],
    ["PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN   W610 x 155 Kg/m", "Perfil W", "W 610 x 155", 155, "ASTM A572 GR.50"],
    ["PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. WH200 X 86,0KG/M", "Perfil W", "WH 200 x 86,0", 86, "ASTM A572 GR.50"],
    ["PERFIL U ACO CARBONO LAMINADO A-36 DN. 6POL X 12,20KG/M", "Perfil U", "U 6\" x 12,20", 12.2, "ASTM A36"],
    ["PERFIL I ACO CARBONO LAMINADO A-36 DN. 3POL X 8,44KG/M", "Perfil I", "I 3\" x 8,44", 8.44, "ASTM A36"],
    ["PERFIL \"U\" - 8\" X 17,10 KG/MX", "Perfil U", "U 8\" x 17,10", 17.1, null],
    ["PERFIL DOBRADO UDCE 75x40x15x3,00", "Perfil dobrado", "UDCE 75 x 40 x 15 x 3,00", null, null],
    ["CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 1/4 X 2.1/2POL", "Cantoneira", "L 2.1/2\" x 1/4\"", null, "ASTM A36"],
    ["CANTONEIRA ACO CARBONO DOBRADA 56X25X4,75", "Cantoneira dobrada", "L 56 x 25 x 4,75", null, null],
    ["TUBO ACO CARBONO Ø5\" SCH40", "Tubo redondo", "Ø 5\" SCH 40", null, null],
    ["TUBO ACO CARBONO GALVANIZADO COM COSTURA (CC) NBR 5580-L DN. 1POL X 2,65MM", "Tubo redondo", "DN 1\" x 2,65 mm", null, "NBR 5580"],
    ["TUBO ACO CARBONO LAMINADO COM COSTURA (CC) SAE/DIN/NBR D. 152,40 X 4,75MM", "Tubo redondo", "Ø 152,40 x 4,75 mm", null, null],
    ["TUBO ACO CARBONO COM COSTURA (CC) SCH 40 DN. 219,08 X 8,18MM", "Tubo redondo", "Ø 219,08 x 8,18 mm SCH 40", null, null],
    ["TUBO RETANGULAR 150X50X3,00MM", "Tubo retangular", "150 x 50 x 3,00 mm", null, null],
    ["TUBO REDONDO (42,40) X 3,35MM", "Tubo redondo", "Ø 42,40 x 3,35 mm", null, null],
    ["BARRA REDONDA ACO CARBONO LAMINADA A-36 D. 3/4POL", "Barra redonda", "Ø 3/4\"", null, "ASTM A36"],
    ["BARRA REDONDA ACO CARBONO LAMINADA A-36 DN. 9.1/2POL", "Barra redonda", "Ø 9.1/2\"", null, "ASTM A36"],
    ["BARRA REDONDA ACO CARBONO LAMINADA SAE-4340 D. 2.3/4POL", "Barra redonda", "Ø 2.3/4\"", null, "SAE 4340"],
    ["BARRA CHATA ACO CARBONO LAMINADA MULTINORMAS COMERCIAL DN. 7/8 X 1/8POL", "Barra chata", "7/8\" x 1/8\"", null, "Multinormas comercial"],
    ["BARRA CHATA ACO INOX LAMINADA A-240 TP. 304 DN. 1/8 X 1POL", "Barra chata", "1/8\" x 1\"", null, "ASTM A240 TP.304 (inox)"],
    ["BARRA REDONDA VERGALHÃO 25.40mm NERVURADO", "Barra redonda", "Ø 25.40 mm", null, null],
    ["VS850X300X19.0X9.5", "Perfil soldado", "VS 850 x 300 x 19.0 x 9.5", null, null],
    ["PS 500X253", "Perfil soldado", "PS 500 x 253", null, null],
    ["TRILHO TR 25", "Trilho", "TR 25", null, null],
    // variações reais que a primeira leitura não pegava (ensaio contra o Omie, 24/09/2026)
    ["PERFIL DOBRADO ESP. UDC 100x35x2,00", "Perfil dobrado", "UDC 100 x 35 x 2,00", null, null],
    ["PERFIL DOBRADO XADREZ L 38x38x3", "Perfil dobrado", "XADREZ L 38 x 38 x 3", null, null],
    ["CANTONEIRA 4\" X 5/16\" ACO CARB", "Cantoneira", "L 4\" x 5/16\"", null, null],
    ["TUBO ACO CARBONO 2\" SCH40", "Tubo redondo", "Ø 2\" SCH 40", null, null],
    ["TUBO ACO CARBONO GALVANIZADO COM COSTURA (CC) NBR 5580-L DN. 1 1/2POL X 3,00MM", "Tubo redondo", "DN 1.1/2\" x 3,00 mm", null, "NBR 5580"],
    ["TUBO HSS 200X150X6.40", "Tubo retangular", "200 x 150 x 6.40 mm", null, null],
    ["TUBO METALON 50X50X2.50", "Tubo quadrado", "50 x 50 x 2.50 mm", null, null],
    ["TUBO 6mm -  100x50x1,50", "Tubo retangular", "100 x 50 x 1,50 mm", null, null],
    ["TUBO ACO CARBONO Ø7/8X2.00", "Tubo redondo", "Ø 7/8 x 2.00", null, null],
  ])("%s", (descricao, tipo, designacao, peso, material) => {
    expect(lerPerfil(descricao)).toEqual({ tipo, designacao, pesoKgM: peso, material });
  });

  it("o que não se lê com segurança fica em branco — nunca um chute", () => {
    // descrição truncada no Omie: lê o material, e não inventa bitola nem peso
    expect(lerPerfil("PERFIL TP. \"W\" AC ASTM A-572 G.")).toEqual({ tipo: "Perfil", designacao: null, pesoKgM: null, material: "ASTM A572" });
  });
});

describe("lendo a descrição do parafuso", () => {
  it.each([
    ["PARAFUSO SEXT. A325 -  1.1/4\"X4.1/2\" - GF", { norma: "ASTM A325", diametro: "1.1/4\"", comprimento: "4.1/2\"", cabeca: "Sextavada", acabamento: "Galvanizado a fogo" }],
    ["PARAFUSO SEXT. A307 -  1/2\"X2.1/2\" - BICRO", { norma: "ASTM A307", diametro: "1/2\"", comprimento: "2.1/2\"", cabeca: "Sextavada", acabamento: "Bicromatizado" }],
    ["PARAFUSO SEXT. A325 -  1/2\"X1.3/4\" - ZB", { norma: "ASTM A325", diametro: "1/2\"", comprimento: "1.3/4\"", cabeca: "Sextavada", acabamento: "Zincado" }],
    ["PARAFUSO CABECA SEXTAVADA DIN267 CL 5.8 ZINCADO DIN933 DN. M12 X 30 ROSCA (MA) D", { norma: "DIN 933 · classe 5.8", diametro: "M12", comprimento: "30 mm", cabeca: "Sextavada", acabamento: "Zincado" }],
    ["PARAF FRANCES M8X25 DIN 603 8.8 BICROM", { norma: "DIN 603 · classe 8.8", diametro: "M8", comprimento: "25 mm", cabeca: "Francês", acabamento: "Bicromatizado" }],
    ["PARAF CAB SEXT M10X40 DIN 933 AISI 304 NT", { norma: "DIN 933 · AISI 304", diametro: "M10", comprimento: "40 mm", cabeca: "Sextavada", acabamento: "Inox" }],
    ["PARAF CAB SEXT M12X30 DIN 933 5.8 ZINC FOG", { norma: "DIN 933 · classe 5.8", diametro: "M12", comprimento: "30 mm", cabeca: "Sextavada", acabamento: "Galvanizado a fogo" }],
    // a norma colada na polegada não pode virar bitola; rosca UNC no meio; comprimento em mm
    ["PARAFUSO SEXT. A-307 5/16\"- 18 UNC X 2.1/2\" ZB", { norma: "ASTM A307", diametro: "5/16\"", comprimento: "2.1/2\"", cabeca: "Sextavada", acabamento: "Zincado" }],
    ["PARAFUSO CAB. SEXT. AUTOATARRAXANTE 3/16\"X50mm + COM BUCHA S8 + ARRUELA", { norma: null, diametro: "3/16\"", comprimento: "50 mm", cabeca: "Sextavada", acabamento: null }],
    ["PARAFUSO SEXT. INOX A304 - M12X40", { norma: "AISI 304", diametro: "M12", comprimento: "40 mm", cabeca: "Sextavada", acabamento: "Inox" }],
  ])("%s", (descricao, esperado) => expect(lerParafuso(descricao)).toEqual(esperado));
});

describe("as linhas, o nome do arquivo e o que é novo", () => {
  it("separa, tira repetido e ordena por tipo", () => {
    const { perfis, parafusos } = linhasDaPlanilha([
      prod("401000021", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/8 X 3POL"),
      prod("501000007", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3KG/M"),
      prod("501000007", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3KG/M"),
      prod("120000164", "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", FX),
      prod("101000007", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 12,50MM"),
    ]);
    expect(perfis.map((p) => p.codigo)).toEqual(["501000007", "401000021"]);
    expect(parafusos.map((p) => p.codigo)).toEqual(["120000164"]);
  });

  it("novo é o código que não estava na última planilha; sem planilha anterior, nada é 'novo'", () => {
    expect(codigosNovos(["a", "b", "c"], new Set(["a", "b"]))).toEqual(["c"]);
    expect(codigosNovos(["a"], null)).toEqual([]);
  });

  it("o nome leva data e hora de Brasília — a ordem alfabética é a cronológica", () => {
    expect(nomeDoArquivo(new Date("2026-09-24T20:05:00Z"))).toBe("Materiais OMIE - Tekla 2026-09-24 17h05.xlsx");
    expect(nomeDoArquivo(new Date("2026-09-25T01:30:00Z"))).toBe("Materiais OMIE - Tekla 2026-09-24 22h30.xlsx");
  });

  it("a planilha volta com os mesmos códigos, como texto — o zero à esquerda não some", async () => {
    const { perfis, parafusos } = linhasDaPlanilha([
      prod("0501000049", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W530 X 85,0KG/M"),
      prod("120000164", "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", FX),
    ]);
    const buf = await gerarPlanilhaMateriaisTekla({ perfis, parafusos, novos: new Set(["120000164"]) });
    expect([...(await codigosDaPlanilha(buf))].sort()).toEqual(["0501000049", "120000164"]);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Perfis", "Parafusos", "Mudanças", "Leia-me"]);
    expect(wb.getWorksheet("Perfis").getRow(1).getCell(1).value).toBe("Código Omie"); // tabela começa na linha 1
    expect(wb.getWorksheet("Parafusos").getRow(2).getCell(9).value).toBe("sim");
    const mud = wb.getWorksheet("Mudanças").getRow(2);
    expect([mud.getCell(1).value, mud.getCell(2).value, mud.getCell(3).value]).toEqual(["Novo", "Parafuso", "120000164"]);
  });
});

// Vitor (24/09/2026): "esses duplicados é possível alterarmos para depois não ocorrer conflitos?". A
// limpeza é inativar no Omie — e o código inativado tem de SAIR da pasta que o Tekla lê.
describe("o que mudou desde a última planilha", () => {
  const antes = new Map([
    ["501000014", { descricao: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 32,7KG/M", grupo: "Perfil" }],
    ["501000071", { descricao: "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 32,7KG/M", grupo: "Perfil" }],
    ["101000036", { descricao: "PERFIL QUALQUER 2.65MM", grupo: "Perfil" }],
  ]);

  it("novo, fora do cadastro e descrição alterada, cada um na sua lista", () => {
    const r = mudancasDoCadastro([
      { codigo: "501000014", descricao: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 32,7KG/M" },
      { codigo: "101000036", descricao: "PERFIL QUALQUER 2,65MM" },
      { codigo: "501000099", descricao: "PERFIL W NOVO" },
    ], antes);
    expect(r.novos).toEqual(["501000099"]);
    expect(r.sairam).toEqual([{ codigo: "501000071", descricao: "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 32,7KG/M", grupo: "Perfil" }]);
    expect(r.alterados).toEqual([{ codigo: "101000036", descricao: "PERFIL QUALQUER 2,65MM", anterior: "PERFIL QUALQUER 2.65MM" }]);
  });

  it("espaço a mais não é descrição alterada", () => {
    const r = mudancasDoCadastro([...antes].map(([codigo, a]) => ({ codigo, descricao: ` ${a.descricao.replace(/ /g, "  ")} ` })), antes);
    expect(r).toEqual({ novos: [], sairam: [], alterados: [] });
  });

  it("sem planilha anterior não há mudança a relatar", () => {
    expect(mudancasDoCadastro([{ codigo: "1", descricao: "x" }], null)).toEqual({ novos: [], sairam: [], alterados: [] });
  });

  it("a planilha publicada devolve código, descrição e grupo", async () => {
    const { perfis, parafusos } = linhasDaPlanilha([
      prod("0501000049", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W530 X 85,0KG/M"),
      prod("120000164", "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", FX),
    ]);
    const lidas = await descricoesDaPlanilha(await gerarPlanilhaMateriaisTekla({ perfis, parafusos }));
    expect(lidas.get("0501000049")).toEqual({ descricao: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W530 X 85,0KG/M", grupo: "Perfil" });
    expect(lidas.get("120000164")).toEqual({ descricao: "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", grupo: "Parafuso" });
  });
});

describe("publicar: planilha nova só quando o cadastro de perfis e parafusos muda", () => {
  const CATALOGO = [
    prod("501000007", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3KG/M"),
    prod("120000164", "PARAFUSO SEXT. A325 -  7/8\"X4\" - GF", FX),
  ];
  const AGORA = new Date("2026-09-24T20:05:00Z");
  let publicada;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SHAREPOINT_DRIVE_ID = "drive-servidor";
    listarProdutosOmie.mockResolvedValue(CATALOGO);
    uploadFileToFolder.mockImplementation(async ({ fileName, buffer }) => { publicada = buffer; return { name: fileName, webUrl: `https://x/${fileName}` }; });
    const { perfis, parafusos } = linhasDaPlanilha(CATALOGO);
    const anterior = await gerarPlanilhaMateriaisTekla({ perfis, parafusos });
    downloadFileById.mockResolvedValue({ buffer: anterior });
  });

  it("pasta vazia: publica a primeira planilha", async () => {
    listChildrenByPath.mockResolvedValue([]);
    const r = await publicarMateriaisTekla({ agora: AGORA });
    expect(r).toMatchObject({ publicado: true, arquivo: "Materiais OMIE - Tekla 2026-09-24 17h05.xlsx", perfis: 1, parafusos: 1, anterior: null });
    expect(uploadFileToFolder.mock.calls[0][0].folderPath).toBe(PASTA_TEKLA);
  });

  it("nada novo no Omie: não publica", async () => {
    listChildrenByPath.mockResolvedValue([{ id: "i1", name: "Materiais OMIE - Tekla 2026-09-23 06h30.xlsx", file: {} }]);
    const r = await publicarMateriaisTekla({ agora: AGORA });
    expect(r).toMatchObject({ publicado: false, novos: 0 });
    expect(uploadFileToFolder).not.toHaveBeenCalled();
  });

  it("perfil novo no Omie: arquivo novo, comparado com a planilha MAIS RECENTE da pasta", async () => {
    listChildrenByPath.mockResolvedValue([
      { id: "velha", name: "Materiais OMIE - Tekla 2026-09-20 06h30.xlsx", file: {} },
      { id: "nova", name: "Materiais OMIE - Tekla 2026-09-23 06h30.xlsx", file: {} },
      { id: "outra", name: "Anotações do Tekla.xlsx", file: {} },
    ]);
    listarProdutosOmie.mockResolvedValue([...CATALOGO, prod("501000099", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 32,7KG/M")]);
    const r = await publicarMateriaisTekla({ agora: AGORA });
    expect(downloadFileById).toHaveBeenCalledWith("drive-servidor", "nova");
    expect(r).toMatchObject({ publicado: true, novos: 1, anterior: "Materiais OMIE - Tekla 2026-09-23 06h30.xlsx", codigosNovos: ["501000099"] });
    expect([...(await codigosDaPlanilha(publicada))]).toContain("501000099");
  });

  it("o botão manual publica mesmo sem novidade", async () => {
    listChildrenByPath.mockResolvedValue([{ id: "i1", name: "Materiais OMIE - Tekla 2026-09-23 06h30.xlsx", file: {} }]);
    expect(await publicarMateriaisTekla({ agora: AGORA, forcar: true })).toMatchObject({ publicado: true, novos: 0 });
  });

  it("Omie sem nenhum perfil nem parafuso: erro, e nada vai para a pasta", async () => {
    listarProdutosOmie.mockResolvedValue([]);
    listChildrenByPath.mockResolvedValue([]);
    await expect(publicarMateriaisTekla({ agora: AGORA })).rejects.toThrow(/nada foi publicado/);
    expect(uploadFileToFolder).not.toHaveBeenCalled();
  });

  const PASTA = [{ id: "i1", name: "Materiais OMIE - Tekla 2026-09-23 06h30.xlsx", file: {} }];
  const lerPublicada = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(publicada);
    return wb;
  };

  it("código inativado no Omie (a limpeza de um duplicado): arquivo novo SEM ele, e a aba Mudanças diz que saiu", async () => {
    listChildrenByPath.mockResolvedValue(PASTA);
    listarProdutosOmie.mockResolvedValue([{ ...CATALOGO[0], inativo: true }, CATALOGO[1]]);
    const r = await publicarMateriaisTekla({ agora: AGORA });
    expect(r).toMatchObject({ publicado: true, novos: 0, sairam: 1, alterados: 0, codigosQueSairam: ["501000007"] });
    expect([...(await codigosDaPlanilha(publicada))]).toEqual(["120000164"]);
    const mud = (await lerPublicada()).getWorksheet("Mudanças").getRow(2);
    expect([mud.getCell(1).value, mud.getCell(2).value, mud.getCell(3).value]).toEqual(["Saiu do cadastro", "Perfil", "501000007"]);
    expect(mud.getCell(5).value).toBe(CATALOGO[0].descricao);
  });

  it("descrição corrigida no Omie: arquivo novo, com a descrição de antes ao lado", async () => {
    listChildrenByPath.mockResolvedValue(PASTA);
    listarProdutosOmie.mockResolvedValue([{ ...CATALOGO[0], descricao: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3 KG/M" }, CATALOGO[1]]);
    const r = await publicarMateriaisTekla({ agora: AGORA });
    expect(r).toMatchObject({ publicado: true, novos: 0, sairam: 0, alterados: 1, codigosAlterados: ["501000007"] });
    const mud = (await lerPublicada()).getWorksheet("Mudanças").getRow(2);
    expect([mud.getCell(1).value, mud.getCell(4).value, mud.getCell(5).value])
      .toEqual(["Descrição alterada", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 31,3 KG/M", CATALOGO[0].descricao]);
  });

  describe("sumiço em massa é leitura ruim, não limpeza", () => {
    const GRANDE = Array.from({ length: 30 }, (_, i) => prod(`1200001${10 + i}`, `PARAFUSO SEXT. A325 - 1/2"X${10 + i}" - GF`, FX));
    beforeEach(async () => {
      listChildrenByPath.mockResolvedValue(PASTA);
      const { perfis, parafusos } = linhasDaPlanilha(GRANDE);
      downloadFileById.mockResolvedValue({ buffer: await gerarPlanilhaMateriaisTekla({ perfis, parafusos }) });
      listarProdutosOmie.mockResolvedValue(GRANDE.slice(0, 5)); // 25 de 30 somem de uma vez
    });

    it("não publica e lança — o monitor do cron avisa", async () => {
      await expect(publicarMateriaisTekla({ agora: AGORA })).rejects.toThrow(/25 de 30 .*sumiram/);
      expect(uploadFileToFolder).not.toHaveBeenCalled();
    });

    it("com 'forçar' (alguém conferiu o cadastro) publica", async () => {
      expect(await publicarMateriaisTekla({ agora: AGORA, forcar: true })).toMatchObject({ publicado: true, sairam: 25 });
    });
  });
});
