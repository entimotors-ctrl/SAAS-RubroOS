# RubroOS

**El sistema operativo para tu negocio. Elige tu rubro.**

SaaS multi-tenant con 6 sistemas de negocio listos para usar: Taller de Motos y Vehículos, Barbería, Agropecuario, Catálogo de Inversiones, Ganadería y Lechería, y Carwash. Cada rubro tiene su propio dashboard con módulos reales (POS, agenda, inventario, cotizadores, etc.), y hay un panel aparte para el dueño del SaaS que administra todos los negocios (tenants) de la plataforma.

## Arquitectura

- `server/` — API REST (Express + SQLite vía `better-sqlite3`, sin build step). Multi-tenant por `tenant_id`, autenticación JWT.
- `web/` — Frontend (Vite + React + TypeScript + Tailwind CSS v4 + React Router).

## Cómo correr el proyecto (dos terminales)

**Terminal 1 — API:**
```bash
cd server
npm install
npm run dev
```
Corre en `http://localhost:4000`. Al iniciar por primera vez crea automáticamente la base de datos SQLite (`server/data/rubroos.db`), la cuenta del dueño del SaaS y un tenant de ejemplo por cada rubro con datos de muestra.

**Terminal 2 — Frontend:**
```bash
cd web
npm install
npm run dev
```
Corre en `http://localhost:5173` y hace proxy de `/api` hacia el backend. Abre esa URL en el navegador.

## Flujo de la aplicación

1. **`/`** — Landing de marketing.
2. **`/elegir-sistema`** — El cliente elige su rubro (uno de los 6 sistemas).
3. **`/login/:rubro`** o **`/registro/:rubro`** — Inicio de sesión o creación de cuenta, ya filtrado por el rubro elegido.
4. **`/app`** — Dashboard del negocio, con los módulos propios de su rubro.
5. **`/owner/login`** → **`/owner`** — Panel exclusivo del dueño del SaaS: métricas globales, MRR estimado, y administración de todos los tenants (cambiar plan, suspender/reactivar).

## Cuentas de acceso

**Dueño del SaaS** (panel `/owner`):
- Correo: el que definas en `OWNER_EMAIL`
- Contraseña: la que definas en `OWNER_SEED_PASSWORD` (ver `server/.env.example`) — solo se usa la primera vez que arranca el servidor, para crear la cuenta owner

**Usuario maestro de pruebas** — mismo correo y contraseña en los 6 rubros (solo cambia el rubro que eliges al iniciar sesión):
- Correo: `maestro@rubroos.test`
- Contraseña: `Maestro2026!`

**Tenants de demostración** (usuario individual por rubro, contraseña `demo1234` para todos):

| Rubro | Correo |
|---|---|
| Taller | `demo@taller.test` |
| Barbería | `demo@barberia.test` |
| Agropecuario | `demo@agro.test` |
| Inversiones | `demo@inversiones.test` |
| Ganadería y Lechería | `demo@ganaderia.test` |
| Carwash | `demo@carwash.test` |

## Notas

- Todos los precios están en Lempiras (L.).
- Cada rubro es un módulo aislado: un tenant solo puede ver y modificar los datos de su propio negocio (aislamiento por `tenant_id` + validación de rubro en cada ruta).
- Este proyecto reconstruye, bajo una sola plataforma, la lógica de negocio observada en los prototipos sueltos del Escritorio (ENTIMOTORS/taller-demo, Agro, barberia_saas, catalogo-1.0), más dos rubros nuevos (Ganadería y Lechería, Carwash) diseñados a partir de investigación de software real del sector.
