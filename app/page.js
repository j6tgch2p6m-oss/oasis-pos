import { supabase } from '../lib/supabase';

// Forzar que la página lea datos frescos en cada visita (no cachear)
export const dynamic = 'force-dynamic';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default async function Home() {
  const { data: productos, error } = await supabase
    .from('productos')
    .select('*')
    .order('id');

  // Si algo falla con la conexión, lo mostramos claramente
  if (error) {
    return (
      <main style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
        <div
          style={{
            background: '#FCEBEB',
            border: '2px solid #C0392B',
            borderRadius: '14px',
            padding: '24px',
            color: '#791F1F',
          }}
        >
          <h2 style={{ marginBottom: '8px' }}>No se pudo conectar a la base de datos</h2>
          <p style={{ fontSize: '14px' }}>Detalle técnico: {error.message}</p>
          <p style={{ fontSize: '13px', marginTop: '12px', opacity: 0.8 }}>
            Revisa que las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén
            bien configuradas en Vercel.
          </p>
        </div>
      </main>
    );
  }

  // Agrupar productos por categoría
  const categorias = {};
  (productos || []).forEach((p) => {
    if (!categorias[p.categoria]) categorias[p.categoria] = [];
    categorias[p.categoria].push(p);
  });

  return (
    <main style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(90deg, #1A3D4D 0%, #2E84A6 100%)',
          color: 'white',
          borderRadius: '18px',
          padding: '28px 32px',
          marginBottom: '28px',
          borderBottom: '4px solid #F2B749',
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: '#F2B749',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}
        >
          🎾
        </div>
        <div>
          <div className="display" style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>
            OASIS POS
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>
            Catálogo en vivo · {productos?.length || 0} productos desde tu base de datos
          </div>
        </div>
      </div>

      {/* Mensaje de éxito */}
      <div
        style={{
          background: '#E1F5EE',
          border: '2px solid #1D9E75',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '28px',
          color: '#0F6E56',
        }}
      >
        <strong>✓ ¡Funciona!</strong> Esta página está leyendo los productos
        directamente de tu Supabase. Si ves tus precios reales abajo, la tubería
        completa (GitHub → Vercel → Supabase) está conectada.
      </div>

      {/* Productos por categoría */}
      {Object.keys(categorias).map((cat) => (
        <section key={cat} style={{ marginBottom: '28px' }}>
          <h2
            className="display"
            style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px' }}
          >
            {cat}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {categorias[cat].map((p) => (
              <div
                key={p.id}
                style={{
                  background: 'white',
                  borderRadius: '14px',
                  padding: '16px',
                  border: '1px solid rgba(96, 174, 191, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '28px' }}>{p.icono}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{p.nombre}</div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#2E84A6',
                      marginTop: '2px',
                    }}
                  >
                    {fmt(p.precio)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
