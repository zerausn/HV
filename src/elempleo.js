/**
 * elempleo.js — Lógica específica de El Empleo Colombia
 * https://www.elempleo.com
 */

import { delay } from './browser.js';
import { rellenarFormulario } from './formFiller.js';

const BASE_URL = 'https://www.elempleo.com';

function construirUrlBusqueda(busqueda) {
  // El Empleo: /colombia/ofertas-empleo?buscar=cargo&idCiudad=...
  // Ciudad Cali = 762, Bogotá = 666, Medellín = 1006 (códigos internos)
  const ciudades = { cali: 762, bogota: 666, bogotá: 666, medellin: 1006, medellín: 1006, barranquilla: 321 };
  const idCiudad = ciudades[(busqueda.ciudad || '').toLowerCase()] || '';
  const cargo = encodeURIComponent(busqueda.cargo || 'analista');
  const base = `${BASE_URL}/colombia/ofertas-empleo?buscar=${cargo}`;
  return idCiudad ? `${base}&idCiudad=${idCiudad}` : base;
}

async function aceptarCookies(page) {
  try {
    const btn = page.locator('button:has-text("Aceptar"), button:has-text("Acepto"), #onetrust-accept-btn-handler').first();
    if (await btn.count() > 0 && await btn.isVisible()) {
      await btn.click();
      await delay(500, 1000);
    }
  } catch { /* ok */ }
}

export async function buscarOfertas(page, config) {
  const url = construirUrlBusqueda(config.busqueda);
  const max = config.busqueda.max_ofertas_por_sesion || 15;

  console.log(`[elempleo] Buscando: "${config.busqueda.cargo}" en "${config.busqueda.ciudad}"`);
  console.log(`[elempleo] URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3000);
  await aceptarCookies(page);

  try {
    await page.waitForSelector('.offer-list-item, .job-card, article.oferta', { timeout: 10000 });
  } catch {
    console.log('[elempleo] AVISO: No se encontraron tarjetas. Revisando DOM...');
    console.log('[elempleo] URL actual:', page.url());
    return [];
  }

  const urls = await page.evaluate((baseUrl) => {
    const links = new Set();
    const selectores = [
      'a[href*="/colombia/ofertas-empleo/oferta"]',
      '.offer-list-item a[href*="/oferta"]',
      'a[href*="/empleo/oferta"]',
    ];
    for (const sel of selectores) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href) links.add(href.startsWith('http') ? href : baseUrl + href);
      });
    }
    return Array.from(links);
  }, BASE_URL);

  console.log(`[elempleo] Encontradas ${urls.length} oferta(s). Limitando a ${max}.`);
  return urls.slice(0, max);
}

export async function aplicarOferta(page, url, config) {
  const minDelay = config.busqueda.delay_min_ms || 1500;
  const maxDelay = config.busqueda.delay_max_ms || 3500;

  console.log(`\n[elempleo] → Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(minDelay, maxDelay);
  await aceptarCookies(page);

  let titulo = '';
  let empresa = '';
  try {
    titulo = (await page.textContent('h1'))?.trim() || 'Sin título';
    empresa = (await page.textContent('.company-name, .empresa, .nombre-empresa'))?.trim() || 'Sin empresa';
  } catch { titulo = 'Sin título'; }

  console.log(`[elempleo] Oferta: "${titulo}" — ${empresa}`);

  // Botones de aplicación
  const selectoresAplicar = [
    'a:has-text("Aplicar")', 'button:has-text("Aplicar")',
    'a:has-text("Postularme")', 'button:has-text("Postularme")',
    '.btn-apply', '[data-cy="apply-btn"]',
  ];

  let aplicado = false;
  for (const sel of selectoresAplicar) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        console.log(`[elempleo] Clic en: "${await btn.textContent()}"`);
        await btn.click();
        await delay(2500, 4000);
        aplicado = true;
        break;
      }
    } catch { continue; }
  }

  if (!aplicado) {
    return { ok: false, titulo, empresa, motivo: 'sin_boton' };
  }

  if (page.url().includes('login') || page.url().includes('Login')) {
    return { ok: false, titulo, empresa, motivo: 'requiere_login' };
  }

  const hayFormulario = await page.locator('form').count() > 0;
  if (hayFormulario) {
    await rellenarFormulario(page, config.perfil);
    await delay(minDelay, maxDelay);
  }

  const textosPagina = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  const confirmaciones = ['aplicación enviada', 'postulación exitosa', 'gracias', 'has aplicado', 'inscripción'];
  const confirmado = confirmaciones.some(c => textosPagina.toLowerCase().includes(c));

  if (confirmado) console.log('[elempleo] ✅ Postulación confirmada.');
  else console.log('[elempleo] ⚠️  Sin confirmación explícita.');

  return { ok: true, titulo, empresa };
}
