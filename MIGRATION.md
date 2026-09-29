# Plan de migracion: Astro 5.13 -> 7.3.5 + sharp 0.35.5

> Estado: **PENDIENTE DE EJECUCION**. Este documento es el plan aprobado; no se ha modificado ningun archivo del proyecto.

Fecha del analisis: 2026-09-29
Rama base: `main` (commit 93e4834)

## Motivo

`npm audit` reporta 4 vulnerabilidades en el arbol actual:

| Paquete | Severidad | Avisos | Fix |
|---|---|---|---|
| `astro` <=7.2.7 | **Critica** | 10 avisos: XSS multiple (define:vars, spread props, transition:*, slot name, View Transition props), SSRF via Host header, bypass de autorizacion con `base`, **RCE via optimizacion AVIF** | astro 7.3.5 |
| `sharp` <=0.35.4 | **Alta** | CVEs en libvips (CVE-2026-33327/33328/35590/35591) y libheif | sharp 0.35.5 |
| `esbuild` | Media | Lectura arbitraria de archivos en dev server (Windows) | via astro 7 |
| `@astrojs/mdx` | Baja | Hereda de astro | via astro 7 |

El fix de seguridad **no es posible dentro del rango actual** (`^5.13.2`): todas las versiones <=7.2.7 son vulnerables. Es obligatorio saltar dos majors (5 -> 6 -> 7, directo a 7.3.5).

## Analisis de riesgo: BAJO

Perfil del sitio: blog estatico puro (`output: 'static'`, sin adaptador). No usa: islas/client:*, View Transitions, middleware, actions, server islands, `define:vars`, `set:html`, `Astro.glob`, scripts/styles en componentes, paginas 404 custom, ni plugins remark/rehype. Collections ya usan Content Layer API v2 (glob loader en `src/content.config.ts`).

De todos los breaking changes documentados en las guias oficiales v6 y v7, solo 2 requieren cambio de codigo.

Fuentes oficiales consultadas:
- https://docs.astro.build/en/guides/upgrade-to/v6/
- https://docs.astro.build/en/guides/upgrade-to/v7/

## Mapa de breaking changes vs. este proyecto

| Cambio (version) | Afecta | Detalle / accion |
|---|---|---|
| Node >= 22.12 (v6) | No local | Local: v22.23.2 OK. **PENDIENTE: verificar Node del hosting** (no hay CI en el repo) |
| Vite 7 -> 8 (v6+v7) | No | `@tailwindcss/vite` 4.3.3 es compatible; se actualiza junto al resto |
| Zod 4 (v6) | Si (menor) | Schema actual es compatible. Pero `z` importado de `astro:content` esta deprecado -> fase 2, cambio 1 |
| Collections legacy / `Astro.glob()` / `<ViewTransitions>` / `@astrojs/db` / internals de `astro:transitions` (v6+v7) | No | No se usa ninguno |
| Recorte por defecto en el servicio de imagenes (v6) | Si | `<Image width={1020} height={510}>` en `BlogPostLayout.astro` ahora recorta (cover) en vez de ajustar (contain). Decision visual: anadir `fit="contain"` para conservar el comportamiento v5 |
| Nunca escalar imagenes (v6) | Verificar | Si `src/assets/imagen-portainer-index.png` mide menos de 1020x510, v5 la ampliaba; v6 no lo hara. Comprobar dimensiones en fase 3 |
| Endpoint con extension sin `/` final (v6) | No | `BaseHead.astro` usa `/sitemap-index.xml` y `rss.xml` sin barra final |
| IDs de headings Markdown (v6) + procesador Satteri (v7) | Verificar | Solo afecta a anclas hacia headings que acaban en caracteres especiales (1 unico post; improbable). Revisar enlaces internos del post en fase 3 |
| Compilador Rust estricto (v7) | Detectable en build | Fallara el build si hay tags sin cerrar. Revision inicial: ninguno detectado |
| `compressHTML: 'jsx'` (v7) | Verificar | Espacios entre elementos inline adyacentes pueden desaparecer. Revision visual en fase 3. Plan B: `compressHTML: true` |
| `src/fetch.ts` reservado (v7) | No | No existe |
| CommonJS config (v6) | No | Config es `astro.config.mjs` |
| `import.meta.env` inlineado (v6) | No | Solo se usa `import.meta.env.BASE_URL` |
| `getImage()` lanza en cliente (v6) | No | Solo se usa en frontmatter (servidor) |

## Ejecucion

### Fase 0 - Red de seguridad

1. Crear rama `upgrade/astro-7` desde `origin/develop` (destino del PR; `develop` y `main` tienen contenido identico a dia de hoy)
2. Commitear `package-lock.json` (generado durante el analisis, aun sin trackear)
3. Build baseline con v5 y guardar `dist/` (fuera del repo o carpeta temporal) para comparativa visual posterior

### Fase 1 - Dependencias

```powershell
npx @astrojs/upgrade
npm install sharp@^0.35.5 @astrojs/rss@latest
```

`@astrojs/upgrade` sube juntos astro y las integraciones oficiales: `astro@7.3.5`, `@astrojs/mdx` (v8), `@astrojs/sitemap`. Despues se actualizan `sharp` (fix CVEs altos) y `@astrojs/rss`. `tailwindcss` / `@tailwindcss/vite` a 4.3.3 via `npm update`.

Versiones objetivo:

| Paquete | Actual | Objetivo |
|---|---|---|
| astro | ^5.13.2 | 7.3.5 |
| @astrojs/mdx | ^4.3.4 | latest (v8) |
| @astrojs/sitemap | ^3.5.0 | 3.7.4 |
| @astrojs/rss | ^4.0.12 | 4.0.19 |
| sharp | ^0.34.2 | ^0.35.5 |
| tailwindcss + @tailwindcss/vite | ^4.1.12 | 4.3.3 |

### Fase 2 - Cambios de codigo (unicos 2 necesarios)

**Cambio 1 - `src/content.config.ts`** (deprecacion v6: `z` deja de exportarse desde `astro:content`):

```ts
// Antes
import { defineCollection, z } from 'astro:content';

// Despues
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
```

**Cambio 2 - `src/layouts/BlogPostLayout.astro:16-22`** (defensa contra `getImage` con string vacio, que puede lanzar error en v7):

```astro
// Antes
const optimizedHeroImage = await getImage({ src: heroImage || '' });
const heroImageUrl = new URL(optimizedHeroImage.src, Astro.url).href;

// Despues
const optimizedHeroImage = heroImage ? await getImage({ src: heroImage }) : undefined;
const heroImageUrl = optimizedHeroImage
    ? new URL(optimizedHeroImage.src, Astro.url).href
    : undefined;
```

**Decision visual (imagen hero)**: el `<Image width={1020} height={510}>` de `BlogPostLayout.astro` pasara de contain (v5) a cover/recorte (v6+). Si se prefiere el aspecto actual, anadir `fit="contain"`. Se decide en fase 3 comparando el render.

### Fase 2b - Correcciones pre-existentes APROBADAS (pendientes de ejecutar junto a la migracion)

1. `src/layouts/BlogPostLayout.astro:52`: eliminar el texto suelto `asd` que se renderiza en cada post
2. `src/components/Global/BaseHead.astro`: eliminar las precargas de `/fonts/atkinson-*.woff` (los archivos no existen en `public/`)

Ambas correcciones van en commits separados de la migracion.

### Fase 3 - Verificacion

1. `npm run build` - detecta errores del compilador Rust (tags sin cerrar) y de config
2. `npm audit` - debe reportar **0 vulnerabilidades**
3. `npm run preview` + comparativa visual contra el baseline de la fase 0:
   - `/` (home): espaciado de textos inline (compressHTML jsx)
   - `/blog` (listado): tarjetas con `<Image>`
   - `/blog/mi-laboratorio-de-self-hosting`: renderizado Markdown (Satteri), imagen hero (recorte/escalado), anclas de headings
   - `/rss.xml`: XML valido, items presentes
   - `/sitemap-index.xml`: accesible
   - `dist/_astro/`: imagenes optimizadas generadas
4. Plan B:
   - Espaciado roto -> `compressHTML: true` en `astro.config.mjs`
   - Markdown se renderiza distinto -> instalar `@astrojs/markdown-remark` y usar `processor: unified()`
   - Imagen hero recortada indeseado -> `fit="contain"`

### Fase 4 - Publicacion y rollback

Workflow acordado:
1. Todo el trabajo ocurre en local, en la rama `upgrade/astro-7`. Sin push hasta verificacion completa
2. Cuando todo este OK: push de la rama y PR a `develop`
3. El merge de `develop` -> `main` lo hace Anton manualmente (Vercel despliega automaticamente desde el repo)
4. Rollback: si algo falla antes del merge, se descarta la rama (`git checkout main`); si falla en produccion tras el merge, `git revert` del merge en `main` y Vercel redespliega

## Despliegue

- Hosting: **Vercel**, despliegue automatico desde GitHub (repo TrastoRacing)
- Node de Vercel: 22 por defecto -> cumple el requisito de Node >= 22.12 de Astro 6/7
- El build de produccion (`astro build`) es estatico, sin adaptador: sin configuracion adicional esperada en Vercel
