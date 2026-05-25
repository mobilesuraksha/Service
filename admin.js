// ==================== GLOBAL STATE ====================
let currentAdmin = null;
let adminName = "Admin";
let allUsers = [];
let allMechanics = [];
let allRequests = [];
let dashboardStats = {};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Admin app initialized');

    // Check if user is logged in and is admin
    firebase.onAuthChange(async (user) => {
        if (user) {
            const ADMIN_EMAILS = [
                "admin@vahanshayata.com",
                "vahanshayata@gmail.com"
            ];

            if (!ADMIN_EMAILS.includes(user.email)) {
                alert('You are not authorized to access admin panel');
                window.location.href = 'index.html';
                return;
            }

            currentAdmin = user;
            adminName = user.displayName || user.email;
            document.getElementById('adminName').textContent = adminName;

            setupEventListeners();
            loadDashboard();
        } else {
            window.location.href = 'index.html';
        }
    });
});

// ==================== EVENT LISTENERS ====================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Menu navigation
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page) {
                showAdminPage(page);
            }
        });
    });

    // Logout
    document.getElementById('logoutAdminBtn').addEventListener('click', async () => {
        const result = await firebase.logoutUser();
        if (result.success) {
            showToast('Logged out successfully', 'success');
            window.location.href = 'index.html';
        }
    });

    // Search functionality
    document.getElementById('usersSearch').addEventListener('input', filterUsersTable);
    document.getElementById('mechsSearch').addEventListener('input', filterMechsTable);
    document.getElementById('requestsSearch').addEventListener('input', filterRequestsTable);
}

/**
 * Show admin page
 */
function showAdminPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.admin-page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const page = document.getElementById(pageId + 'Page');
    if (page) {
        page.classList.add('active');
        document.getElementById('pageTitle').textContent = getPageTitle(pageId);
    }

    // Update sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });

    // Load page data
    if (pageId === 'users') {
        loadUsersTable();
    } else if (pageId === 'mechanics') {
        loadMechsTable();
    } else if (pageId === 'requests') {
        loadRequestsTable();
    } else if (pageId === 'analytics') {
        // Analytics page
    }
}

/**
 * Get page title
 */
function getPageTitle(pageId) {
    const titles = {
        'dashboard': '📊 Dashboard',
        'users': '👥 Users',
        'mechanics': '🔧 Mechanics',
        'requests': '📋 Requests',
        'analytics': '📈 Analytics'
    };
    return titles[pageId] || 'Admin Panel';
}

// ==================== DASHBOARD ====================

/**
 * Load dashboard
 */
async function loadDashboard() {
    showLoading(true);

    // Get stats
    const statsResult = await firebase.getDashboardStats();
    if (statsResult.success) {
        dashboardStats = statsResult.data;
        updateDashboardStats();
    }

    // Load data
    await Promise.all([
        loadAllUsers(),
        loadAllMechanics(),
        loadAllRequests()
    ]);

    showLoading(false);
}

/**
 * Update dashboard stats
 */
function updateDashboardStats() {
    document.getElementById('totalUsersAdm').textContent = dashboardStats.totalUsers || 0;
    document.getElementById('totalMechsAdm').textContent = dashboardStats.totalMechanics || 0;
    document.getElementById('approvedMechsAdm').textContent = dashboardStats.approvedMechanics || 0;
    document.getElementById('pendingReqsAdm').textContent = dashboardStats.pendingRequests || 0;

    // Show recent requests
    const recentRequests = allRequests.slice(0, 5);
    const recentHTML = recentRequests.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 10px;">
            ${recentRequests.map(req => `
                <div style="padding: 10px; background: #F3F4F6; border-radius: 6px;">
                    <strong>${req.vehicleType} - ${req.problemType}</strong><br>
                    <small style="color: #666;">${req.userName} | ${formatDate(req.createdAt.toDate())}</small><br>
                    <small style="color: #999;">${req.status}</small>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color: #999;">No requests yet</p>';
    document.getElementById('recentRequestsAdm').innerHTML = recentHTML;

    // Show pending approvals
    const pendingMechs = allMechanics.filter(m => !m.isApproved).slice(0, 5);
    const pendingHTML = pendingMechs.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 10px;">
            ${pendingMechs.map(mech => `
                <div style="padding: 10px; background: #FEF3C7; border-radius: 6px;">
                    <strong>${mech.name}</strong><br>
                    <small style="color: #666;">${mech.serviceArea}</small><br>
                    <div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button class="action-btn approve-btn" onclick="approveMechanic('${mech.uid}')">Approve</button>
                        <button class="action-btn reject-btn" onclick="rejectMechanic('${mech.uid}')">Reject</button>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color: #999;">No pending approvals</p>';
    document.getElementById('pendingApprovalsAdm').innerHTML = pendingHTML;
}

// ==================== USERS MANAGEMENT ====================

/**
 * Load all users
 */
async function loadAllUsers() {
    const result = await firebase.getAllUsers();
    if (result.success) {
        allUsers = result.data;
        loadUsersTable();
    }
}

/**
 * Load users table
 */
function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No users found</td></tr>';
        return;
    }

    allUsers.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${user.name}</strong></td>
            <td>${user.email}</td>
            <td>${user.phone || '-'}</td>
            <td>${formatDate(user.createdAt.toDate())}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewUserDetails('${user.uid}')">View</button>
                    <button class="action-btn delete-btn" onclick="deleteUserAdmin('${user.uid}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Filter users table
 */
function filterUsersTable() {
    const searchTerm = document.getElementById('usersSearch').value.toLowerCase();
    const filtered = allUsers.filter(user => 
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
    );

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No users found</td></tr>';
        return;
    }

    filtered.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${user.name}</strong></td>
            <td>${user.email}</td>
            <td>${user.phone || '-'}</td>
            <td>${formatDate(user.createdAt.toDate())}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewUserDetails('${user.uid}')">View</button>
                    <button class="action-btn delete-btn" onclick="deleteUserAdmin('${user.uid}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * View user details
 */
function viewUserDetails(userId) {
    const user = allUsers.find(u => u.uid === userId);
    if (user) {
        const details = `
👤 Name: ${user.name}
📧 Email: ${user.email}
📞 Phone: ${user.phone || 'N/A'}
📅 Joined: ${formatDate(user.createdAt.toDate())}
        `;
        alert(details);
    }
}

/**
 * Delete user
 */
async function deleteUserAdmin(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    showLoading(true);
    const result = await firebase.deleteUser(userId);

    if (result.success) {
        allUsers = allUsers.filter(u => u.uid !== userId);
        loadUsersTable();
        showToast('User deleted successfully', 'success');
    } else {
        showToast('Failed to delete user: ' + result.error, 'error');
    }

    showLoading(false);
}

// ==================== MECHANICS MANAGEMENT ====================

/**
 * Load all mechanics
 */
async function loadAllMechanics() {
    const result = await firebase.getAllMechanics();
    if (result.success) {
        allMechanics = result.data;
        loadMechsTable();
    }
}

/**
 * Load mechanics table
 */
function loadMechsTable() {
    const tbody = document.getElementById('mechsTableBody');
    tbody.innerHTML = '';

    if (allMechanics.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No mechanics found</td></tr>';
        return;
    }

    allMechanics.forEach(mech => {
        const row = document.createElement('tr');
        const approvalStatus = mech.isApproved ? 
            '<span class="status-badge status-approved">✅ Approved</span>' :
            '<span class="status-badge status-pending">⏳ Pending</span>';
        const onlineStatus = mech.isOnline ? 
            '<span class="status-badge status-online">🟢 Online</span>' :
            '<span class="status-badge status-offline">🔴 Offline</span>';

        row.innerHTML = `
            <td><strong>${mech.name}</strong></td>
            <td>${mech.phone}</td>
            <td>${mech.serviceArea}</td>
            <td>${mech.experience} yrs</td>
            <td>${approvalStatus}</td>
            <td>${(mech.rating || 0).toFixed(1)}⭐</td>
            <td>
                <div class="action-buttons">
                    ${!mech.isApproved ? `
                        <button class="action-btn approve-btn" onclick="approveMechanic('${mech.uid}')">Approve</button>
                    ` : ''}
                    <button class="action-btn delete-btn" onclick="deleteMechanicAdmin('${mech.uid}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Filter mechanics table
 */
function filterMechsTable() {
    const searchTerm = document.getElementById('mechsSearch').value.toLowerCase();
    const filtered = allMechanics.filter(mech => 
        mech.name.toLowerCase().includes(searchTerm) ||
        mech.serviceArea.toLowerCase().includes(searchTerm)
    );

    const tbody = document.getElementById('mechsTableBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No mechanics found</td></tr>';
        return;
    }

    filtered.forEach(mech => {
        const row = document.createElement('tr');
        const approvalStatus = mech.isApproved ? 
            '<span class="status-badge status-approved">✅ Approved</span>' :
            '<span class="status-badge status-pending">⏳ Pending</span>';

        row.innerHTML = `
            <td><strong>${mech.name}</strong></td>
            <td>${mech.phone}</td>
            <td>${mech.serviceArea}</td>
            <td>${mech.experience} yrs</td>
            <td>${approvalStatus}</td>
            <td>${(mech.rating || 0).toFixed(1)}⭐</td>
            <td>
                <div class="action-buttons">
                    ${!mech.isApproved ? `
                        <button class="action-btn approve-btn" onclick="approveMechanic('${mech.uid}')">Approve</button>
                    ` : ''}
                    <button class="action-btn delete-btn" onclick="deleteMechanicAdmin('${mech.uid}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Approve mechanic
 */
async function approveMechanic(mechanicId) {
    showLoading(true);
    const result = await firebase.approveMechanic(mechanicId);

    if (result.success) {
        const mech = allMechanics.find(m => m.uid === mechanicId);
        if (mech) {
            mech.isApproved = true;
        }
        loadMechsTable();
        updateDashboardStats();
        showToast('Mechanic approved successfully', 'success');
    } else {
        showToast('Failed to approve mechanic: ' + result.error, 'error');
    }

    showLoading(false);
}

/**
 * Reject mechanic
 */
async function rejectMechanic(mechanicId) {
    if (!confirm('Are you sure you want to reject this mechanic?')) return;

    showLoading(true);
    const result = await firebase.rejectMechanic(mechanicId);

    if (result.success) {
        const mech = allMechanics.find(m => m.uid === mechanicId);
        if (mech) {
            mech.isApproved = false;
        }
        loadMechsTable();
        updateDashboardStats();
        showToast('Mechanic rejected', 'info');
    } else {
        showToast('Failed to reject mechanic: ' + result.error, 'error');
    }

    showLoading(false);
}

/**
 * Delete mechanic
 */
async function deleteMechanicAdmin(mechanicId) {
    if (!confirm('Are you sure you want to delete this mechanic?')) return;

    showLoading(true);
    const result = await firebase.deleteMechanic(mechanicId);

    if (result.success) {
        allMechanics = allMechanics.filter(m => m.uid !== mechanicId);
        loadMechsTable();
        showToast('Mechanic deleted successfully', 'success');
    } else {
        showToast('Failed to delete mechanic: ' + result.error, 'error');
    }

    showLoading(false);
}

// ==================== REQUESTS MANAGEMENT ====================

/**
 * Load all requests
 */
async function loadAllRequests() {
    const result = await firebase.getAllRequests();
    if (result.success) {
        allRequests = result.data;
        loadRequestsTable();
    }
}

/**
 * Load requests table
 */
function loadRequestsTable() {
    const tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = '';

    if (allRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No requests found</td></tr>';
        return;
    }

    allRequests.forEach(req => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><small>${req.requestId}</small></td>
            <td>${req.vehicleType}</td>
            <td>${req.userName}</td>
            <td><span class="status-badge status-${getStatusClass(req.status)}">${req.status}</span></td>
            <td>${req.mechanicName || '-'}</td>
            <td><small>${formatDate(req.createdAt.toDate())}</small></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewRequestDetails('${req.requestId}')">View</button>
                    <button class="action-btn delete-btn" onclick="deleteRequestAdmin('${req.requestId}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Filter requests table
 */
function filterRequestsTable() {
    const searchTerm = document.getElementById('requestsSearch').value.toLowerCase();
    const filtered = allRequests.filter(req => 
        req.requestId.toLowerCase().includes(searchTerm) ||
        req.userName.toLowerCase().includes(searchTerm) ||
        req.vehicleType.toLowerCase().includes(searchTerm)
    );

    const tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No requests found</td></tr>';
        return;
    }

    filtered.forEach(req => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><small>${req.requestId}</small></td>
            <td>${req.vehicleType}</td>
            <td>${req.userName}</td>
            <td><span class="status-badge status-${getStatusClass(req.status)}">${req.status}</span></td>
            <td>${req.mechanicName || '-'}</td>
            <td><small>${formatDate(req.createdAt.toDate())}</small></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewRequestDetails('${req.requestId}')">View</button>
                    <button class="action-btn delete-btn" onclick="deleteRequestAdmin('${req.requestId}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * View request details
 */
function viewRequestDetails(requestId) {
    const req = allRequests.find(r => r.requestId === requestId);
    if (req) {
        const details = `
🚗 Vehicle: ${req.vehicleType}
⚙️ Problem: ${req.problemType}
👤 Customer: ${req.userName}
📞 Phone: ${req.userPhone}
📍 Address: ${req.address}
${req.landmark ? '🏢 Landmark: ' + req.landmark + '\n' : ''}
📝 Description: ${req.description}
📊 Status: ${req.status}
🔧 Mechanic: ${req.mechanicName || 'Not assigned'}
📅 Created: ${formatDate(req.createdAt.toDate())}
        `;
        alert(details);
    }
}

/**
 * Delete request
 */
async function deleteRequestAdmin(requestId) {
    if (!confirm('Are you sure you want to delete this request?')) return;

    showLoading(true);
    const result = await firebase.deleteRequest(requestId);

    if (result.success) {
        allRequests = allRequests.filter(r => r.requestId !== requestId);
        loadRequestsTable();
        showToast('Request deleted successfully', 'success');
    } else {
        showToast('Failed to delete request: ' + result.error, 'error');
    }

    showLoading(false);
}

/**
 * Get status class for badge
 */
function getStatusClass(status) {
    const map = {
        'Pending': 'pending',
        'Accepted': 'accepted',
        'Mechanic On The Way': 'on-way',
        'Work Started': 'started',
        'Completed': 'completed',
        'Cancelled': 'cancelled'
    };
    return map[status] || 'pending';
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

/**
 * Format date
 */
function formatDate(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

console.log('Admin app loaded successfully!');
