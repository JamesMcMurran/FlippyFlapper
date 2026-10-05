const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');

test.beforeEach(async ({page}) => {
    const flippyRoot = path.resolve(__dirname, '..');
    await page.route('http://flippy.test/**', route => {
        const url = new URL(route.request().url()),target = path.join(flippyRoot, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(target)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream', body: fs.readFileSync(target) });
    });
    await page.goto('http://flippy.test/');
});

test('standalone Flippy Flapper imports natural filename order and applies booklet settings', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
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

test('layout edits update the preview and canceled choices stay unapplied', async ({page}) => {
    await expect(page.locator('#edit-layouts')).toBeEnabled();
    await page.locator('#edit-layouts').click();
    await expect(page.locator('.ff-imposition-preview figure')).toHaveCount(12);
    await page.locator('#layout-0').selectOption('spread');
    await expect(page.locator('.ff-imposition-preview figure')).toHaveCount(14);
    await page.locator('#cancel-layouts').click();
    await expect(page.locator('#app-status')).toContainText('12 pages');
    await page.locator('#edit-layouts').click();
    await expect(page.locator('.ff-imposition-preview figure')).toHaveCount(12);
    await page.locator('#layout-0').selectOption('spread');
    await page.locator('#apply-layouts').click();
    await expect(page.locator('#app-status')).toContainText('14 pages');
    await page.locator('#edit-layouts').click();
    await expect(page.locator('.ff-imposition-preview figure')).toHaveCount(14);
});

test('auto-imposed manifests load with alignment blanks and original source mappings', async ({page}) => {
    const state=await page.evaluate(async()=>{
        const manifest={title:'Test',pageWidth:100,pageHeight:150,pages:[
            {index:1,image:'demo/pages/001.webp',thumbnail:'demo/thumbs/001.webp',width:200,height:150,layout:'spread'},
            {index:2,image:'demo/pages/002.webp',thumbnail:'demo/thumbs/002.webp',width:100,height:150,layout:'single'}
        ]};
        const mapped=FlippyFlapper.applyImposition(manifest,{type:'auto'});
        const element=document.createElement('div');element.style.height='700px';document.body.append(element);
        const viewer=FlippyFlapper.create(element,{manifest:mapped});await viewer.ready;
        const result={state:viewer.getState(),sources:viewer.manifest.pages.map(p=>p.sourceIndex)};
        viewer.goToPage(3);result.blankVisible=viewer.getState().visiblePages;
        viewer.destroy();element.remove();return result;
    });
    expect(state.state.pageCount).toBe(4);expect(state.state.sourcePageCount).toBe(2);
    expect(state.sources).toEqual([1,2,null,1]);
    expect(state.blankVisible).toContainEqual({pageIndex:3,sourceIndex:null});
});


test('cancel discards custom rotations and reading-order edits', async ({page}) => {
    await expect(page.locator('#edit-layouts')).toBeEnabled();
    await page.locator('#edit-layouts').click();
    await page.locator('[data-imposition=type]').selectOption('custom');
    await page.locator('#apply-layouts').click();
    await expect(page.locator('#edit-layouts')).toBeEnabled();
    await page.locator('#edit-layouts').click();
    await page.locator('[data-assignment="0"] select').selectOption('90');
    await page.locator('[data-assignment="0"] input').fill('2');
    await page.locator('[data-assignment="1"] input').fill('1');
    await page.locator('[data-assignment="1"] input').press('Tab');
    await page.locator('#cancel-layouts').click();
    await page.locator('#edit-layouts').click();
    await expect(page.locator('[data-assignment="0"] select')).toHaveValue('0');
    await expect(page.locator('[data-assignment="0"]')).toContainText('Image 1, panel 1');
});

test('reader-spreads preview agrees with the viewer for automatic wide images', async ({page}) => {
    await expect(page.locator('#edit-layouts')).toBeEnabled();
    const png=await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=300;canvas.height=100;
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#page-files').setInputFiles([{name:'wide.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}]);
    await expect(page.locator('#app-status')).toContainText('1 images opened');
    await page.locator('#edit-layouts').click();
    await page.locator('[data-imposition=type]').selectOption('reader-spreads');
    await expect(page.locator('.ff-imposition-preview figure')).toHaveCount(1);
    await page.locator('#apply-layouts').click();
    await expect(page.locator('#app-status')).toContainText('1 images · 1 pages');
});

test('destroying the imposition editor clears its preview and prevents remounting', async ({page}) => {
    const state = await page.evaluate(() => {
        const host = document.createElement('div');
        document.body.append(host);
        const editor = FlippyFlapper.createImpositionEditor(host, { sources: [] });
        editor.destroy();
        editor.updateSources([{ image: 'missing.webp', thumbnail: 'missing.webp' }]);
        editor.setConfiguration({ type: 'booklet' });
        const result = { children: host.childElementCount, valid: editor.valid };
        host.remove();
        return result;
    });
    expect(state).toEqual({ children: 0, valid: true });
});
