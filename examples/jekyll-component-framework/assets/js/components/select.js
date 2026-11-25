/**
 * Select menu — progressive enhancement for themed and rich options
 */

export function initSelectMenus() {
  document.querySelectorAll('[data-select-menu]').forEach((root) => {
    const nativeSelect = root.querySelector('[data-select-native]');
    const enhanced = root.querySelector('[data-select-enhanced]');
    const trigger = root.querySelector('[data-select-trigger]');
    const currentValue = root.querySelector('[data-select-value]');
    const valueInput = root.querySelector('[data-select-value-input]');
    const list = root.querySelector('[data-select-list]');
    const errorMessage = root.querySelector('[data-select-error]');
    const label = root.querySelector('.c-label');

    if (!nativeSelect || !enhanced || !trigger || !currentValue || !valueInput || !list) return;
    if (root.dataset.selectInitialized === 'true') return;
    root.dataset.selectInitialized = 'true';

    const fieldName = nativeSelect.name;
    const form = nativeSelect.form;
    const wasDisabled = nativeSelect.disabled;
    const isRequired = nativeSelect.required;
    const hasServerError = trigger.getAttribute('aria-invalid') === 'true';
    const options = [...list.querySelectorAll('[data-select-option]')];
    let activeOption = null;

    function updateCurrentValue(option) {
      const content = option?.querySelector('[data-select-option-main]');
      if (!content) {
        currentValue.textContent = nativeSelect.options[nativeSelect.selectedIndex]?.textContent.trim() || 'Choose an option';
        return;
      }

      currentValue.replaceChildren(...[...content.childNodes].map((node) => node.cloneNode(true)));
    }

    function setActive(option) {
      if (activeOption) activeOption.removeAttribute('data-active');
      activeOption = option;

      if (!option) {
        trigger.removeAttribute('aria-activedescendant');
        return;
      }

      option.setAttribute('data-active', 'true');
      trigger.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }

    function enabledOptions() {
      return options.filter((option) => option.getAttribute('aria-disabled') !== 'true');
    }

    function open(focusSelected = true) {
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      const selected = options.find((option) => option.dataset.value === nativeSelect.value);
      setActive(focusSelected && selected && selected.getAttribute('aria-disabled') !== 'true'
        ? selected
        : enabledOptions()[0] ?? null);
    }

    function close() {
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      setActive(null);
    }

    function setValidity() {
      const invalid = isRequired && !valueInput.value;
      if (invalid) {
        trigger.setAttribute('aria-invalid', 'true');
        if (errorMessage) errorMessage.hidden = false;
      } else {
        if (!hasServerError) trigger.removeAttribute('aria-invalid');
        if (errorMessage) errorMessage.hidden = true;
      }
      return !invalid;
    }

    function selectOption(option) {
      if (!option || option.getAttribute('aria-disabled') === 'true') return;

      nativeSelect.value = option.dataset.value;
      valueInput.value = option.dataset.value;
      options.forEach((candidate) => {
        candidate.setAttribute('aria-selected', String(candidate === option));
      });
      updateCurrentValue(option);
      setValidity();
      nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }

    if (!valueInput.value && nativeSelect.value) {
      valueInput.value = nativeSelect.value;
    }
    nativeSelect.hidden = true;
    nativeSelect.disabled = true;
    nativeSelect.removeAttribute('name');
    enhanced.hidden = false;
    trigger.disabled = wasDisabled;
    valueInput.disabled = wasDisabled;
    valueInput.name = fieldName;
    if (label) label.htmlFor = trigger.id;
    updateCurrentValue(options.find((option) => option.dataset.value === nativeSelect.value));

    trigger.addEventListener('click', () => {
      if (list.hidden) open();
      else close();
    });

    trigger.addEventListener('keydown', (event) => {
      const availableOptions = enabledOptions();

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) {
          open(event.key === 'ArrowDown');
          if (event.key === 'ArrowUp') setActive(availableOptions.at(-1) ?? null);
          return;
        }

        const currentIndex = availableOptions.indexOf(activeOption);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? (direction > 0 ? 0 : availableOptions.length - 1)
          : (currentIndex + direction + availableOptions.length) % availableOptions.length;
        setActive(availableOptions[nextIndex] ?? null);
      } else if (event.key === 'Home' && !list.hidden) {
        event.preventDefault();
        setActive(availableOptions[0] ?? null);
      } else if (event.key === 'End' && !list.hidden) {
        event.preventDefault();
        setActive(availableOptions.at(-1) ?? null);
      } else if ((event.key === 'Enter' || event.key === ' ') && list.hidden) {
        event.preventDefault();
        open();
      } else if ((event.key === 'Enter' || event.key === ' ') && activeOption) {
        event.preventDefault();
        selectOption(activeOption);
      } else if (event.key === 'Escape' && !list.hidden) {
        event.preventDefault();
        close();
      }
    });

    list.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('click', (event) => {
      const option = event.target.closest('[data-select-option]');
      if (option && list.contains(option)) selectOption(option);
    });

    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) close();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!root.contains(event.target)) close();
    });

    form?.addEventListener('submit', (event) => {
      if (!setValidity()) {
        event.preventDefault();
        trigger.focus();
      }
    });

    form?.addEventListener('reset', () => {
      setTimeout(() => {
        const selected = options.find((option) => option.dataset.value === nativeSelect.value);
        valueInput.value = nativeSelect.value;
        options.forEach((option) => option.setAttribute('aria-selected', String(option === selected)));
        updateCurrentValue(selected);
        setValidity();
        close();
      });
    });
  });
}