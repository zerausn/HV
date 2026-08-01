/**
 * magneto.js — Lógica específica de Magneto365 Colombia
 * https://www.magneto365.com
 */

import { delay } from './browser.js';
import { rellenarFormulario } from './formFiller.js';

const BASE_URL = 'https://www.magneto365.com';

function construirUrlBusqueda(busqueda) {
  // Magneto: /jobs?search=cargo&location=ciudad
  const cargo = encodeURIComponent(busqueda.cargo || 'analista');
  const ciudad = encodeURIComponent(busqueda.ciudad || 'cali');
  return `${BASE_URL}/jobs?search=${cargo}&location=${ciudad}`;
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

  console.log(`[magneto] Buscando: "${config.busqueda.cargo}" en "${config.busqueda.ciudad}"`);
  console.log(`[magneto] URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3500);
  await aceptarCookies(page);

  // Magneto carga con React, esperar tarjetas
  try {
    await page.waitForSelector('[data-testid="job-card"], .job-card, .vacancy-card, article', { timeout: 12000 });
  } catch {
    console.log('[magneto] AVISO: No se encontraron tarjetas. URL actual:', page.url());
    return [];
  }

  // Scroll para cargar más resultados (lazy loading)
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await delay(800, 1200);
  }

  const urls = await page.evaluate((baseUrl) => {
    const links = new Set();
    const selectores = [
      'a[href*="/jobs/"]',
      'a[href*="/vacante/"]',
      '[data-testid="job-card"] a',
      '.job-card a',
    ];
    for (const sel of selectores) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href && (href.includes('/jobs/') || href.includes('/vacante/'))) {
          links.add(href.startsWith('http') ? href : baseUrl + href);
        }
      });
    }
    return Array.from(links);
  }, BASE_URL);

  console.log(`[magneto] Encontradas ${urls.length} oferta(s). Limitando a ${max}.`);
  return urls.slice(0, max);
}

export async function aplicarOferta(page, url, config) {
  const minDelay = config.busqueda.delay_min_ms || 1500;
  const maxDelay = config.busqueda.delay_max_ms || 3500;

  console.log(`\n[magneto] → Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(minDelay, maxDelay);
  await aceptarCookies(page);

  let titulo = '';
  let empresa = '';
  try {
    titulo = (await page.textContent('h1'))?.trim() || 'Sin título';
    empresa = (await page.textContent('.company-name, .employer-name, [data-testid="company-name"]'))?.trim() || 'Sin empresa';
  } catch { titulo = 'Sin título'; }

  console.log(`[magneto] Oferta: "${titulo}" — ${empresa}`);

  const selectoresAplicar = [
    'button:has-text("Aplicar")', 'a:has-text("Aplicar")',
    'button:has-text("Postularme")', 'a:has-text("Postularme")',
    'button:has-text("Inscribirme")',
    '[data-testid="apply-button"]',
  ];

  let aplicado = false;
  for (const sel of selectoresAplicar) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        console.log(`[magneto] Clic en: "${await btn.textContent()}"`);
        await btn.click();
        await delay(2500, 4000);
        aplicado = true;
        break;
      }
    } catch { continue; }
  }

  if (!aplicado) return { ok: false, titulo, empresa, motivo: 'sin_boton' };
  if (page.url().includes('login') || page.url().includes('Login')) {
    return { ok: false, titulo, empresa, motivo: 'requiere_login' };
  }

  const hayFormulario = await page.locator('form').count() > 0;
  if (hayFormulario) {
    await rellenarFormulario(page, config.perfil);
    await delay(minDelay, maxDelay);
  }

  const textosPagina = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  const confirmaciones = ['aplicación enviada', 'postulación exitosa', 'gracias', 'has aplicado'];
  const confirmado = confirmaciones.some(c => textosPagina.toLowerCase().includes(c));

  if (confirmado) console.log('[magneto] ✅ Postulación confirmada.');
  else console.log('[magneto] ⚠️  Sin confirmación explícita.');

  return { ok: true, titulo, empresa };
}
