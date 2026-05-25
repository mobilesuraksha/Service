// ============================================================
// mechanic.js — 24x7 Vahan Sahayata — Mechanic Dashboard Logic
// ============================================================

// ── State ────────────────────────────────────────────────────
let mechUser     = null;
let mechDoc      = null;
let selectedSpecs = [];
let pendingReqListener   = null;
let myActiveReqListener  = null;

// ── Auth Observer ─────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    mechUser = user;
    const snap = await db.collection("mechanics").doc(user.uid).get();
    if (snap.exists) {
      mechDoc = snap.data();
      showMechDashboard();
    }
    // If it's an admin, redirect
    if (ADMIN_EMAILS.includes(user.email)) {
      window.location.href = "admin.html";
    }
  } else {
    mechUser = null;
    mechDoc  = null;
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
  listenPendingRequests();
  listenMyActiveRequest();
  checkApprovalStatus();
}

// ── Auth UI toggle ────────────────────────────────────────────
function switchMechTab(tab) {
  const isLogin = (tab === "login");
  document.getElementById("mechLoginForm").style.display  = isLogin ? "" : "none";
  document.getElementById("mechRegForm").style.display    = isLogin ? "none" : "";
  document.getElementById("mTabLogin").classList.toggle("active",  isLogin);
  document.getElementById("mTabReg").classList.toggle("active", !isLogin);
  if (!isLogin) { goToStep(1); }
}

// ── Registration steps ────────────────────────────────────────
function goToStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`regStep${i}`);
    if (el) el.style.display = (i === n) ? "" : "none";
    const dot = document.getElementById(`step${i}dot`);
    if (dot) {
      dot.classList.remove("active", "done");
      if (i < n)  dot.classList.add("done");
      if (i === n) dot.classList.add("active");
    }
  });
  if (n === 2) {
    const name  = document.getElementById("mRegName").value.trim();
    const phone = document.getElementById("mRegPhone").value.trim();
    const email = document.getElementById("mRegEmail").value.trim();
    const pass  = document.getElementById("mRegPass").value;
    if (!name || !phone || !email || !pass) {
      showToast("Saare fields bharein", "warning");
      goToStep(1); return;
    }
    if (pass.length < 6) {
      showToast("Password min 6 characters chahiye", "warning");
      goToStep(1); return;
    }
  }
  if (n === 3) {
    const exp  = document.getElementById("mRegExp").value;
    const area = document.getElementById("mRegArea").value.trim();
    if (!exp || !area) {
      showToast("Experience aur service area daalein", "warning");
      goToStep(2); return;
    }
    if (selectedSpecs.length === 0) {
      showToast("Kam se kam ek vehicle specialization chunein", "warning");
      goToStep(2); return;
    }
  }
}

function toggleSpec(el, val) {
  const cb = el.querySelector("input[type=checkbox]");
  const isSelected = selectedSpecs.includes(val);
  if (isSelected) {
    selectedSpecs = selectedSpecs.filter(s => s !== val);
    cb.checked = false;
    el.classList.remove("selected");
  } else {
    selectedSpecs.push(val);
    cb.checked = true;
    el.classList.add("selected");
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

// ── Google Login ──────────────────────────────────────────────
async function mechGoogleLogin() {
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;

    // Check if mechanic doc exists, if not create new profile
    const snap = await db.collection("mechanics").doc(user.uid).get();
    if (!snap.exists) {
      await db.collection("mechanics").doc(user.uid).set({
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
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast("Registered! Profile complete karein", "success");
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
    showToast("Login successful!", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function completeMechRegistration() {
  const name  = document.getElementById("mRegName").value.trim();
  const phone = document.getElementById("mRegPhone").value.trim();
  const email = document.getElementById("mRegEmail").value.trim();
  const pass  = document.getElementById("mRegPass").value;
  const exp   = document.getElementById("mRegExp").value;
  const area  = document.getElementById("mRegArea").value.trim();
  const aadhaar = document.getElementById("mRegAadhaar").value.trim();

  setLoading(true);
  try {
    // Create Firebase Auth user
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });

    let photoURL = "";
    const photoFile = document.getElementById("mechPhoto").files[0];
    if (photoFile) {
      const ref = storage.ref(`mechanic-photos/${cred.user.uid}/${Date.now()}`);
      const snap = await ref.put(photoFile);
      photoURL = await snap.ref.getDownloadURL();
    }

    // Save mechanic doc to Firestore
    await db.collection("mechanics").doc(cred.user.uid).set({
      uid: cred.user.uid,
      name, email, phone,
      experience: exp,
      vehicleTypes: selectedSpecs,
      serviceArea: area,
      aadhaar: aadhaar || "",
      photoURL,
      isApproved: null,   // null = pending
      isOnline: false,
      rating: null,
      totalJobs: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Also create a user-role doc so they're recognized in users collection
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
  // Go offline before signing out
  if (mechUser && mechDoc) {
    await db.collection("mechanics").doc(mechUser.uid).update({ isOnline: false }).catch(() => {});
  }
  await auth.signOut();
  showMechAuth();
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
  if (!mechDoc?.isApproved) {
    showToast("Admin approval ka wait karein", "warning");
    document.getElementById("onlineToggle").checked = false;
    return;
  }
  try {
    await db.collection("mechanics").doc(mechUser.uid).update({ isOnline });
    mechDoc.isOnline = isOnline;
    document.getElementById("onlineStatusLabel").textContent =
      isOnline ? "🟢 Online — requests mil rahe hain" : "⚫ Offline — requests nahi milenge";
    document.getElementById("mechOnlineDot").style.background =
      isOnline ? "var(--success-lt)" : "var(--text-dim)";
    showToast(isOnline ? "Aap online hain! 🟢" : "Aap offline ho gaye", isOnline ? "success" : "info");
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ── Approval Status ───────────────────────────────────────────
function checkApprovalStatus() {
  if (!mechDoc) return;
  const banner = document.getElementById("pendingApprovalBanner");
  if (mechDoc.isApproved === null || mechDoc.isApproved === undefined) {
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }
  if (mechDoc.isApproved === false) {
    banner.style.background = "#EF444415";
    banner.style.borderColor = "#EF444440";
    banner.innerHTML = `<div style="font-weight:700;color:var(--emergency)">❌ Application Rejected</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Aapka application reject ho gaya. Support se contact karein.</div>`;
  }
  // Set online toggle state
  document.getElementById("onlineToggle").checked = mechDoc.isOnline || false;
  document.getElementById("onlineStatusLabel").textContent =
    mechDoc.isOnline ? "🟢 Online — requests mil rahe hain" : "⚫ Offline — requests nahi milenge";
  document.getElementById("mechOnlineDot").style.background =
    mechDoc.isOnline ? "var(--success-lt)" : "var(--text-dim)";
}

// ── Listen Pending Requests (real-time) ───────────────────────
function listenPendingRequests() {
  if (pendingReqListener) pendingReqListener();

  if (!mechUser) return;

  pendingReqListener = db.collection("requests")
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .onSnapshot((snap) => {

      const reqs = [];

      snap.forEach(doc => {
        const r = doc.data();

        // Mechanic approved + online hona chahiye
        if (!mechDoc?.isApproved || !mechDoc?.isOnline) return;

        // requestId save karo
        r.requestId = doc.id;

        reqs.push(r);
      });

      renderPendingRequests(reqs);

      // Dono ID support
      const el1 = document.getElementById("mStatPending");
      const el2 = document.getElementById("pendingCount");

      if (el1) el1.textContent = reqs.length;
      if (el2) el2.textContent = "(" + reqs.length + ")";

    }, (e) => {
      console.error("listenPendingRequests:", e);
    });
}

// ── Accept a Request ──────────────────────────────────────────
async function acceptRequest(requestId) {
  if (!mechDoc?.isApproved) {
    showToast("Admin approval ka wait karein", "warning");
    return;
  }

  if (!mechDoc?.isOnline) {
    showToast("Pehle online ho jayein", "warning");
    return;
  }

  setLoading(true);

  try {
    await db.collection("requests").doc(requestId).update({
      status: "accepted",
      assignedMechanicId: mechUser.uid,
      mechanicName: mechDoc.name || "",
      mechanicPhone: mechDoc.phone || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast("Request accept ho gayi ✅", "success");

  } catch (e) {
    console.error(e);
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Listen My Active Request ──────────────────────────────────
function listenMyActiveRequest() {
  if (myActiveReqListener) myActiveReqListener();
  if (!mechUser) return;

  myActiveReqListener = db.collection("requests")
    .where("assignedMechanicId", "==", mechUser.uid)
    .where("status", "in", ["accepted", "ontheway", "started"])
    .limit(1)
    .onSnapshot((snap) => {
      const section = document.getElementById("myActiveRequestSection");
      if (snap.empty) { section.style.display = "none"; return; }
      section.style.display = "block";
      const r = snap.docs[0].data();
      renderMyActiveRequest(r);
    });
}

function renderMyActiveRequest(r) {
  const card = document.getElementById("myActiveRequestCard");
  card.innerHTML = `
    <div class="status-card" style="border-color:var(--primary-lt)">
      <div style="font-family:var(--font-head);font-size:18px;font-weight:700;margin-bottom:8px">
        ${vehicleEmoji(r.vehicleType)} ${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}
      </div>
      <div style="font-size:14px;margin-bottom:4px">👤 ${r.userName}</div>
      <div style="font-size:14px;color:var(--text-muted);margin-bottom:12px">📞 ${r.userPhone}</div>
      ${r.address ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">📍 ${r.address}</div>` : ""}
      ${r.locationLat ? `<a class="map-link" href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}" target="_blank" style="margin-bottom:14px;display:inline-flex">📍 Customer Location Dekho</a>` : ""}
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <a href="tel:${r.userPhone}" class="btn btn-success" style="flex:1">📞 Call</a>
        <a href="https://wa.me/91${r.userPhone}" target="_blank" class="btn btn-whatsapp" style="flex:1">💬 WhatsApp</a>
      </div>
      <div class="section-title" style="font-size:14px;margin-bottom:8px">Status Update Karein:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${r.status !== "ontheway" ? `<button class="btn btn-primary btn-sm" onclick="updateMyStatus('${r.requestId}','ontheway')">🚗 Aa Raha Hoon</button>` : ""}
        ${r.status !== "started"  ? `<button class="btn btn-primary btn-sm" onclick="updateMyStatus('${r.requestId}','started')">🔧 Kaam Shuru</button>` : ""}
        <button class="btn btn-success btn-sm" onclick="updateMyStatus('${r.requestId}','completed')">✅ Complete</button>
      </div>
    </div>`;
}

async function updateMyStatus(requestId, status) {
  setLoading(true);
  try {
    const update = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (status === "completed") {
      // Increment mechanic totalJobs
      await db.collection("mechanics").doc(mechUser.uid).update({
        totalJobs: firebase.firestore.FieldValue.increment(1)
      });
    }
    await db.collection("requests").doc(requestId).update(update);
    showToast(`Status updated: ${status}`, "success");
  } catch (e) {
    showToast(e.message, "error");
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
    document.getElementById("mStatCompleted").textContent = count;
    document.getElementById("totalJobs").textContent = count;
    // Estimated earning (₹300 per job average)
    document.getElementById("todayEarning").textContent = (count * 300).toLocaleString("en-IN");
    if (mechDoc?.rating) {
      document.getElementById("mechRating").textContent = mechDoc.rating;
    }
  } catch (e) {
    console.error("loadMechStats:", e);
  }
}

// ── Completed Jobs ────────────────────────────────────────────
async function loadCompletedJobs() {
  const container = document.getElementById("completedJobsList");
  container.innerHTML = "Loading...";
  try {
    const snap = await db.collection("requests")
      .where("assignedMechanicId", "==", mechUser.uid)
      .where("status", "==", "completed")
      .orderBy("updatedAt", "desc")
      .limit(20)
      .get();
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="es-icon">📋</div><h3>Abhi koi job nahi</h3></div>`;
      return;
    }
    let html = "";
    snap.forEach(d => {
      const r = d.data();
      html += `
        <div class="completed-job-card fade-in">
          <div class="job-icon">${vehicleEmoji(r.vehicleType)}</div>
          <div class="job-info">
            <h4>${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}</h4>
            <p>${r.userName} • ${formatDate(r.updatedAt)}</p>
          </div>
          <div class="job-earning">₹300</div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><h3>Error: ${e.message}</h3></div>`;
  }
}

// ── Populate Profile ─────────────────────────────────────────
function populateMechProfile() {
  if (!mechUser || !mechDoc) return;
  const name = mechDoc.name || mechUser.displayName || "Mechanic";
  document.getElementById("mechHeaderName").textContent = name;
  document.getElementById("mechProfileName").textContent  = name;
  document.getElementById("mechProfileEmail").textContent = mechDoc.email || mechUser.email || "";
  document.getElementById("mProfPhone").textContent  = mechDoc.phone    || "—";
  document.getElementById("mProfArea").textContent   = mechDoc.serviceArea || "—";
  document.getElementById("mProfExp").textContent    = mechDoc.experience  ? mechDoc.experience + " saal" : "—";
  document.getElementById("mProfSpec").textContent   = mechDoc.vehicleTypes?.join(", ") || "—";
  document.getElementById("mProfRating").textContent = mechDoc.rating ? `⭐ ${mechDoc.rating}` : "Abhi koi rating nahi";

  const appr = mechDoc.isApproved;
  const apprEl = document.getElementById("mProfApproval");
  if (appr === true)  apprEl.innerHTML = `<span class="badge-approved">✅ Approved</span>`;
  else if (appr === false) apprEl.innerHTML = `<span class="badge-rejected">❌ Rejected</span>`;
  else apprEl.innerHTML = `<span class="badge-pending">⏳ Pending</span>`;

  const photo = mechDoc.photoURL || mechUser.photoURL;
  const avatar = document.getElementById("mechProfileAvatar");
  if (photo) {
    avatar.innerHTML = `<img src="${photo}" alt="">`;
  } else {
    avatar.textContent = name.charAt(0).toUpperCase();
    avatar.style.fontSize = "40px";
    avatar.style.background = "linear-gradient(135deg,var(--primary),var(--primary-lt))";
  }
}

async function updateMechProfile() {
  const area = document.getElementById("mUpdateArea").value.trim();
  if (!area) { showToast("Area likhein", "warning"); return; }
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
  const map = { bike:"🏍️", car:"🚗", tempo:"🚐", loading:"🚚", tractor:"🚜", truck:"🛻", auto:"🛺", other:"🚘" };
  return map[v] || "🚘";
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "Abhi";
  if (diff < 60) return diff + " min pehle";
  return Math.floor(diff / 60) + " ghante pehle";
}
