import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Colombia no tiene horario de verano: el desfase es fijo UTC-5.
// created_at se guarda en UTC; para agrupar por "día" hay que pensar en hora
// local de Bogotá. -300 minutos = -5 horas.
const BOGOTA_OFFSET_MIN = -300;

// Devuelve el instante UTC que corresponde al inicio (00:00 hora Bogotá) del
// día local que contiene a `date`.
function inicioDiaBogota(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MIN * 60000;
  const d = new Date(localMs);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - BOGOTA_OFFSET_MIN * 60000);
}

// Inicio (00:00 hora Bogotá) del primer día del mes que contiene a `date`.
function inicioMesBogota(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MIN * 60000;
  const d = new Date(localMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - BOGOTA_OFFSET_MIN * 60000);
}

// Fecha calendario (YYYY-MM-DD) en hora Bogotá para un instante UTC.
function fechaBogota(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MIN * 60000;
  return new Date(localMs).toISOString().slice(0, 10);
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function sumar(arr, getter) {
  return arr.reduce((s, x) => s + (Number(getter(x)) || 0), 0);
}

// GET /api/admin/data
// Estado de solo lectura para el Dashboard. Lecturas en PARALELO y unidas en
// JS (sin nested selects de PostgREST, que con RLS devuelven [] en silencio).
export async function GET() {
  try {
    const ahora = new Date();

    // Límites de tiempo (en UTC) calculados en hora Bogotá.
    const inicioHoy = inicioDiaBogota(ahora); // 00:00 hoy
    const finHoy = new Date(inicioHoy.getTime() + 24 * 3600 * 1000); // 00:00 mañana
    const inicioSemPasada = new Date(inicioHoy.getTime() - 7 * 24 * 3600 * 1000); // 00:00 mismo día -7
    const finSemPasada = new Date(inicioSemPasada.getTime() + 24 * 3600 * 1000);
    const inicio7d = new Date(inicioHoy.getTime() - 6 * 24 * 3600 * 1000); // hace 6 días (serie de 7)
    const inicioMes = inicioMesBogota(ahora);

    // Ola 1: lecturas independientes.
    //  - turno abierto (cabecera EN VIVO)
    //  - todos los pagos (para ventas + ticket promedio histórico + gráficas)
    //  - todas las cuentas (para conteo de hoy + ticket histórico)
    //  - cartera pendiente (total por cobrar)
    //  - consumos del mes (top productos del mes)
    const [turnoRes, pagosRes, cuentasRes, cxcRes, consumosRes] = await Promise.all([
      supabase
        .from('turnos')
        .select('*')
        .is('fecha_cierre', null)
        .order('fecha_apertura', { ascending: false })
        .limit(1),
      supabase.from('pagos').select('*').order('created_at', { ascending: false }),
      supabase.from('cuentas').select('*'),
      supabase.from('cuentas_por_cobrar').select('*').eq('cobrado', false),
      supabase.from('consumos').select('*').gte('created_at', inicioMes.toISOString()),
    ]);
    if (turnoRes.error) throw turnoRes.error;
    if (pagosRes.error) throw pagosRes.error;
    if (cuentasRes.error) throw cuentasRes.error;
    if (cxcRes.error) throw cxcRes.error;
    if (consumosRes.error) throw consumosRes.error;

    const turno = turnoRes.data && turnoRes.data.length ? turnoRes.data[0] : null;
    const pagos = pagosRes.data || [];
    const cuentas = cuentasRes.data || [];
    const cxc = cxcRes.data || [];
    const consumosMes = consumosRes.data || [];

    const enRango = (iso, ini, fin) => {
      const t = new Date(iso).getTime();
      return t >= ini.getTime() && t < fin.getTime();
    };

    // ---- KPI 1: Ventas de hoy vs. mismo día semana pasada ----
    const pagosHoy = pagos.filter((p) => p.created_at && enRango(p.created_at, inicioHoy, finHoy));
    const pagosSemPasada = pagos.filter(
      (p) => p.created_at && enRango(p.created_at, inicioSemPasada, finSemPasada)
    );
    const ventasHoy = sumar(pagosHoy, (p) => p.monto);
    const ventasSemPasada = sumar(pagosSemPasada, (p) => p.monto);
    const deltaPct =
      ventasSemPasada > 0
        ? Math.round(((ventasHoy - ventasSemPasada) / ventasSemPasada) * 100)
        : null;

    // ---- KPI 2: Cuentas de hoy (abiertas / cerradas) ----
    const cuentasHoy = cuentas.filter(
      (c) => c.fecha_apertura && enRango(c.fecha_apertura, inicioHoy, finHoy)
    );
    const cuentasHoyCerradas = cuentasHoy.filter((c) => c.cerrada).length;
    const cuentasHoyAbiertas = cuentasHoy.length - cuentasHoyCerradas;

    // ---- KPI 3: Ticket promedio (hoy vs histórico) ----
    // Ticket = total recaudado en una cuenta CERRADA. Para "hoy" usamos las
    // cuentas abiertas hoy que ya están cerradas; histórico = todas las cerradas.
    const idsCuentasHoyCerradas = new Set(
      cuentasHoy.filter((c) => c.cerrada).map((c) => c.id)
    );
    const ticketHoy =
      idsCuentasHoyCerradas.size > 0
        ? Math.round(
            sumar(
              pagos.filter((p) => idsCuentasHoyCerradas.has(p.cuenta_id)),
              (p) => p.monto
            ) / idsCuentasHoyCerradas.size
          )
        : 0;

    const idsCerradasHist = new Set(cuentas.filter((c) => c.cerrada).map((c) => c.id));
    const ticketHistorico =
      idsCerradasHist.size > 0
        ? Math.round(
            sumar(
              pagos.filter((p) => idsCerradasHist.has(p.cuenta_id)),
              (p) => p.monto
            ) / idsCerradasHist.size
          )
        : 0;

    // ---- KPI 4: Total por cobrar (cartera pendiente) ----
    const porCobrarTotal = sumar(cxc, (r) => r.saldo_pendiente);

    // ---- GRÁFICA 1: Ingresos de los últimos 7 días ----
    // Buckets por fecha calendario Bogotá; los pagos se suman a su día.
    const buckets = {};
    for (let i = 6; i >= 0; i--) {
      const inst = new Date(inicioHoy.getTime() - i * 24 * 3600 * 1000);
      const key = fechaBogota(inst);
      const dow = new Date(inst.getTime() + BOGOTA_OFFSET_MIN * 60000).getUTCDay();
      buckets[key] = { fecha: key, dia: DIAS_SEMANA[dow], total: 0 };
    }
    pagos.forEach((p) => {
      if (!p.created_at) return;
      const t = new Date(p.created_at).getTime();
      if (t < inicio7d.getTime() || t >= finHoy.getTime()) return;
      const key = fechaBogota(new Date(p.created_at));
      if (buckets[key]) buckets[key].total += Number(p.monto) || 0;
    });
    const serie7d = Object.values(buckets);
    const promedio7d = Math.round(sumar(serie7d, (b) => b.total) / 7);

    // ---- GRÁFICA 2: Mezcla de métodos de pago del mes ----
    const ordenMetodos = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];
    const acumMetodos = { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 };
    pagos.forEach((p) => {
      if (!p.created_at) return;
      if (new Date(p.created_at).getTime() < inicioMes.getTime()) return;
      if (acumMetodos[p.metodo] !== undefined) acumMetodos[p.metodo] += Number(p.monto) || 0;
    });
    const metodosMes = ordenMetodos
      .map((m) => ({ metodo: m, total: acumMetodos[m] }))
      .filter((x) => x.total > 0);

    // ---- GRÁFICA 3: Top productos del mes (por aporte $) ----
    const acumProd = {};
    consumosMes.forEach((c) => {
      const nombre = c.nombre_snapshot || 'Sin nombre';
      if (!acumProd[nombre]) acumProd[nombre] = { nombre, total: 0, unidades: 0 };
      acumProd[nombre].total += Number(c.total) || 0;
      acumProd[nombre].unidades += Number(c.cantidad) || 0;
    });
    const topProductosMes = Object.values(acumProd)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return NextResponse.json(
      {
        generadoEn: ahora.toISOString(),
        turnoActivo: turno
          ? {
              id: turno.id,
              cajera: turno.cajera,
              fecha_apertura: turno.fecha_apertura,
              base_caja: Number(turno.base_caja) || 0,
            }
          : null,
        kpis: {
          ventasHoy: {
            valor: ventasHoy,
            comparativo: ventasSemPasada,
            deltaPct,
            transacciones: pagosHoy.length,
          },
          cuentasHoy: {
            abiertas: cuentasHoyAbiertas,
            cerradas: cuentasHoyCerradas,
            total: cuentasHoy.length,
          },
          ticketPromedio: {
            hoy: ticketHoy,
            historico: ticketHistorico,
          },
          porCobrar: {
            total: porCobrarTotal,
            cantidad: cxc.length,
          },
        },
        graficas: {
          serie7d,
          promedio7d,
          metodosMes,
          topProductosMes,
        },
      },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
