import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Registrar un descuento sobre una cuenta. No es dinero: reduce lo que se
// cobra. Lleva un motivo obligatorio para poder revisarlo luego como admin.
export async function POST(request) {
  try {
    const { cuenta_id, jugador_id, monto, motivo, cajera } = await request.json();

    if (!cuenta_id) {
      return NextResponse.json({ error: 'Falta la cuenta del descuento' }, { status: 400, ...noStore });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json({ error: 'El descuento debe ser un número mayor que cero' }, { status: 400, ...noStore });
    }
    const motivoLimpio = (motivo == null ? '' : String(motivo)).trim();
    if (!motivoLimpio) {
      return NextResponse.json({ error: 'Escribe el motivo del descuento' }, { status: 400, ...noStore });
    }

    const { data: descuento, error } = await supabase
      .from('descuentos')
      .insert({
        cuenta_id,
        jugador_id: jugador_id || null,
        monto: montoNum,
        motivo: motivoLimpio,
        cajera: cajera ? String(cajera).trim() : null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ descuento }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Eliminar un descuento (por si se aplicó por error).
export async function DELETE(request) {
  try {
    const { descuentoId } = await request.json();
    if (!descuentoId) {
      return NextResponse.json({ error: 'Falta el descuento a eliminar' }, { status: 400, ...noStore });
    }
    const { error } = await supabase.from('descuentos').delete().eq('id', descuentoId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
