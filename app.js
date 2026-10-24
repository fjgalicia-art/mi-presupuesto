'use strict';

/* =========================================================
   Configuración base
   ========================================================= */

const STORAGE_KEY = 'mi-presupuesto.v1';
const PENDING_KEY = 'mi-presupuesto.pending';

const CATEGORIES = [
  { id: 'comida',     name: 'Comida',     emoji: '🍔', color: '#e07a5f' },
  { id: 'super',      name: 'Súper',      emoji: '🛒', color: '#3d9970' },
  { id: 'transporte', name: 'Transporte', emoji: '🚗', color: '#4a90d9' },
  { id: 'salidas',    name: 'Salidas',    emoji: '🎉', color: '#b05cc6' },
  { id: 'compras',    name: 'Compras',    emoji: '🛍️', color: '#d6669b' },
  { id: 'belleza',    name: 'Belleza',    emoji: '💅', color: '#e58fb0' },
  { id: 'salud',      name: 'Salud',      emoji: '💊', color: '#2fa7a0' },
  { id: 'casa',       name: 'Casa',       emoji: '🏠', color: '#c99a3b' },
  { id: 'regalos',    name: 'Regalos',    emoji: '🎁', color: '#d9534f' },
  { id: 'otros',      name: 'Otros',      emoji: '✨', color: '#8a8f98' },
];

const BILL_EMOJIS = ['🏠', '📱', '💡', '🌐', '💧', '🎬', '🚌', '🏋️', '🎓', '🐶', '💳', '🧾'];
const BILL_SUGGESTIONS = [
  { name: 'Alquiler', emoji: '🏠' }, { name: 'Teléfono', emoji: '📱' }, { name: 'Luz', emoji: '💡' },
  { name: 'Internet', emoji: '🌐' }, { name: 'Agua', emoji: '💧' }, { name: 'Streaming', emoji: '🎬' },
  { name: 'Gimnasio', emoji: '🏋️' },
];
const CARD_COLORS = ['#c2507a', '#4a90d9', '#3d9970', '#e07a5f', '#7d5bc6', '#c99a3b', '#2fa7a0', '#5f6b7a'];

const DEFAULT_SETTINGS = {
  name: '',
  onboarded: false,
  payFreq: 'quincenal',      // 'mensual' | 'quincenal'
  payDays: [15, 31],         // 31 = último día del mes
  fixedIncome: 0,            // por cada pago
  savings: 0,                // por cada pago
  bills: [],                 // { id, name, emoji, amount, day }
  cards: [],                 // { id, name, color, corte, pago }
  paid: [],                  // claves "inicioPeriodo|billId" de pagos fijos marcados
  rate: 7.70,
  lastMethod: 'efectivo',
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* =========================================================
   Datos
   ========================================================= */

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { /* vacío */ }
  return normalize(data);
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return n >= min && n <= max ? n : fallback;
}

const money = v => (Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : 0);

function normalize(data) {
  data = data && typeof data === 'object' ? data : {};
  const s = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  const payFreq = s.payFreq === 'mensual' ? 'mensual' : 'quincenal';
  const days = (Array.isArray(s.payDays) ? s.payDays : []).map(d => clampInt(d, 1, 31, null)).filter(Boolean);
  return {
    version: 1,
    settings: {
      name: String(s.name || ''),
      onboarded: !!s.onboarded,
      payFreq,
      payDays: payFreq === 'mensual' ? [days[0] || 1] : [days[0] || 15, days[1] || 31],
      fixedIncome: money(s.fixedIncome),
      savings: money(s.savings),
      bills: (Array.isArray(s.bills) ? s.bills : []).filter(b => b && b.id && b.name).map(b => ({
        id: String(b.id), name: String(b.name), emoji: b.emoji || '🧾',
        amount: money(b.amount), day: clampInt(b.day, 1, 31, 1),
      })),
      cards: (Array.isArray(s.cards) ? s.cards : []).filter(c => c && c.id && c.name).map(c => ({
        id: String(c.id), name: String(c.name), color: c.color || CARD_COLORS[0],
        corte: clampInt(c.corte, 1, 31, 22), pago: clampInt(c.pago, 1, 31, 15),
      })),
      paid: (Array.isArray(s.paid) ? s.paid : []).map(String).slice(-300),
      rate: Number(s.rate) > 0 ? Number(s.rate) : DEFAULT_SETTINGS.rate,
      lastMethod: s.lastMethod || 'efectivo',
    },
    movements: (Array.isArray(data.movements) ? data.movements : [])
      .filter(m => m && m.id && m.date && Number(m.amount) > 0)
      .map(m => ({ ...m, type: m.type === 'ingreso' ? 'ingreso' : 'gasto', amount: Number(m.amount) })),
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (_) {
    toast('No se pudo guardar. Descarga un respaldo.');
  }
}

let db = load();

const S = () => db.settings;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const cardById = id => S().cards.find(c => c.id === id);

/** Monto en quetzales. */
const inQ = m => (m.currency === 'USD' ? m.amount * (m.rate || S().rate) : m.amount);

/* =========================================================
   Fechas
   ========================================================= */

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const clampDate = (y, m, day) => new Date(y, m - 1, Math.min(day, daysInMonth(y, m)));
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) -
                                          new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
const fmtDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtWeekday = d => `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;

/* =========================================================
   Periodos de pago
   ---------------------------------------------------------
   Un periodo empieza el día que te pagan y termina el día antes del
   siguiente pago. Se identifica por su fecha de inicio ("2026-10-15").
   ========================================================= */

function payDatesAround(date) {
  const out = [];
  for (let i = -1; i <= 1; i++) {
    const y = date.getFullYear(), m = date.getMonth() + 1 + i;
    const yy = y + Math.floor((m - 1) / 12), mm = ((m - 1) % 12 + 12) % 12 + 1;
    for (const day of S().payDays) out.push(clampDate(yy, mm, day));
  }
  return out.sort((a, b) => a - b);
}

function periodFor(date) {
  const dates = payDatesAround(date);
  const start = dates.filter(d => d <= date).pop();
  const next = dates.find(d => d > date);
  return { key: ymd(start), start, end: addDays(next, -1), next };
}

const periodByKey = key => periodFor(parseYmd(key));
const shiftPeriod = (p, n) => (n > 0 ? periodFor(p.next) : periodFor(addDays(p.start, -1)));
const currentPeriod = () => periodFor(parseYmd(todayStr()));

function periodLabel(p) {
  const sameMonth = p.start.getMonth() === p.end.getMonth();
  return sameMonth
    ? `Del ${p.start.getDate()} al ${p.end.getDate()} de ${MONTHS[p.end.getMonth()]}`
    : `Del ${fmtDay(p.start)} al ${fmtDay(p.end)}`;
}

const inPeriod = (p, dateStr) => { const d = parseYmd(dateStr); return d >= p.start && d <= p.end; };

/** Fecha en que vence un pago fijo dentro del periodo (o null). */
function billDateIn(p, bill) {
  for (const d of [p.start, p.end]) {
    const due = clampDate(d.getFullYear(), d.getMonth() + 1, bill.day);
    if (due >= p.start && due <= p.end) return due;
  }
  return null;
}

/* =========================================================
   El presupuesto del periodo
   ========================================================= */

function budgetFor(p) {
  const moves = db.movements.filter(m => inPeriod(p, m.date));
  const gastos = moves.filter(m => m.type === 'gasto');
  const extra = moves.filter(m => m.type === 'ingreso').reduce((s, m) => s + inQ(m), 0);
  const bills = S().bills
    .map(b => ({ ...b, due: billDateIn(p, b), paid: S().paid.includes(`${p.key}|${b.id}`) }))
    .filter(b => b.due)
    .sort((a, b) => a.due - b.due);
  const billsTotal = bills.reduce((s, b) => s + b.amount, 0);
  const spent = gastos.reduce((s, m) => s + inQ(m), 0);
  const income = S().fixedIncome + extra;
  const base = income - billsTotal - S().savings;       // lo que se puede gastar en el periodo
  const left = base - spent;

  const today = parseYmd(todayStr());
  const totalDays = daysBetween(p.start, p.end) + 1;
  const isCurrent = today >= p.start && today <= p.end;
  const elapsed = isCurrent ? daysBetween(p.start, today) + 1 : (today > p.end ? totalDays : 0);
  const daysLeft = isCurrent ? daysBetween(today, p.end) + 1 : 0;

  return { p, moves, gastos, extra, bills, billsTotal, spent, income, base, left, totalDays, elapsed, daysLeft, isCurrent };
}

/** Estado de ánimo según el ritmo: ¿vas gastando más rápido de lo que pasan los días? */
function moodOf(b) {
  if (b.base <= 0 && b.spent === 0) return { key: 'warn', emoji: '🤔', text: 'Falta tu ingreso' };
  if (b.left < 0) return { key: 'bad', emoji: '😬', text: 'Te pasaste del presupuesto' };
  const spentRatio = b.base > 0 ? b.spent / b.base : 1;
  const timeRatio = b.totalDays ? b.elapsed / b.totalDays : 1;
  if (spentRatio > timeRatio + 0.15) return { key: 'warn', emoji: '😅', text: 'Vas un poquito rápido' };
  if (spentRatio > 0.9) return { key: 'warn', emoji: '🫣', text: 'Ya casi llegas al límite' };
  return { key: 'good', emoji: '😊', text: b.spent ? 'Vas muy bien' : '¡Periodo nuevo!' };
}

/** Un consejo corto y útil, nunca regañón. */
function tipFor(b) {
  if (!b.isCurrent) return null;
  if (b.base <= 0) return '💡 Agrega tu sueldo fijo en Ajustes para saber cuánto puedes gastar.';
  if (b.left < 0) return `💡 Para no pasarte más, intenta gastar solo lo necesario hasta el ${fmtDay(b.p.next)}, que es tu próximo pago.`;
  if (b.elapsed >= 3 && b.spent > 0) {
    const perDay = b.spent / b.elapsed;
    const lastsDays = Math.floor(b.left / perDay);
    if (lastsDays < b.daysLeft) {
      return `💡 A este ritmo tu dinero te alcanza hasta el ${fmtWeekday(addDays(parseYmd(todayStr()), lastsDays))}. Bajarle un poco ayuda a llegar al ${fmtDay(b.p.next)}.`;
    }
    const spare = b.left - perDay * b.daysLeft;
    if (spare > 50) return `💡 A este ritmo te sobrarían unos ${fmtQ(spare)}. ¡Podrían ir a tu ahorro! 🐷`;
  }
  const byCat = categoryTotals(b.gastos);
  if (byCat.length && b.spent > 200 && byCat[0].total / b.spent >= 0.45) {
    return `💡 ${byCat[0].cat.emoji} ${byCat[0].cat.name} se lleva el ${Math.round(byCat[0].total / b.spent * 100)}% de tus gastos de este periodo.`;
  }
  return null;
}

function categoryTotals(gastos) {
  const map = new Map();
  for (const g of gastos) map.set(g.category, (map.get(g.category) || 0) + inQ(g));
  return [...map].map(([id, total]) => ({ cat: catById(id), total })).sort((a, b) => b.total - a.total);
}

/* =========================================================
   Tarjetas de crédito: ciclos de corte y pago
   ========================================================= */

const monthKey = (y, m) => `${y}-${pad(m)}`;
function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}
function cycleKeyFor(card, dateStr) {
  const d = parseYmd(dateStr);
  const corte = clampDate(d.getFullYear(), d.getMonth() + 1, card.corte);
  const key = monthKey(d.getFullYear(), d.getMonth() + 1);
  return d <= corte ? key : addMonths(key, 1);
}
function cycleInfo(card, key) {
  const [y, m] = key.split('-').map(Number);
  const corte = clampDate(y, m, card.corte);
  const [py, pm] = addMonths(key, -1).split('-').map(Number);
  const start = addDays(clampDate(py, pm, card.corte), 1);
  let pago = clampDate(y, m, card.pago);
  if (pago <= corte) { const [ny, nm] = addMonths(key, 1).split('-').map(Number); pago = clampDate(ny, nm, card.pago); }
  return { start, corte, pago };
}
const cardMoves = (card, key) => db.movements
  .filter(m => m.type === 'gasto' && m.method === card.id && cycleKeyFor(card, m.date) === key)
  .sort((a, b) => b.date.localeCompare(a.date));
const sumQ = list => list.reduce((s, m) => s + inQ(m), 0);

/* =========================================================
   Dinero y formato
   ========================================================= */

const nf = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = n => `${n < 0 ? '-' : ''}Q${nf.format(Math.abs(n))}`;
const fmtUSD = n => `$${nf.format(n)}`;

/** Acepta "1,163.50", "285+285", "Q20". NaN si no es válido. */
function parseAmount(str) {
  const clean = String(str).replace(/[Qq$\s,]/g, '');
  if (!clean || !/^[0-9.+]+$/.test(clean)) return NaN;
  const parts = clean.split('+').filter(Boolean).map(Number);
  if (!parts.length || parts.some(isNaN)) return NaN;
  return Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
}

/* =========================================================
   Utilidades de interfaz
   ========================================================= */

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Grupo de opciones donde solo una queda marcada. */
function radioChips(container, options, selected, onPick) {
  container.replaceChildren(...options.map(o => el('button', {
    type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(o.id === selected),
    onclick: ev => {
      container.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-checked', String(b === ev.currentTarget)));
      onPick(o.id);
    },
  }, o.dot ? el('span', { class: 'dot', style: `background:${o.dot}` }) : null, o.label)));
}

function segmented(container, attr, value, onPick) {
  container.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    b.onclick = () => {
      container.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      onPick(b.dataset[attr]);
    };
  });
}

/** Campos de "día de pago" (uno o dos, según la frecuencia). */
function renderPayDayInputs(container, freq, days) {
  const make = (label, value, i) => el('label', { class: 'field' }, el('span', {}, label),
    el('input', { type: 'number', min: 1, max: 31, inputmode: 'numeric', value, 'data-payday': i }));
  container.replaceChildren(...(freq === 'mensual'
    ? [make('Día en que te pagan', days[0] || 1, 0)]
    : [make('Primer pago (día)', days[0] || 15, 0), make('Segundo pago (día)', days[1] || 31, 1)]));
  if (freq !== 'mensual') container.append(el('p', { class: 'hint', style: 'grid-column:1/-1' }, 'Si te pagan el último día del mes, pon 31.'));
}

const readPayDays = container => [...container.querySelectorAll('[data-payday]')]
  .map(i => clampInt(i.value, 1, 31, null)).filter(Boolean).sort((a, b) => a - b);

/* =========================================================
   Nube (Firebase) — sync.js se conecta con setCloud()
   ---------------------------------------------------------
   Sin sesión activa, los cambios se anotan en una cola y se suben
   al conectar, para que nada hecho sin internet se pierda.
   ========================================================= */

const cloud = { ready: false, active: false, unavailable: false, disabled: false };
let account = null;

function readPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (_) { return []; } }
function writePending(list) {
  try { list.length ? localStorage.setItem(PENDING_KEY, JSON.stringify(list)) : localStorage.removeItem(PENDING_KEY); } catch (_) { /* sin espacio */ }
}

function sync(op) {
  if (cloud.active) {
    if (op.type === 'put') cloud.put(db.movements.find(m => m.id === op.id));
    else if (op.type === 'remove') cloud.remove(op.id);
    else if (op.type === 'settings') cloud.putSettings();
    else if (op.type === 'all') cloud.replaceAll();
    return;
  }
  writePending([...readPending(), op]);
}

const saveSettings = () => { save(); sync({ type: 'settings' }); };

window.App = {
  get db() { return db; },
  toast,
  takePending() { const list = readPending(); writePending([]); return list; },
  setCloud(impl) { Object.assign(cloud, impl, { ready: true }); renderAccount(); },
  setCloudUnavailable() { cloud.unavailable = true; renderAccount(); },
  setCloudDisabled() { cloud.disabled = true; renderAccount(); },
  setActive(active) { cloud.active = active; },
  setAccount(a) { account = a; renderAccount(); },
  setSyncStatus(status) { if (account) { account.status = status; renderAccount(); } },
  applyRemote({ settings, movements }) {
    if (settings) db.settings = normalize({ settings: { ...settings, lastMethod: S().lastMethod } }).settings;
    if (movements) db.movements = normalize({ movements }).movements;
    save();
    boot();
  },
  resetLocal() { db = normalize(null); writePending([]); save(); boot(); },
};

/* =========================================================
   Bienvenida (primera vez)
   ========================================================= */

const STEPS = 5;
let step = 0;
let wFreq = S().payFreq;

function showWelcome() {
  $('#app').hidden = true;
  $('#welcome').hidden = false;
  $('#w-name').value = S().name;
  $('#w-income').value = S().fixedIncome || '';
  $('#w-savings').value = S().savings || '';
  segmented($('#w-freq'), 'freq', wFreq, f => { wFreq = f; renderPayDayInputs($('#w-days'), f, S().payDays); updateWelcomeLabels(); });
  renderPayDayInputs($('#w-days'), wFreq, S().payDays);
  updateWelcomeLabels();
  renderStep();
}

function updateWelcomeLabels() {
  const each = wFreq === 'mensual' ? 'cada mes' : 'cada quincena';
  $('#w-income-label').textContent = `¿Cuánto recibes ${each}?`;
  $('#w-savings-label').textContent = `Ahorro ${each}`;
  const income = parseAmount($('#w-income').value);
  $('#w-savings-hint').textContent = income > 0
    ? `Una buena meta es el 10%: unos ${fmtQ(Math.round(income * 0.1))} ${each}.`
    : '';
}

function renderStep() {
  document.querySelectorAll('.step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === step));
  $('#steps-dots').replaceChildren(...Array.from({ length: STEPS }, (_, i) => el('span', { class: i === step ? 'on' : '' })));
  $('#w-back').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('#w-next').textContent = step === STEPS - 1 ? '¡Listo, empezar!' : 'Siguiente';
  if (step === 2) renderWelcomeBills();
  if (step === 3) updateWelcomeLabels();
  if (step === 4) renderCardList($('#w-cards'));
  window.scrollTo(0, 0);
}

function renderWelcomeBills() {
  renderBillList($('#w-bills'));
  const have = new Set(S().bills.map(b => b.name.toLowerCase()));
  $('#w-bill-suggestions').replaceChildren(...BILL_SUGGESTIONS.filter(s => !have.has(s.name.toLowerCase()))
    .map(s => el('button', { type: 'button', class: 'chip', onclick: () => openBillEditor(null, s) }, `${s.emoji} ${s.name}`)));
}

$('#w-income').addEventListener('input', updateWelcomeLabels);
$('#w-signin-btn').addEventListener('click', () => cloud.signIn());

$('#w-back').addEventListener('click', () => { if (step > 0) { step--; renderStep(); } });

$('#w-next').addEventListener('click', () => {
  if (step === 0) {
    const name = $('#w-name').value.trim();
    if (!name) { toast('¿Cómo te llamas? 🙂'); $('#w-name').focus(); return; }
    S().name = name;
  }
  if (step === 1) {
    const income = parseAmount($('#w-income').value);
    const days = readPayDays($('#w-days'));
    if (isNaN(income) || income <= 0) { toast('Escribe cuánto recibes'); $('#w-income').focus(); return; }
    if (days.length !== (wFreq === 'mensual' ? 1 : 2) || new Set(days).size !== days.length) { toast('Revisa los días de pago'); return; }
    Object.assign(S(), { payFreq: wFreq, payDays: days, fixedIncome: income });
  }
  if (step === 3) {
    const raw = $('#w-savings').value.trim();
    const savings = raw ? parseAmount(raw) : 0;
    if (isNaN(savings) || savings < 0) { toast('Revisa el monto de ahorro'); return; }
    if (savings >= S().fixedIncome) { toast('El ahorro no puede ser todo tu sueldo 😉'); return; }
    S().savings = savings;
  }
  if (step < STEPS - 1) {
    save();
    step++;
    renderStep();
    return;
  }
  S().onboarded = true;
  saveSettings();
  boot();
  toast(`¡Listo, ${S().name}! Ya puedes anotar tus gastos 🎉`);
});

/* =========================================================
   Navegación
   ========================================================= */

let currentView = 'home';

function go(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.goto === view));
  render();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => go(b.dataset.goto)));
document.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => openMove(null, b.dataset.new)));
document.querySelectorAll('[data-add="bill"]').forEach(b => b.addEventListener('click', () => openBillEditor(null)));
document.querySelectorAll('[data-add="card"]').forEach(b => b.addEventListener('click', () => openCardEditor(null)));

function render() {
  const cur = currentPeriod();
  $('#period-label').textContent = periodLabel(cur);
  const titles = { home: `Hola, ${S().name || 'tú'} 👋`, moves: 'Movimientos', cards: 'Tarjetas', settings: 'Ajustes' };
  $('#view-title').textContent = titles[currentView];
  if (currentView === 'home') renderHome();
  else if (currentView === 'moves') renderMoves();
  else if (currentView === 'cards') renderCards();
  else if (currentView === 'settings') renderSettings();
  renderAccount();
}

function boot() {
  if (!S().onboarded) { showWelcome(); return; }
  $('#welcome').hidden = true;
  $('#app').hidden = false;
  render();
}

/* =========================================================
   Vista: Inicio
   ========================================================= */

const RING = 2 * Math.PI * 52;

function renderHome() {
  const b = budgetFor(currentPeriod());
  const mood = moodOf(b);

  $('#hero').dataset.mood = mood.key;
  $('#mood-emoji').textContent = mood.emoji;
  $('#mood-text').textContent = mood.text;
  $('#hero-amount').textContent = fmtQ(b.left);
  const remainingRatio = b.base > 0 ? Math.max(0, Math.min(1, b.left / b.base)) : 0;
  $('#ring-fg').style.strokeDasharray = RING;
  $('#ring-fg').style.strokeDashoffset = RING * (1 - remainingRatio);
  $('#hero-sub').textContent = b.left > 0
    ? `≈ ${fmtQ(b.left / b.daysLeft)} al día · ${b.daysLeft} día${b.daysLeft === 1 ? '' : 's'} para tu próximo pago`
    : `Tu próximo pago es el ${fmtWeekday(b.p.next)}`;

  const tip = tipFor(b);
  $('#tip').hidden = !tip;
  $('#tip').textContent = tip || '';

  renderBreakdown(b);
  renderBills(b);
  renderCategories(b);
  renderReminders(b);
}

function renderBreakdown(b) {
  const row = (cls, label, value) => el('div', { class: `row ${cls}` }, el('span', {}, label), el('span', {}, value));
  $('#breakdown').replaceChildren(
    row('plus', '💼 Sueldo fijo', `+ ${fmtQ(S().fixedIncome)}`),
    b.extra ? row('plus', '✨ Ingresos extra', `+ ${fmtQ(b.extra)}`) : null,
    b.billsTotal ? row('minus', '🧾 Pagos fijos', `− ${fmtQ(b.billsTotal)}`) : null,
    S().savings ? row('minus', '🐷 Tu ahorro', `− ${fmtQ(S().savings)}`) : null,
    row('minus', '🛍️ Lo que has gastado', `− ${fmtQ(b.spent)}`),
    row('total', 'Te queda', fmtQ(b.left)),
    el('p', { class: 'note' }, 'Tus ingresos extra solo cuentan cuando los anotas: así nunca gastas dinero que todavía no tienes.'));
}

function renderBills(b) {
  $('#bills-title').hidden = !S().bills.length;
  if (!S().bills.length) { $('#bills-list').replaceChildren(); return; }
  if (!b.bills.length) {
    $('#bills-list').replaceChildren(el('li', { class: 'empty' }, 'No tienes pagos fijos en este periodo 🎉'));
    return;
  }
  $('#bills-list').replaceChildren(...b.bills.map(bill => {
    const key = `${b.p.key}|${bill.id}`;
    return el('li', { class: bill.paid ? 'paid' : '' },
      el('span', { class: 'emoji' }, bill.emoji),
      el('div', { class: 'main' }, el('div', {}, bill.name), el('div', { class: 'meta' }, bill.paid ? 'Pagado ✓' : `Vence el ${fmtWeekday(bill.due)}`)),
      el('span', { class: 'amt' }, fmtQ(bill.amount)),
      el('button', {
        type: 'button', class: 'check', 'aria-pressed': String(bill.paid), 'aria-label': `Marcar ${bill.name} como pagado`,
        onclick: () => {
          S().paid = bill.paid ? S().paid.filter(k => k !== key) : [...S().paid, key];
          saveSettings();
          renderHome();
          if (!bill.paid) toast(`${bill.emoji} ${bill.name} pagado. ¡Uno menos!`);
        },
      }, '✓'));
  }));
}

function renderCategories(b) {
  const totals = categoryTotals(b.gastos);
  if (!totals.length) {
    $('#categories').replaceChildren(el('p', { class: 'muted small', style: 'margin:0' }, 'Cuando anotes gastos verás aquí en qué se va tu dinero.'));
    return;
  }
  const max = totals[0].total;
  $('#categories').replaceChildren(...totals.map(({ cat, total }) => el('div', { class: 'cat-row', style: `--c:${cat.color}` },
    el('span', { class: 'emoji' }, cat.emoji),
    el('span', { class: 'name' }, cat.name),
    el('span', { class: 'amt' }, fmtQ(total)),
    el('div', { class: 'bar' }, el('span', { style: `width:${(total / max) * 100}%` })))));
}

/** Avisos cuando faltan 3 días o menos: cortes y pagos de tarjetas, pagos fijos y día de pago. */
function renderReminders(b) {
  const today = parseYmd(todayStr());
  const notes = [];
  const when = (diff, date) => (diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `El ${fmtWeekday(date)}`);

  const payDiff = daysBetween(today, b.p.next);
  if (payDiff <= 1) notes.push({ diff: payDiff, happy: true, text: `🎉 ${when(payDiff, b.p.next)} es día de pago. ¡Empieza un periodo nuevo!` });

  for (const bill of b.bills) {
    const diff = daysBetween(today, bill.due);
    if (bill.paid || diff > 3) continue;
    notes.push(diff >= 0
      ? { diff, text: `⏰ ${when(diff, bill.due)} vence ${bill.emoji} ${bill.name} (${fmtQ(bill.amount)}).` }
      : { diff, text: `⏰ ${bill.emoji} ${bill.name} venció el ${fmtWeekday(bill.due)}. ¿Ya lo pagaste? Márcalo abajo ✓` });
  }

  for (const card of S().cards) {
    const cur = cycleKeyFor(card, todayStr());
    const info = cycleInfo(card, cur);
    const corteDiff = daysBetween(today, info.corte);
    if (corteDiff <= 3) {
      notes.push({ diff: corteDiff, text: `💳 ${when(corteDiff, info.corte)} es el corte de ${card.name}. Llevas ${fmtQ(sumQ(cardMoves(card, cur)))}.` });
    }
    const prev = addMonths(cur, -1);
    const prevPago = cycleInfo(card, prev).pago;
    const [key, pagoDate] = daysBetween(today, prevPago) >= 0 ? [prev, prevPago] : [cur, info.pago];
    const pagoDiff = daysBetween(today, pagoDate);
    const due = pagoDiff <= 3 ? sumQ(cardMoves(card, key)) : 0;
    if (due > 0) notes.push({ diff: pagoDiff, text: `💳 ${when(pagoDiff, pagoDate)} pagas ${card.name}: ${fmtQ(due)}.` });
  }

  notes.sort((a, b2) => a.diff - b2.diff);
  $('#reminders').replaceChildren(...notes.map(n => el('div', { class: `reminder${n.happy ? ' happy' : ''}` }, n.text)));
}

/* =========================================================
   Vista: Movimientos
   ========================================================= */

let mvPeriod = null;
let mvFilter = 'all';

$('#mv-prev').addEventListener('click', () => { mvPeriod = shiftPeriod(mvPeriod, -1); renderMoves(); });
$('#mv-next').addEventListener('click', () => { mvPeriod = shiftPeriod(mvPeriod, 1); renderMoves(); });
segmented($('#mv-filter'), 'filter', mvFilter, f => { mvFilter = f; renderMoves(); });

function moveItem(m) {
  const isIncome = m.type === 'ingreso';
  const cat = catById(m.category);
  const method = isIncome ? 'Ingreso' : (cardById(m.method)?.name || 'Efectivo / débito');
  return el('li', { class: isIncome ? 'income' : '', onclick: () => openMove(m.id) },
    el('span', { class: 'emoji' }, isIncome ? '💰' : cat.emoji),
    el('div', { class: 'main' }, el('div', { class: 'desc' }, m.desc || (isIncome ? 'Ingreso' : cat.name)), el('div', { class: 'meta' }, method)),
    el('div', { class: 'amt' },
      `${isIncome ? '+ ' : ''}${m.currency === 'USD' ? fmtUSD(m.amount) : fmtQ(m.amount)}`,
      m.currency === 'USD' ? el('small', {}, `≈ ${fmtQ(inQ(m))}`) : null));
}

function renderMoves() {
  if (!mvPeriod) mvPeriod = currentPeriod();
  const b = budgetFor(mvPeriod);
  $('#mv-period').textContent = periodLabel(mvPeriod);
  $('#mv-summary').textContent = `Gastaste ${fmtQ(b.spent)}${b.extra ? ` · extra ${fmtQ(b.extra)}` : ''}${b.isCurrent ? '' : ` · te quedó ${fmtQ(b.left)}`}`;

  const list = b.moves
    .filter(m => mvFilter === 'all' || m.type === mvFilter)
    .sort((a, c) => c.date.localeCompare(a.date) || c.createdAt - a.createdAt);

  if (!list.length) {
    $('#mv-list').replaceChildren(el('div', { class: 'empty-state' }, el('div', { class: 'big-emoji' }, '🌱'), 'No hay movimientos en este periodo.'));
    return;
  }
  const groups = [];
  for (const m of list) {
    if (!groups.length || groups[groups.length - 1].date !== m.date) groups.push({ date: m.date, items: [] });
    groups[groups.length - 1].items.push(m);
  }
  $('#mv-list').replaceChildren(...groups.flatMap(g => [
    el('p', { class: 'day-title' }, `${fmtWeekday(parseYmd(g.date))} de ${MONTHS[parseYmd(g.date).getMonth()]}`),
    el('ul', { class: 'move-list' }, g.items.map(moveItem)),
  ]));
}

/* =========================================================
   Vista: Tarjetas
   ========================================================= */

let cardDetail = null;   // { id, key }

function renderCards() {
  const cards = S().cards;
  $('#card-detail').hidden = !cardDetail;
  $('#cards-summary').hidden = !!cardDetail;
  if (cardDetail) return renderCardDetail();

  if (!cards.length) {
    $('#cards-summary').replaceChildren(el('div', { class: 'empty-state' }, el('div', { class: 'big-emoji' }, '💳'),
      'No tienes tarjetas agregadas.', el('br'),
      el('button', { type: 'button', class: 'link', onclick: () => openCardEditor(null) }, 'Agregar una tarjeta')));
    return;
  }
  $('#cards-summary').replaceChildren(...cards.map(card => {
    const key = cycleKeyFor(card, todayStr());
    const info = cycleInfo(card, key);
    return el('button', { type: 'button', class: 'card card-tile', style: `--c:${card.color}`, onclick: () => { cardDetail = { id: card.id, key }; renderCards(); } },
      el('div', { class: 'main' },
        el('div', { class: 'name' }, card.name),
        el('div', { class: 'meta' }, `Corte ${fmtDay(info.corte)} · Pago ${fmtDay(info.pago)}`)),
      el('div', { class: 'total' }, fmtQ(sumQ(cardMoves(card, key)))));
  }));
}

function renderCardDetail() {
  const card = cardById(cardDetail.id);
  if (!card) { cardDetail = null; return renderCards(); }
  const info = cycleInfo(card, cardDetail.key);
  const moves = cardMoves(card, cardDetail.key);
  const nav = n => () => { cardDetail.key = addMonths(cardDetail.key, n); renderCardDetail(); };
  $('#card-detail').replaceChildren(
    el('button', { type: 'button', class: 'link', style: 'margin-bottom:12px', onclick: () => { cardDetail = null; renderCards(); } }, '‹ Todas las tarjetas'),
    el('div', { class: 'card period-nav', style: `border-top:5px solid ${card.color}` },
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ciclo anterior', onclick: nav(-1) }, '‹'),
      el('div', { class: 'period-info' },
        el('strong', {}, card.name),
        el('span', { class: 'muted small' }, `${fmtDay(info.start)} – ${fmtDay(info.corte)} · pagas el ${fmtDay(info.pago)}`),
        el('span', { style: 'font-size:1.6rem;font-weight:800;margin-top:6px' }, fmtQ(sumQ(moves)))),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ciclo siguiente', onclick: nav(1) }, '›')),
    moves.length
      ? el('ul', { class: 'move-list' }, moves.map(moveItem))
      : el('div', { class: 'empty-state' }, 'Sin compras en este ciclo.'));
}

/* =========================================================
   Nuevo / editar movimiento
   ========================================================= */

const mv = { id: null, type: 'gasto', currency: 'GTQ', category: null, method: 'efectivo' };

function methodOptions() {
  return [{ id: 'efectivo', label: '💵 Efectivo / débito' },
    ...S().cards.map(c => ({ id: c.id, label: c.name, dot: c.color }))];
}

function openMove(id, type = 'gasto') {
  const m = id ? db.movements.find(x => x.id === id) : null;
  Object.assign(mv, m
    ? { id: m.id, type: m.type, currency: m.currency || 'GTQ', category: m.category || null, method: m.method || 'efectivo' }
    : { id: null, type, currency: 'GTQ', category: null, method: cardById(S().lastMethod) ? S().lastMethod : 'efectivo' });
  $('#m-amount').value = m ? m.amount : '';
  $('#m-desc').value = m ? m.desc : '';
  $('#m-date').value = m ? m.date : todayStr();
  $('#m-delete').hidden = !m;
  segmented($('#m-type'), 'type', mv.type, t => { mv.type = t; renderMoveForm(); });
  renderMoveForm();
  renderSuggestions();
  $('#move-dialog').showModal();
  if (!m) setTimeout(() => $('#m-amount').focus(), 50);
}

function renderMoveForm() {
  const isGasto = mv.type === 'gasto';
  $('#m-desc').placeholder = isGasto ? '¿En qué lo gastaste?' : '¿De dónde viene? (ej. venta, extra, comisión)';
  $('#m-cat-field').hidden = !isGasto;
  $('#m-method-field').hidden = !isGasto;
  radioChips($('#m-category'), CATEGORIES.map(c => ({ id: c.id, label: `${c.emoji} ${c.name}` })), mv.category, id => { mv.category = id; });
  radioChips($('#m-method'), methodOptions(), mv.method, id => { mv.method = id; });
  setCurrency();
}

function setCurrency() {
  const btn = $('#m-currency');
  btn.textContent = mv.currency === 'USD' ? '$' : 'Q';
  btn.classList.toggle('usd', mv.currency === 'USD');
  const amount = parseAmount($('#m-amount').value);
  const hint = $('#m-conversion');
  hint.hidden = mv.currency !== 'USD';
  hint.textContent = !isNaN(amount) ? `≈ ${fmtQ(amount * S().rate)} (tipo de cambio ${S().rate})` : `En dólares · tipo de cambio ${S().rate}`;
}

$('#m-currency').addEventListener('click', () => { mv.currency = mv.currency === 'USD' ? 'GTQ' : 'USD'; setCurrency(); $('#m-amount').focus(); });
$('#m-amount').addEventListener('input', setCurrency);
$('#m-cancel').addEventListener('click', () => $('#move-dialog').close());

function renderSuggestions() {
  const seen = new Set();
  const opts = [];
  for (const m of [...db.movements].sort((a, b) => b.createdAt - a.createdAt)) {
    const k = (m.desc || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    opts.push(el('option', { value: m.desc }));
    if (opts.length >= 60) break;
  }
  $('#desc-suggestions').replaceChildren(...opts);
}

// Si la descripción ya se usó, propone la misma categoría y forma de pago.
$('#m-desc').addEventListener('change', () => {
  const desc = $('#m-desc').value.trim().toLowerCase();
  const prev = [...db.movements].sort((a, b) => b.createdAt - a.createdAt).find(m => (m.desc || '').toLowerCase() === desc && m.type === mv.type);
  if (!prev || mv.id) return;
  if (prev.category) mv.category = prev.category;
  if (prev.method && (prev.method === 'efectivo' || cardById(prev.method))) mv.method = prev.method;
  renderMoveForm();
});

$('#move-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const amount = parseAmount($('#m-amount').value);
  const desc = $('#m-desc').value.trim();
  const date = $('#m-date').value;
  const isGasto = mv.type === 'gasto';
  if (isNaN(amount) || amount <= 0) { toast('Escribe un monto'); $('#m-amount').focus(); return; }
  if (isGasto && !mv.category) { toast('Elige una categoría'); return; }
  if (!date) { toast('Elige una fecha'); return; }

  const data = {
    type: mv.type, amount, currency: mv.currency,
    rate: mv.currency === 'USD' ? S().rate : null,
    desc, date,
    category: isGasto ? mv.category : null,
    method: isGasto ? mv.method : null,
  };
  let saved;
  if (mv.id) {
    saved = db.movements.find(m => m.id === mv.id);
    if (saved.currency === 'USD' && data.currency === 'USD') data.rate = saved.rate || data.rate;
    Object.assign(saved, data);
  } else {
    saved = { id: uid(), createdAt: Date.now(), ...data };
    db.movements.push(saved);
  }
  if (isGasto) S().lastMethod = mv.method;
  save();
  sync({ type: 'put', id: saved.id });
  $('#move-dialog').close();

  if (mv.id) toast('Movimiento actualizado');
  else if (!isGasto) toast(`¡Bien! +${fmtQ(inQ(saved))} 💰`);
  else {
    const b = budgetFor(currentPeriod());
    toast(inPeriod(b.p, date) ? `Anotado. Te quedan ${fmtQ(b.left)}` : 'Gasto anotado');
  }
  render();
});

$('#m-delete').addEventListener('click', () => {
  if (!confirm('¿Eliminar este movimiento?')) return;
  db.movements = db.movements.filter(m => m.id !== mv.id);
  save();
  sync({ type: 'remove', id: mv.id });
  $('#move-dialog').close();
  toast('Eliminado');
  render();
});

/* =========================================================
   Pagos fijos
   ========================================================= */

const billEdit = { id: null, emoji: '🧾' };

function renderBillList(container) {
  const bills = [...S().bills].sort((a, b) => a.day - b.day);
  container.replaceChildren(...(bills.length ? bills.map(b => el('li', { onclick: () => openBillEditor(b.id) },
    el('span', { class: 'emoji' }, b.emoji),
    el('div', { class: 'main' }, el('div', {}, b.name), el('div', { class: 'meta' }, `Día ${b.day} de cada mes`)),
    el('strong', {}, fmtQ(b.amount)))) : [el('li', { class: 'empty' }, 'Aún no tienes pagos fijos.')]));
}

function openBillEditor(id, preset = null) {
  const bill = id ? S().bills.find(b => b.id === id) : null;
  billEdit.id = bill ? bill.id : null;
  billEdit.emoji = bill ? bill.emoji : (preset ? preset.emoji : '🧾');
  $('#bill-title').textContent = bill ? 'Editar pago fijo' : 'Nuevo pago fijo';
  $('#b-name').value = bill ? bill.name : (preset ? preset.name : '');
  $('#b-amount').value = bill ? bill.amount : '';
  $('#b-day').value = bill ? bill.day : '';
  $('#b-delete').hidden = !bill;
  radioChips($('#b-emoji'), BILL_EMOJIS.map(e => ({ id: e, label: e })), billEdit.emoji, e => { billEdit.emoji = e; });
  $('#bill-dialog').showModal();
}

$('#b-cancel').addEventListener('click', () => $('#bill-dialog').close());

$('#bill-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('#b-name').value.trim();
  const amount = parseAmount($('#b-amount').value);
  const day = clampInt($('#b-day').value, 1, 31, null);
  if (!name) { toast('Ponle un nombre'); return; }
  if (isNaN(amount) || amount <= 0) { toast('Escribe el monto'); return; }
  if (!day) { toast('Día del mes entre 1 y 31'); return; }
  const data = { name, amount, day, emoji: billEdit.emoji };
  if (billEdit.id) Object.assign(S().bills.find(b => b.id === billEdit.id), data);
  else S().bills.push({ id: uid(), ...data });
  saveSettings();
  $('#bill-dialog').close();
  toast(billEdit.id ? 'Pago fijo actualizado' : `${data.emoji} ${name} agregado`);
  refreshAfterEdit();
});

$('#b-delete').addEventListener('click', () => {
  if (!confirm('¿Eliminar este pago fijo?')) return;
  S().bills = S().bills.filter(b => b.id !== billEdit.id);
  saveSettings();
  $('#bill-dialog').close();
  refreshAfterEdit();
});

/* =========================================================
   Tarjetas (agregar / editar / eliminar)
   ========================================================= */

const cardEdit = { id: null, color: CARD_COLORS[0] };

function renderCardList(container) {
  const cards = S().cards;
  container.replaceChildren(...(cards.length ? cards.map(c => el('li', { class: 'color', style: `--c:${c.color}`, onclick: () => openCardEditor(c.id) },
    el('div', { class: 'main' }, el('div', {}, c.name), el('div', { class: 'meta' }, `Corte día ${c.corte} · Pago día ${c.pago}`)),
    el('span', { class: 'chev' }, '›'))) : [el('li', { class: 'empty' }, 'Aún no tienes tarjetas.')]));
}

function renderSwatches() {
  $('#c-colors').replaceChildren(...CARD_COLORS.map(color => el('button', {
    type: 'button', class: 'swatch', role: 'radio', style: `--c:${color}`, 'aria-label': color,
    'aria-checked': String(color === cardEdit.color), onclick: () => { cardEdit.color = color; renderSwatches(); },
  })));
}

function openCardEditor(id) {
  const card = id ? cardById(id) : null;
  cardEdit.id = card ? card.id : null;
  cardEdit.color = card ? card.color : (CARD_COLORS.find(c => !S().cards.some(x => x.color === c)) || CARD_COLORS[0]);
  $('#card-title').textContent = card ? 'Editar tarjeta' : 'Nueva tarjeta';
  $('#c-name').value = card ? card.name : '';
  $('#c-corte').value = card ? card.corte : '';
  $('#c-pago').value = card ? card.pago : '';
  $('#c-delete').hidden = !card;
  renderSwatches();
  $('#card-dialog').showModal();
}

$('#c-cancel').addEventListener('click', () => $('#card-dialog').close());

$('#card-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('#c-name').value.trim();
  const corte = clampInt($('#c-corte').value, 1, 31, null);
  const pago = clampInt($('#c-pago').value, 1, 31, null);
  if (!name) { toast('Ponle un nombre a la tarjeta'); return; }
  if (!corte) { toast('Día de corte entre 1 y 31'); return; }
  if (!pago) { toast('Día de pago entre 1 y 31'); return; }
  const data = { name, corte, pago, color: cardEdit.color };
  if (cardEdit.id) Object.assign(cardById(cardEdit.id), data);
  else S().cards.push({ id: uid(), ...data });
  saveSettings();
  $('#card-dialog').close();
  toast(cardEdit.id ? 'Tarjeta actualizada' : `💳 ${name} agregada`);
  refreshAfterEdit();
});

$('#c-delete').addEventListener('click', () => {
  const card = cardById(cardEdit.id);
  const count = db.movements.filter(m => m.method === card.id).length;
  const msg = count
    ? `${card.name} tiene ${count} gasto${count === 1 ? '' : 's'}. Los gastos se quedan en tu historial como "Efectivo / débito". ¿Eliminar la tarjeta?`
    : `¿Eliminar ${card.name}?`;
  if (!confirm(msg)) return;
  S().cards = S().cards.filter(c => c.id !== card.id);
  for (const m of db.movements.filter(x => x.method === card.id)) {
    m.method = 'efectivo';
    sync({ type: 'put', id: m.id });
  }
  if (S().lastMethod === card.id) S().lastMethod = 'efectivo';
  save();
  saveSettings();
  $('#card-dialog').close();
  cardDetail = null;
  refreshAfterEdit();
});

function refreshAfterEdit() {
  if (!$('#welcome').hidden) { renderStep(); return; }
  render();
}

/* =========================================================
   Vista: Ajustes
   ========================================================= */

let sFreq = null;

function renderSettings() {
  sFreq = S().payFreq;
  $('#s-name').value = S().name;
  $('#s-income').value = S().fixedIncome || '';
  $('#s-savings').value = S().savings || '';
  $('#s-rate').value = S().rate;
  segmented($('#s-freq'), 'freq', sFreq, f => { sFreq = f; renderPayDayInputs($('#s-days'), f, S().payDays); });
  renderPayDayInputs($('#s-days'), sFreq, S().payDays);
  renderBillList($('#s-bills'));
  renderCardList($('#s-cards'));
}

$('#s-save').addEventListener('click', () => {
  const name = $('#s-name').value.trim();
  const income = parseAmount($('#s-income').value);
  const savingsRaw = $('#s-savings').value.trim();
  const savings = savingsRaw ? parseAmount(savingsRaw) : 0;
  const rate = parseAmount($('#s-rate').value);
  const days = readPayDays($('#s-days'));
  if (!name) { toast('Escribe tu nombre'); return; }
  if (isNaN(income) || income <= 0) { toast('Revisa tu sueldo fijo'); return; }
  if (isNaN(savings) || savings < 0 || savings >= income) { toast('Revisa el ahorro'); return; }
  if (isNaN(rate) || rate <= 0) { toast('Revisa el tipo de cambio'); return; }
  if (days.length !== (sFreq === 'mensual' ? 1 : 2) || new Set(days).size !== days.length) { toast('Revisa los días de pago'); return; }
  Object.assign(S(), { name, fixedIncome: income, savings, rate, payFreq: sFreq, payDays: days });
  mvPeriod = null;
  saveSettings();
  toast('Guardado ✓');
  render();
});

const SYNC_TEXT = {
  syncing: { short: 'Sincronizando…', long: 'Sincronizando tus datos…' },
  pending: { short: 'Guardando…', long: 'Guardando cambios en la nube…' },
  offline: { short: 'Sin conexión', long: 'Sin conexión. Tus cambios se guardan aquí y se subirán al reconectar.' },
  ok: { short: 'Guardado', long: '✓ Todo guardado en tu cuenta de Google.' },
  error: { short: 'Error', long: 'No se pudo sincronizar. Se reintentará solo.' },
};

function renderAccount() {
  const box = $('#account');
  const pill = $('#sync-pill');
  $('#w-signin').hidden = !cloud.ready || !!account;
  box.hidden = cloud.disabled;
  pill.hidden = cloud.disabled || (!account && !cloud.ready);
  const status = account && SYNC_TEXT[account.status];
  pill.textContent = account ? `☁︎ ${status ? status.short : ''}` : '☁︎ Respaldar';
  pill.dataset.state = account ? account.status : 'off';
  if (cloud.disabled) return;

  if (account) {
    box.replaceChildren(
      el('div', { class: 'account-row' },
        account.photo ? el('img', { src: account.photo, alt: '', referrerpolicy: 'no-referrer', class: 'avatar' }) : null,
        el('div', { class: 'main' }, el('strong', {}, account.name || 'Tu cuenta'), el('div', { class: 'muted small' }, account.email || ''))),
      el('p', { class: 'small sync-status', 'data-state': account.status }, status ? status.long : ''),
      el('button', { type: 'button', onclick: () => cloud.signOut() }, 'Cerrar sesión'));
  } else if (cloud.ready) {
    box.replaceChildren(
      el('h3', {}, 'Guarda tus datos en tu cuenta'),
      el('p', { class: 'muted small' }, 'Inicia sesión con Google para respaldar todo automáticamente y no perder nada si cambias de teléfono. Solo tú puedes verlo.'),
      el('button', { type: 'button', class: 'primary', onclick: () => cloud.signIn() }, 'Iniciar sesión con Google'));
  } else {
    box.replaceChildren(el('p', { class: 'muted small', style: 'margin:0' }, cloud.unavailable
      ? 'Sin conexión: podrás iniciar sesión con Google cuando tengas internet. Tus datos se siguen guardando en este teléfono.'
      : 'Conectando…'));
  }
}

/* ---------- Respaldo ---------- */

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#export-btn').addEventListener('click', () => download(`mi-presupuesto-${todayStr()}.json`, JSON.stringify(db, null, 2), 'application/json'));

$('#export-csv-btn').addEventListener('click', () => {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Forma de pago', 'Moneda', 'Monto', 'Monto en Q']];
  for (const m of [...db.movements].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([m.date, m.type, m.desc, m.type === 'gasto' ? catById(m.category).name : '',
      m.type === 'gasto' ? (cardById(m.method)?.name || 'Efectivo / débito') : '',
      m.currency === 'USD' ? 'USD' : 'GTQ', m.amount.toFixed(2), inQ(m).toFixed(2)]);
  }
  download(`mi-presupuesto-${todayStr()}.csv`, '﻿' + rows.map(r => r.map(esc).join(',')).join('\n'), 'text/csv');
});

$('#import-input').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`El respaldo tiene ${data.movements.length} movimientos. Reemplazará los datos actuales. ¿Continuar?`)) return;
    db = data;
    save();
    sync({ type: 'all' });
    toast('Respaldo restaurado');
    boot();
  } catch (_) {
    toast('Archivo de respaldo inválido');
  }
});

/* =========================================================
   Inicio
   ========================================================= */

// Al volver a la app (p. ej. al día siguiente) refresca fechas y avisos.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S().onboarded && !document.querySelector('dialog[open]')) render();
});

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

boot();
