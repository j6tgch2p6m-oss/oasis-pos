import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const TIPOS_ASIGNACION = ['individual', 'split'];

// Agregar un consumo a una cuenta
export async function POST(request) {
  try {
    const body = await request.json();
    const { cuenta_id, producto_id, nombre_snapshot, tipo_asignacion, asignacion_jugadores } = body;

    // Validación: evita 500 por violar restricciones de la BD y datos basura.
    if (!cuenta_id) {
      return NextResponse.json({ error: 'Falta la cuenta del consumo' }, { status: 400, ...noStore });
    }
    if (!nombre_snapshot) {
      return NextResponse.json({ error: 'Falta el nombre del producto' }, { status: 400, ...noStore });
    }
    if (!TIPOS_ASIGNACION.includes(tipo_asignacion)) {
      return NextResponse.json({ error: 'Tipo de asignación inválido' }, { status: 400, ...noStore });
    }
    const cantidadNum = Number(body.cantidad);
    if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser un entero mayor que cero' }, { status: 400, ...noStore });
    }
    // precio_unitario y total son NOT NULL en la BD: si llegaban nulos, el insert
    // devolvía un 500 ("violates not-null constraint"). Validamos aquí para
    // responder siempre un 400 claro y nunca un 500 por datos incompletos.
    const precioNum = Number(body.precio_unitario);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      return NextResponse.json({ error: 'Precio unitario inválido' }, { status: 400, ...noStore });
    }
    const totalNum = Number(body.total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      return NextResponse.json({ error: 'Total del consumo inválido' }, { status: 400, ...noStore });
    }
    // asignacion_jugadores es jsonb NOT NULL: normalizamos a arreglo ([] si no
    // llega) para no violar la restricción ni romper el cálculo de split.
    const asignacion = Array.isArray(asignacion_jugadores) ? asignacion_jugadores : [];

    const { data, error } = await supabase
      .from('consumos')
      .insert({
        cuenta_id,
        producto_id: producto_id || null,
        nombre_snapshot,
        precio_unitario: precioNum,
        cantidad: cantidadNum,
        total: totalNum,
        tipo_asignacion,
        asignacion_jugadores: asignacion,
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
    if (!consumoId) {
      return NextResponse.json({ error: 'Falta el consumo a eliminar' }, { status: 400, ...noStore });
    }
    const { error } = await supabase.from('consumos').delete().eq('id', consumoId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
