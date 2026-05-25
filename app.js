
// ============================================================
// app.js — 24x7 Vahan Sahayata — User App Logic
// ============================================================

// ── State ────────────────────────────────────────────────────
let currentUser   = null;
let userDoc       = null;
let selectedVehicle  = null;
let selectedProblem  = null;
let userLat = null, userLng = null;
let currentRatingRequestId  = null;
let currentRatingMechanicId = null;
let selectedRating = 0;
let deferredInstallPrompt = null;
let activeRequestListener = null;

// ── PWA Install ───────────────────────────────────────────────
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById("installBanner");
  if (banner) banner.style.display = "flex";
});

document.getElementById("installBtn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") showToast("App install ho gaya! 🎉", "success");
  deferredInstallPrompt = null;
  document.getElementById("installBanner").style.display = "none";
});

document.getElementById("dismissInstall")?.addEventListener("click", () => {
  document.getElementById("installBanner").style.display = "none";
});

// ── Service Worker Registration ───────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => console.log("[SW] Registered"))
      .catch((e) => console.warn("[SW] Registration failed:", e));
  });
}

// ── Auth State Observer ───────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await loadUserDoc(user);
    updateHeaderUI();
    // If mechanic, redirect to mechanic panel
    if (userDoc && userDoc.role === "mechanic") {
      window.location.href = "mechanic.html";
      return;
    }
    // If admin, redirect to admin panel
    if (ADMIN_EMAILS.includes(user.email)) {
      window.location.href = "admin.html";
      return;
    }
    loadStatusSection();
  } else {
    currentUser = null;
    userDoc = null;
    updateHeaderUI();
  }
});

/** Fetch or create user Firestore document */
async function loadUserDoc(user) {
  try {
    const ref = db.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (snap.exists) {
      userDoc = snap.data();
    } else {
      // New user — create doc
      const newDoc = {
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        phone: user.phoneNumber || "",
        photoURL: user.photoURL || "",
        role: "user",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(newDoc);
      userDoc = newDoc;
    }
  } catch (e) {
    console.error("loadUserDoc error:", e);
  }
}

/** Update header avatar and name label */
function updateHeaderUI() {
  const label = document.getElementById("userNameLabel");
  const icon  = document.getElementById("headerAvatarIcon");
  if (currentUser) {
    const name = (userDoc?.name || currentUser.displayName || "User").split(" ")[0];
    if (label) { label.textContent = name; label.style.display = "block"; }
    if (icon && currentUser.photoURL) {
      document.getElementById("headerAvatar").innerHTML = `<img src="${currentUser.photoURL}" alt="">`;
    } else if (icon) {
      icon.textContent = "👤";
    }
    populateProfile();
  } else {
    if (label) label.style.display = "none";
    if (icon) icon.textContent = "👤";
  }
}

// ── Section Navigation ────────────────────────────────────────
function showSection(name) {
  // Check auth for protected sections
  if (!currentUser && ["booking", "status", "profile"].includes(name)) {
    showToast("Pehle login karein", "warning");
    showSection("auth");
    return;
  }
  document.querySelectorAll(".app-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const sec = document.getElementById(`section-${name}`);
  const nav = document.getElementById(`nav-${name}`);
  if (sec) sec.classList.add("active");
  if (nav) nav.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "status") loadStatusSection();
  if (name === "profile") populateProfile();
}

/** Called when emergency button is tapped */
function handleEmergencyClick() {
  if (!currentUser) {
    showToast("Login karein phir booking karein", "warning");
    showSection("auth");
    return;
  }
  showSection("booking");
}

/** Pre-select a problem type from service cards on home */
function startBooking(problem) {
  if (!currentUser) {
    showToast("Pehle login karein", "warning");
    showSection("auth");
    return;
  }
  showSection("booking");
  // Pre-select the chip
  setTimeout(() => {
    const chip = document.querySelector(`[data-p="${problem}"]`);
    if (chip) { document.querySelectorAll(".chip").forEach(c => c.classList.remove("selected")); chip.classList.add("selected"); selectedProblem = problem; }
  }, 100);
}

// ── Auth ──────────────────────────────────────────────────────
function switchAuthTab(tab) {
  const isLogin = (tab === "login");
  document.getElementById("loginForm").style.display    = isLogin ? "" : "none";
  document.getElementById("registerForm").style.display = isLogin ? "none" : "";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabReg").classList.toggle("active", !isLogin);
}

async function signInWithGoogle() {
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    showToast("Login successful! 🎉", "success");
    showSection("home");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function emailLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPassword").value;
  if (!email || !pass) { showToast("Email aur password daalein", "warning"); return; }
  setLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showToast("Login successful! 🎉", "success");
    showSection("home");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function emailRegister() {
  const name  = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const pass  = document.getElementById("regPassword").value;
  if (!name || !email || !pass) { showToast("Saari fields bharein", "warning"); return; }
  if (pass.length < 6) { showToast("Password kam se kam 6 characters ka ho", "warning"); return; }
  setLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    // Save to Firestore
    await db.collection("users").doc(cred.user.uid).set({
      uid: cred.user.uid, name, email, phone,
      role: "user",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("Registration successful! 🎉", "success");
    showSection("home");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function signOutUser() {
  if (!confirm("Logout karna chahte hain?")) return;
  await auth.signOut();
  currentUser = null; userDoc = null;
  showToast("Logout ho gaye", "info");
  showSection("home");
}

// ── Booking ───────────────────────────────────────────────────
function selectVehicle(el) {
  document.querySelectorAll(".vehicle-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedVehicle = el.dataset.v;
}

function selectProblem(el) {
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedProblem = el.dataset.p;
}

async function getLocation() {
  const card = document.getElementById("locationCard");
  document.getElementById("locationText").textContent = "📡 Location detect ho raha hai...";
  try {
    const pos = await getCurrentLocation();
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    document.getElementById("locationText").textContent = "📍 Location Mili!";
    document.getElementById("locationCoords").textContent = `Lat: ${userLat.toFixed(4)}, Lng: ${userLng.toFixed(4)}`;
    card.style.borderColor = "var(--teal)";
    showToast("Location detect ho gayi ✅", "success");
  } catch (e) {
    document.getElementById("locationText").textContent = "❌ Location Nahi Mili";
    document.getElementById("locationCoords").textContent = "Permission den ya address manually bharein";
    showToast("Location permission den", "warning");
  }
}

function previewPhoto(input) {
  const prev = document.getElementById("photoPreview");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      prev.src = e.target.result;
      prev.style.display = "block";
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function submitRequest() {
  if (!currentUser) { showToast("Pehle login karein", "warning"); showSection("auth"); return; }
  if (!selectedVehicle) { showToast("Vehicle type chunein", "warning"); return; }
  if (!selectedProblem) { showToast("Problem type chunein", "warning"); return; }

  const phone   = document.getElementById("bookingPhone").value.trim() || userDoc?.phone || "";
  const address = document.getElementById("bookingAddress").value.trim();
  const desc    = document.getElementById("bookingDesc").value.trim();

  if (!phone) { showToast("Phone number daalein", "warning"); return; }
  if (!userLat && !address) { showToast("Location ya address daalein", "warning"); return; }

  setLoading(true);
  try {
    let photoUrl = "";
    const photoFile = document.getElementById("vehiclePhoto").files[0];
    if (photoFile) {
      const storageRef = storage.ref(`vehicle-photos/${currentUser.uid}/${Date.now()}_${photoFile.name}`);
      const snap = await storageRef.put(photoFile);
      photoUrl = await snap.ref.getDownloadURL();
    }

    const requestId = generateRequestId();
    await db.collection("requests").doc(requestId).set({
      requestId,
      userId:   currentUser.uid,
      userName: userDoc?.name || currentUser.displayName || "",
      userPhone: phone,
      vehicleType: selectedVehicle,
      problemType: selectedProblem,
      description: desc,
      photoUrl,
      locationLat: userLat || null,
      locationLng: userLng || null,
      address,
      status: "pending",
      assignedMechanicId: "",
      mechanicName: "",
      mechanicPhone: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast("Request bhej di gayi! Mistri jald aaega 🚗", "success");
    // Reset form
    selectedVehicle = null; selectedProblem = null;
    document.querySelectorAll(".vehicle-card,.chip").forEach(c => c.classList.remove("selected"));
    document.getElementById("bookingDesc").value = "";
    document.getElementById("bookingAddress").value = "";
    document.getElementById("bookingPhone").value = "";
    document.getElementById("photoPreview").style.display = "none";
    document.getElementById("vehiclePhoto").value = "";
    userLat = null; userLng = null;
    document.getElementById("locationText").textContent = "Location Detect Karein";
    document.getElementById("locationCoords").textContent = "GPS se current location lene ke liye click karein";

    showSection("status");
  } catch (e) {
    showToast("Error: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Status Section ────────────────────────────────────────────
function loadStatusSection() {
  if (!currentUser) return;
  const activeArea = document.getElementById("activeRequestArea");
  const histArea   = document.getElementById("requestHistoryArea");
  if (!activeArea || !histArea) return;

  activeArea.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>`;
  histArea.innerHTML = "";

  // Detach old listener
  if (activeRequestListener) { activeRequestListener(); activeRequestListener = null; }

  // Listen for all user requests
  activeRequestListener = db.collection("requests")
    .where("userId", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot((snap) => {
      const requests = [];
      snap.forEach(d => requests.push(d.data()));
      renderStatusCards(requests);
    }, (e) => {
      activeArea.innerHTML = `<div class="empty-state"><div class="es-icon">❌</div><h3>Error</h3><p>${e.message}</p></div>`;
    });
}

function renderStatusCards(requests) {
  const activeArea = document.getElementById("activeRequestArea");
  const histArea   = document.getElementById("requestHistoryArea");
  if (!activeArea || !histArea) return;

  const active = requests.filter(r => !["completed","cancelled"].includes(r.status));
  const history = requests.filter(r => ["completed","cancelled"].includes(r.status));

  // Active requests
  if (active.length === 0) {
    activeArea.innerHTML = `<div class="empty-state"><div class="es-icon">✅</div><h3>Koi Active Request Nahi</h3><p>Emergency booking karein, mistri turant aaega</p><button class="btn btn-danger" onclick="showSection('booking')" style="margin-top:12px">🆘 New Booking</button></div>`;
    document.getElementById("statusDot").style.display = "none";
  } else {
    document.getElementById("statusDot").style.display = "block";
    activeArea.innerHTML = active.map(r => buildActiveCard(r)).join("");
  }

  // History
  if (history.length > 0) {
    histArea.innerHTML = `<div class="section-title" style="margin-bottom:8px">📋 Past Requests</div>` + history.map(r => buildHistCard(r)).join("");
  }
}

function buildActiveCard(r) {
  const statuses = [
    { key: "pending",   label: "Request Bheja",       icon: "📤" },
    { key: "accepted",  label: "Mechanic Ne Accept Kiya", icon: "✅" },
    { key: "ontheway",  label: "Mistri Aa Raha Hai",  icon: "🚗" },
    { key: "started",   label: "Kaam Shuru",           icon: "🔧" },
    { key: "completed", label: "Kaam Pura",            icon: "🎉" },
  ];
  const si = statuses.findIndex(s => s.key === r.status);
  const timelineHtml = statuses.map((s, i) => `
    <div class="timeline-item ${i < si ? 'done' : (i === si ? 'active' : '')}">
      <div class="tl-dot">${s.icon}</div>
      <div class="tl-content">
        <div class="tl-title">${s.label}</div>
        ${i === si ? `<div class="tl-sub">Current status</div>` : ""}
      </div>
    </div>`).join("");

  const mechHtml = r.mechanicName ? `
    <div class="mechanic-card">
      <div class="mech-avatar">🔧</div>
      <div class="mech-info">
        <h4>${r.mechanicName}</h4>
        <div class="mech-meta">Aapka Mechanic • ${r.mechanicPhone || "—"}</div>
      </div>
      <div class="mech-actions">
        ${r.mechanicPhone ? `<a href="tel:${r.mechanicPhone}" class="btn btn-success btn-sm">📞</a>` : ""}
        ${r.mechanicPhone ? `<a href="https://wa.me/91${r.mechanicPhone}" target="_blank" class="btn btn-whatsapp btn-sm">💬</a>` : ""}
      </div>
    </div>` : "";

  const mapLink = r.locationLat ? `<a class="map-link" href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}" target="_blank">📍 Map Par Dekho</a>` : "";

  return `
    <div class="status-card fade-in">
      <div class="status-header">
        <div>
          <div class="request-id">${r.requestId}</div>
          <div style="font-family:var(--font-head);font-size:18px;font-weight:700;margin-top:4px">${vehicleEmoji(r.vehicleType)} ${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${formatDate(r.createdAt)}</div>
        </div>
        ${getStatusBadge(r.status)}
      </div>
      ${mechHtml}
      <div class="timeline">${timelineHtml}</div>
      ${mapLink}
      ${r.status === "completed" ? `<button class="btn btn-primary btn-full" style="margin-top:12px" onclick="openRating('${r.requestId}','${r.assignedMechanicId}','${r.mechanicName}')">⭐ Rate Service</button>` : ""}
      ${r.status === "pending" ? `<button class="btn btn-outline btn-full btn-sm" style="margin-top:12px" onclick="cancelRequest('${r.requestId}')">❌ Cancel Request</button>` : ""}
    </div>`;
}

function buildHistCard(r) {
  return `
    <div class="hist-card">
      <div class="hist-header">
        <div>
          <div class="hist-vehicle">${vehicleEmoji(r.vehicleType)} ${capitalize(r.vehicleType)} — ${capitalize(r.problemType)}</div>
          <div class="hist-problem">${r.mechanicName ? "Mechanic: " + r.mechanicName : "Mechanic assign nahi hua"}</div>
          <div class="hist-date">${formatDate(r.createdAt)}</div>
        </div>
        ${getStatusBadge(r.status)}
      </div>
    </div>`;
}

async function cancelRequest(requestId) {
  if (!confirm("Request cancel karna chahte hain?")) return;
  setLoading(true);
  try {
    await db.collection("requests").doc(requestId).update({ status: "cancelled", updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Request cancel ho gayi", "info");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Rating ────────────────────────────────────────────────────
function openRating(requestId, mechanicId, mechanicName) {
  currentRatingRequestId  = requestId;
  currentRatingMechanicId = mechanicId;
  selectedRating = 0;
  document.getElementById("ratingMechName").textContent = "Mechanic: " + mechanicName;
  document.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
  document.getElementById("reviewText").value = "";
  const m = document.getElementById("ratingModal");
  m.style.display = "flex";
}

function closeRating() {
  document.getElementById("ratingModal").style.display = "none";
}

function selectStar(n) {
  selectedRating = n;
  document.querySelectorAll(".star").forEach((s, i) => s.classList.toggle("active", i < n));
}

async function submitRating() {
  if (!selectedRating) { showToast("Rating dein", "warning"); return; }
  const review = document.getElementById("reviewText").value.trim();
  setLoading(true);
  try {
    await db.collection("reviews").add({
      userId: currentUser.uid,
      mechanicId: currentRatingMechanicId,
      requestId: currentRatingRequestId,
      rating: selectedRating,
      review,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Update mechanic's average rating
    const revSnap = await db.collection("reviews").where("mechanicId", "==", currentRatingMechanicId).get();
    let total = 0; let count = 0;
    revSnap.forEach(d => { total += d.data().rating; count++; });
    if (currentRatingMechanicId) {
      await db.collection("mechanics").doc(currentRatingMechanicId).update({ rating: (total / count).toFixed(1) });
    }
    closeRating();
    showToast("Rating dene ke liye shukriya! ⭐", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Profile ───────────────────────────────────────────────────
function populateProfile() {
  if (!currentUser) return;
  const name  = userDoc?.name || currentUser.displayName || "User";
  const email = userDoc?.email || currentUser.email || "";
  const phone = userDoc?.phone || "";
  const photo = userDoc?.photoURL || currentUser.photoURL || "";
  const joined = formatDate(userDoc?.createdAt);

  document.getElementById("profileName").textContent  = name;
  document.getElementById("profileEmail").textContent = email;
  document.getElementById("profilePhone").textContent = phone || "Add karein";
  document.getElementById("profileEmailRow").textContent = email;
  document.getElementById("profileJoined").textContent   = joined;

  const avatarEl = document.getElementById("profileAvatar");
  if (photo) {
    avatarEl.innerHTML = `<img src="${photo}" alt="">`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
    avatarEl.style.fontSize = "40px";
    avatarEl.style.background = "linear-gradient(135deg,var(--emergency),var(--accent))";
  }
}

async function editPhone() {
  const phone = prompt("New phone number daalein:");
  if (!phone) return;
  setLoading(true);
  try {
    await db.collection("users").doc(currentUser.uid).update({ phone });
    userDoc.phone = phone;
    populateProfile();
    showToast("Phone update ho gaya ✅", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Contact / Feedback ────────────────────────────────────────
async function submitFeedback() {
  const text = document.getElementById("feedbackText").value.trim();
  if (!text) { showToast("Feedback likhein", "warning"); return; }
  setLoading(true);
  try {
    await db.collection("feedback").add({
      userId: currentUser?.uid || "anonymous",
      userName: userDoc?.name || "Anonymous",
      text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("feedbackText").value = "";
    showToast("Feedback mil gaya, shukriya! 🙏", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

// ── Utility ───────────────────────────────────────────────────
function vehicleEmoji(v) {
  const map = { bike:"🏍️", car:"🚗", tempo:"🚐", loading:"🚚", tractor:"🚜", truck:"🛻", auto:"🛺", other:"🚘" };
  return map[v] || "🚘";
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Handle hash-based deep link (e.g. index.html#booking)
window.addEventListener("load", () => {
  const hash = window.location.hash.replace("#", "");
  if (hash && ["booking","status","contact","profile"].includes(hash)) {
    showSection(hash);
  }
});
