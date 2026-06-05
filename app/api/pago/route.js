import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];

// Registrar un pago. Si es "fiado", crea entrada en cuentas_por_cobrar.
export async function POST(request) {
  try {
    const { cuenta_id, jugador_id, jugador_nombre, monto, metodo } = await request.json();

    // Validación: evita 500 por violar restricciones de la BD y datos basura.
    if (!cuenta_id) {
      return NextResponse.json({ error: 'Falta la cuenta del pago' }, { status: 400, ...noStore });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json({ error: 'El monto del pago debe ser un número mayor que cero' }, { status: 400, ...noStore });
    }
    if (!METODOS_PAGO.includes(metodo)) {
      return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400, ...noStore });
    }

    // --- Bloqueo de SOBREPAGO ---
    // No existe "abono" parcial a una deuda: cobrar de más solo descuadra la
    // caja. Calculamos el saldo que admite este pago y lo rechazamos si lo
    // excede. Tolerancia de <1 peso por los residuos de las divisiones (split),
    // coherente con la regla "saldado" del frontend.
    // Nota: usamos .select('*') a propósito (las proyecciones multi-columna en
    // este postgrest devuelven [] en silencio).
    const [consumosRes, pagosRes] = await Promise.all([
      supabase.from('consumos').select('*').eq('cuenta_id', cuenta_id),
      supabase.from('pagos').select('*').eq('cuenta_id', cuenta_id),
    ]);
    if (consumosRes.error) throw consumosRes.error;
    if (pagosRes.error) throw pagosRes.error;
    const consumos = consumosRes.data || [];
    const pagos = pagosRes.data || [];

    let saldoMax; // cuánto falta por pagar (tope para este pago)
    if (jugador_id) {
      // Cuota del jugador = sus consumos individuales + su parte de los splits
      // (mismo cálculo que desglosePorJugador en el frontend).
      let cuota = 0;
      for (const c of consumos) {
        const ids = Array.isArray(c.asignacion_jugadores) ? c.asignacion_jugadores : [];
        const total = Number(c.total) || 0;
        if (c.tipo_asignacion === 'individual') {
          if (ids[0] === jugador_id) cuota += total;
        } else if (ids.length > 0 && ids.includes(jugador_id)) {
          cuota += total / ids.length;
        }
      }
      const yaPagado = pagos
        .filter((p) => p.jugador_id === jugador_id)
        .reduce((s, p) => s + (Number(p.monto) || 0), 0);
      saldoMax = cuota - yaPagado;
    } else {
      // Sin jugador asociado: tope = total de la cuenta menos lo ya pagado.
      const totalCuenta = consumos.reduce((s, c) => s + (Number(c.total) || 0), 0);
      const totalPagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
      saldoMax = totalCuenta - totalPagado;
    }

    if (montoNum - saldoMax >= 1) {
      const permitido = Math.max(0, Math.round(saldoMax));
      return NextResponse.json(
        { error: `El pago excede el saldo pendiente (máximo ${permitido}). No se permite sobrepago.` },
        { status: 400, ...noStore }
      );
    }

    // Atomicidad: el pago y (si es fiado) su deuda se crean en UNA sola
    // transacción (rpc). Antes eran dos INSERT separados y un fallo parcial
    // dejaba un fiado sin su deuda, o una deuda sin su pago.
    const { data: pago, error } = await supabase.rpc('crear_pago', {
      p_cuenta_id: cuenta_id,
      p_jugador_id: jugador_id || null,
      p_jugador_nombre: jugador_nombre || null,
      p_monto: montoNum,
      p_metodo: metodo,
    });
    if (error) throw error;

    return NextResponse.json({ pago }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
