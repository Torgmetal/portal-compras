// @vitest-environment jsdom
import React from "react";
import {it,expect,afterEach} from "vitest";
import {render,screen,fireEvent,cleanup,within} from "@testing-library/react";
import Editor from "@/app/qualidade/inspecoes/[id]/PecasInformadasEditor";
afterEach(cleanup);
it("busca e inclui peças, evita duplicação e permite desfazer retirada", () => {
  let valor;
  function Tela() {
    const [pecas,setPecas]=React.useState([{marca:'P1',quantidade:2}]);valor=pecas;
    return <Editor pecas={pecas} onChange={setPecas} quantidadesLista={{P1:2,P2:3,P3:4}} />;
  }
  render(<Tela />);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'P2'}});
  fireEvent.click(screen.getByRole('button',{name:'Adicionar P2 (3 unidades)'}));
  expect(valor).toEqual([{marca:'P1',quantidade:2},{marca:'P2',quantidade:3}]);
  expect(screen.queryByRole('button',{name:'Adicionar P2 (3 unidades)'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Remover peça 1'}));
  expect(valor).toEqual([{marca:'P2',quantidade:3}]);
  fireEvent.click(screen.getByRole('button',{name:'Desfazer'}));
  expect(valor).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Quantidade 1'),{target:{value:'1'}});
  expect(valor[0].quantidade).toBe('1');
});
it("bloqueia inclusão e retirada quando o relatório está travado", () => {
  const {container}=render(<Editor pecas={[{marca:'P1',quantidade:1}]} onChange={()=>{throw new Error('não deve alterar');}} disabled />);
  expect(container.querySelector('fieldset').disabled).toBe(true);
  expect(within(container).getByRole('button',{name:'Adicionar manualmente'}).disabled).toBe(true);
});
