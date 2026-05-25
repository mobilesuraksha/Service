// ==================== GLOBAL STATE ====================
let currentMechanic = null;
let mechanicProfile = null;
let isOnline = false;
let selectedRequests = {};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Mechanic app initialized');
    
    // Check if user is logged in
    firebase.onAuthChange(async (user) => {
        if (user) {
            const profile = await firebase.getMechanicProfile(user.uid);
            if (profile.success) {
                currentMechanic = user;
                mechanicProfile = profile.data;
                
                // Check if approved
                if (!mechanicProfile.isApproved) {
                    alert('Your profile is not approved yet. Redirecting to home.');
                    window.location.href = 'index.html';
                    return;
                }
                
                loadMechanicDashboard();
                setupEventListeners();
            } else {
                window.location.href = 'index.html';
            }
        } else {
            window.location.href = 'index.html';
        }
    });
});

// ==================== UI SETUP ====================

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Online toggle
    document.getElementById('onlineToggle').addEventListener('click', toggleOnlineStatus);

    // Logout
    document.getElementById('logoutMechBtn').addEventListener('click', async () => {
        const result = await firebase.logoutUser();
        if (result.success) {
            showToast('Logged out successfully', 'success');
            window.location.href = 'index.html';
        }
    });

    // Refresh every 5 seconds
    setInterval(() => {
        if (isOnline) {
            loadPendingRequests();
            loadActiveJobs();
            updateLocation();
        }
    }, 5000);
}

/**
 * Load mechanic dashboard
 */
async function loadMechanicDashboard() {
    // Load profile info
    document.getElementById('mechnicName').textContent = mechanicProfile.name;
    document.getElementById('mechName').textContent = mechanicProfile.name;
    document.getElementById('mechPhone').textContent = mechanicProfile.phone;
    document.getElementById('mechExp').textContent = mechanicProfile.experience;
    document.getElementById('mechArea').textContent = mechanicProfile.serviceArea;
    document.getElementById('mechRating').textContent = (mechanicProfile.rating || 0).toFixed(1);

    // Update online status
    isOnline = mechanicProfile.isOnline || false;
    updateOnlineUI();

    // Load requests and jobs
    loadPendingRequests();
    loadActiveJobs();
}

/**
 * Toggle online status
 */
async function toggleOnlineStatus() {
    showLoading(true);
    isOnline = !isOnline;

    const result = await firebase.updateMechanicStatus(currentMechanic.uid, isOnline);

    if (result.success) {
        mechanicProfile.isOnline = isOnline;
        updateOnlineUI();
        showToast(
            isOnline ? 'You are now Online! 🟢' : 'You are now Offline 🔴',
            'success'
        );
    } else {
        isOnline = !isOnline; // Revert
        showToast('Failed to update status', 'error');
    }

    showLoading(false);
}

/**
 * Update online UI
 */
function updateOnlineUI() {
    const toggle = document.getElementById('onlineToggle');
    const status = document.getElementById('onlineStatus');
    const statusText = document.getElementById('statusText');
    const message = document.getElementById('statusMessage');

    if (isOnline) {
        toggle.classList.add('active');
        status.textContent = '🟢 Online';
        statusText.textContent = 'You are Online - Receiving requests';
        message.textContent = 'You will receive notifications when a customer requests service in your area.';
        message.style.color = '#16A34A';
    } else {
        toggle.classList.remove('active');
        status.textContent = '🔴 Offline';
        statusText.textContent = 'You are Offline';
        message.textContent = 'Go Online to start receiving requests';
        message.style.color = '#DC2626';
    }
}

// ==================== REQUEST MANAGEMENT ====================

/**
 * Load pending requests
 */
async function loadPendingRequests() {
    if (!isOnline) {
        document.getElementById('pendingRequestsList').innerHTML = 
            '<p style="color: #999; text-align: center; padding: 20px;">Go Online to see pending requests</p>';
        return;
    }

    const result = await firebase.getPendingRequests(mechanicProfile.serviceArea);

    if (result.success && result.data.length > 0) {
        const requestsList = document.getElementById('pendingRequestsList');
        requestsList.innerHTML = '';
        
        result.data.forEach((request, index) => {
            const distance = calculateDistance(
                mechanicProfile.location?.lat || 0,
                mechanicProfile.location?.lng || 0,
                request.locationLat,
                request.locationLng
            );

            const card = document.createElement('div');
            card.style.cssText = `
                padding: 12px;
                border: 2px solid #DC2626;
                border-radius: 8px;
                background: #FEE2E2;
                cursor: pointer;
                transition: all 0.2s;
            `;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <strong style="color: #DC2626;">${request.vehicleType}</strong><br>
                        <small style="color: #666;">${request.problemType}</small>
                    </div>
                    <span style="background: #DC2626; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        NEW
                    </span>
                </div>
                <p style="margin: 8px 0; font-size: 13px; color: #333;">${request.description.substring(0, 50)}...</p>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    📍 ${distance.toFixed(1)} km away
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button class="btn btn-small btn-primary" onclick="acceptRequest('${request.requestId}')">
                        ✅ Accept
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="viewRequestDetails('${request.requestId}')">
                        👁️ View
                    </button>
                </div>
            `;
            requestsList.appendChild(card);
        });

        document.getElementById('pendingCount').textContent = `(${result.data.length})`;
    } else {
        document.getElementById('pendingRequestsList').innerHTML = 
            '<p style="color: #999; text-align: center; padding: 20px;">No pending requests nearby</p>';
        document.getElementById('pendingCount').textContent = '(0)';
    }
}

/**
 * Load active jobs
 */
async function loadActiveJobs() {
    const result = await firebase.getMechanicRequests(currentMechanic.uid);

    if (result.success && result.data.length > 0) {
        const jobsList = document.getElementById('activeJobsList');
        jobsList.innerHTML = '';
        
        const activeJobs = result.data.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
        
        activeJobs.forEach((job) => {
            const statusColors = {
                'Accepted': '#2563EB',
                'Mechanic On The Way': '#8B5CF6',
                'Work Started': '#F59E0B'
            };

            const card = document.createElement('div');
            card.style.cssText = `
                padding: 12px;
                border-left: 4px solid ${statusColors[job.status] || '#999'};
                background: #F3F4F6;
                border-radius: 8px;
            `;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <strong>${job.vehicleType} - ${job.problemType}</strong><br>
                        <small style="color: #666;">${job.userName}</small>
                    </div>
                    <span style="background: ${statusColors[job.status]}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
                        ${job.status}
                    </span>
                </div>
                <p style="margin: 8px 0; font-size: 13px; color: #333;">📍 ${job.address}</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-small btn-primary" onclick="window.location.href='tel:${job.userPhone}'">
                        📞 Call Customer
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="updateJobStatus('${job.requestId}')">
                        ⏭️ Next Status
                    </button>
                </div>
            `;
            jobsList.appendChild(card);
        });

        document.getElementById('activeJobCount').textContent = `(${activeJobs.length})`;
    } else {
        document.getElementById('activeJobsList').innerHTML = 
            '<p style="color: #999; text-align: center; padding: 20px;">No active jobs</p>';
        document.getElementById('activeJobCount').textContent = '(0)';
    }
}

/**
 * Accept request
 */
async function acceptRequest(requestId) {
    showLoading(true);

    const result = await firebase.acceptRequest(
        requestId,
        currentMechanic.uid,
        mechanicProfile.name,
        mechanicProfile.phone
    );

    if (result.success) {
        showToast('Request accepted! Customer will be notified. ✅', 'success');
        loadPendingRequests();
        loadActiveJobs();
    } else {
        showToast('Failed to accept request: ' + result.error, 'error');
    }

    showLoading(false);
}

/**
 * View request details
 */
async function viewRequestDetails(requestId) {
    const result = await firebase.getRequest(requestId);

    if (result.success) {
        const req = result.data;
        const details = `
🚗 Vehicle: ${req.vehicleType}
⚙️ Problem: ${req.problemType}
📍 Location: ${req.address}
${req.landmark ? '🏢 Landmark: ' + req.landmark + '\n' : ''}
📝 Details: ${req.description}
📞 Customer: ${req.userName} (${req.userPhone})
        `;
        alert(details);
    }
}

/**
 * Update job status
 */
async function updateJobStatus(requestId) {
    const result = await firebase.getRequest(requestId);
    
    if (result.success) {
        const statuses = ['Accepted', 'Mechanic On The Way', 'Work Started', 'Completed'];
        const currentStatus = result.data.status;
        const currentIndex = statuses.indexOf(currentStatus);
        const nextStatus = statuses[currentIndex + 1];

        if (nextStatus) {
            showLoading(true);
            
            const updateResult = await firebase.updateRequestStatus(
                requestId,
                nextStatus
            );

            if (updateResult.success) {
                showToast(`Status updated to: ${nextStatus} ✅`, 'success');
                loadActiveJobs();
                loadPendingRequests();
            } else {
                showToast('Failed to update status', 'error');
            }

            showLoading(false);
        } else {
            showToast('This job is already completed', 'info');
        }
    }
}

// ==================== LOCATION & DISTANCE ====================

/**
 * Update mechanic location
 */
async function updateLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            await firebase.updateMechanicLocation(
                currentMechanic.uid,
                position.coords.latitude,
                position.coords.longitude
            );
        },
        (error) => {
            console.log('Location error:', error);
        }
    );
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Show toast
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Show loading
 */
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.classList.add('show');
    } else {
        spinner.classList.remove('show');
    }
}

console.log('Mechanic app loaded successfully!');
