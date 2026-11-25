/**
 * Combobox — searchable listbox with a native select fallback
 */

export function initCombobox() {
  document.querySelectorAll('[data-combobox]').forEach((root) => {
    const fallback = root.querySelector('[data-combobox-fallback]');
    const enhanced = root.querySelector('[data-combobox-enhanced]');
    const input = root.querySelector('[data-combobox-input]');
    const valueInput = root.querySelector('[data-combobox-value]');
    const listbox = root.querySelector('[role="listbox"]');
    const label = root.querySelector('.c-label');
    const emptyMessage = root.querySelector('[data-combobox-empty]');

    if (!fallback || !enhanced || !input || !valueInput || !listbox) return;
    if (root.dataset.comboboxInitialized === 'true') return;
    root.dataset.comboboxInitialized = 'true';

    const wasDisabled = fallback.disabled;
    const hasServerError = input.getAttribute('aria-invalid') === 'true';
    const options = [...listbox.querySelectorAll('[role="option"]')];
    const initialValue = valueInput.value;
    let selectedLabel = input.value;
    let activeOption = null;

    fallback.hidden = true;
    fallback.disabled = true;
    enhanced.hidden = false;
    input.disabled = wasDisabled;
    valueInput.disabled = wasDisabled;
    if (label) label.htmlFor = input.id;

    function visibleOptions() {
      return options.filter((option) => !option.hidden);
    }

    function setActive(option) {
      if (activeOption) activeOption.removeAttribute('data-active');
      activeOption = option;

      if (!option) {
        input.removeAttribute('aria-activedescendant');
        return;
      }

      option.setAttribute('data-active', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }

    function open() {
      listbox.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function close() {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      if (emptyMessage) emptyMessage.hidden = true;
      setActive(null);
    }

    function filter(query) {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      let hasVisibleOption = false;

      options.forEach((option) => {
        const matches = option.textContent.trim().toLocaleLowerCase().includes(normalizedQuery);
        option.hidden = !matches;
        option.setAttribute('aria-selected', String(option.dataset.value === valueInput.value));
        if (matches) hasVisibleOption = true;
      });

      if (emptyMessage) emptyMessage.hidden = hasVisibleOption;
      setActive(null);
    }

    function syncValidity() {
      const selectedOption = options.find((option) => option.dataset.value === valueInput.value);
      const hasValidSelection = selectedOption && selectedOption.textContent.trim() === input.value;
      const invalidSelection = Boolean(input.value && !hasValidSelection);
      input.setCustomValidity(invalidSelection ? 'Choose an option from the list.' : '');

      if (invalidSelection) {
        input.setAttribute('aria-invalid', 'true');
      } else if (!hasServerError) {
        input.removeAttribute('aria-invalid');
      }
    }

    function selectOption(option) {
      if (!option) return;

      selectedLabel = option.textContent.trim();
      input.value = selectedLabel;
      valueInput.value = option.dataset.value;
      fallback.value = option.dataset.value;
      options.forEach((candidate) => {
        candidate.setAttribute('aria-selected', String(candidate === option));
      });
      fallback.dispatchEvent(new Event('input', { bubbles: true }));
      fallback.dispatchEvent(new Event('change', { bubbles: true }));
      syncValidity();
      close();
    }

    input.addEventListener('focus', () => {
      open();
      filter('');
    });

    input.addEventListener('input', () => {
      valueInput.value = '';
      syncValidity();
      open();
      filter(input.value);
    });

    input.addEventListener('keydown', (event) => {
      const visible = visibleOptions();

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (listbox.hidden) {
          open();
          filter('');
          return;
        }

        const currentIndex = visible.indexOf(activeOption);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? (direction > 0 ? 0 : visible.length - 1)
          : (currentIndex + direction + visible.length) % visible.length;
        setActive(visible[nextIndex] ?? null);
      } else if (event.key === 'Home' && !listbox.hidden) {
        event.preventDefault();
        setActive(visible[0] ?? null);
      } else if (event.key === 'End' && !listbox.hidden) {
        event.preventDefault();
        setActive(visible.at(-1) ?? null);
      } else if (event.key === 'Enter' && !listbox.hidden && activeOption) {
        event.preventDefault();
        selectOption(activeOption);
      } else if (event.key === 'Escape' && !listbox.hidden) {
        event.preventDefault();
        input.value = selectedLabel;
        valueInput.value = fallback.value;
        syncValidity();
        close();
      }
    });

    listbox.addEventListener('mousedown', (event) => event.preventDefault());
    listbox.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"]');
      if (option && listbox.contains(option)) selectOption(option);
    });

    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) close();
    });

    root.closest('form')?.addEventListener('reset', () => {
      setTimeout(() => {
        fallback.value = initialValue;
        valueInput.value = initialValue;
        selectedLabel = options.find((option) => option.dataset.value === initialValue)?.textContent.trim() ?? '';
        input.value = selectedLabel;
        syncValidity();
        close();
      });
    });

    filter('');
    syncValidity();
  });
}