const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** Load each distributable without requiring a DOM or a runtime dependency. */
function prototypeFor(file) {
    let source = fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');
    if (file.endsWith('.esm.js')) source = source.replace(
        'export {createMagazineViewer,createMagazineViewer as create,MagazineViewer,inferPageLayout,applyImposition,createImpositionEditor};',
        'window.FlippyFlapper = { MagazineViewer };'
    );
    const window = {};
    vm.runInNewContext(source, { window }, { filename: file });
    return window.FlippyFlapper.MagazineViewer.prototype;
}

/** Model an expanded spread with observable jump/turn events. */
function viewerFor(prototype, mode = 'spread') {
    const viewer = Object.create(prototype);
    viewer.loaded = true;
    viewer.destroyed = false;
    viewer.options = { animatePageTurns: false };
    viewer.openFoldouts = new Set();
    viewer.state = { pageIndex: 1, mode, zoom: 1, autoFlip: false };
    viewer.manifest = { pageCount: 4, sourcePageCount: 3,
        pages: [1, 2, 2, 3].map(sourceIndex => ({ sourceIndex })) };
    viewer.jumps = [];
    viewer.stopAutoFlip = () => { viewer.state.autoFlip = false; };
    viewer.goToPage = page => { viewer.state.pageIndex = page; viewer.jumps.push(page); viewer.stopAutoFlip(); };
    viewer.fit = () => { viewer.state.zoom = 1; };
    viewer.updateControls = () => {};
    viewer.closeFoldout = async () => { viewer.openFoldouts.clear(); };
    viewer.begin = () => { throw Error('Animation must not start.'); };
    return viewer;
}

for (const file of ['flippy-flapper.js', 'flippy-flapper.esm.js']) {
    const prototype = prototypeFor(file);

    test(`${file}: animation-free navigation follows visible groups and respects boundaries`, async () => {
        const viewer = viewerFor(prototype);
        await viewer.previous();
        assert.deepEqual(viewer.jumps, []);
        await viewer.next();
        assert.equal(viewer.state.pageIndex, 2);
        await viewer.next();
        assert.equal(viewer.state.pageIndex, 4);
        await viewer.next();
        assert.deepEqual(viewer.jumps, [2, 4]);
        await viewer.previous();
        assert.equal(viewer.state.pageIndex, 3);
        await viewer.previous();
        assert.equal(viewer.state.pageIndex, 1);
    });

    test(`${file}: single-page navigation closes foldouts and resets zoom`, async () => {
        const viewer = viewerFor(prototype, 'single');
        viewer.state.zoom = 2;
        viewer.openFoldouts.add(1);
        await viewer.next();
        assert.equal(viewer.state.pageIndex, 2);
        assert.equal(viewer.state.zoom, 1);
        assert.equal(viewer.openFoldouts.size, 0);
    });

    test(`${file}: unloaded and destroyed readers ignore navigation`, async () => {
        const viewer = viewerFor(prototype);
        viewer.loaded = false;
        await viewer.next();
        viewer.loaded = true;
        viewer.destroyed = true;
        await viewer.next();
        assert.deepEqual(viewer.jumps, []);
    });

    test(`${file}: state exposes counts and copied visible source mappings including blanks`, () => {
        const viewer = viewerFor(prototype);
        viewer.state.pageIndex = 2;
        const state = viewer.getState();
        assert.equal(state.pageCount, 4);
        assert.equal(state.sourcePageCount, 3);
        assert.deepEqual(JSON.parse(JSON.stringify(state.visiblePages)), [
            { pageIndex: 2, sourceIndex: 2 }, { pageIndex: 3, sourceIndex: 2 },
        ]);
        state.visiblePages[0].sourceIndex = 999;
        assert.equal(viewer.getState().visiblePages[0].sourceIndex, 2);
        viewer.manifest.pages[1].sourceIndex = null;
        assert.equal(viewer.getState().visiblePages[0].sourceIndex, null);
        viewer.manifest = null;
        assert.equal(viewer.getState().pageCount, 0);
        assert.equal(viewer.getState().sourcePageCount, 0);
        assert.equal(viewer.getState().visiblePages.length, 0);
    });

    test(`${file}: disabling animation cancels active turns and drag cannot start a turn`, () => {
        const viewer = viewerFor(prototype);
        let canceled = 0;
        viewer.cancelTurn = () => { canceled++; };
        viewer.setPageTurnAnimation(false);
        assert.equal(canceled, 1);
        assert.equal(prototype.begin.call(viewer, 1, true), null);
        viewer.setPageTurnAnimation(true);
        assert.equal(viewer.options.animatePageTurns, true);
        assert.equal(canceled, 1);
        assert.throws(() => viewer.setPageTurnAnimation('false'), /true or false/);
    });

    test(`${file}: automatic navigation keeps autoplay active without animating`, async () => {
        const viewer = viewerFor(prototype);
        viewer.state.autoFlip = true;
        await viewer.navigate(1, true);
        assert.equal(viewer.state.pageIndex, 2);
        assert.equal(viewer.state.autoFlip, true);
        await viewer.navigate(1, true);
        assert.equal(viewer.state.pageIndex, 4);
        assert.equal(viewer.state.autoFlip, false);
        await viewer.next();
        assert.equal(viewer.state.autoFlip, false);
    });

    test(`${file}: enabled animation preserves the normal turn path`, async () => {
        const viewer = viewerFor(prototype);
        viewer.options.animatePageTurns = true;
        let turns = 0;
        let settled = false;
        viewer.begin = () => { turns++; return {}; };
        viewer.settle = async commit => { settled = commit; };
        await viewer.next();
        assert.equal(turns, 1);
        assert.equal(settled, true);
        assert.deepEqual(viewer.jumps, []);
    });
}

for (const file of ['flippy-flapper.js', 'flippy-flapper.esm.js']) {
    test(`${file}: toolbar reflects reading mode, animation and fullscreen state`, () => {
        const prototype = prototypeFor(file);
        const nodes = new Map();
        const node = selector => {
            if (!nodes.has(selector)) nodes.set(selector, {
                attributes: {}, classList: { toggle() {} },
                setAttribute(name, value) { this.attributes[name] = value; },
            });
            return nodes.get(selector);
        };
        const viewer = Object.create(prototype);
        viewer.state = { mode: 'single', fullscreen: false };
        viewer.options = { animatePageTurns: true };
        viewer.root = { querySelectorAll: () => [], classList: { toggle() {} } };
        viewer.$ = node;
        viewer.updateControls();
        assert.equal(node('[data-action=readingMode]').attributes['aria-label'], 'Show two pages');
        assert.equal(node('[data-action=animation]').attributes['aria-pressed'], 'true');
        assert.equal(node('[data-action=animation]').attributes['aria-label'], 'Disable page-turn animation');
        let canceled = 0;
        viewer.cancelTurn = () => { canceled++; };
        viewer.setPageTurnAnimation(false);
        assert.equal(canceled, 1);
        assert.equal(node('[data-action=animation]').attributes['aria-label'], 'Enable page-turn animation');
        assert.equal(node('[data-action=animation]').attributes['aria-pressed'], 'false');
        viewer.state.mode = 'spread';
        viewer.state.fullscreen = true;
        viewer.updateControls();
        assert.equal(node('[data-action=readingMode]').attributes['aria-label'], 'Show single page');
        assert.equal(node('[data-action=readingMode]').attributes['aria-pressed'], 'true');
        assert.equal(node('.ff-hint').textContent, 'To exit fullscreen, click the [ ] box in the bottom right of this page.');
        viewer.state.fullscreen = false;
        viewer.updateControls();
        assert.equal(node('.ff-hint').textContent, 'DRAG A CORNER. TURN THE PAGE.');
    });
}

for (const file of ['flippy-flapper.js', 'flippy-flapper.esm.js']) {
    test(`${file}: unchanged resize notifications preserve active page turns while real changes still cancel`, () => {
        const prototype = prototypeFor(file);
        const viewer = Object.create(prototype);
        viewer.manifest = { pageWidth: 100, pageHeight: 150 };
        viewer.options = { spreadMode: 'always' };
        viewer.state = { mode: 'spread' };
        viewer.viewport = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
        viewer.viewportSize = { width: 800, height: 600 };
        viewer.pageWidth = 352;
        viewer.pageHeight = 528;
        viewer.turn = { active: true };
        viewer.cancelFoldoutTransition = () => { throw Error('Real resize started'); };
        viewer.resize();
        assert.equal(viewer.turn.active, true);
        viewer.options.spreadMode = 'never';
        assert.throws(() => viewer.resize(), /Real resize started/);
        viewer.options.spreadMode = 'always';
        viewer.viewport.getBoundingClientRect = () => ({ width: 900, height: 600 });
        assert.throws(() => viewer.resize(), /Real resize started/);
    });
}
