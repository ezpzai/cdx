<div align="center">
  <a href="../README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# cdx

**Usa Codex con más facilidad, también desde móvil.**

<div align="center">
  <img src="../assets/social-preview.png" alt="cdx social preview" width="100%" />
</div>

## Inicio rápido

### Requisitos

- Node.js 20+
- Codex instalado: `npm install -g @openai/codex`
- Se requiere `cloudflared`
- Compatible con Linux y macOS

### Instalación

```bash
npm install -g @ezpzai/cdx
```

### Instalar Cloudflare Quick Tunnel

`cdx remote` usa Cloudflare Quick Tunnel por defecto.

macOS:

```bash
brew install cloudflared
```

Linux:

```bash
curl -Lo cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

### Primer uso

```bash
cdx login {perfil} // requiere registro inicial
cdx run {perfil}
cdx remote // acceso móvil
cdx usage // revisar usage
```

## Comandos principales

| Comando | Descripción |
| --- | --- |
| `cdx remote [profile] [codex args...] [--mode <safe\|balanced\|yolo>] [--tunnel <cloudflare\|none>] [--no-qr] [--lan]` | Continúa en web móvil una sesión de Codex iniciada en el escritorio. |
| `cdx run [profile] [codex args...] [--mode <safe\|balanced\|yolo>]` | Lanza Codex con el `CODEX_HOME` del perfil elegido. |
| `cdx usage [profile] [--json]` | Revisa el estado de auth y quota por perfil. |
| `cdx mode` | Muestra el modo de ejecución por defecto actual. |
| `cdx mode set <safe\|balanced\|yolo> [--profile <profile>]` | Guarda un modo por defecto global o por perfil. |
| `cdx login <profile>` | Crea un perfil nuevo o inicia sesión en uno existente. |
| `cdx logout <profile>` | Inicia el logout de un perfil. |
| `cdx ls` | Muestra los perfiles detectados. |
| `cdx rm <profile> [--force]` | Elimina un perfil. |
| `cdx agents edit --global` | Prepara y abre el `AGENTS.md` global compartido. |
| `cdx agents status` | Comprueba el estado de conexión del `AGENTS.md` global y del proyecto. |

`cdx remote` usa `Cloudflare Quick Tunnel` como ruta externa por defecto.

- Enlace externo: `cdx remote <profile>`
- Misma Wi-Fi / LAN: `cdx remote <profile> --tunnel none --lan`
- Solo local: `cdx remote <profile> --tunnel none`
