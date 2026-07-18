# tadaima-catalog-mcp

Servidor MCP para configurar el **Catálogo Online** de Tadaima POS desde Claude
(Claude Code o Claude Desktop). Alcance acotado a la configuración del catálogo
público `/catalogo`: temas de color, visibilidad, redes sociales, descripción,
orden de entrada y productos destacados/ocultos. **No** toca ventas, caja,
inventario ni usuarios.

## Setup

```bash
cd mcp/catalog
npm install
npm run build          # → dist/index.js
```

### Token (admin)

El MCP llama al API con un token Sanctum de un usuario **admin**:

```bash
curl -s -X POST https://tadaima.poslite.com.mx/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin>","password":"<password>"}'
# → copiar data.token
export TADAIMA_API_TOKEN="<token>"
```

> El token no expira solo, pero un `POST /auth/logout` o cambio de contraseña
> lo invalida — si ves 401, genera uno nuevo.

## Claude Code (este repo)

Ya está registrado en el `.mcp.json` de la raíz. Solo exporta
`TADAIMA_API_TOKEN` en tu shell antes de abrir Claude Code.

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tadaima-catalog": {
      "command": "node",
      "args": ["/Users/<tu-usuario>/Documents/JOEL/Tadaima/mcp/catalog/dist/index.js"],
      "env": {
        "TADAIMA_API_URL": "https://tadaima.poslite.com.mx/api/v1",
        "TADAIMA_API_TOKEN": "<token>"
      }
    }
  }
}
```

## Tools

| Tool | Qué hace |
|---|---|
| `list_options` | Qué se puede configurar (colores, fondos, diseños, toggles, órdenes, redes) |
| `get_config` | Configuración actual completa + conteo destacados/ocultos |
| `set_theme` | Cambia el color (`tadaima`, `gradient`, `navidad`, `halloween`, `patrio`, `muertos`) |
| `set_background` | Cambia el fondo (`shader` nebulosa, `gradient` degradado, `galaxy` galaxia 3D) |
| `set_layout` | Cambia el acomodo (`classic`, `sidebar` menú lateral, `masonry` revista) |
| `set_toggles` | Prende/apaga precios, existencias, carrito, buscador, footer, etc. |
| `set_socials` | URLs de Instagram/Facebook/TikTok/X/YouTube/Discord del footer |
| `set_description` | Descripción de la tienda (footer) |
| `set_default_sort` | Orden de entrada: `new` o `featured` |
| `list_products` | Lista productos con ★ (destacado) / 🚫 (oculto) |
| `set_product_flags` | Destaca u oculta un producto del catálogo |

Ejemplos de uso en Claude: *"pon el catálogo en modo navidad"*, *"¿qué opciones
de tienda tengo?"*, *"destaca el Funko de Goku y esconde los cables viejos"*,
*"pon el Instagram de la tienda"*.

## Dev

```bash
TADAIMA_API_URL=http://localhost:8000/api/v1 TADAIMA_API_TOKEN=<token> npm run dev
# inspector interactivo:
npx @modelcontextprotocol/inspector node dist/index.js
```
