/**
 * Accordion — accessible expand/collapse
 * Supports single or multiple open panels via data-accordion-multiple
 */

export function initAccordion() {
  document.querySelectorAll('[data-accordion]').forEach((accordion) => {
    const multiple = accordion.hasAttribute('data-accordion-multiple');
    const triggers = accordion.querySelectorAll('[data-accordion-trigger]');

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const expanded = trigger.getAttribute('aria-expanded') === 'true';
        const panelId = trigger.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);

        if (!panel) return;

        if (!multiple && !expanded) {
          // Close other panels
          triggers.forEach((t) => {
            if (t !== trigger) {
              t.setAttribute('aria-expanded', 'false');
              const p = document.getElementById(t.getAttribute('aria-controls'));
              if (p) p.hidden = true;
            }
          });
        }

        trigger.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
      });
    });
  });
}
