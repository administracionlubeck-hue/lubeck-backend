// Cliente de WhatsApp Cloud API (Meta) — https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Esto SÍ está confirmado contra la documentación oficial de Meta (es una API
// estable y bien documentada). Lo que depende de vos, del lado de Meta Business
// Manager, antes de que esto funcione:
//
//   1. Verificar el negocio en Meta Business Manager.
//   2. Dar de alta un número de teléfono dedicado a WhatsApp Business
//      (no puede ser el que ya usás a mano) → eso te da el WHATSAPP_PHONE_NUMBER_ID.
//   3. Generar un token de acceso permanente (token de "system user", no el
//      temporal de prueba que caduca en 24hs) → eso es WHATSAPP_ACCESS_TOKEN.
//   4. Crear y esperar que Meta apruebe una plantilla de mensaje (no se puede
//      mandar texto libre como primer mensaje — tiene que ser una plantilla
//      pre-aprobada). Por ejemplo, una plantilla "factura_servicio" con dos
//      variables: nombre del cliente y monto.
//
// Sin esos 4 pasos, esta función va a devolver un error de Meta explicando
// qué falta — es esperable, no un bug de este código.

const GRAPH_VERSION = 'v21.0'; // revisar en developers.facebook.com si hay una versión más nueva vigente

async function enviarFacturaPorWhatsApp({ telefono, nombreCliente, monto }) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'factura_servicio';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR';

  if (!phoneNumberId || !accessToken) {
    throw new Error('Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN en el .env.');
  }
  if (!telefono || !nombreCliente || monto === undefined) {
    throw new Error('Faltan datos: hacen falta telefono, nombreCliente y monto.');
  }

  // "telefono" tiene que venir en formato E.164 sin el "+", ej: 5491155667788
  const body = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(nombreCliente) },
            { type: 'text', text: String(monto) },
          ],
        },
        // Si la plantilla tiene un header de tipo "documento" para adjuntar
        // el PDF de la factura, va acá un component más:
        // {
        //   type: 'header',
        //   parameters: [{ type: 'document', document: { link: urlFacturaPDF, filename: 'factura.pdf' } }],
        // },
      ],
    },
  };

  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const detalle = data?.error?.message || JSON.stringify(data);
    const err = new Error(`WhatsApp (Meta) respondió ${resp.status}: ${detalle}`);
    err.status = resp.status;
    err.body = data;
    throw err;
  }

  return data;
}

module.exports = { enviarFacturaPorWhatsApp };
