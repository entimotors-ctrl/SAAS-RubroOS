-- Fase 3: Row-Level Security — defensa ADICIONAL dentro de Postgres, no la
-- única: la aplicación ya filtra por tenant_id en cada consulta (ver
-- server/src/security/dbAccess.js, server/src/middleware/auth.js) y eso ya
-- está probado extensamente (suite "security-multitenant"). Esto protege
-- además contra un bug futuro que olvide un WHERE tenant_id = ? — Postgres
-- deniega la fila igual, sin depender de que el código de la app lo haga bien.
--
-- IMPORTANTE: esto solo protege algo si el rol que usa la app para conectarse
-- NO es superusuario, NO es dueño de las tablas y NO tiene BYPASSRLS — los
-- tres se saltan RLS sin importar las políticas de abajo. El rol se crea y
-- se mantiene mínimo automáticamente (ver ensureAppRole en
-- server/src/db/postgres.js), a partir del usuario/contraseña de
-- DATABASE_URL — y server/src/db/postgres.js avisa fuerte en el log al
-- arrancar si detecta que el rol en uso se salta RLS.
--
-- Las políticas leen session vars que solo la aplicación puede fijar (ver
-- applyAccessContext en server/src/db/postgres.js):
--   app.tenant_id   -> el tenant de la operación en curso.
--   app.bypass_rls  -> 'true' para el dueño del SaaS o una operación de
--                      sistema (login, registro, recuperación de contraseña,
--                      invitaciones de staff, identidad de WhatsApp — todo lo
--                      que por diseño resuelve A QUÉ tenant pertenece algo,
--                      así que no puede filtrar por un tenant_id que todavía
--                      no conoce).

-- Tablas con tenant_id propio (incluye `users`, con tenant_id NULL para el
-- dueño del SaaS — una fila con tenant_id NULL nunca coincide con ningún
-- tenant_id de sesión, así que solo es visible bajo bypass, que es correcto).
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'taller_clientes','taller_vehiculos','taller_citas','taller_inventario',
    'taller_ventas','taller_abonos','taller_stock_movimientos','taller_ordenes',
    'taller_orden_eventos',
    'barberia_barberos','barberia_servicios','barberia_clientes','barberia_citas',
    'barberia_cuentas','barberia_horarios','barberia_bloqueos',
    'agro_productos','agro_clientes','agro_pedidos','agro_cotizaciones_dron',
    'agro_cotizaciones_cerca',
    'ganaderia_animales','ganaderia_produccion_leche','ganaderia_sanidad',
    'ganaderia_reproduccion',
    'carwash_servicios','carwash_clientes','carwash_vehiculos','carwash_membresias',
    'carwash_turnos',
    'ai_conversations','ai_messages','ai_actions',
    'whatsapp_identities',
    'operation_requests','tenant_settings','business_events','daily_closures',
    'staff_profiles','staff_invitations','staff_tasks','staff_events',
    'users'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (' ||
      '    current_setting(''app.bypass_rls'', true) = ''true''' ||
      '    OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::bigint' ||
      '  ) WITH CHECK (' ||
      '    current_setting(''app.bypass_rls'', true) = ''true''' ||
      '    OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::bigint' ||
      '  )',
      t
    );
  END LOOP;
END $$;

-- tenants: la propia fila ES el tenant (su id, no una columna tenant_id).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')::bigint
  ) WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')::bigint
  );

-- Tablas hijas sin tenant_id propio: heredan el aislamiento vía el padre.
ALTER TABLE taller_venta_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON taller_venta_items USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM taller_ventas v WHERE v.id = taller_venta_items.venta_id
               AND v.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  ) WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM taller_ventas v WHERE v.id = taller_venta_items.venta_id
               AND v.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  );

ALTER TABLE barberia_cuenta_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON barberia_cuenta_items USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM barberia_cuentas c WHERE c.id = barberia_cuenta_items.cuenta_id
               AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  ) WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM barberia_cuentas c WHERE c.id = barberia_cuenta_items.cuenta_id
               AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  );

ALTER TABLE agro_pedido_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agro_pedido_items USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM agro_pedidos p WHERE p.id = agro_pedido_items.pedido_id
               AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  ) WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM agro_pedidos p WHERE p.id = agro_pedido_items.pedido_id
               AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  );

-- password_resets: siempre se toca bajo bypass (lo crea el dueño del SaaS vía
-- /owner, lo consume /auth/reset-password antes de conocer el tenant) — igual
-- queda con la misma forma de política que el resto de las tablas hijas, por
-- si alguna vez un contexto de tenant normal la tocara por error.
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON password_resets USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = password_resets.user_id
               AND u.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  ) WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = password_resets.user_id
               AND u.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  );

-- Tablas sin ningún concepto de tenant propio: solo el dueño del SaaS o una
-- operación de sistema pueden tocarlas, nunca un contexto de tenant normal.
ALTER TABLE owner_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY bypass_only ON owner_events
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- whatsapp_inbound_events: solo un libro de idempotencia de message_id de
-- Meta (sin datos de negocio sensibles); se toca antes de resolver identidad
-- (claimMessage) y después (markEvent), siempre bajo bypass a propósito (ver
-- server/src/routes/whatsapp.js) para no depender de en qué punto del flujo
-- ocurra la llamada.
ALTER TABLE whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY bypass_only ON whatsapp_inbound_events
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
