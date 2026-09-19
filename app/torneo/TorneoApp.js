'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// POS TORNEO · pantalla única de caja
// Flujo: tocar mesero → tocar productos → tocar cómo paga. Sale el número de
// comanda en grande para anotarlo y pasarlo a bodega.
// ============================================================================

const PIN_KEY = 'torneo_pin';
const MESERO_KEY = 'torneo_mesero';
const ORDEN_CATEGORIAS = ['Bebidas', 'Cervezas', 'Snacks', 'Accesorios'];
const REFRESCO_MS = 10000;

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const num = (n) => '#' + String(n ?? '').padStart(4, '0');
const hora = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};
const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

async function api(pin, method, body) {
  const res = await fetch('/api/torneo', {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-torneo-pin': pin || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Error ' + res.status);
    e.status = res.status;
    throw e;
  }
  return data;
}

function resumenItems(items) {
  return (items || []).map((it) => `${it.cantidad} ${it.nombre_snapshot}`).join(', ');
}


// ============================================================================
export default function TorneoApp() {
  const [pin, setPin] = useState(undefined); // undefined = aún no leído
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [tab, setTab] = useState('caja');

  const [mesero, setMeseroState] = useState('');
  const [categoria, setCategoria] = useState('');
  const [comanda, setComanda] = useState({}); // producto_id -> cantidad
  const [modoCuenta, setModoCuenta] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState(null); // { nombre, cargarComanda }
  const [confirmacion, setConfirmacion] = useState(null); // venta recién creada
  const [cuentaAbierta, setCuentaAbierta] = useState(null); // id de cuenta en detalle
  const [reiniciar, setReiniciar] = useState(null); // texto de confirmación

  const timerRef = useRef(null);

  const setMesero = (m) => {
    setMeseroState(m);
    ls.set(MESERO_KEY, m);
  };

  // ---- carga inicial: PIN y mesero recordados ----
  useEffect(() => {
    setPin(ls.get(PIN_KEY) || '');
    setMeseroState(ls.get(MESERO_KEY) || '');
  }, []);

  const cargar = useCallback(async (p) => {
    const usar = p ?? pin;
    if (!usar) return;
    try {
      const d = await api(usar, 'GET');
      setDatos(d);
      setError('');
      return d;
    } catch (e) {
      if (e.status === 401) {
        ls.del(PIN_KEY);
        setPin('');
        setPinError('PIN incorrecto');
      } else {
        setError(e.message);
      }
    }
  }, [pin]);

  // ---- refresco periódico ----
  useEffect(() => {
    if (!pin) return;
    cargar();
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
    }, REFRESCO_MS);
    return () => clearInterval(timerRef.current);
  }, [pin, cargar]);

  // ---- derivados ----
  const productos = datos?.productos || [];
  const categorias = useMemo(() => {
    const set = Array.from(new Set(productos.map((p) => p.categoria)));
    return set.sort((a, b) => {
      const ia = ORDEN_CATEGORIAS.indexOf(a);
      const ib = ORDEN_CATEGORIAS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }, [productos]);
  const catActual = categoria && categorias.includes(categoria) ? categoria : categorias[0] || '';
  const productosVisibles = productos.filter((p) => p.categoria === catActual);
  const prodPorId = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);

  const meseros = datos?.meseros || [];
  const meseroActual = mesero && meseros.includes(mesero) ? mesero : '';

  const ventas = datos?.ventas || [];
  const cuentas = datos?.cuentas || [];
  const pagos = datos?.pagos || [];
  const cuentasAbiertas = cuentas.filter((c) => c.abierta);

  const lineas = Object.entries(comanda)
    .map(([id, cant]) => ({ prod: prodPorId[id], cant }))
    .filter((l) => l.prod && l.cant > 0);
  const totalComanda = lineas.reduce((s, l) => s + Number(l.prod.precio) * l.cant, 0);
  const comandaVacia = lineas.length === 0;

  const resumen = useMemo(() => {
    const filas = meseros.map((m) => {
      const mias = ventas.filter((v) => v.mesero === m);
      const suma = (f) => mias.filter(f).reduce((s, v) => s + Number(v.total), 0);
      return {
        mesero: m,
        comandas: mias.length,
        despachado: suma(() => true),
        efectivo: suma((v) => v.estado === 'pagada' && v.metodo === 'efectivo'),
        transferencia: suma((v) => v.estado === 'pagada' && v.metodo === 'transferencia'),
        cuenta: suma((v) => v.estado === 'cuenta'),
        pendiente: suma((v) => v.estado === 'pendiente'),
      };
    });
    const total = filas.reduce(
      (t, f) => ({
        comandas: t.comandas + f.comandas,
        despachado: t.despachado + f.despachado,
        efectivo: t.efectivo + f.efectivo,
        transferencia: t.transferencia + f.transferencia,
        cuenta: t.cuenta + f.cuenta,
        pendiente: t.pendiente + f.pendiente,
      }),
      { comandas: 0, despachado: 0, efectivo: 0, transferencia: 0, cuenta: 0, pendiente: 0 }
    );
    const abonosEfe = pagos.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + Number(p.monto), 0);
    const abonosTra = pagos.filter((p) => p.metodo === 'transferencia').reduce((s, p) => s + Number(p.monto), 0);
    const saldoClientes = cuentas.reduce((s, c) => s + Math.max(0, Number(c.saldo)), 0);
    return { filas, total, abonosEfe, abonosTra, saldoClientes };
  }, [meseros, ventas, pagos, cuentas]);

  const pendientes = ventas.filter((v) => v.estado === 'pendiente');
  const ultimas = ventas.slice(0, 8);

  // ---- acciones ----
  async function ejecutar(body) {
    if (!pin) return null;
    setOcupado(true);
    try {
      const r = await api(pin, 'POST', body);
      await cargar();
      setError('');
      return r;
    } catch (e) {
      if (e.status === 401) {
        ls.del(PIN_KEY);
        setPin('');
        setPinError('PIN incorrecto');
      } else {
        setError(e.message);
      }
      return null;
    } finally {
      setOcupado(false);
    }
  }

  function sumar(id, delta = 1) {
    setComanda((c) => {
      const n = (c[id] || 0) + delta;
      const copia = { ...c };
      if (n <= 0) delete copia[id];
      else copia[id] = n;
      return copia;
    });
  }

  async function registrar(estado, metodo, cuenta_id) {
    if (!meseroActual) {
      setError('Primero toca el mesero');
      return;
    }
    if (comandaVacia) return;
    const items = lineas.map((l) => ({ producto_id: l.prod.id, cantidad: l.cant }));
    const r = await ejecutar({ accion: 'venta', mesero: meseroActual, estado, metodo, cuenta_id, items });
    if (r?.venta) {
      const cuenta = cuenta_id ? cuentas.find((c) => c.id === cuenta_id) : null;
      setConfirmacion({
        ...r.venta,
        lineas,
        cuentaNombre: cuenta?.nombre || null,
      });
      setComanda({});
      setModoCuenta(false);
    }
  }

  async function abrirCuenta(nombre, cargarComanda) {
    const r = await ejecutar({ accion: 'abrir_cuenta', nombre });
    if (r?.cuenta) {
      setNuevaCuenta(null);
      if (cargarComanda && !comandaVacia) {
        // la venta se registra sobre la cuenta recién creada
        const items = lineas.map((l) => ({ producto_id: l.prod.id, cantidad: l.cant }));
        const v = await ejecutar({
          accion: 'venta',
          mesero: meseroActual,
          estado: 'cuenta',
          cuenta_id: r.cuenta.id,
          items,
        });
        if (v?.venta) {
          setConfirmacion({ ...v.venta, lineas, cuentaNombre: r.cuenta.nombre });
          setComanda({});
          setModoCuenta(false);
        }
      }
    }
  }

  function exportarCSV() {
    const filas = [
      ['numero', 'hora', 'mesero', 'estado', 'metodo', 'cliente', 'productos', 'total'],
      ...[...ventas]
        .sort((a, b) => a.numero - b.numero)
        .map((v) => [
          v.numero,
          new Date(v.created_at).toLocaleString('es-CO'),
          v.mesero,
          v.estado,
          v.metodo || '',
          cuentas.find((c) => c.id === v.cuenta_id)?.nombre || '',
          resumenItems(v.items),
          Math.round(Number(v.total)),
        ]),
      [],
      ['ABONOS DE CLIENTES'],
      ['hora', 'cliente', 'metodo', 'monto'],
      ...pagos.map((p) => [
        new Date(p.created_at).toLocaleString('es-CO'),
        cuentas.find((c) => c.id === p.cuenta_id)?.nombre || '',
        p.metodo,
        Math.round(Number(p.monto)),
      ]),
    ];
    const csv = filas
      .map((f) => f.map((c) => '"' + String(c ?? '').split('"').join('""') + '"').join(';'))
      .join('\n');
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'torneo-oasis-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---- teclado: Enter/Esc cierran la confirmación ----
  useEffect(() => {
    if (!confirmacion) return;
    const h = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') setConfirmacion(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [confirmacion]);

  // ================================================================ RENDER
  if (pin === undefined) {
    return (
      <div className="tq">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tq-centro">Cargando…</div>
      </div>
    );
  }

  if (!pin) {
    return (
      <div className="tq">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <form
          className="tq-pin"
          onSubmit={async (e) => {
            e.preventDefault();
            const p = pinInput.trim();
            if (!p) return;
            setPinError('');
            try {
              await api(p, 'GET');
              ls.set(PIN_KEY, p);
              setPin(p);
            } catch (err) {
              setPinError(err.status === 401 ? 'PIN incorrecto' : err.message);
            }
          }}
        >
          <div className="tq-marca">OASIS · TORNEO</div>
          <label htmlFor="tq-pin-input">PIN de caja</label>
          <input
            id="tq-pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
          />
          {pinError && <div className="tq-err">{pinError}</div>}
          <button type="submit" className="tq-btn tq-btn-primario">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const cuentaDetalle = cuentaAbierta ? cuentas.find((c) => c.id === cuentaAbierta) : null;

  return (
    <div className="tq">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="tq-top">
        <div className="tq-marca">OASIS · TORNEO</div>
        <nav className="tq-tabs">
          <button className={tab === 'caja' ? 'on' : ''} onClick={() => setTab('caja')}>
            Caja
          </button>
          <button className={tab === 'resumen' ? 'on' : ''} onClick={() => setTab('resumen')}>
            Resumen
            {pendientes.length > 0 && <span className="tq-badge">{pendientes.length}</span>}
          </button>
        </nav>
        <div className="tq-top-der">
          <span className="tq-pill">Próxima {num(datos?.siguiente_numero ?? '…')}</span>
        </div>
      </header>

      {error && (
        <div className="tq-err tq-err-banda" onClick={() => setError('')}>
          {error} <span className="tq-mini">(toca para cerrar)</span>
        </div>
      )}

      {!datos && !error && <div className="tq-centro">Cargando productos…</div>}

      {/* ============================ CAJA ============================ */}
      {datos && tab === 'caja' && (
        <main className="tq-caja">
          <section className="tq-izq">
            <div className="tq-label">Mesero</div>
            <div className="tq-chips">
              {meseros.map((m) => (
                <button
                  key={m}
                  className={'tq-chip' + (m === meseroActual ? ' on' : '')}
                  onClick={() => setMesero(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="tq-label">
              Cuentas de clientes abiertas
              {modoCuenta && <span className="tq-aviso"> · toca la cuenta a la que va esta comanda</span>}
            </div>
            <div className="tq-chips">
              {cuentasAbiertas.map((c) => (
                <button
                  key={c.id}
                  className={'tq-chip tq-chip-cli' + (Number(c.saldo) >= 1 ? ' debe' : '') + (modoCuenta ? ' elegir' : '')}
                  onClick={() => (modoCuenta ? registrar('cuenta', null, c.id) : setCuentaAbierta(c.id))}
                >
                  {c.nombre} · {fmt(c.saldo)}
                </button>
              ))}
              <button
                className="tq-chip tq-chip-add"
                onClick={() => setNuevaCuenta({ nombre: '', cargarComanda: modoCuenta })}
              >
                + Abrir cuenta
              </button>
            </div>

            <div className="tq-cats">
              {categorias.map((c) => (
                <button key={c} className={'tq-cat' + (c === catActual ? ' on' : '')} onClick={() => setCategoria(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="tq-productos">
              {productosVisibles.map((p) => {
                const cant = comanda[p.id] || 0;
                return (
                  <button
                    key={p.id}
                    className={'tq-prod' + (cant ? ' hit' : '')}
                    onClick={() => sumar(p.id, 1)}
                    disabled={ocupado}
                  >
                    <span className="tq-prod-n">
                      {p.icono} {p.nombre}
                    </span>
                    <span className="tq-prod-p">
                      {fmt(p.precio)}
                      {cant ? <b> ×{cant}</b> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="tq-der">
            <div className="tq-label">
              Comanda {num(datos.siguiente_numero)} · {meseroActual || <span className="tq-aviso">elige mesero</span>}
            </div>
            <div className="tq-ticket">
              {comandaVacia && <div className="tq-mini">Toca productos para armar la comanda.</div>}
              {lineas.map((l) => (
                <div key={l.prod.id} className="tq-linea">
                  <button className="tq-mini-btn" onClick={() => sumar(l.prod.id, -1)}>
                    −
                  </button>
                  <span className="tq-linea-cant">{l.cant}</span>
                  <button className="tq-mini-btn" onClick={() => sumar(l.prod.id, 1)}>
                    +
                  </button>
                  <span className="tq-linea-n">{l.prod.nombre}</span>
                  <span className="tq-linea-t">{fmt(Number(l.prod.precio) * l.cant)}</span>
                </div>
              ))}
              <div className="tq-total">
                <span>TOTAL</span>
                <span>{fmt(totalComanda)}</span>
              </div>
              {!comandaVacia && (
                <button className="tq-link" onClick={() => setComanda({})}>
                  Limpiar comanda
                </button>
              )}
            </div>

            <div className="tq-label">¿Cómo paga?</div>
            <div className="tq-pagos">
              <button
                className="tq-btn tq-cash"
                disabled={ocupado || comandaVacia || !meseroActual}
                onClick={() => registrar('pagada', 'efectivo')}
              >
                EFECTIVO
              </button>
              <button
                className="tq-btn tq-transfer"
                disabled={ocupado || comandaVacia || !meseroActual}
                onClick={() => registrar('pagada', 'transferencia')}
              >
                TRANSFERENCIA
              </button>
              <button
                className="tq-btn tq-later"
                disabled={ocupado || comandaVacia || !meseroActual}
                onClick={() => registrar('pendiente')}
              >
                COBRA DESPUÉS
              </button>
              <button
                className={'tq-btn tq-client' + (modoCuenta ? ' on' : '')}
                disabled={ocupado || comandaVacia || !meseroActual}
                onClick={() => setModoCuenta((m) => !m)}
              >
                {modoCuenta ? 'CANCELAR' : 'A CUENTA DE…'}
              </button>
            </div>
            <div className="tq-mini">
              «Cobra después»: el mesero lleva el producto y cobra al entregar; queda pendiente a su nombre.
            </div>

            <div className="tq-label">Últimas comandas</div>
            <div className="tq-ultimas">
              {ultimas.length === 0 && <div className="tq-mini">Todavía no hay comandas.</div>}
              {ultimas.map((v) => (
                <div key={v.id} className="tq-ultima">
                  <span className="tq-ultima-n">{num(v.numero)}</span>
                  <span className="tq-ultima-txt">
                    <b>{v.mesero}</b> · {resumenItems(v.items)}
                  </span>
                  <span className={'tq-tag ' + v.estado}>
                    {v.estado === 'cuenta'
                      ? cuentas.find((c) => c.id === v.cuenta_id)?.nombre || 'cuenta'
                      : v.estado === 'pagada'
                        ? v.metodo
                        : 'pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}

      {/* ============================ RESUMEN ============================ */}
      {datos && tab === 'resumen' && (
        <main className="tq-resumen">
          <div className="tq-kpis">
            <div className="tq-kpi">
              <span>Despachado</span>
              <b>{fmt(resumen.total.despachado)}</b>
            </div>
            <div className="tq-kpi">
              <span>Efectivo en caja</span>
              <b>{fmt(resumen.total.efectivo + resumen.abonosEfe)}</b>
              <small>ventas {fmt(resumen.total.efectivo)} + abonos {fmt(resumen.abonosEfe)}</small>
            </div>
            <div className="tq-kpi">
              <span>Transferencias</span>
              <b>{fmt(resumen.total.transferencia + resumen.abonosTra)}</b>
              <small>ventas {fmt(resumen.total.transferencia)} + abonos {fmt(resumen.abonosTra)}</small>
            </div>
            <div className="tq-kpi warn">
              <span>Por cobrar meseros</span>
              <b>{fmt(resumen.total.pendiente)}</b>
              <small>{pendientes.length} comandas</small>
            </div>
            <div className="tq-kpi info">
              <span>Saldo cuentas clientes</span>
              <b>{fmt(resumen.saldoClientes)}</b>
              <small>{cuentasAbiertas.length} abiertas</small>
            </div>
          </div>

          <div className="tq-tabla-wrap">
            <table className="tq-tabla">
              <thead>
                <tr>
                  <th>Mesero</th>
                  <th className="num">Comandas</th>
                  <th className="num">Despachado</th>
                  <th className="num">Efectivo</th>
                  <th className="num">Transf.</th>
                  <th className="num">A cuentas</th>
                  <th className="num">Por cobrar</th>
                </tr>
              </thead>
              <tbody>
                {resumen.filas.map((f) => (
                  <tr key={f.mesero}>
                    <td>{f.mesero}</td>
                    <td className="num">{f.comandas}</td>
                    <td className="num">{fmt(f.despachado)}</td>
                    <td className="num">{fmt(f.efectivo)}</td>
                    <td className="num">{fmt(f.transferencia)}</td>
                    <td className="num">{fmt(f.cuenta)}</td>
                    <td className={'num' + (f.pendiente >= 1 ? ' debe' : '')}>{fmt(f.pendiente)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total torneo</td>
                  <td className="num">{resumen.total.comandas}</td>
                  <td className="num">{fmt(resumen.total.despachado)}</td>
                  <td className="num">{fmt(resumen.total.efectivo)}</td>
                  <td className="num">{fmt(resumen.total.transferencia)}</td>
                  <td className="num">{fmt(resumen.total.cuenta)}</td>
                  <td className="num debe">{fmt(resumen.total.pendiente)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="tq-dos">
            <section className="tq-bloque">
              <h3>Pendientes por cobrar</h3>
              {pendientes.length === 0 && <div className="tq-mini">Ningún mesero debe plata. 🎉</div>}
              {pendientes.map((v) => (
                <div key={v.id} className="tq-pend">
                  <div className="tq-pend-txt">
                    <b>
                      {num(v.numero)} · {v.mesero}
                    </b>
                    <span>
                      {hora(v.created_at)} · {resumenItems(v.items)}
                    </span>
                  </div>
                  <div className="tq-pend-tot">{fmt(v.total)}</div>
                  <div className="tq-pend-btns">
                    <button
                      className="tq-btn tq-cash sm"
                      disabled={ocupado}
                      onClick={() => ejecutar({ accion: 'cobrar_pendiente', venta_id: v.id, metodo: 'efectivo' })}
                    >
                      Efectivo
                    </button>
                    <button
                      className="tq-btn tq-transfer sm"
                      disabled={ocupado}
                      onClick={() =>
                        ejecutar({ accion: 'cobrar_pendiente', venta_id: v.id, metodo: 'transferencia' })
                      }
                    >
                      Transf.
                    </button>
                    <button
                      className="tq-link peligro"
                      disabled={ocupado}
                      onClick={() => {
                        if (window.confirm('¿Anular la comanda ' + num(v.numero) + '? No se puede deshacer.'))
                          ejecutar({ accion: 'anular', venta_id: v.id });
                      }}
                    >
                      Anular
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="tq-bloque">
              <h3>Cuentas de clientes</h3>
              {cuentas.length === 0 && <div className="tq-mini">No se ha abierto ninguna cuenta.</div>}
              {[...cuentas]
                .sort((a, b) => Number(b.abierta) - Number(a.abierta))
                .map((c) => (
                  <button key={c.id} className={'tq-cuenta' + (c.abierta ? '' : ' cerrada')} onClick={() => setCuentaAbierta(c.id)}>
                    <span>
                      <b>{c.nombre}</b>
                      <small>{c.abierta ? 'abierta' : 'cerrada'}</small>
                    </span>
                    <span className={Number(c.saldo) >= 1 ? 'debe' : ''}>{fmt(c.saldo)}</span>
                  </button>
                ))}
              <button className="tq-chip tq-chip-add" onClick={() => setNuevaCuenta({ nombre: '', cargarComanda: false })}>
                + Abrir cuenta
              </button>
            </section>
          </div>

          <section className="tq-bloque">
            <h3>Todas las comandas</h3>
            <div className="tq-tabla-wrap">
              <table className="tq-tabla tq-tabla-sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hora</th>
                    <th>Mesero</th>
                    <th>Productos</th>
                    <th>Estado</th>
                    <th className="num">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id}>
                      <td>{num(v.numero)}</td>
                      <td>{hora(v.created_at)}</td>
                      <td>{v.mesero}</td>
                      <td className="wrap">{resumenItems(v.items)}</td>
                      <td>
                        <span className={'tq-tag ' + v.estado}>
                          {v.estado === 'cuenta'
                            ? cuentas.find((c) => c.id === v.cuenta_id)?.nombre || 'cuenta'
                            : v.estado === 'pagada'
                              ? v.metodo
                              : 'pendiente'}
                        </span>
                      </td>
                      <td className="num">{fmt(v.total)}</td>
                      <td>
                        <button
                          className="tq-link peligro"
                          disabled={ocupado}
                          onClick={() => {
                            if (window.confirm('¿Anular la comanda ' + num(v.numero) + '? No se puede deshacer.'))
                              ejecutar({ accion: 'anular', venta_id: v.id });
                          }}
                        >
                          Anular
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="tq-acciones-final">
            <button className="tq-btn tq-btn-primario" onClick={exportarCSV} disabled={ventas.length === 0}>
              Exportar CSV
            </button>
            <button className="tq-link peligro" onClick={() => setReiniciar('')}>
              Reiniciar torneo (borra todo)
            </button>
          </div>
        </main>
      )}

      {/* ============================ MODALES ============================ */}
      {confirmacion && (
        <div className="tq-overlay" onClick={() => setConfirmacion(null)}>
          <div className="tq-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="tq-confirm-label">Comanda</div>
            <div className="tq-confirm-num">{num(confirmacion.numero)}</div>
            <div className="tq-confirm-mesero">{confirmacion.mesero}</div>
            <div className="tq-confirm-items">
              {confirmacion.lineas.map((l) => (
                <div key={l.prod.id}>
                  {l.cant} × {l.prod.nombre}
                </div>
              ))}
            </div>
            <div className="tq-confirm-tot">
              {fmt(confirmacion.total)} ·{' '}
              {confirmacion.estado === 'cuenta'
                ? 'a cuenta de ' + confirmacion.cuentaNombre
                : confirmacion.estado === 'pagada'
                  ? confirmacion.metodo
                  : 'cobra después'}
            </div>
            <button className="tq-btn tq-btn-primario grande" autoFocus onClick={() => setConfirmacion(null)}>
              LISTO
            </button>
            <div className="tq-mini">Anota el número en el papel y pásalo a bodega. Enter o Esc también cierran.</div>
          </div>
        </div>
      )}

      {nuevaCuenta && (
        <div className="tq-overlay" onClick={() => setNuevaCuenta(null)}>
          <form
            className="tq-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const n = nuevaCuenta.nombre.trim();
              if (n) abrirCuenta(n, nuevaCuenta.cargarComanda);
            }}
          >
            <h3>Abrir cuenta de cliente</h3>
            <label htmlFor="tq-cuenta-nombre">Nombre (cliente, mesa, grupo…)</label>
            <input
              id="tq-cuenta-nombre"
              autoFocus
              value={nuevaCuenta.nombre}
              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })}
            />
            {nuevaCuenta.cargarComanda && !comandaVacia && (
              <div className="tq-mini">La comanda actual ({fmt(totalComanda)}) se cargará a esta cuenta.</div>
            )}
            <div className="tq-modal-btns">
              <button type="button" className="tq-link" onClick={() => setNuevaCuenta(null)}>
                Cancelar
              </button>
              <button type="submit" className="tq-btn tq-btn-primario" disabled={ocupado || !nuevaCuenta.nombre.trim()}>
                Abrir
              </button>
            </div>
          </form>
        </div>
      )}

      {cuentaDetalle && (
        <DetalleCuenta
          cuenta={cuentaDetalle}
          ventas={ventas.filter((v) => v.cuenta_id === cuentaDetalle.id)}
          pagos={pagos.filter((p) => p.cuenta_id === cuentaDetalle.id)}
          ocupado={ocupado}
          onCerrar={() => setCuentaAbierta(null)}
          onAbonar={(monto, metodo) => ejecutar({ accion: 'abonar', cuenta_id: cuentaDetalle.id, monto, metodo })}
          onCerrarCuenta={() => ejecutar({ accion: 'cerrar_cuenta', cuenta_id: cuentaDetalle.id })}
        />
      )}

      {reiniciar !== null && (
        <div className="tq-overlay" onClick={() => setReiniciar(null)}>
          <form
            className="tq-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await ejecutar({ accion: 'reiniciar', confirmar: reiniciar });
              if (r?.ok) {
                setReiniciar(null);
                setComanda({});
              }
            }}
          >
            <h3>Reiniciar torneo</h3>
            <p>
              Borra <b>todas</b> las comandas, cuentas y abonos del torneo y vuelve la numeración a #0001. Úsalo solo
              para limpiar las pruebas antes de empezar.
            </p>
            <label htmlFor="tq-reiniciar">Escribe REINICIAR para confirmar</label>
            <input id="tq-reiniciar" autoFocus value={reiniciar} onChange={(e) => setReiniciar(e.target.value)} />
            <div className="tq-modal-btns">
              <button type="button" className="tq-link" onClick={() => setReiniciar(null)}>
                Cancelar
              </button>
              <button type="submit" className="tq-btn tq-peligro" disabled={ocupado || reiniciar !== 'REINICIAR'}>
                Borrar todo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ============================================================================
function DetalleCuenta({ cuenta, ventas, pagos, ocupado, onCerrar, onAbonar, onCerrarCuenta }) {
  const saldo = Number(cuenta.saldo) || 0;
  const [monto, setMonto] = useState(String(Math.max(0, Math.round(saldo))));
  useEffect(() => {
    setMonto(String(Math.max(0, Math.round(saldo))));
  }, [saldo]);
  const montoNum = Number(monto);
  const montoOk = Number.isFinite(montoNum) && montoNum > 0 && montoNum - saldo < 1;

  return (
    <div className="tq-overlay" onClick={onCerrar}>
      <div className="tq-modal ancho" onClick={(e) => e.stopPropagation()}>
        <div className="tq-modal-cab">
          <h3>{cuenta.nombre}</h3>
          <span className={'tq-saldo' + (saldo >= 1 ? ' debe' : '')}>
            Saldo {fmt(saldo)} {cuenta.abierta ? '' : '· cerrada'}
          </span>
        </div>

        <div className="tq-label">Comandas cargadas</div>
        <div className="tq-lista">
          {ventas.length === 0 && <div className="tq-mini">Nada cargado todavía.</div>}
          {[...ventas]
            .sort((a, b) => a.numero - b.numero)
            .map((v) => (
              <div key={v.id} className="tq-lista-fila">
                <span>
                  <b>{num(v.numero)}</b> {v.mesero} · {hora(v.created_at)}
                </span>
                <span className="wrap">{resumenItems(v.items)}</span>
                <span className="num">{fmt(v.total)}</span>
              </div>
            ))}
        </div>

        {pagos.length > 0 && (
          <>
            <div className="tq-label">Abonos</div>
            <div className="tq-lista">
              {pagos.map((p) => (
                <div key={p.id} className="tq-lista-fila">
                  <span>{hora(p.created_at)}</span>
                  <span>{p.metodo}</span>
                  <span className="num">{fmt(p.monto)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {cuenta.abierta && saldo >= 1 && (
          <>
            <div className="tq-label">Abonar</div>
            <div className="tq-abonar">
              <input
                id="tq-abono-monto"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              <button className="tq-btn tq-cash" disabled={ocupado || !montoOk} onClick={() => onAbonar(montoNum, 'efectivo')}>
                EFECTIVO
              </button>
              <button
                className="tq-btn tq-transfer"
                disabled={ocupado || !montoOk}
                onClick={() => onAbonar(montoNum, 'transferencia')}
              >
                TRANSFERENCIA
              </button>
            </div>
            <div className="tq-mini">Puede ser parcial. Cuando el saldo llega a $0 la cuenta se cierra sola.</div>
          </>
        )}

        <div className="tq-modal-btns">
          {cuenta.abierta && saldo < 1 && (
            <button className="tq-link" disabled={ocupado} onClick={onCerrarCuenta}>
              Cerrar cuenta
            </button>
          )}
          <button className="tq-btn tq-btn-primario" onClick={onCerrar}>
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
const CSS = `
.tq{--bg:#f4f1e8;--paper:#fff;--ink:#1a3d4d;--muted:#5f6f76;--line:#d9d3c4;--accent:#1f6b4a;--accent-soft:#e3efe8;
  --ok:#2c7a4b;--info:#2f5f9e;--info-soft:#e5ecf6;--warn:#b8741a;--warn-soft:#fbf1df;--bad:#b23b3b;--bad-soft:#f9e4e4;--sand:#efe9d8;
  min-height:100vh;background:var(--bg);color:var(--ink);font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;line-height:1.4;
  -webkit-user-select:none;user-select:none}
.tq *{box-sizing:border-box}
/* :where() deja el reset con especificidad 0 para que las clases de abajo
   (.tq-btn, .tq-chip, .tq-prod…) ganen siempre el fondo y el padding. */
:where(.tq) :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.tq button:disabled{opacity:.45;cursor:not-allowed}
.tq input{font:inherit;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:10px 12px;background:#fff;width:100%;-webkit-user-select:text;user-select:text}
.tq input:focus,.tq button:focus-visible{outline:3px solid rgba(31,107,74,.35);outline-offset:1px}
.tq-centro{padding:60px 16px;text-align:center;color:var(--muted)}
.tq-marca{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:18px;letter-spacing:.02em}
.tq-mini{font-size:12px;color:var(--muted)}
.tq-aviso{color:var(--warn);font-weight:600;text-transform:none;letter-spacing:0}
.tq-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-top:4px}
.tq-err{color:var(--bad);background:var(--bad-soft);border:1px solid var(--bad);padding:8px 12px;border-radius:6px;font-weight:600}
.tq-err-banda{margin:8px 16px;cursor:pointer}

/* PIN */
.tq-pin{max-width:320px;margin:15vh auto 0;background:var(--paper);border:1px solid var(--line);padding:24px;border-radius:10px;display:grid;gap:12px}
.tq-pin label{font-weight:600}

/* top */
.tq-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:var(--ink);color:#fff;position:sticky;top:0;z-index:5}
.tq-tabs{display:flex;gap:4px}
.tq-tabs button{color:#fff;padding:8px 14px;border-radius:6px;font-weight:600;opacity:.75;display:flex;align-items:center;gap:6px}
.tq-tabs button.on{background:rgba(255,255,255,.15);opacity:1}
.tq-badge{background:var(--warn);color:#fff;font-size:11px;padding:1px 7px;border-radius:999px}
.tq-pill{font-size:13px;background:var(--accent);color:#fff;padding:4px 10px;border-radius:999px;font-weight:600;white-space:nowrap}

/* caja */
.tq-caja{display:grid;grid-template-columns:1.4fr 1fr;gap:0;min-height:calc(100vh - 48px)}
@media (max-width:820px){.tq-caja{grid-template-columns:1fr}}
.tq-izq,.tq-der{padding:12px 16px;display:grid;gap:8px;align-content:start}
.tq-der{border-left:1px solid var(--line);background:var(--paper)}
@media (max-width:820px){.tq-der{border-left:0;border-top:1px solid var(--line)}}
.tq-chips{display:flex;flex-wrap:wrap;gap:6px}
.tq-chip{border:1px solid var(--line);background:var(--paper);padding:10px 14px;font-weight:700;font-size:15px;border-radius:8px}
.tq-chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.tq-chip-cli{border-style:dashed;font-weight:600}
.tq-chip-cli.debe{background:var(--warn-soft);border-color:var(--warn)}
.tq-chip-cli.elegir{border-style:solid;border-width:2px;border-color:var(--info);background:var(--info-soft);animation:tq-pulso 1s infinite alternate}
@keyframes tq-pulso{from{transform:scale(1)}to{transform:scale(1.04)}}
@media (prefers-reduced-motion:reduce){.tq-chip-cli.elegir{animation:none}}
.tq-chip-add{color:var(--accent);border-color:var(--accent);background:transparent}
.tq-cats{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;border-bottom:1px solid var(--line)}
.tq-cat{font-size:14px;font-weight:600;padding:8px 12px;border-bottom:3px solid transparent;color:var(--muted)}
.tq-cat.on{color:var(--ink);border-color:var(--accent)}
.tq-productos{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
.tq-prod{border:1px solid var(--line);background:var(--paper);padding:10px 8px;border-radius:8px;display:grid;gap:3px;min-height:70px;text-align:left;align-content:start}
.tq-prod:active{transform:scale(.97)}
.tq-prod.hit{background:var(--accent-soft);border-color:var(--accent)}
.tq-prod-n{font-size:14px;font-weight:600;line-height:1.2}
.tq-prod-p{font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums}
.tq-prod-p b{color:var(--ink);font-size:15px}
.tq-ticket{border:1px dashed var(--line);border-radius:8px;padding:10px;display:grid;gap:6px;font-variant-numeric:tabular-nums}
.tq-linea{display:grid;grid-template-columns:32px 24px 32px 1fr auto;align-items:center;gap:4px;font-size:15px}
.tq-linea-cant{text-align:center;font-weight:700}
.tq-linea-n{padding-left:6px;font-weight:500}
.tq-linea-t{font-weight:600}
.tq-mini-btn{width:32px;height:32px;border:1px solid var(--line);border-radius:6px;font-size:18px;font-weight:700;background:var(--bg)}
.tq-total{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px;font-weight:800;font-size:20px;font-family:'Bricolage Grotesque',sans-serif}
.tq-link{color:var(--accent);font-weight:600;text-decoration:underline;font-size:14px;justify-self:start}
.tq-link.peligro{color:var(--bad)}
.tq-pagos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tq-btn{padding:16px 10px;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-size:19px;font-weight:800;border-radius:8px;border:1px solid var(--line);background:var(--paper)}
.tq-btn.sm{padding:8px 12px;font-size:15px}
.tq-btn.grande{padding:18px;font-size:24px}
.tq-btn:active:not(:disabled){transform:scale(.97)}
.tq-btn-primario{background:var(--accent);color:#fff;border-color:var(--accent)}
.tq-cash{background:var(--ok);color:#fff;border-color:var(--ok)}
.tq-transfer{background:var(--info);color:#fff;border-color:var(--info)}
.tq-later{background:var(--warn-soft);color:var(--ink);border-color:var(--warn)}
.tq-client{background:var(--sand);color:var(--ink)}
.tq-client.on{background:var(--info-soft);border-color:var(--info);color:var(--info)}
.tq-peligro{background:var(--bad);color:#fff;border-color:var(--bad)}
.tq-ultimas{display:grid;gap:4px}
.tq-ultima{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;font-size:13px;padding:6px 8px;background:var(--bg);border-radius:6px}
.tq-ultima-n{font-weight:800;font-variant-numeric:tabular-nums}
.tq-ultima-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tq-tag{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:700;white-space:nowrap;text-transform:lowercase}
.tq-tag.pagada{background:var(--accent-soft);color:var(--accent)}
.tq-tag.pendiente{background:var(--warn-soft);color:var(--warn)}
.tq-tag.cuenta{background:var(--info-soft);color:var(--info)}

/* resumen */
.tq-resumen{padding:16px;display:grid;gap:16px;max-width:1100px;margin:0 auto}
.tq-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.tq-kpi{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:2px}
.tq-kpi span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.tq-kpi b{font-family:'Bricolage Grotesque',sans-serif;font-size:26px;font-variant-numeric:tabular-nums}
.tq-kpi small{color:var(--muted);font-size:12px}
.tq-kpi.warn{border-left:5px solid var(--warn)}
.tq-kpi.info{border-left:5px solid var(--info)}
.tq-tabla-wrap{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:8px}
.tq-tabla{border-collapse:collapse;width:100%;font-size:14px;min-width:620px}
.tq-tabla th,.tq-tabla td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
.tq-tabla th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.tq-tabla .num{text-align:right;font-variant-numeric:tabular-nums}
.tq-tabla .wrap{white-space:normal;max-width:360px}
.tq-tabla .debe{color:var(--warn);font-weight:700}
.tq-tabla tr.total td{font-weight:700;background:var(--sand)}
.tq-tabla-sm{font-size:13px}
.tq-dos{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:820px){.tq-dos{grid-template-columns:1fr}}
.tq-bloque{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:14px;display:grid;gap:8px;align-content:start}
.tq-bloque h3{margin:0;font-family:'Bricolage Grotesque',sans-serif;font-size:18px}
.tq-pend{display:grid;grid-template-columns:1fr auto;gap:6px 12px;padding:10px;background:var(--warn-soft);border-radius:6px;align-items:center}
.tq-pend-txt{display:grid;font-size:13px}
.tq-pend-tot{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums}
.tq-pend-btns{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tq-cuenta{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;text-align:left;background:var(--bg)}
.tq-cuenta.cerrada{opacity:.55}
.tq-cuenta span{display:grid}
.tq-cuenta small{color:var(--muted);font-size:11px}
.tq-cuenta .debe{color:var(--warn);font-weight:800;font-size:17px}
.tq-acciones-final{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between}

/* modales */
.tq-overlay{position:fixed;inset:0;background:rgba(26,61,77,.55);display:grid;place-items:center;padding:16px;z-index:20}
.tq-confirm{background:var(--paper);border-radius:14px;padding:28px 32px;text-align:center;display:grid;gap:8px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.tq-confirm-label{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600}
.tq-confirm-num{font-family:'Bricolage Grotesque',sans-serif;font-size:96px;font-weight:800;line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}
.tq-confirm-mesero{font-size:26px;font-weight:800}
.tq-confirm-items{font-size:16px;color:var(--ink);display:grid;gap:2px}
.tq-confirm-tot{font-weight:700;color:var(--muted);text-transform:capitalize}
.tq-modal{background:var(--paper);border-radius:12px;padding:20px;display:grid;gap:10px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:92vh;overflow:auto}
.tq-modal.ancho{max-width:640px}
.tq-modal h3{margin:0;font-family:'Bricolage Grotesque',sans-serif;font-size:22px}
.tq-modal p{margin:0;font-size:14px}
.tq-modal label{font-weight:600;font-size:14px}
.tq-modal-btns{display:flex;justify-content:flex-end;gap:16px;align-items:center;margin-top:6px}
.tq-modal-cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.tq-saldo{font-weight:700;color:var(--muted)}
.tq-saldo.debe{color:var(--warn);font-size:18px}
.tq-lista{display:grid;gap:4px}
.tq-lista-fila{display:grid;grid-template-columns:auto 1fr auto;gap:10px;font-size:13px;padding:6px 8px;background:var(--bg);border-radius:6px;align-items:center}
.tq-lista-fila .wrap{white-space:normal}
.tq-lista-fila .num{font-weight:700;font-variant-numeric:tabular-nums}
.tq-abonar{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center}
@media (max-width:520px){.tq-abonar{grid-template-columns:1fr 1fr}.tq-abonar input{grid-column:1/-1}}
`;
