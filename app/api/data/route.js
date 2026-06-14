import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Vercel (plan Hobby) mata las funciones a los 10 s por defecto y devuelve un
// 504 en HTML (sin JSON), lo que el cliente ve como "respuesta inesperada".
// Subimos el límite a 30 s (el tope del plan es 60 s) para dar margen a los
// arranques en frío de Supabase. Cada query interna ya aborta a los 12 s.
export const maxDuration = 30;

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
      // Abonos de reserva cobrados en el turno (subconjunto de las ventas, ya
      // van incluidos en totalVentas y en su método; se muestran aparte como
      // referencia) y descuentos aplicados (no son dinero: solo reducen lo que
      // se cobra, por eso NO entran en totalVentas).
      reservas: 0,
      descuentos: 0,
      // Cobro de deudas (cartera) hechas DURANTE este turno. Son ingresos del
      // día, pero corresponden a ventas fiadas de días anteriores: se muestran
      // aparte en el cierre y NO se cuentan como venta del día.
      cobroDeudas: { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 },
    };

    if (turno) {
      // IMPORTANTE — por qué TODO usa .select('*'):
      // En este despliegue (postgrest-js 2.106.2) las proyecciones de varias
      // columnas como .select('id, cerrada') o .select('metodo, monto')
      // devolvían un arreglo VACÍO (sin lanzar error). Eso dejaba idsTurno en
      // [] y el resumenTurno en 0 (totalVentas, productosVendidos,
      // cuentasCerradas) y cobroDeudas en 0 aunque sí hubiera pagos/cobros:
      // ese era el "descuadre de caja" al cerrar el turno. .select('*') sí
      // funciona de forma fiable, así que leemos columnas completas y
      // calculamos en JS.

      // Ola 2: TODAS las cuentas del turno (una sola lectura; de aquí salen
      // tanto las abiertas para la vista como los ids para el resumen) +
      // deudas de cartera cobradas EN este turno (ingreso del día).
      const [cuentasRes, cobrosRes] = await Promise.all([
        supabase
          .from('cuentas')
          .select('*')
          .eq('turno_id', turno.id)
          .order('fecha_apertura'),
        supabase
          .from('cuentas_por_cobrar')
          .select('*')
          .eq('turno_cobro_id', turno.id)
          .eq('cobrado', true),
      ]);
      if (cuentasRes.error) throw cuentasRes.error;
      if (cobrosRes.error) throw cobrosRes.error;

      const cuentasTurno = cuentasRes.data || [];
      const idsTurno = cuentasTurno.map((c) => c.id);
      const cuentasBase = cuentasTurno.filter((c) => !c.cerrada);
      const cuentaIds = cuentasBase.map((c) => c.id);
      resumenTurno.cuentasCerradas = cuentasTurno.filter((c) => c.cerrada).length;

      // Ola 3: jugadores de las cuentas ABIERTAS + pagos y consumos de TODO el
      // turno (para el resumen). Los hijos de cada cuenta abierta se derivan
      // filtrando estos mismos resultados, porque cuentaIds ⊆ idsTurno.
      const vacio = Promise.resolve({ data: [], error: null });
      const [jRes, pagosTRes, consumosTRes, descuentosTRes] = await Promise.all([
        cuentaIds.length ? supabase.from('jugadores').select('*').in('cuenta_id', cuentaIds) : vacio,
        idsTurno.length ? supabase.from('pagos').select('*').in('cuenta_id', idsTurno) : vacio,
        idsTurno.length ? supabase.from('consumos').select('*').in('cuenta_id', idsTurno) : vacio,
        idsTurno.length ? supabase.from('descuentos').select('*').in('cuenta_id', idsTurno) : vacio,
      ]);
      if (jRes.error) throw jRes.error;
      if (pagosTRes.error) throw pagosTRes.error;
      if (consumosTRes.error) throw consumosTRes.error;
      if (descuentosTRes.error) throw descuentosTRes.error;

      const jugadores = jRes.data || [];
      const pagosTurno = pagosTRes.data || [];
      const consumosTurno = consumosTRes.data || [];
      const descuentosTurno = descuentosTRes.data || [];

      cuentas = cuentasBase.map((c) => ({
        ...c,
        jugadores: jugadores
          .filter((j) => j.cuenta_id === c.id)
          .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        consumos: consumosTurno.filter((co) => co.cuenta_id === c.id),
        pagos: pagosTurno.filter((p) => p.cuenta_id === c.id),
        descuentos: descuentosTurno.filter((dd) => dd.cuenta_id === c.id),
      }));

      pagosTurno.forEach((p) => {
        const monto = Number(p.monto) || 0;
        if (resumenTurno[p.metodo] !== undefined) resumenTurno[p.metodo] += monto;
        resumenTurno.totalVentas += monto;
        if (p.es_reserva) resumenTurno.reservas += monto;
      });
      resumenTurno.descuentos = descuentosTurno.reduce((s, dd) => s + (Number(dd.monto) || 0), 0);
      resumenTurno.productosVendidos = consumosTurno.reduce(
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
