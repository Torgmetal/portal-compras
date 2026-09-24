// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({getDocument:vi.fn(),destroy:vi.fn(),render:vi.fn()}));
vi.mock('unpdf/pdfjs',()=>({resolvePDFJS:async()=>({getDocument:mocks.getDocument})}));
import VisualizadorPitPdf from '@/components/comercial/VisualizadorPitPdf';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('renderiza o arquivo original, navega e destrói o documento ao fechar',async()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)})));
 const getPage=vi.fn(async()=>({getViewport:({scale})=>({width:800*scale,height:560*scale}),render:mocks.render}));
 mocks.render.mockReturnValue({promise:Promise.resolve(),cancel:vi.fn()});
 mocks.getDocument.mockReturnValue({promise:Promise.resolve({numPages:21,getPage}),destroy:mocks.destroy});
 const v=render(<VisualizadorPitPdf src="/original.pdf"/>);
 await screen.findByText('Página 1 de 21');
 await waitFor(()=>expect(mocks.render).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:'Próxima página'}));
 await waitFor(()=>expect(getPage).toHaveBeenCalledWith(2));
 expect(fetch).toHaveBeenCalledWith('/original.pdf',expect.objectContaining({signal:expect.any(AbortSignal)}));
 v.unmount();expect(mocks.destroy).toHaveBeenCalled();
});
it('permite tentar novamente quando o arquivo falha',async()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));
 render(<VisualizadorPitPdf src="/falha.pdf"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
});
