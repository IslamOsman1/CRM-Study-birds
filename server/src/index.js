import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import reshaper from 'arabic-persian-reshaper';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GridFSBucket, ObjectId } from 'mongodb';
import { readDb, mutateDb, getMongoDbHandle, isMongoDbEnabled } from './db.js';
import { signToken, requireAuth, allowRoles } from './auth.js';
import { buildMetaOauthUrl, consumeMetaOauthState, createMetaOauthState } from './integrations/meta/metaOAuth.service.js';
import { discoverMetaAssets } from './integrations/meta/metaAssetDiscovery.service.js';
import { decryptSecret, encryptSecret, maskSecret } from './integrations/meta/integrationEncryption.service.js';
import { assertMetaConfigured, getMetaConfig } from './integrations/meta/metaConfig.service.js';
import { exchangeMetaCodeForToken, metaGraphRequest } from './integrations/meta/metaGraphClient.service.js';
import { normalizeInboundMetaMessage, normalizeMessengerInboundEvent, normalizeMetaStatusEvents, normalizePhoneE164 } from './integrations/meta/messageNormalizer.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4000);
const uploadsDir = path.join(__dirname, '..', 'uploads');
const isVercelRuntime = process.env.VERCEL === '1';
const todayKey = () => new Date().toISOString().slice(0, 10);
const useMongoStorage = isMongoDbEnabled();
const cloudinaryCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const useCloudinaryStorage = Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);
const quoteLogoPath = path.join(__dirname, '..', '..', 'client', 'src', 'assets', 'logo.jpeg');
const windowsArabicRegularFontPath = 'C:\\Windows\\Fonts\\arial.ttf';
const windowsArabicBoldFontPath = 'C:\\Windows\\Fonts\\arialbd.ttf';
const chromeExecutableCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const pdfArabicRegularFontPath = path.join(__dirname, '..', 'node_modules', '@fontsource', 'noto-sans-arabic', 'files', 'noto-sans-arabic-arabic-400-normal.woff');
const pdfArabicBoldFontPath = path.join(__dirname, '..', 'node_modules', '@fontsource', 'noto-sans-arabic', 'files', 'noto-sans-arabic-arabic-700-normal.woff');
const execFileAsync = promisify(execFile);

fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));
app.get('/api/files/:fileId', async (req, res, next) => {
  try {
    if (!useMongoStorage) return res.status(404).json({ message: 'File storage is not configured on MongoDB' });
    const bucket = await getMongoUploadsBucket();
    const fileId = new ObjectId(req.params.fileId);
    const [file] = await bucket.find({ _id: fileId }).limit(1).toArray();
    if (!file) return res.status(404).json({ message: 'الملف غير موجود' });
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.length || 0));
    res.setHeader('Content-Disposition', `inline; filename=\"${encodeURIComponent(file.filename || 'file')}\"`);
    bucket.openDownloadStream(fileId)
      .on('error', next)
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const now = () => new Date().toISOString();
const money = value => Number(value || 0);
const defaultCompanyId = 'company-default';
const executiveActionMeta = {
  discount: { label: 'اعتماد الخصومات', decisionMode: 'approve-reject' },
  refund: { label: 'اعتماد استرداد الأموال', decisionMode: 'approve-only' },
  payment_plan: { label: 'تعديل خطة الدفع', decisionMode: 'approve-reject' },
  reassignment: { label: 'نقل ملف طالب', decisionMode: 'approve-reject' },
  document_waiver: { label: 'التجاوز عن مستند ناقص', decisionMode: 'approve-reject' },
  broadcast: { label: 'إرسال تعميم عاجل', decisionMode: 'approve-only' }
};
const consultancyPipelineStages = [
  'Initial Inquiry',
  'Contacted',
  'Consultation Completed',
  'Awaiting Decision',
  'Closed / Won',
  'Lost'
];
const legacyLeadStageMap = {
  'University Selection': 'Consultation Completed',
  'Documents Collected': 'Awaiting Decision',
  'Application Sent': 'Closed / Won',
  Enrolled: 'Closed / Won'
};
const quickBudgetOptions = ['Less than $5,000', '$5,000 - $10,000', 'More than $10,000'];
const currentLevelOptions = ['High School', 'Bachelor', 'Master'];
const receptionLeadSourceOptions = ['Facebook Campaign', 'Instagram Campaign', 'Google Campaign', 'Friend Referral', 'Walk-in Without Appointment'];
const receptionInterestOptions = ['Bachelor', 'Master', 'Foundation Year', 'Language Course'];
const supportedCurrencies = ['EGP', 'USD', 'EUR', 'GBP'];
const supportedPaymentMethods = ['Cash', 'Bank Transfer', 'Card', 'InstaPay', 'Vodafone Cash'];
const hrManagedDepartments = ['Consultancy', 'Admissions', 'Reception', 'Human Resources', 'Finance'];
const demoUsersSeed = [
  { id: 'demo-admin', name: 'System Admin', email: 'admin@eduglobal.local', role: 'admin', department: 'Management' },
  { id: 'demo-management', name: 'Operations Manager', email: 'manager@eduglobal.local', role: 'management', department: 'Consultancy' },
  { id: 'demo-consultant', name: 'Lead Consultant', email: 'consultant@eduglobal.local', role: 'consultant', department: 'Consultancy' },
  { id: 'demo-admissions', name: 'Admissions Officer', email: 'admissions@eduglobal.local', role: 'admissions', department: 'Admissions' },
  { id: 'demo-reception', name: 'Reception Desk', email: 'reception@eduglobal.local', role: 'reception', department: 'Reception' },
  { id: 'demo-hr', name: 'HR Officer', email: 'hr@eduglobal.local', role: 'hr', department: 'Human Resources' },
  { id: 'demo-finance', name: 'Finance Officer', email: 'finance@eduglobal.local', role: 'finance', department: 'Finance' }
];

function sanitizeCurrency(value, fallback = 'USD') {
  return supportedCurrencies.includes(value) ? value : fallback;
}

function sanitizePaymentMethod(value, fallback = 'Bank Transfer') {
  return supportedPaymentMethods.includes(value) ? value : fallback;
}

function defaultRoleForDepartment(department) {
  const normalized = String(department || '').trim();
  if (normalized === 'Consultancy') return 'consultant';
  if (normalized === 'Admissions') return 'admissions';
  if (normalized === 'Reception') return 'reception';
  if (normalized === 'Human Resources') return 'hr';
  if (normalized === 'Finance') return 'finance';
  return 'management';
}

function defaultTitleForDepartment(department) {
  const normalized = String(department || '').trim();
  if (normalized === 'Consultancy') return 'Educational Consultant';
  if (normalized === 'Admissions') return 'Admissions Officer';
  if (normalized === 'Reception') return 'Reception Coordinator';
  if (normalized === 'Human Resources') return 'HR Specialist';
  if (normalized === 'Finance') return 'Finance Officer';
  return 'Team Member';
}

function decimalPart(value) {
  return Math.round((Number(value || 0) - Math.trunc(Number(value || 0))) * 100);
}

function toArabicWordsBelowThousand(value) {
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const num = Math.trunc(Number(value || 0));
  if (!num) return '';
  const parts = [];
  const hundredPart = Math.trunc(num / 100);
  const remainder = num % 100;

  if (hundredPart) parts.push(hundreds[hundredPart]);
  if (remainder >= 20) {
    const unit = remainder % 10;
    const ten = Math.trunc(remainder / 10);
    const tail = [ones[unit], tens[ten]].filter(Boolean).join(' و ');
    if (tail) parts.push(tail);
  } else if (remainder >= 10) {
    parts.push(teens[remainder - 10]);
  } else if (remainder > 0) {
    parts.push(ones[remainder]);
  }

  return parts.join(' و ');
}

function numberToArabicWords(value) {
  const num = Math.round(Number(value || 0));
  if (!num) return 'صفر';
  const scales = [
    { value: 1_000_000, singular: 'مليون', dual: 'مليونان', plural: 'ملايين' },
    { value: 1_000, singular: 'ألف', dual: 'ألفان', plural: 'آلاف' }
  ];
  let remainder = num;
  const parts = [];

  for (const scale of scales) {
    if (remainder < scale.value) continue;
    const count = Math.trunc(remainder / scale.value);
    remainder %= scale.value;
    if (count === 1) parts.push(scale.singular);
    else if (count === 2) parts.push(scale.dual);
    else if (count >= 3 && count <= 10) parts.push(`${toArabicWordsBelowThousand(count)} ${scale.plural}`);
    else parts.push(`${toArabicWordsBelowThousand(count)} ${scale.singular}`);
  }

  if (remainder) parts.push(toArabicWordsBelowThousand(remainder));
  return parts.filter(Boolean).join(' و ');
}

function amountInWords(value, currency = 'USD') {
  const currencyNames = {
    EGP: { major: 'جنيه مصري', minor: 'قرش' },
    USD: { major: 'دولار أمريكي', minor: 'سنت' },
    EUR: { major: 'يورو', minor: 'سنت' },
    GBP: { major: 'جنيه إسترليني', minor: 'بنس' }
  };
  const names = currencyNames[sanitizeCurrency(currency)] || currencyNames.USD;
  const whole = Math.trunc(Number(value || 0));
  const fraction = Math.abs(decimalPart(value));
  const major = `${numberToArabicWords(whole)} ${names.major}`;
  if (!fraction) return `${major} فقط لا غير`;
  return `${major} و ${numberToArabicWords(fraction)} ${names.minor} فقط لا غير`;
}

function nextSerial(prefix, items, dateValue = now()) {
  const year = new Date(dateValue).getFullYear();
  const current = (items || []).filter(item => String(item?.number || item?.receiptNumber || '').startsWith(`${prefix}-${year}-`)).length + 1;
  return `${prefix}-${year}-${String(current).padStart(3, '0')}`;
}

function sanitizeInstallments(items) {
  return (items || [])
    .map((item, index) => {
      const amount = money(item?.amount);
      if (amount <= 0) return null;
      return {
        id: String(item?.id || randomUUID()),
        label: String(item?.label || `Installment ${index + 1}`).trim(),
        dueDate: String(item?.dueDate || '').slice(0, 10),
        amount,
        status: item?.status === 'Paid' ? 'Paid' : 'Pending',
        paidAmount: money(item?.paidAmount),
        createdAt: item?.createdAt || now()
      };
    })
    .filter(Boolean);
}

function normalizeCatalogValue(value) {
  return String(value || '').trim();
}

function sortCatalogOptions(values) {
  return [...new Set((values || []).map(normalizeCatalogValue).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ar'));
}

function buildEducationCatalogLinks(catalog = {}) {
  const universities = Array.isArray(catalog.universities) ? catalog.universities : [];
  const programs = Array.isArray(catalog.programs) ? catalog.programs : [];
  const scholarships = Array.isArray(catalog.scholarships) ? catalog.scholarships : [];

  const countrySet = new Set();
  const universitySet = new Set();
  const programSet = new Set();

  const universitiesByCountry = new Map();
  const universitiesByProgram = new Map();
  const programsByCountry = new Map();
  const programsByUniversity = new Map();
  const countryByUniversity = {};
  const universitiesIndex = {};

  const addMappedValue = (map, key, value) => {
    const normalizedKey = normalizeCatalogValue(key);
    const normalizedValue = normalizeCatalogValue(value);
    if (!normalizedKey || !normalizedValue) return;
    if (!map.has(normalizedKey)) map.set(normalizedKey, new Set());
    map.get(normalizedKey).add(normalizedValue);
  };

  for (const university of universities) {
    const name = normalizeCatalogValue(university?.name);
    const country = normalizeCatalogValue(university?.country);
    if (!name) continue;
    universitySet.add(name);
    if (country) {
      countrySet.add(country);
      countryByUniversity[name] = country;
      addMappedValue(universitiesByCountry, country, name);
    }
    universitiesIndex[name] = {
      id: university?.id ?? name,
      name,
      country,
      city: normalizeCatalogValue(university?.city),
      campuses: Array.isArray(university?.campuses) ? university.campuses : [],
      website: normalizeCatalogValue(university?.website),
      address: normalizeCatalogValue(university?.address),
      programCount: Number(university?.programCount || 0)
    };
  }

  for (const program of programs) {
    const university = normalizeCatalogValue(program?.university);
    const country = normalizeCatalogValue(program?.country) || countryByUniversity[university] || '';
    const department = normalizeCatalogValue(program?.department || program?.program);
    if (country) countrySet.add(country);
    if (university) universitySet.add(university);
    if (department) programSet.add(department);
    if (country && university) addMappedValue(universitiesByCountry, country, university);
    if (country && department) addMappedValue(programsByCountry, country, department);
    if (university && department) {
      addMappedValue(programsByUniversity, university, department);
      addMappedValue(universitiesByProgram, department, university);
    }
    if (university && country && !countryByUniversity[university]) {
      countryByUniversity[university] = country;
    }
  }

  for (const scholarship of scholarships) {
    const university = normalizeCatalogValue(scholarship?.university);
    const country = normalizeCatalogValue(scholarship?.country) || countryByUniversity[university] || '';
    const scope = normalizeCatalogValue(
      scholarship?.department ||
      scholarship?.program ||
      scholarship?.program_scope ||
      scholarship?.name
    );
    if (country) countrySet.add(country);
    if (university) universitySet.add(university);
    if (scope) programSet.add(scope);
    if (country && university) addMappedValue(universitiesByCountry, country, university);
    if (country && scope) addMappedValue(programsByCountry, country, scope);
    if (university && scope) {
      addMappedValue(programsByUniversity, university, scope);
      addMappedValue(universitiesByProgram, scope, university);
    }
  }

  const serializeMap = map =>
    Object.fromEntries(
      [...map.entries()].map(([key, valueSet]) => [key, [...valueSet].sort((left, right) => left.localeCompare(right, 'ar'))])
    );

  return {
    countries: [...countrySet].sort((left, right) => left.localeCompare(right, 'ar')),
    universities: [...universitySet].sort((left, right) => left.localeCompare(right, 'ar')),
    programs: [...programSet].sort((left, right) => left.localeCompare(right, 'ar')),
    universitiesByCountry: serializeMap(universitiesByCountry),
    programsByCountry: serializeMap(programsByCountry),
    programsByUniversity: serializeMap(programsByUniversity),
    universitiesByProgram: serializeMap(universitiesByProgram),
    countryByUniversity,
    universitiesIndex
  };
}

function summarizeInvoiceFinancials(invoice) {
  const serviceFee = money(invoice.serviceFee ?? invoice.commission);
  const universityFee = money(invoice.universityFee ?? invoice.subtotal);
  const visaFee = money(invoice.visaFee);
  const tax = money(invoice.tax);
  const total = money(invoice.total || serviceFee + universityFee + visaFee + tax);
  return {
    serviceFee,
    universityFee,
    visaFee,
    tax,
    passThroughFees: universityFee + visaFee,
    total
  };
}

function safePdfText(value, fallback = '—') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function containsArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

function preparePdfDisplayText(value, fallback = '—') {
  const normalized = safePdfText(value, fallback);
  if (!containsArabic(normalized)) return normalized;
  return reshaper?.ArabicShaper?.convertArabic
    ? reshaper.ArabicShaper.convertArabic(normalized)
    : normalized;
}

function safePdfMoney(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: sanitizeCurrency(currency),
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function loadPdfFontPath(weight = 'regular') {
  const candidatePaths = weight === 'bold'
    ? [windowsArabicBoldFontPath, pdfArabicBoldFontPath, windowsArabicRegularFontPath, pdfArabicRegularFontPath]
    : [windowsArabicRegularFontPath, pdfArabicRegularFontPath, windowsArabicBoldFontPath, pdfArabicBoldFontPath];

  return candidatePaths.find(fontPath => fs.existsSync(fontPath)) || null;
}

function getChromeExecutablePath() {
  return chromeExecutableCandidates.find(candidate => fs.existsSync(candidate)) || '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildUniversityQuoteHtml({ companyName, preparedBy, student, items, logoDataUri }) {
  const rows = items.map(item => {
    const location = [safePdfText(item.country, ''), safePdfText(item.city, '')].filter(Boolean).join(' / ') || '-';
    return `
      <tr>
        <td class="program-cell">
          <div class="program-title">${escapeHtml(item.major || 'Program')}</div>
          <span class="availability-badge">${escapeHtml(item.availability || 'Available')}</span>
        </td>
        <td class="university-cell">
          <div class="university-title">${escapeHtml(item.university)}</div>
          <div class="university-sub">${escapeHtml(location)}</div>
        </td>
        <td class="info-cell">
          <div class="info-line"><strong>Degree:</strong> <span>${escapeHtml(item.degree || '-')}</span></div>
          <div class="info-line"><strong>Language:</strong> <span>${escapeHtml(item.language || '-')}</span></div>
          <div class="info-line"><strong>Deposit Fee:</strong> <span>${escapeHtml(safePdfMoney(item.depositAmount, item.currency))}</span></div>
          <div class="info-line"><strong>Prep School:</strong> <span>${escapeHtml(safePdfMoney(item.prepFee, item.currency))}</span></div>
        </td>
        <td class="fees-cell">
          <div class="discount-card">
            <span class="discount-label">DISCOUNTED</span>
            <strong>${escapeHtml(safePdfMoney(item.tuitionFee, item.currency))}</strong>
          </div>
          <div class="cash-block">
            <span>CASH PAYMENT</span>
            <strong>${escapeHtml(safePdfMoney(item.cashFee, item.currency))}</strong>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const profileRows = [
    ['Student Name', student.studentName],
    ['Phone', student.studentPhone],
    ['Email', student.studentEmail],
    ['Target Country', student.targetCountry],
    ['Prepared By', preparedBy],
    ['Programs Count', String(items.length)]
  ].map(([label, value]) => `
    <div class="profile-item">
      <span class="profile-label">${escapeHtml(label)}</span>
      <strong class="profile-value">${escapeHtml(value || '-')}</strong>
    </div>
  `).join('');

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>University Quote</title>
        <style>
          @page { size: A4; margin: 18mm 14mm 18mm 14mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, "Noto Sans Arabic", sans-serif;
            color: #172033;
            background: linear-gradient(180deg, #26398c 0%, #2e69bf 16%, #ffffff 16%, #ffffff 100%);
          }
          .page {
            background: #fff;
            border-radius: 26px;
            min-height: 100%;
            padding: 26px 26px 34px;
            box-shadow: 0 0 0 1px #dfe7f2 inset;
            position: relative;
            overflow: hidden;
          }
          .page::after {
            content: "";
            position: absolute;
            left: -40px;
            bottom: -34px;
            width: 240px;
            height: 160px;
            background: linear-gradient(135deg, #38b6ff, #2072d6);
            border-top-right-radius: 120px;
            transform: rotate(-10deg);
            opacity: .95;
          }
          .hero {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            direction: ltr;
          }
          .brand-block {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }
          .brand-block img {
            width: 110px;
            height: auto;
            object-fit: contain;
          }
          .hero-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            color: #2450a6;
            letter-spacing: .4px;
            text-transform: uppercase;
          }
          .hero-line {
            width: 100%;
            height: 5px;
            border-radius: 999px;
            background: linear-gradient(90deg, #23368c, #38b6ff);
          }
          .hero-meta {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }
          .meta-chip {
            border: 1px solid #d6e3f8;
            background: #fff;
            color: #3d4b66;
            border-radius: 12px;
            padding: 10px 14px;
            font-size: 13px;
            font-weight: 700;
          }
          .profile-grid {
            margin-top: 22px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }
          .profile-item {
            border: 1px solid #e0e8f4;
            background: #fbfdff;
            border-radius: 14px;
            padding: 12px 14px;
          }
          .profile-label {
            display: block;
            color: #6a7891;
            font-size: 11px;
            margin-bottom: 6px;
          }
          .profile-value {
            display: block;
            font-size: 14px;
            color: #182131;
          }
          .section-title {
            margin: 24px 0 12px;
            font-size: 18px;
            font-weight: 800;
            color: #182131;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border: 1px solid #dbe5f2;
            border-radius: 16px;
            overflow: hidden;
          }
          thead th {
            background: #edf4ff;
            color: #2450a6;
            font-size: 12px;
            font-weight: 800;
            padding: 14px 10px;
            border-left: 1px solid #d9e6f5;
            text-transform: uppercase;
          }
          tbody td {
            padding: 16px 14px;
            border-top: 1px solid #e4ebf5;
            border-left: 1px solid #eef3fa;
            vertical-align: top;
          }
          tbody tr:nth-child(even) td { background: #fbfdff; }
          .program-title, .university-title {
            font-size: 16px;
            font-weight: 800;
            line-height: 1.45;
            word-break: break-word;
          }
          .program-cell, .university-cell, .info-cell {
            direction: rtl;
            text-align: right;
          }
          .university-sub {
            margin-top: 8px;
            color: #2f6fde;
            font-size: 13px;
            font-weight: 700;
          }
          .availability-badge {
            display: inline-flex;
            margin-top: 14px;
            border-radius: 999px;
            border: 1px solid #b8e7cf;
            background: #ecfdf3;
            color: #10a46f;
            font-size: 11px;
            font-weight: 800;
            padding: 6px 12px;
          }
          .info-line {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 13px;
            margin-bottom: 9px;
            direction: ltr;
          }
          .info-line strong { color: #31425d; }
          .info-line span {
            color: #182131;
            font-weight: 700;
            text-align: right;
            direction: rtl;
            flex: 1;
          }
          .fees-cell {
            direction: ltr;
            text-align: left;
          }
          .discount-card {
            border: 1px solid #c9defa;
            background: #edf4ff;
            border-radius: 12px;
            padding: 12px 14px;
          }
          .discount-label {
            display: block;
            color: #356fe8;
            font-size: 10px;
            font-weight: 800;
            margin-bottom: 8px;
          }
          .discount-card strong {
            display: block;
            color: #356fe8;
            font-size: 28px;
            line-height: 1;
          }
          .cash-block {
            margin-top: 14px;
          }
          .cash-block span {
            display: block;
            color: #6a7891;
            font-size: 10px;
            font-weight: 800;
            margin-bottom: 6px;
          }
          .cash-block strong {
            display: block;
            color: #10a46f;
            font-size: 24px;
            line-height: 1;
          }
          .note-box {
            margin-top: 20px;
            border: 1px solid #b7e4d7;
            background: #ecfdf5;
            border-radius: 16px;
            padding: 16px 18px;
          }
          .note-box strong {
            display: block;
            color: #0f766e;
            margin-bottom: 6px;
            font-size: 16px;
          }
          .note-box p {
            margin: 0;
            color: #14532d;
            line-height: 1.7;
            font-size: 12px;
          }
          .footer-mark {
            margin-top: 20px;
            color: #ffffff;
            font-weight: 800;
            font-size: 20px;
            position: relative;
            z-index: 1;
            direction: ltr;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div class="brand-block">
              ${logoDataUri ? `<img src="${logoDataUri}" alt="logo" />` : ''}
            </div>
            <div class="hero-right">
              <div class="title">Turkey Programs</div>
              <div class="hero-line"></div>
              <div class="hero-meta">
                <div class="meta-chip">Date: 22/08/2026</div>
                <div class="meta-chip">Total: ${escapeHtml(String(items.length))} Programs</div>
              </div>
            </div>
          </div>

          <div class="profile-grid">${profileRows}</div>
          <div class="section-title">Selected University Options</div>

          <table>
            <thead>
              <tr>
                <th style="width:25%">Program</th>
                <th style="width:27%">University</th>
                <th style="width:26%">Information</th>
                <th style="width:22%">Fees</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="note-box">
            <strong>Consultant Note</strong>
            <p>This quotation is generated from ${escapeHtml(companyName || 'EduGlobal CRM')} on Saturday, August 22, 2026 and should be confirmed against the latest university availability before final submission.</p>
          </div>

          <div class="footer-mark">turkey / istanbul</div>
        </div>
      </body>
    </html>
  `;
}

async function generateUniversityQuotePdfChrome({ companyName, preparedBy, student, items }) {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    throw Object.assign(new Error('Chrome or Edge is required on the server to generate the PDF correctly.'), { status: 500 });
  }

  const tempDir = path.join(os.tmpdir(), `eduglobal-quote-${randomUUID()}`);
  const htmlPath = path.join(tempDir, 'quote.html');
  const pdfPath = path.join(tempDir, 'quote.pdf');

  fs.mkdirSync(tempDir, { recursive: true });

  const logoDataUri = fs.existsSync(quoteLogoPath)
    ? `data:image/jpeg;base64,${fs.readFileSync(quoteLogoPath).toString('base64')}`
    : '';

  const html = buildUniversityQuoteHtml({ companyName, preparedBy, student, items, logoDataUri });
  fs.writeFileSync(htmlPath, html, 'utf8');

  try {
    await execFileAsync(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      htmlPath
    ], { windowsHide: true });

    return fs.readFileSync(pdfPath);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

function generateUniversityQuotePdf({ companyName, preparedBy, student, items }) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  const chunks = [];
  const regularFont = loadPdfFontPath('regular');
  const boldFont = loadPdfFontPath('bold') || regularFont;
  const lineColor = '#d8deea';
  const textColor = '#182131';
  const mutedColor = '#627086';
  const accentColor = '#0f766e';
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const drawCell = (text, x, y, width, options = {}) => {
    const preparedText = preparePdfDisplayText(text);
    const isArabicText = containsArabic(text);
    doc
      .font(options.bold ? (boldFont || 'Helvetica-Bold') : (regularFont || 'Helvetica'))
      .fontSize(options.fontSize || 9)
      .fillColor(options.color || textColor)
      .text(preparedText, x + 6, y + 8, {
        width: width - 12,
        align: options.align || (isArabicText ? 'right' : 'left'),
        ellipsis: true,
        lineBreak: false
      });
  };
  const drawPageFrame = () => {
    doc
      .save()
      .lineWidth(1)
      .strokeColor('#e6ebf4')
      .roundedRect(26, 26, doc.page.width - 52, doc.page.height - 52, 18)
      .stroke()
      .restore();
  };
  const ensureSpace = requiredHeight => {
    if (doc.y + requiredHeight <= doc.page.height - doc.page.margins.bottom) return;
    doc.addPage();
    drawPageFrame();
  };
  const drawKeyValueLine = (label, value, x, y, labelWidth, valueWidth) => {
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor(mutedColor)
      .fontSize(8)
      .text(label, x, y, { width: labelWidth, align: 'left' });
    doc
      .font(regularFont || 'Helvetica')
      .fillColor(textColor)
      .fontSize(9)
      .text(preparePdfDisplayText(value), x + labelWidth + 8, y, {
        width: valueWidth,
        align: containsArabic(value) ? 'right' : 'left'
      });
  };

  doc.on('data', chunk => chunks.push(chunk));

  if (regularFont) doc.font(regularFont);
  drawPageFrame();

  if (fs.existsSync(quoteLogoPath)) {
    doc.image(quoteLogoPath, doc.page.margins.left, 38, { fit: [88, 88], align: 'left' });
  }

  doc
    .font(boldFont || 'Helvetica-Bold')
    .fillColor(textColor)
    .fontSize(20)
    .text('University Offer Quote', 0, 44, { align: 'right' });
  doc
    .font(regularFont || 'Helvetica')
    .fillColor(mutedColor)
    .fontSize(10)
    .text(companyName || 'EduGlobal CRM', 0, 68, { align: 'right' })
    .text('Prepared on Saturday, August 22, 2026', 0, 84, { align: 'right' })
    .text(`Prepared by ${safePdfText(preparedBy, 'CRM Team')}`, 0, 100, { align: 'right' });

  doc.moveTo(doc.page.margins.left, 132).lineTo(doc.page.width - doc.page.margins.right, 132).strokeColor(lineColor).stroke();

  doc.y = 150;
  doc
    .font(boldFont || 'Helvetica-Bold')
    .fillColor(textColor)
    .fontSize(12)
    .text('Student Profile', doc.page.margins.left, doc.y);
  doc.y += 10;

  const profileRows = [
    ['Student Name', safePdfText(student.studentName)],
    ['Phone', safePdfText(student.studentPhone)],
    ['Email', safePdfText(student.studentEmail)],
    ['Target Country', safePdfText(student.targetCountry)],
    ['Selected Programs', String(items.length)],
    ['Notes', safePdfText(student.notes)]
  ];

  for (const [label, value] of profileRows) {
    ensureSpace(26);
    doc.roundedRect(doc.page.margins.left, doc.y, 128, 22, 8).fillAndStroke('#f4f7fb', '#edf1f7');
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#344054')
      .fontSize(9)
      .text(preparePdfDisplayText(label), doc.page.margins.left + 8, doc.y + 7, { width: 112 });
    doc
      .font(regularFont || 'Helvetica')
      .fillColor(textColor)
      .fontSize(9)
      .text(preparePdfDisplayText(value), doc.page.margins.left + 140, doc.y + 7, { width: pageWidth - 140 });
    doc.y += 28;
  }

  doc.y += 10;
  ensureSpace(42);
  doc
    .font(boldFont || 'Helvetica-Bold')
    .fillColor(textColor)
    .fontSize(12)
    .text('Selected University Options', doc.page.margins.left, doc.y);
  doc.y += 14;

  const tableX = doc.page.margins.left;
  const columnWidths = [150, 170, 170, pageWidth - 150 - 170 - 170];
  const headerHeight = 30;
  const rowHeight = 96;
  const tableHeaders = ['PROGRAM', 'UNIVERSITY', 'INFORMATION', 'FEES'];

  let headerCursorX = tableX;
  tableHeaders.forEach((label, index) => {
    doc.rect(headerCursorX, doc.y, columnWidths[index], headerHeight).fillAndStroke('#edf4ff', '#d9e6f5');
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#2450a6')
      .fontSize(8.5)
      .text(label, headerCursorX + 8, doc.y + 10, { width: columnWidths[index] - 16, align: 'center' });
    headerCursorX += columnWidths[index];
  });
  doc.y += headerHeight;

  items.forEach((item, index) => {
    ensureSpace(rowHeight + 2);

    const rowY = doc.y;
    const rowFill = index % 2 === 0 ? '#ffffff' : '#fbfdff';
    let cellX = tableX;
    columnWidths.forEach(width => {
      doc.rect(cellX, rowY, width, rowHeight).fillAndStroke(rowFill, '#e2eaf5');
      cellX += width;
    });

    const programX = tableX;
    const universityX = tableX + columnWidths[0];
    const infoX = universityX + columnWidths[1];
    const feesX = infoX + columnWidths[2];

    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor(textColor)
      .fontSize(9)
      .text(preparePdfDisplayText(item.major || 'Program'), programX + 10, rowY + 18, {
        width: columnWidths[0] - 20,
        align: containsArabic(item.major) ? 'right' : 'left'
      });
    doc
      .roundedRect(programX + 10, rowY + 54, 60, 18, 8)
      .fillAndStroke('#ecfdf3', '#b8e7cf');
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#10a46f')
      .fontSize(7)
      .text((item.availability || 'Available').toUpperCase(), programX + 14, rowY + 60, {
        width: 52,
        align: 'center'
      });

    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor(textColor)
      .fontSize(9)
      .text(preparePdfDisplayText(item.university), universityX + 10, rowY + 18, {
        width: columnWidths[1] - 20,
        align: containsArabic(item.university) ? 'right' : 'left'
      });
    doc
      .font(regularFont || 'Helvetica')
      .fillColor('#2f6fde')
      .fontSize(8)
      .text(preparePdfDisplayText([safePdfText(item.country, ''), safePdfText(item.city, '')].filter(Boolean).join(' / ') || '-'), universityX + 10, rowY + 40, {
        width: columnWidths[1] - 20,
        align: containsArabic(item.country) || containsArabic(item.city) ? 'right' : 'left'
      });

    const infoLines = [
      ['Degree', item.degree],
      ['Language', item.language],
      ['Deposit Fee', safePdfMoney(item.depositAmount, item.currency)],
      ['Prep School', safePdfMoney(item.prepFee, item.currency)]
    ];
    infoLines.forEach(([label, value], infoIndex) => {
      drawKeyValueLine(label, value, infoX + 10, rowY + 12 + (infoIndex * 18), 62, columnWidths[2] - 84);
    });

    doc
      .roundedRect(feesX + 10, rowY + 14, columnWidths[3] - 20, 38, 8)
      .fillAndStroke('#edf4ff', '#c9defa');
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#356fe8')
      .fontSize(7.5)
      .text('DISCOUNTED', feesX + 18, rowY + 22, { width: columnWidths[3] - 36, align: 'left' });
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#356fe8')
      .fontSize(13)
      .text(safePdfMoney(item.tuitionFee, item.currency), feesX + 18, rowY + 32, { width: columnWidths[3] - 36, align: 'left' });
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor(mutedColor)
      .fontSize(7)
      .text('CASH PAYMENT', feesX + 18, rowY + 60, { width: columnWidths[3] - 36, align: 'left' });
    doc
      .font(boldFont || 'Helvetica-Bold')
      .fillColor('#10a46f')
      .fontSize(11)
      .text(safePdfMoney(item.cashFee, item.currency), feesX + 18, rowY + 70, { width: columnWidths[3] - 36, align: 'left' });

    doc.y += rowHeight;
  });

  ensureSpace(80);
  doc.y += 8;
  doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 52, 12).fillAndStroke('#ecfdf5', '#b7e4d7');
  doc
    .font(boldFont || 'Helvetica-Bold')
    .fillColor(accentColor)
    .fontSize(11)
    .text('Consultant Note', doc.page.margins.left + 14, doc.y + 12);
  doc
    .font(regularFont || 'Helvetica')
    .fillColor('#14532d')
    .fontSize(9)
    .text(
      'This quotation is generated from the CRM catalog on Saturday, August 22, 2026 and should be confirmed against the latest university availability before final submission.',
      doc.page.margins.left + 14,
      doc.y + 28,
      { width: pageWidth - 28 }
    );

  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc
      .font(regularFont || 'Helvetica')
      .fillColor('#8a94a6')
      .fontSize(8)
      .text(`Page ${pageIndex + 1} of ${pageRange.count}`, 0, doc.page.height - 32, { align: 'center' });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function enrichInvoice(db, invoice) {
  const students = getScopedItems(db.students, invoice.companyId);
  const employees = getScopedItems(db.employees, invoice.companyId);
  const applications = getScopedItems(db.applications, invoice.companyId);
  const payments = getScopedItems(db.payments, invoice.companyId).filter(payment => payment.invoiceId === invoice.id);
  const student = students.find(item => item.id === invoice.studentId) || null;
  const application = applications.find(item => item.studentId === invoice.studentId) || null;
  const consultant = student?.consultantId ? employees.find(item => item.id === student.consultantId) || null : null;
  const financials = summarizeInvoiceFinancials(invoice);
  const paid = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
  const balance = Math.max(0, financials.total - paid);
  const installments = sanitizeInstallments(invoice.installments).map(installment => {
    const matchingPayments = payments.filter(payment => payment.installmentId === installment.id);
    const paidAmount = matchingPayments.reduce((sum, payment) => sum + money(payment.amount), 0);
    return {
      ...installment,
      paidAmount,
      balance: Math.max(0, money(installment.amount) - paidAmount),
      status: paidAmount >= money(installment.amount) ? 'Paid' : 'Pending'
    };
  });

  return {
    ...invoice,
    ...financials,
    student,
    consultant,
    application,
    payments,
    installments,
    paid,
    balance,
    computedStatus: paid >= financials.total ? 'Paid' : paid > 0 ? 'Partial' : invoice.status || 'Unpaid'
  };
}

function safeUploadName(originalName) {
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${String(originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function logMetaWebhook(level, message, details = undefined) {
  const payload = details ? ` ${JSON.stringify(details)}` : '';
  const line = `[meta-webhook] ${message}${payload}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

function safeCloudinaryFolder(folderName = '') {
  const normalized = String(folderName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9/_-]/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  return normalized || 'general';
}

function cloudinarySignature(payload) {
  const serialized = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return createHash('sha1').update(`${serialized}${cloudinaryApiSecret}`).digest('hex');
}

async function getMongoUploadsBucket() {
  const db = await getMongoDbHandle();
  return new GridFSBucket(db, { bucketName: 'uploads' });
}

async function storeUploadedFile(file, options = {}) {
  const fileName = safeUploadName(file.originalname);

  if (useCloudinaryStorage) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `study-birds-crm/${safeCloudinaryFolder(options.folder)}`;
    const publicId = `${folder}/${fileName}`;
    const resourceType = String(file.mimetype || '').startsWith('image/') ? 'image' : 'raw';
    const signature = cloudinarySignature({
      folder,
      public_id: publicId,
      resource_type: resourceType,
      timestamp
    });
    const body = new FormData();
    body.append('file', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname);
    body.append('api_key', cloudinaryApiKey);
    body.append('timestamp', String(timestamp));
    body.append('folder', folder);
    body.append('public_id', publicId);
    body.append('signature', signature);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${resourceType}/upload`, {
      method: 'POST',
      body
    });

    if (!uploadResponse.ok) {
      throw Object.assign(new Error('فشل رفع الملف إلى Cloudinary'), { status: 500 });
    }

    const payload = await uploadResponse.json();
    return {
      fileName: payload.public_id,
      publicId: payload.public_id,
      url: payload.secure_url || payload.url,
      size: file.size,
      storageProvider: 'cloudinary',
      resourceType: payload.resource_type || resourceType
    };
  }

  if (useMongoStorage) {
    const bucket = await getMongoUploadsBucket();
    const uploadStream = bucket.openUploadStream(fileName, {
      contentType: file.mimetype || 'application/octet-stream',
      metadata: {
        originalName: file.originalname,
        size: file.size
      }
    });

    await new Promise((resolve, reject) => {
      uploadStream.on('error', reject);
      uploadStream.on('finish', resolve);
      uploadStream.end(file.buffer);
    });

    return {
      fileId: String(uploadStream.id),
      fileName,
      originalName: file.originalname,
      url: `/api/files/${uploadStream.id}`,
      size: file.size,
      storageProvider: 'mongo'
    };
  }

  const localPath = path.join(uploadsDir, fileName);
  fs.writeFileSync(localPath, file.buffer);
  return {
    fileName,
    url: `/uploads/${fileName}`,
    size: file.size,
    storageProvider: 'local'
  };
}

async function removeUploadedFile(document) {
  if (!document?.fileName && !document?.fileId) return;

  if (document.storageProvider === 'mongo' && document.fileId) {
    try {
      const bucket = await getMongoUploadsBucket();
      await bucket.delete(new ObjectId(document.fileId));
    } catch {
      return;
    }
    return;
  }

  if (document.storageProvider === 'cloudinary' || (useCloudinaryStorage && document.publicId)) {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = document.publicId || document.fileName;
    const resourceType = document.resourceType || 'raw';
    const signature = cloudinarySignature({ public_id: publicId, timestamp });
    const body = new URLSearchParams();
    body.set('api_key', cloudinaryApiKey);
    body.set('timestamp', String(timestamp));
    body.set('public_id', publicId);
    body.set('signature', signature);

    await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${resourceType}/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).catch(() => null);
    return;
  }

  const filePath = path.join(uploadsDir, document.fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function companyNameFromSettings(db) {
  return String(db.settings?.companyName || 'EduGlobal CRM').trim() || 'EduGlobal CRM';
}

function ensureCompanyOwnership(items, companyId) {
  for (const item of items || []) {
    if (item && !item.companyId) item.companyId = companyId;
  }
}

function getScopedItems(items, companyId) {
  return (items || []).filter(item => item.companyId === companyId);
}

function uniqueBy(items, key) {
  const seen = new Set();
  return (items || []).filter(item => {
    const value = item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function hashPayload(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function initMetaCollections(db) {
  db.oauthStates ||= [];
  db.metaPendingSessions ||= [];
  db.metaIntegrations ||= [];
  db.connectedChannels ||= [];
  db.conversations ||= [];
  db.messages ||= [];
  db.webhookEvents ||= [];
  db.whatsAppTemplates ||= [];
  db.integrationAuditLogs ||= [];
  db.contactChannelIdentities ||= [];
}

function logIntegrationAudit(db, reqUser, action, channelType, entityId, metadata = {}) {
  db.integrationAuditLogs.unshift({
    id: randomUUID(),
    companyId: reqUser.companyId,
    userId: reqUser.sub,
    action,
    channelType,
    entityId,
    metadata,
    createdAt: now()
  });
  db.integrationAuditLogs = db.integrationAuditLogs.slice(0, 1000);
}

function findScoped(items, companyId, predicate) {
  return (items || []).find(item => item.companyId === companyId && predicate(item));
}

function indexScoped(items, companyId, predicate) {
  return (items || []).findIndex(item => item.companyId === companyId && predicate(item));
}

function normalizeMatcher(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeDocumentTypes(items) {
  return (items || [])
    .map(item => ({ name: String(item?.name || '').trim(), required: Boolean(item?.required) }))
    .filter(item => item.name);
}

function sanitizeOptionList(items) {
  return [...new Set((items || []).map(item => String(item || '').trim()).filter(Boolean))];
}

function sanitizeChecklistTemplates(items) {
  return (items || [])
    .map(item => ({
      id: String(item?.id || randomUUID()),
      name: String(item?.name || '').trim(),
      university: String(item?.university || '').trim(),
      program: String(item?.program || '').trim(),
      country: String(item?.country || '').trim(),
      documentTypes: sanitizeDocumentTypes(item?.documentTypes || [])
    }))
    .filter(item => item.name && item.documentTypes.length);
}

function sanitizeWorkflowStages(items) {
  return (items || [])
    .map(item => ({
      id: String(item?.id || randomUUID()),
      title: String(item?.title || '').trim(),
      description: String(item?.description || '').trim(),
      assignedRole: String(item?.assignedRole || 'admissions').trim(),
      priority: ['Low', 'Medium', 'High'].includes(item?.priority) ? item.priority : 'Medium',
      dueOffsetDays: Number.isFinite(Number(item?.dueOffsetDays)) ? Number(item.dueOffsetDays) : 0
    }))
    .filter(item => item.title);
}

function sanitizeWorkflowTemplates(items) {
  return (items || [])
    .map(item => ({
      id: String(item?.id || randomUUID()),
      name: String(item?.name || '').trim(),
      university: String(item?.university || '').trim(),
      program: String(item?.program || '').trim(),
      country: String(item?.country || '').trim(),
      stages: sanitizeWorkflowStages(item?.stages || [])
    }))
    .filter(item => item.name && item.stages.length);
}

function normalizeConversationTags(items) {
  const values = Array.isArray(items)
    ? items
    : String(items || '')
        .split(',')
        .map(item => item.trim());

  return [...new Set(values.filter(Boolean).slice(0, 8))];
}

function resolveChecklistTemplate(application, settings) {
  const templates = sanitizeChecklistTemplates(settings?.documentChecklistTemplates || []);
  if (!templates.length) return null;

  const appUniversity = normalizeMatcher(application?.university);
  const appProgram = normalizeMatcher(application?.program);
  const appCountry = normalizeMatcher(application?.country);

  const scoredTemplates = templates
    .map(template => {
      const university = normalizeMatcher(template.university);
      const program = normalizeMatcher(template.program);
      const country = normalizeMatcher(template.country);

      if (university && university !== appUniversity) return null;
      if (program && program !== appProgram) return null;
      if (country && country !== appCountry) return null;

      const score = [template.university, template.program, template.country].filter(Boolean).length;
      return { template, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return scoredTemplates[0]?.template || null;
}

function resolveWorkflowTemplate(application, settings) {
  const templates = sanitizeWorkflowTemplates(settings?.applicationWorkflowTemplates || []);
  if (!templates.length) return null;

  const appUniversity = normalizeMatcher(application?.university);
  const appProgram = normalizeMatcher(application?.program);
  const appCountry = normalizeMatcher(application?.country);

  const scoredTemplates = templates
    .map(template => {
      const university = normalizeMatcher(template.university);
      const program = normalizeMatcher(template.program);
      const country = normalizeMatcher(template.country);

      if (university && university !== appUniversity) return null;
      if (program && program !== appProgram) return null;
      if (country && country !== appCountry) return null;

      const score = [template.university, template.program, template.country].filter(Boolean).length;
      return { template, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return scoredTemplates[0]?.template || null;
}

function addDays(dateString, days) {
  const base = new Date(dateString || now());
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function addHours(dateString, hours) {
  return new Date(new Date(dateString || now()).getTime() + Number(hours || 0) * 60 * 60 * 1000).toISOString();
}

function hoursUntil(dateString) {
  return Math.round((new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60));
}

function hasPastDeadline(dateString) {
  if (!dateString) return false;
  return new Date(dateString).getTime() < Date.now();
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function sameDay(dateA, dateB = now()) {
  return String(dateA || '').slice(0, 10) === String(dateB || '').slice(0, 10);
}

function findUserByEmployee(db, employeeId, companyId) {
  const employee = findScoped(db.employees, companyId, item => item.id === employeeId);
  if (!employee) return null;
  return findScoped(db.users, companyId, item => item.email?.toLowerCase() === employee.email?.toLowerCase()) || null;
}

function syncEmployeeRecordForUser(db, user) {
  if (!user || user.role === 'admin') return null;

  let employee = findScoped(
    db.employees,
    user.companyId,
    item => item.linkedUserId === user.id || item.email?.toLowerCase() === user.email?.toLowerCase()
  );

  if (!employee) {
    employee = {
      id: randomUUID(),
      companyId: user.companyId,
      linkedUserId: user.id,
      name: user.name,
      email: user.email,
      phone: '',
      department: user.department || 'Consultancy',
      title: defaultTitleForDepartment(user.department),
      status: user.isActive === false ? 'Terminated' : 'Active',
      joinDate: todayKey(),
      attendanceRate: 100,
      performance: 75,
      branch: 'Cairo HQ',
      avatar: '',
      createdAt: now()
    };
    db.employees.unshift(employee);
  }

  employee.linkedUserId = user.id;
  employee.name = user.name;
  employee.email = user.email;
  employee.department = user.department || employee.department || 'Consultancy';
  employee.status = user.isActive === false ? 'Terminated' : employee.status === 'Terminated' && user.isActive !== false ? 'Active' : employee.status || 'Active';
  employee.title ||= defaultTitleForDepartment(employee.department);
  employee.joinDate ||= todayKey();
  employee.attendanceRate ??= 100;
  employee.performance ??= 75;
  employee.branch ||= 'Cairo HQ';
  employee.avatar ||= '';
  employee.documents ||= [];
  employee.annualLeaveBalance ??= 21;
  employee.monthlyTarget ??= employee.department === 'Consultancy' ? 8 : 0;
  employee.commissionPerContract ??= employee.department === 'Consultancy' ? 500 : 0;
  employee.basicSalary ??= employee.department === 'Consultancy' ? 18000 : employee.department === 'Admissions' ? 15000 : 12000;
  employee.currentBonus ??= 0;
  employee.currentDeductions ??= 0;
  employee.currentAdvances ??= 0;
  employee.dailySalaryDeduction ??= Math.round(Number(employee.basicSalary || 0) / 30);
  if (employee.department === 'Consultancy' && !employee.liveStatus) employee.liveStatus = 'available';

  return employee;
}

function createUserNotification(db, companyId, userId, title, message, metadata = {}) {
  db.userNotifications ||= [];
  db.userNotifications.unshift({
    id: randomUUID(),
    companyId,
    userId,
    title,
    message,
    metadata,
    readAt: '',
    createdAt: now()
  });
  db.userNotifications = db.userNotifications.slice(0, 500);
}

function defaultResponseScripts() {
  return [
    {
      id: 'script-dentistry-faqs',
      category: 'الأسنان',
      title: 'Dentistry FAQs',
      body: 'أهلًا بحضرتك، تخصص طب الأسنان متاح بعدة جامعات مع خيارات لغة ودفع مختلفة. أرسل لي الدولة والميزانية لنجهز أفضل الخيارات.'
    },
    {
      id: 'script-visa-requirements',
      category: 'الفيزا',
      title: 'Visa Requirements',
      body: 'لتجهيز ملف الفيزا نحتاج جواز السفر، خطاب القبول، إثبات السكن، والتأمين الصحي حسب الدولة.'
    },
    {
      id: 'script-government-private',
      category: 'مقارنات',
      title: 'Government vs Private',
      body: 'الجامعات الحكومية مناسبة لو الأولوية للسعر، والجامعات الخاصة تعطي مرونة أكبر في المقاعد واللغات.'
    },
    {
      id: 'script-installments',
      category: 'المدفوعات',
      title: 'Installments Script',
      body: 'لدينا خيارات دفع كاش وتقسيط حسب الجامعة، ويمكنني تجهيز عرض سعر يوضح الفرق بين كل طريقة.'
    }
  ];
}

function defaultReminders(companyId, userId) {
  return [
    { id: randomUUID(), companyId, userId, type: 'tasks', text: 'مراجعة العملاء المتأخرين في المتابعة قبل نهاية اليوم.', archived: false, createdAt: now() },
    { id: randomUUID(), companyId, userId, type: 'admissions', text: 'تسليم خطاب القبول النهائي للطالب أحمد مصطفى.', archived: false, createdAt: now() },
    { id: randomUUID(), companyId, userId, type: 'personal', text: 'متابعة إذن الخروج مع الموارد البشرية.', archived: false, createdAt: now() }
  ];
}

function computeConsultantLiveStatus(db, companyId, consultantId) {
  const employee = findScoped(db.employees, companyId, item => item.id === consultantId);
  if (!employee) return { code: 'available', label: 'Available' };
  const explicit = String(employee.liveStatus || '').trim();
  if (explicit) return { code: explicit, label: explicit === 'busy' ? 'Busy' : explicit === 'break' ? 'On Break' : 'Available' };
  const todayAttendance = getScopedItems(db.attendance, companyId).find(item => item.employeeId === consultantId && sameDay(item.date));
  if (todayAttendance?.status === 'Leave') return { code: 'break', label: 'On Break' };
  return { code: 'available', label: 'Available' };
}

function buildReceptionConsultantSnapshot(db, companyId) {
  const consultants = getScopedItems(db.employees, companyId).filter(employee => employee.department === 'Consultancy');
  const logs = getScopedItems(db.receptionLogs, companyId);
  return consultants.map(consultant => {
    const status = computeConsultantLiveStatus(db, companyId, consultant.id);
    const todayTransfers = logs.filter(log => log.consultantId === consultant.id && sameDay(log.createdAt)).length;
    return {
      id: consultant.id,
      name: consultant.name,
      title: consultant.title,
      branch: consultant.branch || '',
      status: status.code,
      statusLabel: status.label,
      todayTransfers
    };
  });
}

function pickNextReceptionConsultant(db, companyId, branch = '') {
  const consultants = buildReceptionConsultantSnapshot(db, companyId)
    .filter(item => item.status === 'available')
    .filter(item => !branch || item.branch === branch);
  if (!consultants.length) return null;
  db.receptionState ||= {};
  db.receptionState.roundRobinIndex ||= 0;
  const pick = consultants[db.receptionState.roundRobinIndex % consultants.length];
  db.receptionState.roundRobinIndex = (db.receptionState.roundRobinIndex + 1) % consultants.length;
  return pick;
}

function buildReceptionStudentLookup(db, companyId, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return null;
  const students = getScopedItems(db.students, companyId);
  const applications = getScopedItems(db.applications, companyId);
  const settings = db.settings || {};
  const student = students.find(item =>
    [item.name, item.phone, item.email].some(value => String(value || '').toLowerCase().includes(normalizedQuery))
  );
  if (!student) return null;
  const studentApplications = applications
    .filter(item => item.studentId === student.id)
    .map(item => buildApplicationState(item, settings));
  const latestApplication = studentApplications[0] || null;
  return {
    id: student.id,
    name: student.name,
    phone: student.phone,
    email: student.email,
    acceptanceStatus: latestApplication
      ? latestApplication.status === 'Final Acceptance'
        ? 'Acceptance Letter Ready'
        : latestApplication.status === 'Application Submitted' || latestApplication.status === 'Under Review'
          ? 'Following Up With University'
          : latestApplication.status
      : 'No Active Application',
    checklistStatus: latestApplication
      ? latestApplication.docsSummary?.missingTypes?.length
        ? `Missing: ${latestApplication.docsSummary.missingTypes.join(', ')}`
        : 'Ready For Consultant'
      : 'No Documents Yet',
    documents: latestApplication?.effectiveDocumentTypes?.map(item => ({
      type: item.name,
      status: latestApplication.docsSummary?.missingTypes?.includes(item.name) ? 'missing' : 'uploaded'
    })) || []
  };
}

function computeApplicationWorkflowState(application, settings) {
  const workflowTemplate = resolveWorkflowTemplate(application, settings);
  const effectiveFollowUpStages = workflowTemplate?.stages || [];
  const progressLookup = new Map(
    (application.followUpProgress || []).map(item => [item.stageId, item])
  );
  const stageStates = effectiveFollowUpStages.map(stage => {
    const progress = progressLookup.get(stage.id);
    return {
      ...stage,
      done: Boolean(progress?.done),
      completedAt: progress?.completedAt || '',
      completedBy: progress?.completedBy || '',
      note: progress?.note || ''
    };
  });
  const completedStages = stageStates.filter(stage => stage.done).length;
  const followUpProgress = effectiveFollowUpStages.length
    ? Math.round((completedStages / effectiveFollowUpStages.length) * 100)
    : 0;

  return {
    workflowTemplate: workflowTemplate
      ? {
          id: workflowTemplate.id,
          name: workflowTemplate.name,
          university: workflowTemplate.university,
          program: workflowTemplate.program,
          country: workflowTemplate.country
        }
      : null,
    effectiveFollowUpStages: stageStates,
    followUpSummary: {
      total: stageStates.length,
      completed: completedStages,
      pending: stageStates.length - completedStages
    },
    followUpProgress
  };
}

function computeApplicationDocumentState(application, settings) {
  const resolvedTemplate = resolveChecklistTemplate(application, settings);
  const effectiveDocumentTypes = resolvedTemplate?.documentTypes?.length
    ? resolvedTemplate.documentTypes
    : sanitizeDocumentTypes(settings?.documentTypes || []);
  const requiredTypes = effectiveDocumentTypes.filter(item => item.required).map(item => item.name);
  const currentDocuments = (application.documents || []).filter(item => item.current !== false);
  const approvedLikeStatuses = new Set(['Received', 'Pending Review', 'Approved']);
  const rejectedLikeStatuses = new Set(['Rejected', 'Needs Resubmission']);
  const uploadedTypes = new Set(currentDocuments.map(item => item.type));
  const completedTypes = new Set(
    currentDocuments
      .filter(item => approvedLikeStatuses.has(item.status))
      .map(item => item.type)
  );
  const missingTypes = requiredTypes.filter(type => !completedTypes.has(type));
  const rejectedTypes = [...new Set(
    currentDocuments
      .filter(item => rejectedLikeStatuses.has(item.status))
      .map(item => item.type)
  )];
  const approvedCount = currentDocuments.filter(item => item.status === 'Approved').length;
  const rejectedCount = currentDocuments.filter(item => rejectedLikeStatuses.has(item.status)).length;
  const progressBase = requiredTypes.length || 1;
  const documentProgress = Math.min(100, Math.round((completedTypes.size / progressBase) * 100));

  return {
    documentProgress,
    currentDocuments,
    checklistTemplate: resolvedTemplate
      ? {
          id: resolvedTemplate.id,
          name: resolvedTemplate.name,
          university: resolvedTemplate.university,
          program: resolvedTemplate.program,
          country: resolvedTemplate.country
        }
      : null,
    effectiveDocumentTypes,
    docsSummary: {
      requiredCount: requiredTypes.length,
      uploadedCount: uploadedTypes.size,
      approvedCount,
      rejectedCount,
      missingTypes,
      rejectedTypes
    }
  };
}

function buildApplicationState(application, settings) {
  const documentState = computeApplicationDocumentState(application, settings);
  const workflowState = computeApplicationWorkflowState(application, settings);
  return {
    ...application,
    portalPasswordMasked: application.portalPassword ? '••••••••' : '',
    ...documentState,
    ...workflowState
  };
}

function computeApplicationFeeStatus(db, companyId, studentId) {
  const invoices = getScopedItems(db.invoices, companyId).filter(invoice => invoice.studentId === studentId);
  if (!invoices.length) return 'Unpaid';
  const hasPayment = getScopedItems(db.payments, companyId).some(payment => invoices.some(invoice => invoice.id === payment.invoiceId) && money(payment.amount) > 0);
  return hasPayment ? 'Paid' : 'Unpaid';
}

function notifyConsultantAboutOffer(db, companyId, application, source = 'offer_update') {
  const student = findScoped(db.students, companyId, item => item.id === application.studentId);
  if (!student?.consultantId) return;
  const consultantUser = findUserByEmployee(db, student.consultantId, companyId);
  if (!consultantUser) return;
  createUserNotification(
    db,
    companyId,
    consultantUser.id,
    'تحديث جديد على خطاب القبول',
    `${student.name} - ${application.university || 'جامعة غير محددة'} - ${application.offerType === 'Conditional Offer' ? 'قبول مشروط' : application.offerType === 'Unconditional Offer' ? 'قبول نهائي' : 'تم تحديث حالة القبول'}.`,
    { type: source, applicationId: application.id, studentId: student.id }
  );
}

function workingDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 5 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function monthKey(value = now()) {
  return String(value).slice(0, 7);
}

function buildHrTargets(db, companyId) {
  const employees = getScopedItems(db.employees, companyId);
  const leads = getScopedItems(db.leads, companyId);
  const invoices = getScopedItems(db.invoices, companyId);
  const payments = getScopedItems(db.payments, companyId);
  const currentMonth = monthKey();

  return employees
    .filter(employee => employee.department === 'Consultancy')
    .map(employee => {
      const closedDeals = leads.filter(lead => lead.consultantId === employee.id && lead.stage === 'Closed / Won' && monthKey(lead.updatedAt || lead.createdAt) === currentMonth).length;
      const target = Number(employee.monthlyTarget || 0);
      const targetProgress = target ? Math.min(100, Math.round((closedDeals / target) * 100)) : 0;
      const employeeStudentIds = getScopedItems(db.students, companyId).filter(student => student.consultantId === employee.id).map(student => student.id);
      const employeeInvoices = invoices.filter(invoice => employeeStudentIds.includes(invoice.studentId));
      const collected = payments
        .filter(payment => employeeInvoices.some(invoice => invoice.id === payment.invoiceId))
        .reduce((sum, payment) => sum + money(payment.amount), 0);
      const commissionDue = closedDeals * Number(employee.commissionPerContract || 0);
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        title: employee.title,
        monthlyTarget: target,
        closedDeals,
        targetProgress,
        commissionPerContract: Number(employee.commissionPerContract || 0),
        commissionDue,
        collected
      };
    });
}

function buildPayrollRows(db, companyId) {
  const employees = getScopedItems(db.employees, companyId);
  const leaveRequests = getScopedItems(db.leaveRequests || [], companyId);
  const targetRows = buildHrTargets(db, companyId);
  const month = monthKey();

  return employees.map(employee => {
    const targetRow = targetRows.find(item => item.employeeId === employee.id);
    const bonus = Number(employee.currentBonus || 0);
    const deductions = Number(employee.currentDeductions || 0);
    const advances = Number(employee.currentAdvances || 0);
    const approvedLeavesThisMonth = leaveRequests.filter(item => item.employeeId === employee.id && item.status === 'Approved' && monthKey(item.startDate) === month);
    const unpaidDays = approvedLeavesThisMonth.filter(item => item.leaveType === 'Unpaid Leave').reduce((sum, item) => sum + Number(item.days || 0), 0);
    const absenceDeduction = Number(employee.dailySalaryDeduction || 0) * unpaidDays;
    const netSalary = Number(employee.basicSalary || 0) + Number(targetRow?.commissionDue || 0) + bonus - deductions - advances - absenceDeduction;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      department: employee.department,
      basicSalary: Number(employee.basicSalary || 0),
      commissions: Number(targetRow?.commissionDue || 0),
      bonuses: bonus,
      deductions,
      advances,
      unpaidLeaveDays: unpaidDays,
      absenceDeduction,
      netSalary,
      month
    };
  });
}

function buildHrTasks(db, companyId) {
  const leaveRequests = getScopedItems(db.leaveRequests || [], companyId);
  const payrollRows = buildPayrollRows(db, companyId);
  const month = monthKey();

  const leaveAlerts = leaveRequests
    .filter(item => item.status === 'Pending')
    .map(item => ({
      id: `hr-leave-${item.id}`,
      title: `مراجعة طلب إجازة ${item.employeeName}`,
      description: `${item.leaveType} · من ${item.startDate} إلى ${item.endDate}`,
      dueDate: item.startDate,
      priority: 'High',
      status: 'open',
      kind: 'alert',
      source: 'leave',
      assignedRole: 'hr',
      companyId
    }));

  const payrollAlerts = payrollRows
    .filter(item => item.netSalary > 0)
    .map(item => ({
      id: `hr-payroll-${item.employeeId}-${month}`,
      title: `مراجعة راتب ${item.employeeName}`,
      description: `صافي الشهر ${item.month} · ${Math.round(item.netSalary)}`,
      dueDate: `${month}-28`,
      priority: 'Medium',
      status: 'open',
      kind: 'alert',
      source: 'payroll',
      assignedRole: 'hr',
      companyId
    }));

  return [...leaveAlerts, ...payrollAlerts];
}

function getMetaIntegrationForCompany(db, companyId) {
  return db.metaIntegrations.find(item => item.companyId === companyId && item.provider === 'meta') || null;
}

function listConnectedChannels(db, companyId) {
  return getScopedItems(db.connectedChannels, companyId).map(channel => ({
    ...channel,
    encryptedChannelToken: channel.encryptedChannelToken ? '[secured]' : '',
    hasChannelToken: Boolean(channel.encryptedChannelToken)
  }));
}

function sanitizeDiscoveredAssets(session) {
  return {
    id: session.id,
    user: session.user,
    expiresAt: session.expiresAt,
    channels: (session.discoveredAssets || []).map(asset => ({
      id: asset.id,
      channelType: asset.channelType,
      pageId: asset.pageId || '',
      pageName: asset.pageName || '',
      instagramAccountId: asset.instagramAccountId || '',
      instagramUsername: asset.instagramUsername || '',
      whatsappBusinessAccountId: asset.whatsappBusinessAccountId || '',
      phoneNumberId: asset.phoneNumberId || '',
      displayPhoneNumber: asset.displayPhoneNumber || '',
      verifiedName: asset.verifiedName || '',
      externalBusinessId: asset.externalBusinessId || '',
      status: asset.status || 'pending',
      permissions: asset.permissions || [],
      profilePictureUrl: asset.profilePictureUrl || ''
    }))
  };
}

function createMetaPendingSession(db, user, tokenData, assetPayload) {
  const session = {
    id: randomUUID(),
    companyId: user.companyId,
    userId: user.sub,
    accessToken: tokenData.access_token,
    tokenType: tokenData.token_type || 'bearer',
    expiresIn: Number(tokenData.expires_in || 0),
    grantedScopes: tokenData.granular_scopes || tokenData.scope || [],
    user: assetPayload.user || null,
    discoveredAssets: [
      ...(assetPayload.pages || []).map(item => ({ ...item, id: randomUUID(), pageAccessToken: item.pageAccessToken || '' })),
      ...(assetPayload.instagramAccounts || []).map(item => ({ ...item, id: randomUUID(), pageAccessToken: item.pageAccessToken || '' })),
      ...(assetPayload.whatsappAccounts || []).map(item => ({ ...item, id: randomUUID() }))
    ],
    expiresAt: Date.now() + 10 * 60 * 1000,
    createdAt: now()
  };

  db.metaPendingSessions.unshift(session);
  db.metaPendingSessions = db.metaPendingSessions.slice(0, 20);
  return session;
}

function resolveMetaSession(db, companyId, userId, sessionId) {
  const session = db.metaPendingSessions.find(item =>
    item.id === sessionId &&
    item.companyId === companyId &&
    item.userId === userId &&
    item.expiresAt > Date.now()
  );

  if (!session) {
    throw Object.assign(new Error('جلسة ربط Meta غير صالحة أو منتهية'), { status: 404 });
  }

  return session;
}

function upsertMetaIntegration(db, reqUser, session, selectedAssets) {
  let integration = getMetaIntegrationForCompany(db, reqUser.companyId);
  const expiresAt = session.expiresIn ? new Date(Date.now() + session.expiresIn * 1000).toISOString() : '';
  if (!integration) {
    integration = {
      id: randomUUID(),
      companyId: reqUser.companyId,
      provider: 'meta',
      status: 'connected',
      metaBusinessId: selectedAssets.find(item => item.externalBusinessId)?.externalBusinessId || '',
      connectedByUserId: reqUser.sub,
      encryptedAccessToken: encryptSecret(session.accessToken),
      tokenType: session.tokenType || 'bearer',
      tokenExpiresAt: expiresAt,
      grantedScopes: Array.isArray(session.grantedScopes) ? session.grantedScopes : [],
      lastTokenValidationAt: now(),
      lastSyncAt: now(),
      lastError: '',
      createdAt: now(),
      updatedAt: now()
    };
    db.metaIntegrations.unshift(integration);
  } else {
    integration.status = 'connected';
    integration.connectedByUserId = reqUser.sub;
    integration.metaBusinessId = selectedAssets.find(item => item.externalBusinessId)?.externalBusinessId || integration.metaBusinessId;
    integration.encryptedAccessToken = encryptSecret(session.accessToken);
    integration.tokenType = session.tokenType || integration.tokenType;
    integration.tokenExpiresAt = expiresAt;
    integration.grantedScopes = Array.isArray(session.grantedScopes) ? session.grantedScopes : integration.grantedScopes;
    integration.lastTokenValidationAt = now();
    integration.lastSyncAt = now();
    integration.lastError = '';
    integration.updatedAt = now();
  }

  return integration;
}

function sanitizeIntegration(integration) {
  if (!integration) return null;
  return {
    ...integration,
    encryptedAccessToken: '',
    maskedAccessToken: integration.encryptedAccessToken ? maskSecret('meta-provider-token') : '',
    hasAccessToken: Boolean(integration.encryptedAccessToken)
  };
}

function resolveChannelByAsset(db, companyId, lookup) {
  return getScopedItems(db.connectedChannels, companyId).find(channel => (
    (lookup.phoneNumberId && channel.phoneNumberId === lookup.phoneNumberId) ||
    (lookup.pageId && channel.pageId === lookup.pageId && channel.channelType === lookup.channelType) ||
    (lookup.instagramAccountId && channel.instagramAccountId === lookup.instagramAccountId)
  )) || null;
}

function getOrCreateConversation(db, companyId, payload) {
  const existing = db.conversations.find(item =>
    item.companyId === companyId &&
    item.channelId === payload.channelId &&
    item.externalUserId === payload.externalUserId
  );

  if (existing) return existing;

  const conversation = {
    id: randomUUID(),
    companyId,
    channelId: payload.channelId,
    channelType: payload.channelType,
    externalConversationId: payload.externalConversationId || payload.externalUserId,
    contactId: payload.contactId || '',
    contactType: payload.contactType || '',
    externalUserId: payload.externalUserId,
    externalUserName: payload.externalUserName || '',
    assignedUserId: '',
    status: 'open',
    priority: payload.priority || 'medium',
    tags: normalizeConversationTags(payload.tags || []),
    unreadCount: 0,
    lastMessageAt: payload.timestamp || now(),
    messagingWindowExpiresAt: payload.messagingWindowExpiresAt || '',
    metadata: payload.metadata || {},
    createdAt: now(),
    updatedAt: now()
  };

  db.conversations.unshift(conversation);
  return conversation;
}

function resolveContactForInbound(db, companyId, normalizedMessage) {
  db.contactChannelIdentities ||= [];
  const identity = db.contactChannelIdentities.find(item =>
    item.companyId === companyId &&
    item.channelType === normalizedMessage.channelType &&
    item.channelId === normalizedMessage.channelId &&
    item.externalUserId === normalizedMessage.externalSenderId
  );

  if (identity) {
    return {
      contactId: identity.contactId,
      contactType: identity.contactType,
      displayName: identity.displayName || normalizedMessage.externalSenderName || ''
    };
  }

  if (normalizedMessage.channelType === 'whatsapp') {
    const normalizedPhone = normalizePhoneE164(normalizedMessage.externalSenderId);
    const student = getScopedItems(db.students, companyId).find(item => normalizePhoneE164(item.phone) === normalizedPhone);
    if (student) {
      db.contactChannelIdentities.unshift({
        id: randomUUID(),
        companyId,
        channelType: normalizedMessage.channelType,
        channelId: normalizedMessage.channelId,
        externalUserId: normalizedMessage.externalSenderId,
        contactId: student.id,
        contactType: 'student',
        displayName: student.name,
        createdAt: now()
      });
      return { contactId: student.id, contactType: 'student', displayName: student.name };
    }

    const lead = getScopedItems(db.leads, companyId).find(item => normalizePhoneE164(item.phone) === normalizedPhone);
    if (lead) {
      db.contactChannelIdentities.unshift({
        id: randomUUID(),
        companyId,
        channelType: normalizedMessage.channelType,
        channelId: normalizedMessage.channelId,
        externalUserId: normalizedMessage.externalSenderId,
        contactId: lead.id,
        contactType: 'lead',
        displayName: lead.name,
        createdAt: now()
      });
      return { contactId: lead.id, contactType: 'lead', displayName: lead.name };
    }
  }

  const lead = {
    id: randomUUID(),
    companyId,
    name: normalizedMessage.externalSenderName || normalizedMessage.externalSenderId || 'عميل جديد',
    phone: normalizedMessage.channelType === 'whatsapp' ? normalizePhoneE164(normalizedMessage.externalSenderId) : '',
    email: '',
    country: '',
    program: '',
    targetCountry: '',
    targetMajor: '',
    budget: '',
    currentLevel: '',
    university: '',
    source: normalizedMessage.channelType === 'facebook' ? 'Facebook' : normalizedMessage.channelType === 'instagram' ? 'Instagram' : 'WhatsApp',
    stage: 'Initial Inquiry',
    consultantId: '',
    priority: 'Medium',
    nextFollowUp: '',
    lostReason: '',
    notes: 'تم إنشاؤه تلقائيًا من تكامل Meta.',
    createdAt: now(),
    updatedAt: now()
  };
  db.leads.unshift(lead);
  db.contactChannelIdentities.unshift({
    id: randomUUID(),
    companyId,
    channelType: normalizedMessage.channelType,
    channelId: normalizedMessage.channelId,
    externalUserId: normalizedMessage.externalSenderId,
    contactId: lead.id,
    contactType: 'lead',
    displayName: lead.name,
    createdAt: now()
  });
  return { contactId: lead.id, contactType: 'lead', displayName: lead.name };
}

function storeInboundMessage(db, companyId, channel, normalizedMessage) {
  const duplicate = db.messages.find(item => item.companyId === companyId && item.externalMessageId === normalizedMessage.externalMessageId);
  if (duplicate) {
    logMetaWebhook('info', 'duplicate inbound message ignored', {
      companyId,
      channelType: channel.channelType,
      channelId: channel.id,
      externalMessageId: normalizedMessage.externalMessageId
    });
    return duplicate;
  }

  const contact = resolveContactForInbound(db, companyId, normalizedMessage);
  const conversation = getOrCreateConversation(db, companyId, {
    channelId: channel.id,
    channelType: channel.channelType,
    externalConversationId: normalizedMessage.externalConversationId,
    externalUserId: normalizedMessage.externalSenderId,
    externalUserName: contact.displayName,
    contactId: contact.contactId,
    contactType: contact.contactType,
    timestamp: normalizedMessage.timestamp,
    metadata: {
      pageId: channel.pageId || '',
      instagramAccountId: channel.instagramAccountId || '',
      phoneNumberId: channel.phoneNumberId || ''
    }
  });

  const message = {
    id: randomUUID(),
    companyId,
    conversationId: conversation.id,
    channelId: channel.id,
    externalMessageId: normalizedMessage.externalMessageId,
    direction: 'inbound',
    senderType: 'customer',
    senderUserId: '',
    messageType: normalizedMessage.messageType,
    text: normalizedMessage.text || '',
    attachments: normalizedMessage.attachments || [],
    replyToMessageId: '',
    status: 'delivered',
    providerStatus: normalizedMessage.status || 'received',
    errorCode: '',
    errorMessage: '',
    rawPayload: normalizedMessage.rawEventReference || {},
    sentAt: normalizedMessage.timestamp || now(),
    deliveredAt: normalizedMessage.timestamp || now(),
    readAt: '',
    createdAt: now()
  };

  db.messages.unshift(message);
  conversation.unreadCount = Number(conversation.unreadCount || 0) + 1;
  conversation.lastMessageAt = message.createdAt;
  conversation.updatedAt = now();
  if (channel.channelType === 'whatsapp') {
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    conversation.messagingWindowExpiresAt = expiry;
  }
  logMetaWebhook('info', 'inbound message stored', {
    companyId,
    channelType: channel.channelType,
    channelId: channel.id,
    conversationId: conversation.id,
    messageId: message.id,
    externalMessageId: normalizedMessage.externalMessageId,
    messageType: normalizedMessage.messageType
  });
  return message;
}

function getContactSummary(db, companyId, contactId, contactType) {
  if (!contactId || !contactType) return null;
  if (contactType === 'student') {
    const student = getScopedItems(db.students, companyId).find(item => item.id === contactId);
    if (!student) return null;
    return {
      id: student.id,
      type: 'student',
      name: student.name,
      phone: student.phone || '',
      email: student.email || '',
      nationality: student.nationality || ''
    };
  }

  const lead = getScopedItems(db.leads, companyId).find(item => item.id === contactId);
  if (!lead) return null;
  return {
    id: lead.id,
    type: 'lead',
    name: lead.name,
    phone: lead.phone || '',
    email: lead.email || '',
    country: lead.country || '',
    source: lead.source || ''
  };
}

function updateMessageStatus(db, companyId, normalizedStatus) {
  const message = db.messages.find(item =>
    item.companyId === companyId &&
    item.channelId === normalizedStatus.channelId &&
    item.externalMessageId === normalizedStatus.externalMessageId
  );
  if (!message) return null;

  message.providerStatus = normalizedStatus.status;
  if (normalizedStatus.status === 'delivered') {
    message.status = 'delivered';
    message.deliveredAt = normalizedStatus.timestamp || now();
  } else if (normalizedStatus.status === 'read') {
    message.status = 'read';
    message.readAt = normalizedStatus.timestamp || now();
  } else if (normalizedStatus.status === 'failed') {
    message.status = 'failed';
    message.errorCode = normalizedStatus.errorCode || '';
    message.errorMessage = normalizedStatus.errorMessage || '';
  } else if (normalizedStatus.status === 'sent') {
    message.status = 'sent';
  }

  return message;
}

async function sendOutboundMetaMessage({ integration, channel, conversation, payload }) {
  const accessToken = integration.encryptedAccessToken ? decryptSecret(integration.encryptedAccessToken) : '';

  if (channel.channelType === 'whatsapp') {
    const body = payload.templateName
      ? {
          messaging_product: 'whatsapp',
          to: conversation.externalUserId,
          type: 'template',
          template: {
            name: payload.templateName,
            language: { code: payload.templateLanguage || 'en' },
            components: payload.templateComponents || []
          }
        }
      : {
          messaging_product: 'whatsapp',
          to: conversation.externalUserId,
          type: 'text',
          text: { body: payload.text || '' }
        };

    return metaGraphRequest(`/${channel.phoneNumberId}/messages`, {
      method: 'POST',
      accessToken,
      body
    });
  }

  const pageToken = channel.encryptedChannelToken ? decryptSecret(channel.encryptedChannelToken) : accessToken;
  const endpointId = channel.pageId;
  return metaGraphRequest(`/${endpointId}/messages`, {
    method: 'POST',
    accessToken: pageToken,
    body: {
      recipient: { id: conversation.externalUserId },
      messaging_type: 'RESPONSE',
      message: { text: payload.text || '' }
    }
  });
}

const activity = (db, actor, action, entityType, entityId, details = '') => {
  db.activities.unshift({
    id: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.sub,
    actorName: actor.name,
    action,
    entityType,
    entityId,
    details,
    createdAt: now()
  });
  db.activities = db.activities.slice(0, 500);
};

function initials(name) {
  return String(name || '')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ensureExecutiveSeedData(db, companyId) {
  db.executiveActions ||= [];
  db.broadcasts ||= [];

  const companyActions = getScopedItems(db.executiveActions, companyId);
  if (!companyActions.length) {
    db.executiveActions.push(
      {
        id: randomUUID(),
        companyId,
        type: 'discount',
        status: 'pending',
        title: 'خصم استثنائي 12% على رسوم التقديم',
        summary: 'طلب مقدم من فريق المبيعات للحفاظ على العميل قبل تحويله لمنافس.',
        subjectName: 'Ahmed Mostafa',
        requestedBy: 'Lina Ahmed',
        requestedAt: '2026-07-22T08:15:00Z',
        meta: { amount: 420, currency: 'USD' }
      },
      {
        id: randomUUID(),
        companyId,
        type: 'refund',
        status: 'pending',
        title: 'استرداد رسوم حجز الملف',
        summary: 'إلغاء التعاقد بعد تأخر الموافقة النهائية من الجامعة.',
        subjectName: 'Youssef Emad',
        requestedBy: 'Youssef Adel',
        requestedAt: '2026-07-22T08:45:00Z',
        meta: { amount: 1000, currency: 'USD' }
      },
      {
        id: randomUUID(),
        companyId,
        type: 'payment_plan',
        status: 'pending',
        title: 'تقسيط غير معتاد على 4 دفعات',
        summary: 'طلب تقسيط مخصص لحين وصول التحويل البنكي من ولي الأمر.',
        subjectName: 'Hassan Nabil',
        requestedBy: 'Youssef Adel',
        requestedAt: '2026-07-22T09:10:00Z',
        meta: { installments: 4 }
      },
      {
        id: randomUUID(),
        companyId,
        type: 'reassignment',
        status: 'pending',
        title: 'إعادة توزيع الملف على مستشار آخر',
        summary: 'نقل الملف لتقليل التأخير بعد ضغط جدول المتابعة الحالي.',
        subjectName: 'Salma Hany',
        requestedBy: 'Maya Roberts',
        requestedAt: '2026-07-22T09:30:00Z',
        meta: { from: 'Ziad Mahmoud', to: 'Lina Ahmed' }
      },
      {
        id: randomUUID(),
        companyId,
        type: 'document_waiver',
        status: 'pending',
        title: 'تقديم الملف رغم تأخر شهادة اللغة',
        summary: 'الجامعة تسمح مؤقتاً باستلام المستند بعد فتح الملف إذا تمت الموافقة الإدارية.',
        subjectName: 'Hassan Nabil',
        requestedBy: 'Omar Khaled',
        requestedAt: '2026-07-22T10:00:00Z',
        meta: { missingDocument: 'English Certificate' }
      }
    );
  }

  const appReady = findScoped(db.applications, companyId, item => item.status === 'Ready to Submit');
  if (appReady && !appReady.submissionDeadline) appReady.submissionDeadline = '2026-07-23T17:00:00Z';

  const submittedApp = findScoped(db.applications, companyId, item => item.status === 'Application Submitted');
  if (submittedApp) {
    if (!submittedApp.submittedAt) submittedApp.submittedAt = '2026-07-14T10:00:00Z';
    if (!Number.isFinite(Number(submittedApp.responseSlaDays))) submittedApp.responseSlaDays = 5;
  }

  const visaCase = findScoped(db.applications, companyId, item => item.id === 'app-2');
  if (visaCase && !visaCase.visaStatus) {
    visaCase.visaStatus = 'Delayed';
    visaCase.visaUpdatedAt = '2026-07-22T07:50:00Z';
  }

  const complaintLead = findScoped(db.leads, companyId, item => item.id === 'lead-5');
  if (complaintLead && !complaintLead.clientAlertFlag) {
    complaintLead.clientAlertFlag = 'dissatisfied';
    complaintLead.clientAlertAt = '2026-07-22T09:55:00Z';
  }
}

function getExecutiveActions(db, companyId) {
  return getScopedItems(db.executiveActions || [], companyId)
    .map(action => ({
      ...action,
      label: executiveActionMeta[action.type]?.label || action.type,
      decisionMode: executiveActionMeta[action.type]?.decisionMode || 'approve-reject'
    }))
    .sort((left, right) => String(right.requestedAt || '').localeCompare(String(left.requestedAt || '')));
}

function buildEmergencyAlerts(db, companyId) {
  const leads = getScopedItems(db.leads, companyId);
  const students = getScopedItems(db.students, companyId);
  const applications = getScopedItems(db.applications, companyId);
  const invoices = getScopedItems(db.invoices, companyId);
  const studentLookup = new Map(students.map(student => [student.id, student]));

  const deadlineAlerts = applications
    .filter(application => application.submissionDeadline)
    .filter(application => !['Application Submitted', 'Under Review', 'Conditional Acceptance', 'Final Acceptance', 'Rejected', 'Deferred'].includes(application.status))
    .map(application => {
      const remainingHours = hoursUntil(application.submissionDeadline);
      if (remainingHours < 0 || remainingHours > 48) return null;
      const student = studentLookup.get(application.studentId);
      return {
        id: `deadline-${application.id}`,
        type: 'deadline',
        severity: remainingHours <= 24 ? 'critical' : 'warning',
        title: 'اقتراب الموعد النهائي للتقديم',
        description: `${student?.name || 'طالب غير محدد'} - ${application.university || 'جامعة غير محددة'} خلال ${remainingHours} ساعة`,
        meta: `آخر موعد ${String(application.submissionDeadline).slice(0, 10)}`,
        createdAt: application.submissionDeadline
      };
    })
    .filter(Boolean);

  const visaAlerts = applications
    .filter(application => ['Delayed', 'Rejected'].includes(application.visaStatus))
    .map(application => {
      const student = studentLookup.get(application.studentId);
      return {
        id: `visa-${application.id}`,
        type: 'visa',
        severity: application.visaStatus === 'Rejected' ? 'critical' : 'warning',
        title: application.visaStatus === 'Rejected' ? 'رفض فيزا يحتاج تصعيداً' : 'تأخير فيزا يحتاج متابعة',
        description: `${student?.name || 'طالب غير محدد'} - ${application.university || 'جامعة غير محددة'}`,
        meta: application.visaUpdatedAt ? String(application.visaUpdatedAt).slice(0, 10) : 'تم تسجيل الحالة اليوم',
        createdAt: application.visaUpdatedAt || now()
      };
    });

  const uncontactedLeadAlerts = leads
    .filter(lead => lead.stage === 'Initial Inquiry')
    .filter(lead => !lead.contactedAt)
    .filter(lead => hasPastDeadline(addHours(lead.createdAt, 24)))
    .map(lead => ({
      id: `uncontacted-${lead.id}`,
      type: 'uncontacted',
      severity: lead.priority === 'High' ? 'critical' : 'warning',
      title: 'عملاء جدد بلا تواصل خلال 24 ساعة',
      description: `${lead.name} - ${lead.country || 'وجهة غير محددة'} - ${lead.source || 'مصدر مباشر'}`,
      meta: `منذ ${Math.max(24, Math.abs(hoursUntil(lead.createdAt)))} ساعة`,
      createdAt: lead.createdAt
    }));

  const universityDelayAlerts = applications
    .filter(application => ['Application Submitted', 'Under Review'].includes(application.status))
    .filter(application => Number.isFinite(Number(application.responseSlaDays)) && application.submittedAt && !application.universityResponseReceivedAt)
    .map(application => {
      const deadline = addDays(application.submittedAt, application.responseSlaDays);
      if (!hasPastDeadline(deadline)) return null;
      const student = studentLookup.get(application.studentId);
      return {
        id: `university-delay-${application.id}`,
        type: 'university_delay',
        severity: 'warning',
        title: 'تأخر رد الجامعة عن المدة المحددة',
        description: `${student?.name || 'طالب غير محدد'} - ${application.university || 'جامعة غير محددة'}`,
        meta: `تجاوز SLA (${application.responseSlaDays} أيام)`,
        createdAt: deadline
      };
    })
    .filter(Boolean);

  const overduePaymentAlerts = invoices
    .filter(invoice => invoice.status !== 'Paid')
    .filter(invoice => invoice.dueDate && invoice.dueDate < todayKey())
    .map(invoice => {
      const student = studentLookup.get(invoice.studentId);
      return {
        id: `payment-${invoice.id}`,
        type: 'overdue_payment',
        severity: 'critical',
        title: 'دفعة مستحقة متأخرة',
        description: `${student?.name || 'طالب غير محدد'} - ${invoice.number}`,
        meta: `استحقاق ${invoice.dueDate}`,
        createdAt: `${invoice.dueDate}T00:00:00Z`
      };
    });

  const complaintAlerts = leads
    .filter(lead => ['dissatisfied', 'cancel_request'].includes(lead.clientAlertFlag))
    .map(lead => ({
      id: `complaint-${lead.id}`,
      type: 'complaint',
      severity: lead.clientAlertFlag === 'cancel_request' ? 'critical' : 'warning',
      title: lead.clientAlertFlag === 'cancel_request' ? 'طلب إلغاء من العميل' : 'عميل غير راضٍ يحتاج تدخل المدير',
      description: `${lead.name} - ${lead.university || lead.country || 'ملف يحتاج مراجعة'}`,
      meta: lead.notes || 'تم وضع علامة تنبيه داخل الملف',
      createdAt: lead.clientAlertAt || lead.updatedAt || now()
    }));

  return [...deadlineAlerts, ...visaAlerts, ...uncontactedLeadAlerts, ...universityDelayAlerts, ...overduePaymentAlerts, ...complaintAlerts]
    .sort((left, right) => {
      const severityScore = { critical: 0, warning: 1 };
      if (severityScore[left.severity] !== severityScore[right.severity]) {
        return severityScore[left.severity] - severityScore[right.severity];
      }
      return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    });
}

function buildAutomaticTasks(db, companyId) {
  const leads = getScopedItems(db.leads, companyId);
  const applications = getScopedItems(db.applications, companyId);
  const invoices = getScopedItems(db.invoices, companyId);
  const students = getScopedItems(db.students, companyId);
  const currentDay = todayKey();

  const leadTasks = leads
    .filter(lead => lead.nextFollowUp && lead.nextFollowUp <= currentDay)
    .filter(lead => !['Enrolled', 'Lost'].includes(lead.stage))
    .map(lead => ({
      id: `auto-lead-${lead.id}`,
      title: `متابعة ${lead.name}`,
      description: `${lead.program || 'برنامج غير محدد'} · ${lead.country || 'وجهة غير محددة'}`,
      dueDate: lead.nextFollowUp,
      priority: lead.nextFollowUp < currentDay ? 'High' : 'Medium',
      status: 'open',
      kind: 'alert',
      source: 'lead'
    }));

  const documentTasks = applications
    .filter(item => Number(item.documentProgress || 0) < 100)
    .map(item => {
      const student = students.find(student => student.id === item.studentId);
      return {
        id: `auto-app-${item.id}`,
        title: `استكمال مستندات ${student?.name || 'الطالب'}`,
        description: `${item.university} · ${item.documentProgress}%`,
        dueDate: item.updatedAt?.slice(0, 10) || currentDay,
        priority: Number(item.documentProgress || 0) < 50 ? 'High' : 'Medium',
        status: 'open',
        kind: 'alert',
        source: 'application'
      };
    });

  const workflowTasks = applications.flatMap(item => {
    const student = students.find(student => student.id === item.studentId);
    const workflowState = computeApplicationWorkflowState(item, db.settings);
    return (workflowState.effectiveFollowUpStages || [])
      .filter(stage => !stage.done)
      .map(stage => ({
        id: `auto-workflow-${item.id}-${stage.id}`,
        title: `${stage.title} - ${student?.name || 'الطالب'}`,
        description: `${item.university || 'جامعة غير محددة'} · ${stage.description || 'متابعة تشغيلية مطلوبة'}`,
        dueDate: addDays(item.updatedAt, stage.dueOffsetDays),
        priority: stage.priority || 'Medium',
        status: 'open',
        kind: 'alert',
        source: 'application-workflow',
        assignedRole: stage.assignedRole || 'admissions'
      }));
  });

  const invoiceTasks = invoices
    .filter(invoice => invoice.status !== 'Paid')
    .filter(invoice => invoice.dueDate && invoice.dueDate <= currentDay)
    .map(invoice => {
      const student = students.find(item => item.id === invoice.studentId);
      return {
        id: `auto-invoice-${invoice.id}`,
        title: `تحصيل ${invoice.number}`,
        description: `${student?.name || 'طالب غير معروف'} · ${invoice.dueDate}`,
        dueDate: invoice.dueDate,
        priority: invoice.dueDate < currentDay ? 'High' : 'Medium',
        status: 'open',
        kind: 'alert',
        source: 'invoice',
        companyId
      };
    });

  const installmentTasks = invoices.flatMap(invoice => {
    const student = students.find(item => item.id === invoice.studentId);
    return sanitizeInstallments(invoice.installments)
      .filter(installment => installment.dueDate && installment.dueDate <= currentDay)
      .filter(installment => money(installment.paidAmount) < money(installment.amount))
      .map(installment => ({
        id: `auto-installment-${invoice.id}-${installment.id}`,
        title: `تحصيل ${installment.label}`,
        description: `${student?.name || 'طالب غير معروف'} · ${invoice.number}`,
        dueDate: installment.dueDate,
        priority: installment.dueDate < currentDay ? 'High' : 'Medium',
        status: 'open',
        kind: 'alert',
        source: 'installment',
        companyId
      }));
  });

  return [...leadTasks, ...documentTasks, ...workflowTasks, ...invoiceTasks, ...installmentTasks].map(task => ({ ...task, companyId }));
}

async function prepareDb() {
  await mutateDb(async db => {
    initMetaCollections(db);
    db.users ||= [];
    db.employees ||= [];
    db.leads ||= [];
    db.students ||= [];
    db.applications ||= [];
    db.receptionLogs ||= [];
    db.attendance ||= [];
    db.invoices ||= [];
    db.payments ||= [];
    db.activities ||= [];
    db.monthlyRevenue ||= [];
    db.executiveActions ||= [];
    db.broadcasts ||= [];
    db.callSchedules ||= [];
    db.dailyReports ||= [];
    db.reminders ||= [];
    db.responseScripts ||= [];
    db.userNotifications ||= [];
    db.leaveRequests ||= [];
    db.receptionState ||= {};
    db.settings ||= {
      companyName: 'EduGlobal CRM',
      workspace: 'Global Hub',
      currency: 'USD',
      pipelineStages: [],
      applicationStatuses: [],
      availableUniversities: [],
      availablePrograms: [],
      availableScholarships: [],
      availableCountries: [],
      documentTypes: [],
      documentChecklistTemplates: [],
      applicationWorkflowTemplates: []
    };
    db.companies ||= [{
      id: defaultCompanyId,
      name: companyNameFromSettings(db),
      slug: 'default-company',
      status: 'active',
      createdAt: now()
    }];

    const fallbackCompanyId = db.companies[0]?.id || defaultCompanyId;
    ensureCompanyOwnership(db.users, fallbackCompanyId);
    ensureCompanyOwnership(db.employees, fallbackCompanyId);
    ensureCompanyOwnership(db.leads, fallbackCompanyId);
    ensureCompanyOwnership(db.students, fallbackCompanyId);
    ensureCompanyOwnership(db.applications, fallbackCompanyId);
    ensureCompanyOwnership(db.receptionLogs, fallbackCompanyId);
    ensureCompanyOwnership(db.attendance, fallbackCompanyId);
    ensureCompanyOwnership(db.invoices, fallbackCompanyId);
    ensureCompanyOwnership(db.payments, fallbackCompanyId);
    ensureCompanyOwnership(db.activities, fallbackCompanyId);
    ensureCompanyOwnership(db.tasks, fallbackCompanyId);
    ensureCompanyOwnership(db.executiveActions, fallbackCompanyId);
    ensureCompanyOwnership(db.broadcasts, fallbackCompanyId);
    ensureCompanyOwnership(db.callSchedules, fallbackCompanyId);
    ensureCompanyOwnership(db.dailyReports, fallbackCompanyId);
    ensureCompanyOwnership(db.reminders, fallbackCompanyId);
    ensureCompanyOwnership(db.responseScripts, fallbackCompanyId);
    ensureCompanyOwnership(db.userNotifications, fallbackCompanyId);
    ensureCompanyOwnership(db.leaveRequests, fallbackCompanyId);
    ensureExecutiveSeedData(db, fallbackCompanyId);

    for (const seedUser of demoUsersSeed) {
      const existing = db.users.find(item => String(item.email || '').toLowerCase() === seedUser.email.toLowerCase());
      if (existing) continue;
      db.users.push({
        id: seedUser.id,
        companyId: fallbackCompanyId,
        name: seedUser.name,
        email: seedUser.email,
        role: seedUser.role,
        department: seedUser.department,
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
        passwordHash: await bcrypt.hash('Demo123!', 10)
      });
    }

    if (!db.responseScripts.length) {
      db.responseScripts = defaultResponseScripts().map(item => ({
        ...item,
        companyId: fallbackCompanyId,
        createdAt: now(),
        updatedAt: now()
      }));
    }

    for (const user of db.users) {
      if (user.role === 'admin') continue;
      const userReminders = getScopedItems(db.reminders, fallbackCompanyId).filter(item => item.userId === user.id);
      if (!userReminders.length) {
        db.reminders.push(...defaultReminders(fallbackCompanyId, user.id));
      }
    }

    if (!Array.isArray(db.settings.pipelineStages) || !db.settings.pipelineStages.length || db.settings.pipelineStages.some(stage => legacyLeadStageMap[stage])) {
      db.settings.pipelineStages = [...consultancyPipelineStages];
    }
    db.settings.availableUniversities = sanitizeOptionList(db.settings.availableUniversities || []);
    db.settings.availablePrograms = sanitizeOptionList(db.settings.availablePrograms || []);
    db.settings.availableScholarships = sanitizeOptionList(
      db.settings.availableScholarships?.length
        ? db.settings.availableScholarships
        : (db.educationCatalog?.scholarships || []).map(item => {
            const university = String(item?.university || '').trim();
            const scope = String(item?.program_scope || '').trim();
            return [university, scope].filter(Boolean).join(' - ');
          })
    );
    db.settings.availableCountries = sanitizeOptionList(db.settings.availableCountries || []);

    db.tasks ||= [];
    const users = getScopedItems(db.users || [], req.user.companyId);
    for (const user of db.users) {
      if (typeof user.isActive !== 'boolean') user.isActive = true;
      if (!user.companyId) user.companyId = fallbackCompanyId;
      if (user.password && !user.passwordHash) {
        user.passwordHash = await bcrypt.hash(user.password, 10);
        delete user.password;
      }
      syncEmployeeRecordForUser(db, user);
    }

    for (const lead of db.leads) {
      lead.stage = legacyLeadStageMap[lead.stage] || lead.stage || 'Initial Inquiry';
      lead.targetCountry ||= lead.country || '';
      lead.targetMajor ||= lead.program || '';
      lead.budget = quickBudgetOptions.includes(lead.budget) ? lead.budget : '';
      lead.currentLevel = currentLevelOptions.includes(lead.currentLevel) ? lead.currentLevel : '';
      lead.nextFollowUp ||= '';
      lead.lostReason ||= '';
      lead.documents ||= [];
    }

    for (const employee of db.employees) {
      if (employee.department === 'Consultancy' && !employee.liveStatus) {
        employee.liveStatus = employee.id === 'emp-ziad' ? 'busy' : employee.id === 'emp-mariam' ? 'break' : 'available';
      }
      employee.annualLeaveBalance ??= 21;
      employee.monthlyTarget ??= employee.department === 'Consultancy' ? 8 : 0;
      employee.commissionPerContract ??= employee.department === 'Consultancy' ? 500 : 0;
      employee.basicSalary ??= employee.department === 'Consultancy' ? 18000 : employee.department === 'Admissions' ? 15000 : 12000;
      employee.currentBonus ??= 0;
      employee.currentDeductions ??= 0;
      employee.currentAdvances ??= 0;
      employee.dailySalaryDeduction ??= Math.round(Number(employee.basicSalary || 0) / 30);
      employee.documents ||= [];
    }

    for (const request of db.leaveRequests) {
      request.days ||= workingDaysBetween(request.startDate, request.endDate);
      request.status ||= 'Pending';
      request.leaveType ||= 'Annual Leave';
      request.reason ||= '';
      request.companyId ||= fallbackCompanyId;
    }

    for (const reminder of db.reminders) {
      reminder.type ||= 'tasks';
      reminder.text ||= '';
      reminder.archived = Boolean(reminder.archived);
      reminder.createdAt ||= now();
      reminder.userId ||= db.users.find(item => item.companyId === fallbackCompanyId && item.role !== 'admin')?.id || '';
    }

    for (const call of db.callSchedules) {
      call.status ||= 'scheduled';
      call.createdAt ||= now();
      call.createdBy ||= 'System';
    }

    for (const report of db.dailyReports) {
      report.metrics ||= { newLeads: 0, contacted: 0, submitted: 0, followUps: 0 };
      report.startTime ||= '09:00';
      report.endTime ||= '18:00';
      report.notes ||= '';
      report.createdAt ||= now();
    }

    for (const log of db.receptionLogs) {
      log.branch ||= 'Cairo HQ';
      log.queueStatus ||= log.type === 'Walk-in' ? 'waiting' : 'assigned';
      log.notifiedAt ||= '';
      log.consultantNotified ||= false;
      if (!receptionLeadSourceOptions.includes(log.source)) {
        log.source = log.source === 'Phone'
          ? 'Walk-in Without Appointment'
          : log.source === 'Referral'
            ? 'Friend Referral'
            : log.source === 'Google Ads'
              ? 'Google Campaign'
              : log.source === 'Instagram'
                ? 'Instagram Campaign'
                : log.source === 'Facebook'
                  ? 'Facebook Campaign'
                : 'Walk-in Without Appointment';
      }
    }

    for (const invoice of db.invoices) {
      const financials = summarizeInvoiceFinancials(invoice);
      invoice.currency = sanitizeCurrency(invoice.currency);
      invoice.exchangeRate = money(invoice.exchangeRate) || 1;
      invoice.serviceFee = financials.serviceFee;
      invoice.universityFee = financials.universityFee;
      invoice.visaFee = financials.visaFee;
      invoice.tax = financials.tax;
      invoice.passThroughFees = financials.passThroughFees;
      invoice.total = financials.total;
      invoice.installments = sanitizeInstallments(invoice.installments);
      invoice.description ||= 'Educational consultancy services';
      invoice.paymentStatement ||= invoice.description;
      invoice.notes ||= '';
      invoice.status ||= 'Unpaid';
      invoice.locked ||= false;
    }

    const paymentReceiptCounter = new Map();
    for (const payment of db.payments) {
      payment.method = sanitizePaymentMethod(payment.method);
      payment.currency = sanitizeCurrency(payment.currency || db.invoices.find(invoice => invoice.id === payment.invoiceId)?.currency || 'USD');
      payment.exchangeRate = money(payment.exchangeRate) || 1;
      payment.reference ||= '';
      payment.notes ||= '';
      const paymentYear = new Date(payment.createdAt || payment.date || now()).getFullYear();
      const nextReceiptIndex = (paymentReceiptCounter.get(paymentYear) || 0) + 1;
      paymentReceiptCounter.set(paymentYear, nextReceiptIndex);
      payment.receiptNumber ||= `REC-${paymentYear}-${String(nextReceiptIndex).padStart(3, '0')}`;
      payment.statement ||= db.invoices.find(invoice => invoice.id === payment.invoiceId)?.paymentStatement || '';
      payment.amountInWords ||= amountInWords(payment.amount, payment.currency);
      payment.locked = payment.locked !== false;
      payment.lockedAt ||= payment.createdAt || now();
      payment.attachment ||= null;
      payment.installmentId ||= '';
    }

    for (const application of db.applications) {
      application.applicationRefNo ||= '';
      application.portalUrl ||= '';
      application.portalUsername ||= '';
      application.portalPassword ||= '';
      application.offerType ||= application.status === 'Conditional Acceptance'
        ? 'Conditional Offer'
        : application.status === 'Final Acceptance'
          ? 'Unconditional Offer'
          : application.status === 'Rejected'
            ? 'Rejected'
            : '';
      application.offerConditions ||= '';
      application.rejectionReason ||= '';
      application.offerLetterUploadedAt ||= '';
      application.applicationFeeStatus ||= computeApplicationFeeStatus(db, application.companyId || fallbackCompanyId, application.studentId);
    }
  });
}

await prepareDb();

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: now() }));

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const db = await readDb();
  const user = db.users.find(item => item.email.toLowerCase() === String(email || '').toLowerCase());

  if (!user || !user.isActive || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    avatar: user.avatar,
    companyId: user.companyId
  };

  res.json({ token: signToken(user), user: safeUser });
});

app.get('/api/integrations/meta/webhook', (req, res) => {
  const config = getMetaConfig();
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyToken === config.verifyToken) {
    return res.status(200).send(challenge || '');
  }

  return res.status(403).json({ message: 'Webhook verification failed' });
});

app.post('/api/integrations/meta/webhook', async (req, res) => {
  const eventPayload = req.body || {};
  const eventHash = hashPayload(eventPayload);
  logMetaWebhook('info', 'event received', {
    object: eventPayload.object || 'meta',
    entryCount: Array.isArray(eventPayload.entry) ? eventPayload.entry.length : 0,
    eventHash
  });

  const record = await mutateDb(db => {
    initMetaCollections(db);
    const existing = db.webhookEvents.find(item => item.provider === 'meta' && item.eventId === eventHash);
    if (existing) {
      logMetaWebhook('info', 'duplicate webhook event ignored', {
        eventHash,
        recordId: existing.id
      });
      return existing;
    }

    const next = {
      id: randomUUID(),
      companyId: '',
      provider: 'meta',
      eventId: eventHash,
      objectType: eventPayload.object || 'meta',
      payload: eventPayload,
      processingStatus: 'pending',
      retryCount: 0,
      receivedAt: now(),
      processedAt: '',
      error: ''
    };
    db.webhookEvents.unshift(next);
    return next;
  });

  res.status(200).json({ received: true });

  queueMicrotask(() => {
    mutateDb(db => {
      initMetaCollections(db);
      const stored = db.webhookEvents.find(item => item.id === record.id);
      if (!stored || stored.processingStatus === 'processed') return;

      try {
        const entries = stored.payload?.entry || [];
        for (const entry of entries) {
          const entryId = entry.id || '';
          logMetaWebhook('info', 'processing entry', {
            recordId: stored.id,
            entryId,
            hasMessagingArray: Array.isArray(entry.messaging),
            changesCount: Array.isArray(entry.changes) ? entry.changes.length : 0
          });

          if (Array.isArray(entry.messaging)) {
            const possibleChannels = db.connectedChannels.filter(item => item.pageId === entryId || item.instagramAccountId === entryId);
            for (const event of entry.messaging) {
              const channel = possibleChannels.find(item => item.channelType === 'facebook')
                || possibleChannels.find(item => item.channelType === 'instagram');
              if (!channel) {
                logMetaWebhook('info', 'no connected messenger/instagram channel matched entry', {
                  entryId,
                  possibleChannels: possibleChannels.length
                });
                continue;
              }
              stored.companyId = channel.companyId;

              const normalizedInbound = normalizeMessengerInboundEvent({
                companyId: channel.companyId,
                channel,
                entry,
                event
              });
              if (normalizedInbound) {
                storeInboundMessage(db, channel.companyId, channel, normalizedInbound);
              }

              const statusEvents = normalizeMetaStatusEvents({ channel, value: null, event });
              statusEvents.forEach(statusItem => updateMessageStatus(db, channel.companyId, statusItem));
            }
          }

          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field !== 'messages') continue;
            const value = change.value || {};
            const phoneNumberId = value.metadata?.phone_number_id || '';
            const channel = db.connectedChannels.find(item => item.phoneNumberId === phoneNumberId && item.companyId);
            if (!channel) {
              logMetaWebhook('info', 'no connected whatsapp channel matched phone number', {
                phoneNumberId,
                changeField: change.field
              });
              continue;
            }
            stored.companyId = channel.companyId;

            const normalized = normalizeInboundMetaMessage({
              companyId: channel.companyId,
              channel,
              event: entry,
              value,
              contact: value.contacts?.[0] || {}
            });

            if (normalized) {
              storeInboundMessage(db, channel.companyId, channel, normalized);
            }

            const statusEvents = normalizeMetaStatusEvents({ channel, value, event: null });
            statusEvents.forEach(statusItem => updateMessageStatus(db, channel.companyId, statusItem));
          }
        }

        stored.processingStatus = 'processed';
        stored.processedAt = now();
        stored.error = '';
        logMetaWebhook('info', 'event processed', {
          recordId: stored.id,
          companyId: stored.companyId || '',
          processingStatus: stored.processingStatus
        });
      } catch (error) {
        stored.processingStatus = 'failed';
        stored.retryCount = Number(stored.retryCount || 0) + 1;
        stored.error = error.message;
        logMetaWebhook('error', 'event processing failed', {
          recordId: stored.id,
          error: error.message,
          retryCount: stored.retryCount
        });
      }
    }).catch(() => {});
  });
});

app.get('/api/integrations/meta/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing OAuth code or state');

  try {
    const callbackResult = await mutateDb(async db => {
      initMetaCollections(db);
      const oauthState = consumeMetaOauthState(db, String(state));
      const tokenData = await exchangeMetaCodeForToken(String(code));
      const assetPayload = await discoverMetaAssets(tokenData.access_token);
      const session = createMetaPendingSession(
        db,
        { companyId: oauthState.companyId, sub: oauthState.userId },
        tokenData,
        assetPayload
      );
      return { companyId: oauthState.companyId, sessionId: session.id };
    });

    const origin = getMetaConfig().clientOrigin || 'http://localhost:5173';
    const redirectUrl = new URL('/settings', origin);
    redirectUrl.searchParams.set('meta_session', callbackResult.sessionId);
    redirectUrl.searchParams.set('meta_connected', '1');
    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    return res.status(error.status || 500).send(error.message || 'Meta callback failed');
  }
});

app.use('/api', requireAuth);

app.get('/api/me', async (req, res) => {
  const db = await readDb();
  const user = db.users.find(item => item.id === req.user.sub && item.companyId === req.user.companyId);
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

app.get('/api/integrations/meta/status', allowRoles('admin', 'management', 'consultant', 'admissions', 'reception'), async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  const integration = sanitizeIntegration(getMetaIntegrationForCompany(db, req.user.companyId));
  res.json({
    configured: Boolean(getMetaConfig().appId && getMetaConfig().appSecret),
    integration,
    channels: listConnectedChannels(db, req.user.companyId),
    health: integration?.status || 'disconnected'
  });
});

app.post('/api/integrations/meta/connect', allowRoles('admin', 'management'), async (req, res) => {
  assertMetaConfigured();
  const result = await mutateDb(db => {
    initMetaCollections(db);
    const state = createMetaOauthState(db, req.user, req.body?.targets || ['whatsapp', 'facebook', 'instagram']);
    logIntegrationAudit(db, req.user, 'meta.connect.started', 'meta', 'oauth', { targets: req.body?.targets || [] });
    return { authUrl: buildMetaOauthUrl(state) };
  });
  res.json(result);
});

app.get('/api/integrations/meta/assets', allowRoles('admin', 'management'), async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  const sessionId = String(req.query.sessionId || req.query.meta_session || '');
  if (!sessionId) return res.status(400).json({ message: 'معرف جلسة Meta مطلوب' });
  const session = resolveMetaSession(db, req.user.companyId, req.user.sub, sessionId);
  res.json(sanitizeDiscoveredAssets(session));
});

app.post('/api/integrations/meta/assets/connect', allowRoles('admin', 'management'), async (req, res) => {
  const { sessionId, assetIds = [] } = req.body || {};
  if (!sessionId || !Array.isArray(assetIds) || !assetIds.length) {
    return res.status(400).json({ message: 'يجب اختيار أصل واحد على الأقل للربط' });
  }

  const result = await mutateDb(db => {
    initMetaCollections(db);
    const session = resolveMetaSession(db, req.user.companyId, req.user.sub, String(sessionId));
    const selectedAssets = session.discoveredAssets.filter(item => assetIds.includes(item.id));
    if (!selectedAssets.length) throw Object.assign(new Error('لم يتم العثور على الأصول المختارة'), { status: 404 });

    const integration = upsertMetaIntegration(db, req.user, session, selectedAssets);

    for (const asset of selectedAssets) {
      const existing = db.connectedChannels.find(item => item.companyId === req.user.companyId && (
        (asset.phoneNumberId && item.phoneNumberId === asset.phoneNumberId) ||
        (asset.instagramAccountId && item.instagramAccountId === asset.instagramAccountId) ||
        (asset.pageId && item.pageId === asset.pageId && item.channelType === asset.channelType)
      ));

      const pageToken = asset.pageAccessToken ? encryptSecret(asset.pageAccessToken) : '';
      if (existing) {
        Object.assign(existing, {
          metaIntegrationId: integration.id,
          channelType: asset.channelType,
          externalAccountId: asset.externalAccountId || existing.externalAccountId || '',
          externalBusinessId: asset.externalBusinessId || existing.externalBusinessId || '',
          pageId: asset.pageId || existing.pageId || '',
          pageName: asset.pageName || existing.pageName || '',
          instagramAccountId: asset.instagramAccountId || existing.instagramAccountId || '',
          instagramUsername: asset.instagramUsername || existing.instagramUsername || '',
          whatsappBusinessAccountId: asset.whatsappBusinessAccountId || existing.whatsappBusinessAccountId || '',
          phoneNumberId: asset.phoneNumberId || existing.phoneNumberId || '',
          displayPhoneNumber: asset.displayPhoneNumber || existing.displayPhoneNumber || '',
          verifiedName: asset.verifiedName || existing.verifiedName || '',
          encryptedChannelToken: pageToken || existing.encryptedChannelToken || '',
          profilePictureUrl: asset.profilePictureUrl || existing.profilePictureUrl || '',
          status: 'connected',
          permissions: asset.permissions || [],
          metadata: asset.metadata || {},
          connectedAt: existing.connectedAt || now(),
          disconnectedAt: '',
          updatedAt: now()
        });
      } else {
        db.connectedChannels.unshift({
          id: randomUUID(),
          companyId: req.user.companyId,
          metaIntegrationId: integration.id,
          channelType: asset.channelType,
          externalAccountId: asset.externalAccountId || '',
          externalBusinessId: asset.externalBusinessId || '',
          pageId: asset.pageId || '',
          pageName: asset.pageName || '',
          instagramAccountId: asset.instagramAccountId || '',
          instagramUsername: asset.instagramUsername || '',
          whatsappBusinessAccountId: asset.whatsappBusinessAccountId || '',
          phoneNumberId: asset.phoneNumberId || '',
          displayPhoneNumber: asset.displayPhoneNumber || '',
          verifiedName: asset.verifiedName || '',
          encryptedChannelToken: pageToken,
          profilePictureUrl: asset.profilePictureUrl || '',
          status: 'connected',
          permissions: asset.permissions || [],
          metadata: asset.metadata || {},
          connectedAt: now(),
          disconnectedAt: '',
          updatedAt: now()
        });
      }
    }

    session.expiresAt = 0;
    logIntegrationAudit(db, req.user, 'meta.assets.connected', 'meta', integration.id, { count: selectedAssets.length });
    return {
      integration: sanitizeIntegration(integration),
      channels: listConnectedChannels(db, req.user.companyId)
    };
  });

  res.status(201).json(result);
});

app.post('/api/integrations/meta/reconnect', allowRoles('admin', 'management'), async (req, res) => {
  assertMetaConfigured();
  const result = await mutateDb(db => {
    initMetaCollections(db);
    const state = createMetaOauthState(db, req.user, ['whatsapp', 'facebook', 'instagram']);
    return { authUrl: buildMetaOauthUrl(state) };
  });
  res.json(result);
});

app.delete('/api/integrations/meta/disconnect', allowRoles('admin', 'management'), async (req, res) => {
  await mutateDb(db => {
    initMetaCollections(db);
    const integration = getMetaIntegrationForCompany(db, req.user.companyId);
    if (integration) {
      integration.status = 'disconnected';
      integration.encryptedAccessToken = '';
      integration.updatedAt = now();
    }
    getScopedItems(db.connectedChannels, req.user.companyId).forEach(channel => {
      channel.status = 'disconnected';
      channel.encryptedChannelToken = '';
      channel.disconnectedAt = now();
      channel.updatedAt = now();
    });
    logIntegrationAudit(db, req.user, 'meta.disconnected', 'meta', integration?.id || 'meta', {});
  });
  res.status(204).end();
});

app.get('/api/integrations/meta/channels', allowRoles('admin', 'management', 'consultant', 'admissions', 'reception'), async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  res.json(listConnectedChannels(db, req.user.companyId));
});

app.get('/api/integrations/meta/whatsapp/templates', allowRoles('admin', 'management', 'admissions', 'consultant', 'reception'), async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  const channelId = String(req.query.channelId || '');
  res.json(getScopedItems(db.whatsAppTemplates, req.user.companyId).filter(item => !channelId || item.channelId === channelId));
});

app.post('/api/integrations/meta/whatsapp/templates/sync', allowRoles('admin', 'management'), async (req, res) => {
  const { channelId } = req.body || {};
  const result = await mutateDb(async db => {
    initMetaCollections(db);
    const integration = getMetaIntegrationForCompany(db, req.user.companyId);
    const channel = db.connectedChannels.find(item => item.id === channelId && item.companyId === req.user.companyId && item.channelType === 'whatsapp');
    if (!integration?.encryptedAccessToken) throw Object.assign(new Error('تكامل Meta غير متصل'), { status: 400 });
    if (!channel?.whatsappBusinessAccountId) throw Object.assign(new Error('قناة واتساب غير صالحة للمزامنة'), { status: 400 });

    const response = await metaGraphRequest(`/${channel.whatsappBusinessAccountId}/message_templates`, {
      accessToken: decryptSecret(integration.encryptedAccessToken)
    });

    db.whatsAppTemplates = db.whatsAppTemplates.filter(item => !(item.companyId === req.user.companyId && item.channelId === channel.id));
    for (const template of response.data || []) {
      db.whatsAppTemplates.unshift({
        id: randomUUID(),
        companyId: req.user.companyId,
        channelId: channel.id,
        externalTemplateId: template.id || '',
        name: template.name || '',
        language: template.language || '',
        category: template.category || '',
        status: template.status || '',
        components: template.components || [],
        lastSyncedAt: now()
      });
    }
    return getScopedItems(db.whatsAppTemplates, req.user.companyId).filter(item => item.channelId === channel.id);
  });

  res.json(result);
});

app.get('/api/conversations', async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  let conversations = getScopedItems(db.conversations, req.user.companyId);
  const q = String(req.query.q || '').trim().toLowerCase();
  const channelType = String(req.query.channelType || '');
  const status = String(req.query.status || '');
  const assignedUserId = String(req.query.assignedUserId || '');
  const priority = String(req.query.priority || '');

  if (channelType) conversations = conversations.filter(item => item.channelType === channelType);
  if (status) conversations = conversations.filter(item => item.status === status);
  if (assignedUserId) conversations = conversations.filter(item => item.assignedUserId === assignedUserId);
  if (priority) conversations = conversations.filter(item => String(item.priority || 'medium') === priority);
  if (q) {
    conversations = conversations.filter(item =>
      [item.externalUserName, item.externalUserId, item.metadata?.displayPhoneNumber]
        .some(value => String(value || '').toLowerCase().includes(q))
    );
  }

  const channels = getScopedItems(db.connectedChannels, req.user.companyId);
  const messages = getScopedItems(db.messages, req.user.companyId);

  res.json(conversations
    .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')))
    .map(conversation => ({
      ...conversation,
      channel: channels.find(item => item.id === conversation.channelId) || null,
      lastMessage: messages.find(item => item.conversationId === conversation.id) || null,
      contact: getContactSummary(db, req.user.companyId, conversation.contactId, conversation.contactType)
    })));
});

app.post('/api/conversations/bulk', async (req, res) => {
  const { ids = [], operation, assignedUserId = '', status = '', priority = '', tags = [] } = req.body || {};
  const scopedIds = [...new Set((Array.isArray(ids) ? ids : []).map(item => String(item || '')).filter(Boolean))];

  if (!scopedIds.length) return res.status(400).json({ message: 'يجب اختيار محادثة واحدة على الأقل' });
  if (!['assign', 'status', 'mark_read', 'priority', 'tags'].includes(operation)) {
    return res.status(400).json({ message: 'نوع العملية الجماعية غير صالح' });
  }

  const result = await mutateDb(db => {
    initMetaCollections(db);
    const conversations = db.conversations.filter(
      item => item.companyId === req.user.companyId && scopedIds.includes(item.id)
    );

    if (!conversations.length) throw Object.assign(new Error('لم يتم العثور على المحادثات المحددة'), { status: 404 });

    for (const conversation of conversations) {
      if (operation === 'assign') {
        conversation.assignedUserId = assignedUserId;
      }

      if (operation === 'status') {
        conversation.status = status || conversation.status;
        if (conversation.status === 'resolved') conversation.unreadCount = 0;
      }

      if (operation === 'mark_read') {
        conversation.unreadCount = 0;
      }

      if (operation === 'priority') {
        conversation.priority = priority || conversation.priority || 'medium';
      }

      if (operation === 'tags') {
        conversation.tags = normalizeConversationTags(tags);
      }

      conversation.updatedAt = now();
    }

    return {
      updatedCount: conversations.length,
      operation,
      ids: conversations.map(item => item.id)
    };
  });

  res.json(result);
});

app.get('/api/conversations/:id/messages', async (req, res) => {
  const db = await readDb();
  initMetaCollections(db);
  const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
  if (!conversation) return res.status(404).json({ message: 'المحادثة غير موجودة' });
  const messages = getScopedItems(db.messages, req.user.companyId)
    .filter(item => item.conversationId === conversation.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  res.json(messages);
});

app.post('/api/conversations/:id/link-contact', async (req, res) => {
  const { contactId, contactType } = req.body || {};
  if (!contactId || !contactType) return res.status(400).json({ message: 'معرف جهة الاتصال ونوعها مطلوبان' });

  const result = await mutateDb(db => {
    initMetaCollections(db);
    const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!conversation) throw Object.assign(new Error('المحادثة غير موجودة'), { status: 404 });

    const contact = getContactSummary(db, req.user.companyId, contactId, contactType);
    if (!contact) throw Object.assign(new Error('جهة الاتصال غير موجودة داخل هذه الشركة'), { status: 404 });

    conversation.contactId = contactId;
    conversation.contactType = contactType;
    conversation.externalUserName = conversation.externalUserName || contact.name;
    conversation.updatedAt = now();

    const identity = db.contactChannelIdentities.find(item =>
      item.companyId === req.user.companyId &&
      item.channelId === conversation.channelId &&
      item.externalUserId === conversation.externalUserId
    );

    if (identity) {
      identity.contactId = contactId;
      identity.contactType = contactType;
      identity.displayName = contact.name;
    } else {
      db.contactChannelIdentities.unshift({
        id: randomUUID(),
        companyId: req.user.companyId,
        channelType: conversation.channelType,
        channelId: conversation.channelId,
        externalUserId: conversation.externalUserId,
        contactId,
        contactType,
        displayName: contact.name,
        createdAt: now()
      });
    }

    return {
      ...conversation,
      contact
    };
  });

  res.json(result);
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const payload = req.body || {};
  const result = await mutateDb(async db => {
    initMetaCollections(db);
    const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!conversation) throw Object.assign(new Error('المحادثة غير موجودة'), { status: 404 });

    const channel = db.connectedChannels.find(item => item.id === conversation.channelId && item.companyId === req.user.companyId);
    const integration = getMetaIntegrationForCompany(db, req.user.companyId);
    if (!channel || !integration) throw Object.assign(new Error('قناة Meta غير متصلة'), { status: 400 });

    if (channel.channelType === 'whatsapp' && !payload.templateName) {
      const expiresAt = conversation.messagingWindowExpiresAt ? new Date(conversation.messagingWindowExpiresAt).getTime() : 0;
      if (!expiresAt || expiresAt < Date.now()) {
        throw Object.assign(new Error('انتهت نافذة مراسلة واتساب الحرة، يجب استخدام قالب معتمد'), { status: 400 });
      }
    }

    const providerResponse = await sendOutboundMetaMessage({ integration, channel, conversation, payload });
    const externalMessageId = providerResponse.messages?.[0]?.id || providerResponse.message_id || randomUUID();
    const message = {
      id: randomUUID(),
      companyId,
      conversationId: conversation.id,
      channelId: channel.id,
      externalMessageId,
      direction: 'outbound',
      senderType: 'employee',
      senderUserId: req.user.sub,
      messageType: payload.templateName ? 'template' : 'text',
      text: payload.text || '',
      attachments: [],
      replyToMessageId: '',
      status: 'sent',
      providerStatus: 'sent',
      errorCode: '',
      errorMessage: '',
      rawPayload: {},
      sentAt: now(),
      deliveredAt: '',
      readAt: '',
      createdAt: now()
    };
    db.messages.unshift(message);
    conversation.lastMessageAt = message.createdAt;
    conversation.updatedAt = now();
    conversation.unreadCount = 0;
    return message;
  });

  res.status(201).json(result);
});

app.post('/api/conversations/:id/assign', async (req, res) => {
  const result = await mutateDb(db => {
    initMetaCollections(db);
    const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!conversation) throw Object.assign(new Error('المحادثة غير موجودة'), { status: 404 });
    conversation.assignedUserId = req.body?.assignedUserId || '';
    conversation.updatedAt = now();
    return conversation;
  });
  res.json(result);
});

app.patch('/api/conversations/:id/status', async (req, res) => {
  const result = await mutateDb(db => {
    initMetaCollections(db);
    const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!conversation) throw Object.assign(new Error('المحادثة غير موجودة'), { status: 404 });
    conversation.status = req.body?.status || conversation.status;
    if (conversation.status === 'resolved') conversation.unreadCount = 0;
    conversation.updatedAt = now();
    return conversation;
  });
  res.json(result);
});

app.patch('/api/conversations/:id/classification', async (req, res) => {
  const result = await mutateDb(db => {
    initMetaCollections(db);
    const conversation = db.conversations.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!conversation) throw Object.assign(new Error('المحادثة غير موجودة'), { status: 404 });
    conversation.priority = String(req.body?.priority || conversation.priority || 'medium');
    conversation.tags = normalizeConversationTags(req.body?.tags ?? conversation.tags ?? []);
    conversation.updatedAt = now();
    return conversation;
  });

  res.json(result);
});

app.get('/api/dashboard', async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const leads = getScopedItems(db.leads, companyId);
  const students = getScopedItems(db.students, companyId);
  const invoices = getScopedItems(db.invoices, companyId);
  const payments = getScopedItems(db.payments, companyId);
  const applications = getScopedItems(db.applications, companyId);
  const employees = getScopedItems(db.employees, companyId);
  const activities = getScopedItems(db.activities, companyId);
  const receptionLogs = getScopedItems(db.receptionLogs, companyId);
  const won = leads.filter(item => item.stage === 'Enrolled').length;
  const active = leads.filter(item => !['Lost', 'Enrolled'].includes(item.stage)).length;
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + money(invoice.total), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
  const pendingDocs = applications.filter(item => item.documentProgress < 100).length;

  const consultantStats = employees
    .filter(employee => employee.department === 'Consultancy')
    .map(employee => {
      const assigned = leads.filter(lead => lead.consultantId === employee.id);
      const enrolled = assigned.filter(lead => lead.stage === 'Enrolled').length;
      return {
        id: employee.id,
        name: employee.name,
        assigned: assigned.length,
        enrolled,
        conversion: assigned.length ? Math.round((enrolled / assigned.length) * 100) : 0,
        score: employee.performance
      };
    });

  res.json({
    kpis: {
      totalLeads: leads.length,
      activeLeads: active,
      students: students.length,
      conversionRate: leads.length ? Math.round((won / leads.length) * 100) : 0,
      invoiced: invoiceTotal,
      collected: paidTotal,
      outstanding: Math.max(0, invoiceTotal - paidTotal),
      pendingApplications: pendingDocs
    },
    monthlyRevenue: db.monthlyRevenue,
    stageDistribution: db.settings.pipelineStages.map(stage => ({ stage, count: leads.filter(lead => lead.stage === stage).length })),
    consultantStats,
    recentActivity: activities.slice(0, 8),
    recentReception: receptionLogs.slice(0, 5),
    executiveActions: getExecutiveActions(db, companyId),
    emergencyAlerts: buildEmergencyAlerts(db, companyId),
    latestBroadcast: getScopedItems(db.broadcasts || [], companyId)
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0] || null
  });
});

app.get('/api/settings', async (_req, res) => {
  const db = await readDb();
  db.settings.documentChecklistTemplates = sanitizeChecklistTemplates(db.settings.documentChecklistTemplates || []);
  db.settings.applicationWorkflowTemplates = sanitizeWorkflowTemplates(db.settings.applicationWorkflowTemplates || []);
  const catalogLinks = buildEducationCatalogLinks(db.educationCatalog || {});
  db.settings.availableUniversities = catalogLinks.universities.length
    ? catalogLinks.universities
    : sanitizeOptionList(db.settings.availableUniversities || []);
  db.settings.availablePrograms = catalogLinks.programs.length
    ? catalogLinks.programs
    : sanitizeOptionList(db.settings.availablePrograms || []);
  db.settings.availableScholarships = sanitizeOptionList(db.settings.availableScholarships || []);
  db.settings.availableCountries = catalogLinks.countries.length
    ? catalogLinks.countries
    : sanitizeOptionList(db.settings.availableCountries || []);
  const companyId = _req.user.companyId;
  const users = getScopedItems(db.users, companyId);
  const hrEmployees = users
    .filter(user => user.role !== 'admin')
    .map(user => {
      const employee = findScoped(
        db.employees,
        companyId,
        item => item.linkedUserId === user.id || item.email?.toLowerCase() === user.email?.toLowerCase()
      );
      return employee ? { ...employee, linkedUserId: user.id, name: user.name, email: user.email, department: user.department } : null;
    })
    .filter(Boolean);
  res.json({
    ...db.settings,
    catalogLinks,
    users: users.map(({ passwordHash, ...user }) => user),
    employees: hrEmployees,
    company: db.companies.find(item => item.id === companyId) || null
  });
});

app.get('/api/education-catalog', allowRoles('admin', 'management'), async (_req, res) => {
  const db = await readDb();
  const catalog = db.educationCatalog || {};
  const catalogLinks = buildEducationCatalogLinks(catalog);
  res.json({
    summary: {
      universities: Array.isArray(catalog.universities) ? catalog.universities.length : 0,
      programs: Array.isArray(catalog.programs) ? catalog.programs.length : 0,
      scholarships: Array.isArray(catalog.scholarships) ? catalog.scholarships.length : 0,
      uniqueDepartments: catalogLinks.programs.length,
      countries: catalogLinks.countries.length
    },
    universities: Array.isArray(catalog.universities) ? catalog.universities : [],
    programs: Array.isArray(catalog.programs) ? catalog.programs : [],
    scholarships: Array.isArray(catalog.scholarships) ? catalog.scholarships : [],
    availableUniversities: catalogLinks.universities,
    availablePrograms: catalogLinks.programs,
    availableCountries: catalogLinks.countries,
    catalogLinks
  });
});

app.post('/api/education-catalog/quote-pdf', allowRoles('admin', 'management'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const student = payload.student || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!String(student.studentName || '').trim()) {
      return res.status(400).json({ message: 'اسم الطالب مطلوب لتوليد ملف العرض.' });
    }
    if (!items.length) {
      return res.status(400).json({ message: 'يجب اختيار برنامج واحد على الأقل.' });
    }

    const db = await readDb();
    const companyId = req.user.companyId;
    const company = findScoped(db.companies || [], companyId, item => item.id === companyId);
    const settings = db.settings || {};
    const pdfBuffer = await generateUniversityQuotePdfChrome({
      companyName: company?.name || settings.companyName || 'EduGlobal CRM',
      preparedBy: req.user.name,
      student: {
        studentName: String(student.studentName || '').trim(),
        studentPhone: String(student.studentPhone || '').trim(),
        studentEmail: String(student.studentEmail || '').trim(),
        targetCountry: String(student.targetCountry || '').trim(),
        notes: String(student.notes || '').trim()
      },
      items: items.map(item => ({
        university: String(item?.university || '').trim(),
        major: String(item?.major || '').trim(),
        degree: String(item?.degree || '').trim(),
        language: String(item?.language || '').trim(),
        city: String(item?.city || '').trim(),
        country: String(item?.country || '').trim(),
        availability: String(item?.availability || '').trim(),
        tuitionFee: Number(item?.tuitionFee || 0),
        cashFee: Number(item?.cashFee || 0),
        depositAmount: Number(item?.depositAmount || 0),
        prepFee: Number(item?.prepFee || 0),
        currency: sanitizeCurrency(item?.currency || 'USD')
      }))
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(`university-quote-${String(student.studentName || 'student').trim() || 'student'}.pdf`)}"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/settings', allowRoles('admin', 'management'), async (req, res) => {
  const payload = req.body || {};

  const result = await mutateDb(db => {
    const settings = db.settings;
    settings.documentChecklistTemplates = sanitizeChecklistTemplates(settings.documentChecklistTemplates || []);
    settings.applicationWorkflowTemplates = sanitizeWorkflowTemplates(settings.applicationWorkflowTemplates || []);
    settings.availableUniversities = sanitizeOptionList(settings.availableUniversities || []);
    settings.availablePrograms = sanitizeOptionList(settings.availablePrograms || []);
    settings.availableScholarships = sanitizeOptionList(settings.availableScholarships || []);
    settings.availableCountries = sanitizeOptionList(settings.availableCountries || []);

    if (typeof payload.companyName === 'string' && payload.companyName.trim()) settings.companyName = payload.companyName.trim();
    if (typeof payload.workspace === 'string' && payload.workspace.trim()) settings.workspace = payload.workspace.trim();
    if (typeof payload.currency === 'string' && payload.currency.trim()) settings.currency = payload.currency.trim().toUpperCase();

    if (Array.isArray(payload.pipelineStages)) {
      const stages = payload.pipelineStages.map(item => String(item || '').trim()).filter(Boolean);
      if (stages.length < 2) throw Object.assign(new Error('يجب إدخال مرحلتين على الأقل في المسار'), { status: 400 });
      settings.pipelineStages = stages;
    }

    if (Array.isArray(payload.applicationStatuses)) {
      const statuses = payload.applicationStatuses.map(item => String(item || '').trim()).filter(Boolean);
      if (!statuses.length) throw Object.assign(new Error('يجب إدخال حالة طلب واحدة على الأقل'), { status: 400 });
      settings.applicationStatuses = statuses;
    }

    if (Array.isArray(payload.availableUniversities)) {
      settings.availableUniversities = sanitizeOptionList(payload.availableUniversities);
    }

    if (Array.isArray(payload.availablePrograms)) {
      settings.availablePrograms = sanitizeOptionList(payload.availablePrograms);
    }

    if (Array.isArray(payload.availableScholarships)) {
      settings.availableScholarships = sanitizeOptionList(payload.availableScholarships);
    }

    if (Array.isArray(payload.availableCountries)) {
      settings.availableCountries = sanitizeOptionList(payload.availableCountries);
    }

    if (Array.isArray(payload.documentTypes)) {
      const documentTypes = sanitizeDocumentTypes(payload.documentTypes);
      if (!documentTypes.length) throw Object.assign(new Error('يجب إدخال نوع مستند واحد على الأقل'), { status: 400 });
      settings.documentTypes = documentTypes;
    }

    if (Array.isArray(payload.documentChecklistTemplates)) {
      settings.documentChecklistTemplates = sanitizeChecklistTemplates(payload.documentChecklistTemplates);
    }

    if (Array.isArray(payload.applicationWorkflowTemplates)) {
      settings.applicationWorkflowTemplates = sanitizeWorkflowTemplates(payload.applicationWorkflowTemplates);
    }

    activity(db, req.user, 'updated', 'settings', 'system-settings', 'تم تحديث إعدادات النظام');
    return settings;
  });

  res.json(result);
});

app.post('/api/users', allowRoles('admin', 'management'), async (req, res) => {
  const payload = req.body || {};
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  if (!payload.name || !email || !payload.role || !payload.department || password.length < 6) {
    return res.status(400).json({ message: 'الاسم والبريد والدور والقسم وكلمة مرور من 6 أحرف مطلوبة' });
  }

  const result = await mutateDb(async db => {
    if (db.users.some(user => user.email.toLowerCase() === email)) {
      throw Object.assign(new Error('هذا البريد مستخدم مسبقًا'), { status: 409 });
    }

    const user = {
      id: randomUUID(),
      companyId: req.user.companyId,
      name: payload.name,
      email,
      role: payload.role,
      department: payload.department,
      avatar: payload.avatar || initials(payload.name),
      isActive: payload.isActive !== false,
      passwordHash: await bcrypt.hash(password, 10)
    };

    db.users.unshift(user);
    const linkedEmployee = syncEmployeeRecordForUser(db, user);
    activity(db, req.user, 'created', 'user', user.id, `تمت إضافة المستخدم ${user.name}`);
    const { passwordHash, ...safeUser } = user;
    return { ...safeUser, linkedEmployeeId: linkedEmployee?.id || null };
  });

  res.status(201).json(result);
});

app.patch('/api/users/:id', allowRoles('admin', 'management'), async (req, res) => {
  const payload = req.body || {};

  const result = await mutateDb(async db => {
    const user = db.users.find(item => item.id === req.params.id);
    if (!user) throw Object.assign(new Error('المستخدم غير موجود'), { status: 404 });

    if (payload.email) {
      const nextEmail = String(payload.email).trim().toLowerCase();
      const duplicate = db.users.find(item => item.id !== user.id && item.email.toLowerCase() === nextEmail);
      if (duplicate) throw Object.assign(new Error('هذا البريد مستخدم مسبقًا'), { status: 409 });
      user.email = nextEmail;
    }

    if (payload.name) {
      user.name = payload.name;
      user.avatar = initials(payload.name);
    }

    if (payload.role) user.role = payload.role;
    if (payload.department) user.department = payload.department;
    if (typeof payload.isActive === 'boolean') user.isActive = payload.isActive;
    if (payload.password) user.passwordHash = await bcrypt.hash(String(payload.password), 10);
    const linkedEmployee = syncEmployeeRecordForUser(db, user);

    activity(db, req.user, 'updated', 'user', user.id, `تم تحديث المستخدم ${user.name}`);
    const { passwordHash, ...safeUser } = user;
    return { ...safeUser, linkedEmployeeId: linkedEmployee?.id || null };
  });

  res.json(result);
});

app.get('/api/tasks', async (req, res) => {
  const db = await readDb();
  const users = getScopedItems(db.users || [], req.user.companyId);
  const safeUsers = new Map(users.map(({ passwordHash, ...user }) => [user.id, user]));
  const automaticTasks = req.user.role === 'hr' ? buildHrTasks(db, req.user.companyId) : buildAutomaticTasks(db, req.user.companyId);
  const manualTasks = getScopedItems(db.tasks || [], req.user.companyId).filter(task => {
    if (['admin', 'management'].includes(req.user.role)) return true;
    if (task.assignedUserId) return task.assignedUserId === req.user.sub;
    return !task.assignedRole || task.assignedRole === req.user.role;
  });
  res.json(
    [...automaticTasks, ...manualTasks].map(task => ({
      ...task,
      assignedUser: task.assignedUserId ? safeUsers.get(task.assignedUserId) || null : null
    }))
  );
});

app.get('/api/reminders', async (req, res) => {
  const db = await readDb();
  const users = getScopedItems(db.users || [], req.user.companyId);
  const safeUsers = new Map(users.map(({ passwordHash, ...user }) => [user.id, user]));
  const reminders = getScopedItems(db.reminders || [], req.user.companyId)
    .filter(item => (item.assignedUserId || item.userId) === req.user.sub || ['admin', 'management'].includes(req.user.role))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(reminders.map(item => ({
    ...item,
    assignedUser: (item.assignedUserId || item.userId) ? safeUsers.get(item.assignedUserId || item.userId) || null : null
  })));
});

app.post('/api/reminders', async (req, res) => {
  const payload = req.body || {};
  const text = String(req.body?.text || '').trim();
  const type = ['tasks', 'admissions', 'personal'].includes(req.body?.type) ? req.body.type : 'tasks';
  if (!text) return res.status(400).json({ message: 'نص التذكير مطلوب' });

  const result = await mutateDb(db => {
    db.reminders ||= [];
    const users = getScopedItems(db.users || [], req.user.companyId);
    const requestedAssigneeId = String(payload.assignedUserId || '').trim();
    const assignedUserId = ['admin', 'management'].includes(req.user.role) ? requestedAssigneeId || req.user.sub : req.user.sub;
    const assignedUser = users.find(user => user.id === assignedUserId);
    if (!assignedUser) throw Object.assign(new Error('الموظف المسند إليه غير موجود'), { status: 400 });
    const reminder = {
      id: randomUUID(),
      companyId: req.user.companyId,
      userId: assignedUserId,
      assignedUserId,
      assignedRole: assignedUser.role || '',
      title: String(payload.title || '').trim(),
      type,
      text,
      dueDate: String(payload.dueDate || '').trim(),
      archived: false,
      createdAt: now(),
      createdBy: req.user.name,
      assignedByUserId: req.user.sub
    };
    db.reminders.unshift(reminder);
    activity(db, req.user, 'created', 'reminder', reminder.id, `تم إنشاء تذكير جديد: ${text}`);
    return reminder;
  });

  res.status(201).json(result);
});

app.patch('/api/reminders/:id', async (req, res) => {
  const result = await mutateDb(db => {
    const reminder = findScoped(db.reminders || [], req.user.companyId, item => item.id === req.params.id);
    if (!reminder) throw Object.assign(new Error('التذكير غير موجود'), { status: 404 });
    if ((reminder.assignedUserId || reminder.userId) !== req.user.sub && !['admin', 'management'].includes(req.user.role)) {
      throw Object.assign(new Error('ليس لديك صلاحية لتعديل هذا التذكير'), { status: 403 });
    }
    const users = getScopedItems(db.users || [], req.user.companyId);
    if (req.body?.assignedUserId !== undefined) {
      const nextAssignedUserId = ['admin', 'management'].includes(req.user.role)
        ? String(req.body.assignedUserId || '').trim() || req.user.sub
        : req.user.sub;
      const nextAssignedUser = users.find(user => user.id === nextAssignedUserId);
      if (!nextAssignedUser) throw Object.assign(new Error('الموظف المسند إليه غير موجود'), { status: 400 });
      reminder.assignedUserId = nextAssignedUserId;
      reminder.userId = nextAssignedUserId;
      reminder.assignedRole = nextAssignedUser.role || reminder.assignedRole || '';
    }
    if (typeof req.body?.archived === 'boolean') reminder.archived = req.body.archived;
    if (typeof req.body?.text === 'string' && req.body.text.trim()) reminder.text = req.body.text.trim();
    if (typeof req.body?.title === 'string') reminder.title = req.body.title.trim();
    if (typeof req.body?.dueDate === 'string') reminder.dueDate = req.body.dueDate.trim();
    if (['tasks', 'admissions', 'personal'].includes(req.body?.type)) reminder.type = req.body.type;
    reminder.updatedAt = now();
    return reminder;
  });

  res.json(result);
});

app.post('/api/reminders/:id/convert-to-task', async (req, res) => {
  const result = await mutateDb(db => {
    db.tasks ||= [];
    const users = getScopedItems(db.users || [], req.user.companyId);
    const reminder = findScoped(db.reminders || [], req.user.companyId, item => item.id === req.params.id);
    if (!reminder) throw Object.assign(new Error('التذكير غير موجود'), { status: 404 });
    if ((reminder.assignedUserId || reminder.userId) !== req.user.sub && !['admin', 'management'].includes(req.user.role)) {
      throw Object.assign(new Error('ليس لديك صلاحية لتحويل هذا التذكير'), { status: 403 });
    }

    const assignedUserId = String(req.body?.assignedUserId || reminder.assignedUserId || reminder.userId || '').trim();
    const assignedUser = assignedUserId ? users.find(user => user.id === assignedUserId) || null : null;
    if (assignedUserId && !assignedUser) throw Object.assign(new Error('الموظف المسند إليه غير موجود'), { status: 400 });

    const task = {
      id: randomUUID(),
      companyId: req.user.companyId,
      title: String(req.body?.title || reminder.title || reminder.text.slice(0, 80)).trim(),
      description: String(req.body?.description || reminder.text || '').trim(),
      dueDate: String(req.body?.dueDate || reminder.dueDate || '').trim(),
      priority: req.body?.priority || 'Medium',
      status: 'open',
      kind: 'manual',
      source: 'task',
      assignedRole: assignedUser?.role || reminder.assignedRole || '',
      assignedUserId: assignedUser?.id || '',
      assignedByUserId: req.user.sub,
      createdBy: req.user.name,
      createdAt: now()
    };

    db.tasks.unshift(task);
    reminder.archived = true;
    reminder.convertedTaskId = task.id;
    reminder.convertedAt = now();
    reminder.updatedAt = now();
    activity(db, req.user, 'created', 'task', task.id, `تم تحويل تذكير إلى مهمة ${task.title}`);
    return task;
  });

  res.status(201).json(result);
});

app.get('/api/calls', async (req, res) => {
  const db = await readDb();
  const calls = getScopedItems(db.callSchedules || [], req.user.companyId)
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  res.json(calls);
});

app.post('/api/calls', async (req, res) => {
  const datetime = String(req.body?.datetime || '');
  const leadName = String(req.body?.leadName || '').trim();
  const phone = String(req.body?.phone || '').trim();
  if (!datetime || !leadName || !phone) {
    return res.status(400).json({ message: 'بيانات الموعد غير مكتملة' });
  }

  const result = await mutateDb(db => {
    db.callSchedules ||= [];
    const lead = req.body?.leadId ? findScoped(db.leads || [], req.user.companyId, item => item.id === req.body.leadId) : null;
    const call = {
      id: randomUUID(),
      companyId: req.user.companyId,
      leadId: lead?.id || String(req.body?.leadId || ''),
      leadName: lead?.name || leadName,
      phone: lead?.phone || phone,
      datetime: new Date(datetime).toISOString(),
      note: String(req.body?.note || '').trim(),
      status: 'scheduled',
      createdAt: now(),
      createdBy: req.user.name
    };
    db.callSchedules.unshift(call);
    activity(db, req.user, 'created', 'call-schedule', call.id, `تمت إضافة مكالمة مجدولة مع ${call.leadName}`);
    return call;
  });

  res.status(201).json(result);
});

app.get('/api/response-scripts', async (req, res) => {
  const db = await readDb();
  res.json(getScopedItems(db.responseScripts || [], req.user.companyId));
});

app.get('/api/daily-reports/status', async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const date = String(req.query?.date || todayKey()).slice(0, 10);
  const employee = findScoped(db.employees, companyId, item => item.email?.toLowerCase() === req.user.email?.toLowerCase());
  const employeeId = employee?.id || '';
  const report = getScopedItems(db.dailyReports || [], companyId).find(item => item.userId === req.user.sub && item.date === date) || null;
  const metrics = {
    newLeads: getScopedItems(db.leads || [], companyId).filter(lead => lead.consultantId === employeeId && String(lead.createdAt || '').startsWith(date)).length,
    contacted: getScopedItems(db.leads || [], companyId).filter(lead => lead.consultantId === employeeId && lead.stage === 'Contacted' && String(lead.updatedAt || '').startsWith(date)).length,
    submitted: getScopedItems(db.applications || [], companyId).filter(app => String(app.updatedAt || app.createdAt || '').startsWith(date)).length,
    followUps: getScopedItems(db.tasks || [], companyId).filter(task => task.createdBy === req.user.name && task.status === 'done' && String(task.updatedAt || task.createdAt || '').startsWith(date)).length
  };
  res.json({ date, submitted: Boolean(report), report, metrics });
});

app.post('/api/daily-reports', async (req, res) => {
  const date = String(req.body?.date || todayKey()).slice(0, 10);
  const result = await mutateDb(db => {
    db.dailyReports ||= [];
    const existing = getScopedItems(db.dailyReports, req.user.companyId).find(item => item.userId === req.user.sub && item.date === date);
    if (existing) throw Object.assign(new Error('تم إرسال التقرير لهذا اليوم بالفعل'), { status: 409 });
    const report = {
      id: randomUUID(),
      companyId: req.user.companyId,
      userId: req.user.sub,
      userName: req.user.name,
      date,
      startTime: String(req.body?.startTime || '09:00'),
      endTime: String(req.body?.endTime || '18:00'),
      tookBreak: Boolean(req.body?.tookBreak),
      notes: String(req.body?.notes || '').trim(),
      metrics: {
        newLeads: Number(req.body?.metrics?.newLeads || 0),
        contacted: Number(req.body?.metrics?.contacted || 0),
        submitted: Number(req.body?.metrics?.submitted || 0),
        followUps: Number(req.body?.metrics?.followUps || 0)
      },
      createdAt: now()
    };
    db.dailyReports.unshift(report);
    activity(db, req.user, 'created', 'daily-report', report.id, `تم إرسال التقرير اليومي بتاريخ ${date}`);
    return report;
  });

  res.status(201).json(result);
});

app.get('/api/sales/markets', async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const currentMonth = monthKey('2026-08-22T12:00:00');
  const marketConfigs = [
    { key: 'turkey', label: 'Turkey Market', match: value => value === 'Turkey', target: 180000 },
    { key: 'poland', label: 'Poland Market', match: value => value === 'Poland', target: 120000 }
  ];

  const students = getScopedItems(db.students || [], companyId);
  const leads = getScopedItems(db.leads || [], companyId);
  const applications = getScopedItems(db.applications || [], companyId);
  const invoices = getScopedItems(db.invoices || [], companyId).map(invoice => enrichInvoice(db, invoice));

  const markets = marketConfigs.map(config => {
    const enrolledStudents = students.filter(student => config.match(student.country || student.targetCountry || ''));
    const achieved = invoices
      .filter(invoice => config.match(invoice.application?.country || invoice.student?.country || invoice.student?.targetCountry || ''))
      .reduce((sum, invoice) => sum + money(invoice.paid), 0);
    const relatedApplications = applications.filter(app => config.match(app.country || ''));
    const relatedLeads = leads.filter(lead => config.match(lead.targetCountry || lead.country || ''));
    const trend = Array.from({ length: 7 }, (_, index) => {
      const day = String(index + 16).padStart(2, '0');
      const dateKey = `2026-08-${day}`;
      return relatedApplications.filter(app => String(app.updatedAt || app.createdAt || '').startsWith(dateKey)).length
        + relatedLeads.filter(lead => String(lead.updatedAt || lead.createdAt || '').startsWith(dateKey)).length;
    });
    return {
      key: config.key,
      label: config.label,
      month: currentMonth,
      target: config.target,
      achieved,
      enrolled: enrolledStudents.length,
      leads: relatedLeads.length,
      applications: relatedApplications.length,
      trend
    };
  });

  res.json(markets);
});

app.post('/api/dashboard/executive-actions/:id/decision', allowRoles('admin', 'management'), async (req, res) => {
  const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';

  const result = await mutateDb(db => {
    db.executiveActions ||= [];
    const action = db.executiveActions.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!action) throw Object.assign(new Error('طلب الإجراء غير موجود'), { status: 404 });
    if (action.status !== 'pending') throw Object.assign(new Error('تم اتخاذ قرار على هذا الطلب بالفعل'), { status: 409 });

    action.status = decision;
    action.decidedAt = now();
    action.decidedBy = req.user.name;
    action.decisionNote = String(req.body?.note || '').trim();
    activity(db, req.user, 'updated', 'executive-action', action.id, `${executiveActionMeta[action.type]?.label || action.type} - ${decision}`);

    return {
      ...action,
      label: executiveActionMeta[action.type]?.label || action.type,
      decisionMode: executiveActionMeta[action.type]?.decisionMode || 'approve-reject'
    };
  });

  res.json(result);
});

app.post('/api/dashboard/broadcasts', allowRoles('admin', 'management'), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const tone = ['critical', 'warning', 'info'].includes(req.body?.tone) ? req.body.tone : 'critical';
  if (!message) return res.status(400).json({ message: 'نص التعميم مطلوب' });

  const result = await mutateDb(db => {
    db.broadcasts ||= [];
    const companyId = req.user.companyId;
    const broadcast = {
      id: randomUUID(),
      companyId,
      message,
      tone,
      createdAt: now(),
      createdBy: req.user.name
    };
    db.broadcasts.unshift(broadcast);
    db.broadcasts = db.broadcasts.slice(0, 50);
    getScopedItems(db.users, companyId)
      .filter(user => user.id !== req.user.sub)
      .forEach(user => {
        createUserNotification(
          db,
          companyId,
          user.id,
          tone === 'critical' ? 'تعميم عاجل من الإدارة' : tone === 'warning' ? 'تنبيه إداري مهم' : 'إشعار من الإدارة',
          message,
          { type: 'broadcast', tone, broadcastId: broadcast.id }
        );
      });
    activity(db, req.user, 'created', 'broadcast', broadcast.id, `تم إرسال تعميم عاجل: ${message.slice(0, 60)}`);
    return broadcast;
  });

  res.status(201).json(result);
});

app.post('/api/tasks', async (req, res) => {
  const payload = req.body || {};
  if (!payload.title) return res.status(400).json({ message: 'عنوان المهمة مطلوب' });

  const result = await mutateDb(db => {
    db.tasks ||= [];
    const users = getScopedItems(db.users || [], req.user.companyId);
    const assignedUserId = String(payload.assignedUserId || '').trim();
    const assignedUser = assignedUserId ? users.find(user => user.id === assignedUserId) || null : null;
    if (assignedUserId && !assignedUser) {
      throw Object.assign(new Error('Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø³Ù†Ø¯ Ø¥Ù„ÙŠÙ‡ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯'), { status: 400 });
    }
    const task = {
      id: randomUUID(),
      companyId: req.user.companyId,
      title: payload.title,
      description: payload.description || '',
      dueDate: payload.dueDate || '',
      priority: payload.priority || 'Medium',
      status: payload.status || 'open',
      kind: 'manual',
      source: 'task',
      assignedRole: payload.assignedRole || assignedUser?.role || '',
      assignedUserId: assignedUser?.id || '',
      assignedByUserId: req.user.sub,
      createdBy: req.user.name,
      createdAt: now()
    };
    db.tasks.unshift(task);
    activity(db, req.user, 'created', 'task', task.id, `تم إنشاء المهمة ${task.title}`);
    return task;
  });

  res.status(201).json(result);
});

app.patch('/api/tasks/:id', async (req, res) => {
  const result = await mutateDb(db => {
    db.tasks ||= [];
    const users = getScopedItems(db.users || [], req.user.companyId);
    const task = db.tasks.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!task) throw Object.assign(new Error('المهمة غير موجودة'), { status: 404 });

    const nextAssignedUserId = req.body.assignedUserId !== undefined ? String(req.body.assignedUserId || '').trim() : String(task.assignedUserId || '');
    const nextAssignedUser = nextAssignedUserId ? users.find(user => user.id === nextAssignedUserId) || null : null;
    if (nextAssignedUserId && !nextAssignedUser) {
      throw Object.assign(new Error('Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø³Ù†Ø¯ Ø¥Ù„ÙŠÙ‡ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯'), { status: 400 });
    }

    Object.assign(task, {
      title: req.body.title ?? task.title,
      description: req.body.description ?? task.description,
      dueDate: req.body.dueDate ?? task.dueDate,
      priority: req.body.priority ?? task.priority,
      status: req.body.status ?? task.status,
      assignedRole: req.body.assignedRole ?? (nextAssignedUser ? nextAssignedUser.role : task.assignedRole),
      assignedUserId: nextAssignedUserId
    });

    activity(db, req.user, 'updated', 'task', task.id, `تم تحديث المهمة ${task.title}`);
    return task;
  });

  res.json(result);
});

app.delete('/api/tasks/:id', async (req, res) => {
  await mutateDb(db => {
    db.tasks ||= [];
    const index = db.tasks.findIndex(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (index < 0) throw Object.assign(new Error('المهمة غير موجودة'), { status: 404 });
    const [task] = db.tasks.splice(index, 1);
    activity(db, req.user, 'deleted', 'task', task.id, `تم حذف المهمة ${task.title}`);
  });

  res.status(204).end();
});

app.get('/api/leads', async (req, res) => {
  const db = await readDb();
  let leads = getScopedItems(db.leads, req.user.companyId);
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) leads = leads.filter(lead => [lead.name, lead.phone, lead.email, lead.country, lead.program, lead.source, lead.targetCountry, lead.targetMajor, lead.budget, lead.currentLevel, lead.lostReason].some(value => String(value || '').toLowerCase().includes(q)));
  res.json(leads);
});

app.post('/api/leads', allowRoles('admin', 'management', 'consultant', 'reception'), async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.phone) return res.status(400).json({ message: 'الاسم ورقم الهاتف مطلوبان' });

  const result = await mutateDb(db => {
    const duplicate = db.leads.find(lead => lead.companyId === req.user.companyId && (lead.phone === payload.phone || (payload.email && lead.email === payload.email)));
    if (duplicate) throw Object.assign(new Error('يوجد عميل محتمل بنفس رقم الهاتف أو البريد الإلكتروني'), { status: 409 });

    const lead = {
      id: randomUUID(),
      companyId: req.user.companyId,
      name: payload.name,
      phone: payload.phone,
      email: payload.email || '',
      country: payload.country || '',
      program: payload.program || '',
      targetCountry: payload.targetCountry || payload.country || '',
      targetMajor: payload.targetMajor || payload.program || '',
      budget: quickBudgetOptions.includes(payload.budget) ? payload.budget : '',
      currentLevel: currentLevelOptions.includes(payload.currentLevel) ? payload.currentLevel : '',
      university: payload.university || '',
      source: payload.source || 'Direct',
      stage: payload.stage || 'Initial Inquiry',
      consultantId: payload.consultantId || '',
      priority: payload.priority || 'Medium',
      nextFollowUp: payload.nextFollowUp || '',
      lostReason: payload.lostReason || '',
      documents: [],
      notes: payload.notes || '',
      createdAt: now(),
      updatedAt: now()
    };

    db.leads.unshift(lead);
    activity(db, req.user, 'created', 'lead', lead.id, `تم إنشاء عميل محتمل باسم ${lead.name}`);
    return lead;
  });

  res.status(201).json(result);
});

app.patch('/api/leads/:id', allowRoles('admin', 'management', 'consultant', 'reception'), async (req, res) => {
  const result = await mutateDb(db => {
    const lead = db.leads.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!lead) throw Object.assign(new Error('العميل المحتمل غير موجود'), { status: 404 });
    Object.assign(lead, req.body, { updatedAt: now() });
    lead.targetCountry ||= lead.country || '';
    lead.targetMajor ||= lead.program || '';
    if (!quickBudgetOptions.includes(lead.budget)) lead.budget = '';
    if (!currentLevelOptions.includes(lead.currentLevel)) lead.currentLevel = '';
    lead.lostReason ||= '';
    activity(db, req.user, 'updated', 'lead', lead.id, `تم تحديث بيانات ${lead.name}`);
    return lead;
  });

  res.json(result);
});

app.post('/api/leads/:id/move', allowRoles('admin', 'management', 'consultant'), async (req, res) => {
  const result = await mutateDb(db => {
    const lead = db.leads.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!lead) throw Object.assign(new Error('العميل المحتمل غير موجود'), { status: 404 });
    const stage = req.body.stage;
    if (!db.settings.pipelineStages.includes(stage)) throw Object.assign(new Error('مرحلة المسار غير صالحة'), { status: 400 });

    const old = lead.stage;
    lead.stage = stage;
    lead.updatedAt = now();

    if (stage === 'Closed / Won' && !lead.studentId) {
      const student = {
        id: randomUUID(),
        companyId: req.user.companyId,
        leadId: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        nationality: lead.country,
        consultantId: lead.consultantId,
        createdAt: now()
      };

      const application = {
        id: randomUUID(),
        companyId: req.user.companyId,
        studentId: student.id,
        university: lead.university || 'سيتم تحديد الجامعة لاحقًا',
        program: lead.program || 'سيتم تحديد البرنامج لاحقًا',
        country: lead.country || '',
        status: 'Preparing Documents',
        intake: 'أقرب فصل متاح',
      assignedTo: '',
      documentProgress: 0,
      followUpProgress: [],
      documents: [],
      notes: '',
        createdAt: now(),
        updatedAt: now()
      };

      lead.studentId = student.id;
      db.students.unshift(student);
      db.applications.unshift(application);
      activity(db, req.user, 'created', 'application', application.id, `تم إنشاء طلب قبول تلقائيًا للطالب ${lead.name}`);
    }

    activity(db, req.user, 'moved', 'lead', lead.id, `${lead.name}: ${old} -> ${stage}`);
    return lead;
  });

  res.json(result);
});

app.delete('/api/leads/:id', allowRoles('admin', 'management'), async (req, res) => {
  await mutateDb(db => {
    const index = db.leads.findIndex(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (index < 0) throw Object.assign(new Error('العميل المحتمل غير موجود'), { status: 404 });
    const [lead] = db.leads.splice(index, 1);
    activity(db, req.user, 'deleted', 'lead', lead.id, `تم حذف ${lead.name}`);
  });

  res.status(204).end();
});

app.post('/api/leads/:id/documents', allowRoles('admin', 'management', 'consultant', 'reception'), upload.single('file'), async (req, res) => {
  const storedFile = req.file ? await storeUploadedFile(req.file, { folder: 'leads' }) : null;
  if (!req.file) return res.status(400).json({ message: 'الملف مطلوب' });

  const result = await mutateDb(db => {
    const lead = db.leads.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!lead) throw Object.assign(new Error('العميل المحتمل غير موجود'), { status: 404 });

    lead.documents ||= [];
    const document = {
      id: randomUUID(),
      type: String(req.body.type || 'Other').trim() || 'Other',
      originalName: req.file.originalname,
      fileName: storedFile.fileName,
      url: storedFile.url,
      size: storedFile.size,
      storageProvider: storedFile.storageProvider,
      uploadedBy: req.user.name,
      uploadedAt: now()
    };

    lead.documents.unshift(document);
    lead.updatedAt = now();
    activity(db, req.user, 'uploaded', 'lead-document', document.id, `تم رفع ${document.type} للعميل ${lead.name}`);
    return { document, lead };
  });

  res.status(201).json(result);
});

app.delete('/api/leads/:leadId/documents/:docId', allowRoles('admin', 'management', 'consultant', 'reception'), async (req, res) => {
  await mutateDb(async db => {
    const lead = db.leads.find(item => item.id === req.params.leadId && item.companyId === req.user.companyId);
    if (!lead) throw Object.assign(new Error('العميل المحتمل غير موجود'), { status: 404 });

    lead.documents ||= [];
    const index = lead.documents.findIndex(item => item.id === req.params.docId);
    if (index < 0) throw Object.assign(new Error('المستند غير موجود'), { status: 404 });
    const [document] = lead.documents.splice(index, 1);
    await removeUploadedFile(document);
    lead.updatedAt = now();
    activity(db, req.user, 'deleted', 'lead-document', document.id, `تم حذف ${document.type} من العميل ${lead.name}`);
  });

  res.status(204).end();
});

app.get('/api/students', allowRoles('admin', 'management', 'consultant', 'admissions', 'finance'), async (req, res) => {
  const db = await readDb();
  const students = getScopedItems(db.students, req.user.companyId);
  const applications = getScopedItems(db.applications, req.user.companyId);
  const invoices = getScopedItems(db.invoices, req.user.companyId);
  res.json(students.map(student => {
    const paymentStatus = computeApplicationFeeStatus(db, req.user.companyId, student.id);
    return {
      ...student,
      applications: applications.filter(item => item.studentId === student.id).map(item => ({
        ...buildApplicationState(item, db.settings),
        applicationFeeStatus: paymentStatus
      })),
      invoices: req.user.role === 'admissions'
        ? invoices.filter(item => item.studentId === student.id).map(() => ({ paymentStatus }))
        : invoices.filter(item => item.studentId === student.id)
    };
  }));
});

app.get('/api/applications', async (req, res) => {
  const db = await readDb();
  res.json(
    getScopedItems(db.applications, req.user.companyId).map(application => ({
      ...buildApplicationState(application, db.settings),
      applicationFeeStatus: computeApplicationFeeStatus(db, req.user.companyId, application.studentId),
      student: db.students.find(student => student.id === application.studentId && student.companyId === req.user.companyId) || null
    }))
  );
});

app.post('/api/applications', allowRoles('admin', 'management', 'admissions', 'consultant'), async (req, res) => {
  const result = await mutateDb(db => {
    let student = db.students.find(item => item.id === req.body.studentId && item.companyId === req.user.companyId);
    if (!student && req.user.role === 'admissions') {
      throw Object.assign(new Error('موظف القبول لا يمكنه إنشاء طالب جديد من هذه الشاشة'), { status: 403 });
    }
    if (!student && req.body.studentName) {
      student = {
        id: randomUUID(),
        companyId: req.user.companyId,
        name: req.body.studentName,
        phone: req.body.phone || '',
        email: req.body.email || '',
        nationality: req.body.country || '',
        consultantId: req.body.consultantId || '',
        createdAt: now()
      };
      db.students.unshift(student);
    }
    if (!student) throw Object.assign(new Error('الطالب مطلوب'), { status: 400 });

    const application = {
      id: randomUUID(),
      companyId: req.user.companyId,
      studentId: student.id,
      university: req.body.university || '',
      program: req.body.program || '',
      country: req.body.country || '',
      status: req.body.status || 'Preparing Documents',
      intake: req.body.intake || '',
      applicationRefNo: req.body.applicationRefNo || '',
      portalUrl: req.body.portalUrl || '',
      portalUsername: req.body.portalUsername || '',
      portalPassword: req.body.portalPassword || '',
      offerType: req.body.offerType || '',
      offerConditions: req.body.offerConditions || '',
      rejectionReason: req.body.rejectionReason || '',
      offerLetterUploadedAt: '',
      assignedTo: req.body.assignedTo || '',
      documentProgress: 0,
      followUpProgress: [],
      documents: [],
      notes: req.body.notes || '',
      createdAt: now(),
      updatedAt: now()
    };

    db.applications.unshift(application);
    activity(db, req.user, 'created', 'application', application.id, `تم إنشاء طلب قبول للطالب ${student.name}`);
    return { ...buildApplicationState(application, db.settings), applicationFeeStatus: computeApplicationFeeStatus(db, req.user.companyId, student.id), student };
  });

  res.status(201).json(result);
});

app.patch('/api/applications/:id', allowRoles('admin', 'management', 'admissions'), async (req, res) => {
  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.id);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });
    const nextStatus = req.body.status || application.status;
    const nextOfferType = req.body.offerType ?? application.offerType ?? '';
    const nextOfferConditions = req.body.offerConditions ?? application.offerConditions ?? '';
    const nextRejectionReason = req.body.rejectionReason ?? application.rejectionReason ?? '';
    if (['Conditional Acceptance', 'Final Acceptance', 'Rejected'].includes(nextStatus) && !nextOfferType) {
      throw Object.assign(new Error('نوع القبول أو الرفض مطلوب قبل حفظ الحالة'), { status: 400 });
    }
    if (nextOfferType === 'Conditional Offer' && !String(nextOfferConditions || '').trim()) {
      throw Object.assign(new Error('يجب كتابة شروط القبول المشروط'), { status: 400 });
    }
    if (nextOfferType === 'Rejected' && !String(nextRejectionReason || '').trim()) {
      throw Object.assign(new Error('يجب كتابة سبب الرفض'), { status: 400 });
    }
    Object.assign(application, req.body, {
      offerType: nextOfferType,
      offerConditions: nextOfferType === 'Conditional Offer' ? String(nextOfferConditions || '').trim() : '',
      rejectionReason: nextOfferType === 'Rejected' ? String(nextRejectionReason || '').trim() : '',
      applicationFeeStatus: computeApplicationFeeStatus(db, req.user.companyId, application.studentId),
      updatedAt: now()
    });
    activity(db, req.user, 'updated', 'application', application.id, `تم تحديث حالة الطلب إلى ${application.status}`);
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    if (['Conditional Acceptance', 'Final Acceptance'].includes(application.status)) {
      notifyConsultantAboutOffer(db, req.user.companyId, application, 'offer_status_changed');
    }
    return { ...nextState, applicationFeeStatus: computeApplicationFeeStatus(db, req.user.companyId, application.studentId) };
  });

  res.json(result);
});

app.patch('/api/applications/:id/follow-up/:stageId', allowRoles('admin', 'management', 'admissions', 'consultant'), async (req, res) => {
  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.id);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });

    const workflowState = computeApplicationWorkflowState(application, db.settings);
    const stage = (workflowState.effectiveFollowUpStages || []).find(item => item.id === req.params.stageId);
    if (!stage) throw Object.assign(new Error('مرحلة المتابعة غير موجودة'), { status: 404 });

    application.followUpProgress ||= [];
    const existing = application.followUpProgress.find(item => item.stageId === stage.id);
    const done = Boolean(req.body?.done);
    const note = String(req.body?.note || '').trim();

    if (existing) {
      existing.done = done;
      existing.note = note;
      existing.completedAt = done ? now() : '';
      existing.completedBy = done ? req.user.name : '';
    } else {
      application.followUpProgress.push({
        stageId: stage.id,
        done,
        note,
        completedAt: done ? now() : '',
        completedBy: done ? req.user.name : ''
      });
    }

    application.updatedAt = now();
    if (document.type === 'Acceptance Letter') {
      application.offerLetterUploadedAt = now();
      notifyConsultantAboutOffer(db, req.user.companyId, application, 'offer_letter_uploaded');
    }
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    activity(db, req.user, 'updated', 'application-follow-up', `${application.id}:${stage.id}`, `${application.id} - ${stage.title} - ${done ? 'completed' : 'reopened'}`);
    return nextState;
  });

  res.json(result);
});

app.post('/api/applications/:id/documents', allowRoles('admin', 'management', 'admissions', 'consultant'), upload.single('file'), async (req, res) => {
  const storedFile = req.file ? await storeUploadedFile(req.file, { folder: 'applications' }) : null;
  if (!req.file) return res.status(400).json({ message: 'الملف مطلوب' });

  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.id);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });

    const documentType = req.body.type || 'Other';
    const latestVersion = Math.max(
      0,
      ...(application.documents || [])
        .filter(item => item.type === documentType)
        .map(item => Number(item.version || 1))
    );

    (application.documents || [])
      .filter(item => item.type === documentType && item.current !== false)
      .forEach(item => {
        item.current = false;
        item.replacedAt = now();
      });

    const document = {
      id: randomUUID(),
      type: documentType,
      originalName: req.file.originalname,
      fileName: storedFile.fileName,
      url: storedFile.url,
      size: storedFile.size,
      storageProvider: storedFile.storageProvider,
      status: 'Pending Review',
      reviewNote: '',
      reviewedBy: '',
      reviewedAt: '',
      version: latestVersion + 1,
      current: true,
      uploadedBy: req.user.name,
      uploadedAt: now()
    };

    application.documents.push(document);
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    application.updatedAt = now();
    activity(db, req.user, 'uploaded', 'document', document.id, `تم رفع ${document.type} للطلب ${application.id.slice(0, 8)}`);
    return { document, application: { ...nextState, applicationFeeStatus: computeApplicationFeeStatus(db, req.user.companyId, application.studentId) } };
  });

  res.status(201).json(result);
});

app.patch('/api/applications/:appId/documents/:docId', allowRoles('admin', 'management', 'admissions'), async (req, res) => {
  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.appId);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });
    const document = application.documents.find(item => item.id === req.params.docId);
    if (!document) throw Object.assign(new Error('المستند غير موجود'), { status: 404 });

    if (req.body.status === 'Rejected' && !String(req.body.reviewNote || '').trim()) {
      throw Object.assign(new Error('يجب كتابة سبب رفض المستند'), { status: 400 });
    }
    document.status = req.body.status || document.status;
    document.reviewNote = req.body.reviewNote ?? document.reviewNote;
    document.reviewedBy = req.user.name;
    document.reviewedAt = now();
    application.updatedAt = now();

    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    activity(db, req.user, 'updated', 'document', document.id, `تمت مراجعة ${document.type} بحالة ${document.status}`);
    return { document, application: nextState };
  });

  res.json(result);
});

app.delete('/api/applications/:appId/documents/:docId', allowRoles('admin', 'management'), async (req, res) => {
  await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.appId);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });
    const index = application.documents.findIndex(item => item.id === req.params.docId);
    if (index < 0) throw Object.assign(new Error('المستند غير موجود'), { status: 404 });
    const [document] = application.documents.splice(index, 1);
    const previousVersion = application.documents
      .filter(item => item.type === document.type)
      .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))[0];
    if (previousVersion) previousVersion.current = true;
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    activity(db, req.user, 'deleted', 'document', document.id, `تم حذف ${document.type}`);
  });

  res.status(204).end();
});

app.get('/api/reception', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const logs = getScopedItems(db.receptionLogs, companyId);
  const consultants = buildReceptionConsultantSnapshot(db, companyId);
  const queue = logs
    .filter(log => log.type === 'Walk-in')
    .filter(log => ['waiting', 'notified'].includes(log.queueStatus || 'waiting'))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  res.json({ logs, consultants, queue });
});

app.get('/api/reception/duplicate-check', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const normalizedPhone = normalizePhone(req.query.phone);
  if (!normalizedPhone) return res.json({ duplicate: false });
  const duplicate = getScopedItems(db.leads, companyId).find(lead => normalizePhone(lead.phone) === normalizedPhone);
  if (!duplicate) return res.json({ duplicate: false });
  const consultant = findScoped(db.employees, companyId, item => item.id === duplicate.consultantId);
  res.json({ duplicate: true, leadId: duplicate.id, consultantName: consultant?.name || 'غير مسند', stage: duplicate.stage });
});

app.get('/api/reception/student-lookup', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const db = await readDb();
  const result = buildReceptionStudentLookup(db, req.user.companyId, req.query.q);
  if (!result) return res.status(404).json({ message: 'لم يتم العثور على الطالب' });
  res.json(result);
});

app.post('/api/reception', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const result = await mutateDb(db => {
    const payload = req.body || {};
    if (!payload.name || !payload.phone) throw Object.assign(new Error('الاسم ورقم الهاتف مطلوبان'), { status: 400 });

    if (!receptionLeadSourceOptions.includes(payload.source)) throw Object.assign(new Error('مصدر العميل مطلوب'), { status: 400 });
    if (payload.interest && !receptionInterestOptions.includes(payload.interest)) throw Object.assign(new Error('اهتمام الدراسة غير صالح'), { status: 400 });
    const companyId = req.user.companyId;
    const branch = String(payload.branch || 'Cairo HQ');
    const autoAssigned = payload.autoAssign ? pickNextReceptionConsultant(db, companyId, branch) : null;
    const duplicate = getScopedItems(db.leads, companyId).find(lead => normalizePhone(lead.phone) === normalizePhone(payload.phone) || (payload.email && lead.email === payload.email));
    const consultantId = autoAssigned?.id || payload.consultantId || duplicate?.consultantId || '';
    if (!consultantId) throw Object.assign(new Error('لا يوجد مستشار متاح حالياً للإسناد'), { status: 400 });

    const log = {
      id: randomUUID(),
      companyId,
      type: payload.type || 'Walk-in',
      name: payload.name,
      phone: payload.phone,
      email: payload.email || '',
      interest: payload.interest || '',
      source: payload.source,
      consultantId,
      branch,
      notes: payload.notes || '',
      status: duplicate ? 'Existing Lead' : 'Assigned',
      queueStatus: payload.type === 'Walk-in' ? 'waiting' : 'assigned',
      consultantNotified: false,
      notifiedAt: '',
      createdBy: req.user.name,
      createdAt: now()
    };

    db.receptionLogs.unshift(log);
    if (payload.createLead !== false) {
      if (!duplicate) {
        const lead = {
          id: randomUUID(),
          companyId,
          name: payload.name,
          phone: payload.phone,
          email: payload.email || '',
          country: payload.country || '',
          program: payload.interest || '',
          targetCountry: payload.country || '',
          targetMajor: payload.interest || '',
          budget: '',
          currentLevel: '',
          university: '',
          source: payload.source || payload.type || 'Walk-in Without Appointment',
          stage: 'Initial Inquiry',
          consultantId,
          priority: payload.priority || 'Medium',
          nextFollowUp: payload.nextFollowUp || '',
          lostReason: '',
          notes: payload.notes || '',
          createdAt: now(),
          updatedAt: now()
        };
        db.leads.unshift(lead);
        log.leadId = lead.id;
      } else {
        log.leadId = duplicate.id;
      }
    }

    activity(db, req.user, 'logged', 'reception', log.id, `${log.type}: ${log.name}`);
    return { ...log, autoAssigned: autoAssigned?.name || '' };
  });

  res.status(201).json(result);
});

app.post('/api/reception/:id/notify-consultant', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const result = await mutateDb(db => {
    const companyId = req.user.companyId;
    const log = findScoped(db.receptionLogs, companyId, item => item.id === req.params.id);
    if (!log) throw Object.assign(new Error('سجل الاستقبال غير موجود'), { status: 404 });
    if (!log.consultantId) throw Object.assign(new Error('لا يوجد مستشار مسند لهذا العميل'), { status: 400 });
    const consultantUser = findUserByEmployee(db, log.consultantId, companyId);
    if (!consultantUser) throw Object.assign(new Error('تعذر العثور على حساب المستشار'), { status: 404 });
    createUserNotification(
      db,
      companyId,
      consultantUser.id,
      'عميل بانتظارك في الاستقبال',
      `${log.name} بانتظارك خارج المكتب منذ ${log.createdAt}.`,
      { type: 'walk_in_queue', receptionLogId: log.id }
    );
    log.consultantNotified = true;
    log.notifiedAt = now();
    log.queueStatus = 'notified';
    activity(db, req.user, 'updated', 'reception', log.id, `تم إشعار المستشار بانتظار ${log.name}`);
    return log;
  });

  res.json(result);
});

app.get('/api/notifications', async (req, res) => {
  const db = await readDb();
  const notifications = getScopedItems(db.userNotifications || [], req.user.companyId)
    .filter(item => item.userId === req.user.sub)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 10);
  res.json(notifications);
});

app.post('/api/notifications/:id/read', async (req, res) => {
  const result = await mutateDb(db => {
    db.userNotifications ||= [];
    const notification = db.userNotifications.find(item => item.id === req.params.id && item.companyId === req.user.companyId && item.userId === req.user.sub);
    if (!notification) throw Object.assign(new Error('الإشعار غير موجود'), { status: 404 });
    notification.readAt = notification.readAt || now();
    return notification;
  });

  res.json(result);
});

app.get('/api/employees', async (_req, res) => {
  const db = await readDb();
  res.json(db.employees.map(employee => ({ ...employee, attendance: db.attendance.filter(item => item.employeeId === employee.id).slice(0, 10) })));
});

app.post('/api/employees', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const employee = {
      id: randomUUID(),
      companyId: req.user.companyId,
      name: req.body.name,
      email: req.body.email || '',
      phone: req.body.phone || '',
      department: req.body.department || 'Consultancy',
      title: req.body.title || '',
      status: 'Active',
      joinDate: req.body.joinDate || todayKey(),
      attendanceRate: 100,
      performance: Number(req.body.performance || 75),
      branch: req.body.branch || 'Cairo HQ',
      avatar: '',
      createdAt: now()
    };
    db.employees.unshift(employee);
    activity(db, req.user, 'created', 'employee', employee.id, `تمت إضافة الموظف ${employee.name}`);
    return employee;
  });

  res.status(201).json(result);
});

app.post('/api/attendance', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const employee = db.employees.find(item => item.id === req.body.employeeId);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });
    const record = {
      id: randomUUID(),
      employeeId: employee.id,
      date: req.body.date || todayKey(),
      checkIn: req.body.checkIn || '',
      checkOut: req.body.checkOut || '',
      status: req.body.status || 'Present',
      notes: req.body.notes || ''
    };
    db.attendance.unshift(record);
    const recent = db.attendance.filter(item => item.employeeId === employee.id).slice(0, 30);
    const present = recent.filter(item => ['Present', 'Remote'].includes(item.status)).length;
    employee.attendanceRate = recent.length ? Math.round((present / recent.length) * 100) : 100;
    activity(db, req.user, 'created', 'attendance', record.id, `${employee.name}: ${record.status}`);
    return record;
  });

  res.status(201).json(result);
});

app.get('/api/attendance', async (_req, res) => {
  const db = await readDb();
  res.json(db.attendance.map(item => ({ ...item, employee: db.employees.find(employee => employee.id === item.employeeId) || null })));
});

app.get('/api/hr', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const db = await readDb();
  const companyId = req.user.companyId;
  const targetRows = buildHrTargets(db, companyId);
  const payrollRows = buildPayrollRows(db, companyId);
  const visibleUsers = getScopedItems(db.users, companyId).filter(user => user.role !== 'admin');
  const employees = visibleUsers
    .map(user => {
      const employee = findScoped(
        db.employees,
        companyId,
        item => item.linkedUserId === user.id || item.email?.toLowerCase() === user.email?.toLowerCase()
      );
      if (!employee) return null;
      return {
        ...employee,
        linkedUserId: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        documents: employee.documents || [],
        targetSnapshot: targetRows.find(item => item.employeeId === employee.id) || null,
        payrollSnapshot: payrollRows.find(item => item.employeeId === employee.id) || null
      };
    })
    .filter(Boolean);
  const visibleEmployeeIds = new Set(employees.map(item => item.id));
  const attendance = getScopedItems(db.attendance, companyId).map(item => ({ ...item, employee: db.employees.find(employee => employee.id === item.employeeId) || null }));
  const leaveRequests = getScopedItems(db.leaveRequests || [], companyId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({
    employees,
    attendance,
    leaveRequests,
    targets: targetRows.filter(item => visibleEmployeeIds.has(item.employeeId)),
    payroll: payrollRows.filter(item => visibleEmployeeIds.has(item.employeeId))
  });
});

app.post('/api/hr/leave-requests', async (req, res) => {
  const result = await mutateDb(db => {
    const companyId = req.user.companyId;
    const employeeId = req.body.employeeId || findScoped(db.employees, companyId, item => item.email?.toLowerCase() === req.user.email?.toLowerCase())?.id;
    const employee = findScoped(db.employees, companyId, item => item.id === employeeId);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });
    const startDate = String(req.body.startDate || '').slice(0, 10);
    const endDate = String(req.body.endDate || '').slice(0, 10);
    const days = workingDaysBetween(startDate, endDate);
    if (!startDate || !endDate || days <= 0) throw Object.assign(new Error('بيانات الإجازة غير مكتملة'), { status: 400 });
    const request = {
      id: randomUUID(),
      companyId,
      employeeId: employee.id,
      employeeName: employee.name,
      leaveType: req.body.leaveType || 'Annual Leave',
      startDate,
      endDate,
      days,
      reason: req.body.reason || '',
      status: 'Pending',
      createdAt: now(),
      createdBy: req.user.name
    };
    db.leaveRequests.unshift(request);
    activity(db, req.user, 'created', 'leave-request', request.id, `تم تقديم طلب إجازة للموظف ${employee.name}`);
    return request;
  });

  res.status(201).json(result);
});

app.patch('/api/hr/leave-requests/:id', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const companyId = req.user.companyId;
    const request = findScoped(db.leaveRequests || [], companyId, item => item.id === req.params.id);
    if (!request) throw Object.assign(new Error('طلب الإجازة غير موجود'), { status: 404 });
    const employee = findScoped(db.employees, companyId, item => item.id === request.employeeId);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });
    const nextStatus = req.body.status === 'Rejected' ? 'Rejected' : 'Approved';
    if (request.status !== 'Pending') throw Object.assign(new Error('تمت معالجة هذا الطلب بالفعل'), { status: 409 });
    request.status = nextStatus;
    request.reviewedAt = now();
    request.reviewedBy = req.user.name;
    request.hrNote = req.body.hrNote || '';
    if (nextStatus === 'Approved' && request.leaveType === 'Annual Leave') {
      employee.annualLeaveBalance = Math.max(0, Number(employee.annualLeaveBalance || 0) - Number(request.days || 0));
    }
    activity(db, req.user, 'updated', 'leave-request', request.id, `تم ${nextStatus === 'Approved' ? 'اعتماد' : 'رفض'} طلب إجازة ${employee.name}`);
    return request;
  });

  res.json(result);
});

app.patch('/api/hr/employees/:id', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const employee = findScoped(db.employees, req.user.companyId, item => item.id === req.params.id);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });
    const payload = req.body || {};
    employee.monthlyTarget = Number(payload.monthlyTarget ?? employee.monthlyTarget ?? 0);
    employee.commissionPerContract = Number(payload.commissionPerContract ?? employee.commissionPerContract ?? 0);
    employee.basicSalary = Number(payload.basicSalary ?? employee.basicSalary ?? 0);
    employee.currentBonus = Number(payload.currentBonus ?? employee.currentBonus ?? 0);
    employee.currentDeductions = Number(payload.currentDeductions ?? employee.currentDeductions ?? 0);
    employee.currentAdvances = Number(payload.currentAdvances ?? employee.currentAdvances ?? 0);
    employee.annualLeaveBalance = Number(payload.annualLeaveBalance ?? employee.annualLeaveBalance ?? 21);
    activity(db, req.user, 'updated', 'employee-hr', employee.id, `تم تحديث بيانات HR للموظف ${employee.name}`);
    return employee;
  });

  res.json(result);
});

app.patch('/api/hr/employees/:id/lifecycle', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const employee = findScoped(db.employees, req.user.companyId, item => item.id === req.params.id);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });

    const action = String(req.body.action || '').trim().toLowerCase();
    if (!['terminate', 'reactivate'].includes(action)) {
      throw Object.assign(new Error('إجراء غير صالح'), { status: 400 });
    }

    if (action === 'terminate') {
      employee.status = 'Terminated';
      employee.terminatedAt = now();
      employee.terminatedBy = req.user.name;
      employee.liveStatus = 'offline';
      const linkedUser = findScoped(db.users, req.user.companyId, item => item.id === employee.linkedUserId || item.email?.toLowerCase() === employee.email?.toLowerCase());
      if (linkedUser && linkedUser.role !== 'admin') linkedUser.isActive = false;
      activity(db, req.user, 'updated', 'employee-lifecycle', employee.id, `تم إنهاء خدمة الموظف ${employee.name}`);
    } else {
      employee.status = 'Active';
      employee.reactivatedAt = now();
      employee.reactivatedBy = req.user.name;
      employee.liveStatus ||= 'available';
      const linkedUser = findScoped(db.users, req.user.companyId, item => item.id === employee.linkedUserId || item.email?.toLowerCase() === employee.email?.toLowerCase());
      if (linkedUser && linkedUser.role !== 'admin') linkedUser.isActive = true;
      activity(db, req.user, 'updated', 'employee-lifecycle', employee.id, `تمت إعادة تفعيل الموظف ${employee.name}`);
    }

    return employee;
  });

  res.json(result);
});

app.delete('/api/hr/employees/:id', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(async db => {
    const companyId = req.user.companyId;
    const employeeIndex = db.employees.findIndex(item => item.id === req.params.id && item.companyId === companyId);
    if (employeeIndex === -1) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });

    const [employee] = db.employees.splice(employeeIndex, 1);
    db.users = (db.users || []).filter(
      item => !(item.companyId === companyId && item.role !== 'admin' && (item.id === employee.linkedUserId || item.email?.toLowerCase() === employee.email?.toLowerCase()))
    );

    for (const document of employee.documents || []) {
      await removeUploadedFile(document);
    }

    db.attendance = (db.attendance || []).filter(item => !(item.employeeId === employee.id && item.companyId === companyId));
    db.leaveRequests = (db.leaveRequests || []).filter(item => !(item.employeeId === employee.id && item.companyId === companyId));

    for (const student of getScopedItems(db.students, companyId)) {
      if (student.consultantId === employee.id) student.consultantId = '';
    }

    for (const lead of getScopedItems(db.leads, companyId)) {
      if (lead.consultantId === employee.id) lead.consultantId = '';
    }

    activity(db, req.user, 'deleted', 'employee', employee.id, `تم حذف الموظف ${employee.name} نهائياً`);
    return { ok: true };
  });

  res.json(result);
});

app.post('/api/hr/employees/:id/documents', allowRoles('admin', 'management', 'hr'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'الملف مطلوب' });
  const storedFile = await storeUploadedFile(req.file, { folder: 'employees' });
  const result = await mutateDb(db => {
    const employee = findScoped(db.employees, req.user.companyId, item => item.id === req.params.id);
    if (!employee) throw Object.assign(new Error('الموظف غير موجود'), { status: 404 });
    employee.documents ||= [];
    const document = {
      id: randomUUID(),
      type: req.body.type || 'Employee Document',
      originalName: req.file.originalname,
      fileName: storedFile.fileName,
      url: storedFile.url,
      size: storedFile.size,
      storageProvider: storedFile.storageProvider,
      uploadedBy: req.user.name,
      uploadedAt: now()
    };
    employee.documents.unshift(document);
    activity(db, req.user, 'uploaded', 'employee-document', document.id, `تم رفع ${document.type} للموظف ${employee.name}`);
    return document;
  });

  res.status(201).json(result);
});

app.get('/api/invoices', async (req, res) => {
  const db = await readDb();
  res.json(getScopedItems(db.invoices, req.user.companyId).map(invoice => enrichInvoice(db, invoice)));
});

app.post('/api/invoices', allowRoles('admin', 'management', 'finance'), async (req, res) => {
  const result = await mutateDb(db => {
    const student = db.students.find(item => item.id === req.body.studentId);
    if (!student) throw Object.assign(new Error('الطالب مطلوب'), { status: 400 });
    const currency = sanitizeCurrency(req.body.currency);
    const serviceFee = money(req.body.serviceFee ?? req.body.commission);
    const universityFee = money(req.body.universityFee ?? req.body.subtotal);
    const visaFee = money(req.body.visaFee);
    const tax = money(req.body.tax);
    const total = money(req.body.total || (serviceFee + universityFee + visaFee + tax));
    const installments = sanitizeInstallments(req.body.installments);
    const invoice = {
      id: randomUUID(),
      number: nextSerial('INV', db.invoices),
      studentId: student.id,
      description: req.body.description || 'Educational consultancy services',
      paymentStatement: req.body.paymentStatement || req.body.description || 'Student payment',
      currency,
      exchangeRate: money(req.body.exchangeRate) || 1,
      serviceFee,
      universityFee,
      visaFee,
      subtotal: universityFee,
      tax,
      total,
      commission: serviceFee,
      passThroughFees: universityFee + visaFee,
      dueDate: installments.at(-1)?.dueDate || req.body.dueDate || '',
      status: 'Unpaid',
      notes: req.body.notes || '',
      locked: false,
      installments,
      createdAt: now()
    };
    db.invoices.unshift(invoice);
    activity(db, req.user, 'created', 'invoice', invoice.id, `تم إنشاء الفاتورة ${invoice.number} للطالب ${student.name}`);
    return enrichInvoice(db, invoice);
  });

  res.status(201).json(result);
});

app.post('/api/invoices/:id/payments', allowRoles('admin', 'management', 'finance'), upload.single('attachment'), async (req, res) => {
  const attachment = req.file ? await storeUploadedFile(req.file, { folder: 'receipts' }) : null;
  const result = await mutateDb(db => {
    const invoice = db.invoices.find(item => item.id === req.params.id);
    if (!invoice) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });
    const before = enrichInvoice(db, invoice);
    const amount = money(req.body.amount);
    if (amount <= 0) throw Object.assign(new Error('المبلغ مطلوب'), { status: 400 });
    if (amount > before.balance) throw Object.assign(new Error('مبلغ الدفعة أكبر من المتبقي على الفاتورة'), { status: 400 });
    const installmentId = req.body.installmentId || '';
    const currency = sanitizeCurrency(req.body.currency || invoice.currency);
    const student = db.students.find(item => item.id === invoice.studentId) || null;
    const application = db.applications.find(item => item.studentId === invoice.studentId) || null;
    const consultant = student?.consultantId ? db.employees.find(item => item.id === student.consultantId) || null : null;
    const payment = {
      id: randomUUID(),
      invoiceId: invoice.id,
      installmentId,
      receiptNumber: nextSerial('REC', db.payments),
      amount,
      currency,
      exchangeRate: money(req.body.exchangeRate) || money(invoice.exchangeRate) || 1,
      amountInWords: amountInWords(amount, currency),
      method: sanitizePaymentMethod(req.body.method),
      reference: req.body.reference || '',
      date: req.body.date || todayKey(),
      statement: req.body.statement || invoice.paymentStatement || invoice.description,
      notes: req.body.notes || '',
      attachment: attachment
        ? {
            ...attachment,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            uploadedAt: now(),
            uploadedBy: req.user.name
          }
        : null,
      studentSnapshot: student
        ? {
            name: student.name,
            phone: student.phone || '',
            referenceCode: student.id,
            targetCountry: application?.country || '',
            targetMajor: application?.program || '',
            consultantName: consultant?.name || ''
          }
        : null,
      receivedBy: req.user.name,
      locked: true,
      lockedAt: now(),
      createdAt: now()
    };
    if (payment.amount <= 0) throw Object.assign(new Error('يجب أن يكون مبلغ الدفعة أكبر من صفر'), { status: 400 });
    if (installmentId) {
      const installment = sanitizeInstallments(invoice.installments).find(item => item.id === installmentId);
      if (!installment) throw Object.assign(new Error('القسط المحدد غير موجود'), { status: 400 });
      const installmentPaid = getScopedItems(db.payments, req.user.companyId)
        .filter(item => item.invoiceId === invoice.id && item.installmentId === installmentId)
        .reduce((sum, item) => sum + money(item.amount), 0);
      if (amount > money(installment.amount) - installmentPaid) {
        throw Object.assign(new Error('مبلغ الدفعة أكبر من رصيد القسط'), { status: 400 });
      }
    }
    db.payments.unshift(payment);
    const after = enrichInvoice(db, invoice);
    invoice.status = after.paid >= money(invoice.total) ? 'Paid' : 'Partial';
    invoice.locked = after.computedStatus === 'Paid';
    invoice.installments = after.installments.map(installment => ({
      id: installment.id,
      label: installment.label,
      dueDate: installment.dueDate,
      amount: installment.amount,
      status: installment.status,
      paidAmount: installment.paidAmount,
      createdAt: installment.createdAt
    }));
    activity(db, req.user, 'created', 'payment', payment.id, `تم تسجيل دفعة على الفاتورة ${invoice.number} بقيمة ${payment.amount} ${invoice.currency}`);
    return {
      ...payment,
      financialSummary: {
        invoiceNumber: invoice.number,
        totalDue: after.total,
        totalPaid: after.paid,
        remainingBalance: after.balance
      }
    };
  });

  res.status(201).json(result);
});

app.delete('/api/invoices/:id', allowRoles('admin', 'management', 'finance'), async (req, res) => {
  const result = await mutateDb(async db => {
    const invoiceIndex = db.invoices.findIndex(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (invoiceIndex === -1) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });

    const [invoice] = db.invoices.splice(invoiceIndex, 1);
    const removedPayments = db.payments.filter(item => item.invoiceId === invoice.id && item.companyId === req.user.companyId);
    db.payments = db.payments.filter(item => !(item.invoiceId === invoice.id && item.companyId === req.user.companyId));

    for (const payment of removedPayments) {
      if (payment.attachment) await removeUploadedFile(payment.attachment);
    }

    activity(db, req.user, 'deleted', 'invoice', invoice.id, `تم حذف الفاتورة ${invoice.number} مع ${removedPayments.length} دفعة مرتبطة بها`);
    return { ok: true };
  });

  res.json(result);
});

app.patch('/api/payments/:id', allowRoles('admin', 'management'), async (req, res) => {
  const result = await mutateDb(db => {
    const payment = db.payments.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!payment) throw Object.assign(new Error('السند غير موجود'), { status: 404 });
    if (typeof req.body.notes === 'string') payment.notes = req.body.notes;
    if (typeof req.body.reference === 'string') payment.reference = req.body.reference;
    payment.adminUpdatedAt = now();
    payment.adminUpdatedBy = req.user.name;
    activity(db, req.user, 'updated', 'payment', payment.id, `تم تحديث سند القبض ${payment.receiptNumber}`);
    return payment;
  });

  res.json(result);
});

app.delete('/api/payments/:id', allowRoles('admin', 'management'), async (req, res) => {
  const result = await mutateDb(async db => {
    const index = db.payments.findIndex(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (index === -1) throw Object.assign(new Error('السند غير موجود'), { status: 404 });
    const [payment] = db.payments.splice(index, 1);
    if (payment.attachment) await removeUploadedFile(payment.attachment);
    const invoice = db.invoices.find(item => item.id === payment.invoiceId);
    if (invoice) {
      const after = enrichInvoice(db, invoice);
      invoice.status = after.computedStatus === 'Paid' ? 'Paid' : after.paid > 0 ? 'Partial' : 'Unpaid';
      invoice.locked = false;
      invoice.installments = after.installments.map(installment => ({
        id: installment.id,
        label: installment.label,
        dueDate: installment.dueDate,
        amount: installment.amount,
        status: installment.status,
        paidAmount: installment.paidAmount,
        createdAt: installment.createdAt
      }));
    }
    activity(db, req.user, 'deleted', 'payment', payment.id, `تم إلغاء سند القبض ${payment.receiptNumber}`);
    return { ok: true };
  });

  res.json(result);
});

app.get('/api/activities', async (req, res) => {
  const db = await readDb();
  res.json(getScopedItems(db.activities, req.user.companyId).slice(0, 200));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
  res.status(err.status || 500).json({ message: err.message || 'حدث خطأ غير متوقع في الخادم' });
});

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(clientDist, 'index.html'));
    next();
  });
}

if (!isVercelRuntime) {
  app.listen(port, () => console.log(`EduGlobal CRM API running on http://localhost:${port}`));
}

export default app;
