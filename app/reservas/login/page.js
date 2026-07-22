'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  navy: '#1A3D4D',
  petroleo: '#2E84A6',
  dorado: '#F2B749',
  doradoOsc: '#E8A82B',
  rojo: '#C0392B',
  textoTenue: '#6B7C85',
};

export default function ReservasLogin() {
  const [usuario, setUsuario] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [configErr, setConfigErr] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      setConfigErr(p.get('err') === 'config');
    } catch (e) {
      /* noop */
    }
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/reservas/login?t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario }),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || 'No se pudo iniciar sesión.');
        return;
      }
      router.replace('/reservas');
      router.refresh();
    } catch (err) {
      setError('Error de conexión.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 22,
          padding: 32,
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 20px 50px rgba(46,132,166,0.18)',
          borderTop: `4px solid ${C.dorado}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.navy}, ${C.petroleo})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            📅
          </div>
          <div>
            <div
              className="display"
              style={{ fontSize: 20, fontWeight: 800, color: C.navy, lineHeight: 1 }}
            >
              Reservas
            </div>
            <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 3 }}>Oasis Pádel Club</div>
          </div>
        </div>

        {configErr && (
          <div
            style={{
              background: '#FCEBEB',
              border: `1px solid ${C.rojo}`,
              color: '#791F1F',
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            Falta configurar <b>ADMIN_PASSWORD</b> en Vercel.
          </div>
        )}

        <form onSubmit={entrar}>
          <label style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Nombre de usuario</label>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Tu nombre de empleado"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 10,
              border: '2px solid #E5E5E5',
              fontSize: 16,
              fontWeight: 600,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              marginTop: 8,
            }}
          />

          {error && (
            <div style={{ color: C.rojo, fontSize: 13, fontWeight: 600, marginTop: 10 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={cargando || usuario.trim() === ''}
            style={{
              width: '100%',
              marginTop: 18,
              padding: 14,
              borderRadius: 10,
              border: 'none',
              fontWeight: 800,
              fontSize: 15,
              cursor: cargando || usuario.trim() === '' ? 'default' : 'pointer',
              fontFamily: 'inherit',
              color: usuario.trim() === '' ? '#999' : C.navy,
              background:
                usuario.trim() === ''
                  ? '#E5E5E5'
                  : `linear-gradient(135deg, ${C.dorado}, ${C.doradoOsc})`,
            }}
          >
            {cargando ? 'Entrando…' : 'ENTRAR →'}
          </button>
        </form>
      </div>
    </div>
  );
}
