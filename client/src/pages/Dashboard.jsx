import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  CircleAlert,
  FileClock,
  GraduationCap,
  TrendingUp,
  UsersRound,
  WalletCards
} from 'lucide-react';
import { api, formatMoney, formatDate } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { formatArabicTime, tr, trText } from '../i18n.js';

const icons = [BriefcaseBusiness, GraduationCap, TrendingUp, WalletCards];

function getActionIcon(type) {
  switch (type) {
    case 'discount':
    case 'refund':
    case 'payment_plan':
      return WalletCards;
    case 'reassignment':
      return UsersRound;
    case 'document_waiver':
      return FileClock;
    default:
      return BellRing;
  }
}

function getAlertIcon(type) {
  switch (type) {
    case 'deadline':
      return CalendarClock;
    case 'overdue_payment':
      return WalletCards;
    case 'complaint':
    case 'visa':
      return CircleAlert;
    default:
      return BellRing;
  }
}

function getAlertRoute(type) {
  switch (type) {
    case 'overdue_payment':
      return '/finance?status=overdue';
    case 'deadline':
    case 'visa':
      return '/admissions';
    case 'complaint':
      return '/students';
    default:
      return '/tasks?kind=alert';
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTone, setBroadcastTone] = useState('critical');
  const [processingId, setProcessingId] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const isExecutive = ['admin', 'management'].includes(user?.role);

  const loadDashboard = async () => {
    const [dashboard, taskList] = await Promise.all([api('/api/dashboard'), api('/api/tasks')]);
    setData(dashboard);
    setTasks(taskList);
  };

  useEffect(() => {
    loadDashboard().catch(err => setError(err.message));
  }, []);

  const openTasks = useMemo(
    () =>
      tasks
        .filter(task => task.status !== 'done')
        .sort((a, b) => {
          const aDate = a.dueDate || '9999-12-31';
          const bDate = b.dueDate || '9999-12-31';
          return aDate.localeCompare(bDate);
        }),
    [tasks]
  );

  if (!data) {
    return <div className="loading-page"><Spinner /><span>{error || 'جارٍ تحميل بيانات الإدارة...'}</span></div>;
  }

  const handleExecutiveDecision = async (action, decision) => {
    setProcessingId(action.id);
    try {
      await api(`/api/dashboard/executive-actions/${action.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision })
      });
      await loadDashboard();
      setToast({
        type: 'success',
        message: decision === 'approved' ? `تم اعتماد ${action.label}` : `تم رفض ${action.label}`
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setProcessingId('');
    }
  };

  const handleBroadcast = async event => {
    event.preventDefault();
    setSendingBroadcast(true);
    try {
      await api('/api/dashboard/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ message: broadcastMessage, tone: broadcastTone })
      });
      setBroadcastMessage('');
      setBroadcastTone('critical');
      setBroadcastOpen(false);
      await loadDashboard();
      setToast({ type: 'success', message: 'تم إرسال التعميم العاجل لجميع الشاشات.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSendingBroadcast(false);
    }
  };

  const cards = [
    ['الفرص النشطة', data.kpis.activeLeads, `${data.kpis.totalLeads} عميلاً محتملاً إجمالاً`, 'positive'],
    ['الطلاب المسجلون', data.kpis.students, `${data.kpis.pendingApplications} يحتاجون مستندات`, 'neutral'],
    ['معدل التحويل', `${data.kpis.conversionRate}%`, 'المسجلون من إجمالي العملاء المحتملين', 'positive'],
    ['الإيراد المحصل', formatMoney(data.kpis.collected), `${formatMoney(data.kpis.outstanding)} مستحق`, 'positive']
  ];

  const maxRevenue = Math.max(...data.monthlyRevenue.map(item => item.value), 1);
  const alertsCount = openTasks.filter(task => task.kind === 'alert').length;
  const highPriorityCount = openTasks.filter(task => task.priority === 'High').length;
  const pendingExecutiveActions = (data.executiveActions || []).filter(action => action.status === 'pending');
  const emergencyAlerts = data.emergencyAlerts || [];

  return (
    <>
      <div className="dashboard-grid">
        {isExecutive && (
          <div className="executive-panels-grid">
            <Card className="quick-actions-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">CEO Dashboard</p>
                  <h2>الإجراءات السريعة</h2>
                  <span>{pendingExecutiveActions.length} طلب بانتظار قرار مباشر من الإدارة</span>
                </div>
                <Button variant="primary" onClick={() => setBroadcastOpen(true)}>إرسال تعميم عاجل</Button>
              </div>

              {data.latestBroadcast && (
                <div className={`broadcast-banner tone-${data.latestBroadcast.tone || 'critical'}`}>
                  <BellRing />
                  <div>
                    <strong>آخر تعميم مرسل</strong>
                    <p>{data.latestBroadcast.message}</p>
                    <span>{data.latestBroadcast.createdBy} · {formatDate(data.latestBroadcast.createdAt)} · {formatArabicTime(data.latestBroadcast.createdAt)}</span>
                  </div>
                </div>
              )}

              <div className="executive-actions-list">
                {pendingExecutiveActions.map(action => {
                  const ActionIcon = getActionIcon(action.type);
                  const approveLabel = action.type === 'refund' ? 'اعتماد نهائي' : 'موافقة';
                  return (
                    <article className="executive-action-item" key={action.id}>
                      <div className="executive-action-icon">
                        <ActionIcon />
                      </div>
                      <div className="executive-action-body">
                        <div className="executive-action-head">
                          <strong>{action.label}</strong>
                          <Badge tone="amber">بانتظار القرار</Badge>
                        </div>
                        <h3>{action.title}</h3>
                        <p>{action.summary}</p>
                        <span>{action.subjectName} · {action.requestedBy} · {formatDate(action.requestedAt)}</span>
                      </div>
                      <div className="executive-action-controls">
                        <Button
                          variant="primary"
                          disabled={processingId === action.id}
                          onClick={() => handleExecutiveDecision(action, 'approved')}
                        >
                          {processingId === action.id ? 'جارٍ التنفيذ...' : approveLabel}
                        </Button>
                        {action.decisionMode === 'approve-reject' && (
                          <Button
                            variant="secondary"
                            disabled={processingId === action.id}
                            onClick={() => handleExecutiveDecision(action, 'rejected')}
                          >
                            رفض
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}

                {!pendingExecutiveActions.length && (
                  <div className="document-empty compact-empty">
                    <BellRing />
                    <strong>لا توجد طلبات إدارية معلقة</strong>
                    <span>كل طلبات الخصومات والتحويلات والاستثناءات تم التعامل معها حالياً.</span>
                  </div>
                )}
              </div>
            </Card>

            <Card className="emergency-box-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Priority Watch</p>
                  <h2>تنبيهات الطوارئ</h2>
                  <span>{emergencyAlerts.length} حالة حرجة تحتاج تدخل المدير</span>
                </div>
                <CircleAlert />
              </div>

              <div className="emergency-alerts-list">
                {emergencyAlerts.map(alert => {
                  const AlertIcon = getAlertIcon(alert.type);
                  return (
                    <article className={`emergency-alert-card tone-${alert.severity}`} key={alert.id}>
                      <div className="emergency-alert-head">
                        <div className="emergency-alert-icon">
                          <AlertIcon />
                        </div>
                        <Badge tone={alert.severity === 'critical' ? 'red' : 'amber'}>
                          {alert.severity === 'critical' ? 'حرج' : 'تحذير'}
                        </Badge>
                      </div>
                      <strong>{alert.title}</strong>
                      <p>{alert.description}</p>
                      <span>{alert.meta}</span>
                      <button className="inline-link-btn" onClick={() => navigate(getAlertRoute(alert.type))} type="button">
                        فتح القسم المرتبط
                      </button>
                    </article>
                  );
                })}

                {!emergencyAlerts.length && (
                  <div className="document-empty compact-empty">
                    <CircleAlert />
                    <strong>لا توجد حالات طوارئ نشطة</strong>
                    <span>مراقبة المواعيد والفيزا والدفعات والشكاوى تعمل بشكل طبيعي.</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        <div className="kpi-grid">
          {cards.map((card, index) => {
            const Icon = icons[index];
            return (
              <Card
                key={card[0]}
                className="kpi-card kpi-card-clickable"
                onClick={() => navigate(index === 0 ? '/consultancy' : index === 1 ? '/students' : index === 2 ? '/reports' : '/finance')}
              >
                <div className="kpi-icon"><Icon /></div>
                <div className="kpi-meta">
                  <span>{card[0]}</span>
                  <strong>{card[1]}</strong>
                  <small className={card[3]}><ArrowUpRight /> {card[2]}</small>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="revenue-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">نظرة مالية</p>
              <h2>أداء الإيرادات</h2>
              <span>مدفوعات الطلاب المحصلة خلال آخر ستة أشهر.</span>
            </div>
            <Badge tone="purple">{formatMoney(data.kpis.invoiced)} قيمة الفواتير</Badge>
          </div>
          <div className="chart-area">
            <div className="chart-y">
              <span>$50k</span>
              <span>$25k</span>
              <span>$0</span>
            </div>
            <div className="bar-chart">
              {data.monthlyRevenue.map(item => (
                <div className="bar-item" key={item.month}>
                  <div className="bar-value">{formatMoney(item.value)}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${Math.max(10, (item.value / maxRevenue) * 100)}%` }} />
                  </div>
                  <span>{item.month}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="dashboard-alerts-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">تشغيل فوري</p>
              <h2>تنبيهات اليوم</h2>
              <span>{alertsCount} تنبيه آلي و{highPriorityCount} عنصر عالي الأولوية</span>
            </div>
            <BellRing />
          </div>

          <div className="alerts-mini-stats">
            <div>
              <strong>{openTasks.length}</strong>
              <span>مفتوحة الآن</span>
            </div>
            <div>
              <strong>{alertsCount}</strong>
              <span>آلية</span>
            </div>
            <div>
              <strong>{highPriorityCount}</strong>
              <span>عاجلة</span>
            </div>
          </div>

          <div className="alerts-mini-list">
            {openTasks.slice(0, 4).map(task => (
              <article className="alert-mini-item" key={task.id}>
                <div className={`alert-mini-icon ${task.priority === 'High' ? 'is-red' : task.kind === 'alert' ? 'is-amber' : 'is-blue'}`}>
                  {task.priority === 'High' ? <CircleAlert /> : task.kind === 'alert' ? <BellRing /> : <CalendarClock />}
                </div>
                <div className="alert-mini-body">
                  <div className="alert-mini-head">
                    <strong>{task.title}</strong>
                    <Badge tone={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'amber' : 'neutral'}>{tr(task.priority)}</Badge>
                  </div>
                  <p>{task.description || 'لا توجد تفاصيل إضافية'}</p>
                  <span>{tr(task.source)} · {task.dueDate ? formatDate(task.dueDate) : 'بدون تاريخ'} · {tr(task.status)}</span>
                </div>
              </article>
            ))}

            {!openTasks.length && (
              <div className="document-empty compact-empty">
                <BellRing />
                <strong>لا توجد تنبيهات مفتوحة</strong>
                <span>كل المتابعات اليومية تحت السيطرة حالياً.</span>
              </div>
            )}
          </div>

          <div className="dashboard-alerts-footer">
            <Link to="/tasks" className="btn btn-secondary">عرض كل المهام</Link>
          </div>
        </Card>

        <Card className="pipeline-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">مسار المبيعات</p>
              <h2>توزيع المراحل</h2>
            </div>
            <BriefcaseBusiness />
          </div>
          <div className="stage-list">
            {data.stageDistribution.filter(item => item.stage !== 'Lost').map(item => (
              <div className="stage-row" key={item.stage}>
                <div>
                  <span>{tr(item.stage)}</span>
                  <strong>{item.count}</strong>
                </div>
                <Progress value={data.kpis.totalLeads ? (item.count / data.kpis.totalLeads) * 100 : 0} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="consultants-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">أداء الفريق</p>
              <h2>ترتيب المستشارين</h2>
            </div>
            <UsersRound />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستشار</th>
                  <th>المسند إليه</th>
                  <th>المسجلون</th>
                  <th>التحويل</th>
                  <th>الأداء</th>
                </tr>
              </thead>
              <tbody>
                {data.consultantStats.map((row, index) => (
                  <tr key={row.id}>
                    <td><div className="person-cell"><span className="rank">{index + 1}</span><strong>{row.name}</strong></div></td>
                    <td>{row.assigned}</td>
                    <td>{row.enrolled}</td>
                    <td><Badge tone={row.conversion >= 20 ? 'green' : 'neutral'}>{row.conversion}%</Badge></td>
                    <td><div className="score-cell"><Progress value={row.score} /><span>{row.score}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="activity-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">النشاط المباشر</p>
              <h2>آخر التحديثات</h2>
            </div>
            <FileClock />
          </div>
          <div className="activity-list">
            {data.recentActivity.map(item => (
              <div className="activity-item" key={item.id}>
                <div className="activity-dot" />
                <div>
                  <strong>{item.actorName}</strong>
                  <p>{trText(item.details)}</p>
                  <span>{tr(item.entityType)} · {formatDate(item.createdAt)} · {formatArabicTime(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={broadcastOpen}
        onClose={() => !sendingBroadcast && setBroadcastOpen(false)}
        title="إرسال تعميم عاجل"
        subtitle="سيظهر هذا التنبيه فوراً على شاشات الموظفين."
      >
        <form className="stack-form" onSubmit={handleBroadcast}>
          <Field label="نص التعميم">
            <textarea
              value={broadcastMessage}
              onChange={event => setBroadcastMessage(event.target.value)}
              placeholder="اكتب التنبيه العاجل المطلوب إرساله للفريق..."
              required
            />
          </Field>

          <Field label="درجة التنبيه">
            <select value={broadcastTone} onChange={event => setBroadcastTone(event.target.value)}>
              <option value="critical">حرج</option>
              <option value="warning">تحذير</option>
              <option value="info">معلومة مهمة</option>
            </select>
          </Field>

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setBroadcastOpen(false)} disabled={sendingBroadcast}>إلغاء</Button>
            <Button type="submit" disabled={sendingBroadcast}>{sendingBroadcast ? 'جارٍ الإرسال...' : 'إرسال الآن'}</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
