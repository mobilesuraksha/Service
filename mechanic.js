// ============================================================
// mechanic.js — 24x7 Vahan Sahayata — Mechanic Dashboard Logic
// ============================================================
// FIXES APPLIED:
//  1. Removed orderBy("createdAt") from Firestore query → no composite
//     index needed. Results sorted client-side instead.
//  2. Moved isApproved/isOnline check OUT of forEach → listener now always
//     receives docs; UI shows/hides Accept button based on live mechDoc state.
//     When mechanic toggles online, listenPendingRequests() restarts so fresh
//     snapshot comes in immediately.
//  3. Error in snapshot is now shown via showToast() — not just console.error.
//  4. acceptRequest() now takes full request data directly from renderPendingRequests
//     to avoid stale closure issues with requestId.
// ============================================================

// ── State ────────────────────────────────────────────────────
let mechUser            = null;
let mechDoc             = null;
let selectedSpecs       = [];
let pendingReqListener  = null;
let myActiveReqListener = null;

// ── Auth Observer ─────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    mechUser = user;
    // Check if mechanic document exists
    const snap = await db.collection("mechanics").doc(user.uid).get();
    if (snap.exists) {
      mechDoc = snap.data();
      showMechDashboard();
    } else {
      // Not a mechanic yet → show auth/register
      showMechAuth();
    }
    // If admin, redirect
    if (ADMIN_EMAILS.includes(user.email)) {
      window.location.href = "admin.html";
    }
  } else {
    mechUser = null;
    mechDoc  = null;
    // Detach listeners on logout
    if (pendingReqListener)  { pendingReqListener();  pendingReqListener  = null; }
    if (myActiveReqListener) { myActiveReqListener(); myActiveReqListener = null; }
    showMechAuth();
  }
});

function showMechAuth() {
  document.getElementById("mechAuthGate").style.display = "block";
  document.getElementById("mechDashboard").style.display = "none";
}

function showMechDashboard() {
  document.getElementById("mechAuthGate").style.display = "none";
  document.getElementById("mechDashboard").style.display = "block";
  populateMechProfile();
  loadMechStats();
  listenPendingRequests();   // FIX: starts fresh listener
  listenMyActiveRequest();
  checkApprovalStatus();
}

// ── Auth UI toggle ────────────────────────────────────────────
function switchMechTab(tab) {
  const isLogin = (tab === "login");
  document.getElementById("mechLoginForm").style.display = isLogin ? "" : "none";
  document.getElementById("mechRegForm").style.display   = isLogin ? "none" : "";
  document.getElementById("mTabLogin").classList.toggle("active",  isLogin);
  document.getElementById("mTabReg").classList.toggle("active", !isLogin);
  if (!isLogin) goToStep(1);
}

// ── Multi-step Registration ───────────────────────────────────
function goToStep(n) {
  [1, 2, 3].forEach(i => {
    const el  = document.getElementById(`regStep${i}`);
    const dot = document.getElementById(`step${i}dot`);
    if (el) el.style.display = (i === n) ? "" : "none";
    if (dot) {
      dot.classList.remove("active", "done");
      if (i < n)  dot.classList.add("done");
      if (i === n) dot.classList.add("active");
    }
  });
  // Validate before moving forward
  if (n === 2) {
    const name  = document.getElementById("mRegName").value.trim();
    const phone = document.getElementById("mRegPhone").value.trim();
    const email = document.getElementById("mRegEmail").value.trim();
    const pass  = document.getElementById("mRegPass").value;
    if (!name || !phone || !email || !pass) { showToast("Saare fields bharein", "warning"); goToStep(1); return; }
    if (pass.length < 6) { showToast("Password min 6 characters chahiye", "warning"); goToStep(1); return; }
  }
  if (n === 3) {
    const exp  = document.getElementById("mRegExp").value;
    const area = document.getElementById("mRegArea").value.trim();
    if (!exp || !area) { showToast("Experience aur service area daalein", "warning"); goToStep(2); return; }
    if (selectedSpecs.length === 0) { showToast("Kam se kam ek vehicle specialization chunein", "warning"); goToStep(2); return; }
  }
}

function toggleSpec(el, val) {
  const cb = el.querySelector("input[type=checkbox]");
  if (selectedSpecs.includes(val)) {
    selectedSpecs = selectedSpecs.filter(s => s !== val);
    cb.checked = false; el.classList.remove("selected");
  } else {
    selectedSpecs.push(val);
    cb.checked = true; el.classList.add("selected");
  }
}

function previewMechPhoto(input) {
  const prev = document.getElementById("mechPhotoPreview");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { prev.src = e.target.result; prev.style.display = "block"; };
    reader.readAsDataURL(input.files[0]);
  }
}

// ── Google Login / Register ───────────────────────────────────
async function mechGoogleLogin() {
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result   = await auth.signInWithPopup(provider);
    const user     = result.user;

    const snap = await db.collection("mechanics").doc(user.uid).get();
    if (!snap.exists) {
      // First time Google login → create mechanic doc
      const newDoc = {
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        phone: user.phoneNumber || "",
        experience: "",
        vehicleTypes: [],
        serviceArea: "",
        isApproved: null,
        isOnline: false,
        rating: null,
        totalJobs: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection("mechanics").doc(user.uid).set(newDoc);
      showToast("Registered! Profile complete karein 👍", "success");
    } else {
      showToast("Login successful! 🎉", "success");
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function mechEmailLogin() {
  const email = document.getElementById("mLoginEmail").value.trim();
  const pass  = document.getElementById("mLoginPass").value;
  if (!email || !pass) { showToast("Email aur password daalein", "warning"); return; }
  setLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showToast("Login successful! 🎉", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function completeMechRegistration() {
  const name    = document.getElementById("mRegName").value.trim();
  const phone   = document.getElementById("mRegPhone").value.trim();
  const email   = document.getElementById("mRegEmail").value.trim();
  const pass    = document.getElementById("mRegPass").value;
  const exp     = document.getElementById("mRegExp").value;
  const area    = document.getElementById("mRegArea").value.trim();
  const aadhaar = document.getElementById("mRegAadhaar").value.trim();
  if (!name || !email || !pass || !exp || !area) { showToast("Saare required fields bharein", "warning"); return; }

  setLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });

    let photoURL = "";
    const photoFile = document.getElementById("mechPhoto").files[0];
    if (photoFile) {
      const ref  = storage.ref(`mechanic-photos/${cred.user.uid}/${Date.now()}`);
      const snap = await ref.put(photoFile);
      photoURL   = await snap.ref.getDownloadURL();
    }

    await db.collection("mechanics").doc(cred.user.uid).set({
      uid: cred.user.uid, name, email, phone,
      experience: exp,
      vehicleTypes: selectedSpecs,
      serviceArea: area,
      aadhaar: aadhaar || "",
      photoURL,
      isApproved: null,
      isOnline: false,
      rating: null,
      totalJobs: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Cross-save in users collection for admin visibility
    await db.collection("users").doc(cred.user.uid).set({
      uid: cred.user.uid, name, email, phone,
      role: "mechanic",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast("Registration complete! Admin approval ka wait karein 🙏", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function mechSignOut() {
  if (mechUser) {
    await db.collection("mechanics").doc(mechUser.uid)
      .update({ isOnline: false }).catch(() => {});
  }
  await auth.signOut();
}

// ── Dashboard Tab Switching ───────────────────────────────────
function switchDashTab(tab) {
  ["requests", "earnings", "profile"].forEach(t => {
    document.getElementById(`dtab-${t}`).style.display = (t === tab) ? "block" : "none";
    const btn = document.getElementById(`dTab-${t}`);
    if (btn) {
      btn.classList.toggle("active", t === tab);
      btn.style.borderBottom = t === tab ? "3px solid var(--emergency)" : "3px solid transparent";
    }
  });
  if (tab === "earnings") loadCompletedJobs();
}

// ── Online / Offline Toggle ───────────────────────────────────
async function toggleOnlineStatus(isOnline) {
  // FIX: Check isApproved strictly (null/undefined = pending, not approved)
  if (mechDoc?.isApproved !== true) {
    showToast("Admin approval ka wait karein ⏳", "warning");
    document.getElementById("onlineToggle").checked = false;
    return;
  }
  try {
    await db.collection("mechanics").doc(mechUser.uid).update({ isOnline });
    mechDoc.isOnline = isOnline;
    updateOnlineUI(isOnline);
    showToast(isOnline ? "Aap online hain! Requests milenge 🟢" : "Aap offline ho gaye ⚫", isOnline ? "success" : "info");

    // FIX: Restart listener so mechanic immediately sees/hides pending requests
    listenPendingRequests();
  } catch (e) {
    showToast(e.message, "error");
  }
}

function updateOnlineUI(isOnline) {
  document.getElementById("onlineStatusLabel").textContent =
    isOnline ? "🟢 Online — requests mil rahe hain" : "⚫ Offline — requests nahi milenge";
  document.getElementById("mechOnlineDot").style.background =
    isOnline ? "var(--success-lt)" : "var(--text-dim)";
}

// ── Approval Status Banner ────────────────────────────────────
function checkApprovalStatus() {
  if (!mechDoc) return;
  const banner = document.getElementById("pendingApprovalBanner");

  if (mechDoc.isApproved === true) {
    banner.style.display = "none";
  } else if (mechDoc.isApproved === false) {
    banner.style.display = "block";
    banner.style.background    = "#EF444415";
    banner.style.borderColor   = "#EF444440";
    banner.innerHTML = `
      <div style="font-weight:700;color:var(--emergency)">❌ Application Rejected</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px">
        Aapka application reject ho gaya. Support se contact karein.
      </div>`;
  } else {
    // null / undefined → pending
    banner.style.display = "block";
  }

  // Sync online toggle
  const isOnline = mechDoc.isOnline || false;
  document.getElementById("onlineToggle").checked = isOnline;
  updateOnlineUI(isOnline);
}

// ══════════════════════════════════════════════════════════════
// FIX: listenPendingRequests
//  — Removed .orderBy("createdAt") → no composite index needed
//  — Sorts client-side after fetching
//  — isApproved/isOnline check is now OUTSIDE forEach so the
//    listener always stays alive; UI renders based on live state
//  — Error shown via showToast, not just console.error
// ══════════════════════════════════════════════════════════════
function listenPendingRequests() {
  // Detach old listener first
  if (pendingReqListener) {
    pendingReqListener();
    pendingReqListener = null;
  }
  if (!mechUser) return;

  // Show loading state while listener connects
  const container = document.getElementById("pendingRequestsList");
  if (container) container.innerHTML = `
    <div class="empty-state">
      <div class="es-icon" style="animation:pulse 1s infinite">📡</div>
      <h3>Requests Load Ho Rahe Hain...</h3>
    </div>`;

  // ── SIMPLE query — only status filter, no orderBy → NO composite index needed ──
  pendingReqListener = db.collection("requests")
    .where("status", "==", "pending")
    .onSnapshot(
      (snap) => {
        // Collect all pending requests
        let reqs = [];
        snap.forEach(doc => {
          const r = { ...doc.data(), requestId: doc.id };
          reqs.push(r);
        });

        // Sort newest first client-side (safe, no Firestore index required)
        reqs.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tB - tA;
        });

        // Update pending count (total in DB)
        const el = document.getElementById("mStatPending");
        if (el) el.textContent = reqs.length;

        // FIX: isApproved / isOnline check is NOW here, not inside forEach
        // This means the listener stays alive even if mechanic is offline/pending
        if (mechDoc?.isApproved !== true) {
          // Approved nahi → show info message, not requests
          if (container) container.innerHTML = `
            <div class="empty-state">
              <div class="es-icon">⏳</div>
              <h3>Approval Pending</h3>
              <p>Admin se approval milne ke baad requests dikhenge</p>
            </div>`;
          return;
        }

        if (!mechDoc?.isOnline) {
          // Offline → show "go online" prompt
          if (container) container.innerHTML = `
            <div class="empty-state">
              <div class="es-icon">📴</div>
              <h3>Aap Offline Hain</h3>
              <p>Upar Online toggle ON karein — tab ${reqs.length} pending request${reqs.length !== 1 ? "s" : ""} dikhenge</p>
              <div style="margin-top:14px;font-size:13px;color:var(--teal);font-weight:700">
                ${reqs.length > 0 ? `🔔 ${reqs.length} request${reqs.length>1?"s":""} wait kar rahe hain!` : ""}
              </div>
            </div>`;
          return;
        }

        // Approved + Online → render requests
        renderPendingRequests(reqs);
      },
      (err) => {
        // FIX: show error to user, not just console
        console.error("listenPendingRequests error:", err);
        const msg = err.code === "failed-precondition"
          ? "Firestore index missing! Firebase Console mein index banayein. Details ke liye README dekho."
          : err.message;
        showToast("Request load error: " + msg, "error");
        if (container) container.innerHTML = `
          <div class="empty-state">
            <div class="es-icon">❌</div>
            <h3>Error Aaya</h3>
            <p style="font-size:12px;word-break:break-all">${msg}</p>
            <button class="btn btn-outline btn-sm" style="margin-top:12px"
              onclick="listenPendingRequests()">🔄 Retry</button>
          </div>`;
      }
    );
}

// ── Render Pending Requests ───────────────────────────────────
function renderPendingRequests(reqs) {
  const container = document.getElementById("pendingRequestsList");
  const badge     = document.getElementById("newReqBadge");
  if (!container) return;

  if (!reqs.length) {
    if (badge) badge.style.display = "none";
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📭</div>
        <h3>Koi Pending Request Nahi</h3>
        <p>Aap online hain — naya request aane par yahan dikhega</p>
      </div>`;
    return;
  }

  if (badge) badge.style.display = "inline-block";

  container.innerHTML = reqs.map(r => `
    <div class="request-card fade-in">
      <div class="req-meta">
        <span class="req-tag">${vehicleEmoji(r.vehicleType)} ${capitalize(r.vehicleType)}</span>
        <span class="req-tag">🔧 ${capitalize(r.problemType)}</span>
        <span class="req-distance">🕐 ${timeAgo(r.createdAt)}</span>
      </div>

      <div style="font-weight:700;font-size:16px;margin-bottom:4px">
        👤 ${r.userName || "User"}
      </div>

      <div class="req-desc">
        📞 <a href="tel:${r.userPhone}" style="color:var(--teal)">${r.userPhone || "—"}</a><br>
        📍 ${r.address || "Location GPS se share ki gayi hai"}<br>
        ${r.description ? `💬 ${r.description}` : ""}
      </div>

      ${r.locationLat
        ? `<a class="map-link"
             href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}"
             target="_blank" style="margin-bottom:12px;display:inline-flex">
             📍 Map Par Dekho
           </a>`
        : ""}

      ${r.photoUrl
        ? `<img src="${r.photoUrl}"
             style="width:100%;border-radius:var(--radius);max-height:160px;
                    object-fit:cover;margin-bottom:12px" alt="Vehicle Photo">`
        : ""}

      <div class="req-actions">
        <button class="btn btn-success" style="flex:1"
          onclick="acceptRequest('${r.requestId}','${r.userName}','${r.userPhone}')">
          ✅ Accept Karein
        </button>
        <a href="tel:${r.userPhone}"
           class="btn btn-primary btn-sm" title="Call User">📞</a>
        <a href="https://wa.me/91${r.userPhone}"
           target="_blank" class="btn btn-whatsapp btn-sm" title="WhatsApp">💬</a>
      </div>
    </div>`).join("");
}

// ── Accept a Request ──────────────────────────────────────────
// FIX: signature changed — takes requestId, userName, userPhone directly
//      from rendered HTML so no stale closure issues
async function acceptRequest(requestId, userName, userPhone) {
  // Guard checks (in case mechDoc changed since render)
  if (mechDoc?.isApproved !== true) {
    showToast("Admin approval ka wait karein ⏳", "warning"); return;
  }
  if (!mechDoc?.isOnline) {
    showToast("Pehle Online toggle ON karein 🟢", "warning"); return;
  }
  if (!confirm(`${userName || "User"} ki request accept karna chahte hain?`)) return;

  setLoading(true);
  try {
    await db.collection("requests").doc(requestId).update({
      status:             "accepted",
      assignedMechanicId: mechUser.uid,
      mechanicName:       mechDoc.name    || "",
      mechanicPhone:      mechDoc.phone   || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("Request accept ho gayi! Customer ko call karein 📞", "success");
  } catch (e) {
    showToast("Accept mein error: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Listen My Active Request (real-time) ──────────────────────
function listenMyActiveRequest() {
  if (myActiveReqListener) myActiveReqListener();
  if (!mechUser) return;

  myActiveReqListener = db.collection("requests")
    .where("assignedMechanicId", "==", mechUser.uid)
    .where("status", "in", ["accepted", "ontheway", "started"])
    .limit(1)
    .onSnapshot(
      (snap) => {
        const section = document.getElementById("myActiveRequestSection");
        if (!section) return;
        if (snap.empty) { section.style.display = "none"; return; }
        section.style.display = "block";
        const r = { ...snap.docs[0].data(), requestId: snap.docs[0].id };
        renderMyActiveRequest(r);
      },
      (err) => { console.error("listenMyActiveRequest:", err); }
    );
}

function renderMyActiveRequest(r) {
  const card = document.getElementById("myActiveRequestCard");
  if (!card) return;
  card.innerHTML = `
    <div class="status-card" style="border-color:var(--primary-lt)">
      <div style="font-family:var(--font-head);font-size:18px;font-weight:700;margin-bottom:8px">
        ${vehicleEmoji(r.vehicleType)} ${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}
      </div>
      <div style="font-size:14px;margin-bottom:4px">👤 ${r.userName}</div>
      <div style="font-size:14px;color:var(--text-muted);margin-bottom:12px">📞 ${r.userPhone}</div>
      ${r.address ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">📍 ${r.address}</div>` : ""}
      ${r.locationLat
        ? `<a class="map-link"
             href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}"
             target="_blank" style="margin-bottom:14px;display:inline-flex">
             📍 Customer Location Dekho
           </a>`
        : ""}
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <a href="tel:${r.userPhone}" class="btn btn-success" style="flex:1">📞 Call Karein</a>
        <a href="https://wa.me/91${r.userPhone}" target="_blank" class="btn btn-whatsapp" style="flex:1">💬 WhatsApp</a>
      </div>
      <div class="section-title" style="font-size:14px;margin-bottom:10px">Status Update Karein:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${r.status !== "ontheway"
          ? `<button class="btn btn-primary btn-sm"
               onclick="updateMyStatus('${r.requestId}','ontheway')">
               🚗 Aa Raha Hoon
             </button>` : ""}
        ${r.status !== "started"
          ? `<button class="btn btn-primary btn-sm"
               onclick="updateMyStatus('${r.requestId}','started')">
               🔧 Kaam Shuru
             </button>` : ""}
        <button class="btn btn-success btn-sm"
          onclick="updateMyStatus('${r.requestId}','completed')">
          ✅ Kaam Pura
        </button>
      </div>
    </div>`;
}

async function updateMyStatus(requestId, status) {
  if (!confirm(
    status === "completed"
      ? "Job complete mark karna chahte hain?"
      : `Status "${status}" update karein?`
  )) return;

  setLoading(true);
  try {
    if (status === "completed") {
      await db.collection("mechanics").doc(mechUser.uid).update({
        totalJobs: firebase.firestore.FieldValue.increment(1)
      });
    }
    await db.collection("requests").doc(requestId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const labels = {
      ontheway: "Customer ko pata chal gaya — aap aa rahe hain 🚗",
      started:  "Kaam shuru! Achha karo 🔧",
      completed: "Job complete! Bahut achha 🎉"
    };
    showToast(labels[status] || "Status update ho gaya", "success");
    if (status === "completed") loadMechStats();
  } catch (e) {
    showToast("Update mein error: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Load Stats ────────────────────────────────────────────────
async function loadMechStats() {
  if (!mechUser) return;
  try {
    const snap = await db.collection("requests")
      .where("assignedMechanicId", "==", mechUser.uid)
      .where("status", "==", "completed")
      .get();
    const count = snap.size;
    const el1 = document.getElementById("mStatCompleted");
    const el2 = document.getElementById("totalJobs");
    const el3 = document.getElementById("todayEarning");
    if (el1) el1.textContent = count;
    if (el2) el2.textContent = count;
    // Estimated ₹300 per job
    if (el3) el3.textContent = (count * 300).toLocaleString("en-IN");
    const ratingEl = document.getElementById("mechRating");
    if (ratingEl && mechDoc?.rating) ratingEl.textContent = mechDoc.rating;
  } catch (e) {
    console.error("loadMechStats:", e);
  }
}

// ── Completed Jobs List ───────────────────────────────────────
async function loadCompletedJobs() {
  const container = document.getElementById("completedJobsList");
  if (!container) return;
  container.innerHTML = "<div style='text-align:center;padding:20px;color:var(--text-muted)'>Loading...</div>";
  try {
    // FIX: Removed orderBy to avoid composite index requirement
    const snap = await db.collection("requests")
      .where("assignedMechanicId", "==", mechUser.uid)
      .where("status", "==", "completed")
      .limit(30)
      .get();

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">📋</div>
          <h3>Abhi koi completed job nahi</h3>
          <p>Requests accept karo aur paise kamao 💪</p>
        </div>`;
      return;
    }

    // Sort client-side by updatedAt desc
    const jobs = [];
    snap.forEach(d => jobs.push(d.data()));
    jobs.sort((a, b) => {
      const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tB - tA;
    });

    container.innerHTML = jobs.map(r => `
      <div class="completed-job-card fade-in">
        <div class="job-icon">${vehicleEmoji(r.vehicleType)}</div>
        <div class="job-info">
          <h4>${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}</h4>
          <p>${r.userName || "—"} • ${formatDate(r.updatedAt)}</p>
        </div>
        <div class="job-earning">₹300</div>
      </div>`).join("");
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Error: ${e.message}</h3>
        <button class="btn btn-outline btn-sm" style="margin-top:12px"
          onclick="loadCompletedJobs()">🔄 Retry</button>
      </div>`;
  }
}

// ── Populate Profile ──────────────────────────────────────────
function populateMechProfile() {
  if (!mechUser || !mechDoc) return;
  const name = mechDoc.name || mechUser.displayName || "Mechanic";

  document.getElementById("mechHeaderName").textContent  = name;
  document.getElementById("mechProfileName").textContent = name;
  document.getElementById("mechProfileEmail").textContent = mechDoc.email || mechUser.email || "";
  document.getElementById("mProfPhone").textContent  = mechDoc.phone       || "—";
  document.getElementById("mProfArea").textContent   = mechDoc.serviceArea || "—";
  document.getElementById("mProfExp").textContent    = mechDoc.experience  ? mechDoc.experience + " saal" : "—";
  document.getElementById("mProfSpec").textContent   = (mechDoc.vehicleTypes || []).join(", ") || "—";
  document.getElementById("mProfRating").textContent = mechDoc.rating ? `⭐ ${mechDoc.rating}` : "Abhi koi rating nahi";

  const appr   = mechDoc.isApproved;
  const apprEl = document.getElementById("mProfApproval");
  if (apprEl) {
    if (appr === true)  apprEl.innerHTML = `<span class="badge-approved">✅ Approved</span>`;
    else if (appr === false) apprEl.innerHTML = `<span class="badge-rejected">❌ Rejected</span>`;
    else                apprEl.innerHTML = `<span class="badge-pending">⏳ Admin Review Pending</span>`;
  }

  const photo  = mechDoc.photoURL || mechUser.photoURL;
  const avatar = document.getElementById("mechProfileAvatar");
  if (avatar) {
    if (photo) {
      avatar.innerHTML = `<img src="${photo}" alt="">`;
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
      avatar.style.fontSize = "40px";
      avatar.style.background = "linear-gradient(135deg,var(--primary),var(--primary-lt))";
    }
  }
}

async function updateMechProfile() {
  const area = document.getElementById("mUpdateArea").value.trim();
  if (!area) { showToast("Nayi area likhein", "warning"); return; }
  setLoading(true);
  try {
    await db.collection("mechanics").doc(mechUser.uid).update({ serviceArea: area });
    mechDoc.serviceArea = area;
    populateMechProfile();
    document.getElementById("mUpdateArea").value = "";
    showToast("Profile update ho gaya ✅", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Utilities ─────────────────────────────────────────────────
function vehicleEmoji(v) {
  const map = {
    bike:"🏍️", car:"🚗", tempo:"🚐", loading:"🚚",
    tractor:"🚜", truck:"🛻", auto:"🛺", other:"🚘"
  };
  return map[v] || "🚘";
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(ts) {
  if (!ts) return "—";
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1)  return "Abhi abhi";
  if (diff < 60) return diff + " min pehle";
  return Math.floor(diff / 60) + " ghante pehle";
}
