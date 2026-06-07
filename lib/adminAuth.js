// Utilidades de autenticación del panel admin.
//
// Usamos Web Crypto (SHA-256) que está disponible TANTO en el runtime Edge
// (middleware.js) COMO en Node (route handlers), así que esta función se puede
// compartir entre ambos sin dependencias externas.
//
// El cookie NO guarda la contraseña: guarda un token derivado (hash) que solo
// se puede recomputar en el servidor conociendo ADMIN_PASSWORD. El middleware
// recalcula el token esperado desde la env var y lo compara con el cookie.

export const COOKIE_NAME = 'oasis_admin';

// Duración de la sesión admin (12 horas).
export const SESSION_MAX_AGE = 60 * 60 * 12;

export async function tokenFor(password) {
  const data = new TextEncoder().encode('oasis-admin::v1::' + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
