'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { C, fmt, fmtCorto, card, seccionTitulo } from '../ui';

// Panel Histórico: comparativo mes a mes y, al entrar en un mes, el detalle
// día por día. Consume /api/admin/historico?mes=YYYY-MM.

function Variacion({ pct }) {
  if (pct === null || pct === undefined) {
    return <span style={{ fontSize: 11, color: C.textoTenue }}>—</span>;
  }
  const sube = pct >= 0;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: sube ? C.verde : C.rojo,
        background: sube ? 'rgba(39,174,96,0.10)' : 'rgba(192,57,43,0.10)',
        padding: '2px 7px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
      }}
    >
      {sube ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function Resumen({ label, valor, color, ayuda }) {
  return (
    <div style={{ ...card, padding: 14, borderTop: `3px solid ${color || C.petroleo}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textoTenue }}>{label}</div>
      <div className="display" style={{ fontSize: 21, fontWeight: 800, color: C.navy, marginTop: 4, lineHeight: 1.1 }}>
        {valor}
      </div>
      {ayuda && <div style={{ fontSize: 10, color: C.textoTenue, marginTop: 3, lineHeight: 1.35 }}>{ayuda}</div>}
    </div>
  );
}

// Tooltip compartido: muestra las cifras que importan sin ruido.
function TooltipDetalle({ active, payload, label, esDia }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.beigeBorde}`, borderRadius: 10, padding: 10, fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.10)' }}>
      <div style={{ fontWeight: 800, color: C.navy, marginBottom: 6 }}>
        {esDia ? `Día ${label}${d.diaSemana ? ` · ${d.diaSemana}` : ''}` : d.label}
      </div>
      <div style={{ color: C.verde, fontWeight: 700 }}>Cobrado: {fmt(d.cobrado)}</div>
      {d.fiado > 0 && <div style={{ color: C.rojo }}>Fiado: {fmt(d.fiado)}</div>}
      {d.egresos > 0 && <div style={{ color: C.morado }}>Egresos: −{fmt(d.egresos)}</div>}
      {d.cobroCartera > 0 && <div style={{ color: C.petroleo }}>Cobro cartera: {fmt(d.cobroCartera)}</div>}
      <div style={{ color: C.textoTenue, marginTop: 4 }}>{d.cuentas} cuenta{d.cuentas === 1 ? '' : 's'}</div>
    </div>
  );
}

export default function Historico() {
  const [datos, setDatos] = useState(null);
  const [mesSel, setMesSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async (mes) => {
    setCargando(true);
    setError(null);
    try {
      const url = '/api/admin/historico' + (mes ? `?mes=${mes}` : '');
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDatos(json);
      if (json.detalle) setMesSel(json.detalle.mes);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(null);
  }, [cargar]);

  if (cargando && !datos) {
    return <div style={{ ...card, textAlign: 'center', color: C.textoTenue }}>Cargando histórico…</div>;
  }
  if (error) {
    return (
      <div style={{ ...card, border: `2px solid ${C.rojo}`, color: C.rojo }}>
        <b>No se pudo cargar el histórico.</b>
        <div style={{ fontSize: 13, marginTop: 6 }}>{error}</div>
        <button onClick={() => cargar(mesSel)} style={{ marginTop: 12, background: C.rojo, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Reintentar
        </button>
      </div>
    );
  }

  const meses = (datos && datos.meses) || [];
  const detalle = datos && datos.detalle;

  if (meses.length === 0) {
    return <div style={{ ...card, textAlign: 'center', color: C.textoTenue }}>Todavía no hay meses con actividad.</div>;
  }

  // Para la gráfica de meses, del más viejo al más nuevo (se lee de izq. a der.).
  const mesesAsc = [...meses].reverse();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ---- COMPARATIVO HISTÓRICO ---- */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={seccionTitulo}>Comparativo mes a mes</h3>
          <span style={{ fontSize: 11, color: C.textoTenue }}>Cobrado = efectivo + transferencia + tarjeta. No incluye fiado.</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={mesesAsc} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textoTenue }} tickLine={false} axisLine={{ stroke: '#EEE' }} interval={0} angle={-18} textAnchor="end" height={54} />
            <YAxis tickFormatter={fmtCorto} tick={{ fontSize: 11, fill: C.textoTenue }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<TooltipDetalle esDia={false} />} cursor={{ fill: 'rgba(46,132,166,0.06)' }} />
            <Bar dataKey="cobrado" radius={[6, 6, 0, 0]}>
              {mesesAsc.map((m) => (
                <Cell key={m.mes} cursor="pointer" fill={m.mes === mesSel ? C.dorado : C.petroleo} onClick={() => { setMesSel(m.mes); cargar(m.mes); }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Tabla del comparativo: los números exactos, mes por mes. */}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 620 }}>
            <thead>
              <tr style={{ color: C.textoTenue, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>Mes</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>Cobrado</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>vs. mes ant.</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>Fiado</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>Egresos</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>Cuentas</th>
                <th style={{ padding: '8px 6px', fontWeight: 700 }}>Ticket</th>
                <th style={{ padding: '8px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => {
                const activo = m.mes === mesSel;
                return (
                  <tr key={m.mes} style={{ borderTop: `1px solid ${C.beigeBorde}`, background: activo ? 'rgba(242,183,73,0.12)' : 'transparent', textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '9px 6px', fontWeight: 700, color: C.navy }}>{m.label}</td>
                    <td style={{ padding: '9px 6px', fontWeight: 700, color: C.verde }}>{fmt(m.cobrado)}</td>
                    <td style={{ padding: '9px 6px' }}><Variacion pct={m.deltaPct} /></td>
                    <td style={{ padding: '9px 6px', color: m.fiado > 0 ? C.rojo : C.textoTenue }}>{fmt(m.fiado)}</td>
                    <td style={{ padding: '9px 6px', color: m.egresos > 0 ? C.morado : C.textoTenue }}>{m.egresos > 0 ? `−${fmt(m.egresos)}` : '—'}</td>
                    <td style={{ padding: '9px 6px', color: C.texto }}>{m.cuentas}</td>
                    <td style={{ padding: '9px 6px', color: C.texto }}>{fmt(m.ticket)}</td>
                    <td style={{ padding: '9px 6px' }}>
                      <button onClick={() => { setMesSel(m.mes); cargar(m.mes); }} style={{ background: activo ? C.petroleo : 'transparent', color: activo ? '#fff' : C.petroleo, border: `1.5px solid ${C.petroleo}`, padding: '5px 10px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {activo ? 'Viendo' : 'Ver días'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- DETALLE DEL MES ---- */}
      {detalle && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h2 className="display" style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: 0 }}>
              {detalle.label} · día por día
            </h2>
            {cargando && <span style={{ fontSize: 12, color: C.textoTenue }}>Actualizando…</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <Resumen label="COBRADO EN EL MES" valor={fmt(detalle.totales.cobrado)} color={C.verde} ayuda="Plata que entró de verdad" />
            <Resumen label="QUEDÓ FIADO" valor={fmt(detalle.totales.fiado)} color={C.rojo} ayuda="Vendido pero no cobrado" />
            <Resumen label="PROMEDIO POR DÍA" valor={fmt(detalle.promedioDiaConVenta)} color={C.petroleo} ayuda={`Sobre ${detalle.diasConVenta} día${detalle.diasConVenta === 1 ? '' : 's'} con venta`} />
            <Resumen label="MEJOR DÍA" valor={detalle.mejorDia ? `${detalle.mejorDia.dia} · ${fmt(detalle.mejorDia.cobrado)}` : '—'} color={C.dorado} />
            {detalle.totales.egresos > 0 && (
              <Resumen label="EGRESOS" valor={`−${fmt(detalle.totales.egresos)}`} color={C.morado} ayuda="Salió de la caja" />
            )}
          </div>

          <div style={card}>
            <h3 style={seccionTitulo}>Cobrado por día</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={detalle.dias} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.textoTenue }} tickLine={false} axisLine={{ stroke: '#EEE' }} interval={0} />
                <YAxis tickFormatter={fmtCorto} tick={{ fontSize: 11, fill: C.textoTenue }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<TooltipDetalle esDia />} cursor={{ fill: 'rgba(46,132,166,0.06)' }} />
                {detalle.promedioDiaConVenta > 0 && (
                  <ReferenceLine y={detalle.promedioDiaConVenta} stroke={C.dorado} strokeDasharray="4 4" />
                )}
                <Bar dataKey="cobrado" radius={[4, 4, 0, 0]}>
                  {detalle.dias.map((d) => (
                    <Cell key={d.fecha} fill={detalle.mejorDia && d.fecha === detalle.mejorDia.fecha ? C.dorado : C.petroleo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: C.textoTenue, marginTop: 4 }}>
              La línea dorada es el promedio de los días con venta. Los días en cero son días sin actividad.
            </div>
          </div>

          <div style={card}>
            <h3 style={seccionTitulo}>Detalle diario</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr style={{ color: C.textoTenue, textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>Día</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Efectivo</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Transfer.</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Tarjeta</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>COBRADO</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Fiado</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Egresos</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Cuentas</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.dias
                    .filter((d) => d.cuentas > 0 || d.vendido > 0 || d.egresos > 0)
                    .map((d) => (
                      <tr key={d.fecha} style={{ borderTop: `1px solid ${C.beigeBorde}`, textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: C.navy }}>
                          {d.dia} <span style={{ fontWeight: 400, color: C.textoTenue }}>{d.diaSemana}</span>
                        </td>
                        <td style={{ padding: '8px 6px' }}>{d.efectivo > 0 ? fmt(d.efectivo) : '—'}</td>
                        <td style={{ padding: '8px 6px' }}>{d.transferencia > 0 ? fmt(d.transferencia) : '—'}</td>
                        <td style={{ padding: '8px 6px' }}>{d.tarjeta > 0 ? fmt(d.tarjeta) : '—'}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 800, color: C.verde }}>{fmt(d.cobrado)}</td>
                        <td style={{ padding: '8px 6px', color: d.fiado > 0 ? C.rojo : C.textoTenue }}>{d.fiado > 0 ? fmt(d.fiado) : '—'}</td>
                        <td style={{ padding: '8px 6px', color: d.egresos > 0 ? C.morado : C.textoTenue }}>{d.egresos > 0 ? `−${fmt(d.egresos)}` : '—'}</td>
                        <td style={{ padding: '8px 6px' }}>{d.cuentas}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.navy}`, textAlign: 'right', fontWeight: 800, color: C.navy }}>
                    <td style={{ textAlign: 'left', padding: '10px 6px' }}>TOTAL</td>
                    <td style={{ padding: '10px 6px' }}>{fmt(detalle.totales.efectivo)}</td>
                    <td style={{ padding: '10px 6px' }}>{fmt(detalle.totales.transferencia)}</td>
                    <td style={{ padding: '10px 6px' }}>{fmt(detalle.totales.tarjeta)}</td>
                    <td style={{ padding: '10px 6px', color: C.verde }}>{fmt(detalle.totales.cobrado)}</td>
                    <td style={{ padding: '10px 6px', color: C.rojo }}>{fmt(detalle.totales.fiado)}</td>
                    <td style={{ padding: '10px 6px', color: C.morado }}>{detalle.totales.egresos > 0 ? `−${fmt(detalle.totales.egresos)}` : '—'}</td>
                    <td style={{ padding: '10px 6px' }}>{detalle.totales.cuentas}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
