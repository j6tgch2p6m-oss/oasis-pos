'use client';

import { C, card } from '../ui';

// Fase 1: estructura. En la Fase 2 este componente leerá /api/admin/data y
// mostrará KPIs, gráficas y listas con datos reales de Supabase.
export default function Dashboard() {
  return (
    <div style={{ ...card, textAlign: 'center', padding: 40, color: C.textoTenue }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
      <div
        className="display"
        style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}
      >
        Dashboard
      </div>
      <div style={{ fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
        Shell listo. En la siguiente fase se conectan los KPIs, gráficas y listas con datos reales.
      </div>
    </div>
  );
}
