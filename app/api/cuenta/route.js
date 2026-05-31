import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Crear una cuenta con sus jugadores
export async function POST(request) {
  try {
    const { turno_id, tipo, cancha_id, jugadores } = await request.json();

    if (!turno_id) {
      return NextResponse.json({ error: 'No hay turno activo' }, { status: 400, ...noStore });
    }
    if (!jugadores || jugadores.length === 0) {
      return NextResponse.json({ error: 'Se necesita al menos un jugador' }, { status: 400, ...noStore });
    }

    const { data: cuenta, error } = await supabase
      .from('cuentas')
      .insert({ turno_id, tipo, cancha_id: cancha_id || null })
      .select()
      .single();
    if (error) throw error;

    const jugadoresRows = jugadores.map((nombre, i) => ({
      cuenta_id: cuenta.id,
      nombre,
      orden: i,
    }));
    const { data: jugadoresData, error: e2 } = await supabase
      .from('jugadores')
      .insert(jugadoresRows)
      .select();
    if (e2) throw e2;

    return NextResponse.json(
      { cuenta: { ...cuenta, jugadores: jugadoresData || [], consumos: [], pagos: [] } },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Cerrar una cuenta
export async function PATCH(request) {
  try {
    const { cuentaId } = await request.json();
    const { error } = await supabase
      .from('cuentas')
      .update({ cerrada: true, fecha_cierre: new Date().toISOString() })
      .eq('id', cuentaId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
