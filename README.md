# Oasis POS

Sistema de punto de venta para Oasis Pádel Club (Villavicencio, Colombia).

Construido con Next.js + Supabase, desplegado en Vercel.

## Variables de entorno necesarias (configurar en Vercel)

- `SUPABASE_URL` — la URL del proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — la service_role key (secreta, solo servidor)

## Módulos

- `/` — POS (punto de venta) para las cajeras.
- `/admin` — panel administrativo (protegido con `ADMIN_PASSWORD`).
- `/reservas` — calendario de reservas de canchas para empleados.
  Login por nombre de usuario (la lista vive en `lib/reservasAuth.js`:
  admin, Pampa, Juanes, Laura). Requiere la tabla `reservas`
  (incluida en `SCHEMA.sql`).
