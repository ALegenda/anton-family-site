const route = new URL(location.href);
const folder = new URL('./', route);
const params = new URLSearchParams(route.hash.slice(1));
const key = params.get('key');
const page = route.pathname.split('/').pop() || 'index.html';
const section = params.get('section');
const query = params.get('q') || route.search.slice(1);
const status = document.querySelector('#status');

async function openSite() {
  let plain;
  try {
    if (!/^[\w-]{43}$/.test(key)) throw Error();
    const bytes = Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/') + '='), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    const response = await fetch(new URL('family.bin',folder), {cache: 'no-cache'});
    if (!response.ok) throw Error();
    const blob = new Uint8Array(await response.arrayBuffer());
    plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:blob.slice(0,12)},cryptoKey,blob.slice(12));
  } catch {
    status.textContent = 'Не удалось открыть атлас. Проверьте соединение и откройте полную ссылку, присланную родственниками.';
    return;
  }
  const files = JSON.parse(new TextDecoder().decode(plain));
  if (!Object.hasOwn(files,page)) throw Error('Страница отсутствует.');
  const content = new DOMParser().parseFromString(files[page], 'text/html');
  for (const el of content.querySelectorAll('script[src],link[rel="stylesheet"][href]')) {
    const isScript = el.tagName === 'SCRIPT';
    const attr = isScript ? 'src' : 'href';
    const name = el.getAttribute(attr).replace(/^\.\//,'');
    if (!Object.hasOwn(files,name)) throw Error('Файл страницы отсутствует.');
    el.setAttribute(attr,URL.createObjectURL(new Blob([files[name]],{type:isScript?'text/javascript':'text/css'})));
  }
  const referrer = content.createElement('meta');
  referrer.name = 'referrer';
  referrer.content = 'no-referrer';
  content.head.prepend(referrer);
  // Keep the key and person names in the fragment, including links copied from a card.
  function protectLink(anchor) {
    const raw = anchor.getAttribute('href');
    if (!raw) return;
    const url = new URL(raw,route);
    if (url.origin !== folder.origin || new URL('./',url).pathname !== folder.pathname) return;
    if (new URLSearchParams(url.hash.slice(1)).has('key')) return;
    if (!Object.hasOwn(files,url.pathname.split('/').pop() || 'index.html')) return;
    const fragment = new URLSearchParams({key});
    const search = raw.startsWith('#') ? query : url.search.slice(1);
    if (search) fragment.set('q',search);
    if (url.hash) fragment.set('section',decodeURIComponent(url.hash.slice(1)));
    url.search = '';
    url.hash = fragment.toString();
    anchor.href = url.href;
  }
  function protectLinks(parent) {
    if (parent.matches?.('a[href]')) protectLink(parent);
    parent.querySelectorAll?.('a[href]').forEach(protectLink);
  }
  protectLinks(content);
  window.familyPageSearch = query;
  document.open();
  document.write('<!doctype html>' + content.documentElement.outerHTML);
  document.close();
  new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'attributes') {
        if (change.target.matches('a[href]')) protectLink(change.target);
      } else {
        for (const node of change.addedNodes) protectLinks(node);
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  protectLinks(document);
  function scrollToSection(id) {
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    else window.scrollTo(0,0);
  }
  if (section) scrollToSection(section);
  window.addEventListener('hashchange', () => {
    const next = new URLSearchParams(location.hash.slice(1));
    if (next.get('key') !== key || (next.get('q') || '') !== query) location.reload();
    else scrollToSection(next.get('section'));
  });
}
if (key) {
  status.textContent = 'Открываем семейный атлас…';
  openSite().catch(() => {status.textContent='Не удалось загрузить страницу. Откройте семейную ссылку ещё раз.';});
}
