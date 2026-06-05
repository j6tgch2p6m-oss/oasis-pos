import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en Vercel.'
  );
}

// Fetch con timeout de 12 s para evitar cuelgues infinitos.
// Además forzamos cache: 'no-store': en el App Router de Next.js, las lecturas
// (fetch GET) que hace supabase-js se guardaban en el Data Cache y /api/data
// devolvía datos viejos tras un cambio (cuentas/pagos ya borrados seguían
// apareciendo). Con 'no-store' cada lectura va siempre a la base de datos.
function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  return fetch(url, { ...opciones, signal: ctrl.signal, cache: 'no-store' }).finally(() =>
    clearTimeout(timer)
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { fetch: fetchConTimeout },
});
