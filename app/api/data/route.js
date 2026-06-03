import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Devuelve todo el estado del sistema. Hace las lecturas en PARALELO por olas
// (lo independiente junto) para que /api/data responda rápido y no provoque
// timeouts en el cliente al refrescar tras una acción.
export async function GET() {
  try {
    // Ola 1: lecturas independientes entre sí.
    const [turnosRes, productosRes, cxcRes] = await Promise.all([
      supabase
        .from('turnos')
        .select('*')
        .is('fecha_cierre', null)
        .order('fecha_apertura', { ascending: false })
        .limit(1),
      supabase.from('productos').select('*').eq('activo', true).order('id'),
      supabase
        .from('cuentas_por_cobrar')
        .select('*')
        .eq('cobrado', false)
        .order('created_at', { ascending: false }),
    ]);
    if (turnosRes.error) throw turnosRes.error;
    if (productosRes.error) throw productosRes.error;
    if (cxcRes.error) throw cxcRes.error;

    const turno = turnosRes.data && turnosRes.data.length > 0 ? turnosRes.data[0] : null;

    let cuentas = [];
    const resumenTurno = {
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0,
      fiado: 0,
      totalVentas: 0,
      cuentasCerradas: 0,
      productosVendidos: 0,
      // Cobro de deudas (cartera) hechas DURANTE este turno. Son ingresos del
      // día, pero corresponden a ventas fiadas de días anteriores: se muestran
      // aparte en el cierre y NO se cuentan como venta del día.
      cobroDeudas: { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 },
    };

    if (turno) {
      // Ola 2: cuentas ABIERTAS (para la vista) + TODAS las del turno (para el
      // resumen de cierre), en paralelo.
      const [abiertasRes, todasRes, cobrosRes] = await Promise.all([
        supabase
          .from('cuentas')
          .select('*')
          .eq('turno_id', turno.id)
          .eq('cerrada', false)
          .order('fecha_apertura'),
        supabase.from('cuentas').select('id, cerrada').eq('turno_id', turno.id),
        // Deudas de cartera cobradas EN este turno (ingreso del día).
        supabase
          .from('cuentas_por_cobrar')
          .select('metodo_cobro, monto')
          .eq('turno_cobro_id', turno.id)
          .eq('cobrado', true),
      ]);
      if (abiertasRes.error) throw abiertasRes.error;
      if (todasRes.error) throw todasRes.error;
      if (cobrosRes.error) throw cobrosRes.error;

      const cuentasBase = abiertasRes.data || [];
      const cuentaIds = cuentasBase.map((c) => c.id);
      const cuentasTurno = todasRes.data || [];
      const idsTurno = cuentasTurno.map((c) => c.id);
      resumenTurno.cuentasCerradas = cuentasTurno.filter((c) => c.cerrada).length;

      // Ola 3: hijos de las cuentas abiertas (jugadores/consumos/pagos) +
      // agregados del turno (pagos/consumos), todo en paralelo. Si no hay ids
      // resolvemos vacío sin pegarle a la BD.
      const vacio = Promise.resolve({ data: [], error: null });
      const [jRes, coRes, pRes, pagosTRes, consumosTRes] = await Promise.all([
        cuentaIds.length ? supabase.from('jugadores').select('*').in('cuenta_id', cuentaIds) : vacio,
        cuentaIds.length ? supabase.from('consumos').select('*').in('cuenta_id', cuentaIds) : vacio,
        cuentaIds.length ? supabase.from('pagos').select('*').in('cuenta_id', cuentaIds) : vacio,
        idsTurno.length ? supabase.from('pagos').select('metodo, monto').in('cuenta_id', idsTurno) : vacio,
        idsTurno.length ? supabase.from('consumos').select('cantidad').in('cuenta_id', idsTurno) : vacio,
      ]);
      if (jRes.error) throw jRes.error;
      if (coRes.error) throw coRes.error;
      if (pRes.error) throw pRes.error;
      if (pagosTRes.error) throw pagosTRes.error;
      if (consumosTRes.error) throw consumosTRes.error;

      const jugadores = jRes.data || [];
      const consumos = coRes.data || [];
      const pagos = pRes.data || [];

      cuentas = cuentasBase.map((c) => ({
        ...c,
        jugadores: jugadores
          .filter((j) => j.cuenta_id === c.id)
          .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        consumos: consumos.filter((co) => co.cuenta_id === c.id),
        pagos: pagos.filter((p) => p.cuenta_id === c.id),
      }));

      (pagosTRes.data || []).forEach((p) => {
        const monto = Number(p.monto) || 0;
        if (resumenTurno[p.metodo] !== undefined) resumenTurno[p.metodo] += monto;
        resumenTurno.totalVentas += monto;
      });
      resumenTurno.productosVendidos = (consumosTRes.data || []).reduce(
        (s, c) => s + (Number(c.cantidad) || 0),
        0
      );

      // Cobro de deudas de cartera hechas en este turno, por método.
      (cobrosRes.data || []).forEach((r) => {
        const monto = Number(r.monto) || 0;
        if (resumenTurno.cobroDeudas[r.metodo_cobro] !== undefined) {
          resumenTurno.cobroDeudas[r.metodo_cobro] += monto;
        }
        resumenTurno.cobroDeudas.total += monto;
      });
    }

    return NextResponse.json(
      {
        turno,
        productos: productosRes.data || [],
        cuentas,
        cuentasPorCobrar: cxcRes.data || [],
        resumenTurno,
      },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
