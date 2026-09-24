// Progressive enhancement: content remains usable without motion or observers.
export function initExperience(root = document) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = root.querySelector('.header');
  if (header && 'IntersectionObserver' in window) {
    const marker = document.createElement('div');
    marker.className = 'header-marker';
    marker.setAttribute('aria-hidden', 'true');
    header.before(marker);
    new IntersectionObserver(([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting)).observe(marker);
  }
  if (reduced.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, {threshold: .08, rootMargin: '0px 0px -30px 0px'});
  root.querySelectorAll('.section-heading,.editorial-photo,.editorial .step-row,.story-band .copy,.social-grid a,.journey-strip').forEach((node, index) => {
    if (node.getBoundingClientRect().top < innerHeight) return;
    node.classList.add('scroll-reveal');
    node.style.setProperty('--reveal-delay', `${(index % 3) * 65}ms`);
    observer.observe(node);
  });
  reduced.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    root.querySelectorAll('.scroll-reveal').forEach(node => node.classList.add('is-visible'));
  }, {once: true});
}
