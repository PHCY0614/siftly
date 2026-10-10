(function attachAnalyzerSelect(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AnalyzerSelect = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalyzerSelect() {
  "use strict";

  /**
   * Wraps a native <select> in a BEM custom-select (trigger + listbox).
   * extraRootClass is a modifier (popup amber vs options regular). emptyLabel
   * shows when nothing is selected.
   * sync() rebuilds the displayed value, trigger disabled state, options,
   * selected checks, and optional native hidden/disabled mirroring.
   * close() hides the menu and resets aria-expanded.
   * Option click order is: set native select value → dispatch bubbling change →
   * sync → close → restore trigger focus.
   * Popup and options wrappers intentionally choose different document-listener
   * and native-state behavior: popup sets attachDocumentListeners and leaves
   * matchNativeState false; options sets matchNativeState and uses page-level
   * document handlers plus onToggle, so attachDocumentListeners is false.
   * Returns { sync, close }. Does not send Chrome messages.
   */
  function enhance(select, options = {}) {
    const extraRootClass = options.extraRootClass || "";
    const emptyLabel = options.emptyLabel || "請選擇";
    const matchNativeState = options.matchNativeState === true;
    const attachDocumentListeners = options.attachDocumentListeners === true;
    const onToggle = options.onToggle;

    const root = document.createElement("div");
    root.className = extraRootClass ? `custom-select ${extraRootClass}` : "custom-select";
    select.before(root);
    root.append(select);
    select.classList.add("custom-select__native");
    // The native control remains the source of truth, but must not create a
    // second tab stop or a duplicate control in the accessibility tree.
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const trigger = document.createElement("button");
    trigger.id = `${select.id}-trigger`;
    trigger.className = "custom-select__trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const value = document.createElement("span");
    value.id = `${select.id}-value`;
    value.className = "custom-select__value";
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("class", "custom-select__arrow");
    arrow.setAttribute("width", "11");
    arrow.setAttribute("height", "11");
    arrow.setAttribute("viewBox", "0 0 12 12");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "currentColor");
    arrow.setAttribute("stroke-width", "2.2");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    arrow.setAttribute("aria-hidden", "true");
    const arrowLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    arrowLine.setAttribute("points", "2,4 6,8 10,4");
    arrow.append(arrowLine);
    trigger.append(value, arrow);

    const menu = document.createElement("div");
    menu.id = `${select.id}-menu`;
    menu.className = "custom-select__menu";
    menu.role = "listbox";
    menu.setAttribute("aria-labelledby", trigger.id);
    menu.setAttribute("aria-orientation", "vertical");
    menu.hidden = true;
    trigger.setAttribute("aria-controls", menu.id);
    root.append(trigger, menu);

    const originalLabel = document.querySelector(`label[for="${select.id}"]`);
    if (originalLabel) {
      if (!originalLabel.id) originalLabel.id = `${select.id}-label`;
      originalLabel.htmlFor = trigger.id;
      trigger.setAttribute("aria-labelledby", `${originalLabel.id} ${value.id}`);
    } else {
      const labelledBy = select.getAttribute("aria-labelledby");
      const ariaLabel = select.getAttribute("aria-label");
      if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
      else if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
    }

    let renderedSignature = null;
    let renderedItems = [];
    let activeIndex = -1;

    function optionList() {
      return [...select.options];
    }

    function isDisabled(option) {
      return Boolean(option?.disabled);
    }

    function selectedIndex(items = optionList()) {
      return items.findIndex(option => option.selected);
    }

    function itemDisabled(item) {
      return item?.dataset?.disabled === "true";
    }

    function getItem(index) {
      return renderedItems[index] || null;
    }

    function firstEnabledIndex() {
      return renderedItems.findIndex(item => !itemDisabled(item));
    }

    function lastEnabledIndex() {
      for (let index = renderedItems.length - 1; index >= 0; index -= 1) {
        if (!itemDisabled(renderedItems[index])) return index;
      }
      return -1;
    }

    function nearestEnabledIndex(index, direction) {
      for (let cursor = index; cursor >= 0 && cursor < renderedItems.length; cursor += direction) {
        if (!itemDisabled(renderedItems[cursor])) return cursor;
      }
      return -1;
    }

    function setRovingIndex(index) {
      const fallback = index >= 0 && !itemDisabled(getItem(index))
        ? index
        : firstEnabledIndex();
      activeIndex = fallback;
      renderedItems.forEach((item, itemIndex) => {
        item.tabIndex = itemIndex === fallback ? 0 : -1;
      });
    }

    function focusItem(index) {
      const item = getItem(index);
      if (!item || itemDisabled(item)) return;
      setRovingIndex(index);
      item.focus();
    }

    function selectedEnabledIndex() {
      const index = selectedIndex();
      return index >= 0 && !itemDisabled(getItem(index)) ? index : firstEnabledIndex();
    }

    function moveFocus(direction) {
      const start = activeIndex >= 0 ? activeIndex + direction : selectedEnabledIndex();
      const next = activeIndex >= 0
        ? nearestEnabledIndex(start, direction)
        : nearestEnabledIndex(start, direction > 0 ? 1 : -1);
      focusItem(next >= 0 ? next : activeIndex);
    }

    function updateItem(item, option) {
      const disabled = isDisabled(option);
      item.dataset.value = option.value;
      item.dataset.disabled = String(disabled);
      item.setAttribute("aria-disabled", String(disabled));
      item.setAttribute("aria-selected", String(option.selected));
      item.disabled = matchNativeState && disabled;
      const check = item.firstChild;
      if (check) check.className = `custom-select__check${option.selected ? "" : " custom-select__check--empty"}`;
    }

    function selectItem(item) {
      if (!item || itemDisabled(item)) return;
      const option = optionList()[Number(item.dataset.index)];
      if (!option || isDisabled(option)) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      controller.sync();
      controller.close();
      // Preserve the established click contract even when a caller dispatches
      // click programmatically without the browser's preceding mousedown.
      trigger.focus();
    }

    function createItem(option, index) {
      const item = document.createElement("button");
      item.className = "custom-select__option";
      item.type = "button";
      item.role = "option";
      item.id = `${menu.id}-option-${index}`;
      item.dataset.index = String(index);
      item.dataset.value = option.value;
      item.tabIndex = -1;
      const check = document.createElement("span");
      check.className = "custom-select__check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      const label = document.createElement("span");
      label.textContent = option.textContent;
      item.append(check, label);
      item.addEventListener("focus", () => {
        if (!itemDisabled(item)) setRovingIndex(index);
      });
      item.addEventListener("click", () => selectItem(item));
      item.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusItem(firstEnabledIndex());
        } else if (event.key === "End") {
          event.preventDefault();
          focusItem(lastEnabledIndex());
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem(item);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          controller.close();
        } else if (event.key === "Tab") {
          // Let the browser continue its normal tab order; closing must not
          // move focus back to the trigger and trap the user in the widget.
          controller.close({ restoreFocus: false });
        }
      });
      updateItem(item, option);
      return item;
    }

    function rebuildItems(items, focusedValue, focusedIndex, restoreFocus) {
      renderedItems = items.map(createItem);
      menu.replaceChildren(...renderedItems);
      const focusedItem = focusedIndex >= 0 && renderedItems[focusedIndex]?.dataset.value === focusedValue
        ? renderedItems[focusedIndex]
        : renderedItems.find(item => item.dataset.value === focusedValue);
      if (menu.hidden || !restoreFocus) {
        setRovingIndex(selectedEnabledIndex());
      } else if (focusedItem && !itemDisabled(focusedItem)) {
        focusItem(Number(focusedItem.dataset.index));
      } else {
        focusItem(selectedEnabledIndex());
      }
    }

    const controller = {
      close({ restoreFocus = true } = {}) {
        const focusedInMenu = menu.contains(document.activeElement);
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        if (restoreFocus && focusedInMenu) trigger.focus();
      },
      sync() {
        if (matchNativeState) root.hidden = select.hidden;
        const selected = select.selectedOptions[0];
        value.textContent = selected?.textContent || emptyLabel;
        value.title = value.textContent;
        trigger.disabled = select.disabled || select.options.length === 0;

        const items = optionList();
        const focusedElement = document.activeElement;
        const focusedInMenu = menu.contains(focusedElement);
        const focusedValue = focusedInMenu ? focusedElement.dataset?.value : "";
        const focusedIndex = focusedInMenu ? Number(focusedElement.dataset?.index) : -1;
        const signature = items.map(option => [option.value, option.textContent, isDisabled(option)]).join("\u0001");
        if (signature !== renderedSignature) {
          renderedSignature = signature;
          rebuildItems(items, focusedValue, focusedIndex, focusedInMenu);
        } else {
          renderedItems.forEach((item, index) => updateItem(item, items[index]));
          if (!focusedInMenu) setRovingIndex(selectedEnabledIndex());
        }
      }
    };

    function openFromKeyboard(direction = 0, boundary = "") {
      if (trigger.disabled) return;
      if (typeof onToggle === "function") onToggle(controller, true);
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (boundary === "first") focusItem(firstEnabledIndex());
      else if (boundary === "last") focusItem(lastEnabledIndex());
      else {
        const selected = selectedIndex();
        if (selected >= 0 && !itemDisabled(getItem(selected))) {
          const next = direction ? nearestEnabledIndex(selected + direction, direction) : selected;
          focusItem(next >= 0 ? next : selected);
        } else {
          focusItem(direction < 0 ? lastEnabledIndex() : firstEnabledIndex());
        }
      }
    }

    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      if (typeof onToggle === "function") onToggle(controller, opening);
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      if (opening) setRovingIndex(selectedEnabledIndex());
    });
    trigger.addEventListener("keydown", event => {
      if (trigger.disabled) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (menu.hidden) openFromKeyboard(1);
        else moveFocus(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (menu.hidden) openFromKeyboard(-1);
        else moveFocus(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        if (menu.hidden) openFromKeyboard(0, "first");
        else focusItem(firstEnabledIndex());
      } else if (event.key === "End") {
        event.preventDefault();
        if (menu.hidden) openFromKeyboard(0, "last");
        else focusItem(lastEnabledIndex());
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (menu.hidden) openFromKeyboard();
        else controller.close();
      } else if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        controller.close();
      } else if (event.key === "Tab" && !menu.hidden) {
        controller.close({ restoreFocus: false });
      }
    });
    if (attachDocumentListeners) {
      document.addEventListener("mousedown", event => {
        if (!root.contains(event.target)) controller.close();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") controller.close();
      });
    }
    new MutationObserver(() => controller.sync()).observe(select, {
      attributes: true,
      childList: true,
      subtree: true
    });
    controller.sync();
    return controller;
  }

  return Object.freeze({ enhance });
});
