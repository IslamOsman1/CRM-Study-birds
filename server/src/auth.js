import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'development-only-secret-change-me';

const modulePermissions = {
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

const actionPermissions = {
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

function normalizeList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function normalizePermissions(user) {
  return {
    modules: normalizeList(user?.permissions?.modules),
    actions: normalizeList(user?.permissions?.actions)
  };
}

export function canOpenModule(user, module) {
  if (user?.role === 'admin') return true;
  if (user?.permissionMode === 'custom') {
    return normalizePermissions(user).modules.includes(module);
  }
  return (modulePermissions[module] || []).includes(user?.role);
}

export function canDoAction(user, action) {
  if (user?.role === 'admin') return true;
  if (user?.permissionMode === 'custom') {
    return normalizePermissions(user).actions.includes(action);
  }
  return (actionPermissions[action] || []).includes(user?.role);
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      permissionMode: user.permissionMode || 'default',
      permissions: normalizePermissions(user)
    },
    secret(),
    { expiresIn: '12h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'مطلوب تسجيل الدخول' });

  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    return res.status(401).json({ message: 'انتهت صلاحية الجلسة أو الرمز غير صالح' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
    }
    next();
  };
}

export function allowAction(action) {
  return (req, res, next) => {
    if (!canDoAction(req.user, action)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
    }
    next();
  };
}

export function allowModule(module) {
  return (req, res, next) => {
    if (!canOpenModule(req.user, module)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية لعرض هذه الصفحة' });
    }
    next();
  };
}

export function allowAnyModule(...modules) {
  return (req, res, next) => {
    if (!modules.some(module => canOpenModule(req.user, module))) {
      return res.status(403).json({ message: 'ليس لديك صلاحية لعرض هذه الصفحة' });
    }
    next();
  };
}
