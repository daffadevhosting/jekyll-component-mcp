/**
 * Navbar Mobile Menu
 * Accessible: aria-expanded, focus management, Escape key
 */

export function initNavbar() {
  const toggles = document.querySelectorAll('[data-navbar-toggle]');

  toggles.forEach((toggle) => {
    const menuId = toggle.getAttribute('aria-controls');
    const menu = menuId ? document.getElementById(menuId) : null;

    if (!menu) return;

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      const next = !isOpen;

      toggle.setAttribute('aria-expanded', String(next));
      menu.hidden = !next;
      menu.classList.toggle('is-open', next);

      if (next) {
        // Focus first link
        const firstLink = menu.querySelector('a');
        if (firstLink) firstLink.focus();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        menu.classList.remove('is-open');
        toggle.focus();
      }
    });

    // Close when clicking a link (mobile)
    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        menu.classList.remove('is-open');
      });
    });
  });
}
