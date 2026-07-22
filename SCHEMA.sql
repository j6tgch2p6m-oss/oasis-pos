-- ============================================================================
-- SCHEMA COMPLETO · Oasis POS
-- Idempotente y NO destructivo: crea las tablas que falten y agrega las
-- columnas faltantes SIN borrar datos existentes.
--
-- Cómo usar: pégalo completo en el SQL Editor de Supabase y dale Run.
-- Es seguro ejecutarlo varias veces.
--
-- IDs: UUID en todas las tablas excepto productos (integer serial, legacy).
-- ============================================================================

-- Extensión para UUID (ya activa en Supabase por defecto, idempotente)
create extension if not exists "uuid-ossp";

-- ---------- PRODUCTOS (ID integer serial, legacy) ----------
create table if not exists productos (
  id         serial primary key,
  nombre     text not null,
  categoria  text,
  precio     numeric not null default 0,
  icono      text default '🎾',
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table productos add column if not exists nombre     text;
alter table productos add column if not exists categoria  text;
alter table productos add column if not exists precio     numeric not null default 0;
alter table productos add column if not exists icono      text default '🎾';
alter table productos add column if not exists activo     boolean not null default true;
alter table productos add column if not exists created_at timestamptz default now();
alter table productos add column if not exists updated_at timestamptz default now();

-- ---------- TURNOS ----------
create table if not exists turnos (
  id                      uuid primary key default uuid_generate_v4(),
  cajera                  text,
  base_caja               numeric not null default 0,
  fecha_apertura          timestamptz not null default now(),
  fecha_cierre            timestamptz,
  efectivo_contado_cierre numeric,
  notas                   text,
  created_at              timestamptz default now()
);
alter table turnos add column if not exists cajera                  text;
alter table turnos add column if not exists base_caja               numeric not null default 0;
alter table turnos add column if not exists fecha_apertura          timestamptz not null default now();
alter table turnos add column if not exists fecha_cierre            timestamptz;
alter table turnos add column if not exists efectivo_contado_cierre numeric;
alter table turnos add column if not exists notas                   text;
alter table turnos add column if not exists created_at              timestamptz default now();

-- ---------- CUENTAS ----------
create table if not exists cuentas (
  id             uuid primary key default uuid_generate_v4(),
  turno_id       uuid references turnos(id) on delete restrict,
  tipo           text not null check (tipo = any(array['cancha','individual'])),
  cancha_id      text,
  cerrada        boolean not null default false,
  fecha_apertura timestamptz not null default now(),
  fecha_cierre   timestamptz,
  created_at     timestamptz default now()
);
alter table cuentas add column if not exists turno_id       uuid;
alter table cuentas add column if not exists tipo           text;
alter table cuentas add column if not exists cancha_id      text;
alter table cuentas add column if not exists cerrada        boolean not null default false;
alter table cuentas add column if not exists fecha_apertura timestamptz not null default now();
alter table cuentas add column if not exists fecha_cierre   timestamptz;
alter table cuentas add column if not exists created_at     timestamptz default now();
-- Constraint idempotente
do $$ begin
  alter table cuentas add constraint cuentas_tipo_check
    check (tipo = any(array['cancha','individual']));
exception when duplicate_object then null;
end $$;

-- ---------- JUGADORES ----------
create table if not exists jugadores (
  id         uuid primary key default uuid_generate_v4(),
  cuenta_id  uuid references cuentas(id) on delete cascade,
  nombre     text not null,
  orden      int default 0,
  created_at timestamptz default now()
);
alter table jugadores add column if not exists cuenta_id  uuid;
alter table jugadores add column if not exists nombre     text;
alter table jugadores add column if not exists orden      int default 0;
alter table jugadores add column if not exists created_at timestamptz default now();

-- ---------- CONSUMOS ----------
create table if not exists consumos (
  id                   uuid primary key default uuid_generate_v4(),
  cuenta_id            uuid references cuentas(id) on delete cascade,
  producto_id          int references productos(id) on delete restrict,
  nombre_snapshot      text not null,
  precio_unitario      numeric,
  cantidad             int not null default 1,
  total                numeric,
  tipo_asignacion      text not null check (tipo_asignacion = any(array['individual','split'])),
  asignacion_jugadores jsonb,
  created_at           timestamptz default now()
);
alter table consumos add column if not exists cuenta_id            uuid;
alter table consumos add column if not exists producto_id          int;
alter table consumos add column if not exists nombre_snapshot      text;
alter table consumos add column if not exists precio_unitario      numeric;
alter table consumos add column if not exists cantidad             int not null default 1;
alter table consumos add column if not exists total                numeric;
alter table consumos add column if not exists tipo_asignacion      text;
alter table consumos add column if not exists asignacion_jugadores jsonb;
alter table consumos add column if not exists created_at           timestamptz default now();
-- Constraint idempotente
do $$ begin
  alter table consumos add constraint consumos_tipo_asignacion_check
    check (tipo_asignacion = any(array['individual','split']));
exception when duplicate_object then null;
end $$;

-- ---------- PAGOS ----------
create table if not exists pagos (
  id         uuid primary key default uuid_generate_v4(),
  cuenta_id  uuid references cuentas(id) on delete cascade,
  jugador_id uuid references jugadores(id) on delete cascade,
  monto      numeric not null,
  metodo     text not null check (metodo = any(array['efectivo','transferencia','tarjeta','fiado'])),
  -- Pagos ampliados: nombre de quien puso el dinero cuando cubre la parte de
  -- otro jugador. Vacío cuando cada quien paga lo suyo.
  pagado_por text,
  -- Marca el abono que el cliente dejó al reservar (pago adelantado).
  es_reserva boolean not null default false,
  created_at timestamptz not null default now()
);
alter table pagos add column if not exists cuenta_id  uuid;
alter table pagos add column if not exists jugador_id uuid;
alter table pagos add column if not exists monto      numeric;
alter table pagos add column if not exists metodo     text;
alter table pagos add column if not exists pagado_por text;
alter table pagos add column if not exists es_reserva boolean not null default false;
alter table pagos add column if not exists created_at timestamptz not null default now();
-- Constraint idempotente
do $$ begin
  alter table pagos add constraint pagos_metodo_check
    check (metodo = any(array['efectivo','transferencia','tarjeta','fiado']));
exception when duplicate_object then null;
end $$;

-- ---------- CUENTAS POR COBRAR (fiados) ----------
create table if not exists cuentas_por_cobrar (
  id              uuid primary key default uuid_generate_v4(),
  cuenta_id       uuid references cuentas(id) on delete set null,
  jugador_id      uuid references jugadores(id) on delete set null,
  jugador_nombre  text not null,
  monto           numeric not null,
  saldo_pendiente numeric not null,
  cobrado         boolean not null default false,
  fecha_cobro     timestamptz,
  -- Con QUÉ medio y en QUÉ turno se cobró la deuda (lo escribe /api/cobrar).
  -- Permite separar en el cierre los "cobros de cartera" de las ventas del día.
  -- Las restricciones con nombre (CHECK + FK) se agregan más abajo de forma
  -- idempotente, con los MISMOS nombres que en producción.
  metodo_cobro    text,
  turno_cobro_id  uuid,
  created_at      timestamptz not null default now()
);
alter table cuentas_por_cobrar add column if not exists cuenta_id       uuid;
alter table cuentas_por_cobrar add column if not exists jugador_id      uuid;
alter table cuentas_por_cobrar add column if not exists jugador_nombre  text;
alter table cuentas_por_cobrar add column if not exists monto           numeric;
alter table cuentas_por_cobrar add column if not exists saldo_pendiente numeric;
alter table cuentas_por_cobrar add column if not exists cobrado         boolean not null default false;
alter table cuentas_por_cobrar add column if not exists fecha_cobro     timestamptz;
alter table cuentas_por_cobrar add column if not exists created_at      timestamptz not null default now();
alter table cuentas_por_cobrar add column if not exists metodo_cobro    text;
alter table cuentas_por_cobrar add column if not exists turno_cobro_id  uuid;

-- Método de cobro válido (permite NULL = deuda aún sin cobrar). Nombre fijo
-- (cxc_metodo_cobro_chk) para coincidir con producción y ser idempotente.
do $$ begin
  alter table cuentas_por_cobrar add constraint cxc_metodo_cobro_chk
    check (metodo_cobro is null or metodo_cobro = any(array['efectivo','transferencia','tarjeta']));
exception when duplicate_object then null;
end $$;

-- FK del turno en que se cobró la deuda. ON DELETE SET NULL: si se borra el
-- turno, la deuda no se pierde, solo deja de apuntar a ese turno.
do $$ begin
  alter table cuentas_por_cobrar add constraint cxc_turno_cobro_fk
    foreign key (turno_cobro_id) references turnos(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ---------- DESCUENTOS ----------
-- Reduce lo que se cobra de una cuenta (no es dinero recibido). Lleva motivo
-- obligatorio para revisarlo luego como admin. jugador_id es opcional.
create table if not exists descuentos (
  id          uuid primary key default uuid_generate_v4(),
  cuenta_id   uuid references cuentas(id) on delete cascade,
  jugador_id  uuid references jugadores(id) on delete set null,
  monto       numeric not null,
  motivo      text not null,
  cajera      text,
  created_at  timestamptz not null default now()
);
alter table descuentos add column if not exists cuenta_id  uuid;
alter table descuentos add column if not exists jugador_id uuid;
alter table descuentos add column if not exists monto      numeric;
alter table descuentos add column if not exists motivo     text;
alter table descuentos add column if not exists cajera     text;
alter table descuentos add column if not exists created_at timestamptz not null default now();

-- ============================================================================
-- ÍNDICES (reflejan exactamente los de producción)
-- ============================================================================
-- PRODUCTOS
create index if not exists idx_productos_activo    on productos(activo);
create index if not exists idx_productos_categoria on productos(categoria);

-- TURNOS
create index if not exists idx_turnos_cajera         on turnos(cajera);
create index if not exists idx_turnos_fecha_apertura on turnos(fecha_apertura desc);

-- CUENTAS
create index if not exists idx_cuentas_turno          on cuentas(turno_id);
create index if not exists idx_cuentas_cerrada        on cuentas(cerrada);
create index if not exists idx_cuentas_fecha_apertura on cuentas(fecha_apertura desc);

-- JUGADORES
create index if not exists idx_jugadores_cuenta on jugadores(cuenta_id);
create index if not exists idx_jugadores_nombre on jugadores(nombre);

-- CONSUMOS
create index if not exists idx_consumos_cuenta   on consumos(cuenta_id);
create index if not exists idx_consumos_producto on consumos(producto_id);
create index if not exists idx_consumos_created  on consumos(created_at desc);

-- PAGOS
create index if not exists idx_pagos_cuenta  on pagos(cuenta_id);
create index if not exists idx_pagos_jugador on pagos(jugador_id);
create index if not exists idx_pagos_metodo  on pagos(metodo);
create index if not exists idx_pagos_created on pagos(created_at desc);

-- CUENTAS POR COBRAR (fiados)
create index if not exists idx_cxc_cuenta_id      on cuentas_por_cobrar(cuenta_id);
create index if not exists idx_cxc_jugador_id     on cuentas_por_cobrar(jugador_id);
create index if not exists idx_cxc_jugador_nombre on cuentas_por_cobrar(jugador_nombre);
create index if not exists idx_cxc_cobrado        on cuentas_por_cobrar(cobrado);
create index if not exists idx_cxc_created        on cuentas_por_cobrar(created_at desc);
-- Solo deudas cobradas; acelera el resumen "cobro de cartera" del cierre.
create index if not exists idx_cxc_turno_cobro
  on cuentas_por_cobrar(turno_cobro_id)
  where cobrado = true;

-- DESCUENTOS
create index if not exists idx_descuentos_cuenta  on descuentos(cuenta_id);
create index if not exists idx_descuentos_created on descuentos(created_at desc);

-- Garantía: máximo UN turno abierto a la vez (la BD rechaza un 2º turno abierto)
create unique index if not exists uniq_turno_abierto
  on turnos ((fecha_cierre is null))
  where fecha_cierre is null;

-- ---------- RESERVAS (calendario de canchas) ----------
-- Reserva de una cancha hecha por un empleado desde /reservas. Los jugadores
-- adicionales son opcionales. tipo_pago registra si el cliente dejó abono
-- (pago adelantado) o si la reserva tiene descuento, con su valor.
-- Las canceladas se conservan (estado='cancelada') para análisis.
create table if not exists reservas (
  id              uuid primary key default uuid_generate_v4(),
  cancha_id       text not null default 'C1',
  nombre          text not null,
  jugador2        text,
  jugador3        text,
  jugador4        text,
  fecha           date not null,
  hora_inicio     time not null,
  duracion_min    int not null default 90,
  tipo_pago       text not null default 'ninguno',
  valor           numeric,
  notas           text,
  estado          text not null default 'activa',
  creada_por      text not null,
  actualizada_por text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table reservas add column if not exists cancha_id       text not null default 'C1';
alter table reservas add column if not exists nombre          text;
alter table reservas add column if not exists jugador2        text;
alter table reservas add column if not exists jugador3        text;
alter table reservas add column if not exists jugador4        text;
alter table reservas add column if not exists fecha           date;
alter table reservas add column if not exists hora_inicio     time;
alter table reservas add column if not exists duracion_min    int not null default 90;
alter table reservas add column if not exists tipo_pago       text not null default 'ninguno';
alter table reservas add column if not exists valor           numeric;
alter table reservas add column if not exists notas           text;
alter table reservas add column if not exists estado          text not null default 'activa';
alter table reservas add column if not exists creada_por      text;
alter table reservas add column if not exists actualizada_por text;
alter table reservas add column if not exists created_at      timestamptz not null default now();
alter table reservas add column if not exists updated_at      timestamptz not null default now();

-- Constraints idempotentes
do $$ begin
  alter table reservas add constraint reservas_duracion_check
    check (duracion_min = any(array[60, 90, 120]));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table reservas add constraint reservas_tipo_pago_check
    check (tipo_pago = any(array['ninguno','abono','descuento']));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table reservas add constraint reservas_estado_check
    check (estado = any(array['activa','cancelada']));
exception when duplicate_object then null;
end $$;

-- Garantía a nivel de BD: dos reservas ACTIVAS de la misma cancha no pueden
-- cruzarse en el tiempo. La API también lo valida (mensaje amable); esto cubre
-- la carrera de dos requests simultáneos.
create extension if not exists btree_gist;
do $$ begin
  alter table reservas add constraint reservas_sin_cruce
    exclude using gist (
      cancha_id with =,
      tsrange(
        (fecha + hora_inicio),
        (fecha + hora_inicio + make_interval(mins => duracion_min))
      ) with &&
    ) where (estado = 'activa');
exception when duplicate_object then null;
end $$;

-- Índices para el calendario y los análisis (ocupación, horas valle, clientes
-- frecuentes)
create index if not exists idx_reservas_fecha        on reservas(fecha);
create index if not exists idx_reservas_cancha_fecha on reservas(cancha_id, fecha);
create index if not exists idx_reservas_nombre       on reservas(nombre);
create index if not exists idx_reservas_estado       on reservas(estado);
create index if not exists idx_reservas_created      on reservas(created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- La app accede SOLO desde el servidor con la service_role key, que IGNORA RLS.
-- Activamos RLS sin políticas para que las claves públicas (anon) NO puedan
-- leer ni escribir si el proyecto se recrea desde cero. Es idempotente.
-- ============================================================================
alter table productos          enable row level security;
alter table turnos             enable row level security;
alter table cuentas            enable row level security;
alter table jugadores          enable row level security;
alter table consumos           enable row level security;
alter table pagos              enable row level security;
alter table cuentas_por_cobrar enable row level security;
alter table descuentos         enable row level security;
alter table reservas           enable row level security;

-- ============================================================================
-- SEED de productos (OPCIONAL): solo se ejecuta si la tabla está vacía.
-- Edita precios/nombres a tu gusto. Si ya tienes productos, no inserta nada.
-- ============================================================================
insert into productos (nombre, precio, categoria, icono, activo)
select * from (values
  ('Alquiler cancha 1h',   60000, 'Alquiler cancha', '🎾', true),
  ('Alquiler cancha 1.5h', 90000, 'Alquiler cancha', '🎾', true),
  ('Raqueta (alquiler)',   10000, 'Accesorios',       '🏓', true),
  ('Pelotas (tubo)',       25000, 'Accesorios',       '🥎', true),
  ('Agua',                  3000, 'Bebidas',          '💧', true),
  ('Gatorade',              6000, 'Bebidas',          '🧃', true),
  ('Gaseosa',               5000, 'Bebidas',          '🥤', true),
  ('Cerveza',               8000, 'Cervezas',         '🍺', true),
  ('Papas',                 4000, 'Snacks',           '🍟', true),
  ('Maní',                 3000, 'Snacks',           '🥜', true)
) as nuevos(nombre, precio, categoria, icono, activo)
where not exists (select 1 from productos);
