import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Lista los turnos abiertos (fecha_cierre nula), del más reciente al más antiguo.
async function turnosAbiertos() {
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .is('fecha_cierre', null)
    .order('fecha_apertura', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Abrir un turno. Es IDEMPOTENTE: si ya hay uno abierto, lo DEVUELVE en vez de
// fallar. Así el usuario nunca queda en un callejón sin salida ("ya hay un
// turno abierto") cuando un intento anterior se completó en el servidor pero el
// cliente no recibió la respuesta (timeout o caída de red).
export async function POST(request) {
  try {
    const { cajera, base_caja } = await request.json();
    if (!cajera) {
      return NextResponse.json({ error: 'Falta la cajera' }, { status: 400, ...noStore });
    }

    const abiertos = await turnosAbiertos();
    if (abiertos.length > 0) {
      // Retomamos el turno abierto en lugar de bloquear.
      return NextResponse.json({ turno: abiertos[0], adoptado: true }, noStore);
    }

    const { data, error } = await supabase
      .from('turnos')
      .insert({ cajera, base_caja: base_caja || 0 })
      .select()
      .single();

    if (error) {
      // Carrera: otro request creó el turno entre la lectura y el insert. El
      // índice único uniq_turno_abierto lo impide a nivel de BD; en ese caso
      // recuperamos el turno que sí quedó y lo devolvemos como adoptado.
      const reintento = await turnosAbiertos();
      if (reintento.length > 0) {
        return NextResponse.json({ turno: reintento[0], adoptado: true }, noStore);
      }
      throw error;
    }

    return NextResponse.json({ turno: data }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// PATCH tiene dos modos:
//   1) { turnoId }       -> cierre normal de UN turno (bloquea si tiene cuentas abiertas).
//   2) { cerrarTodo: true } -> RECUPERACIÓN: cierra TODOS los turnos abiertos y
//      sus cuentas abiertas. Lo usa el botón de emergencia de la pantalla de inicio
//      para destrabar el caso "ya hay un turno abierto" pero no me deja entrar.
export async function PATCH(request) {
  try {
    const body = await request.json();

    if (body.cerrarTodo) {
      const abiertos = await turnosAbiertos();
      const ids = abiertos.map((t) => t.id);
      if (ids.length === 0) {
        return NextResponse.json({ ok: true, cerrados: 0 }, noStore);
      }
      // Cerrar cuentas abiertas para no dejar datos colgando ni bloquear el cierre.
      const { error: errCuentas } = await supabase
        .from('cuentas')
        .update({ cerrada: true })
        .in('turno_id', ids)
        .eq('cerrada', false);
      if (errCuentas) throw errCuentas;

      const { error: errTurnos } = await supabase
        .from('turnos')
        .update({ fecha_cierre: new Date().toISOString() })
        .in('id', ids);
      if (errTurnos) throw errTurnos;

      return NextResponse.json({ ok: true, cerrados: ids.length }, noStore);
    }

    const { turnoId, efectivo_contado_cierre } = body;
    if (!turnoId) {
      return NextResponse.json({ error: 'Falta turnoId' }, { status: 400, ...noStore });
    }
    // Cierre normal: no permitir cerrar el turno con cuentas abiertas (la caja debe cuadrar).
    const { data: abiertas, error: errAbiertas } = await supabase
      .from('cuentas')
      .select('id')
      .eq('turno_id', turnoId)
      .eq('cerrada', false);
    if (errAbiertas) throw errAbiertas;
    if (abiertas && abiertas.length > 0) {
      return NextResponse.json(
        { error: `No puedes cerrar el turno: hay ${abiertas.length} cuenta(s) abierta(s). Cóbralas y ciérralas primero.` },
        { status: 400, ...noStore }
      );
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
