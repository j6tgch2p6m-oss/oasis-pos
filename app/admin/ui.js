// Tokens visuales y helpers compartidos por todo el panel admin.
// Misma identidad Oasis que el POS, con un tono más "ejecutivo/denso".

export const C = {
  navy: '#1A3D4D',
  petroleo: '#2E84A6',
  turquesa: '#60AEBF',
  dorado: '#F2B749',
  doradoOsc: '#E8A82B',
  beige: '#F2EBDC',
  beige2: '#F2DDB6',
  beigeBorde: '#C8B987',
  rojo: '#C0392B',
  verde: '#27AE60',
  morado: '#8E44AD',
  texto: '#1A3D4D',
  textoTenue: '#6B7C85',
};

// Colores por método de pago (coinciden con el POS).
export const METODO_COLOR = {
  efectivo: C.verde,
  transferencia: C.petroleo,
  tarjeta: C.morado,
  fiado: C.rojo,
};

export const fmt = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Número corto para ejes/etiquetas: 1.2M, 45k.
export const fmtCorto = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(v) >= 1_000) return Math.round(v / 1_000) + 'k';
  return String(Math.round(v));
};

export const card = {
  background: '#fff',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 6px 20px rgba(26,61,77,0.08)',
};

export const seccionTitulo = {
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontSize: 15,
  fontWeight: 700,
  color: C.navy,
  margin: '0 0 12px 0',
  letterSpacing: '-0.01em',
};
