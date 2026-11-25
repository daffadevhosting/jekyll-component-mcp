/**
 * Dropdown — accessible menu
 * Click outside, Escape, arrow keys
 */

export function initDropdown() {
  document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
    const trigger = dropdown.querySelector('[data-dropdown-trigger]');
    const menu = dropdown.querySelector('[data-dropdown-menu]');
    if (!trigger || !menu) return;

    const items = () => [...menu.querySelectorAll('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])')];

    function open() {
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      items()[0]?.focus();
    }

    function close() {
      trigger.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
      setTimeout(() => { menu.hidden = true; }, 150);
      trigger.focus();
    }

    function isOpen() {
      return trigger.getAttribute('aria-expanded') === 'true';
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    // Keyboard on trigger
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isOpen()) open();
      }
    });

    // Keyboard inside menu
    menu.addEventListener('keydown', (e) => {
      const list = items();
      const current = list.indexOf(document.activeElement);

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[(current + 1) % list.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[(current - 1 + list.length) % list.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        list[list.length - 1]?.focus();
      }
    });

    // Close on item click
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener('click', () => close());
    });

    // Click outside
    document.addEventListener('click', (e) => {
      if (isOpen() && !dropdown.contains(e.target)) close();
    });
  });
}
