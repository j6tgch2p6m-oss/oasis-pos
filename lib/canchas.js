// Lista única de canchas del club.
//
// Vive aquí y no dentro de cada pantalla porque el POS, el panel admin y las
// APIs tienen que coincidir: si algún día se agrega una cancha, se agrega en un
// solo sitio. (Antes estaba copiada en POSApp.js, admin/data y reservas.)
export const CANCHAS = [
  { id: 'C1', nombre: 'Cancha 1' },
  { id: 'C2', nombre: 'Cancha 2' },
];

// Ids válidos, para validar en el servidor lo que manda el cliente.
export const IDS_CANCHA = CANCHAS.map((c) => c.id);

export function nombreCancha(id) {
  const c = CANCHAS.find((x) => x.id === id);
  return c ? c.nombre : null;
}
