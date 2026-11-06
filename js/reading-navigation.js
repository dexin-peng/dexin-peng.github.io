// Reuse the homepage's message.follow positioning, keeping messages on screen.
function followMessage(event, node) {
  const box = node.getBoundingClientRect();
  const viewport = document.documentElement;
  let left = event.clientX + 20;
  let top = event.clientY + 10;
  if (left + box.width > viewport.clientWidth - 8) left = event.clientX - box.width - 20;
  if (top + box.height > viewport.clientHeight - 8) top = event.clientY - box.height - 10;
  node.style.left = Math.max(8, left) + window.scrollX + 'px';
  node.style.top = Math.max(8, top) + window.scrollY + 'px';
}

function fixMessage(node) {
  const box = node.getBoundingClientRect();
  node.style.position = 'fixed';
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
}

(() => {
  const button = document.querySelector('.reading-position');
  const article = document.querySelector('.reading-article');
  const home = document.querySelector('.reading-bar-inner > a.blog');
  const theme = document.querySelector('.reading-bar .icon');
  if (!button) return;

  let returnY = null;
  let returningFromTop = false;
  let lastTop;
  let lastReturn;
  let lastAvailable;
  let queued = false;
  let layoutQueued = false;
  let lastWide;

  function syncLayout() {
    layoutQueued = false;
    if (!article || !home || !theme) return;
    const content = article.getBoundingClientRect();
    const leftControl = home.getBoundingClientRect();
    const rightStart = Math.min(theme.getBoundingClientRect().left, button.getBoundingClientRect().left);
    const wide = leftControl.right + 6.18 <= content.left && content.right + 6.18 <= rightStart;
    if (wide !== lastWide) {
      lastWide = wide;
      document.body.classList.toggle('reading-wide', wide);
    }
  }

  function scheduleLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(syncLayout);
  }

  function syncPosition() {
    queued = false;
    const atTop = window.scrollY <= 4;
    if (!atTop && returningFromTop) {
      returnY = null;
      returningFromTop = false;
    }
    if (atTop !== lastTop) {
      lastTop = atTop;
      document.body.dataset.readingTop = String(atTop);
    }

    const canReturn = atTop && returnY !== null;
    const available = !atTop || canReturn;
    if (available !== lastAvailable) {
      lastAvailable = available;
      button.dataset.available = String(available);
      button.disabled = !available;
      if (available) button.removeAttribute('aria-hidden');
      else {
        if (document.activeElement === button) button.blur();
        button.setAttribute('aria-hidden', 'true');
        hideTooltip(button);
      }
    }
    if (canReturn !== lastReturn) {
      lastReturn = canReturn;
      const label = canReturn ? 'Back to where you just left' : 'Back to top';
      button.dataset.return = String(canReturn);
      button.setAttribute('aria-label', label);
    }
  }

  function scheduleSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(syncPosition);
  }

  button.addEventListener('click', () => {
    let destination;
    if (window.scrollY <= 4) {
      if (returnY === null) return;
      destination = returnY;
      returningFromTop = true;
    } else {
      returnY = window.scrollY;
      returningFromTop = false;
      destination = 0;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: destination, behavior: reduced ? 'auto' : 'smooth' });
    scheduleSync();
  });

  // A single body-level tooltip stays outside the navigation's clipping box.
  const tooltip = document.createElement('div');
  tooltip.id = 'reading-tooltip';
  tooltip.className = 'message reading-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let tooltipTarget = null;

  function hideTooltip(target) {
    if (target && target !== tooltipTarget) return;
    if (tooltipTarget) {
      const remaining = (tooltipTarget.getAttribute('aria-describedby') || '')
        .split(/\s+/).filter(id => id && id !== tooltip.id).join(' ');
      if (remaining) tooltipTarget.setAttribute('aria-describedby', remaining);
      else tooltipTarget.removeAttribute('aria-describedby');
    }
    tooltipTarget = null;
    tooltip.hidden = true;
  }

  function showTooltip(target, event) {
    target.removeAttribute('title');
    if (target.disabled || target.getAttribute('aria-hidden') === 'true'
        || getComputedStyle(target).visibility === 'hidden') return;
    const label = target.getAttribute('aria-label');
    if (!label) return;
    if (!event && tooltipTarget === target) return;
    hideTooltip();
    tooltipTarget = target;
    tooltip.textContent = label;
    const describedBy = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [describedBy, tooltip.id].filter(Boolean).join(' '));
    tooltip.hidden = false;
    const anchor = target.getBoundingClientRect();
    followMessage(event || { clientX: anchor.left, clientY: anchor.bottom }, tooltip);
  }

  for (const target of document.querySelectorAll('.reading-position, .contents-toggle')) {
    target.removeAttribute('title');
    target.addEventListener('pointerenter', event => showTooltip(target, event));
    target.addEventListener('pointermove', event => {
      if (tooltipTarget === target) followMessage(event, tooltip);
    });
    target.addEventListener('focus', () => showTooltip(target));
    target.addEventListener('pointerleave', () => hideTooltip(target));
    target.addEventListener('blur', () => hideTooltip(target));
  }
  document.addEventListener('click', () => hideTooltip());
  document.addEventListener('scroll', () => hideTooltip(), true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('resize', () => hideTooltip());

  window.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('resize', scheduleLayout, { passive: true });
  if ('ResizeObserver' in window && article && home) {
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(article);
    observer.observe(home);
  }
  syncLayout();
  syncPosition();
})();
