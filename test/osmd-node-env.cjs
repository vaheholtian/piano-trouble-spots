'use strict';
/* Minimal jsdom global shim so opensheetmusicdisplay@2.1.2's `load()` (parsing only, never
   `render()`) runs under node:test. Node 24's `navigator` is a getter-only accessor
   (`Object.getOwnPropertyDescriptor(globalThis, 'navigator')` -> `{ get, set: undefined,
   configurable: true }`), so a plain assignment silently no-ops (sloppy mode) or throws
   (strict mode) instead of replacing it. Every global here is installed with
   Object.defineProperty and restored to its exact previous descriptor (or deleted, if it had
   none) by `restore()`. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const OSMD = require('opensheetmusicdisplay/build/opensheetmusicdisplay.min.js');

const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Image',
  'DOMParser',
  'XMLSerializer',
  'Node',
  'Element',
  'Blob',
  'File',
  'FileReader',
  'getComputedStyle',
  'SVGElement',
  'SVGGElement',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];

function installOsmdNodeEnv() {
  const dom = new JSDOM('<div id="c"></div>', { pretendToBeVisual: true });
  const win = dom.window;

  const values = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    HTMLElement: win.HTMLElement,
    Image: win.Image,
    DOMParser: win.DOMParser,
    XMLSerializer: win.XMLSerializer,
    Node: win.Node,
    Element: win.Element,
    Blob: win.Blob,
    File: win.File,
    FileReader: win.FileReader,
    getComputedStyle: win.getComputedStyle,
    SVGElement: win.SVGElement || function () {},
    SVGGElement: win.SVGGElement || function () {},
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: clearTimeout,
  };

  const saved = new Map();
  for (const key of GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: values[key],
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }

  function restore() {
    for (const key of GLOBAL_KEYS) {
      const descriptor = saved.get(key);
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  }

  return { dom, restore };
}

// Parsing-only harness: load, never draw. `render()` throws under jsdom
// (`HTMLCanvasElement's getContext()`); visual correctness is checked at the piano.
async function loadSheet(content) {
  const osmd = new OSMD.OpenSheetMusicDisplay(document.getElementById('c'), { autoResize: false });
  await osmd.load(content);
  return osmd.Sheet;
}

function readFixture(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

module.exports = { installOsmdNodeEnv, loadSheet, readFixture };
