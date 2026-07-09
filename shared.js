// ── INITIALIZE SUPABASE CLIENT ──
const SUPABASE_URL = 'https://nmdiwayyluvaaxrupkij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FMuWXJOJ5lSGGUs6GnQ7HQ_taqKQyyU';
let _supabaseClient;

try {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn('Supabase global object not available. Initializing empty fallback context.');
    _supabaseClient = null;
  }
} catch (e) {
  console.error('Failed to initialize Supabase connection:', e);
  _supabaseClient = null;
}

// Simple HTML escaper used across the app
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── CART STATE ──
// Cart persistence key
const CART_STORAGE_KEY = 'curio_cart_v1';
const REVIEWS_STORAGE_KEY = 'curio_reviews_v1';
const REVIEWS_TABLE = 'reviews';
let cart = [];
let reviews = [];
let lastRemoved = null;
let undoTimeout = null;
let _prevFocus = null;
let cartKeyHandler = null;
let notifyKeyHandler = null;
let isSubmitting = false;

async function loadReviews() {
  if (_supabaseClient) {
    try {
      const { data, error } = await _supabaseClient
        .from(REVIEWS_TABLE)
        .select('*'); 

      if (error) throw error;

      if (Array.isArray(data) && data.length > 0) {
        reviews = data.map(item => ({
          id: item.id || Date.now().toString(),
          name: item.name || 'Anonymous',
          text: item.text || '',
          date: item.created_at
            ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Jul 2026'
        }));
        return;
      }
    } catch (e) {
      console.warn('Failed to load reviews from Supabase:', e);
    }
  }

  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        reviews = parsed;
        return;
      }
    }
  } catch (e) { console.warn('Failed to load reviews', e); }
  reviews = [
    { id: 'sample-1', name: 'Jannatul Ferdous Mina', text: 'I loved the surprise box! Every item felt curated just for me.', date: 'Jul 2026' },
    { id: 'sample-2', name: 'Riya Sultana', text: 'Fast delivery, cute packaging, and the products were adorable.', date: 'Jun 2026' },
    { id: 'sumayyah-1', name: 'Sumayyah Chowdhury Suha', text: 'I just got home and opened the parcel. I’m so happy with all the products, both the charm and necklace are so pretty!😭 And thank you so much for the gifts, one of the cutest parcels, loved every product!🫶🏻', date: 'Jul 2026' },
    { id: 'rifah-1', name: 'Rifah Tasnia Rodela', text: 'Thank you soooo much. I really really loved everything!💐', date: 'Jul 2026' },
    { id: 'shanchita-1', name: 'Shanchita Das', text: 'Yeppp!! I liked it so much..!!✨ Apu thank you onk shundor packaging chilo. Khub taratri peye gesii parcel ta!🤭', date: 'Jul 2026' },
    { id: 'marium-1', name: 'Marium Tasneem', text: 'Porttekta jinish e must have product.. thank you so much for this.. sob kichu onk cute!🥰 Inshallah abar nibo', date: 'Jul 2026' }
  ];
  saveReviews();
}

async function saveReviewToBackend(review) {
  if (!_supabaseClient) return;

  const { data, error } = await _supabaseClient
    .from(REVIEWS_TABLE)
    .insert([{ name: review.name, text: review.text }])
    .select('id,created_at');

  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) {
    review.id = data[0].id || review.id;
    if (data[0].created_at) {
      review.date = new Date(data[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
}

function saveReviews() {
  try { localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews)); } catch (e) { console.warn('Could not persist reviews', e); }
}

function renderReviews() {
  const reviewsGrid = document.getElementById('reviewsGrid');
  const reviewsEmpty = document.getElementById('reviewsEmpty');
  
  // Safety break: stops errors if loaded on index.html where these fields don't exist
  if (!reviewsGrid) return;

  if (!reviews || reviews.length === 0) {
    reviewsGrid.innerHTML = '';
    if (reviewsEmpty) reviewsEmpty.style.display = 'block';
    return;
  }

  if (reviewsEmpty) reviewsEmpty.style.display = 'none';
  
  reviewsGrid.innerHTML = reviews.map(review => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-name">${escapeHtml(review.name)}</div>
        <div class="review-date">${escapeHtml(review.date || 'Jul 2026')}</div>
      </div>
      <p class="review-text">${escapeHtml(review.text)}</p>
    </div>
  `).join('');
}

function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) { console.warn('Could not persist cart', e); }
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) { console.warn('Failed to load cart', e); }
  return [];
}

// Initialize cart from storage
cart = loadCart();

function addToCart(name, price, emoji) {
  const item = { name, price, emoji, id: Date.now() };
  cart.push(item);
  saveCart();
  updateCartUI();
  openCart();
}

function removeFromCart(id) {
  const idx = cart.findIndex(i => String(i.id) === String(id));
  if (idx === -1) return;
  lastRemoved = cart[idx];
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
  showUndoBanner(lastRemoved);
}

function updateCartUI() {
  const count = cart.length;
  document.getElementById('cartCount').textContent = count;

  const drawerEl = document.getElementById('drawerItems');
  const footerEl = document.getElementById('drawerFooter');
  const drawerTotalEl = document.getElementById('drawerTotal');
  const listEl = document.getElementById('cartItemsList');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const totalRow = document.getElementById('cartTotalRow');

  if (drawerEl && footerEl && drawerTotalEl) {
    if (count === 0) {
      drawerEl.innerHTML = '<div class="drawer-empty"><div class="drawer-empty-icon">🛍</div><p>No items yet.<br>Add a box or item above.</p></div>';
      footerEl.style.display = 'none';
    } else {
      drawerEl.innerHTML = cart.map(item => `
        <div class="drawer-item">
          <div class="drawer-item-emoji">${item.emoji}</div>
          <div class="drawer-item-info">
            <div class="drawer-item-name">${item.name}</div>
            <div class="drawer-item-price">৳${item.price.toLocaleString()}</div>
          </div>
          <button class="drawer-remove" onclick="removeFromCart('${item.id}')">✕</button>
        </div>
      `).join('');
      const total = cart.reduce((s, i) => s + i.price, 0);
      drawerTotalEl.textContent = '৳' + total.toLocaleString();
      footerEl.style.display = 'block';
    }
  }

  if (listEl && emptyMsg && totalRow) {
    if (count === 0) {
      emptyMsg.style.display = 'block';
      totalRow.style.display = 'none';
      listEl.innerHTML = '';
    } else {
      const total = cart.reduce((s, i) => s + i.price, 0);
      emptyMsg.style.display = 'none';
      listEl.innerHTML = cart.map(item => `
        <div class="cart-item">
          <span class="cart-item-name">${item.emoji} ${item.name}</span>
          <span class="cart-item-price">৳${item.price.toLocaleString()}</span>
          <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
        </div>
      `).join('');
      totalRow.style.display = 'flex';
      document.getElementById('cartTotalDisplay').textContent = '৳' + total.toLocaleString();
    }
  }

  syncOrderFormWithCart();
}

function syncOrderFormWithCart() {
  const tierSelect = document.getElementById('boxTier');
  const modeSelect = document.getElementById('boxMode');
  if (!tierSelect || !modeSelect) return;

  const firstBox = cart.find(item => /small|classic|mega|signature/i.test(item.name));
  if (firstBox) {
    const name = firstBox.name.toLowerCase();
    if (name.includes('signature')) tierSelect.value = 'Signature Box (৳1,999)';
    else if (name.includes('mega')) tierSelect.value = 'Mega Box (৳1,199)';
    else if (name.includes('classic')) tierSelect.value = 'Classic Box (৳799)';
    else if (name.includes('small')) tierSelect.value = 'Small Box (৳499)';
  } else if (cart.length > 0) {
    tierSelect.value = 'Normal Order (Individual Items)';
  }

  const hasScoop = cart.some(item => /scoop/i.test(item.name));
  const hasPackage = cart.some(item => /package/i.test(item.name));
  if (hasScoop) modeSelect.value = 'Scoop (Live Video)';
  else if (hasPackage) modeSelect.value = 'Package (Curated)';
  else if (cart.length > 0) modeSelect.value = 'Normal Order (Pick & Ship)';
}

function showUndoBanner(item) {
  let banner = document.getElementById('undoBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'undoBanner';
    banner.style.position = 'fixed';
    banner.style.left = '1rem';
    banner.style.bottom = '1rem';
    banner.style.background = 'rgba(26,18,8,0.9)';
    banner.style.color = '#fff';
    banner.style.padding = '0.75rem 1rem';
    banner.style.borderRadius = '6px';
    banner.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    banner.style.zIndex = 10000;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<span style="margin-right:10px;">Removed ${escapeHtml(item.name)}</span><button id="undoBtn" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer">Undo</button>`;
  const undoBtn = document.getElementById('undoBtn');
  undoBtn.onclick = () => {
    if (lastRemoved) {
      cart.push(lastRemoved);
      saveCart();
      updateCartUI();
      lastRemoved = null;
    }
    clearUndoBanner();
  };
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => { clearUndoBanner(); lastRemoved = null; }, 6000);
}

function clearUndoBanner() {
  const banner = document.getElementById('undoBanner');
  if (banner) banner.remove();
  clearTimeout(undoTimeout);
  undoTimeout = null;
}

function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  const cartToggle = document.getElementById('cartToggleButton');
  _prevFocus = document.activeElement;
  drawer.classList.add('open');
  overlay.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (cartToggle) cartToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('modal-open');

  const focusables = drawer.querySelectorAll('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
  else drawer.focus();

  cartKeyHandler = function(e) {
    if (e.key === 'Escape') { closeCart(); }
    if (e.key === 'Tab') {
      const list = Array.from(focusables);
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement);
      if (e.shiftKey && idx === 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); list[0].focus(); }
    }
  };
  document.addEventListener('keydown', cartKeyHandler);
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  const cartToggle = document.getElementById('cartToggleButton');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (cartToggle) cartToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('modal-open');
  if (cartKeyHandler) { document.removeEventListener('keydown', cartKeyHandler); cartKeyHandler = null; }
  if (_prevFocus && typeof _prevFocus.focus === 'function') { _prevFocus.focus(); }
}

// ── NOTIFY ME MODAL SYSTEM ──
let currentNotifyProduct = '';
function notifyMe(product) {
  currentNotifyProduct = product;
  document.getElementById('notifyTitle').textContent = 'Notify me about ' + product;
  document.getElementById('notifyPhone').value = '';
  document.getElementById('notifySuccess').style.display = 'none';
  const overlay = document.getElementById('notifyOverlay');
  const modal = document.getElementById('notifyModal');
  _prevFocus = document.activeElement;
  overlay.classList.add('open');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const phoneInput = document.getElementById('notifyPhone');
  const focusables = modal.querySelectorAll('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if (phoneInput) phoneInput.focus();
  else if (focusables.length) focusables[0].focus();
  else modal.focus();

  notifyKeyHandler = function(e) {
    if (e.key === 'Escape') { closeNotify(); }
    if (e.key === 'Tab') {
      const list = Array.from(focusables);
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement);
      if (e.shiftKey && idx === 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); list[0].focus(); }
    }
  };
  document.addEventListener('keydown', notifyKeyHandler);
}
function closeNotify() {
  const overlay = document.getElementById('notifyOverlay');
  const modal = document.getElementById('notifyModal');
  overlay.classList.remove('open');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (notifyKeyHandler) { document.removeEventListener('keydown', notifyKeyHandler); notifyKeyHandler = null; }
  if (_prevFocus && typeof _prevFocus.focus === 'function') { _prevFocus.focus(); }
}
function submitNotify() {
  const phone = document.getElementById('notifyPhone').value.trim();
  if (!phone) { alert('Please enter your WhatsApp number.'); return; }
  const msg = encodeURIComponent(`🔔 Notify me about: ${currentNotifyProduct}\nMy number: ${phone}`);
  document.getElementById('notifySuccess').style.display = 'block';
  setTimeout(() => {
    window.open(`https://wa.me/8801615396654?text=${msg}`, '_blank');
    closeNotify();
  }, 600);
}
// ── MOBILE MENU SYSTEM ──
function toggleMobileMenu() {
  const navLinks = document.getElementById('navLinks');
  const toggleBtn = document.getElementById('menuToggleButton');
  if (!navLinks || !toggleBtn) return;
  
  const isOpen = navLinks.classList.contains('mobile-open');
  if (isOpen) {
    navLinks.classList.remove('mobile-open');
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
  } else {
    navLinks.classList.add('mobile-open');
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-expanded', 'true');
  }
}

// Close mobile menu if window resizes past mobile threshold
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) {
    const navLinks = document.getElementById('navLinks');
    const toggleBtn = document.getElementById('menuToggleButton');
    if (navLinks) navLinks.classList.remove('mobile-open');
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
});