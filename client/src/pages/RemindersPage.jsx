import React, { useEffect, useMemo, useState } from 'react';
import { Archive, BellRing, CheckCircle2, ClipboardList, GraduationCap, UserRound } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Spinner, Toast } from '../components/UI.jsx';

const tabs = [
  { key: 'all', label: 'الكل', icon: BellRing },
  { key: 'tasks', label: 'المهام', icon: ClipboardList },
  { key: 'admissions', label: 'القبول', icon: GraduationCap },
  { key: 'personal', label: 'شخصي', icon: UserRound }
];

export default function RemindersPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState([]);

  const load = async () => {
    try {
      setReminders(await api('/api/reminders'));
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => reminders.filter(item => !item.archived && (activeTab === 'all' || item.type === activeTab)),
    [activeTab, reminders]
  );

  const archiveReminder = async reminderId => {
    try {
      const updated = await api(`/api/reminders/${reminderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true })
      });
      setReminders(current => current.map(item => (item.id === updated.id ? updated : item)));
      setToast({ message: 'تمت أرشفة التذكير وإنهاؤه.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل التذكيرات...</div>;

  return (
    <>
      <div className="crm-tabs">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`crm-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
            type="button"
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="crm-grid crm-grid-two">
        {visible.map(reminder => (
          <Card className="reminder-card" key={reminder.id}>
            <div className="reminder-head">
              <Badge tone={reminder.type === 'admissions' ? 'purple' : reminder.type === 'personal' ? 'blue' : 'amber'}>
                {tabs.find(tab => tab.key === reminder.type)?.label || 'تنبيه'}
              </Badge>
            </div>
            <p>{reminder.text}</p>
            <Button className="reminder-action" onClick={() => archiveReminder(reminder.id)} type="button">
              <Archive size={15} />
              أرشفة وإنهاء
            </Button>
          </Card>
        ))}

        {!visible.length && (
          <Card className="document-empty compact-empty">
            <CheckCircle2 />
            <strong>لا توجد تذكيرات نشطة</strong>
            <span>كل العناصر في هذا التبويب تمت أرشفتها.</span>
          </Card>
        )}
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
