/* Consultancy CRM – clients, quotations, tasks, payments & reminders.
   Works on its own in the browser (data saved on this device), or shared through a Google Sheet
   with staff logins, activity log, reminder emails and Google Calendar. */
"use strict";

/* ===================== constants ===================== */
const KEY = "consultCRM.v1";
const KINDS = ["clients", "tasks", "payments", "bills"];
const STAGES = ["Enquiry", "Quotation sent", "Negotiation", "Won", "Lost"];
const STAGE_PILL = { "Enquiry": "blue", "Quotation sent": "amber", "Negotiation": "purple", "Won": "green", "Lost": "gray" };
const STAGE_COLOR = { "Enquiry": "#2563eb", "Quotation sent": "#d97706", "Negotiation": "#7c3aed", "Won": "#16a34a", "Lost": "#64748b" };
const OPEN_STAGES = ["Enquiry", "Quotation sent", "Negotiation"];
const ROLES = {
  Admin: ["edit", "delete", "export", "activity", "settings", "users"],
  Manager: ["edit", "delete", "export", "activity"],
  Staff: ["edit"],
  Viewer: []
};
const REPEATS = { "": "Does not repeat", weekly: "Every week", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };
const METHODS = ["Bank transfer", "Cash", "Cheque", "Card", "Other"];
const DEFAULT_SETTINGS = {
  companyName: "My Consultancy",
  appUrl: "",
  country: "971",
  bankDetails: "",
  remindEvery: 7,
  followUpDays: 3,
  billRemindDays: 3,
  businesses: [
    { id: "gts", name: "Gotrack Tech Services FZC", short: "Gotrack Tech", color: "#2563eb", bank: "" },
    { id: "gtc", name: "Gotrack Tax Consultancy", short: "Gotrack Tax", color: "#0f766e", bank: "" },
    { id: "ncs", name: "Netwave Computer Systems", short: "Netwave", color: "#c2410c", bank: "" }
  ],
  expenseCategories: ["Rent", "Salaries", "DEWA / utilities", "Telecom / internet", "Software subscriptions", "Supplier / purchase", "Licence renewal", "Visa / immigration", "VAT payment to FTA", "Corporate tax payment", "Insurance", "Loan / card payment", "Other"],
  services: ["VAT registration", "VAT return filing", "Corporate tax registration", "Corporate tax filing", "Accounting / bookkeeping", "Audit", "Company formation", "Software / ERP", "Other"],
  sources: ["WhatsApp", "Phone call", "Referral", "Website", "Walk-in", "Instagram", "Google", "Existing client"],
  lostReasons: ["Price too high", "Went with another firm", "No response", "Not needed now", "Other"],
  templates: [
    { name: "Thanks for enquiry", text: "Hello {name}, thank you for contacting {company}. We have received your enquiry about {service} and will get back to you shortly." },
    { name: "Quotation sent", text: "Hello {name}, please find our quotation for {service} attached. Let me know if you have any questions." },
    { name: "Quotation follow-up", text: "Hello {name}, just following up on the quotation we sent for {service}. Shall we go ahead?" },
    { name: "Enquiry follow-up", text: "Hello {name}, this is {me} from {company}. Following up on your enquiry about {service} – would you like us to send a quotation, or is there a good time to call?" },
    { name: "Documents request", text: "Hello {name}, to proceed with your {service}, please send us the following documents:\n\n{documents}\n\nYou can send clear photos or PDFs here on WhatsApp. Thank you!" }
  ],
  docLists: [
    { name: "VAT registration", items: ["Trade licence copy (valid)", "Memorandum / Articles of Association (MOA)", "Passport copies of all owners / partners", "Emirates ID copies of all owners / partners",
      "Passport & Emirates ID of the authorised signatory", "Power of attorney / proof of authorised signatory (if not the owner)", "Ejari / tenancy contract of the business premises",
      "Company contact details (email, mobile, address, P.O. Box)", "Bank account details – IBAN letter", "Sales invoices / turnover report for the last 12 months",
      "Expected turnover & expenses for the next 30 days", "Customs registration number (if importing / exporting)", "Details of GCC suppliers / customers (if any)"] },
    { name: "Corporate tax registration", items: ["Trade licence copy (valid)", "Memorandum / Articles of Association (MOA)", "Passport copies of all owners / shareholders", "Emirates ID copies of all owners / shareholders",
      "Passport & Emirates ID of the authorised signatory", "Power of attorney / board resolution for the authorised signatory", "Shareholding details (names and % ownership)",
      "Company contact details (email, mobile, address)", "Financial year start and end dates", "Branch / other trade licences (if any)", "VAT TRN certificate (if VAT registered)"] }
  ],
  payTemplates: [
    { name: "Before due date", text: "Hello {name}, a gentle reminder that {invoice} for {description} ({balance}) is due on {due}. Thank you!\n\n{bank}" },
    { name: "Friendly reminder", text: "Hello {name}, hope you are well. This is a friendly reminder that {invoice} for {description} ({balance}) was due on {due}. Could you please arrange the payment? Thank you.\n\n{bank}" },
    { name: "Overdue notice", text: "Dear {name}, our records show that {balance} for {description} ({invoice}) is now {days} days overdue. Kindly arrange the payment at the earliest, or let us know if there is any issue.\n\n{bank}\n\nThank you,\n{company}" }
  ]
};

/* ===================== state ===================== */
let local = load();
const FIXED_URL = String((window.CRM_CONFIG && window.CRM_CONFIG.apiUrl) || "").trim();
if (FIXED_URL && local.syncUrl !== FIXED_URL) {
  if (local.syncUrl) { local.session = null; KINDS.forEach(k => { local[k] = []; local.dirty[k] = {}; local.deleted[k] = []; }); }
  local.syncUrl = FIXED_URL;
}
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; });
let view = local.view || "home";
let openClientId = null;
let syncState = "local";
let pushTimer = null, pushing = false;
let taskFilter = { show: "open", who: "all", q: "" };
let clientFilter = { q: "", stage: "open", service: "", who: "" };
let payFilter = { show: "unpaid", q: "" };

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  s.deleted = s.deleted || {}; s.dirty = s.dirty || {};
  KINDS.forEach(k => { s[k] = s[k] || []; s.deleted[k] = s.deleted[k] || []; s.dirty[k] = s.dirty[k] || {}; });
  s.activity = s.activity || [];
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
  if (!s.settings.payTemplates || !s.settings.payTemplates.length) s.settings.payTemplates = DEFAULT_SETTINGS.payTemplates;
  s.users = s.users || [];
  s.notified = s.notified || {};
  if (s.view === "today") s.view = "home";
  return s;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { toast("Could not save on this device: " + e.message); } }

/* ===================== helpers ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => ymd(new Date());
const nowHM = () => pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
const addDays = (s, n) => { const d = s ? new Date(s + "T00:00:00") : new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = new Date(s + "T00:00:00"), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s) { if (!s) return ""; const d = new Date(s + "T00:00:00"); return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }
function fmtLong(s) { if (!s) return ""; const d = new Date(s + "T00:00:00"); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
function fmtWhen(iso) { if (!iso) return ""; const d = new Date(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function ago(iso) { if (!iso) return ""; const n = daysBetween(iso.slice(0, 10), today()); return n <= 0 ? "today" : n === 1 ? "yesterday" : n + " days ago"; }
function fmt12(t) { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; }
const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; };
const money = v => "AED " + num(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function dueLabel(t) {
  if (!t.dueDate) return { text: "No date", cls: "muted" };
  const diff = daysBetween(today(), t.dueDate), tm = t.dueTime ? " " + fmt12(t.dueTime) : "";
  if (t.done) return { text: fmtDate(t.dueDate) + tm, cls: "muted" };
  if (diff < 0) return { text: (-diff === 1 ? "1 day late" : -diff + " days late"), cls: "red" };
  if (diff === 0) return { text: "Today" + tm, cls: t.dueTime && t.dueTime < nowHM() ? "red" : "amber" };
  if (diff === 1) return { text: "Tomorrow" + tm, cls: "" };
  return { text: fmtDate(t.dueDate) + tm, cls: "" };
}
function normPhone(raw, cc) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("00") === 0) d = d.slice(2);
  cc = cc || local.settings.country || "971";
  if (cc === "971") {
    if (d.length === 9 && d[0] === "5") return "971" + d;
    if (d.length === 10 && d.indexOf("05") === 0) return "971" + d.slice(1);
    if (d.length === 9 && d[0] === "0") return "971" + d.slice(1);
  } else if (d.length <= 10 && d[0] === "0") return cc + d.slice(1);
  return d;
}
const fmtPhone = p => p ? "+" + p : "";
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2800); }
const me = () => (local.session && local.session.user) || { name: local.settings.myName || "Me", role: "Admin", username: "" };
const syncOn = () => !!(local.syncUrl && local.session && local.session.token);
const can = p => (ROLES[me().role] || []).indexOf(p) >= 0;
const clientById = id => local.clients.find(c => c.id === id);
const staffNames = () => syncOn() ? local.users.filter(u => u.active && u.role !== "Viewer").map(u => u.name) : [];
const clientLabel = c => c ? (c.name || c.company || fmtPhone(c.phone) || "Unnamed") + (c.name && c.company ? " · " + c.company : "") : "";
const shortName = c => c ? (c.name || c.company || fmtPhone(c.phone) || "Unnamed") : "";
const initials = c => (shortName(c).replace(/[^A-Za-z؀-ۿ ]/g, "").split(/\s+/).filter(String).slice(0, 2).map(w => w[0]).join("") || "?").toUpperCase();
const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label == null ? v : label)}</option>`;

/* ===== your companies (Gotrack Tech, Gotrack Tax, Netwave …) ===== */
const bizList = () => (local.settings.businesses || []).filter(b => b && b.id && b.name);
const multiBiz = () => bizList().length > 1;
const bizById = id => bizList().find(b => b.id === id);
const bizName = id => { const b = bizById(id); return b ? b.name : ""; };
const defaultBiz = () => local.biz || (bizList()[0] || {}).id || "";
// records without a company show everywhere, so nothing is ever hidden by accident
const inBiz = x => !local.biz || !x.biz || x.biz === local.biz;
const inBizClient = c => !local.biz || !c.biz || c.biz === local.biz || local.payments.some(p => p.clientId === c.id && p.biz === local.biz) || local.tasks.some(t => t.clientId === c.id && t.biz === local.biz);
function bizTag(id) {
  if (!multiBiz() || local.biz) return "";
  const b = bizById(id); if (!b) return "";
  return `<span class="biztag" style="--bc:${esc(b.color || "#64748b")}">${esc(b.short || b.name)}</span>`;
}
function bizPicker(idp, cur) {
  if (!multiBiz()) return "";
  cur = cur || defaultBiz();
  return `<label class="f"><span>Company</span><div class="chips" id="${idp}_biz" data-val="${esc(cur)}">${bizList().map(b => `<button type="button" data-b="${esc(b.id)}" class="${b.id === cur ? "on" : ""}" style="--bc:${esc(b.color || "#64748b")}"><span class="bdot"></span>${esc(b.short || b.name)}</button>`).join("")}</div></label>`;
}
function bizPicked(idp) { const el = $("#" + idp + "_biz"); return el ? el.dataset.val : defaultBiz(); }
function setBizPicked(idp, id) { const el = $("#" + idp + "_biz"); if (!el) return; el.dataset.val = id; el.querySelectorAll("[data-b]").forEach(x => x.classList.toggle("on", x.dataset.b === id)); }
function bizSwitcher(cls) {
  if (!multiBiz()) return "";
  return `<select class="${cls || "bizsel"}" id="${cls === "bizsel-m" ? "bizSelM" : "bizSel"}" title="Show one company or all"><option value="">🏢 All companies</option>${bizList().map(b => opt(b.id, local.biz || "", b.name)).join("")}</select>`;
}

/* payments */
const paidOf = p => (p.payments || []).reduce((s, x) => s + num(x.amount), 0);
const balanceOf = p => Math.round((num(p.amount) - paidOf(p)) * 100) / 100;
const isPaid = p => balanceOf(p) <= 0.009;
function payStatus(p) {
  if (isPaid(p)) return { text: "Paid", cls: "green" };
  const d = p.dueDate ? daysBetween(p.dueDate, today()) : -1;
  if (d > 0) return { text: d + (d === 1 ? " day overdue" : " days overdue"), cls: "red" };
  if (d === 0) return { text: "Due today", cls: "amber" };
  return { text: paidOf(p) > 0 ? "Part paid · due " + fmtDate(p.dueDate) : "Due " + fmtDate(p.dueDate), cls: paidOf(p) > 0 ? "amber" : "gray" };
}
const needsChase = p => !isPaid(p) && p.dueDate && p.dueDate <= today() && (!p.nextReminder || p.nextReminder <= today());
const clientBalance = id => local.payments.filter(p => p.clientId === id).reduce((s, p) => s + Math.max(0, balanceOf(p)), 0);

/* document checklists – a client gets the checklist whose name matches their service, or ones added by hand */
const docListByName = n => (local.settings.docLists || []).find(l => l.name === n);
function activeDocLists(c) {
  const names = Array.isArray(c.docLists) ? c.docLists : (local.settings.docLists || []).filter(l => (c.service || "").toLowerCase() === l.name.toLowerCase()).map(l => l.name);
  return names.map(docListByName).filter(Boolean);
}
function docItems(c) { const out = []; activeDocLists(c).forEach(l => l.items.forEach(i => { if (out.indexOf(i) < 0) out.push(i); })); return out; }
const hasDoc = (c, item) => !!(c.docs && c.docs[item]);
const missingDocs = c => docItems(c).filter(i => !hasDoc(c, i));
const docsText = c => missingDocs(c).map((d, i) => (i + 1) + ". " + d).join("\n");

/* theme */
function themeSaved() { try { return localStorage.getItem("consultCRM.theme") || "auto"; } catch (e) { return "auto"; } }
function themeNow() { const t = themeSaved(); return t !== "auto" ? t : (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function setTheme(t) {
  try { if (t === "auto") localStorage.removeItem("consultCRM.theme"); else localStorage.setItem("consultCRM.theme", t); } catch (e) {}
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = themeNow() === "dark" ? "#121b2c" : "#0f766e";
}
const themeBtn = cls => `<button class="${cls || "themebtn"}" data-act="toggletheme" title="Switch light / dark mode">${themeNow() === "dark" ? "☀️" : "🌙"}${cls ? "" : " " + (themeNow() === "dark" ? "Light mode" : "Dark mode")}</button>`;

/* ===================== date & text parsing ===================== */
const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MO = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MONRX = "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december";
function parseDue(text) {
  let s = " " + String(text || "") + " ", date = "", time = "";
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const cut = re => { s = s.replace(re, " "); };
  const lead = "(?:\\b(?:by|on|before|due|until|till)\\s+)?";
  const rx = w => new RegExp(lead + w, "i");
  let m;
  if ((m = s.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i))) { let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; time = pad(h) + ":" + pad(+(m[2] || 0)); cut(m[0]); }
  else if ((m = s.match(/\bat\s+(\d{1,2}):(\d{2})\b/i)) || (m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) { time = pad(+m[1]) + ":" + m[2]; cut(m[0]); }
  if ((m = s.match(rx("\\b(today|tonight|eod|end of (?:the )?day)\\b")))) { date = ymd(base); cut(m[0]); }
  else if ((m = s.match(rx("\\b(day after tomorrow)\\b")))) { date = addDays(ymd(base), 2); cut(m[0]); }
  else if ((m = s.match(rx("\\b(tomorrow|tmrw|tmr|tomorow)\\b")))) { date = addDays(ymd(base), 1); cut(m[0]); }
  else if ((m = s.match(rx("\\bin\\s+(\\d{1,2})\\s+(day|days|week|weeks)\\b")))) { date = addDays(ymd(base), +m[1] * (/week/i.test(m[2]) ? 7 : 1)); cut(m[0]); }
  else if ((m = s.match(rx("\\b(next week)\\b")))) { const d = new Date(base); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); date = ymd(d); cut(m[0]); }
  else if ((m = s.match(rx("\\b(end of (?:the )?month|month end|eom)\\b")))) { date = ymd(new Date(base.getFullYear(), base.getMonth() + 1, 0)); cut(m[0]); }
  else if ((m = s.match(rx("\\b(?:(?:next|this)\\s+)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\\b")))) {
    let diff = (WD[m[1].toLowerCase()] - base.getDay() + 7) % 7; if (diff === 0) diff = 7; date = addDays(ymd(base), diff); cut(m[0]);
  }
  else if ((m = s.match(rx("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MONRX + ")\\b"))) || (m = s.match(rx("\\b(" + MONRX + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b")))) {
    const a = /^\d/.test(m[1]) ? [+m[1], MO[m[2].toLowerCase()]] : [+m[2], MO[m[1].toLowerCase()]];
    let d = new Date(base.getFullYear(), a[1], a[0]); if (d < base) d = new Date(base.getFullYear() + 1, a[1], a[0]); date = ymd(d); cut(m[0]);
  }
  else if ((m = s.match(rx("\\b(\\d{1,2})[\\/.-](\\d{1,2})(?:[\\/.-](\\d{2,4}))?\\b")))) {
    const dd = +m[1], mm = +m[2] - 1; let yy = m[3] ? +m[3] : base.getFullYear(); if (yy < 100) yy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 0 && mm <= 11) { let d = new Date(yy, mm, dd); if (!m[3] && d < base) d = new Date(yy + 1, mm, dd); date = ymd(d); cut(m[0]); }
  }
  else if ((m = s.match(/\b(?:by|on|before)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i))) {
    let d = new Date(base.getFullYear(), base.getMonth(), +m[1]); if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, +m[1]); date = ymd(d); cut(m[0]);
  }
  if (time && !date) date = ymd(base);
  const rest = s.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim().replace(/[\s,-]+$/, "");
  return { date, time, rest };
}
function parseWhatsApp(text) {
  const raw = String(text || "").trim();
  let sender = "", msgs = [];
  raw.split(/\r?\n/).forEach(l => {
    const m = l.match(/^\[?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\]?\s*(?:-\s*)?([^:]{1,60}):\s?(.*)$/i);
    const p = !m && l.match(/^\s*(\+?\d[\d\s-]{7,18}\d)\s*:\s?(.*)$/);
    if (m) { sender = m[1].trim(); msgs.push(m[2]); } else if (p) { sender = p[1]; msgs.push(p[2]); } else if (l.trim()) msgs.push(l.trim());
  });
  const message = msgs.join("\n").trim() || raw;
  const phones = [];
  (raw.match(/(?:\+|00)?\d[\d\s-]{7,16}\d/g) || []).forEach(p => { const n = normPhone(p); if (n.length >= 10 && n.length <= 15 && phones.indexOf(n) < 0) phones.push(n); });
  if (/^\+?[\d\s-]{8,}$/.test(sender)) { const n = normPhone(sender); if (phones.indexOf(n) < 0) phones.unshift(n); sender = ""; }
  return { sender, message, phones };
}
function findClientIn(text) {
  const t = " " + String(text || "").toLowerCase() + " ";
  let best = null, bestLen = 0;
  local.clients.forEach(c => [c.name, c.company].forEach(n => {
    n = String(n || "").trim().toLowerCase(); if (n.length < 3) return;
    if (t.indexOf(n) >= 0 && n.length > bestLen) { best = c; bestLen = n.length; return; }
    const first = n.split(/\s+/)[0];
    if (first.length >= 4 && first.length > bestLen && new RegExp("\\b" + first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t)) { best = c; bestLen = first.length; }
  }));
  return best;
}

/* ===================== data changes ===================== */
function logAct(type, rec, details) {
  local.activity.push({ at: nowIso(), type, recordId: rec ? rec.id : "", record: rec ? (rec.title || rec.description || clientLabel(rec)) : "", details: details || "" });
  if (!syncOn() && local.activity.length > 2000) local.activity = local.activity.slice(-2000);
}
function put(kind, rec) {
  rec.updatedAt = nowIso();
  const list = local[kind], i = list.findIndex(x => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  local.dirty[kind][rec.id] = true;
  persist(); schedulePush();
}
function remove(kind, id) {
  local[kind] = local[kind].filter(x => x.id !== id);
  delete local.dirty[kind][id];
  if (local.deleted[kind].indexOf(id) < 0) local.deleted[kind].push(id);
  persist(); schedulePush();
}
function addHistory(c, kind, text) { c.history = c.history || []; c.history.push({ id: uid(), at: nowIso(), by: me().name, kind, text }); }
function newClient(o) {
  return Object.assign({ id: uid(), createdAt: nowIso(), biz: defaultBiz(), name: "", company: "", phone: "", email: "", service: "", stage: "Enquiry", quoteAmount: "",
    source: "", assignedTo: syncOn() ? me().name : "", notes: "", lostReason: "", trn: "", nextFollowUp: addDays(today(), 1), followUps: 0, history: [] }, o || {});
}
const bizOfClient = id => { const c = id && clientById(id); return (c && c.biz) || defaultBiz(); };
function newTask(o) {
  return Object.assign({ id: uid(), createdAt: nowIso(), createdBy: me().name, biz: bizOfClient(o && o.clientId), title: "", note: "", dueDate: today(), dueTime: "", repeat: "",
    clientId: "", clientName: "", assignedTo: syncOn() ? me().name : "", done: false, doneAt: "", doneBy: "" }, o || {});
}
function newBill(o) {
  return Object.assign({ id: uid(), createdAt: nowIso(), createdBy: me().name, biz: defaultBiz(), vendor: "", description: "", category: "", amount: "",
    dueDate: addDays(today(), 7), repeat: "", reference: "", note: "", paidAt: "", paidAmount: "", paidMethod: "", paidBy: "" }, o || {});
}
function newPayment(o) {
  return Object.assign({ id: uid(), createdAt: nowIso(), createdBy: me().name, biz: bizOfClient(o && o.clientId), clientId: "", clientName: "", description: "", invoiceNo: "", amount: "",
    issueDate: today(), dueDate: addDays(today(), 7), repeat: "", payments: [], reminders: [], nextReminder: "", lastReminderAt: "", note: "" }, o || {});
}
function completeTask(t, done) {
  t.done = done; t.doneAt = done ? nowIso() : ""; t.doneBy = done ? me().name : "";
  put("tasks", t);
  logAct(done ? "Task completed" : "Task reopened", t, t.clientName);
  const c = t.clientId && clientById(t.clientId);
  if (c && done) { addHistory(c, "task", "✔ Done: " + t.title); put("clients", c); }
  if (done && t.repeat && t.dueDate) {
    const next = t.repeat === "weekly" ? addDays(t.dueDate, 7) : addMonths(t.dueDate, { monthly: 1, quarterly: 3, yearly: 12 }[t.repeat]);
    const n = newTask({ title: t.title, note: t.note, dueDate: next, dueTime: t.dueTime, repeat: t.repeat, clientId: t.clientId, clientName: t.clientName, assignedTo: t.assignedTo, biz: t.biz });
    put("tasks", n); logAct("Task added", n, "Repeats: next " + fmtDate(next));
    toast("Done ✔  Next one is on " + fmtDate(next));
  } else if (done) toast("Done ✔");
}
/* repeating invoices: when the next period starts, the next invoice is created automatically */
function generateRecurring() {
  if (!can("edit")) return;
  const td = today(); let made = 0;
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    local.payments.slice().forEach(p => {
      if (!p.repeat || p.stopRepeat) return;
      const step = { weekly: null, monthly: 1, quarterly: 3, yearly: 12 }[p.repeat];
      const nextIssue = p.repeat === "weekly" ? addDays(p.issueDate, 7) : addMonths(p.issueDate, step);
      if (nextIssue > td) return;
      const nid = p.id + "-r";
      if (local.payments.some(x => x.id === nid) || local.deleted.payments.indexOf(nid) >= 0) return;
      const gap = p.dueDate && p.issueDate ? daysBetween(p.issueDate, p.dueDate) : 7;
      const n = newPayment({ id: nid, biz: p.biz, clientId: p.clientId, clientName: p.clientName, description: p.description, amount: p.amount, repeat: p.repeat,
        issueDate: nextIssue, dueDate: addDays(nextIssue, gap), note: p.note, createdBy: "Auto (repeating)" });
      put("payments", n); logAct("Invoice added", n, "Repeating · " + money(n.amount)); made++; changed = true;
    });
    if (!changed) break;
  }
  if (made) toast(made + " repeating invoice(s) created");
}

/* ===================== sync with Google Sheet ===================== */
async function api(action, payload) {
  const body = Object.assign({ action, session: local.session ? local.session.token : "" }, payload || {});
  const res = await fetch(local.syncUrl, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Server responded " + res.status);
  const j = await res.json();
  if (!j.ok) { const e = new Error(j.error || "Request failed"); e.code = j.code; throw e; }
  return j;
}
function setSync(s) { syncState = s; document.querySelectorAll(".syncst").forEach(el => { el.innerHTML = syncLabel(); }); }
function syncLabel() {
  const m = { local: ["", "Saved on this device"], ok: ["ok", "Synced"], busy: ["busy", "Saving…"], err: ["err", "Sync problem – retrying"], offline: ["err", "Offline – will sync later"] }[syncState];
  return '<span class="dot ' + m[0] + '"></span>' + m[1];
}
function schedulePush() { if (!syncOn()) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
async function push() {
  if (!syncOn() || pushing) return;
  const payload = { deleted: {}, activity: local.activity.slice() };
  let any = payload.activity.length > 0;
  const sentAt = {};
  KINDS.forEach(k => {
    payload[k] = Object.keys(local.dirty[k]).map(id => local[k].find(x => x.id === id)).filter(Boolean);
    payload.deleted[k] = local.deleted[k].slice();
    payload[k].forEach(r => { sentAt[k + r.id] = r.updatedAt; });
    if (payload[k].length || payload.deleted[k].length) any = true;
  });
  if (local.settingsDirty) { payload.settings = local.settings; payload.settingsUpdatedAt = local.settingsUpdatedAt; any = true; }
  if (!any) return;
  pushing = true; setSync("busy");
  try {
    const r = await api("save", payload);
    KINDS.forEach(k => {
      payload[k].forEach(x => { const cur = local[k].find(y => y.id === x.id); if (!cur || cur.updatedAt === sentAt[k + x.id]) delete local.dirty[k][x.id]; });
      local.deleted[k] = local.deleted[k].filter(id => payload.deleted[k].indexOf(id) < 0);
    });
    local.activity = local.activity.slice(payload.activity.length);
    if (payload.settings) local.settingsDirty = false;
    (r.denied || []).forEach(id => KINDS.forEach(k => { delete local.dirty[k][id]; }));
    if ((r.denied || []).length) toast("Some changes were not allowed for your role");
    persist(); setSync("ok");
    if (r.calendarError && !push._calWarned) { push._calWarned = true; toast("Google Calendar: " + r.calendarError + " – see Settings → Google Calendar"); }
    if ((r.stale || []).length) { r.stale.forEach(id => KINDS.forEach(k => { delete local.dirty[k][id]; })); toast("Someone else changed a record at the same time – showing the latest version"); await pull(); }
  } catch (e) { handleSyncError(e); }
  finally { pushing = false; }
  if (KINDS.some(k => Object.keys(local.dirty[k]).length)) schedulePush();
}
async function pull() {
  if (!syncOn()) return;
  try {
    setSync("busy");
    const r = await api("list");
    KINDS.forEach(k => {
      const mine = local[k].filter(x => local.dirty[k][x.id]);
      const server = (r[k] || []).filter(x => !local.dirty[k][x.id] && local.deleted[k].indexOf(x.id) < 0);
      local[k] = server.concat(mine);
    });
    local.users = r.users || [];
    if (r.settings && !local.settingsDirty) { local.settings = Object.assign({}, DEFAULT_SETTINGS, r.settings); local.settingsUpdatedAt = r.settingsUpdatedAt; }
    if (r.me) local.session.user = Object.assign(local.session.user || {}, r.me);
    persist(); setSync("ok");
    generateRecurring();
    if (!$("#modal").classList.contains("on")) render();
    push();
  } catch (e) { handleSyncError(e); }
}
function handleSyncError(e) {
  if (e.code === "AUTH") { local.session = null; persist(); toast(e.message); render(); return; }
  setSync(navigator.onLine ? "err" : "offline");
  console.warn("Sync:", e);
  clearTimeout(handleSyncError._t); handleSyncError._t = setTimeout(() => { push(); }, 30000);
}

/* ===================== layout ===================== */
const VIEWS = { home: renderHome, tasks: renderTasks, followups: renderFollowups, clients: renderClients, pipeline: renderPipeline, payments: renderPayments, bills: renderBills, activity: renderActivity, settings: renderSettings };
function counts() {
  const td = today();
  const open = local.tasks.filter(t => !t.done && mineFilter(t) && inBiz(t));
  return {
    tasksDue: open.filter(t => t.dueDate && t.dueDate <= td).length,
    tasksLate: open.filter(t => t.dueDate && (t.dueDate < td || (t.dueDate === td && t.dueTime && t.dueTime < nowHM()))).length,
    chase: local.payments.filter(p => needsChase(p) && inBiz(p)).length,
    follow: local.clients.filter(c => needsFollow(c) && inBizClient(c)).length,
    bills: local.bills.filter(b => billDueSoon(b) && inBiz(b)).length
  };
}
function render() {
  const root = $("#root");
  if (local.syncUrl && !(local.session && local.session.token)) { renderLogin(root); return; }
  if (!VIEWS[view]) view = "home";
  const k = counts();
  const nb = (v, icon, label, n) => `<button class="${view === v ? "active" : ""}" data-nav="${v}"><span>${icon}</span>${label}${n ? `<span class="n">${n}</span>` : ""}</button>`;
  const tb = (v, icon, label, n, also) => `<button data-nav="${v}" class="${view === v || (also || []).indexOf(view) >= 0 ? "active" : ""}"><span class="i">${icon}</span>${label}${n ? `<span class="n">${n}</span>` : ""}</button>`;
  root.innerHTML = `<div class="app">
    <aside class="nav">
      <div class="brand"><img src="icon.svg" alt=""><div>${esc(local.biz ? bizName(local.biz) : local.settings.companyName)}<small>CRM</small></div></div>
      ${bizSwitcher()}
      ${nb("home", "🏠", "Home", k.tasksDue + k.chase + k.follow + k.bills)}
      ${nb("tasks", "✅", "Tasks", k.tasksDue)}
      ${nb("followups", "📞", "Follow-ups", k.follow)}
      ${nb("clients", "👥", "Clients")}
      ${nb("pipeline", "📊", "Quotations")}
      ${nb("payments", "💰", "Clients owe me", k.chase)}
      ${nb("bills", "🧾", "Bills to pay", k.bills)}
      ${can("activity") && syncOn() ? nb("activity", "🕘", "Activity log") : ""}
      ${nb("settings", "⚙️", "Settings")}
      <div class="navfoot"><div class="syncst">${syncLabel()}</div>
        <div class="who"><span>👤 ${esc(me().name)}${syncOn() ? " · " + esc(me().role) : ""}</span>${syncOn() ? `<button class="linkbtn" data-act="logout">Sign out</button>` : ""}</div>
        <div>${themeBtn()}</div></div>
    </aside>
    <div style="min-width:0">
      <header class="mtop"><div class="t">${multiBiz() ? bizSwitcher("bizsel-m") : esc(local.settings.companyName)}<small>${esc(me().name)} · <span class="syncst">${syncLabel()}</span></small></div>
        ${themeBtn("iconbtn")}<button class="iconbtn" data-nav="settings" title="Settings">⚙️</button></header>
      <main id="main"></main>
    </div>
  </div>
  <nav class="tabs">
    ${tb("home", "🏠", "Home", k.tasksDue + k.chase + k.follow + k.bills)}
    ${tb("tasks", "✅", "Tasks", 0, ["followups"])}
    <button class="plus" data-act="addmenu"><span class="i">+</span>Add</button>
    ${tb("payments", "💰", "Money", 0, ["bills"])}
    ${tb("clients", "👥", "Clients", 0, ["pipeline"])}
  </nav>`;
  ["#bizSel", "#bizSelM"].forEach(id => { const s = $(id); if (s) s.onchange = () => { local.biz = s.value; persist(); render(); toast(s.value ? "Showing " + bizName(s.value) : "Showing all companies"); }; });
  VIEWS[view]($("#main"));
  document.title = (k.tasksLate ? "(" + k.tasksLate + ") " : "") + local.settings.companyName + " CRM";
  if (openClientId) renderDrawer();
}
function go(v) { view = v; local.view = v; persist(); closeDrawer(); render(); window.scrollTo(0, 0); }

/* ===================== list items ===================== */
function taskItem(t, opts) {
  opts = opts || {};
  const c = t.clientId && clientById(t.clientId), d = dueLabel(t), ed = can("edit");
  return `<div class="item ${t.done ? "done" : ""}">
    <button class="donebtn ${t.done ? "on" : ""}" data-done="${t.id}" title="${t.done ? "Mark not done" : "Mark done"}" ${ed ? "" : "disabled"}>✓</button>
    <div class="main" data-edittask="${t.id}">
      <div class="t">${esc(t.title)}</div>
      <div class="m"><span class="${d.cls}" style="font-weight:600">${d.text}</span>
        ${c && !opts.noClient ? `<a href="#" data-client="${c.id}">${esc(shortName(c))}</a>` : ""}
        ${t.assignedTo && syncOn() ? `<span>👤 ${esc(t.assignedTo)}</span>` : ""}
        ${t.repeat ? `<span>🔁 ${esc(REPEATS[t.repeat])}</span>` : ""}
        ${t.fromWhatsApp ? `<span title="Created from a WhatsApp message">💬</span>` : ""}${bizTag(t.biz)}</div>
    </div>
    ${!t.done ? `<div class="btns">
      ${c && c.phone ? `<a class="btn sm" href="${waLink(c.phone)}" target="_blank" rel="noopener" title="Open WhatsApp chat">💬<span class="hide-m"> Chat</span></a>` : ""}
      ${ed ? `<button class="btn sm" data-later="${t.id}" title="Move to tomorrow">Later</button>` : ""}
      ${ed ? `<button class="btn sm primary hide-m" data-done="${t.id}">Done</button>` : ""}
    </div>` : ""}
  </div>`;
}
function payItem(p, opts) {
  opts = opts || {};
  const c = p.clientId && clientById(p.clientId), st = payStatus(p), bal = balanceOf(p), ed = can("edit");
  const last = p.lastReminderAt ? "Reminded " + ago(p.lastReminderAt) + ((p.reminders || []).length > 1 ? " (" + p.reminders.length + "×)" : "") : !isPaid(p) && p.dueDate <= today() ? "Not reminded yet" : "";
  return `<div class="item nodone">
    ${opts.noClient ? "" : `<div class="avatar">${esc(initials(c || { name: p.clientName }))}</div>`}
    <div class="main" data-editpay="${p.id}">
      <div class="t">${esc(opts.noClient ? (p.description || "Invoice") : (shortName(c) || p.clientName || "No client"))}</div>
      <div class="m">${opts.noClient ? "" : `<span>${esc(p.description || "")}</span>`}${p.invoiceNo ? `<span>#${esc(p.invoiceNo)}</span>` : ""}
        <span class="pill ${st.cls}">${st.text}</span>${last ? `<span>${esc(last)}</span>` : ""}${p.repeat ? `<span>🔁 ${esc(REPEATS[p.repeat])}</span>` : ""}${bizTag(p.biz)}</div>
    </div>
    <div class="amt">${money(isPaid(p) ? p.amount : bal)}${!isPaid(p) && paidOf(p) > 0 ? `<small>of ${money(p.amount)}</small>` : isPaid(p) ? `<small>received</small>` : ""}</div>
    ${!isPaid(p) && ed ? `<div class="btns">
      <button class="btn sm wa" data-remind="${p.id}">💬 Remind</button>
      <button class="btn sm" data-recpay="${p.id}">Got paid</button>
    </div>` : ""}
  </div>`;
}
const listOf = (arr, fn, opts) => arr.map(x => fn(x, opts)).join("");
const byDue = (a, b) => ((a.dueDate || "9999") + (a.dueTime || "99")).localeCompare((b.dueDate || "9999") + (b.dueTime || "99"));
const mineFilter = t => !syncOn() || taskFilter.who === "all" || (taskFilter.who === "mine" ? (t.assignedTo === me().name || !t.assignedTo) : t.assignedTo === taskFilter.who);

/* ===================== HOME ===================== */
function renderHome(main) {
  const td = today(), wk = addDays(td, 7);
  const open = local.tasks.filter(t => !t.done && mineFilter(t) && inBiz(t)).sort(byDue);
  const late = open.filter(t => t.dueDate && t.dueDate < td), tod = open.filter(t => t.dueDate === td);
  const soon = open.filter(t => t.dueDate > td && t.dueDate <= wk), nodate = open.filter(t => !t.dueDate);
  const chase = local.payments.filter(p => needsChase(p) && inBiz(p)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const unpaid = local.payments.filter(p => !isPaid(p) && inBiz(p));
  const overdueAmt = unpaid.filter(p => p.dueDate && p.dueDate < td).reduce((s, p) => s + balanceOf(p), 0);
  const follow = local.clients.filter(c => needsFollow(c) && inBizClient(c)).sort(byFollow);
  const bills = local.bills.filter(b => billDueSoon(b) && inBiz(b)).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const billsLate = bills.filter(b => b.dueDate < td);
  const hr = new Date().getHours();
  const hello = (hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening") + (me().name && me().name !== "Me" ? ", " + me().name.split(" ")[0] : "");
  const doneToday = local.tasks.filter(t => t.done && (t.doneAt || "").slice(0, 10) === td && mineFilter(t) && inBiz(t)).length;
  const allClear = !late.length && !tod.length && !chase.length && !follow.length && !bills.length;
  main.innerHTML = `
    <div class="head"><h1>${esc(hello)} 👋</h1><div class="sub">${fmtLong(td)}${local.biz ? " · " + esc(bizName(local.biz)) : ""} · ${allClear ? "Nothing urgent today 🎉" : "Here's what needs doing today"}${doneToday ? " · " + doneToday + " done so far" : ""}</div></div>
    ${introCard()}
    <div class="tiles four">
      <div class="tile ${late.length ? "red" : tod.length ? "amber" : "green"}" data-jump="sec-tasks"><div class="big">${late.length + tod.length}</div><div class="lbl">Tasks today</div><div class="s">${late.length ? late.length + " late" : "none late"}</div></div>
      <div class="tile ${follow.length ? "amber" : "green"}" data-jump="sec-follow"><div class="big">${follow.length}</div><div class="lbl">Follow-ups</div><div class="s">leads & quotations</div></div>
      <div class="tile ${chase.length ? "red" : "green"}" data-jump="sec-pay"><div class="big">${chase.length}</div><div class="lbl">Payments to chase</div><div class="s">${overdueAmt ? money(overdueAmt) + " overdue" : "all on time"}</div></div>
      <div class="tile ${billsLate.length ? "red" : bills.length ? "amber" : "green"}" data-jump="sec-bills"><div class="big">${bills.length}</div><div class="lbl">Bills to pay</div><div class="s">${bills.length ? money(bills.reduce((s, b) => s + num(b.amount), 0)) : "nothing due"}</div></div>
    </div>
    ${quickAddBox()}
    ${syncOn() ? `<div style="margin-top:12px"><select id="whoSel" style="width:auto">${whoOptions()}</select></div>` : ""}

    <section class="sec" id="sec-tasks"><header><h2>✅ Tasks for today</h2><button class="linkbtn" data-nav="tasks">All tasks →</button></header>
      ${late.length ? `<div class="sub-h red">Late (${late.length})</div>${listOf(late, taskItem)}` : ""}
      ${tod.length ? `${late.length ? `<div class="sub-h">Today (${tod.length})</div>` : ""}${listOf(tod, taskItem)}` : ""}
      ${!late.length && !tod.length ? `<div class="empty">No tasks due today.${can("edit") ? " Type one in the box above." : ""}</div>` : ""}
    </section>

    <section class="sec" id="sec-pay"><header><h2>💰 Payments to chase</h2><button class="linkbtn" data-nav="payments">All payments →</button></header>
      ${chase.length ? listOf(chase, payItem) : `<div class="empty">${unpaid.length ? "No reminders due today. " + unpaid.length + " unpaid invoice(s) are not due yet." : "No unpaid invoices." + (can("edit") ? ` <button class="linkbtn" data-act="newpay">Add an invoice</button>` : "")}</div>`}
    </section>

    <section class="sec" id="sec-follow"><header><h2>📞 Leads & quotations to follow up</h2><button class="linkbtn" data-nav="followups">All follow-ups →</button></header>
      ${follow.length ? listOf(follow.slice(0, 12), followItem) + (follow.length > 12 ? `<div class="empty"><button class="linkbtn" data-nav="followups">See all ${follow.length} →</button></div>` : "")
        : `<div class="empty">No follow-ups due today.</div>`}
    </section>

    <section class="sec" id="sec-bills"><header><h2>🧾 Bills to pay</h2><button class="linkbtn" data-nav="bills">All bills →</button></header>
      ${bills.length ? listOf(bills, billItem) : `<div class="empty">Nothing due in the next ${local.settings.billRemindDays || 3} days.${can("edit") ? ` <button class="linkbtn" data-act="newbill">Add a bill</button>` : ""}</div>`}
    </section>

    ${soon.length || nodate.length ? `<section class="sec"><header><h2>📅 Coming up</h2></header>
      ${soon.length ? `<div class="sub-h">Next 7 days (${soon.length})</div>${listOf(soon, taskItem)}` : ""}
      ${nodate.length ? `<div class="sub-h">No date (${nodate.length})</div>${listOf(nodate, taskItem)}` : ""}</section>` : ""}
    ${notifPrompt()}`;
  const who = $("#whoSel"); if (who) who.onchange = () => { taskFilter.who = who.value; render(); };
}
function introCard() {
  if (local.hideIntro || !can("edit")) return "";
  const steps = [
    [local.clients.length > 0, "Add your first client", "newclient"],
    [local.tasks.length > 0, "Add a task – type it in plain words, e.g. <i>Send quotation to Ahmed Thursday</i>", ""],
    [local.tasks.some(t => t.fromWhatsApp), "Copy a client's WhatsApp message and press <b>From WhatsApp</b>", "fromwa"],
    [local.payments.length > 0, "Add an unpaid invoice so the CRM reminds you to chase it", "newpay"],
    [!("Notification" in window) || Notification.permission !== "default", "Turn on pop-up reminders", "notif"]
  ];
  if (steps.every(s => s[0])) return "";
  return `<div class="card intro"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Getting started (${steps.filter(s => s[0]).length}/${steps.length})</b><button class="linkbtn" data-act="hideintro">Hide</button></div>
    <ol>${steps.map(s => `<li class="${s[0] ? "ok" : ""}">${s[1]}${!s[0] && s[2] ? ` – <button class="linkbtn" data-act="${s[2]}">do it</button>` : ""}</li>`).join("")}</ol>
    ${!syncOn() && !local.clients.length ? `<div class="hint" style="margin-top:8px">Just looking? <button class="linkbtn" data-act="demo">Load sample data</button> to try everything out.</div>` : ""}</div>`;
}
function whoOptions() {
  const o = [["all", "Everyone's tasks"], ["mine", "My tasks"]].concat(staffNames().filter(n => n !== me().name).map(n => [n, n + "'s tasks"]));
  return o.map(([v, l]) => opt(v, taskFilter.who, l)).join("");
}
function quickAddBox() {
  if (!can("edit")) return "";
  return `<form class="quick" id="quickForm"><input type="text" id="quickText" placeholder="➕ Add a task… e.g. Send quotation to Ahmed Thursday 3pm" autocomplete="off">
    <button class="btn primary">Add task</button><button type="button" class="btn wa" data-act="fromwa" title="Turn a copied WhatsApp message into a task">💬 From WhatsApp</button></form>
    <div class="qhint" id="quickHint">Write it like a note. Words like <i>tomorrow, Thursday, 15 Nov, next week, 3pm</i> set the date, and a client's name links it to them.</div>`;
}
function notifPrompt() {
  if (!("Notification" in window) || Notification.permission !== "default") return "";
  return `<div class="card" style="margin-top:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>🔔 Turn on pop-up reminders</b><div class="hint">Get a pop-up on this device when a task is due (while the CRM is open).</div></div><button class="btn primary" data-act="notif">Turn on</button></div>`;
}

/* ===================== TASKS ===================== */
function renderTasks(main) {
  const q = taskFilter.q.toLowerCase(), td = today();
  let arr = local.tasks.filter(mineFilter).filter(inBiz).filter(t => taskFilter.show === "all" || (taskFilter.show === "done" ? t.done : !t.done));
  if (q) arr = arr.filter(t => (t.title + " " + t.note + " " + t.clientName).toLowerCase().indexOf(q) >= 0);
  arr.sort(taskFilter.show === "done" ? (a, b) => (b.doneAt || "").localeCompare(a.doneAt || "") : byDue);
  let body;
  if (taskFilter.show === "open" && !q) {
    const g = [["Late", arr.filter(t => t.dueDate && t.dueDate < td), "red"], ["Today", arr.filter(t => t.dueDate === td)], ["Tomorrow", arr.filter(t => t.dueDate === addDays(td, 1))],
      ["Later", arr.filter(t => t.dueDate > addDays(td, 1))], ["No date", arr.filter(t => !t.dueDate)]].filter(x => x[1].length);
    body = g.map(([l, a, cls]) => `<div class="sub-h ${cls || ""}">${l} (${a.length})</div>${listOf(a, taskItem)}`).join("");
  } else body = listOf(arr.slice(0, 500), taskItem);
  main.innerHTML = `<div class="head"><h1>Tasks</h1>${can("export") ? `<button class="btn hide-m" data-act="exporttasks">⬇ Excel</button>` : ""}${can("edit") ? `<button class="btn primary" data-act="newtask">+ New task</button>` : ""}</div>
    ${quickAddBox()}
    <div class="bar" style="margin-top:14px">
      <div class="seg" id="tshow">${[["open", "To do"], ["done", "Done"], ["all", "All"]].map(([v, l]) => `<button data-v="${v}" class="${taskFilter.show === v ? "on" : ""}">${l}</button>`).join("")}</div>
      ${syncOn() ? `<select id="twho">${whoOptions()}</select>` : ""}
      <input type="search" id="tq" placeholder="🔍 Search tasks" value="${esc(taskFilter.q)}">
    </div>
    <section class="sec" style="margin-top:0">${body || `<div class="empty">No tasks here.</div>`}</section>`;
  $("#tq").oninput = e => { taskFilter.q = e.target.value; const p = e.target.selectionStart; renderTasks(main); const i = $("#tq"); i.focus(); i.setSelectionRange(p, p); };
  $("#tshow").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { taskFilter.show = b.dataset.v; renderTasks(main); } };
  const w = $("#twho"); if (w) w.onchange = e => { taskFilter.who = e.target.value; renderTasks(main); };
}

/* ===================== PAYMENTS ===================== */
function renderPayments(main) {
  const td = today(), q = payFilter.q.toLowerCase();
  const pays = local.payments.filter(inBiz);
  const unpaid = pays.filter(p => !isPaid(p));
  const overdue = unpaid.filter(p => p.dueDate && p.dueDate < td);
  const month = td.slice(0, 7);
  const recMonth = pays.reduce((s, p) => s + (p.payments || []).filter(x => (x.date || "").slice(0, 7) === month).reduce((a, x) => a + num(x.amount), 0), 0);
  let arr = pays.filter(p => payFilter.show === "all" || (payFilter.show === "paid" ? isPaid(p) : payFilter.show === "overdue" ? !isPaid(p) && p.dueDate < td : !isPaid(p)));
  if (q) arr = arr.filter(p => (p.clientName + " " + p.description + " " + p.invoiceNo + " " + clientLabel(clientById(p.clientId))).toLowerCase().indexOf(q) >= 0);
  arr.sort(payFilter.show === "paid" ? (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") : (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  main.innerHTML = `${moneySwitch("payments")}<div class="head"><h1>Clients owe me</h1>${can("export") ? `<button class="btn hide-m" data-act="exportpay">⬇ Excel</button>` : ""}${can("edit") ? `<button class="btn primary" data-act="newpay">+ New invoice</button>` : ""}</div>
    <div class="tiles">
      <div class="tile ${overdue.length ? "red" : "green"}" data-pf="overdue"><div class="big">${money(overdue.reduce((s, p) => s + balanceOf(p), 0))}</div><div class="lbl">Overdue</div><div class="s">${overdue.length} invoice(s)</div></div>
      <div class="tile amber" data-pf="unpaid"><div class="big">${money(unpaid.reduce((s, p) => s + balanceOf(p), 0))}</div><div class="lbl">Waiting to be paid</div><div class="s">${unpaid.length} invoice(s)</div></div>
      <div class="tile green" data-pf="paid"><div class="big">${money(recMonth)}</div><div class="lbl">Received this month</div><div class="s">${MONTHS[+month.slice(5) - 1]}</div></div>
    </div>
    <div class="bar">
      <div class="seg" id="pshow">${[["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["all", "All"]].map(([v, l]) => `<button data-v="${v}" class="${payFilter.show === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <input type="search" id="pq" placeholder="🔍 Search client, invoice" value="${esc(payFilter.q)}">
    </div>
    <section class="sec" style="margin-top:0">${arr.length ? listOf(arr.slice(0, 500), payItem) : `<div class="empty">${local.payments.length ? "Nothing here." : "No invoices yet. Add the invoices you've sent, and the CRM will remind you when it's time to chase payment."}</div>`}</section>
    <p class="hint" style="margin-top:12px">💡 <b>Remind</b> opens WhatsApp with a ready-written message (amount, due date, days overdue${local.settings.bankDetails ? ", bank details" : ""}). After a reminder, the invoice comes back to <i>Payments to chase</i> in ${local.settings.remindEvery || 7} days if it's still unpaid.</p>`;
  $("#pq").oninput = e => { payFilter.q = e.target.value; const p = e.target.selectionStart; renderPayments(main); const i = $("#pq"); i.focus(); i.setSelectionRange(p, p); };
  $("#pshow").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { payFilter.show = b.dataset.v; renderPayments(main); } };
  main.querySelectorAll("[data-pf]").forEach(t => t.onclick = () => { payFilter.show = t.dataset.pf; renderPayments(main); });
}
const moneySwitch = cur => `<div class="seg" style="margin-bottom:14px"><button data-nav="payments" class="${cur === "payments" ? "on" : ""}">💰 Clients owe me</button><button data-nav="bills" class="${cur === "bills" ? "on" : ""}">🧾 Bills I need to pay</button></div>`;
const bizBank = id => { const b = bizById(id); return (b && b.bank) || local.settings.bankDetails || ""; };
const bizCompany = id => bizName(id) || local.settings.companyName || "";

/* ===================== BILLS TO PAY (expenses / purchases) ===================== */
const billDueSoon = b => !b.paidAt && b.dueDate && b.dueDate <= addDays(today(), +local.settings.billRemindDays || 3) && (!b.snoozedTo || b.snoozedTo <= today());
function billStatus(b) {
  if (b.paidAt) return { text: "Paid " + fmtDate(b.paidAt.slice(0, 10)), cls: "green" };
  const d = daysBetween(today(), b.dueDate || today());
  if (d < 0) return { text: (-d) + (d === -1 ? " day late" : " days late"), cls: "red" };
  if (d === 0) return { text: "Due today", cls: "red" };
  if (d === 1) return { text: "Due tomorrow", cls: "amber" };
  return { text: "Due " + fmtDate(b.dueDate), cls: d <= (+local.settings.billRemindDays || 3) ? "amber" : "gray" };
}
function billItem(b) {
  const st = billStatus(b), ed = can("edit");
  return `<div class="item nodone">
    <div class="avatar" style="background:var(--amber-soft);color:var(--amber)">🧾</div>
    <div class="main" data-editbill="${b.id}"><div class="t">${esc(b.vendor || "Bill")}</div>
      <div class="m">${b.description || b.category ? `<span>${esc(b.description || b.category)}</span>` : ""}<span class="pill ${st.cls}">${st.text}</span>${b.repeat ? `<span>🔁 ${esc(REPEATS[b.repeat])}</span>` : ""}${b.reference ? `<span>Ref ${esc(b.reference)}</span>` : ""}${bizTag(b.biz)}</div></div>
    <div class="amt">${money(b.paidAt ? (b.paidAmount || b.amount) : b.amount)}${b.paidAt ? `<small>${esc(b.paidMethod || "paid")}</small>` : ""}</div>
    ${!b.paidAt && ed ? `<div class="btns"><button class="btn sm primary" data-paybill="${b.id}">✓ Mark paid</button><button class="btn sm" data-billlater="${b.id}">Later</button></div>` : ""}
  </div>`;
}
let billFilter = { show: "topay", q: "" };
function renderBills(main) {
  const td = today(), q = billFilter.q.toLowerCase(), month = td.slice(0, 7);
  const all = local.bills.filter(inBiz), unpaid = all.filter(b => !b.paidAt);
  const late = unpaid.filter(b => b.dueDate < td), week = unpaid.filter(b => b.dueDate >= td && b.dueDate <= addDays(td, 7));
  const paidMonth = all.filter(b => b.paidAt && b.paidAt.slice(0, 7) === month);
  let arr = all.filter(b => billFilter.show === "all" || (billFilter.show === "paid" ? b.paidAt : !b.paidAt));
  if (q) arr = arr.filter(b => (b.vendor + " " + b.description + " " + b.category + " " + b.reference).toLowerCase().indexOf(q) >= 0);
  arr.sort(billFilter.show === "paid" ? (a, b) => (b.paidAt || "").localeCompare(a.paidAt || "") : (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const sum = a => money(a.reduce((s, b) => s + num(b.paidAt ? (b.paidAmount || b.amount) : b.amount), 0));
  main.innerHTML = `${moneySwitch("bills")}<div class="head"><h1>Bills to pay</h1>${can("export") ? `<button class="btn hide-m" data-act="exportbills">⬇ Excel</button>` : ""}${can("edit") ? `<button class="btn primary" data-act="newbill">+ New bill</button>` : ""}
      <div class="sub">Rent, DEWA, salaries, suppliers, subscriptions, VAT and other payments you have to make. You'll be reminded ${local.settings.billRemindDays || 3} days before each one is due.</div></div>
    <div class="tiles">
      <div class="tile ${late.length ? "red" : "green"}" data-bf="topay"><div class="big">${sum(late)}</div><div class="lbl">Late</div><div class="s">${late.length} bill(s)</div></div>
      <div class="tile amber" data-bf="topay"><div class="big">${sum(week)}</div><div class="lbl">Due in 7 days</div><div class="s">${week.length} bill(s)</div></div>
      <div class="tile green" data-bf="paid"><div class="big">${sum(paidMonth)}</div><div class="lbl">Paid this month</div><div class="s">${paidMonth.length} bill(s)</div></div>
    </div>
    <div class="bar">
      <div class="seg" id="bshow">${[["topay", "To pay"], ["paid", "Paid"], ["all", "All"]].map(([v, l]) => `<button data-v="${v}" class="${billFilter.show === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <input type="search" id="bq" placeholder="🔍 Search supplier, bill" value="${esc(billFilter.q)}">
    </div>
    <section class="sec" style="margin-top:0">${arr.length ? listOf(arr.slice(0, 500), billItem) : `<div class="empty">${all.length ? "Nothing here." : "No bills yet. Add rent, DEWA, subscriptions or supplier invoices – set <b>Repeat</b> for monthly ones and you'll never miss them."}</div>`}</section>`;
  $("#bq").oninput = e => { billFilter.q = e.target.value; const p = e.target.selectionStart; renderBills(main); const i = $("#bq"); i.focus(); i.setSelectionRange(p, p); };
  $("#bshow").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { billFilter.show = b.dataset.v; renderBills(main); } };
  main.querySelectorAll("[data-bf]").forEach(t => t.onclick = () => { billFilter.show = t.dataset.bf; renderBills(main); });
}
function billForm(b, isNew) {
  const ed = can("edit"), cats = local.settings.expenseCategories || [];
  const vendors = local.bills.map(x => x.vendor).filter((v, i, a) => v && a.indexOf(v) === i);
  modal(`<h2>${isNew ? "New bill to pay" : "Bill"}</h2>
    ${!isNew ? `<div class="hint">${esc(billStatus(b).text)}${b.paidAt ? " · " + money(b.paidAmount || b.amount) + (b.paidMethod ? " by " + esc(b.paidMethod) : "") + (b.paidBy && syncOn() ? " · " + esc(b.paidBy) : "") : ""}</div>` : `<div class="hint">A payment you need to make – you'll be reminded before it's due.</div>`}
    <div class="stack" style="margin-top:12px">
      ${bizPicker("bf", b.biz)}
      <div class="row2"><label class="f"><span>Pay to</span><input type="text" id="bf_vendor" value="${esc(b.vendor)}" list="bf_vlist" placeholder="e.g. DEWA, landlord, supplier"><datalist id="bf_vlist">${vendors.map(v => `<option>${esc(v)}</option>`).join("")}</datalist></label>
        <label class="f"><span>Amount (AED)</span><input type="text" inputmode="decimal" id="bf_amount" value="${esc(b.amount)}"></label></div>
      <label class="f"><span>Type</span><select id="bf_cat"><option value="">–</option>${cats.map(c => opt(c, b.category)).join("")}</select></label>
      <label class="f"><span>What for (optional)</span><input type="text" id="bf_desc" value="${esc(b.description)}" placeholder="e.g. Office rent – Dec, invoice 4471"></label>
      <div class="row2 keep"><label class="f"><span>Due date</span><input type="date" id="bf_due" value="${esc(b.dueDate)}"></label>
        <label class="f"><span>Repeat</span><select id="bf_rep">${Object.keys(REPEATS).map(k => opt(k, b.repeat, REPEATS[k])).join("")}</select></label></div>
      <label class="f"><span>Account / reference no. (optional)</span><input type="text" id="bf_ref" value="${esc(b.reference)}"></label>
      <label class="f"><span>Notes</span><textarea id="bf_note" style="min-height:60px">${esc(b.note)}</textarea></label>
    </div>
    <div class="mfoot">
      ${!isNew && can("delete") ? `<button class="btn danger" id="bf_del" style="margin-right:auto">Delete</button>` : ""}
      <button class="btn" data-act="mclose">Cancel</button>
      ${!isNew && ed && !b.paidAt ? `<button class="btn" id="bf_paid">✓ Mark paid</button>` : ""}
      ${!isNew && ed && b.paidAt ? `<button class="btn" id="bf_unpaid">Mark not paid</button>` : ""}
      ${ed ? `<button class="btn primary" id="bf_save">${isNew ? "Add bill" : "Save"}</button>` : ""}
    </div>`);
  const save = () => {
    const vendor = $("#bf_vendor").value.trim(), amount = num($("#bf_amount").value);
    if (!vendor) { toast("Who do you pay?"); return false; }
    Object.assign(b, { biz: bizPicked("bf"), vendor, amount: amount ? String(amount) : "", category: $("#bf_cat").value, description: $("#bf_desc").value.trim(),
      dueDate: $("#bf_due").value || today(), repeat: $("#bf_rep").value, reference: $("#bf_ref").value.trim(), note: $("#bf_note").value.trim() });
    put("bills", b); logAct(isNew ? "Bill added" : "Bill edited", { id: b.id, title: b.vendor }, money(b.amount) + " · due " + b.dueDate);
    return true;
  };
  if ($("#bf_save")) $("#bf_save").onclick = () => { if (save()) { closeModal(); toast(isNew ? "Bill added – reminder " + (local.settings.billRemindDays || 3) + " days before " + fmtDate(b.dueDate) : "Saved"); render(); } };
  if ($("#bf_paid")) $("#bf_paid").onclick = () => { if (save()) payBillForm(b); };
  if ($("#bf_unpaid")) $("#bf_unpaid").onclick = () => { b.paidAt = ""; b.paidAmount = ""; b.paidMethod = ""; put("bills", b); logAct("Bill marked unpaid", { id: b.id, title: b.vendor }, ""); closeModal(); render(); };
  if ($("#bf_del")) $("#bf_del").onclick = () => { if (confirm("Delete this bill?" + (b.repeat ? " (It will stop repeating.)" : ""))) { logAct("Bill deleted", { id: b.id, title: b.vendor }, money(b.amount)); remove("bills", b.id); closeModal(); render(); } };
}
function payBillForm(b) {
  modal(`<h2>✓ Bill paid</h2><div class="hint">${esc(b.vendor)} · ${esc(b.description || b.category || "")} · ${money(b.amount)}</div>
    <div class="stack" style="margin-top:12px">
      <div class="row2 keep"><label class="f"><span>Amount paid (AED)</span><input type="text" inputmode="decimal" id="pb_amt" value="${esc(b.amount)}"></label>
        <label class="f"><span>Date</span><input type="date" id="pb_date" value="${today()}"></label></div>
      <label class="f"><span>How</span><div class="chips" id="pb_m">${METHODS.map((m, i) => `<button data-m="${esc(m)}" class="${i === 0 ? "on" : ""}">${esc(m)}</button>`).join("")}</div></label>
      ${b.repeat ? `<div class="detect">🔁 The next ${esc(b.vendor)} bill will be added automatically for <b>${fmtLong(nextBillDate(b))}</b>.</div>` : ""}
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="pb_ok">Save</button></div>`);
  let method = METHODS[0];
  $("#pb_m").onclick = e => { const x = e.target.closest("[data-m]"); if (!x) return; method = x.dataset.m; $("#pb_m").querySelectorAll("button").forEach(y => y.classList.toggle("on", y === x)); };
  $("#pb_ok").onclick = () => {
    b.paidAt = ($("#pb_date").value || today()) + "T12:00:00"; b.paidAmount = String(num($("#pb_amt").value) || num(b.amount)); b.paidMethod = method; b.paidBy = me().name;
    put("bills", b); logAct("Bill paid", { id: b.id, title: b.vendor }, money(b.paidAmount) + " · " + method);
    if (b.repeat) {
      const nid = b.id + "-r";
      if (!local.bills.some(x => x.id === nid) && local.deleted.bills.indexOf(nid) < 0) {
        const n = newBill({ id: nid, biz: b.biz, vendor: b.vendor, description: b.description, category: b.category, amount: b.amount, repeat: b.repeat, reference: b.reference, note: b.note, dueDate: nextBillDate(b) });
        put("bills", n); logAct("Bill added", { id: n.id, title: n.vendor }, "Repeating · due " + n.dueDate);
      }
    }
    closeModal(); toast("Paid ✔" + (b.repeat ? "  Next one due " + fmtDate(nextBillDate(b)) : "")); render();
  };
}
const nextBillDate = b => b.repeat === "weekly" ? addDays(b.dueDate, 7) : addMonths(b.dueDate, { monthly: 1, quarterly: 3, yearly: 12 }[b.repeat] || 1);

/* ===================== FOLLOW-UPS (leads & quotations) ===================== */
// an open lead needs a follow-up when its follow-up date has come – or when it has no date and no task at all
function needsFollow(c) {
  if (OPEN_STAGES.indexOf(c.stage) < 0) return false;
  if (c.nextFollowUp) return c.nextFollowUp <= today();
  return !local.tasks.some(t => !t.done && t.clientId === c.id);
}
const byFollow = (a, b) => (STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage)) || (a.nextFollowUp || "").localeCompare(b.nextFollowUp || "");
const quoteAge = c => { const h = (c.history || []).filter(x => x.kind === "stage" && /→ Quotation sent/.test(x.text)).pop(); return h ? daysBetween(h.at.slice(0, 10), today()) : null; };
function followItem(c) {
  const ed = can("edit"), qa = quoteAge(c);
  const due = !c.nextFollowUp ? "No follow-up date" : c.nextFollowUp < today() ? daysBetween(c.nextFollowUp, today()) + " day(s) late" : c.nextFollowUp === today() ? "Today" : fmtDate(c.nextFollowUp);
  return `<div class="item nodone">
    <div class="avatar">${esc(initials(c))}</div>
    <div class="main" data-client="${c.id}"><div class="t">${esc(clientLabel(c))}</div>
      <div class="m"><span class="pill ${STAGE_PILL[c.stage]}">${esc(c.stage)}</span>${c.quoteAmount ? `<b>${money(c.quoteAmount)}</b>` : ""}${c.service ? `<span>${esc(c.service)}</span>` : ""}
        ${qa != null && c.stage !== "Enquiry" ? `<span>quote sent ${qa}d ago</span>` : ""}${c.followUps ? `<span>followed up ${c.followUps}×</span>` : ""}
        <span class="${c.nextFollowUp && c.nextFollowUp < today() ? "red" : "amber"}" style="font-weight:600">📞 ${due}</span>${bizTag(c.biz)}</div></div>
    ${ed ? `<div class="btns"><button class="btn sm wa" data-follow="${c.id}">📞 Follow up</button><button class="btn sm" data-followlater="${c.id}">Later</button></div>` : ""}
  </div>`;
}
let followFilter = { show: "due" };
function renderFollowups(main) {
  const open = local.clients.filter(c => OPEN_STAGES.indexOf(c.stage) >= 0 && inBizClient(c));
  const due = open.filter(needsFollow).sort(byFollow);
  const arr = followFilter.show === "due" ? due : open.slice().sort((a, b) => (a.nextFollowUp || "0").localeCompare(b.nextFollowUp || "0"));
  const qv = open.filter(c => c.stage !== "Enquiry").reduce((s, c) => s + num(c.quoteAmount), 0);
  main.innerHTML = `<div class="head"><h1>Follow-ups</h1>${can("edit") ? `<button class="btn primary" data-act="newclient">+ New enquiry</button>` : ""}
      <div class="sub">Every open enquiry and quotation has a next follow-up date. Tap <b>Follow up</b> to send a WhatsApp message, note what they said and set the next date.</div></div>
    <div class="tiles">
      <div class="tile ${due.length ? "amber" : "green"}" data-ff="due"><div class="big">${due.length}</div><div class="lbl">Due now</div><div class="s">to follow up today</div></div>
      <div class="tile blue" data-ff="all"><div class="big">${open.length}</div><div class="lbl">Open leads</div><div class="s">${open.filter(c => c.stage === "Enquiry").length} enquiries · ${open.filter(c => c.stage !== "Enquiry").length} quotations</div></div>
      <div class="tile green" data-nav="pipeline"><div class="big">${money(qv)}</div><div class="lbl">Quoted, waiting</div><div class="s">open quotation value</div></div>
    </div>
    <div class="bar"><div class="seg" id="fshow">${[["due", "Due now"], ["all", "All open leads"]].map(([v, l]) => `<button data-v="${v}" class="${followFilter.show === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <section class="sec" style="margin-top:0">${arr.length ? listOf(arr, followItem) : `<div class="empty">${followFilter.show === "due" ? "All caught up 🎉 No follow-ups due." : "No open enquiries or quotations."}</div>`}</section>`;
  $("#fshow").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { followFilter.show = b.dataset.v; renderFollowups(main); } };
  main.querySelectorAll("[data-ff]").forEach(t => t.onclick = () => { followFilter.show = t.dataset.ff; renderFollowups(main); });
}
const OUTCOMES = ["No reply", "Interested – thinking", "Wants changes / discount", "Call back later", "Asked for documents", "Not interested"];
function followForm(c) {
  const tpls = local.settings.templates || [];
  let ti = tpls.findIndex(t => c.stage === "Enquiry" ? /enquiry follow/i.test(t.name) : /quotation follow/i.test(t.name)); if (ti < 0) ti = 0;
  const lastH = (c.history || []).slice(-3).reverse();
  const nd = +local.settings.followUpDays || 3;
  modal(`<h2>📞 Follow up – ${esc(shortName(c))}</h2>
    <div class="hint">${esc(c.stage)}${c.quoteAmount ? " · " + money(c.quoteAmount) : ""}${c.service ? " · " + esc(c.service) : ""}${c.followUps ? " · followed up " + c.followUps + "× before" : ""}${quoteAge(c) != null && c.stage !== "Enquiry" ? " · quote sent " + quoteAge(c) + " days ago" : ""}</div>
    ${lastH.length ? `<div class="detect" style="margin-top:10px">${lastH.map(h => `<div><span class="muted">${fmtWhen(h.at).split(",")[0]}:</span> ${esc(String(h.text).slice(0, 140))}</div>`).join("")}</div>` : ""}
    <div class="stack" style="margin-top:12px">
      ${tpls.length && c.phone ? `<label class="f"><span>WhatsApp message</span><div class="chips" id="fu_t">${tpls.map((t, i) => `<button data-i="${i}" class="${i === ti ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div></label>
        <textarea id="fu_text" style="min-height:110px">${esc(fillTemplate(tpls[ti].text, c))}</textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn wa" id="fu_wa">💬 Send on WhatsApp</button><a class="btn" href="tel:+${c.phone}" id="fu_call">📞 Call</a></div>` : `<div class="detect">No WhatsApp number – add one with ✏ Edit on the client's page.</div>`}
      <label class="f"><span>What happened?</span><div class="chips" id="fu_o">${OUTCOMES.map(o => `<button data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div></label>
      <input type="text" id="fu_note" placeholder="Notes (optional) – e.g. will confirm after meeting partner on Sunday">
      <label class="f"><span>Next follow-up</span><div class="chips" id="fu_n">${[[1, "Tomorrow"], [2, "2 days"], [3, "3 days"], [5, "5 days"], [7, "1 week"], [14, "2 weeks"], [30, "1 month"]].map(([n, l]) => `<button data-n="${n}" class="${n === nd ? "on" : ""}">${l}</button>`).join("")}</div></label>
      <input type="date" id="fu_date" value="${addDays(today(), nd)}" style="max-width:200px">
      <label class="f"><span>Move to stage (optional)</span><div class="chips" id="fu_s">${STAGES.filter(s => s !== c.stage).map(s => `<button data-s="${s}">${s}</button>`).join("")}</div></label>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="fu_save">Save follow-up</button></div>`);
  let outcome = "", stage = "", channel = "";
  const chips = (id, attr, set, toggle) => { const box = $(id); if (!box) return; box.onclick = e => { const b = e.target.closest("[" + attr + "]"); if (!b) return; const was = b.classList.contains("on");
    box.querySelectorAll("button").forEach(x => x.classList.remove("on")); if (!(toggle && was)) b.classList.add("on"); set(toggle && was ? "" : b.getAttribute(attr)); }; };
  chips("#fu_t", "data-i", v => { $("#fu_text").value = fillTemplate(tpls[+v].text, c); });
  chips("#fu_o", "data-o", v => { outcome = v; if (v === "Not interested") { $("#fu_s").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.s === "Lost")); stage = "Lost"; } }, true);
  chips("#fu_n", "data-n", v => { $("#fu_date").value = addDays(today(), +v); });
  chips("#fu_s", "data-s", v => { stage = v; }, true);
  const w = $("#fu_wa"); if (w) w.onclick = () => { window.open(waLink(c.phone, $("#fu_text").value), "_blank", "noopener"); channel = "WhatsApp"; w.textContent = "✔ WhatsApp opened"; };
  const cl = $("#fu_call"); if (cl) cl.addEventListener("click", () => { channel = "Call"; });
  $("#fu_save").onclick = () => {
    c.followUps = (c.followUps || 0) + 1; c.lastFollowUpAt = nowIso();
    const closed = stage === "Won" || stage === "Lost";
    c.nextFollowUp = closed ? "" : ($("#fu_date").value || addDays(today(), nd));
    const note = $("#fu_note").value.trim();
    addHistory(c, channel === "WhatsApp" ? "whatsapp" : "followup", "📞 Follow-up #" + c.followUps + (channel ? " (" + channel + ")" : "") + (outcome ? ": " + outcome : "") + (note ? " – " + note : "") + (closed ? "" : "\nNext follow-up: " + fmtDate(c.nextFollowUp)));
    put("clients", c); logAct("Follow-up", c, [channel, outcome, note].filter(String).join(" · "));
    closeModal();
    if (stage) setStage(c, stage); else { toast("Saved – next follow-up " + fmtDate(c.nextFollowUp)); render(); }
  };
}
function fillPayTemplate(text, p) {
  const c = clientById(p.clientId) || { name: p.clientName };
  const d = p.dueDate ? Math.max(0, daysBetween(p.dueDate, today())) : 0;
  const biz = p.biz || c.biz;
  return String(text).replace(/\{name\}/g, (c.name || c.company || "").split(" ")[0] || "Sir/Madam").replace(/\{company\}/g, bizCompany(biz))
    .replace(/\{invoice\}/g, p.invoiceNo ? "invoice " + p.invoiceNo : "our invoice").replace(/\{description\}/g, p.description || "our services")
    .replace(/\{amount\}/g, money(p.amount)).replace(/\{balance\}/g, money(balanceOf(p))).replace(/\{due\}/g, fmtLong(p.dueDate)).replace(/\{days\}/g, d)
    .replace(/\{bank\}/g, bizBank(biz)).replace(/\{me\}/g, me().name || "").replace(/\n{3,}/g, "\n\n").trim();
}
function remindForm(p) {
  const c = clientById(p.clientId) || {};
  const tpls = local.settings.payTemplates;
  const d = p.dueDate ? daysBetween(p.dueDate, today()) : 0;
  let pick = d < 0 ? 0 : d <= 14 ? 1 : 2; if (pick >= tpls.length) pick = tpls.length - 1;
  modal(`<h2>💬 Payment reminder</h2>
    <div class="hint">${esc(clientLabel(c) || p.clientName)} · ${money(balanceOf(p))} · ${esc(payStatus(p).text)}${(p.reminders || []).length ? " · reminded " + p.reminders.length + "× before (last " + ago(p.lastReminderAt) + ")" : ""}</div>
    <div class="stack" style="margin-top:12px">
      <div class="chips" id="rm_t">${tpls.map((t, i) => `<button data-i="${i}" class="${i === pick ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>
      <label class="f"><span>Message (you can edit it)</span><textarea id="rm_text" style="min-height:170px">${esc(fillPayTemplate(tpls[pick].text, p))}</textarea></label>
      <label class="f"><span>Remind me again if still unpaid in</span><div class="chips" id="rm_next">${[3, 7, 14, 30].map(n => `<button data-n="${n}" class="${n === (+local.settings.remindEvery || 7) ? "on" : ""}">${n} days</button>`).join("")}</div></label>
      ${!c.phone ? `<div class="detect">⚠ This client has no WhatsApp number. <a href="#" data-client="${c.id || ""}">Add one</a>, or send by email / log a phone call.</div>` : ""}
    </div>
    <div class="mfoot">
      <button class="btn" data-act="mclose">Cancel</button>
      <button class="btn" id="rm_call">📞 I called them</button>
      ${c.email ? `<button class="btn" id="rm_mail">✉ Email</button>` : ""}
      ${c.phone ? `<button class="btn wa" id="rm_wa">💬 Send on WhatsApp</button>` : ""}
    </div>`);
  let next = +local.settings.remindEvery || 7;
  $("#rm_t").onclick = e => { const b = e.target.closest("[data-i]"); if (!b) return; $("#rm_t").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("#rm_text").value = fillPayTemplate(tpls[+b.dataset.i].text, p); };
  $("#rm_next").onclick = e => { const b = e.target.closest("[data-n]"); if (!b) return; next = +b.dataset.n; $("#rm_next").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  const done = channel => {
    p.reminders = p.reminders || []; p.reminders.push({ at: nowIso(), by: me().name, channel });
    p.lastReminderAt = nowIso(); p.nextReminder = addDays(today(), next);
    put("payments", p); logAct("Payment reminder", p, channel + " · " + money(balanceOf(p)));
    const cc = clientById(p.clientId); if (cc) { addHistory(cc, "payment", "Payment reminder (" + channel + "): " + money(balanceOf(p)) + " " + (p.description || "")); put("clients", cc); }
    closeModal(); toast("Reminder logged. You'll be reminded again on " + fmtDate(p.nextReminder) + " if still unpaid"); render();
  };
  const w = $("#rm_wa"); if (w) w.onclick = () => { window.open(waLink(c.phone, $("#rm_text").value), "_blank", "noopener"); done("WhatsApp"); };
  const m = $("#rm_mail"); if (m) m.onclick = () => { location.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("Payment reminder" + (p.invoiceNo ? " – invoice " + p.invoiceNo : "")) + "&body=" + encodeURIComponent($("#rm_text").value); done("Email"); };
  $("#rm_call").onclick = () => done("Phone call");
}
function payForm(p, isNew) {
  const ed = can("edit");
  const c0 = p.clientId && clientById(p.clientId);
  modal(`<h2>${isNew ? "New invoice" : "Invoice"}</h2>
    ${!isNew ? `<div class="hint">${esc(payStatus(p).text)} · received ${money(paidOf(p))} of ${money(p.amount)}</div>` : `<div class="hint">Add an invoice you've sent. The CRM will remind you to chase it after the due date.</div>`}
    <div class="stack" style="margin-top:12px">
      ${bizPicker("pf", p.biz)}
      <label class="f"><span>Client</span><select id="pf_client">${clientOptions(p.clientId, true)}</select></label>
      <div id="pf_new" class="row2" style="display:none"><label class="f"><span>New client name</span><input type="text" id="pf_nname"></label><label class="f"><span>WhatsApp number</span><input type="tel" id="pf_nphone"></label></div>
      <div class="row2 keep"><label class="f"><span>Amount (AED)</span><input type="text" inputmode="decimal" id="pf_amount" value="${esc(p.amount)}" placeholder="e.g. 3150"></label>
        <label class="f"><span>Invoice no. (optional)</span><input type="text" id="pf_inv" value="${esc(p.invoiceNo)}"></label></div>
      <label class="f"><span>For</span><input type="text" id="pf_desc" value="${esc(p.description)}" list="pf_svc" placeholder="e.g. VAT return Q3"><datalist id="pf_svc">${local.settings.services.map(s => `<option>${esc(s)}</option>`).join("")}</datalist></label>
      <div class="row2 keep"><label class="f"><span>Invoice date</span><input type="date" id="pf_issue" value="${esc(p.issueDate)}"></label>
        <label class="f"><span>Payment due</span><input type="date" id="pf_due" value="${esc(p.dueDate)}"></label></div>
      <div class="chips" id="pf_terms">${[["On receipt", 0], ["7 days", 7], ["15 days", 15], ["30 days", 30]].map(([l, n]) => `<button type="button" data-n="${n}">${l}</button>`).join("")}</div>
      <label class="f"><span>Repeat (for monthly fees / retainers)</span><select id="pf_rep">${Object.keys(REPEATS).filter(k => k !== "weekly").map(k => opt(k, p.repeat, k ? REPEATS[k] + " – new invoice created automatically" : REPEATS[k])).join("")}</select></label>
      <label class="f"><span>Notes</span><textarea id="pf_note" style="min-height:60px">${esc(p.note)}</textarea></label>
      ${!isNew && (p.payments || []).length ? `<div><b>Payments received</b><table style="margin-top:6px"><tbody>${p.payments.map((x, i) => `<tr><td>${fmtLong(x.date)}</td><td>${money(x.amount)}</td><td>${esc(x.method || "")}${x.note ? " · " + esc(x.note) : ""}</td><td>${ed ? `<button class="linkbtn" data-delrec="${i}" style="color:var(--red)">remove</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${!isNew && (p.reminders || []).length ? `<div class="hint"><b>Reminders sent:</b> ${p.reminders.map(r => fmtWhen(r.at).split(",")[0] + " (" + esc(r.channel) + ")").join(" · ")}</div>` : ""}
    </div>
    <div class="mfoot">
      ${!isNew && can("delete") ? `<button class="btn danger" id="pf_del" style="margin-right:auto">Delete</button>` : ""}
      <button class="btn" data-act="mclose">Cancel</button>
      ${!isNew && ed && !isPaid(p) ? `<button class="btn" id="pf_paid">Got paid</button>` : ""}
      ${ed ? `<button class="btn primary" id="pf_save">${isNew ? "Add invoice" : "Save"}</button>` : ""}
    </div>`);
  const sel = $("#pf_client");
  sel.onchange = () => { $("#pf_new").style.display = sel.value === "__new" ? "" : "none"; const cc = clientById(sel.value); if (cc && cc.biz && isNew) setBizPicked("pf", cc.biz); if (sel.value && sel.value !== "__new" && !$("#pf_desc").value) { const c = clientById(sel.value); if (c) { $("#pf_desc").value = c.service || ""; if (!$("#pf_amount").value && c.quoteAmount) $("#pf_amount").value = c.quoteAmount; } } };
  $("#pf_terms").onclick = e => { const b = e.target.closest("[data-n]"); if (b) $("#pf_due").value = addDays($("#pf_issue").value || today(), +b.dataset.n); };
  const save = () => {
    const amount = num($("#pf_amount").value);
    if (!amount) { toast("Enter the amount"); return false; }
    let c = null;
    if (sel.value === "__new") {
      const nm = $("#pf_nname").value.trim(), ph = normPhone($("#pf_nphone").value);
      if (!nm && !ph) { toast("Enter the new client's name"); return false; }
      c = (ph && local.clients.find(x => x.phone === ph)) || newClient({ name: nm, phone: ph, stage: "Won", source: "Existing client", biz: bizPicked("pf"), nextFollowUp: "" });
      if (!clientById(c.id)) { addHistory(c, "created", "Client added with an invoice"); put("clients", c); logAct("Client added", c, "With invoice"); }
    } else if (sel.value) c = clientById(sel.value);
    const was = JSON.stringify([p.amount, p.dueDate]);
    Object.assign(p, { biz: bizPicked("pf"), clientId: c ? c.id : "", clientName: c ? clientLabel(c) : "", amount: String(amount), invoiceNo: $("#pf_inv").value.trim(), description: $("#pf_desc").value.trim(),
      issueDate: $("#pf_issue").value || today(), dueDate: $("#pf_due").value || $("#pf_issue").value || today(), repeat: $("#pf_rep").value, note: $("#pf_note").value.trim() });
    put("payments", p);
    logAct(isNew ? "Invoice added" : "Invoice edited", p, (p.clientName ? p.clientName + " · " : "") + money(p.amount) + (was !== JSON.stringify([p.amount, p.dueDate]) ? " · due " + p.dueDate : ""));
    if (isNew && c) { addHistory(c, "payment", "Invoice added: " + money(p.amount) + " " + p.description + " (due " + fmtDate(p.dueDate) + ")"); put("clients", c); }
    return true;
  };
  if ($("#pf_save")) $("#pf_save").onclick = () => { if (save()) { closeModal(); toast(isNew ? "Invoice added – you'll be reminded if it's not paid by " + fmtDate(p.dueDate) : "Saved"); render(); } };
  if ($("#pf_paid")) $("#pf_paid").onclick = () => { if (save()) recordPaymentForm(p); };
  if ($("#pf_del")) $("#pf_del").onclick = () => { if (confirm("Delete this invoice?" + (p.repeat ? " (Repeating invoices will stop.)" : ""))) { logAct("Invoice deleted", p, money(p.amount)); remove("payments", p.id); closeModal(); render(); } };
  $("#mbox").querySelectorAll("[data-delrec]").forEach(b => b.onclick = () => { if (confirm("Remove this payment?")) { p.payments.splice(+b.dataset.delrec, 1); put("payments", p); logAct("Payment removed", p, ""); payForm(p, false); render(); } });
  if (c0 && sel.value !== c0.id) sel.value = c0.id;
}
function recordPaymentForm(p) {
  const bal = balanceOf(p);
  modal(`<h2>✔ Payment received</h2><div class="hint">${esc(p.clientName || "")} · ${esc(p.description || "")} · balance ${money(bal)}</div>
    <div class="stack" style="margin-top:12px">
      <div class="row2 keep"><label class="f"><span>Amount received (AED)</span><input type="text" inputmode="decimal" id="rp_amt" value="${bal}"></label>
        <label class="f"><span>Date</span><input type="date" id="rp_date" value="${today()}"></label></div>
      <label class="f"><span>How</span><div class="chips" id="rp_m">${METHODS.map((m, i) => `<button data-m="${esc(m)}" class="${i === 0 ? "on" : ""}">${esc(m)}</button>`).join("")}</div></label>
      <label class="f"><span>Note (optional)</span><input type="text" id="rp_note" placeholder="e.g. cheque no., reference"></label>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="rp_ok">Save payment</button></div>`);
  let method = METHODS[0];
  $("#rp_m").onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; method = b.dataset.m; $("#rp_m").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("#rp_ok").onclick = () => {
    const amt = num($("#rp_amt").value); if (!amt) { toast("Enter the amount received"); return; }
    p.payments = p.payments || []; p.payments.push({ id: uid(), date: $("#rp_date").value || today(), amount: String(amt), method, note: $("#rp_note").value.trim(), by: me().name });
    put("payments", p); logAct("Payment received", p, money(amt) + " · " + method);
    const c = clientById(p.clientId); if (c) { addHistory(c, "payment", "💰 Payment received: " + money(amt) + " (" + method + ")" + (isPaid(p) ? " – fully paid" : " – balance " + money(balanceOf(p)))); put("clients", c); }
    closeModal(); toast(isPaid(p) ? "Fully paid ✔" : "Saved. Balance " + money(balanceOf(p))); render();
  };
}

/* ===================== CLIENTS ===================== */
function filteredClients() {
  const q = clientFilter.q.toLowerCase().trim(), qd = q.replace(/\D/g, "");
  return local.clients.filter(c => {
    if (!inBizClient(c)) return false;
    if (clientFilter.stage === "open" && OPEN_STAGES.indexOf(c.stage) < 0) return false;
    if (clientFilter.stage === "owes" && clientBalance(c.id) <= 0) return false;
    if (STAGES.indexOf(clientFilter.stage) >= 0 && c.stage !== clientFilter.stage) return false;
    if (clientFilter.service && c.service !== clientFilter.service) return false;
    if (clientFilter.who && c.assignedTo !== clientFilter.who) return false;
    if (q && (c.name + " " + c.company + " " + c.email + " " + c.notes + " " + c.trn).toLowerCase().indexOf(q) < 0 && !(qd.length >= 3 && (c.phone || "").indexOf(qd) >= 0)) return false;
    return true;
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
function renderClients(main) {
  const arr = filteredClients();
  const nextTask = {}; local.tasks.filter(t => !t.done && t.clientId).sort(byDue).forEach(t => { if (!nextTask[t.clientId]) nextTask[t.clientId] = t; });
  main.innerHTML = `<div class="head"><h1>Clients</h1>
      <button class="btn" data-nav="pipeline">📊 Quotations</button>
      ${can("edit") ? `<button class="btn hide-m" data-act="import">⬆ Import</button>` : ""}
      ${can("export") ? `<button class="btn hide-m" data-act="exportclients">⬇ Excel</button>` : ""}
      ${can("edit") ? `<button class="btn primary" data-act="newclient">+ New client</button>` : ""}</div>
    <div class="bar"><input type="search" id="cq" placeholder="🔍 Search name, company, phone, TRN" value="${esc(clientFilter.q)}"></div>
    <div class="bar">
      <div class="seg" id="cstage">${[["open", "Enquiries"], ["Won", "Clients (won)"], ["owes", "Owe money"], ["all", "All"]].map(([v, l]) => `<button data-v="${v}" class="${clientFilter.stage === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <select id="csvc"><option value="">All services</option>${local.settings.services.map(s => opt(s, clientFilter.service)).join("")}</select>
      ${syncOn() ? `<select id="cwho"><option value="">Everyone</option>${staffNames().map(n => opt(n, clientFilter.who)).join("")}</select>` : ""}
    </div>
    <section class="sec" style="margin-top:0">${arr.length ? arr.slice(0, 400).map(c => {
      const t = nextTask[c.id], d = t && dueLabel(t), owe = clientBalance(c.id), di = docItems(c), dm = di.length ? missingDocs(c).length : 0;
      return `<div class="item nodone">
        <div class="avatar">${esc(initials(c))}</div>
        <div class="main" data-client="${c.id}"><div class="t">${esc(clientLabel(c))}</div>
          <div class="m"><span class="pill ${STAGE_PILL[c.stage]}">${esc(c.stage)}</span>${c.service ? `<span>${esc(c.service)}</span>` : ""}${owe > 0 ? `<span class="red" style="font-weight:600">owes ${money(owe)}</span>` : ""}
            ${di.length ? `<span class="${dm ? "amber" : "green"}">📄 ${di.length - dm}/${di.length} docs</span>` : ""}
            ${OPEN_STAGES.indexOf(c.stage) >= 0 && c.nextFollowUp ? `<span class="${c.nextFollowUp <= today() ? "red" : ""}" style="font-weight:600">📞 ${c.nextFollowUp < today() ? "follow-up late" : c.nextFollowUp === today() ? "follow up today" : "follow up " + fmtDate(c.nextFollowUp)}</span>` : ""}
            ${t ? `<span>Next: ${esc(t.title)} – <b class="${d.cls}">${d.text}</b></span>` : OPEN_STAGES.indexOf(c.stage) >= 0 && !c.nextFollowUp ? `<span class="amber" style="font-weight:600">No next step</span>` : ""}${bizTag(c.biz)}</div></div>
        ${c.phone ? `<div class="btns hide-m"><a class="btn sm wa" href="${waLink(c.phone)}" target="_blank" rel="noopener">💬 Chat</a></div>` : ""}
      </div>`; }).join("") : `<div class="empty">No clients found.${can("edit") ? ` <button class="linkbtn" data-act="newclient">Add a client</button>` : ""}</div>`}</section>
    <div class="hint" style="margin-top:8px">${arr.length} shown</div>`;
  $("#cq").oninput = e => { clientFilter.q = e.target.value; const p = e.target.selectionStart; renderClients(main); const i = $("#cq"); i.focus(); i.setSelectionRange(p, p); };
  $("#cstage").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { clientFilter.stage = b.dataset.v; renderClients(main); } };
  $("#csvc").onchange = e => { clientFilter.service = e.target.value; renderClients(main); };
  const w = $("#cwho"); if (w) w.onchange = e => { clientFilter.who = e.target.value; renderClients(main); };
}
function renderPipeline(main) {
  const by = {}; STAGES.forEach(s => { by[s] = []; });
  local.clients.filter(inBizClient).forEach(c => { (by[c.stage] || by.Enquiry).push(c); });
  const ninety = addDays(today(), -90);
  const sum = arr => arr.reduce((s, c) => s + num(c.quoteAmount), 0);
  main.innerHTML = `<div class="head"><h1>Quotations</h1><button class="btn" data-nav="clients">👥 Client list</button>${can("edit") ? `<button class="btn primary" data-act="newclient">+ New enquiry</button>` : ""}
      <div class="sub">Each enquiry moves left to right. Open one and tap the next stage. Won and Lost show the last 90 days.</div></div>
    <div class="board">${STAGES.map(s => {
      let arr = by[s].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      if (s === "Won" || s === "Lost") arr = arr.filter(c => (c.updatedAt || "").slice(0, 10) >= ninety);
      const v = sum(arr);
      return `<div class="col"><h4><span style="color:${STAGE_COLOR[s]}">${s}</span><span class="muted">${arr.length}${v ? " · " + money(v) : ""}</span></h4>
        ${arr.slice(0, 100).map(c => { const qa = quoteAge(c); return `<div class="bcard" data-client="${c.id}"><b>${esc(clientLabel(c))}</b><div class="s">${esc([c.service, c.quoteAmount ? money(c.quoteAmount) : ""].filter(String).join(" · "))}</div>
          ${OPEN_STAGES.indexOf(s) >= 0 ? `<div class="s">${qa != null && s !== "Enquiry" ? "sent " + qa + "d ago · " : ""}<span class="${needsFollow(c) ? "red" : ""}">📞 ${c.nextFollowUp ? (c.nextFollowUp <= today() ? "follow up now" : fmtDate(c.nextFollowUp)) : "no date"}</span></div>` : ""}${bizTag(c.biz)}</div>`; }).join("") || `<div class="hint" style="padding:6px">None</div>`}</div>`;
    }).join("")}</div>`;
}
async function renderActivity(main) {
  main.innerHTML = `<div class="head"><h1>Activity log</h1></div><div class="empty">Loading…</div>`;
  try {
    const r = await api("activity", { from: addDays(today(), -60) });
    main.innerHTML = `<div class="head"><h1>Activity log</h1><input type="search" id="aq" placeholder="🔍 Filter" style="max-width:260px"><div class="sub">Last 60 days · every sign-in, change, reminder and payment, by person.</div></div>
      <section class="sec" style="margin-top:0;overflow-x:auto"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody id="arows"></tbody></table></section>`;
    const draw = () => { const q = ($("#aq").value || "").toLowerCase();
      $("#arows").innerHTML = r.rows.filter(x => !q || JSON.stringify(x).toLowerCase().indexOf(q) >= 0).slice(0, 800)
        .map(x => `<tr><td style="white-space:nowrap">${fmtWhen(x.at)}</td><td>${esc(x.user)}</td><td>${esc(x.type)}</td><td>${esc(x.record)}</td><td>${esc(x.details)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nothing yet</td></tr>`; };
    $("#aq").oninput = draw; draw();
  } catch (e) { main.innerHTML = `<div class="head"><h1>Activity log</h1></div><div class="empty">${esc(e.message)}</div>`; }
}

/* ===================== client panel ===================== */
function waLink(phone, text) { return "https://wa.me/" + phone + (text ? "?text=" + encodeURIComponent(text) : ""); }
function fillTemplate(text, c) {
  return String(text).replace(/\{name\}/g, (c.name || "").split(" ")[0] || "there").replace(/\{fullname\}/g, c.name || "").replace(/\{company\}/g, bizCompany(c.biz))
    .replace(/\{service\}/g, c.service || "your requirement").replace(/\{amount\}/g, c.quoteAmount ? money(c.quoteAmount) : "").replace(/\{me\}/g, me().name || "").replace(/\{bank\}/g, bizBank(c.biz))
    .replace(/\{documents\}/g, docsText(c) || "(we have everything we need – thank you!)");
}
function docSection(c) {
  const lists = activeDocLists(c), ed = can("edit");
  const others = (local.settings.docLists || []).filter(l => lists.indexOf(l) < 0);
  if (!lists.length && !ed) return "";
  const miss = missingDocs(c), all = docItems(c);
  return `<section class="sec"><header><h2>📄 Documents ${all.length ? `<span class="pill ${miss.length ? "amber" : "green"}">${all.length - miss.length} of ${all.length}</span>` : ""}</h2>
      ${ed && others.length ? `<select id="docAdd" style="width:auto;min-height:34px;padding:4px 8px"><option value="">+ Checklist</option>${others.map(l => `<option>${esc(l.name)}</option>`).join("")}</select>` : ""}</header>
    ${lists.length ? lists.map(l => { const got = l.items.filter(i => hasDoc(c, i)).length;
      return `<div class="sub-h" style="display:flex;gap:8px;align-items:center"><span style="flex:1">${esc(l.name)} · ${got}/${l.items.length}</span>${ed ? `<button class="linkbtn" data-docrm="${esc(l.name)}" style="font-size:12px;text-transform:none">remove</button>` : ""}</div>
        <div class="progress"><span style="width:${Math.round(got / Math.max(1, l.items.length) * 100)}%"></span></div>
        ${l.items.map(i => { const d = c.docs && c.docs[i]; return `<label class="docrow"><input type="checkbox" data-doc="${esc(i)}" ${d ? "checked" : ""} ${ed ? "" : "disabled"}><span class="${d ? "got" : ""}">${esc(i)}</span>${d ? `<small>${fmtWhen(d.at).split(",")[0]}</small>` : ""}</label>`; }).join("")}`; }).join("")
      : `<div class="empty">No checklist. ${others.length ? "Pick one with <b>+ Checklist</b> (e.g. VAT or corporate tax registration)." : ""}</div>`}
    ${miss.length && ed ? `<div style="padding:12px 16px;border-top:1px solid var(--border)"><button class="btn wa" data-act="askdocs" style="width:100%">💬 Ask for the ${miss.length} missing document${miss.length > 1 ? "s" : ""}</button>
      ${c.docsRequestedAt ? `<div class="hint" style="margin-top:6px;text-align:center">Last asked ${ago(c.docsRequestedAt)}</div>` : ""}</div>` : all.length ? `<div class="empty green" style="font-weight:600">✔ All documents received</div>` : ""}
  </section>`;
}
function docRequestForm(c) {
  const tpl = (local.settings.templates || []).find(t => /\{documents\}/.test(t.text));
  const text = fillTemplate(tpl ? tpl.text : DEFAULT_SETTINGS.templates.find(t => /\{documents\}/.test(t.text)).text, c);
  modal(`<h2>💬 Ask for documents</h2><div class="hint">${esc(clientLabel(c))} · ${missingDocs(c).length} missing</div>
    <div class="stack" style="margin-top:12px">
      <label class="f"><span>Message (you can edit it)</span><textarea id="dr_text" style="min-height:220px">${esc(text)}</textarea></label>
      <label class="f"><span>Remind me to check if they've sent them in</span><div class="chips" id="dr_next">${[[2, "2 days"], [3, "3 days"], [5, "5 days"], [7, "1 week"], [0, "Don't remind"]].map(([n, l]) => `<button data-n="${n}" class="${n === 3 ? "on" : ""}">${l}</button>`).join("")}</div></label>
      ${!c.phone ? `<div class="detect">⚠ No WhatsApp number for this client – use Email or add a number with ✏ Edit.</div>` : ""}
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button>${c.email ? `<button class="btn" id="dr_mail">✉ Email</button>` : ""}<button class="btn" id="dr_copy">Copy text</button>${c.phone ? `<button class="btn wa" id="dr_wa">💬 Send on WhatsApp</button>` : ""}</div>`);
  let next = 3;
  $("#dr_next").onclick = e => { const b = e.target.closest("[data-n]"); if (!b) return; next = +b.dataset.n; $("#dr_next").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  const done = channel => {
    const miss = missingDocs(c);
    c.docsRequestedAt = nowIso();
    addHistory(c, "whatsapp", "📄 Documents requested (" + channel + "):\n" + miss.map(d => "• " + d).join("\n"));
    if (next) {
      const title = "Check documents received – " + shortName(c);
      let t = local.tasks.find(x => !x.done && x.clientId === c.id && x.title === title);
      if (t) t.dueDate = addDays(today(), next); else t = newTask({ title, dueDate: addDays(today(), next), clientId: c.id, clientName: clientLabel(c), assignedTo: c.assignedTo || (syncOn() ? me().name : ""), docChase: true });
      put("tasks", t);
    }
    put("clients", c); logAct("Documents requested", c, channel + " · " + miss.length + " missing");
    closeModal(); toast("Logged" + (next ? " – I'll remind you on " + fmtDate(addDays(today(), next)) : "")); render();
  };
  const w = $("#dr_wa"); if (w) w.onclick = () => { window.open(waLink(c.phone, $("#dr_text").value), "_blank", "noopener"); done("WhatsApp"); };
  const m = $("#dr_mail"); if (m) m.onclick = () => { location.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("Documents required – " + (c.service || "")) + "&body=" + encodeURIComponent($("#dr_text").value); done("Email"); };
  $("#dr_copy").onclick = () => { const v = $("#dr_text").value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast("Copied – paste it in WhatsApp")).catch(() => { $("#dr_text").select(); document.execCommand("copy"); toast("Copied"); }); done("Copied text"); };
}
function toggleDoc(c, item, on) {
  c.docs = c.docs || {};
  if (on) c.docs[item] = { at: nowIso(), by: me().name }; else delete c.docs[item];
  if (!Array.isArray(c.docLists)) c.docLists = activeDocLists(c).map(l => l.name);
  addHistory(c, "doc", (on ? "📄 Received: " : "📄 Un-ticked: ") + item);
  put("clients", c); logAct(on ? "Document received" : "Document un-ticked", c, item);
  if (on && docItems(c).length && !missingDocs(c).length) {
    local.tasks.filter(t => !t.done && t.clientId === c.id && t.docChase).forEach(t => completeTask(t, true));
    toast("🎉 All documents received for " + shortName(c));
  }
  renderDrawer();
}
function openClient(id) { openClientId = id; renderDrawer(); $("#drawer").classList.add("open"); $("#shade").classList.add("on"); }
function closeDrawer() { openClientId = null; $("#drawer").classList.remove("open"); $("#shade").classList.remove("on"); }
function renderDrawer() {
  const c = clientById(openClientId);
  if (!c) { closeDrawer(); return; }
  const ed = can("edit");
  const tasks = local.tasks.filter(t => t.clientId === c.id);
  const openT = tasks.filter(t => !t.done).sort(byDue), doneT = tasks.filter(t => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  const pays = local.payments.filter(p => p.clientId === c.id).sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
  const owe = clientBalance(c.id);
  const hist = (c.history || []).slice().reverse();
  $("#drawer").innerHTML = `
    <div class="dh"><div class="r1"><div class="avatar" style="width:46px;height:46px;font-size:16px">${esc(initials(c))}</div>
      <div style="flex:1;min-width:0"><h2>${esc(shortName(c))}</h2><div class="hint">${esc([c.company && c.name ? c.company : "", fmtPhone(c.phone)].filter(String).join(" · "))}</div></div>
      <button class="iconbtn btn" data-act="close" title="Close" style="border-radius:50%;width:40px;padding:0">✕</button></div>
      <div class="acts">
        ${c.phone ? `<a class="btn wa" href="${waLink(c.phone)}" target="_blank" rel="noopener" data-walog="${c.id}">💬 WhatsApp</a>
          <select id="tplSel" style="width:auto;min-height:40px"><option value="">Send a message…</option>${missingDocs(c).length && ed ? `<option value="docs">📄 Ask for missing documents</option>` : ""}${local.settings.templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("")}</select>
          <a class="btn" href="tel:+${c.phone}">📞 Call</a>` : ""}
        ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">✉ Email</a>` : ""}
        ${ed ? `<button class="btn" data-act="editclient">✏ Edit</button>` : ""}
      </div></div>
    <div class="db">
      <section class="sec"><header><h2>Stage</h2>${c.quoteAmount ? `<span class="muted">Quote ${money(c.quoteAmount)}</span>` : ""}</header>
        <div class="stages">${STAGES.map(s => `<button ${ed ? "" : "disabled"} data-stage="${s}" class="${c.stage === s ? "on" : ""}" style="${c.stage === s ? "background:" + STAGE_COLOR[s] : ""}">${s}</button>`).join("")}</div>
        ${c.stage === "Lost" && c.lostReason ? `<div class="hint" style="padding:0 16px 12px">Lost reason: ${esc(c.lostReason)}</div>` : ""}
        ${OPEN_STAGES.indexOf(c.stage) >= 0 ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 16px 14px">
          <span style="flex:1;min-width:180px" class="${needsFollow(c) ? "red" : ""}"><b>📞 Next follow-up:</b> ${c.nextFollowUp ? (c.nextFollowUp === today() ? "today" : c.nextFollowUp < today() ? fmtDate(c.nextFollowUp) + " (late)" : fmtDate(c.nextFollowUp)) : "not set"}${c.followUps ? ` <span class="muted">· done ${c.followUps}×</span>` : ""}</span>
          ${ed ? `<button class="btn sm wa" data-follow="${c.id}">📞 Follow up now</button>` : ""}</div>` : ""}
        ${multiBiz() ? `<div class="hint" style="padding:0 16px 12px">🏢 ${esc(bizName(c.biz) || "No company set")}</div>` : ""}</section>

      <section class="sec"><header><h2>✅ Tasks</h2>${ed ? `<button class="btn sm" data-act="clienttask">+ Task</button>` : ""}</header>
        ${listOf(openT, taskItem, { noClient: true }) || `<div class="empty">${OPEN_STAGES.indexOf(c.stage) >= 0 ? "No next step yet – add a task so you're reminded." : "No open tasks."}</div>`}
        ${doneT.length ? `<details><summary class="hint" style="cursor:pointer;padding:10px 16px">${doneT.length} done</summary>${listOf(doneT.slice(0, 30), taskItem, { noClient: true })}</details>` : ""}</section>

      ${docSection(c)}

      <section class="sec"><header><h2>💰 Payments ${owe > 0 ? `<span class="pill red">owes ${money(owe)}</span>` : pays.length ? `<span class="pill green">all paid</span>` : ""}</h2>${ed ? `<button class="btn sm" data-act="clientpay">+ Invoice</button>` : ""}</header>
        ${pays.length ? listOf(pays.slice(0, 30), payItem, { noClient: true }) : `<div class="empty">No invoices.</div>`}</section>

      ${ed ? `<section class="sec"><header><h2>📝 Add a note</h2></header><div class="notebox">
        <textarea id="noteText" placeholder="What was discussed, call notes, or paste a WhatsApp message…"></textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary sm" data-note="note">Save note</button><button class="btn sm" data-note="call">📞 Log call</button><button class="btn sm" data-note="wa">💬 Log WhatsApp</button><button class="btn sm" data-act="notetask">Make it a task…</button></div></div></section>` : ""}

      <section class="sec"><header><h2>Details</h2></header><dl class="kv">
        ${[["Company", c.company], ["Phone", fmtPhone(c.phone)], ["Email", c.email], ["TRN", c.trn], ["Service", c.service], ["Quotation", c.quoteAmount ? money(c.quoteAmount) : ""], ["Source", c.source], ["Handled by", syncOn() ? c.assignedTo : ""], ["Added", fmtWhen(c.createdAt)], ["Notes", c.notes]]
          .filter(r => r[1]).map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl></section>

      <section class="sec"><header><h2>History</h2></header>
        ${hist.length ? `<ul class="hist">${hist.map(h => `<li class="${esc(h.kind)}"><div class="when">${fmtWhen(h.at)}${h.by && syncOn() ? " · " + esc(h.by) : ""}</div><div class="txt">${esc(h.text)}</div></li>`).join("")}</ul>` : `<div class="empty">No history yet.</div>`}</section>
      ${can("delete") ? `<div style="margin:22px 4px"><button class="btn danger sm" data-act="delclient">Delete this client</button></div>` : ""}
    </div>`;
  const tpl = $("#tplSel");
  if (tpl) tpl.onchange = () => {
    if (tpl.value === "docs") { tpl.value = ""; docRequestForm(c); return; }
    const t = local.settings.templates[+tpl.value]; if (!t) return;
    window.open(waLink(c.phone, fillTemplate(t.text, c)), "_blank", "noopener");
    if (ed) {
      addHistory(c, "whatsapp", "WhatsApp message sent: " + t.name + (/\{documents\}/.test(t.text) && missingDocs(c).length ? "\n" + missingDocs(c).map(d => "• " + d).join("\n") : ""));
      if (/\{documents\}/.test(t.text)) c.docsRequestedAt = nowIso();
      put("clients", c); logAct("WhatsApp template", c, t.name); renderDrawer();
    }
    tpl.value = "";
  };
  const da = $("#docAdd");
  if (da) da.onchange = () => { if (!da.value) return; c.docLists = activeDocLists(c).map(l => l.name).concat([da.value]); addHistory(c, "doc", "📄 Checklist added: " + da.value); put("clients", c); logAct("Checklist added", c, da.value); renderDrawer(); };
}
function setStage(c, s) {
  if (c.stage === s) return;
  const apply = reason => {
    const from = c.stage; c.stage = s; if (s === "Lost") c.lostReason = reason || "";
    if (s === "Won" || s === "Lost") c.nextFollowUp = "";
    else if (s === "Quotation sent") c.nextFollowUp = addDays(today(), +local.settings.followUpDays || 3);
    else if (!c.nextFollowUp) c.nextFollowUp = addDays(today(), 1);
    addHistory(c, "stage", "Stage: " + from + " → " + s + (reason ? " (" + reason + ")" : ""));
    put("clients", c); logAct("Stage changed", c, from + " → " + s);
    render();
    if (s === "Won" || s === "Lost") {
      const open = local.tasks.filter(t => !t.done && t.clientId === c.id && /quot|follow/i.test(t.title));
      if (open.length && confirm("Mark " + open.length + " open follow-up task(s) for this client as done?")) open.forEach(t => completeTask(t, true));
    }
    if (s === "Quotation sent") toast("Quotation sent 👍  I'll remind you to follow up on " + fmtDate(c.nextFollowUp));
    else if (s === "Won") {
      modal(`<h2>🎉 Won!</h2><p>Do you want to add the invoice now, so you're reminded if it isn't paid?</p>
        <div class="mfoot"><button class="btn" data-act="mclose">Not now</button><button class="btn primary" id="won_inv">Add invoice${c.quoteAmount ? " (" + money(c.quoteAmount) + ")" : ""}</button></div>`);
      $("#won_inv").onclick = () => { closeModal(); payForm(newPayment({ clientId: c.id, clientName: clientLabel(c), amount: c.quoteAmount || "", description: c.service || "" }), true); };
    }
  };
  if (s === "Lost") {
    modal(`<h2>Why was it lost?</h2><div class="chips" id="lr" style="margin-top:10px">${local.settings.lostReasons.map((r, i) => `<button data-r="${esc(r)}" class="${i === 0 ? "on" : ""}">${esc(r)}</button>`).join("")}</div>
      <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="lrok">Mark as Lost</button></div>`);
    let reason = local.settings.lostReasons[0] || "";
    $("#lr").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; reason = b.dataset.r; $("#lr").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
    $("#lrok").onclick = () => { closeModal(); apply(reason); };
  } else apply("");
}

/* ===================== forms ===================== */
function modal(html) { $("#mbox").innerHTML = html; $("#modal").classList.add("on"); $("#mbox").scrollTop = 0; const f = $("#mbox").querySelector("input[type=text]:not([disabled]),textarea"); if (f && window.innerWidth > 860) setTimeout(() => f.focus(), 30); }
function closeModal() { $("#modal").classList.remove("on"); $("#mbox").innerHTML = ""; }
function clientOptions(sel, withNew) {
  return `<option value="">– No client –</option>` + (withNew ? `<option value="__new">+ New client…</option>` : "") +
    local.clients.slice().sort((a, b) => clientLabel(a).localeCompare(clientLabel(b))).map(c => opt(c.id, sel, clientLabel(c) + (c.phone ? " (" + fmtPhone(c.phone) + ")" : ""))).join("");
}
function clientForm(c, isNew, after) {
  c = c || newClient();
  const staff = staffNames();
  modal(`<h2>${isNew ? "New client / enquiry" : "Edit client"}</h2>
    <div class="stack" style="margin-top:12px">
      ${bizPicker("cf", c.biz)}
      <div class="row2"><label class="f"><span>Name</span><input type="text" id="cf_name" value="${esc(c.name)}" placeholder="Contact person"></label>
        <label class="f"><span>Company</span><input type="text" id="cf_company" value="${esc(c.company)}"></label></div>
      <div class="row2"><label class="f"><span>WhatsApp / phone</span><input type="tel" id="cf_phone" value="${esc(c.phone ? "+" + c.phone : "")}" placeholder="050 123 4567"></label>
        <label class="f"><span>Email</span><input type="email" id="cf_email" value="${esc(c.email)}"></label></div>
      <label class="f"><span>What do they need?</span><select id="cf_service"><option value="">–</option>${local.settings.services.map(s => opt(s, c.service)).join("")}${c.service && local.settings.services.indexOf(c.service) < 0 ? opt(c.service, c.service) : ""}</select></label>
      <label class="f"><span>Stage</span><div class="chips" id="cf_stage">${STAGES.map(s => `<button type="button" data-s="${s}" class="${c.stage === s ? "on" : ""}">${s}</button>`).join("")}</div></label>
      <div class="row2"><label class="f"><span>Quotation amount (AED)</span><input type="text" inputmode="decimal" id="cf_quote" value="${esc(c.quoteAmount)}"></label>
        <label class="f"><span>How did they find you?</span><select id="cf_source"><option value="">–</option>${local.settings.sources.map(s => opt(s, c.source)).join("")}</select></label></div>
      <div class="row2"><label class="f"><span>TRN (optional)</span><input type="text" id="cf_trn" value="${esc(c.trn)}"></label>
        ${staff.length ? `<label class="f"><span>Handled by</span><select id="cf_who"><option value="">–</option>${staff.map(n => opt(n, c.assignedTo)).join("")}</select></label>` : "<span></span>"}</div>
      <label class="f"><span>Notes</span><textarea id="cf_notes">${esc(c.notes)}</textarea></label>
      <label class="f" id="cf_fuwrap"><span>📞 Next follow-up</span><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="date" id="cf_fu" value="${esc(c.nextFollowUp || "")}" style="width:auto">
        <div class="chips" id="cf_fuq">${[[1, "Tomorrow"], [3, "3 days"], [7, "1 week"]].map(([n, l]) => `<button type="button" data-n="${n}">${l}</button>`).join("")}</div></div></label>
      <div id="cf_dup" class="hint"></div>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="cf_save">${isNew ? "Add" : "Save"}</button></div>`);
  let stage = c.stage;
  const fuShow = () => { $("#cf_fuwrap").style.display = OPEN_STAGES.indexOf(stage) >= 0 ? "" : "none"; };
  $("#cf_stage").onclick = e => { const b = e.target.closest("[data-s]"); if (!b) return; stage = b.dataset.s; $("#cf_stage").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    if (stage === "Quotation sent" && (!$("#cf_fu").value || $("#cf_fu").value <= today())) $("#cf_fu").value = addDays(today(), +local.settings.followUpDays || 3); fuShow(); };
  $("#cf_fuq").onclick = e => { const b = e.target.closest("[data-n]"); if (b) $("#cf_fu").value = addDays(today(), +b.dataset.n); };
  fuShow();
  const dupCheck = () => { const p = normPhone($("#cf_phone").value), d = p && local.clients.find(x => x.phone === p && x.id !== c.id);
    $("#cf_dup").innerHTML = d ? `⚠ This number already belongs to <a href="#" data-client="${d.id}">${esc(clientLabel(d))}</a>.` : ""; };
  $("#cf_phone").oninput = dupCheck; dupCheck();
  $("#cf_save").onclick = () => {
    const name = $("#cf_name").value.trim(), company = $("#cf_company").value.trim(), phone = normPhone($("#cf_phone").value);
    if (!name && !company && !phone) { toast("Enter at least a name, company or phone"); return; }
    const fromStage = c.stage;
    Object.assign(c, { biz: bizPicked("cf"), name, company, phone, email: $("#cf_email").value.trim(), service: $("#cf_service").value, quoteAmount: $("#cf_quote").value.trim(),
      source: $("#cf_source").value, trn: $("#cf_trn").value.trim(), notes: $("#cf_notes").value.trim(), nextFollowUp: OPEN_STAGES.indexOf(stage) >= 0 ? $("#cf_fu").value : "" });
    if ($("#cf_who")) c.assignedTo = $("#cf_who").value;
    if (isNew) { c.stage = stage; addHistory(c, "created", "Added" + (c.source ? " (" + c.source + ")" : "")); }
    else if (stage !== fromStage) { c.stage = stage; addHistory(c, "stage", "Stage: " + fromStage + " → " + stage); }
    put("clients", c);
    logAct(isNew ? "Client added" : "Client edited", c, c.stage + (c.quoteAmount ? " · " + money(c.quoteAmount) : ""));
    closeModal();
    toast((isNew ? "Added" : "Saved") + (c.nextFollowUp ? " – follow-up " + fmtDate(c.nextFollowUp) : ""));
    if (after) after(c); else { render(); openClient(c.id); }
  };
}
function taskForm(t, isNew, intro) {
  const staff = staffNames(), ed = can("edit");
  const c0 = t.clientId && clientById(t.clientId);
  modal(`<h2>${isNew ? "New task" : "Task"}</h2>
    ${intro ? `<p class="hint" style="margin:0">${esc(intro)}</p>` : ""}
    <div class="stack" style="margin-top:12px">
      ${bizPicker("tf", t.biz)}
      <label class="f"><span>What needs doing?</span><input type="text" id="tf_title" value="${esc(t.title)}" ${ed ? "" : "disabled"} placeholder="e.g. Send quotation"></label>
      <label class="f"><span>When?</span><div class="chips" id="tf_q">${[["Today", 0], ["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7], ["No date", null]].map(([l, n]) => { const v = n == null ? "" : addDays(today(), n); return `<button type="button" data-qd="${v}" class="${t.dueDate === v ? "on" : ""}">${l}</button>`; }).join("")}</div></label>
      <div class="row2 keep"><label class="f"><span>Date</span><input type="date" id="tf_date" value="${esc(t.dueDate)}"></label>
        <label class="f"><span>Time (optional)</span><input type="time" id="tf_time" value="${esc(t.dueTime)}"></label></div>
      <div class="row2"><label class="f"><span>Client</span><select id="tf_client">${clientOptions(t.clientId)}</select></label>
        <label class="f"><span>Repeat</span><select id="tf_rep">${Object.keys(REPEATS).map(k => opt(k, t.repeat, REPEATS[k])).join("")}</select></label></div>
      ${staff.length ? `<label class="f"><span>Who does it?</span><select id="tf_who"><option value="">–</option>${staff.map(n => opt(n, t.assignedTo)).join("")}</select></label>` : ""}
      <label class="f"><span>Notes</span><textarea id="tf_note" style="min-height:60px">${esc(t.note)}</textarea></label>
      ${t.waText ? `<div class="detect"><b>💬 WhatsApp message</b><div style="white-space:pre-wrap;margin-top:4px">${esc(t.waText)}</div></div>` : ""}
      ${!isNew ? `<div class="hint">Added ${fmtWhen(t.createdAt)}${t.createdBy && syncOn() ? " by " + esc(t.createdBy) : ""}${t.done ? " · Done " + fmtWhen(t.doneAt) + (t.doneBy && syncOn() ? " by " + esc(t.doneBy) : "") : ""}</div>` : ""}
      ${!isNew && t.dueDate && !t.done ? `<a class="btn" href="${gcalLink(t)}" target="_blank" rel="noopener" style="align-self:flex-start">📅 Add to my Google Calendar</a>` : ""}
    </div>
    <div class="mfoot">
      ${!isNew && can("delete") ? `<button class="btn danger" id="tf_del" style="margin-right:auto">Delete</button>` : ""}
      ${c0 && c0.phone ? `<a class="btn wa" href="${waLink(c0.phone)}" target="_blank" rel="noopener">💬 Chat</a>` : ""}
      <button class="btn" data-act="mclose">Cancel</button>
      ${!isNew && ed ? `<button class="btn" id="tf_done">${t.done ? "Not done" : "✓ Done"}</button>` : ""}
      ${ed ? `<button class="btn primary" id="tf_save">${isNew ? "Add task" : "Save"}</button>` : ""}
    </div>`);
  $("#tf_q").onclick = e => { const b = e.target.closest("[data-qd]"); if (!b) return; $("#tf_date").value = b.dataset.qd; $("#tf_q").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  const save = () => {
    const title = $("#tf_title").value.trim();
    if (!title) { toast("Please write what needs doing"); return false; }
    const cid = $("#tf_client").value, c = cid && clientById(cid);
    Object.assign(t, { biz: bizPicked("tf"), title, dueDate: $("#tf_date").value, dueTime: $("#tf_time").value, repeat: $("#tf_rep").value, clientId: cid, clientName: c ? clientLabel(c) : "", note: $("#tf_note").value.trim() });
    if ($("#tf_who")) t.assignedTo = $("#tf_who").value;
    if (t.repeat && !t.dueDate) t.dueDate = today();
    put("tasks", t);
    logAct(isNew ? "Task added" : "Task edited", t, (t.clientName ? t.clientName + " · " : "") + "due " + (t.dueDate || "no date"));
    if (isNew && c) { addHistory(c, "task", "Task added: " + t.title + (t.dueDate ? " (due " + fmtDate(t.dueDate) + ")" : "")); put("clients", c); }
    return true;
  };
  if ($("#tf_save")) $("#tf_save").onclick = () => { if (save()) { closeModal(); toast(isNew ? "Task added for " + dueLabel(t).text : "Saved"); render(); } };
  if ($("#tf_done")) $("#tf_done").onclick = () => { if (save()) { completeTask(t, !t.done); closeModal(); render(); } };
  if ($("#tf_del")) $("#tf_del").onclick = () => { if (confirm("Delete this task?")) { logAct("Task deleted", t, t.clientName); remove("tasks", t.id); closeModal(); render(); } };
}

/* "From WhatsApp" – paste a copied message, get a task linked to the client */
async function fromWhatsApp(prefill) {
  let text = prefill || "";
  if (!text && navigator.clipboard && navigator.clipboard.readText) { try { text = (await navigator.clipboard.readText()) || ""; } catch (e) {} }
  if (text.length > 4000) text = text.slice(-4000);
  modal(`<h2>💬 Task from WhatsApp</h2>
    <p class="hint" style="margin:0">In WhatsApp, right-click the message → <b>Copy</b>, then paste it here.</p>
    <div class="stack" style="margin-top:12px">
      <label class="f"><span>Message</span><textarea id="wa_text" style="min-height:90px" placeholder="Paste the WhatsApp message here">${esc(text)}</textarea></label>
      <div class="detect" id="wa_detect">Paste a message to begin.</div>
      <label class="f"><span>Task</span><input type="text" id="wa_title"></label>
      <div class="row2 keep"><label class="f"><span>Date</span><input type="date" id="wa_date"></label><label class="f"><span>Time</span><input type="time" id="wa_time"></label></div>
      <label class="f"><span>Client</span><select id="wa_client"></select></label>
      <div id="wa_new" class="row2" style="display:none"><label class="f"><span>New client name</span><input type="text" id="wa_nname"></label><label class="f"><span>WhatsApp number</span><input type="tel" id="wa_nphone"></label></div>
      <label class="switch"><input type="checkbox" id="wa_hist" checked><span>Save the message in the client's history</span></label>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="wa_save">Create task</button></div>`);
  const touched = { title: false, date: false, client: false };
  $("#wa_title").oninput = () => { touched.title = true; };
  $("#wa_date").oninput = () => { touched.date = true; };
  const sel = $("#wa_client");
  sel.innerHTML = clientOptions("", true);
  sel.onchange = () => { touched.client = true; $("#wa_new").style.display = sel.value === "__new" ? "" : "none"; };
  const analyse = () => {
    const raw = $("#wa_text").value;
    if (!raw.trim()) { $("#wa_detect").textContent = "Paste a message to begin."; return; }
    const w = parseWhatsApp(raw), due = parseDue(w.message);
    let c = null;
    w.phones.some(p => (c = local.clients.find(x => x.phone === p)));
    if (!c && w.sender) c = local.clients.find(x => (x.name || "").toLowerCase() === w.sender.toLowerCase() || (x.company || "").toLowerCase() === w.sender.toLowerCase()) || null;
    if (!c) c = findClientIn(w.sender + " " + w.message);
    const who = c ? shortName(c) : (w.sender || (w.phones[0] ? fmtPhone(w.phones[0]) : "client"));
    let title;
    if (/quot|quote|price|cost|fee|charges|how much|rate/i.test(w.message)) title = "Send quotation to " + who;
    else if (/invoice|payment|pay|transfer|receipt/i.test(w.message)) title = "Payment / invoice – " + who;
    else if (/document|docs|licen[cs]e|passport|emirates id|statement|attach/i.test(w.message)) title = "Documents – " + who;
    else if (/call|ring|phone me/i.test(w.message)) title = "Call " + who;
    else title = "Reply to " + who + ": " + w.message.replace(/\s+/g, " ").slice(0, 60) + (w.message.length > 60 ? "…" : "");
    if (!touched.title) $("#wa_title").value = title;
    if (!touched.date) { $("#wa_date").value = due.date || today(); $("#wa_time").value = due.time || ""; }
    if (!touched.client) {
      if (c) { sel.value = c.id; $("#wa_new").style.display = "none"; }
      else { sel.value = "__new"; $("#wa_new").style.display = ""; $("#wa_nname").value = w.sender || ""; $("#wa_nphone").value = w.phones[0] ? "+" + w.phones[0] : ""; }
    }
    $("#wa_detect").innerHTML = [
      c ? "✔ Client: <b>" + esc(clientLabel(c)) + "</b>" : w.sender || w.phones.length ? "🆕 New contact: <b>" + esc(w.sender || fmtPhone(w.phones[0])) + "</b> – will be added as a new client" : "No client found – pick one below",
      due.date ? "📅 Date found: <b>" + fmtDate(due.date) + (due.time ? " " + fmt12(due.time) : "") + "</b>" : "No date in the message – set for today (change below)"
    ].join("<br>");
  };
  $("#wa_text").oninput = analyse; analyse();
  $("#wa_save").onclick = () => {
    const title = $("#wa_title").value.trim(); if (!title) { toast("Write the task"); return; }
    const raw = $("#wa_text").value.trim(), w = parseWhatsApp(raw);
    let c = null;
    if (sel.value === "__new") {
      const nm = $("#wa_nname").value.trim(), ph = normPhone($("#wa_nphone").value);
      if (nm || ph) { c = ph && local.clients.find(x => x.phone === ph); if (!c) { c = newClient({ name: nm, phone: ph, source: "WhatsApp" }); addHistory(c, "created", "Added from a WhatsApp message"); logAct("Client added", c, "From WhatsApp"); } }
    } else if (sel.value) c = clientById(sel.value);
    if (c && raw && $("#wa_hist").checked) addHistory(c, "whatsapp", "WhatsApp" + (w.sender ? " from " + w.sender : "") + ":\n" + w.message);
    const t = newTask({ title, dueDate: $("#wa_date").value, dueTime: $("#wa_time").value, clientId: c ? c.id : "", clientName: c ? clientLabel(c) : "",
      waText: w.message.slice(0, 2000), fromWhatsApp: true, assignedTo: (c && c.assignedTo) || (syncOn() ? me().name : "") });
    if (c) { addHistory(c, "task", "Task added: " + title + (t.dueDate ? " (due " + fmtDate(t.dueDate) + ")" : "")); put("clients", c); }
    put("tasks", t); logAct("Task added", t, "From WhatsApp" + (c ? " · " + clientLabel(c) : ""));
    closeModal(); toast("Task created for " + dueLabel(t).text); render();
  };
}
function quickAdd(text) {
  text = text.trim(); if (!text) return;
  const d = parseDue(text), c = findClientIn(text);
  const t = newTask({ title: d.rest || text, dueDate: d.date || today(), dueTime: d.time, clientId: c ? c.id : "", clientName: c ? clientLabel(c) : "", assignedTo: (c && c.assignedTo) || (syncOn() ? me().name : "") });
  put("tasks", t); logAct("Task added", t, (c ? clientLabel(c) + " · " : "") + "due " + t.dueDate);
  if (c) { addHistory(c, "task", "Task added: " + t.title + " (due " + fmtDate(t.dueDate) + ")"); put("clients", c); }
  toast("Added for " + dueLabel(t).text + (c ? " · linked to " + shortName(c) : ""));
  render();
  const i = $("#quickText"); if (i) i.focus();
}
function addMenu() {
  modal(`<h2>What do you want to add?</h2><div class="addgrid">
    <button data-act="newtask"><i>✅</i><b>Task</b><span>Something to do, with a reminder</span></button>
    <button data-act="fromwa"><i>💬</i><b>From WhatsApp</b><span>Turn a client's message into a task</span></button>
    <button data-act="newclient"><i>👤</i><b>Client / enquiry</b><span>A new lead or client</span></button>
    <button data-act="newpay"><i>💰</i><b>Invoice</b><span>So you're reminded to collect it</span></button>
    <button data-act="newbill"><i>🧾</i><b>Bill to pay</b><span>Rent, DEWA, supplier, subscription…</span></button>
    <button data-nav="followups"><i>📞</i><b>Follow-ups</b><span>Leads & quotations to chase</span></button>
  </div><div class="mfoot"><button class="btn" data-act="mclose">Cancel</button></div>`);
}

/* ===================== settings ===================== */
function renderSettings(main) {
  const s = local.settings, conn = !!local.syncUrl;
  main.innerHTML = `<div class="head"><h1>Settings</h1></div>
    <div class="grid2">
    <div class="card stack"><h2>${syncOn() ? "👤 My account" : "👤 This device"}</h2>
      ${syncOn() ? `<div>Signed in as <b>${esc(me().name)}</b> (${esc(me().role)})</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="chpw">Change password</button><button class="btn sm" data-act="testmail">Send me a test email</button><button class="btn sm danger" data-act="logout">Sign out</button></div>
        <div class="hint">Every morning at 7 you get an email with your late and today's tasks and the payments to chase, plus an email 15 minutes before any task with a time.</div>`
      : `<label class="f"><span>Your name</span><input type="text" id="s_myname" value="${esc(s.myName || "")}"></label>
        <div class="hint">Data is saved in this browser only. Connect the Google Sheet (below) to share with staff and get reminder emails.</div>`}
      <div><b>Light / dark mode</b><div class="chips" style="margin-top:6px">${[["light", "☀️ Light"], ["dark", "🌙 Dark"], ["auto", "Same as device"]].map(([t, l]) => `<button class="${themeSaved() === t ? "on" : ""}" data-theme="${t}">${l}</button>`).join("")}</div></div>
      <div><b>📲 Phone app</b><div class="hint">${installPrompt ? `<button class="btn sm" data-act="install">Install on this device</button>` : window.matchMedia && matchMedia("(display-mode: standalone)").matches ? "✔ Running as an installed app." : "Open this page in Chrome (Android) → ⋮ → <b>Add to Home screen</b>, or Safari (iPhone) → Share → <b>Add to Home Screen</b>."}</div></div>
      <div><b>🔔 Pop-up reminders</b><div class="hint">${!("Notification" in window) ? "Not supported in this browser." : Notification.permission === "granted" ? "On." : Notification.permission === "denied" ? "Blocked – allow notifications for this site in the browser's address bar." : `<button class="btn sm" data-act="notif">Turn on</button>`}</div></div>
    </div>

    ${can("settings") ? `<div class="card stack"><h2>🏢 Your companies</h2>
      <div class="hint">Each client, task, invoice and bill belongs to one of these. Use the switcher at the top to see one company or all. In WhatsApp messages, <b>{company}</b> and <b>{bank}</b> use the client's company.</div>
      <div id="bizlist">${bizList().map((b, i) => bizEditor(i, b)).join("")}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="addbiz">+ Add company</button><button class="btn primary" data-act="savebiz">Save companies</button></div>
      <div class="hint">Clear a company's name and save to remove it (its records stay, shown under All companies).</div></div>

    <div class="card stack"><h2>⚙️ General</h2>
      <label class="f"><span>Company name</span><input type="text" id="s_company" value="${esc(s.companyName)}"></label>
      <label class="f"><span>CRM web address (for links in emails)</span><input type="url" id="s_appurl" value="${esc(s.appUrl)}" placeholder="https://yourname.github.io/crm/"></label>
      <label class="f"><span>Bank details (added to payment reminders as {bank})</span><textarea id="s_bank" placeholder="Bank: …&#10;Account name: …&#10;IBAN: AE…">${esc(s.bankDetails)}</textarea></label>
      <label class="f"><span>Remind me to chase unpaid invoices every</span><select id="s_every">${[3, 5, 7, 10, 14, 30].map(n => opt(String(n), String(s.remindEvery || 7), n + " days")).join("")}</select></label>
      <label class="f"><span>After sending a quotation, remind me to follow up in</span><select id="s_fud">${[1, 2, 3, 5, 7].map(n => opt(String(n), String(s.followUpDays || 3), n + (n === 1 ? " day" : " days"))).join("")}</select></label>
      <label class="f"><span>Remind me about bills to pay</span><select id="s_bill">${[1, 2, 3, 5, 7].map(n => opt(String(n), String(s.billRemindDays || 3), n + (n === 1 ? " day" : " days") + " before they're due")).join("")}</select></label>
      <details><summary class="hint" style="cursor:pointer">Lists: services, sources, lost reasons, bill types</summary><div class="stack" style="margin-top:10px">
        <label class="f"><span>Bill / expense types (one per line)</span><textarea id="s_exp" style="min-height:120px">${esc((s.expenseCategories || []).join("\n"))}</textarea></label>
        <label class="f"><span>Services (one per line)</span><textarea id="s_services" style="min-height:120px">${esc(s.services.join("\n"))}</textarea></label>
        <label class="f"><span>How clients find you (one per line)</span><textarea id="s_sources">${esc(s.sources.join("\n"))}</textarea></label>
        <label class="f"><span>Lost reasons (one per line)</span><textarea id="s_lost">${esc(s.lostReasons.join("\n"))}</textarea></label></div></details>
      <button class="btn primary" data-act="savesettings">Save</button></div>

    <div class="card stack"><h2>💬 WhatsApp messages</h2>
      <div class="hint">Ready-made messages. In a message, {name} = client's first name · {company} = your company · {service} · {amount} = quotation · {me} = your name</div>
      <div id="tpls">${s.templates.map((t, i) => tplEditor("t", i, t)).join("")}</div>
      <button class="btn sm" data-act="addtpl" style="align-self:flex-start">+ Add message</button>
      <h2 style="margin-top:8px">💰 Payment reminder messages</h2>
      <div class="hint">{name} · {balance} = amount still owed · {amount} = invoice total · {invoice} · {description} · {due} = due date · {days} = days overdue · {bank} = bank details</div>
      <div id="ptpls">${s.payTemplates.map((t, i) => tplEditor("p", i, t)).join("")}</div>
      <button class="btn primary" data-act="savetpl">Save messages</button>
      <div class="hint">Empty a message's text and save to remove it.</div></div>

    <div class="card stack"><h2>📄 Document checklists</h2>
      <div class="hint">A client automatically gets the checklist with the same name as their service. One document per line. The <b>{documents}</b> placeholder in a WhatsApp message lists the documents a client hasn't sent yet.</div>
      <div id="doclists">${(s.docLists || []).map((l, i) => docListEditor(i, l)).join("")}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="adddoclist">+ Add checklist</button><button class="btn primary" data-act="savedocs">Save checklists</button></div>
      <div class="hint">Empty a checklist's name and save to remove it.</div></div>` : ""}

    ${syncOn() && can("activity") ? `<div class="card stack"><h2>📊 Monday summary email</h2>
      <div class="hint">Every Monday at 8 AM, each Admin and Manager gets last week's summary: new enquiries, quotations sent and won, money received, overdue payments and tasks, and what each staff member completed.</div>
      ${can("settings") ? `<label class="switch"><input type="checkbox" id="s_weekly" ${s.weeklyOff ? "" : "checked"}><span>Send the Monday summary</span></label>` : ""}
      <div style="display:flex;gap:6px;flex-wrap:wrap">${can("settings") ? `<button class="btn sm primary" id="s_weeklysave">Save</button>` : ""}<button class="btn sm" data-act="weeklynow">Send me last week's summary now</button></div></div>` : ""}

    ${can("users") && syncOn() ? `<div class="card stack"><h2>👥 Staff logins</h2><div id="userlist" class="hint">Loading…</div><button class="btn" data-act="adduser">+ Add staff member</button>
      <div class="hint"><b>Admin</b> everything · <b>Manager</b> everything except users & settings · <b>Staff</b> add and edit clients, tasks and payments · <b>Viewer</b> look only</div></div>` : ""}

    ${calendarCard()}

    <div class="card stack"><h2>🗄 Google Sheet (shared database)</h2>
      ${conn ? `<div><span class="dot ok"></span>Connected${FIXED_URL ? " – built into the CRM, staff only need to sign in" : ""}</div><div class="hint" style="word-break:break-all">${esc(local.syncUrl)}</div>
        ${can("settings") && !FIXED_URL ? `<button class="btn danger sm" data-act="disconnect" style="align-self:flex-start">Disconnect this device</button>` : ""}`
      : `<div class="hint">Paste the <b>Web app URL</b> from Apps Script (setup guide, Part C).</div>
        <input type="url" id="s_url" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn primary" data-act="connect" style="align-self:flex-start">Connect</button>`}
    </div>

    <div class="card stack"><h2>⬇ Backup & Excel</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${can("export") ? `<button class="btn sm" data-act="exportclients">Clients</button><button class="btn sm" data-act="exporttasks">Tasks</button><button class="btn sm" data-act="exportpay">Payments</button><button class="btn sm" data-act="backup">Full backup</button>` : ""}
        ${can("settings") ? `<label class="btn sm">Restore backup<input type="file" id="s_restore" accept=".json" hidden></label>` : ""}
      </div>
      ${can("edit") ? `<button class="btn" data-act="import" style="align-self:flex-start">⬆ Import clients from Excel</button>` : ""}
      ${!syncOn() && !local.clients.length ? `<button class="btn" data-act="demo">Load sample data to try it out</button>` : ""}
      ${!syncOn() && local.clients.some(c => c.demo) ? `<button class="btn danger sm" data-act="cleardemo" style="align-self:flex-start">Remove sample data</button>` : ""}
      ${local.hideIntro ? `<button class="linkbtn" data-act="showintro" style="align-self:flex-start">Show the getting-started checklist again</button>` : ""}
    </div>
    </div>`;
  if (can("users") && syncOn()) loadUsers();
  const ws = $("#s_weeklysave"); if (ws) ws.onclick = () => saveSettings({ weeklyOff: !$("#s_weekly").checked });
  const r = $("#s_restore"); if (r) r.onchange = e => restore(e.target.files[0]);
  const mn = $("#s_myname"); if (mn) mn.onchange = () => { local.settings.myName = mn.value.trim(); persist(); render(); };
}
const tplEditor = (k, i, t) => `<div class="stack" style="border-bottom:1px solid var(--border);padding-bottom:10px;gap:6px"><input type="text" data-${k}n="${i}" value="${esc(t ? t.name : "")}" placeholder="Name"><textarea data-${k}t="${i}" placeholder="Hello {name}, …">${esc(t ? t.text : "")}</textarea></div>`;
const bizEditor = (i, b) => `<div class="stack" style="border-bottom:1px solid var(--border);padding-bottom:12px;gap:6px">
  <input type="hidden" data-bzid="${i}" value="${esc(b ? b.id : "")}">
  <div style="display:flex;gap:6px"><input type="color" data-bzc="${i}" value="${esc(b ? b.color || "#64748b" : "#64748b")}" style="width:46px;min-height:42px;padding:2px;border:1px solid var(--border);border-radius:10px;background:var(--surface)" title="Colour">
    <input type="text" data-bzn="${i}" value="${esc(b ? b.name : "")}" placeholder="Full company name"></div>
  <input type="text" data-bzs="${i}" value="${esc(b ? b.short : "")}" placeholder="Short name for labels, e.g. Netwave">
  <textarea data-bzb="${i}" style="min-height:60px" placeholder="Bank details for this company's payment reminders (optional)">${esc(b ? b.bank || "" : "")}</textarea></div>`;
const docListEditor = (i, l) => `<div class="stack" style="border-bottom:1px solid var(--border);padding-bottom:10px;gap:6px"><input type="text" data-dln="${i}" value="${esc(l ? l.name : "")}" placeholder="Checklist name – same as the service, e.g. VAT registration"><textarea data-dli="${i}" style="min-height:150px" placeholder="One document per line">${esc(l ? l.items.join("\n") : "")}</textarea></div>`;

/* ===================== import clients from Excel / CSV ===================== */
const IMPORT_FIELDS = [["name", "Name"], ["company", "Company"], ["phone", "Phone"], ["email", "Email"], ["trn", "TRN"], ["service", "Service"], ["stage", "Stage"], ["quoteAmount", "Quotation (AED)"], ["source", "Source"], ["assignedTo", "Handled by"], ["notes", "Notes"]];
const IMPORT_GUESS = { name: /^(client|contact|customer|full)?\s*name|contact person|^client$|^customer$/i, company: /company|business|firm|trade name|entity|organi[sz]ation/i, phone: /phone|mobile|whats ?app|contact (no|number)|tel|cell/i,
  email: /e-?mail/i, trn: /trn|tax reg/i, service: /service|requirement|work|type/i, stage: /stage|status/i, quoteAmount: /quot|amount|fee|price|value/i, source: /source|referr|how/i, assignedTo: /assigned|handled|staff|owner|account manager/i, notes: /note|remark|comment|detail/i };
function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const sep = (first.match(/\t/g) || []).length ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === "") q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
/* minimal .xlsx reader (first worksheet) using the browser's built-in unzip */
async function readXlsx(buf) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open .xlsx files – in Excel use File → Save As → CSV, then import that");
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a valid Excel file");
  const files = {}; let p = dv.getUint32(eocd + 16, true);
  for (let n = dv.getUint16(eocd + 10, true); n > 0; n--) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, "/")] = { method, csize, off };
    p += 46 + nl + el + cl;
  }
  const read = async name => {
    const f = files[name]; if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(start, start + f.csize);
    if (f.method === 0) return new TextDecoder().decode(data);
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(ds).text();
  };
  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  const ss = await read("xl/sharedStrings.xml");
  const strings = ss ? Array.from(xml(ss).getElementsByTagName("si")).map(si => Array.from(si.getElementsByTagName("t")).map(t => t.textContent).join("")) : [];
  let sheetPath = "xl/worksheets/sheet1.xml";
  try {
    const wb = xml(await read("xl/workbook.xml")), rels = xml(await read("xl/_rels/workbook.xml.rels"));
    const first = wb.getElementsByTagName("sheet")[0], rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === rid);
    if (rel) sheetPath = "xl/" + rel.getAttribute("Target").replace(/^\/?xl\//, "").replace(/^\//, "");
  } catch (e) {}
  const sx = await read(sheetPath) || await read(Object.keys(files).find(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)));
  if (!sx) throw new Error("No worksheet found in this file");
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return Array.from(xml(sx).getElementsByTagName("row")).map(r => {
    const out = [];
    Array.from(r.getElementsByTagName("c")).forEach(c => {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      let val = t === "s" ? strings[+(v && v.textContent)] : t === "inlineStr" ? Array.from(c.getElementsByTagName("t")).map(x => x.textContent).join("") : v ? v.textContent : "";
      if (!t && /^-?\d+(\.\d+)?E[+-]?\d+$/i.test(val || "")) val = Number(val).toFixed(0);
      out[colIdx(c.getAttribute("r") || "A")] = val == null ? "" : String(val);
    });
    for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = "";
    return out;
  }).filter(r => r.some(x => String(x).trim()));
}
function importForm() {
  modal(`<h2>⬆ Import clients from Excel</h2>
    <div class="hint">Your sheet needs a first row with column names (e.g. Name, Company, Phone, Email, Service). <button class="linkbtn" data-act="importtpl">Download an example file</button></div>
    <div class="stack" style="margin-top:12px">
      <label class="btn primary" style="align-self:flex-start">📂 Choose Excel or CSV file<input type="file" id="im_file" accept=".xlsx,.csv,.txt" hidden></label>
      <label class="f"><span>…or copy the cells in Excel (including the header row) and paste here</span><textarea id="im_paste" style="min-height:90px" placeholder="Paste from Excel"></textarea></label>
      <div id="im_err" class="hint" style="color:var(--red)"></div>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button></div>`);
  $("#im_file").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCSV(await f.text()); importMap(rows); }
    catch (x) { $("#im_err").textContent = x.message; }
  };
  $("#im_paste").oninput = e => { const rows = parseCSV(e.target.value); if (rows.length >= 2) importMap(rows); };
}
function importMap(rows) {
  if (rows.length < 2) { toast("The sheet needs a header row and at least one client"); return; }
  const head = rows[0].map(h => String(h).trim()), data = rows.slice(1);
  const used = {}, map = {};
  IMPORT_FIELDS.forEach(([k]) => { const i = head.findIndex((h, j) => !used[j] && IMPORT_GUESS[k].test(h)); map[k] = i; if (i >= 0) used[i] = true; });
  if (map.name < 0 && map.company < 0) { const i = head.findIndex((h, j) => !used[j]); map.name = i; }
  modal(`<h2>⬆ Import ${data.length} row${data.length > 1 ? "s" : ""}</h2>
    <div class="hint">Check which column goes where. Columns set to "– skip –" are not imported.</div>
    <table class="maptable" style="margin-top:10px"><tbody>${IMPORT_FIELDS.map(([k, l]) => `<tr><th style="width:130px">${l}</th><td><select data-map="${k}"><option value="-1">– skip –</option>${head.map((h, i) => `<option value="${i}" ${map[k] === i ? "selected" : ""}>${esc(h || "Column " + (i + 1))}${data[0] && data[0][i] ? " (e.g. " + esc(String(data[0][i]).slice(0, 25)) + ")" : ""}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>
    <div class="stack" style="margin-top:12px">
      <label class="f"><span>Stage for rows without one</span><div class="chips" id="im_stage">${STAGES.map(s => `<button data-s="${s}" class="${s === "Won" ? "on" : ""}">${s === "Won" ? "Won (existing client)" : s}</button>`).join("")}</div></label>
      <label class="f"><span>If the phone number is already in the CRM</span><div class="chips" id="im_dup"><button data-d="skip" class="on">Skip it</button><button data-d="fill">Fill in missing details</button></div></label>
      <div class="detect" id="im_prev"></div>
    </div>
    <div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="im_go">Import</button></div>`);
  let defStage = "Won", dup = "skip";
  const chip = (id, attr, set) => { $(id).onclick = e => { const b = e.target.closest("[" + attr + "]"); if (!b) return; set(b.getAttribute(attr)); $(id).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); prev(); }; };
  chip("#im_stage", "data-s", v => { defStage = v; }); chip("#im_dup", "data-d", v => { dup = v; });
  const cur = () => { const m = {}; document.querySelectorAll("[data-map]").forEach(s => { m[s.dataset.map] = +s.value; }); return m; };
  const build = () => {
    const m = cur(), byPhone = {}; local.clients.forEach(c => { if (c.phone) byPhone[c.phone] = c; });
    const res = { add: [], update: [], skip: 0, empty: 0 };
    data.forEach(r => {
      const g = k => m[k] >= 0 ? String(r[m[k]] == null ? "" : r[m[k]]).trim() : "";
      const o = { name: g("name"), company: g("company"), phone: normPhone(g("phone")), email: g("email"), trn: g("trn"), service: g("service"), quoteAmount: g("quoteAmount") ? String(num(g("quoteAmount")) || "") : "", source: g("source"), assignedTo: g("assignedTo"), notes: g("notes") };
      const st = g("stage"); o.stage = STAGES.find(s => s.toLowerCase() === st.toLowerCase()) || (/won|active|client|customer|signed/i.test(st) ? "Won" : /lost|closed|cancel/i.test(st) ? "Lost" : /quot/i.test(st) ? "Quotation sent" : /negot/i.test(st) ? "Negotiation" : /enq|lead|new|prospect/i.test(st) ? "Enquiry" : defStage);
      if (!o.name && !o.company && !o.phone) { res.empty++; return; }
      const ex = o.phone && byPhone[o.phone];
      if (ex) { if (dup === "fill") res.update.push([ex, o]); else res.skip++; return; }
      byPhone[o.phone || "_" + res.add.length] = o; res.add.push(o);
    });
    return res;
  };
  const prev = () => { const r = build(); $("#im_prev").innerHTML = `<b>${r.add.length}</b> new client(s)` + (r.update.length ? ` · <b>${r.update.length}</b> to update` : "") + (r.skip ? ` · ${r.skip} already in the CRM (skipped)` : "") + (r.empty ? ` · ${r.empty} empty row(s) ignored` : "") +
    (r.add[0] ? `<br>First: <b>${esc(r.add[0].name || r.add[0].company)}</b> ${esc(fmtPhone(r.add[0].phone))} ${esc(r.add[0].service)} · ${esc(r.add[0].stage)}` : ""); };
  document.querySelectorAll("[data-map]").forEach(s => s.onchange = prev); prev();
  $("#im_go").onclick = () => {
    const r = build(), at = nowIso();
    r.add.forEach(o => { const c = newClient(Object.assign(o, { source: o.source || "Imported" })); c.history = [{ id: uid(), at, by: me().name, kind: "created", text: "Imported from Excel" }]; c.updatedAt = at; local.clients.push(c); local.dirty.clients[c.id] = true; });
    r.update.forEach(([c, o]) => { Object.keys(o).forEach(k => { if (k !== "stage" && o[k] && !c[k]) c[k] = o[k]; }); c.updatedAt = at; local.dirty.clients[c.id] = true; });
    logAct("Clients imported", null, r.add.length + " added, " + r.update.length + " updated, " + r.skip + " skipped");
    persist(); schedulePush(); closeModal();
    toast(r.add.length + " client(s) imported" + (r.update.length ? ", " + r.update.length + " updated" : ""));
    clientFilter.stage = "all"; go("clients");
  };
}
function calendarCard() {
  const s = local.settings;
  return `<div class="card stack"><h2>📅 Google Calendar</h2>
    ${syncOn() && can("settings") ? `
      <label class="switch"><input type="checkbox" id="cal_on" ${s.calendarSync ? "checked" : ""}><span><b>Put tasks in Google Calendar automatically</b><br><span class="hint">Every open task with a date appears in a calendar called <b>CRM Tasks</b>, with a pop-up reminder. Done tasks disappear from it.</span></span></label>
      <label class="switch"><input type="checkbox" id="cal_inv" ${s.calendarInvite ? "checked" : ""} ${s.calendarSync ? "" : "disabled"}><span>Also put each task in the <b>assigned staff member's own calendar</b></span></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary sm" data-act="savecal">Save</button>${s.calendarSync ? `<button class="btn sm" data-act="calsync">↻ Re-send all tasks</button>` : ""}</div>
      <div class="hint">First time: run <b>setupCalendar</b> once in Apps Script (setup guide, Part E).</div>`
    : syncOn() ? `<div class="hint">${s.calendarSync ? "✔ Tasks are added to the shared <b>CRM Tasks</b> calendar." : "Automatic calendar sync is off (an administrator can turn it on)."}</div>` : `<div class="hint">Automatic sync needs the Google Sheet connected.</div>`}
    <div class="hint">Any single task: open it → <b>📅 Add to my Google Calendar</b>.</div></div>`;
}
function gcalLink(t) {
  const c = t.clientId && clientById(t.clientId);
  let dates;
  if (t.dueTime) { const st = new Date(t.dueDate + "T" + t.dueTime + ":00"), en = new Date(st.getTime() + 30 * 60000); const f = x => ymd(x).replace(/-/g, "") + "T" + pad(x.getHours()) + pad(x.getMinutes()) + "00"; dates = f(st) + "/" + f(en); }
  else dates = (t.dueDate || today()).replace(/-/g, "") + "/" + addDays(t.dueDate || today(), 1).replace(/-/g, "");
  const details = [c ? "Client: " + clientLabel(c) : "", c && c.phone ? "WhatsApp: https://wa.me/" + c.phone : "", t.note || "", local.settings.appUrl ? "CRM: " + local.settings.appUrl : ""].filter(String).join("\n");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("✅ " + t.title) + "&dates=" + dates + "&ctz=Asia/Dubai&details=" + encodeURIComponent(details);
}
function saveSettings(patch, quiet) {
  Object.assign(local.settings, patch);
  local.settingsUpdatedAt = nowIso(); local.settingsDirty = true;
  logAct("Settings changed", null, Object.keys(patch).join(", "));
  persist(); schedulePush(); if (!quiet) toast("Saved"); render();
}
const lines = id => $(id).value.split("\n").map(x => x.trim()).filter(String);
async function loadUsers() {
  try {
    const r = await api("users");
    local.usersFull = r.users;
    const el = $("#userlist"); if (!el) return;
    el.classList.remove("hint");
    el.innerHTML = r.users.map(u => `<div class="item nodone" style="padding:8px 0"><div class="avatar">${esc(initials(u))}</div><div class="main"><div class="t">${esc(u.name)} ${u.active ? "" : '<span class="pill gray">disabled</span>'}</div><div class="m">${esc(u.username)} · ${esc(u.role)} · ${esc(u.email || "no email")}</div></div><div class="btns" style="width:auto;padding:0"><button class="btn sm" data-edituser="${esc(u.username)}">Edit</button></div></div>`).join("");
  } catch (e) { const el = $("#userlist"); if (el) el.textContent = e.message; }
}
function userForm(u) {
  const isNew = !u; u = u || { username: "", name: "", role: "Staff", email: "", phone: "", active: true };
  modal(`<h2>${isNew ? "Add staff member" : "Edit staff member"}</h2><div class="stack" style="margin-top:12px">
    <div class="row2"><label class="f"><span>Full name</span><input type="text" id="uf_name" value="${esc(u.name)}"></label>
      <label class="f"><span>User name (to sign in)</span><input type="text" id="uf_user" value="${esc(u.username)}" ${isNew ? "" : "disabled"} autocapitalize="none" placeholder="e.g. anu"></label></div>
    <label class="f"><span>Role</span><div class="chips" id="uf_role">${Object.keys(ROLES).map(r => `<button type="button" data-r="${r}" class="${u.role === r ? "on" : ""}">${r}</button>`).join("")}</div></label>
    <div class="row2"><label class="f"><span>Email (for reminders)</span><input type="email" id="uf_email" value="${esc(u.email)}"></label>
      <label class="f"><span>Phone</span><input type="tel" id="uf_phone" value="${esc(u.phone)}"></label></div>
    <label class="f"><span>${isNew ? "Temporary password (8+ characters)" : "New password (leave empty to keep)"}</span><input type="text" id="uf_pw" autocomplete="new-password"></label>
    ${!isNew ? `<label class="switch"><input type="checkbox" id="uf_active" ${u.active ? "checked" : ""}><span>Can sign in (untick when someone leaves)</span></label>` : ""}
  </div><div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="uf_save">Save</button></div>`);
  let role = u.role;
  $("#uf_role").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; role = b.dataset.r; $("#uf_role").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("#uf_save").onclick = async () => {
    const b = $("#uf_save"); b.disabled = true;
    try {
      await api("saveUser", { isNew, password: $("#uf_pw").value, user: { username: $("#uf_user").value.trim().toLowerCase(), name: $("#uf_name").value, role, active: isNew ? true : $("#uf_active").checked, email: $("#uf_email").value, phone: $("#uf_phone").value } });
      closeModal(); toast("Saved"); pull();
    } catch (e) { toast(e.message); b.disabled = false; }
  };
}

/* ===================== login / connect ===================== */
async function connect(url) {
  url = String(url || "").trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast("That doesn't look like an Apps Script web app URL"); return; }
  local.syncUrl = url; local.session = null;
  try { await api("status"); persist(); render(); } catch (e) { local.syncUrl = ""; toast("Could not reach it: " + e.message); }
}
async function renderLogin(root) {
  root.innerHTML = `<div class="login"><div class="card"><div class="hint">Connecting…</div></div></div>`;
  let needsSetup = false;
  try { needsSetup = (await api("status")).needsSetup; }
  catch (e) {
    root.innerHTML = `<div class="login"><div class="card stack"><h2>Can't reach the database</h2><div class="hint">${esc(e.message)}. Check the internet connection.</div>
      <button class="btn primary" onclick="render()">Try again</button>${FIXED_URL ? "" : `<button class="btn" data-act="disconnect">Use without the Google Sheet</button>`}</div></div>`; return;
  }
  root.innerHTML = `<div class="login"><div style="display:flex;justify-content:flex-end;margin-bottom:10px">${themeBtn()}</div><form class="card stack" id="lf">
    <div style="display:flex;gap:12px;align-items:center"><img src="icon.svg" alt="" style="width:46px;height:46px"><div><b style="font-size:19px">${esc(local.settings.companyName || "CRM")}</b><div class="hint">${needsSetup ? "First-time setup" : "Staff sign-in"}</div></div></div>
    ${needsSetup ? `<div class="hint">Create the administrator account. Use the <b>setup key</b> shown in Apps Script after running <i>setup</i>.</div>
      <label class="f"><span>Setup key</span><input type="text" id="l_key" autocomplete="off"></label>
      <label class="f"><span>Your full name</span><input type="text" id="l_name"></label>
      <label class="f"><span>Your email (for reminders)</span><input type="email" id="l_email"></label>` : ""}
    <label class="f"><span>User name</span><input type="text" id="l_user" autocapitalize="none" autocomplete="username"></label>
    <label class="f"><span>Password${needsSetup ? " (8+ characters)" : ""}</span><input type="password" id="l_pw" autocomplete="${needsSetup ? "new-password" : "current-password"}"></label>
    <button class="btn primary" style="min-height:46px">${needsSetup ? "Create & sign in" : "Sign in"}</button>
    <div class="hint" id="l_err" style="color:var(--red)"></div>
    ${needsSetup ? "" : `<div class="hint">Each person has their own user name and password, created by the administrator. Forgot it? Ask the administrator to set a new one.</div>`}
    ${FIXED_URL ? "" : `<button type="button" class="linkbtn" data-act="disconnect" style="align-self:flex-start;font-size:13px">Disconnect this device</button>`}</form></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const b = $("#lf button.primary"); b.disabled = true; $("#l_err").textContent = "";
    try {
      const r = needsSetup
        ? await api("bootstrap", { setupKey: $("#l_key").value.trim(), name: $("#l_name").value, email: $("#l_email").value, username: $("#l_user").value, password: $("#l_pw").value })
        : await api("login", { username: $("#l_user").value, password: $("#l_pw").value });
      const counts = KINDS.map(k => local[k].filter(x => !x.demo).length);
      local.session = { token: r.session, user: r.user };
      if (needsSetup && counts.some(Boolean) && confirm("Upload the " + counts[0] + " clients, " + counts[1] + " tasks and " + counts[2] + " invoices on this device to the Google Sheet?")) {
        KINDS.forEach(k => { local[k] = local[k].filter(x => !x.demo); local[k].forEach(x => { local.dirty[k][x.id] = true; }); });
        local.settingsDirty = true; local.settingsUpdatedAt = nowIso();
      } else KINDS.forEach(k => { local[k] = []; local.dirty[k] = {}; local.deleted[k] = []; });
      local.activity = [];
      persist(); render(); await push(); await pull();
    } catch (err) { $("#l_err").textContent = err.message; b.disabled = false; }
  };
}

/* ===================== export / backup / demo ===================== */
function downloadFile(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csv(rows) { return "﻿" + rows.map(r => r.map(v => { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",")).join("\r\n"); }
function exportCsv(name, rows, what) { downloadFile(name + "-" + today() + ".csv", csv(rows), "text/csv;charset=utf-8"); logAct("Exported " + what, null, (rows.length - 1) + " rows"); persist(); schedulePush(); }
function exportClients() {
  const nt = {}; local.tasks.filter(t => !t.done && t.clientId).sort(byDue).forEach(t => { if (!nt[t.clientId]) nt[t.clientId] = t; });
  exportCsv("clients", [["Our company", "Name", "Company", "Phone", "Email", "TRN", "Service", "Stage", "Quotation (AED)", "Owes (AED)", "Next follow-up", "Follow-ups done", "Source", "Handled by", "Lost reason", "Next task", "Next task due", "Added", "Last updated", "Notes"]]
    .concat(local.clients.filter(inBizClient).map(c => [bizName(c.biz), c.name, c.company, fmtPhone(c.phone), c.email, c.trn, c.service, c.stage, c.quoteAmount, clientBalance(c.id) || "", c.nextFollowUp || "", c.followUps || "", c.source, c.assignedTo, c.lostReason,
      nt[c.id] ? nt[c.id].title : "", nt[c.id] ? nt[c.id].dueDate : "", (c.createdAt || "").slice(0, 10), (c.updatedAt || "").slice(0, 10), c.notes])), "clients");
}
function exportTasks() {
  exportCsv("tasks", [["Company", "Task", "Client", "Due date", "Time", "Status", "Who", "Repeat", "Created", "Created by", "Done at", "Notes"]]
    .concat(local.tasks.filter(inBiz).slice().sort(byDue).map(t => [bizName(t.biz), t.title, t.clientName, t.dueDate, t.dueTime, t.done ? "Done" : "Open", t.assignedTo, REPEATS[t.repeat || ""], (t.createdAt || "").slice(0, 10), t.createdBy, (t.doneAt || "").slice(0, 16).replace("T", " "), t.note])), "tasks");
}
function exportPayments() {
  exportCsv("payments", [["Company", "Client", "For", "Invoice no.", "Invoice date", "Due date", "Amount (AED)", "Received (AED)", "Balance (AED)", "Status", "Reminders sent", "Last reminder", "Repeat", "Notes"]]
    .concat(local.payments.filter(inBiz).slice().sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map(p => [bizName(p.biz), p.clientName, p.description, p.invoiceNo, p.issueDate, p.dueDate, num(p.amount), paidOf(p), balanceOf(p), payStatus(p).text,
      (p.reminders || []).length, (p.lastReminderAt || "").slice(0, 10), REPEATS[p.repeat || ""], p.note])), "payments");
}
function exportBills() {
  exportCsv("bills", [["Company", "Pay to", "Type", "For", "Reference", "Due date", "Amount (AED)", "Status", "Paid on", "Paid (AED)", "How", "Repeat", "Notes"]]
    .concat(local.bills.filter(inBiz).slice().sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map(b => [bizName(b.biz), b.vendor, b.category, b.description, b.reference, b.dueDate, num(b.amount),
      b.paidAt ? "Paid" : "To pay", (b.paidAt || "").slice(0, 10), b.paidAt ? num(b.paidAmount || b.amount) : "", b.paidMethod, REPEATS[b.repeat || ""], b.note])), "bills");
}
function backup() { downloadFile("crm-backup-" + today() + ".json", JSON.stringify({ app: "consultancy-crm", at: nowIso(), clients: local.clients, tasks: local.tasks, payments: local.payments, bills: local.bills, settings: local.settings }, null, 1), "application/json"); }
function restore(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (d.app !== "consultancy-crm") throw new Error("Not a CRM backup file");
      KINDS.forEach(k => { d[k] = d[k] || []; });
      if (!confirm("Restore " + d.clients.length + " clients, " + d.tasks.length + " tasks and " + d.payments.length + " invoices? Records with the same ID are replaced.")) return;
      KINDS.forEach(k => d[k].forEach(x => put(k, x)));
      if (d.settings) saveSettings(d.settings, true);
      logAct("Backup restored", null, KINDS.map(k => d[k].length + " " + k).join(", "));
      toast("Restored"); render();
    } catch (e) { toast("Could not restore: " + e.message); }
  };
  fr.readAsText(file);
}
function loadDemo() {
  const td = today();
  const mk = (o, hist) => { const c = newClient(Object.assign({ demo: true }, o)); c.history = hist.map(([days, kind, text]) => ({ id: uid(), at: new Date(Date.now() - days * 864e5).toISOString(), by: "Me", kind, text })); c.updatedAt = new Date(Date.now() - (hist[hist.length - 1] || [0])[0] * 864e5).toISOString(); local.clients.push(c); return c; };
  const a = mk({ name: "Ahmed Al Mansoori", company: "Al Mansoori Trading LLC", phone: "971501234567", service: "Corporate tax registration", stage: "Quotation sent", quoteAmount: "3500", source: "WhatsApp" },
    [[6, "created", "Added (WhatsApp)"], [5, "whatsapp", "WhatsApp from Ahmed:\nHi, we need corporate tax registration for our trading company. What are your charges?"], [3, "stage", "Stage: Enquiry → Quotation sent"]]);
  const b = mk({ name: "Priya Nair", company: "Bright Smile Dental Clinic", phone: "971552223344", service: "Accounting / bookkeeping", stage: "Won", quoteAmount: "1800", source: "Referral", notes: "Monthly bookkeeping, ~120 transactions" },
    [[40, "created", "Added (Referral)"], [35, "stage", "Stage: Negotiation → Won"]]);
  const c = mk({ name: "John Mathew", company: "JM Logistics FZE", phone: "971567778899", service: "VAT return filing", stage: "Won", quoteAmount: "1200", source: "Existing client" }, [[60, "created", "Added"], [50, "stage", "Stage: Negotiation → Won"]]);
  mk({ name: "Fatima Khan", phone: "971509998877", service: "Company formation", stage: "Enquiry", source: "Instagram" }, [[2, "created", "Added (Instagram)"]]);
  mk({ name: "Omar Haddad", company: "Haddad Interiors", phone: "971528887766", service: "Audit", stage: "Negotiation", quoteAmount: "12000", source: "Google" }, [[9, "created", "Added"], [4, "stage", "Stage: Quotation sent → Negotiation"]]);
  mk({ name: "Rashid Ali", company: "Ali Auto Spares", phone: "971543332211", service: "Software / ERP", stage: "Lost", quoteAmount: "9000", lostReason: "Price too high", source: "Website" }, [[15, "created", "Added"]]);
  const T = o => local.tasks.push(newTask(Object.assign({ demo: true }, o)));
  T({ title: "Follow up on quotation – Ahmed", dueDate: addDays(td, -2), clientId: a.id, clientName: clientLabel(a) });
  T({ title: "Send October bookkeeping report", dueDate: td, dueTime: "15:00", clientId: b.id, clientName: clientLabel(b) });
  T({ title: "File Q3 VAT return", dueDate: addDays(td, 4), repeat: "quarterly", clientId: c.id, clientName: clientLabel(c) });
  T({ title: "Collect trade licence copy", dueDate: addDays(td, 1), clientId: c.id, clientName: clientLabel(c) });
  T({ title: "Renew office software subscription", dueDate: addDays(td, 6) });
  const P = o => local.payments.push(newPayment(Object.assign({ demo: true }, o)));
  P({ clientId: b.id, clientName: clientLabel(b), description: "Bookkeeping – October", invoiceNo: "INV-1042", amount: "1890", issueDate: addDays(td, -25), dueDate: addDays(td, -18) });
  P({ clientId: c.id, clientName: clientLabel(c), description: "VAT return Q2", invoiceNo: "INV-1038", amount: "1260", issueDate: addDays(td, -40), dueDate: addDays(td, -33), payments: [{ id: uid(), date: addDays(td, -20), amount: "600", method: "Bank transfer" }],
    reminders: [{ at: new Date(Date.now() - 12 * 864e5).toISOString(), by: "Me", channel: "WhatsApp" }], lastReminderAt: new Date(Date.now() - 12 * 864e5).toISOString(), nextReminder: addDays(td, -5) });
  P({ clientId: c.id, clientName: clientLabel(c), description: "VAT registration", invoiceNo: "INV-1029", amount: "2100", issueDate: addDays(td, -70), dueDate: addDays(td, -63), payments: [{ id: uid(), date: addDays(td, -60), amount: "2100", method: "Cheque" }] });
  P({ clientId: a.id, clientName: clientLabel(a), description: "Advance – CT registration", invoiceNo: "INV-1045", amount: "1750", issueDate: addDays(td, -2), dueDate: addDays(td, 5) });
  // spread sample data across the three companies, and give open leads follow-up dates
  const ids = bizList().map(x => x.id);
  if (ids.length) {
    const pick = c => /software|erp/i.test(c.service) ? ids[0] : /audit|company formation/i.test(c.service) && ids[2] ? ids[2] : ids[1] || ids[0];
    local.clients.forEach(c => { if (c.demo) c.biz = pick(c); });
    local.tasks.concat(local.payments).forEach(x => { if (x.demo) x.biz = (clientById(x.clientId) || {}).biz || ids[0]; });
  }
  const fu = { "Ahmed Al Mansoori": addDays(td, -1), "Omar Haddad": td, "Fatima Khan": addDays(td, 2) };
  local.clients.forEach(c => { if (c.demo) { c.nextFollowUp = fu[c.name] || ""; if (c.name === "Ahmed Al Mansoori") c.followUps = 1; } });
  const B = o => local.bills.push(newBill(Object.assign({ demo: true }, o)));
  B({ biz: ids[1], vendor: "Landlord – Al Barsha office", category: "Rent", description: "Office rent – cheque 3 of 4", amount: "18500", dueDate: addDays(td, 2), repeat: "quarterly" });
  B({ biz: ids[1], vendor: "DEWA", category: "DEWA / utilities", amount: "1240", dueDate: addDays(td, -1), repeat: "monthly", reference: "2004587713" });
  B({ biz: ids[2] || ids[0], vendor: "Tech Distribution LLC", category: "Supplier / purchase", description: "10 × laptops – PO 2291", amount: "32400", dueDate: addDays(td, 9) });
  B({ biz: ids[0], vendor: "Microsoft 365", category: "Software subscriptions", amount: "460", dueDate: addDays(td, 1), repeat: "monthly" });
  B({ biz: ids[1], vendor: "Federal Tax Authority", category: "VAT payment to FTA", description: "VAT return Q3", amount: "7850", dueDate: addDays(td, 14), repeat: "quarterly" });
  KINDS.forEach(k => local[k].forEach(x => { x.updatedAt = x.updatedAt || nowIso(); }));
  persist(); toast("Sample data loaded"); go("home");
}
function clearDemo() { KINDS.forEach(k => { local[k] = local[k].filter(x => !x.demo); }); persist(); toast("Sample data removed"); render(); }

/* ===================== notifications ===================== */
function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date(), td = today(), hm = nowHM();
  local.tasks.forEach(t => {
    if (t.done || t.dueDate !== td || !t.dueTime || t.dueTime > hm) return;
    const k = t.id + "@" + t.dueDate + t.dueTime;
    if (local.notified[k]) return;
    local.notified[k] = td;
    try { const n = new Notification("⏰ " + t.title, { body: (t.clientName ? t.clientName + " · " : "") + "Due " + fmt12(t.dueTime), tag: k, requireInteraction: true }); n.onclick = () => { window.focus(); go("home"); n.close(); }; } catch (e) {}
  });
  if (!local.notified["digest" + td] && now.getHours() >= 8) {
    local.notified["digest" + td] = td;
    const k = counts();
    if (k.tasksDue || k.chase || k.follow || k.bills) try { new Notification("📅 Today: " + [k.tasksDue + " task(s)", k.follow + " follow-up(s)", k.chase + " payment(s) to chase", k.bills + " bill(s) to pay"].filter(x => x[0] !== "0").join(", "), { body: "Open the CRM to see them.", tag: "digest" }); } catch (e) {}
  }
  Object.keys(local.notified).forEach(k => { if (local.notified[k] < td) delete local.notified[k]; });
  persist();
}

/* ===================== events ===================== */
document.addEventListener("click", e => {
  const bz = e.target.closest("[data-b]");
  if (bz && bz.parentElement && /_biz$/.test(bz.parentElement.id || "")) { setBizPicked(bz.parentElement.id.replace(/_biz$/, ""), bz.dataset.b); return; }
  const fx = e.target.closest("[data-follow],[data-followlater],[data-editbill],[data-paybill],[data-billlater]");
  if (fx) {
    const d = fx.dataset;
    if (d.follow) { const c = clientById(d.follow); if (c) followForm(c); }
    if (d.followlater) { const c = clientById(d.followlater); if (c) { c.nextFollowUp = addDays(today(), 1); put("clients", c); logAct("Follow-up moved", c, "→ " + c.nextFollowUp); toast("Follow-up moved to tomorrow"); render(); } }
    if (d.editbill) { const b = local.bills.find(x => x.id === d.editbill); if (b) billForm(b, false); }
    if (d.paybill) { const b = local.bills.find(x => x.id === d.paybill); if (b) payBillForm(b); }
    if (d.billlater) { const b = local.bills.find(x => x.id === d.billlater); if (b) { b.snoozedTo = addDays(today(), 1); put("bills", b); toast("I'll remind you again tomorrow"); render(); } }
    return;
  }
  const el = e.target.closest("[data-nav],[data-act],[data-client],[data-edittask],[data-later],[data-done],[data-followup],[data-stage],[data-note],[data-theme],[data-edituser],[data-jump],[data-walog],[data-editpay],[data-remind],[data-recpay],[data-docrm]");
  if (!el) { if (e.target.id === "modal") closeModal(); return; }
  const d = el.dataset;
  if (d.walog) { const c = clientById(d.walog); if (c && can("edit")) { addHistory(c, "whatsapp", "Opened WhatsApp chat"); put("clients", c); setTimeout(renderDrawer, 50); } return; }
  if (d.nav) { closeModal(); go(d.nav); return; }
  if (d.jump) { const s = document.getElementById(d.jump); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (d.client) { e.preventDefault(); closeModal(); openClient(d.client); return; }
  if (d.done) { const t = local.tasks.find(x => x.id === d.done); if (t && can("edit")) { completeTask(t, !t.done); el.classList.add("on"); setTimeout(() => { render(); }, 280); } return; }
  if (d.edittask) { const t = local.tasks.find(x => x.id === d.edittask); if (t) taskForm(t, false); return; }
  if (d.later) { const t = local.tasks.find(x => x.id === d.later); if (t) { const from = t.dueDate; t.dueDate = addDays(t.dueDate && t.dueDate > today() ? t.dueDate : today(), 1); put("tasks", t); logAct("Task moved", t, (from || "no date") + " → " + t.dueDate); toast("Moved to " + fmtDate(t.dueDate)); render(); } return; }
  if (d.editpay) { const p = local.payments.find(x => x.id === d.editpay); if (p) payForm(p, false); return; }
  if (d.remind) { const p = local.payments.find(x => x.id === d.remind); if (p) remindForm(p); return; }
  if (d.recpay) { const p = local.payments.find(x => x.id === d.recpay); if (p) recordPaymentForm(p); return; }
  if (d.followup) { const c = clientById(d.followup); taskForm(newTask({ title: (c.stage === "Enquiry" ? "Send quotation to " : "Follow up with ") + shortName(c), dueDate: addDays(today(), 1), clientId: c.id, clientName: clientLabel(c), assignedTo: c.assignedTo || "" }), true); return; }
  if (d.stage) { const c = clientById(openClientId); if (c && can("edit")) setStage(c, d.stage); return; }
  if (d.note) {
    const c = clientById(openClientId), txt = $("#noteText").value.trim();
    if (!txt && d.note === "note") { toast("Write a note first"); return; }
    addHistory(c, d.note === "wa" ? "whatsapp" : d.note, (d.note === "call" ? "📞 Call" : d.note === "wa" ? "💬 WhatsApp" : "") + (txt ? (d.note === "note" ? "" : ": ") + txt : ""));
    put("clients", c); logAct(d.note === "call" ? "Call logged" : d.note === "wa" ? "WhatsApp logged" : "Note added", c, txt.slice(0, 120));
    renderDrawer(); toast("Saved"); return;
  }
  if (d.theme) { setTheme(d.theme); render(); return; }
  if (d.docrm) { const c = clientById(openClientId); if (c && confirm("Remove the \"" + d.docrm + "\" checklist from this client?")) { c.docLists = activeDocLists(c).map(l => l.name).filter(n => n !== d.docrm); put("clients", c); logAct("Checklist removed", c, d.docrm); renderDrawer(); } return; }
  if (d.edituser) { userForm((local.usersFull || []).find(u => u.username === d.edituser)); return; }
  const c = clientById(openClientId);
  switch (d.act) {
    case "close": closeDrawer(); break;
    case "askdocs": docRequestForm(c); break;
    case "import": closeModal(); importForm(); break;
    case "importtpl": downloadFile("client-import-template.csv", csv([IMPORT_FIELDS.map(f => f[1]), ["Ahmed Al Mansoori", "Al Mansoori Trading LLC", "050 123 4567", "ahmed@example.com", "100123456700003", "VAT return filing", "Won", "3500", "Referral", "", "Quarterly VAT client"]]), "text/csv;charset=utf-8"); break;
    case "weeklynow": api("weeklyNow").then(r => toast("Summary sent to " + r.to)).catch(x => toast(x.message)); break;
    case "savedocs": {
      const out = []; document.querySelectorAll("[data-dln]").forEach(n => { const items = document.querySelector('[data-dli="' + n.dataset.dln + '"]').value.split("\n").map(x => x.trim()).filter(String); if (n.value.trim() && items.length) out.push({ name: n.value.trim(), items }); });
      saveSettings({ docLists: out }); break; }
    case "adddoclist": $("#doclists").insertAdjacentHTML("beforeend", docListEditor($("#doclists").children.length, null)); break;
    case "mclose": closeModal(); break;
    case "toggletheme": setTheme(themeNow() === "dark" ? "light" : "dark"); render(); break;
    case "install": if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; render(); }); } break;
    case "addmenu": addMenu(); break;
    case "newtask": closeModal(); taskForm(newTask(), true); break;
    case "fromwa": closeModal(); fromWhatsApp(); break;
    case "newclient": closeModal(); clientForm(null, true); break;
    case "newpay": closeModal(); payForm(newPayment(), true); break;
    case "newbill": closeModal(); billForm(newBill(), true); break;
    case "exportbills": exportBills(); break;
    case "hideintro": local.hideIntro = true; persist(); render(); break;
    case "showintro": local.hideIntro = false; persist(); go("home"); break;
    case "editclient": clientForm(c, false, () => { render(); renderDrawer(); }); break;
    case "clienttask": taskForm(newTask({ dueDate: addDays(today(), 1), clientId: c.id, clientName: clientLabel(c), assignedTo: c.assignedTo || (syncOn() ? me().name : "") }), true); break;
    case "clientpay": payForm(newPayment({ clientId: c.id, clientName: clientLabel(c), description: c.service || "", amount: c.quoteAmount || "" }), true); break;
    case "notetask": { const txt = $("#noteText").value.trim(), p = parseDue(txt);
      taskForm(newTask({ title: p.rest || txt || "Follow up with " + shortName(c), dueDate: p.date || addDays(today(), 1), dueTime: p.time, clientId: c.id, clientName: clientLabel(c), assignedTo: c.assignedTo || (syncOn() ? me().name : "") }), true); break; }
    case "delclient": if (confirm("Delete " + clientLabel(c) + " with their tasks and invoices? This cannot be undone.")) {
      local.tasks.filter(t => t.clientId === c.id).forEach(t => remove("tasks", t.id)); local.payments.filter(p => p.clientId === c.id).forEach(p => remove("payments", p.id));
      logAct("Client deleted", c, ""); remove("clients", c.id); closeDrawer(); render(); } break;
    case "notif": if ("Notification" in window) Notification.requestPermission().then(p => { toast(p === "granted" ? "Pop-up reminders are on" : "Notifications were not allowed"); render(); }); break;
    case "savesettings": saveSettings({ companyName: $("#s_company").value.trim() || "My Consultancy", appUrl: $("#s_appurl").value.trim(), bankDetails: $("#s_bank").value.trim(), remindEvery: +$("#s_every").value,
      followUpDays: +$("#s_fud").value, billRemindDays: +$("#s_bill").value, expenseCategories: lines("#s_exp"),
      services: lines("#s_services"), sources: lines("#s_sources"), lostReasons: lines("#s_lost") }); break;
    case "savebiz": {
      const out = []; document.querySelectorAll("[data-bzn]").forEach(n => { const i = n.dataset.bzn, g = k => document.querySelector("[data-bz" + k + '="' + i + '"]').value.trim();
        if (n.value.trim()) out.push({ id: g("id") || "b" + uid().slice(-5), name: n.value.trim(), short: g("s") || n.value.trim().split(" ").slice(0, 2).join(" "), color: g("c") || "#64748b", bank: g("b") }); });
      if (local.biz && !out.some(b => b.id === local.biz)) local.biz = "";
      saveSettings({ businesses: out }); break; }
    case "addbiz": $("#bizlist").insertAdjacentHTML("beforeend", bizEditor($("#bizlist").children.length, null)); break;
    case "addtpl": $("#tpls").insertAdjacentHTML("beforeend", tplEditor("t", $("#tpls").children.length, null)); break;
    case "savetpl": {
      const read = k => { const out = []; document.querySelectorAll("[data-" + k + "n]").forEach(n => { const t = document.querySelector("[data-" + k + "t=\"" + n.getAttribute("data-" + k + "n") + "\"]").value.trim(); if (t) out.push({ name: n.value.trim() || "Message", text: t }); }); return out; };
      const pt = read("p"); saveSettings({ templates: read("t"), payTemplates: pt.length ? pt : DEFAULT_SETTINGS.payTemplates }); break; }
    case "connect": connect($("#s_url").value); break;
    case "disconnect": if (confirm("Disconnect this device from the Google Sheet? Data on this device will be cleared (it stays safe in the sheet).")) { local = load(); local.syncUrl = ""; local.session = null; KINDS.forEach(k => { local[k] = []; local.dirty[k] = {}; local.deleted[k] = []; }); local.activity = []; persist(); go("settings"); } break;
    case "logout": api("logout").catch(() => {}).then(() => { local.session = null; KINDS.forEach(k => { local[k] = []; local.dirty[k] = {}; }); persist(); closeDrawer(); render(); }); break;
    case "chpw": modal(`<h2>Change password</h2><div class="stack" style="margin-top:12px"><label class="f"><span>Current password</span><input type="password" id="pw0"></label><label class="f"><span>New password (8+ characters)</span><input type="password" id="pw1"></label></div><div class="mfoot"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" id="pwok">Change</button></div>`);
      $("#pwok").onclick = async () => { try { const r = await api("changePassword", { oldPassword: $("#pw0").value, newPassword: $("#pw1").value }); local.session.token = r.session; persist(); closeModal(); toast("Password changed"); } catch (x) { toast(x.message); } }; break;
    case "testmail": api("testEmail").then(r => toast("Test email sent to " + r.to)).catch(x => toast(x.message)); break;
    case "adduser": userForm(null); break;
    case "savecal": { const on = $("#cal_on").checked, inv = $("#cal_inv").checked && on, was = local.settings.calendarSync;
      saveSettings({ calendarSync: on, calendarInvite: inv });
      if (on && !was && syncOn()) { clearTimeout(pushTimer); push().then(() => api("calendarSyncAll")).then(r => toast(r.count + " task(s) added to the \"" + r.calendar + "\" calendar")).catch(x => toast("Calendar: " + x.message)); }
      break; }
    case "calsync": toast("Sending tasks to Google Calendar…"); api("calendarSyncAll").then(r => toast(r.count + " task(s) are in the \"" + r.calendar + "\" calendar")).catch(x => toast("Calendar: " + x.message)); break;
    case "exportclients": exportClients(); break;
    case "exporttasks": exportTasks(); break;
    case "exportpay": exportPayments(); break;
    case "backup": backup(); break;
    case "demo": loadDemo(); break;
    case "cleardemo": clearDemo(); break;
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "cal_on") { const i = $("#cal_inv"); if (i) i.disabled = !e.target.checked; }
  if (e.target.dataset && e.target.dataset.doc != null && openClientId && can("edit")) toggleDoc(clientById(openClientId), e.target.dataset.doc, e.target.checked);
});
document.addEventListener("submit", e => { if (e.target.id === "quickForm") { e.preventDefault(); quickAdd($("#quickText").value); } });
document.addEventListener("input", e => {
  if (e.target.id !== "quickText") return;
  const v = e.target.value.trim(), h = $("#quickHint"); if (!h) return;
  if (!v) { h.innerHTML = "Write it like a note. Words like <i>tomorrow, Thursday, 15 Nov, next week, 3pm</i> set the date, and a client's name links it to them."; return; }
  const p = parseDue(v), c = findClientIn(v);
  h.innerHTML = "📅 <b>" + (p.date ? fmtDate(p.date) + (p.time ? " " + fmt12(p.time) : "") : "Today") + "</b>" + (c ? " · 👤 <b>" + esc(shortName(c)) + "</b>" : "") + " · " + esc(p.rest || v) + " <span class='muted'>– press Enter to add</span>";
});
$("#shade").onclick = closeDrawer;
document.addEventListener("keydown", e => { if (e.key === "Escape") { if ($("#modal").classList.contains("on")) closeModal(); else closeDrawer(); } });
document.addEventListener("paste", e => {
  if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "") || $("#modal").classList.contains("on") || !can("edit") || !$("#main")) return;
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (text && text.trim()) { e.preventDefault(); fromWhatsApp(text); }
});
window.addEventListener("online", () => { push(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && syncOn()) pull(); });

/* ===================== start ===================== */
setTheme(themeSaved());
if (window.matchMedia) { try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (themeSaved() === "auto") { setTheme("auto"); render(); } }); } catch (e) {} }
if (!syncOn()) generateRecurring();
render();
if (syncOn()) pull();
setInterval(() => { if (syncOn() && !document.hidden) pull(); }, 90000);
setInterval(checkReminders, 30000); setTimeout(checkReminders, 3000);
setInterval(() => { if (!$("#modal").classList.contains("on") && !openClientId && ["home", "tasks", "payments"].indexOf(view) >= 0 && document.activeElement && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) render(); }, 60000);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
