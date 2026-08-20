import { supabase } from '../../../lib/supabase';
import { IDS_CANCHA } from '../../../lib/canchas';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const TIPOS_CUENTA = ['cancha', 'individual'];

// Crear una cuenta con sus jugadores
export async function POST(request) {
  try {
    const { turno_id, tipo, cancha_id, jugadores } = await request.json();

    if (!turno_id) {
      return NextResponse.json({ error: 'No hay turno activo' }, { status: 400, ...noStore });
    }
    if (!TIPOS_CUENTA.includes(tipo)) {
      return NextResponse.json({ error: 'Tipo de cuenta inválido' }, { status: 400, ...noStore });
    }
    // La cancha manda: si viene una, la cuenta es de cancha; si no, es
    // individual. Derivar `tipo` en vez de confiar en el que mande el cliente
    // evita que queden desalineados (el panel admin filtra por tipo).
    const canchaLimpia = cancha_id ? String(cancha_id) : null;
    if (canchaLimpia !== null && !IDS_CANCHA.includes(canchaLimpia)) {
      return NextResponse.json({ error: 'Esa cancha no existe' }, { status: 400, ...noStore });
    }
    const tipoReal = canchaLimpia ? 'cancha' : 'individual';
    // Limpiamos los nombres (sin espacios sobrantes y sin vacíos) para no crear
    // jugadores "fantasma" en blanco. El cliente compara con estos mismos
    // nombres recortados al recuperarse de un timeout, así que deben coincidir.
    const nombresLimpios = (Array.isArray(jugadores) ? jugadores : [])
      .map((n) => String(n == null ? '' : n).trim())
      .filter(Boolean);
    if (nombresLimpios.length === 0) {
      return NextResponse.json({ error: 'Se necesita al menos un jugador' }, { status: 400, ...noStore });
    }

    const { data: cuenta, error } = await supabase
      .from('cuentas')
      .insert({ turno_id, tipo: tipoReal, cancha_id: canchaLimpia })
      .select()
      .single();
    if (error) throw error;

    const jugadoresRows = nombresLimpios.map((nombre, i) => ({
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

// PATCH tiene dos modos:
//   1) { cuentaId }                          -> CERRAR la cuenta (comportamiento
//      de siempre; se deja tal cual para no romper un cliente viejo en vuelo).
//   2) { cuentaId, accion: 'mover', cancha_id } -> MOVER la cuenta a otra cancha,
//      o sacarla de la cancha para volverla individual (cancha_id: null).
//
// El modo 'mover' existe porque el tipo de cuenta ya no se decide para siempre
// al crearla: un grupo puede empezar en una cancha y terminar como cuenta
// individual (o al revés), sin tener que cerrar y volver a cargar todo.
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { cuentaId } = body;
    if (!cuentaId) {
      return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400, ...noStore });
    }

    if (body.accion === 'mover') {
      // null / '' significan "sin cancha" -> cuenta individual.
      const destino = body.cancha_id ? String(body.cancha_id) : null;
      if (destino !== null && !IDS_CANCHA.includes(destino)) {
        return NextResponse.json({ error: 'Esa cancha no existe' }, { status: 400, ...noStore });
      }

      // `tipo` acompaña a cancha_id: la BD tiene un CHECK sobre tipo y el panel
      // admin filtra por tipo === 'cancha' para pintar las canchas en vivo, así
      // que dejarlos desalineados rompería ese reporte.
      const { data, error } = await supabase
        .from('cuentas')
        .update({ cancha_id: destino, tipo: destino ? 'cancha' : 'individual' })
        .eq('id', cuentaId)
        .eq('cerrada', false)
        .select();
      if (error) throw error;

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'No se pudo mover: la cuenta ya está cerrada o no existe.' },
          { status: 409, ...noStore }
        );
      }
      return NextResponse.json({ ok: true, cuenta: data[0] }, noStore);
    }

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
