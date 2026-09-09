# Backend de Lubeck

El único servicio que guarda las credenciales de **Xubio** y de **WhatsApp Cloud API**,
y el único que les habla directamente. La app del técnico, el panel de despacho,
o cualquier pantalla nueva que se agregue, le piden cosas a este servidor —
nunca a Xubio ni a WhatsApp directamente. Así el Secret-ID de Xubio y el token
de WhatsApp nunca viajan a algo que corra en un navegador o un celular, donde
cualquiera podría verlos.

## Por qué existe esto

Se intentó probar las credenciales de Xubio directo desde el entorno de Claude
y desde ahí no se puede: la red de ese entorno bloquea `xubio.com` (y en
general, cualquier prototipo que corra en el navegador tampoco podría hacerlo
de forma segura, por más que la red se lo permitiera — el secreto quedaría
visible en el código de la página). Este backend es el lugar que faltaba.

## Qué hace hoy

| Método | Ruta | Qué hace | Estado |
|---|---|---|---|
| GET | `/health` | Chequeo de que el proceso está vivo (sin autenticación) | ✅ Listo |
| GET | `/api/xubio/test-token` | Pide un token real a Xubio, para confirmar que las credenciales andan | ✅ Listo |
| GET | `/api/xubio/recurso/:nombre` | Pasamanos a cualquier recurso de Xubio (ej. `facturaVenta`, `clienteBean`) — para ver el formato real de tus datos | ✅ Listo |
| POST | `/api/facturas` | Crear una factura de venta en Xubio a partir de un servicio | 🟡 Estructura lista, falta el schema real (ver abajo) |
| POST | `/api/whatsapp/enviar` | Mandar la factura por WhatsApp (plantilla) | 🟡 Código listo, depende de que Meta esté configurado (ver abajo) |

Todas las rutas bajo `/api/` piden el header `Authorization: Bearer <INTERNAL_API_KEY>`.

## Cómo probarlo en tu computadora (antes de subirlo al VPS)

```bash
npm install
cp .env.example .env
# completá .env con tus valores reales (ver más abajo qué es cada uno)
npm start
```

Con el server corriendo, en otra terminal:

```bash
# Chequeo básico
curl http://localhost:3000/health

# Confirmar que las credenciales de Xubio andan de verdad
curl http://localhost:3000/api/xubio/test-token \
  -H "Authorization: Bearer TU_INTERNAL_API_KEY"

# Ver una factura real ya cargada, para copiar el formato de campos
curl http://localhost:3000/api/xubio/recurso/facturaVenta \
  -H "Authorization: Bearer TU_INTERNAL_API_KEY"
```

Esto **no se puede probar desde Claude** (la red de ese entorno bloquea
`xubio.com`), pero sí desde tu computadora o, mejor, ya desplegado en el VPS.

## Cómo desplegarlo (recomendado: mismo VPS que Traccar)

Ya vas a tener un VPS chico corriendo Traccar con Docker — este backend es
otro contenedor más, en el mismo servidor:

1. Copiá esta carpeta al VPS (o cloná el repo si lo subís a git — con
   `.gitignore` el `.env` con los secretos no se sube nunca).
2. Completá el `.env` ahí, con los valores reales de producción.
3. Sumá el bloque `lubeck-backend:` de `docker-compose.yml` al `docker-compose.yml`
   que ya tengas para Traccar (o corré `docker compose up -d --build` en esta
   carpeta si preferís tenerlo aparte).
4. Si el panel de despacho o la app del técnico terminan viviendo en un
   dominio propio (como ya está previsto para el panel), este backend
   también debería quedar detrás de ese mismo dominio con HTTPS (por ejemplo
   con un reverse proxy tipo Caddy o nginx delante de los contenedores).

## Variables de entorno

| Variable | De dónde sale |
|---|---|
| `INTERNAL_API_KEY` | La generás vos: `openssl rand -hex 32`. Se la das a las apps que van a llamar a este backend. |
| `XUBIO_CLIENT_ID` / `XUBIO_SECRET_ID` | Xubio → Configuración → Integraciones → API de Xubio → Nueva App Cliente. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Business Manager → WhatsApp → Configuración de la API, después de dar de alta un número dedicado. |
| `WHATSAPP_ACCESS_TOKEN` | Un token **permanente** (de "system user"), no el temporal de prueba que caduca en 24hs. |
| `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` | El nombre de la plantilla de mensaje que Meta te apruebe (ver abajo). |

## Antes de usar esto en producción

Dos cosas quedaron con una estructura lista pero sin terminar de confirmar,
a propósito — mejor eso que código que "parece" andar pero factura mal:

**1. El formato real de la factura en Xubio.** `crearFacturaVenta()`
(`src/xubio/client.js`) tiene un ejemplo razonable de campos, pero no está
confirmado contra el schema real de Xubio (su documentación pública no lo
publica en detalle). Para completarlo:
   - `GET /api/xubio/recurso/facturaVenta` → mirá una factura que ya
     hayas cargado a mano, y copiá los nombres de campo exactos.
   - `GET /api/xubio/recurso/clienteBean` → lo mismo para el cliente.
   - Si hace falta algo que no se ve por ahí, soporte de Xubio puede pasar
     un ejemplo de payload — tienen API paga, es una pregunta razonable para
     hacerles.

**2. WhatsApp necesita configuración del lado de Meta, no solo código:**
   - Verificar el negocio en Meta Business Manager.
   - Dar de alta un número de teléfono dedicado a WhatsApp Business.
   - Generar un token de acceso permanente.
   - Crear una plantilla de mensaje (por ejemplo `factura_servicio`, con el
     nombre del cliente y el monto como variables) y esperar que Meta la
     apruebe — no se puede mandar texto libre como primer mensaje.

## Seguridad

- El `.env` nunca se commitea ni se comparte (ya está en `.gitignore`).
- Las credenciales de Xubio y de WhatsApp viven **solo** en este servidor.
  Ninguna pantalla (app del técnico, panel de despacho, ni ningún otro
  artifact) debe tenerlas nunca.
- Si alguna de estas claves quedó escrita en algún chat o documento en algún
  momento, conviene regenerarla desde Xubio / Meta apenas se pueda.

## Próximo paso

Conectar esto a la app del técnico: cuando el cliente firma, la app le pega
a `POST /api/facturas` de este backend (y éste, opcionalmente, dispara el
WhatsApp). Por ahora la app del técnico sigue siendo un prototipo con datos
de prueba — falta ese cable entre las dos cosas.
