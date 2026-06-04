'use client';

import { useState, useEffect } from 'react';

const CATEGORIAS = ['Alquiler cancha', 'Accesorios', 'Bebidas', 'Cervezas', 'Snacks'];
const CANCHAS = [
  { id: 'C1', nombre: 'Cancha 1' },
  { id: 'C2', nombre: 'Cancha 2' },
];
const METODOS = [
  { v: 'efectivo', label: 'Efectivo', icon: '💵', color: '#27AE60' },
  { v: 'transferencia', label: 'Transferencia', icon: '🔁', color: '#2E84A6' },
  { v: 'tarjeta', label: 'Tarjeta', icon: '💳', color: '#8E44AD' },
  { v: 'fiado', label: 'Fiado', icon: '⚠', color: '#C0392B' },
];

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// ===== Helpers de negocio (todo coercionado a número) =====
function totalCuenta(cuenta) {
  return (cuenta.consumos || []).reduce((s, c) => s + (Number(c.total) || 0), 0);
}
function totalPagado(cuenta) {
  return (cuenta.pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
}
function desglosePorJugador(cuenta) {
  const d = (cuenta.jugadores || []).map((j) => ({
    jugadorId: j.id,
    nombre: j.nombre,
    total: 0,
    items: 0,
  }));
  (cuenta.consumos || []).forEach((c) => {
    const ids = c.asignacion_jugadores || [];
    const tot = Number(c.total) || 0;
    if (c.tipo_asignacion === 'individual') {
      const idx = d.findIndex((x) => x.jugadorId === ids[0]);
      if (idx >= 0) {
        d[idx].total += tot;
        d[idx].items += 1;
      }
    } else {
      const parte = tot / (ids.length || 1);
      ids.forEach((id) => {
        const idx = d.findIndex((x) => x.jugadorId === id);
        if (idx >= 0) {
          d[idx].total += parte;
          d[idx].items += 1;
        }
      });
    }
  });
  return d;
}
function pagadoPorJugador(cuenta, jugadorId) {
  return (cuenta.pagos || [])
    .filter((p) => p.jugador_id === jugadorId)
    .reduce((s, p) => s + (Number(p.monto) || 0), 0);
}
// Un saldo se considera pagado si falta menos de 1 peso. Los residuos de
// centavos aparecen al dividir un total entre jugadores (ej. 10000/3).
function saldado(pendiente) {
  return (Number(pendiente) || 0) < 1;
}

// ============================================================================
function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  return fetch(url, { ...opciones, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export default function POSApp() {
  const [estado, setEstado] = useState(null);
  const [vista, setVista] = useState('home');
  const [cuentaActivaId, setCuentaActivaId] = useState(null);
  const [modal, setModal] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [errorApi, setErrorApi] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // esRecarga=true  -> refresco tras una acción: si falla NO rompemos la
  //                    pantalla (solo avisamos), para no perder lo que ya se ve.
  // esRecarga=false -> carga inicial: si falla mostramos la pantalla de error.
  async function cargarDatos({ esRecarga = false } = {}) {
    try {
      const res = await fetchConTimeout('/api/data?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) {
        if (esRecarga) setErrorApi('No se pudieron refrescar los datos: ' + json.error);
        else setError(json.error);
        return null;
      }
      setEstado(json);
      setError(null);
      return json;
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Tiempo de espera agotado. Revisa la conexión a Supabase.' : e.message;
      if (esRecarga) setErrorApi('No se pudieron refrescar los datos: ' + msg);
      else setError(msg);
      return null;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  async function llamarApi(url, metodo, body) {
    setOcupado(true);
    setErrorApi(null);
    setAviso(null);
    try {
      const res = await fetchConTimeout(url + '?t=' + Date.now(), {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      let json;
      try {
        json = await res.json();
      } catch {
        setErrorApi(`El servidor respondió con un error inesperado (HTTP ${res.status}). Revisa los logs de Vercel.`);
        return null;
      }
      if (json.error) {
        setErrorApi('Error: ' + json.error);
        // Re-sincronizar con el estado real del servidor, incluso al fallar.
        // Es un refresco (no rompe la pantalla si a su vez falla la recarga).
        await cargarDatos({ esRecarga: true });
        return null;
      }
      await cargarDatos({ esRecarga: true });
      return json;
    } catch (e) {
      setErrorApi(e.name === 'AbortError' ? 'La operación tardó demasiado (>15 s). Revisa la conexión a Supabase en Vercel.' : 'Error de red: ' + e.message);
      // La operación pudo COMPLETARSE en el servidor aunque el cliente no
      // recibiera la respuesta (timeout o red). Re-sincronizamos para no quedar
      // mostrando un estado viejo (ej.: "no hay turno" cuando sí se creó).
      try { await cargarDatos({ esRecarga: true }); } catch {}
      return null;
    } finally {
      setOcupado(false);
    }
  }

  if (cargando) {
    return <Pantalla><p style={{ textAlign: 'center', color: '#5C7785' }}>Cargando…</p></Pantalla>;
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header turno={null} vista="home" onHome={() => {}} />
        <Pantalla>
          <div style={{ background: '#FCEBEB', border: '2px solid #C0392B', borderRadius: 14, padding: 24, color: '#791F1F' }}>
            <h2 style={{ marginBottom: 8 }}>Problema de conexión</h2>
            <p style={{ fontSize: 14 }}>{error}</p>
            <button onClick={() => { setError(null); setCargando(true); cargarDatos(); }} style={{ ...btnPri, marginTop: 16, background: '#C0392B', color: 'white' }}>Reintentar</button>
          </div>
        </Pantalla>
      </div>
    );
  }

  const turno = estado?.turno || null;
  const cuentas = estado?.cuentas || [];
  const cuentaActiva = cuentas.find((c) => c.id === cuentaActivaId);

  // Blindaje: si estamos en vista cuenta pero la cuenta no aparece, volver a home
  const vistaSegura =
    vista === 'cuenta' && !cuentaActiva ? 'home' : vista;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header turno={turno} vista={vistaSegura} onHome={() => { setVista('home'); setCuentaActivaId(null); }} />

      {errorApi && (
        <div style={{ background: '#FCEBEB', borderBottom: '2px solid #C0392B', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ color: '#791F1F', fontSize: 13, fontWeight: 600 }}>⚠ {errorApi}</div>
          <button onClick={() => setErrorApi(null)} style={{ background: 'transparent', border: 'none', color: '#C0392B', fontWeight: 800, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {aviso && (
        <div style={{ background: '#E8F4F8', borderBottom: '2px solid #2E84A6', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ color: '#1A3D4D', fontSize: 13, fontWeight: 600 }}>ℹ {aviso}</div>
          <button onClick={() => setAviso(null)} style={{ background: 'transparent', border: 'none', color: '#2E84A6', fontWeight: 800, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
        {!turno && (
          <VistaInicio
            ocupado={ocupado}
            onAbrir={async (cajera, base) => {
              const r = await llamarApi('/api/turno', 'POST', { cajera, base_caja: base });
              // CLAVE: si el servidor confirma un turno, lo reflejamos de
              // inmediato en el estado, SIN depender de la recarga de /api/data.
              // Así la pantalla SIEMPRE avanza cuando el turno existe en el
              // servidor (esta era la causa de quedarse en "Abriendo…").
              if (r?.turno) {
                setEstado((prev) => ({ ...(prev || {}), turno: r.turno }));
                setVista('home');
                if (r.adoptado) {
                  setAviso(`Ya había un turno abierto (cajera: ${r.turno?.cajera || '—'}). Lo retomé en lugar de crear uno nuevo. Si quieres empezar de cero, ciérralo y vuelve a abrir.`);
                }
              }
            }}
            onForzarCierre={async () => {
              const ok = typeof window !== 'undefined'
                ? window.confirm('Esto cerrará cualquier turno (y sus cuentas) que haya quedado abierto, para que puedas empezar de cero. ¿Continuar?')
                : true;
              if (!ok) return;
              const r = await llamarApi('/api/turno', 'PATCH', { cerrarTodo: true });
              if (r?.ok) {
                setAviso(r.cerrados > 0
                  ? `Listo: cerré ${r.cerrados} turno(s) que estaban abiertos. Ya puedes abrir uno nuevo.`
                  : 'No había ningún turno abierto. Ya puedes abrir uno nuevo.');
              }
            }}
          />
        )}

        {turno && vistaSegura === 'home' && (
          <VistaHome
            estado={estado}
            onAbrirCancha={(canchaId) => setModal({ tipo: 'nuevaCuenta', canchaId })}
            onNuevaSuelta={() => setModal({ tipo: 'nuevaCuenta', canchaId: null })}
            onVerCuenta={(id) => { setCuentaActivaId(id); setVista('cuenta'); }}
            onPorCobrar={() => setVista('porCobrar')}
            onCerrarTurno={() => setVista('cierre')}
          />
        )}

        {turno && vistaSegura === 'cuenta' && cuentaActiva && (
          <VistaCuenta
            cuenta={cuentaActiva}
            productos={estado.productos}
            ocupado={ocupado}
            onAgregar={() => setModal({ tipo: 'agregarProducto' })}
            onCobrar={() => setModal({ tipo: 'cobrar' })}
            onEliminarConsumo={async (consumoId) => {
              const r = await llamarApi('/api/consumo', 'DELETE', { consumoId });
              if (r?.ok) {
                // Quitar el consumo de la cuenta activa de inmediato.
                const cid = cuentaActiva.id;
                setEstado((prev) => ({
                  ...(prev || {}),
                  cuentas: ((prev && prev.cuentas) || []).map((c) =>
                    c.id === cid ? { ...c, consumos: (c.consumos || []).filter((x) => x.id !== consumoId) } : c
                  ),
                }));
              }
            }}
            onCerrar={async () => {
              const cid = cuentaActiva.id;
              const r = await llamarApi('/api/cuenta', 'PATCH', { cuentaId: cid });
              if (r?.ok) {
                // Quitar la cuenta cerrada del estado de inmediato (libera la
                // cancha en la vista) y volver a Inicio, sin depender de la recarga.
                setEstado((prev) => ({
                  ...(prev || {}),
                  cuentas: ((prev && prev.cuentas) || []).filter((c) => c.id !== cid),
                }));
                setVista('home');
                setCuentaActivaId(null);
              }
            }}
          />
        )}

        {turno && vistaSegura === 'porCobrar' && (
          <VistaPorCobrar
            estado={estado}
            ocupado={ocupado}
            onCobrar={(cxc) => setModal({ tipo: 'cobrarDeuda', cxc })}
          />
        )}

        {turno && vistaSegura === 'cierre' && (
          <VistaCierre
            estado={estado}
            ocupado={ocupado}
            onConfirmar={async () => {
              const r = await llamarApi('/api/turno', 'PATCH', { turnoId: turno.id });
              if (r?.ok) {
                // Reflejar el cierre de inmediato: sin turno volvemos a la
                // pantalla de inicio aunque la recarga de /api/data falle.
                setEstado((prev) => ({ ...(prev || {}), turno: null, cuentas: [] }));
                setVista('home');
                setCuentaActivaId(null);
              }
            }}
            onVolver={() => setVista('home')}
          />
        )}
      </div>

      {modal?.tipo === 'nuevaCuenta' && turno && (
        <ModalNuevaCuenta
          canchaId={modal.canchaId}
          ocupado={ocupado}
          onCrear={async (jugadores) => {
            const canchaId = modal.canchaId;
            const r = await llamarApi('/api/cuenta', 'POST', {
              turno_id: turno.id,
              tipo: canchaId ? 'cancha' : 'individual',
              cancha_id: canchaId,
              jugadores,
            });
            setModal(null);
            if (r?.cuenta) {
              // CLAVE: insertamos la cuenta nueva en el estado de inmediato
              // (dedupe por id), SIN depender de la recarga de /api/data. Así
              // cuentaActiva SIEMPRE existe y el "blindaje" no nos rebota a
              // Inicio. Esta era la causa del bucle al abrir una cuenta.
              setEstado((prev) => ({
                ...(prev || {}),
                cuentas: [
                  ...(((prev && prev.cuentas) || []).filter((c) => c.id !== r.cuenta.id)),
                  r.cuenta,
                ],
              }));
              setCuentaActivaId(r.cuenta.id);
              setVista('cuenta');
              return;
            }
            // No llegó respuesta del POST (timeout, 504 de Vercel o red caída),
            // pero la cuenta PUDO crearse igual en el servidor (es justo lo que
            // pasaba: la cuenta queda abierta en la BD y al usuario lo dejaba en
            // el inicio). En vez de abandonarlo ahí, recargamos el estado real y,
            // si aparece una cuenta abierta que coincide, entramos a ella. Si de
            // verdad no se creó nada, no hay candidata y se queda en home con el
            // aviso de error visible.
            const data = await cargarDatos({ esRecarga: true });
            const candidatas = ((data && data.cuentas) || []).filter((c) =>
              canchaId ? c.cancha_id === canchaId : c.tipo === 'individual' && !c.cancha_id
            );
            const nueva = candidatas
              .slice()
              .sort((a, b) => new Date(b.fecha_apertura) - new Date(a.fecha_apertura))[0];
            if (nueva) {
              setCuentaActivaId(nueva.id);
              setVista('cuenta');
              setErrorApi(null); // la apertura sí surtió efecto: quitamos el aviso
            }
          }}
          onCancelar={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'agregarProducto' && cuentaActiva && (
        <ModalAgregarProducto
          cuenta={cuentaActiva}
          productos={estado.productos}
          ocupado={ocupado}
          onAgregar={async (payload) => {
            const r = await llamarApi('/api/consumo', 'POST', { cuenta_id: cuentaActiva.id, ...payload });
            setModal(null);
            if (r?.consumo) {
              // Reflejar el consumo en su cuenta de inmediato (dedupe por id),
              // sin depender de la recarga de /api/data.
              setEstado((prev) => ({
                ...(prev || {}),
                cuentas: ((prev && prev.cuentas) || []).map((c) =>
                  c.id === r.consumo.cuenta_id
                    ? { ...c, consumos: [...((c.consumos || []).filter((x) => x.id !== r.consumo.id)), r.consumo] }
                    : c
                ),
              }));
            }
          }}
          onCancelar={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'cobrar' && cuentaActiva && (
        <ModalCobrar
          cuenta={cuentaActiva}
          ocupado={ocupado}
          onPagar={async (payload) => {
            const cid = cuentaActiva.id;
            const r = await llamarApi('/api/pago', 'POST', { cuenta_id: cid, ...payload });
            if (r?.pago) {
              // Reflejar el pago en su cuenta de inmediato (dedupe por id) para
              // que el jugador quede saldado y se habilite "cerrar cuenta",
              // sin depender de la recarga de /api/data.
              setEstado((prev) => {
                if (!prev) return prev;
                const cuentas = (prev.cuentas || []).map((c) =>
                  c.id === cid
                    ? { ...c, pagos: [...((c.pagos || []).filter((x) => x.id !== r.pago.id)), r.pago] }
                    : c
                );
                // Si fue "fiado", reflejar también en "Por cobrar". El id real
                // de la fila no lo devuelve el server; usamos una clave temporal
                // que la próxima recarga real reemplaza por completo.
                let cuentasPorCobrar = prev.cuentasPorCobrar || [];
                if (payload.metodo === 'fiado') {
                  const key = 'tmp-' + r.pago.id;
                  cuentasPorCobrar = [
                    ...cuentasPorCobrar.filter((x) => x.id !== key),
                    {
                      id: key,
                      cuenta_id: cid,
                      jugador_id: payload.jugador_id,
                      jugador_nombre: payload.jugador_nombre || 'Sin nombre',
                      monto: payload.monto,
                      saldo_pendiente: payload.monto,
                      cobrado: false,
                      created_at: new Date().toISOString(),
                    },
                  ];
                }
                return { ...prev, cuentas, cuentasPorCobrar };
              });
            }
          }}
          onCerrar={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'cobrarDeuda' && modal.cxc && turno && (
        <ModalCobrarDeuda
          cxc={modal.cxc}
          ocupado={ocupado}
          onCancelar={() => setModal(null)}
          onCobrar={async (metodo) => {
            const cxc = modal.cxc;
            const r = await llamarApi('/api/cobrar', 'POST', { cxcId: cxc.id, metodo, turno_id: turno.id });
            setModal(null);
            if (r?.ok) {
              setEstado((prev) => {
                if (!prev) return prev;
                // Quitar la deuda de "Por cobrar" (ya quedó saldada) y reflejar
                // el ingreso en el cierre como "cobro de deudas" del turno actual,
                // sin depender de la recarga de /api/data.
                const cuentasPorCobrar = (prev.cuentasPorCobrar || []).filter((x) => x.id !== cxc.id);
                const prevRes = prev.resumenTurno || {};
                const prevCobro = prevRes.cobroDeudas || { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 };
                const monto = Number(cxc.monto) || 0;
                const cobroDeudas = { ...prevCobro };
                if (cobroDeudas[metodo] !== undefined) cobroDeudas[metodo] += monto;
                cobroDeudas.total = (Number(prevCobro.total) || 0) + monto;
                return { ...prev, cuentasPorCobrar, resumenTurno: { ...prevRes, cobroDeudas } };
              });
            }
          }}
        />
      )}
    </div>
  );
}

// ===== Layout =====
function Pantalla({ children }) {
  return <div style={{ padding: 40, maxWidth: 600, margin: '60px auto' }}>{children}</div>;
}

function Header({ turno, vista, onHome }) {
  return (
    <div style={{ background: 'linear-gradient(90deg, #1A3D4D 0%, #2E84A6 100%)', color: 'white', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #F2B749' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F2B749', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎾</div>
        <div>
          <div className="display" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>OASIS POS</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, letterSpacing: '0.1em' }}>PÁDEL CLUB</div>
        </div>
      </div>
      {turno && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {vista !== 'home' && (
            <button onClick={onHome} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>← Inicio</button>
          )}
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 14px', borderRadius: 10, fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>Cajera: </span><strong>{turno.cajera}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Vista: abrir turno =====
function VistaInicio({ onAbrir, onForzarCierre, ocupado }) {
  const [cajera, setCajera] = useState('');
  const [base, setBase] = useState('');
  return (
    <div style={{ maxWidth: 440, margin: '40px auto', textAlign: 'center' }}>
      <div className="display" style={{ fontSize: 36, fontWeight: 800, marginBottom: 6 }}>Buen día</div>
      <p style={{ color: '#5C7785', marginBottom: 32 }}>Abre tu turno para empezar a operar</p>
      <div style={{ background: 'white', borderRadius: 22, padding: 28, boxShadow: '0 20px 50px rgba(46,132,166,0.15)', textAlign: 'left' }}>
        <label style={lbl}>¿Quién está abriendo?</label>
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 20px' }}>
          {['Laura', 'Ana', 'Pipe', 'Felipe'].map((n) => (
            <button key={n} onClick={() => setCajera(n)} style={{ flex: 1, padding: 12, borderRadius: 10, border: cajera === n ? '2px solid #2E84A6' : '2px solid #E5E5E5', background: cajera === n ? '#2E84A6' : 'white', color: cajera === n ? 'white' : '#1A3D4D', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{n}</button>
          ))}
        </div>
        <label style={lbl}>Base de caja inicial</label>
        <div style={{ position: 'relative', margin: '10px 0 28px' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 700, color: '#5C7785' }}>$</span>
          <input type="number" value={base} onChange={(e) => setBase(e.target.value)} placeholder="50000" style={{ width: '100%', padding: '16px 18px 16px 34px', borderRadius: 10, border: '2px solid #E5E5E5', fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => cajera && base !== '' && onAbrir(cajera, Number(base))} disabled={!cajera || base === '' || ocupado} style={{ ...btnPri, width: '100%', background: cajera && base !== '' && !ocupado ? 'linear-gradient(135deg,#F2B749,#E8A82B)' : '#E5E5E5', color: cajera && base !== '' ? '#1A3D4D' : '#999', fontSize: 16 }}>{ocupado ? 'Abriendo…' : 'ABRIR TURNO →'}</button>
      </div>

      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <p style={{ color: '#8A7B5F', fontSize: 12, marginBottom: 8, lineHeight: 1.4 }}>
          ¿Te dice <strong>“ya hay un turno abierto”</strong> pero no te deja entrar?
        </p>
        <button
          onClick={onForzarCierre}
          disabled={ocupado}
          style={{ background: 'white', border: '2px solid #C0392B', color: '#C0392B', padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: ocupado ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit', opacity: ocupado ? 0.6 : 1 }}
        >
          {ocupado ? 'Procesando…' : '🔓 Cerrar turno abierto y empezar de cero'}
        </button>
      </div>
    </div>
  );
}

// ===== Vista: home =====
function VistaHome({ estado, onAbrirCancha, onNuevaSuelta, onVerCuenta, onPorCobrar, onCerrarTurno }) {
  const cuentas = estado.cuentas || [];
  const cxc = estado.cuentasPorCobrar || [];
  const resumen = estado.resumenTurno || {};
  const totalCxc = cxc.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const sueltas = cuentas.filter((c) => !c.cancha_id);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <Kpi label="Vendido en el turno" value={fmt(resumen.totalVentas)} color="#2E84A6" />
        <Kpi label="Cuentas activas" value={cuentas.length} color="#60AEBF" />
        <Kpi label="Por cobrar" value={fmt(totalCxc)} color="#C0392B" onClick={onPorCobrar} />
      </div>

      <Titulo>Canchas</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        {CANCHAS.map((cancha) => {
          const cuenta = cuentas.find((c) => c.cancha_id === cancha.id);
          const ocupada = !!cuenta;
          return (
            <button key={cancha.id} onClick={() => (ocupada ? onVerCuenta(cuenta.id) : onAbrirCancha(cancha.id))} style={{ position: 'relative', background: ocupada ? 'linear-gradient(135deg,#1A3D4D,#2E84A6)' : 'linear-gradient(135deg,#fff,#f8f5ec)', color: ocupada ? 'white' : '#1A3D4D', border: ocupada ? 'none' : '2px dashed #60AEBF', borderRadius: 18, padding: 24, cursor: 'pointer', textAlign: 'left', minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              {ocupada && <div style={{ position: 'absolute', top: 18, right: 18, background: '#F2B749', color: '#1A3D4D', fontSize: 10, fontWeight: 800, padding: '4px 9px', borderRadius: 18 }}>EN JUEGO</div>}
              <div>
                <div className="display" style={{ fontSize: 26, fontWeight: 800 }}>{cancha.nombre}</div>
                {ocupada ? (
                  <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                    <div>👥 {(cuenta.jugadores || []).map((j) => j.nombre).join(' · ')}</div>
                    <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6, color: '#F2B749' }}>{fmt(totalCuenta(cuenta))}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 6, color: '#5C7785', fontSize: 13 }}>Toca para abrir cuenta</div>
                )}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: ocupada ? 'rgba(255,255,255,0.15)' : '#2E84A6', color: 'white', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, width: 'fit-content' }}>{ocupada ? 'Ver cuenta →' : '+ Abrir cuenta'}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Titulo sinMargen>Otras cuentas</Titulo>
        <button onClick={onNuevaSuelta} style={{ background: '#1A3D4D', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Nueva cuenta sin cancha</button>
      </div>
      <div style={{ marginBottom: 20 }}>
        {sueltas.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.5)', border: '2px dashed #C8B987', borderRadius: 14, padding: 24, textAlign: 'center', color: '#8A7B5F', fontSize: 13 }}>Sin cuentas sueltas. Útiles para torneos o bar.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
            {sueltas.map((c) => (
              <button key={c.id} onClick={() => onVerCuenta(c.id)} style={{ background: 'white', border: '2px solid #60AEBF', borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{(c.jugadores || []).map((j) => j.nombre).join(' · ')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2E84A6', marginTop: 6 }}>{fmt(totalCuenta(c))}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button onClick={onPorCobrar} style={{ background: 'white', border: '2px solid #C0392B', color: '#C0392B', padding: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⚠ Por Cobrar ({cxc.length})</button>
        <button onClick={onCerrarTurno} style={{ background: 'linear-gradient(135deg,#F2B749,#E8A82B)', border: 'none', color: '#1A3D4D', padding: 14, borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>🧾 CERRAR TURNO</button>
      </div>
    </div>
  );
}

// ===== Vista: detalle de cuenta =====
function VistaCuenta({ cuenta, productos, onAgregar, onCobrar, onEliminarConsumo, onCerrar, ocupado }) {
  const total = totalCuenta(cuenta);
  const pagado = totalPagado(cuenta);
  const saldo = total - pagado;
  const desglose = desglosePorJugador(cuenta);
  // La cuenta se puede cerrar cuando todos los jugadores quedaron saldados.
  // Es más fiable que mirar el saldo total, que puede dejar residuos de
  // redondeo (ej. 10000/3 = 9999 cobrado, 1 peso de diferencia).
  const todosSaldados =
    desglose.length > 0 &&
    desglose.every((d) => saldado(d.total - pagadoPorJugador(cuenta, d.jugadorId)));
  const cancha = CANCHAS.find((c) => c.id === cuenta.cancha_id);
  const iconoProducto = (id) => (productos.find((p) => p.id === id) || {}).icono || '•';

  return (
    <div>
      <div style={{ background: 'white', borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: '0 5px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5C7785', fontWeight: 700, letterSpacing: '0.05em' }}>{cancha ? cancha.nombre.toUpperCase() : 'CUENTA SIN CANCHA'}</div>
            <div className="display" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{(cuenta.jugadores || []).map((j) => j.nombre).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#5C7785', fontWeight: 700 }}>SALDO</div>
            <div className="display" style={{ fontSize: 26, fontWeight: 800, color: saldo > 0 ? '#C0392B' : '#27AE60' }}>{fmt(saldo)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0F0F0', fontSize: 12 }}>
          <div><span style={{ color: '#5C7785' }}>Total: </span><strong>{fmt(total)}</strong></div>
          <div><span style={{ color: '#5C7785' }}>Pagado: </span><strong style={{ color: '#27AE60' }}>{fmt(pagado)}</strong></div>
        </div>
      </div>

      <Titulo>Cuenta por jugador</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 20 }}>
        {desglose.map((d) => {
          const pj = pagadoPorJugador(cuenta, d.jugadorId);
          const completo = saldado(d.total - pj) && d.total > 0;
          return (
            <div key={d.jugadorId} style={{ background: completo ? '#E8F5E9' : 'white', border: completo ? '2px solid #27AE60' : '2px solid #F0F0F0', borderRadius: 12, padding: 14, position: 'relative' }}>
              {completo && <div style={{ position: 'absolute', top: 10, right: 10, background: '#27AE60', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>✓</div>}
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.nombre}</div>
              <div style={{ fontSize: 10, color: '#5C7785', marginTop: 4 }}>{d.items} {d.items === 1 ? 'ítem' : 'ítems'}</div>
              <div className="display" style={{ fontSize: 20, fontWeight: 800, color: completo ? '#27AE60' : '#1A3D4D', marginTop: 6 }}>{fmt(d.total)}</div>
            </div>
          );
        })}
      </div>

      <Titulo>Consumos</Titulo>
      <div style={{ background: 'white', borderRadius: 14, padding: (cuenta.consumos || []).length === 0 ? 24 : 6, marginBottom: 20, boxShadow: '0 3px 12px rgba(0,0,0,0.04)' }}>
        {(cuenta.consumos || []).length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8A7B5F', fontSize: 13 }}>Aún no hay consumos. Toca "+ Agregar producto".</div>
        ) : (
          (cuenta.consumos || []).map((co) => (
            <div key={co.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
              <div style={{ fontSize: 22 }}>{iconoProducto(co.producto_id)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{co.nombre_snapshot} × {co.cantidad}</div>
                <div style={{ fontSize: 11, color: '#5C7785', marginTop: 2 }}>
                  {co.tipo_asignacion === 'individual'
                    ? `Para: ${((cuenta.jugadores || []).find((j) => j.id === (co.asignacion_jugadores || [])[0]) || {}).nombre || '?'}`
                    : `Dividido entre ${(co.asignacion_jugadores || []).length}`}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(co.total)}</div>
              <button onClick={() => onEliminarConsumo(co.id)} disabled={ocupado} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#C0392B', padding: 4, fontSize: 16 }}>🗑</button>
            </div>
          ))
        )}
      </div>

      {(cuenta.pagos || []).length > 0 && (
        <>
          <Titulo>Pagos registrados</Titulo>
          <div style={{ background: 'white', borderRadius: 14, padding: 6, marginBottom: 20, boxShadow: '0 3px 12px rgba(0,0,0,0.04)' }}>
            {(cuenta.pagos || []).map((p) => {
              const m = METODOS.find((x) => x.v === p.metodo) || {};
              const j = (cuenta.jugadores || []).find((x) => x.id === p.jugador_id) || {};
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
                  <div style={{ fontSize: 18 }}>{m.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{j.nombre || '?'}</div>
                    <div style={{ fontSize: 11, color: '#5C7785' }}>{m.label}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{fmt(p.monto)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <button onClick={onAgregar} disabled={ocupado} style={{ ...btnPri, background: '#2E84A6', color: 'white' }}>+ AGREGAR PRODUCTO</button>
        <button onClick={onCobrar} disabled={ocupado || todosSaldados} style={{ ...btnPri, background: !todosSaldados ? '#1A3D4D' : '#CCC', color: 'white' }}>$ COBRAR</button>
      </div>
      {todosSaldados && total > 0 && (
        <button onClick={onCerrar} disabled={ocupado} style={{ ...btnPri, width: '100%', background: 'linear-gradient(135deg,#27AE60,#229954)', color: 'white', fontSize: 15 }}>✓ CERRAR CUENTA Y LIBERAR CANCHA</button>
      )}
      {total === 0 && (
        <button onClick={onCerrar} disabled={ocupado} style={{ ...btnPri, width: '100%', background: '#5C7785', color: 'white', fontSize: 15 }}>✕ CANCELAR CUENTA VACÍA Y LIBERAR CANCHA</button>
      )}
    </div>
  );
}

// ===== Vista: por cobrar =====
function VistaPorCobrar({ estado, onCobrar, ocupado }) {
  const lista = estado.cuentasPorCobrar || [];
  const total = lista.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#C0392B,#962D22)', color: 'white', borderRadius: 18, padding: 22, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>TOTAL POR COBRAR</div>
        <div className="display" style={{ fontSize: 36, fontWeight: 800 }}>{fmt(total)}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{lista.length} {lista.length === 1 ? 'cuenta pendiente' : 'cuentas pendientes'}</div>
      </div>
      {lista.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.5)', border: '2px dashed #C8B987', borderRadius: 14, padding: 32, textAlign: 'center', color: '#8A7B5F' }}>✨ No hay deudas pendientes.</div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, padding: 6 }}>
          {lista.map((c) => {
            // Las deudas optimistas (clave "tmp-…") aún no tienen id real en la
            // BD; no se pueden cobrar hasta que /api/data las traiga de verdad.
            const esTemporal = String(c.id).startsWith('tmp-');
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderBottom: '1px solid #F0F0F0' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#FFE4E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.jugador_nombre}</div>
                  <div style={{ fontSize: 11, color: '#5C7785' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : ''}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#C0392B' }}>{fmt(c.monto)}</div>
                <button
                  onClick={() => !esTemporal && onCobrar && onCobrar(c)}
                  disabled={ocupado || esTemporal}
                  title={esTemporal ? 'Espera unos segundos a que se sincronice esta deuda para poder cobrarla' : ''}
                  style={{ background: esTemporal ? '#E5E5E5' : '#27AE60', color: esTemporal ? '#999' : 'white', border: 'none', padding: '8px 12px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: ocupado || esTemporal ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  Cobrar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== Vista: cierre de turno (Fase 3) =====
function VistaCierre({ estado, onConfirmar, onVolver, ocupado }) {
  const turno = estado.turno || {};
  const r = estado.resumenTurno || {};
  const cuentas = estado.cuentas || [];
  const base = Number(turno.base_caja) || 0;
  const efectivo = Number(r.efectivo) || 0;
  // Cobro de deudas de cartera hechas HOY: entra a caja pero no es venta de hoy.
  const cobro = r.cobroDeudas || { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 };
  const cobroEfectivo = Number(cobro.efectivo) || 0;
  const cobroTotal = Number(cobro.total) || 0;
  const cajaEsperada = base + efectivo + cobroEfectivo;
  const hayCuentasAbiertas = cuentas.length > 0;
  const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 28, fontWeight: 800 }}>Cierre del Turno</div>
        <p style={{ color: '#5C7785', fontSize: 13, marginTop: 3 }}>Toma una foto de este reporte y mándalo por WhatsApp</p>
      </div>

      {hayCuentasAbiertas && (
        <div style={{ background: '#FCEBEB', border: '2px solid #C0392B', borderRadius: 12, padding: 14, marginBottom: 16, color: '#791F1F', fontSize: 13 }}>
          🔒 No puedes cerrar el turno todavía: tienes {cuentas.length} {cuentas.length === 1 ? 'cuenta abierta' : 'cuentas abiertas'}. Cobra (o fía) y cierra cada cuenta primero para que la caja cuadre.
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 20, padding: 26, boxShadow: '0 18px 50px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px dashed #E5E5E5', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 26, marginBottom: 3 }}>🎾</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 800 }}>OASIS PÁDEL CLUB</div>
          <div style={{ fontSize: 12, color: '#5C7785', marginTop: 3 }}>Cierre de turno · {hoy}</div>
          <div style={{ fontSize: 12, color: '#5C7785' }}>Cajera: <strong>{turno.cajera}</strong> · Apertura: {fmt(base)}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7785', letterSpacing: '0.05em', marginBottom: 10 }}>INGRESOS POR MÉTODO DE PAGO</div>
          <Fila icon="💵" label="Efectivo" value={r.efectivo} color="#27AE60" />
          <Fila icon="🔁" label="Transferencia" value={r.transferencia} color="#2E84A6" />
          <Fila icon="💳" label="Tarjeta" value={r.tarjeta} color="#8E44AD" />
          <Fila icon="⚠" label="Fiado (no cobrado)" value={r.fiado} color="#C0392B" />
          <div style={{ borderTop: '2px solid #1A3D4D', marginTop: 10, paddingTop: 10 }}>
            <Fila icon="📊" label="VENTAS TOTALES" value={r.totalVentas} color="#1A3D4D" bold />
          </div>
        </div>

        {cobroTotal > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7785', letterSpacing: '0.05em', marginBottom: 4 }}>COBRO DE DEUDAS (DE OTROS DÍAS)</div>
            <div style={{ fontSize: 10, color: '#8A7B5F', marginBottom: 8, lineHeight: 1.4 }}>Ventas fiadas en días anteriores que se cobraron HOY. No cuentan como venta de hoy, pero el dinero sí entró hoy a la caja.</div>
            <Fila icon="💵" label="Efectivo" value={cobro.efectivo} color="#27AE60" />
            <Fila icon="🔁" label="Transferencia" value={cobro.transferencia} color="#2E84A6" />
            <Fila icon="💳" label="Tarjeta" value={cobro.tarjeta} color="#8E44AD" />
            <div style={{ borderTop: '1px dashed #C8B987', marginTop: 8, paddingTop: 8 }}>
              <Fila icon="📥" label="TOTAL COBRADO DE CARTERA" value={cobro.total} color="#1A3D4D" bold />
            </div>
          </div>
        )}

        <div style={{ background: '#F2EBDC', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7785', letterSpacing: '0.05em', marginBottom: 10 }}>CAJA FÍSICA (EFECTIVO)</div>
          <Fila label="Base de apertura" value={base} />
          <Fila label="Ventas en efectivo" value={r.efectivo} />
          {cobroEfectivo > 0 && <Fila label="Cobro de deudas en efectivo" value={cobroEfectivo} />}
          <div style={{ borderTop: '1px solid #C8B987', marginTop: 6, paddingTop: 6 }}>
            <Fila label="DEBE HABER EN CAJA" value={cajaEsperada} bold />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          <MiniStat label="Cuentas cerradas" value={r.cuentasCerradas || 0} />
          <MiniStat label="Productos" value={r.productosVendidos || 0} />
          <MiniStat label="Por cobrar" value={(estado.cuentasPorCobrar || []).length} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onVolver} style={btnSec}>← Volver</button>
        <button onClick={onConfirmar} disabled={ocupado || hayCuentasAbiertas} style={{ ...btnPri, flex: 2, background: ocupado || hayCuentasAbiertas ? '#999' : '#1A3D4D', color: 'white' }}>{ocupado ? 'Cerrando…' : hayCuentasAbiertas ? 'CIERRA LAS CUENTAS PRIMERO' : 'CERRAR TURNO DEFINITIVAMENTE'}</button>
      </div>
    </div>
  );
}

function Fila({ icon, label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 500 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span>{icon}</span>}
        <span style={{ color: color || '#1A3D4D' }}>{label}</span>
      </div>
      <div style={{ color: color || '#1A3D4D' }}>{fmt(value)}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ background: '#F9F7F2', borderRadius: 10, padding: 10, textAlign: 'center' }}>
      <div className="display" style={{ fontSize: 22, fontWeight: 800, color: '#1A3D4D' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#5C7785', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</div>
    </div>
  );
}

// ===== Modal: nueva cuenta =====
function ModalNuevaCuenta({ canchaId, onCrear, onCancelar, ocupado }) {
  const [jugadores, setJugadores] = useState(['', '', '', '']);
  const set = (i, v) => { const j = [...jugadores]; j[i] = v; setJugadores(j); };
  const validos = jugadores.filter((j) => j.trim() !== '');
  const cancha = CANCHAS.find((c) => c.id === canchaId);
  return (
    <Modal onClose={onCancelar}>
      <div className="display" style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{cancha ? `Abrir ${cancha.nombre}` : 'Nueva cuenta'}</div>
      <p style={{ color: '#5C7785', fontSize: 13, marginBottom: 20 }}>¿Quiénes van a jugar / consumir?</p>
      <div style={{ marginBottom: 20 }}>
        {jugadores.map((j, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ minWidth: 30, height: 30, borderRadius: '50%', background: '#60AEBF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{i + 1}</div>
            <input type="text" value={j} onChange={(e) => set(i, e.target.value)} placeholder={`Jugador ${i + 1}`} style={inp} />
            {jugadores.length > 1 && <button onClick={() => setJugadores(jugadores.filter((_, x) => x !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 18 }}>×</button>}
          </div>
        ))}
        <button onClick={() => setJugadores([...jugadores, ''])} style={{ background: 'transparent', border: '2px dashed #60AEBF', color: '#2E84A6', padding: 9, borderRadius: 9, cursor: 'pointer', fontWeight: 600, width: '100%', fontSize: 12 }}>+ Agregar otro jugador</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancelar} style={btnSec}>Cancelar</button>
        <button onClick={() => validos.length > 0 && onCrear(validos)} disabled={validos.length === 0 || ocupado} style={{ ...btnPri, flex: 2, background: validos.length > 0 && !ocupado ? '#1A3D4D' : '#E5E5E5', color: validos.length > 0 ? 'white' : '#999' }}>{ocupado ? 'Creando…' : 'ABRIR CUENTA →'}</button>
      </div>
    </Modal>
  );
}

// ===== Modal: agregar producto =====
function ModalAgregarProducto({ cuenta, productos, onAgregar, onCancelar, ocupado }) {
  const [cat, setCat] = useState('Alquiler cancha');
  const [sel, setSel] = useState(null);
  const [cant, setCant] = useState(1);
  const [tipo, setTipo] = useState('split');
  const [individual, setIndividual] = useState(null);
  const jugadores = cuenta.jugadores || [];
  const [seleccionados, setSeleccionados] = useState(jugadores.map((j) => j.id));
  const filtrados = productos.filter((p) => p.categoria === cat);
  const producto = productos.find((p) => p.id === sel);
  const puede = producto && cant > 0 && (tipo === 'individual' ? individual : seleccionados.length > 0);

  function confirmar() {
    if (!puede) return;
    onAgregar({
      producto_id: producto.id,
      nombre_snapshot: producto.nombre,
      precio_unitario: producto.precio,
      cantidad: cant,
      total: Number(producto.precio) * cant,
      tipo_asignacion: tipo,
      asignacion_jugadores: tipo === 'individual' ? [individual] : seleccionados,
    });
  }

  return (
    <Modal onClose={onCancelar}>
      <div className="display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Agregar producto</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {CATEGORIAS.map((c) => (
          <button key={c} onClick={() => { setCat(c); setSel(null); }} style={{ padding: '7px 12px', borderRadius: 18, border: 'none', background: cat === c ? '#1A3D4D' : '#F0F0F0', color: cat === c ? 'white' : '#5C7785', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>{c}</button>
        ))}
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 6 }}>
        {filtrados.map((p) => (
          <button key={p.id} onClick={() => setSel(p.id)} style={{ padding: '10px 8px', borderRadius: 10, border: sel === p.id ? '2px solid #2E84A6' : '2px solid #E5E5E5', background: sel === p.id ? '#E8F4F8' : 'white', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 18, marginBottom: 3 }}>{p.icono}</div>
            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}>{p.nombre}</div>
            <div style={{ fontSize: 10, color: '#2E84A6', fontWeight: 700, marginTop: 3 }}>{fmt(p.precio)}</div>
          </button>
        ))}
      </div>
      {producto && (
        <div>
          <label style={lbl}>Cantidad</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 16px' }}>
            <button onClick={() => setCant(Math.max(1, cant - 1))} style={btnNum}>−</button>
            <div className="display" style={{ fontSize: 24, fontWeight: 800, minWidth: 36, textAlign: 'center' }}>{cant}</div>
            <button onClick={() => setCant(cant + 1)} style={btnNum}>+</button>
          </div>
          <label style={lbl}>¿Para quién?</label>
          <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px' }}>
            <button onClick={() => setTipo('individual')} style={{ flex: 1, padding: 9, borderRadius: 9, border: tipo === 'individual' ? '2px solid #2E84A6' : '2px solid #E5E5E5', background: tipo === 'individual' ? '#E8F4F8' : 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>👤 Un jugador</button>
            <button onClick={() => setTipo('split')} style={{ flex: 1, padding: 9, borderRadius: 9, border: tipo === 'split' ? '2px solid #2E84A6' : '2px solid #E5E5E5', background: tipo === 'split' ? '#E8F4F8' : 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>👥 Dividir</button>
          </div>
          {tipo === 'individual' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
              {jugadores.map((j) => (
                <button key={j.id} onClick={() => setIndividual(j.id)} style={chip(individual === j.id)}>{j.nombre}</button>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#5C7785', marginBottom: 6 }}>Se divide entre los seleccionados ({seleccionados.length} de {jugadores.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {jugadores.map((j) => {
                  const s = seleccionados.includes(j.id);
                  return <button key={j.id} onClick={() => setSeleccionados(s ? seleccionados.filter((x) => x !== j.id) : [...seleccionados, j.id])} style={chip(s)}>{s ? '✓ ' : ''}{j.nombre}</button>;
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancelar} style={btnSec}>Cancelar</button>
        <button onClick={confirmar} disabled={!puede || ocupado} style={{ ...btnPri, flex: 2, background: puede && !ocupado ? '#1A3D4D' : '#E5E5E5', color: puede ? 'white' : '#999' }}>{ocupado ? 'Agregando…' : 'AGREGAR →'}</button>
      </div>
    </Modal>
  );
}

// ===== Modal: cobrar =====
function ModalCobrar({ cuenta, onPagar, onCerrar, ocupado }) {
  const desglose = desglosePorJugador(cuenta);
  const [jugadorId, setJugadorId] = useState(null);
  const [metodo, setMetodo] = useState(null);
  const [monto, setMonto] = useState('');

  const d = desglose.find((x) => x.jugadorId === jugadorId);
  const yaPagado = jugadorId ? pagadoPorJugador(cuenta, jugadorId) : 0;
  const pendiente = d ? Math.round(d.total - yaPagado) : 0;

  async function confirmar() {
    if (!jugadorId || !metodo || !monto || Number(monto) <= 0) return;
    const jugador = (cuenta.jugadores || []).find((j) => j.id === jugadorId) || {};
    await onPagar({ jugador_id: jugadorId, jugador_nombre: jugador.nombre, monto: Number(monto), metodo });
    setJugadorId(null); setMetodo(null); setMonto('');
  }

  if (jugadorId && d) {
    return (
      <Modal onClose={onCerrar}>
        <button onClick={() => setJugadorId(null)} style={{ background: 'transparent', border: 'none', color: '#5C7785', cursor: 'pointer', marginBottom: 10, fontSize: 12 }}>← Cambiar jugador</button>
        <div style={{ fontSize: 11, color: '#5C7785', fontWeight: 700 }}>COBRANDO A</div>
        <div className="display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 14 }}>{d.nombre}</div>
        <div style={{ background: '#F2EBDC', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>Total a cargo:</span><strong>{fmt(d.total)}</strong></div>
          {yaPagado > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, color: '#27AE60' }}><span>Ya pagado:</span><strong>{fmt(yaPagado)}</strong></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 5, paddingTop: 5, borderTop: '1px solid #C8B987' }}><span>Pendiente:</span><span>{fmt(pendiente)}</span></div>
        </div>
        <label style={lbl}>Monto a cobrar</label>
        <div style={{ position: 'relative', margin: '6px 0 4px' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: '#5C7785' }}>$</span>
          <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={String(Math.round(pendiente))} style={{ ...inp, paddingLeft: 30, fontSize: 18 }} />
        </div>
        <button onClick={() => setMonto(String(Math.round(pendiente)))} style={{ background: 'transparent', border: 'none', color: '#2E84A6', cursor: 'pointer', fontWeight: 700, fontSize: 11, marginBottom: 14 }}>Cobrar total pendiente ({fmt(pendiente)})</button>
        <label style={lbl}>Método de pago</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7, margin: '6px 0 16px' }}>
          {METODOS.map((m) => (
            <button key={m.v} onClick={() => setMetodo(m.v)} style={{ padding: 12, borderRadius: 10, border: metodo === m.v ? `2px solid ${m.color}` : '2px solid #E5E5E5', background: metodo === m.v ? m.color : 'white', color: metodo === m.v ? 'white' : '#1A3D4D', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{m.icon} {m.label}</button>
          ))}
        </div>
        <button onClick={confirmar} disabled={!monto || !metodo || Number(monto) <= 0 || ocupado} style={{ ...btnPri, width: '100%', background: monto && metodo && Number(monto) > 0 && !ocupado ? '#1A3D4D' : '#E5E5E5', color: monto && metodo ? 'white' : '#999' }}>{ocupado ? 'Registrando…' : 'CONFIRMAR PAGO →'}</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onCerrar}>
      <div className="display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>¿Quién va a pagar?</div>
      <p style={{ color: '#5C7785', fontSize: 12, marginBottom: 16 }}>Selecciona el jugador y luego el método</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {desglose.map((d) => {
          const pj = pagadoPorJugador(cuenta, d.jugadorId);
          const pend = d.total - pj;
          const completo = saldado(pend) && d.total > 0;
          return (
            <button key={d.jugadorId} onClick={() => !completo && d.total > 0 && setJugadorId(d.jugadorId)} disabled={completo || d.total === 0} style={{ padding: 14, borderRadius: 12, border: completo ? '2px solid #27AE60' : '2px solid #E5E5E5', background: completo ? '#E8F5E9' : 'white', cursor: completo || d.total === 0 ? 'default' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d.nombre}</div>
                <div style={{ fontSize: 11, color: '#5C7785', marginTop: 2 }}>{completo ? '✓ Pagado completo' : `Pendiente: ${fmt(pend)} de ${fmt(d.total)}`}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: completo ? '#27AE60' : '#1A3D4D' }}>{fmt(pend)}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ===== Modal: cobrar una deuda de cartera =====
function ModalCobrarDeuda({ cxc, onCobrar, onCancelar, ocupado }) {
  const [metodo, setMetodo] = useState(null);
  // No se puede saldar una deuda con otra deuda: se excluye "fiado".
  const metodos = METODOS.filter((m) => m.v !== 'fiado');
  return (
    <Modal onClose={onCancelar}>
      <div className="display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Cobrar deuda</div>
      <p style={{ color: '#5C7785', fontSize: 12, marginBottom: 16 }}>Registra el pago de una venta fiada de días anteriores. Entra a la caja de HOY como “cobro de deudas”, no como venta de hoy.</p>
      <div style={{ background: '#F2EBDC', borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{cxc.jugador_nombre}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 12, color: '#5C7785' }}>Monto a cobrar</span>
          <span className="display" style={{ fontSize: 24, fontWeight: 800, color: '#C0392B' }}>{fmt(cxc.monto)}</span>
        </div>
      </div>
      <label style={lbl}>¿Cómo te pagó?</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, margin: '6px 0 16px' }}>
        {metodos.map((m) => (
          <button key={m.v} onClick={() => setMetodo(m.v)} style={{ padding: 12, borderRadius: 10, border: metodo === m.v ? `2px solid ${m.color}` : '2px solid #E5E5E5', background: metodo === m.v ? m.color : 'white', color: metodo === m.v ? 'white' : '#1A3D4D', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancelar} style={btnSec}>Cancelar</button>
        <button onClick={() => metodo && onCobrar(metodo)} disabled={!metodo || ocupado} style={{ ...btnPri, flex: 2, background: metodo && !ocupado ? '#27AE60' : '#E5E5E5', color: metodo ? 'white' : '#999' }}>{ocupado ? 'Registrando…' : 'CONFIRMAR COBRO →'}</button>
      </div>
    </Modal>
  );
}

// ===== Auxiliares =====
function Kpi({ label, value, color, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'white', borderRadius: 14, padding: 14, boxShadow: '0 3px 12px rgba(0,0,0,0.04)', cursor: onClick ? 'pointer' : 'default', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A3D4D' }}>{value}</div>
    </div>
  );
}

function Titulo({ children, sinMargen }) {
  return <div className="display" style={{ fontWeight: 700, fontSize: 20, color: '#1A3D4D', marginBottom: sinMargen ? 0 : 12 }}>{children}</div>;
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,61,77,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 22, padding: 28, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>{children}</div>
    </div>
  );
}

// ===== Estilos =====
const lbl = { fontSize: 12, fontWeight: 700, color: '#5C7785', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inp = { flex: 1, width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #E5E5E5', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnPri = { padding: 14, borderRadius: 12, border: 'none', fontWeight: 800, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' };
const btnSec = { flex: 1, padding: 12, borderRadius: 10, border: '2px solid #E5E5E5', background: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const btnNum = { width: 38, height: 38, borderRadius: 10, border: '2px solid #2E84A6', background: 'white', color: '#2E84A6', fontSize: 20, fontWeight: 800, cursor: 'pointer' };
const chip = (active) => ({ padding: '8px 12px', borderRadius: 18, border: 'none', background: active ? '#1A3D4D' : '#F0F0F0', color: active ? 'white' : '#1A3D4D', fontWeight: 700, cursor: 'pointer', fontSize: 12 });
