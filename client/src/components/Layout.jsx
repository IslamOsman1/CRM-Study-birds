import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, Bell, BriefcaseBusiness, ChevronDown, CircleCheckBig, GraduationCap, Headphones, LineChart, LogOut, Menu, MessageCircleMore, Search, Settings2, UserSquare2, UsersRound, WalletCards, X } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';

const REFRESH_MS = 60_000;
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [hasNewAlerts, setHasNewAlerts] = useState(false);
  const highlightTimeoutRef = useRef(null);
  const knownTaskIdsRef = useRef(new Set());
  const allowed = useMemo(() => modules.filter(item => item.roles.includes(user.role)), [user.role]);
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
    setNotificationOpen(false);
    setProfileOpen(false);
    setMobileOpen(false);
    setHasNewAlerts(false);
  }, [location.pathname]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter(task => task.status !== 'done')
        .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')),
    [tasks]
  );

  const toggleNotifications = () => {
    setNotificationOpen(value => {
      const next = !value;
      if (next) setHasNewAlerts(false);
      return next;
    });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>إيديو جلوبال CRM</strong>
            <span>مركز التشغيل التعليمي</span>
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
            <div className="global-search">
              <Search size={18} />
              <input placeholder="ابحث عن طالب أو عميل محتمل أو فاتورة..." />
            </div>
          </div>

          <div className="top-actions">
            <div className="notification-wrap">
              <button className={`icon-btn notification ${hasNewAlerts ? 'notification-highlight' : ''}`} onClick={toggleNotifications} type="button">
                <Bell size={19} />
                {openTasks.length > 0 && <i />}
              </button>

              {notificationOpen && (
                <div className="notification-menu">
                  <div className="notification-menu-head">
                    <div>
                      <strong>التنبيهات</strong>
                      <span>تحديث تلقائي كل دقيقة · {openTasks.length} عنصر مفتوح</span>
                    </div>
                    <NavLink to="/tasks" className="notification-link">عرض الكل</NavLink>
                  </div>

                  <div className="notification-menu-list">
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

                    {!openTasks.length && (
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
              <p className="eyebrow">إيديو جلوبال / {title}</p>
              <h1>{title}</h1>
              <span>{subtitle}</span>
            </div>
            <div className="date-chip">{today}</div>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
