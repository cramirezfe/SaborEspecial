# Sabor Especial

Sistema de pedidos de almuerzo para sodas y cafeterías. Multi-tenant, PWA, desplegable en Vercel + Supabase.

## Inicio rápido (< 5 minutos)

**Requisitos previos:** Node.js 18+, cuenta en [Supabase](https://supabase.com) (gratis)

```bash
git clone https://github.com/viniesqui/saborespecial.git
cd saborespecial
npm run setup     # asistente interactivo: credenciales → base de datos → cafetería de prueba
npm start         # → http://localhost:3000
```

El asistente `setup` pregunta tus credenciales de Supabase **una sola vez** y configura todo lo demás automáticamente.

---

## Lo que necesitas de Supabase

Crea un proyecto gratis en [supabase.com/dashboard](https://supabase.com/dashboard) y copia:

| Valor | Dónde encontrarlo |
|-------|-------------------|
| Project URL | Settings → API → Project URL |
| anon key | Settings → API → Project API keys |
| service_role key | Settings → API → Project API keys |

---

## Base de datos

El asistente genera `supabase/schema.sql` con el esquema completo. Pégalo **una sola vez** en el [Editor SQL de Supabase](https://supabase.com/dashboard) cuando te lo pida.

---

## URLs de la aplicación

| Quién | URL |
|-------|-----|
| Clientes | `http://localhost:3000/s/<slug>` |
| Administración | `http://localhost:3000/management.html?slug=<slug>` |
| Cocina | `http://localhost:3000/deliveries.html?slug=<slug>` |

Las contraseñas de administración y cocina se muestran al terminar `npm run setup`.

---

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run setup` | Asistente de configuración inicial |
| `npm start` | Inicia el servidor local (`vercel dev`) |
| `npm run db:seed` | Crea/resetea la cafetería de prueba |
| `npm test` | Suite de pruebas automatizada |

---

## Despliegue a producción

1. `vercel --prod` (necesitas cuenta en [vercel.com](https://vercel.com))
2. Agrega las variables de `.env.local` en Vercel → Settings → Environment Variables
3. Actualiza `CORS_ORIGIN` con tu dominio real

Para detalles de producción ver `DEVELOPER_QUICKSTART.md`.
