// Autenticación del módulo de RESERVAS (empleados del club).
//
// Login por NOMBRE de usuario (sin contraseña individual): la lista de
// empleados autorizados vive aquí. Para agregar o quitar empleados basta con
// editar USUARIOS y volver a desplegar.
//
// El cookie guarda "usuario|token" donde token = hash derivado del usuario y
// de ADMIN_PASSWORD (secreto del servidor). Así el cookie no se puede forjar
// sin pasar por el endpoint de login, y el middleware (Edge) puede verificarlo
// con Web Crypto igual que hace el panel admin.

export const RESERVAS_COOKIE = 'oasis_reservas';

// Sesión larga (30 días): es una herramienta interna que se abre desde el
// celular; pedir login a cada rato entorpece la operación.
export const RESERVAS_MAX_AGE = 60 * 60 * 24 * 30;

// Empleados autorizados. La comparación es SIN distinguir mayúsculas.
export const USUARIOS = ['admin', 'Pampa', 'Juanes', 'Laura'];

// Devuelve el nombre canónico (como está escrito en USUARIOS) o null.
export function usuarioValido(nombre) {
  if (!nombre) return null;
  const buscado = String(nombre).trim().toLowerCase();
  return USUARIOS.find((u) => u.toLowerCase() === buscado) || null;
}

export async function tokenReservas(secret, usuario) {
  const data = new TextEncoder().encode(
    'oasis-reservas::v1::' + secret + '::' + usuario.toLowerCase()
  );
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parsea y verifica el cookie. Devuelve el usuario canónico o null.
export async function usuarioDesdeCookie(valor, secret) {
  if (!valor || !secret) return null;
  const sep = valor.indexOf('|');
  if (sep < 1) return null;
  const usuario = usuarioValido(decodeURIComponent(valor.slice(0, sep)));
  if (!usuario) return null;
  const token = valor.slice(sep + 1);
  const esperado = await tokenReservas(secret, usuario);
  return token === esperado ? usuario : null;
}
