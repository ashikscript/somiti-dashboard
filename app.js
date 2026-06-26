import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc,
  updateDoc, deleteDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------
// STATE
// ---------------------------------------------------------------
let members = [];          // [{id, name, shares}]
let payments = {};         // { "<memberId>_<month>": {paid, amount, paidDate} }
let deposits = [];         // [{id, month, amount, date, by, note}]
let settings = { name: "Somiti Tracker", totalMonths: 36, shareAmount: 500 };
let currentUser = null;
let editingMemberId = null;
let editingDepositId = null;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------
// FIRESTORE LISTENERS (realtime — keeps every device in sync)
// ---------------------------------------------------------------
onSnapshot(collection(db, "members"), (snap) => {
  members = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderAll();
});

onSnapshot(collection(db, "payments"), (snap) => {
  payments = {};
  snap.docs.forEach(d => { payments[d.id] = d.data(); });
  renderAll();
});

onSnapshot(collection(db, "deposits"), (snap) => {
  deposits = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.month ?? 0) - (b.month ?? 0));
  renderAll();
});

onSnapshot(doc(db, "settings", "main"), (snap) => {
  if (snap.exists()) settings = { ...settings, ...snap.data() };
  renderAll();
});

// ---------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  $("adminBar").hidden = !user;
  if (user) $("adminEmail").textContent = user.email;
  $("addMemberBtn").hidden = !user;
  $("addDepositBtn").hidden = !user;
  renderAll();
});

$("loginToggleBtn").addEventListener("click", () => {
  if (currentUser) { signOut(auth); return; }
  $("loginPanel").hidden = false;
});
$("loginCancelBtn").addEventListener("click", () => $("loginPanel").hidden = true);
$("logoutBtn").addEventListener("click", () => signOut(auth));

$("loginSubmitBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  const pass = $("loginPassword").value;
  $("loginError").hidden = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    $("loginPanel").hidden = true;
    $("loginEmail").value = ""; $("loginPassword").value = "";
    showToast("Logged in");
  } catch (e) {
    $("loginError").textContent = "Could not log in. Check email and password.";
    $("loginError").hidden = false;
  }
});

function isAdmin() { return !!currentUser; }

// ---------------------------------------------------------------
// RENDER — HERO
// ---------------------------------------------------------------
function renderHero() {
  $("somitiName").textContent = settings.name;
  const totalShares = members.reduce((s, m) => s + (Number(m.shares) || 1), 0);
  const monthlyTarget = totalShares * Number(settings.shareAmount || 0);
  const lifeTarget = monthlyTarget * Number(settings.totalMonths || 0);

  let collected = 0;
  Object.values(payments).forEach(p => { if (p.paid) collected += Number(p.amount) || 0; });

  $("hero-sub").textContent =
    `${members.length} members · ৳${monthlyTarget.toLocaleString()} collected together each month`;
  $("amountCollected").textContent = `৳ ${collected.toLocaleString()}`;
  $("amountTarget").textContent = `৳ ${lifeTarget.toLocaleString()}`;
  const pct = lifeTarget > 0 ? Math.min(100, (collected / lifeTarget) * 100) : 0;
  $("gaugeFill").style.width = pct + "%";

  const completedMonths = countCompletedMonths(totalShares > 0 ? members.length : 0);
  $("monthsLabel").textContent = `Month ${completedMonths} of ${settings.totalMonths}`;
}

function countCompletedMonths() {
  if (members.length === 0) return 0;
  let completed = 0;
  for (let m = 1; m <= settings.totalMonths; m++) {
    const allPaid = members.every(mem => payments[`${mem.id}_${m}`]?.paid);
    if (allPaid) completed = m; else break;
  }
  return completed;
}

// ---------------------------------------------------------------
// RENDER — STAT CARDS
// ---------------------------------------------------------------
function renderStats() {
  const totalShares = members.reduce((s, m) => s + (Number(m.shares) || 1), 0);
  const monthlyTarget = totalShares * Number(settings.shareAmount || 0);
  const totalDeposited = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  $("statMembers").textContent = members.length;
  $("statShares").textContent = totalShares;
  $("statMonthlyTarget").textContent = `৳${monthlyTarget.toLocaleString()}`;
  $("statDeposited").textContent = `৳${totalDeposited.toLocaleString()}`;
}

// ---------------------------------------------------------------
// RENDER — MEMBERS PANEL
// ---------------------------------------------------------------
function renderMembers() {
  updateQuickSeedVisibility();
  const list = $("memberList");
  list.innerHTML = "";
  if (members.length === 0) {
    list.innerHTML = `<p class="empty-note">No members yet. ${isAdmin() ? "Add the first one above." : ""}</p>`;
    return;
  }
  members.forEach(m => {
    const amount = (Number(m.shares) || 1) * Number(settings.shareAmount || 0);
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div>
        <div class="m-name">${escapeHtml(m.name)}</div>
        <div class="m-meta">${m.shares} account${m.shares > 1 ? "s" : ""} · ৳${amount.toLocaleString()}/month</div>
      </div>
      <div class="m-actions">
        ${isAdmin() ? `<button class="text-btn" data-edit="${m.id}">Edit</button>
        <button class="row-del-btn" data-del="${m.id}">Remove</button>` : ""}
      </div>`;
    list.appendChild(row);
  });
  if (isAdmin()) {
    list.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => openMemberModal(btn.dataset.edit)));
    list.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", () => removeMember(btn.dataset.del)));
  }
}

$("addMemberBtn").addEventListener("click", () => openMemberModal(null));
$("cancelMemberBtn").addEventListener("click", () => $("memberModal").hidden = true);

$("quickSeedBtn").addEventListener("click", async () => {
  if (!confirm("Add 19 placeholder members (7 with 2 shares, 12 with 1 share)? You can rename each one afterward.")) return;
  const batch = writeBatch(db);
  let order = members.length;
  for (let i = 1; i <= 7; i++) {
    batch.set(doc(collection(db, "members")), { name: `Member ${i}`, shares: 2, order: order++, createdAt: serverTimestamp() });
  }
  for (let i = 8; i <= 19; i++) {
    batch.set(doc(collection(db, "members")), { name: `Member ${i}`, shares: 1, order: order++, createdAt: serverTimestamp() });
  }
  await batch.commit();
  showToast("19 members added — rename them from the list below");
});

function updateQuickSeedVisibility() {
  $("quickSeedBtn").hidden = !(isAdmin() && members.length === 0);
}

function openMemberModal(id) {
  editingMemberId = id;
  const m = members.find(x => x.id === id);
  $("memberModalTitle").textContent = m ? "Edit member" : "Add member";
  $("memberName").value = m ? m.name : "";
  $("memberShares").value = m ? String(m.shares) : "1";
  $("memberModal").hidden = false;
}

$("saveMemberBtn").addEventListener("click", async () => {
  const name = $("memberName").value.trim();
  const shares = Number($("memberShares").value);
  if (!name) return;
  try {
    if (editingMemberId) {
      await updateDoc(doc(db, "members", editingMemberId), { name, shares });
    } else {
      await addDoc(collection(db, "members"), { name, shares, order: members.length, createdAt: serverTimestamp() });
    }
    $("memberModal").hidden = true;
    showToast("Member saved");
  } catch (e) { showToast("Could not save member"); }
});

async function removeMember(id) {
  if (!confirm("Remove this member? Their payment history will stay in the ledger.")) return;
  await deleteDoc(doc(db, "members", id));
  showToast("Member removed");
}

// ---------------------------------------------------------------
// RENDER — LEDGER GRID (signature passbook stamp view)
// ---------------------------------------------------------------
function renderLedger() {
  const headRow = $("ledgerHeadRow");
  headRow.innerHTML = `<th class="sticky-col">Member</th>`;
  for (let m = 1; m <= settings.totalMonths; m++) {
    const th = document.createElement("th");
    th.innerHTML = `<div class="month-col-head">
        <span>M${m}</span>
        ${isAdmin() ? `<button class="bulk-mark-btn" data-bulk="${m}">mark all</button>` : ""}
      </div>`;
    headRow.appendChild(th);
  }
  headRow.querySelectorAll("[data-bulk]").forEach(btn =>
    btn.addEventListener("click", () => bulkMarkMonth(Number(btn.dataset.bulk))));

  const body = $("ledgerBody");
  body.innerHTML = "";
  if (members.length === 0) {
    body.innerHTML = `<tr><td class="sticky-col" colspan="1">No members yet</td></tr>`;
    return;
  }
  members.forEach(mem => {
    const amount = (Number(mem.shares) || 1) * Number(settings.shareAmount || 0);
    const tr = document.createElement("tr");
    let cells = `<td class="sticky-col">
        <div class="ledger-name-cell">
          <span class="n">${escapeHtml(mem.name)}</span>
          <span class="s">৳${amount.toLocaleString()}/mo</span>
        </div>
      </td>`;
    for (let m = 1; m <= settings.totalMonths; m++) {
      const key = `${mem.id}_${m}`;
      const paid = !!payments[key]?.paid;
      cells += `<td class="stamp-cell ${isAdmin() ? "clickable" : ""}" data-member="${mem.id}" data-month="${m}">
          <div class="stamp ${paid ? "paid" : ""}"></div>
        </td>`;
    }
    tr.innerHTML = cells;
    body.appendChild(tr);
  });

  if (isAdmin()) {
    body.querySelectorAll(".stamp-cell.clickable").forEach(cell =>
      cell.addEventListener("click", () => togglePayment(cell.dataset.member, Number(cell.dataset.month))));
  }
}

async function togglePayment(memberId, month) {
  const key = `${memberId}_${month}`;
  const member = members.find(m => m.id === memberId);
  const wasPaid = !!payments[key]?.paid;
  const amount = (Number(member?.shares) || 1) * Number(settings.shareAmount || 0);
  await setDoc(doc(db, "payments", key), {
    memberId, month, amount,
    paid: !wasPaid,
    paidDate: !wasPaid ? serverTimestamp() : null
  });
}

async function bulkMarkMonth(month) {
  if (!confirm(`Mark month ${month} as paid for every member?`)) return;
  const batch = writeBatch(db);
  members.forEach(mem => {
    const amount = (Number(mem.shares) || 1) * Number(settings.shareAmount || 0);
    batch.set(doc(db, "payments", `${mem.id}_${month}`), {
      memberId: mem.id, month, amount, paid: true, paidDate: serverTimestamp()
    });
  });
  await batch.commit();
  showToast(`Month ${month} marked paid for everyone`);
}

// ---------------------------------------------------------------
// RENDER — DEPOSITS PANEL
// ---------------------------------------------------------------
function renderDeposits() {
  const body = $("depositBody");
  body.innerHTML = "";
  $("depositEmptyNote").hidden = deposits.length > 0;
  deposits.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Month ${d.month}</td>
      <td>${d.date || "—"}</td>
      <td class="amount">৳${Number(d.amount || 0).toLocaleString()}</td>
      <td>${escapeHtml(d.by || "—")}</td>
      <td>${escapeHtml(d.note || "")}</td>
      <td>${isAdmin() ? `<button class="text-btn" data-edit="${d.id}">Edit</button>
        <button class="row-del-btn" data-del="${d.id}">Remove</button>` : ""}</td>`;
    body.appendChild(tr);
  });
  if (isAdmin()) {
    body.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => openDepositModal(btn.dataset.edit)));
    body.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", () => removeDeposit(btn.dataset.del)));
  }
}

$("addDepositBtn").addEventListener("click", () => openDepositModal(null));
$("cancelDepositBtn").addEventListener("click", () => $("depositModal").hidden = true);

function openDepositModal(id) {
  editingDepositId = id;
  const d = deposits.find(x => x.id === id);
  $("depositModalTitle").textContent = d ? "Edit deposit" : "Log a bank deposit";
  $("depositMonth").value = d ? d.month : "";
  $("depositAmount").value = d ? d.amount : "";
  $("depositDate").value = d ? d.date : "";
  $("depositBy").value = d ? d.by : "";
  $("depositNote").value = d ? d.note : "";
  $("depositModal").hidden = false;
}

$("saveDepositBtn").addEventListener("click", async () => {
  const data = {
    month: Number($("depositMonth").value),
    amount: Number($("depositAmount").value),
    date: $("depositDate").value,
    by: $("depositBy").value.trim(),
    note: $("depositNote").value.trim()
  };
  if (!data.month || !data.amount) return;
  try {
    if (editingDepositId) {
      await updateDoc(doc(db, "deposits", editingDepositId), data);
    } else {
      await addDoc(collection(db, "deposits"), { ...data, createdAt: serverTimestamp() });
    }
    $("depositModal").hidden = true;
    showToast("Deposit saved");
  } catch (e) { showToast("Could not save deposit"); }
});

async function removeDeposit(id) {
  if (!confirm("Remove this deposit record?")) return;
  await deleteDoc(doc(db, "deposits", id));
  showToast("Deposit removed");
}

// ---------------------------------------------------------------
// SETTINGS MODAL
// ---------------------------------------------------------------
$("openSettingsBtn").addEventListener("click", () => {
  $("setName").value = settings.name;
  $("setTotalMonths").value = settings.totalMonths;
  $("setShareAmount").value = settings.shareAmount;
  $("settingsModal").hidden = false;
});
$("closeSettingsBtn").addEventListener("click", () => $("settingsModal").hidden = true);
$("saveSettingsBtn").addEventListener("click", async () => {
  const data = {
    name: $("setName").value.trim() || "Somiti Tracker",
    totalMonths: Number($("setTotalMonths").value) || 36,
    shareAmount: Number($("setShareAmount").value) || 500
  };
  await setDoc(doc(db, "settings", "main"), data, { merge: true });
  $("settingsModal").hidden = true;
  showToast("Settings saved");
});

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

let toastTimer = null;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 2400);
}

function renderAll() {
  renderHero();
  renderStats();
  renderMembers();
  renderLedger();
  renderDeposits();
}

renderAll();
