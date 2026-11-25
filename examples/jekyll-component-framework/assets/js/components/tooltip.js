/**
 * Tooltip — show on hover/focus
 */

export function initTooltip() {
  document.querySelectorAll('[data-tooltip]').forEach((wrapper) => {
    const content = wrapper.querySelector('[data-tooltip-content]');
    if (!content) return;

    const show = () => content.classList.add('is-visible');
    const hide = () => content.classList.remove('is-visible');

    wrapper.addEventListener('mouseenter', show);
    wrapper.addEventListener('mouseleave', hide);
    wrapper.addEventListener('focusin', show);
    wrapper.addEventListener('focusout', hide);
  });
}
