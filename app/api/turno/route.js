import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Abrir un turno
export async function POST(request) {
  try {
    const { cajera, base_caja } = await request.json();
    if (!cajera) {
      return NextResponse.json({ error: 'Falta la cajera' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('turnos')
      .insert({ cajera, base_caja: base_caja || 0 })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ turno: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Cerrar un turno
export async function PATCH(request) {
  try {
    const { turnoId, efectivo_contado_cierre } = await request.json();
    const { error } = await supabase
      .from('turnos')
      .update({
        fecha_cierre: new Date().toISOString(),
        efectivo_contado_cierre: efectivo_contado_cierre ?? null,
      })
      .eq('id', turnoId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
