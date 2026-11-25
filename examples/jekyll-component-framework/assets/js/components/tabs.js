/**
 * Tabs — WAI-ARIA Tabs pattern
 * Arrow key navigation, Home/End support
 */

export function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach((tabsRoot) => {
    const tablist = tabsRoot.querySelector('[role="tablist"]');
    const tabs = [...tabsRoot.querySelectorAll('[data-tabs-tab]')];
    const panels = [...tabsRoot.querySelectorAll('[data-tabs-panel]')];

    function activate(index) {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.setAttribute('tabindex', selected ? '0' : '-1');
        if (panels[i]) panels[i].hidden = !selected;
      });
      tabs[index]?.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(index));
    });

    tablist?.addEventListener('keydown', (e) => {
      const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      let next = current;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          next = (current + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          next = (current - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          e.preventDefault();
          next = 0;
          break;
        case 'End':
          e.preventDefault();
          next = tabs.length - 1;
          break;
        default:
          return;
      }

      // Skip disabled
      let attempts = 0;
      while (tabs[next]?.disabled && attempts < tabs.length) {
        next = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Home'
          ? (next - 1 + tabs.length) % tabs.length
          : (next + 1) % tabs.length;
        attempts++;
      }

      activate(next);
    });
  });
}
