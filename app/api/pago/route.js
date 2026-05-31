import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Registrar un pago. Si el método es "fiado", además crea una entrada
// en cuentas_por_cobrar con el nombre del jugador.
export async function POST(request) {
  try {
    const { cuenta_id, jugador_id, jugador_nombre, monto, metodo } = await request.json();

    const { data: pago, error } = await supabase
      .from('pagos')
      .insert({ cuenta_id, jugador_id, monto, metodo })
      .select()
      .single();
    if (error) throw error;

    if (metodo === 'fiado') {
      const { error: e2 } = await supabase.from('cuentas_por_cobrar').insert({
        cuenta_id,
        jugador_id,
        jugador_nombre: jugador_nombre || 'Sin nombre',
        monto,
        saldo_pendiente: monto,
      });
      if (e2) throw e2;
    }

    return NextResponse.json({ pago });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
