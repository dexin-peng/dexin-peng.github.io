(() => {
  const sidebar = document.querySelector('.contents-sidebar');
  if (!sidebar) return;
  const toggle = sidebar.querySelector('.contents-toggle');
  const nav = sidebar.querySelector('.contents');
  const compact = matchMedia('(max-width: 68.54rem)');
  const sections = [...document.querySelectorAll('.research-blog > section[id]')]
    .filter(section => section.querySelector('h2'));
  const links = sections.map(section => {
    const link = document.createElement('a');
    link.href = '#' + section.id;
    link.textContent = section.querySelector('h2').textContent.trim();
    return link;
  });
  nav.querySelector('ol').replaceChildren(...links.map(link => {
    const item = document.createElement('li');
    item.append(link);
    return item;
  }));

  function setOpen(open) {
    sidebar.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide Table of Contents' : 'Show Table of Contents');
    nav.inert = !open;
    nav.setAttribute('aria-hidden', String(!open));
  }
  toggle.addEventListener('click', () => setOpen(sidebar.dataset.open !== 'true'));
  nav.addEventListener('click', event => {
    if (compact.matches && event.target.closest('a')) setOpen(false);
  });
  sidebar.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    setOpen(false);
    toggle.focus();
  });
  compact.addEventListener('change', () => setOpen(false));
  setOpen(false);

  let currentSection;
  function setCurrent(section) {
    if (currentSection === section) return;
    currentSection = section;
    links.forEach((link, index) => {
      if (sections[index] === section) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  let sectionObserver;
  function observeReadingPosition() {
    sectionObserver?.disconnect();
    const visible = new Set();
    const height = document.documentElement.clientHeight;
    const readingLine = Math.round(height * .382);
    sectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      const active = sections.filter(section => visible.has(section)).pop();
      if (active) setCurrent(active);
    }, {rootMargin: `-${readingLine}px 0px -${height - readingLine - 1}px 0px`});
    sections.forEach(section => sectionObserver.observe(section));
  }
  setCurrent(sections[0]);
  observeReadingPosition();
  window.addEventListener('resize', observeReadingPosition, {passive: true});
})();

const mathOptions = {
  delimiters: [
    {left: '\\(', right: '\\)', display: false},
    {left: '\\[', right: '\\]', display: true}
  ],
  ignoredClasses: ['katex'],
  throwOnError: false
};
for (const equation of document.querySelectorAll('.equations')) {
  katex.render(equation.textContent, equation, {displayMode: true, throwOnError: false});
}
renderMathInElement(document.querySelector('main'), mathOptions);

// Insert local figures and tables into the page so they inherit its theme.
const included = new WeakMap();
function loadInclude(element) {
  if (!included.has(element)) {
    included.set(element, fetch(element.dataset.include)
      .then(response => {
        if (!response.ok) throw new Error(`Could not load ${element.dataset.include}`);
        return response.text();
      })
      .then(markup => {
        element.innerHTML = markup;
        if (element.dataset.animationSync) {
          const svg = element.querySelector('svg');
          const peer = [...document.querySelectorAll('[data-animation-sync]')]
            .filter(other => other !== element && other.dataset.animationSync === element.dataset.animationSync)
            .map(other => other.querySelector('svg')).find(Boolean);
          if (svg?.setCurrentTime && peer?.getCurrentTime) svg.setCurrentTime(peer.getCurrentTime());
        }
        if (!element.dataset.include.endsWith('.svg')) renderMathInElement(element, mathOptions);
      })
      .catch(error => {
        const link = document.createElement('a');
        link.href = element.dataset.include;
        link.textContent = 'Open figure or table';
        element.replaceChildren(link);
        console.error(error);
      }));
  }
  return included.get(element);
}
const figureObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    loadInclude(entry.target);
    figureObserver.unobserve(entry.target);
  }
}, {rootMargin: '300px'});
for (const element of document.querySelectorAll('[data-include]')) {
  if (element.closest('details:not([open])')) continue;
  // Empty table containers can have zero height, so load initially open folds
  // directly instead of waiting for an intersection that may never occur.
  if (element.closest('details[open]')) loadInclude(element);
  else figureObserver.observe(element);
}

// Load a folded table once, then animate both opening and closing.
const foldControls = new WeakMap();
for (const details of document.querySelectorAll('.fold')) {
  const summary = details.querySelector('summary');
  let animation, expanded = details.open, revision = 0, busy = false;
  details.dataset.expanded = String(expanded);
  function finish(open) {
    details.open = expanded = open;
    details.dataset.expanded = String(open);
    details.style.height = '';
    animation?.cancel();
    animation = null;
    busy = false;
  }
  foldControls.set(details, () => { ++revision; finish(true); });
  details.addEventListener('toggle', () => {
    if (busy) return;
    expanded = details.open;
    details.dataset.expanded = String(expanded);
  });
  summary.addEventListener('click', async event => {
    event.preventDefault();
    expanded = !expanded;
    details.dataset.expanded = String(expanded);
    busy = true;
    const current = ++revision;
    const from = details.getBoundingClientRect().height;
    animation?.cancel();
    animation = null;
    details.style.height = `${from}px`;
    if (expanded) await Promise.all([...details.querySelectorAll('[data-include]')].map(loadInclude));
    if (current !== revision) return;
    details.open = true;
    details.style.height = '';
    const to = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height;
    const style = getComputedStyle(details);
    const time = style.getPropertyValue('--fold-duration').trim();
    const duration = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
    if (!duration) { finish(expanded); return; }
    details.style.height = `${from}px`;
    animation = details.animate([{height: `${from}px`}, {height: `${to}px`}], {
      duration, easing: style.getPropertyValue('--fold-easing').trim()
    });
    animation.onfinish = () => { if (current === revision) finish(expanded); };
  });
}

// Reveal a cited entry when navigating directly to its fragment.
function revealReference(hash) {
  if (!hash.startsWith('#ref-')) return;
  const entry = document.getElementById(hash.slice(1));
  const fold = entry?.closest('details');
  if (fold) {
    if (foldControls.has(fold)) foldControls.get(fold)();
    else fold.open = true;
  }
}
window.addEventListener('hashchange', () => revealReference(location.hash));
revealReference(location.hash);

// One floating note, outside the article's horizontal scrolling containers.
const pinFootnotes = true;
const notePopup = document.createElement('aside');
notePopup.id = 'footnote-popup';
notePopup.className = 'message footnote-popup';
notePopup.setAttribute('role', 'note');
notePopup.hidden = true;
document.body.append(notePopup);
let activeFootnote, noteCloseTimer;
let noteFixed = false;
function hideFootnote() {
  clearTimeout(noteCloseTimer);
  if (!activeFootnote) return;
  activeFootnote?.setAttribute('aria-expanded', 'false');
  activeFootnote?.removeAttribute('aria-describedby');
  activeFootnote = null;
  noteFixed = false;
  notePopup.hidden = true;
  notePopup.style.position = '';
}
function showFootnote(button, event) {
  clearTimeout(noteCloseTimer);
  if (noteFixed) return;
  const alreadyOpen = activeFootnote === button;
  if (!alreadyOpen) {
    hideFootnote();
    activeFootnote = button;
    notePopup.replaceChildren(document.getElementById(button.dataset.footnote).content.cloneNode(true));
    renderMathInElement(notePopup, mathOptions);
  }
  notePopup.hidden = false;
  notePopup.setAttribute('aria-label', button.getAttribute('aria-label'));
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-describedby', notePopup.id);
  if (event) followMessage(event, notePopup);
  else if (!alreadyOpen) {
    const anchor = (button.closest('.footnote-anchor') || button).getBoundingClientRect();
    followMessage({ clientX: anchor.left, clientY: anchor.bottom }, notePopup);
  }
}
function fixFootnote() {
  if (!pinFootnotes || notePopup.hidden) return;
  noteFixed = true;
  fixMessage(notePopup);
}
function scheduleNoteClose() {
  noteCloseTimer = setTimeout(() => {
    const trigger = activeFootnote?.closest('.footnote-anchor') || activeFootnote;
    if (noteFixed || trigger?.matches(':hover') || notePopup.matches(':hover')
        || document.activeElement === activeFootnote || notePopup.contains(document.activeElement)) return;
    hideFootnote();
  }, 162);
}
for (const button of document.querySelectorAll('[data-footnote]')) {
  button.setAttribute('aria-controls', notePopup.id);
  button.setAttribute('aria-expanded', 'false');
  const trigger = button.closest('.footnote-anchor') || button;
  trigger.addEventListener('pointerenter', event => showFootnote(button, event));
  trigger.addEventListener('pointermove', event => {
    if (activeFootnote === button && !noteFixed) followMessage(event, notePopup);
  });
  trigger.addEventListener('pointerleave', scheduleNoteClose);
  trigger.addEventListener('click', event => {
    button.focus({preventScroll: true});
    showFootnote(button, event.detail ? event : undefined);
    fixFootnote();
  });
  button.addEventListener('focus', () => showFootnote(button));
  button.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    showFootnote(button);
    notePopup.querySelector('a')?.focus({preventScroll: true});
  });
  button.addEventListener('focusout', scheduleNoteClose);
}
notePopup.addEventListener('pointerenter', () => clearTimeout(noteCloseTimer));
notePopup.addEventListener('pointerleave', scheduleNoteClose);
notePopup.addEventListener('focusout', scheduleNoteClose);
notePopup.addEventListener('click', event => {
  if (event.target.closest('a')) hideFootnote();
  else fixFootnote();
});
document.addEventListener('pointerdown', event => {
  const trigger = activeFootnote?.closest('.footnote-anchor') || activeFootnote;
  if (!trigger?.contains(event.target) && !notePopup.contains(event.target)) hideFootnote();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (notePopup.contains(document.activeElement)) activeFootnote?.focus({preventScroll: true});
  hideFootnote();
});
document.addEventListener('scroll', event => {
  if (!noteFixed && !notePopup.contains(document.activeElement) && !notePopup.contains(event.target)) hideFootnote();
}, true);
window.addEventListener('resize', hideFootnote);

// Follow citations on hover; a plain click fixes their bibliography preview.
(() => {
  const popup = document.createElement('aside');
  popup.id = 'reference-popup';
  popup.className = 'message footnote-popup reference-popup';
  popup.setAttribute('role', 'note');
  popup.setAttribute('aria-label', 'Reference');
  popup.hidden = true;
  document.body.append(popup);
  let activeLink, closeTimer;
  let fixed = false;

  function citation(target) {
    const link = target.closest?.('a[href^="#ref-"]');
    return link?.closest('.research-blog, #footnote-popup') && !link.closest('.references') ? link : null;
  }
  function hide() {
    clearTimeout(closeTimer);
    if (activeLink) {
      const remaining = (activeLink.getAttribute('aria-describedby') || '')
        .split(/\s+/).filter(id => id && id !== popup.id).join(' ');
      if (remaining) activeLink.setAttribute('aria-describedby', remaining);
      else activeLink.removeAttribute('aria-describedby');
    }
    activeLink = null;
    fixed = false;
    popup.hidden = true;
    popup.style.position = '';
  }
  function show(link, event) {
    clearTimeout(closeTimer);
    if (fixed) return;
    const entry = document.getElementById(link.hash.slice(1));
    if (!entry?.matches('.references li')) { hide(); return; }
    const alreadyOpen = activeLink === link;
    if (!alreadyOpen) {
      hide();
      activeLink = link;
      popup.replaceChildren(...[...entry.childNodes].map(node => node.cloneNode(true)));
      const describedBy = link.getAttribute('aria-describedby');
      link.setAttribute('aria-describedby', [describedBy, popup.id].filter(Boolean).join(' '));
    }
    popup.hidden = false;
    if (event) followMessage(event, popup);
    else if (!alreadyOpen) {
      const anchor = link.getBoundingClientRect();
      followMessage({clientX: anchor.left, clientY: anchor.bottom}, popup);
    }
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (fixed || activeLink?.matches(':hover') || popup.matches(':hover')
          || document.activeElement === activeLink || popup.contains(document.activeElement)) return;
      hide();
    }, 162);
  }
  document.addEventListener('pointerover', event => {
    const link = citation(event.target);
    if (link && !link.contains(event.relatedTarget)) show(link, event);
  });
  document.addEventListener('pointermove', event => {
    if (!fixed && activeLink && citation(event.target) === activeLink) followMessage(event, popup);
  });
  document.addEventListener('pointerout', event => {
    const link = citation(event.target);
    if (link && !link.contains(event.relatedTarget)) scheduleClose();
  });
  document.addEventListener('focusin', event => {
    const link = citation(event.target);
    if (link) show(link);
  });
  document.addEventListener('focusout', event => {
    if (citation(event.target) || popup.contains(event.target)) scheduleClose();
  });
  popup.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  popup.addEventListener('pointerleave', scheduleClose);
  document.addEventListener('pointerdown', event => {
    if (!activeLink?.contains(event.target) && !popup.contains(event.target)) hide();
  });
  document.addEventListener('click', event => {
    const link = citation(event.target);
    if (link) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (activeLink !== link) hide();
      show(link, event.detail ? event : undefined);
      if (!popup.hidden) {
        fixed = true;
        fixMessage(popup);
      }
    } else if (popup.contains(event.target) && event.target.closest('a')) hide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (popup.contains(document.activeElement)) activeLink?.focus({preventScroll: true});
      hide();
    } else if (event.key === 'ArrowDown') {
      const link = citation(event.target);
      if (!link) return;
      event.preventDefault();
      if (activeLink !== link) hide();
      show(link);
      popup.querySelector('a')?.focus({preventScroll: true});
    }
  });
  document.addEventListener('scroll', event => {
    if (!fixed && !popup.contains(event.target) && !popup.contains(document.activeElement)) hide();
  }, true);
  window.addEventListener('resize', () => {
    if (!fixed) { hide(); return; }
    const box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(box.left, document.documentElement.clientWidth - box.width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(box.top, document.documentElement.clientHeight - box.height - 8))}px`;
  });
})();
