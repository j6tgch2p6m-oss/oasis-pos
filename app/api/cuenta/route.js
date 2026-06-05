import { supabase } from '../../../lib/supabase';
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
    // Limpiamos los nombres (sin espacios sobrantes y sin vacíos) para no crear
    // jugadores "fantasma" en blanco. El cliente compara con estos mismos
    // nombres recortados al recuperarse de un timeout, así que deben coincidir.
    const nombresLimpios = (Array.isArray(jugadores) ? jugadores : [])
      .map((n) => String(n == null ? '' : n).trim())
      .filter(Boolean);
    if (nombresLimpios.length === 0) {
      return NextResponse.json({ error: 'Se necesita al menos un jugador' }, { status: 400, ...noStore });
    }

    // Atomicidad: la cuenta y sus jugadores se crean dentro de UNA sola
    // transacción (rpc). Antes eran dos INSERT separados y, si el segundo
    // fallaba, quedaba una cuenta vacía huérfana.
    const { data, error } = await supabase.rpc('crear_cuenta_con_jugadores', {
      p_turno_id: turno_id,
      p_tipo: tipo,
      p_cancha_id: cancha_id || null,
      p_jugadores: nombresLimpios,
    });
    if (error) throw error;

    const cuenta = data && data.cuenta ? data.cuenta : null;
    const jugadoresData = (data && data.jugadores) || [];

    return NextResponse.json(
      { cuenta: { ...cuenta, jugadores: jugadoresData, consumos: [], pagos: [] } },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Cerrar una cuenta
export async function PATCH(request) {
  try {
    const { cuentaId } = await request.json();
    if (!cuentaId) {
      return NextResponse.json({ error: 'Falta la cuenta a cerrar' }, { status: 400, ...noStore });
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
