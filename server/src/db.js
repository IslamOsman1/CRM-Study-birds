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

async function readMongoDb() {
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
    return payload;
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
