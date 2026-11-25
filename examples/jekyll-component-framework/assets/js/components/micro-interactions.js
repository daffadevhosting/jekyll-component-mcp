/**
 * Lightweight pointer feedback for buttons and hoverable cards.
 */

function addRipple(button, clientX, clientY) {
  const bounds = button.getBoundingClientRect();
  const ripple = document.createElement('span');

  ripple.className = 'c-button__ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.setProperty('--ripple-x', `${clientX - bounds.left}px`);
  ripple.style.setProperty('--ripple-y', `${clientY - bounds.top}px`);
  button.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

export function initMicroInteractions() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return;

    const button = event.target.closest('.c-button--ripple:not(:disabled):not([aria-disabled="true"])');
    if (button) addRipple(button, event.clientX, event.clientY);
  });

  document.addEventListener('click', (event) => {
    if (event.detail !== 0 || !(event.target instanceof Element)) return;

    const button = event.target.closest('.c-button--ripple:not(:disabled):not([aria-disabled="true"])');
    if (!button) return;

    const bounds = button.getBoundingClientRect();
    addRipple(button, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  });

  document.addEventListener('pointermove', (event) => {
    if (!(event.target instanceof Element)) return;

    const card = event.target.closest('.c-card--glare');
    if (!card) return;

    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--glare-x', `${event.clientX - bounds.left}px`);
    card.style.setProperty('--glare-y', `${event.clientY - bounds.top}px`);
  });
}
