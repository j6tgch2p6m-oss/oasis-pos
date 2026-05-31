import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Devuelve todo el estado del sistema. Usa lecturas SEPARADAS (no anidadas)
// y las une en código: es más robusto y evita errores de relaciones.
export async function GET() {
  try {
    // 1. Turno activo (sin fecha de cierre)
    const turnosRes = await supabase
      .from('turnos')
      .select('*')
      .is('fecha_cierre', null)
      .order('fecha_apertura', { ascending: false })
      .limit(1);
    if (turnosRes.error) throw turnosRes.error;
    const turno = turnosRes.data && turnosRes.data.length > 0 ? turnosRes.data[0] : null;

    // 2. Productos activos
    const productosRes = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('id');
    if (productosRes.error) throw productosRes.error;

    // 3. Cuentas abiertas
    const cuentasRes = await supabase
      .from('cuentas')
      .select('*')
      .eq('cerrada', false)
      .order('fecha_apertura');
    if (cuentasRes.error) throw cuentasRes.error;
    const cuentasBase = cuentasRes.data || [];
    const cuentaIds = cuentasBase.map((c) => c.id);

    // 4. Hijos de esas cuentas (jugadores, consumos, pagos) en lecturas separadas
    let jugadores = [];
    let consumos = [];
    let pagos = [];
    if (cuentaIds.length > 0) {
      const [jRes, coRes, pRes] = await Promise.all([
        supabase.from('jugadores').select('*').in('cuenta_id', cuentaIds),
        supabase.from('consumos').select('*').in('cuenta_id', cuentaIds),
        supabase.from('pagos').select('*').in('cuenta_id', cuentaIds),
      ]);
      if (jRes.error) throw jRes.error;
      if (coRes.error) throw coRes.error;
      if (pRes.error) throw pRes.error;
      jugadores = jRes.data || [];
      consumos = coRes.data || [];
      pagos = pRes.data || [];
    }

    // Unir hijos a cada cuenta
    const cuentas = cuentasBase.map((c) => ({
      ...c,
      jugadores: jugadores
        .filter((j) => j.cuenta_id === c.id)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
      consumos: consumos.filter((co) => co.cuenta_id === c.id),
      pagos: pagos.filter((p) => p.cuenta_id === c.id),
    }));

    // 5. Cuentas por cobrar pendientes
    const cxcRes = await supabase
      .from('cuentas_por_cobrar')
      .select('*')
      .eq('cobrado', false)
      .order('created_at', { ascending: false });
    if (cxcRes.error) throw cxcRes.error;

    // 6. Resumen del turno activo (para el cierre de caja): todos los pagos
    //    y consumos de TODAS las cuentas del turno (abiertas y cerradas).
    let resumenTurno = {
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0,
      fiado: 0,
      totalVentas: 0,
      cuentasCerradas: 0,
      productosVendidos: 0,
    };
    if (turno) {
      const cuentasTurnoRes = await supabase
        .from('cuentas')
        .select('id, cerrada')
        .eq('turno_id', turno.id);
      const cuentasTurno = cuentasTurnoRes.data || [];
      const idsTurno = cuentasTurno.map((c) => c.id);
      resumenTurno.cuentasCerradas = cuentasTurno.filter((c) => c.cerrada).length;

      if (idsTurno.length > 0) {
        const [pagosTRes, consumosTRes] = await Promise.all([
          supabase.from('pagos').select('metodo, monto').in('cuenta_id', idsTurno),
          supabase.from('consumos').select('cantidad').in('cuenta_id', idsTurno),
        ]);
        (pagosTRes.data || []).forEach((p) => {
          const monto = Number(p.monto) || 0;
          if (resumenTurno[p.metodo] !== undefined) resumenTurno[p.metodo] += monto;
          resumenTurno.totalVentas += monto;
        });
        resumenTurno.productosVendidos = (consumosTRes.data || []).reduce(
          (s, c) => s + (Number(c.cantidad) || 0),
          0
        );
      }
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
