

// ============================================================
// firebase.js — Firebase Initialization & Shared Utilities
// 24x7 Vahan Sahayata
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBfSfeiOmyBSyYBTV87OKH6IqFU0YXemw0",
  authDomain: "ayur-620e7.firebaseapp.com",
  projectId: "ayur-620e7",
  storageBucket: "ayur-620e7.firebasestorage.app",
  messagingSenderId: "732502202884",
  appId: "1:732502202884:web:18ff4c790235049d743351",
  measurementId: "G-395G8H08YV"
};

// Initialize Firebase (guard against double-init)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Shared service references
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// Admin whitelist — add real admin email(s) here
const ADMIN_EMAILS = [
  "admin@vahansahayata.com",
  "vahansahayata24x7@gmail.com"
];

// ── Helpers ──────────────────────────────────────────────────

/** Show a floating toast notification */
function showToast(msg, type = "info") {
  const existing = document.querySelector(".vs-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = `vs-toast vs-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("vs-toast--show"), 10);
  setTimeout(() => { t.classList.remove("vs-toast--show"); setTimeout(() => t.remove(), 400); }, 3500);
}

/** Show/hide a full-page loading overlay */
function setLoading(show) {
  let overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  overlay.style.display = show ? "flex" : "none";
}

/** Get user's current geolocation as a Promise */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0
    });
  });
}

/** Generate a short readable request ID */
function generateRequestId() {
  return "VS" + Date.now().toString(36).toUpperCase();
}

/** Format Firestore timestamp or JS Date to readable string */
function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Status badge color map */
const STATUS_CONFIG = {
  pending:    { label: "Pending ⏳",         color: "#F59E0B" },
  accepted:   { label: "Accepted ✅",         color: "#3B82F6" },
  ontheway:   { label: "Mistri On The Way 🚗", color: "#8B5CF6" },
  started:    { label: "Kaam Shuru 🔧",        color: "#06B6D4" },
  completed:  { label: "Completed ✅",         color: "#10B981" },
  cancelled:  { label: "Cancelled ❌",         color: "#EF4444" },
};

function getStatusBadge(status) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "#6B7280" };
  return `<span class="status-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}55">${cfg.label}</span>`;
}
