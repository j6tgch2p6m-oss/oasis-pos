import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Registrar plata que SALE de la caja durante el turno (pagar un proveedor, un
// domicilio, una compra menor).
//
// POR QUÉ EXISTE: la caja esperada del cierre es base + ventas en efectivo +
// cobros de cartera. Si alguien saca plata del cajón y no queda registrada, al
// contar el efectivo siempre va a "faltar", y ese faltante es indistinguible de
// un error de digitación o de un robo. Con esto, el retiro legítimo se descuenta
// de lo esperado y la caja vuelve a cuadrar.
export async function POST(request) {
  try {
    const { turno_id, monto, motivo, cajera } = await request.json();

    if (!turno_id) {
      return NextResponse.json({ error: 'No hay turno activo' }, { status: 400, ...noStore });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json(
        { error: 'El egreso debe ser un número mayor que cero' },
        { status: 400, ...noStore }
      );
    }
    // El motivo es obligatorio: un egreso sin explicación es indefendible
    // cuando se revise el cierre después.
    const motivoLimpio = (motivo == null ? '' : String(motivo)).trim();
    if (!motivoLimpio) {
      return NextResponse.json(
        { error: 'Escribe en qué se gastó la plata' },
        { status: 400, ...noStore }
      );
    }

    const { data: egreso, error } = await supabase
      .from('egresos')
      .insert({
        turno_id,
        monto: montoNum,
        motivo: motivoLimpio,
        cajera: cajera ? String(cajera).trim() : null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ egreso }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Eliminar un egreso mal registrado.
export async function DELETE(request) {
  try {
    const { egresoId } = await request.json();
    if (!egresoId) {
      return NextResponse.json({ error: 'Falta el egreso a eliminar' }, { status: 400, ...noStore });
    }
    const { error } = await supabase.from('egresos').delete().eq('id', egresoId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
