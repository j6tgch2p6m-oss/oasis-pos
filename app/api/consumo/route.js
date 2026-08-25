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
    const precioNum = body.precio_unitario == null ? null : Number(body.precio_unitario);
    if (precioNum != null && !Number.isFinite(precioNum)) {
      return NextResponse.json({ error: 'Precio unitario inválido' }, { status: 400, ...noStore });
    }
    // `body.total` ya no se usa: el total se recalcula abajo como precio ×
    // cantidad, así que aceptarlo del cliente solo abriría la puerta a que no
    // cuadren entre sí.

    // El precio lo decide el SERVIDOR, no el cliente. Salvo que el producto esté
    // marcado como `precio_editable` (las clases, que valen distinto según el
    // profesor), se usa el precio del catálogo y se ignora el que llegue en el
    // body. Y el total siempre se recalcula: así un error de la interfaz no
    // puede meter un cobro por un valor que no corresponde.
    let precioFinal = precioNum;
    if (producto_id) {
      const { data: prod, error: errProd } = await supabase
        .from('productos')
        .select('*')
        .eq('id', producto_id)
        .maybeSingle();
      if (errProd) throw errProd;
      if (prod && !prod.precio_editable) {
        precioFinal = Number(prod.precio) || 0;
      }
    }
    if (precioFinal == null || !Number.isFinite(precioFinal) || precioFinal < 0) {
      return NextResponse.json({ error: 'Precio inválido para este producto' }, { status: 400, ...noStore });
    }

    const { data, error } = await supabase
      .from('consumos')
      .insert({
        cuenta_id,
        producto_id: producto_id || null,
        nombre_snapshot,
        precio_unitario: precioFinal,
        cantidad: cantidadNum,
        total: precioFinal * cantidadNum,
        tipo_asignacion,
        asignacion_jugadores: asignacion_jugadores ?? null,
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
