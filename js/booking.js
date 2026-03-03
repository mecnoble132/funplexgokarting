// ============================================
//  BOOKING LOGIC — FunPlex Go Karting
//  Firebase Firestore + Slot Management + EmailJS
// ============================================

import { db } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  runTransaction,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ── EMAILJS CONFIG ───────────────────────────
const EMAILJS_PUBLIC_KEY = "hESlrw39nl_rOm-tl";
const EMAILJS_SERVICE_ID = "funplex";
const EMAILJS_TEMPLATE_ID = "template_oaettpk";

// ── CONFIG ──────────────────────────────────

const PACKAGES = {
  8: { name: "8 Laps — Rookie Run", price: 350, duration: 15 },
  13: { name: "13 Laps — Speed Racer", price: 450, duration: 20 },
  18: { name: "18 Laps — Grand Prix", price: 550, duration: 25 }
};

const KARTS = 3; // Max riders per single slot
const MAX_RIDERS = 12;

// How many consecutive slots are needed for a given rider count
function slotsNeeded(riders) {
  return Math.ceil(riders / KARTS);
}

const OPEN_TIME = 10 * 60;  // 10:00 AM in minutes
const CLOSE_TIME = 22 * 60;  // 10:00 PM in minutes
const CUTOFF_MINS = 30;       // Stop online bookings 30 min before slot

// ── STATE ────────────────────────────────────

const state = {
  package: null,
  price: 0,
  duration: 0,
  riders: 1,
  date: null,
  time: null,
  timeEnd: null,       // end time of booking window (for multi-slot)
  windowSlots: [],     // all slot times in the booking window
  name: '',
  phone: '',
  email: ''
};

// ── DOM HELPERS ──────────────────────────────

const $ = id => document.getElementById(id);

function showStep(n) {
  [1, 2, 3, 'success'].forEach(s => {
    const el = $(`step-${s}`);
    if (el) el.classList.toggle('hidden', s !== n);
  });
  // Update step indicators
  [1, 2, 3].forEach(i => {
    const ind = $(`step-indicator-${i}`);
    if (!ind) return;
    ind.classList.remove('active', 'done');
    if (i === n) ind.classList.add('active');
    if (i < n) ind.classList.add('done');
  });
  // Update step lines
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < n);
  });
  hideError();

  // Scroll to top of the booking section for better mobile UX
  const bookingTop = document.querySelector('.booking-section');
  if (bookingTop) {
    bookingTop.scrollIntoView({ behavior: 'smooth' });
  }
}

function showError(msg) {
  $('error-msg').textContent = msg;
  $('error-toast').classList.remove('hidden');
}

function hideError() {
  $('error-toast').classList.add('hidden');
}

// ── STEP 1: PACKAGE & RIDERS ─────────────────

document.querySelectorAll('.package-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.package = parseInt(card.dataset.package);
    state.price = parseInt(card.dataset.price);
    state.duration = parseInt(card.dataset.duration);
    updateStep1Next();
    updateSummary();
  });
});

const ridersCount = $('riders-count');
const ridersMinus = $('riders-minus');
const ridersPlus = $('riders-plus');

function updateRidersUI() {
  ridersCount.textContent = state.riders;
  ridersMinus.disabled = state.riders <= 1;
  ridersPlus.disabled = state.riders >= MAX_RIDERS;

  // Show how many slots will be needed
  const needed = slotsNeeded(state.riders);
  const riderNote = document.querySelector('.riders-note');
  if (riderNote) {
    let html = `<div><i class="fa-solid fa-circle-info"></i> For groups larger than ${MAX_RIDERS}, please <a href="tel:+919497188199" class="rider-link">Call us directly</a>.</div>`;

    if (needed > 1) {
      html = `<div><i class="fa-solid fa-layer-group"></i>${needed} consecutive slots will be reserved (${state.riders} riders).</div>` + html;
    }

    riderNote.innerHTML = html;
  }
  updateSummary();
}

ridersMinus.addEventListener('click', () => {
  if (state.riders > 1) {
    state.riders--;
    updateRidersUI();
    // Reload slots if date already selected — slot count may change
    if (state.date) { state.time = null; $('step2-next').disabled = true; loadSlots(state.date); }
  }
});
ridersPlus.addEventListener('click', () => {
  if (state.riders < MAX_RIDERS) {
    state.riders++;
    updateRidersUI();
    if (state.date) { state.time = null; $('step2-next').disabled = true; loadSlots(state.date); }
  }
});

function updateStep1Next() {
  $('step1-next').disabled = !state.package;
}

$('step1-next').addEventListener('click', async () => {
  if (!state.package) return;
  const prevDate = state.date;
  showStep(2);
  // Reset time selection
  state.time = null;
  $('step2-next').disabled = true;
  // If date was already selected, reload slots for the new package duration
  if (prevDate) {
    await loadSlots(prevDate);
  } else {
    $('booking-date').value = '';
    $('slots-grid').innerHTML = '<div class="slots-placeholder">Select a date to see available slots</div>';
  }
  updateSummary();
});

// ── STEP 2: DATE & TIME ──────────────────────

// Set min date to today
const dateInput = $('booking-date');
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
dateInput.min = `${yyyy}-${mm}-${dd}`;

// Max booking date — 3 months ahead
const maxDate = new Date();
maxDate.setMonth(maxDate.getMonth() + 3);
const mxyyyy = maxDate.getFullYear();
const mxmm = String(maxDate.getMonth() + 1).padStart(2, '0');
const mxdd = String(maxDate.getDate()).padStart(2, '0');
dateInput.max = `${mxyyyy}-${mxmm}-${mxdd}`;

dateInput.addEventListener('change', async () => {
  const selected = dateInput.value;
  if (!selected) return;
  state.date = selected;
  state.time = null;
  $('step2-next').disabled = true;
  await loadSlots(selected);
  updateSummary();
});

async function loadSlots(date) {
  const grid = $('slots-grid');
  grid.innerHTML = '<div class="slots-loading"><i class="fa-solid fa-spinner"></i> Loading slots...</div>';

  // Get ALL booked slots for this date from Firebase
  let bookedRanges = [];
  try {
    const q = query(collection(db, 'slots'), where('date', '==', date));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      const start = timeToMins(data.time);
      const end = start + (data.duration || 15);
      bookedRanges.push({ start, end });
    });
  } catch (e) {
    console.error('Error loading slots:', e);
  }

  // Generate all base slots for the selected package duration
  const allSlots = generateSlots(state.duration);
  const needed = slotsNeeded(state.riders);
  const now = new Date();
  const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (allSlots.length === 0) {
    grid.innerHTML = '<div class="slots-placeholder">No slots available for this date</div>';
    return;
  }

  grid.innerHTML = '';
  let anyAvailable = false;

  allSlots.forEach((slot, idx) => {
    // A "booking window" starts at this slot and spans `needed` consecutive slots
    const windowSlots = allSlots.slice(idx, idx + needed);

    // Not enough remaining slots to fit the window
    if (windowSlots.length < needed) return;

    const windowStart = timeToMins(windowSlots[0]);
    const windowEnd = windowStart + (needed * state.duration);

    // Past/cutoff check — the start of the window must be > now + cutoff
    const isPast = isToday && windowStart <= nowMins + CUTOFF_MINS;

    // Overlap check — the entire window must be free
    const isBooked = bookedRanges.some(b => windowStart < b.end && b.start < windowEnd);

    const disabled = isBooked || isPast;
    if (!disabled) anyAvailable = true;

    const btn = document.createElement('button');
    btn.type = 'button';

    // Always show start – end time range
    const startLabel = formatTime(windowSlots[0]);
    const endLabel = formatTime(minsToTime(windowEnd));
    btn.textContent = `${startLabel} – ${endLabel}`;

    btn.className = 'slot-btn' + (disabled ? ' booked' : '');
    btn.disabled = disabled;
    btn.title = isBooked ? 'Already booked' : isPast ? 'Slot unavailable' : `${needed} slot${needed > 1 ? 's' : ''} reserved`;

    // Store the composite slot key so we can block all slots on submit
    btn.dataset.windowStart = windowSlots[0];
    btn.dataset.windowSlots = JSON.stringify(windowSlots);

    if (!disabled) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.time = windowSlots[0];           // start time for DB / display
        state.timeEnd = minsToTime(windowEnd);    // end time for display
        state.windowSlots = JSON.parse(btn.dataset.windowSlots);
        $('step2-next').disabled = false;
        updateSummary();
      });
    }
    grid.appendChild(btn);
  });

  if (!anyAvailable && grid.querySelectorAll('.slot-btn:not(.booked)').length === 0) {
    const msg = document.createElement('div');
    msg.className = 'slots-placeholder';
    msg.textContent = 'No available slots for this date';
    grid.appendChild(msg);
  }
}

function generateSlots(duration) {
  const slots = [];
  let current = OPEN_TIME;
  while (current + duration <= CLOSE_TIME) {
    slots.push(minsToTime(current));
    current += duration;
  }
  return slots;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function timeToMins(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

$('step2-back').addEventListener('click', () => showStep(1));
$('step2-next').addEventListener('click', () => {
  if (!state.date || !state.time) return;
  updateSummary();
  showStep(3);
});

// ── STEP 3: DETAILS ──────────────────────────

$('step3-back').addEventListener('click', () => showStep(2));

$('submit-btn').addEventListener('click', async () => {
  state.name = $('name').value.trim();
  state.phone = $('phone').value.trim();
  state.email = $('email').value.trim();

  // Validate
  if (!state.name) return showError('Please enter your full name.');
  if (!state.phone || !/^\d{10}$/.test(state.phone.replace(/\s/g, '')))
    return showError('Please enter a valid 10-digit phone number.');
  if (!state.email || !/\S+@\S+\.\S+/.test(state.email))
    return showError('Please enter a valid email address.');

  hideError();
  $('submit-btn').disabled = true;
  $('submit-btn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming...';

  try {
    const slotId = `${state.date}_${state.time}`;
    const total = state.price * state.riders;
    const bookingId = `FP-${Date.now()}`;

    // Use a Firestore transaction to atomically check + write
    // This prevents two users from booking the same slot simultaneously
    await runTransaction(db, async (transaction) => {
      // Check all slots in the window are still free
      const slotRefs = state.windowSlots.map(t => doc(db, 'slots', `${state.date}_${t}`));
      const slotSnaps = await Promise.all(slotRefs.map(ref => transaction.get(ref)));

      slotSnaps.forEach(snap => {
        if (snap.exists()) throw new Error('SLOT_TAKEN');
      });

      const bookingRef = doc(db, 'bookings', bookingId);

      // Block every slot in the window
      slotRefs.forEach((ref, i) => {
        transaction.set(ref, {
          date: state.date,
          time: state.windowSlots[i],
          duration: state.duration,
          package: PACKAGES[state.package].name,
          booked: true
        });
      });

      transaction.set(bookingRef, {
        bookingId,
        name: state.name,
        phone: state.phone,
        email: state.email,
        package: PACKAGES[state.package].name,
        date: state.date,
        time: state.time,
        timeEnd: state.timeEnd,
        windowSlots: state.windowSlots,
        riders: state.riders,
        pricePerRider: state.price,
        total,
        paymentMethod: 'Pay at Venue',
        status: 'confirmed',
        createdAt: new Date().toISOString()
      });
    });

    // Send confirmation email via EmailJS
    await sendConfirmationEmail(bookingId, total);

    // Show success
    showSuccessScreen(bookingId, total);

  } catch (err) {
    console.error(err);
    if (err.message === 'SLOT_TAKEN') {
      showError('Sorry, this slot was just taken by someone else. Please choose a different time.');
      showStep(2); // Send user back to pick another slot
    } else {
      showError('Something went wrong. Please try again or call us.');
    }
    $('submit-btn').disabled = false;
    $('submit-btn').innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Confirm Booking';
  }
});

// ── EMAIL CONFIRMATION ───────────────────────

async function sendConfirmationEmail(bookingId, total) {
  try {
    const pkg = PACKAGES[state.package];
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        name: state.name,
        email: state.email,
        booking_id: bookingId,
        package: pkg.name,
        date: formatDate(state.date),
        time: formatTime(state.time),
        riders: state.riders,
        total: `₹${total}`
      },
      EMAILJS_PUBLIC_KEY
    );
  } catch (err) {
    // Email failure shouldn't block the booking — just log it
    console.warn('Email sending failed:', err);
  }
}

// ── SUMMARY ──────────────────────────────────

function updateSummary() {
  const pkg = state.package ? PACKAGES[state.package] : null;

  $('summary-package').textContent = pkg ? pkg.name : '—';
  $('summary-date').textContent = state.date ? formatDate(state.date) : '—';

  if (state.time) {
    const timeLabel = state.timeEnd
      ? `${formatTime(state.time)} – ${formatTime(state.timeEnd)}`
      : `${formatTime(state.time)} – ${formatTime(minsToTime(timeToMins(state.time) + state.duration))}`;
    $('summary-time').textContent = timeLabel;
  } else {
    $('summary-time').textContent = '—';
  }

  $('summary-riders').textContent = state.riders;
  $('summary-price-per').textContent = pkg ? `₹${pkg.price}` : '—';

  if (pkg) {
    const total = pkg.price * state.riders;
    $('summary-total').textContent = `₹${total}`;
  } else {
    $('summary-total').textContent = '—';
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── SUCCESS SCREEN ───────────────────────────

function showSuccessScreen(bookingId, total) {
  const pkg = PACKAGES[state.package];
  const timeLabel = state.timeEnd
    ? `${formatTime(state.time)} – ${formatTime(state.timeEnd)}`
    : `${formatTime(state.time)} – ${formatTime(minsToTime(timeToMins(state.time) + state.duration))}`;

  $('success-details').innerHTML = `
    <div class="success-detail-row"><span>Booking ID</span><strong>${bookingId}</strong></div>
    <div class="success-detail-row"><span>Name</span><strong>${state.name}</strong></div>
    <div class="success-detail-row"><span>Package</span><strong>${pkg.name}</strong></div>
    <div class="success-detail-row"><span>Date</span><strong>${formatDate(state.date)}</strong></div>
    <div class="success-detail-row"><span>Time</span><strong>${timeLabel}</strong></div>
    <div class="success-detail-row"><span>Riders</span><strong>${state.riders}</strong></div>
    <div class="success-detail-row total-row"><span>Total</span><strong>₹${total}</strong></div>
  `;
  showStep('success');
}

// ── INIT ──────────────────────────────────────
updateRidersUI();
updateSummary();
showStep(1);