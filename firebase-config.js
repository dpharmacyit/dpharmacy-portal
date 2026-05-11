// ============================================
// firebase-config.js (v2.0)
// ============================================

// 🔥 Firebase Config
// ℹ️ API Key นี้ปลอดภัย เพราะป้องกันด้วย:
//    1. Firebase Authentication (ต้อง Login ก่อน)
//    2. Firestore Security Rules (เฉพาะ Email/Password)
//    3. ระบบ Role 4 ระดับ
const firebaseConfig = {
  apiKey: "ใส่ KEY ใหม่ของคุณตรงนี้",
  authDomain: "dpharmacy-portal.firebaseapp.com",
  projectId: "dpharmacy-portal",
  storageBucket: "dpharmacy-portal.firebasestorage.app",
  messagingSenderId: "230890811350",
  appId: "1:230890811350:web:9a60b9786d2595d032fe77"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================
// ระบบสิทธิ์ 4 ระดับ
// ============================================
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  MANAGER:     'manager',
  STAFF:       'staff',
  VIEWER:      'viewer'
};

const ROLE_LABELS = {
  super_admin: '👑 Super Admin',
  manager:     '🎖️ Manager',
  staff:       '👤 Staff',
  viewer:      '👁️ Viewer'
};

const ROLE_PERMISSIONS = {
  super_admin: ['view','create_user','edit_user','delete_user','manage_system','manage_branch','view_audit'],
  manager:     ['view','create_user','edit_user','manage_system','manage_branch'],
  staff:       ['view','use_system'],
  viewer:      ['view']
};

// ============================================
// Helper: ตรวจสิทธิ์
// ============================================
function hasPermission(userRole, permission) {
  return ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
}

function isAdminRole(role) {
  return ['super_admin', 'manager'].includes(role);
}

// ============================================
// Helper: ตรวจวันหมดอายุ
// ============================================
function checkExpiry(expiresAt) {
  if (!expiresAt) return { valid: true, daysLeft: null };
  const now = new Date();
  const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return { valid: daysLeft > 0, daysLeft, expiresAt: expiry };
}

// ============================================
// Helper: คำนวณวันหมดอายุ (รองรับ Custom)
// ============================================
function calculateExpiryDate(membershipType, customValue = null) {
  const now = new Date();

  // Custom: เช่น "custom_days:15", "custom_weeks:3", "custom_months:6", "custom_years:2"
  if (typeof membershipType === 'string' && membershipType.startsWith('custom_')) {
    const [unit, value] = [membershipType, customValue];
    const num = parseInt(customValue);
    if (isNaN(num) || num <= 0) return null;

    if (unit === 'custom_days')   { now.setDate(now.getDate() + num); return now; }
    if (unit === 'custom_weeks')  { now.setDate(now.getDate() + (num * 7)); return now; }
    if (unit === 'custom_months') { now.setMonth(now.getMonth() + num); return now; }
    if (unit === 'custom_years')  { now.setFullYear(now.getFullYear() + num); return now; }
  }

  // Preset
  switch(membershipType) {
    case 'day':       now.setDate(now.getDate() + 1); return now;
    case 'week':      now.setDate(now.getDate() + 7); return now;
    case 'month':     now.setMonth(now.getMonth() + 1); return now;
    case 'year':      now.setFullYear(now.getFullYear() + 1); return now;
    case 'permanent': return null;
    default:          now.setMonth(now.getMonth() + 1); return now;
  }
}

// ============================================
// แสดงประเภทสมาชิกเป็นภาษาไทย
// ============================================
function formatMembershipType(type, customValue = null) {
  const map = {
    day: '1 วัน', week: '1 สัปดาห์', month: '1 เดือน',
    year: '1 ปี', permanent: 'ถาวร'
  };
  if (map[type]) return map[type];

  if (type === 'custom_days')   return `${customValue} วัน`;
  if (type === 'custom_weeks')  return `${customValue} สัปดาห์`;
  if (type === 'custom_months') return `${customValue} เดือน`;
  if (type === 'custom_years')  return `${customValue} ปี`;
  return type;
}

// ============================================
// Audit Log
// ============================================
async function logActivity(action, details = {}) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('audit_logs').add({
      uid: user.uid, email: user.email, action: action, details: details,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    });
  } catch (e) { console.warn('Log failed:', e); }
}

// ============================================
// ดึงข้อมูล User ปัจจุบัน
// ============================================
async function getCurrentUserData() {
  const user = auth.currentUser;
  if (!user) return null;
  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists) return null;
  return { uid: user.uid, ...doc.data() };
}

// ============================================
// requireAuth - บังคับ login ก่อน
// ============================================
function requireAuth(callback) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const userData = await getCurrentUserData();
    if (!userData) {
      alert('ไม่พบข้อมูลผู้ใช้ กรุณาติดต่อ Admin');
      auth.signOut();
      return;
    }

    if (!userData.isActive) {
      alert('บัญชีของคุณถูกระงับ กรุณาติดต่อ Admin');
      auth.signOut();
      return;
    }

    const expiryCheck = checkExpiry(userData.expiresAt);
    if (!expiryCheck.valid) {
      alert('บัญชีของคุณหมดอายุแล้ว กรุณาติดต่อ Admin เพื่อต่ออายุ');
      auth.signOut();
      return;
    }

    if (expiryCheck.daysLeft !== null && expiryCheck.daysLeft <= 7) {
      console.warn(`⏰ บัญชีของคุณจะหมดอายุใน ${expiryCheck.daysLeft} วัน`);
    }

    callback(userData);
  });
}

// ============================================
// requireAdmin - บังคับว่าต้องเป็น Admin/Manager ขึ้นไป
// ============================================
function requireAdmin(callback) {
  requireAuth((userData) => {
    // ✅ แก้ไข: เช็ค role โดยตรง แทนการเช็ค permission
    if (!isAdminRole(userData.role)) {
      // แสดง debug info ใน console เพื่อช่วย debug
      console.error('❌ Access Denied');
      console.log('Your role:', userData.role);
      console.log('Required: super_admin หรือ manager');
      console.log('User data:', userData);

      alert(`คุณไม่มีสิทธิ์เข้าถึงหน้านี้\n\nRole ของคุณ: "${userData.role}"\nต้องเป็น: super_admin หรือ manager\n\n💡 ตรวจสอบใน Firestore ว่า field "role" สะกดถูกหรือไม่`);
      window.location.href = 'index.html';
      return;
    }
    callback(userData);
  });
}

// ============================================
// Logout
// ============================================
async function logout() {
  await logActivity('logout');
  await auth.signOut();
  window.location.href = 'login.html';
}
