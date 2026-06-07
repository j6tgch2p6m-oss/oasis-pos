import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_MAX_AGE, tokenFor } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Iniciar sesión: compara la contraseña enviada contra ADMIN_PASSWORD (env,
// solo servidor) y, si coincide, setea un cookie httpOnly con el token derivado.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = body && body.password;
    const real = process.env.ADMIN_PASSWORD;

    if (!real) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD no está configurada en Vercel.' },
        { status: 503, ...noStore }
      );
    }
    if (!password || password !== real) {
      return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401, ...noStore });
    }

    const token = await tokenFor(real);
    const res = NextResponse.json({ ok: true }, noStore);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// Cerrar sesión: borra el cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true }, noStore);
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
