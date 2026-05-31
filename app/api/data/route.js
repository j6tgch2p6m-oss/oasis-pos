import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Devuelve todo el estado actual del sistema en una sola llamada:
// turno activo, productos, cuentas abiertas (con sus jugadores/consumos/pagos),
// y cuentas por cobrar pendientes.
export async function GET() {
  try {
    // Turno activo = el que no tiene fecha de cierre
    const { data: turnos, error: eTurno } = await supabase
      .from('turnos')
      .select('*')
      .is('fecha_cierre', null)
      .order('fecha_apertura', { ascending: false })
      .limit(1);
    if (eTurno) throw eTurno;
    const turno = turnos && turnos.length > 0 ? turnos[0] : null;

    const { data: productos, error: eProd } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('id');
    if (eProd) throw eProd;

    const { data: cuentas, error: eCuentas } = await supabase
      .from('cuentas')
      .select('*, jugadores(*), consumos(*), pagos(*)')
      .eq('cerrada', false)
      .order('fecha_apertura');
    if (eCuentas) throw eCuentas;

    const { data: cuentasPorCobrar, error: eCxc } = await supabase
      .from('cuentas_por_cobrar')
      .select('*')
      .eq('cobrado', false)
      .order('created_at', { ascending: false });
    if (eCxc) throw eCxc;

    return NextResponse.json(
      {
        turno,
        productos: productos || [],
        cuentas: cuentas || [],
        cuentasPorCobrar: cuentasPorCobrar || [],
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
