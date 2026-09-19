'use client';

import { C, fmt, card, seccionTitulo } from '../ui';

// Bloque del módulo /torneo dentro del panel admin.
// La plata del torneo ya viene sumada en las tarjetas de arriba; esta sección
// existe para ver cuánto de ese total salió del evento y quién despachó qué.
// Si nunca se ha registrado una comanda, no se pinta nada.

function Dato({ etiqueta, valor, pie, color }) {
  return (
    <div
      style={{
        flex: '1 1 150px',
        background: C.beige,
        borderRadius: 12,
        padding: '10px 12px',
        borderLeft: `4px solid ${color || C.petroleo}`,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textoTenue, letterSpacing: '0.02em' }}>
        {etiqueta}
      </div>
      <div
        className="display"
        style={{ fontSize: 20, fontWeight: 800, color: C.navy, lineHeight: 1.2 }}
      >
        {valor}
      </div>
      {pie && <div style={{ fontSize: 11, color: C.textoTenue }}>{pie}</div>}
    </div>
  );
}

const th = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: C.textoTenue,
  letterSpacing: '0.02em',
  padding: '8px 10px',
  borderBottom: `1px solid ${C.beigeBorde}`,
  whiteSpace: 'nowrap',
};
const td = {
  fontSize: 13,
  color: C.navy,
  padding: '8px 10px',
  borderBottom: `1px solid ${C.beige}`,
  whiteSpace: 'nowrap',
};
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function Torneo({ datos }) {
  if (!datos || !datos.activo) return null;

  const t = datos;
  const totales = (t.porMesero || []).reduce(
    (a, m) => ({
      comandas: a.comandas + m.comandas,
      despachado: a.despachado + m.despachado,
      efectivo: a.efectivo + m.efectivo,
      transferencia: a.transferencia + m.transferencia,
      aCuentas: a.aCuentas + m.aCuentas,
      pendiente: a.pendiente + m.pendiente,
    }),
    { comandas: 0, despachado: 0, efectivo: 0, transferencia: 0, aCuentas: 0, pendiente: 0 }
  );

  return (
    <div style={{ ...card, borderTop: `3px solid ${C.dorado}` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={seccionTitulo}>🏆 Torneo</h3>
        <span style={{ fontSize: 12, color: C.textoTenue }}>
          {t.comandas} comanda(s) · ya incluido en las cifras de arriba
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Dato etiqueta="DESPACHADO" valor={fmt(t.despachado)} pie="todo lo que salió de bodega" />
        <Dato
          etiqueta="RECAUDADO"
          valor={fmt(t.recaudado)}
          pie={`efectivo ${fmt(t.efectivo)} · transf. ${fmt(t.transferencia)}`}
          color={C.verde}
        />
        <Dato
          etiqueta="POR COBRAR A MESEROS"
          valor={fmt(t.pendienteMeseros)}
          pie={`${t.comandasPendientes} comanda(s)`}
          color={t.pendienteMeseros >= 1 ? C.rojo : C.textoTenue}
        />
        <Dato
          etiqueta="SALDO DE CLIENTES"
          valor={fmt(t.saldoClientes)}
          pie={`${t.cuentasAbiertas} cuenta(s) abierta(s)`}
          color={t.saldoClientes >= 1 ? C.dorado : C.textoTenue}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Mesero</th>
              <th style={{ ...th, textAlign: 'right' }}>Comandas</th>
              <th style={{ ...th, textAlign: 'right' }}>Despachado</th>
              <th style={{ ...th, textAlign: 'right' }}>Efectivo</th>
              <th style={{ ...th, textAlign: 'right' }}>Transf.</th>
              <th style={{ ...th, textAlign: 'right' }}>A cuentas</th>
              <th style={{ ...th, textAlign: 'right' }}>Por cobrar</th>
            </tr>
          </thead>
          <tbody>
            {(t.porMesero || []).map((m) => (
              <tr key={m.mesero}>
                <td style={{ ...td, fontWeight: 700 }}>{m.mesero}</td>
                <td style={tdNum}>{m.comandas}</td>
                <td style={tdNum}>{fmt(m.despachado)}</td>
                <td style={tdNum}>{fmt(m.efectivo)}</td>
                <td style={tdNum}>{fmt(m.transferencia)}</td>
                <td style={tdNum}>{fmt(m.aCuentas)}</td>
                <td
                  style={{
                    ...tdNum,
                    color: m.pendiente >= 1 ? C.rojo : C.navy,
                    fontWeight: m.pendiente >= 1 ? 800 : 400,
                  }}
                >
                  {fmt(m.pendiente)}
                </td>
              </tr>
            ))}
            <tr style={{ background: C.beige }}>
              <td style={{ ...td, fontWeight: 800 }}>Total</td>
              <td style={{ ...tdNum, fontWeight: 800 }}>{totales.comandas}</td>
              <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totales.despachado)}</td>
              <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totales.efectivo)}</td>
              <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totales.transferencia)}</td>
              <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totales.aCuentas)}</td>
              <td style={{ ...tdNum, fontWeight: 800, color: C.rojo }}>{fmt(totales.pendiente)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {t.abonos > 0 && (
        <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 10 }}>
          Los abonos de clientes ({fmt(t.abonos)}) no aparecen en la tabla porque no son de un
          mesero en particular, pero sí están dentro de lo recaudado.
        </div>
      )}

      <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 10 }}>
        El torneo no pertenece a ningún turno, así que esta plata no entra en el arqueo de caja
        del cierre. Se maneja y se cuenta aparte.
      </div>
    </div>
  );
}
