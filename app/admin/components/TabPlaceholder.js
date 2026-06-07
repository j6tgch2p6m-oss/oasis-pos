'use client';

import { C, card } from '../ui';

// Placeholder navegable para pestañas que se desarrollan después.
export default function TabPlaceholder({ titulo, descripcion, icono }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: 40, color: C.textoTenue }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>{icono || '🚧'}</div>
      <div
        className="display"
        style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}
      >
        {titulo}
      </div>
      <div style={{ fontSize: 14, maxWidth: 420, margin: '0 auto' }}>{descripcion}</div>
      <div
        style={{
          display: 'inline-block',
          marginTop: 16,
          background: C.beige2,
          color: '#8A7B5F',
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 14px',
          borderRadius: 20,
        }}
      >
        Próximamente
      </div>
    </div>
  );
}
