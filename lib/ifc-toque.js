// Um gesto com dois dedos nunca deve virar seleção quando o último dedo sai.
export function criarSeletorPorToque(tolerancia = 7) {
  const ativos = new Map();
  let navegou = false;
  return {
    down(e) {
      if (e.button != null && e.button !== 0) return;
      if (!ativos.size) navegou = false;
      ativos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ativos.size > 1) navegou = true;
    },
    move(e) {
      const inicio = ativos.get(e.pointerId);
      if (inicio && Math.hypot(e.clientX-inicio.x,e.clientY-inicio.y)>tolerancia) navegou=true;
    },
    up(e) {
      const inicio=ativos.get(e.pointerId);
      const seleciona=!!inicio && !navegou && ativos.size===1 && Math.hypot(e.clientX-inicio.x,e.clientY-inicio.y)<=tolerancia;
      ativos.delete(e.pointerId);
      return seleciona;
    },
    cancel(e) { navegou=true;ativos.delete(e.pointerId); },
  };
}
