import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const results = {};

  // Verificar env vars
  results.env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      ok: false,
      error: 'Variables de entorno faltantes',
      results,
    });
  }

  // Probar conexión a Supabase tabla por tabla
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const tablas = ['turnos', 'cuentas', 'jugadores', 'consumos', 'pagos', 'productos', 'cuentas_por_cobrar'];
    for (const tabla of tablas) {
      const { error } = await sb.from(tabla).select('*').limit(1);
      results[tabla] = error ? `ERROR: ${error.message}` : 'OK';
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message, results });
  }
}
