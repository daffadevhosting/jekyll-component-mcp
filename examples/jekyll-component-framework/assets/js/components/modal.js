/**
 * Modal — accessible dialog
 * Focus trap, Escape, backdrop click, restore focus
 */

let previouslyFocused = null;

function getFocusable(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

function openModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.querySelector(`[data-modal-backdrop="${id}"]`);
  if (!modal) return;

  previouslyFocused = document.activeElement;

  modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  // Force reflow then animate
  requestAnimationFrame(() => {
    modal.classList.add('is-open');
    backdrop?.classList.add('is-open');
  });

  document.body.classList.add('is-modal-open');

  // Focus first focusable or close button
  const focusable = getFocusable(modal);
  (focusable[0] || modal.querySelector('[data-modal-close]'))?.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.querySelector(`[data-modal-backdrop="${id}"]`);
  if (!modal) return;

  modal.classList.remove('is-open');
  backdrop?.classList.remove('is-open');

  const onEnd = () => {
    modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('is-modal-open');
    previouslyFocused?.focus();
    modal.removeEventListener('transitionend', onEnd);
  };

  modal.addEventListener('transitionend', onEnd);
  // Fallback
  setTimeout(onEnd, 300);
}

export function initModal() {
  // Open triggers
  document.querySelectorAll('[data-modal-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal(btn.getAttribute('data-modal-open'));
    });
  });

  // Close buttons
  document.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('[data-modal]');
      if (modal) closeModal(modal.id);
    });
  });

  // Backdrop click
  document.querySelectorAll('[data-modal-backdrop]').forEach((backdrop) => {
    backdrop.addEventListener('click', () => {
      closeModal(backdrop.getAttribute('data-modal-backdrop'));
    });
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.c-modal.is-open');
    if (open) closeModal(open.id);
  });

  // Focus trap
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const open = document.querySelector('.c-modal.is-open');
    if (!open) return;

    const focusable = getFocusable(open);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

// Public API for programmatic use
export { openModal, closeModal };
