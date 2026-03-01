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
  where
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ── CONFIG ───────────────────────────────────

const ADMIN_PASSWORD = "funplex2026";

const PACKAGES = {
  8:  { name: "8 Laps — Rookie Run",  price: 350, duration: 15 },
  13: { name: "13 Laps — Speed Racer", price: 450, duration: 20 },
  18: { name: "18 Laps — Grand Prix",  price: 550, duration: 25 }
};

let autoRefreshInterval = null;

// ── DOM SAFE GETTER ──────────────────────────

const $ = id => {
  const el = document.getElementById(id);
  if (!el) console.warn(`Element #${id} not found`);
  return el;
};

// ── LOGIN ────────────────────────────────────

const loginBtn = $('login-btn');
const loginPassword = $('login-password');
const loginError = $('login-error');
const loginScreen = $('login-screen');
const dashboard = $('dashboard');
const logoutBtn = $('logout-btn');

if (loginBtn) loginBtn.addEventListener('click', tryLogin);
if (loginPassword) {
  loginPassword.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
}

function tryLogin() {
  if (!loginPassword) return;
  const val = loginPassword.value.trim();
  if (val === ADMIN_PASSWORD) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboard) dashboard.classList.remove('hidden');
    initDashboard();
  } else {
    if (loginError) loginError.classList.remove('hidden');
    if (loginPassword) loginPassword.value = '';
    if (loginPassword) loginPassword.focus();
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboard) dashboard.classList.add('hidden');
    if (loginPassword) loginPassword.value = '';
    if (loginError) loginError.classList.add('hidden');
  });
}

// ── INIT ─────────────────────────────────────

async function initDashboard() {
  setDashDate();
  await loadTodayBookings();
  await loadAllBookings();
  startAutoRefresh();
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    await refreshDashboard(true);
  }, 60000);
}

async function refreshDashboard(silent = false) {
  await loadTodayBookings(silent);
  await loadAllBookings(silent);
}

function setDashDate() {
  const dashDate = $('dash-date');
  if (!dashDate) return;
  const now = new Date();
  dashDate.textContent = now.toLocaleDateString('en-IN', {
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
    const tabName = tab.dataset.tab;
    if (!tabName) return;
    
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    
    tab.classList.add('active');
    const tabContent = $(`tab-${tabName}`);
    if (tabContent) tabContent.classList.remove('hidden');
  });
});

// ── LOAD TODAY'S BOOKINGS ────────────────────

async function loadTodayBookings(silent = false) {
  const list = $('today-list');
  const loading = $('today-loading');
  const empty = $('today-empty');

  if (!list || !loading || !empty) return;

  list.innerHTML = '';
  empty.classList.add('hidden');
  if (!silent) loading.style.display = 'flex';

  try {
    const q = query(collection(db, 'bookings'), where('date', '==', todayStr()));
    const snap = await getDocs(q);
    const bookings = [];
    
    snap.forEach(d => {
      const data = d.data();
      if (data) bookings.push(data);
    });

    bookings.sort((a, b) => b.time.localeCompare(a.time));

    loading.style.display = 'none';

    if (bookings.length === 0) {
      empty.classList.remove('hidden');
    } else {
      bookings.forEach(b => {
        const card = createBookingCard(b);
        if (card) list.appendChild(card);
      });
    }

    updateStats(bookings);
    
  } catch (e) {
    console.error('Error loading today bookings:', e);
    loading.style.display = 'none';
    list.innerHTML = '<p style="color:var(--gray); font-family:Rajdhani,sans-serif; padding:20px 0;">Error loading bookings.</p>';
  }
}

// ── LOAD ALL BOOKINGS ────────────────────────

async function loadAllBookings(silent = false) {
  const list = $('all-list');
  const loading = $('all-loading');
  const empty = $('all-empty');

  if (!list || !loading || !empty) return;

  list.innerHTML = '';
  empty.classList.add('hidden');
  if (!silent) loading.style.display = 'flex';

  try {
    const snap = await getDocs(collection(db, 'bookings'));
    const bookings = [];
    
    snap.forEach(d => {
      const data = d.data();
      if (data) bookings.push(data);
    });

    bookings.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.time.localeCompare(a.time);
    });

    loading.style.display = 'none';

    if (bookings.length === 0) {
      empty.classList.remove('hidden');
    } else {
      bookings.forEach(b => {
        const card = createBookingCard(b);
        if (card) list.appendChild(card);
      });
    }

    const statTotal = $('stat-total');
    if (statTotal) statTotal.textContent = bookings.length;
    
  } catch (e) {
    console.error('Error loading all bookings:', e);
    loading.style.display = 'none';
  }
}

// ── UPDATE STATS ─────────────────────────────

function updateStats(todayBookings) {
  const confirmed = todayBookings.filter(b => b.status !== 'cancelled');
  const revenue = confirmed.reduce((sum, b) => sum + (b.total || 0), 0);
  const riders = confirmed.reduce((sum, b) => sum + (b.riders || 0), 0);

  const statToday = $('stat-today');
  const statRevenue = $('stat-revenue');
  const statRiders = $('stat-riders');

  if (statToday) statToday.textContent = confirmed.length;
  if (statRevenue) statRevenue.textContent = `₹${revenue}`;
  if (statRiders) statRiders.textContent = riders;
}

// ── CREATE BOOKING CARD ──────────────────────

function createBookingCard(b) {
  if (!b || !b.bookingId) return null;

  const isWalkin = b.walkin === true;
  const isCompleted = b.status === 'completed';

  const card = document.createElement('div');
  card.className = `booking-card${isCompleted ? ' completed' : ''}${isWalkin ? ' walkin' : ''}`;
  card.id = `card-${b.bookingId}`;

  card.innerHTML = `
    <div>
      <div class="booking-top">
        <div>
          <div class="booking-id">${sanitize(b.bookingId)}</div>
          <div class="booking-name">${sanitize(b.name)}</div>
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
          <span class="booking-detail-value">${sanitize(b.package)}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Date</span>
          <span class="booking-detail-value">${formatDate(b.date)}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Time</span>
          <span class="booking-detail-value">${formatTime(b.time)}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Riders</span>
          <span class="booking-detail-value">${b.riders || 0}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Total</span>
          <span class="booking-detail-value booking-total">₹${b.total || 0}</span>
        </div>
      </div>
    </div>

    <div class="booking-actions" style="margin-top:14px;">
      <a href="tel:${sanitize(b.phone)}" class="action-btn btn-call">
        <i class="fa-solid fa-phone"></i> ${sanitize(b.phone)}
      </a>
      <button class="action-btn ${isCompleted ? 'btn-undo' : 'btn-complete'}" id="complete-${b.bookingId}">
        <i class="fa-solid ${isCompleted ? 'fa-rotate-left' : 'fa-flag-checkered'}"></i>
        ${isCompleted ? 'Undo' : 'Mark Complete'}
      </button>
    </div>
  `;

  const completeBtn = card.querySelector(`#complete-${b.bookingId}`);
  if (completeBtn) {
    completeBtn.addEventListener('click', () => toggleComplete(b.bookingId, card, isCompleted));
  }

  return card;
}

// ── TOGGLE COMPLETE ─────────────────────────

async function toggleComplete(bookingId, card, currentlyCompleted) {
  if (!card) return;

  const btn = card.querySelector(`#complete-${bookingId}`);
  if (!btn) return;

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const newStatus = currentlyCompleted ? 'confirmed' : 'completed';
    await updateDoc(doc(db, 'bookings', bookingId), { status: newStatus });

    if (currentlyCompleted) {
      // Undo — back to confirmed
      card.classList.remove('completed');
      btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Mark Complete';
      btn.classList.remove('btn-undo');
      btn.classList.add('btn-complete');
      const badge = card.querySelector('.badge-completed');
      if (badge) {
        badge.className = 'badge badge-confirmed';
        badge.textContent = 'Confirmed';
      }
    } else {
      // Complete
      card.classList.add('completed');
      btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo';
      btn.classList.remove('btn-complete');
      btn.classList.add('btn-undo');
      const badge = card.querySelector('.badge-confirmed');
      if (badge) {
        badge.className = 'badge badge-completed';
        badge.textContent = 'Completed';
      }
    }

    btn.disabled = false;
  } catch (e) {
    console.error('Error toggling complete:', e);
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// ── WALK-IN MODAL ────────────────────────────

const addWalkinBtn = $('add-walkin-btn');
const modalClose = $('modal-close');
const modalCancel = $('modal-cancel');
const walkinModal = $('walkin-modal');
const modalSubmit = $('modal-submit');
const wiDate = $('wi-date');
const wiPackage = $('wi-package');
const wiRiders = $('wi-riders');

if (addWalkinBtn) addWalkinBtn.addEventListener('click', openWalkinModal);
if (modalClose) modalClose.addEventListener('click', closeWalkinModal);
if (modalCancel) modalCancel.addEventListener('click', closeWalkinModal);

if (wiDate) {
  wiDate.value = todayStr();
  wiDate.min = todayStr();
  wiDate.addEventListener('change', updateMinTime);
}

function updateMinTime() {
  const wiTime = $('wi-time');
  if (!wiDate || !wiTime) return;

  if (wiDate.value === todayStr()) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    wiTime.min = `${hh}:${mm}`;
    if (wiTime.value && wiTime.value < `${hh}:${mm}`) {
      wiTime.value = '';
    }
  } else {
    wiTime.min = '';
  }
}

if (wiPackage) wiPackage.addEventListener('change', updateWalkinTotal);
if (wiRiders) wiRiders.addEventListener('change', updateWalkinTotal);

function updateWalkinTotal() {
  if (!wiPackage || !wiRiders) return;

  const pkg = parseInt(wiPackage.value);
  const riders = parseInt(wiRiders.value);
  const walkinTotal = $('walkin-total');

  if (walkinTotal) {
    if (pkg && riders) {
      const price = PACKAGES[pkg]?.price || 0;
      walkinTotal.textContent = `Total: ₹${price * riders}`;
    } else {
      walkinTotal.textContent = '';
    }
  }
}

function openWalkinModal() {
  const wiName = $('wi-name');
  const wiPhone = $('wi-phone');
  const wiPayment = $('wi-payment');
  const modalError = $('modal-error');

  if (walkinModal) walkinModal.classList.remove('hidden');
  if (wiName) {
    wiName.value = '';
    wiName.focus();
  }
  if (wiPhone) wiPhone.value = '';
  if (wiPackage) wiPackage.value = '';
  if (wiRiders) wiRiders.value = '1';
  if (wiDate) wiDate.value = todayStr();
  const wiTime = $('wi-time');
  if (wiTime) wiTime.value = '';
  if (wiPayment) wiPayment.value = 'Cash';

  const walkinTotalEl = $('walkin-total');
  if (walkinTotalEl) walkinTotalEl.textContent = '';

  if (modalError) modalError.classList.add('hidden');

  updateMinTime();
}

function closeWalkinModal() {
  if (walkinModal) walkinModal.classList.add('hidden');
}

if (walkinModal) {
  walkinModal.addEventListener('click', e => {
    if (e.target === walkinModal) closeWalkinModal();
  });
}

if (modalSubmit) {
  modalSubmit.addEventListener('click', submitWalkinBooking);
}

async function submitWalkinBooking() {
  const wiName = $('wi-name');
  const wiPhone = $('wi-phone');
  const wiTime = $('wi-time');

  const name = wiName?.value.trim() || '';
  const phone = wiPhone?.value.trim() || '';
  const pkg = parseInt(wiPackage?.value || '0');
  const date = wiDate?.value || '';
  const time = wiTime?.value || '';
  const riders = parseInt(wiRiders?.value || '1');
  const payment = $('wi-payment')?.value || 'Cash';

  if (!name) return showModalError('Please enter customer name.');
  if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
    return showModalError('Please enter a valid 10-digit phone number.');
  }
  if (!pkg) return showModalError('Please select a package.');
  if (!date) return showModalError('Please select a date.');
  if (!time) return showModalError('Please select a time.');

  if (date === todayStr()) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [h, m] = time.split(':').map(Number);
    const selMins = h * 60 + m;
    if (selMins <= nowMins) {
      return showModalError('Selected time has already passed.');
    }
  }

  if (modalSubmit) {
    modalSubmit.disabled = true;
    modalSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  }

  try {
    const pkgData = PACKAGES[pkg];
    if (!pkgData) throw new Error('Invalid package');

    const total = pkgData.price * riders;
    const bookingId = `FP-WI-${Date.now()}`;
    const slotId = `${date}_${time}`;

    await setDoc(doc(db, 'bookings', bookingId), {
      bookingId,
      name,
      phone,
      email: '',
      package: pkgData.name,
      date,
      time,
      riders,
      pricePerRider: pkgData.price,
      total,
      paymentMethod: payment,
      walkin: true,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    });

    await setDoc(doc(db, 'slots', slotId), {
      date,
      time,
      duration: pkgData.duration,
      package: pkgData.name,
      booked: true
    });

    closeWalkinModal();
    if (modalSubmit) {
      modalSubmit.disabled = false;
      modalSubmit.innerHTML = '<i class="fa-solid fa-plus"></i> Confirm Walk-in';
    }

    await loadTodayBookings();
    await loadAllBookings();

  } catch (e) {
    console.error('Error submitting walk-in:', e);
    showModalError('Something went wrong. Please try again.');
    if (modalSubmit) {
      modalSubmit.disabled = false;
      modalSubmit.innerHTML = '<i class="fa-solid fa-plus"></i> Confirm Walk-in';
    }
  }
}

function showModalError(msg) {
  const modalErrorMsg = $('modal-error-msg');
  const modalError = $('modal-error');
  if (modalErrorMsg) modalErrorMsg.textContent = msg;
  if (modalError) modalError.classList.remove('hidden');
}

// ── HELPERS ──────────────────────────────────

function sanitize(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(time) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

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
  const confirmed = todayBookings.filter(b => b.status !== 'cancelled');

  // Revenue only counts actually received payments:
  // 1. Paid Online (Razorpay)
  // 2. Walk-ins (always paid at venue — cash/UPI)
  // 3. Pay at Venue — only after marked as completed AND collected
  const revenue = confirmed.reduce((sum, b) => {
    const isPaidOnline    = b.paymentStatus === 'paid';
    const isWalkin        = b.walkin === true;
    const isCollected     = b.paymentStatus === 'collected' && b.status === 'completed';
    if (isPaidOnline || isWalkin || isCollected) {
      return sum + (b.total || 0);
    }
    return sum;
  }, 0);

  const riders = confirmed.reduce((sum, b) => sum + (b.riders || 0), 0);

  $('stat-today').textContent   = confirmed.length;
  $('stat-revenue').textContent = `₹${revenue}`;
  $('stat-riders').textContent  = riders;
}

// ── CREATE BOOKING CARD ──────────────────────

function createBookingCard(b) {
  const isWalkin        = b.walkin === true;
  const isCompleted     = b.status === 'completed';
  const isPaidOnline    = b.paymentStatus === 'paid';
  const isPayAtVenue    = b.paymentMethod === 'Pay at Venue';
  const isVenueCollected = b.paymentStatus === 'collected';

  // Payment badge
  let paymentBadge = '';
  if (isWalkin) {
    // Walk-ins: show payment method (Cash/UPI) — always collected
    paymentBadge = `<span class="badge badge-payment-collected"><i class="fa-solid fa-check"></i> ${b.paymentMethod || 'Cash'}</span>`;
  } else if (isPaidOnline) {
    paymentBadge = `<span class="badge badge-payment-paid"><i class="fa-solid fa-circle-check"></i> Paid Online</span>`;
  } else if (isVenueCollected) {
    paymentBadge = `<span class="badge badge-payment-collected"><i class="fa-solid fa-check"></i> Collected</span>`;
  } else if (isPayAtVenue) {
    paymentBadge = `<span class="badge badge-payment-venue"><i class="fa-solid fa-clock"></i> Pay at Venue</span>`;
  }

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
          ${paymentBadge}
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
          <span class="booking-detail-value">${formatTime(b.time)}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Riders</span>
          <span class="booking-detail-value">${b.riders}</span>
        </div>
        <div class="booking-detail">
          <span class="booking-detail-label">Total</span>
          <span class="booking-detail-value booking-total">₹${b.total}</span>
        </div>
      </div>
    </div>

    <div class="booking-actions" style="margin-top:14px;">
      <a href="tel:${b.phone}" class="action-btn btn-call">
        <i class="fa-solid fa-phone"></i> ${b.phone}
      </a>
      ${isPayAtVenue && !isVenueCollected ? `
        <button class="action-btn btn-collect" id="collect-${b.bookingId}">
          <i class="fa-solid fa-money-bill"></i> Mark Collected
        </button>
      ` : ''}
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

  // Mark collected button — only for Pay at Venue bookings not yet collected
  const collectBtn = card.querySelector(`#collect-${b.bookingId}`);
  if (collectBtn) {
    collectBtn.addEventListener('click', () => markCollected(b.bookingId, card, collectBtn));
  }

  return card;
}

// ── MARK COLLECTED ───────────────────────────

async function markCollected(bookingId, card, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  try {
    await updateDoc(doc(db, 'bookings', bookingId), { paymentStatus: 'collected' });
    // Update badge
    const venueBadge = card.querySelector('.badge-payment-venue');
    if (venueBadge) {
      venueBadge.className = 'badge badge-payment-collected';
      venueBadge.innerHTML = '<i class="fa-solid fa-check"></i> Collected';
    }
    // Remove the collect button
    btn.remove();
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-money-bill"></i> Mark Collected';
  }
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
    const slotId    = `${date}_${time}`;

    // Save booking
    await setDoc(doc(db, 'bookings', bookingId), {
      bookingId,
      name,
      phone,
      email:    '',
      package:  pkgData.name,
      date,
      time,
      riders,
      pricePerRider: pkgData.price,
      total,
      paymentMethod: payment,
      walkin:   true,
      status:   'confirmed',
      createdAt: new Date().toISOString()
    });

    // Block slot
    await setDoc(doc(db, 'slots', slotId), {
      date,
      time,
      duration: pkgData.duration,
      package:  pkgData.name,
      booked:   true
    });

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