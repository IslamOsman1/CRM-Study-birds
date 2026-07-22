import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Bell, BriefcaseBusiness, ChevronDown, CircleCheckBig, GraduationCap, Headphones, LineChart, LogOut, Menu, MessageCircleMore, Search, Settings2, UserSquare2, UsersRound, WalletCards, X } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import studyBirdsLogo from '../assets/study-birds-logo.svg';

const REFRESH_MS = 10_000;
const HIGHLIGHT_MS = 8_000;

const modules = [
  { to: '/', label: 'لوحة الإدارة', icon: BarChart3, roles: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'] },
  { to: '/consultancy', label: 'الاستشارات', icon: BriefcaseBusiness, roles: ['admin', 'management', 'consultant', 'admissions', 'reception'] },
  { to: '/students', label: 'الطلاب', icon: UserSquare2, roles: ['admin', 'management', 'consultant', 'admissions', 'finance', 'reception'] },
  { to: '/admissions', label: 'القبول والتسجيل', icon: GraduationCap, roles: ['admin', 'management', 'consultant', 'admissions'] },
  { to: '/inbox', label: 'الصندوق الموحد', icon: MessageCircleMore, roles: ['admin', 'management', 'consultant', 'admissions', 'reception'] },
  { to: '/reports', label: 'التقارير', icon: LineChart, roles: ['admin', 'management', 'finance', 'hr', 'admissions'] },
  { to: '/tasks', label: 'المهام والتنبيهات', icon: CircleCheckBig, roles: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'] },
  { to: '/reception', label: 'الاستقبال', icon: Headphones, roles: ['admin', 'management', 'reception'] },
  { to: '/hr', label: 'الموارد البشرية', icon: UsersRound, roles: ['admin', 'management', 'hr'] },
  { to: '/finance', label: 'المالية', icon: WalletCards, roles: ['admin', 'management', 'finance'] },
  { to: '/activity', label: 'سجل النشاط', icon: Activity, roles: ['admin', 'management'] },
  { to: '/settings', label: 'الإعدادات', icon: Settings2, roles: ['admin', 'management'] }
];

const titles = {
  '/': ['لوحة الإدارة', 'نظرة موحدة على المبيعات والقبول والموارد البشرية والإيرادات.'],
  '/consultancy': ['قسم الاستشارات', 'تابع العملاء المحتملين وانقلهم خلال رحلة الطالب خطوة بخطوة.'],
  '/students': ['ملفات الطلاب', 'اعرض بيانات الطالب وطلباته وفواتيره من مكان واحد.'],
  '/admissions': ['القبول والتسجيل', 'إدارة الطلبات والمستندات وقرارات الجامعات من مكان واحد.'],
  '/inbox': ['الصندوق الموحد', 'إدارة رسائل واتساب وماسنجر وإنستغرام من واجهة تشغيل واحدة.'],
  '/reports': ['التقارير', 'تابع مؤشرات الأداء والقبول والتحصيل مع فلاتر زمنية وتصدير فوري.'],
  '/tasks': ['المهام والتنبيهات', 'متابعة يومية للتنبيهات الآلية والمهام اليدوية حسب كل قسم.'],
  '/reception': ['الاستقبال وخدمة العملاء', 'سجل الاستفسارات الجديدة ووجّهها بسرعة إلى المستشار المناسب.'],
  '/hr': ['الموارد البشرية', 'ملفات الموظفين والحضور والأداء داخل الفريق.'],
  '/finance': ['القسم المالي', 'الفواتير والمدفوعات والعمولات والأرصدة المستحقة.'],
  '/activity': ['سجل النشاط', 'تسلسل زمني للنشاطات عبر جميع الأقسام.'],
  '/settings': ['الإعدادات', 'إدارة بيانات الشركة والمراحل والحالات والمستندات والمستخدمين.']
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [hasNewAlerts, setHasNewAlerts] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [popupNotification, setPopupNotification] = useState(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const highlightTimeoutRef = useRef(null);
  const knownTaskIdsRef = useRef(new Set());
  const seenNotificationIdsRef = useRef(new Set());
  const globalSearchRef = useRef(null);
  const allowed = useMemo(() => {
    if (user.role === 'reception') {
      return modules.filter(item => ['/reception', '/inbox', '/tasks'].includes(item.to));
    }
    if (user.role === 'finance') {
      return modules.filter(item => ['/finance', '/reports', '/tasks'].includes(item.to));
    }
    if (user.role === 'hr') {
      return modules.filter(item => ['/hr', '/tasks'].includes(item.to));
    }
    return modules.filter(item => item.roles.includes(user.role));
  }, [user.role]);
  const [title, subtitle] = titles[location.pathname] || titles['/'];
  const today = new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date('2026-07-18'));

  useEffect(() => {
    let active = true;

    const loadTasks = async () => {
      try {
        const nextTasks = await api('/api/tasks');
        if (!active) return;

        const nextOpenIds = new Set(nextTasks.filter(task => task.status !== 'done').map(task => task.id));
        const previousIds = knownTaskIdsRef.current;
        const hasIncoming = [...nextOpenIds].some(id => !previousIds.has(id));

        if (previousIds.size > 0 && hasIncoming && !notificationOpen) {
          setHasNewAlerts(true);
          window.clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = window.setTimeout(() => setHasNewAlerts(false), HIGHLIGHT_MS);
        }

        knownTaskIdsRef.current = nextOpenIds;
        setTasks(nextTasks);
      } catch {
        if (active) setTasks(current => current);
      }
    };

    loadTasks();
    const intervalId = window.setInterval(loadTasks, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.clearTimeout(highlightTimeoutRef.current);
    };
  }, [notificationOpen]);

  useEffect(() => {
    let active = true;

    const loadNotifications = async () => {
      try {
        const items = await api('/api/notifications');
        if (!active) return;
        setNotifications(items);
        const unreadNew = items.find(item => !item.readAt && !seenNotificationIdsRef.current.has(item.id));
        if (unreadNew) {
          seenNotificationIdsRef.current.add(unreadNew.id);
          setPopupNotification(unreadNew);
          await api(`/api/notifications/${unreadNew.id}/read`, { method: 'POST' }).catch(() => null);
        }
      } catch {
        if (active) setNotifications(current => current);
      }
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setNotificationOpen(false);
    setProfileOpen(false);
    setMobileOpen(false);
    setHasNewAlerts(false);
    setGlobalResults([]);
  }, [location.pathname]);

  useEffect(() => {
    const trimmed = globalQuery.trim();
    if (trimmed.length < 2) {
      setGlobalResults([]);
      setGlobalSearching(false);
      return undefined;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setGlobalSearching(true);
      try {
        const requests = [];

        if (allowed.some(item => item.to === '/students')) {
          requests.push(
            api('/api/students').then(items =>
              items
                .filter(student =>
                  [student.name, student.phone, student.email]
                    .some(value => String(value || '').toLowerCase().includes(trimmed.toLowerCase()))
                )
                .slice(0, 4)
                .map(student => ({
                  id: `student-${student.id}`,
                  title: student.name,
                  subtitle: student.phone || student.email || 'ملف طالب',
                  route: `/students?studentId=${student.id}`,
                  kind: 'طالب'
                }))
            )
          );
        }

        if (allowed.some(item => item.to === '/consultancy')) {
          requests.push(
            api('/api/leads').then(items =>
              items
                .filter(lead =>
                  [lead.name, lead.phone, lead.email, lead.targetCountry, lead.targetMajor]
                    .some(value => String(value || '').toLowerCase().includes(trimmed.toLowerCase()))
                )
                .slice(0, 4)
                .map(lead => ({
                  id: `lead-${lead.id}`,
                  title: lead.name,
                  subtitle: `${tr(lead.stage || 'Initial Inquiry')} · ${lead.phone || 'بدون هاتف'}`,
                  route: `/consultancy?leadId=${lead.id}`,
                  kind: 'استشارات'
                }))
            )
          );
        }

        if (allowed.some(item => item.to === '/admissions')) {
          requests.push(
            api('/api/applications').then(items =>
              items
                .filter(app =>
                  [app.student?.name, app.university, app.program, app.applicationRefNo]
                    .some(value => String(value || '').toLowerCase().includes(trimmed.toLowerCase()))
                )
                .slice(0, 4)
                .map(app => ({
                  id: `application-${app.id}`,
                  title: app.student?.name || app.program || 'طلب تقديم',
                  subtitle: `${app.university || 'جامعة غير محددة'} · ${app.applicationRefNo || tr(app.status)}`,
                  route: `/admissions?applicationId=${app.id}`,
                  kind: 'قبول'
                }))
            )
          );
        }

        if (allowed.some(item => item.to === '/finance')) {
          requests.push(
            api('/api/invoices').then(items =>
              items
                .filter(invoice =>
                  [invoice.number, invoice.student?.name, invoice.student?.phone, invoice.description]
                    .some(value => String(value || '').toLowerCase().includes(trimmed.toLowerCase()))
                )
                .slice(0, 4)
                .map(invoice => ({
                  id: `invoice-${invoice.id}`,
                  title: invoice.number,
                  subtitle: `${invoice.student?.name || 'بدون طالب'} · ${invoice.description || 'فاتورة'}`,
                  route: `/finance?invoiceId=${invoice.id}`,
                  kind: 'مالية'
                }))
            )
          );
        }

        const responseGroups = await Promise.all(requests);
        if (!active) return;
        setGlobalResults(responseGroups.flat().slice(0, 10));
      } catch {
        if (active) setGlobalResults([]);
      } finally {
        if (active) setGlobalSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [allowed, globalQuery]);

  useEffect(() => {
    const handler = event => {
      if (globalSearchRef.current && !globalSearchRef.current.contains(event.target)) {
        setGlobalResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openTasks = useMemo(
    () =>
      tasks
        .filter(task => task.status !== 'done')
        .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')),
    [tasks]
  );
  const unreadNotifications = useMemo(() => notifications.filter(item => !item.readAt), [notifications]);

  const toggleNotifications = () => {
    setNotificationOpen(value => {
      const next = !value;
      if (next) setHasNewAlerts(false);
      return next;
    });
  };

  const submitGlobalSearch = event => {
    event.preventDefault();
    const first = globalResults[0];
    if (!first) return;
    navigate(first.route);
    setGlobalQuery('');
    setGlobalResults([]);
  };

  const openSearchResult = route => {
    navigate(route);
    setGlobalQuery('');
    setGlobalResults([]);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src={studyBirdsLogo} alt="Study Birds" />
          <div className="brand-copy">
            <strong>STUDY BIRDS CRM</strong>
            <span>Your Future. Our Guidance. Worldwide.</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} type="button">
            <X size={20} />
          </button>
        </div>

        <nav className="side-nav">
          <p className="nav-label">مساحة العمل</p>
          {allowed.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-card">
            <span>حالة النظام</span>
            <strong><i /> جميع الخدمات تعمل بشكل طبيعي</strong>
          </div>
          <button className="side-link logout" onClick={logout} type="button">
            <LogOut size={19} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {mobileOpen && <button aria-label="إغلاق التنقل" className="mobile-overlay" onClick={() => setMobileOpen(false)} type="button" />}

      <main className="main-shell">
        <header className="topbar">
          <div className="top-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} type="button">
              <Menu size={21} />
            </button>
            <div className="global-search-wrap" ref={globalSearchRef}>
              <form className="global-search" onSubmit={submitGlobalSearch}>
                <Search size={18} />
                <input
                  value={globalQuery}
                  onChange={event => setGlobalQuery(event.target.value)}
                  placeholder="ابحث عن طالب أو عميل محتمل أو فاتورة..."
                />
              </form>
              {(globalSearching || globalResults.length > 0 || globalQuery.trim().length >= 2) && (
                <div className="global-search-menu">
                  {globalSearching ? (
                    <div className="global-search-empty">
                      <strong>جارٍ البحث...</strong>
                      <span>نبحث داخل الملفات والأقسام المتاحة لك الآن.</span>
                    </div>
                  ) : globalResults.length ? (
                    globalResults.map(item => (
                      <button
                        key={item.id}
                        className="global-search-item"
                        onClick={() => openSearchResult(item.route)}
                        type="button"
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </div>
                        <small>{item.kind}</small>
                      </button>
                    ))
                  ) : (
                    <div className="global-search-empty">
                      <strong>لا توجد نتائج مطابقة</strong>
                      <span>جرّب الاسم أو الهاتف أو رقم الطلب أو رقم الفاتورة.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="top-actions">
            <div className="notification-wrap">
              <button className={`icon-btn notification ${hasNewAlerts ? 'notification-highlight' : ''}`} onClick={toggleNotifications} type="button">
                <Bell size={19} />
                {(openTasks.length > 0 || unreadNotifications.length > 0) && <i />}
              </button>

              {notificationOpen && (
                <div className="notification-menu">
                  <div className="notification-menu-head">
                    <div>
                      <strong>التنبيهات</strong>
                      <span>تحديث تلقائي كل 10 ثوانٍ · {unreadNotifications.length} إشعار جديد</span>
                    </div>
                    <NavLink to="/tasks" className="notification-link">عرض الكل</NavLink>
                  </div>

                  <div className="notification-menu-list">
                    {notifications.slice(0, 4).map(item => (
                      <div key={item.id} className="notification-item">
                        <div className={`notification-item-dot ${item.metadata?.tone === 'critical' ? 'is-red' : item.metadata?.tone === 'warning' ? 'is-amber' : 'is-blue'}`} />
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                          <span>{item.readAt ? 'تمت القراءة' : 'جديد'} · {item.createdAt ? formatDate(item.createdAt) : 'الآن'}</span>
                        </div>
                      </div>
                    ))}

                    {openTasks.slice(0, 5).map(task => (
                      <NavLink key={task.id} to="/tasks" className="notification-item">
                        <div className={`notification-item-dot ${task.priority === 'High' ? 'is-red' : task.kind === 'alert' ? 'is-amber' : 'is-blue'}`} />
                        <div>
                          <strong>{task.title}</strong>
                          <p>{task.description || 'لا توجد تفاصيل إضافية'}</p>
                          <span>{tr(task.source)} · {task.dueDate ? formatDate(task.dueDate) : 'بدون تاريخ'}</span>
                        </div>
                      </NavLink>
                    ))}

                    {!notifications.length && !openTasks.length && (
                      <div className="notification-empty">
                        <strong>لا توجد تنبيهات مفتوحة</strong>
                        <span>كل المهام تحت السيطرة حالياً.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen(value => !value)} type="button">
                <div className="avatar">{user.avatar || user.name.split(' ').map(item => item[0]).slice(0, 2).join('')}</div>
                <div>
                  <strong>{user.name}</strong>
                  <span>{tr(user.department)}</span>
                </div>
                <ChevronDown size={16} />
              </button>

              {profileOpen && (
                <div className="profile-menu">
                  <div>
                    <strong>{user.email}</strong>
                    <span className="role-chip">{tr(user.role)}</span>
                  </div>
                  <button onClick={logout} type="button">
                    <LogOut size={17} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-title">
            <div>
              <p className="eyebrow">STUDY BIRDS / {title}</p>
              <h1>{title}</h1>
              <span>{subtitle}</span>
            </div>
            <div className="date-chip">{today}</div>
          </div>
          <Outlet />
        </div>
        {popupNotification && (
          <div className="live-popup">
            <div className="live-popup-head">
              <strong>{popupNotification.title}</strong>
              <button className="icon-btn" type="button" onClick={() => setPopupNotification(null)}>
                <X size={16} />
              </button>
            </div>
            <p>{popupNotification.message}</p>
          </div>
        )}
      </main>
    </div>
  );
}
