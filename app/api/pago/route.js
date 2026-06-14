import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];

// Registrar uno o varios pagos de una misma cuenta.
//
// Soporta "pagos ampliados": un jugador puede pagar su parte y, en la misma
// operación, cubrir la de otros. El cliente manda un arreglo `pagos`; cada
// pago que cubre a otro jugador lleva `pagado_por` con el nombre de quien
// puso el dinero. Cada pago "fiado" genera su entrada en cuentas_por_cobrar.
export async function POST(request) {
  try {
    const body = await request.json();
    const { cuenta_id } = body;

    if (!cuenta_id) {
      return NextResponse.json({ error: 'Falta la cuenta del pago' }, { status: 400, ...noStore });
    }

    // Aceptamos el formato nuevo (arreglo `pagos`) o el antiguo (un solo pago
    // en campos sueltos), por si quedara un cliente viejo en vuelo al desplegar.
    const entradas = Array.isArray(body.pagos) && body.pagos.length
      ? body.pagos
      : [{
          jugador_id: body.jugador_id,
          jugador_nombre: body.jugador_nombre,
          monto: body.monto,
          metodo: body.metodo,
          pagado_por: body.pagado_por,
        }];

    // Validación: evita 500 por violar restricciones de la BD y datos basura.
    const filas = [];
    for (const e of entradas) {
      const montoNum = Number(e.monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0) {
        return NextResponse.json({ error: 'El monto del pago debe ser un número mayor que cero' }, { status: 400, ...noStore });
      }
      if (!METODOS_PAGO.includes(e.metodo)) {
        return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400, ...noStore });
      }
      filas.push({
        cuenta_id,
        jugador_id: e.jugador_id || null,
        monto: montoNum,
        metodo: e.metodo,
        // pagado_por: nombre de quien puso el dinero cuando cubre a otro
        // jugador. Vacío cuando cada quien paga lo suyo.
        pagado_por: e.pagado_por ? String(e.pagado_por).trim() : null,
        // Guardamos el nombre para poder crear la deuda de cartera si es fiado.
        _jugador_nombre: e.jugador_nombre || 'Sin nombre',
      });
    }

    // Insertamos todos los pagos de una vez (sin el campo auxiliar _jugador_nombre).
    const aInsertar = filas.map(({ _jugador_nombre, ...f }) => f);
    const { data: pagos, error } = await supabase.from('pagos').insert(aInsertar).select();
    if (error) throw error;

    // Cada pago "fiado" genera una cuenta por cobrar a nombre del jugador.
    const fiados = filas.filter((f) => f.metodo === 'fiado');
    if (fiados.length) {
      const cxc = fiados.map((f) => ({
        cuenta_id,
        jugador_id: f.jugador_id,
        jugador_nombre: f._jugador_nombre,
        monto: f.monto,
        saldo_pendiente: f.monto,
      }));
      const { error: e2 } = await supabase.from('cuentas_por_cobrar').insert(cxc);
      if (e2) throw e2;
    }

    return NextResponse.json({ pagos }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
