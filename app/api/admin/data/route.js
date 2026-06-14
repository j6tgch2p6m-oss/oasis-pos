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

// Catálogo de canchas (igual que el POS: app/components/POSApp.js).
const CANCHAS = [
  { id: 'C1', nombre: 'Cancha 1' },
  { id: 'C2', nombre: 'Cancha 2' },
];

function sumar(arr, getter) {
  return arr.reduce((s, x) => s + (Number(getter(x)) || 0), 0);
}

// Normaliza un nombre para agrupar clientes ("  santiago  " == "Santiago").
function normalizaNombre(s) {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function tituloNombre(s) {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
function diasDesde(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
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
    //  - último turno cerrado (alerta de descuadre de caja)
    //  - jugadores (nombres para canchas en vivo y top clientes)
    //  - descuentos del mes (reflejo en admin)
    const [turnoRes, pagosRes, cuentasRes, cxcRes, consumosRes, ultCierreRes, jugadoresRes, descuentosRes] =
      await Promise.all([
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
        supabase
          .from('turnos')
          .select('*')
          .not('fecha_cierre', 'is', null)
          .order('fecha_cierre', { ascending: false })
          .limit(1),
        supabase.from('jugadores').select('*'),
        supabase
          .from('descuentos')
          .select('*')
          .gte('created_at', inicioMes.toISOString())
          .order('created_at', { ascending: false }),
      ]);
    if (turnoRes.error) throw turnoRes.error;
    if (pagosRes.error) throw pagosRes.error;
    if (cuentasRes.error) throw cuentasRes.error;
    if (cxcRes.error) throw cxcRes.error;
    if (consumosRes.error) throw consumosRes.error;
    if (ultCierreRes.error) throw ultCierreRes.error;
    if (jugadoresRes.error) throw jugadoresRes.error;
    if (descuentosRes.error) throw descuentosRes.error;

    const turno = turnoRes.data && turnoRes.data.length ? turnoRes.data[0] : null;
    const pagos = pagosRes.data || [];
    const cuentas = cuentasRes.data || [];
    const cxc = cxcRes.data || [];
    const consumosMes = consumosRes.data || [];
    const ultCierre = ultCierreRes.data && ultCierreRes.data.length ? ultCierreRes.data[0] : null;
    const jugadores = jugadoresRes.data || [];
    const descuentosMesData = descuentosRes.data || [];

    // Ola 2: cobros de cartera hechos DURANTE el último turno cerrado
    // (entran a la caja en efectivo y cuentan para el descuadre).
    let cobrosUltCierre = [];
    if (ultCierre) {
      const cobrosRes = await supabase
        .from('cuentas_por_cobrar')
        .select('*')
        .eq('turno_cobro_id', ultCierre.id)
        .eq('cobrado', true);
      if (cobrosRes.error) throw cobrosRes.error;
      cobrosUltCierre = cobrosRes.data || [];
    }

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

    // ---- ALERTA A: descuadre de caja del último cierre ----
    let alertaCaja = null;
    if (ultCierre) {
      const idsLC = new Set(cuentas.filter((c) => c.turno_id === ultCierre.id).map((c) => c.id));
      const efePagos = sumar(
        pagos.filter((p) => idsLC.has(p.cuenta_id) && p.metodo === 'efectivo'),
        (p) => p.monto
      );
      const efeCobros = sumar(
        cobrosUltCierre.filter((r) => r.metodo_cobro === 'efectivo'),
        (r) => r.monto
      );
      const esperado = (Number(ultCierre.base_caja) || 0) + efePagos + efeCobros;
      const contado =
        ultCierre.efectivo_contado_cierre == null
          ? null
          : Number(ultCierre.efectivo_contado_cierre);
      alertaCaja = {
        cajera: ultCierre.cajera,
        fechaCierre: ultCierre.fecha_cierre,
        esperado,
        contado,
        diferencia: contado == null ? null : contado - esperado,
      };
    }

    // ---- ALERTA B: deuda más antigua sin cobrar ----
    const cxcOrden = [...cxc].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const deudaMasAntigua = cxcOrden[0]
      ? {
          nombre: cxcOrden[0].jugador_nombre,
          saldo: Number(cxcOrden[0].saldo_pendiente) || 0,
          dias: diasDesde(cxcOrden[0].created_at),
        }
      : null;

    // ---- CANCHAS EN VIVO ----
    let canchasVivo = CANCHAS.map((k) => ({ ...k, ocupada: false }));
    if (turno) {
      const abiertasCancha = cuentas.filter(
        (c) => c.turno_id === turno.id && !c.cerrada && c.tipo === 'cancha'
      );
      canchasVivo = CANCHAS.map((k) => {
        const cu = abiertasCancha.find((c) => c.cancha_id === k.id);
        if (!cu) return { ...k, ocupada: false };
        const jug = jugadores
          .filter((j) => j.cuenta_id === cu.id)
          .sort((a, b) => (a.orden || 0) - (b.orden || 0))
          .map((j) => j.nombre);
        return {
          ...k,
          ocupada: true,
          jugadores: jug,
          minutos: Math.max(0, Math.round((Date.now() - new Date(cu.fecha_apertura).getTime()) / 60000)),
        };
      });
    }

    // ---- LISTA POR COBRAR (cartera, más antigua primero) ----
    const listaPorCobrar = cxcOrden.map((r) => ({
      nombre: r.jugador_nombre,
      saldo: Number(r.saldo_pendiente) || 0,
      dias: diasDesde(r.created_at),
    }));

    // ---- TOP CLIENTES DEL MES (por gasto, nombre normalizado) ----
    const pagosMes = pagos.filter(
      (p) => p.created_at && new Date(p.created_at).getTime() >= inicioMes.getTime()
    );
    const nombrePorId = {};
    jugadores.forEach((j) => {
      nombrePorId[j.id] = j.nombre;
    });
    const acumCli = {};
    pagosMes.forEach((p) => {
      const nombreRaw = p.jugador_id ? nombrePorId[p.jugador_id] : null;
      if (!nombreRaw) return; // pago sin jugador asignado
      const key = normalizaNombre(nombreRaw);
      if (!key) return;
      if (!acumCli[key]) acumCli[key] = { nombre: tituloNombre(key), total: 0, pagos: 0 };
      acumCli[key].total += Number(p.monto) || 0;
      acumCli[key].pagos += 1;
    });
    const topClientesMes = Object.values(acumCli)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ---- PROYECCIÓN DEL MES ----
    const ventasMes = sumar(pagosMes, (p) => p.monto);
    const localNow = new Date(ahora.getTime() + BOGOTA_OFFSET_MIN * 60000);
    const diaDelMes = localNow.getUTCDate();
    const diasMes = new Date(localNow.getUTCFullYear(), localNow.getUTCMonth() + 1, 0).getDate();
    const proyeccionMes = {
      acumulado: ventasMes,
      proyectado: diaDelMes > 0 ? Math.round((ventasMes / diaDelMes) * diasMes) : 0,
      diaDelMes,
      diasMes,
    };

    // ---- OCUPACIÓN POR HORA (cuentas de cancha, histórico) ----
    const ocupacionHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, cuentas: 0 }));
    cuentas
      .filter((c) => c.tipo === 'cancha' && c.fecha_apertura)
      .forEach((c) => {
        const h = new Date(
          new Date(c.fecha_apertura).getTime() + BOGOTA_OFFSET_MIN * 60000
        ).getUTCHours();
        ocupacionHora[h].cuentas += 1;
      });

    // ---- ABONOS DE RESERVA DEL MES ----
    const reservasMesPagos = pagosMes.filter((p) => p.es_reserva);
    const reservasMes = {
      total: sumar(reservasMesPagos, (p) => p.monto),
      cantidad: reservasMesPagos.length,
    };

    // ---- DESCUENTOS DEL MES ----
    const descuentosMes = {
      total: sumar(descuentosMesData, (d) => d.monto),
      cantidad: descuentosMesData.length,
      lista: descuentosMesData.slice(0, 10).map((d) => ({
        motivo: d.motivo,
        monto: Number(d.monto) || 0,
        nombre: d.jugador_id ? nombrePorId[d.jugador_id] || null : null,
        cajera: d.cajera || null,
        fecha: d.created_at,
      })),
    };

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
        alertas: {
          caja: alertaCaja,
          deudaMasAntigua,
        },
        vivo: {
          canchas: canchasVivo,
        },
        listas: {
          porCobrar: listaPorCobrar,
          topClientesMes,
        },
        proyeccionMes,
        ocupacionHora,
        reservasMes,
        descuentosMes,
      },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
