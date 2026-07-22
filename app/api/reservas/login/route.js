import { NextResponse } from 'next/server';
import {
  RESERVAS_COOKIE,
  RESERVAS_MAX_AGE,
  usuarioValido,
  tokenReservas,
  usuarioDesdeCookie,
} from '../../../../lib/reservasAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };

// Iniciar sesión: valida que el nombre esté en la lista de empleados y setea
// el cookie firmado. No hay contraseña individual: el "secreto" es conocer un
// nombre autorizado (herramienta interna del club).
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = process.env.ADMIN_PASSWORD;

    if (!secret) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD no está configurada en Vercel.' },
        { status: 503, ...noStore }
      );
    }

    const usuario = usuarioValido(body && body.usuario);
    if (!usuario) {
      return NextResponse.json(
        { error: 'Ese nombre de usuario no está autorizado.' },
        { status: 401, ...noStore }
      );
    }

    const token = await tokenReservas(secret, usuario);
    const res = NextResponse.json({ ok: true, usuario }, noStore);
    res.cookies.set(RESERVAS_COOKIE, encodeURIComponent(usuario) + '|' + token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RESERVAS_MAX_AGE,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, ...noStore });
  }
}

// ¿Quién soy? Devuelve el usuario de la sesión actual (o 401).
export async function GET(req) {
  const secret = process.env.ADMIN_PASSWORD;
  const cookie = req.cookies.get(RESERVAS_COOKIE)?.value;
  const usuario = await usuarioDesdeCookie(cookie, secret);
  if (!usuario) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401, ...noStore });
  }
  return NextResponse.json({ usuario }, noStore);
}

// Cerrar sesión: borra el cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true }, noStore);
  res.cookies.set(RESERVAS_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
