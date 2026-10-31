import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function scriptFrom(path) {
  const html = readFileSync(path, 'utf8');
  const match = html.match(/rj-portal-bootstrap:start[\s\S]*?<script>([\s\S]*?)<\/script>[\s\S]*?rj-portal-bootstrap:end/);
  assert.ok(match, `Brak wczesnego skryptu w ${path}`);
  assert.ok(html.indexOf('rj-portal-bootstrap:start') < html.indexOf('id="root"'));
  return match[1];
}
function execute(script, { origin = 'https://rejson59.github.io', marker = '{"path":"/project/","at":1}', existing = false, iframe = false, throws = false } = {}) {
  let html = '';
  const self = {};
  const window = { self, top: iframe ? {} : self };
  const sessionStorage = { getItem(k) { assert.equal(k, 'rj_portal_arrival_v1'); if (throws) throw Error('storage unavailable'); return marker; } };
  const document = { querySelector() { return existing ? {} : null; }, write(s) { html += s; } };
  runInNewContext(script, { location: { origin }, window, sessionStorage, document });
  return html;
}
for (const path of ['index.html', ...(existsSync('dist/index.html') ? ['dist/index.html'] : [])]) {
  test(`${path}: tylko prawdziwy powrót na wspólnej domenie ładuje CSS i JS`, () => {
    const script = scriptFrom(path);
    const html = execute(script);
    assert.match(html, /href="\/css\/portal\.css\?v=12"[^>]*data-rj-portal-style/);
    assert.match(html, /<script src="\/js\/portal-arrival\.js\?v=11"><\/script>/);
    assert.ok(html.indexOf('<link') < html.indexOf('<script'));
    for (const opts of [{ marker: null }, { origin: 'https://example.com' }, { existing: true }, { iframe: true }, { throws: true }]) {
      assert.equal(execute(script, opts), '');
    }
  });
}
