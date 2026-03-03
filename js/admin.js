// ============================================
//  ADMIN DASHBOARD — FunPlex Go Karting
// ============================================

import { db } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ── CONFIG ───────────────────────────────────

const ADMIN_PASSWORD = "funplex2026"; // Change this anytime

const PACKAGES = {
  8:  { name: "8 Laps — Rookie Run",  price: 350, duration: 15 },
  13: { name: "13 Laps — Speed Racer", price: 450, duration: 20 },
  18: { name: "18 Laps — Grand Prix",  price: 550, duration: 25 }
};

const KARTS = 3;
const MAX_RIDERS = 12;

function slotsNeeded(riders) {
  return Math.ceil(riders / KARTS);
}

// Generate consecutive slot times starting from a given time
function getWindowSlots(startTime, duration, count) {
  const slots = [];
  let current = timeToMins(startTime);
  for (let i = 0; i < count; i++) {
    slots.push(minsToTime(current));
    current += duration;
  }
  return slots;
}

let autoRefreshInterval = null;

// ── DOM ──────────────────────────────────────

const $ = id => document.getElementById(id);

// ── LOGIN ────────────────────────────────────

$('login-btn').addEventListener('click', tryLogin);
$('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin();
});

function tryLogin() {
  const val = $('login-password').value;
  if (val === ADMIN_PASSWORD) {
    $('login-screen').style.display = 'none';
    $('dashboard').classList.remove('hidden');
    initDashboard();
  } else {
    $('login-error').classList.remove('hidden');
    $('login-password').value = '';
    $('login-password').focus();
  }
}

$('logout-btn').addEventListener('click', () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  $('login-screen').style.display = 'flex';
  $('dashboard').classList.add('hidden');
  $('login-password').value = '';
  $('login-error').classList.add('hidden');
});

// ── INIT ─────────────────────────────────────

async function initDashboard() {
  setDashDate();
  await loadTodayBookings();
  await loadAllBookings();
  startAutoRefresh();
}

function startAutoRefresh() {
  // Clear any existing interval first
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  // Auto-refresh every 60 seconds silently
  autoRefreshInterval = setInterval(async () => {
    await refreshDashboard(true); // silent = true, no loading spinner
  }, 60000);
}

async function refreshDashboard(silent = false) {
  const btn = $('refresh-btn');
  if (btn && !silent) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
  }
  await loadTodayBookings(silent);
  await loadAllBookings(silent);
  if (btn && !silent) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
    // Show last refreshed time
    const now = new Date();
    $('last-refreshed').textContent = `Last refreshed: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (btn) {
    const now = new Date();
    $('last-refreshed').textContent = `Last refreshed: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function setDashDate() {
  const now = new Date();
  $('dash-date').textContent = now.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── TABS ─────────────────────────────────────

document.querySelectorAll('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// ── SEARCH ──────────────────────────────────

const searchInput = $('search-input');
const searchClear = $('search-clear');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', q.length === 0);
  applySearch(q);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  applySearch('');
});

function applySearch(query) {
  const q = query.toLowerCase();

  ['today-list', 'all-list'].forEach(listId => {
    const list     = $(listId);
    const tab      = listId === 'today-list' ? 'today' : 'all';
    const noResult = $(`${tab}-no-results`);
    const empty    = $(`${tab}-empty`);

    const cards = list.querySelectorAll('.booking-card');
    let visibleCount = 0;

    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const match = q === '' || text.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    // Show/hide no results message
    if (cards.length > 0) {
      noResult.classList.toggle('hidden', visibleCount > 0 || q === '');
      empty.classList.toggle('hidden', !(cards.length === 0 && q === ''));
    }
  });
}

// ── DATE FILTER ─────────────────────────────

const filterFrom  = $('filter-from');
const filterTo    = $('filter-to');
const filterClear = $('filter-clear');

filterFrom.addEventListener('change', applyDateFilter);
filterTo.addEventListener('change', applyDateFilter);

filterClear.addEventListener('click', () => {
  filterFrom.value = '';
  filterTo.value   = '';
  applyDateFilter();
});

function applyDateFilter() {
  const from  = filterFrom.value;
  const to    = filterTo.value;
  const list  = $('all-list');
  const empty = $('all-empty');
  const noRes = $('all-no-results');
  const cards = list.querySelectorAll('.booking-card');
  let visible = 0;

  cards.forEach(card => {
    const cardDate = card.dataset.date || '';
    let show = true;
    if (from && cardDate < from) show = false;
    if (to   && cardDate > to)   show = false;
    // Also respect active search query
    const q = $('search-input').value.trim().toLowerCase();
    if (q && !card.textContent.toLowerCase().includes(q)) show = false;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  noRes.classList.toggle('hidden', visible > 0 || (cards.length === 0));
  empty.classList.toggle('hidden', cards.length > 0);
}

// ── LOAD TODAY'S BOOKINGS ────────────────────

async function loadTodayBookings(silent = false) {
  const list    = $('today-list');
  const loading = $('today-loading');
  const empty   = $('today-empty');

  // Always clear list to prevent duplicates on refresh
  list.innerHTML = '';
  empty.classList.add('hidden');
  if (!silent) loading.style.display = 'flex';

  try {
    const q    = query(collection(db, 'bookings'), where('date', '==', todayStr()));
    const snap = await getDocs(q);
    const bookings = [];
    snap.forEach(d => bookings.push(d.data()));

    // Sort by time descending — latest first
    bookings.sort((a, b) => b.time.localeCompare(a.time));

    loading.style.display = 'none';

    if (bookings.length === 0) {
      empty.classList.remove('hidden');
    } else {
      bookings.forEach(b => list.appendChild(createBookingCard(b)));
    }

    updateStats(bookings);

  } catch (e) {
    console.error(e);
    loading.style.display = 'none';
    list.innerHTML = '<p style="color:var(--gray); font-family:Rajdhani,sans-serif; padding:20px 0;">Error loading bookings.</p>';
  }
}

// ── LOAD ALL BOOKINGS ────────────────────────

async function loadAllBookings(silent = false) {
  const list    = $('all-list');
  const loading = $('all-loading');
  const empty   = $('all-empty');

  // Always clear list to prevent duplicates on refresh
  list.innerHTML = '';
  empty.classList.add('hidden');
  if (!silent) loading.style.display = 'flex';

  try {
    const snap = await getDocs(collection(db, 'bookings'));
    const bookings = [];
    snap.forEach(d => bookings.push(d.data()));

    // Sort by date desc, then time desc — latest first
    bookings.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.time.localeCompare(a.time);
    });

    loading.style.display = 'none';

    if (bookings.length === 0) {
      empty.classList.remove('hidden');
    } else {
      bookings.forEach(b => list.appendChild(createBookingCard(b)));
    }

    // Total bookings stat
    $('stat-total').textContent = bookings.length;

    // Re-apply date filter and search after reload
    applyDateFilter();
    const q = $('search-input').value.trim();
    if (q) applySearch(q);

  } catch (e) {
    console.error(e);
    loading.style.display = 'none';
  }
}

// ── UPDATE STATS ─────────────────────────────

function updateStats(todayBookings) {
  const confirmed  = todayBookings.filter(b => b.status !== 'cancelled');
  // Revenue only counts completed bookings — payment collected at venue
  const revenue    = confirmed
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.total || 0), 0);
  const riders     = confirmed.reduce((sum, b) => sum + (b.riders || 0), 0);

  $('stat-today').textContent   = confirmed.length;
  $('stat-revenue').textContent = `₹${revenue}`;
  $('stat-riders').textContent  = riders;
}

// ── CREATE BOOKING CARD ──────────────────────

function createBookingCard(b) {
  const isWalkin    = b.walkin === true;
  const isCompleted = b.status === 'completed';

  const card = document.createElement('div');
  card.className = `booking-card${isCompleted ? ' completed' : ''}${isWalkin ? ' walkin' : ''}`;
  card.id = `card-${b.bookingId}`;
  card.dataset.date = b.date;

  card.innerHTML = `
    <div>
      <div class="booking-top">
        <div>
          <div class="booking-id">${b.bookingId}</div>
          <div class="booking-name">${b.name}</div>
        </div>
        <div class="booking-badges">
          ${isWalkin ? '<span class="badge badge-walkin">Walk-in</span>' : ''}
          <span class="badge ${isCompleted ? 'badge-completed' : 'badge-confirmed'}">
            ${isCompleted ? 'Completed' : 'Confirmed'}
          </span>
        </div>
      </div>

      <div class="booking-details" style="margin-top:12px;">
        <div class="booking-detail">
          <span class="booking-detail-label">Package</span>
          <span class="booking-detail-value">${b.package}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Date</span>
          <span class="booking-detail-value">${formatDate(b.date)}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Time</span>
          <span class="booking-detail-value">${b.timeEnd ? `${formatTime(b.time)} – ${formatTime(b.timeEnd)}` : `${formatTime(b.time)} – ${formatTime(minsToTime(timeToMins(b.time) + (PACKAGES[Object.keys(PACKAGES).find(k => PACKAGES[k].name === b.package)]?.duration || 15)))}`}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Riders</span>
          <span class="booking-detail-value">${b.riders}</span>
        </div>
        ${b.phone ? `<div class="booking-detail">
          <span class="booking-detail-label">Phone</span>
          <span class="booking-detail-value">${b.phone}</span>
        </div>` : ''}
        <div class="booking-detail">
          <span class="booking-detail-label">Total</span>
          <span class="booking-detail-value booking-total">₹${b.total}</span>
        </div>
      </div>
    </div>

    <div class="booking-actions" style="margin-top:14px;">
      <a href="tel:${b.phone}" class="action-btn btn-call">
        <i class="fa-solid fa-phone"></i> Call
      </a>
      <button class="action-btn ${isCompleted ? 'btn-undo' : 'btn-complete'}" id="complete-${b.bookingId}">
        <i class="fa-solid ${isCompleted ? 'fa-rotate-left' : 'fa-flag-checkered'}"></i>
        ${isCompleted ? 'Undo' : 'Mark Complete'}
      </button>
    </div>
  `;

  // Mark complete / undo — single handler via data-state
  const completeBtn = card.querySelector(`#complete-${b.bookingId}`);
  if (completeBtn) {
    completeBtn.dataset.state = isCompleted ? 'completed' : 'confirmed';
    completeBtn.addEventListener('click', () => toggleComplete(b.bookingId, card, completeBtn));
  }

  return card;
}

// ── MARK COMPLETE & UNDO ─────────────────────
// Uses data-state attribute to track status — no replaceWith needed

async function toggleComplete(bookingId, card, btn) {
  const isCompleted = btn.dataset.state === 'completed';
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    if (isCompleted) {
      // UNDO — set back to confirmed
      await updateDoc(doc(db, 'bookings', bookingId), { status: 'confirmed' });
      card.classList.remove('completed');
      btn.dataset.state = 'confirmed';
      btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Mark Complete';
      btn.classList.remove('btn-undo');
      btn.classList.add('btn-complete');
      const badge = card.querySelector('.badge-completed');
      if (badge) { badge.className = 'badge badge-confirmed'; badge.textContent = 'Confirmed'; }
    } else {
      // COMPLETE
      await updateDoc(doc(db, 'bookings', bookingId), { status: 'completed' });
      card.classList.add('completed');
      btn.dataset.state = 'completed';
      btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo';
      btn.classList.remove('btn-complete');
      btn.classList.add('btn-undo');
      const badge = card.querySelector('.badge-confirmed');
      if (badge) { badge.className = 'badge badge-completed'; badge.textContent = 'Completed'; }
    }
    btn.disabled = false;

    // Update revenue stat immediately without waiting for refresh
    const allCards = document.querySelectorAll('#today-list .booking-card');
    const todayBookings = [];
    allCards.forEach(c => {
      todayBookings.push({
        status: c.querySelector('.badge-completed') ? 'completed' : 'confirmed',
        total:  parseInt(c.querySelector('.booking-total')?.textContent?.replace('₹','') || 0),
        riders: parseInt(c.querySelector('.booking-detail-value')?.textContent || 0)
      });
    });
    // Re-read from Firebase for accurate stats
    const q    = query(collection(db, 'bookings'), where('date', '==', todayStr()));
    const snap = await getDocs(q);
    const fresh = [];
    snap.forEach(d => fresh.push(d.data()));
    updateStats(fresh);

  } catch (e) {
    console.error(e);
    btn.disabled = false;
    btn.innerHTML = isCompleted
      ? '<i class="fa-solid fa-rotate-left"></i> Undo'
      : '<i class="fa-solid fa-flag-checkered"></i> Mark Complete';
  }
}

// ── WALK-IN MODAL ────────────────────────────

$('add-walkin-btn').addEventListener('click', openWalkinModal);
$('refresh-btn').addEventListener('click', () => refreshDashboard(false));
$('modal-close').addEventListener('click', closeWalkinModal);
$('modal-cancel').addEventListener('click', closeWalkinModal);

// Set default date to today
const wiDate = $('wi-date');
wiDate.value = todayStr();
wiDate.min   = todayStr();

// When date changes, update min time for today
wiDate.addEventListener('change', updateMinTime);

function updateMinTime() {
  const wiTime = $('wi-time');
  if ($('wi-date').value === todayStr()) {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    wiTime.min = `${hh}:${mm}`;
    // Clear time if already selected and now in the past
    if (wiTime.value && wiTime.value < `${hh}:${mm}`) wiTime.value = '';
  } else {
    wiTime.min = ''; // Future dates — no restriction
  }
}

// Auto-calculate total
$('wi-package').addEventListener('change', updateWalkinTotal);
$('wi-riders').addEventListener('change', updateWalkinTotal);

function updateWalkinTotal() {
  const pkg    = parseInt($('wi-package').value);
  const riders = parseInt($('wi-riders').value);
  if (pkg && riders) {
    const price = PACKAGES[pkg].price;
    $('walkin-total').textContent = `Total: ₹${price * riders}`;
  } else {
    $('walkin-total').textContent = '';
  }
}

function openWalkinModal() {
  $('walkin-modal').classList.remove('hidden');
  $('wi-name').focus();
  // Reset form
  $('wi-name').value    = '';
  $('wi-phone').value   = '';
  $('wi-package').value = '';
  $('wi-riders').value  = '1';
  $('wi-date').value    = todayStr();
  $('wi-time').value    = '';
  $('wi-payment').value = 'Cash';
  $('walkin-total').textContent = '';
  $('modal-error').classList.add('hidden');
  // Apply time restriction for today
  updateMinTime();
}

function closeWalkinModal() {
  $('walkin-modal').classList.add('hidden');
}

// Close on overlay click
$('walkin-modal').addEventListener('click', e => {
  if (e.target === $('walkin-modal')) closeWalkinModal();
});

$('modal-submit').addEventListener('click', async () => {
  const name    = $('wi-name').value.trim();
  const phone   = $('wi-phone').value.trim();
  const pkg     = parseInt($('wi-package').value);
  const date    = $('wi-date').value;
  const time    = $('wi-time').value;
  const riders  = parseInt($('wi-riders').value);
  const payment = $('wi-payment').value;

  // Validate
  if (!name)  return showModalError('Please enter customer name.');
  if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g,'')))
    return showModalError('Please enter a valid 10-digit phone number.');
  if (!pkg)   return showModalError('Please select a package.');
  if (!date)  return showModalError('Please select a date.');
  if (!time)  return showModalError('Please select a time.');

  // Check if selected time is in the past for today
  if (date === todayStr()) {
    const now     = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [h, m]  = time.split(':').map(Number);
    const selMins = h * 60 + m;
    if (selMins <= nowMins) {
      return showModalError('Selected time has already passed. Please choose a future time.');
    }
  }

  $('modal-submit').disabled = true;
  $('modal-submit').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const pkgData   = PACKAGES[pkg];
    const total     = pkgData.price * riders;
    const bookingId = `FP-WI-${Date.now()}`;
    const needed    = slotsNeeded(riders);
    const windowSlots = getWindowSlots(time, pkgData.duration, needed);
    const timeEnd   = minsToTime(timeToMins(windowSlots[windowSlots.length - 1]) + pkgData.duration);

    // Save booking
    await setDoc(doc(db, 'bookings', bookingId), {
      bookingId,
      name,
      phone,
      email:    '',
      package:  pkgData.name,
      date,
      time,
      timeEnd,
      windowSlots,
      riders,
      pricePerRider: pkgData.price,
      total,
      paymentMethod: payment,
      walkin:   true,
      status:   'confirmed',
      createdAt: new Date().toISOString()
    });

    // Block all slots in the window
    for (const slotTime of windowSlots) {
      await setDoc(doc(db, 'slots', `${date}_${slotTime}`), {
        date,
        time:     slotTime,
        duration: pkgData.duration,
        package:  pkgData.name,
        booked:   true
      });
    }

    closeWalkinModal();
    $('modal-submit').disabled = false;
    $('modal-submit').innerHTML = '<i class="fa-solid fa-plus"></i> Confirm Walk-in';

    // Refresh lists
    await loadTodayBookings();
    await loadAllBookings();

  } catch (e) {
    console.error(e);
    showModalError('Something went wrong. Please try again.');
    $('modal-submit').disabled = false;
    $('modal-submit').innerHTML = '<i class="fa-solid fa-plus"></i> Confirm Walk-in';
  }
});

function showModalError(msg) {
  $('modal-error-msg').textContent = msg;
  $('modal-error').classList.remove('hidden');
}

// ── HELPERS ──────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(time) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12    = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function timeToMins(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}