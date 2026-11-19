/**
 * Scroll reveal for any element with [data-mi-reveal]: fades and lifts it in
 * the first time it enters the viewport. The CSS lives in mi-tokens.css and
 * only applies when the user has no reduced-motion preference, so with
 * reduced motion (or no JS) everything is simply visible.
 *
 * Uses a single shared IntersectionObserver; elements added later (theme
 * editor, section re-renders) are picked up by a MutationObserver.
 */
const SELECTOR = '[data-mi-reveal]:not(.is-revealed)';

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
);

function observeAll(root = document) {
  root.querySelectorAll(SELECTOR).forEach((element) => observer.observe(element));
}

observeAll();

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) {
        if (node.matches(SELECTOR)) observer.observe(node);
        observeAll(node);
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });
