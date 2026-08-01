/**
 * HV — Bot de Postulación Automática a Empleo
 * ============================================
 * Plataformas: Computrabajo | El Empleo | Magneto | LinkedIn
 *
 * MODOS:
 *   node index.js --buscar                    # Busca y aplica automáticamente
 *   node index.js --url URL                   # Aplica a una URL específica
 *   node index.js --lista urls.txt            # Aplica a lista de URLs en archivo
 *
 * PLATAFORMAS (se pueden combinar):
 *   --computrabajo  --elempleo  --magneto  --linkedin
 *   Sin flag = todas las habilitadas en config.json
 *
 * OPCIONES EXTRA:
 *   --solo-buscar   Solo extrae URLs sin aplicar (útil para revisar antes)
 *   --max N         Máximo de postulaciones esta sesión (override de config.json)
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stdin, stdout, exit } from 'node:process';
import { abrirEdge, delay } from './src/browser.js';
import { cargarRegistro, yaPostulada, registrarPostulacion, resumenRegistro } from './src/registro.js';
import { capturar } from './src/screenshots.js';

// ─── Colores de terminal (sin dependencias externas) ───
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
};

function log(msg, color = C.reset) { console.log(`${color}${msg}${C.reset}`); }
function titulo(msg) { console.log(`\n${C.bold}${C.cyan}${'═'.repeat(55)}\n  ${msg}\n${'═'.repeat(55)}${C.reset}\n`); }
function ok(msg) { log(`  ✅ ${msg}`, C.green); }
function warn(msg) { log(`  ⚠️  ${msg}`, C.yellow); }
function err(msg) { log(`  ❌ ${msg}`, C.red); }
function info(msg) { log(`  ℹ  ${msg}`, C.gray); }

function ask(question) {
  return new Promise(resolve => {
    stdout.write(question);
    let buf = '';
    stdin.resume();
    const cb = data => {
      buf += data.toString();
      if (buf.includes('\n')) {
        stdin.removeListener('data', cb);
        stdin.pause();
        resolve(buf.trim());
      }
    };
    stdin.on('data', cb);
  });
}

// ─── Logger a archivo ───
function setupLog() {
  mkdirSync('logs', { recursive: true });
  const fecha = new Date().toISOString().split('T')[0];
  const logPath = join('logs', `${fecha}.log`);
  const orig = { log: console.log, error: console.error };
  const write = (prefix, args) => {
    const line = `[${new Date().toISOString()}] ${prefix} ${args.join(' ')}\n`;
    appendFileSync(logPath, line, 'utf-8');
  };
  console.log = (...args) => { orig.log(...args); write('', args); };
  console.error = (...args) => { orig.error(...args); write('[ERROR]', args); };
  return logPath;
}

// ─── Parseo de argumentos (sin commander) ───
function parsearArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    modo: null,        // 'buscar' | 'url' | 'lista'
    url: null,
    listaPath: null,
    plataformas: [],   // vacío = usar config.json
    soloBuscar: args.includes('--solo-buscar'),
    max: null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--buscar') opts.modo = 'buscar';
    else if (a === '--url') { opts.modo = 'url'; opts.url = args[++i]; }
    else if (a === '--lista') { opts.modo = 'lista'; opts.listaPath = args[++i]; }
    else if (a === '--computrabajo') opts.plataformas.push('computrabajo');
    else if (a === '--elempleo') opts.plataformas.push('elempleo');
    else if (a === '--magneto') opts.plataformas.push('magneto');
    else if (a === '--linkedin') opts.plataformas.push('linkedin');
    else if (a === '--max') opts.max = parseInt(args[++i], 10);
  }

  return opts;
}

// ─── Detectar plataforma desde URL ───
function detectarPlataforma(url) {
  if (url.includes('computrabajo')) return 'computrabajo';
  if (url.includes('elempleo')) return 'elempleo';
  if (url.includes('magneto365')) return 'magneto';
  if (url.includes('linkedin')) return 'linkedin';
  return 'desconocida';
}

// ─── Importación dinámica de módulos por plataforma ───
async function getModulo(plataforma) {
  switch (plataforma) {
    case 'computrabajo': return await import('./src/computrabajo.js');
    case 'elempleo':     return await import('./src/elempleo.js');
    case 'magneto':      return await import('./src/magneto.js');
    case 'linkedin':     return await import('./src/linkedin.js');
    default:             return null;
  }
}

// ─── Función principal ───
async function main() {
  const opts = parsearArgs(process.argv);
  const logPath = setupLog();

  titulo('HV — Bot de Postulación a Empleo');

  // MODO INTERACTIVO (por defecto si no hay argumentos)
  if (!opts.modo) {
    titulo('Modo Interactivo: Pegar URLs');

    const sesionPath = resolve(process.cwd(), 'ultima_sesion.json');
    let urlsPegadas = [];

    // Verificar si hay una sesión anterior guardada
    if (existsSync(sesionPath)) {
      const sesionAnterior = JSON.parse(readFileSync(sesionPath, 'utf-8'));
      const pendientes = sesionAnterior.urls || [];
      const fecha = sesionAnterior.fecha ? new Date(sesionAnterior.fecha).toLocaleString('es-CO') : '?';

      if (pendientes.length > 0) {
        console.log(`${C.bold}Sesión anterior guardada (${fecha}):${C.reset}`);
        console.log(`${C.gray}  ${pendientes.length} URLs guardadas.${C.reset}\n`);

        const opciones = await ask(
          `${C.yellow}¿Qué quieres hacer?\n  1) Continuar con las ${pendientes.length} URLs de la sesión anterior\n  2) Ingresar nuevas URLs\n  3) Combinar (sesión anterior + nuevas)\n→ Tu elección (1/2/3): ${C.reset}`
        );

        if (opciones.trim() === '1') {
          urlsPegadas = pendientes;
          info(`Continuando con ${urlsPegadas.length} URL(s) de la sesión anterior.`);
        } else if (opciones.trim() === '3') {
          urlsPegadas = [...pendientes];
          console.log(`\n${C.bold}Pega las URLs nuevas (vacío para terminar):${C.reset}`);
          while (true) {
            const input = await ask('URL: ');
            if (!input.trim()) break;
            const lineas = input.split('\n').map(l => l.trim()).filter(l => l);
            for (const linea of lineas) {
              const match = linea.match(/https?:\/\/[^\s]+/);
              if (match) urlsPegadas.push(match[0]);
            }
          }
          info(`Total combinado: ${urlsPegadas.length} URL(s).`);
        } else {
          // Opción 2: nuevas URLs
          urlsPegadas = [];
        }
      }
    }

    // Si no hay URLs aún (opción 2 o primera vez), pedir al usuario
    if (urlsPegadas.length === 0) {
      console.log(`${C.bold}Pega las URLs de las ofertas (vacío para terminar):${C.reset}`);
      console.log(`${C.gray}(Puedes pegar un bloque completo de URLs a la vez)${C.reset}\n`);

      while (true) {
        const input = await ask('URL (vacío para terminar): ');
        if (!input.trim()) break;
        const lineas = input.split('\n').map(l => l.trim()).filter(l => l);
        for (const linea of lineas) {
          const match = linea.match(/https?:\/\/[^\s]+/);
          if (match) {
            urlsPegadas.push(match[0]);
          } else {
            warn(`Línea sin URL ignorada: ${linea}`);
          }
        }
      }
    }

    if (urlsPegadas.length === 0) {
      err('No se ingresaron URLs. Saliendo...');
      exit(0);
    }

    // Guardar sesión para el próximo lanzamiento
    writeFileSync(sesionPath, JSON.stringify({ fecha: new Date().toISOString(), urls: urlsPegadas }, null, 2), 'utf-8');
    info(`Sesión guardada: ${urlsPegadas.length} URL(s) en ultima_sesion.json`);

    opts.modo = 'interactivo';
    opts.urls = urlsPegadas;
  }

  // Cargar configuración
  const configPath = resolve(process.cwd(), 'config.json');
  if (!existsSync(configPath)) {
    err('No se encontró config.json. Cópialo desde el ejemplo y completa tus datos.');
    exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Override max si se pasó por args
  if (opts.max) config.busqueda.max_ofertas_por_sesion = opts.max;

  // Determinar plataformas activas
  const plataformasActivas = opts.plataformas.length > 0
    ? opts.plataformas
    : Object.entries(config.plataformas || {}).filter(([, v]) => v).map(([k]) => k);

  if (plataformasActivas.length === 0) {
    warn('No hay plataformas habilitadas. Activa alguna en config.json o usa --computrabajo, --elempleo, etc.');
    exit(1);
  }

  info(`Plataformas activas: ${plataformasActivas.join(', ')}`);
  info(`Modo: ${opts.modo}${opts.soloBuscar ? ' (solo buscar)' : ''}`);
  info(`Log: ${logPath}\n`);

  // Cargar registro de postulaciones anteriores
  const registro = cargarRegistro();
  info(`Postulaciones históricas: ${registro.length} | Hoy: ${resumenRegistro(registro).hoy}`);

  // Abrir Edge
  let context, page;
  try {
    ({ context, page } = await abrirEdge(config));
  } catch (e) {
    err(`No se pudo abrir Edge: ${e.message}`);
    err('Verifica que config.json tenga las rutas correctas de Edge.');
    exit(1);
  }

  // Estadísticas de sesión
  const stats = { ok: 0, ya_postulada: 0, error: 0, saltada: 0 };

  try {
    // ── MODO: URL única ──────────────────────────────────────────────
    if (opts.modo === 'url') {
      if (!opts.url) { err('Debes proporcionar una URL con --url URL'); exit(1); }
      await procesarUrl(opts.url, page, config, registro, stats, opts.soloBuscar);
    }

    // ── MODO: Lista de URLs desde archivo ────────────────────────────
    else if (opts.modo === 'lista') {
      if (!opts.listaPath || !existsSync(opts.listaPath)) {
        err(`No se encontró el archivo: ${opts.listaPath}`);
        exit(1);
      }
      const urls = readFileSync(opts.listaPath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && l.startsWith('http'));

      info(`URLs en el archivo: ${urls.length}`);
      for (const url of urls) {
        await procesarUrl(url, page, config, registro, stats, opts.soloBuscar);
        await delay(config.busqueda.delay_min_ms, config.busqueda.delay_max_ms);
      }
    }

    // ── MODO: Interactivo (URLs pegadas en consola) ──────────────────
    else if (opts.modo === 'interactivo') {
      info(`URLs a procesar: ${opts.urls.length}`);
      for (const url of opts.urls) {
        await procesarUrl(url, page, config, registro, stats, opts.soloBuscar);
        await delay(config.busqueda.delay_min_ms, config.busqueda.delay_max_ms);
      }
    }

    // ── MODO: Búsqueda automática ────────────────────────────────────
    else if (opts.modo === 'buscar') {
      for (const plataforma of plataformasActivas) {
        const modulo = await getModulo(plataforma);
        if (!modulo) { warn(`Módulo "${plataforma}" no encontrado.`); continue; }

        log(`\n${C.bold}${C.blue}── ${plataforma.toUpperCase()} ──${C.reset}`);
        let urls = [];
        try {
          urls = await modulo.buscarOfertas(page, config);
        } catch (e) {
          err(`Error buscando en ${plataforma}: ${e.message}`);
          continue;
        }

        if (urls.length === 0) { warn(`Sin resultados en ${plataforma}.`); continue; }

        info(`${urls.length} oferta(s) encontradas en ${plataforma}.`);
        if (opts.soloBuscar) {
          info('Modo --solo-buscar: mostrando URLs sin aplicar:');
          urls.forEach((u, i) => info(`  ${i + 1}. ${u}`));
          continue;
        }

        for (const url of urls) {
          await procesarUrl(url, page, config, registro, stats, false, plataforma);
          await delay(config.busqueda.delay_min_ms, config.busqueda.delay_max_ms);
        }
      }
    }

  } finally {
    // ── RESUMEN ──────────────────────────────────────────────────────
    await capturar(page, '0_resumen_final');
    titulo('RESUMEN DE SESIÓN');
    ok(`Postulaciones exitosas:  ${stats.ok}`);
    info(`Ya postulado antes:      ${stats.ya_postulada}`);
    warn(`Errores:                 ${stats.error}`);
    info(`Saltadas:                ${stats.saltada}`);
    const resumen = resumenRegistro(registro);
    info(`Total histórico:         ${resumen.total_historico}`);
    info(`Log guardado en:         ${logPath}`);

    await ask('\nPresiona Enter para cerrar Edge...');
    await context.close();
  }
}

/**
 * Procesa una URL individual: verifica si ya fue postulada, aplica y registra.
 */
async function procesarUrl(url, page, config, registro, stats, soloBuscar, plataformaForzada) {
  const plataforma = plataformaForzada || detectarPlataforma(url);

  // Verificar si ya postulamos
  if (yaPostulada(registro, url)) {
    info(`Saltando (ya postulada): ${url}`);
    stats.ya_postulada++;
    return;
  }

  if (soloBuscar) {
    info(`URL: ${url} [${plataforma}]`);
    return;
  }

  const modulo = await getModulo(plataforma);
  if (!modulo) {
    warn(`No se reconoce la plataforma para: ${url}`);
    stats.saltada++;
    return;
  }

  let resultado;
  try {
    resultado = await modulo.aplicarOferta(page, url, config);
  } catch (e) {
    err(`Error al aplicar a ${url}: ${e.message}`);
    registrarPostulacion(registro, { url, plataforma, estado: 'error', titulo: url, empresa: '' });
    stats.error++;
    return;
  }

  if (resultado.ok) {
    ok(`Postulado: "${resultado.titulo}" — ${resultado.empresa}`);
    registrarPostulacion(registro, { url, plataforma, estado: 'ok', titulo: resultado.titulo, empresa: resultado.empresa });
    stats.ok++;
  } else {
    const motivo = resultado.motivo || 'desconocido';
    if (motivo === 'ya_postulado') {
      info(`Ya postulado (detectado en página): "${resultado.titulo}"`);
      registrarPostulacion(registro, { url, plataforma, estado: 'ya_postulado', titulo: resultado.titulo, empresa: resultado.empresa });
      stats.ya_postulada++;
    } else if (motivo === 'requiere_login') {
      warn(`Requiere login: "${resultado.titulo}". Verifica tu sesión en Edge.`);
      stats.error++;
    } else {
      warn(`Sin éxito (${motivo}): "${resultado.titulo}"`);
      registrarPostulacion(registro, { url, plataforma, estado: motivo, titulo: resultado.titulo, empresa: resultado.empresa });
      stats.error++;
    }
  }
}

main().catch(e => {
  console.error('\n[FATAL]', e.message);
  exit(1);
});