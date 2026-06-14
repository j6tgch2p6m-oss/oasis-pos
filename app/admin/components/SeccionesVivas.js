'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { C, fmt, card, seccionTitulo } from '../ui';

// Alertas accionables: descuadre del último cierre + deuda más antigua.
export function Alertas({ caja, deuda }) {
  const items = [];

  if (caja) {
    if (caja.diferencia == null) {
      items.push({
        color: C.textoTenue,
        bg: '#F3F4F6',
        titulo: 'Último cierre sin conteo de efectivo',
        detalle: `${caja.cajera} · esperado ${fmt(caja.esperado)}`,
      });
    } else if (caja.diferencia === 0) {
      items.push({
        color: C.verde,
        bg: 'rgba(39,174,96,0.10)',
        titulo: 'Caja cuadrada en el último cierre',
        detalle: `${caja.cajera} · ${fmt(caja.contado)}`,
      });
    } else {
      const sobra = caja.diferencia > 0;
      items.push({
        color: C.rojo,
        bg: 'rgba(192,57,43,0.10)',
        titulo: `Descuadre de caja: ${sobra ? 'sobran' : 'faltan'} ${fmt(Math.abs(caja.diferencia))}`,
        detalle: `${caja.cajera} · contado ${fmt(caja.contado)} vs esperado ${fmt(caja.esperado)}`,
      });
    }
  }

  if (deuda) {
    items.push({
      color: deuda.dias >= 7 ? C.rojo : C.dorado,
      bg: deuda.dias >= 7 ? 'rgba(192,57,43,0.10)' : 'rgba(242,183,73,0.14)',
      titulo: `Deuda más antigua: ${deuda.nombre} · ${fmt(deuda.saldo)}`,
      detalle: deuda.dias === 0 ? 'de hoy' : `hace ${deuda.dias} día(s)`,
    });
  }

  if (items.length === 0) {
    return (
      <div style={{ ...card, color: C.textoTenue, fontSize: 13 }}>Sin alertas por ahora.</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((a, i) => (
        <div
          key={i}
          style={{
            ...card,
            padding: 14,
            borderLeft: `4px solid ${a.color}`,
            background: a.bg,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{a.titulo}</div>
          <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 2 }}>{a.detalle}</div>
        </div>
      ))}
    </div>
  );
}

// Estado de canchas en vivo.
export function CanchasVivo({ canchas }) {
  return (
    <div style={card}>
      <h3 style={seccionTitulo}>Canchas en vivo</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {canchas.map((k) => (
          <div
            key={k.id}
            style={{
              flex: '1 1 140px',
              borderRadius: 12,
              padding: 14,
              border: `2px solid ${k.ocupada ? C.petroleo : C.beigeBorde}`,
              background: k.ocupada ? 'rgba(46,132,166,0.07)' : C.beige,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: C.navy }}>{k.nombre}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: k.ocupada ? '#fff' : C.textoTenue,
                  background: k.ocupada ? C.petroleo : 'transparent',
                  border: k.ocupada ? 'none' : `1px solid ${C.beigeBorde}`,
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                {k.ocupada ? 'OCUPADA' : 'LIBRE'}
              </span>
            </div>
            {k.ocupada && (
              <div style={{ marginTop: 8, fontSize: 12, color: C.textoTenue }}>
                <div>{k.jugadores && k.jugadores.length ? k.jugadores.join(', ') : 'Sin jugadores'}</div>
                <div style={{ marginTop: 2 }}>{k.minutos} min en juego</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Lista de cuentas por cobrar (cartera).
export function ListaPorCobrar({ datos }) {
  const total = (datos || []).reduce((s, d) => s + d.saldo, 0);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={seccionTitulo}>Cuentas por cobrar</h3>
        <span style={{ fontSize: 12, color: C.textoTenue }}>
          Total: <b style={{ color: C.rojo }}>{fmt(total)}</b>
        </span>
      </div>
      {!datos || datos.length === 0 ? (
        <div style={{ color: C.textoTenue, fontSize: 13, padding: '12px 0' }}>
          Sin cartera pendiente. 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {datos.map((d, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '9px 0',
                borderBottom: i < datos.length - 1 ? `1px solid ${C.beige}` : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{d.nombre}</div>
                <div style={{ fontSize: 11, color: d.dias >= 7 ? C.rojo : C.textoTenue }}>
                  {d.dias === 0 ? 'de hoy' : `hace ${d.dias} día(s)`}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.rojo }}>{fmt(d.saldo)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Top clientes del mes (por gasto).
export function TopClientes({ datos }) {
  const max = (datos || []).reduce((m, d) => Math.max(m, d.total), 0);
  return (
    <div style={card}>
      <h3 style={seccionTitulo}>Top clientes · este mes</h3>
      {!datos || datos.length === 0 ? (
        <div style={{ color: C.textoTenue, fontSize: 13, padding: '12px 0' }}>
          Aún sin clientes con nombre este mes.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          {datos.map((p, i) => (
            <div key={i}>
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
                  {fmt(p.total)} · {p.pagos} pago(s)
                </span>
              </div>
              <div style={{ background: C.beige, borderRadius: 8, height: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${max > 0 ? (p.total / max) * 100 : 0}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.turquesa}, ${C.dorado})`,
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

// Proyección del mes.
export function ProyeccionMes({ datos }) {
  const avance = datos.diasMes > 0 ? Math.round((datos.diaDelMes / datos.diasMes) * 100) : 0;
  return (
    <div style={card}>
      <h3 style={seccionTitulo}>Proyección del mes</h3>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: C.textoTenue }}>Acumulado</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>
            {fmt(datos.acumulado)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.textoTenue }}>Proyectado a fin de mes</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: C.petroleo }}>
            {fmt(datos.proyectado)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ background: C.beige, borderRadius: 8, height: 10, overflow: 'hidden' }}>
          <div
            style={{
              width: `${avance}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${C.petroleo}, ${C.turquesa})`,
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: C.textoTenue, marginTop: 6 }}>
          Día {datos.diaDelMes} de {datos.diasMes} ({avance}% del mes)
        </div>
      </div>
    </div>
  );
}

// Ocupación de canchas por hora (histórico). Solo horas con actividad u 8-23.
export function OcupacionHora({ datos }) {
  const conDatos = (datos || []).filter((d) => d.cuentas > 0);
  const visibles =
    conDatos.length > 0
      ? datos.filter((d) => d.hora >= Math.max(6, conDatos[0].hora - 1) && d.hora <= 23)
      : [];
  const fmtHora = (h) => `${String(h).padStart(2, '0')}h`;
  return (
    <div style={{ ...card, gridColumn: '1 / -1' }}>
      <h3 style={seccionTitulo}>Ocupación de canchas por hora</h3>
      {visibles.length === 0 ? (
        <div style={{ color: C.textoTenue, fontSize: 13, padding: '12px 0' }}>
          Aún sin aperturas de cancha registradas.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={visibles} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
            <XAxis
              dataKey="hora"
              tickFormatter={fmtHora}
              tick={{ fontSize: 11, fill: C.textoTenue }}
              axisLine={{ stroke: '#E5E5E5' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: C.textoTenue }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              formatter={(v) => [v, 'Aperturas']}
              labelFormatter={fmtHora}
              contentStyle={{ borderRadius: 10, border: `1px solid ${C.beigeBorde}`, fontSize: 13 }}
            />
            <Bar dataKey="cuentas" fill={C.petroleo} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Abonos de reserva y descuentos del mes.
export function ReservasDescuentos({ reservas, descuentos }) {
  const r = reservas || { total: 0, cantidad: 0 };
  const d = descuentos || { total: 0, cantidad: 0, lista: [] };
  return (
    <div style={{ ...card, gridColumn: '1 / -1' }}>
      <h3 style={seccionTitulo}>Reservas y descuentos · este mes</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 180px', borderRadius: 12, padding: 14, background: 'rgba(46,132,166,0.07)', border: `1px solid ${C.beigeBorde}` }}>
          <div style={{ fontSize: 12, color: C.textoTenue, fontWeight: 700 }}>ABONOS DE RESERVA</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: C.petroleo }}>{fmt(r.total)}</div>
          <div style={{ fontSize: 12, color: C.textoTenue }}>{r.cantidad} reserva(s)</div>
        </div>
        <div style={{ flex: '1 1 180px', borderRadius: 12, padding: 14, background: 'rgba(142,68,173,0.07)', border: `1px solid ${C.beigeBorde}` }}>
          <div style={{ fontSize: 12, color: C.textoTenue, fontWeight: 700 }}>DESCUENTOS</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: C.morado }}>{fmt(d.total)}</div>
          <div style={{ fontSize: 12, color: C.textoTenue }}>{d.cantidad} descuento(s)</div>
        </div>
      </div>
      {d.lista && d.lista.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {d.lista.map((x, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < d.lista.length - 1 ? `1px solid ${C.beige}` : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
                  {x.motivo}{x.nombre ? ` · ${x.nombre}` : ''}
                </div>
                <div style={{ fontSize: 11, color: C.textoTenue }}>
                  {x.cajera ? `${x.cajera} · ` : ''}
                  {new Date(x.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short' })}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.morado }}>−{fmt(x.monto)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: C.textoTenue, fontSize: 13 }}>Sin descuentos este mes.</div>
      )}
    </div>
  );
}
