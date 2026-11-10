// An image that won't load would show as an empty framed box: offline, the
// service worker keeps only Meetup photos, and a group's own site can take
// an image down. Take the box away instead, the way the page looks when
// there was never an image. A group logo (data-mono) becomes its monogram
// tile, like a group with no logo; an event photo leaves its card without
// one. The image itself is never changed, only removed.
// Imported by Layout.astro and tv.astro (whose bare layout skips Layout's script).
function drop(img) {
  if (img.dataset.mono) {
    const tile = document.createElement('span');
    tile.className = `${img.className} logo-mono`;
    tile.setAttribute('aria-hidden', 'true');
    tile.textContent = img.dataset.mono;
    img.replaceWith(tile);
    return;
  }
  img.closest('.show')?.classList.remove('has-photo');
  (img.closest('.photo') ?? img).remove();
}

// Errors don't bubble, so listen while they travel down (capture). That
// also covers cards app.js adds later (the day panel, search).
document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement) drop(e.target); }, true);
// Any that failed before this script ran.
for (const img of document.images) if (img.complete && img.currentSrc && !img.naturalWidth) drop(img);
