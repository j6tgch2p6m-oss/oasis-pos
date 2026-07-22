import { NextResponse } from 'next/server';
import { COOKIE_NAME, tokenFor } from './lib/adminAuth';
import { RESERVAS_COOKIE, usuarioDesdeCookie } from './lib/reservasAuth';

// Protegemos el área admin y el módulo de reservas. El POS (resto del sitio)
// queda intacto.
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/reservas/:path*', '/api/reservas/:path*'],
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  const esReservas = pathname.startsWith('/reservas') || pathname.startsWith('/api/reservas');

  // Rutas públicas: las pantallas de login y sus APIs.
  if (
    pathname === '/admin/login' ||
    pathname === '/api/admin/login' ||
    pathname === '/reservas/login' ||
    pathname === '/api/reservas/login'
  ) {
    return NextResponse.next();
  }

  // ADMIN_PASSWORD es también el secreto con que se firman las sesiones de
  // reservas. Sin ella nadie puede entrar a ninguna de las dos áreas.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD no está configurada en el servidor.' },
        { status: 503 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = esReservas ? '/reservas/login' : '/admin/login';
    url.searchParams.set('err', 'config');
    return NextResponse.redirect(url);
  }

  if (esReservas) {
    const cookie = req.cookies.get(RESERVAS_COOKIE)?.value;
    const usuario = await usuarioDesdeCookie(cookie, password);
    if (usuario) {
      return NextResponse.next();
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/reservas/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Área admin (igual que antes).
  const expected = await tokenFor(password);
  const cookie = req.cookies.get(COOKIE_NAME)?.value;

  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  return NextResponse.redirect(url);
}
