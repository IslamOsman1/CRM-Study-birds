const valueMap = {
  admin: 'مسؤول النظام',
  management: 'الإدارة',
  consultant: 'مستشار',
  admissions: 'القبول',
  reception: 'الاستقبال',
  hr: 'الموارد البشرية',
  finance: 'المالية',
  settings: 'الإعدادات',
  task: 'مهمة',
  alert: 'تنبيه',
  user: 'مستخدم',
  lead: 'عميل محتمل',
  student: 'طالب',
  application: 'طلب',
  invoice: 'فاتورة',
  payment: 'دفعة',
  attendance: 'حضور',
  reception_log: 'سجل استقبال',
  Consultancy: 'الاستشارات',
  Admissions: 'القبول والتسجيل',
  Reception: 'الاستقبال',
  'Human Resources': 'الموارد البشرية',
  Finance: 'المالية',
  'Executive Management': 'الإدارة التنفيذية',
  'Upper Management': 'الإدارة العليا',
  'Senior Educational Consultant': 'مستشار تعليمي أول',
  'Educational Consultant': 'مستشار تعليمي',
  'Admissions Specialist': 'أخصائي قبول',
  'Front Desk Coordinator': 'منسق استقبال',
  'HR Specialist': 'أخصائي موارد بشرية',
  'Finance Officer': 'مسؤول مالي',
  Active: 'نشط',
  'Initial Inquiry': 'استفسار أولي',
  Contacted: 'تم التواصل',
  'University Selection': 'اختيار الجامعة',
  'Documents Collected': 'تم جمع المستندات',
  'Application Sent': 'تم إرسال الطلب',
  Enrolled: 'مسجل',
  Lost: 'مفقود',
  Website: 'الموقع الإلكتروني',
  'Walk-in': 'زيارة مباشرة',
  Phone: 'هاتف',
  'Incoming Call': 'مكالمة واردة',
  WhatsApp: 'واتساب',
  Instagram: 'إنستغرام',
  Facebook: 'فيسبوك',
  Referral: 'إحالة',
  'Google Ads': 'إعلانات جوجل',
  'Front Desk': 'مكتب الاستقبال',
  Email: 'البريد الإلكتروني',
  'Social Media': 'وسائل التواصل',
  Low: 'منخفضة',
  Medium: 'متوسطة',
  High: 'مرتفعة',
  'Preparing Documents': 'تجهيز المستندات',
  'Ready to Submit': 'جاهز للتقديم',
  'Application Submitted': 'تم تقديم الطلب',
  'Under Review': 'قيد المراجعة',
  'Conditional Acceptance': 'قبول مشروط',
  'Final Acceptance': 'قبول نهائي',
  Deferred: 'مؤجل',
  Rejected: 'مرفوض',
  Approved: 'معتمد',
  'Pending Review': 'قيد المراجعة',
  'Needs Resubmission': 'يحتاج إعادة رفع',
  Passport: 'جواز السفر',
  Transcript: 'كشف الدرجات',
  'English Certificate': 'شهادة اللغة الإنجليزية',
  'Statement of Purpose': 'خطاب الغرض من الدراسة',
  'Recommendation Letter': 'خطاب توصية',
  'Acceptance Letter': 'خطاب القبول',
  'Personal Photo': 'صورة شخصية',
  'Motivation Letter': 'رسالة دافع',
  Received: 'تم الاستلام',
  Assigned: 'تم الإسناد',
  'Existing Lead': 'عميل محتمل موجود',
  Present: 'حاضر',
  Remote: 'عن بُعد',
  Leave: 'إجازة',
  Absent: 'غائب',
  Partial: 'جزئي',
  Paid: 'مدفوع',
  Unpaid: 'غير مدفوع',
  open: 'مفتوحة',
  done: 'مكتملة',
  'Bank Transfer': 'تحويل بنكي',
  Card: 'بطاقة',
  Cash: 'نقدًا',
  'Online Gateway': 'بوابة دفع إلكترونية'
};

const textReplacements = [
  ['Moved to', 'تم النقل إلى'],
  ['application moved to', 'تم نقل الطلب إلى'],
  ['moved to', 'تم النقل إلى'],
  ['Created invoice', 'تم إنشاء فاتورة'],
  ['Recorded payment', 'تم تسجيل دفعة'],
  ['Attendance logged for', 'تم تسجيل حضور'],
  ['New lead created for', 'تم إنشاء عميل محتمل جديد لـ'],
  ['Assigned to', 'تم الإسناد إلى'],
  ['at', 'في']
];

export function tr(value) {
  return valueMap[value] || value;
}

export function trText(text) {
  let output = String(text || '');
  Object.entries(valueMap).forEach(([source, target]) => {
    output = output.replaceAll(source, target);
  });
  textReplacements.forEach(([source, target]) => {
    output = output.replaceAll(source, target);
  });
  return output;
}

export function formatArabicTime(value) {
  return new Date(value).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });
}
