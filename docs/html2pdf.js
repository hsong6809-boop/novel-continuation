const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const htmlPath = 'file:///' + path.resolve('C:/Users/ADMIN/Desktop/novel-continuation-main/docs/architecture.html').split('\\').join('/');
  console.log('Loading:', htmlPath);
  await page.goto(htmlPath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await page.pdf({
    path: 'C:/Users/ADMIN/Desktop/architecture.pdf',
    format: 'A3',
    printBackground: true,
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
  });
  await browser.close();
  const fs = require('fs');
  const size = fs.statSync('C:/Users/ADMIN/Desktop/architecture.pdf').size;
  console.log('PDF saved, size:', size, 'bytes');
})();
