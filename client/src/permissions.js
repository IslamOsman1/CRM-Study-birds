export const modulePermissions = {
  consultancy: ['admin', 'management', 'consultant', 'admissions', 'reception'],
  students: ['admin', 'management', 'consultant', 'admissions', 'finance', 'reception'],
  admissions: ['admin', 'management', 'consultant', 'admissions'],
  inbox: ['admin', 'management', 'consultant', 'admissions', 'reception'],
  reports: ['admin', 'management', 'finance', 'hr', 'admissions'],
  tasks: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  reminders: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  calls: ['admin', 'management', 'consultant', 'admissions', 'reception'],
  scripts: ['admin', 'management', 'consultant', 'admissions', 'reception'],
  dailyReport: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  leave: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  sales: ['admin', 'management', 'consultant'],
  reception: ['admin', 'management', 'reception'],
  hr: ['admin', 'management', 'hr'],
  finance: ['admin', 'management', 'finance'],
  activity: ['admin', 'management'],
  universities: ['admin', 'management', 'consultant'],
  programs: ['admin', 'management'],
  scholarships: ['admin', 'management'],
  settings: ['admin', 'management']
};

export const moduleLabels = {
  consultancy: 'الاستشارات',
  students: 'الطلاب',
  admissions: 'القبول والتسجيل',
  inbox: 'الصندوق الموحد',
  reports: 'التقارير',
  tasks: 'المهام',
  reminders: 'تذكيراتي',
  calls: 'جدول المكالمات',
  scripts: 'الاسكربتات',
  dailyReport: 'التقرير اليومي',
  leave: 'الإجازات',
  sales: 'بوابة المبيعات',
  reception: 'الاستقبال',
  hr: 'الموارد البشرية',
  finance: 'المالية',
  activity: 'سجل النشاط',
  universities: 'دليل الجامعات',
  programs: 'البرامج',
  scholarships: 'المنح',
  settings: 'الإعدادات'
};

export const actionPermissions = {
  createLead: ['admin', 'management', 'consultant', 'reception'],
  editLead: ['admin', 'management', 'consultant', 'reception'],
  deleteLead: ['admin', 'management'],
  moveLead: ['admin', 'management', 'consultant'],
  createApplication: ['admin', 'management', 'admissions', 'consultant'],
  updateApplicationStatus: ['admin', 'management', 'admissions'],
  manageApplicationFollowUp: ['admin', 'management', 'admissions', 'consultant'],
  uploadDocument: ['admin', 'management', 'admissions', 'consultant'],
  reviewDocument: ['admin', 'management', 'admissions'],
  deleteDocument: ['admin', 'management'],
  manageDocumentChecklists: ['admin', 'management'],
  manageApplicationWorkflows: ['admin', 'management'],
  createEmployee: ['admin', 'management', 'hr'],
  logAttendance: ['admin', 'management', 'hr'],
  terminateEmployee: ['admin', 'management', 'hr'],
  deleteEmployee: ['admin', 'management', 'hr'],
  createInvoice: ['admin', 'management', 'finance'],
  recordPayment: ['admin', 'management', 'finance'],
  deleteInvoice: ['admin', 'management', 'finance'],
  manageTasks: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  manageSettings: ['admin', 'management'],
  manageUsers: ['admin', 'management']
};

export const actionLabels = {
  createLead: 'إضافة عميل محتمل',
  editLead: 'تعديل العملاء المحتملين',
  deleteLead: 'حذف العملاء المحتملين',
  moveLead: 'نقل مراحل العملاء',
  createApplication: 'إنشاء طلب قبول',
  updateApplicationStatus: 'تحديث حالة الطلب',
  manageApplicationFollowUp: 'إدارة مراحل المتابعة',
  uploadDocument: 'رفع المستندات',
  reviewDocument: 'مراجعة المستندات',
  deleteDocument: 'حذف المستندات',
  manageDocumentChecklists: 'إدارة قوالب المستندات',
  manageApplicationWorkflows: 'إدارة قوالب المتابعة',
  createEmployee: 'إضافة موظف',
  logAttendance: 'تسجيل الحضور',
  terminateEmployee: 'إنهاء/إعادة تفعيل الموظف',
  deleteEmployee: 'حذف الموظف',
  createInvoice: 'إنشاء فاتورة',
  recordPayment: 'تسجيل دفعة',
  deleteInvoice: 'حذف فاتورة',
  manageTasks: 'إدارة المهام',
  manageSettings: 'تعديل إعدادات النظام',
  manageUsers: 'إدارة المستخدمين'
};

function normalizeSubject(subject) {
  if (subject && typeof subject === 'object') return subject;
  return { role: subject };
}

function normalizeCustomList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

export function can(role, action) {
  const subject = normalizeSubject(role);
  if (subject.role === 'admin') return true;
  if (subject.permissionMode === 'custom') {
    return normalizeCustomList(subject.permissions?.actions).includes(action);
  }
  return (actionPermissions[action] || []).includes(subject.role);
}

export function canOpenModule(role, module) {
  const subject = normalizeSubject(role);
  if (subject.role === 'admin') return true;
  if (subject.permissionMode === 'custom') {
    return normalizeCustomList(subject.permissions?.modules).includes(module);
  }
  return (modulePermissions[module] || []).includes(subject.role);
}
