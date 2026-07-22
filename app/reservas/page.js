'use client';

// Calendario de reservas · Oasis Pádel Club
//
// Vista de día con una columna por cancha. Pensado para celular:
//  - Tocar un espacio libre crea una reserva a esa hora en esa cancha.
//  - Tocar una reserva la abre para ver/editar/cancelar.
//  - El botón flotante (+) crea una reserva desde cero.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  navy: '#1A3D4D',
  petroleo: '#2E84A6',
  turquesa: '#60AEBF',
  dorado: '#F2B749',
  doradoOsc: '#E8A82B',
  beigeBorde: '#C8B987',
  rojo: '#C0392B',
  verde: '#27AE60',
  morado: '#8E44AD',
  textoTenue: '#6B7C85',
};

const CANCHAS = [
  { id: 'C1', nombre: 'Cancha 1' },
  { id: 'C2', nombre: 'Cancha 2' },
];
const DURACIONES = [60, 90, 120];

// Rejilla horaria del día.
const HORA_MIN = 6; // 6:00 am
const HORA_MAX = 23; // 11:00 pm
const PX_POR_MIN = 1; // 60 px por hora

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// ---- Helpers de fecha/hora en horario LOCAL (evita el desfase UTC) ----
function aISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function hoyISO() {
  return aISO(new Date());
}
function sumarDias(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + dias);
  return aISO(dt);
}
function fechaBonita(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const txt = dt.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
function aMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + (m || 0);
}
function aHHMM(minutos) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(minutos / 60) % 24)}:${p(minutos % 60)}`;
}

const PAGO_ESTILO = {
  ninguno: { color: C.petroleo, etiqueta: null },
  abono: { color: C.verde, etiqueta: 'ABONO' },
  descuento: { color: C.morado, etiqueta: 'DCTO' },
};

// Formulario vacío para una nueva reserva.
function formNuevo(fecha, cancha_id = 'C1', hora = '18:00') {
  return {
    id: null,
    nombre: '',
    jugador2: '',
    jugador3: '',
    jugador4: '',
    cancha_id,
    fecha,
    hora_inicio: hora,
    duracion_min: 90,
    tipo_pago: 'ninguno',
    valor: '',
    notas: '',
  };
}

export default function ReservasApp() {
  const router = useRouter();
  // fecha arranca en null y se fija tras montar: evita desajustes de
  // hidratación (la página se prerenderiza en el servidor con otra fecha/zona).
  const [fecha, setFecha] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [modal, setModal] = useState(null); // { form, esNueva }
  const scrollRef = useRef(null);
  const yaAutoScroll = useRef(false);

  const cargar = useCallback(async (f) => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(`/api/reservas?desde=${f}&hasta=${f}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.status === 401) {
        window.location.href = '/reservas/login';
        return;
      }
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Error cargando reservas.');
      setReservas(json.reservas || []);
      if (json.usuario) setUsuario(json.usuario);
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setFecha((f) => f || hoyISO());
  }, []);

  useEffect(() => {
    if (fecha) cargar(fecha);
  }, [fecha, cargar]);

  // Al abrir por primera vez en "hoy", centra la vista cerca de la hora actual.
  useEffect(() => {
    if (yaAutoScroll.current || !scrollRef.current || fecha !== hoyISO()) return;
    const ahora = new Date();
    const min = ahora.getHours() * 60 + ahora.getMinutes() - HORA_MIN * 60;
    if (min > 0) {
      scrollRef.current.scrollTop = Math.max(0, min * PX_POR_MIN - 120);
    }
    yaAutoScroll.current = true;
  }, [cargando, fecha]);

  async function salir() {
    await fetch('/api/reservas/login', { method: 'DELETE' }).catch(() => {});
    router.replace('/reservas/login');
  }

  // Toque en un espacio libre de una columna: nueva reserva a esa hora.
  function tocarColumna(e, canchaId) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let min = HORA_MIN * 60 + y / PX_POR_MIN;
    min = Math.floor(min / 30) * 30; // redondea hacia abajo a la media hora
    min = Math.max(HORA_MIN * 60, Math.min(min, HORA_MAX * 60 - 60));
    setModal({ esNueva: true, form: formNuevo(fecha, canchaId, aHHMM(min)) });
  }

  function abrirReserva(r) {
    setModal({
      esNueva: false,
      form: {
        id: r.id,
        nombre: r.nombre || '',
        jugador2: r.jugador2 || '',
        jugador3: r.jugador3 || '',
        jugador4: r.jugador4 || '',
        cancha_id: r.cancha_id,
        fecha: r.fecha,
        hora_inicio: String(r.hora_inicio).slice(0, 5),
        duracion_min: r.duracion_min,
        tipo_pago: r.tipo_pago || 'ninguno',
        valor: r.valor ? String(r.valor) : '',
        notas: r.notas || '',
        creada_por: r.creada_por,
      },
    });
  }

  if (!fecha) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textoTenue, fontWeight: 700 }}>Cargando…</div>
      </div>
    );
  }

  const esHoy = fecha === hoyISO();
  const ahoraMin = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  const altoGrid = (HORA_MAX - HORA_MIN) * 60 * PX_POR_MIN;
  const horas = [];
  for (let h = HORA_MIN; h < HORA_MAX; h++) horas.push(h);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ---------- Encabezado ---------- */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(242,235,220,0.97)',
          backdropFilter: 'blur(6px)',
          borderBottom: `1px solid ${C.beigeBorde}`,
          padding: '10px 14px 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="display" style={{ fontSize: 19, fontWeight: 800, color: C.navy }}>
            📅 Reservas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {usuario && (
              <span
                style={{
                  background: C.navy,
                  color: '#fff',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {usuario}
              </span>
            )}
            <button
              onClick={salir}
              style={{
                background: 'none',
                border: `1px solid ${C.beigeBorde}`,
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: C.textoTenue,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Navegación de fecha */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
            gap: 8,
          }}
        >
          <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>
            ‹
          </button>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <label
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: C.navy,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {fechaBonita(fecha)}
              <input
                type="date"
                value={fecha}
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                style={{
                  border: 'none',
                  width: 22,
                  height: 22,
                  padding: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
            </label>
            {!esHoy && (
              <button
                onClick={() => setFecha(hoyISO())}
                style={{
                  display: 'block',
                  margin: '2px auto 0',
                  background: 'none',
                  border: 'none',
                  color: C.petroleo,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Volver a hoy
              </button>
            )}
          </div>
          <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>
            ›
          </button>
        </div>

        {/* Encabezados de cancha */}
        <div style={{ display: 'flex', marginTop: 8, paddingLeft: 44, gap: 6 }}>
          {CANCHAS.map((c) => (
            <div
              key={c.id}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 800,
                color: C.navy,
                background: '#fff',
                borderRadius: 8,
                padding: '5px 0',
                border: `1px solid ${C.beigeBorde}`,
              }}
            >
              {c.nombre}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Rejilla del día ---------- */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {errorCarga && (
          <div
            style={{
              margin: 14,
              background: '#FCEBEB',
              border: `1px solid ${C.rojo}`,
              color: '#791F1F',
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
            }}
          >
            {errorCarga}{' '}
            <button
              onClick={() => cargar(fecha)}
              style={{
                background: 'none',
                border: 'none',
                color: C.rojo,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        <div style={{ display: 'flex', padding: '6px 8px 90px 0', position: 'relative' }}>
          {/* Columna de horas */}
          <div style={{ width: 44, position: 'relative', height: altoGrid, flexShrink: 0 }}>
            {horas.map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: (h - HORA_MIN) * 60 * PX_POR_MIN - 7,
                  right: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textoTenue,
                }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* Columnas de canchas */}
          {CANCHAS.map((cancha, i) => (
            <div
              key={cancha.id}
              onClick={(e) => tocarColumna(e, cancha.id)}
              style={{
                flex: 1,
                position: 'relative',
                height: altoGrid,
                background: '#fff',
                borderRadius: 10,
                border: `1px solid ${C.beigeBorde}`,
                marginLeft: i === 0 ? 0 : 6,
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {/* Líneas de hora */}
              {horas.map(
                (h) =>
                  h > HORA_MIN && (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        top: (h - HORA_MIN) * 60 * PX_POR_MIN,
                        left: 0,
                        right: 0,
                        borderTop: '1px solid #F0EAD9',
                      }}
                    />
                  )
              )}

              {/* Línea de "ahora" */}
              {esHoy && ahoraMin >= HORA_MIN * 60 && ahoraMin <= HORA_MAX * 60 && (
                <div
                  style={{
                    position: 'absolute',
                    top: (ahoraMin - HORA_MIN * 60) * PX_POR_MIN,
                    left: 0,
                    right: 0,
                    borderTop: `2px solid ${C.rojo}`,
                    zIndex: 5,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Reservas */}
              {reservas
                .filter((r) => r.cancha_id === cancha.id)
                .map((r) => {
                  const ini = aMinutos(r.hora_inicio);
                  const top = Math.max(0, (ini - HORA_MIN * 60) * PX_POR_MIN);
                  const alto = Math.min(
                    r.duracion_min * PX_POR_MIN,
                    altoGrid - top
                  );
                  const estilo = PAGO_ESTILO[r.tipo_pago] || PAGO_ESTILO.ninguno;
                  const jugadores = [r.jugador2, r.jugador3, r.jugador4].filter(Boolean);
                  return (
                    <div
                      key={r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirReserva(r);
                      }}
                      style={{
                        position: 'absolute',
                        top: top + 1,
                        left: 3,
                        right: 3,
                        height: alto - 3,
                        background: estilo.color,
                        borderRadius: 8,
                        padding: '4px 7px',
                        color: '#fff',
                        overflow: 'hidden',
                        zIndex: 3,
                        boxShadow: '0 2px 6px rgba(26,61,77,0.25)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                      >
                        {r.nombre}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.9 }}>
                        {String(r.hora_inicio).slice(0, 5)} · {r.duracion_min}′
                        {jugadores.length > 0 && ` · +${jugadores.length}`}
                      </div>
                      {estilo.etiqueta && alto >= 55 && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 2,
                            background: 'rgba(255,255,255,0.25)',
                            borderRadius: 5,
                            padding: '1px 6px',
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {estilo.etiqueta} {r.valor ? fmtCOP(r.valor) : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Botón flotante ---------- */}
      <button
        onClick={() => setModal({ esNueva: true, form: formNuevo(fecha) })}
        aria-label="Nueva reserva"
        style={{
          position: 'fixed',
          right: 18,
          bottom: 22,
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: 'none',
          background: `linear-gradient(135deg, ${C.dorado}, ${C.doradoOsc})`,
          color: C.navy,
          fontSize: 32,
          fontWeight: 800,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 8px 22px rgba(232,168,43,0.5)',
          zIndex: 30,
        }}
      >
        +
      </button>

      {cargando && (
        <div
          style={{
            position: 'fixed',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            background: C.navy,
            color: '#fff',
            borderRadius: 20,
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 700,
            zIndex: 40,
          }}
        >
          Cargando…
        </div>
      )}

      {modal && (
        <ModalReserva
          esNueva={modal.esNueva}
          inicial={modal.form}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            cargar(fecha);
          }}
        />
      )}
    </div>
  );
}

const btnNav = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: `1px solid ${C.beigeBorde}`,
  background: '#fff',
  color: C.navy,
  fontSize: 20,
  fontWeight: 800,
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
};

// ---------- Modal de crear / editar reserva ----------
function ModalReserva({ esNueva, inicial, onCerrar, onGuardado }) {
  const [f, setF] = useState(inicial);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);

  const pon = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  async function guardar() {
    setError(null);
    if (!f.nombre.trim()) {
      setError('Ponle un nombre a la reserva.');
      return;
    }
    if ((f.tipo_pago === 'abono' || f.tipo_pago === 'descuento') && !(Number(f.valor) > 0)) {
      setError(`Indica el valor del ${f.tipo_pago}.`);
      return;
    }
    setOcupado(true);
    try {
      const cuerpo = {
        nombre: f.nombre,
        jugador2: f.jugador2,
        jugador3: f.jugador3,
        jugador4: f.jugador4,
        cancha_id: f.cancha_id,
        fecha: f.fecha,
        hora_inicio: f.hora_inicio,
        duracion_min: Number(f.duracion_min),
        tipo_pago: f.tipo_pago,
        valor: Number(f.valor) || 0,
        notas: f.notas,
      };
      const res = await fetch('/api/reservas?t=' + Date.now(), {
        method: esNueva ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(esNueva ? cuerpo : { id: f.id, ...cuerpo }),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || 'No se pudo guardar.');
        return;
      }
      onGuardado();
    } catch (e) {
      setError('Error de conexión.');
    } finally {
      setOcupado(false);
    }
  }

  async function cancelarReserva() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/reservas?t=' + Date.now(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, cancelar: true }),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || 'No se pudo cancelar.');
        return;
      }
      onGuardado();
    } catch (e) {
      setError('Error de conexión.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,61,77,0.45)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '22px 22px 0 0',
          width: '100%',
          maxWidth: 520,
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '20px 18px 28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div className="display" style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>
            {esNueva ? 'Nueva reserva' : 'Editar reserva'}
          </div>
          <button
            onClick={onCerrar}
            style={{
              background: '#F2EBDC',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              fontSize: 16,
              fontWeight: 800,
              color: C.navy,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {!esNueva && f.creada_por && (
          <div style={{ fontSize: 12, color: C.textoTenue, marginBottom: 10 }}>
            Creada por <b>{f.creada_por}</b>
          </div>
        )}

        <Campo etiqueta="Nombre de la reserva *">
          <input
            value={f.nombre}
            onChange={pon('nombre')}
            placeholder="Ej: Carlos Pérez"
            autoFocus={esNueva}
            style={inputEstilo}
          />
        </Campo>

        <Campo etiqueta="Otros jugadores (opcional)">
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={f.jugador2} onChange={pon('jugador2')} placeholder="Jugador 2" style={inputEstilo} />
            <input value={f.jugador3} onChange={pon('jugador3')} placeholder="Jugador 3" style={inputEstilo} />
            <input value={f.jugador4} onChange={pon('jugador4')} placeholder="Jugador 4" style={inputEstilo} />
          </div>
        </Campo>

        <Campo etiqueta="Cancha">
          <div style={{ display: 'flex', gap: 8 }}>
            {CANCHAS.map((c) => (
              <BotonOpcion
                key={c.id}
                activo={f.cancha_id === c.id}
                onClick={() => setF({ ...f, cancha_id: c.id })}
              >
                {c.nombre}
              </BotonOpcion>
            ))}
          </div>
        </Campo>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Campo etiqueta="Fecha">
              <input type="date" value={f.fecha} onChange={pon('fecha')} style={inputEstilo} />
            </Campo>
          </div>
          <div style={{ flex: 1 }}>
            <Campo etiqueta="Hora de inicio">
              <input type="time" value={f.hora_inicio} onChange={pon('hora_inicio')} style={inputEstilo} />
            </Campo>
          </div>
        </div>

        <Campo etiqueta="Duración">
          <div style={{ display: 'flex', gap: 8 }}>
            {DURACIONES.map((d) => (
              <BotonOpcion
                key={d}
                activo={Number(f.duracion_min) === d}
                onClick={() => setF({ ...f, duracion_min: d })}
              >
                {d} min
              </BotonOpcion>
            ))}
          </div>
        </Campo>

        <Campo etiqueta="Abono o descuento">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              ['ninguno', 'Ninguno'],
              ['abono', '💵 Abono'],
              ['descuento', '🏷️ Descuento'],
            ].map(([v, txt]) => (
              <BotonOpcion
                key={v}
                activo={f.tipo_pago === v}
                onClick={() => setF({ ...f, tipo_pago: v })}
              >
                {txt}
              </BotonOpcion>
            ))}
          </div>
          {f.tipo_pago !== 'ninguno' && (
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              value={f.valor}
              onChange={pon('valor')}
              placeholder={f.tipo_pago === 'abono' ? 'Valor del abono ($)' : 'Valor del descuento ($)'}
              style={{ ...inputEstilo, marginTop: 8 }}
            />
          )}
        </Campo>

        <Campo etiqueta="Notas (opcional)">
          <textarea
            value={f.notas}
            onChange={pon('notas')}
            placeholder="Cualquier detalle: pidió raquetas, cliente nuevo, cumpleaños…"
            rows={3}
            style={{ ...inputEstilo, resize: 'vertical', minHeight: 70 }}
          />
        </Campo>

        {error && (
          <div
            style={{
              background: '#FCEBEB',
              border: `1px solid ${C.rojo}`,
              color: '#791F1F',
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={ocupado}
          style={{
            width: '100%',
            padding: 15,
            borderRadius: 12,
            border: 'none',
            fontWeight: 800,
            fontSize: 15,
            fontFamily: 'inherit',
            cursor: ocupado ? 'default' : 'pointer',
            color: C.navy,
            background: `linear-gradient(135deg, ${C.dorado}, ${C.doradoOsc})`,
            opacity: ocupado ? 0.6 : 1,
          }}
        >
          {ocupado ? 'Guardando…' : esNueva ? '✓ CREAR RESERVA' : '✓ GUARDAR CAMBIOS'}
        </button>

        {!esNueva &&
          (confirmaCancelar ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={cancelarReserva}
                disabled={ocupado}
                style={{
                  flex: 1,
                  padding: 13,
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  color: '#fff',
                  background: C.rojo,
                }}
              >
                Sí, cancelar reserva
              </button>
              <button
                onClick={() => setConfirmaCancelar(false)}
                style={{
                  flex: 1,
                  padding: 13,
                  borderRadius: 12,
                  border: `1px solid ${C.beigeBorde}`,
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  color: C.navy,
                  background: '#fff',
                }}
              >
                No, volver
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmaCancelar(true)}
              disabled={ocupado}
              style={{
                width: '100%',
                marginTop: 10,
                padding: 13,
                borderRadius: 12,
                border: `1px solid ${C.rojo}`,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
                cursor: 'pointer',
                color: C.rojo,
                background: '#fff',
              }}
            >
              Cancelar esta reserva
            </button>
          ))}
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{etiqueta}</div>
      {children}
    </div>
  );
}

function BotonOpcion({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        flex: 1,
        padding: '11px 4px',
        borderRadius: 10,
        border: activo ? `2px solid ${C.petroleo}` : '2px solid #E5E5E5',
        background: activo ? '#EAF4F8' : '#fff',
        color: activo ? C.petroleo : C.textoTenue,
        fontWeight: 800,
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

const inputEstilo = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '2px solid #E5E5E5',
  fontSize: 16,
  fontWeight: 600,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  color: '#1A3D4D',
  background: '#fff',
};
