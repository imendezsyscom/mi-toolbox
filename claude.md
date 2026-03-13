# CLAUDE.md — Mi Toolbox
> Archivo de contexto para Claude Code. Léelo completo antes de tocar cualquier archivo.

---

## ¿Qué es este proyecto?

**Mi Toolbox** es una plataforma web empresarial tipo "caja de herramientas" para SYSCOM Colombia / syscom.mx. Es un **proyecto a largo plazo** pensado para crecer: la idea es ir agregando herramientas internas conforme se necesiten, todas bajo el mismo sistema de autenticación, navegación y diseño.

### Visión del producto
- **Múltiples herramientas** viviendo bajo el mismo launcher (Home)
- **Alertas por correo electrónico** en todas las herramientas que lo requieran
- **Sistema de permisos por herramienta** — en su momento, ciertas credenciales solo tendrán acceso a ciertas herramientas (ej. el equipo de Compras no ve la herramienta de RRHH)
- Diseño y UX consistentes entre todas las herramientas

### Herramienta actual (v1)
**Control de Compras y Tráfico** — reemplaza un flujo que antes vivía en Google Sheets + Google Apps Script + Looker Studio. Gestiona el ciclo completo de órdenes de compra internacionales y nacionales.

### Próximas herramientas
Por definir con el equipo. Al agregar una nueva herramienta, seguir el patrón existente:
1. Crear `src/pages/tools/NombreHerramienta.jsx`
2. Agregar la ruta en `App.jsx`
3. Agregar la card en `Home.jsx` (array `TOOLS`)
4. Agregar el item en el sidebar de `Layout.jsx`

**Usuario principal:** `irvin.mendez@syscom.mx`  
**URL producción:** `https://mi-toolbox.vercel.app`  
**Repositorio:** `https://github.com/imendezsyscom/mi-toolbox`

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 8 |
| Estilos | CSS-in-JS inline — **sin Tailwind, sin librerías de UI** |
| Routing | react-router-dom |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Deploy | Vercel (auto-deploy en push a `main`) |
| Correos | Resend — via serverless function `api/send-email.js` (evita CORS) |

---

## Estructura del proyecto

```
mi-toolbox/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── supabaseClient.js
│   ├── components/
│   │   └── Layout.jsx
│   └── pages/
│       ├── Login.jsx
│       ├── Home.jsx
│       └── tools/                  ← minúscula obligatoria (Vercel es case-sensitive)
│           └── ComprasTool.jsx
├── CLAUDE.md                       ← este archivo
├── vercel.json                     ← rewrites para SPA routing
├── .env                            ← variables de entorno locales
├── index.html
├── package.json
└── vite.config.js
```

---

## Variables de entorno (.env)

```
VITE_SUPABASE_URL=https://[proyecto].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

> ⚠️ Supabase tiene DOS tipos de API keys. Usar SIEMPRE la **Legacy anon key** (`eyJhbGc...`).  
> La nueva `sb_publishable_...` NO funciona con este código.  
> Se encuentra en: Project Settings → API → pestaña "Legacy anon, service_role API keys"

---

## Base de datos — Supabase

### Tablas
| Tabla | Propósito |
|---|---|
| `ordenes` | Órdenes de compra (tabla principal) |
| `cfg_estatus` | Flujo de estatus por tipo de envío + reglas SLA |
| `cfg_proveedores` | Marcas con días de producción default |
| `cfg_transito` | Días de tránsito por tipo de envío y origen |
| `cfg_usuarios` | Compradores y personal de tráfico |
| `log_estatus` | Historial de cambios de estatus |
| `log_variables` | Historial de overrides de producción/tránsito |
| `log_notificaciones` | Registro de alertas enviadas o simuladas |

### Convenciones importantes
- Todas las columnas en **snake_case** (`folio`, `tipo_envio`, `estatus_actual`)
- RLS habilitado en todas las tablas — política `auth_all` para usuarios autenticados
- Los UUIDs los genera Supabase automáticamente (`uuid_generate_v4()`)

---

## Lógica de negocio — reglas críticas

### Tipos de envío
`Maritimo` | `Aereo` | `Courier` | `Nacional`

### Flujo de estatus
- Cada tipo de envío tiene su propio flujo ordenado por `secuencia`
- El estatus `Rechazado` tiene secuencia `99` y es siempre final
- **No se permite retroceder** el estatus de una orden
- El primer estatus se asigna automáticamente al elegir el tipo de envío

### Detección de tipo de documento
- Folio inicia con `OC` → `OC_STOCK`
- Folio inicia con `RC` → `RC_ESPECIAL`

### SLA y alertas
- `sla_prev` y `sla_crit` definen los días límite por estatus
- Valores **negativos son intencionales** (ej. `-10` en "En produccion" = alerta antes de que venza)
- Si `usa_prod = true`: los días de producción se suman al límite
- Si `usa_trans = true`: los días de tránsito se suman al límite
- Cadencia mínima entre alertas: **2 días**
- Modo DRY RUN: registra en log pero no envía correos reales

### Overrides
- Si `dias_produccion_orden > dias_produccion_default` → incrementa `prod_override_count`
- Si `dias_transito_orden > dias_transito_default` → incrementa `trans_override_count`
- Se registra en `log_variables`

### Cierre de orden
- Al llegar al último estatus del flujo (o `Rechazado`) → se calcula y guarda `total_dias_orden`

---

## Convenciones de código

### Estilos
- **Solo CSS-in-JS inline** — no agregar Tailwind ni ninguna librería de componentes
- Design tokens centralizados en el objeto `C` al inicio de cada archivo principal:
```js
const C = {
  bg:'#F4F6F9', card:'#FFFFFF', border:'#E2E6EA',
  text:'#1A1D23', textSub:'#6B7280', textMuted:'#9CA3AF',
  accent:'#2563EB', accentHover:'#1D4ED8', accentLight:'#EFF6FF',
  success:'#16A34A', successLight:'#F0FDF4',
  warning:'#D97706', warningLight:'#FFFBEB',
  danger:'#DC2626', dangerLight:'#FEF2F2',
}
```

### Componentes compartidos (ya existen en ComprasTool.jsx)
`Badge` | `Card` | `Input` | `Select` | `Btn` | `FormField` | `Th` | `Td`  
Reutilizarlos antes de crear nuevos.

### Bug conocido — pérdida de foco en inputs
El componente `CellEdit` **DEBE** estar definido **fuera** de `SupaCfgTable`.  
Si se define adentro, cada keystroke causa un re-render que desmonta el input.  
Este patrón aplica a cualquier componente de edición inline.

---

## Flujo de deploy

```bash
# Desarrollo local
npm run dev        # http://localhost:5173

# Subir cambios a producción
git add .
git commit -m "descripción"
git push           # Vercel detecta el push y re-despliega automáticamente
```

> ⚠️ En macOS, los renames de carpetas con solo cambio de case requieren dos pasos:
> ```bash
> git mv src/pages/Tools src/pages/tools_temp
> git mv src/pages/tools_temp src/pages/tools
> ```
> Vercel corre en Linux y es case-sensitive.

---

## Estado actual del proyecto

### ✅ Funcionando en producción
- Login / logout con Supabase Auth
- Launcher (Home) con card de Control de Compras
- Sidebar con navegación y email del usuario
- Rutas protegidas
- CRUD completo de órdenes con validaciones
- Detección automática de TipoDocumento
- Dropdowns inteligentes con auto-relleno
- Validación de no-retroceso de estatus
- Logs de estatus, variables y notificaciones
- Overrides de producción/tránsito con contadores
- Dashboard con cross-filtering interactivo
- TabAlertas con modo DRY RUN y cadencia de 2 días
- TabConfig con edición inline en Supabase

### 🔜 Pendiente
- **Usuarios reales** de SYSCOM en `cfg_usuarios`
- **Segunda herramienta** del Toolbox (por definir con el equipo)
- **Sistema de permisos por herramienta** — tabla `cfg_permisos` o similar en Supabase que relacione usuario con herramientas permitidas; el launcher y las rutas deben respetar estos permisos
- **Dominio propio en Resend** — actualmente usa `onboarding@resend.dev` (dominio de prueba); migrar a dominio verificado de SYSCOM para producción
- Responsividad mobile
- Vista de historial completo de estatus por orden

---

## Problemas resueltos (no repetir)

| Problema | Causa | Solución |
|---|---|---|
| Estatus viejos en dropdowns | localStorage cacheaba versión anterior | Sistema de `DATA_VERSION` |
| `supabaseUrl is required` | Se usó `sb_publishable_...` en lugar de legacy key | Usar siempre `eyJhbGc...` |
| Pérdida de foco al escribir en Config | `CellEdit` definido dentro de `SupaCfgTable` | Mover `CellEdit` fuera como componente independiente |
| Tablas vacías en Supabase | SQL de INSERTs no se había corrido | Correr bloque INSERT con `truncate` previo |
| Error 404 al recargar en Vercel | Falta de `vercel.json` para SPA routing | Archivo `vercel.json` con rewrites |
| Case-sensitive en Vercel | Carpeta `Tools` vs `tools` | Rename en dos pasos via git |