// ==================== GLOBAL STATE ====================
let currentUser = null;
let userProfile = null;
let currentLocation = { lat: null, lng: null };
let deferredPrompt = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initialized');
    
    // Setup event listeners
    setupEventListeners();
    
    // Check auth state
    firebase.onAuthChange(async (user) => {
        if (user) {
            currentUser = user;
            const profile = await firebase.getUserProfile(user.uid);
            if (profile.success) {
                userProfile = profile.data;
                showPage('home');
                loadDashboardStats();
                showToast(`Welcome back, ${userProfile.name}! 👋`, 'success');
            }
        } else {
            currentUser = null;
            userProfile = null;
            showPage('home');
        }
    });

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('installPrompt').classList.add('show');
    });

    // Load stats on home page
    loadDashboardStats();
});

// ==================== PAGE NAVIGATION ====================

/**
 * Show specific page
 */
function showPage(pageId) {
    // Check authentication
    const protectedPages = ['status', 'booking', 'profile'];
    if (protectedPages.includes(pageId) && !currentUser) {
        showPage('login');
        return;
    }

    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const page = document.getElementById(pageId + 'Page');
    if (page) {
        page.classList.add('active');
        
        // Load page-specific data
        if (pageId === 'status') {
            loadUserRequests();
        } else if (pageId === 'profile') {
            loadUserProfile();
        }
    }

    // Update bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });

    // Scroll to top
    window.scrollTo(0, 0);
}

/**
 * Setup navigation event listeners
 */
function setupEventListeners() {
    // Bottom navigation
    document.querySelectorAll('.nav-item, .action-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pageId = btn.dataset.page || btn.dataset.action;
            if (pageId) {
                showPage(pageId);
            }
        });
    });

    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pageId = btn.dataset.page || 'home';
            showPage(pageId);
        });
    });

    // Page navigation links
    document.querySelectorAll('[data-page]').forEach(link => {
        if (!link.classList.contains('nav-item') && !link.classList.contains('action-card')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.dataset.page;
                if (pageId) {
                    showPage(pageId);
                }
            });
        }
    });

    // Emergency button
    document.getElementById('emergencyBtn').addEventListener('click', () => {
        if (currentUser) {
            showPage('booking');
        } else {
            showPage('login');
            showToast('Please login first to book emergency service', 'warning');
        }
    });

    // Profile button in header
    document.getElementById('profileBtn').addEventListener('click', () => {
        if (currentUser) {
            showPage('profile');
        } else {
            showPage('login');
        }
    });

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        const result = await firebase.logoutUser();
        if (result.success) {
            showToast('Logged out successfully', 'success');
            currentUser = null;
            userProfile = null;
            showPage('home');
        } else {
            showToast('Logout failed: ' + result.error, 'error');
        }
    });

    // Install button
    document.getElementById('installBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choiceResult = await deferredPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                showToast('App installing... 🚀', 'success');
            }
            deferredPrompt = null;
            document.getElementById('installPrompt').classList.remove('show');
        }
    });

    document.getElementById('dismissBtn').addEventListener('click', () => {
        document.getElementById('installPrompt').classList.remove('show');
    });

    // ==================== LOGIN FORM ====================
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const result = await firebase.loginUser(email, password);
        
        if (result.success) {
            showToast('Login successful! 🎉', 'success');
            showPage('home');
            document.getElementById('loginForm').reset();
        } else {
            showToast('Login failed: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // Google Login
    document.getElementById('googleLoginBtn').addEventListener('click', async () => {
        showLoading(true);
        const result = await firebase.googleAuth('user');
        
        if (result.success) {
            showToast('Login successful! 🎉', 'success');
            showPage('home');
        } else {
            showToast('Login failed: ' + result.error, 'error');
        }
        
        showLoading(false);
    });

    // ==================== REGISTER FORM ====================
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const phone = document.getElementById('regPhone').value;
        const password = document.getElementById('regPassword').value;

        const result = await firebase.registerUser(email, password, name, phone);
        
        if (result.success) {
            showToast('Registration successful! 🎉', 'success');
            setTimeout(() => {
                showPage('login');
                document.getElementById('registerForm').reset();
            }, 1000);
        } else {
            showToast('Registration failed: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // Google Register
    document.getElementById('googleRegisterBtn').addEventListener('click', async () => {
        showLoading(true);
        const result = await firebase.googleAuth('user');
        
        if (result.success) {
            showToast('Registration successful! 🎉', 'success');
            showPage('home');
        } else {
            showToast('Registration failed: ' + result.error, 'error');
        }
        
        showLoading(false);
    });

    // ==================== BOOKING FORM ====================
    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        if (!currentLocation.lat || !currentLocation.lng) {
            showToast('Please enable location before submitting', 'error');
            showLoading(false);
            return;
        }

        const vehicleType = document.querySelector('input[name="vehicleType"]:checked').value;
        const problemType = document.querySelector('input[name="problemType"]:checked').value;
        const description = document.getElementById('description').value;
        const address = document.getElementById('address').value;
        const landmark = document.getElementById('landmark').value;
        const phone = document.getElementById('phoneNumber').value;
        const photoFile = document.getElementById('vehiclePhoto').files[0];

        let photoUrl = "";
        if (photoFile) {
            const uploadResult = await firebase.uploadVehiclePhoto(
                photoFile,
                currentUser.uid,
                `${Date.now()}`
            );
            if (uploadResult.success) {
                photoUrl = uploadResult.url;
            }
        }

        const requestData = {
            userId: currentUser.uid,
            userName: userProfile.name,
            userPhone: phone,
            vehicleType: vehicleType,
            problemType: problemType,
            description: description,
            photoUrl: photoUrl,
            locationLat: currentLocation.lat,
            locationLng: currentLocation.lng,
            address: address,
            landmark: landmark
        };

        const result = await firebase.submitEmergencyRequest(requestData);

        if (result.success) {
            showToast('Request submitted successfully! 🚗', 'success');
            document.getElementById('bookingForm').reset();
            document.getElementById('locationDisplay').style.display = 'none';
            document.getElementById('photoPreview').style.display = 'none';
            setTimeout(() => {
                showPage('status');
            }, 1500);
        } else {
            showToast('Failed to submit request: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // Get Location Button
    document.getElementById('getLocationBtn').addEventListener('click', () => {
        if (navigator.geolocation) {
            showLoading(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    currentLocation.lat = position.coords.latitude;
                    currentLocation.lng = position.coords.longitude;
                    
                    document.getElementById('locationDisplay').style.display = 'block';
                    document.getElementById('locationText').textContent = 
                        `📍 ${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`;
                    
                    showToast('Location captured! 📍', 'success');
                    showLoading(false);
                },
                (error) => {
                    showToast('Failed to get location: ' + error.message, 'error');
                    showLoading(false);
                }
            );
        } else {
            showToast('Geolocation not supported', 'error');
        }
    });

    // Photo Preview
    document.getElementById('vehiclePhoto').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('previewImage').src = event.target.result;
                document.getElementById('photoPreview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // ==================== MECHANIC LOGIN ====================
    document.getElementById('mechanicLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        const email = document.getElementById('mechLoginEmail').value;
        const password = document.getElementById('mechLoginPassword').value;

        const result = await firebase.loginUser(email, password);
        
        if (result.success) {
            const mechProfile = await firebase.getMechanicProfile(result.uid);
            if (mechProfile.success) {
                if (!mechProfile.data.isApproved) {
                    showToast('Your profile is pending approval', 'warning');
                    showLoading(false);
                    return;
                }
                window.location.href = 'mechanic.html';
            } else {
                showToast('Mechanic profile not found', 'error');
            }
        } else {
            showToast('Login failed: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // Mechanic Google Login
    document.getElementById('mechanicGoogleLoginBtn').addEventListener('click', async () => {
        showLoading(true);
        const result = await firebase.googleAuth('mechanic');
        
        if (result.success) {
            const mechProfile = await firebase.getMechanicProfile(result.uid);
            if (mechProfile.success) {
                if (!mechProfile.data.isApproved) {
                    showToast('Your profile is pending approval', 'warning');
                    showLoading(false);
                    return;
                }
                window.location.href = 'mechanic.html';
            }
        } else {
            showToast('Login failed: ' + result.error, 'error');
        }
        
        showLoading(false);
    });

    // ==================== MECHANIC REGISTER ====================
    document.getElementById('mechanicRegisterForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        const name = document.getElementById('mechName').value;
        const email = document.getElementById('mechEmail').value;
        const phone = document.getElementById('mechPhone').value;
        const experience = document.getElementById('mechExperience').value;
        const serviceArea = document.getElementById('mechServiceArea').value;
        const password = document.getElementById('mechPassword').value;
        
        const vehicleTypes = Array.from(document.querySelectorAll('input[name="vehicleTypes"]:checked'))
            .map(input => input.value);

        if (vehicleTypes.length === 0) {
            showToast('Please select at least one vehicle type', 'warning');
            showLoading(false);
            return;
        }

        const result = await firebase.registerMechanic(
            email,
            password,
            name,
            phone,
            experience,
            serviceArea,
            vehicleTypes
        );
        
        if (result.success) {
            showToast('Registration successful! Admin approval pending. 🔄', 'success');
            setTimeout(() => {
                showPage('mechanic-login');
                document.getElementById('mechanicRegisterForm').reset();
            }, 1500);
        } else {
            showToast('Registration failed: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // Mechanic Google Register
    document.getElementById('mechanicGoogleRegisterBtn').addEventListener('click', async () => {
        showLoading(true);
        // Show a form to collect additional mechanic details
        showToast('Complete your mechanic profile after login', 'info');
        showLoading(false);
    });

    // ==================== ADMIN LOGIN ====================
    document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);

        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;

        const result = await firebase.adminLogin(email, password);
        
        if (result.success) {
            showToast('Admin login successful! 🔐', 'success');
            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 500);
        } else {
            showToast('Admin login failed: ' + result.error, 'error');
        }

        showLoading(false);
    });

    // ==================== SUPPORT BUTTONS ====================
    document.getElementById('whatsappBtn').addEventListener('click', () => {
        const phone = "+919876543210";
        const message = "Hi! I need help with vehicle repair service.";
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    });

    document.getElementById('whatsappSupportBtn').addEventListener('click', () => {
        const phone = "+919876543210";
        const message = "Hi! I need support with my request.";
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    });

    document.getElementById('callSupportBtn').addEventListener('click', () => {
        window.location.href = 'tel:+919876543210';
    });

    document.getElementById('emailSupportBtn').addEventListener('click', () => {
        window.location.href = 'mailto:support@vahanshayata.com';
    });

    // FAQ Toggle
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = btn.parentElement;
            const answer = item.querySelector('.faq-answer');
            
            // Close other FAQs
            document.querySelectorAll('.faq-item').forEach(faqItem => {
                if (faqItem !== item) {
                    faqItem.classList.remove('active');
                    faqItem.querySelector('.faq-answer').style.display = 'none';
                }
            });
            
            // Toggle current
            item.classList.toggle('active');
            answer.style.display = answer.style.display === 'none' ? 'block' : 'none';
        });
    });
}

// ==================== DATA LOADING ====================

/**
 * Load user requests
 */
async function loadUserRequests() {
    if (!currentUser) return;

    const result = await firebase.getUserRequests(currentUser.uid);
    const requestsList = document.getElementById('requestsList');
    const noRequestsMsg = document.getElementById('noRequestsMsg');

    requestsList.innerHTML = '';

    if (result.success && result.data.length > 0) {
        noRequestsMsg.style.display = 'none';
        
        result.data.forEach(request => {
            const statusColor = getStatusColor(request.status);
            const requestCard = document.createElement('div');
            requestCard.className = 'request-card';
            requestCard.innerHTML = `
                <div class="request-header">
                    <h3 class="request-title">${request.vehicleType} - ${request.problemType}</h3>
                    <span class="request-status ${statusColor}">${request.status}</span>
                </div>
                <div class="request-details">
                    <div class="detail-item">
                        <span class="detail-label">📍 Location</span>
                        <span class="detail-value">${request.address}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">⏰ Time</span>
                        <span class="detail-value">${formatDate(request.createdAt.toDate())}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">🔧 Mechanic</span>
                        <span class="detail-value">${request.mechanicName || 'Awaiting...'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">📞 Mechanic</span>
                        <span class="detail-value">${request.mechanicPhone || '-'}</span>
                    </div>
                </div>
                <p style="color: #666; font-size: 14px; margin-bottom: 12px;">${request.description}</p>
                <div class="request-actions">
                    ${request.mechanicPhone ? `
                        <button class="btn btn-small btn-primary" onclick="window.location.href='tel:${request.mechanicPhone}'">
                            📞 Call Mechanic
                        </button>
                    ` : '<button class="btn btn-small btn-secondary" disabled>No Mechanic Yet</button>'}
                    ${request.status === 'Completed' ? `
                        <button class="btn btn-small btn-secondary" onclick="showReviewForm('${request.requestId}', '${request.assignedMechanicId}')">
                            ⭐ Rate & Review
                        </button>
                    ` : `
                        <button class="btn btn-small btn-secondary" onclick="updateRequestLocation('${request.requestId}')">
                            📍 Share Location
                        </button>
                    `}
                </div>
            `;
            requestsList.appendChild(requestCard);
        });
    } else {
        requestsList.innerHTML = '';
        noRequestsMsg.style.display = 'block';
    }
}

/**
 * Load user profile
 */
async function loadUserProfile() {
    if (!currentUser) return;

    const profile = await firebase.getUserProfile(currentUser.uid);
    
    if (profile.success) {
        userProfile = profile.data;
        
        document.getElementById('profileName').textContent = userProfile.name;
        document.getElementById('profileEmail').textContent = userProfile.email;
        document.getElementById('profilePhone').textContent = userProfile.phone || '-';
        document.getElementById('profileEmailInfo').textContent = userProfile.email;
        document.getElementById('profileCreatedAt').textContent = formatDate(userProfile.createdAt.toDate());

        // Load stats
        const requests = await firebase.getUserRequests(currentUser.uid);
        if (requests.success) {
            const total = requests.data.length;
            const completed = requests.data.filter(r => r.status === 'Completed').length;
            
            document.getElementById('totalRequests').textContent = total;
            document.getElementById('completedRequests').textContent = completed;
            
            // Calculate average rating
            let avgRating = 0;
            if (requests.data.length > 0) {
                const ratings = requests.data
                    .filter(r => r.rating)
                    .map(r => r.rating);
                if (ratings.length > 0) {
                    avgRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
                }
            }
            document.getElementById('avgRating').textContent = avgRating || '0';
        }
    }
}

/**
 * Load dashboard stats
 */
async function loadDashboardStats() {
    // Note: In a real app, you'd fetch from Firestore aggregates
    // For now, just show placeholder stats
    const userCount = Math.floor(Math.random() * 1000) + 500;
    const mechanicCount = Math.floor(Math.random() * 100) + 50;
    
    document.getElementById('statsUsers').textContent = userCount;
    document.getElementById('statsMechanics').textContent = mechanicCount;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Show toast notification
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
 * Show loading spinner
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
 * Get status color class
 */
function getStatusColor(status) {
    const colors = {
        'Pending': 'status-pending',
        'Accepted': 'status-accepted',
        'Mechanic On The Way': 'status-on-way',
        'Work Started': 'status-started',
        'Completed': 'status-completed',
        'Cancelled': 'status-cancelled'
    };
    return colors[status] || 'status-pending';
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

/**
 * Show review form (placeholder)
 */
function showReviewForm(requestId, mechanicId) {
    const rating = prompt('Rate the service (1-5):');
    if (rating && rating >= 1 && rating <= 5) {
        const review = prompt('Write your review:');
        if (review) {
            submitReviewForm(requestId, mechanicId, rating, review);
        }
    }
}

/**
 * Submit review
 */
async function submitReviewForm(requestId, mechanicId, rating, review) {
    if (!currentUser) return;
    
    showLoading(true);
    const result = await firebase.submitReview(
        currentUser.uid,
        mechanicId,
        requestId,
        rating,
        review
    );
    
    if (result.success) {
        showToast('Thank you for your review! ⭐', 'success');
        loadUserRequests();
    } else {
        showToast('Failed to submit review: ' + result.error, 'error');
    }
    
    showLoading(false);
}

/**
 * Update request location
 */
async function updateRequestLocation(requestId) {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }

    showLoading(true);
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            // Share location with mechanic (in real app)
            showToast('Location shared with mechanic! 📍', 'success');
            showLoading(false);
        },
        (error) => {
            showToast('Failed to get location: ' + error.message, 'error');
            showLoading(false);
        }
    );
}

console.log('App loaded successfully!');
