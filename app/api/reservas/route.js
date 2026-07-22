import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';
import { RESERVAS_COOKIE, usuarioDesdeCookie } from '../../../lib/reservasAuth';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const CANCHAS = ['C1', 'C2'];
const DURACIONES = [60, 90, 120];
const TIPOS_PAGO = ['ninguno', 'abono', 'descuento'];

async function usuarioActual(req) {
  const cookie = req.cookies.get(RESERVAS_COOKIE)?.value;
  return usuarioDesdeCookie(cookie, process.env.ADMIN_PASSWORD);
}

// Minutos desde medianoche de un "HH:MM" o "HH:MM:SS".
function aMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Busca reservas ACTIVAS de la misma cancha y fecha que se crucen con el
// intervalo dado. La BD también lo garantiza (constraint reservas_sin_cruce),
// pero chequearlo aquí da un mensaje amable en lugar de un error de Postgres.
async function hayCruce({ cancha_id, fecha, hora_inicio, duracion_min, ignorarId }) {
  const { data, error } = await supabase
    .from('reservas')
    .select('id, hora_inicio, duracion_min, nombre')
    .eq('estado', 'activa')
    .eq('cancha_id', cancha_id)
    .eq('fecha', fecha);
  if (error) throw error;

  const ini = aMinutos(hora_inicio);
  const fin = ini + duracion_min;
  return (data || []).find((r) => {
    if (ignorarId && r.id === ignorarId) return false;
    const rIni = aMinutos(r.hora_inicio);
    const rFin = rIni + r.duracion_min;
    return ini < rFin && rIni < fin;
  });
}

// Valida y normaliza el cuerpo de una reserva. Devuelve { datos } o { error }.
function validarReserva(body, parcial = false) {
  const datos = {};

  if (!parcial || body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) return { error: 'Falta el nombre de la reserva.' };
    datos.nombre = nombre;
  }
  // Jugadores adicionales (opcionales): guardamos null si vienen vacíos.
  for (const campo of ['jugador2', 'jugador3', 'jugador4']) {
    if (!parcial || body[campo] !== undefined) {
      const v = String(body[campo] || '').trim();
      datos[campo] = v || null;
    }
  }
  if (!parcial || body.cancha_id !== undefined) {
    if (!CANCHAS.includes(body.cancha_id)) {
      return { error: 'Cancha inválida (usa C1 o C2).' };
    }
    datos.cancha_id = body.cancha_id;
  }
  if (!parcial || body.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || ''))) {
      return { error: 'Fecha inválida (formato AAAA-MM-DD).' };
    }
    datos.fecha = body.fecha;
  }
  if (!parcial || body.hora_inicio !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(String(body.hora_inicio || ''))) {
      return { error: 'Hora de inicio inválida (formato HH:MM).' };
    }
    datos.hora_inicio = body.hora_inicio;
  }
  if (!parcial || body.duracion_min !== undefined) {
    const d = Number(body.duracion_min);
    if (!DURACIONES.includes(d)) {
      return { error: 'Duración inválida (60, 90 o 120 minutos).' };
    }
    datos.duracion_min = d;
  }
  if (!parcial || body.tipo_pago !== undefined) {
    const tipo = body.tipo_pago || 'ninguno';
    if (!TIPOS_PAGO.includes(tipo)) {
      return { error: 'Tipo de pago inválido (ninguno, abono o descuento).' };
    }
    datos.tipo_pago = tipo;
    const valor = Number(body.valor);
    if (tipo === 'ninguno') {
      datos.valor = null;
    } else if (!valor || valor <= 0) {
      return { error: 'Indica el valor del ' + tipo + '.' };
    } else {
      datos.valor = valor;
    }
  }
  if (!parcial || body.notas !== undefined) {
    const notas = String(body.notas || '').trim();
    datos.notas = notas || null;
  }
  return { datos };
}

// Listar reservas de un rango de fechas: /api/reservas?desde=...&hasta=...
// Por defecto solo las activas; con &todas=1 incluye canceladas.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta') || desde;
    if (!desde) {
      return NextResponse.json({ error: 'Falta el parámetro desde.' }, { status: 400, ...noStore });
    }

    let query = supabase
      .from('reservas')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')
      .order('hora_inicio');
    if (searchParams.get('todas') !== '1') {
      query = query.eq('estado', 'activa');
    }
    const { data, error } = await query;
    if (error) throw error;

    const usuario = await usuarioActual(req);
    return NextResponse.json({ reservas: data || [], usuario }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Crear una reserva.
export async function POST(req) {
  try {
    const usuario = await usuarioActual(req);
    if (!usuario) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401, ...noStore });
    }
    const body = await req.json().catch(() => ({}));
    const { datos, error: errVal } = validarReserva(body);
    if (errVal) {
      return NextResponse.json({ error: errVal }, { status: 400, ...noStore });
    }

    const cruce = await hayCruce(datos);
    if (cruce) {
      return NextResponse.json(
        { error: `Esa cancha ya está reservada a esa hora (${cruce.nombre}).` },
        { status: 409, ...noStore }
      );
    }

    const { data, error } = await supabase
      .from('reservas')
      .insert({ ...datos, creada_por: usuario })
      .select()
      .single();
    if (error) {
      // 23P01: violación del constraint de no-cruce (carrera entre 2 requests).
      if (error.code === '23P01') {
        return NextResponse.json(
          { error: 'Esa cancha ya está reservada a esa hora.' },
          { status: 409, ...noStore }
        );
      }
      throw error;
    }
    return NextResponse.json({ reserva: data }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Editar o cancelar una reserva:
//   { id, ...campos }          -> edita los campos enviados
//   { id, cancelar: true }     -> marca la reserva como cancelada
export async function PATCH(req) {
  try {
    const usuario = await usuarioActual(req);
    if (!usuario) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401, ...noStore });
    }
    const body = await req.json().catch(() => ({}));
    if (!body.id) {
      return NextResponse.json({ error: 'Falta el id de la reserva.' }, { status: 400, ...noStore });
    }

    let cambios;
    if (body.cancelar) {
      cambios = { estado: 'cancelada' };
    } else {
      const { datos, error: errVal } = validarReserva(body, true);
      if (errVal) {
        return NextResponse.json({ error: errVal }, { status: 400, ...noStore });
      }
      if (Object.keys(datos).length === 0) {
        return NextResponse.json({ error: 'No hay cambios que guardar.' }, { status: 400, ...noStore });
      }
      cambios = datos;
    }

    // Para validar cruces necesitamos la reserva completa resultante.
    const { data: actual, error: errActual } = await supabase
      .from('reservas')
      .select('*')
      .eq('id', body.id)
      .single();
    if (errActual) throw errActual;

    if (!body.cancelar) {
      const resultante = { ...actual, ...cambios };
      const cruce = await hayCruce({ ...resultante, ignorarId: body.id });
      if (cruce) {
        return NextResponse.json(
          { error: `Esa cancha ya está reservada a esa hora (${cruce.nombre}).` },
          { status: 409, ...noStore }
        );
      }
    }

    const { data, error } = await supabase
      .from('reservas')
      .update({ ...cambios, actualizada_por: usuario, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select()
      .single();
    if (error) {
      if (error.code === '23P01') {
        return NextResponse.json(
          { error: 'Esa cancha ya está reservada a esa hora.' },
          { status: 409, ...noStore }
        );
      }
      throw error;
    }
    return NextResponse.json({ reserva: data }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
