/**
 * preguntas.js — Sistema de caché inteligente de respuestas a formularios
 *
 * Cuando aparece una pregunta desconocida en un formulario de postulación,
 * la muestra en terminal y te pide que respondas.
 * La respuesta queda guardada en preguntas.json y se reutiliza automáticamente
 * en cualquier plataforma, en cualquier sesión futura.
 *
 * Formato de preguntas.json:
 * {
 *   "respuestas": [
 *     {
 *       "patron": "años de experiencia",   // texto normalizado de la pregunta
 *       "respuesta": "3",                  // tu respuesta
 *       "tipo": "text",                    // text | select | radio | checkbox
 *       "veces_usada": 7,
 *       "fecha": "2026-07-31T..."
 *     }
 *   ]
 * }
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';

const CACHE_PATH = resolve(process.cwd(), 'preguntas.json');

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Lee el caché del disco. */
function cargarCache() {
  if (!existsSync(CACHE_PATH)) return { respuestas: [] };
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return { respuestas: [] };
  }
}

/** Guarda el caché en disco. */
function guardarCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Normaliza el texto de una pregunta para usarlo como clave de búsqueda.
 * Ejemplo: "¿Cuántos años de experiencia tienes?" → "cuantos anos de experiencia tienes"
 */
function normalizarPregunta(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/[¿?¡!,:.()\[\]]/g, '')                   // quitar puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula similitud entre dos strings normalizados (0 = nada, 1 = idéntico).
 * Usa Jaccard sobre palabras para tolerancia a variaciones menores.
 */
function similitud(a, b) {
  const sa = new Set(a.split(' ').filter(w => w.length > 2));
  const sb = new Set(b.split(' ').filter(w => w.length > 2));
  const interseccion = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : interseccion / union;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Busca en el caché si hay una respuesta para esta pregunta.
 * Umbral de similitud: 0.65 (tolerante a pequeñas variaciones).
 *
 * @param {string} textoPregunta
 * @returns {{ respuesta: string, entrada: object } | null}
 */
export function buscarRespuestaEnCache(textoPregunta) {
  const cache = cargarCache();
  const norm = normalizarPregunta(textoPregunta);

  let mejorMatch = null;
  let mejorScore = 0;

  for (const entrada of cache.respuestas) {
    const score = similitud(norm, normalizarPregunta(entrada.patron));
    if (score > mejorScore) {
      mejorScore = score;
      mejorMatch = entrada;
    }
  }

  if (mejorScore >= 0.65 && mejorMatch) {
    return { respuesta: mejorMatch.respuesta, entrada: mejorMatch };
  }
  return null;
}

/**
 * Guarda una nueva respuesta en el caché (o actualiza una existente).
 *
 * @param {string} textoPregunta - Texto original de la pregunta
 * @param {string} respuesta - Tu respuesta
 * @param {string} tipo - 'text' | 'select' | 'radio' | 'checkbox'
 */
export function guardarRespuesta(textoPregunta, respuesta, tipo = 'text') {
  const cache = cargarCache();
  const norm = normalizarPregunta(textoPregunta);

  // Buscar si ya existe una entrada muy similar para actualizarla
  const existente = cache.respuestas.find(
    e => similitud(normalizarPregunta(e.patron), norm) >= 0.9
  );

  if (existente) {
    existente.respuesta = respuesta;
    existente.tipo = tipo;
    existente.veces_usada = (existente.veces_usada || 0) + 1;
    existente.fecha_actualizado = new Date().toISOString();
  } else {
    cache.respuestas.push({
      patron: textoPregunta.trim(),
      patron_normalizado: norm,
      respuesta,
      tipo,
      veces_usada: 1,
      fecha: new Date().toISOString(),
    });
  }

  guardarCache(cache);
}

/** Incrementa el contador de uso de una entrada del caché. */
export function marcarUsada(entrada) {
  if (!entrada) return;
  const cache = cargarCache();
  const idx = cache.respuestas.findIndex(e => e.patron === entrada.patron);
  if (idx >= 0) {
    cache.respuestas[idx].veces_usada = (cache.respuestas[idx].veces_usada || 0) + 1;
    cache.respuestas[idx].ultimo_uso = new Date().toISOString();
    guardarCache(cache);
  }
}

/**
 * Pregunta al usuario en la terminal por una respuesta y la guarda en caché.
 *
 * @param {string} textoPregunta
 * @param {string[]} opciones - Si hay opciones disponibles (select/radio)
 * @param {string} tipo
 * @returns {Promise<string>}
 */
export function preguntarAlUsuario(textoPregunta, opciones = [], tipo = 'text') {
  return new Promise(resolve => {
    console.log('\n' + '─'.repeat(55));
    console.log(`\x1b[33m[PREGUNTA NUEVA]\x1b[0m ${textoPregunta}`);

    if (opciones.length > 0) {
      console.log('\x1b[90mOpciones disponibles:\x1b[0m');
      opciones.forEach((op, i) => console.log(`  \x1b[36m${i + 1}.\x1b[0m ${op}`));
      stdout.write('\x1b[33m→ Tu respuesta (escribe el texto exacto o el número de la opción): \x1b[0m');
    } else {
      stdout.write('\x1b[33m→ Tu respuesta: \x1b[0m');
    }

    let buf = '';
    stdin.resume();
    const cb = data => {
      buf += data.toString();
      if (buf.includes('\n')) {
        stdin.removeListener('data', cb);
        stdin.pause();
        let respuesta = buf.trim();

        // Si escribió un número y hay opciones, usar el texto de la opción
        if (opciones.length > 0) {
          const num = parseInt(respuesta, 10);
          if (!isNaN(num) && num >= 1 && num <= opciones.length) {
            respuesta = opciones[num - 1];
          }
        }

        guardarRespuesta(textoPregunta, respuesta, tipo);
        console.log(`\x1b[32m  ✅ Respuesta guardada: "${respuesta}"\x1b[0m`);
        resolve(respuesta);
      }
    };
    stdin.on('data', cb);
  });
}

/**
 * Muestra el contenido del caché de respuestas al usuario.
 */
export function mostrarCache() {
  const cache = cargarCache();
  if (cache.respuestas.length === 0) {
    console.log('[preguntas] El caché está vacío. Se irá llenando a medida que respondas preguntas.');
    return;
  }
  console.log(`\n[preguntas] Caché con ${cache.respuestas.length} respuesta(s) guardada(s):`);
  for (const e of cache.respuestas) {
    console.log(`  \x1b[36m"${e.patron.substring(0, 60)}"\x1b[0m → \x1b[32m"${e.respuesta}"\x1b[0m (usada ${e.veces_usada || 1}x)`);
  }
}
