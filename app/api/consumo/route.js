import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Agregar un consumo a una cuenta
export async function POST(request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from('consumos')
      .insert({
        cuenta_id: body.cuenta_id,
        producto_id: body.producto_id,
        nombre_snapshot: body.nombre_snapshot,
        precio_unitario: body.precio_unitario,
        cantidad: body.cantidad,
        total: body.total,
        tipo_asignacion: body.tipo_asignacion,
        asignacion_jugadores: body.asignacion_jugadores,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ consumo: data }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Eliminar un consumo
export async function DELETE(request) {
  try {
    const { consumoId } = await request.json();
    const { error } = await supabase.from('consumos').delete().eq('id', consumoId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
