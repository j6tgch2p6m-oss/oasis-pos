'use client';

import { useCallback, useEffect, useState } from 'react';
import { C, fmt, card, seccionTitulo } from '../ui';

// Pestaña Egresos: la plata que SALIÓ de la caja este mes. Se registra desde el
// POS (botón "Registrar egreso"); aquí es solo lectura, para revisar.
export default function Egresos() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDatos(json.egresosMes || { total: 0, cantidad: 0, lista: [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <div style={{ ...card, textAlign: 'center', color: C.textoTenue }}>Cargando egresos…</div>;
  if (error) {
    return (
      <div style={{ ...card, border: `2px solid ${C.rojo}`, color: C.rojo }}>
        <b>No se pudieron cargar los egresos.</b>
        <div style={{ fontSize: 13, marginTop: 6 }}>{error}</div>
      </div>
    );
  }

  const lista = (datos && datos.lista) || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, borderTop: `3px solid ${C.morado}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textoTenue }}>SALIÓ DE LA CAJA ESTE MES</div>
        <div className="display" style={{ fontSize: 28, fontWeight: 800, color: C.morado, marginTop: 4 }}>
          {fmt(datos ? datos.total : 0)}
        </div>
        <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 4 }}>
          {datos ? datos.cantidad : 0} egreso{datos && datos.cantidad === 1 ? '' : 's'} registrado{datos && datos.cantidad === 1 ? '' : 's'}
        </div>
      </div>

      <div style={card}>
        <h3 style={seccionTitulo}>Últimos egresos</h3>
        {lista.length === 0 ? (
          <div style={{ color: C.textoTenue, fontSize: 13, lineHeight: 1.5 }}>
            Todavía no hay egresos registrados este mes. Se registran desde el POS,
            con el botón <b>💸 Registrar egreso</b> de la pantalla de inicio, cada
            vez que sale plata del cajón (un proveedor, un domicilio, una compra).
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
              <thead>
                <tr style={{ color: C.textoTenue, textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontWeight: 700 }}>Fecha</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700 }}>Motivo</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700 }}>Cajera</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.beigeBorde}` }}>
                    <td style={{ padding: '9px 6px', color: C.textoTenue, whiteSpace: 'nowrap' }}>
                      {new Date(e.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '9px 6px', fontWeight: 700, color: C.navy }}>{e.motivo}</td>
                    <td style={{ padding: '9px 6px', color: C.textoTenue }}>{e.cajera || '—'}</td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: C.morado }}>−{fmt(e.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
