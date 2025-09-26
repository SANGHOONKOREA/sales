// 통합 CRM Pro - 전문 고객 관계 및 영업 관리 시스템
// Firebase 초기화
const firebaseConfig = {
  apiKey: "AIzaSyDylEzWAPbo6kfMYwxjjSHXT4bnb1bJWzg",
  authDomain: "snsys-sales.firebaseapp.com",
  databaseURL: "https://snsys-sales-default-rtdb.firebaseio.com/",
  projectId: "snsys-sales",
  messagingSenderId: "354545968756",
  appId: "1:354545968756:web:78420f41ca3335f5bf1321",
  measurementId: "G-J2E22BW61H"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// 전역 변수
let currentUser = null;
let currentUid = null;
let isAdmin = false;
let adminEmails = [];
const DEFAULT_ADMIN_EMAIL = 'sanghoon.seo@snsys.net';
let mainUsersData = {};
let userRecords = {};
let userMetaCache = null;
let userRecordsByEmail = {};
let mainUsersByEmail = {};
let userMetaByEmail = {};

// CRM 데이터
let customers = [];
let deals = [];
let communications = [];
let events = [];

// 영업 데이터
let salesData = [];
let filteredData = [];

// UI 상태
let currentView = 'dashboard';
let currentMode = 'manager';
let selectedCustomerId = null;
let calendar = null;
let charts = {};
let chartInstances = {};
let realtimeListenersAttached = false;
let calendarResizeObserver = null;
let calendarResizeHandler = null;

// 정렬 및 페이지네이션
let sortField = '';
let sortAsc = true;
let currentPage = 1;
const itemsPerPage = 10;

// 수정 추적
let dataChanged = false;
let modifiedRows = new Set();

// 알림 및 초기 데이터 추적
const MAX_NOTIFICATIONS = 50;
let notificationQueue = [];
let unreadNotificationCount = 0;
let initialDealsLoaded = false;
let previousDealsIndex = new Map();
const initialEntityIds = {
  customers: null,
  communications: null,
  events: null
};
let userDirectorySubscriptionAttached = false;

// 데이터 경로
const paths = {
  // CRM 경로
  customers: 'crm/customers',
  deals: 'crm/deals',
  communications: 'crm/communications',
  events: 'crm/events',
  activities: 'crm/activities',
  settings: 'crm/settings',
  
  // 영업 경로
  salesData: 'sales-service/data',
  salesHistory: 'sales-service/history',
  
  // 공통 경로
  users: 'as-service/users',
  userMeta: 'as-service/user_meta',
  adminEmails: 'as-service/admin/emails',
  mainUsers: 'users'
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  addSortIndicatorStyles();
  checkAuthState();
});

// 이벤트 리스너 초기화
function initializeEventListeners() {
  // 로그인 관련
  document.getElementById('loginConfirmBtn').addEventListener('click', performLogin);
  document.getElementById('loginPw').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performLogin();
  });
  document.getElementById('loginUser').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!document.getElementById('loginPw').value.trim()) {
        document.getElementById('loginPw').focus();
      } else {
        performLogin();
      }
    }
  });
  document.getElementById('forgotPasswordLink').addEventListener('click', openForgotPasswordModal);
  document.getElementById('sendResetLinkBtn').addEventListener('click', sendPasswordResetEmail);
  document.getElementById('changePasswordBtn').addEventListener('click', changeUserPassword);
  document.getElementById('logoutBtn').addEventListener('click', logoutUser);
  
  // 네비게이션
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view === 'userManagement' && !isAdmin) {
        showNotification('관리자 권한이 필요합니다.', 'error');
        return;
      }
      switchView(view);
    });
  });
  
  // 영업 안건 관련
  document.getElementById('loadBtn')?.addEventListener('click', () => {
    clearAllFilters();
    loadAllSalesData();
  });
  document.getElementById('addRowBtn')?.addEventListener('click', addNewRow);
  document.getElementById('deleteRowBtn')?.addEventListener('click', deleteSelectedRows);
  document.getElementById('saveBtn')?.addEventListener('click', saveAllData);
  document.getElementById('downloadExcelBtn')?.addEventListener('click', downloadExcel);
  document.getElementById('uploadExcelBtn')?.addEventListener('click', () => checkAdminAccess(() => document.getElementById('excelModal').style.display = 'block'));
  document.getElementById('historyBtn')?.addEventListener('click', showHistoryModal);
  document.getElementById('clearHistoryBtn')?.addEventListener('click', () => checkAdminAccess(clearHistory));
  document.getElementById('managerStatusBtn')?.addEventListener('click', openManagerStatusModal);
  document.getElementById('salesAnalysisBtn')?.addEventListener('click', openSalesAnalysisModal);
  
  // 엑셀 업로드 모달
  document.getElementById('excelReplaceBtn')?.addEventListener('click', () => { 
    document.getElementById('excelModal').style.display = 'none'; 
    proceedExcelUpload("replace"); 
  });
  document.getElementById('excelAppendBtn')?.addEventListener('click', () => { 
    document.getElementById('excelModal').style.display = 'none'; 
    proceedExcelUpload("append"); 
  });
  document.getElementById('excelCancelBtn')?.addEventListener('click', () => 
    document.getElementById('excelModal').style.display = 'none'
  );
  
  // 테이블 이벤트
  document.getElementById('salesTable')?.addEventListener('click', handleTableClick);
  document.getElementById('selectAll')?.addEventListener('change', toggleSelectAll);
  document.getElementById('selectAllCustomers')?.addEventListener('change', (e) => {
    document.querySelectorAll('#customerTableBody input[type="checkbox"]').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // 사용자 관리
  document.getElementById('addUserConfirmBtn')?.addEventListener('click', addNewUser);
  document.getElementById('deleteSelectedUsersBtn')?.addEventListener('click', deleteSelectedUsers);
  document.getElementById('saveUserChangesBtn')?.addEventListener('click', saveUserChanges);

  // 고객 가져오기 모달
  document.getElementById('customerImportFullBtn')?.addEventListener('click', () => startCustomerImport('full'));
  document.getElementById('customerImportPartialBtn')?.addEventListener('click', () => startCustomerImport('partial'));
  document.getElementById('customerImportCancelBtn')?.addEventListener('click', closeCustomerImportModal);

  // 열 리사이징
  document.addEventListener('mousedown', handleMouseDown);

  // 캘린더 필터
  document.querySelectorAll('.calendar-filters input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', handleCalendarFilterChange);
  });

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
  
  // 페이지 나가기 전 확인
  window.addEventListener('beforeunload', (e) => {
    if (modifiedRows.size > 0 || dataChanged) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  updateNotificationBadge();
}

// 정렬 표시기 스타일 추가
function addSortIndicatorStyles() {
  const styleElem = document.createElement('style');
  styleElem.textContent = `
    th {
      cursor: pointer;
      position: relative;
      user-select: none;
    }
    th:hover {
      background-color: #264c70;
    }
    .sort-indicator {
      display: inline-block;
      margin-left: 5px;
      font-size: 0.8em;
    }
    th[data-field] {
      padding-right: 20px;
    }
  `;
  document.head.appendChild(styleElem);
}

// 인증 상태 확인
function checkAuthState() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      currentUid = user.uid;
      await loadUserData();
      showMainInterface();
    } else {
      currentUser = null;
      currentUid = null;
      isAdmin = false;
      updateAdminButtonsVisibility();
      showLoginInterface();
    }
  });
}

// 사용자 데이터 로드
async function loadUserData() {
  try {
    // 관리자 이메일 목록 로드
    await loadAdminEmails();

    // 관리자 여부 확인
    isAdmin = checkUserIsAdmin(currentUser.email);
    console.log('관리자 여부:', isAdmin);

    // 사용자 정보 표시
    const mainUsersSnapshot = await db.ref(paths.mainUsers).once('value');
    const mainUsers = mainUsersSnapshot.val() || {};
    mainUsersData = mainUsers;
    rebuildUserLookupCaches();

    await preloadUserDirectory();
    rebuildUserLookupCaches();
    updateUserNameDisplays();
    initializeUserDirectorySubscription();

    // 관리자 버튼 업데이트
    updateAdminButtonsVisibility();

  } catch (error) {
    console.error('사용자 데이터 로드 오류:', error);
    document.getElementById('currentUserName').textContent = currentUser.email.split('@')[0];
    document.getElementById('sidebarUserName').textContent = currentUser.email.split('@')[0];
    updateUserNameDisplays();
  }
}

// 관리자 이메일 목록 로드
async function loadAdminEmails() {
  try {
    const snapshot = await db.ref(paths.adminEmails).once('value');
    const data = snapshot.val();
    const storedList = Array.isArray(data)
      ? data
      : (typeof data === 'object'
        ? Object.values(data).filter(email => typeof email === 'string')
        : []);

    const normalizedStored = getUniqueEmailList(storedList);
    const includesDefault = normalizedStored.some(email => normalizeEmail(email) === normalizeEmail(DEFAULT_ADMIN_EMAIL));

    const uniqueAdmins = getUniqueEmailList([...normalizedStored, DEFAULT_ADMIN_EMAIL]);

    const shouldPersist = !data
      || normalizedStored.length !== storedList.length
      || !includesDefault
      || uniqueAdmins.length !== normalizedStored.length;

    adminEmails = uniqueAdmins;

    if (shouldPersist) {
      await db.ref(paths.adminEmails).set(adminEmails);
    }

    console.log('관리자 이메일 목록:', adminEmails);
  } catch (error) {
    console.error('관리자 이메일 로드 오류:', error);
    adminEmails = [DEFAULT_ADMIN_EMAIL];
  }
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function getUniqueEmailList(emails) {
  const normalizedSet = new Set();
  const uniqueEmails = [];

  (emails || []).forEach(email => {
    const normalized = normalizeEmail(email);
    if (!normalized || normalizedSet.has(normalized)) return;
    normalizedSet.add(normalized);
    uniqueEmails.push((email || '').trim());
  });

  return uniqueEmails;
}

function isEmailAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !Array.isArray(adminEmails)) return false;
  return adminEmails.some(adminEmail => normalizeEmail(adminEmail) === normalized);
}

function normalizeRole(role) {
  return (role || '').trim().toLowerCase();
}

// 관리자 확인
function checkUserIsAdmin(email) {
  return isEmailAdmin(email);
}

// 관리자 권한 확인
function checkAdminAccess(callback) {
  if (!currentUser) {
    alert("로그인이 필요합니다.");
    return;
  }
  
  if (isAdmin) {
    callback();
  } else {
    alert("관리자 권한이 필요합니다.");
  }
}

// 관리자 버튼 표시/숨김
function updateAdminButtonsVisibility() {
  const adminOnlyButtons = ['uploadExcelBtn', 'clearHistoryBtn'];

  adminOnlyButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (isAdmin) {
        btn.style.display = btnId === 'userManageBtn' ? 'inline-flex' : 'inline-block';
        btn.style.visibility = 'visible';
        btn.disabled = false;
      } else {
        btn.style.display = 'none';
      }
    }
  });

  const userNavItem = document.getElementById('navUserManagement');
  if (userNavItem) {
    userNavItem.style.display = isAdmin ? '' : 'none';
  }

  if (!isAdmin && currentView === 'userManagement') {
    switchView('dashboard');
  }
}

async function deleteCommunication(commId) {
  const comm = communications.find(c => c.id === commId);
  if (!comm) return;

  const customerName = getCustomerNameById(comm.customerId) || '고객';
  const timestamp = formatDateTime(comm.createdAt) || '';
  const label = timestamp ? `${timestamp} 기록` : '커뮤니케이션 기록';
  if (!confirm(`${customerName}의 ${label}을(를) 삭제하시겠습니까?`)) {
    return;
  }

  try {
    showLoading();
    await db.ref(`${paths.communications}/${commId}`).remove();
    communications = communications.filter(c => c.id !== commId);
    loadCommCustomerList();
    if (selectedCustomerId === comm.customerId) {
      loadCustomerComms(selectedCustomerId);
    }
    logActivity('comm_deleted', `${customerName} 커뮤니케이션 삭제`);
    showNotification('커뮤니케이션 기록이 삭제되었습니다.', 'success');
  } catch (error) {
    console.error('커뮤니케이션 삭제 오류:', error);
    showNotification('기록 삭제에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

function normalizeMainCustomerFlag(value) {
  return (value || 'N').toString().trim().toUpperCase() === 'Y' ? 'Y' : 'N';
}

function normalizeCustomerRecord(customer) {
  if (!customer) return customer;
  const normalized = {...customer};
  normalized.mainCustomer = normalizeMainCustomerFlag(normalized.mainCustomer);
  if (!normalized.registrant) {
    normalized.registrant = normalized.createdBy || '';
  }
  if (!normalized.registrantName) {
    normalized.registrantName = normalized.createdByName || '';
  }
  if (!Array.isArray(normalized.remarkHistory)) {
    if (normalized.remarkHistory && typeof normalized.remarkHistory === 'object') {
      normalized.remarkHistory = Object.values(normalized.remarkHistory);
    } else {
      normalized.remarkHistory = [];
    }
  }
  return normalized;
}

function getCustomerRegistrantValue(customer) {
  if (!customer) return '';
  if (customer.registrantName) return customer.registrantName;
  return (customer.registrant || customer.createdBy || '').trim();
}

function getDisplayNameByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';

  const recordFromDirectory = userRecordsByEmail[normalized];
  if (recordFromDirectory) {
    return recordFromDirectory?.name || recordFromDirectory?.username || recordFromDirectory?.displayName || email || '';
  }

  const recordFromMainUsers = mainUsersByEmail[normalized];
  if (recordFromMainUsers) {
    return recordFromMainUsers?.id || recordFromMainUsers?.name || recordFromMainUsers?.nickname || email || '';
  }

  const recordFromMeta = userMetaByEmail[normalized];
  if (recordFromMeta) {
    return recordFromMeta?.name || recordFromMeta?.displayName || recordFromMeta?.id || email || '';
  }

  return email || '';
}

function getCustomerRegistrantDisplay(customer) {
  const registrant = getCustomerRegistrantValue(customer);
  if (!registrant) return '';
  const display = getDisplayNameByEmail(registrant);
  return display || registrant;
}

function formatUserDisplay(email) {
  if (!email) return '';
  const display = getDisplayNameByEmail(email);
  if (display && display !== email) {
    return display;
  }
  const [prefix] = email.split('@');
  return prefix || email;
}

function getCustomerDisplayName(customer) {
  if (!customer) return '';
  return (customer.company || customer.name || customer.customerName || '').toString().trim();
}

function getCustomerNameById(customerId) {
  if (!customerId) return '';
  const customer = customers.find(c => c.id === customerId);
  return getCustomerDisplayName(customer);
}

function rebuildUserLookupCaches() {
  userRecordsByEmail = {};
  Object.values(userRecords || {}).forEach(record => {
    const normalized = normalizeEmail(record?.email);
    if (!normalized) return;
    userRecordsByEmail[normalized] = record;
  });

  mainUsersByEmail = {};
  Object.values(mainUsersData || {}).forEach(record => {
    const normalized = normalizeEmail(record?.email);
    if (!normalized) return;
    mainUsersByEmail[normalized] = record;
  });

  userMetaByEmail = {};
  Object.values(userMetaCache || {}).forEach(record => {
    const email = record?.email || record?.mail;
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    userMetaByEmail[normalized] = record;
  });
}

async function preloadUserDirectory() {
  try {
    if (userRecords && Object.keys(userRecords).length) {
      return;
    }
    const snap = await db.ref(paths.users).once('value');
    userRecords = snap.val() || {};
    rebuildUserLookupCaches();
  } catch (error) {
    console.error('사용자 사전 로드 오류:', error);
  }
}

function onUserDirectoryChanged() {
  rebuildUserLookupCaches();
  updateUserNameDisplays();
  refreshCustomerRegistrantCells();
  refreshPipelineOwnerDisplays();
  refreshCommunicationAuthors();
  refreshCalendarAuthorDisplays();
}

function initializeUserDirectorySubscription() {
  if (userDirectorySubscriptionAttached) return;
  userDirectorySubscriptionAttached = true;

  db.ref(paths.users).on('value', (snapshot) => {
    userRecords = snapshot.val() || {};
    if (isAdmin) {
      renderUserList(transformUserRecords(userRecords));
    }
    onUserDirectoryChanged();
  });
}

function formatEventTime(start) {
  if (!start) return '';
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getEventCalendarTitle(event) {
  if (!event) return '';
  const author = formatUserDisplay(event.createdBy || event.modifiedBy || '');
  const time = formatEventTime(event.start);
  const summary = event.title || '';
  return [author, time, summary].filter(Boolean).join(' ');
}

// 로그인 인터페이스 표시
function showLoginInterface() {
  document.getElementById('loginModal').style.display = 'block';
  document.getElementById('mainLayout').classList.add('hidden');
  resetInterface();
}

// 메인 인터페이스 표시
function showMainInterface() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('mainLayout').classList.remove('hidden');
  
  // 최초 로그인 확인
  checkFirstLogin();
  
  // 연결 상태 확인
  testConnection();
  
  // 데이터 로드
  loadAllData();
  
  // 대시보드 초기화
  initializeDashboard();
}

// 인터페이스 초기화
function resetInterface() {
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPw').value = '';
  document.getElementById('loginError').textContent = '';

  // 데이터 초기화
  customers = [];
  deals = [];
  communications = [];
  events = [];
  salesData = [];
  filteredData = [];

  notificationQueue = [];
  unreadNotificationCount = 0;
  updateNotificationBadge();
  const list = document.getElementById('notificationList');
  if (list) {
    list.innerHTML = '<p class="no-data">새로운 알림이 없습니다.</p>';
  }
}

function updateUserNameDisplays() {
  const headerEl = document.getElementById('currentUserName');
  const sidebarEl = document.getElementById('sidebarUserName');
  if (!currentUser || (!headerEl && !sidebarEl)) return;

  const displayName = formatUserDisplay(currentUser.email) || currentUser.email?.split('@')[0] || '-';

  if (sidebarEl) {
    sidebarEl.textContent = displayName;
  }

  if (headerEl) {
    if (isAdmin) {
      headerEl.innerHTML = `${displayName} <span class="admin-badge">관리자</span>`;
    } else {
      headerEl.textContent = displayName;
    }
  }
}

function refreshCustomerRegistrantCells() {
  const rows = document.querySelectorAll('#customerTableBody tr[data-customer-id]');
  if (!rows.length) return;

  rows.forEach(row => {
    const customerId = row.dataset.customerId;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const normalized = normalizeCustomerRecord(customer);
    const registrantDisplay = getCustomerRegistrantDisplay(normalized) || getCustomerRegistrantValue(normalized) || '-';
    const cells = row.querySelectorAll('td');
    if (cells.length > 9) {
      cells[9].textContent = registrantDisplay;
    }
  });
}

function refreshPipelineOwnerDisplays() {
  if (currentView === 'pipeline') {
    updatePipelineView();
    loadPipelineFilters();
  }
}

function refreshCommunicationAuthors() {
  if (currentView === 'communications' && selectedCustomerId) {
    loadCustomerComms(selectedCustomerId);
  }
}

function refreshCalendarAuthorDisplays() {
  if (currentView === 'calendar') {
    initializeCalendar();
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;

  if (unreadNotificationCount > 0) {
    const displayValue = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount.toString();
    badge.textContent = displayValue;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

function getNotificationIcon(type) {
  const map = {
    customer: 'fa-user-plus',
    'customer-update': 'fa-user-pen',
    'customer-delete': 'fa-user-minus',
    deal: 'fa-briefcase',
    'deal-update': 'fa-pen-to-square',
    'deal-delete': 'fa-trash-can',
    communication: 'fa-comments',
    'communication-update': 'fa-comment-dots',
    'communication-delete': 'fa-comment-slash',
    event: 'fa-calendar-plus',
    'event-update': 'fa-calendar-check',
    'event-delete': 'fa-calendar-xmark'
  };
  return map[type] || 'fa-info-circle';
}

function renderNotificationList() {
  const list = document.getElementById('notificationList');
  if (!list) return;

  if (!notificationQueue.length) {
    list.innerHTML = '<p class="no-data">새로운 알림이 없습니다.</p>';
    return;
  }

  const items = notificationQueue.map(notification => {
    const icon = getNotificationIcon(notification.type);
    const message = escapeHtml(notification.message || '');
    const timestamp = notification.timestamp || new Date().toISOString();
    const relative = escapeHtml(formatRelativeTime(timestamp));
    return `
      <div class="notification-item">
        <div class="notification-icon"><i class="fas ${icon}"></i></div>
        <div class="notification-content">
          <div class="notification-message">${message}</div>
          <span class="notification-time">${relative}</span>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = items;
}

function enqueueNotification(type, message, options = {}) {
  if (!type || !message) return;

  const timestamp = options.timestamp || new Date().toISOString();
  const notification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    timestamp,
    meta: options.meta || {}
  };

  notificationQueue.unshift(notification);
  if (notificationQueue.length > MAX_NOTIFICATIONS) {
    notificationQueue.pop();
  }

  const panel = document.getElementById('notificationPanel');
  const isOpen = panel?.classList.contains('show');

  if (isOpen) {
    renderNotificationList();
  } else {
    unreadNotificationCount = Math.min(unreadNotificationCount + 1, 999);
    updateNotificationBadge();
  }
}

function isInitialEntity(collection, id) {
  const set = initialEntityIds[collection];
  if (!set) return false;

  if (set.has(id)) {
    set.delete(id);
    if (set.size === 0) {
      initialEntityIds[collection] = null;
    }
    return true;
  }
  return false;
}

// 최초 로그인 확인
async function checkFirstLogin() {
  try {
    const metaSnapshot = await db.ref(`${paths.userMeta}/${currentUser.uid}`).once('value');
    const userData = metaSnapshot.val();
    
    if (!userData || !userData.passwordChanged) {
      showChangePasswordModal(true);
    }
  } catch (error) {
    console.error('최초 로그인 확인 오류:', error);
  }
}

// 연결 테스트
function testConnection() {
  db.ref('.info/connected').on('value', (snapshot) => {
    const status = document.getElementById('connectionStatus');
    if (snapshot.val() === true) {
      status.innerHTML = '<i class="fas fa-wifi"></i> <span>연결됨</span>';
      status.style.color = '#28a745';
    } else {
      status.innerHTML = '<i class="fas fa-wifi"></i> <span>연결 끊김</span>';
      status.style.color = '#dc3545';
    }
  });
}

// 로그인 수행
async function performLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPw').value.trim();
  
  if (!email || !password) {
    showError('loginError', '이메일과 비밀번호를 입력하세요.');
    return;
  }
  
  if (!email.includes('@')) {
    showError('loginError', '올바른 이메일 형식을 입력해주세요.');
    return;
  }
  
  document.getElementById('loginError').textContent = '로그인 중...';
  showLoading();
  
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    
    // 로그인 시간 업데이트
    const user = userCredential.user;
    await db.ref(`${paths.userMeta}/${user.uid}`).update({
      lastLogin: new Date().toISOString(),
      email: user.email,
      uid: user.uid
    });
    
    document.getElementById('loginError').textContent = '';
  } catch (error) {
    console.error('로그인 오류:', error);
    let errorMsg = '로그인에 실패했습니다.';
    
    switch(error.code) {
      case 'auth/user-not-found':
        errorMsg = '등록되지 않은 이메일입니다.';
        break;
      case 'auth/wrong-password':
        errorMsg = '비밀번호가 올바르지 않습니다.';
        break;
      case 'auth/invalid-email':
        errorMsg = '올바른 이메일 형식이 아닙니다.';
        break;
      case 'auth/user-disabled':
        errorMsg = '비활성화된 계정입니다. 관리자에게 문의하세요.';
        break;
      case 'auth/too-many-requests':
        errorMsg = '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
        break;
    }
    
    showError('loginError', errorMsg);
  } finally {
    hideLoading();
  }
}

// 로그아웃
function logoutUser() {
  if (confirm('로그아웃 하시겠습니까?')) {
    auth.signOut().then(() => {
      console.log('로그아웃 완료');
    }).catch(err => {
      console.error('로그아웃 오류:', err);
      alert('로그아웃 중 오류가 발생했습니다.');
    });
  }
}

// 비밀번호 변경 모달 표시
function showChangePasswordModal(isFirstLogin = false) {
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('changePasswordStatus').textContent = '';
  
  document.getElementById('changePasswordModal').setAttribute('data-first-login', isFirstLogin ? 'true' : 'false');
  document.getElementById('changePasswordModal').style.display = 'block';
  
  setTimeout(() => {
    document.getElementById('currentPassword').focus();
  }, 300);
}

// 비밀번호 변경
async function changeUserPassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    showError('changePasswordStatus', '모든 필드를 입력해주세요.');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showError('changePasswordStatus', '새 비밀번호가 일치하지 않습니다.');
    return;
  }
  
  if (newPassword.length < 6) {
    showError('changePasswordStatus', '비밀번호는 6자 이상이어야 합니다.');
    return;
  }
  
  try {
    const credential = firebase.auth.EmailAuthProvider.credential(
      currentUser.email,
      currentPassword
    );
    
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.updatePassword(newPassword);
    
    // 메타 데이터 업데이트
    await db.ref(`${paths.userMeta}/${currentUser.uid}`).update({
      passwordChanged: true,
      lastPasswordChange: new Date().toISOString()
    });
    
    showSuccess('changePasswordStatus', '비밀번호가 변경되었습니다.');
    
    setTimeout(() => {
      document.getElementById('changePasswordModal').style.display = 'none';
      
      if (document.getElementById('changePasswordModal').getAttribute('data-first-login') === 'true') {
        showMainInterface();
      }
    }, 2000);
  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    let errorMsg = '비밀번호 변경에 실패했습니다.';
    
    if (error.code === 'auth/wrong-password') {
      errorMsg = '현재 비밀번호가 올바르지 않습니다.';
    }
    
    showError('changePasswordStatus', errorMsg);
  }
}

// 비밀번호 찾기 모달
function openForgotPasswordModal(e) {
  if (e) e.preventDefault();
  const loginEmail = document.getElementById('loginUser').value.trim();
  document.getElementById('resetEmail').value = loginEmail;
  document.getElementById('resetEmailStatus').textContent = '';
  document.getElementById('forgotPasswordModal').style.display = 'block';
}

function closeForgotPasswordModal() {
  document.getElementById('forgotPasswordModal').style.display = 'none';
  document.getElementById('resetEmail').value = '';
  document.getElementById('resetEmailStatus').textContent = '';
}

// 비밀번호 재설정 이메일 전송
async function sendPasswordResetEmail() {
  const email = document.getElementById('resetEmail').value.trim();
  
  if (!email) {
    showError('resetEmailStatus', '이메일을 입력하세요.');
    return;
  }
  
  try {
    await auth.sendPasswordResetEmail(email);
    showSuccess('resetEmailStatus', '비밀번호 재설정 이메일을 발송했습니다.');
    setTimeout(closeForgotPasswordModal, 3000);
  } catch (error) {
    console.error('비밀번호 재설정 오류:', error);
    showError('resetEmailStatus', '이메일 전송에 실패했습니다.');
  }
}

// 뷰 전환
function switchView(viewName) {
  // 모든 뷰 숨기기
  document.querySelectorAll('.view-content').forEach(view => {
    view.classList.remove('active');
  });
  
  // 네비게이션 활성화 상태 변경
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // 선택된 뷰 표시
  const viewElement = document.getElementById(`${viewName}View`);
  if (viewElement) {
    viewElement.classList.add('active');
  }
  
  const navItem = document.querySelector(`[data-view="${viewName}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
  
  // 페이지 제목 업데이트
  const titles = {
    dashboard: '대시보드',
    customers: '고객 관리',
    sales: '영업 안건',
    pipeline: '영업 파이프라인',
    communications: '커뮤니케이션',
    calendar: '일정 관리',
    analytics: '분석 및 리포트',
    userManagement: '사용자 관리'
  };
  
  document.getElementById('pageTitle').textContent = titles[viewName] || viewName;
  currentView = viewName;
  
  // 뷰별 초기화
  switch(viewName) {
    case 'dashboard':
      updateDashboard();
      break;
    case 'customers':
      loadCustomers();
      break;
    case 'sales':
      loadSalesView();
      break;
    case 'pipeline':
      loadPipeline();
      break;
    case 'communications':
      loadCommunications();
      break;
    case 'calendar':
      initializeCalendar();
      break;
    case 'analytics':
      loadAnalytics();
      break;
    case 'userManagement':
      loadUserManagement();
      break;
  }
}

// 전체 데이터 로드
async function loadAllData() {
  try {
    const [customersSnap, dealsSnap, commsSnap, eventsSnap, salesSnap] = await Promise.all([
      db.ref(paths.customers).once('value'),
      db.ref(paths.deals).once('value'),
      db.ref(paths.communications).once('value'),
      db.ref(paths.events).once('value'),
      db.ref(paths.salesData).once('value')
    ]);
    
    customers = Object.entries(customersSnap.val() || {})
      .map(([id, data]) => normalizeCustomerRecord({id, ...data}));
    deals = Object.entries(dealsSnap.val() || {}).map(([id, data]) => {
      const deal = {id, ...data};
      if (!deal.customerName && deal.customerId) {
        deal.customerName = getCustomerNameById(deal.customerId);
      }
      if (!deal.assignedTo) {
        deal.assignedTo = deal.createdBy || currentUser?.email || '';
      }
      return deal;
    });
    communications = Object.entries(commsSnap.val() || {}).map(([id, data]) => ({id, ...data}));
    events = Object.entries(eventsSnap.val() || {}).map(([id, data]) => {
      const event = {id, ...data};
      if (!event.customerName && event.customerId) {
        event.customerName = getCustomerNameById(event.customerId);
      }
      return event;
    });
    
    // 영업 데이터 처리
    const salesVal = salesSnap.val() || {};
    salesData = [];
    Object.keys(salesVal).forEach(key => {
      const r = salesVal[key];
      if (!r || typeof r !== 'object') return;
      
      if (!r.uid) r.uid = key;
      
      // 기본값 설정
      const defaults = {
        no: "",
        region: "",
        registDate: "",
        product: "",
        projectName: "",
        type: "",
        bidAmount: "",
        currency: "KRW",
        customer: "",
        manager: "",
        date: "",
        progress: "",
        remark: "",
        status: "",
        modifiedDate: ""
      };
      
      Object.keys(defaults).forEach(field => {
        if (!(field in r)) r[field] = defaults[field];
      });
      
      salesData.push(r);
    });
    
    // 실시간 업데이트 리스너
    if (!realtimeListenersAttached) {
      initialEntityIds.customers = new Set(customers.map(c => c.id));
      initialEntityIds.communications = new Set(communications.map(c => c.id));
      initialEntityIds.events = new Set(events.map(e => e.id));
      previousDealsIndex = new Map(deals.map(deal => [deal.id, deal]));
      initialDealsLoaded = false;
      setupRealtimeListeners();
      realtimeListenersAttached = true;
    } else {
      previousDealsIndex = new Map(deals.map(deal => [deal.id, deal]));
    }
  } catch (error) {
    console.error('데이터 로드 오류:', error);
  }
}

// 실시간 업데이트 리스너 설정
function setupRealtimeListeners() {
  // 고객 데이터 실시간 업데이트
  db.ref(paths.customers).on('child_added', (snapshot) => {
    const customer = normalizeCustomerRecord({id: snapshot.key, ...snapshot.val()});
    const exists = customers.find(c => c.id === customer.id);
    const initial = isInitialEntity('customers', customer.id);
    if (!exists) {
      customers.push(customer);
      if (currentView === 'customers') {
        addCustomerToTable(customer);
        refreshCustomerFilters();
      }
      updateDashboardStats();
      if (!initial) {
        const registrantName = formatUserDisplay(customer.registrant || customer.createdBy || customer.createdByName || '');
        const companyName = getCustomerDisplayName(customer) || '고객';
        enqueueNotification('customer', `${registrantName || '사용자'} 님이 ${companyName} 고객을 등록했습니다.`, {
          timestamp: customer.createdAt || customer.registDate || new Date().toISOString(),
          meta: { id: customer.id }
        });
      }
    }
  });

  db.ref(paths.customers).on('child_changed', (snapshot) => {
    const index = customers.findIndex(c => c.id === snapshot.key);
    if (index !== -1) {
      customers[index] = normalizeCustomerRecord({id: snapshot.key, ...snapshot.val()});
      if (currentView === 'customers') {
        updateCustomerInTable(customers[index]);
        refreshCustomerFilters();
      }
      const companyName = getCustomerDisplayName(customers[index]) || '고객';
      enqueueNotification('customer-update', `${companyName} 고객 정보가 업데이트되었습니다.`, {
        timestamp: customers[index].updatedAt || customers[index].modifiedAt || new Date().toISOString(),
        meta: { id: customers[index].id }
      });
      updateDashboardStats();
    }
  });

  db.ref(paths.customers).on('child_removed', (snapshot) => {
    const removedCustomer = customers.find(c => c.id === snapshot.key);
    customers = customers.filter(c => c.id !== snapshot.key);
    if (currentView === 'customers') {
      removeCustomerFromTable(snapshot.key);
    }
    updateDashboardStats();
    if (removedCustomer) {
      const companyName = getCustomerDisplayName(removedCustomer) || '고객';
      enqueueNotification('customer-delete', `${companyName} 고객이 삭제되었습니다.`, {
        timestamp: new Date().toISOString(),
        meta: { id: removedCustomer.id }
      });
    }
  });
  
  // 거래 데이터 실시간 업데이트
  db.ref(paths.deals).on('value', (snapshot) => {
    const raw = snapshot.val() || {};
    const newDeals = Object.entries(raw).map(([id, data]) => {
      const deal = {id, ...data};
      if (!deal.customerName && deal.customerId) {
        deal.customerName = getCustomerNameById(deal.customerId);
      }
      if (!deal.assignedTo) {
        deal.assignedTo = deal.createdBy || currentUser?.email || '';
      }
      return deal;
    });

    const previousMap = previousDealsIndex || new Map();
    const newMap = new Map(newDeals.map(deal => [deal.id, deal]));

    if (initialDealsLoaded) {
      newDeals.forEach(deal => {
        const prev = previousMap.get(deal.id);
        const ownerName = formatUserDisplay(deal.assignedTo || deal.createdBy || deal.modifiedBy || '');
        const dealName = deal.name || '영업 안건';

        if (!prev) {
          enqueueNotification('deal', `${ownerName || '사용자'} 님이 '${dealName}' 안건을 등록했습니다.`, {
            timestamp: deal.createdAt || deal.modifiedAt || deal.updatedAt || new Date().toISOString(),
            meta: { id: deal.id }
          });
        } else {
          const stageChanged = prev.stage !== deal.stage;
          const valueChanged = (prev.value || 0) !== (deal.value || 0);
          const probabilityChanged = (prev.probability || 0) !== (deal.probability || 0);
          const nameChanged = prev.name !== deal.name;
          const customerChanged = prev.customerId !== deal.customerId;

          if (stageChanged || valueChanged || probabilityChanged || nameChanged || customerChanged) {
            enqueueNotification('deal-update', `'${dealName}' 안건이 업데이트되었습니다.`, {
              timestamp: deal.modifiedAt || deal.updatedAt || new Date().toISOString(),
              meta: { id: deal.id }
            });
          }
        }
      });

      previousMap.forEach((prevDeal, id) => {
        if (!newMap.has(id)) {
          const dealName = prevDeal.name || '영업 안건';
          enqueueNotification('deal-delete', `'${dealName}' 안건이 삭제되었습니다.`, {
            timestamp: new Date().toISOString(),
            meta: { id }
          });
        }
      });
    } else {
      initialDealsLoaded = true;
    }

    deals = newDeals;
    previousDealsIndex = newMap;

    if (currentView === 'pipeline') {
      updatePipelineView();
      loadPipelineFilters();
    } else {
      loadPipelineFilters();
    }
    updateDashboardStats();
  });

  db.ref(paths.communications).on('child_added', (snapshot) => {
    const comm = {id: snapshot.key, ...snapshot.val()};
    const initial = isInitialEntity('communications', comm.id);
    if (!communications.find(c => c.id === comm.id)) {
      communications.push(comm);
      loadCommCustomerList();
      if (selectedCustomerId === comm.customerId) {
        loadCustomerComms(selectedCustomerId);
      }
      if (!initial) {
        const customerName = getCustomerNameById(comm.customerId) || '고객';
        const author = formatUserDisplay(comm.createdBy || '');
        enqueueNotification('communication', `${author || '사용자'} 님이 ${customerName} 커뮤니케이션을 기록했습니다.`, {
          timestamp: comm.createdAt || new Date().toISOString(),
          meta: { id: comm.id, customerId: comm.customerId }
        });
      }
    }
  });

  db.ref(paths.communications).on('child_changed', (snapshot) => {
    const index = communications.findIndex(c => c.id === snapshot.key);
    if (index !== -1) {
      communications[index] = {id: snapshot.key, ...snapshot.val()};
      if (selectedCustomerId === communications[index].customerId) {
        loadCustomerComms(selectedCustomerId);
      }
      loadCommCustomerList();
      const customerName = getCustomerNameById(communications[index].customerId) || '고객';
      enqueueNotification('communication-update', `${customerName} 커뮤니케이션이 업데이트되었습니다.`, {
        timestamp: communications[index].updatedAt || communications[index].modifiedAt || new Date().toISOString(),
        meta: { id: communications[index].id, customerId: communications[index].customerId }
      });
    }
  });

  db.ref(paths.communications).on('child_removed', (snapshot) => {
    const removedComm = communications.find(c => c.id === snapshot.key);
    communications = communications.filter(c => c.id !== snapshot.key);
    loadCommCustomerList();
    if (selectedCustomerId) {
      loadCustomerComms(selectedCustomerId);
    }
    if (removedComm) {
      const customerName = getCustomerNameById(removedComm.customerId) || '고객';
      enqueueNotification('communication-delete', `${customerName} 커뮤니케이션이 삭제되었습니다.`, {
        timestamp: new Date().toISOString(),
        meta: { id: removedComm.id, customerId: removedComm.customerId }
      });
    }
  });

  db.ref(paths.events).on('child_added', (snapshot) => {
    const event = {id: snapshot.key, ...snapshot.val()};
    const initial = isInitialEntity('events', event.id);
    if (!events.find(e => e.id === event.id)) {
      if (!event.customerName && event.customerId) {
        event.customerName = getCustomerNameById(event.customerId);
      }
      events.push(event);
      if (currentView === 'calendar') {
        initializeCalendar();
      }
      if (!initial) {
        const author = formatUserDisplay(event.createdBy || event.modifiedBy || '');
        const title = event.title || '새 일정';
        enqueueNotification('event', `${author || '사용자'} 님이 '${title}' 일정을 등록했습니다.`, {
          timestamp: event.createdAt || event.start || new Date().toISOString(),
          meta: { id: event.id }
        });
      }
    }
  });

  db.ref(paths.events).on('child_changed', (snapshot) => {
    const index = events.findIndex(e => e.id === snapshot.key);
    if (index !== -1) {
      const updated = {id: snapshot.key, ...snapshot.val()};
      if (!updated.customerName && updated.customerId) {
        updated.customerName = getCustomerNameById(updated.customerId);
      }
      events[index] = updated;
      if (currentView === 'calendar') {
        initializeCalendar();
      }
      const title = updated.title || '일정';
      enqueueNotification('event-update', `'${title}' 일정이 업데이트되었습니다.`, {
        timestamp: updated.modifiedAt || updated.updatedAt || new Date().toISOString(),
        meta: { id: updated.id }
      });
    }
  });

  db.ref(paths.events).on('child_removed', (snapshot) => {
    const removedEvent = events.find(e => e.id === snapshot.key);
    events = events.filter(e => e.id !== snapshot.key);
    if (currentView === 'calendar') {
      initializeCalendar();
    }
    if (removedEvent) {
      const title = removedEvent.title || '일정';
      enqueueNotification('event-delete', `'${title}' 일정이 삭제되었습니다.`, {
        timestamp: new Date().toISOString(),
        meta: { id: removedEvent.id }
      });
    }
  });

  // 영업 데이터 실시간 업데이트
  db.ref(paths.salesData).on('value', (snapshot) => {
    const val = snapshot.val() || {};
    salesData = [];
    Object.keys(val).forEach(key => {
      const r = val[key];
      if (!r || typeof r !== 'object') return;
      if (!r.uid) r.uid = key;
      salesData.push(r);
    });
    
    if (currentView === 'sales') {
      updateSalesTable();
    }
    updateDashboardStats();
  });
}

// 대시보드 초기화
function initializeDashboard() {
  updateDashboardStats();
  initializeCharts();
  loadRecentActivities();
}

// 대시보드 통계 업데이트
function updateDashboardStats() {
  // 수주량 (완료된 거래 금액 합산)
  const closedDeals = deals.filter(d => (d.stage || 'lead') === 'closed');
  const totalOrderVolume = closedDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  document.getElementById('orderVolume').textContent = formatCurrency(totalOrderVolume);

  // 진행중 프로젝트 (연락중/제안서/협상중 단계)
  const ongoingStages = new Set(['contact', 'proposal', 'negotiation']);
  const ongoingProjects = deals.filter(d => ongoingStages.has(d.stage || '')).length;
  document.getElementById('ongoingProjects').textContent = ongoingProjects;

  // 예정 프로젝트 (리드 또는 단계 미지정)
  const plannedProjects = deals.filter(d => {
    const stage = d.stage || 'lead';
    return stage === 'lead';
  }).length;
  document.getElementById('plannedProjects').textContent = plannedProjects;

  // 수주 확률 (영업 안건 평균 확률)
  const probabilitySum = deals.reduce((sum, d) => sum + (Number(d.probability) || 0), 0);
  const averageProbability = deals.length ? (probabilitySum / deals.length) : 0;
  document.getElementById('orderProbability').textContent = `${averageProbability.toFixed(1)}%`;

  // 열린 안건 (종료되지 않은 거래 수)
  const openDeals = deals.filter(d => {
    const stage = d.stage || 'lead';
    return stage !== 'closed' && stage !== 'lost';
  }).length;
  document.getElementById('openDeals').textContent = openDeals;

  // 등록 고객 수
  document.getElementById('registeredCustomers').textContent = customers.length;

  refreshDashboardCharts();
}

// 차트 초기화
function initializeCharts() {
  // 제품별 수주 현황 차트
  const productCtx = document.getElementById('productOrderChart').getContext('2d');
  const productData = getProductOrderData();
  charts.productOrders = new Chart(productCtx, {
    type: 'bar',
    data: {
      labels: Object.keys(productData),
      datasets: [{
        label: '안건 수',
        data: Object.values(productData),
        backgroundColor: '#315b8a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // 월별 수주 추이 차트
  const monthlyCtx = document.getElementById('monthlyOrderChart').getContext('2d');
  charts.monthlyOrders = new Chart(monthlyCtx, {
    type: 'line',
    data: {
      labels: getLastMonths(6),
      datasets: [{
        label: '수주 금액',
        data: getMonthlyOrderData(),
        borderColor: '#315b8a',
        backgroundColor: 'rgba(49, 91, 138, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });

  // 조선소의 프로젝트 분포 차트
  const shipyardCtx = document.getElementById('shipyardProjectChart').getContext('2d');
  const shipyardData = getShipyardProjectData();
  charts.shipyardProjects = new Chart(shipyardCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(shipyardData),
      datasets: [{
        data: Object.values(shipyardData),
        backgroundColor: ['#17a2b8', '#ffc107', '#fd7e14', '#6f42c1', '#28a745']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function refreshDashboardCharts() {
  if (charts.productOrders) {
    const stageData = getProductOrderData();
    charts.productOrders.data.labels = Object.keys(stageData);
    charts.productOrders.data.datasets[0].data = Object.values(stageData);
    charts.productOrders.update('none');
  }

  if (charts.monthlyOrders) {
    charts.monthlyOrders.data.labels = getLastMonths(6);
    charts.monthlyOrders.data.datasets[0].data = getMonthlyOrderData();
    charts.monthlyOrders.update('none');
  }

  if (charts.shipyardProjects) {
    const ownerData = getShipyardProjectData();
    charts.shipyardProjects.data.labels = Object.keys(ownerData);
    charts.shipyardProjects.data.datasets[0].data = Object.values(ownerData);
    charts.shipyardProjects.update('none');
  }
}

// 최근 활동 로드
async function loadRecentActivities() {
  try {
    const snapshot = await db.ref(paths.activities)
      .orderByChild('timestamp')
      .limitToLast(10)
      .once('value');
    
    const activities = [];
    snapshot.forEach(child => {
      activities.push({id: child.key, ...child.val()});
    });
    
    const activityList = document.getElementById('activityList');
    activityList.innerHTML = '';
    
    activities.reverse().forEach(activity => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      item.innerHTML = `
        <div class="activity-icon ${activity.type}">
          <i class="fas ${getActivityIcon(activity.type)}"></i>
        </div>
        <div class="activity-content">
          <p>${activity.description}</p>
          <span class="activity-time">${formatRelativeTime(activity.timestamp)}</span>
        </div>
      `;
      activityList.appendChild(item);
    });
  } catch (error) {
    console.error('활동 로드 오류:', error);
  }
}

// 고객 관리 기능
function loadCustomers() {
  const tbody = document.getElementById('customerTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  customers.forEach(customer => {
    const row = document.createElement('tr');
    renderCustomerRow(row, customer);
    tbody.appendChild(row);
  });

  refreshCustomerFilters();
}

// 고객 테이블에 행 추가
function addCustomerToTable(customer) {
  const tbody = document.getElementById('customerTableBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  renderCustomerRow(tr, customer);
  tbody.appendChild(tr);
}

// 고객 테이블 행 업데이트
function updateCustomerInTable(customer) {
  const tr = document.querySelector(`tr[data-customer-id="${customer.id}"]`);
  if (tr) {
    renderCustomerRow(tr, customer);
  }
}

function renderCustomerRow(tr, customer) {
  if (!tr || !customer) return;

  const normalized = normalizeCustomerRecord(customer);
  const mainFlag = normalizeMainCustomerFlag(normalized.mainCustomer);
  const registrantDisplay = getCustomerRegistrantDisplay(normalized);
  const registrantValue = registrantDisplay || getCustomerRegistrantValue(normalized) || '-';
  const remarkText = normalized.remark || '';
  const historyCount = (normalized.remarkHistory || []).length;

  tr.dataset.customerId = normalized.id;
  tr.dataset.company = (normalized.company || '').toLowerCase();
  tr.dataset.manager = (normalized.manager || '').toLowerCase();
  tr.dataset.mainCustomer = mainFlag.toLowerCase();
  tr.dataset.email = (normalized.email || '').toLowerCase();

  tr.innerHTML = `
    <td><input type="checkbox"></td>
    <td class="col-no">${normalized.no || '-'}</td>
    <td>${normalized.company || '-'}</td>
    <td>${normalized.manager || '-'}</td>
    <td>${normalized.region || '-'}</td>
    <td>${normalized.phone1 || '-'}</td>
    <td>${normalized.phone2 || '-'}</td>
    <td>${normalized.email || '-'}</td>
    <td class="main-customer-cell"><span class="badge badge-${mainFlag === 'Y' ? 'vip' : 'normal'}">${mainFlag}</span></td>
    <td>${registrantValue}</td>
    <td>${normalized.registDate ? formatDate(normalized.registDate) : '-'}</td>
    <td>${remarkText || '-'}</td>
    <td>
      <button class="history-btn" onclick="viewRemarkHistory('${normalized.id}')">
        조회 (${historyCount})
      </button>
    </td>
    <td>
      <div class="action-buttons">
        <button class="btn-icon" onclick="editCustomer('${normalized.id}')" title="수정">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-icon" onclick="deleteCustomer('${normalized.id}')" title="삭제">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </td>
  `;
}

function removeCustomerFromTable(customerId) {
  const tr = document.querySelector(`tr[data-customer-id="${customerId}"]`);
  if (tr) {
    tr.remove();
    refreshCustomerFilters();
  }
}

function viewRemarkHistory(customerId) {
  const customer = customers.find(c => c.id === customerId);
  if (!customer) {
    showNotification('고객 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  const history = [...(customer.remarkHistory || [])]
    .map(entry => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return { value: entry };
      }
      if (typeof entry === 'object') {
        return entry;
      }
      return null;
    })
    .filter(Boolean);

  if (history.length === 0) {
    showContentModal('<p>등록된 히스토리가 없습니다.</p>', '비고 히스토리');
    return;
  }

  history.sort((a, b) => {
    const dateA = new Date(a.timestamp || a.modifiedAt || a.createdAt || 0);
    const dateB = new Date(b.timestamp || b.modifiedAt || b.createdAt || 0);
    return dateB - dateA;
  });

  const listItems = history.map(entry => {
    const timestampValue = entry.timestamp || entry.modifiedAt || entry.createdAt;
    const timestamp = timestampValue ? formatDateTime(timestampValue) : '-';
    const author = formatUserDisplay(entry.modifiedBy || entry.createdBy || entry.author || entry.authorName || '');
    const content = (entry.value ?? entry.remark ?? '').toString();
    return `
      <li class="remark-history-item">
        <div class="remark-history-meta">${timestamp}${author ? ` • ${author}` : ''}</div>
        <div>${content || '(비어 있음)'}</div>
      </li>
    `;
  }).join('');

  showContentModal(`<ul class="remark-history-list">${listItems}</ul>`, '비고 히스토리');
}

function refreshCustomerFilters() {
  if (!document.getElementById('customerTableBody')) return;
  populateCustomerFilterOptions();
  applyCustomerFilters();
}

function populateCustomerFilterOptions() {
  const companies = customers.map(c => c.company).filter(Boolean);
  const managers = customers.map(c => c.manager).filter(Boolean);
  const emails = customers.map(c => c.email).filter(Boolean);
  const mainFlags = customers.map(c => normalizeMainCustomerFlag(c.mainCustomer));

  populateFilterDatalist('companyOptions', companies);
  populateFilterDatalist('managerOptions', managers);
  populateFilterDatalist('emailOptions', emails);
  populateFilterDatalist('mainCustomerOptions', ['Y', 'N', ...mainFlags]);
}

function populateFilterDatalist(id, values) {
  const datalist = document.getElementById(id);
  if (!datalist) return;

  const uniqueValues = Array.from(new Set((values || [])
    .map(value => (value ?? '').toString().trim())
    .filter(value => value !== '')));

  uniqueValues.sort((a, b) => a.localeCompare(b, 'ko'));

  datalist.innerHTML = '';
  uniqueValues.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  });
}

function applyCustomerFilters() {
  const tbody = document.getElementById('customerTableBody');
  if (!tbody) return;

  const searchTerm = (document.getElementById('customerSearch')?.value || '').toLowerCase().trim();
  const companyTerm = (document.getElementById('companyFilter')?.value || '').toLowerCase().trim();
  const managerTerm = (document.getElementById('managerFilter')?.value || '').toLowerCase().trim();
  const emailTerm = (document.getElementById('emailFilter')?.value || '').toLowerCase().trim();
  const mainTermInput = (document.getElementById('mainCustomerFilter')?.value || '').toLowerCase().trim();
  const mainTerm = mainTermInput ? mainTermInput.charAt(0) : '';

  tbody.querySelectorAll('tr').forEach(row => {
    const textContent = row.textContent.toLowerCase();
    const rowCompany = row.dataset.company || '';
    const rowManager = row.dataset.manager || '';
    const rowEmail = row.dataset.email || '';
    const rowMain = row.dataset.mainCustomer || '';

    const matchesSearch = !searchTerm || textContent.includes(searchTerm);
    const matchesCompany = !companyTerm || rowCompany.includes(companyTerm);
    const matchesManager = !managerTerm || rowManager.includes(managerTerm);
    const matchesEmail = !emailTerm || rowEmail.includes(emailTerm);
    const matchesMain = !mainTerm || rowMain.startsWith(mainTerm);

    row.style.display = matchesSearch && matchesCompany && matchesManager && matchesEmail && matchesMain ? '' : 'none';
  });
}

// 고객 모달 열기
function openCustomerModal(customerId = null) {
  const modal = document.getElementById('customerModal');
  const title = document.getElementById('customerModalTitle');
  
  if (customerId) {
    title.textContent = '고객 정보 수정';
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      document.getElementById('custNo').value = customer.no || '';
      document.getElementById('custCompany').value = customer.company || '';
      document.getElementById('custManager').value = customer.manager || '';
      document.getElementById('custRegion').value = customer.region || '국내';
      document.getElementById('custPhone1').value = customer.phone1 || '';
      document.getElementById('custPhone2').value = customer.phone2 || '';
      document.getElementById('custEmail').value = customer.email || '';
      document.getElementById('custMainCustomer').value = customer.mainCustomer || 'N';
      document.getElementById('custAddress').value = customer.address || '';
      document.getElementById('custDate').value = customer.date || '';
      document.getElementById('custRegistDate').value = customer.registDate || '';
      document.getElementById('custRemark').value = customer.remark || '';
    }
  } else {
    title.textContent = '신규 고객 등록';
    document.getElementById('customerModal').querySelectorAll('input, textarea, select').forEach(el => {
      if (el.type !== 'button' && el.type !== 'submit') {
        el.value = '';
      }
    });
    document.getElementById('custRegion').value = '국내';
    document.getElementById('custMainCustomer').value = 'N';
    
    // 새 고객 번호 자동 생성
    const maxNo = Math.max(...customers.map(c => parseInt(c.no) || 0), 0);
    document.getElementById('custNo').value = maxNo + 1;
    
    // 등록일 자동 설정
    document.getElementById('custRegistDate').value = new Date().toISOString().split('T')[0];
  }
  
  modal.dataset.customerId = customerId || '';
  modal.style.display = 'block';
}

// 고객 저장
async function saveCustomer() {
  const modal = document.getElementById('customerModal');
  const customerId = modal.dataset.customerId;

  const existingCustomer = customerId ? customers.find(c => c.id === customerId) : null;
  let registrant = existingCustomer ? getCustomerRegistrantValue(existingCustomer) : '';
  if (!registrant) {
    registrant = currentUser?.email || '';
  }

  const customerData = {
    no: document.getElementById('custNo').value.trim(),
    company: document.getElementById('custCompany').value.trim(),
    manager: document.getElementById('custManager').value.trim(),
    region: document.getElementById('custRegion').value,
    phone1: document.getElementById('custPhone1').value.trim(),
    phone2: document.getElementById('custPhone2').value.trim(),
    email: document.getElementById('custEmail').value.trim(),
    mainCustomer: normalizeMainCustomerFlag(document.getElementById('custMainCustomer').value),
    address: document.getElementById('custAddress').value.trim(),
    date: parseDate(document.getElementById('custDate').value),
    registDate: parseDate(document.getElementById('custRegistDate').value),
    remark: document.getElementById('custRemark').value.trim(),
    registrant,
    registrantName: formatUserDisplay(registrant),
    modifiedDate: new Date().toISOString().split('T')[0],
    modifiedBy: currentUser.email
  };

  const remarkHistory = existingCustomer?.remarkHistory ? [...existingCustomer.remarkHistory] : [];
  const previousRemark = (existingCustomer?.remark || '').trim();
  if (customerData.remark !== previousRemark) {
    remarkHistory.push({
      timestamp: new Date().toISOString(),
      value: customerData.remark,
      modifiedBy: currentUser.email
    });
  }
  customerData.remarkHistory = remarkHistory;

  if (!customerData.no || !customerData.company) {
    alert('NO.와 회사명은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    showLoading();
    
    if (customerId) {
      // 수정
      await db.ref(`${paths.customers}/${customerId}`).update(customerData);
      logActivity('customer_updated', `고객 정보 수정: ${customerData.company}`);
    } else {
      // 신규
      customerData.createdAt = new Date().toISOString();
      customerData.createdBy = registrant;
      customerData.createdByName = formatUserDisplay(registrant);

      await db.ref(paths.customers).push(customerData);
      logActivity('customer_created', `새 고객 등록: ${customerData.company}`);
    }
    
    closeCustomerModal();
    showNotification('고객 정보가 저장되었습니다.', 'success');
  } catch (error) {
    console.error('고객 저장 오류:', error);
    showNotification('고객 저장에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

function closeCustomerModal() {
  const modal = document.getElementById('customerModal');
  if (!modal) return;

  modal.style.display = 'none';
  modal.dataset.customerId = '';
}

// 고객 편집
function editCustomer(customerId) {
  openCustomerModal(customerId);
}

// 고객 상세 보기
function viewCustomerDetail(customerId) {
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return;
  
  const detailHtml = `
    <h3>${customer.company}</h3>
    <p><strong>NO.:</strong> ${customer.no || '-'}</p>
    <p><strong>담당자:</strong> ${customer.manager || '-'}</p>
    <p><strong>지역:</strong> ${customer.region || '-'}</p>
    <p><strong>전화1:</strong> ${customer.phone1 || '-'}</p>
    <p><strong>전화2:</strong> ${customer.phone2 || '-'}</p>
    <p><strong>이메일:</strong> ${customer.email || '-'}</p>
    <p><strong>주요고객:</strong> ${normalizeMainCustomerFlag(customer.mainCustomer)}</p>
    <p><strong>등록자:</strong> ${getCustomerRegistrantDisplay(customer) || '-'}</p>
    <p><strong>주소:</strong> ${customer.address || '-'}</p>
    <p><strong>DATE:</strong> ${customer.date ? formatDate(customer.date) : '-'}</p>
    <p><strong>등록일:</strong> ${formatDate(customer.registDate) || '-'}</p>
    <p><strong>수정일:</strong> ${formatDate(customer.modifiedDate) || '-'}</p>
    <p><strong>비고:</strong> ${customer.remark || '-'}</p>
  `;
  
  showContentModal(detailHtml, '고객 상세 정보');
}


// 고객 삭제
async function deleteCustomer(customerId) {
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return;
  
  const customerName = getCustomerDisplayName(customer);
  if (confirm(`${customerName} 고객을 삭제하시겠습니까?\n관련된 모든 데이터가 함께 삭제됩니다.`)) {
    try {
      showLoading();
      
      // 고객 삭제
      await db.ref(`${paths.customers}/${customerId}`).remove();
      
      // 관련 데이터 삭제
      const batch = [];
      
      // 관련 거래 삭제
      deals.filter(d => d.customerId === customerId).forEach(deal => {
        batch.push(db.ref(`${paths.deals}/${deal.id}`).remove());
      });
      
      // 관련 커뮤니케이션 삭제
      communications.filter(c => c.customerId === customerId).forEach(comm => {
        batch.push(db.ref(`${paths.communications}/${comm.id}`).remove());
      });
      
      // 관련 일정 삭제
      events.filter(e => e.customerId === customerId).forEach(event => {
        batch.push(db.ref(`${paths.events}/${event.id}`).remove());
      });
      
      await Promise.all(batch);
      
      logActivity('customer_deleted', `고객 삭제: ${customerName}`);
      showNotification('고객이 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('고객 삭제 오류:', error);
      showNotification('고객 삭제에 실패했습니다.', 'error');
    } finally {
      hideLoading();
    }
  }
}

// 고객 검색 (호환용)
function searchCustomers() {
  applyCustomerFilters();
}

// 고객 필터링 (호환용)
function filterCustomers() {
  applyCustomerFilters();
}

// 빠른 고객 추가
function quickAddCustomer() {
  openCustomerModal();
}

// 고객 가져오기
function importCustomers() {
  openCustomerImportModal();
}

function openCustomerImportModal() {
  const modal = document.getElementById('customerImportModal');
  if (modal) {
    modal.style.display = 'block';
  }
}

function closeCustomerImportModal() {
  const modal = document.getElementById('customerImportModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function startCustomerImport(mode = 'partial') {
  closeCustomerImportModal();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showLoading();

      const data = await readExcelFile(file);
      const importCount = await importCustomerData(data, mode);

      showNotification(`${importCount}명의 고객을 가져왔습니다.`, 'success');
      loadCustomers();
    } catch (error) {
      console.error('가져오기 오류:', error);
      showNotification('파일 가져오기에 실패했습니다.', 'error');
    } finally {
      hideLoading();
    }
  };
  input.click();
}

// 고객 가져오기
async function exportCustomers() {
  try {
    showLoading();

    const headers = ['NO.', '회사명', '담당자', '지역', '전화1', '전화2', '이메일', '주요고객', '등록자', '등록일', '비고', '비고 히스토리', '주소', 'DATE', '수정일'];

    const data = customers.map(customer => {
      const normalized = normalizeCustomerRecord(customer);
      return {
        'NO.': normalized.no || '',
        '회사명': normalized.company || '',
        '담당자': normalized.manager || '',
        '지역': normalized.region || '',
        '전화1': normalized.phone1 || '',
        '전화2': normalized.phone2 || '',
        '이메일': normalized.email || '',
        '주요고객': normalizeMainCustomerFlag(normalized.mainCustomer),
        '등록자': getCustomerRegistrantValue(normalized),
        '등록일': normalized.registDate ? formatDate(normalized.registDate) : '',
        '비고': normalized.remark || '',
        '비고 히스토리': (normalized.remarkHistory || []).length,
        '주소': normalized.address || '',
        'DATE': normalized.date ? formatDate(normalized.date) : '',
        '수정일': normalized.modifiedDate ? formatDate(normalized.modifiedDate) : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(data, {header: headers, skipHeader: true});
    XLSX.utils.sheet_add_aoa(ws, [headers], {origin: 'A1'});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "고객목록");

    const fileName = `CRM_고객목록_${formatDate(new Date(), 'YYYYMMDD')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showNotification('고객 목록을 다운로드했습니다.', 'success');
  } catch (error) {
    console.error('내보내기 오류:', error);
    showNotification('내보내기에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}
// 영업 안건 뷰 로드
function loadSalesView() {
  updateStatusCounts();
  updateSalesTable();
  updateSidebarList();
}

// 상태 카운트 업데이트
function updateStatusCounts() {
  const counts = {
    total: salesData.length,
    progress: 0,
    complete: 0,
    failed: 0,
    thisMonth: 0
  };
  
  const today = new Date();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();
  
  salesData.forEach(row => {
    // 진행 상황별 카운트
    if (['초기상담', '제안서제출', '견적진행', '계약협상'].includes(row.progress)) {
      counts.progress++;
    } else if (row.progress === '계약완료') {
      counts.complete++;
    } else if (row.progress === '실주') {
      counts.failed++;
    }
    
    // 이번달 등록 카운트
    if (row.registDate) {
      const regDate = new Date(row.registDate);
      if (regDate.getMonth() === thisMonth && regDate.getFullYear() === thisYear) {
        counts.thisMonth++;
      }
    }
  });
  
  document.getElementById('countTotal').textContent = counts.total;
  document.getElementById('countProgress').textContent = counts.progress;
  document.getElementById('countComplete').textContent = counts.complete;
  document.getElementById('countFailed').textContent = counts.failed;
  document.getElementById('countThisMonth').textContent = counts.thisMonth;
}

// 사이드바 업데이트 (영업 안건용)
function updateSidebarList() {
  // 영업 안건 뷰에서는 사이드바를 사용하지 않으므로 스킵
}

// 영업 테이블 업데이트
function updateSalesTable() {
  if (filteredData.length > 0) {
    updateTable();
  } else {
    loadAllSalesData();
  }
}

// 필터 적용
function applyFilters() {
  if (salesData.length === 0) {
    return;
  }
  
  const filters = {
    no: document.getElementById('filterNo').value.toLowerCase().trim(),
    region: document.getElementById('filterRegion').value.toLowerCase().trim(),
    product: document.getElementById('filterProduct').value,
    project: document.getElementById('filterProject').value.toLowerCase().trim(),
    type: document.getElementById('filterType').value,
    customer: document.getElementById('filterCustomer').value.toLowerCase().trim(),
    manager: document.getElementById('filterManager').value.toLowerCase().trim(),
    status: document.getElementById('filterStatus').value
  };
  
  const hasActiveFilter = Object.values(filters).some(val => val !== '');
  
  if (!hasActiveFilter) {
    filteredData = [];
    updateTable();
    return;
  }
  
  filteredData = salesData.filter(row => {
    if (!row || !row.uid) return false;
    
    if (filters.no && !String(row.no || '').toLowerCase().includes(filters.no)) {
      return false;
    }
    
    if (filters.region && !String(row.region || '').toLowerCase().includes(filters.region)) {
      return false;
    }
    
    if (filters.product && row.product !== filters.product) {
      return false;
    }
    
    if (filters.project && !String(row.projectName || '').toLowerCase().includes(filters.project)) {
      return false;
    }
    
    if (filters.type && row.type !== filters.type) {
      return false;
    }
    
    if (filters.customer && !String(row.customer || '').toLowerCase().includes(filters.customer)) {
      return false;
    }
    
    if (filters.manager && !String(row.manager || '').toLowerCase().includes(filters.manager)) {
      return false;
    }
    
    if (filters.status && row.progress !== filters.status) {
      return false;
    }
    
    return true;
  });
  
  if (sortField) {
    applySorting();
  }
  
  updateTable();
}

// 정렬 적용
function applySorting() {
  if (!sortField) return;
  
  filteredData.sort((a, b) => {
    let aVal = a[sortField] || '';
    let bVal = b[sortField] || '';
    
    // 날짜 필드의 경우
    if (['registDate', 'date', 'modifiedDate'].includes(sortField)) {
      const aDate = aVal ? new Date(aVal) : new Date(0);
      const bDate = bVal ? new Date(bVal) : new Date(0);
      return sortAsc ? aDate - bDate : bDate - aDate;
    }
    
    // 숫자 필드의 경우
    if (sortField === 'bidAmount') {
      const aNum = parseFloat(String(aVal).replace(/,/g, '')) || 0;
      const bNum = parseFloat(String(bVal).replace(/,/g, '')) || 0;
      return sortAsc ? aNum - bNum : bNum - aNum;
    }
    
    // 문자열 필드의 경우
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });
}

// 테이블 업데이트
function updateTable() {
  const tbody = document.getElementById('salesBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  filteredData.forEach(row => {
    const tr = createTableRow(row);
    tbody.appendChild(tr);
  });
}

// 테이블 행 생성
function createTableRow(row) {
  const tr = document.createElement('tr');
  
  // 체크박스
  const tdChk = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.classList.add('rowSelectChk');
  chk.dataset.uid = row.uid;
  tdChk.appendChild(chk);
  tr.appendChild(tdChk);
  
  // 데이터 필드들
  const fields = ['no', 'region', 'registDate', 'product', 'projectName', 'type', 
                  'bidAmount', 'currency', 'customer', 'manager', 'date', 'progress', 
                  'remark', 'status', 'modifiedDate'];
  
  fields.forEach(field => {
    const td = document.createElement('td');
    td.dataset.field = field;
    
    if (field === 'registDate' || field === 'date') {
      const inp = document.createElement('input');
      inp.type = 'date';
      inp.value = row[field] || '';
      inp.dataset.uid = row.uid;
      inp.dataset.field = field;
      inp.addEventListener('change', onCellChange);
      td.appendChild(inp);
    } else if (field === 'product') {
      const sel = document.createElement('select');
      ['설비제어', '배전반', 'BWMS', 'ECO', '기타'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      sel.value = row[field] || '설비제어';
      sel.dataset.uid = row.uid;
      sel.dataset.field = field;
      sel.addEventListener('change', onCellChange);
      td.appendChild(sel);
    } else if (field === 'type') {
      const sel = document.createElement('select');
      ['신조', '개조'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      sel.value = row[field] || '신조';
      sel.dataset.uid = row.uid;
      sel.dataset.field = field;
      sel.addEventListener('change', onCellChange);
      td.appendChild(sel);
    } else if (field === 'currency') {
      const sel = document.createElement('select');
      ['KRW', 'USD'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      sel.value = row[field] || 'KRW';
      sel.dataset.uid = row.uid;
      sel.dataset.field = field;
      sel.addEventListener('change', onCellChange);
      td.appendChild(sel);
    } else if (field === 'progress') {
      const sel = document.createElement('select');
      ['초기상담', '제안서제출', '견적진행', '계약협상', '계약완료', '진행보류', '실주'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      sel.value = row[field] || '초기상담';
      sel.dataset.uid = row.uid;
      sel.dataset.field = field;
      sel.addEventListener('change', onCellChange);
      td.appendChild(sel);
    } else if (field === 'remark' || field === 'status') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = row[field] || '';
      inp.style.width = '95%';
      inp.dataset.uid = row.uid;
      inp.dataset.field = field;
      inp.addEventListener('change', onCellChange);
      inp.addEventListener('dblclick', () => openContentModal(row[field], row.uid, field));
      inp.title = '더블클릭하면 전체 내용을 볼 수 있습니다';
      td.appendChild(inp);
    } else if (field === 'modifiedDate') {
      td.textContent = row[field] || '';
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = row[field] || '';
      inp.style.width = '95%';
      inp.dataset.uid = row.uid;
      inp.dataset.field = field;
      inp.addEventListener('change', onCellChange);
      td.appendChild(inp);
    }
    
    tr.appendChild(td);
  });
  
  // 진행 상황에 따른 행 색상
  const progressCell = tr.querySelector('td[data-field="progress"] select');
  if (progressCell) {
    const progress = progressCell.value;
    if (progress === '계약완료') {
      tr.style.backgroundColor = '#d4edda';
    } else if (progress === '실주') {
      tr.style.backgroundColor = '#f8d7da';
    } else if (progress === '진행보류') {
      tr.style.backgroundColor = '#fff3cd';
    }
  }
  
  return tr;
}

// 셀 변경 이벤트
function onCellChange(e) {
  const uid = e.target.dataset.uid;
  const field = e.target.dataset.field;
  const newVal = e.target.value;
  
  const row = salesData.find(x => x.uid === uid);
  if (!row) return;
  
  const oldVal = row[field] || '';
  if (oldVal === newVal) return;
  
  row[field] = newVal;
  
  const now = new Date().toISOString().split('T')[0];
  row.modifiedDate = now;
  
  modifiedRows.add(uid);
  
  // 진행 상황 변경 시 행 색상 업데이트
  if (field === 'progress') {
    const tr = e.target.closest('tr');
    if (newVal === '계약완료') {
      tr.style.backgroundColor = '#d4edda';
    } else if (newVal === '실주') {
      tr.style.backgroundColor = '#f8d7da';
    } else if (newVal === '진행보류') {
      tr.style.backgroundColor = '#fff3cd';
    } else {
      tr.style.backgroundColor = '';
    }
  }
  
  // 필터가 적용된 데이터도 업데이트
  const filteredRow = filteredData.find(x => x.uid === uid);
  if (filteredRow) {
    filteredRow[field] = newVal;
    filteredRow.modifiedDate = now;
  }
}

// 전체 영업 데이터 로드
function loadAllSalesData() {
  if (salesData.length === 0) {
    return;
  }
  
  filteredData = [...salesData];
  
  if (sortField) {
    applySorting();
  }
  
  updateTable();
}

// 모든 필터 초기화
function clearAllFilters() {
  document.getElementById('filterNo').value = '';
  document.getElementById('filterRegion').value = '';
  document.getElementById('filterProduct').value = '';
  document.getElementById('filterProject').value = '';
  document.getElementById('filterType').value = '';
  document.getElementById('filterCustomer').value = '';
  document.getElementById('filterManager').value = '';
  document.getElementById('filterStatus').value = '';
}

// 새 행 추가
function addNewRow() {
  const uid = db.ref().push().key;
  const now = new Date().toISOString().split('T')[0];
  
  const newNo = Math.max(...salesData.map(r => parseInt(r.no) || 0), 0) + 1;
  
  const obj = {
    uid,
    no: String(newNo),
    region: '',
    registDate: now,
    product: '설비제어',
    projectName: '',
    type: '신조',
    bidAmount: '',
    currency: 'KRW',
    customer: '',
    manager: currentUser.displayName || currentUser.email.split('@')[0],
    date: '',
    progress: '초기상담',
    remark: '',
    status: '',
    modifiedDate: now
  };
  
  salesData.unshift(obj);
  modifiedRows.add(uid);
  
  clearAllFilters();
  loadAllSalesData();
}

// 선택 행 삭제
async function deleteSelectedRows() {
  const cks = document.querySelectorAll('.rowSelectChk:checked');
  if (!cks.length) {
    alert("삭제할 행을 선택하세요.");
    return;
  }
  if (!confirm("정말 삭제하시겠습니까?")) return;
  
  const uidsToDelete = Array.from(cks).map(chk => chk.dataset.uid);
  
  try {
    showLoading();
    
    const updates = {};
    uidsToDelete.forEach(uid => {
      updates[`${paths.salesData}/${uid}`] = null;
    });
    
    await db.ref().update(updates);
    
    salesData = salesData.filter(x => !uidsToDelete.includes(x.uid));
    
    if (filteredData.length > 0) {
      filteredData = filteredData.filter(x => !uidsToDelete.includes(x.uid));
    }
    
    document.getElementById('selectAll').checked = false;
    
    updateTable();
    updateStatusCounts();
    
    addHistory(`${uidsToDelete.length}개 항목 삭제`);
    
    showNotification(`${uidsToDelete.length}개 항목이 삭제되었습니다.`, 'success');
    
  } catch (error) {
    console.error("삭제 중 오류 발생:", error);
    showNotification("삭제 중 오류가 발생했습니다.", 'error');
    loadAllData();
  } finally {
    hideLoading();
  }
}

// 모든 체크박스 선택/해제
function toggleSelectAll(e) {
  const cks = document.querySelectorAll('.rowSelectChk');
  cks.forEach(c => c.checked = e.target.checked);
}

// 데이터 저장
function saveAllData() {
  if (modifiedRows.size === 0) {
    alert("수정된 내용이 없습니다.");
    return;
  }
  
  if (!confirm(`수정된 ${modifiedRows.size}개 항목을 저장하시겠습니까?`)) return;
  
  const saveBtn = document.getElementById('saveBtn');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "저장 중...";
  saveBtn.disabled = true;
  
  const updates = {};
  modifiedRows.forEach(uid => {
    const row = salesData.find(r => r.uid === uid);
    if (row) {
      updates[uid] = row;
    }
  });
  
  db.ref(paths.salesData).update(updates)
    .then(() => {
      const count = modifiedRows.size;
      modifiedRows.clear();
      
      alert(`${count}개 항목 저장 완료`);
      addHistory(`수정된 ${count}개 항목 저장`);
      
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
      
      updateStatusCounts();
    })
    .catch(err => {
      alert("저장 중 오류 발생: " + err.message);
      console.error("저장 오류:", err);
      
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    });
}

// 테이블 클릭 이벤트 핸들러
function handleTableClick(e) {
  if ((e.target.tagName === 'TH' || e.target.closest('th')) && !e.target.classList.contains('col-resizer')) {
    const th = e.target.tagName === 'TH' ? e.target : e.target.closest('th');
    const field = th.dataset.field;
    
    if (!field) return;
    
    document.querySelectorAll('th .sort-indicator').forEach(indicator => {
      indicator.remove();
    });
    
    if (sortField === field) {
      sortAsc = !sortAsc;
    } else {
      sortField = field;
      sortAsc = true;
    }
    
    const sortIndicator = document.createElement('span');
    sortIndicator.className = 'sort-indicator';
    sortIndicator.innerHTML = sortAsc ? ' &#9650;' : ' &#9660;';
    th.appendChild(sortIndicator);
    
    if (filteredData.length > 0) {
      applySorting();
      updateTable();
    }
  }
}

// 엑셀 다운로드
function downloadExcel() {
  const btn = document.getElementById('downloadExcelBtn');
  const originalText = btn.textContent;
  btn.textContent = "다운로드 중...";
  btn.disabled = true;
  
  setTimeout(() => {
    try {
      const arr = salesData.map(d => ({
        'NO.': d.no,
        '지역': d.region,
        '등록일': d.registDate,
        '제품': d.product,
        '프로젝트명': d.projectName,
        '유형': d.type,
        '입찰금액': d.bidAmount,
        '통화': d.currency,
        '고객사': d.customer,
        '담당자': d.manager,
        'DATE': d.date,
        '진행현황': d.progress,
        'REMARK': d.remark,
        '현황': d.status,
        '수정일': d.modifiedDate
      }));
      
      const ws = XLSX.utils.json_to_sheet(arr);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales_Data");
      
      XLSX.writeFile(wb, "Sales_Data.xlsx");
    } catch (err) {
      console.error("엑셀 다운로드 오류:", err);
      alert("엑셀 다운로드 중 오류가 발생했습니다.");
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }, 100);
}

// 엑셀 업로드 진행
function proceedExcelUpload(mode) {
  document.getElementById('uploadExcelInput').click();
  document.getElementById('uploadExcelInput').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    readExcelFile(file, mode);
    e.target.value = '';
  };
}

// 엑셀 파일 읽기
function readExcelFile(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type: 'array', cellDates: true});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {defval: ""});
        
        if (mode) {
          // 영업 데이터 처리
          processSalesExcelData(json, mode);
        } else {
          // 일반 엑셀 데이터 반환
          resolve(json);
        }
      } catch (err) {
        console.error("엑셀 파일 처리 오류:", err);
        alert("엑셀 파일 처리 중 오류가 발생했습니다.");
        reject(err);
      }
    };
    
    reader.readAsArrayBuffer(file);
  });
}

// 영업 엑셀 데이터 처리
function processSalesExcelData(json, mode) {
  let newData = json.map(r => {
    const uid = db.ref().push().key;
    const now = new Date().toISOString().split('T')[0];
    return {
      uid,
      no: String(r['NO.'] || ''),
      region: String(r['지역'] || ''),
      registDate: parseDate(r['등록일'] || ''),
      product: String(r['제품'] || '설비제어'),
      projectName: String(r['프로젝트명'] || ''),
      type: String(r['유형'] || '신조'),
      bidAmount: String(r['입찰금액'] || ''),
      currency: String(r['통화'] || 'KRW'),
      customer: String(r['고객사'] || ''),
      manager: String(r['담당자'] || ''),
      date: parseDate(r['DATE'] || ''),
      progress: String(r['진행현황'] || '초기상담'),
      remark: String(r['REMARK'] || ''),
      status: String(r['현황'] || ''),
      modifiedDate: parseDate(r['수정일'] || '') || now
    };
  });
  
  if (mode === 'replace') {
    db.ref(paths.salesData).remove().then(() => {
      const updates = {};
      newData.forEach(obj => {
        updates[obj.uid] = obj;
      });
      
      db.ref(paths.salesData).update(updates)
        .then(() => {
          salesData = newData;
          clearAllFilters();
          loadAllSalesData();
          updateStatusCounts();
          alert(`엑셀 업로드(교체) 완료 (총 ${json.length}건)`);
        })
        .catch(err => {
          console.error("엑셀 업로드 오류:", err);
          alert("데이터 저장 중 오류가 발생했습니다.");
        });
    });
  } else {
    const updates = {};
    newData.forEach(obj => {
      updates[obj.uid] = obj;
    });
    
    db.ref(paths.salesData).update(updates)
      .then(() => {
        salesData = salesData.concat(newData);
        clearAllFilters();
        loadAllSalesData();
        updateStatusCounts();
        alert(`엑셀 업로드(추가) 완료 (총 ${json.length}건)`);
      })
      .catch(err => {
        console.error("엑셀 업로드 오류:", err);
        alert("데이터 저장 중 오류가 발생했습니다.");
      });
  }
}

// 날짜 파싱
function parseDate(v) {
  if (!v) return '';
  
  if (typeof v === 'object' && v instanceof Date) {
    return toYMD(v);
  }
  
  if (typeof v === 'string') {
    let s = v.trim().replace(/\//g, '-').replace(/\./g, '-');
    if (s === '' || s === '0') return '';
    
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts.length === 3) {
        let yy = parts[0].padStart(4, '0');
        let mm = parts[1].padStart(2, '0');
        let dd = parts[2].padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
      }
    }
    return s;
  }
  
  return '';
}

// 날짜를 YYYY-MM-DD 형식으로 변환
function toYMD(dt) {
  const y = dt.getFullYear();
  const m = ('0' + (dt.getMonth() + 1)).slice(-2);
  const d = ('0' + dt.getDate()).slice(-2);
  return `${y}-${m}-${d}`;
}

// 히스토리 추가
function addHistory(msg) {
  const k = db.ref(paths.salesHistory).push().key;
  const t = new Date().toISOString();
  db.ref(`${paths.salesHistory}/${k}`).set({time: t, msg, user: currentUser.email});
}

// 히스토리 모달 표시
function showHistoryModal() {
  db.ref(paths.salesHistory).once('value').then(snap => {
    const val = snap.val() || {};
    const arr = [];
    Object.entries(val).forEach(([, item]) => arr.push(item));
    
    arr.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    const hl = document.getElementById('historyList');
    hl.innerHTML = '';
    
    if (arr.length === 0) {
      const li = document.createElement('li');
      li.textContent = '히스토리가 없습니다.';
      hl.appendChild(li);
    } else {
      arr.forEach(it => {
        const li = document.createElement('li');
        li.textContent = `[${it.time}] ${it.msg} (${it.user || 'unknown'})`;
        hl.appendChild(li);
      });
    }
    
    document.getElementById('historyModal').style.display = 'block';
  });
}

// 히스토리 모달 닫기
function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

// 히스토리 전체 삭제
function clearHistory() {
  if (!confirm("히스토리를 전체 삭제하시겠습니까?")) return;
  
  db.ref(paths.salesHistory).remove().then(() => {
    document.getElementById('historyList').innerHTML = '<li>히스토리가 없습니다.</li>';
    alert("히스토리 삭제 완료");
  });
}

// 담당자별 현황 모달 열기
function openManagerStatusModal() {
  loadManagerStatus();
  const modal = document.getElementById('managerStatusModal');
  modal.style.display = 'block';
  modal.classList.remove('fullscreen');
}

// 담당자별 현황 모달 닫기
function closeManagerStatusModal() {
  document.getElementById('managerStatusModal').style.display = 'none';
}

// 담당자별 현황 데이터 로드
function loadManagerStatus() {
  const managers = new Map();
  
  salesData.forEach(row => {
    const manager = row.manager || '미지정';
    if (!managers.has(manager)) {
      managers.set(manager, {
        name: manager,
        total: 0,
        progress: 0,
        complete: 0,
        failed: 0,
        pending: 0,
        thisMonth: 0,
        bidAmount: 0
      });
    }
    
    const stats = managers.get(manager);
    stats.total++;
    
    // 진행 상황별 카운트
    if (['초기상담', '제안서제출', '견적진행', '계약협상'].includes(row.progress)) {
      stats.progress++;
    } else if (row.progress === '계약완료') {
      stats.complete++;
    } else if (row.progress === '실주') {
      stats.failed++;
    } else if (row.progress === '진행보류') {
      stats.pending++;
    }
    
    // 이번달 등록 건수
    if (row.registDate) {
      const regDate = new Date(row.registDate);
      const today = new Date();
      if (regDate.getMonth() === today.getMonth() && regDate.getFullYear() === today.getFullYear()) {
        stats.thisMonth++;
      }
    }
    
    // 입찰금액 합계
    if (row.bidAmount && row.currency) {
      const amount = parseFloat(row.bidAmount.replace(/,/g, '')) || 0;
      if (row.currency === 'USD') {
        stats.bidAmount += amount * 1300; // USD to KRW 환율 적용
      } else {
        stats.bidAmount += amount;
      }
    }
  });
  
  displayManagerStatus(Array.from(managers.values()));
}

// 담당자별 현황 표시
function displayManagerStatus(managerStats) {
  const container = document.getElementById('managerStatusList');
  container.innerHTML = '';
  
  const sortType = document.getElementById('managerStatusSort').value;
  managerStats.sort((a, b) => {
    switch(sortType) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'total':
        return b.total - a.total;
      case 'progress':
        return b.progress - a.progress;
      case 'complete':
        return b.complete - a.complete;
      default:
        return 0;
    }
  });
  
  const table = document.createElement('table');
  table.className = 'manager-status-table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>담당자</th>
      <th>전체</th>
      <th>진행중</th>
      <th>완료</th>
      <th>실주</th>
      <th>보류</th>
      <th>이번달</th>
      <th>예상금액(원)</th>
      <th>완료율</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  
  managerStats.forEach(manager => {
    const tr = document.createElement('tr');
    
    const completeRate = manager.total > 0 ? ((manager.complete / manager.total) * 100).toFixed(1) : 0;
    const progressRate = manager.total > 0 ? ((manager.progress / manager.total) * 100).toFixed(1) : 0;
    
    tr.innerHTML = `
      <td style="font-weight: bold;">${manager.name}</td>
      <td style="text-align: center;">${manager.total}</td>
      <td style="text-align: center; color: #17a2b8;">${manager.progress}</td>
      <td style="text-align: center; color: #28a745;">${manager.complete}</td>
      <td style="text-align: center; color: #dc3545;">${manager.failed}</td>
      <td style="text-align: center; color: #ffc107;">${manager.pending}</td>
      <td style="text-align: center; color: #007bff;">${manager.thisMonth}</td>
      <td style="text-align: right;">${manager.bidAmount.toLocaleString()}</td>
      <td style="text-align: center;">
        <div style="display: flex; align-items: center; gap: 5px;">
          <div style="flex: 1; background: #e9ecef; border-radius: 4px; height: 20px; position: relative; overflow: hidden;">
            <div style="position: absolute; left: 0; top: 0; height: 100%; background: #28a745; width: ${completeRate}%;"></div>
            <div style="position: absolute; left: ${completeRate}%; top: 0; height: 100%; background: #17a2b8; width: ${progressRate}%;"></div>
          </div>
          <span style="font-size: 0.8em;">${completeRate}%</span>
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // 합계 행 추가
  const totalRow = document.createElement('tr');
  totalRow.style.fontWeight = 'bold';
  totalRow.style.backgroundColor = '#f8f9fa';
  
  const totals = managerStats.reduce((acc, m) => ({
    total: acc.total + m.total,
    progress: acc.progress + m.progress,
    complete: acc.complete + m.complete,
    failed: acc.failed + m.failed,
    pending: acc.pending + m.pending,
    thisMonth: acc.thisMonth + m.thisMonth,
    bidAmount: acc.bidAmount + m.bidAmount
  }), { total: 0, progress: 0, complete: 0, failed: 0, pending: 0, thisMonth: 0, bidAmount: 0 });
  
  const totalCompleteRate = totals.total > 0 ? ((totals.complete / totals.total) * 100).toFixed(1) : 0;
  
  totalRow.innerHTML = `
    <td>합계</td>
    <td style="text-align: center;">${totals.total}</td>
    <td style="text-align: center; color: #17a2b8;">${totals.progress}</td>
    <td style="text-align: center; color: #28a745;">${totals.complete}</td>
    <td style="text-align: center; color: #dc3545;">${totals.failed}</td>
    <td style="text-align: center; color: #ffc107;">${totals.pending}</td>
    <td style="text-align: center; color: #007bff;">${totals.thisMonth}</td>
    <td style="text-align: right;">${totals.bidAmount.toLocaleString()}</td>
    <td style="text-align: center;">${totalCompleteRate}%</td>
  `;
  
  tbody.appendChild(totalRow);
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  // 차트 추가
  addManagerChart(managerStats);
}

// 담당자별 차트 추가
function addManagerChart(managerStats) {
  const container = document.getElementById('managerStatusList');
  
  const chartDiv = document.createElement('div');
  chartDiv.style.marginTop = '30px';
  chartDiv.style.padding = '20px';
  chartDiv.style.backgroundColor = '#f8f9fa';
  chartDiv.style.borderRadius = '8px';
  
  const chartTitle = document.createElement('h3');
  chartTitle.textContent = '담당자별 진행 현황 차트';
  chartTitle.style.marginBottom = '20px';
  chartDiv.appendChild(chartTitle);
  
  const chartContainer = document.createElement('div');
  chartContainer.style.display = 'flex';
  chartContainer.style.flexWrap = 'wrap';
  chartContainer.style.gap = '15px';
  
  managerStats.forEach(manager => {
    const barContainer = document.createElement('div');
    barContainer.style.flex = '1';
    barContainer.style.minWidth = '200px';
    barContainer.style.padding = '10px';
    barContainer.style.backgroundColor = '#fff';
    barContainer.style.borderRadius = '6px';
    barContainer.style.border = '1px solid #dee2e6';
    
    const nameDiv = document.createElement('div');
    nameDiv.textContent = manager.name;
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.marginBottom = '10px';
    nameDiv.style.textAlign = 'center';
    barContainer.appendChild(nameDiv);
    
    const bars = [
      { label: '진행중', value: manager.progress, color: '#17a2b8' },
      { label: '완료', value: manager.complete, color: '#28a745' },
      { label: '실주', value: manager.failed, color: '#dc3545' },
      { label: '보류', value: manager.pending, color: '#ffc107' }
    ];
    
    bars.forEach(bar => {
      if (bar.value > 0) {
        const barRow = document.createElement('div');
        barRow.style.display = 'flex';
        barRow.style.alignItems = 'center';
        barRow.style.marginBottom = '5px';
        barRow.style.gap = '10px';
        
        const labelDiv = document.createElement('div');
        labelDiv.textContent = bar.label;
        labelDiv.style.width = '60px';
        labelDiv.style.fontSize = '0.8em';
        barRow.appendChild(labelDiv);
        
        const barOuter = document.createElement('div');
        barOuter.style.flex = '1';
        barOuter.style.height = '20px';
        barOuter.style.backgroundColor = '#e9ecef';
        barOuter.style.borderRadius = '4px';
        barOuter.style.position = 'relative';
        
        const barInner = document.createElement('div');
        const percentage = manager.total > 0 ? (bar.value / manager.total) * 100 : 0;
        barInner.style.width = percentage + '%';
        barInner.style.height = '100%';
        barInner.style.backgroundColor = bar.color;
        barInner.style.borderRadius = '4px';
        barInner.style.transition = 'width 0.5s ease';
        
        const valueDiv = document.createElement('div');
        valueDiv.textContent = bar.value;
        valueDiv.style.position = 'absolute';
        valueDiv.style.right = '5px';
        valueDiv.style.top = '50%';
        valueDiv.style.transform = 'translateY(-50%)';
        valueDiv.style.fontSize = '0.75em';
        valueDiv.style.fontWeight = 'bold';
        
        barOuter.appendChild(barInner);
        barOuter.appendChild(valueDiv);
        barRow.appendChild(barOuter);
        
        barContainer.appendChild(barRow);
      }
    });
    
    chartContainer.appendChild(barContainer);
  });
  
  chartDiv.appendChild(chartContainer);
  container.appendChild(chartDiv);
}

// 담당자별 현황 정렬
function sortManagerStatus() {
  loadManagerStatus();
}

// 담당자별 현황 전체화면 토글
function toggleManagerStatusFullscreen() {
  const modal = document.getElementById('managerStatusModal');
  modal.classList.toggle('fullscreen');
}

// 영업 지표 분석 모달 열기
function openSalesAnalysisModal() {
  const modal = document.getElementById('salesAnalysisModal');
  if (!modal) {
    console.error('salesAnalysisModal 요소를 찾을 수 없습니다');
    return;
  }
  modal.style.display = 'block';
  setTimeout(() => {
    updateSalesAnalysis();
  }, 100);
}

// 영업 지표 분석 모달 닫기
function closeSalesAnalysisModal() {
  document.getElementById('salesAnalysisModal').style.display = 'none';
  
  // 차트 인스턴스 정리
  Object.keys(chartInstances).forEach(key => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
    }
  });
  chartInstances = {};
}

// 영업 지표 분석 업데이트
function updateSalesAnalysis() {
  const dateFilter = document.getElementById('analysisDateFilter').value;
  const productFilter = document.getElementById('analysisProductFilter').value;
  
  // 필터링된 데이터 가져오기
  const filteredData = getFilteredDataForAnalysis(dateFilter, productFilter);
  
  // KPI 업데이트
  updateKPICards(filteredData);
  
  // 차트 업데이트
  updateProgressChart(filteredData);
  updateMonthlyTrendChart(filteredData);
  updateProductChart(filteredData);
  updateCustomerChart(filteredData);
  
  // 상세 테이블 업데이트
  updateAnalysisDetailTable(filteredData);
  
  // 인사이트 업데이트
  updateSalesInsights(filteredData);
}

// 날짜 필터에 따른 데이터 필터링
function getFilteredDataForAnalysis(dateFilter, productFilter) {
  let filtered = [...salesData];
  
  // 제품 필터
  if (productFilter !== 'all') {
    filtered = filtered.filter(row => row.product === productFilter);
  }
  
  // 날짜 필터
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);
  
  switch(dateFilter) {
    case 'thisYear':
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === currentYear;
      });
      break;
    case 'lastYear':
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === currentYear - 1;
      });
      break;
    case 'thisQuarter':
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === currentYear && 
               Math.floor(date.getMonth() / 3) === currentQuarter;
      });
      break;
    case 'lastQuarter':
      const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const lastQuarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === lastQuarterYear && 
               Math.floor(date.getMonth() / 3) === lastQuarter;
      });
      break;
    case 'thisMonth':
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === currentYear && 
               date.getMonth() === currentMonth;
      });
      break;
    case 'lastMonth':
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date.getFullYear() === lastMonthYear && 
               date.getMonth() === lastMonth;
      });
      break;
    case 'last3Months':
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(today.getMonth() - 3);
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date >= threeMonthsAgo;
      });
      break;
    case 'last6Months':
      const sixMonthsAgo = new Date(today);
      sixMonthsAgo.setMonth(today.getMonth() - 6);
      filtered = filtered.filter(row => {
        const date = new Date(row.registDate || row.date);
        return date >= sixMonthsAgo;
      });
      break;
  }
  
  return filtered;
}

// KPI 카드 업데이트
function updateKPICards(data) {
  const container = document.getElementById('kpiCards');
  
  // 통계 계산
  const stats = calculateSalesStats(data);
  
  // KPI 카드 HTML 생성
  container.innerHTML = `
    <div class="kpi-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
      <h4>총 안건 수</h4>
      <div class="kpi-value">${stats.totalCount.toLocaleString()}</div>
      <div class="kpi-label">건</div>
    </div>
    <div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
      <h4>총 입찰금액</h4>
      <div class="kpi-value">${formatCurrency(stats.totalAmount)}</div>
      <div class="kpi-label">KRW</div>
    </div>
    <div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
      <h4>평균 입찰금액</h4>
      <div class="kpi-value">${formatCurrency(stats.avgAmount)}</div>
      <div class="kpi-label">건당</div>
    </div>
    <div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
      <h4>수주율</h4>
      <div class="kpi-value">${stats.winRate.toFixed(1)}%</div>
      <div class="kpi-label">계약완료/전체</div>
    </div>
    <div class="kpi-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
      <h4>진행중 금액</h4>
      <div class="kpi-value">${formatCurrency(stats.progressAmount)}</div>
      <div class="kpi-label">예상 매출</div>
    </div>
    <div class="kpi-card" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
      <h4>완료 금액</h4>
      <div class="kpi-value">${formatCurrency(stats.completeAmount)}</div>
      <div class="kpi-label">확정 매출</div>
    </div>
  `;
}

// 영업 통계 계산
function calculateSalesStats(data) {
  const stats = {
    totalCount: data.length,
    totalAmount: 0,
    avgAmount: 0,
    winRate: 0,
    progressAmount: 0,
    completeAmount: 0,
    failedAmount: 0,
    byProgress: {},
    byProduct: {},
    byCustomer: {},
    monthlyData: {}
  };
  
  data.forEach(row => {
    const amount = parseFloat(row.bidAmount?.replace(/,/g, '') || 0);
    const amountKRW = row.currency === 'USD' ? amount * 1300 : amount;
    
    stats.totalAmount += amountKRW;
    
    // 진행 상황별 집계
    const progress = row.progress || '미정';
    if (!stats.byProgress[progress]) {
      stats.byProgress[progress] = { count: 0, amount: 0 };
    }
    stats.byProgress[progress].count++;
    stats.byProgress[progress].amount += amountKRW;
    
    // 진행중/완료/실패 금액
    if (['초기상담', '제안서제출', '견적진행', '계약협상'].includes(progress)) {
      stats.progressAmount += amountKRW;
    } else if (progress === '계약완료') {
      stats.completeAmount += amountKRW;
    } else if (progress === '실주') {
      stats.failedAmount += amountKRW;
    }
    
    // 제품별 집계
    const product = row.product || '기타';
    if (!stats.byProduct[product]) {
      stats.byProduct[product] = { count: 0, amount: 0 };
    }
    stats.byProduct[product].count++;
    stats.byProduct[product].amount += amountKRW;
    
    // 고객사별 집계
    const customer = row.customer || '미정';
    if (!stats.byCustomer[customer]) {
      stats.byCustomer[customer] = { count: 0, amount: 0 };
    }
    stats.byCustomer[customer].count++;
    stats.byCustomer[customer].amount += amountKRW;
    
    // 월별 집계
    const date = new Date(row.registDate || row.date);
    if (!isNaN(date)) {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!stats.monthlyData[monthKey]) {
        stats.monthlyData[monthKey] = { count: 0, amount: 0 };
      }
      stats.monthlyData[monthKey].count++;
      stats.monthlyData[monthKey].amount += amountKRW;
    }
  });
  
  // 평균 및 비율 계산
  stats.avgAmount = stats.totalCount > 0 ? stats.totalAmount / stats.totalCount : 0;
  const completeCount = stats.byProgress['계약완료']?.count || 0;
  stats.winRate = stats.totalCount > 0 ? (completeCount / stats.totalCount) * 100 : 0;
  
  return stats;
}

// 진행 현황별 차트 업데이트
function updateProgressChart(data) {
  const stats = calculateSalesStats(data);
  const ctx = document.getElementById('progressChart').getContext('2d');
  
  // 기존 차트 제거
  if (chartInstances.progress) {
    chartInstances.progress.destroy();
  }
  
  const progressOrder = ['초기상담', '제안서제출', '견적진행', '계약협상', '계약완료', '진행보류', '실주'];
  const labels = [];
  const amounts = [];
  const colors = [];
  const colorMap = {
    '초기상담': '#3498db',
    '제안서제출': '#9b59b6',
    '견적진행': '#f39c12',
    '계약협상': '#e67e22',
    '계약완료': '#27ae60',
    '진행보류': '#95a5a6',
    '실주': '#e74c3c'
  };
  
  progressOrder.forEach(progress => {
    if (stats.byProgress[progress]) {
      labels.push(progress);
      amounts.push(stats.byProgress[progress].amount);
      colors.push(colorMap[progress] || '#95a5a6');
    }
  });
  
  chartInstances.progress = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: amounts,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = formatCurrency(context.raw);
              const percentage = ((context.raw / stats.totalAmount) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// 월별 추이 차트 업데이트
function updateMonthlyTrendChart(data) {
  const stats = calculateSalesStats(data);
  const ctx = document.getElementById('monthlyTrendChart').getContext('2d');
  
  if (chartInstances.monthly) {
    chartInstances.monthly.destroy();
  }
  
  // 최근 12개월 데이터만 표시
  const months = Object.keys(stats.monthlyData).sort().slice(-12);
  const labels = months.map(m => {
    const [year, month] = m.split('-');
    return `${year.slice(2)}.${month}`;
  });
  const amounts = months.map(m => stats.monthlyData[m].amount);
  const counts = months.map(m => stats.monthlyData[m].count);
  
  chartInstances.monthly = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '금액',
        data: amounts,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        tension: 0.3,
        yAxisID: 'y-amount'
      }, {
        label: '건수',
        data: counts,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        tension: 0.3,
        yAxisID: 'y-count'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        'y-amount': {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '금액 (억원)'
          },
          ticks: {
            callback: function(value) {
              return (value / 100000000).toFixed(1);
            }
          }
        },
        'y-count': {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '건수'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.label === '금액') {
                return `금액: ${formatCurrency(context.raw)}`;
              } else {
                return `건수: ${context.raw}건`;
              }
            }
          }
        }
      }
    }
  });
}

// 제품별 차트 업데이트
function updateProductChart(data) {
  const stats = calculateSalesStats(data);
  const ctx = document.getElementById('productChart').getContext('2d');
  
  if (chartInstances.product) {
    chartInstances.product.destroy();
  }
  
  const products = Object.keys(stats.byProduct)
    .sort((a, b) => stats.byProduct[b].amount - stats.byProduct[a].amount);
  const amounts = products.map(p => stats.byProduct[p].amount);
  
  chartInstances.product = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: products,
      datasets: [{
        data: amounts,
        backgroundColor: [
          '#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6',
          '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = formatCurrency(context.raw);
              const percentage = ((context.raw / stats.totalAmount) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// 고객사별 차트 업데이트
function updateCustomerChart(data) {
  const stats = calculateSalesStats(data);
  const ctx = document.getElementById('customerChart').getContext('2d');
  
  if (chartInstances.customer) {
    chartInstances.customer.destroy();
  }
  
  // 상위 10개 고객사
  const topCustomers = Object.keys(stats.byCustomer)
    .sort((a, b) => stats.byCustomer[b].amount - stats.byCustomer[a].amount)
    .slice(0, 10);
  
  const labels = topCustomers.map(c => c.length > 15 ? c.substring(0, 15) + '...' : c);
  const amounts = topCustomers.map(c => stats.byCustomer[c].amount);
  
  chartInstances.customer = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '금액',
        data: amounts,
        backgroundColor: '#3498db',
        borderColor: '#2980b9',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCurrency(value, true);
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `금액: ${formatCurrency(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

// 상세 분석 테이블 업데이트
function updateAnalysisDetailTable(data) {
  const stats = calculateSalesStats(data);
  const container = document.getElementById('analysisDetailTable');
  
  let html = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">진행 현황</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">건수</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">금액</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">평균 금액</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">비중</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  const progressOrder = ['초기상담', '제안서제출', '견적진행', '계약협상', '계약완료', '진행보류', '실주'];
  
  progressOrder.forEach(progress => {
    if (stats.byProgress[progress]) {
      const item = stats.byProgress[progress];
      const avgAmount = item.count > 0 ? item.amount / item.count : 0;
      const percentage = stats.totalAmount > 0 ? (item.amount / stats.totalAmount) * 100 : 0;
      
      html += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${progress}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">${item.count.toLocaleString()}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">${formatCurrency(item.amount)}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">${formatCurrency(avgAmount)}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #dee2e6;">${percentage.toFixed(1)}%</td>
        </tr>
      `;
    }
  });
  
  html += `
      </tbody>
      <tfoot>
        <tr style="background: #f8f9fa; font-weight: bold;">
          <td style="padding: 12px; border-top: 2px solid #dee2e6;">합계</td>
          <td style="padding: 12px; text-align: right; border-top: 2px solid #dee2e6;">${stats.totalCount.toLocaleString()}</td>
          <td style="padding: 12px; text-align: right; border-top: 2px solid #dee2e6;">${formatCurrency(stats.totalAmount)}</td>
          <td style="padding: 12px; text-align: right; border-top: 2px solid #dee2e6;">${formatCurrency(stats.avgAmount)}</td>
          <td style="padding: 12px; text-align: right; border-top: 2px solid #dee2e6;">100.0%</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  container.innerHTML = html;
}

// 영업 인사이트 업데이트
function updateSalesInsights(data) {
  const stats = calculateSalesStats(data);
  const container = document.getElementById('salesInsights');
  
  const insights = [];
  
  // 수주율 인사이트
  if (stats.winRate > 30) {
    insights.push(`✅ 수주율이 ${stats.winRate.toFixed(1)}%로 양호한 수준입니다.`);
  } else if (stats.winRate > 0) {
    insights.push(`⚠️ 수주율이 ${stats.winRate.toFixed(1)}%로 개선이 필요합니다.`);
  }
  
  // 진행중 안건 인사이트
  const progressRate = stats.totalAmount > 0 ? (stats.progressAmount / stats.totalAmount) * 100 : 0;
  if (progressRate > 50) {
    insights.push(`📈 전체 금액의 ${progressRate.toFixed(1)}%가 진행중으로, 향후 매출 전망이 긍정적입니다.`);
  }
  
  // 실주율 인사이트
  const failRate = stats.totalAmount > 0 ? (stats.failedAmount / stats.totalAmount) * 100 : 0;
  if (failRate > 20) {
    insights.push(`⚠️ 실주 금액 비중이 ${failRate.toFixed(1)}%로 높은 편입니다. 실주 원인 분석이 필요합니다.`);
  }
  
  // 제품별 인사이트
  const topProduct = Object.keys(stats.byProduct)
    .sort((a, b) => stats.byProduct[b].amount - stats.byProduct[a].amount)[0];
  if (topProduct) {
    const topProductRate = (stats.byProduct[topProduct].amount / stats.totalAmount) * 100;
    insights.push(`🎯 ${topProduct}이(가) 전체 매출의 ${topProductRate.toFixed(1)}%를 차지하는 주력 제품입니다.`);
  }
  
  // 고객 집중도 인사이트
  const topCustomer = Object.keys(stats.byCustomer)
    .sort((a, b) => stats.byCustomer[b].amount - stats.byCustomer[a].amount)[0];
  if (topCustomer) {
    const topCustomerRate = (stats.byCustomer[topCustomer].amount / stats.totalAmount) * 100;
    if (topCustomerRate > 30) {
      insights.push(`⚠️ ${topCustomer}에 매출의 ${topCustomerRate.toFixed(1)}%가 집중되어 있습니다. 고객 다변화가 필요합니다.`);
    }
  }
  
  // 평균 거래 규모 인사이트
  const avgAmountBillion = stats.avgAmount / 100000000;
  insights.push(`💰 평균 거래 규모는 ${avgAmountBillion.toFixed(2)}억원입니다.`);
  
  container.innerHTML = insights.map(insight => `<div style="margin-bottom: 8px;">• ${insight}</div>`).join('');
}

async function resolveUidByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const findUid = (records) => {
    if (!records || typeof records !== 'object') return null;
    for (const [uid, data] of Object.entries(records)) {
      if (normalizeEmail(data?.email) === normalized) {
        return data?.uid || uid;
      }
    }
    return null;
  };

  const refreshMainUsers = async () => {
    try {
      const snapshot = await db.ref(paths.mainUsers).once('value');
      mainUsersData = snapshot.val() || {};
      rebuildUserLookupCaches();
    } catch (error) {
      console.error('메인 사용자 목록 로드 오류:', error);
      mainUsersData = {};
      rebuildUserLookupCaches();
    }
  };

  const refreshUserMeta = async () => {
    try {
      const metaSnapshot = await db.ref(paths.userMeta).once('value');
      userMetaCache = metaSnapshot.val() || {};
      rebuildUserLookupCaches();
    } catch (error) {
      console.error('사용자 메타데이터 로드 오류:', error);
      userMetaCache = {};
      rebuildUserLookupCaches();
    }
  };

  if (!mainUsersData || !Object.keys(mainUsersData).length) {
    await refreshMainUsers();
  }

  let resolved = findUid(mainUsersData);
  if (!resolved) {
    await refreshMainUsers();
    resolved = findUid(mainUsersData);
  }
  if (resolved) return resolved;

  resolved = findUid(userRecords);
  if (resolved) return resolved;

  if (!userMetaCache || !Object.keys(userMetaCache).length) {
    await refreshUserMeta();
  }

  resolved = findUid(userMetaCache);
  if (!resolved) {
    await refreshUserMeta();
    resolved = findUid(userMetaCache);
  }

  return resolved;
}

async function verifyEmailRegistration(email, existingUid = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { registered: false, uid: null };
  }

  let resolvedUid = existingUid || null;

  if (!resolvedUid) {
    resolvedUid = await resolveUidByEmail(normalized);
  }

  if (resolvedUid) {
    return { registered: true, uid: resolvedUid };
  }

  try {
    const methods = await auth.fetchSignInMethodsForEmail(normalized);
    if (Array.isArray(methods) && methods.length > 0) {
      return { registered: true, uid: null };
    }
  } catch (error) {
    if (error?.code === 'auth/invalid-email') {
      throw error;
    }
    console.warn('이메일 인증 방법 조회 실패:', error);
  }

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier: normalized,
        continueUri: (typeof window !== 'undefined' && window?.location?.origin) || 'https://snsys.net'
      })
    });

    const data = await response.json();

    if (data?.registered) {
      return { registered: true, uid: null };
    }

    if (data?.error) {
      console.warn('Firebase createAuthUri 오류:', data.error);
    }
  } catch (error) {
    console.error('Firebase 등록 이메일 확인 오류:', error);
  }

  return { registered: false, uid: null };
}

async function ensureDefaultAdminRecord() {
  const defaultNormalized = normalizeEmail(DEFAULT_ADMIN_EMAIL);
  const existingEntry = Object.entries(userRecords || {}).find(([, data]) => normalizeEmail(data?.email) === defaultNormalized);

  if (existingEntry) {
    const [uid, data] = existingEntry;
    if (normalizeRole(data?.role) !== 'admin') {
      userRecords[uid] = {
        ...data,
        role: 'admin'
      };
      try {
        await db.ref(`${paths.users}/${uid}`).update({ role: 'admin' });
      } catch (error) {
        console.error('기본 관리자 권한 업데이트 오류:', error);
      }
    }
    return;
  }

  const resolvedUid = await resolveUidByEmail(DEFAULT_ADMIN_EMAIL);
  const recordKey = resolvedUid || db.ref(paths.users).push().key;
  const timestamp = new Date().toISOString();
  const defaultName = mainUsersData?.[recordKey]?.id || DEFAULT_ADMIN_EMAIL.split('@')[0];
  const defaultDepartment = mainUsersData?.[recordKey]?.department || '';

  const newRecord = {
    email: DEFAULT_ADMIN_EMAIL,
    uid: recordKey,
    name: defaultName,
    username: defaultName,
    department: defaultDepartment,
    role: 'admin',
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: 'system'
  };

  try {
    await db.ref(`${paths.users}/${recordKey}`).set(newRecord);
    userRecords[recordKey] = newRecord;
  } catch (error) {
    console.error('기본 관리자 등록 오류:', error);
  }

  if (!isEmailAdmin(DEFAULT_ADMIN_EMAIL)) {
    adminEmails = getUniqueEmailList([...adminEmails, DEFAULT_ADMIN_EMAIL]);
    try {
      await db.ref(paths.adminEmails).set(adminEmails);
    } catch (error) {
      console.error('기본 관리자 목록 저장 오류:', error);
    }
  }
}

function transformUserRecords(records) {
  const entries = Object.entries(records || {}).map(([uid, data]) => {
    const email = data?.email || '';
    let role = normalizeRole(data?.role);

    if (!role) {
      role = isEmailAdmin(email) ? 'admin' : 'user';
    }

    if (normalizeEmail(email) === normalizeEmail(DEFAULT_ADMIN_EMAIL)) {
      role = 'admin';
    }

    if (data && typeof data === 'object') {
      data.role = role;
      data.uid = data.uid || uid;
      if (!data.name && data.username) {
        data.name = data.username;
      }
    }

    return {
      uid,
      email,
      name: data?.name || data?.username || '',
      department: data?.department || '',
      role
    };
  });

  entries.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  return entries;
}

async function syncAdminListWithRecords() {
  const normalizedSet = new Set();
  const adminList = [];

  const pushEmail = (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized || normalizedSet.has(normalized)) return;
    normalizedSet.add(normalized);
    adminList.push((email || '').trim());
  };

  pushEmail(DEFAULT_ADMIN_EMAIL);

  Object.values(userRecords || {}).forEach(user => {
    if (normalizeRole(user?.role) === 'admin') {
      pushEmail(user.email);
    }
  });

  adminEmails = adminList;

  await db.ref(paths.adminEmails).set(adminEmails);

  if (currentUser) {
    isAdmin = checkUserIsAdmin(currentUser.email);
    updateAdminButtonsVisibility();
  }
}

// 사용자 관리 데이터 로드
async function loadUserManagement() {
  if (!isAdmin) return;
  try {
    const snap = await db.ref(paths.users).once('value');
    userRecords = snap.val() || {};
    await ensureDefaultAdminRecord();
    onUserDirectoryChanged();
    const userData = transformUserRecords(userRecords);
    renderUserList(userData);
  } catch (error) {
    console.error('사용자 목록 로드 오류:', error);
    alert('사용자 목록을 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

// 사용자 목록 렌더링
function renderUserList(userData) {
  const tableBody = document.getElementById('userTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  if (!userData.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.className = 'user-table-empty';
    emptyCell.textContent = '등록된 사용자가 없습니다.';
    emptyRow.appendChild(emptyCell);
    tableBody.appendChild(emptyRow);
    return;
  }

  userData.forEach(user => {
    const row = document.createElement('tr');
    row.dataset.uid = user.uid;
    row.dataset.email = user.email || '';

    const selectCell = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'user-select';
    chk.dataset.uid = user.uid;
    chk.dataset.email = user.email || '';
    if (normalizeEmail(user.email) === normalizeEmail(DEFAULT_ADMIN_EMAIL)) {
      chk.disabled = true;
      chk.title = '초기 관리자 계정은 삭제할 수 없습니다.';
    }
    selectCell.appendChild(chk);
    row.appendChild(selectCell);

    const emailCell = document.createElement('td');
    emailCell.className = 'user-email';
    const emailText = document.createElement('div');
    emailText.textContent = user.email || '-';
    emailCell.appendChild(emailText);

    const roleLabel = document.createElement('span');
    roleLabel.className = 'user-role-badge';
    if (normalizeEmail(user.email) === normalizeEmail(DEFAULT_ADMIN_EMAIL)) {
      roleLabel.textContent = '초기 관리자';
      roleLabel.classList.add('primary');
      emailCell.appendChild(roleLabel);
    } else if (normalizeRole(user.role) === 'admin') {
      roleLabel.textContent = '관리자';
      emailCell.appendChild(roleLabel);
    } else if (normalizeRole(user.role) === 'manager') {
      roleLabel.textContent = '매니저';
      roleLabel.classList.add('info');
      emailCell.appendChild(roleLabel);
    }

    row.appendChild(emailCell);

    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = user.name || '';
    nameInput.placeholder = '이름';
    nameInput.dataset.uid = user.uid;
    nameInput.dataset.field = 'name';
    nameCell.appendChild(nameInput);
    row.appendChild(nameCell);

    const deptCell = document.createElement('td');
    const deptInput = document.createElement('input');
    deptInput.type = 'text';
    deptInput.value = user.department || '';
    deptInput.placeholder = '부서';
    deptInput.dataset.uid = user.uid;
    deptInput.dataset.field = 'department';
    deptCell.appendChild(deptInput);
    row.appendChild(deptCell);

    const roleCell = document.createElement('td');
    const roleSelect = document.createElement('select');
    roleSelect.dataset.uid = user.uid;
    roleSelect.dataset.field = 'role';

    const roleOptions = [
      { value: 'user', label: '일반' },
      { value: 'manager', label: '매니저' },
      { value: 'admin', label: '관리자' }
    ];

    roleOptions.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (normalizeRole(user.role) === option.value) {
        opt.selected = true;
      }
      roleSelect.appendChild(opt);
    });

    if (normalizeEmail(user.email) === normalizeEmail(DEFAULT_ADMIN_EMAIL)) {
      roleSelect.value = 'admin';
      roleSelect.disabled = true;
    }

    roleCell.appendChild(roleSelect);
    row.appendChild(roleCell);

    tableBody.appendChild(row);
  });
}

// 사용자 모달 닫기
// 선택된 사용자 삭제
async function deleteSelectedUsers() {
  const selected = document.querySelectorAll('#userTableBody input.user-select:checked');
  if (!selected.length) {
    alert('삭제할 사용자를 선택하세요.');
    return;
  }

  const hasDefaultAdmin = Array.from(selected).some(chk => normalizeEmail(chk.dataset.email) === normalizeEmail(DEFAULT_ADMIN_EMAIL));
  if (hasDefaultAdmin) {
    alert('초기 관리자 계정은 삭제할 수 없습니다.');
    return;
  }

  if (!confirm('선택한 사용자들을 삭제하시겠습니까?')) return;

  const updates = {};
  const removedUids = [];

  selected.forEach(chk => {
    const uid = chk.dataset.uid;
    if (!uid) return;
    updates[uid] = null;
    removedUids.push(uid);
  });

  try {
    await db.ref(paths.users).update(updates);
    removedUids.forEach(uid => delete userRecords[uid]);
    await ensureDefaultAdminRecord();
    await syncAdminListWithRecords();
    onUserDirectoryChanged();
    renderUserList(transformUserRecords(userRecords));
    alert('선택한 사용자가 삭제되었습니다.');
  } catch (error) {
    console.error('사용자 삭제 오류:', error);
    alert('사용자를 삭제하는 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}

// 사용자 정보 저장
async function saveUserChanges() {
  const rows = document.querySelectorAll('#userTableBody tr[data-uid]');
  if (!rows.length) {
    alert('저장할 사용자 정보가 없습니다.');
    return;
  }

  const updates = {};
  const timestamp = new Date().toISOString();

  rows.forEach(row => {
    const uid = row.dataset.uid;
    const email = row.dataset.email || row.querySelector('.user-email div')?.textContent || '';
    if (!uid || !email) return;

    const nameInput = row.querySelector('input[data-field="name"]');
    const deptInput = row.querySelector('input[data-field="department"]');
    const roleSelect = row.querySelector('select[data-field="role"]');

    const name = nameInput ? nameInput.value.trim() : '';
    const department = deptInput ? deptInput.value.trim() : '';
    let role = roleSelect ? normalizeRole(roleSelect.value) : 'user';

    if (!['user', 'manager', 'admin'].includes(role)) {
      role = 'user';
    }

    if (normalizeEmail(email) === normalizeEmail(DEFAULT_ADMIN_EMAIL)) {
      role = 'admin';
    }

    const existing = userRecords[uid] || {};

    updates[uid] = {
      ...existing,
      email,
      uid: existing.uid || uid,
      name,
      username: name,
      department,
      role,
      updatedAt: timestamp,
      updatedBy: currentUser?.email || ''
    };

    if (!existing.createdAt) {
      updates[uid].createdAt = timestamp;
    }
  });

  if (!Object.keys(updates).length) {
    alert('변경된 내용이 없습니다.');
    return;
  }

  try {
    await db.ref(paths.users).update(updates);
    userRecords = { ...userRecords, ...updates };
    await syncAdminListWithRecords();
    onUserDirectoryChanged();
    alert('사용자 정보가 저장되었습니다.');
    renderUserList(transformUserRecords(userRecords));
  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    alert('사용자 정보를 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}

// 새 사용자 추가 (수정된 버전)
async function addNewUser() {
  const emailInput = document.getElementById('newUserEmail');
  const nameInput = document.getElementById('newUserName');
  const deptInput = document.getElementById('newUserDepartment');
  const roleSelect = document.getElementById('newUserRole');

  const email = emailInput?.value.trim() || '';
  const name = nameInput?.value.trim() || '';
  const department = deptInput?.value.trim() || '';
  let role = normalizeRole(roleSelect?.value || 'user');

  if (!['user', 'manager', 'admin'].includes(role)) {
    role = 'user';
  }

  if (!email) {
    alert('이메일을 입력해주세요.');
    emailInput?.focus();
    return;
  }

  if (!email.includes('@')) {
    alert('올바른 이메일 형식을 입력해주세요.');
    emailInput?.focus();
    return;
  }

  if (!name) {
    alert('이름을 입력해주세요.');
    nameInput?.focus();
    return;
  }

  if (!department) {
    alert('부서를 입력해주세요.');
    deptInput?.focus();
    return;
  }

  const normalized = normalizeEmail(email);
  
  // 이미 등록된 사용자인지 확인
  const existingUser = Object.values(userRecords || {}).find(
    user => normalizeEmail(user?.email) === normalized
  );
  
  if (existingUser && !confirm('이미 등록된 이메일입니다. 정보를 업데이트하시겠습니까?')) {
    return;
  }

  const recordKey = existingUser?.uid || db.ref(paths.users).push().key;
  const timestamp = new Date().toISOString();
  
  const newRecord = {
    email,
    uid: recordKey,
    name,
    username: name,
    department,
    role,
    updatedAt: timestamp,
    updatedBy: currentUser?.email || '',
    createdAt: existingUser?.createdAt || timestamp
  };

  try {
    await db.ref(`${paths.users}/${recordKey}`).set(newRecord);
    userRecords[recordKey] = newRecord;
    await ensureDefaultAdminRecord();
    await syncAdminListWithRecords();
    onUserDirectoryChanged();
    renderUserList(transformUserRecords(userRecords));

    // 입력 필드 초기화
    if (emailInput) emailInput.value = '';
    if (nameInput) nameInput.value = '';
    if (deptInput) deptInput.value = '';
    if (roleSelect) roleSelect.value = 'user';

    alert(existingUser ? '사용자 정보가 업데이트되었습니다.' : '사용자가 추가되었습니다.');
    
    // 추가 안내 메시지
    if (!existingUser) {
      alert('추가된 사용자는 Firebase Authentication에서 별도로 계정을 생성해야 로그인할 수 있습니다.\n\nFirebase Console → Authentication → Users에서 직접 추가하거나,\n사용자에게 회원가입 링크를 안내해주세요.');
    }
  } catch (error) {
    console.error('사용자 추가 오류:', error);
    alert('사용자를 추가하는 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}

// 내용 모달 열기
function openContentModal(text, uid, field) {
  const modal = document.getElementById('contentModal');
  const contentArea = document.getElementById('contentText');
  
  if (uid && field) {
    // 편집 가능한 textarea로 변경
    contentArea.innerHTML = `
      <textarea id="contentEditArea" style="width: 100%; height: 400px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; line-height: 1.6;">${text || ''}</textarea>
      <div style="margin-top: 10px; text-align: right;">
        <button onclick="saveContentModal('${uid}', '${field}')" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">저장</button>
        <button onclick="closeContentModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">취소</button>
      </div>
    `;
  } else {
    // 읽기 전용
    contentArea.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.6;">${text || ''}</div>`;
  }
  
  modal.style.display = 'block';
}

// 내용 모달에서 저장
function saveContentModal(uid, field) {
  const newValue = document.getElementById('contentEditArea').value;
  
  // 데이터 업데이트
  const row = salesData.find(x => x.uid === uid);
  if (row) {
    row[field] = newValue;
    row.modifiedDate = new Date().toISOString().split('T')[0];
    modifiedRows.add(uid);
    
    // 테이블 업데이트
    const input = document.querySelector(`input[data-uid="${uid}"][data-field="${field}"]`);
    if (input) {
      input.value = newValue;
    }
  }
  
  closeContentModal();
}

// 내용 모달 닫기
function closeContentModal() {
  document.getElementById('contentModal').style.display = 'none';
}

// 컨텐츠 모달 표시 (읽기 전용)
function showContentModal(content, title = '') {
  const modal = document.getElementById('contentModal');
  const contentArea = document.getElementById('contentText');
  
  if (title) {
    contentArea.innerHTML = `<h3>${title}</h3>${content}`;
  } else {
    contentArea.innerHTML = content;
  }
  
  modal.style.display = 'block';
}

// 영업 파이프라인 기능
function loadPipeline() {
  updatePipelineView();
  loadPipelineFilters();
}

function updatePipelineView() {
  const stages = ['lead', 'contact', 'proposal', 'negotiation', 'closed'];
  let totalValue = 0;
  
  stages.forEach(stage => {
    const column = document.querySelector(`.kanban-column[data-stage="${stage}"] .column-body`);
    const countEl = document.querySelector(`.kanban-column[data-stage="${stage}"] .column-count`);
    
    if (column) {
      column.innerHTML = '';
      
      const stageDeals = deals.filter(d => d.stage === stage);
      countEl.textContent = stageDeals.length;
      
      stageDeals.forEach(deal => {
        const dealCard = createDealCard(deal);
        column.appendChild(dealCard);
        
        if (stage !== 'lost') {
          totalValue += (deal.value || 0);
        }
      });
    }
  });
  
  document.getElementById('totalDeals').textContent = deals.length;
  document.getElementById('totalValue').textContent = formatCurrency(totalValue);
}

function createDealCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';
  card.draggable = true;
  card.dataset.dealId = deal.id;
  
  const customer = customers.find(c => c.id === deal.customerId);
  const customerName = deal.customerId ? (getCustomerDisplayName(customer) || '알 수 없음') : (deal.customCustomer || deal.customerName || '알 수 없음');
  const ownerName = formatUserDisplay(deal.assignedTo || deal.createdBy || deal.modifiedBy || '');

  card.innerHTML = `
    <div class="deal-header">
      <h4>${deal.name}</h4>
      <div class="deal-actions">
        <button class="btn-icon-sm" onclick="editDeal('${deal.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-icon-sm" onclick="deleteDeal('${deal.id}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    <div class="deal-customer">${customerName}</div>
    <div class="deal-value">${formatCurrency(deal.value || 0)}</div>
    <div class="deal-info">
      <span class="deal-probability">${deal.probability || 0}%</span>
      <span class="deal-date">${formatDate(deal.closeDate)}</span>
    </div>
    <div class="deal-owner"><i class="fas fa-user"></i> ${ownerName || '담당자 미지정'}</div>
  `;
  
  card.ondragstart = (e) => {
    e.dataTransfer.setData('dealId', deal.id);
    card.classList.add('dragging');
  };
  
  card.ondragend = () => {
    card.classList.remove('dragging');
  };
  
  return card;
}

// 파이프라인 필터 로드
function loadPipelineFilters() {
  const managerFilter = document.getElementById('pipelineFilter');
  managerFilter.innerHTML = '<option value="">전체 담당자</option>';
  
  const managers = [...new Set(deals.map(d => d.assignedTo).filter(Boolean))];
  managers.forEach(manager => {
    const option = document.createElement('option');
    option.value = manager;
    option.textContent = formatUserDisplay(manager);
    managerFilter.appendChild(option);
  });
}

// 파이프라인 필터링
function filterPipeline() {
  const manager = document.getElementById('pipelineFilter').value;
  const period = document.getElementById('dateFilter').value;
  
  // TODO: 필터링 구현
  console.log('필터링:', manager, period);
}

// 거래 드래그 앤 드롭
function allowDrop(e) {
  e.preventDefault();
  const column = e.currentTarget;
  column.classList.add('drag-over');
}

async function dropDeal(e) {
  e.preventDefault();
  const column = e.currentTarget;
  column.classList.remove('drag-over');
  
  const dealId = e.dataTransfer.getData('dealId');
  const newStage = column.parentElement.dataset.stage;
  
  try {
    await db.ref(`${paths.deals}/${dealId}`).update({
      stage: newStage,
      modifiedAt: new Date().toISOString(),
      modifiedBy: currentUser.email
    });
    
    const deal = deals.find(d => d.id === dealId);
    if (deal) {
      logActivity('deal_moved', `거래 단계 변경: ${deal.name} → ${getStageLabel(newStage)}`);
    }
  } catch (error) {
    console.error('거래 이동 오류:', error);
    showNotification('거래 이동에 실패했습니다.', 'error');
  }
}

// 거래 모달
function openDealModal(dealId = null) {
  const modal = document.getElementById('dealModal');
  const title = document.getElementById('dealModalTitle');
  
  // 고객 목록 로드
  const customerSelect = document.getElementById('dealCustomer');
  customerSelect.innerHTML = '<option value="">고객 선택</option>';
  customers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.id;
    option.textContent = getCustomerDisplayName(customer);
    customerSelect.appendChild(option);
  });

  const manualInput = document.getElementById('dealCustomerManual');
  if (manualInput) {
    manualInput.value = '';
  }

  if (dealId) {
    title.textContent = '거래 수정';
    const deal = deals.find(d => d.id === dealId);
    if (deal) {
      document.getElementById('dealName').value = deal.name || '';
      document.getElementById('dealCustomer').value = deal.customerId || '';
      if (manualInput && !deal.customerId) {
        manualInput.value = deal.customCustomer || deal.customerName || '';
      }
      document.getElementById('dealValue').value = deal.value || '';
      document.getElementById('dealCloseDate').value = deal.closeDate || '';
      document.getElementById('dealStage').value = deal.stage || 'lead';
      document.getElementById('dealProbability').value = deal.probability || 20;
      document.getElementById('dealDescription').value = deal.description || '';
    }
  } else {
    title.textContent = '신규 거래 등록';
    document.getElementById('dealModal').querySelectorAll('input, textarea, select').forEach(el => {
      if (el.type !== 'button' && el.type !== 'submit') {
        el.value = '';
      }
    });
    document.getElementById('dealStage').value = 'lead';
    document.getElementById('dealProbability').value = '20';
  }
  
  modal.dataset.dealId = dealId || '';
  modal.style.display = 'block';
}

function closeDealModal() {
  document.getElementById('dealModal').style.display = 'none';
}

// 거래 저장
async function saveDeal() {
  const modal = document.getElementById('dealModal');
  const dealId = modal.dataset.dealId;

  const selectedCustomerId = document.getElementById('dealCustomer').value;
  const manualCustomerName = document.getElementById('dealCustomerManual')?.value.trim() || '';

  if (!selectedCustomerId && !manualCustomerName) {
    alert('고객을 선택하거나 직접 입력해주세요.');
    return;
  }

  const existingDeal = dealId ? deals.find(d => d.id === dealId) : null;
  const assignedOwner = existingDeal?.assignedTo || currentUser.email;
  const resolvedCustomerName = selectedCustomerId ? getCustomerNameById(selectedCustomerId) : manualCustomerName;

  const dealData = {
    name: document.getElementById('dealName').value.trim(),
    customerId: selectedCustomerId,
    value: parseFloat(document.getElementById('dealValue').value) || 0,
    closeDate: document.getElementById('dealCloseDate').value,
    stage: document.getElementById('dealStage').value,
    probability: parseInt(document.getElementById('dealProbability').value) || 0,
    description: document.getElementById('dealDescription').value.trim(),
    modifiedAt: new Date().toISOString(),
    modifiedBy: currentUser.email,
    customCustomer: selectedCustomerId ? '' : manualCustomerName,
    customerName: resolvedCustomerName,
    assignedTo: assignedOwner
  };

  if (!dealData.name) {
    alert('거래명은 필수 입력 항목입니다.');
    return;
  }

  try {
    showLoading();

    if (dealId) {
      await db.ref(`${paths.deals}/${dealId}`).update(dealData);
      logActivity('deal_updated', `거래 수정: ${dealData.name}`);
    } else {
      dealData.createdAt = new Date().toISOString();
      dealData.createdBy = currentUser.email;
      dealData.assignedTo = assignedOwner;

      await db.ref(paths.deals).push(dealData);
      logActivity('deal_created', `새 거래 등록: ${dealData.name}`);
    }
    
    closeDealModal();
    showNotification('거래가 저장되었습니다.', 'success');
  } catch (error) {
    console.error('거래 저장 오류:', error);
    showNotification('거래 저장에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

// 거래 편집
function editDeal(dealId) {
  openDealModal(dealId);
}

// 거래 삭제
async function deleteDeal(dealId) {
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  
  if (confirm(`${deal.name} 거래를 삭제하시겠습니까?`)) {
    try {
      showLoading();
      await db.ref(`${paths.deals}/${dealId}`).remove();
      logActivity('deal_deleted', `거래 삭제: ${deal.name}`);
      showNotification('거래가 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('거래 삭제 오류:', error);
      showNotification('거래 삭제에 실패했습니다.', 'error');
    } finally {
      hideLoading();
    }
  }
}

// 커뮤니케이션 기능
function updateCommHeader(title, subtitle = '') {
  const header = document.getElementById('commHeader');
  if (!header) return;
  const textContainer = header.querySelector('.comm-header-text');
  if (!textContainer) return;

  const subtitleHtml = subtitle ? `<p>${subtitle}</p>` : '';
  textContainer.innerHTML = `<h3>${title}</h3>${subtitleHtml}`;
}

function loadCommunications() {
  updateCommHeader('고객을 선택해주세요');
  loadCommCustomerList();
}

// 커뮤니케이션 뷰의 고객 목록 수정
function loadCommCustomerList() {
  const list = document.getElementById('commCustomerList');
  list.innerHTML = '';
  
  customers.forEach(customer => {
    const item = document.createElement('div');
    item.className = 'comm-customer-item';
    item.dataset.customerId = customer.id;
    
    const lastComm = communications
      .filter(c => c.customerId === customer.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    // 주요고객 표시 추가
    const vipBadge = customer.mainCustomer === 'Y' ? '<span class="badge badge-vip" style="margin-left: 5px;">주요</span>' : '';
    
    item.innerHTML = `
      <div class="customer-info">
        <h4>${customer.company}${vipBadge}</h4>
        <p>${customer.manager || '담당자 미등록'}</p>
      </div>
      <div class="last-comm">
        ${lastComm ? formatRelativeTime(lastComm.createdAt) : '이력 없음'}
      </div>
    `;

    item.onclick = () => selectCustomerForComm(customer.id);
    if (customer.id === selectedCustomerId) {
      item.classList.add('active');
    }
    list.appendChild(item);
  });
}

function selectCustomerForComm(customerId) {
  selectedCustomerId = customerId;
  
  // 선택 표시
  document.querySelectorAll('.comm-customer-item').forEach(item => {
    item.classList.toggle('active', item.dataset.customerId === customerId);
  });
  
  // 커뮤니케이션 이력 로드
  loadCustomerComms(customerId);
  
  // 입력 영역 표시
  document.getElementById('commInput').style.display = 'block';
}

// 커뮤니케이션 헤더 업데이트
function loadCustomerComms(customerId) {
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return;
  
  // 헤더 업데이트
  const subtitleParts = [customer.manager || '', customer.phone1 || '', customer.email || '']
    .filter(part => part && part.trim() !== '');
  const subtitle = subtitleParts.join(' | ');
  const titleHtml = `${customer.company || getCustomerDisplayName(customer)} ${customer.mainCustomer === 'Y' ? '<span class="badge badge-vip">주요고객</span>' : ''}`;
  updateCommHeader(titleHtml, subtitle);
  
  // 타임라인 로드
  const timeline = document.getElementById('commTimeline');
  timeline.innerHTML = '';
  
  const customerComms = communications
    .filter(c => c.customerId === customerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (customerComms.length === 0) {
    timeline.innerHTML = '<p class="no-data">커뮤니케이션 이력이 없습니다.</p>';
    return;
  }
  
  customerComms.forEach(comm => {
    const item = document.createElement('div');
    item.className = `timeline-item ${comm.type}`;
    const authorName = formatUserDisplay(comm.createdBy);
    item.innerHTML = `
      <div class="timeline-icon">
        <i class="fas ${getCommIcon(comm.type)}"></i>
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-type">${getCommTypeLabel(comm.type)}</span>
          <span class="timeline-date">${formatDateTime(comm.createdAt)}</span>
        </div>
        <div class="timeline-body">
          ${comm.content}
        </div>
        <div class="timeline-footer">
          <span>${authorName}</span>
          <div class="timeline-actions">
            <button type="button" class="timeline-action-btn" onclick="deleteCommunication('${comm.id}')">
              <i class="fas fa-trash-alt"></i>
              <span>삭제</span>
            </button>
          </div>
        </div>
      </div>
    `;
    timeline.appendChild(item);
  });
}
// 커뮤니케이션 검색
function searchCommCustomers() {
  const searchTerm = event.target.value.toLowerCase();
  const items = document.querySelectorAll('.comm-customer-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

// 커뮤니케이션 추가
async function addCommunication() {
  if (!selectedCustomerId) {
    alert('고객을 선택해주세요.');
    return;
  }
  
  const type = document.getElementById('commType').value;
  const content = document.getElementById('commContent').value.trim();
  
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }
  
  try {
    showLoading();

    const commData = {
      customerId: selectedCustomerId,
      type: type,
      content: content,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.email
    };

    const newRef = await db.ref(paths.communications).push(commData);
    const newComm = {id: newRef.key, ...commData};

    // 고객 최근 연락 업데이트
    await db.ref(`${paths.customers}/${selectedCustomerId}`).update({
      lastContact: new Date().toISOString()
    });

    const customer = customers.find(c => c.id === selectedCustomerId);
    const customerName = getCustomerDisplayName(customer) || '고객';
    logActivity('comm_added', `${customerName}과(와) ${getCommTypeLabel(type)}`);

    // 입력 필드 초기화
    document.getElementById('commContent').value = '';

    // 이력 다시 로드
    if (!communications.find(c => c.id === newComm.id)) {
      communications.push(newComm);
    }
    loadCommCustomerList();
    loadCustomerComms(selectedCustomerId);

    showNotification('커뮤니케이션이 기록되었습니다.', 'success');
  } catch (error) {
    console.error('커뮤니케이션 추가 오류:', error);
    showNotification('기록 추가에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

// 캘린더 기능
function handleCalendarFilterChange() {
  if (calendar) {
    calendar.refetchEvents();
    calendar.updateSize();
  }
}

function getCalendarFilterCheckboxes() {
  return Array.from(document.querySelectorAll('.calendar-filters input[type="checkbox"][data-event-type]'));
}

function getCalendarFilterState() {
  const checkboxes = getCalendarFilterCheckboxes();
  if (!checkboxes.length) {
    return { active: new Set(), available: new Set() };
  }

  const active = new Set();
  const available = new Set();

  checkboxes.forEach((checkbox) => {
    const type = checkbox.dataset.eventType;
    if (!type) return;
    available.add(type);
    if (checkbox.checked) {
      active.add(type);
    }
  });

  return { active, available };
}

function shouldDisplayCalendarEvent(event, activeTypes, availableTypes) {
  if (!event) return false;

  const eventType = event.type || 'other';

  if (!availableTypes || availableTypes.size === 0) {
    return true;
  }

  if (!availableTypes.has(eventType)) {
    return true;
  }

  if (!activeTypes || activeTypes.size === 0) {
    return false;
  }

  return activeTypes.has(eventType);
}

function formatCalendarEvent(event) {
  const eventType = event?.type || 'other';
  return {
    id: event.id,
    title: getEventCalendarTitle(event),
    start: event.start,
    end: event.end,
    allDay: Boolean(event.allDay),
    color: getEventColor(eventType),
    extendedProps: {
      type: eventType,
      customerId: event.customerId,
      customCustomer: event.customCustomer || event.customerName || '',
      description: event.description,
      author: formatUserDisplay(event.createdBy || event.modifiedBy || '')
    }
  };
}

function buildCalendarEventSource() {
  const { active, available } = getCalendarFilterState();
  return events
    .filter(event => shouldDisplayCalendarEvent(event, active, available))
    .map(event => formatCalendarEvent(event));
}

function detachCalendarResizeHandler() {
  if (calendarResizeObserver) {
    calendarResizeObserver.disconnect();
    calendarResizeObserver = null;
  }

  if (calendarResizeHandler) {
    window.removeEventListener('resize', calendarResizeHandler);
    calendarResizeHandler = null;
  }
}

function attachCalendarResizeHandler(element) {
  if (!element) return;

  if (typeof ResizeObserver !== 'undefined') {
    detachCalendarResizeHandler();
    calendarResizeObserver = new ResizeObserver(() => {
      if (calendar) {
        calendar.updateSize();
      }
    });
    calendarResizeObserver.observe(element);
  } else if (!calendarResizeHandler) {
    calendarResizeHandler = () => {
      if (calendar) {
        calendar.updateSize();
      }
    };
    window.addEventListener('resize', calendarResizeHandler);
  }
}

function initializeCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  detachCalendarResizeHandler();

  if (calendar) {
    calendar.destroy();
    calendar = null;
  }

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'ko',
    height: 'auto',
    contentHeight: 'auto',
    expandRows: true,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    events: (_, successCallback) => {
      successCallback(buildCalendarEventSource());
    },
    eventClick: function(info) {
      viewEvent(info.event.id);
    },
    dateClick: function(info) {
      openEventModal(null, info.dateStr);
    }
  });

  calendar.render();
  calendar.updateSize();
  attachCalendarResizeHandler(calendarEl);
}

// 일정 모달
function openEventModal(eventId = null, defaultDate = null) {
  const modal = document.getElementById('eventModal');
  const title = document.getElementById('eventModalTitle');
  
  // 고객 목록 로드
  const customerSelect = document.getElementById('eventCustomer');
  customerSelect.innerHTML = '<option value="">고객 선택</option>';
  customers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.id;
    option.textContent = getCustomerDisplayName(customer);
    customerSelect.appendChild(option);
  });

  const manualInput = document.getElementById('eventCustomerManual');
  if (manualInput) {
    manualInput.value = '';
  }

  if (eventId) {
    title.textContent = '일정 수정';
    const event = events.find(e => e.id === eventId);
    if (event) {
      document.getElementById('eventTitle').value = event.title || '';
      document.getElementById('eventType').value = event.type || 'meeting';
      document.getElementById('eventCustomer').value = event.customerId || '';
      if (manualInput && !event.customerId) {
        manualInput.value = event.customCustomer || event.customerName || '';
      }
      document.getElementById('eventStart').value = event.start || '';
      document.getElementById('eventEnd').value = event.end || '';
      document.getElementById('eventDescription').value = event.description || '';
    }
  } else {
    title.textContent = '일정 추가';
    document.getElementById('eventModal').querySelectorAll('input, textarea, select').forEach(el => {
      if (el.type !== 'button' && el.type !== 'submit') {
        el.value = '';
      }
    });
    
    if (defaultDate) {
      document.getElementById('eventStart').value = defaultDate + 'T09:00';
      document.getElementById('eventEnd').value = defaultDate + 'T10:00';
    }
  }
  
  modal.dataset.eventId = eventId || '';
  modal.style.display = 'block';
}

function closeEventModal() {
  document.getElementById('eventModal').style.display = 'none';
}

// 일정 저장
async function saveEvent() {
  const modal = document.getElementById('eventModal');
  const eventId = modal.dataset.eventId;
  const selectedCustomerId = document.getElementById('eventCustomer').value;
  const manualCustomerName = document.getElementById('eventCustomerManual')?.value.trim() || '';
  const resolvedCustomerName = selectedCustomerId ? getCustomerNameById(selectedCustomerId) : manualCustomerName;

  const eventData = {
    title: document.getElementById('eventTitle').value.trim(),
    type: document.getElementById('eventType').value,
    customerId: selectedCustomerId,
    start: document.getElementById('eventStart').value,
    end: document.getElementById('eventEnd').value,
    description: document.getElementById('eventDescription').value.trim(),
    modifiedAt: new Date().toISOString(),
    modifiedBy: currentUser.email,
    customCustomer: selectedCustomerId ? '' : manualCustomerName,
    customerName: resolvedCustomerName
  };

  if (!eventData.title || !eventData.start) {
    alert('제목과 시작 시간은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    showLoading();
    
    if (eventId) {
      await db.ref(`${paths.events}/${eventId}`).update(eventData);
      logActivity('event_updated', `일정 수정: ${eventData.title}`);
    } else {
      eventData.createdAt = new Date().toISOString();
      eventData.createdBy = currentUser.email;
      eventData.createdByName = formatUserDisplay(currentUser.email);

      await db.ref(paths.events).push(eventData);
      logActivity('event_created', `새 일정 등록: ${eventData.title}`);
    }
    
    closeEventModal();
    showNotification('일정이 저장되었습니다.', 'success');
    
    // 캘린더 새로고침
    if (currentView === 'calendar') {
      loadAllData().then(() => initializeCalendar());
    }
  } catch (error) {
    console.error('일정 저장 오류:', error);
    showNotification('일정 저장에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

// 일정 보기
function viewEvent(eventId) {
  const event = events.find(e => e.id === eventId);
  if (!event) return;

  const customer = customers.find(c => c.id === event.customerId);
  const customerName = event.customerId ? (getCustomerDisplayName(customer) || '없음') : (event.customCustomer || event.customerName || '없음');
  const author = formatUserDisplay(event.createdBy || event.modifiedBy || '');
  const startTime = formatDateTime(event.start);
  const endTime = formatDateTime(event.end);

  const headerTitle = [author, formatEventTime(event.start), event.title].filter(Boolean).join(' ') || event.title;

  const detailHtml = `
    <h3>${headerTitle}</h3>
    <p><strong>유형:</strong> ${getEventTypeLabel(event.type)}</p>
    <p><strong>등록자:</strong> ${author || '-'}</p>
    <p><strong>고객:</strong> ${customerName}</p>
    <p><strong>시작:</strong> ${startTime}</p>
    <p><strong>종료:</strong> ${endTime}</p>
    <p><strong>설명:</strong> ${event.description || '없음'}</p>
    <div class="modal-footer" style="justify-content: flex-end; gap: 0.5rem;">
      <button class="secondary-btn" onclick="openEventModal('${eventId}')">수정</button>
      <button class="danger-btn" onclick="deleteEvent('${eventId}')">삭제</button>
    </div>
  `;

  showContentModal(detailHtml, '일정 상세');
}

async function deleteEvent(eventId) {
  const event = events.find(e => e.id === eventId);
  if (!event) return;

  if (!confirm(`'${event.title}' 일정을 삭제하시겠습니까?`)) {
    return;
  }

  try {
    showLoading();
    await db.ref(`${paths.events}/${eventId}`).remove();
    events = events.filter(e => e.id !== eventId);
    if (currentView === 'calendar') {
      loadAllData().then(() => initializeCalendar());
    }
    logActivity('event_deleted', `일정 삭제: ${event.title}`);
    showNotification('일정이 삭제되었습니다.', 'success');
    closeContentModal();
  } catch (error) {
    console.error('일정 삭제 오류:', error);
    showNotification('일정 삭제에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

// 캘린더 동기화
function syncCalendar() {
  showNotification('캘린더 동기화 기능은 준비중입니다.', 'info');
}

// 분석 및 리포트
function loadAnalytics() {
  const placeholder = document.querySelector('#analyticsView .analytics-placeholder p');
  if (placeholder) {
    placeholder.textContent = '준비중';
  }
}

function updateAnalytics() {
  // 분석 기능은 준비중입니다.
}

function updateSalesAnalyticsChart(period) {
  const ctx = document.getElementById('salesAnalyticsChart').getContext('2d');
  
  if (charts.salesAnalytics) {
    charts.salesAnalytics.destroy();
  }
  
  charts.salesAnalytics = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: getAnalyticsPeriodLabels(period),
      datasets: [{
        label: '매출',
        data: getSalesData(period),
        backgroundColor: '#315b8a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

function updateCustomerGrowthChart(period) {
  const ctx = document.getElementById('customerGrowthChart').getContext('2d');
  
  if (charts.customerGrowth) {
    charts.customerGrowth.destroy();
  }
  
  charts.customerGrowth = new Chart(ctx, {
    type: 'line',
    data: {
      labels: getAnalyticsPeriodLabels(period),
      datasets: [{
        label: '신규 고객',
        data: getNewCustomersData(period),
        borderColor: '#28a745',
        backgroundColor: 'rgba(40, 167, 69, 0.1)',
        tension: 0.4
      }, {
        label: '총 고객',
        data: getTotalCustomersData(period),
        borderColor: '#17a2b8',
        backgroundColor: 'rgba(23, 162, 184, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

function updatePerformanceChart(period) {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  if (charts.performance) {
    charts.performance.destroy();
  }
  
  // 담당자별 성과 데이터 (거래 + 영업안건)
  const managers = new Set([
    ...deals.map(d => d.assignedTo).filter(Boolean),
    ...salesData.map(s => s.manager).filter(Boolean)
  ]);
  
  const performanceData = Array.from(managers).map(manager => {
    const managerDeals = deals.filter(d => d.assignedTo === manager && d.stage === 'closed');
    const managerSales = salesData.filter(s => s.manager === manager && s.progress === '계약완료');
    
    const dealValue = managerDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const salesValue = managerSales.reduce((sum, s) => {
      const amount = parseFloat(s.bidAmount?.replace(/,/g, '') || 0);
      return sum + (s.currency === 'USD' ? amount * 1300 : amount);
    }, 0);
    
    return {
      manager,
      value: dealValue + salesValue
    };
  }).sort((a, b) => b.value - a.value).slice(0, 10);
  
  charts.performance = new Chart(ctx, {
    type: 'horizontalBar',
    data: {
      labels: performanceData.map(d => d.manager),
      datasets: [{
        label: '성과',
        data: performanceData.map(d => d.value),
        backgroundColor: '#6f42c1'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

function updateFunnelChart() {
  const ctx = document.getElementById('funnelChart').getContext('2d');
  
  if (charts.funnel) {
    charts.funnel.destroy();
  }
  
  const stages = [
    { 
      name: '리드', 
      count: deals.filter(d => d.stage === 'lead').length + 
             salesData.filter(s => s.progress === '초기상담').length 
    },
    { 
      name: '연락중', 
      count: deals.filter(d => d.stage === 'contact').length + 
             salesData.filter(s => s.progress === '제안서제출').length 
    },
    { 
      name: '제안서', 
      count: deals.filter(d => d.stage === 'proposal').length + 
             salesData.filter(s => s.progress === '견적진행').length 
    },
    { 
      name: '협상중', 
      count: deals.filter(d => d.stage === 'negotiation').length + 
             salesData.filter(s => s.progress === '계약협상').length 
    },
    { 
      name: '성사', 
      count: deals.filter(d => d.stage === 'closed').length + 
             salesData.filter(s => s.progress === '계약완료').length 
    }
  ];
  
  charts.funnel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stages.map(s => s.name),
      datasets: [{
        label: '거래 수',
        data: stages.map(s => s.count),
        backgroundColor: [
          '#17a2b8',
          '#ffc107',
          '#fd7e14',
          '#6f42c1',
          '#28a745'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y'
    }
  });
}

// 리포트 다운로드
async function exportReport() {
  try {
    showLoading();
    
    const periodSelect = document.getElementById('reportPeriod');
    const period = periodSelect ? periodSelect.value : '전체';
    const reportData = generateReportData(period);
    
    // Excel 리포트 생성
    const wb = XLSX.utils.book_new();
    
    // 요약 시트
    const summaryData = [
      ['통합 CRM 리포트'],
      ['생성일:', formatDate(new Date())],
      ['기간:', period],
      [''],
      ['핵심 지표'],
      ['총 고객수:', reportData.totalCustomers],
      ['주요 고객수:', reportData.mainCustomers],
      ['총 거래수:', reportData.totalDeals],
      ['총 영업안건:', reportData.totalSales],
      ['총 매출액:', formatCurrency(reportData.totalRevenue)],
      ['전환율:', reportData.conversionRate + '%']
    ];
    
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, "요약");
    
    // 고객 목록
    const customerData = customers.map(c => ({
      'NO.': c.no,
      '회사명': c.company,
      '담당자': c.manager,
      '지역': c.region,
      '전화1': c.phone1,
      '전화2': c.phone2,
      '이메일': c.email,
      '주요고객': c.mainCustomer,
      '주소': c.address,
      'DATE': c.date,
      'REMARK': c.remark,
      '등록일': formatDate(c.registDate),
      '수정일': formatDate(c.modifiedDate)
    }));
    
    const ws2 = XLSX.utils.json_to_sheet(customerData);
    XLSX.utils.book_append_sheet(wb, ws2, "고객목록");
    
    // 영업 안건
    const salesReportData = salesData.map(s => ({
      'NO.': s.no,
      '프로젝트명': s.projectName,
      '고객사': s.customer,
      '제품': s.product,
      '입찰금액': s.bidAmount,
      '통화': s.currency,
      '진행현황': s.progress,
      '담당자': s.manager,
      '등록일': s.registDate
    }));
    
    const ws3 = XLSX.utils.json_to_sheet(salesReportData);
    XLSX.utils.book_append_sheet(wb, ws3, "영업안건");
    
    XLSX.writeFile(wb, `통합CRM_리포트_${formatDate(new Date(), 'YYYYMMDD')}.xlsx`);
    
    showNotification('리포트가 다운로드되었습니다.', 'success');
  } catch (error) {
    console.error('리포트 생성 오류:', error);
    showNotification('리포트 생성에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

// 설정 기능
function loadSettings() {
  loadProfileSettings();
  loadTeamSettings();
  loadPipelineSettings();
  loadIntegrationSettings();
}

function showSettingsTab(tab) {
  // 탭 활성화
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // 패널 표시
  document.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`${tab}Settings`).classList.add('active');
}

function loadProfileSettings() {
  document.getElementById('profileName').value = currentUser.displayName || '';
  document.getElementById('profileEmail').value = currentUser.email;
  // TODO: 부서 정보 로드
}

async function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const dept = document.getElementById('profileDept').value.trim();
  
  try {
    showLoading();
    
    // Firebase Auth 프로필 업데이트
    await currentUser.updateProfile({
      displayName: name
    });
    
    // 추가 정보 저장
    await db.ref(`${paths.userMeta}/${currentUser.uid}`).update({
      department: dept,
      modifiedAt: new Date().toISOString()
    });
    
    // UI 업데이트
    document.getElementById('currentUserName').textContent = name;
    document.getElementById('sidebarUserName').textContent = name;
    
    showNotification('프로필이 저장되었습니다.', 'success');
  } catch (error) {
    console.error('프로필 저장 오류:', error);
    showNotification('프로필 저장에 실패했습니다.', 'error');
  } finally {
    hideLoading();
  }
}

function loadTeamSettings() {
  const teamList = document.getElementById('teamList');
  teamList.innerHTML = '<p>팀 관리 기능은 준비중입니다.</p>';
}

function inviteTeamMember() {
  showNotification('팀원 초대 기능은 준비중입니다.', 'info');
}

function loadPipelineSettings() {
  const pipelineStages = document.getElementById('pipelineStages');
  pipelineStages.innerHTML = '<p>파이프라인 설정 기능은 준비중입니다.</p>';
}

function loadIntegrationSettings() {
  // 연동 설정은 이미 HTML에 포함됨
}

function toggleIntegration(service) {
  showNotification(`${service} 연동 기능은 준비중입니다.`, 'info');
}

// 사이드바 토글
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('mainContent').classList.toggle('expanded');
}

// 알림 기능
function showNotifications() {
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;

  const isOpen = panel.classList.toggle('show');

  if (isOpen) {
    renderNotificationList();
    unreadNotificationCount = 0;
    updateNotificationBadge();
  }
}

function hideNotifications() {
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;
  panel.classList.remove('show');
}

// 열 크기 조절
let resizingCol = null, startX = 0, startW = 0;

function handleMouseDown(e) {
  if (e.target.classList.contains('col-resizer')) {
    startColumnResize(e);
  }
}

function startColumnResize(e) {
  resizingCol = e.target.parentElement;
  startX = e.pageX;
  startW = resizingCol.offsetWidth;
  
  document.addEventListener('mousemove', handleColumnResize);
  document.addEventListener('mouseup', stopColumnResize);
  e.preventDefault();
}

function handleColumnResize(e) {
  if (!resizingCol) return;
  
  const dx = e.pageX - startX;
  const newWidth = startW + dx;
  
  if (newWidth >= 30) {
    resizingCol.style.width = newWidth + 'px';
  }
}

function stopColumnResize() {
  document.removeEventListener('mousemove', handleColumnResize);
  document.removeEventListener('mouseup', stopColumnResize);
  resizingCol = null;
}

// 유틸리티 함수
function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showNotification(message, type = 'info') {
  // 토스트 알림 구현
  console.log(`[${type}] ${message}`);
  
  // 간단한 알림 표시
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 99999;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = 'error';
  }
}

function showSuccess(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = 'success';
  }
}

function formatCurrency(amount, short = false) {
  if (short && amount >= 100000000) {
    return (amount / 100000000).toFixed(1) + '억';
  } else if (short && amount >= 10000000) {
    return (amount / 10000000).toFixed(1) + '천만';
  } else if (short && amount >= 10000) {
    return (amount / 10000).toFixed(0) + '만';
  }
  
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW'
  }).format(amount);
}

function formatDate(dateString, format = 'YYYY-MM-DD') {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (format === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  } else if (format === 'YYYYMMDD') {
    return `${year}${month}${day}`;
  }
  
  return date.toLocaleDateString('ko-KR');
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR');
}

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 30) return `${days}일 전`;
  
  return formatDate(dateString);
}

function getGradeLabel(grade) {
  const labels = {
    normal: '일반',
    vip: 'VIP',
    vvip: 'VVIP'
  };
  return labels[grade] || '일반';
}

function getStageLabel(stage) {
  const labels = {
    lead: '리드',
    contact: '연락중',
    proposal: '제안서',
    negotiation: '협상중',
    closed: '성사',
    lost: '실패'
  };
  return labels[stage] || stage;
}

function getCommTypeLabel(type) {
  const labels = {
    email: '이메일',
    phone: '전화',
    meeting: '미팅',
    note: '메모'
  };
  return labels[type] || type;
}

function getCommIcon(type) {
  const icons = {
    email: 'fa-envelope',
    phone: 'fa-phone',
    meeting: 'fa-users',
    note: 'fa-sticky-note'
  };
  return icons[type] || 'fa-comment';
}

function getActivityIcon(type) {
  const icons = {
    customer_created: 'fa-user-plus',
    customer_updated: 'fa-user-edit',
    customer_deleted: 'fa-user-minus',
    deal_created: 'fa-handshake',
    deal_updated: 'fa-edit',
    deal_moved: 'fa-arrows-alt',
    deal_deleted: 'fa-times',
    comm_added: 'fa-comment',
    comm_deleted: 'fa-comment-slash',
    event_created: 'fa-calendar-plus',
    event_updated: 'fa-calendar-check',
    event_deleted: 'fa-calendar-minus'
  };
  return icons[type] || 'fa-info-circle';
}

function getEventColor(type) {
  const colors = {
    meeting: '#28a745',
    call: '#17a2b8',
    task: '#ffc107',
    other: '#6c757d'
  };
  return colors[type] || '#6c757d';
}

function getEventTypeLabel(type) {
  const labels = {
    meeting: '미팅',
    call: '전화',
    task: '작업',
    other: '기타'
  };
  return labels[type] || type;
}

// 데이터 분석 헬퍼 함수
function getLastMonths(count) {
  const months = [];
  const now = new Date();
  
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }));
  }
  
  return months;
}

function getMonthlyRevenue() {
  const now = new Date();
  const months = [];
  const totals = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      date
    });
    totals.push(0);
  }

  deals
    .filter(deal => (deal.stage || '') === 'closed' && deal.closeDate)
    .forEach(deal => {
      const closeDate = new Date(deal.closeDate);
      if (Number.isNaN(closeDate.getTime())) return;
      const key = `${closeDate.getFullYear()}-${closeDate.getMonth()}`;
      const index = months.findIndex(month => month.key === key);
      if (index !== -1) {
        totals[index] += Number(deal.value) || 0;
      }
    });

  return totals;
}

function getPipelineData() {
  return [
    deals.filter(d => d.stage === 'lead').length,
    deals.filter(d => d.stage === 'contact').length,
    deals.filter(d => d.stage === 'proposal').length,
    deals.filter(d => d.stage === 'negotiation').length,
    deals.filter(d => d.stage === 'closed').length
  ];
}

function getProductSalesData() {
  const productData = {};
  
  salesData.forEach(sale => {
    const product = sale.product || '기타';
    productData[product] = (productData[product] || 0) + 1;
  });
  
  return productData;
}

function getManagerPerformanceData() {
  const managerData = {};
  
  // 영업 데이터에서 완료 건수 집계
  salesData.filter(s => s.progress === '계약완료').forEach(sale => {
    const manager = sale.manager || '미지정';
    managerData[manager] = (managerData[manager] || 0) + 1;
  });
  
  // 거래 데이터에서 완료 건수 집계
  deals.filter(d => d.stage === 'closed').forEach(deal => {
    const manager = deal.assignedTo || '미지정';
    managerData[manager] = (managerData[manager] || 0) + 1;
  });
  
  // 정렬
  return Object.entries(managerData)
    .sort(([,a], [,b]) => b - a)
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});
}

// 대시보드 차트용 데이터 계산
function getProductOrderData() {
  const stageOrder = ['lead', 'contact', 'proposal', 'negotiation', 'closed', 'lost'];
  const stageData = {};

  stageOrder.forEach(stage => {
    const label = getStageLabel(stage);
    stageData[label] = deals.filter(d => (d.stage || 'lead') === stage).length;
  });

  return stageData;
}

function getMonthlyOrderData() {
  return getMonthlyRevenue();
}

function getShipyardProjectData() {
  const ownerData = {};

  deals.forEach(deal => {
    const ownerLabel = formatUserDisplay(deal.assignedTo || deal.createdBy || deal.modifiedBy || '') || '미지정';
    ownerData[ownerLabel] = (ownerData[ownerLabel] || 0) + 1;
  });

  return ownerData;
}

function getAnalyticsPeriodLabels(period) {
  switch(period) {
    case 'week':
      return ['월', '화', '수', '목', '금', '토', '일'];
    case 'month':
      return getLastMonths(6);
    case 'quarter':
      return ['1분기', '2분기', '3분기', '4분기'];
    case 'year':
      return ['2021', '2022', '2023', '2024', '2025'];
    default:
      return [];
  }
}

function getSalesData(period) {
  // 기간별 매출 데이터 계산
  const monthlyRevenue = getMonthlyRevenue();
  
  switch(period) {
    case 'week':
      return [3000000, 4500000, 3800000, 5200000, 6100000, 2900000, 3400000];
    case 'month':
      return monthlyRevenue;
    case 'quarter':
      return [45000000, 52000000, 48000000, 59000000];
    case 'year':
      return [180000000, 210000000, 245000000, 280000000, 320000000];
    default:
      return [];
  }
}

function getNewCustomersData(period) {
  // 신규 고객 데이터 계산
  switch(period) {
    case 'week':
      return [2, 3, 1, 4, 5, 1, 2];
    case 'month':
      return [12, 15, 18, 22, 20, 25];
    case 'quarter':
      return [45, 52, 48, 59];
    case 'year':
      return [180, 210, 245, 280, 320];
    default:
      return [];
  }
}

function getTotalCustomersData(period) {
  // 총 고객 데이터 계산
  switch(period) {
    case 'week':
      return [102, 105, 106, 110, 115, 116, 118];
    case 'month':
      return [100, 115, 133, 155, 175, 200];
    case 'quarter':
      return [100, 152, 200, 259];
    case 'year':
      return [50, 230, 475, 755, 1075];
    default:
      return [];
  }
}

// 리포트 데이터 생성
function generateReportData(period) {
  // 주요 고객수 계산
  const mainCustomers = customers.filter(c => c.mainCustomer === 'Y').length;
  
  // 나머지는 기존과 동일
  const totalDealRevenue = deals.filter(d => d.stage === 'closed').reduce((sum, d) => sum + (d.value || 0), 0);
  const totalSalesRevenue = salesData.filter(s => s.progress === '계약완료').reduce((sum, s) => {
    const amount = parseFloat(s.bidAmount?.replace(/,/g, '') || 0);
    return sum + (s.currency === 'USD' ? amount * 1300 : amount);
  }, 0);
  
  const totalOpportunities = deals.length + salesData.filter(s => s.progress).length;
  const closedOpportunities = deals.filter(d => d.stage === 'closed').length + 
                             salesData.filter(s => s.progress === '계약완료').length;
  
  return {
    period: period,
    totalCustomers: customers.length,
    mainCustomers: mainCustomers,
    totalDeals: deals.length,
    totalSales: salesData.length,
    totalRevenue: totalDealRevenue + totalSalesRevenue,
    conversionRate: totalOpportunities > 0 ? (closedOpportunities / totalOpportunities * 100).toFixed(1) : 0
  };
}
// 활동 로깅
async function logActivity(type, description) {
  try {
    await db.ref(paths.activities).push({
      type: type,
      description: description,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('활동 로깅 오류:', error);
  }
}

// 고객 데이터 가져오기
async function importCustomerData(data, mode = 'partial') {
  let importCount = 0;
  const batch = [];

  if (mode === 'full') {
    await db.ref(paths.customers).remove();
  }

  const today = new Date().toISOString().split('T')[0];

  for (const row of data) {
    const registrant = (row['등록자'] || row['등록자 '] || row['CreatedBy'] || row['createdBy'] || '').toString().trim() || (currentUser?.email || '');
    const mainCustomerFlag = normalizeMainCustomerFlag(row['주요고객']);

    const customerData = {
      no: row['NO.'] || '',
      company: row['회사명'] || '',
      manager: row['담당자'] || '',
      region: row['지역'] || '국내',
      phone1: row['전화1'] || '',
      phone2: row['전화2'] || '',
      email: row['이메일'] || '',
      mainCustomer: mainCustomerFlag,
      address: row['주소'] || '',
      date: parseDate(row['DATE'] || ''),
      remark: row['비고'] || row['REMARK'] || '',
      registDate: parseDate(row['등록일'] || '') || today,
      modifiedDate: parseDate(row['수정일'] || '') || today,
      registrant,
      createdAt: new Date().toISOString(),
      createdBy: registrant,
      modifiedBy: currentUser.email,
      registrantName: formatUserDisplay(registrant),
      createdByName: formatUserDisplay(registrant)
    };

    const remarkHistory = [];
    if (customerData.remark) {
      remarkHistory.push({
        timestamp: new Date().toISOString(),
        value: customerData.remark,
        modifiedBy: currentUser.email
      });
    }
    customerData.remarkHistory = remarkHistory;

    if (customerData.no && customerData.company) {
      batch.push(db.ref(paths.customers).push(customerData));
      importCount++;
    }
  }
  
  await Promise.all(batch);
  return importCount;
}
// 모든 모달 닫기
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.style.display = 'none';
  });
  
  document.querySelectorAll('.modal-background').forEach(modal => {
    modal.style.display = 'none';
  });
}

// 페이지네이션
function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    updatePagination();
  }
}

function nextPage() {
  const totalPages = Math.ceil(customers.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    updatePagination();
  }
}

function updatePagination() {
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const total = customers.length;
  
  document.querySelector('.page-info').textContent = `${start + 1}-${Math.min(end, total)} of ${total}`;
  
  // 페이지에 맞는 고객만 표시
  const tbody = document.getElementById('customerTableBody');
  tbody.innerHTML = '';
  
  customers.slice(start, end).forEach(customer => {
    addCustomerToTable(customer);
  });
}

// 초기화 완료 로그
console.log('통합 CRM Pro 시스템 초기화 완료');
console.log('버전: 3.0.0');
console.log('Firebase 프로젝트:', firebaseConfig.projectId);
console.log('통합 기능: CRM + 영업 안건 관리');

// 애니메이션 스타일 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);