// ==================== FIREBASE INITIALIZATION ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBfSfeiOmyBSyYBTV87OKH6IqFU0YXemw0",
    authDomain: "ayur-620e7.firebaseapp.com",
    projectId: "ayur-620e7",
    storageBucket: "ayur-620e7.firebasestorage.app",
    messagingSenderId: "732502202884",
    appId: "1:732502202884:web:18ff4c790235049d743351",
    measurementId: "G-395G8H08YV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// Admin emails list
const ADMIN_EMAILS = [
    "admin@vahanshayata.com",
    "vahanshayata@gmail.com"
];

// ==================== AUTH FUNCTIONS ====================

/**
 * Register new user
 */
async function registerUser(email, password, name, phone) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Save user data to Firestore
        await setDoc(doc(db, "users", uid), {
            uid: uid,
            name: name,
            email: email,
            phone: phone,
            role: "user",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        return { success: true, uid: uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Login user with email and password
 */
async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, uid: userCredential.user.uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Google Login/Register
 */
async function googleAuth(userType = "user") {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const uid = user.uid;

        // Check if user exists
        const userDoc = await getDoc(doc(db, userType + "s", uid));

        if (!userDoc.exists()) {
            // New user - create profile
            if (userType === "user") {
                await setDoc(doc(db, "users", uid), {
                    uid: uid,
                    name: user.displayName || "User",
                    email: user.email,
                    phone: "",
                    role: "user",
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
            } else if (userType === "mechanic") {
                await setDoc(doc(db, "mechanics", uid), {
                    uid: uid,
                    name: user.displayName || "Mechanic",
                    email: user.email,
                    phone: "",
                    experience: 0,
                    vehicleTypes: [],
                    serviceArea: "",
                    isApproved: false,
                    isOnline: false,
                    rating: 0,
                    reviews: 0,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
            }
        }

        return { success: true, uid: uid, isNewUser: !userDoc.exists() };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Register mechanic
 */
async function registerMechanic(email, password, name, phone, experience, serviceArea, vehicleTypes) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await setDoc(doc(db, "mechanics", uid), {
            uid: uid,
            name: name,
            email: email,
            phone: phone,
            experience: parseInt(experience),
            vehicleTypes: vehicleTypes,
            serviceArea: serviceArea,
            isApproved: false,
            isOnline: false,
            rating: 0,
            reviews: 0,
            location: { lat: 0, lng: 0 },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        return { success: true, uid: uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Admin login (email verification)
 */
async function adminLogin(email, password) {
    try {
        // Check if email is in admin list
        if (!ADMIN_EMAILS.includes(email)) {
            return { success: false, error: "Unauthorized admin email" };
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, uid: userCredential.user.uid, role: "admin" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Logout user
 */
async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get current user from Auth state
 */
function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Monitor auth state changes
 */
function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// ==================== USER FUNCTIONS ====================

/**
 * Get user profile
 */
async function getUserProfile(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return { success: true, data: userDoc.data() };
        }
        return { success: false, error: "User not found" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update user profile
 */
async function updateUserProfile(uid, updates) {
    try {
        updates.updatedAt = Timestamp.now();
        await updateDoc(doc(db, "users", uid), updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Submit emergency request
 */
async function submitEmergencyRequest(requestData) {
    try {
        const requestId = `REQ-${Date.now()}`;
        
        await setDoc(doc(db, "requests", requestId), {
            requestId: requestId,
            userId: requestData.userId,
            userName: requestData.userName,
            userPhone: requestData.userPhone,
            vehicleType: requestData.vehicleType,
            problemType: requestData.problemType,
            description: requestData.description,
            photoUrl: requestData.photoUrl || "",
            locationLat: requestData.locationLat,
            locationLng: requestData.locationLng,
            address: requestData.address,
            landmark: requestData.landmark || "",
            status: "Pending", // Pending, Accepted, Mechanic On The Way, Work Started, Completed, Cancelled
            assignedMechanicId: "",
            mechanicName: "",
            mechanicPhone: "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        return { success: true, requestId: requestId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get user's requests
 */
async function getUserRequests(userId) {
    try {
        const q = query(
            collection(db, "requests"),
            where("userId", "==", userId),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const requests = [];
        snapshot.forEach(doc => {
            requests.push(doc.data());
        });
        return { success: true, data: requests };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get single request
 */
async function getRequest(requestId) {
    try {
        const reqDoc = await getDoc(doc(db, "requests", requestId));
        if (reqDoc.exists()) {
            return { success: true, data: reqDoc.data() };
        }
        return { success: false, error: "Request not found" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update request status
 */
async function updateRequestStatus(requestId, status, mechanicId = "", mechanicName = "", mechanicPhone = "") {
    try {
        const updates = {
            status: status,
            updatedAt: Timestamp.now()
        };
        
        if (mechanicId) {
            updates.assignedMechanicId = mechanicId;
            updates.mechanicName = mechanicName;
            updates.mechanicPhone = mechanicPhone;
        }

        await updateDoc(doc(db, "requests", requestId), updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Submit review for completed request
 */
async function submitReview(userId, mechanicId, requestId, rating, review) {
    try {
        const reviewId = `REV-${Date.now()}`;
        
        await setDoc(doc(db, "reviews", reviewId), {
            userId: userId,
            mechanicId: mechanicId,
            requestId: requestId,
            rating: parseInt(rating),
            review: review,
            createdAt: Timestamp.now()
        });

        // Update mechanic rating
        const mechanicDoc = await getDoc(doc(db, "mechanics", mechanicId));
        if (mechanicDoc.exists()) {
            const mechData = mechanicDoc.data();
            const totalReviews = mechData.reviews || 0;
            const currentRating = mechData.rating || 0;
            
            const newRating = ((currentRating * totalReviews) + parseInt(rating)) / (totalReviews + 1);
            
            await updateDoc(doc(db, "mechanics", mechanicId), {
                rating: newRating,
                reviews: totalReviews + 1
            });
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== MECHANIC FUNCTIONS ====================

/**
 * Get mechanic profile
 */
async function getMechanicProfile(uid) {
    try {
        const mechDoc = await getDoc(doc(db, "mechanics", uid));
        if (mechDoc.exists()) {
            return { success: true, data: mechDoc.data() };
        }
        return { success: false, error: "Mechanic not found" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update mechanic profile
 */
async function updateMechanicProfile(uid, updates) {
    try {
        updates.updatedAt = Timestamp.now();
        await updateDoc(doc(db, "mechanics", uid), updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get pending requests for mechanic's service area
 */
async function getPendingRequests(serviceArea) {
    try {
        const q = query(
            collection(db, "requests"),
            where("status", "==", "Pending"),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const requests = [];
        
        snapshot.forEach(doc => {
            requests.push(doc.data());
        });

        // Filter by distance (simplified - same city)
        const filtered = requests.filter(req => {
            // In production, use proper distance calculation with Google Maps API
            return true;
        });

        return { success: true, data: filtered };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get mechanic's accepted requests
 */
async function getMechanicRequests(mechanicId) {
    try {
        const q = query(
            collection(db, "requests"),
            where("assignedMechanicId", "==", mechanicId),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const requests = [];
        
        snapshot.forEach(doc => {
            requests.push(doc.data());
        });

        return { success: true, data: requests };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Accept request
 */
async function acceptRequest(requestId, mechanicId, mechanicName, mechanicPhone) {
    try {
        await updateDoc(doc(db, "requests", requestId), {
            assignedMechanicId: mechanicId,
            mechanicName: mechanicName,
            mechanicPhone: mechanicPhone,
            status: "Accepted",
            updatedAt: Timestamp.now()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update mechanic online status
 */
async function updateMechanicStatus(mechanicId, isOnline) {
    try {
        await updateDoc(doc(db, "mechanics", mechanicId), {
            isOnline: isOnline,
            updatedAt: Timestamp.now()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update mechanic location
 */
async function updateMechanicLocation(mechanicId, lat, lng) {
    try {
        await updateDoc(doc(db, "mechanics", mechanicId), {
            location: { lat: lat, lng: lng },
            updatedAt: Timestamp.now()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== ADMIN FUNCTIONS ====================

/**
 * Get all users
 */
async function getAllUsers() {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const users = [];
        snapshot.forEach(doc => {
            users.push(doc.data());
        });
        return { success: true, data: users };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get all mechanics
 */
async function getAllMechanics() {
    try {
        const snapshot = await getDocs(collection(db, "mechanics"));
        const mechanics = [];
        snapshot.forEach(doc => {
            mechanics.push(doc.data());
        });
        return { success: true, data: mechanics };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get all requests
 */
async function getAllRequests() {
    try {
        const q = query(
            collection(db, "requests"),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const requests = [];
        snapshot.forEach(doc => {
            requests.push(doc.data());
        });
        return { success: true, data: requests };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Approve mechanic
 */
async function approveMechanic(mechanicId) {
    try {
        await updateDoc(doc(db, "mechanics", mechanicId), {
            isApproved: true,
            updatedAt: Timestamp.now()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Reject mechanic
 */
async function rejectMechanic(mechanicId) {
    try {
        await updateDoc(doc(db, "mechanics", mechanicId), {
            isApproved: false,
            updatedAt: Timestamp.now()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete user
 */
async function deleteUser(userId) {
    try {
        await deleteDoc(doc(db, "users", userId));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete mechanic
 */
async function deleteMechanic(mechanicId) {
    try {
        await deleteDoc(doc(db, "mechanics", mechanicId));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete request
 */
async function deleteRequest(requestId) {
    try {
        await deleteDoc(doc(db, "requests", requestId));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get dashboard stats
 */
async function getDashboardStats() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const mechsSnap = await getDocs(collection(db, "mechanics"));
        const requestsSnap = await getDocs(collection(db, "requests"));

        const pendingRequests = requestsSnap.docs.filter(d => d.data().status === "Pending").length;
        const completedRequests = requestsSnap.docs.filter(d => d.data().status === "Completed").length;
        const approvedMechanics = mechsSnap.docs.filter(d => d.data().isApproved).length;

        return {
            success: true,
            data: {
                totalUsers: usersSnap.size,
                totalMechanics: mechsSnap.size,
                approvedMechanics: approvedMechanics,
                totalRequests: requestsSnap.size,
                pendingRequests: pendingRequests,
                completedRequests: completedRequests
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== STORAGE FUNCTIONS ====================

/**
 * Upload file to Firebase Storage
 */
async function uploadFile(file, path) {
    try {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return { success: true, url: downloadURL };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Upload vehicle photo
 */
async function uploadVehiclePhoto(file, userId, requestId) {
    const path = `vehicles/${userId}/${requestId}/${file.name}`;
    return uploadFile(file, path);
}

// ==================== EXPORT ALL FUNCTIONS ====================
window.firebase = {
    // Auth
    registerUser,
    loginUser,
    googleAuth,
    registerMechanic,
    adminLogin,
    logoutUser,
    getCurrentUser,
    onAuthChange,
    
    // User
    getUserProfile,
    updateUserProfile,
    submitEmergencyRequest,
    getUserRequests,
    getRequest,
    updateRequestStatus,
    submitReview,
    
    // Mechanic
    getMechanicProfile,
    updateMechanicProfile,
    getPendingRequests,
    getMechanicRequests,
    acceptRequest,
    updateMechanicStatus,
    updateMechanicLocation,
    
    // Admin
    getAllUsers,
    getAllMechanics,
    getAllRequests,
    approveMechanic,
    rejectMechanic,
    deleteUser,
    deleteMechanic,
    deleteRequest,
    getDashboardStats,
    
    // Storage
    uploadFile,
    uploadVehiclePhoto
};

console.log("Firebase initialized successfully!");
