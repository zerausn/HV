/**
 * computrabajo.js — Lógica específica de Computrabajo Colombia
 *
 * Dos operaciones principales:
 *   1. buscarOfertas()  — Navega a resultados de búsqueda y extrae URLs
 *   2. aplicarOferta()  — Abre una oferta y ejecuta el flujo de postulación
 */

import { delay } from './browser.js';
import { rellenarFormulario } from './formFiller.js';
import { capturar } from './screenshots.js';

const BASE_URL = 'https://co.computrabajo.com';

/**
 * Construye la URL de búsqueda de Computrabajo con los filtros del config.
 * Formato real (verificado 2026-08): https://co.computrabajo.com/empleos-de-<cargo>-en-<ciudad>
 * @param {object} busqueda - config.busqueda
 */
function construirUrlBusqueda(busqueda) {
  const cargo = encodeURIComponent(busqueda.cargo || 'analista');
  const ciudad = encodeURIComponent(busqueda.ciudad || 'cali');
  return `${BASE_URL}/empleos-de-${cargo}-en-${ciudad}`;
}

/**
 * Acepta el banner de cookies si aparece.
 * @param {import('playwright').Page} page
 */
async function aceptarCookies(page) {
  try {
    const cookieBtn = page.locator(
      '.cc-dismiss, .cc-btn, button:has-text("Acepto"), button:has-text("Aceptar")'
    ).first();
    if (await cookieBtn.count() > 0 && await cookieBtn.isVisible()) {
      await cookieBtn.click();
      await delay(500, 1000);
    }
  } catch {
    // Sin banner de cookies, ok
  }
}

/**
 * Navega a la página de resultados y extrae las URLs de las ofertas.
 *
 * @param {import('playwright').Page} page
 * @param {object} config - Configuración completa
 * @returns {string[]} - Array de URLs absolutas de cada oferta
 */
export async function buscarOfertas(page, config) {
  const url = construirUrlBusqueda(config.busqueda);
  const max = config.busqueda.max_ofertas_por_sesion || 15;

  console.log(`[computrabajo] Buscando: "${config.busqueda.cargo}" en "${config.busqueda.ciudad}"`);
  console.log(`[computrabajo] URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(4000, 7000);
  await aceptarCookies(page);

  // Esperar que carguen las tarjetas de oferta
  try {
    await page.waitForSelector('article a[href*="/oferta-de-trabajo-"], a.js-o-link[href*="/oferta-de-trabajo-"]', { timeout: 15000 });
  } catch {
    console.log('[computrabajo] AVISO: No se encontraron tarjetas de oferta. La estructura del DOM puede haber cambiado.');
    console.log('[computrabajo] URL actual:', page.url());
    await capturar(page, 'busqueda_sin_resultados');
    return [];
  }

  // Extraer hrefs de las tarjetas de oferta
  const urls = await page.evaluate((baseUrl) => {
    const links = new Set();

    // Selector verificado 2026-08: tarjetas <article> con enlaces .js-o-link
    const selectores = [
      'article a.js-o-link[href*="/oferta-de-trabajo-"]',
      'article a[href*="/oferta-de-trabajo-"]',
      'a.js-o-link[href*="/oferta-de-trabajo-"]',
      'a[href*="/oferta-de-trabajo-"]',
    ];

    for (const sel of selectores) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.includes('/empresas/')) {
          const full = href.startsWith('http') ? href : baseUrl + href;
          links.add(full);
        }
      });
    }

    return Array.from(links);
  }, BASE_URL);

  console.log(`[computrabajo] Encontradas ${urls.length} oferta(s). Limitando a ${max}.`);
  return urls.slice(0, max);
}

/**
 * Aplica a una oferta de trabajo en Computrabajo.
 *
 * @param {import('playwright').Page} page
 * @param {string} url - URL de la oferta
 * @param {object} config - Configuración completa
 * @returns {{ ok: boolean, titulo: string, empresa: string, motivo?: string }}
 */
export async function aplicarOferta(page, url, config) {
  const minDelay = config.busqueda.delay_min_ms || 1500;
  const maxDelay = config.busqueda.delay_max_ms || 3500;

  console.log(`\n[computrabajo] → Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(4000, 7000);
  await capturar(page, '1_navegacion_oferta');

  // DETECTAR BLOQUEO TEMPORAL del sitio ("The service is unavailable", 503, etc.)
  const textoBloqueo = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
  if (/service is unavailable|unavailable|no disponible temporalmente|503/i.test(textoBloqueo) && !page.url().includes('/oferta-de-trabajo-')) {
    console.log('[computrabajo] ⚠️  El sitio está bloqueando temporalmente (service unavailable).');
    console.log('[computrabajo] Esperando 60 segundos antes de reintentar...');
    await capturar(page, '1b_bloqueo_temporal');
    await page.waitForTimeout(60000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 7000);
    await capturar(page, '1c_reintento');
  }

  // Esperar a que cargue el contenido dinámico (el botón de aplicar carga tarde)
  await Promise.race([
    page.waitForSelector('[attach-cv-button-text], a:has-text("Inscribirme"), button:has-text("Aplicar")', { timeout: 8000 }),
    delay(4000, 7000), // espera humana mientras carga
  ]).catch(() => {}); // no fallar si no aparece

  await aceptarCookies(page);

  // Ritmo humano: pausa antes de extraer el contenido
  await delay(4000, 7000);

  // Extraer título y empresa — usar selectores específicos de oferta
  let titulo = '';
  let empresa = '';
  try {
    // En página de oferta real: el título NO es h1.title_page (ese es el buscador)
    // Intentamos selectores específicos de la ficha de oferta
    titulo = (await page.textContent('.title_offer, h1:not(.title_page), .fs21.fwB.mt10, .job-title').catch(() => null))?.trim()
          || 'Sin título';
    // Empresa: buscar dentro del bloque de detalle, NO del menú de nav
    empresa = (await page.textContent('.t_s16.fc_base.mt5, .companyName, [data-cy="company-name"], .company_name, article .fc_base.fwB:not([href*="/empresas/"])').catch(() => null))?.trim() || '';
  } catch {
    titulo = 'Sin título';
  }

  console.log(`[computrabajo] Oferta: "${titulo}" — ${empresa}`);
  await capturar(page, '2_oferta_detectada');

  // Verificar si ya estamos postulados
  const yaPostulado = await page.locator(
    'button:has-text("Ya te has inscrito"), .already-applied, [data-cy="already-applied"]'
  ).count();
  if (yaPostulado > 0) {
    console.log('[computrabajo] Ya estabas postulado a esta oferta.');
    return { ok: false, titulo, empresa, motivo: 'ya_postulado' };
  }

  // Detectar el estado "Ya aplicaste a esta oferta" (texto visible)
  const textoPaginaInicial = await page.evaluate(() => document.body.innerText);
  if (/ya aplicaste|ya te has inscrito|ya est[aá]s postulado|ya postulado/i.test(textoPaginaInicial)) {
    console.log('[computrabajo] La página indica que YA aplicaste a esta oferta.');
    await capturar(page, '2b_ya_aplicada');
    return { ok: false, titulo, empresa, motivo: 'ya_postulado' };
  }

  // Detectar si la oferta ya no existe o redirigió al listado de búsqueda
  const urlActual = page.url();
  const esPaginaOfertaUrl = urlActual.includes('/oferta-de-trabajo-') || urlActual.includes('?fgoa=');

  if (!esPaginaOfertaUrl || titulo === 'Sin título') {
    console.log(`[computrabajo] La oferta ya no está disponible o expiró (sin título).`);
    console.log(`[computrabajo] DEBUG: url_original=${url.split('#')[0].split('?')[0].slice(0, 80)}`);
    console.log(`[computrabajo] DEBUG: url_actual=${urlActual.slice(0, 120)}`);
    console.log(`[computrabajo] DEBUG: esPaginaOfertaUrl=${esPaginaOfertaUrl}, titulo="${titulo}"`);
    await capturar(page, '2c_oferta_no_disponible');
    return { ok: false, titulo, empresa, motivo: 'oferta_no_disponible' };
  }

  const selectoresAplicar = [
    '[attach-cv-button-text]',          // botón principal real de Computrabajo
    '[data-apply-ac]',
    '[offer-detail-button]',
    'span:has-text("Aplicar")',
    'a:has-text("Inscribirme")',
    'button:has-text("Inscribirme")',
    'a:has-text("Aplicar")',
    'button:has-text("Aplicar")',
    'a:has-text("Postularme")',
    'button:has-text("Postularme")',
    '#apply_job',
    '#btnSubmit',
    '[data-cy="btn-apply"]',
    '.apply-btn',
  ];

  let aplicado = false;
  for (const sel of selectoresAplicar) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        console.log(`[computrabajo] Clic en botón: "${await btn.textContent()}"`);
        await btn.click();
        await delay(4000, 7000);
        aplicado = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!aplicado) {
    console.log('[computrabajo] No se encontró botón de postulación.');
    await capturar(page, '4_sin_boton_postular');
    return { ok: false, titulo, empresa, motivo: 'sin_boton' };
  }

  await capturar(page, '3_click_aplicar');

  // Verificar si se requiere login
  if (page.url().includes('Account/Login') || page.url().includes('/login')) {
    console.log('[computrabajo] ATENCIÓN: Redirigió a login. La sesión puede haber expirado.');
    await capturar(page, '5_redirigido_login');
    return { ok: false, titulo, empresa, motivo: 'requiere_login' };
  }

  // Intentar rellenar formulario si apareció uno
  const hayFormulario = await page.locator('form').count() > 0;
  if (hayFormulario) {
    await capturar(page, '5_formulario_antes');
    await rellenarFormulario(page, config.perfil);
    await delay(minDelay, maxDelay);
    await capturar(page, '6_formulario_despues');
  }

  // Confirmar éxito: buscar mensajes de confirmación
  const textosPagina = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  const confirmaciones = [
    'te has inscrito', 'inscripción exitosa', 'postulación enviada',
    'gracias por aplicar', 'aplicación enviada', 'has aplicado',
  ];
  const confirmado = confirmaciones.some(c => textosPagina.toLowerCase().includes(c));

  if (confirmado) {
    console.log('[computrabajo] ✅ Postulación confirmada.');
  } else {
    console.log('[computrabajo] ⚠️  No se encontró confirmación explícita. Revisa el navegador.');
  }
  await capturar(page, '7_resultado_final');

  return { ok: true, titulo, empresa };
}
