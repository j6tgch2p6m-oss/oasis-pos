import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

// POS TORNEO · API
// Un solo endpoint: GET devuelve todo el estado del torneo; POST recibe
// acciones ({ accion: ... }). Protegido con un PIN sencillo por header.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Meseros del torneo. Para cambiarlos, editar esta lista y volver a desplegar.
const MESEROS = ['Juan Naranjo', 'Mateo R', 'Omar S', 'Pampa', 'Laura', 'Juanes M', 'Socios', 'Otros'];

// Categorías del catálogo que NO se muestran en el torneo.
const CATEGORIAS_OCULTAS = ['Alquiler cancha'];

// PIN: variable TORNEO_PIN en Vercel; si no está, se usa el de abajo.
const PIN = process.env.TORNEO_PIN || '2026';
const METODOS = ['efectivo', 'transferencia'];

function fail(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status, ...noStore });
}

function pinOk(request) {
  return request.headers.get('x-torneo-pin') === PIN;
}

function saldoDe(cuentaId, ventas, pagos) {
  const cargos = ventas.filter((v) => v.cuenta_id === cuentaId).reduce((s, v) => s + Number(v.total || 0), 0);
  const abonos = pagos.filter((p) => p.cuenta_id === cuentaId).reduce((s, p) => s + Number(p.monto || 0), 0);
  return cargos - abonos;
}

// ---------------------------------------------------------------- GET
export async function GET(request) {
  if (!pinOk(request)) return fail('PIN incorrecto', 401);
  try {
    const [prodRes, ventasRes, itemsRes, cuentasRes, pagosRes, cierresRes] = await Promise.all([
      supabase.from('productos').select('*').eq('activo', true).order('nombre'),
      supabase.from('torneo_ventas').select('*').order('numero', { ascending: false }),
      supabase.from('torneo_venta_items').select('*'),
      supabase.from('torneo_cuentas').select('*').order('created_at'),
      supabase.from('torneo_pagos').select('*').order('created_at'),
      supabase.from('torneo_cierres').select('*').order('numero'),
    ]);
    for (const r of [prodRes, ventasRes, itemsRes, cuentasRes, pagosRes, cierresRes]) {
      if (r.error) throw r.error;
    }

    const productos = (prodRes.data || []).filter((p) => !CATEGORIAS_OCULTAS.includes(p.categoria));
    const itemsPorVenta = {};
    for (const it of itemsRes.data || []) {
      (itemsPorVenta[it.venta_id] ||= []).push(it);
    }

    // El día en curso arranca donde terminó el último cierre. Lo que pasó antes
    // ya está archivado, pero las comandas sin cobrar y las cuentas con saldo
    // siguen apareciendo aunque sean de un día anterior: esa plata todavía se
    // debe. Cada venta y cada abono viene marcado para que la pantalla sepa
    // cuáles son del día en curso.
    const cierres = cierresRes.data || [];
    const desde = cierres.length ? cierres[cierres.length - 1].hasta : null;
    const enElDia = (iso) => !!iso && (!desde || new Date(iso) > new Date(desde));

    const ventas = (ventasRes.data || []).map((v) => ({
      ...v,
      items: itemsPorVenta[v.id] || [],
      del_dia: enElDia(v.created_at),
      cobrada_en_el_dia: v.estado === 'pagada' && enElDia(v.pagada_at),
    }));
    const pagos = (pagosRes.data || []).map((p) => ({ ...p, del_dia: enElDia(p.created_at) }));
    const cuentas = (cuentasRes.data || []).map((c) => ({ ...c, saldo: saldoDe(c.id, ventas, pagos) }));
    const siguiente = ventas.length ? Number(ventas[0].numero) + 1 : 1;

    return NextResponse.json(
      {
        meseros: MESEROS,
        productos,
        ventas,
        cuentas,
        pagos,
        cierres,
        dia: { numero: cierres.length + 1, desde },
        siguiente_numero: siguiente,
      },
      noStore
    );
  } catch (e) {
    return fail(e.message, 500);
  }
}

// ---------------------------------------------------------------- POST
export async function POST(request) {
  if (!pinOk(request)) return fail('PIN incorrecto', 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Cuerpo inválido');
  }
  const accion = body?.accion;

  try {
    // ---- Registrar una comanda (venta + items, atómico) ----
    if (accion === 'venta') {
      const { mesero, estado, metodo, cuenta_id, items } = body;
      if (!MESEROS.includes(mesero)) return fail('Mesero inválido');
      if (!['pagada', 'pendiente', 'cuenta'].includes(estado)) return fail('Estado inválido');
      if (estado === 'pagada' && !METODOS.includes(metodo)) return fail('Falta el método de pago');
      if (estado === 'cuenta' && !cuenta_id) return fail('Falta la cuenta del cliente');
      if (!Array.isArray(items) || items.length === 0) return fail('La comanda está vacía');
      const limpios = items
        .map((it) => ({ producto_id: Number(it.producto_id), cantidad: Number(it.cantidad) || 1 }))
        .filter((it) => Number.isInteger(it.producto_id) && it.cantidad > 0);
      if (limpios.length === 0) return fail('La comanda está vacía');

      const { data, error } = await supabase.rpc('torneo_crear_venta', {
        p_mesero: mesero,
        p_estado: estado,
        p_metodo: estado === 'pagada' ? metodo : null,
        p_cuenta_id: estado === 'cuenta' ? cuenta_id : null,
        p_items: limpios,
      });
      if (error) throw error;
      return NextResponse.json({ venta: data }, noStore);
    }

    // ---- Abrir cuenta de cliente ----
    if (accion === 'abrir_cuenta') {
      const nombre = String(body.nombre || '').trim();
      if (!nombre) return fail('Escribe el nombre del cliente');
      const { data, error } = await supabase
        .from('torneo_cuentas')
        .insert({ nombre })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ cuenta: data }, noStore);
    }

    // ---- El mesero volvió con la plata de una comanda pendiente ----
    if (accion === 'cobrar_pendiente') {
      const { venta_id, metodo } = body;
      if (!venta_id) return fail('Falta la venta');
      if (!METODOS.includes(metodo)) return fail('Método de pago inválido');
      const { data, error } = await supabase
        .from('torneo_ventas')
        .update({ estado: 'pagada', metodo, pagada_at: new Date().toISOString() })
        .eq('id', venta_id)
        .eq('estado', 'pendiente')
        .select();
      if (error) throw error;
      if (!data || data.length === 0) return fail('Esa comanda ya no está pendiente', 409);
      return NextResponse.json({ venta: data[0] }, noStore);
    }

    // ---- Abono a cuenta de cliente (se cierra sola al llegar a 0) ----
    if (accion === 'abonar') {
      const { cuenta_id, metodo } = body;
      const monto = Number(body.monto);
      if (!cuenta_id) return fail('Falta la cuenta');
      if (!METODOS.includes(metodo)) return fail('Método de pago inválido');
      if (!Number.isFinite(monto) || monto <= 0) return fail('El abono debe ser mayor que cero');
      const { data, error } = await supabase.rpc('torneo_abonar', {
        p_cuenta_id: cuenta_id,
        p_monto: monto,
        p_metodo: metodo,
      });
      if (error) throw error;
      return NextResponse.json({ resultado: data }, noStore);
    }

    // ---- Cerrar una cuenta que quedó en 0 (o abierta por error) ----
    if (accion === 'cerrar_cuenta') {
      const { cuenta_id } = body;
      if (!cuenta_id) return fail('Falta la cuenta');
      const [vRes, pRes] = await Promise.all([
        supabase.from('torneo_ventas').select('*').eq('cuenta_id', cuenta_id),
        supabase.from('torneo_pagos').select('*').eq('cuenta_id', cuenta_id),
      ]);
      if (vRes.error) throw vRes.error;
      if (pRes.error) throw pRes.error;
      const saldo = saldoDe(cuenta_id, vRes.data || [], pRes.data || []);
      if (saldo >= 1) return fail('La cuenta todavía tiene saldo pendiente', 409);
      const { error } = await supabase
        .from('torneo_cuentas')
        .update({ abierta: false, cerrada_at: new Date().toISOString() })
        .eq('id', cuenta_id);
      if (error) throw error;
      return NextResponse.json({ ok: true }, noStore);
    }

    // ---- Anular una comanda registrada por error ----
    if (accion === 'anular') {
      const { venta_id } = body;
      if (!venta_id) return fail('Falta la venta');
      const { error } = await supabase.from('torneo_ventas').delete().eq('id', venta_id);
      if (error) throw error;
      return NextResponse.json({ ok: true }, noStore);
    }

    // ---- Cerrar el día ----
    // Guarda el corte del día con su arqueo de efectivo. Si quedan comandas
    // por cobrar o cuentas de clientes con saldo, la base lo rechaza salvo
    // que se mande `forzar`, y entonces esas deudas quedan anotadas en el
    // cierre y siguen visibles al día siguiente.
    if (accion === 'cerrar_dia') {
      const contado = body.efectivo_contado == null || body.efectivo_contado === ''
        ? null
        : Number(body.efectivo_contado);
      if (contado != null && (!Number.isFinite(contado) || contado < 0)) {
        return fail('El efectivo contado no es un número válido');
      }
      const { data, error } = await supabase.rpc('torneo_cerrar_dia', {
        p_efectivo_contado: contado,
        p_notas: body.notas || null,
        p_forzar: body.forzar === true,
      });
      if (error) throw error;
      return NextResponse.json({ cierre: data }, noStore);
    }

    // ---- Borrar todo el torneo (pruebas) ----
    if (accion === 'reiniciar') {
      if (body.confirmar !== 'REINICIAR') return fail('Escribe REINICIAR para confirmar');
      const { error } = await supabase.rpc('torneo_reiniciar');
      if (error) throw error;
      return NextResponse.json({ ok: true }, noStore);
    }

    return fail('Acción desconocida');
  } catch (e) {
    return fail(e.message, 500);
  }
}
