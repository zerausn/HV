import { chromium } from 'playwright';

const EDGE_PATH = '/var/lib/flatpak/app/com.microsoft.Edge/x86_64/stable/326e26781e73f72614e139573c44451c8fecfbfc235e64cf2d35d07f373081bc/files/extra/msedge';
const PROFILE_DIR = '/home/zerausn/.var/app/com.microsoft.Edge/config/microsoft-edge';

const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  executablePath: EDGE_PATH,
  args: ['--no-first-run', '--no-default-browser-check'],
});

const page = browser.pages()[0] || await browser.newPage();
await page.goto('https://co.computrabajo.com/empleos-de-analista-en-cali', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

console.log('URL:', page.url());
console.log('TITLE:', await page.title());

// 1. Contar y listar elementos con href de oferta
const enlaces = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a[href*="oferta"]'));
  return all.slice(0, 15).map(a => ({
    href: a.href.substring(0, 100),
    texto: a.textContent.trim().substring(0, 60),
    clase: a.className.substring(0, 50)
  }));
});
console.log('\nENLACES CON "oferta":', enlaces.length);
enlaces.forEach((e, i) => console.log(`  ${i}: ${e.texto} | ${e.href} | ${e.clase}`));

// 2. Estructura de artículos/tarjetas
const articulos = await page.evaluate(() => {
  const tags = ['article', 'li', '.g_card', '.offerListItem', '[data-regid]', '.box_oferta', '.c_card'];
  const res = {};
  for (const t of tags) {
    res[t] = document.querySelectorAll(t).length;
  }
  return res;
});
console.log('\nCONTEO DE SELECTORES:', JSON.stringify(articulos, null, 2));

// 3. Texto visible de la zona de resultados
const texto = await page.evaluate(() => document.body.innerText.substring(0, 1200));
console.log('\nTEXTO VISIBLE (primeros 1200 chars):');
console.log(texto);

await browser.close();
