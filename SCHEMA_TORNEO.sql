-- ============================================================================
-- POS TORNEO · esquema (idempotente)
-- Tablas con prefijo torneo_. No toca las tablas del POS normal.
-- Ya está aplicado en producción (migración torneo_pos_rapido, 2026-09-19).
-- Se guarda aquí por si el proyecto Supabase se recrea desde cero.
-- ============================================================================
create extension if not exists "uuid-ossp";

-- Cuentas abiertas de clientes (pagan al final, en uno o varios abonos)
create table if not exists torneo_cuentas (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null,
  abierta    boolean not null default true,
  created_at timestamptz not null default now(),
  cerrada_at timestamptz
);

-- Cada comanda = una venta con su número secuencial (el que se anota en papel)
create table if not exists torneo_ventas (
  id         uuid primary key default uuid_generate_v4(),
  numero     serial,
  mesero     text not null,
  estado     text not null check (estado in ('pagada','pendiente','cuenta')),
  metodo     text check (metodo in ('efectivo','transferencia')),
  cuenta_id  uuid references torneo_cuentas(id) on delete set null,
  total      numeric not null default 0,
  created_at timestamptz not null default now(),
  pagada_at  timestamptz
);
create index if not exists torneo_ventas_estado_idx on torneo_ventas(estado);
create index if not exists torneo_ventas_cuenta_idx on torneo_ventas(cuenta_id);

create table if not exists torneo_venta_items (
  id              uuid primary key default uuid_generate_v4(),
  venta_id        uuid not null references torneo_ventas(id) on delete cascade,
  producto_id     int references productos(id) on delete restrict,
  nombre_snapshot text not null,
  precio_unitario numeric not null default 0,
  cantidad        int not null default 1 check (cantidad > 0),
  total           numeric not null default 0
);
create index if not exists torneo_venta_items_venta_idx on torneo_venta_items(venta_id);

-- Abonos de las cuentas de clientes
create table if not exists torneo_pagos (
  id         uuid primary key default uuid_generate_v4(),
  cuenta_id  uuid not null references torneo_cuentas(id) on delete cascade,
  monto      numeric not null check (monto > 0),
  metodo     text not null check (metodo in ('efectivo','transferencia')),
  created_at timestamptz not null default now()
);
create index if not exists torneo_pagos_cuenta_idx on torneo_pagos(cuenta_id);

-- RLS activo sin policies: solo la service_role (la API) puede leer/escribir.
alter table torneo_cuentas     enable row level security;
alter table torneo_ventas      enable row level security;
alter table torneo_venta_items enable row level security;
alter table torneo_pagos       enable row level security;

-- ---------- RPC: crear venta + items en UNA transacción ----------
-- Los precios los pone el catálogo (productos), nunca el cliente.
create or replace function torneo_crear_venta(
  p_mesero text, p_estado text, p_metodo text, p_cuenta_id uuid, p_items jsonb
) returns torneo_ventas language plpgsql as $$
declare
  v_venta torneo_ventas;
  v_item  jsonb;
  v_prod  productos;
  v_cant  int;
  v_total numeric := 0;
begin
  if coalesce(trim(p_mesero), '') = '' then
    raise exception 'Falta el mesero';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La comanda no tiene productos';
  end if;
  if p_estado not in ('pagada','pendiente','cuenta') then
    raise exception 'Estado inválido';
  end if;
  if p_estado = 'pagada' and p_metodo not in ('efectivo','transferencia') then
    raise exception 'Falta el método de pago';
  end if;
  if p_estado = 'cuenta' then
    if p_cuenta_id is null then
      raise exception 'Falta la cuenta del cliente';
    end if;
    perform 1 from torneo_cuentas where id = p_cuenta_id and abierta;
    if not found then
      raise exception 'La cuenta del cliente no está abierta';
    end if;
  end if;

  insert into torneo_ventas (mesero, estado, metodo, cuenta_id, total, pagada_at)
  values (
    trim(p_mesero), p_estado,
    case when p_estado = 'pagada' then p_metodo else null end,
    case when p_estado = 'cuenta' then p_cuenta_id else null end,
    0,
    case when p_estado = 'pagada' then now() else null end
  )
  returning * into v_venta;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from productos
      where id = (v_item->>'producto_id')::int and activo;
    if not found then
      raise exception 'Producto % no existe o está inactivo', v_item->>'producto_id';
    end if;
    v_cant := coalesce((v_item->>'cantidad')::int, 1);
    if v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    insert into torneo_venta_items (venta_id, producto_id, nombre_snapshot, precio_unitario, cantidad, total)
    values (v_venta.id, v_prod.id, v_prod.nombre, v_prod.precio, v_cant, v_prod.precio * v_cant);
    v_total := v_total + v_prod.precio * v_cant;
  end loop;

  update torneo_ventas set total = v_total where id = v_venta.id returning * into v_venta;
  return v_venta;
end $$;

-- ---------- RPC: abonar a una cuenta de cliente (se cierra sola en 0) ----------
create or replace function torneo_abonar(p_cuenta_id uuid, p_monto numeric, p_metodo text)
returns jsonb language plpgsql as $$
declare
  v_cuenta torneo_cuentas;
  v_saldo  numeric;
begin
  select * into v_cuenta from torneo_cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if not v_cuenta.abierta then
    raise exception 'La cuenta ya está cerrada';
  end if;
  if p_metodo not in ('efectivo','transferencia') then
    raise exception 'Método de pago inválido';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor que cero';
  end if;
  select coalesce((select sum(total) from torneo_ventas where cuenta_id = p_cuenta_id), 0)
       - coalesce((select sum(monto) from torneo_pagos  where cuenta_id = p_cuenta_id), 0)
    into v_saldo;
  if p_monto - v_saldo >= 1 then
    raise exception 'El abono (%) supera el saldo (%)', p_monto, v_saldo;
  end if;
  insert into torneo_pagos (cuenta_id, monto, metodo) values (p_cuenta_id, p_monto, p_metodo);
  v_saldo := v_saldo - p_monto;
  if v_saldo < 1 then
    update torneo_cuentas set abierta = false, cerrada_at = now() where id = p_cuenta_id;
  end if;
  return jsonb_build_object('saldo', v_saldo, 'cerrada', v_saldo < 1);
end $$;

-- ---------- RPC: reiniciar el torneo (borra TODO lo del torneo) ----------
create or replace function torneo_reiniciar() returns void language plpgsql as $$
begin
  -- pg_safeupdate (activo en las peticiones de PostgREST) exige WHERE en cada DELETE.
  delete from torneo_pagos       where true;
  delete from torneo_venta_items where true;
  delete from torneo_ventas      where true;
  delete from torneo_cuentas     where true;
  -- setval en vez de "alter sequence restart": service_role no es dueña de la secuencia.
  perform setval('torneo_ventas_numero_seq', 1, false);
end $$;

-- Las funciones corren como quien las llama (sin SECURITY DEFINER). Aun así se
-- les quita el EXECUTE que Postgres da a PUBLIC por defecto, para que solo la
-- API (service_role) pueda invocarlas y nunca la clave anónima.
revoke execute on function torneo_crear_venta(text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function torneo_abonar(uuid, numeric, text)                 from public, anon, authenticated;
revoke execute on function torneo_reiniciar()                                 from public, anon, authenticated;
grant  execute on function torneo_crear_venta(text, text, text, uuid, jsonb) to service_role;
grant  execute on function torneo_abonar(uuid, numeric, text)                to service_role;
grant  execute on function torneo_reiniciar()                                to service_role;

notify pgrst, 'reload schema';
