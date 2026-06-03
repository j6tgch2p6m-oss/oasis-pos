import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// No se puede saldar una deuda con otra deuda: solo medios reales de cobro.
const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta'];

// Cobrar (saldar) una deuda de cartera. Marca la fila como cobrada y registra
// CÓN QUÉ y EN QUÉ TURNO se cobró, para que el cierre de ESE día la cuente como
// "cobro de deudas" (ingreso que entra a caja pero NO es venta del día; la
// venta ya se contó el día en que se fió).
//
// Es IDEMPOTENTE: el filtro .eq('cobrado', false) hace que un segundo intento
// (doble clic, reintento por timeout) no vuelva a cobrarla ni la duplique.
export async function POST(request) {
  try {
    const { cxcId, metodo, turno_id } = await request.json();

    if (!cxcId) {
      return NextResponse.json({ error: 'Falta la deuda a cobrar' }, { status: 400, ...noStore });
    }
    if (!METODOS_VALIDOS.includes(metodo)) {
      return NextResponse.json({ error: 'Método de cobro inválido' }, { status: 400, ...noStore });
    }

    const { data, error } = await supabase
      .from('cuentas_por_cobrar')
      .update({
        cobrado: true,
        fecha_cobro: new Date().toISOString(),
        saldo_pendiente: 0,
        metodo_cobro: metodo,
        turno_cobro_id: turno_id || null,
      })
      .eq('id', cxcId)
      .eq('cobrado', false)
      .select();

    if (error) throw error;

    // Si no se actualizó ninguna fila, la deuda ya estaba cobrada. No es error:
    // devolvemos ok para que el cliente la quite de la lista igualmente.
    const cobro = data && data.length > 0 ? data[0] : null;
    if (!cobro) {
      return NextResponse.json({ ok: true, yaCobrada: true }, noStore);
    }

    return NextResponse.json({ ok: true, cobro }, noStore);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}
