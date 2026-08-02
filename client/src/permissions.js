export const modulePermissions = {
  consultancy: ['admin', 'management', 'consultant', 'admissions'],
  students: ['admin', 'management', 'consultant', 'admissions'],
  admissions: ['admin', 'management', 'consultant', 'admissions'],
  inbox: ['admin', 'management', 'consultant', 'admissions', 'reception'],
  reports: ['admin', 'management', 'finance', 'admissions'],
  tasks: ['admin', 'management', 'consultant', 'admissions', 'reception', 'hr', 'finance'],
  reception: ['admin', 'management', 'reception'],
  hr: ['admin', 'management', 'hr'],
  finance: ['admin', 'management', 'finance'],
  activity: ['admin', 'management'],
  universities: ['admin', 'management'],
  programs: ['admin', 'management'],
  scholarships: ['admin', 'management'],
  settings: ['admin', 'management']
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

export function can(role, action) {
  return (actionPermissions[action] || []).includes(role);
}

export function canOpenModule(role, module) {
  return (modulePermissions[module] || []).includes(role);
}
