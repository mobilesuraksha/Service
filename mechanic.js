let mechUser = null;
let mechDoc = null;
let pendingReqListener = null;
let activeJobsListener = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  mechUser = user;

  const snap = await db.collection("mechanics").doc(user.uid).get();

  if (!snap.exists) {
    alert("Mechanic profile nahi mila. Pehle register karein.");
    await auth.signOut();
    return;
  }

  mechDoc = snap.data();

  loadProfile();
  setupOnlineToggle();
  listenPendingRequests();
  listenActiveJobs();
});

function loadProfile() {
  document.getElementById("mechnicName").textContent =
    mechDoc.name || mechUser.displayName || "Mistri Dashboard";

  document.getElementById("mechName").textContent =
    mechDoc.name || "-";

  document.getElementById("mechPhone").textContent =
    mechDoc.phone || "-";

  document.getElementById("mechExp").textContent =
    mechDoc.experience || "0";

  document.getElementById("mechArea").textContent =
    mechDoc.serviceArea || "-";

  document.getElementById("totalJobs").textContent =
    mechDoc.totalJobs || 0;

  document.getElementById("mechRating").textContent =
    mechDoc.rating || 0;

  updateOnlineUI(mechDoc.isOnline === true);
}

function setupOnlineToggle() {
  const toggle = document.getElementById("onlineToggle");

  toggle.addEventListener("click", async () => {
    if (mechDoc.isApproved !== true) {
      alert("Admin approval pending hai.");
      return;
    }

    const newStatus = !(mechDoc.isOnline === true);

    await db.collection("mechanics").doc(mechUser.uid).update({
      isOnline: newStatus
    });

    mechDoc.isOnline = newStatus;
    updateOnlineUI(newStatus);
  });
}

function updateOnlineUI(isOnline) {
  const toggle = document.getElementById("onlineToggle");
  const statusText = document.getElementById("statusText");
  const onlineStatus = document.getElementById("onlineStatus");
  const statusMessage = document.getElementById("statusMessage");

  if (isOnline) {
    toggle.classList.add("active");
    statusText.textContent = "You are Online";
    onlineStatus.textContent = "🟢 Online";
    statusMessage.textContent = "Aapko ab pending requests mil sakti hain.";
  } else {
    toggle.classList.remove("active");
    statusText.textContent = "Click to go Online";
    onlineStatus.textContent = "🔴 Offline";
    statusMessage.textContent = "Online hone par hi requests dikhenगी.";
  }
}

function listenPendingRequests() {
  if (pendingReqListener) pendingReqListener();

  pendingReqListener = db.collection("requests")
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .onSnapshot((snap) => {
      const list = document.getElementById("pendingRequestsList");
      const countEl = document.getElementById("pendingCount");

      let html = "";
      let count = 0;

      snap.forEach((doc) => {
        const r = doc.data();

        if (mechDoc.isApproved !== true) return;
        if (mechDoc.isOnline !== true) return;

        count++;

        html += `
          <div style="border:1px solid #ddd; padding:12px; border-radius:10px; background:#fff;">
            <div style="font-weight:bold; font-size:16px;">${r.userName || "User"}</div>
            <div>📞 ${r.userPhone || "-"}</div>
            <div>🚗 Vehicle: ${r.vehicleType || "-"}</div>
            <div>🔧 Problem: ${r.problemType || "-"}</div>
            <div>📍 ${r.address || "Location available"}</div>

            ${
              r.locationLat && r.locationLng
                ? `<a href="https://maps.google.com/?q=${r.locationLat},${r.locationLng}" target="_blank">📍 Map खोलें</a>`
                : ""
            }

            <button onclick="acceptRequest('${doc.id}')"
              style="margin-top:10px; width:100%; padding:10px; background:#16A34A; color:white; border:none; border-radius:8px; font-weight:bold;">
              ✅ Accept Request
            </button>
          </div>
        `;
      });

      countEl.textContent = `(${count})`;

      if (count === 0) {
        list.innerHTML = `<p style="color:#999; text-align:center; padding:20px;">No pending requests</p>`;
      } else {
        list.innerHTML = html;
      }
    }, (err) => {
      console.error("Pending request error:", err);
      alert("Pending request error: " + err.message);
    });
}

async function acceptRequest(requestId) {
  try {
    if (mechDoc.isApproved !== true) {
      alert("Admin approval pending hai.");
      return;
    }

    if (mechDoc.isOnline !== true) {
      alert("Pehle online ho jaiye.");
      return;
    }

    await db.collection("requests").doc(requestId).update({
      status: "accepted",
      assignedMechanicId: mechUser.uid,
      mechanicName: mechDoc.name || mechUser.displayName || "",
      mechanicPhone: mechDoc.phone || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Request accepted ✅");
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

function listenActiveJobs() {
  if (activeJobsListener) activeJobsListener();

  activeJobsListener = db.collection("requests")
    .where("assignedMechanicId", "==", mechUser.uid)
    .where("status", "in", ["accepted", "ontheway", "started"])
    .onSnapshot((snap) => {
      const list = document.getElementById("activeJobsList");
      const countEl = document.getElementById("activeJobCount");

      let html = "";
      let count = 0;

      snap.forEach((doc) => {
        const r = doc.data();
        count++;

        html += `
          <div style="border:1px solid #ddd; padding:12px; border-radius:10px; background:#fff;">
            <div style="font-weight:bold;">${r.userName || "User"}</div>
            <div>📞 ${r.userPhone || "-"}</div>
            <div>🚗 ${r.vehicleType || "-"}</div>
            <div>🔧 ${r.problemType || "-"}</div>
            <div>Status: <b>${r.status}</b></div>

            <button onclick="updateJobStatus('${doc.id}', 'ontheway')">🚗 On The Way</button>
            <button onclick="updateJobStatus('${doc.id}', 'started')">🔧 Started</button>
            <button onclick="updateJobStatus('${doc.id}', 'completed')">✅ Completed</button>
          </div>
        `;
      });

      countEl.textContent = `(${count})`;

      if (count === 0) {
        list.innerHTML = `<p style="color:#999; text-align:center; padding:20px;">No active jobs</p>`;
      } else {
        list.innerHTML = html;
      }
    }, (err) => {
      console.error("Active job error:", err);
    });
}

async function updateJobStatus(requestId, status) {
  try {
    await db.collection("requests").doc(requestId).update({
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (status === "completed") {
      await db.collection("mechanics").doc(mechUser.uid).update({
        totalJobs: firebase.firestore.FieldValue.increment(1)
      });
    }

    alert("Status updated: " + status);
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

document.getElementById("logoutMechBtn").addEventListener("click", async () => {
  try {
    if (mechUser) {
      await db.collection("mechanics").doc(mechUser.uid).update({
        isOnline: false
      });
    }
    await auth.signOut();
    window.location.href = "index.html";
  } catch (e) {
    alert(e.message);
  }
});
