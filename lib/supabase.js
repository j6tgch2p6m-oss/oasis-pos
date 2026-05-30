import { createClient } from '@supabase/supabase-js';

// Esta conexión vive SOLO en el servidor (nunca se expone al navegador).
// Usa la service_role key, que salta el RLS para que la app pueda operar.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);
