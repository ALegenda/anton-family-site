(() => {
  const edition = new URL(document.currentScript.src).search;
  function fragmentParams(url) {
    // Parse in memory only. The fragment contains the family key and must stay out of requests.
    return new URL(url.hash.replace(/^#/, '?'), url.origin).searchParams;
  }
  const route = new URL(location.href);
  const folder = new URL('./', route);
  const params = fragmentParams(route);
  const key = params.get('key');
  const page = route.pathname.split('/').pop() || 'index.html';
  const section = params.get('section');
  const query = params.get('q') || route.searchParams.toString();
  const status = document.querySelector('#status');

  async function openSite() {
    let plain;
    try {
      if (!/^[\w-]{43}$/.test(key)) throw Error();
      const bytes = typeof Uint8Array.fromBase64 === 'function'
        ? Uint8Array.fromBase64(key, {alphabet:'base64url'})
        : Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/') + '='), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
      const bundle = new URL('family.bin',folder);
      bundle.search = edition;
      const response = await fetch(bundle, {cache: 'no-cache'});
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
    const scripts = [];
    for (const el of content.querySelectorAll('script[src],link[rel="stylesheet"][href]')) {
      const isScript = el.tagName === 'SCRIPT';
      const name = el.getAttribute(isScript ? 'src' : 'href').replace(/^\.\//,'');
      if (!Object.hasOwn(files,name)) throw Error('Файл страницы отсутствует.');
      if (isScript) {
        scripts.push(files[name]);
        el.remove();
      } else {
        const style = content.createElement('style');
        style.textContent = files[name];
        el.replaceWith(style);
      }
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
      if (fragmentParams(url).has('key')) return;
      if (!Object.hasOwn(files,url.pathname.split('/').pop() || 'index.html')) return;
      const fragment = new URLSearchParams({key});
      const search = raw.startsWith('#') ? query : url.searchParams.toString();
      if (search) fragment.set('q',search);
      if (url.hash) fragment.set('section',url.hash.replace(/^#/, ''));
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
    // Mount the page without resetting Safari's document or its navigation history.
    document.documentElement.lang = content.documentElement.lang;
    document.head.replaceChildren(...content.head.childNodes);
    document.body.replaceChildren(...content.body.childNodes);
    for (const source of scripts) {
      const script = document.createElement('script');
      script.textContent = source;
      document.body.append(script);
    }
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
      const next = fragmentParams(location);
      if (next.get('key') !== key || (next.get('q') || '') !== query) location.reload();
      else scrollToSection(next.get('section'));
    });
  }
  if (key) {
    status.textContent = 'Открываем семейный атлас…';
    openSite().catch(() => {status.textContent='Не удалось загрузить страницу. Откройте семейную ссылку ещё раз.';});
  }
})();
