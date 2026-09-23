import { describe, it, expect } from "vitest";
import { simular, ipiDaTipi, ambitoDe, daEscolhaDoCfop, NAO_DETERMINADOS } from "@/lib/fiscal/simulador";
import { AMBITO, CFOPS, OPERACOES, paresDeCfop } from "@/lib/fiscal/cfop";

// ─── O SIMULADOR ─────────────────────────────────────────────────────────────
//
// ⚠⚠ É A METADE PREVENTIVA DA AUDITORIA, e é o ponto do módulo inteiro. Matheus (22/09/2026), sobre
// a NF-e 973: *"o operador não sabia que o NCM precisava destacar IPI, por isso estamos criando
// essa tela, para ajudar ele"*. O teste-chave aqui é justamente esse: a simulação da operação que
// gerou a 973 tem de ACENDER O ALERTA que ninguém acendeu na hora.

const linha = (valor, tipo = "PERCENTUAL") => ({ aliquotaTipo: tipo, aliquotaValor: valor });
const tipi = (geral, excecoes = []) => ({ geral, excecoes });

describe("ambitoDe — o âmbito cai das UFs, não é escolhido", () => {
  it.each([["SP", "SP", AMBITO.INTERNA], ["SP", "RS", AMBITO.INTERESTADUAL], ["sp", "rs", AMBITO.INTERESTADUAL]])(
    "%s → %s é %s", (a, b, esp) => expect(ambitoDe(a, b)).toBe(esp));

  // ⚠ Deixar o usuário escolher o âmbito é deixar ele errar o 5.xxx/6.xxx.
  it.each([["SP", ""], ["", "RS"], [null, null]])("sem as duas UFs não há âmbito", (a, b) => {
    expect(ambitoDe(a, b)).toBeNull();
  });
});

describe("ipiDaTipi — o CST é consequência da tabela, não escolha", () => {
  it("alíquota positiva sugere CST 50 (tributada)", () => {
    expect(ipiDaTipi(linha(3.25))).toMatchObject({ determinado: true, cstSugerido: "50", rotulo: "3,25%" });
  });

  // ⚠⚠ ZERO É TRIBUTAÇÃO, e o CST 51 diz isso. Tratá-lo como 53 seria afirmar que o produto está
  // fora do campo de incidência — outra coisa, com outra prova.
  it("alíquota zero sugere CST 51, não 53", () => {
    const r = ipiDaTipi(linha(0));
    expect(r.cstSugerido).toBe("51");
    expect(r.nota).toMatch(/tributação, não ausência/i);
  });

  it("NT sugere CST 53", () => {
    expect(ipiDaTipi(linha(null, "NT"))).toMatchObject({ cstSugerido: "53", rotulo: "NT — não tributado" });
  });

  it("sem linha na TIPI, não determina", () => {
    expect(ipiDaTipi(null).determinado).toBe(false);
  });
});

describe("simular — o alerta que a NF-e 973 não teve", () => {
  const entrada973 = {
    ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS",
    valor: 2542, cstPretendido: "53",
  };

  // ⚠⚠ O TESTE QUE JUSTIFICA A TELA. Mesma regra do motor de auditoria, aplicada ANTES de emitir.
  it("CST 53 pretendido num NCM tributado acende alerta ALTO", () => {
    const r = simular(entrada973, tipi(linha(3.25)));
    const a = r.alertas.find((x) => x.nivel === "alto");
    expect(a.texto).toMatch(/CST 53 .*Saída não tributada/);
    expect(a.texto).toMatch(/TIPI tributa o 84379000 a 3,25%/);
    expect(a.texto).toMatch(/exige fundamento legal/);
  });

  it("sem CST pretendido, o simulador sugere o da tabela e não alarma", () => {
    const r = simular({ ...entrada973, cstPretendido: null }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => x.nivel === "alto")).toEqual([]);
    expect(r.ipi).toMatchObject({ cstSugerido: "50", cstRotulo: "Saída tributada" });
  });

  it("CST coerente com a tabela não alarma", () => {
    const r = simular({ ...entrada973, cstPretendido: "50" }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => x.nivel === "alto")).toEqual([]);
  });

  it("a estimativa é sobre o valor digitado", () => {
    const r = simular(entrada973, tipi(linha(3.25)));
    expect(r.ipi.estimativa).toEqual({ base: 2542, aliquota: 3.25, valor: 82.62 });
  });

  // ⚠ Ex TIPI presente derruba a certeza — a alíquota geral deixa de decidir sozinha.
  it("NCM com Ex TIPI vira ressalva", () => {
    const r = simular(entrada973, tipi(linha(3.25), [linha(0)]));
    expect(r.alertas.some((a) => /Ex TIPI/.test(a.texto))).toBe(true);
  });
});

describe("simular — o que ele se RECUSA a calcular", () => {
  // ⚠⚠ O ICMS CONTINUA CALADO, e não é teimosia: ele depende da UF de destino, de benefício
  // estadual, de redução de base e de o destinatário ser contribuinte — não de um regime que
  // alguém possa declarar numa linha. O briefing proíbe *"aplicar automaticamente 12% de ICMS a
  // toda venda interestadual"*, e um número plausível ali é pior que um campo vazio.
  it("o IBS/CBS sai como não determinado, COM motivo", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    expect(r.naoDeterminados.map((x) => x.tributo)).toEqual(["IBS/CBS"]);
    for (const nd of r.naoDeterminados) expect(nd.motivo.length).toBeGreaterThan(40);
  });

  it("nenhum tributo além do IPI vem com número", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    const texto = JSON.stringify(r.naoDeterminados);
    expect(texto).not.toMatch(/"valor"|"aliquota"/);
  });

  // ⚠⚠ cEnq NÃO É SUGERIDO. O briefing proíbe atribuir 999 automaticamente, e sugerir um código
  // aqui seria o portal inventando fundamento legal.
  it("o enquadramento legal nunca é preenchido sozinho", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.ipi.cEnq).toBeNull();
    expect(r.ipi.cEnqNota).toMatch(/não é sugerido automaticamente/i);
  });

  it("NCM fora da TIPI não é simulado — manda rever a classificação", () => {
    const r = simular({ ncm: "99999999", cfop: "6101", ufOrigem: "SP", ufDestino: "RS" }, undefined);
    expect(r.ipi.determinado).toBe(false);
    expect(r.ipi.motivo).toMatch(/classificação precisa ser revista/i);
  });
});

describe("simular — as perguntas que faltam", () => {
  it("sem UF e sem operação, o simulador pergunta em vez de chutar", () => {
    const r = simular({ ncm: "84379000" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /UF de origem/.test(p))).toBe(true);
    expect(r.perguntas.some((p) => /Escolha o CFOP/.test(p))).toBe(true);
  });

  // ⚠ Cada CFOP candidato traz o que ainda precisa ser respondido — é isso que impede o simulador
  // de virar um carimbo.
  it("a industrialização pergunta de quem são os insumos e por onde transitaram", () => {
    const r = simular({ ncm: "84379000", cfop: "5901", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /insumos/i.test(p))).toBe(true);
    expect(r.alertas.some((a) => /TRÂNSITO dos insumos/i.test(a.texto))).toBe(true);
  });

  it("o CFOP escolhido traz a descrição e os exemplos reais em que aparece", () => {
    const r = simular({ ncm: "84379000", cfop: "6118", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido).toMatchObject({ codigoFormatado: "6.118", ambito: "INTERESTADUAL" });
    expect(r.cfop.operacoes.map((o) => o.id)).toContain("venda-a-ordem");
    expect(r.cfop.ressalva).toMatch(/pendente de conferência/i);
  });

  // ⚠⚠ A VERIFICAÇÃO QUE SÓ EXISTE PORQUE O USUÁRIO ESCOLHE O CÓDIGO. 5.xxx é interna e 6.xxx é
  // interestadual — o primeiro dígito não é decoração. Escolher 5.101 numa venda para o RS é erro
  // que a SEFAZ rejeita, e é o tipo de coisa que o operador não sabe de cabeça.
  it("CFOP interno com destino fora do estado acende alerta ALTO", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    const a = r.alertas.find((x) => x.nivel === "alto");
    expect(a.texto).toMatch(/5\.101 é de operação INTERNA/);
    expect(a.texto).toMatch(/O código equivalente é o 6\.101/);
  });

  it("CFOP coerente com as UFs não alarma", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => /operação INTERNA|INTERESTADUAL/.test(x.texto))).toEqual([]);
  });

  // ⚠⚠ LISTA QUE PERGUNTA O QUE JÁ FOI RESPONDIDO ENSINA A IGNORAR A LISTA, e aí a pergunta que
  // importa some junto. Os `exige` de cada CFOP são estáticos — pedem "UF de destino" mesmo com o
  // campo preenchido. Apareceu na primeira validação da tela.
  it("não repete a pergunta que a entrada já responde", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", destinatarioContribuinte: true }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /UF de destino/i.test(p))).toBe(false);
    expect(r.perguntas.some((p) => /contribuinte/i.test(p))).toBe(false);
  });

  // ⚠ Conservador de propósito: sem a resposta, a pergunta FICA. Perguntar de novo é ruído;
  // deixar de perguntar é o defeito que o módulo existe para evitar.
  it("sem a resposta, a pergunta continua na lista", () => {
    const r = simular({ ncm: "84379000", cfop: "6101" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /contribuinte/i.test(p))).toBe(true);
  });

  it("destinatário não contribuinte vira aviso sobre o ICMS", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", destinatarioContribuinte: false }, tipi(linha(3.25)));
    expect(r.alertas.some((a) => /não contribuinte/i.test(a.texto))).toBe(true);
  });
});

describe("NAO_DETERMINADOS — o motivo é parte do contrato", () => {
  it("cada tributo diz por que não foi determinado", () => {
    expect(NAO_DETERMINADOS).toHaveLength(1);
    for (const x of NAO_DETERMINADOS) {
      expect(x.tributo).toBeTruthy();
      expect(x.motivo).toBeTruthy();
    }
  });
});

describe("paresDeCfop — dentro e fora do estado são a MESMA operação", () => {
  const pares = paresDeCfop();

  // ⚠⚠ O PEDIDO, LITERAL. Matheus (22/09/2026): *"agrupe dentro e fora do estado, deixe dessa forma:
  // 5101/6101 — Venda…"*. A venda para Campinas e a venda para Caxias são o mesmo negócio.
  it("5.101 e 6.101 viram uma linha só", () => {
    const venda = pares.find((p) => p.chave === "5101/6101");
    expect(venda.rotulo).toBe("5.101 / 6.101");
    // ⚠ O resumo do par é o do 5.xxx: o do 6.xxx só acrescenta "interestadual", redundante no par.
    expect(venda.resumo).toBe("Venda de produção do estabelecimento");
  });

  // ⚠⚠ OITO CÓDIGOS ESTAVAM SEM O PAR, E ERA FALHA DA LISTA, NÃO DA TABELA. Matheus (22/09/2026),
  // olhando o seletor: *"alguns CFOP ficaram sem a opção fora do estado"*. A ausência do 6.125
  // fazia parecer que uma industrialização para cliente de fora do estado não tinha código.
  it("todo código tem o seu par dentro/fora do estado", () => {
    expect(pares.filter((p) => p.codigos.length !== 2)).toEqual([]);
    expect(pares).toHaveLength(13);
    expect(CFOPS).toHaveLength(26);
  });

  it.each(["6116", "6124", "6125", "6902", "6903", "6922", "6924", "6925"])("o %s entrou na lista", (c) => {
    expect(CFOPS.find((x) => x.codigo === c)).toBeTruthy();
  });

  // ⚠ O 6.xxx herda a família do irmão — senão ele cairia noutro grupo do seletor.
  it("o par vive na mesma família", () => {
    for (const par of pares) {
      const fams = new Set(par.codigos.map((c) => CFOPS.find((x) => x.codigo === c).familia));
      expect(fams.size, par.chave).toBe(1);
    }
  });

  it("nenhum código se perde nem se repete no agrupamento", () => {
    const todos = pares.flatMap((p) => p.codigos);
    expect(todos.sort()).toEqual(CFOPS.map((c) => c.codigo).sort());
  });

  // ⚠⚠ O EXEMPLO DIDÁTICO É O PEDIDO DA MESMA MENSAGEM: *"em cada CFOP dê um exemplo de quando deve
  // ser usado"*. Os três casos são os que o Matheus escreveu.
  it.each([
    ["5101", /compra o aço.*fabrica.*vende/i],
    ["5125", /fornecedor entrega direto na TORG/i],
    ["5124", /materiais principais DELE/],
  ])("o %s traz o exemplo da operação real", (codigo, esperado) => {
    expect(CFOPS.find((c) => c.codigo === codigo).quando).toMatch(esperado);
  });

  it("todo CFOP tem o seu exemplo", () => {
    expect(CFOPS.filter((c) => !c.quando)).toEqual([]);
  });
});

describe("daEscolhaDoCfop — o par resolve pelo destino, não pelo operador", () => {
  it.each([[AMBITO.INTERNA, "5101"], [AMBITO.INTERESTADUAL, "6101"]])("%s escolhe o %s", (ambito, esperado) => {
    const r = daEscolhaDoCfop("5101/6101", ambito);
    expect(r.cfop.codigo).toBe(esperado);
    expect(r.doPar).toBe("5.101 / 6.101");
  });

  // ⚠⚠ SEM AS UFs NÃO HÁ O QUE RESOLVER, e a pergunta que falta é a das UFs — não "qual dos dois
  // códigos você quis dizer". Transformar isso em erro mandaria o operador escolher justamente o
  // dígito que o agrupamento existe para tirar das mãos dele.
  it("sem âmbito, fica pendente em vez de erro", () => {
    expect(daEscolhaDoCfop("5101/6101", null)).toMatchObject({ pendente: "ambito" });
  });

  it("código único continua valendo (API, auditoria, quem digita direto)", () => {
    expect(daEscolhaDoCfop("6101").cfop.codigo).toBe("6101");
  });

  it.each(["9999", "5101/9999", ""])("código inexistente é recusado", (c) => {
    expect(daEscolhaDoCfop(c, AMBITO.INTERNA).erro).toBeTruthy();
  });
});

describe("simular com o par — impedir o erro em vez de detectá-lo", () => {
  // ⚠⚠ ESTE É O GANHO DO AGRUPAMENTO. Mandando o par, o alerta de 5.xxx-com-destino-fora-do-estado
  // não precisa existir: o portal já escolheu o 6.101. A verificação continua na casa dela, para
  // quem manda um código único.
  it("o par com destino no RS resolve para o 6.101 e não alarma", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido.codigoFormatado).toBe("6.101");
    expect(r.cfop.resolvidoDoPar).toBe("5.101 / 6.101");
    expect(r.alertas.filter((a) => /operação INTERNA/.test(a.texto))).toEqual([]);
  });

  it("o mesmo par dentro de SP resolve para o 5.101", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido.codigoFormatado).toBe("5.101");
  });

  // ⚠ Sem UF, a tela mostra o par e a pergunta que falta — uma pergunta só, não duas.
  it("sem UF de destino, o par fica pendente e a pergunta é a das UFs", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido).toBeNull();
    expect(r.cfop.parPendente).toBe("5.101 / 6.101");
    expect(r.perguntas.some((p) => /UF de origem e a de destino/.test(p))).toBe(true);
    expect(r.perguntas.some((p) => /Escolha o CFOP/.test(p))).toBe(false);
  });

  it("o exemplo didático acompanha o CFOP resolvido", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido.quando).toMatch(/compra o aço/i);
  });
});

describe("as notas que a operação exige — a pergunta que vem antes do CST", () => {
  // ⚠⚠ O PEDIDO. Matheus (22/09/2026): *"a simulação deve informar previamente quais notas devem
  // ser emitidas geralmente nesse tipo de operação do cliente"*.
  it("a venda à ordem avisa que são DUAS notas da TORG, e que uma não cobra", () => {
    const r = simular({ ncm: "84379000", cfop: "5118/6118", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    const seq = r.cfop.sequencias.find((s) => s.operacaoId === "venda-a-ordem");
    expect(seq.notas.map((n) => n.cfop)).toEqual(["5118/6118", "5923/6923", null]);
    expect(seq.notas[1].obs).toMatch(/NÃO cobra de novo/);
  });

  // ⚠⚠ NEM TODA NOTA DO FLUXO É DA TORG. Listar a remessa de entrada sem dizer quem emite faria o
  // operador procurar no Omie uma nota que não é dele para emitir.
  it("a nota que o cliente emite vem marcada como dele", () => {
    const r = simular({ ncm: "84379000", cfop: "5124", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    const seq = r.cfop.sequencias.find((s) => s.operacaoId === "indust-insumo-direto");
    expect(seq.notas[0]).toMatchObject({ quem: "Cliente", cfop: null });
    expect(seq.notas.filter((n) => n.quem === "TORG").map((n) => n.cfop)).toEqual(["5902/6902", "5124/6124"]);
  });

  it("a venda normal é uma nota só", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.cfop.sequencias.find((s) => s.operacaoId === "venda-normal").notas).toHaveLength(1);
  });

  // ⚠⚠ UM CFOP EM DUAS OPERAÇÕES TRAZ AS DUAS SEQUÊNCIAS, e a tela diz que são alternativas. O
  // 5.101 é tanto a venda simples quanto uma das saídas do "uma venda e dois caminhões" — escolher
  // entre elas é decisão de quem conhece o negócio, não do portal.
  it("CFOP que serve a duas operações mostra as duas, sem escolher", () => {
    const r = simular({ ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.cfop.sequencias.map((s) => s.operacaoId)).toEqual(["venda-normal", "dois-caminhoes"]);
  });

  it("toda nota diz quem emite e qual é o papel dela", () => {
    for (const o of OPERACOES) {
      for (const n of o.notas ?? []) {
        expect(n.quem, o.id).toBeTruthy();
        expect(n.papel, o.id).toBeTruthy();
        expect(n.de && n.para, o.id).toBeTruthy();
      }
    }
  });

  it("toda operação real declara a sua sequência de notas", () => {
    expect(OPERACOES.filter((o) => !o.notas?.length)).toEqual([]);
  });
});

describe("a matéria-prima que o Comercial já respondeu", () => {
  const comMp = (de, extra = {}) => simular(
    { ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "SP", materiaPrima: { de, itens: 10, fd: de === "CLIENTE" ? 10 : de === "MISTO" ? 4 : 0 }, ...extra },
    tipi(linha(3.25)));

  // ⚠⚠ A PERGUNTA JÁ TINHA RESPOSTA. Matheus (22/09/2026): *"no Comercial eles já definem se a
  // matéria-prima vai ser a TORG quem compra ou Faturamento Direto quando o cliente vai comprar"*.
  it("com o FD respondido, o simulador para de perguntar de quem são os insumos", () => {
    expect(comMp("TORG").perguntas.some((p) => /insumos são da TORG/i.test(p))).toBe(false);
  });

  // ⚠⚠ O FD RESPONDE DE QUEM SÃO, NUNCA POR ONDE TRANSITARAM — e é o trânsito que separa o 5.124 do
  // 5.125. Quem paga não define o CFOP da industrialização.
  it("a pergunta do TRÂNSITO continua de pé", () => {
    const r = simular({ ncm: "84379000", cfop: "5124", ufOrigem: "SP", ufDestino: "SP", materiaPrima: { de: "CLIENTE", itens: 10, fd: 10 } }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /TRANSITARAM/i.test(p))).toBe(true);
  });

  it("obra toda em FD com CFOP de venda própria acende alerta ALTO", () => {
    const a = comMp("CLIENTE").alertas.find((x) => x.nivel === "alto");
    expect(a.texto).toMatch(/Faturamento Direto/);
    expect(a.texto).toMatch(/5\.124 \/ 5\.125/);
    // ⚠ Aponta, não condena — o portal não sabe o que foi combinado no contrato.
    expect(a.texto).toMatch(/Confirme antes de emitir/);
  });

  it("obra sem FD e CFOP de venda própria não alarma", () => {
    expect(comMp("TORG").alertas.filter((a) => /Faturamento Direto/.test(a.texto))).toEqual([]);
  });

  // ⚠ MISTO é resposta, não ruído: a obra tem as duas naturezas, e elas não saem no mesmo CFOP.
  it("obra mista avisa e NÃO dispensa a pergunta", () => {
    const r = comMp("MISTO");
    expect(r.alertas.some((a) => /4 de 10 itens/.test(a.texto))).toBe(true);
    expect(r.perguntas.some((p) => /insumos são da TORG/i.test(p))).toBe(true);
  });
});

describe("PIS/COFINS — regime DECLARADO, não deduzido do histórico", () => {
  const r = () => simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 222769.58 }, tipi(linha(3.25)));

  // ⚠⚠ A PROIBIÇÃO DO BRIEFING É CONTRA A SUPOSIÇÃO, NÃO CONTRA O REGIME. Matheus (22/09/2026):
  // *"base PIS/COFINS da TORG é LUCRO REAL, então é 1,65 e 7,6"*. Com o regime declarado por quem
  // responde por ele, a alíquota básica deixa de ser chute e vira a regra geral.
  it("aplica 1,65% e 7,60% com o CST 01", () => {
    expect(r().pisCofins.linhas).toEqual([
      { tributo: "PIS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 1.65, valor: 3675.70 },
      { tributo: "COFINS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 7.60, valor: 16930.49 },
    ]);
  });

  // ⚠ O CENTAVO DE DIFERENÇA É REAL E ESPERADO: a nota calcula item a item e soma (16.930,50 nos
  // 24 itens da 973), e o simulador aplica a alíquota sobre um valor só (16.930,49). Mesma lição
  // da auditoria — arredondamento por item ≠ arredondamento do total. O simulador estima uma
  // operação, não confere uma nota.

  // ⚠⚠ O NÚMERO BATE COM A NF-e 973 REAL — é o que separa "declarado e conferido" de
  // "plausível". Medido em 22/09/2026 no XML: vPIS 3.675,70 e vCOFINS 16.930,50 sobre vProd
  // 222.769,58, com CRT 3 e CST 01 nos 24 itens.
  it("o número confere com a nota real de onde o regime foi verificado", () => {
    expect(r().regime).toMatchObject({ nome: "Lucro Real", crt: "3" });
    expect(r().regime.conferidoEm).toContain("973");
  });

  // ⚠⚠ UM NÚMERO SEM AS EXCEÇÕES VIRA CARIMBO. Exportação, suspensão, alíquota zero e monofásico
  // têm CST próprio, e o portal NÃO os detecta — dizer isso é o que mantém o número utilizável.
  it("vem com as exceções que o portal não detecta, por nome", () => {
    const rs = r().pisCofins.ressalvas.join(" ");
    expect(rs).toMatch(/Exportação/);
    expect(rs).toMatch(/monofásico|alíquota zero|suspensão/);
  });

  it("a base é declarada, não suposta", () => {
    expect(r().pisCofins.baseNota).toMatch(/valor dos produtos/i);
  });

  // ⚠ Sem valor não há estimativa — e nada de zero disfarçado de resultado.
  it("sem valor digitado, não há estimativa", () => {
    expect(simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25))).pisCofins).toBeNull();
  });
});

// ─── OS ACHADOS DO PARECER DE ARQUITETURA (Codex, 22/09/2026) ────────────────

describe("PIS/COFINS incide sobre RECEITA — remessa não é receita", () => {
  // ⚠⚠ O DEFEITO: bastava um valor positivo para sair 1,65% e 7,6%, inclusive numa remessa para
  // industrialização e até sem CFOP. As ressalvas diziam o certo e o número dizia o contrário —
  // e para um operador que não é contador, o número ganha.
  it.each([["5901", "remessa"], ["5902", "retorno"], ["5922", "entrega futura"], ["5949", "outras saídas"]])(
    "o CFOP %s (%s) não recebe a alíquota básica", (cfop) => {
      const r = simular({ ncm: "84379000", cfop, ufOrigem: "SP", ufDestino: "SP", valor: 1000 }, tipi(linha(3.25)));
      expect(r.pisCofins.indisponivel).toBe(true);
      expect(r.pisCofins.linhas).toBeUndefined();
      expect(r.pisCofins.motivo).toMatch(/receita/i);
    });

  it.each(["5101", "5124", "5125"])("venda e industrialização cobrada são receita (%s)", (cfop) => {
    const r = simular({ ncm: "84379000", cfop, ufOrigem: "SP", ufDestino: "SP", valor: 1000 }, tipi(linha(3.25)));
    expect(r.pisCofins.linhas.map((x) => x.aliquota)).toEqual([1.65, 7.6]);
  });

  it("sem CFOP escolhido, não há número", () => {
    const r = simular({ ncm: "84379000", ufOrigem: "SP", ufDestino: "SP", valor: 1000 }, tipi(linha(3.25)));
    expect(r.pisCofins.indisponivel).toBe(true);
  });

  // ⚠⚠ É O QUE A NOTA DECLARA, NÃO A BASE DE APURAÇÃO — a apuração é mensal, com exclusões (entre
  // elas o ICMS destacado, desde o RE 574.706). Confundir as duas faria o número virar previsão de
  // recolhimento, que ele não é.
  it("a base diz que é o declarado na nota, não a apuração do mês", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP", valor: 1000 }, tipi(linha(3.25)));
    expect(r.pisCofins.baseNota).toMatch(/não é a base de apuração/i);
    expect(r.pisCofins.baseNota).toMatch(/ICMS destacado/i);
  });
});

describe("Ex TIPI: o simulador para de sugerir CST, como a auditoria já fazia", () => {
  // ⚠⚠ A INCOERÊNCIA QUE O MÓDULO PROMETIA NÃO TER. A auditoria marcava o cenário com Ex como
  // INCONCLUSIVO; o simulador seguia entregando CST e estimativa pela alíquota geral. Compartilhar
  // o `CST_IPI` não é compartilhar a DECISÃO.
  it("com Ex, não há CST sugerido e o resultado é inconclusivo", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25), [linha(0)]));
    expect(r.ipi.cstSugerido).toBeNull();
    expect(r.ipi.inconclusivo).toBe(true);
    expect(r.ipi.nota).toMatch(/só quem conhece o produto/i);
  });

  it("sem Ex, o CST continua sendo sugerido", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.ipi.cstSugerido).toBe("50");
    expect(r.ipi.inconclusivo).toBeUndefined();
  });

  // ⚠ O alerta do CST pretendido CONTINUA: é o achado da 973, e ele não depende do CST sugerido.
  it("o alerta do CST 53 pretendido não se perde com o Ex", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", cstPretendido: "53" }, tipi(linha(3.25), [linha(0)]));
    expect(r.alertas.some((a) => a.nivel === "alto")).toBe(true);
  });

  it("NT com Ex também não sugere CST", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(null, "NT"), [linha(0)]));
    expect(r.ipi.cstSugerido).toBeNull();
  });
});

describe("a sequência de notas não pode perder documento entre cenários", () => {
  // ⚠⚠ O DEFEITO ERA SILENCIOSO: a deduplicação global apagava o retorno 5.902 emitido pelo
  // TERCEIRO na terceirização, porque a industrialização com insumo do cliente já tinha um 5.902
  // emitido pela TORG — mesmo CFOP, mesmo papel, EMITENTE DIFERENTE.
  it("o 5.902 aparece nos DOIS cenários, com emitentes diferentes", () => {
    const r = simular({ ncm: "84379000", cfop: "5902", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    const por = Object.fromEntries(r.cfop.sequencias.map((s) => [s.operacaoId, s.notas]));
    expect(por["indust-insumo-direto"].find((n) => n.cfop === "5902/6902").quem).toBe("TORG");
    expect(por["terceirizacao"].find((n) => n.cfop === "5902/6902").quem).toBe("Terceiro");
  });

  it("todo cenário volta com a sua sequência COMPLETA", () => {
    const r = simular({ ncm: "84379000", cfop: "5124", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    for (const seq of r.cfop.sequencias) {
      const orig = OPERACOES.find((o) => o.id === seq.operacaoId);
      expect(seq.notas, seq.operacaoId).toHaveLength(orig.notas.length);
    }
  });
});

describe("ICMS entra como referência, não como imposto", () => {
  it("a venda interestadual traz a alíquota do art. 52 e as condições", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    expect(r.icms).toMatchObject({ estado: "REFERENCIA", aliquota: 12, valor: 120 });
    expect(r.icms.condicoes.join(" ")).toMatch(/DIFAL/);
  });

  // ⚠ O ICMS saiu de `naoDeterminados` porque agora tem referência — mas o IBS/CBS fica.
  it("o IBS/CBS continua sem número algum", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    expect(r.naoDeterminados.map((x) => x.tributo)).toContain("IBS/CBS");
  });
});

describe("os pares que faltavam funcionam de ponta a ponta", () => {
  // ⚠⚠ SEM O 6.125, UMA INDUSTRIALIZAÇÃO PARA CLIENTE DE FORA DO ESTADO NÃO TINHA CÓDIGO NO
  // SELETOR — e o operador ou escolhia o 5.125 (interno, que a SEFAZ rejeita) ou caía no 5.949.
  it("o par 5.125/6.125 resolve para o 6.125 num destino de fora", () => {
    const r = simular({ ncm: "84379000", cfop: "5125/6125", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    expect(r.cfop.escolhido.codigoFormatado).toBe("6.125");
    expect(r.alertas.filter((a) => /operação INTERNA/.test(a.texto))).toEqual([]);
  });

  // ⚠ E os 6.xxx novos trazem as operações reais junto — senão o código entraria mudo, sem
  // pergunta e sem sequência de notas.
  it.each(["6124", "6125", "6902", "6922", "6116", "6924", "6925"])("o %s traz as operações reais", (c) => {
    const r = simular({ ncm: "84379000", cfop: c, ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.cfop.operacoes.length, c).toBeGreaterThan(0);
    expect(r.cfop.sequencias.length, c).toBeGreaterThan(0);
  });

  // ⚠⚠ O 5.125 escolhido para fora do estado continua acendendo o alerta, agora COM o equivalente
  // — antes não havia 6.125 na lista e a sugestão saía vazia.
  it("escolhendo o 5.125 para o RS, o equivalente sugerido é o 6.125", () => {
    const r = simular({ ncm: "84379000", cfop: "5125", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.alertas.find((a) => a.nivel === "alto").texto).toMatch(/O código equivalente é o 6\.125/);
  });
});
