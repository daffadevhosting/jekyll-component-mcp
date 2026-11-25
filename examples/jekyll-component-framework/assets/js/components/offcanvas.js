/**
 * Offcanvas — accessible side panel
 * Focus trap, Escape, backdrop click, link auto-close, restore focus
 */

let activePanel = null;
let activeBackdrop = null;
let activeTrigger = null;

function getFocusable(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
}

/**
 * Links that should close the panel before navigation.
 * Skip hash-only anchors that stay on the same page (e.g. #section)
 * and links marked with data-offcanvas-keep.
 */
function shouldAutoCloseOnLink(link) {
  if (!(link instanceof HTMLAnchorElement)) return false;
  if (link.hasAttribute('data-offcanvas-keep')) return false;

  const href = link.getAttribute('href');
  if (!href || href === '#' || href.startsWith('javascript:')) return false;

  // Same-page hash anchors: keep panel open unless they leave the page
  if (href.startsWith('#')) return false;

  return true;
}

export function openOffcanvas(id, trigger = document.activeElement) {
  const panel = document.getElementById(id);
  const backdrop = document.getElementById(`${id}-backdrop`);
  if (!panel || !backdrop || backdrop.getAttribute('data-offcanvas-backdrop') !== id) {
    console.error(`Offcanvas "${id}" was not found or is missing its backdrop.`);
    return;
  }
  if (activePanel === panel) return;

  if (activePanel) closeOffcanvas(activePanel.id, false);

  activePanel = panel;
  activeBackdrop = backdrop;
  activeTrigger = trigger;

  panel.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('is-offcanvas-open');
  trigger?.setAttribute?.('aria-expanded', 'true');

  requestAnimationFrame(() => {
    if (activePanel !== panel) return;
    panel.classList.add('is-open');
    backdrop.classList.add('is-open');
  });

  const focusable = getFocusable(panel);
  (focusable[0] || panel).focus();
}

export function closeOffcanvas(id = activePanel?.id, restoreFocus = true) {
  if (!activePanel || activePanel.id !== id) return;

  const panel = activePanel;
  const backdrop = activeBackdrop;
  const trigger = activeTrigger;

  activePanel = null;
  activeBackdrop = null;
  activeTrigger = null;
  panel.classList.remove('is-open');
  backdrop?.classList.remove('is-open');
  trigger?.setAttribute?.('aria-expanded', 'false');

  window.setTimeout(() => {
    if (panel.classList.contains('is-open')) return;
    panel.hidden = true;
    if (backdrop) backdrop.hidden = true;

    if (!activePanel) {
      document.body.classList.remove('is-offcanvas-open');
      if (restoreFocus) trigger?.focus();
    }
  }, 250);
}

export function initOffcanvas() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const trigger = event.target.closest('[data-offcanvas-open]');
    if (trigger) {
      openOffcanvas(trigger.getAttribute('data-offcanvas-open'), trigger);
      return;
    }

    const closeButton = event.target.closest('[data-offcanvas-close]');
    if (closeButton && activePanel?.contains(closeButton)) {
      closeOffcanvas(activePanel.id);
      return;
    }

    // Auto-close when navigating via a link inside the open panel
    if (activePanel) {
      const link = event.target.closest('a[href]');
      if (link && activePanel.contains(link) && shouldAutoCloseOnLink(link)) {
        // Close without restoring focus — browser will navigate away
        closeOffcanvas(activePanel.id, false);
        // Do not preventDefault — allow normal navigation
        return;
      }
    }

    const backdrop = event.target.closest('[data-offcanvas-backdrop]');
    if (backdrop && backdrop === activeBackdrop) {
      closeOffcanvas(activePanel.id);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!activePanel) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeOffcanvas(activePanel.id);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusable(activePanel);
    if (focusable.length === 0) {
      event.preventDefault();
      activePanel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
