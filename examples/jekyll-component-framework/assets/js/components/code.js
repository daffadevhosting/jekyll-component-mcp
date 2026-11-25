/**
 * Code Block — copy to clipboard
 */

function createCopyButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'c-code__copy';
  button.setAttribute('data-code-copy', '');
  button.setAttribute('aria-label', 'Copy code');

  const label = document.createElement('span');
  label.setAttribute('data-code-copy-label', '');
  label.setAttribute('aria-live', 'polite');
  label.textContent = 'Copy';
  button.append(label);

  return button;
}

function enhanceMarkdownCodeBlocks() {
  document.querySelectorAll('pre > code').forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.closest('[data-code-block]')) return;

    const block = document.createElement('div');
    block.className = 'c-code c-code--standalone';
    block.setAttribute('data-code-block', '');

    const header = document.createElement('div');
    header.className = 'c-code__header';

    let languageScope = pre;
    let languageClass;
    while (languageScope && !languageClass) {
      languageClass = [...languageScope.classList]
        .find((className) => className.startsWith('language-'));
      if (languageScope.classList.contains('highlighter-rouge')) break;
      languageScope = languageScope.parentElement;
    }
    const language = document.createElement('span');
    language.className = 'c-code__lang';
    language.textContent = languageClass ? languageClass.slice('language-'.length) : 'Code';

    header.append(language, createCopyButton());
    block.append(header);
    pre.classList.add('c-code__body');
    pre.parentNode.insertBefore(block, pre);
    block.append(pre);
  });
}

function bindCopyButton(block) {
  const btn = block.querySelector('[data-code-copy]');
  const label = block.querySelector('[data-code-copy-label]');
  const codeEl = block.querySelector('code');
  if (!btn || !codeEl || btn.dataset.codeBound === 'true') return;
  btn.dataset.codeBound = 'true';

    btn.addEventListener('click', async () => {
      const text = codeEl.textContent || '';

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      if (label) {
        const original = label.textContent;
        label.textContent = 'Copied!';
        btn.setAttribute('aria-label', 'Copied');
        setTimeout(() => {
          label.textContent = original || 'Copy';
          btn.setAttribute('aria-label', 'Copy code');
        }, 2000);
      }
    });
}

export function initCode() {
  enhanceMarkdownCodeBlocks();
  document.querySelectorAll('[data-code-block]').forEach(bindCopyButton);
}
