import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserCircle2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import studyBirdsLogo from '../assets/logo.jpeg';

const accounts = [
  ['manager@eduglobal.local', 'الإدارة'],
  ['consultant@eduglobal.local', 'المستشار'],
  ['admissions@eduglobal.local', 'القبول'],
  ['reception@eduglobal.local', 'الاستقبال'],
  ['hr@eduglobal.local', 'الموارد البشرية'],
  ['finance@eduglobal.local', 'المالية']
];

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="login-page login-page-studybirds">
      <section className="login-form-panel login-form-panel-studybirds">
        <form className="login-form login-form-studybirds" onSubmit={submit}>
          <div className="login-form-top">
            <img className="login-form-logo" src={studyBirdsLogo} alt="Study Birds" />
            <div className="login-form-brand">
              <strong>STUDY BIRDS</strong>
              <span>Your Future. Our Guidance. Worldwide.</span>
            </div>
          </div>

          <div className="login-form-copy">
            <p className="eyebrow">مرحباً بعودتك!</p>
            <h2>سجل الدخول إلى مساحة العمل</h2>
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

          <button className="login-submit login-submit-studybirds" disabled={loading} type="submit">
            {loading ? 'جارٍ تسجيل الدخول...' : <>تسجيل الدخول <ArrowLeft size={18} /></>}
          </button>

          <div className="demo-accounts demo-accounts-studybirds">
            <p>دخول تجريبي سريع بكلمة المرور <strong>Demo123!</strong></p>
            <div>
              {accounts.map(([mail, role]) => (
                <button
                  className="demo-account-card"
                  type="button"
                  key={mail}
                  onClick={() => {
                    setEmail(mail);
                    setPassword('Demo123!');
                  }}
                >
                  <i><UserCircle2 size={16} /></i>
                  <span>{role}</span>
                  <small>{mail}</small>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section className="login-brand-panel login-brand-panel-studybirds">
        <div className="login-brand-glow" />
        <div className="login-brand-network" />
        <div className="login-hero-mark">
          <img className="login-hero-logo" src={studyBirdsLogo} alt="Study Birds" />
        </div>

        <div className="login-copy login-copy-studybirds">
          <div className="login-copy-chip"><Sparkles size={14} /> نظام Study Birds CRM</div>
          <h1>حول كل استفسار طلابي إلى رحلة تعليمية دولية واضحة ومنظمة.</h1>
          <p>نظام موحد لإدارة الاستقبال والاستشارات والقبول والمتابعة بهوية بصرية أقرب لعلامة Study Birds.</p>
        </div>

        <div className="login-birds-strip">
          <div className="login-mini-card">
            <strong>الاستقبال</strong>
            <span>تسجيل أسرع وتوزيع أوضح</span>
          </div>
          <div className="login-mini-card">
            <strong>الاستشارات</strong>
            <span>متابعة منظمة لكل عميل</span>
          </div>
          <div className="login-mini-card">
            <strong>القبول</strong>
            <span>مستندات وحالات في مكان واحد</span>
          </div>
        </div>
      </section>
    </div>
  );
}
