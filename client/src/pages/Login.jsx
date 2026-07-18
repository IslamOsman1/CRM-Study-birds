import React, { useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../auth.jsx';

const accounts = [
  ['admin@eduglobal.local', 'مسؤول النظام'],
  ['manager@eduglobal.local', 'الإدارة'],
  ['consultant@eduglobal.local', 'المستشار'],
  ['admissions@eduglobal.local', 'القبول'],
  ['reception@eduglobal.local', 'الاستقبال'],
  ['hr@eduglobal.local', 'الموارد البشرية'],
  ['finance@eduglobal.local', 'المالية']
];

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('admin@eduglobal.local');
  const [password, setPassword] = useState('Demo123!');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand">
          <div className="brand-mark large">E</div>
          <div>
            <strong>إيديو جلوبال CRM</strong>
            <span>تشغيل متكامل لخدمات التعليم الدولي</span>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow light">منصة واحدة مترابطة</p>
          <h1>حوّل كل استفسار طلابي إلى رحلة تعليمية دولية واضحة ومنظمة.</h1>
          <p>اربط الاستشارات والقبول والاستقبال والموارد البشرية والمالية والإدارة في مساحة عمل واحدة بدل الجداول المتفرقة.</p>
          <div className="login-features">
            <span><CheckCircle2 /> ملفات طلاب مشتركة</span>
            <span><CheckCircle2 /> صلاحيات حسب القسم</span>
            <span><CheckCircle2 /> مؤشرات إدارية مباشرة</span>
          </div>
        </div>

        <div className="login-quote">
          <Building2 />
          <p>مساحة عمل هادئة ومنظمة لإدارة العمليات التعليمية المعقدة.</p>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">مرحبًا بعودتك</p>
            <h2>سجّل الدخول إلى مساحة العمل</h2>
            <span>يمكنك استخدام أحد حسابات الأقسام التجريبية التالية.</span>
          </div>

          {error && <div className="form-error">{error}</div>}

          <label className="login-field">
            <span>البريد الإلكتروني</span>
            <div>
              <Mail />
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} required />
            </div>
          </label>

          <label className="login-field">
            <span>كلمة المرور</span>
            <div>
              <LockKeyhole />
              <input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required />
              <button type="button" onClick={() => setShow(value => !value)}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>

          <button className="login-submit" disabled={loading} type="submit">
            {loading ? 'جارٍ تسجيل الدخول...' : <>تسجيل الدخول <ArrowLeft size={18} /></>}
          </button>

          <div className="demo-accounts">
            <p>دخول تجريبي سريع بكلمة المرور <strong>Demo123!</strong></p>
            <div>
              {accounts.map(([mail, role]) => (
                <button
                  type="button"
                  key={mail}
                  onClick={() => {
                    setEmail(mail);
                    setPassword('Demo123!');
                  }}
                >
                  <span>{role}</span>
                  <small>{mail}</small>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
