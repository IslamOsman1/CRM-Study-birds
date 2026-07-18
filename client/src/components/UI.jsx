import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Progress({ value = 0 }) {
  return <div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Empty({ title, text }) {
  return <div className="empty"><div className="empty-icon">⌁</div><strong>{title}</strong><p>{text}</p></div>;
}

export function Spinner() {
  return <div className="spinner" aria-label="جاري التحميل" />;
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }) {
  useEffect(() => {
    const handler = event => event.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className={`modal modal-${size}`}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(onClose, 3500);
    return () => clearTimeout(id);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type || 'success'}`}>
      {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{toast.message}</span>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
