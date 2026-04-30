# Sabor Especial

Sistema de pedidos de almuerzo para sodas y cafeterías. Multi-tenant, PWA, Vercel + Supabase.

## Inicio rápido

```bash
git clone https://github.com/viniesqui/saborespecial.git
cd saborespecial
npm run setup   # credentials → migrations → seed → done
npm start       # http://localhost:3000
```

`npm run setup` pide tus credenciales de Supabase **una sola vez** y configura todo automáticamente: base de datos, cafetería de prueba con menú, contraseñas de acceso.

---

## Qué necesitas de Supabase

Un proyecto gratis en [supabase.com](https://supabase.com). El wizard te pide cuatro valores:

| Campo | Dónde encontrarlo |
|-------|-------------------|
| Project URL | Settings → API |
| anon key | Settings → API |
| service_role key | Settings → API |
| DB password | Settings → Database |

---

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run setup` | Setup completo (idempotente — seguro de re-ejecutar) |
| `npm start` | Servidor local `vercel dev` |
| `npm run init-db` | Solo migraciones |
| `npm run db:seed` | Solo cafetería de prueba |
| `npm test` | Suite de pruebas automatizada |

---

## URLs

| Quién | URL |
|-------|-----|
| Clientes | `/s/<slug>` |
| Administración | `/management.html?slug=<slug>` |
| Cocina | `/deliveries.html?slug=<slug>` |

---

## Producción

```bash
vercel --prod
```

Agrega las variables de `.env.local` en Vercel → Settings → Environment Variables. Detalles en `DEVELOPER_QUICKSTART.md`.
