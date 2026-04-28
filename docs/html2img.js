const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const page = await browser.newPage();
  // 设置宽屏 viewport 保证图表不挤压
  await page.setViewportSize({ width: 1400, height: 900 });
  const htmlPath = 'file:///' + path.resolve('C:/Users/ADMIN/Desktop/novel-continuation-main/docs/architecture.html').split('\\').join('/');
  console.log('Loading:', htmlPath);
  await page.goto(htmlPath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);

  await page.screenshot({
    path: 'C:/Users/ADMIN/Desktop/architecture.png',
    fullPage: true,
    type: 'png'
  });

  await browser.close();
  const fs = require('fs');
  const size = fs.statSync('C:/Users/ADMIN/Desktop/architecture.png').size;
  console.log('PNG saved, size:', size, 'bytes');
})();
