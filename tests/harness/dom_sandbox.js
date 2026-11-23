'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

function decodeHtmlEntities(str) {
  if (!str || !str.includes('&')) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kebabToCamel(s) {
  return s.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
}

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
}

function parseAttributes(attrStr) {
  const attrs = new Map();
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    if (!name || name === '/') continue;
    const rawVal = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs.set(name, decodeHtmlEntities(rawVal));
  }
  return attrs;
}

class SandboxNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    if (idx === -1) return null;
    for (let i = idx + 1; i < siblings.length; i++) {
      if (siblings[i].nodeType === 1) return siblings[i];
    }
    return null;
  }

  get previousElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    for (let i = idx - 1; i >= 0; i--) {
      if (siblings[i].nodeType === 1) return siblings[i];
    }
    return null;
  }

  get children() {
    return this.childNodes.filter((c) => c.nodeType === 1);
  }

  appendChild(child) {
    if (!child) return child;
    if (child.nodeType === 11) {
      for (const c of [...child.childNodes]) {
        this.appendChild(c);
      }
      return child;
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    this.ownerDocument._notifyMutation(this, [child]);
    return child;
  }

  insertBefore(newNode, refNode) {
    if (!refNode) return this.appendChild(newNode);
    const idx = this.childNodes.indexOf(refNode);
    if (idx === -1) return this.appendChild(newNode);
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    newNode.parentNode = this;
    this.childNodes.splice(idx, 0, newNode);
    this.ownerDocument._notifyMutation(this, [newNode]);
    return newNode;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...nodes) {
    for (const c of this.childNodes) {
      c.parentNode = null;
    }
    this.childNodes = [];
    for (const n of nodes) {
      if (n === null || n === undefined) continue;
      if (typeof n === 'string' || typeof n === 'number') {
        this.appendChild(new SandboxText(String(n), this.ownerDocument));
      } else {
        this.appendChild(n);
      }
    }
    if (nodes.length === 0) {
      this.ownerDocument._notifyMutation(this, []);
    }
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  contains(other) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
}

class SandboxText extends SandboxNode {
  constructor(text, ownerDocument) {
    super(3, ownerDocument);
    this.data = String(text);
  }

  get textContent() {
    return this.data;
  }

  set textContent(v) {
    this.data = v == null ? '' : String(v);
  }
}

class SandboxEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = init.cancelable !== false;
    this.detail = init.detail !== undefined ? init.detail : null;
    this.key = init.key || '';
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.target = null;
    this.currentTarget = null;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
}

class SandboxElement extends SandboxNode {
  constructor(tagName, ownerDocument) {
    super(1, ownerDocument);
    this.tagName = String(tagName).toUpperCase();
    this._attrs = new Map();
    this._listeners = new Map();
    this._styleMap = new Map();
    this._value = null;
    this._checked = null;
    this._disabled = null;
    this._selected = null;
    this.files = [];
    this.tabIndex = 0;

    this.style = new Proxy(this._styleMap, {
      get: (target, prop) => {
        if (prop === 'cssText') {
          return [...target.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
        }
        if (typeof prop === 'symbol') return undefined;
        const key = camelToKebab(String(prop));
        return target.get(key) || '';
      },
      set: (target, prop, val) => {
        if (prop === 'cssText') {
          target.clear();
          const parts = String(val || '').split(';');
          for (const p of parts) {
            const idx = p.indexOf(':');
            if (idx !== -1) {
              const k = p.slice(0, idx).trim().toLowerCase();
              const v = p.slice(idx + 1).trim();
              if (k) target.set(k, v);
            }
          }
          this._attrs.set('style', this.style.cssText);
          return true;
        }
        const key = camelToKebab(String(prop));
        if (val === '' || val === null || val === undefined) {
          target.delete(key);
        } else {
          target.set(key, String(val));
        }
        this._attrs.set('style', this.style.cssText);
        return true;
      },
    });

    this.dataset = new Proxy({}, {
      get: (_t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        return this._attrs.get('data-' + camelToKebab(String(prop)));
      },
      set: (_t, prop, val) => {
        this._attrs.set('data-' + camelToKebab(String(prop)), String(val));
        return true;
      },
      deleteProperty: (_t, prop) => {
        this._attrs.delete('data-' + camelToKebab(String(prop)));
        return true;
      },
      ownKeys: () => {
        const keys = [];
        for (const k of this._attrs.keys()) {
          if (k.startsWith('data-')) keys.push(kebabToCamel(k.slice(5)));
        }
        return keys;
      },
      getOwnPropertyDescriptor: (_t, prop) => {
        const val = this._attrs.get('data-' + camelToKebab(String(prop)));
        if (val === undefined) return undefined;
        return { enumerable: true, configurable: true, value: val };
      },
    });

    const self = this;
    this.classList = {
      _list() {
        const raw = self._attrs.get('class') || '';
        return raw.trim() ? raw.trim().split(/\s+/) : [];
      },
      _save(arr) {
        self._attrs.set('class', arr.join(' '));
      },
      add(...classes) {
        const arr = this._list();
        for (const c of classes) {
          if (c && !arr.includes(c)) arr.push(c);
        }
        this._save(arr);
      },
      remove(...classes) {
        const arr = this._list().filter((c) => !classes.includes(c));
        this._save(arr);
      },
      toggle(c, force) {
        const has = this.contains(c);
        if (force === true || (force === undefined && !has)) {
          this.add(c);
          return true;
        }
        this.remove(c);
        return false;
      },
      contains(c) {
        return this._list().includes(c);
      },
      replace(oldC, newC) {
        if (!this.contains(oldC)) return false;
        this.remove(oldC);
        this.add(newC);
        return true;
      },
    };
  }

  get id() {
    return this._attrs.get('id') || '';
  }
  set id(v) {
    this._attrs.set('id', String(v));
  }

  get className() {
    return this._attrs.get('class') || '';
  }
  set className(v) {
    this._attrs.set('class', String(v));
  }

  get type() {
    return this._attrs.get('type') || (this.tagName === 'INPUT' ? 'text' : '');
  }
  set type(v) {
    this._attrs.set('type', String(v));
  }

  get placeholder() {
    return this._attrs.get('placeholder') || '';
  }
  set placeholder(v) {
    this._attrs.set('placeholder', String(v));
  }

  get title() {
    return this._attrs.get('title') || '';
  }
  set title(v) {
    this._attrs.set('title', String(v));
  }

  get href() {
    return this._attrs.get('href') || '';
  }
  set href(v) {
    this.setAttribute('href', String(v));
  }

  get src() {
    return this._attrs.get('src') || '';
  }
  set src(v) {
    this.setAttribute('src', String(v));
  }

  get alt() {
    return this._attrs.get('alt') || '';
  }
  set alt(v) {
    this._attrs.set('alt', String(v));
  }

  get download() {
    return this._attrs.get('download') || '';
  }
  set download(v) {
    this._attrs.set('download', String(v));
  }

  get target() {
    return this._attrs.get('target') || '';
  }
  set target(v) {
    this._attrs.set('target', String(v));
  }

  get lang() {
    return this._attrs.get('lang') || '';
  }
  set lang(v) {
    this._attrs.set('lang', String(v));
  }

  get checked() {
    if (this._checked !== null) return this._checked;
    return this._attrs.has('checked');
  }
  set checked(v) {
    this._checked = Boolean(v);
    if (this._checked) this._attrs.set('checked', '');
    else this._attrs.delete('checked');
  }

  get disabled() {
    if (this._disabled !== null) return this._disabled;
    return this._attrs.has('disabled');
  }
  set disabled(v) {
    this._disabled = Boolean(v);
    if (this._disabled) this._attrs.set('disabled', '');
    else this._attrs.delete('disabled');
  }

  get selected() {
    if (this._selected !== null) return this._selected;
    return this._attrs.has('selected');
  }
  set selected(v) {
    this._selected = Boolean(v);
    if (this._selected) this._attrs.set('selected', '');
    else this._attrs.delete('selected');
  }

  get options() {
    const opts = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 1) {
          if (c.tagName === 'OPTION') opts.push(c);
          else walk(c);
        }
      }
    };
    walk(this);
    return opts;
  }

  get selectedOptions() {
    const opts = this.options;
    const selected = opts.filter((o) => o.selected);
    if (selected.length > 0) return selected;
    if (this.tagName === 'SELECT' && this._value === null && opts.length > 0) return [opts[0]];
    return [];
  }

  add(opt, before) {
    if (!opt) return;
    if (before && typeof before === 'object' && before.nodeType === 1) {
      this.insertBefore(opt, before);
    } else {
      this.appendChild(opt);
    }
  }

  get value() {
    if (this.tagName === 'SELECT') {
      if (this._value !== null) return this._value;
      const opts = this.options;
      const sel = opts.find((o) => o.selected) || opts[0];
      return sel ? sel.value : '';
    }
    if (this.tagName === 'OPTION') {
      if (this._attrs.has('value')) return this._attrs.get('value');
      return this.textContent;
    }
    if (this.tagName === 'TEXTAREA') {
      return this._value !== null ? this._value : this.textContent;
    }
    if (this._value !== null) return this._value;
    return this._attrs.get('value') || '';
  }

  set value(v) {
    const str = v == null ? '' : String(v);
    this._value = str;
    if (this.tagName === 'SELECT') {
      const opts = this.options;
      for (const o of opts) {
        o.selected = o.value === str;
      }
    } else if (this.tagName === 'OPTION') {
      this._attrs.set('value', str);
    }
  }

  get text() {
    return this.textContent;
  }
  set text(v) {
    this.textContent = v;
  }

  get rows() {
    const trs = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1) {
          if (c.tagName === 'TR') trs.push(c);
          else walk(c);
        }
      }
    };
    walk(this);
    return trs;
  }

  getAttribute(k) {
    const key = String(k).toLowerCase();
    return this._attrs.has(key) ? this._attrs.get(key) : null;
  }

  setAttribute(k, v) {
    const key = String(k).toLowerCase();
    const strVal = String(v);
    this._attrs.set(key, strVal);
    if (key === 'style') {
      this.style.cssText = strVal;
    } else if (key === 'checked') {
      this._checked = true;
    } else if (key === 'disabled') {
      this._disabled = true;
    } else if (key === 'selected') {
      this._selected = true;
    } else if (key === 'src' && (this.tagName === 'IMG' || this.tagName === 'SCRIPT' || this.tagName === 'IFRAME')) {
      this.ownerDocument._checkExternalAsset(this.tagName.toLowerCase() + '.src', strVal);
    } else if (key === 'href' && this.tagName === 'LINK') {
      this.ownerDocument._checkExternalAsset('link.href', strVal);
    }
  }

  removeAttribute(k) {
    const key = String(k).toLowerCase();
    this._attrs.delete(key);
    if (key === 'checked') this._checked = false;
    if (key === 'disabled') this._disabled = false;
    if (key === 'selected') this._selected = false;
  }

  hasAttribute(k) {
    return this._attrs.has(String(k).toLowerCase());
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this.childNodes = [];
    if (v !== null && v !== undefined && String(v) !== '') {
      const txt = new SandboxText(String(v), this.ownerDocument);
      txt.parentNode = this;
      this.childNodes.push(txt);
    }
  }

  get innerText() {
    return this.textContent;
  }
  set innerText(v) {
    this.textContent = v;
  }

  get innerHTML() {
    return this.childNodes.map((c) => serializeNode(c)).join('');
  }

  set innerHTML(html) {
    this.childNodes = [];
    const parsed = parseHtmlFragment(String(html || ''), this.ownerDocument);
    for (const c of parsed) {
      c.parentNode = this;
      this.childNodes.push(c);
    }
    if (this.tagName === 'SELECT') {
      this._value = null;
    }
    this.ownerDocument._notifyMutation(this, this.childNodes);
  }

  getContext(kind) {
    if (kind === '2d') {
      return {
        fillRect() {},
        clearRect() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        measureText: (t) => ({ width: String(t || '').length * 7 }),
      };
    }
    return null;
  }

  addEventListener(type, fn) {
    if (typeof fn !== 'function') return;
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  dispatchEvent(evt) {
    if (!evt.target) evt.target = this;
    let cur = this;
    while (cur) {
      evt.currentTarget = cur;
      const listeners = cur._listeners?.get(evt.type);
      if (listeners) {
        for (const fn of [...listeners]) {
          fn.call(cur, evt);
        }
      }
      // Also run inline onclick/onchange handlers if present
      if (evt.type === 'click') {
        if (typeof cur.onclick === 'function') {
          cur.onclick.call(cur, evt);
        } else if (cur.getAttribute && cur.getAttribute('onclick')) {
          this.ownerDocument._execInlineHandler(cur.getAttribute('onclick'), cur, evt);
        }
      } else if (evt.type === 'change') {
        if (typeof cur.onchange === 'function') {
          cur.onchange.call(cur, evt);
        } else if (cur.getAttribute && cur.getAttribute('onchange')) {
          this.ownerDocument._execInlineHandler(cur.getAttribute('onchange'), cur, evt);
        }
      }
      if (!evt.bubbles || evt.propagationStopped) break;
      cur = cur.parentNode;
    }
    return !evt.defaultPrevented;
  }

  click() {
    if (this.disabled) return;
    const evt = new SandboxEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(evt);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  reset() {
    const resetWalk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 1) {
          if (c.tagName === 'INPUT') {
            c._value = c._attrs.get('value') || '';
            c._checked = c._attrs.has('checked');
          } else if (c.tagName === 'TEXTAREA') {
            c._value = null;
          } else if (c.tagName === 'SELECT') {
            c._value = null;
          }
          resetWalk(c);
        }
      }
    };
    resetWalk(this);
  }

  matches(selector) {
    return matchesSelectorList(this, selector);
  }

  closest(selector) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchesSelectorList(cur, selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return querySelectorAllIn(this, selector, true)[0] || null;
  }

  querySelectorAll(selector) {
    return querySelectorAllIn(this, selector, false);
  }
}

function serializeNode(node) {
  if (node.nodeType === 3) return escapeHtml(node.data);
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  const attrParts = [];
  for (const [k, v] of node._attrs.entries()) {
    attrParts.push(`${k}="${escapeHtml(v)}"`);
  }
  const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';
  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrStr}>`;
  const inner = node.childNodes.map(serializeNode).join('');
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

function parseHtmlFragment(html, ownerDocument, opts = {}) {
  const checkExternal = opts.checkExternal !== false;
  const root = new SandboxElement('div', ownerDocument);
  const stack = [root];
  let i = 0;
  const n = html.length;

  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      const txt = decodeHtmlEntities(html.slice(i));
      if (txt) {
        const t = new SandboxText(txt, ownerDocument);
        t.parentNode = stack[stack.length - 1];
        stack[stack.length - 1].childNodes.push(t);
      }
      break;
    }

    if (lt > i) {
      const txt = decodeHtmlEntities(html.slice(i, lt));
      if (txt) {
        const t = new SandboxText(txt, ownerDocument);
        t.parentNode = stack[stack.length - 1];
        stack[stack.length - 1].childNodes.push(t);
      }
    }

    // Comment <!-- ... -->
    if (html.startsWith('<!--', lt)) {
      const endComment = html.indexOf('-->', lt + 4);
      i = endComment === -1 ? n : endComment + 3;
      continue;
    }

    // DOCTYPE or processing instruction
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const gt = html.indexOf('>', lt);
      i = gt === -1 ? n : gt + 1;
      continue;
    }

    // Closing tag </tag>
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt + 2);
      if (gt === -1) break;
      const closeTag = html.slice(lt + 2, gt).trim().toUpperCase();
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tagName === closeTag) {
          stack.length = s;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    // Opening tag <tag ...> (be careful with > inside quoted attributes)
    let gt = -1;
    let quote = null;
    for (let k = lt + 1; k < n; k++) {
      const ch = html[k];
      if (quote) {
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') {
          gt = k;
          break;
        }
      }
    }
    if (gt === -1) break;

    let tagContent = html.slice(lt + 1, gt).trim();
    const selfClosing = tagContent.endsWith('/');
    if (selfClosing) tagContent = tagContent.slice(0, -1).trim();

    const spaceIdx = tagContent.search(/\s/);
    const rawTag = (spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx)).toLowerCase();
    const attrStr = spaceIdx === -1 ? '' : tagContent.slice(spaceIdx + 1);

    if (!rawTag || !/^[a-zA-Z0-9:-]+$/.test(rawTag)) {
      i = gt + 1;
      continue;
    }

    const el = new SandboxElement(rawTag, ownerDocument);
    const attrs = parseAttributes(attrStr);
    for (const [k, v] of attrs.entries()) {
      el._attrs.set(k, v);
      if (k === 'style') {
        el.style.cssText = v;
      } else if (checkExternal) {
        if (k === 'src' && (el.tagName === 'IMG' || el.tagName === 'SCRIPT' || el.tagName === 'IFRAME')) {
          ownerDocument._checkExternalAsset(el.tagName.toLowerCase() + '.src', v);
        } else if (k === 'href' && el.tagName === 'LINK') {
          ownerDocument._checkExternalAsset('link.href', v);
        }
      }
    }

    const parent = stack[stack.length - 1];
    el.parentNode = parent;
    parent.childNodes.push(el);

    if (RAW_TEXT_ELEMENTS.has(rawTag) && !selfClosing) {
      const closeRe = new RegExp(`</${rawTag}\\s*>`, 'i');
      const rest = html.slice(gt + 1);
      const cm = closeRe.exec(rest);
      if (cm) {
        const innerRaw = rest.slice(0, cm.index);
        if (innerRaw) {
          const t = new SandboxText(rawTag === 'textarea' ? decodeHtmlEntities(innerRaw) : innerRaw, ownerDocument);
          t.parentNode = el;
          el.childNodes.push(t);
        }
        i = gt + 1 + cm.index + cm[0].length;
        continue;
      }
    }

    if (!selfClosing && !VOID_ELEMENTS.has(rawTag)) {
      stack.push(el);
    }
    i = gt + 1;
  }

  return root.childNodes;
}

/* ── CSS Selector Engine ────────────────────────────────── */
function splitSelectorGroups(sel) {
  const groups = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      if (depth > 0) depth--;
    } else if (ch === ',' && depth === 0) {
      const part = sel.slice(start, i).trim();
      if (part) groups.push(part);
      start = i + 1;
    }
  }
  const last = sel.slice(start).trim();
  if (last) groups.push(last);
  return groups;
}

function parseComplexSelector(sel) {
  // Returns array of { combinator: null | ' ' | '>', compound }
  const parts = [];
  let i = 0;
  const n = sel.length;
  let pendingComb = null;

  while (i < n) {
    while (i < n && /\s/.test(sel[i])) {
      if (parts.length > 0 && !pendingComb) pendingComb = ' ';
      i++;
    }
    if (i >= n) break;
    if (sel[i] === '>') {
      pendingComb = '>';
      i++;
      while (i < n && /\s/.test(sel[i])) i++;
    }
    const start = i;
    let depth = 0;
    let quote = null;
    while (i < n) {
      const ch = sel[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '[' || ch === '(') {
        depth++;
      } else if (ch === ']' || ch === ')') {
        if (depth > 0) depth--;
      } else if (depth === 0 && (/\s/.test(ch) || ch === '>')) {
        break;
      }
      i++;
    }
    const compound = sel.slice(start, i);
    if (compound) {
      parts.push({ combinator: parts.length === 0 ? null : (pendingComb || ' '), compound });
      pendingComb = null;
    }
  }
  return parts;
}

function matchesCompound(el, compound) {
  if (!el || el.nodeType !== 1) return false;
  let i = 0;
  const n = compound.length;

  while (i < n) {
    const ch = compound[i];
    if (ch === '*') {
      i++;
      continue;
    }
    if (ch === '#') {
      i++;
      const start = i;
      while (i < n && /[A-Za-z0-9_-]/.test(compound[i])) i++;
      const idVal = compound.slice(start, i);
      if (el.id !== idVal) return false;
      continue;
    }
    if (ch === '.') {
      i++;
      const start = i;
      while (i < n && /[A-Za-z0-9_-]/.test(compound[i])) i++;
      const cls = compound.slice(start, i);
      if (!el.classList.contains(cls)) return false;
      continue;
    }
    if (ch === '[') {
      const close = compound.indexOf(']', i + 1);
      if (close === -1) return false;
      const inside = compound.slice(i + 1, close).trim();
      i = close + 1;
      const attrM = inside.match(/^([A-Za-z0-9_:-]+)(?:\s*([*^$|~]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]+)))?$/);
      if (!attrM) return false;
      const attrName = attrM[1].toLowerCase();
      const op = attrM[2];
      const expected = attrM[3] !== undefined ? attrM[3] : (attrM[4] !== undefined ? attrM[4] : attrM[5]);
      if (!el.hasAttribute(attrName)) return false;
      if (op) {
        const actual = el.getAttribute(attrName);
        if (op === '=' && actual !== expected) return false;
        if (op === '*=' && !actual.includes(expected)) return false;
        if (op === '^=' && !actual.startsWith(expected)) return false;
        if (op === '$=' && !actual.endsWith(expected)) return false;
      }
      continue;
    }
    if (ch === ':') {
      i++;
      const start = i;
      while (i < n && /[A-Za-z0-9_-]/.test(compound[i])) i++;
      const pseudo = compound.slice(start, i).toLowerCase();
      if (compound[i] === '(') {
        let depth = 1;
        const pStart = i + 1;
        i++;
        while (i < n && depth > 0) {
          if (compound[i] === '(') depth++;
          else if (compound[i] === ')') depth--;
          i++;
        }
        const arg = compound.slice(pStart, i - 1);
        if (pseudo === 'not' && matchesSelectorList(el, arg)) return false;
      } else {
        if (pseudo === 'checked' && !el.checked) return false;
        if (pseudo === 'disabled' && !el.disabled) return false;
        if (pseudo === 'selected' && !el.selected) return false;
      }
      continue;
    }
    // Tag name
    const start = i;
    while (i < n && /[A-Za-z0-9_-]/.test(compound[i])) i++;
    const tag = compound.slice(start, i).toUpperCase();
    if (tag && el.tagName !== tag) return false;
  }
  return true;
}

function matchesComplex(el, parts) {
  if (!parts.length) return false;
  if (!matchesCompound(el, parts[parts.length - 1].compound)) return false;
  let cur = el;
  for (let idx = parts.length - 1; idx >= 1; idx--) {
    const comb = parts[idx].combinator;
    const prevCompound = parts[idx - 1].compound;
    if (comb === '>') {
      cur = cur.parentElement;
      if (!cur || !matchesCompound(cur, prevCompound)) return false;
    } else {
      let anc = cur.parentElement;
      let found = false;
      while (anc) {
        if (matchesCompound(anc, prevCompound)) {
          cur = anc;
          found = true;
          break;
        }
        anc = anc.parentElement;
      }
      if (!found) return false;
    }
  }
  return true;
}

function matchesSelectorList(el, selectorList) {
  const groups = splitSelectorGroups(selectorList);
  for (const g of groups) {
    const parts = parseComplexSelector(g);
    if (matchesComplex(el, parts)) return true;
  }
  return false;
}

function querySelectorAllIn(root, selectorList, firstOnly) {
  const groups = splitSelectorGroups(selectorList).map(parseComplexSelector);
  const results = [];
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      for (const parts of groups) {
        if (matchesComplex(c, parts)) {
          results.push(c);
          if (firstOnly) return true;
          break;
        }
      }
      if (walk(c) && firstOnly) return true;
    }
    return false;
  };
  walk(root);
  return results;
}

class StorageMock {
  constructor(map = new Map()) {
    this._map = map;
  }
  get length() {
    return this._map.size;
  }
  key(idx) {
    return [...this._map.keys()][idx] ?? null;
  }
  getItem(k) {
    const key = String(k);
    return this._map.has(key) ? this._map.get(key) : null;
  }
  setItem(k, v) {
    this._map.set(String(k), String(v));
  }
  removeItem(k) {
    this._map.delete(String(k));
  }
  clear() {
    this._map.clear();
  }
}

async function createDashboardSandbox(options = {}) {
  const dashboardUrl = options.dashboardUrl;
  const apiUrl = options.apiUrl;
  if (!dashboardUrl || !apiUrl) {
    throw new Error('createDashboardSandbox requires dashboardUrl and apiUrl');
  }

  const localStoreMap = options._localStoreMap || new Map();
  if (options.initialLocalStorage && !options._localStoreMap) {
    for (const [k, v] of Object.entries(options.initialLocalStorage)) {
      localStoreMap.set(k, String(v));
    }
  }
  const sessionStoreMap = new Map();
  if (options.initialSessionStorage) {
    for (const [k, v] of Object.entries(options.initialSessionStorage)) {
      sessionStoreMap.set(k, String(v));
    }
  }

  // Load index.html, i18n.js, script.js from dashboardUrl (or disk fallback if htmlPath provided)
  async function loadDashboardText(rel) {
    const res = await globalThis.fetch(`${dashboardUrl}/${rel}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${dashboardUrl}/${rel}: HTTP ${res.status}`);
    }
    return res.text();
  }

  const [indexHtml, i18nCode, scriptCode] = await Promise.all([
    options.htmlPath ? fs.promises.readFile(options.htmlPath, 'utf8') : loadDashboardText('index.html'),
    loadDashboardText('i18n.js'),
    loadDashboardText('script.js'),
  ]);

  const blockedNetworkCalls = [];
  const apiRequests = [];
  const dialogs = { alerts: [], confirms: [], prompts: [] };
  const openedPopups = [];
  const createdBlobs = new Map();
  const activeTimeouts = new Set();
  const activeIntervals = new Set();
  const mutationObservers = [];

  const dashParsed = new URL(dashboardUrl);
  const apiParsed = new URL(apiUrl);
  const remapPort3001 = options.remapPort3001 !== false;
  const allowedHosts = new Set(['127.0.0.1', 'localhost']);
  if (Array.isArray(options.allowFetchTo)) {
    for (const h of options.allowFetchTo) allowedHosts.add(h);
  }

  let mutationScheduled = false;

  const docObj = {
    nodeType: 9,
    readyState: 'loading',
    hidden: false,
    activeElement: null,
    _listeners: new Map(),
    _observers: mutationObservers,
    _notifyMutation(target, addedNodes) {
      if (mutationObservers.length === 0 || mutationScheduled) return;
      mutationScheduled = true;
      queueMicrotask(() => {
        mutationScheduled = false;
        for (const obs of mutationObservers) {
          if (obs._observing && obs._target && (obs._target === target || obs._target.contains(target))) {
            try {
              obs._callback([{ type: 'childList', target, addedNodes: addedNodes || [] }]);
            } catch {
              // ignore observer errors
            }
          }
        }
      });
    },
    _checkExternalAsset(type, rawUrl) {
      if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('#')) return;
      try {
        const u = new URL(String(rawUrl), dashboardUrl);
        if (!allowedHosts.has(u.hostname)) {
          blockedNetworkCalls.push({
            type,
            url: u.href,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // ignore invalid relative strings
      }
    },
    _execInlineHandler(code, el, evt) {
      try {
        vm.runInContext(`(function(event) { ${code} }).call(__inlineEl, __inlineEvt)`, Object.assign(ctx, {
          __inlineEl: el,
          __inlineEvt: evt,
        }));
      } finally {
        delete ctx.__inlineEl;
        delete ctx.__inlineEvt;
      }
    },
  };

  const documentElement = new SandboxElement('html', docObj);
  const head = new SandboxElement('head', docObj);
  const body = new SandboxElement('body', docObj);
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  // Parse indexHtml into documentElement (skip external asset checks for static head CDN tags)
  const parsedNodes = parseHtmlFragment(indexHtml, docObj, { checkExternal: false });
  const htmlNode = parsedNodes.find((n) => n.nodeType === 1 && n.tagName === 'HTML');
  if (htmlNode) {
    const parsedBody = htmlNode.childNodes.find((n) => n.nodeType === 1 && n.tagName === 'BODY');
    const parsedHead = htmlNode.childNodes.find((n) => n.nodeType === 1 && n.tagName === 'HEAD');
    if (parsedHead) head.childNodes = parsedHead.childNodes.map((c) => { c.parentNode = head; return c; });
    if (parsedBody) body.childNodes = parsedBody.childNodes.map((c) => { c.parentNode = body; return c; });
  } else {
    body.childNodes = parsedNodes.map((c) => { c.parentNode = body; return c; });
  }

  docObj.documentElement = documentElement;
  docObj.head = head;
  docObj.body = body;
  docObj.activeElement = body;

  docObj.createElement = (tag) => new SandboxElement(tag, docObj);
  docObj.createTextNode = (txt) => new SandboxText(txt, docObj);
  docObj.getElementById = (id) => {
    const targetId = String(id);
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1) {
          if (c.id === targetId) return c;
          const found = walk(c);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(documentElement);
  };
  docObj.querySelector = (sel) => querySelectorAllIn(documentElement, sel, true)[0] || null;
  docObj.querySelectorAll = (sel) => querySelectorAllIn(documentElement, sel, false);
  docObj.addEventListener = (type, fn) => {
    if (!docObj._listeners.has(type)) docObj._listeners.set(type, new Set());
    docObj._listeners.get(type).add(fn);
  };
  docObj.removeEventListener = (type, fn) => {
    docObj._listeners.get(type)?.delete(fn);
  };
  docObj.dispatchEvent = (evt) => {
    const listeners = docObj._listeners.get(evt.type);
    if (listeners) {
      for (const fn of [...listeners]) fn.call(docObj, evt);
    }
    return !evt.defaultPrevented;
  };

  const localStorage = new StorageMock(localStoreMap);
  const sessionStorage = new StorageMock(sessionStoreMap);

  let currentHref = options.originUrl || `${dashboardUrl}/`;
  const windowListeners = new Map();

  const locationObj = {
    get href() { return currentHref; },
    set href(v) { currentHref = new URL(String(v), dashboardUrl).href; },
    get origin() { return new URL(currentHref).origin; },
    get protocol() { return new URL(currentHref).protocol; },
    get host() { return new URL(currentHref).host; },
    get hostname() { return new URL(currentHref).hostname; },
    get port() { return new URL(currentHref).port; },
    get pathname() { return new URL(currentHref).pathname; },
    get search() { return new URL(currentHref).search; },
    get hash() { return new URL(currentHref).hash; },
    replace(u) { currentHref = new URL(String(u), dashboardUrl).href; },
    assign(u) { currentHref = new URL(String(u), dashboardUrl).href; },
  };

  const sandboxController = {
    window: null,
    document: docObj,
    localStorage,
    sessionStorage,
    blockedNetworkCalls,
    apiRequests,
    dialogs,
    openedPopups,
    createdBlobs,
    confirmHandler: () => true,
    promptHandler: (_msg, def) => (def !== undefined ? def : ''),
  };

  async function sandboxFetch(input, init) {
    const rawStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    const parsed = new URL(rawStr, dashboardUrl);

    if (!allowedHosts.has(parsed.hostname)) {
      blockedNetworkCalls.push({
        type: 'fetch',
        url: parsed.href,
        timestamp: new Date().toISOString(),
      });
      throw new TypeError(`Blocked external network call in sandbox: ${parsed.href}`);
    }

    let targetUrl = parsed.href;
    if (remapPort3001 && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '3001') {
      targetUrl = `${apiParsed.origin}${parsed.pathname}${parsed.search}`;
    }

    const res = await globalThis.fetch(targetUrl, init);
    apiRequests.push({
      method: (init && init.method) || 'GET',
      originalUrl: parsed.href,
      url: targetUrl,
      status: res.status,
    });
    return res;
  }

  class SandboxBlob {
    constructor(parts = [], blobOpts = {}) {
      this._parts = Array.isArray(parts) ? parts : [parts];
      this.type = blobOpts.type || '';
      this._text = this._parts.map((p) => (Buffer.isBuffer(p) ? p.toString('utf8') : String(p))).join('');
      this.size = Buffer.byteLength(this._text);
    }
    async text() {
      return this._text;
    }
    async arrayBuffer() {
      return Buffer.from(this._text).buffer;
    }
  }

  class SandboxURL extends URL {
    static createObjectURL(blob) {
      const objUrl = `blob:${dashParsed.origin}/${crypto.randomUUID()}`;
      createdBlobs.set(objUrl, {
        parts: blob._parts || [],
        type: blob.type || '',
        text: blob._text !== undefined ? blob._text : '',
      });
      return objUrl;
    }
    static revokeObjectURL(objUrl) {
      createdBlobs.delete(objUrl);
    }
  }

  class SandboxFileReader {
    readAsDataURL(blob) {
      setTimeout(() => {
        const text = blob._text !== undefined ? blob._text : '';
        const b64 = Buffer.from(text).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        if (typeof this.onload === 'function') {
          this.onload({ target: this });
        }
      }, 0);
    }
  }

  class SandboxMutationObserver {
    constructor(callback) {
      this._callback = callback;
      this._observing = false;
      this._target = null;
      mutationObservers.push(this);
    }
    observe(target) {
      this._target = target;
      this._observing = true;
    }
    disconnect() {
      this._observing = false;
    }
    takeRecords() {
      return [];
    }
  }

  class SandboxChart {
    constructor(ctx, config = {}) {
      this.ctx = ctx;
      this.config = config;
      this.type = config.type;
      this.data = config.data || { labels: [], datasets: [] };
      const opts = config.options || {};
      if (!opts.scales) {
        opts.scales = { x: { ticks: {}, grid: {} }, y: { ticks: {}, grid: {} } };
      } else {
        if (!opts.scales.x) opts.scales.x = { ticks: {}, grid: {} };
        if (!opts.scales.y) opts.scales.y = { ticks: {}, grid: {} };
        if (!opts.scales.x.ticks) opts.scales.x.ticks = {};
        if (!opts.scales.y.ticks) opts.scales.y.ticks = {};
        if (!opts.scales.y.grid) opts.scales.y.grid = {};
      }
      this.options = opts;
    }
    destroy() {}
    update() {}
  }
  SandboxChart.defaults = { font: {} };

  const ctxObj = {
    document: docObj,
    location: locationObj,
    history: {
      replaceState(_s, _t, u) {
        if (u) currentHref = new URL(String(u), dashboardUrl).href;
      },
      pushState(_s, _t, u) {
        if (u) currentHref = new URL(String(u), dashboardUrl).href;
      },
    },
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'EntelsoDomSandbox/1.0', language: 'en' },
    Option: function SandboxOption(text = '', value, defaultSelected = false, selected = false) {
      const opt = docObj.createElement('option');
      if (text !== undefined && text !== null && String(text) !== '') {
        opt.textContent = String(text);
      }
      if (value !== undefined) {
        opt.setAttribute('value', String(value));
      }
      if (defaultSelected) opt.setAttribute('selected', '');
      if (selected) opt.selected = true;
      return opt;
    },
    ...(options.apiBaseOverride !== undefined
      ? { ENTELSO_API_BASE: options.apiBaseOverride }
      : (options.injectApiBase !== false ? { ENTELSO_API_BASE: apiUrl } : {})),
    fetch: sandboxFetch,
    FormData: globalThis.FormData,
    Headers: globalThis.Headers,
    AbortController: globalThis.AbortController,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    URL: SandboxURL,
    URLSearchParams: globalThis.URLSearchParams,
    Blob: SandboxBlob,
    FileReader: SandboxFileReader,
    MutationObserver: SandboxMutationObserver,
    Event: SandboxEvent,
    CustomEvent: SandboxEvent,
    Chart: SandboxChart,
    flatpickr: (el, _cfg) => {
      const inst = { destroy() {}, setDate() {} };
      if (el) el._flatpickr = inst;
      return inst;
    },
    XLSX: {
      read: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
      utils: { sheet_to_json: () => [] },
    },
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: (fn, ms, ...args) => {
      const h = globalThis.setTimeout(() => {
        activeTimeouts.delete(h);
        fn(...args);
      }, ms);
      activeTimeouts.add(h);
      return h;
    },
    clearTimeout: (h) => {
      activeTimeouts.delete(h);
      globalThis.clearTimeout(h);
    },
    setInterval: (fn, ms, ...args) => {
      const h = globalThis.setInterval(fn, ms, ...args);
      activeIntervals.add(h);
      return h;
    },
    clearInterval: (h) => {
      activeIntervals.delete(h);
      globalThis.clearInterval(h);
    },
    requestAnimationFrame: (cb) => {
      const h = globalThis.setTimeout(() => {
        activeTimeouts.delete(h);
        cb(Date.now());
      }, 0);
      activeTimeouts.add(h);
      return h;
    },
    cancelAnimationFrame: (h) => {
      activeTimeouts.delete(h);
      globalThis.clearTimeout(h);
    },
    alert: (msg) => {
      dialogs.alerts.push(String(msg));
    },
    confirm: (msg) => {
      const res = Boolean(sandboxController.confirmHandler(String(msg)));
      dialogs.confirms.push({ message: String(msg), result: res });
      return res;
    },
    prompt: (msg, def) => {
      const res = sandboxController.promptHandler(String(msg), def);
      dialogs.prompts.push({ message: String(msg), defaultValue: def, result: res });
      return res;
    },
    open: (url, target, features) => {
      const strUrl = String(url || '');
      if (strUrl && !strUrl.startsWith('blob:') && !strUrl.startsWith('data:') && !strUrl.startsWith('about:')) {
        try {
          const u = new URL(strUrl, dashboardUrl);
          if (!allowedHosts.has(u.hostname)) {
            blockedNetworkCalls.push({
              type: 'window.open',
              url: u.href,
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          // ignore
        }
      }
      const blobEntry = createdBlobs.get(strUrl);
      const popupRecord = {
        url: strUrl,
        target: target || '_blank',
        features: features || '',
        blobContent: blobEntry ? blobEntry.text : null,
        writtenHtml: '',
      };
      openedPopups.push(popupRecord);
      return {
        closed: false,
        document: {
          write(html) { popupRecord.writtenHtml += String(html ?? ''); },
          writeln(html) { popupRecord.writtenHtml += String(html ?? '') + '\n'; },
          close() {},
        },
        print() {},
        close() {},
        focus() {},
      };
    },
    print() {},
    close() {},
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      windowListeners.get(type)?.delete(fn);
    },
    dispatchEvent: (evt) => {
      const ls = windowListeners.get(evt.type);
      if (ls) {
        for (const fn of [...ls]) fn.call(ctxObj, evt);
      }
      return !evt.defaultPrevented;
    },
    console: {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: (...args) => {
        if (options.logErrors) console.error('[dom_sandbox]', ...args);
      },
    },
  };

  ctxObj.window = ctxObj;
  ctxObj.self = ctxObj;
  ctxObj.globalThis = ctxObj;
  const ctx = vm.createContext(ctxObj);
  sandboxController.window = ctxObj;

  vm.runInContext(i18nCode, ctx, { filename: 'i18n.js' });
  vm.runInContext(scriptCode, ctx, { filename: 'script.js' });

  async function flushMicrotasks(ms = 30) {
    await new Promise((r) => globalThis.setTimeout(r, ms));
  }

  async function fireDOMContentLoaded() {
    docObj.readyState = 'complete';
    const evt = new SandboxEvent('DOMContentLoaded', { bubbles: true });
    ctxObj.dispatchEvent(evt);
    docObj.dispatchEvent(evt);
    await flushMicrotasks(40);
  }

  function close() {
    for (const h of activeTimeouts) globalThis.clearTimeout(h);
    for (const h of activeIntervals) globalThis.clearInterval(h);
    activeTimeouts.clear();
    activeIntervals.clear();
    for (const obs of mutationObservers) obs.disconnect();
  }

  async function reload(reloadOpts = {}) {
    close();
    const nextOpts = {
      ...options,
      ...reloadOpts,
      _localStoreMap: localStoreMap,
    };
    if (!Object.prototype.hasOwnProperty.call(reloadOpts, 'initialLocalStorage')) {
      delete nextOpts.initialLocalStorage;
    } else if (reloadOpts.initialLocalStorage) {
      for (const [k, v] of Object.entries(reloadOpts.initialLocalStorage)) {
        localStoreMap.set(k, String(v));
      }
    }
    return createDashboardSandbox(nextOpts);
  }

  sandboxController.fireDOMContentLoaded = fireDOMContentLoaded;
  sandboxController.flushMicrotasks = flushMicrotasks;
  sandboxController.reload = reload;
  sandboxController.close = close;

  return sandboxController;
}

module.exports = {
  createDashboardSandbox,
};
