// ---- SMOOTH SCROLL for nav links ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      closeMobileMenu();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---- NAV: add shadow on scroll ----
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    nav.style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)';
  } else {
    nav.style.boxShadow = 'none';
  }
});

// ---- HAMBURGER MENU ----
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const menuOverlay = document.getElementById('menuOverlay');
const mobileMenuClose = document.getElementById('mobileMenuClose');

function openMobileMenu() {
  hamburger.classList.add('open');
  hamburger.setAttribute('aria-expanded', 'true');
  mobileMenu.classList.add('open');
  menuOverlay.classList.add('open');
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeMobileMenu() {
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  mobileMenu.classList.remove('open');
  menuOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

hamburger.addEventListener('click', () => {
  if (mobileMenu.classList.contains('open')) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
});

// Close on overlay click
menuOverlay.addEventListener('click', closeMobileMenu);

// Close button inside drawer
mobileMenuClose.addEventListener('click', closeMobileMenu);

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileMenu();
});

// ---- SCROLL REVEAL (fade-up on scroll) ----
// Only hide elements if JS is running — no-js users see them immediately
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.rate-card, .stat-item, .info-card, .map-detail').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  revealObserver.observe(el);
});

// ---- STAT COUNTER ANIMATION ----
const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounters();
      statObserver.disconnect();
    }
  });
}, { threshold: 0.5 });

const statsStrip = document.querySelector('.stats-strip');
if (statsStrip) statObserver.observe(statsStrip);

function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const text = el.textContent.trim();
    const numMatch = text.match(/[\d.]+/);
    if (!numMatch) return;
    const end = parseFloat(numMatch[0]);
    const suffix = text.replace(numMatch[0], '');
    const duration = 1200;
    const startTime = performance.now();
    const isInt = Number.isInteger(end);
    // Store original so we can restore if animation fails
    const original = el.textContent;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * end;
      el.textContent = (isInt ? Math.floor(current) : current.toFixed(1)) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = original; // restore exact original text (e.g. "7yrs+")
      }
    }
    requestAnimationFrame(step);
  });
}

// ---- GALLERY INFINITE CAROUSEL ----
(function () {
  const carousel = document.getElementById('galleryCarousel');
  const prevBtn = document.getElementById('galleryPrev');
  const nextBtn = document.getElementById('galleryNext');
  const dotsContainer = document.getElementById('galleryDots');
  if (!carousel) return;

  const originalItems = Array.from(carousel.querySelectorAll('.gallery-item'));
  const total = originalItems.length;

  // Clone items before and after for infinite effect
  originalItems.forEach(item => {
    carousel.appendChild(item.cloneNode(true));
  });
  originalItems.slice().reverse().forEach(item => {
    carousel.insertBefore(item.cloneNode(true), carousel.firstChild);
  });

  const allItems = Array.from(carousel.querySelectorAll('.gallery-item'));
  let currentIndex = total; // start at first real item (after clones)
  let isScrolling = false;

  function getItemWidth() {
    return allItems[0].offsetWidth + parseInt(getComputedStyle(carousel).gap || 12);
  }

  function jumpTo(index, animate) {
    carousel.style.scrollBehavior = animate ? 'smooth' : 'auto';
    carousel.scrollLeft = index * getItemWidth() - 20;
  }

  // Init: jump to real start without animation
  window.addEventListener('load', () => jumpTo(currentIndex, false));
  jumpTo(currentIndex, false);

  function next() {
    if (isScrolling) return;
    isScrolling = true;
    currentIndex++;
    jumpTo(currentIndex, true);
    updateDots();
    setTimeout(() => {
      if (currentIndex >= total * 2) {
        currentIndex = total;
        jumpTo(currentIndex, false);
      }
      isScrolling = false;
    }, 400);
  }

  function prev() {
    if (isScrolling) return;
    isScrolling = true;
    currentIndex--;
    jumpTo(currentIndex, true);
    updateDots();
    setTimeout(() => {
      if (currentIndex < total) {
        currentIndex = total * 2 - 1;
        jumpTo(currentIndex, false);
      }
      isScrolling = false;
    }, 400);
  }

  if (nextBtn) nextBtn.addEventListener('click', next);
  if (prevBtn) prevBtn.addEventListener('click', prev);

  // Remove disabled state — infinite carousel never runs out
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;

  // Build dots (one per original image)
  originalItems.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('gallery-dot');
    dot.setAttribute('aria-label', `Go to image ${i + 1}`);
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => {
      currentIndex = total + i;
      jumpTo(currentIndex, true);
      updateDots();
    });
    dotsContainer.appendChild(dot);
  });

  function updateDots() {
    const realIndex = ((currentIndex - total) % total + total) % total;
    document.querySelectorAll('.gallery-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === realIndex);
    });
  }

  // Touch/swipe support
  let touchStartX = 0;
  carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
  });

  // Mouse drag support
  let isDragging = false, dragStartX = 0;
  carousel.addEventListener('mousedown', e => { isDragging = true; dragStartX = e.pageX; });
  window.addEventListener('mousemove', e => { if (isDragging) e.preventDefault(); });
  window.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = dragStartX - e.pageX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
  });

  // Auto-play every 4 seconds
  let autoPlay = setInterval(next, 4000);
  carousel.addEventListener('mouseenter', () => clearInterval(autoPlay));
  carousel.addEventListener('mouseleave', () => { autoPlay = setInterval(next, 4000); });
})();
const sections = document.querySelectorAll('section[id], div[id]');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 80;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });
  navLinks.forEach(link => {
    link.style.color = '';
    if (link.getAttribute('href') === '#' + current) {
      link.style.color = 'var(--blue)';
    }
  });
});