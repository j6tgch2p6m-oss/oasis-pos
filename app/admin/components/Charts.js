'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { C, METODO_COLOR, fmt, fmtCorto, card, seccionTitulo } from '../ui';

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function CajaVacia({ texto }) {
  return (
    <div
      style={{
        height: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.textoTenue,
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  );
}

// Gráfica de línea: ingresos de los últimos 7 días + promedio del periodo.
export function LineaIngresos({ serie, promedio }) {
  const hayDatos = serie && serie.some((d) => d.total > 0);
  return (
    <div style={{ ...card, gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={seccionTitulo}>Ingresos · últimos 7 días</h3>
        <span style={{ fontSize: 12, color: C.textoTenue }}>
          Promedio: <b style={{ color: C.petroleo }}>{fmt(promedio)}</b>
        </span>
      </div>
      {!hayDatos ? (
        <CajaVacia texto="Sin ingresos en los últimos 7 días." />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={serie} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 12, fill: C.textoTenue }}
              axisLine={{ stroke: '#E5E5E5' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtCorto}
              tick={{ fontSize: 11, fill: C.textoTenue }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              formatter={(v) => [fmt(v), 'Ingresos']}
              labelFormatter={(l, p) => (p && p[0] ? p[0].payload.fecha : l)}
              contentStyle={{ borderRadius: 10, border: `1px solid ${C.beigeBorde}`, fontSize: 13 }}
            />
            <ReferenceLine y={promedio} stroke={C.dorado} strokeDasharray="5 4" />
            <Line
              type="monotone"
              dataKey="total"
              stroke={C.petroleo}
              strokeWidth={3}
              dot={{ r: 3, fill: C.petroleo }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Gráfica de dona: mezcla de métodos de pago del mes.
export function DonaMetodos({ datos }) {
  const total = (datos || []).reduce((s, d) => s + d.total, 0);
  return (
    <div style={card}>
      <h3 style={seccionTitulo}>Métodos de pago · este mes</h3>
      {total <= 0 ? (
        <CajaVacia texto="Sin pagos este mes." />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={datos}
              dataKey="total"
              nameKey="metodo"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {datos.map((d) => (
                <Cell key={d.metodo} fill={METODO_COLOR[d.metodo] || C.petroleo} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [fmt(v), ETIQUETA_METODO[n] || n]}
              contentStyle={{ borderRadius: 10, border: `1px solid ${C.beigeBorde}`, fontSize: 13 }}
            />
            <Legend
              formatter={(value) => (
                <span style={{ fontSize: 12, color: C.navy }}>{ETIQUETA_METODO[value] || value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Lista-barra: top productos del mes por aporte ($).
export function TopProductos({ datos }) {
  const max = (datos || []).reduce((m, d) => Math.max(m, d.total), 0);
  return (
    <div style={card}>
      <h3 style={seccionTitulo}>Top productos · este mes</h3>
      {!datos || datos.length === 0 ? (
        <CajaVacia texto="Sin consumos este mes." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          {datos.map((p, i) => (
            <div key={p.nombre}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700, color: C.navy }}>
                  {i + 1}. {p.nombre}
                </span>
                <span style={{ color: C.textoTenue }}>
                  {fmt(p.total)} · {p.unidades}u
                </span>
              </div>
              <div style={{ background: C.beige, borderRadius: 8, height: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${max > 0 ? (p.total / max) * 100 : 0}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.petroleo}, ${C.turquesa})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
