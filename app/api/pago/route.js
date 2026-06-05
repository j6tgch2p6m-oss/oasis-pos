import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Margen ante arranques en frío de Supabase: 30 s (tope del plan Hobby: 60 s).
export const maxDuration = 30;
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];

// Registrar un pago. Si es "fiado", crea entrada en cuentas_por_cobrar.
export async function POST(request) {
  try {
    const { cuenta_id, jugador_id, jugador_nombre, monto, metodo } = await request.json();

    // Validación: evita 500 por violar restricciones de la BD y datos basura.
    if (!cuenta_id) {
      return NextResponse.json({ error: 'Falta la cuenta del pago' }, { status: 400, ...noStore });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json({ error: 'El monto del pago debe ser un número mayor que cero' }, { status: 400, ...noStore });
    }
    if (!METODOS_PAGO.includes(metodo)) {
      return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400, ...noStore });
    }

    const { data: pago, error } = await supabase
      .from('pagos')
      .insert({ cuenta_id, jugador_id: jugador_id || null, monto: montoNum, metodo })
      .select()
      .single();
    if (error) throw error;

    if (metodo === 'fiado') {
      const { error: e2 } = await supabase.from('cuentas_por_cobrar').insert({
        cuenta_id,
        jugador_id: jugador_id || null,
        jugador_nombre: jugador_nombre || 'Sin nombre',
        monto: montoNum,
        saldo_pendiente: montoNum,
      });
      if (e2) throw e2;
    }

    return NextResponse.json({ pago }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
