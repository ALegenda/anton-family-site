import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const input = join(root, 'family-content');
const output = join(root, 'docs');
const linkFile = join(root, 'family-link.txt');
const bundle = join(output, 'family.bin');
const slug = basename(root.replace(/\/$/, ''));
const publicUrl = 'https://alegenda.github.io/' + slug + '/';
const unpack = process.argv.includes('--unpack');

if (!existsSync(linkFile)) {
  if (unpack || existsSync(bundle)) throw Error('Сохраните действующую семейную ссылку в family-link.txt.');
  writeFileSync(linkFile, publicUrl + '#key=' + randomBytes(32).toString('base64url') + '\n', {mode: 0o600, flag: 'wx'});
}
const keyText = new URLSearchParams(new URL(readFileSync(linkFile, 'utf8').trim()).hash.slice(1)).get('key');
if (!/^[A-Za-z0-9_-]{43}$/.test(keyText || '')) throw Error('В семейной ссылке отсутствует ключ.');
const key = Buffer.from(keyText, 'base64url');
function decrypt(blob) {
  const decoder = createDecipheriv('aes-256-gcm', key, blob.subarray(0,12));
  decoder.setAuthTag(blob.subarray(-16));
  return Buffer.concat([decoder.update(blob.subarray(12,-16)), decoder.final()]);
}
if (unpack) {
  if (existsSync(input) && readdirSync(input).length) throw Error('Для распаковки нужна пустая папка family-content.');
  const files = JSON.parse(decrypt(readFileSync(bundle)));
  mkdirSync(input, {recursive:true});
  for (const [name, content] of Object.entries(files)) {
    if (!/^[\w-]+\.(?:html|css|js)$/.test(name)) throw Error('Неизвестный тип файла в архиве.');
    writeFileSync(join(input, name), content, {flag:'wx',mode:0o600});
  }
} else {
  // A changed or damaged key must never silently replace an existing family edition.
  if (existsSync(bundle)) decrypt(readFileSync(bundle));
  const files = {};
  for (const name of readdirSync(input)) {
    if (name === '.DS_Store') continue;
    if (!/^[\w-]+\.(?:html|css|js)$/.test(name)) throw Error('Проверьте неожиданный файл: ' + name);
    files[name] = readFileSync(join(input,name),'utf8');
  }
  if (!files['index.html'] || !files['contribute.html']) throw Error('Нет обязательной страницы.');
  mkdirSync(output,{recursive:true});
  const pages = Object.keys(files).filter(name => name.endsWith('.html'));
  const publicFiles = new Set(['.nojekyll','family.bin','unlock.js',...pages]);
  for (const name of readdirSync(output)) {
    if (!publicFiles.has(name)) throw Error('Проверьте лишний файл в каталоге публикации: ' + name);
  }
  const iv = randomBytes(12);
  const encoder = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([iv, encoder.update(JSON.stringify(files),'utf8'), encoder.final(), encoder.getAuthTag()]);
  const tempFile = bundle + '.' + randomBytes(5).toString('hex') + '.tmp';
  writeFileSync(tempFile, data, {flag:'wx'});
  renameSync(tempFile, bundle);
  const gate = readFileSync(join(root, 'gate.html'));
  for (const name of pages) {
    writeFileSync(join(output,name),gate);
  }
  console.log(Object.keys(files).length + ' файлов в зашифрованном сайте.');
}
