/**
 * registro.js — Gestión del registro de postulaciones (aplicadas.json)
 *
 * Evita postularse dos veces a la misma oferta y permite hacer seguimiento.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRO_PATH = resolve(process.cwd(), 'aplicadas.json');

/** Carga el registro existente desde disco. */
export function cargarRegistro() {
  if (!existsSync(REGISTRO_PATH)) return [];
  try {
    return JSON.parse(readFileSync(REGISTRO_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

/** Verifica si una URL ya fue postulada EXITOSAMENTE (no fallida). */
export function yaPostulada(registro, url) {
  // Normalizar URL quitando parámetros de tracking
  const urlLimpia = url.split('?')[0].replace(/\/$/, '');
  
  // Estados que se consideran "ya procesados" y no se reintentan
  const estadosFinales = ['ok', 'ya_postulado'];
  
  return registro.some(entry => {
    const entryLimpia = entry.url.split('?')[0].replace(/\/$/, '');
    return entryLimpia === urlLimpia && estadosFinales.includes(entry.estado);
  });
}

/**
 * Agrega una entrada al registro y guarda en disco.
 * @param {Array} registro - Registro actual en memoria
 * @param {object} entrada - { url, titulo, empresa, plataforma, estado }
 */
export function registrarPostulacion(registro, entrada) {
  const nueva = {
    url: entrada.url,
    titulo: entrada.titulo || 'Sin título',
    empresa: entrada.empresa || 'Sin empresa',
    plataforma: entrada.plataforma || 'desconocida',
    estado: entrada.estado || 'ok',
    fecha: new Date().toISOString(),
  };
  registro.push(nueva);
  writeFileSync(REGISTRO_PATH, JSON.stringify(registro, null, 2), 'utf-8');
  return nueva;
}

/** Genera un resumen del registro actual. */
export function resumenRegistro(registro) {
  const hoy = new Date().toDateString();
  const hoy_total = registro.filter(e => new Date(e.fecha).toDateString() === hoy);
  const por_plataforma = {};
  for (const e of hoy_total) {
    por_plataforma[e.plataforma] = (por_plataforma[e.plataforma] || 0) + 1;
  }
  return { total_historico: registro.length, hoy: hoy_total.length, por_plataforma };
}
