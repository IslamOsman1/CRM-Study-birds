import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mongoUri = String(process.env.MONGODB_URI || '').trim();
const mongoDbName = String(process.env.MONGODB_DB_NAME || 'eduglobal_crm').trim() || 'eduglobal_crm';
const mongoCollectionName = String(process.env.MONGODB_COLLECTION || 'app_state').trim() || 'app_state';
const mongoDocumentId = String(process.env.MONGODB_DOCUMENT_ID || 'default').trim() || 'default';
const unifiedCatalogImportFile = path.join(__dirname, '..', 'data', 'imports', 'easy-apply-unified-catalog-2026-08-02.json');

if (!mongoUri) {
  throw new Error('MONGODB_URI is required. The server now supports MongoDB only.');
}

let queue = Promise.resolve();
let mongoClient;
let mongoCollectionPromise;
let dbCache;
let dbCacheExpiresAt = 0;
const dbCacheTtlMs = Math.max(1_000, Number(process.env.DB_CACHE_TTL_MS || 30_000));
const readModelCollections = new Set([
  'leads',
  'students',
  'conversations',
  'applications',
  'invoices',
  'payments',
  'messages',
  'connectedChannels'
]);
let readModelsReady = false;
let readModelSnapshots = new Map();

function createEmptyDb() {
  return {
    activities: [],
    applications: [],
    attendance: [],
    broadcasts: [],
    callSchedules: [],
    companies: [],
    connectedChannels: [],
    contactChannelIdentities: [],
    conversations: [],
    dailyReports: [],
    educationCatalog: {
      universities: [],
      programs: [],
      scholarships: []
    },
    employees: [],
    executiveActions: [],
    integrationAuditLogs: [],
    invoices: [],
    leads: [],
    leaveRequests: [],
    messages: [],
    metaIntegrations: [],
    metaPendingSessions: [],
    monthlyRevenue: [],
    oauthStates: [],
    payments: [],
    receptionLogs: [],
    receptionState: {},
    reminders: [],
    responseScripts: [],
    settings: {},
    students: [],
    tasks: [],
    userNotifications: [],
    users: [],
    webhookEvents: [],
    whatsAppTemplates: []
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidAppDbShape(value) {
  return isPlainObject(value)
    && Array.isArray(value.users)
    && Array.isArray(value.leads)
    && Array.isArray(value.students)
    && Array.isArray(value.applications)
    && isPlainObject(value.settings);
}

function hasEducationCatalogEntries(value) {
  return Boolean(value)
    && (Array.isArray(value.universities) && value.universities.length > 0
      || Array.isArray(value.programs) && value.programs.length > 0
      || Array.isArray(value.scholarships) && value.scholarships.length > 0);
}

async function readUnifiedCatalogImport() {
  const raw = await fs.readFile(unifiedCatalogImportFile, 'utf8');
  const imported = JSON.parse(raw);
  return {
    universities: Array.isArray(imported.universities) ? imported.universities : [],
    programs: Array.isArray(imported.programs) ? imported.programs : [],
    scholarships: Array.isArray(imported.scholarships) ? imported.scholarships : []
  };
}

async function getMongoCollection() {
  if (!mongoCollectionPromise) {
    mongoClient = new MongoClient(mongoUri);
    mongoCollectionPromise = mongoClient.connect()
      .then(client => client.db(mongoDbName).collection(mongoCollectionName));
  }

  return mongoCollectionPromise;
}

export async function getMongoDbHandle() {
  if (!mongoClient) await getMongoCollection();
  return mongoClient.db(mongoDbName);
}

async function syncReadModel(db, name, rows) {
  const collection = db.collection(`read_${name}`);
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const ids = normalizedRows.map(row => row.id).filter(Boolean);

  if (ids.length) {
    await collection.bulkWrite(normalizedRows.map(row => ({
      replaceOne: {
        filter: { id: row.id },
        replacement: row,
        upsert: true
      }
    })), { ordered: false });
    await collection.deleteMany({ id: { $nin: ids } });
  } else {
    await collection.deleteMany({});
  }

  readModelSnapshots.set(name, JSON.stringify(normalizedRows));
}

async function ensureReadModels(data) {
  const db = await getMongoDbHandle();

  for (const name of readModelCollections) {
    const collection = db.collection(`read_${name}`);
    await collection.createIndex({ companyId: 1, updatedAt: -1 });
    await collection.createIndex({ companyId: 1, createdAt: -1 });
    await collection.createIndex({ companyId: 1, id: 1 }, { unique: true });
  }

  await db.collection('read_conversations').createIndex({ companyId: 1, lastMessageAt: -1 });
  await db.collection('read_conversations').createIndex({ companyId: 1, status: 1, assignedUserId: 1, priority: 1, lastMessageAt: -1 });
  await db.collection('read_students').createIndex({ companyId: 1, name: 1 });
  await db.collection('read_leads').createIndex({ companyId: 1, name: 1 });
  await db.collection('read_applications').createIndex({ companyId: 1, studentId: 1 });
  await db.collection('read_invoices').createIndex({ companyId: 1, studentId: 1 });
  await db.collection('read_payments').createIndex({ companyId: 1, invoiceId: 1 });
  await db.collection('read_messages').createIndex({ companyId: 1, conversationId: 1, createdAt: -1 });

  for (const name of readModelCollections) {
    await syncReadModel(db, name, data[name]);
  }
  readModelsReady = true;
}

async function syncChangedReadModels(data) {
  if (!readModelsReady) return ensureReadModels(data);

  const db = await getMongoDbHandle();
  for (const name of readModelCollections) {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    const snapshot = JSON.stringify(rows);
    if (snapshot !== readModelSnapshots.get(name)) {
      await syncReadModel(db, name, rows);
    }
  }
}

export async function getReadModelCollection(name) {
  if (!readModelCollections.has(name)) throw new Error(`Unsupported read model: ${name}`);
  if (!readModelsReady) {
    const data = await readMongoDb();
    await ensureReadModels(data);
  }
  return (await getMongoDbHandle()).collection(`read_${name}`);
}

async function readMongoDb() {
  if (dbCache && Date.now() < dbCacheExpiresAt) return dbCache;

  const collection = await getMongoCollection();
  const record = await collection.findOne({ _id: mongoDocumentId });

  if (isValidAppDbShape(record?.payload)) {
    const payload = record.payload;
    if (!hasEducationCatalogEntries(payload.educationCatalog)) {
      try {
        payload.educationCatalog = await readUnifiedCatalogImport();
        await writeMongoDb(payload);
      } catch {
        payload.educationCatalog ||= { universities: [], programs: [], scholarships: [] };
      }
    }
    dbCache = payload;
    dbCacheExpiresAt = Date.now() + dbCacheTtlMs;
    return dbCache;
  }

  const empty = createEmptyDb();
  try {
    empty.educationCatalog = await readUnifiedCatalogImport();
  } catch {
    // Keep the empty catalog shape if the import file is not available.
  }
  await writeMongoDb(empty);
  return empty;
}

async function writeMongoDb(data) {
  const collection = await getMongoCollection();

  await collection.updateOne(
    { _id: mongoDocumentId },
    {
      $set: {
        payload: data,
        updatedAt: new Date().toISOString()
      }
    },
    { upsert: true }
  );

  // Keep the high-traffic entities queryable without changing legacy writers at once.
  await syncChangedReadModels(data);

  dbCache = data;
  dbCacheExpiresAt = Date.now() + dbCacheTtlMs;

  return data;
}

export async function readDb() {
  return readMongoDb();
}

export async function writeDb(data) {
  return writeMongoDb(data);
}

export function mutateDb(mutator) {
  queue = queue.then(async () => {
    const data = await readDb();
    const result = await mutator(data);
    await writeDb(data);
    return result;
  });
  return queue;
}

export function isMongoDbEnabled() {
  return true;
}
