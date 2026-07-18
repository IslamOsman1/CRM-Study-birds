import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BellRing, BriefcaseBusiness, CalendarClock, CircleAlert, FileClock, GraduationCap, TrendingUp, UsersRound, WalletCards } from 'lucide-react';
import { api, formatMoney, formatDate } from '../api.js';
import { Badge, Button, Card, Progress, Spinner } from '../components/UI.jsx';
import { formatArabicTime, tr, trText } from '../i18n.js';

const icons = [BriefcaseBusiness, GraduationCap, TrendingUp, WalletCards];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/api/dashboard'), api('/api/tasks')])
      .then(([dashboard, taskList]) => {
        setData(dashboard);
        setTasks(taskList);
      })
      .catch(err => setError(err.message));
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

  const cards = [
    ['الفرص النشطة', data.kpis.activeLeads, `${data.kpis.totalLeads} عميلًا محتملًا إجمالًا`, 'positive'],
    ['الطلاب المسجلون', data.kpis.students, `${data.kpis.pendingApplications} يحتاجون مستندات`, 'neutral'],
    ['معدل التحويل', `${data.kpis.conversionRate}%`, 'المسجلون من إجمالي العملاء المحتملين', 'positive'],
    ['الإيراد المحصل', formatMoney(data.kpis.collected), `${formatMoney(data.kpis.outstanding)} مستحق`, 'positive']
  ];
  const maxRevenue = Math.max(...data.monthlyRevenue.map(item => item.value), 1);
  const alertsCount = openTasks.filter(task => task.kind === 'alert').length;
  const highPriorityCount = openTasks.filter(task => task.priority === 'High').length;

  return (
    <div className="dashboard-grid">
      <div className="kpi-grid">
        {cards.map((card, index) => {
          const Icon = icons[index];
          return (
            <Card key={card[0]} className="kpi-card">
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
          <a href="/tasks" className="btn btn-secondary">عرض كل المهام</a>
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
  );
}
