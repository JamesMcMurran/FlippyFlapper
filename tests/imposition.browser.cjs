const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');

test('standalone Flippy Flapper imports natural filename order and applies booklet settings', async ({ page }) => {
    const flippyRoot = path.resolve(__dirname, '..');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://flippy.test/**', route => {
        const url = new URL(route.request().url()),target = path.join(flippyRoot, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(target)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream', body: fs.readFileSync(target) });
    });
    await page.goto('http://flippy.test/');
    await expect(page.locator('#edit-layouts')).toBeEnabled();
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');canvas.width=200;canvas.height=150;
        const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(20,0,0)';ctx.fillRect(0,0,100,150);ctx.fillStyle='rgb(0,0,20)';ctx.fillRect(100,0,100,150);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#page-files').setInputFiles(['10.png','2.png'].map(name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png,'base64') })));
    await expect(page.locator('#app-status')).toContainText('2 images opened');
    await page.locator('#edit-layouts').click();
    await expect(page.locator('#layout-rows label').first()).toContainText('2.png');
    await page.locator('#imposition-settings [data-imposition=type]').selectOption('booklet');
    await expect(page.locator('#imposition-settings .ff-imposition-preview figure')).toHaveCount(4);
    await page.locator('#apply-layouts').click();
    await expect(page.locator('#app-status')).toContainText('2 images · 4 pages');
    await expect(page.locator('.ff-page>canvas')).toHaveCount(1);
    expect(await page.locator('.ff-page>canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(10,10,1,1).data])).toEqual([0,0,20,255]);
    expect(errors).toEqual([]);
});
