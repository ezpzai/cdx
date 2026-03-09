<div align="center">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# <div align="center">cdx</div>

<div align="center">
  <strong>Un plano de control local-first para quienes manejan más de una cuenta de Codex.</strong>
</div>

<div align="center">
  Inicia Codex con el perfil correcto, consulta el uso sin revisar archivos de autenticación
  y controla el estado del <code>AGENTS.md</code> compartido desde un solo panel.
</div>

<br />

<div align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-111111?style=for-the-badge&logo=node.js&logoColor=5FA04E" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-111111?style=for-the-badge&logo=vite&logoColor=646CFF" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%26%20macOS-supported-111111?style=for-the-badge" />
</div>

<br />

<div align="center">
  <a href="#inicio-rápido"><img alt="Quick Start" src="https://img.shields.io/badge/Quick%20Start-18181B?style=flat-square&logo=rocket&logoColor=white" /></a>
  <a href="#referencia-de-comandos"><img alt="CLI" src="https://img.shields.io/badge/CLI-18181B?style=flat-square&logo=gnubash&logoColor=white" /></a>
  <a href="#cómo-funciona-el-panel"><img alt="Dashboard" src="https://img.shields.io/badge/Dashboard-18181B?style=flat-square&logo=react&logoColor=61DAFB" /></a>
  <a href="#dirección-del-roadmap"><img alt="Roadmap" src="https://img.shields.io/badge/Roadmap-18181B?style=flat-square&logo=github&logoColor=white" /></a>
</div>

<div align="center">
  <sub>Local-first, orientado a perfiles y pensado para operadores de Codex que necesitan visibilidad, no más aliases.</sub>
</div>

## Destacados

| Ejecución por perfil | Visibilidad de uso | AGENTS compartido | Panel local |
| --- | --- | --- | --- |
| Ejecuta `codex` siempre con el `CODEX_HOME` correcto | Consulta uso en vivo sin abrir archivos de autenticación | Mantén un solo `AGENTS.md` entre varios repositorios | Usa el navegador para tareas que no requieren un terminal completo |

## Flujos típicos

| Escenario | En qué ayuda cdx |
| --- | --- |
| Desarrollador con cuenta personal y de trabajo | Cambiar entre perfiles sin tocar variables de entorno a mano |
| Responsable técnico con varios homes de Codex | Ver rápido quién está logueado, qué plan tiene y qué perfil está cerca del límite |
| Entorno con muchos repositorios | Reutilizar un `AGENTS.md` compartido en vez de repetir la configuración en cada repo |
| Operación orientada al navegador | Lanzar runs, logins y refrescos de doctor sin depender solo del terminal |

## Arquitectura de un vistazo

```text
Homes heredados (~/.codex, ~/.codex2, ...)
             +
Homes modernos (~/.cdx/profiles/*)
             |
             v
   descubrimiento de perfiles cdx
             |
             +-------------------+
             |                   |
             v                   v
       comandos CLI         API local de Vite
             |                   |
             +---------+---------+
                       |
                       v
  acciones compartidas: run / usage / login / logout /
  doctor / agents / gestión de perfiles
                       |
                       v
         Codex CLI + panel local
```

## Pensado para estas situaciones

- manejas más de una identidad de Codex en la misma máquina
- quieres ver estado de cuenta y uso antes de iniciar una sesión larga
- quieres una superficie web ligera para las acciones más comunes
- quieres un comportamiento compartido de `AGENTS.md` entre repositorios sin scripts improvisados

## Por qué cdx

Muchos entornos con varias cuentas de Codex empiezan con aliases de shell, carpetas de configuración duplicadas y notas sobre qué cuenta está conectada en cada lugar.
`cdx` convierte eso en un flujo explícito.

- ejecución de `codex` con perfiles
- un solo lugar para revisar estado de cuenta y uso
- gestión compartida de `AGENTS.md` entre repositorios
- panel web para acciones comunes que no requieren un terminal completo

## Lo que ofrece hoy

### CLI

- `cdx run [profile] [codex args...]`
- `cdx usage [profile] [--json]`
- `cdx agents edit --global`
- `cdx agents status`
- `cdx ls`
- `cdx whoami [profile]`
- `cdx login <profile>`
- `cdx logout <profile>`
- `cdx create <profile>`
- `cdx rm <profile> [--force]`
- `cdx doctor`

### Panel web

- vista general de perfiles, uso en vivo, cobertura de AGENTS y estado de doctor
- run picker para iniciar una sesión de Codex
- creación de perfiles
- inicio de sesiones de login y logout
- inicio de sesiones run con polling de estado
- refresco de doctor
- preparación de `AGENTS.md` compartido

## Mapa de capacidades

| Área | Incluido hoy |
| --- | --- |
| Ciclo de vida de perfiles | crear, listar, inspeccionar, eliminar |
| Acceso de cuenta | login, logout y visibilidad de metadatos de autenticación |
| Operaciones de uso | lectura de uso en vivo y vistas por uno o varios perfiles |
| Ergonomía del repositorio | preparación de AGENTS global y revisión de estado |
| Control de sesiones | iniciar runs de Codex y consultar estado desde el panel |

## Inicio rápido

### Requisitos

- Node.js 20+
- `codex` disponible en `PATH`
- Linux o macOS

### Instalación

```bash
npm install
npm run build
```

### Iniciar el panel

```bash
npm run dev
```

Esto inicia la UI de Vite y la capa de API local usada por el panel.

### Usar el CLI

```bash
node dist-cli/index.js --help
```

Si quieres usar un comando local durante el desarrollo:

```bash
npm link
cdx doctor
```

## Flujo inicial

```bash
cdx create work
cdx login work
cdx usage work
cdx run work
```

Si ya gestionas varios homes de Codex, `cdx` también puede detectar perfiles heredados como `~/.codex` y `~/.codex2`.

## Referencia de comandos

| Comando | Propósito |
| --- | --- |
| `cdx run [profile] [codex args...]` | Ejecuta `codex` con el `CODEX_HOME` del perfil elegido |
| `cdx usage [profile] [--json]` | Lee snapshots de uso para un perfil o para todos |
| `cdx agents edit --global` | Prepara y abre el `AGENTS.md` global compartido |
| `cdx agents status` | Muestra el estado de conexión de AGENTS global y del proyecto |
| `cdx ls` | Lista los perfiles detectados |
| `cdx whoami [profile]` | Muestra metadatos de cuenta del perfil |
| `cdx login <profile>` | Inicia el flujo de login de un perfil |
| `cdx logout <profile>` | Inicia el flujo de logout de un perfil |
| `cdx create <profile>` | Crea un perfil moderno en `~/.cdx/profiles` |
| `cdx rm <profile> [--force]` | Elimina un perfil |
| `cdx doctor` | Ejecuta comprobaciones del entorno y la configuración |

## Cómo funciona el panel

La UI web no es un backend separado. En desarrollo y preview, el servidor de Vite expone endpoints locales que llaman a la misma lógica de perfiles y acciones usada por el CLI.

- `GET /api/dashboard` agrega perfiles, uso, estado de AGENTS y sugerencias de doctor
- `POST /api/run-sessions` inicia una ejecución de Codex para un perfil
- `POST /api/login-sessions` inicia un flujo de login
- `POST /api/profiles/:id/logout` inicia un flujo de logout
- `GET /api/action-sessions/:id` consulta el progreso de una sesión
- `POST /api/agents/global-file` prepara el `AGENTS.md` global compartido

Así se mantiene un producto local-first: sin plano de control alojado, sin otro servicio para desplegar y sin duplicar lógica entre la capa CLI y la del navegador.

## Fuente de uso

`cdx usage` y el panel leen el uso principalmente desde el endpoint de usage del backend de ChatGPT usando el estado de autenticación guardado de cada perfil.
La ruta antigua basada en `/status` sigue existiendo por compatibilidad, pero no es la principal.

## Limitaciones actuales

- la UI web todavía no ofrece un terminal interactivo completo
- los flujos largos de Codex siguen encajando mejor en un terminal real
- `agents edit --global` por ahora prepara el archivo y abre el editor local, no un editor dentro del navegador
- el soporte para Windows está incompleto
- partes de la ruta heredada basada en `/status` dependen de herramientas de terminal no disponibles en Windows

## Desarrollo

```bash
npm run typecheck
npm run lint
npm run build
```

El punto de entrada del CLI compilado es:

```bash
node dist-cli/index.js --help
```

## Dirección del roadmap

- más visibilidad operativa para múltiples cuentas
- mejor monitoreo de sesiones desde el panel
- onboarding más fluido para usuarios menos centrados en terminal
- menos configuración manual de AGENTS entre repositorios

## Intención de diseño

El panel busca una sensación operativa y cálida, no la de un panel de administración genérico.
Debe sentirse como un sidecar enfocado para el trabajo con Codex.

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
