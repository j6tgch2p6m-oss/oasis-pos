import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Abrir un turno
export async function POST(request) {
  try {
    const { cajera, base_caja } = await request.json();
    if (!cajera) {
      return NextResponse.json({ error: 'Falta la cajera' }, { status: 400, ...noStore });
    }
    const { data, error } = await supabase
      .from('turnos')
      .insert({ cajera, base_caja: base_caja || 0 })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ turno: data }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Cerrar un turno
export async function PATCH(request) {
  try {
    const { turnoId, efectivo_contado_cierre } = await request.json();
    if (!turnoId) {
      return NextResponse.json({ error: 'Falta turnoId' }, { status: 400, ...noStore });
    }
    const cambios = { fecha_cierre: new Date().toISOString() };
    if (efectivo_contado_cierre !== undefined && efectivo_contado_cierre !== null) {
      cambios.efectivo_contado_cierre = efectivo_contado_cierre;
    }
    const { error } = await supabase.from('turnos').update(cambios).eq('id', turnoId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
