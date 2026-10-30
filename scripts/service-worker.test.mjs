import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function harness({ offline = false, initial = [] } = {}) {
  const handlers = {};
  const names = new Set(initial);
  const deleted = [];
  let claimed = false;
  const own = { match: async (request) => request === './index.html' ? { id: 'own-offline-document' } : undefined, put: async () => {}, addAll: async () => {} };
  const caches = {
    keys: async () => [...names],
    delete: async (key) => { deleted.push(key); return names.delete(key); },
    open: async (key) => { assert.equal(key, 'plecak-v2'); names.add(key); return own; },
    match: async () => { throw Error('Nie wolno odczytywać cudzych cache!'); },
  };
  const self = {
    location: new URL('https://rejson59.github.io/ProStudent/sw.js'),
    registration: { scope: 'https://rejson59.github.io/ProStudent/', update() {} },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { claim: async () => { claimed = true; } }, skipWaiting: async () => {},
  };
  const fetch = async () => { if (offline) throw Error('offline'); return { ok: true, clone() { return this; } }; };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, URL, URLSearchParams, Response, Request, fetch, Promise, console });
  function event(request) {
    let response;
    handlers.fetch({ request, respondWith(promise) { response = promise; } });
    return response;
  }
  return { handlers, names, deleted, event, get claimed() { return claimed; } };
}

test('aktywacja usuwa tylko stare cache Plecaka, nie inne projekty', async () => {
  const h = harness({ initial: ['plecak-v1', 'plecak-v2', 'rejson-pages-v1', 'rejfile-v5', 'other'] });
  let pending;
  h.handlers.activate({ waitUntil(p) { pending = p; } });
  await pending;
  assert.deepEqual(h.deleted, ['plecak-v1']);
  assert.equal(h.claimed, true);
  assert.ok(h.names.has('rejson-pages-v1') && h.names.has('rejfile-v5'));
});
test('POST przechwytuje tylko dokładny cel share_target', async () => {
  const h = harness();
  const share = { method: 'POST', url: 'https://rejson59.github.io/ProStudent/index.html?akcja=import', formData: async () => new Map([['text', 'Praca domowa']]) };
  const result = await h.event(share);
  assert.equal(result.status, 303);
  assert.equal(new URL(result.headers.get('location')).searchParams.get('text'), 'Praca domowa');
  for (const url of [
    'https://rejson59.github.io/other/api', 'https://rejson59.github.io/ProStudent/api',
    'https://rejson59.github.io/ProStudent/index.html?akcja=inny', 'https://example.com/ProStudent/index.html?akcja=import'
  ]) assert.equal(h.event({ method: 'POST', url }), undefined);
});
test('inne projekty i obce domeny nie są przechwytywane przez cache', () => {
  const h = harness();
  for (const url of ['https://rejson59.github.io/css/portal.css', 'https://rejson59.github.io/RejStream/index.html', 'https://example.com/ProStudent/icon.svg']) {
    assert.equal(h.event({ method: 'GET', url, mode: 'navigate' }), undefined);
  }
});
test('offline strona Plecaka używa tylko własnego cache', async () => {
  const h = harness({ offline: true });
  const response = await h.event({ method: 'GET', url: 'https://rejson59.github.io/ProStudent/', mode: 'navigate' });
  assert.equal(response.id, 'own-offline-document');
});
