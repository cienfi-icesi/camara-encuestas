/* Autenticación del tablero (sitio estático en GitHub Pages).
 *
 * ADVERTENCIA DE SEGURIDAD (pedida por la dirección del proyecto):
 * - GitHub Pages es estático y público: no hay servidor que valide credenciales. Cualquier
 *   "login" hecho solo en el navegador puede saltarse... EXCEPTO si los datos están cifrados,
 *   que es lo que hacemos aquí: cada usuario descarga SOLO su porción, cifrada con AES-256-GCM
 *   y una clave derivada de su contraseña (PBKDF2-SHA256, 210 000 iteraciones). Sin la
 *   contraseña, el archivo es ruido.
 * - La contraseña es la CÉDULA del encuestador. Es un secreto débil (10 dígitos, a menudo
 *   conocido por terceros). Protege frente a curiosos, no frente a un atacante con GPU.
 *   Para endurecer sin tocar código: cambiar la contraseña en el secreto USUARIOS_JSON.
 * - Ruta de migración a auth server-side: reemplazar `Auth.abrir()` por una llamada a un
 *   endpoint autenticado (p. ej. Cloudflare Worker / Apps Script) que devuelva el mismo JSON;
 *   `app.js` no cambia porque solo consume el objeto descifrado.
 */
(function () {
  'use strict';

  function b64aBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function gunzip(buf) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no soporta descompresión gzip (DecompressionStream). Usa una versión reciente de Chrome, Edge, Firefox o Safari.');
    }
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  async function cargarIndice() {
    const r = await fetch('data/usuarios.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo cargar la lista de usuarios (' + r.status + ')');
    return r.json();
  }

  async function abrir(usuario, clave) {
    usuario = (usuario || '').trim().toLowerCase();
    clave = (clave || '').trim();
    if (!usuario || !clave) throw new Error('credenciales');
    const r = await fetch('data/' + encodeURIComponent(usuario) + '.enc.json', { cache: 'no-store' });
    if (r.status === 404) throw new Error('credenciales');
    if (!r.ok) throw new Error('No se pudo descargar el tablero (' + r.status + ')');
    const p = await r.json();
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64aBytes(p.salt), iterations: p.iteraciones || 210000, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let plano;
    try {
      plano = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64aBytes(p.iv), additionalData: enc.encode(p.usuario || usuario) },
        key, b64aBytes(p.datos));
    } catch (e) {
      throw new Error('credenciales');
    }
    if (p.comprimido === 'gzip') plano = await gunzip(plano);
    return JSON.parse(new TextDecoder().decode(plano));
  }

  window.Auth = { cargarIndice, abrir };
})();
