"use strict";

const assert = require("node:assert/strict");

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.key = init.key || "";
    this.defaultPrevented = false;
    this.cancelBubble = false;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.cancelBubble = true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.textContent = "";
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get nextSibling() {
    const siblings = this.parentNode?.children || [];
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] || null : null;
  }

  get classList() {
    const owner = this;
    return {
      add(...names) {
        const values = new Set(owner.className.split(/s+/).filter(Boolean));
        names.forEach(name => values.add(name));
        owner.className = [...values].join(" ");
      },
      contains(name) {
        return owner.className.split(/s+/).includes(name);
      }
    };
  }

  set id(value) {
    this._id = String(value);
    this.attributes.set("id", this._id);
  }

  get id() {
    return this._id || "";
  }

  set htmlFor(value) {
    this._htmlFor = String(value);
    this.attributes.set("for", this._htmlFor);
  }

  get htmlFor() {
    return this._htmlFor || "";
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      if (node.parentNode) {
        const siblings = node.parentNode.children;
        const oldIndex = siblings.indexOf(node);
        if (oldIndex >= 0) siblings.splice(oldIndex, 1);
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }

  before(node) {
    const siblings = this.parentNode?.children;
    if (!siblings) return;
    const index = siblings.indexOf(this);
    node.parentNode = this.parentNode;
    siblings.splice(index, 0, node);
  }

  replaceChildren(...nodes) {
    this.children.forEach(child => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...nodes);
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some(child => child.contains(node));
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === "id") this._id = stringValue;
    if (name === "for") this._htmlFor = stringValue;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    if (event.bubbles && !event.cancelBubble && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  focus() {
    if (this.disabled) return;
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new FakeEvent("focus"));
  }
}

class FakeOption extends FakeElement {
  constructor(ownerDocument, value, textContent, settings = {}) {
    super("option", ownerDocument);
    this.value = value;
    this.textContent = textContent;
    this.disabled = Boolean(settings.disabled);
    this.selected = Boolean(settings.selected);
  }
}

class FakeSelect extends FakeElement {
  constructor(ownerDocument) {
    super("select", ownerDocument);
    this._value = "";
    this.hidden = false;
  }

  get options() {
    return this.children;
  }

  get selectedOptions() {
    return this.options.filter(option => option.selected);
  }

  get value() {
    return this.options.find(option => option.selected)?.value || this._value;
  }

  set value(value) {
    this._value = String(value);
    let matched = false;
    this.options.forEach(option => {
      option.selected = !matched && option.value === this._value;
      if (option.selected) matched = true;
    });
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super("#document", null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.body = new FakeElement("body", this);
    this.append(this.body);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    if (String(tagName).toLowerCase() === "select") return new FakeSelect(this);
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    if (!selector.startsWith("label[for=\"") || !selector.endsWith("\"]")) return null;
    const expectedFor = selector.slice(11, -2);
    let found = null;
    const visit = node => {
      if (found) return;
      if (node.tagName === "LABEL" && node.htmlFor === expectedFor) found = node;
      node.children.forEach(visit);
    };
    visit(this.body);
    return found;
  }
}

class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe() {}

  notify() {
    this.callback([]);
  }
}

function key(target, name) {
  const event = new FakeEvent("keydown", { key: name, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

function click(target) {
  target.dispatchEvent(new FakeEvent("click", { bubbles: true }));
}

function buildSelect(document) {
  const host = document.createElement("div");
  const label = document.createElement("label");
  label.id = "topic-label";
  label.htmlFor = "topic-select";
  label.textContent = "主題";
  const select = document.createElement("select");
  select.id = "topic-select";
  select.append(
    new FakeOption(document, "", "請選擇主題", { disabled: true, selected: true }),
    new FakeOption(document, "a", "第一個"),
    new FakeOption(document, "b", "停用項目", { disabled: true }),
    new FakeOption(document, "c", "第三個")
  );
  host.append(label, select);
  document.body.append(host);
  return { host, label, select };
}

function testKeyboardAndAccessibilityContract() {
  const document = new FakeDocument();
  global.document = document;
  global.Event = FakeEvent;
  global.MutationObserver = FakeMutationObserver;
  delete require.cache[require.resolve("../ui-select.js")];
  const AnalyzerSelect = require("../ui-select.js");
  const { select } = buildSelect(document);
  let changeCount = 0;
  select.addEventListener("change", () => { changeCount += 1; });

  const controller = AnalyzerSelect.enhance(select, {
    matchNativeState: true,
    attachDocumentListeners: true
  });
  const root = select.parentNode;
  const trigger = root.children[1];
  const menu = root.children[2];

  assert.equal(select.tabIndex, -1);
  assert.equal(select.getAttribute("aria-hidden"), "true");
  assert.equal(trigger.getAttribute("aria-labelledby"), "topic-label topic-select-value");
  assert.equal(menu.getAttribute("aria-labelledby"), trigger.id);
  assert.equal(menu.role, "listbox");
  assert.equal(menu.children[0].getAttribute("aria-disabled"), "true");
  assert.equal(menu.children[0].tabIndex, -1);
  assert.equal(menu.children[1].tabIndex, 0);

  trigger.focus();
  key(trigger, "ArrowDown");
  assert.equal(menu.hidden, false);
  assert.equal(document.activeElement.dataset.value, "a");
  assert.equal(document.activeElement.tabIndex, 0);
  key(document.activeElement, "ArrowDown");
  assert.equal(document.activeElement.dataset.value, "c", "ArrowDown skips disabled options");
  key(document.activeElement, "ArrowUp");
  assert.equal(document.activeElement.dataset.value, "a");
  key(document.activeElement, "End");
  assert.equal(document.activeElement.dataset.value, "c");
  key(document.activeElement, "Home");
  assert.equal(document.activeElement.dataset.value, "a");
  key(document.activeElement, "ArrowDown");
  key(document.activeElement, " ");
  assert.equal(select.value, "c");
  assert.equal(changeCount, 1);
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, trigger, "selection restores trigger focus");

  click(trigger);
  key(trigger, "ArrowDown");
  key(document.activeElement, "Escape");
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, trigger, "Escape restores trigger focus");

  click(trigger);
  key(trigger, "ArrowDown");
  const focusedOption = document.activeElement;
  key(focusedOption, "Tab");
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, focusedOption, "Tab close does not trap focus on trigger");

  click(trigger);
  const disabledItem = menu.children[2];
  const valueBeforeDisabledClick = select.value;
  click(disabledItem);
  assert.equal(select.value, valueBeforeDisabledClick);
  assert.equal(changeCount, 1);

  // A structural sync while an option is focused keeps the same logical focus.
  key(trigger, "Home");
  const focusedBeforeSync = document.activeElement;
  select.options[1].textContent = "第一個更新";
  FakeMutationObserver.instances[0].notify();
  assert.notEqual(menu.children[1], focusedBeforeSync, "changed options are rebuilt");
  assert.equal(document.activeElement.dataset.value, "a");
  assert.equal(document.activeElement.tabIndex, 0);

  document.body.focus();
  click(trigger);
  controller.close();
  assert.equal(document.activeElement, document.body, "external close does not steal outside focus");

  controller.close();
  delete global.document;
  delete global.Event;
  delete global.MutationObserver;
}

testKeyboardAndAccessibilityContract();
console.log("ui select keyboard tests passed");
