const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['flippy-flapper.js', 'flippy-flapper.esm.js']) {
    test(`${file}: settled artwork and fold-out panels reuse decoded originals`, async () => {
        const created = [], paints = [], window = {};
        const document = { createElement(tag) {
            const element = { tag, style: {}, children: [], attributes: {},
                append(child) { this.children.push(child); },
                setAttribute(name, value) { this.attributes[name] = value; },
                getContext() { return { drawImage(image) { paints.push(image); } }; },
            };
            created.push(element);
            return element;
        } };
        let source = fs.readFileSync(path.join(__dirname, '../lib', file), 'utf8');
        source = source.replace(/export \{[^\n]+\};/, 'window.FlippyFlapper = { MagazineViewer };');
        vm.runInNewContext(source, { window, document });
        const image = { width: 2048, height: 1024 };
        const calls = [];
        const viewer = Object.create(window.FlippyFlapper.MagazineViewer.prototype);
        viewer.manifest = { title: 'Private magazine' };
        viewer.cache = { original(url) { calls.push(url); return Promise.resolve(image); } };
        const page = { index: 2, image: '/private/preview', sheetWidth: 2, crop: 0 };
        const front = viewer.artwork(page);
        const flap = viewer.artwork(page, 1);
        await Promise.resolve();
        assert.equal(created.filter(element => element.tag === 'img').length, 0);
        assert.deepEqual(calls, ['/private/preview', '/private/preview']);
        assert.deepEqual(paints, [image, image]);
        assert.equal(front.children[0].style.width, '200%');
        assert.equal(flap.children[0].style.left, '-100%');
        const canvas = front.children[0].children[0];
        assert.equal(canvas.width, 2048);
        assert.equal(canvas.height, 1024);
        assert.equal(canvas.attributes['aria-label'], 'Private magazine, page 2');
        const blank = viewer.artwork({ blank: true });
        assert.equal(blank.attributes['aria-label'], 'Blank page');
        assert.equal(calls.length, 2);
        viewer.artwork(page, 0, true);
        assert.equal(created.filter(element => element.tag === 'img').length, 1);
        assert.equal(calls.length, 2);
        viewer.destroyed = true;
        viewer.artwork(page);
        await Promise.resolve();
        assert.equal(paints.length, 2);
        viewer.destroyed = false;
        viewer.cache.original = () => Promise.resolve(null);
        viewer.artwork(page);
        await Promise.resolve();
        assert.equal(paints.length, 2);
    });
}
