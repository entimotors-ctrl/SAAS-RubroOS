/**
 * Proveedor de IA determinista, SOLO para pruebas automatizadas — nunca se
 * usa en producción (solo se activa con AI_FAKE_PROVIDER=1, ver
 * providers/index.js). Decide qué tool llamar mirando palabras clave del
 * último mensaje del usuario y los resultados de tools ya obtenidos en este
 * mismo turno, para poder probar encadenamientos reales (p. ej. buscar un
 * cliente y luego registrarle una venta) sin depender de red ni de una
 * cuenta de OpenAI real.
 */
class FakeAIProvider {
  async chat({ messages, tools }) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text = (lastUser?.content || '').toLowerCase();
    const toolMessages = messages.filter((m) => m.role === 'tool');
    const hasCalledTool = (name) => toolMessages.some((m) => m.name === name);
    const lastToolResult = (name) => {
      const m = [...toolMessages].reverse().find((tm) => tm.name === name);
      if (!m) return null;
      try {
        return JSON.parse(m.content);
      } catch {
        return null;
      }
    };
    const toolExists = (name) => tools.some((t) => t.name === name);
    const findTool = (suffix) => tools.find((t) => t.name.endsWith(suffix))?.name;

    // "consulta mi inventario" / "cuánto stock tengo"
    const inventarioTool = findTool('.consultarInventario');
    if (/inventario|stock/.test(text) && inventarioTool) {
      if (!hasCalledTool(inventarioTool)) return { type: 'tool_call', id: 'fake-inv', toolName: inventarioTool, args: {} };
      const r = lastToolResult(inventarioTool);
      return { type: 'message', content: r?.success ? `Tienes ${r.data?.length ?? 0} productos en inventario.` : `No pude consultar el inventario: ${r?.message}` };
    }

    // "registra una venta de 2 filtros para Juan Pérez" (taller) — encadena buscarCliente -> registrarVenta
    const registrarVentaTool = findTool('.registrarVenta');
    if (/venta.*filtro/.test(text) && registrarVentaTool) {
      const buscarClienteTool = findTool('.buscarCliente');
      if (buscarClienteTool && !hasCalledTool(buscarClienteTool)) {
        return { type: 'tool_call', id: 'fake-buscar', toolName: buscarClienteTool, args: { nombre: 'Juan' } };
      }
      const clienteResult = buscarClienteTool ? lastToolResult(buscarClienteTool) : null;
      const cliente = clienteResult?.data?.[0];
      if (!hasCalledTool(registrarVentaTool)) {
        return {
          type: 'tool_call',
          id: 'fake-venta',
          toolName: registrarVentaTool,
          args: { cliente_id: cliente?.id, items: [{ descripcion: 'Filtro de aceite', cantidad: 2, precio_unitario: 150 }] },
        };
      }
      const ventaResult = lastToolResult(registrarVentaTool);
      return { type: 'message', content: ventaResult?.success ? 'Listo, registré la venta.' : `No pude registrar la venta: ${ventaResult?.message}` };
    }

    // "busca al cliente Juan"
    const buscarClienteTool = findTool('.buscarCliente');
    if (/busca.*cliente|buscar.*juan/.test(text) && buscarClienteTool) {
      if (!hasCalledTool(buscarClienteTool)) return { type: 'tool_call', id: 'fake-buscar2', toolName: buscarClienteTool, args: { nombre: 'Juan' } };
      const r = lastToolResult(buscarClienteTool);
      const nombre = r?.data?.[0]?.nombre;
      return { type: 'message', content: nombre ? `Encontré a ${nombre}.` : 'No encontré ningún cliente con ese nombre.' };
    }

    // Fuerza una llamada a una tool inexistente (usado por la prueba de error "tool inválida")
    if (text.includes('llama a una tool que no existe')) {
      if (!hasCalledTool('inventada.noExiste')) return { type: 'tool_call', id: 'fake-invalid', toolName: 'inventada.noExiste', args: {} };
      const r = lastToolResult('inventada.noExiste');
      return { type: 'message', content: `No se pudo: ${r?.code || 'desconocido'}` };
    }

    // Fuerza argumentos inválidos a propósito (usado por la prueba de "argumentos inválidos")
    if (text.includes('cantidad invalida') && registrarVentaTool) {
      if (!hasCalledTool(registrarVentaTool)) {
        return {
          type: 'tool_call',
          id: 'fake-badargs',
          toolName: registrarVentaTool,
          args: { items: [{ descripcion: 'x', cantidad: -5, precio_unitario: 10 }] },
        };
      }
      const r = lastToolResult(registrarVentaTool);
      return { type: 'message', content: `No se pudo: ${r?.code || 'desconocido'}` };
    }

    // Intenta deliberadamente una tool de OTRO rubro / fuera de lo ofrecido —
    // simula un modelo que alucina o intenta saltarse la lista de tools
    // permitidas. La defensa real está en toolRegistry.authorize(), no aquí.
    if (text.includes('tool de otro rubro')) {
      const candidatos = ['carwash.crearTurno', 'taller.registrarVenta', 'barberia.crearCuenta', 'agro.crearPedido'];
      const ajena = candidatos.find((name) => !tools.some((t) => t.name === name)) || 'carwash.crearTurno';
      if (!hasCalledTool(ajena)) return { type: 'tool_call', id: 'fake-foreign', toolName: ajena, args: {} };
      const r = lastToolResult(ajena);
      return { type: 'message', content: `No se pudo: ${r?.code || 'desconocido'}` };
    }

    // Intenta deliberadamente una acción sensible fuera del permiso del rol
    // (destructive) — misma idea: la tool puede no venir en `tools` porque ya
    // se filtró por permiso, pero igual se intenta llamar por nombre.
    if (text.includes('cancela la membresia')) {
      if (!hasCalledTool('carwash.cancelarMembresia')) {
        return { type: 'tool_call', id: 'fake-cancel', toolName: 'carwash.cancelarMembresia', args: { membresiaId: 1 } };
      }
      const r = lastToolResult('carwash.cancelarMembresia');
      return { type: 'message', content: `No se pudo: ${r?.code || 'desconocido'}` };
    }

    return { type: 'message', content: 'Entendido.' };
  }
}

module.exports = { FakeAIProvider };
