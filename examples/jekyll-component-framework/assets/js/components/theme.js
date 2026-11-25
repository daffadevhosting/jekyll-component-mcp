/**
 * Theme Toggle
 * Supports: light | dark | system
 * Persists preference in localStorage
 * Avoids flash via inline script in <head>
 */

const STORAGE_KEY = 'theme';

function getPreferredTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);

  if (preference === 'system') {
    document.documentElement.setAttribute('data-theme-preference', 'system');
  } else {
    document.documentElement.removeAttribute('data-theme-preference');
  }

  // Update toggle icons
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    const sun = btn.querySelector('.c-theme-icon--sun');
    const moon = btn.querySelector('.c-theme-icon--moon');
    if (sun && moon) {
      if (resolved === 'dark') {
        sun.hidden = true;
        moon.hidden = false;
      } else {
        sun.hidden = false;
        moon.hidden = true;
      }
    }
  });
}

function cycleTheme() {
  const current = getPreferredTheme();
  let next;

  if (current === 'light') next = 'dark';
  else if (current === 'dark') next = 'system';
  else next = 'light';

  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
}

export function initTheme() {
  // Apply on load (in case preference changed)
  applyTheme(getPreferredTheme());

  // Toggle buttons
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', cycleTheme);
  });

  // React to system preference changes when in "system" mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getPreferredTheme() === 'system') {
      applyTheme('system');
    }
  });
}
