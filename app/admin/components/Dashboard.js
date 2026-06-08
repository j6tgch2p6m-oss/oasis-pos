'use client';

import { useEffect, useState, useCallback } from 'react';
import { C, fmt, card } from '../ui';
import { LineaIngresos, DonaMetodos, TopProductos } from './Charts';
import {
  Alertas,
  CanchasVivo,
  ListaPorCobrar,
  TopClientes,
  ProyeccionMes,
  OcupacionHora,
} from './SeccionesVivas';

// Dashboard: consume /api/admin/data (solo lectura) y muestra cabecera EN VIVO,
// alertas, 4 KPIs, 3 gráficas y secciones vivas, todo con datos reales.
function Delta({ pct }) {
  if (pct === null || pct === undefined) {
    return <span style={{ fontSize: 12, color: C.textoTenue }}>sin dato semana pasada</span>;
  }
  const sube = pct >= 0;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: sube ? C.verde : C.rojo,
        background: sube ? 'rgba(39,174,96,0.10)' : 'rgba(192,57,43,0.10)',
        padding: '2px 8px',
        borderRadius: 20,
        alignSelf: 'flex-start',
      }}
    >
      {sube ? '▲' : '▼'} {Math.abs(pct)}% vs. sem. pasada
    </span>
  );
}

function KpiCard({ titulo, valor, pie, acento, children }) {
  return (
    <div
      style={{
        ...card,
        borderTop: `3px solid ${acento || C.petroleo}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textoTenue, letterSpacing: '0.02em' }}>
        {titulo}
      </div>
      <div
        className="display"
        style={{ fontSize: 26, fontWeight: 800, color: C.navy, lineHeight: 1.1 }}
      >
        {valor}
      </div>
      {children}
      {pie && <div style={{ fontSize: 12, color: C.textoTenue }}>{pie}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo cargar.');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando && !data) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 40, color: C.textoTenue }}>
        Cargando datos…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          ...card,
          textAlign: 'center',
          padding: 32,
          color: '#791F1F',
          background: '#FCEBEB',
          border: `1px solid ${C.rojo}`,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>No se pudieron cargar los datos</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button
          onClick={cargar}
          style={{
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700,
            background: C.rojo,
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const k = data.kpis;
  const turno = data.turnoActivo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabecera EN VIVO */}
      <div
        style={{
          ...card,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: turno ? C.verde : C.textoTenue,
              boxShadow: turno ? '0 0 0 4px rgba(39,174,96,0.18)' : 'none',
              display: 'inline-block',
            }}
          />
          {turno ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>
                Turno abierto · {turno.cajera}
              </div>
              <div style={{ fontSize: 12, color: C.textoTenue }}>
                Desde{' '}
                {new Date(turno.fecha_apertura).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textoTenue }}>
              Sin turno abierto
            </div>
          )}
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          style={{
            border: `1px solid ${C.beigeBorde}`,
            background: '#fff',
            cursor: cargando ? 'default' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700,
            fontSize: 12,
            color: C.navy,
            padding: '8px 14px',
            borderRadius: 8,
          }}
        >
          {cargando ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>

      {/* Alertas accionables */}
      <Alertas caja={data.alertas.caja} deuda={data.alertas.deudaMasAntigua} />

      {/* 4 KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <KpiCard
          titulo="VENTAS DE HOY"
          valor={fmt(k.ventasHoy.valor)}
          acento={C.petroleo}
          pie={`${k.ventasHoy.transacciones} pago(s) hoy`}
        >
          <Delta pct={k.ventasHoy.deltaPct} />
        </KpiCard>

        <KpiCard
          titulo="CUENTAS DE HOY"
          valor={`${k.cuentasHoy.abiertas} / ${k.cuentasHoy.cerradas}`}
          acento={C.turquesa}
          pie={`abiertas / cerradas · ${k.cuentasHoy.total} en total`}
        />

        <KpiCard
          titulo="TICKET PROMEDIO HOY"
          valor={fmt(k.ticketPromedio.hoy)}
          acento={C.dorado}
          pie={`histórico: ${fmt(k.ticketPromedio.historico)}`}
        />

        <KpiCard
          titulo="TOTAL POR COBRAR"
          valor={fmt(k.porCobrar.total)}
          acento={C.rojo}
          pie={`${k.porCobrar.cantidad} deuda(s) pendiente(s)`}
        />
      </div>

      {/* Gráficas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
        }}
      >
        <LineaIngresos serie={data.graficas.serie7d} promedio={data.graficas.promedio7d} />
        <DonaMetodos datos={data.graficas.metodosMes} />
        <TopProductos datos={data.graficas.topProductosMes} />
      </div>

      {/* Secciones vivas */}
      <CanchasVivo canchas={data.vivo.canchas} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
        }}
      >
        <ListaPorCobrar datos={data.listas.porCobrar} />
        <TopClientes datos={data.listas.topClientesMes} />
        <ProyeccionMes datos={data.proyeccionMes} />
        <OcupacionHora datos={data.ocupacionHora} />
      </div>

      <div style={{ fontSize: 11, color: C.textoTenue, textAlign: 'right' }}>
        Datos al{' '}
        {new Date(data.generadoEn).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}{' '}
        (hora Bogotá)
      </div>
    </div>
  );
}
