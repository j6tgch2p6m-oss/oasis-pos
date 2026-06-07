'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C } from './ui';
import Dashboard from './components/Dashboard';
import TabPlaceholder from './components/TabPlaceholder';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'historico', label: 'Histórico', icon: '📈' },
  { id: 'clientes', label: 'Clientes', icon: '👥' },
  { id: 'productos', label: 'Productos', icon: '🏷️' },
  { id: 'egresos', label: 'Egresos', icon: '💸' },
];

export default function AdminShell() {
  const [tab, setTab] = useState('dashboard');
  const router = useRouter();

  async function salir() {
    try {
      await fetch('/api/admin/login', { method: 'DELETE', cache: 'no-store' });
    } catch (e) {
      /* aunque falle, mandamos al login */
    }
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(90deg, ${C.navy} 0%, ${C.petroleo} 100%)`,
          color: 'white',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `4px solid ${C.dorado}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: C.dorado,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🎾
          </div>
          <div>
            <div className="display" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>
              Panel Admin
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 3 }}>Oasis Pádel Club</div>
          </div>
        </div>
        <button
          onClick={salir}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: 'white',
            padding: '8px 14px',
            borderRadius: 10,
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          Salir
        </button>
      </div>

      {/* Nav de pestañas (scroll horizontal en celular) */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '10px 14px',
          overflowX: 'auto',
          background: 'rgba(255,255,255,0.5)',
          borderBottom: `1px solid ${C.beigeBorde}`,
        }}
      >
        {TABS.map((t) => {
          const activa = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 14px',
                borderRadius: 10,
                color: activa ? 'white' : C.navy,
                background: activa ? C.petroleo : 'transparent',
              }}
            >
              <span style={{ marginRight: 6 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 14px 60px' }}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'historico' && (
          <TabPlaceholder
            icono="📈"
            titulo="Histórico"
            descripcion="Gráficas mensuales y comparativos mes contra mes."
          />
        )}
        {tab === 'clientes' && (
          <TabPlaceholder
            icono="👥"
            titulo="Clientes"
            descripcion="Perfil de cada jugador: gasto, frecuencia, última visita y alertas de inactividad."
          />
        )}
        {tab === 'productos' && (
          <TabPlaceholder
            icono="🏷️"
            titulo="Productos"
            descripcion="Catálogo con edición de costos, margen % y rotación por producto."
          />
        )}
        {tab === 'egresos' && (
          <TabPlaceholder
            icono="💸"
            titulo="Egresos"
            descripcion="Gastos por categoría y control de proveedores."
          />
        )}
      </div>
    </div>
  );
}
