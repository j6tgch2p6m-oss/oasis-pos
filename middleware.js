import { NextResponse } from 'next/server';
import { COOKIE_NAME, tokenFor } from './lib/adminAuth';

// Solo protegemos el área admin. El POS (resto del sitio) queda intacto.
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Rutas públicas dentro del área admin: la pantalla de login y su API.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;

  // Mal configurado: sin ADMIN_PASSWORD nadie puede entrar.
  if (!password) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD no está configurada en el servidor.' },
        { status: 503 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('err', 'config');
    return NextResponse.redirect(url);
  }

  const expected = await tokenFor(password);
  const cookie = req.cookies.get(COOKIE_NAME)?.value;

  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  // No autenticado.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  return NextResponse.redirect(url);
}
