// ============================================================
// admin.js — 24x7 Vahan Sahayata — Admin Panel Logic
// ============================================================

let adminUser = null;
let allRequests  = [];
let allMechanics = [];
let allUsers     = [];

// ── Auth ──────────────────────────────────────────────────────
auth.onAuthStateChanged((user) => {
  if (user && ADMIN_EMAILS.includes(user.email)) {
    adminUser = user;
    document.getElementById("adminLoginGate").style.display = "none";
    document.getElementById("adminApp").style.display = "block";
    document.getElementById("adminEmailLabel").textContent = user.email;
    loadDashboardData();
  } else if (user && !ADMIN_EMAILS.includes(user.email)) {
    auth.signOut();
    showToast("Aap admin nahi hain!", "error");
  }
});

async function adminGoogleLogin() {
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    if (!ADMIN_EMAILS.includes(result.user.email)) {
      await auth.signOut();
      showToast("Yeh account admin nahi hai", "error");
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function adminEmailLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const pass  = document.getElementById("adminPass").value;
  if (!email || !pass) { showToast("Email aur password daalein", "warning"); return; }
  setLoading(true);
  try {
    const result = await auth.signInWithEmailAndPassword(email, pass);
    if (!ADMIN_EMAILS.includes(result.user.email)) {
      await auth.signOut();
      showToast("Yeh account admin nahi hai", "error");
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function adminLogout() {
  await auth.signOut();
  document.getElementById("adminLoginGate").style.display = "flex";
  document.getElementById("adminApp").style.display = "none";
}

// ── Section Navigation ────────────────────────────────────────
function showAdminSection(name) {
  document.querySelectorAll(".section-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".mobile-admin-nav button").forEach((b, i) => {
    const map = ["overview","requests","mechanics","users"];
    b.classList.toggle("active", map[i] === name);
  });
  const panel = document.getElementById(`panel-${name}`);
  const sl    = document.getElementById(`sl-${name}`);
  if (panel) panel.classList.add("active");
  if (sl)    sl.classList.add("active");

  if (name === "requests") loadAllRequests();
  if (name === "mechanics") loadMechanics();
  if (name === "users") loadUsers();
  if (name === "reviews") loadReviews();
}

// ── Load Dashboard Data ───────────────────────────────────────
async function loadDashboardData() {
  setLoading(true);
  try {
    const [usersSnap, mechSnap, reqSnap] = await Promise.all([
      db.collection("users").where("role", "==", "user").get(),
      db.collection("mechanics").get(),
      db.collection("requests").orderBy("createdAt", "desc").limit(100).get()
    ]);

    const reqs = [];
    reqSnap.forEach(d => reqs.push(d.data()));
    allRequests = reqs;

    const pending   = reqs.filter(r => r.status === "pending").length;
    const completed = reqs.filter(r => r.status === "completed").length;

    document.getElementById("statUsers").textContent     = usersSnap.size;
    document.getElementById("statMechanics").textContent = mechSnap.size;
    document.getElementById("statPending").textContent   = pending;
    document.getElementById("statCompleted").textContent = completed;

    // Recent 10 requests
    renderRecentRequests(reqs.slice(0, 10));
  } catch (e) {
    showToast("Error loading data: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

function renderRecentRequests(reqs) {
  const tbody = document.getElementById("recentReqBody");
  if (!reqs.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Koi request nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = reqs.map(r => `
    <tr>
      <td><span style="font-family:monospace;font-size:12px">${r.requestId}</span></td>
      <td>${r.userName || "—"}</td>
      <td>${capitalize(r.vehicleType || "")}</td>
      <td>${capitalize(r.problemType || "")}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td style="font-size:12px">${formatDate(r.createdAt)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-primary btn-sm" onclick="openRequestDetail('${r.requestId}')">Manage</button>
          ${r.locationLat ? `<a class="map-link" href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}" target="_blank">📍 Map</a>` : ""}
        </div>
      </td>
    </tr>`).join("");
}

// ── All Requests ──────────────────────────────────────────────
async function loadAllRequests() {
  setLoading(true);
  try {
    const snap = await db.collection("requests").orderBy("createdAt", "desc").get();
    allRequests = [];
    snap.forEach(d => allRequests.push(d.data()));
    filterRequests();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

function filterRequests() {
  const search  = (document.getElementById("reqSearch")?.value || "").toLowerCase();
  const status  = document.getElementById("reqStatusFilter")?.value || "";
  const vehicle = document.getElementById("reqVehicleFilter")?.value || "";

  let filtered = allRequests.filter(r => {
    const matchSearch  = !search || (r.requestId + r.userName + r.userPhone + r.vehicleType).toLowerCase().includes(search);
    const matchStatus  = !status  || r.status === status;
    const matchVehicle = !vehicle || r.vehicleType === vehicle;
    return matchSearch && matchStatus && matchVehicle;
  });

  const tbody = document.getElementById("allReqBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">Koi result nahi mila</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><span style="font-family:monospace;font-size:11px">${r.requestId}</span></td>
      <td>${r.userName || "—"}</td>
      <td><a href="tel:${r.userPhone}" style="color:var(--teal)">${r.userPhone || "—"}</a></td>
      <td>${capitalize(r.vehicleType || "")}</td>
      <td>${capitalize(r.problemType || "")}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>${r.mechanicName || `<span style="color:var(--text-dim)">—</span>`}</td>
      <td style="font-size:11px">${formatDate(r.createdAt)}</td>
      <td>
        <div class="action-btns">
          <select class="form-control" style="padding:5px 8px;font-size:12px;width:auto" onchange="updateRequestStatus('${r.requestId}', this.value)">
            <option value="">Status</option>
            <option value="pending"   ${r.status==="pending"  ?"selected":""}>Pending</option>
            <option value="accepted"  ${r.status==="accepted" ?"selected":""}>Accepted</option>
            <option value="ontheway"  ${r.status==="ontheway" ?"selected":""}>On The Way</option>
            <option value="started"   ${r.status==="started"  ?"selected":""}>Started</option>
            <option value="completed" ${r.status==="completed"?"selected":""}>Completed</option>
            <option value="cancelled" ${r.status==="cancelled"?"selected":""}>Cancelled</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="assignMechanic('${r.requestId}')">Assign</button>
          <button class="btn btn-sm" style="background:#EF444420;color:#FC8181;border:1px solid #EF444440" onclick="deleteRequest('${r.requestId}')">🗑</button>
          ${r.locationLat ? `<a class="map-link" href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}" target="_blank" style="font-size:11px;padding:5px 10px">📍</a>` : ""}
        </div>
      </td>
    </tr>`).join("");
}

async function updateRequestStatus(requestId, status) {
  if (!status) return;
  setLoading(true);
  try {
    await db.collection("requests").doc(requestId).update({
      status, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`Status updated: ${status}`, "success");
    loadAllRequests();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function assignMechanic(requestId) {
  // Fetch available mechanics
  const snap = await db.collection("mechanics").where("isApproved", "==", true).get();
  const options = [];
  snap.forEach(d => options.push({ id: d.id, ...d.data() }));

  if (!options.length) { showToast("Koi approved mechanic nahi hai", "warning"); return; }

  const list = options.map((m, i) => `${i + 1}. ${m.name} (${m.phone || "—"})`).join("\n");
  const idx = prompt(`Mechanic chunein (number likhein):\n\n${list}`);
  if (!idx) return;
  const mech = options[parseInt(idx) - 1];
  if (!mech) { showToast("Invalid selection", "error"); return; }

  setLoading(true);
  try {
    await db.collection("requests").doc(requestId).update({
      assignedMechanicId: mech.uid,
      mechanicName: mech.name,
      mechanicPhone: mech.phone || "",
      status: "accepted",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`${mech.name} assign ho gaya`, "success");
    loadAllRequests();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function deleteRequest(requestId) {
  if (!confirm("Yeh request delete karna chahte hain?")) return;
  setLoading(true);
  try {
    await db.collection("requests").doc(requestId).delete();
    showToast("Request delete ho gayi", "success");
    loadAllRequests();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Mechanics ─────────────────────────────────────────────────
async function loadMechanics() {
  setLoading(true);
  try {
    const snap = await db.collection("mechanics").orderBy("createdAt", "desc").get();
    allMechanics = [];
    snap.forEach(d => allMechanics.push({ id: d.id, ...d.data() }));
    filterMechanics();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

function filterMechanics() {
  const search = (document.getElementById("mechSearch")?.value || "").toLowerCase();
  const filtered = allMechanics.filter(m =>
    !search || (m.name + m.phone + m.serviceArea).toLowerCase().includes(search)
  );
  const tbody = document.getElementById("mechBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">Koi mechanic nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(m => `
    <tr>
      <td><strong>${m.name || "—"}</strong></td>
      <td><a href="tel:${m.phone}" style="color:var(--teal)">${m.phone || "—"}</a></td>
      <td>${m.experience || "—"} yrs</td>
      <td>${m.serviceArea || "—"}</td>
      <td>${m.isOnline ? `<span class="badge-approved">🟢 Online</span>` : `<span style="color:var(--text-dim)">⚫ Offline</span>`}</td>
      <td>
        ${m.isApproved === true  ? `<span class="badge-approved">Approved</span>`  : ""}
        ${m.isApproved === false ? `<span class="badge-rejected">Rejected</span>`  : ""}
        ${m.isApproved === undefined || m.isApproved === null ? `<span class="badge-pending">Pending</span>` : ""}
      </td>
      <td>${m.rating ? `⭐ ${m.rating}` : "—"}</td>
      <td>
        <div class="action-btns">
          ${m.isApproved !== true  ? `<button class="btn btn-success btn-sm" onclick="approveMechanic('${m.id}',true)">Approve</button>`  : ""}
          ${m.isApproved !== false ? `<button class="btn btn-sm" style="background:#EF444420;color:#FC8181;border:1px solid #EF444440" onclick="approveMechanic('${m.id}',false)">Reject</button>` : ""}
          <button class="btn btn-outline btn-sm" onclick="deleteMechanic('${m.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join("");
}

async function approveMechanic(id, approve) {
  setLoading(true);
  try {
    await db.collection("mechanics").doc(id).update({ isApproved: approve });
    showToast(approve ? "Mechanic approve ho gaya ✅" : "Mechanic reject ho gaya", approve ? "success" : "warning");
    loadMechanics();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function deleteMechanic(id) {
  if (!confirm("Mechanic delete karna chahte hain?")) return;
  setLoading(true);
  try {
    await db.collection("mechanics").doc(id).delete();
    showToast("Mechanic delete ho gaya", "info");
    loadMechanics();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Users ─────────────────────────────────────────────────────
async function loadUsers() {
  setLoading(true);
  try {
    const snap = await db.collection("users").orderBy("createdAt", "desc").get();
    allUsers = [];
    snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    filterUsers();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

function filterUsers() {
  const search = (document.getElementById("userSearch")?.value || "").toLowerCase();
  const filtered = allUsers.filter(u =>
    !search || (u.name + u.email + u.phone).toLowerCase().includes(search)
  );
  const tbody = document.getElementById("userBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Koi user nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td><strong>${u.name || "—"}</strong></td>
      <td>${u.email || "—"}</td>
      <td>${u.phone || "—"}</td>
      <td><span class="badge-approved">${u.role || "user"}</span></td>
      <td style="font-size:12px">${formatDate(u.createdAt)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewUserRequests('${u.uid}','${u.name}')">Requests</button>
      </td>
    </tr>`).join("");
}

async function viewUserRequests(uid, name) {
  setLoading(true);
  try {
    const snap = await db.collection("requests").where("userId", "==", uid).get();
    const count = snap.size;
    alert(`${name} ke total ${count} request(s) hain.`);
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Reviews ───────────────────────────────────────────────────
async function loadReviews() {
  const container = document.getElementById("reviewsContainer");
  container.innerHTML = "Loading...";
  try {
    const snap = await db.collection("reviews").orderBy("createdAt", "desc").limit(50).get();
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="es-icon">⭐</div><h3>Koi review nahi</h3></div>`;
      return;
    }
    let html = "";
    snap.forEach(d => {
      const r = d.data();
      html += `
        <div class="status-card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <strong>Request: ${r.requestId}</strong>
              <div style="font-size:12px;color:var(--text-muted)">User: ${r.userId} | Mechanic: ${r.mechanicId}</div>
            </div>
            <div style="color:var(--warning);font-size:18px">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
          </div>
          <p style="font-size:14px;color:var(--text-muted)">${r.review || "—"}</p>
          <div style="font-size:11px;color:var(--text-dim);margin-top:8px">${formatDate(r.createdAt)}</div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><h3>Error: ${e.message}</h3></div>`;
  }
}

// ── Utilities ─────────────────────────────────────────────────
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function openRequestDetail(requestId) {
  showAdminSection("requests");
  setTimeout(() => {
    document.getElementById("reqSearch").value = requestId;
    filterRequests();
  }, 200);
}
