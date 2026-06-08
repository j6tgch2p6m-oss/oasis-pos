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

    // Ola 1: lecturas independientes.
    //  - turno abierto (cabecera EN VIVO)
    //  - todos los pagos (para ventas + ticket promedio histórico)
    //  - todas las cuentas (para conteo de hoy + ticket histórico)
    //  - cartera pendiente (total por cobrar)
    const [turnoRes, pagosRes, cuentasRes, cxcRes] = await Promise.all([
      supabase
        .from('turnos')
        .select('*')
        .is('fecha_cierre', null)
        .order('fecha_apertura', { ascending: false })
        .limit(1),
      supabase.from('pagos').select('*').order('created_at', { ascending: false }),
      supabase.from('cuentas').select('*'),
      supabase.from('cuentas_por_cobrar').select('*').eq('cobrado', false),
    ]);
    if (turnoRes.error) throw turnoRes.error;
    if (pagosRes.error) throw pagosRes.error;
    if (cuentasRes.error) throw cuentasRes.error;
    if (cxcRes.error) throw cxcRes.error;

    const turno = turnoRes.data && turnoRes.data.length ? turnoRes.data[0] : null;
    const pagos = pagosRes.data || [];
    const cuentas = cuentasRes.data || [];
    const cxc = cxcRes.data || [];

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
      },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
