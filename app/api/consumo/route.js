import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Agregar un consumo a una cuenta
export async function POST(request) {
  try {
    const {
      cuenta_id,
      producto_id,
      nombre_snapshot,
      precio_unitario,
      cantidad,
      total,
      tipo_asignacion,
      asignacion_jugadores,
    } = await request.json();

    const { data, error } = await supabase
      .from('consumos')
      .insert({
        cuenta_id,
        producto_id,
        nombre_snapshot,
        precio_unitario,
        cantidad,
        total,
        tipo_asignacion,
        asignacion_jugadores,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ consumo: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Eliminar un consumo
export async function DELETE(request) {
  try {
    const { consumoId } = await request.json();
    const { error } = await supabase.from('consumos').delete().eq('id', consumoId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
