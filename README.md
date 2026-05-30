# Oasis POS

Sistema de punto de venta para Oasis Pádel Club (Villavicencio, Colombia).

Construido con Next.js + Supabase, desplegado en Vercel.

## Variables de entorno necesarias (configurar en Vercel)

- `SUPABASE_URL` — la URL del proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — la service_role key (secreta, solo servidor)

## Etapa actual

Etapa 1: catálogo en vivo. La página principal lista los productos
leídos directamente desde la base de datos Supabase.
