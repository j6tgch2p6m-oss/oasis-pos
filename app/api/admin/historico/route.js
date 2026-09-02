import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Colombia no tiene horario de verano: desfase fijo UTC-5. created_at se guarda
// en UTC, pero un "día" del club es un día de Bogotá.
const BOGOTA_OFFSET_MIN = -300;

// Convierte un instante UTC al Date "corrido" a hora Bogotá, para poder leerle
// año/mes/día con los getters UTC sin que se meta la zona del servidor.
function aLocal(iso) {
  return new Date(new Date(iso).getTime() + BOGOTA_OFFSET_MIN * 60000);
}
function claveMes(iso) {
  const d = aLocal(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function claveDia(iso) {
  return aLocal(iso).toISOString().slice(0, 10);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function etiquetaMes(clave) {
  const [a, m] = clave.split('-');
  const nombre = MESES[Number(m) - 1] || '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

function sumar(arr, getter) {
  return arr.reduce((s, x) => s + (Number(getter(x)) || 0), 0);
}

// Acumulador vacío: se usa igual para meses y para días, así las dos vistas
// muestran exactamente las mismas métricas y no pueden divergir.
function nuevoBucket(extra) {
  return {
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    fiado: 0,
    // Lo que de verdad entró (sin fiado). Es la cifra que importa para caja.
    cobrado: 0,
    // Facturado = cobrado + fiado.
    vendido: 0,
    egresos: 0,
    descuentos: 0,
    cobroCartera: 0,
    cuentas: 0,
    transacciones: 0,
    ...extra,
  };
}

// GET /api/admin/historico?mes=YYYY-MM
//
// Devuelve DOS cosas:
//   - `meses`: una fila por mes con actividad (comparativo histórico).
//   - `detalle`: el desglose día por día del mes pedido (o el más reciente).
//
// Se calcula en JS sobre lecturas planas en vez de con SQL agregado porque el
// resto del panel ya funciona así (PostgREST + agregación en JS), y porque
// agrupar por día de Bogotá en SQL exigiría cuidar la zona horaria en cada
// consulta.
export async function GET(request) {
  try {
    const mesPedido = new URL(request.url).searchParams.get('mes');

    const [pagosRes, cuentasRes, egresosRes, descuentosRes, cxcRes] = await Promise.all([
      supabase.from('pagos').select('*'),
      supabase.from('cuentas').select('*'),
      supabase.from('egresos').select('*'),
      supabase.from('descuentos').select('*'),
      // Cobros de cartera: plata que entró en una fecha, de una venta vieja.
      supabase.from('cuentas_por_cobrar').select('*').eq('cobrado', true),
    ]);
    if (pagosRes.error) throw pagosRes.error;
    if (cuentasRes.error) throw cuentasRes.error;
    if (egresosRes.error) throw egresosRes.error;
    if (descuentosRes.error) throw descuentosRes.error;
    if (cxcRes.error) throw cxcRes.error;

    const pagos = pagosRes.data || [];
    const cuentas = cuentasRes.data || [];
    const egresos = egresosRes.data || [];
    const descuentos = descuentosRes.data || [];
    const cobros = cxcRes.data || [];

    // ---- Agregado por MES ----
    const porMes = {};
    const bucketMes = (iso) => {
      if (!iso) return null;
      const k = claveMes(iso);
      if (!porMes[k]) porMes[k] = nuevoBucket({ mes: k, label: etiquetaMes(k) });
      return porMes[k];
    };

    pagos.forEach((p) => {
      const b = bucketMes(p.created_at);
      if (!b) return;
      const monto = Number(p.monto) || 0;
      if (b[p.metodo] !== undefined) b[p.metodo] += monto;
      b.vendido += monto;
      if (p.metodo !== 'fiado') b.cobrado += monto;
      b.transacciones += 1;
    });
    egresos.forEach((e) => {
      const b = bucketMes(e.created_at);
      if (b) b.egresos += Number(e.monto) || 0;
    });
    descuentos.forEach((d) => {
      const b = bucketMes(d.created_at);
      if (b) b.descuentos += Number(d.monto) || 0;
    });
    cobros.forEach((c) => {
      const b = bucketMes(c.fecha_cobro);
      if (b) b.cobroCartera += Number(c.monto) || 0;
    });
    cuentas.forEach((c) => {
      const b = bucketMes(c.fecha_apertura);
      if (b) b.cuentas += 1;
    });

    // Rellenamos los meses SIN actividad que quedan entre medio. Un mes en cero
    // es información (el club estuvo cerrado, o el POS no se usó), y omitirlo
    // haría que dos meses no consecutivos se vieran pegados en la gráfica y que
    // la variación comparara contra el mes equivocado. Pasó de verdad: entre
    // 2026-06-29 y 2026-08-20 no se registró un solo pago.
    const clavesConDatos = Object.keys(porMes).sort();
    if (clavesConDatos.length > 1) {
      const [aIni, mIni] = clavesConDatos[0].split('-').map(Number);
      const [aFin, mFin] = clavesConDatos[clavesConDatos.length - 1].split('-').map(Number);
      let a = aIni;
      let m = mIni;
      while (a < aFin || (a === aFin && m <= mFin)) {
        const k = `${a}-${String(m).padStart(2, '0')}`;
        if (!porMes[k]) porMes[k] = nuevoBucket({ mes: k, label: etiquetaMes(k) });
        m += 1;
        if (m > 12) { m = 1; a += 1; }
      }
    }

    // Más reciente primero, con el ticket promedio y la variación contra el mes
    // anterior ya resueltos en el servidor (la vista solo pinta).
    const mesesAsc = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));
    mesesAsc.forEach((m, i) => {
      m.ticket = m.cuentas > 0 ? Math.round(m.cobrado / m.cuentas) : 0;
      const prev = mesesAsc[i - 1];
      m.deltaPct =
        prev && prev.cobrado > 0
          ? Math.round(((m.cobrado - prev.cobrado) / prev.cobrado) * 100)
          : null;
    });
    const meses = [...mesesAsc].reverse();

    // ---- Mes a detallar: el pedido si tiene datos, si no el más reciente ----
    const mesSel = (mesPedido && porMes[mesPedido] && mesPedido) || (meses[0] ? meses[0].mes : null);

    let detalle = null;
    if (mesSel) {
      const [anio, mes] = mesSel.split('-').map(Number);
      const diasEnMes = new Date(anio, mes, 0).getDate();

      // Pre-creamos TODOS los días del mes para que la gráfica muestre los
      // ceros (un día sin ventas es información, no un hueco).
      const porDia = {};
      for (let d = 1; d <= diasEnMes; d++) {
        const k = `${mesSel}-${String(d).padStart(2, '0')}`;
        const dow = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
        porDia[k] = nuevoBucket({ fecha: k, dia: d, diaSemana: DIAS_SEMANA[dow] });
      }
      const bucketDia = (iso) => {
        if (!iso) return null;
        return porDia[claveDia(iso)] || null;
      };

      pagos.forEach((p) => {
        const b = bucketDia(p.created_at);
        if (!b) return;
        const monto = Number(p.monto) || 0;
        if (b[p.metodo] !== undefined) b[p.metodo] += monto;
        b.vendido += monto;
        if (p.metodo !== 'fiado') b.cobrado += monto;
        b.transacciones += 1;
      });
      egresos.forEach((e) => {
        const b = bucketDia(e.created_at);
        if (b) b.egresos += Number(e.monto) || 0;
      });
      descuentos.forEach((d) => {
        const b = bucketDia(d.created_at);
        if (b) b.descuentos += Number(d.monto) || 0;
      });
      cobros.forEach((c) => {
        const b = bucketDia(c.fecha_cobro);
        if (b) b.cobroCartera += Number(c.monto) || 0;
      });
      cuentas.forEach((c) => {
        const b = bucketDia(c.fecha_apertura);
        if (b) b.cuentas += 1;
      });

      const dias = Object.values(porDia);
      const conVenta = dias.filter((d) => d.cobrado > 0);
      const mejor = conVenta.slice().sort((a, b) => b.cobrado - a.cobrado)[0] || null;

      // Promedio por día CON actividad: dividir entre 30 cuando el club abrió 12
      // días daría una cifra engañosamente baja.
      detalle = {
        mes: mesSel,
        label: etiquetaMes(mesSel),
        dias,
        totales: porMes[mesSel],
        diasConVenta: conVenta.length,
        promedioDiaConVenta: conVenta.length
          ? Math.round(sumar(conVenta, (d) => d.cobrado) / conVenta.length)
          : 0,
        mejorDia: mejor ? { fecha: mejor.fecha, dia: mejor.dia, cobrado: mejor.cobrado } : null,
      };
    }

    return NextResponse.json({ generadoEn: new Date().toISOString(), meses, detalle }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
