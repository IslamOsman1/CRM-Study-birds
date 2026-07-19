import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, '..', 'data', 'db.json');
const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const supabaseDbTable = String(process.env.SUPABASE_DB_TABLE || 'app_state').trim() || 'app_state';
const supabaseDbRowId = String(process.env.SUPABASE_DB_ROW_ID || 'default').trim() || 'default';
const supabaseDbSchema = String(process.env.SUPABASE_DB_SCHEMA || 'public').trim() || 'public';
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
let queue = Promise.resolve();

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return raw.replace(/\/rest\/v1$/i, '');
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    'Content-Type': 'application/json',
    'Accept-Profile': supabaseDbSchema,
    'Content-Profile': supabaseDbSchema,
    ...extra
  };
}

function supabaseDbEndpoint(query = '') {
  return `${supabaseUrl}/rest/v1/${supabaseDbTable}${query}`;
}

async function readFileDb() {
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw);
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

async function writeFileDb(data) {
  const temp = `${dataFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, dataFile);
  return data;
}

async function readSupabaseDb() {
  const response = await fetch(
    supabaseDbEndpoint(`?id=eq.${encodeURIComponent(supabaseDbRowId)}&select=payload`),
    { headers: supabaseHeaders() }
  );

  if (!response.ok) {
    throw new Error(await buildSupabaseErrorMessage('read', response));
  }

  const rows = await response.json();
  if (isValidAppDbShape(rows[0]?.payload)) return rows[0].payload;

  try {
    const seeded = await readFileDb();
    await writeSupabaseDb(seeded);
    return seeded;
  } catch {
    const empty = {};
    await writeSupabaseDb(empty);
    return empty;
  }
}

async function writeSupabaseDb(data) {
  const response = await fetch(
    supabaseDbEndpoint('?on_conflict=id'),
    {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }),
      body: JSON.stringify({
        id: supabaseDbRowId,
        payload: data
      })
    }
  );

  if (!response.ok) {
    throw new Error(await buildSupabaseErrorMessage('write', response));
  }

  return data;
}

async function buildSupabaseErrorMessage(action, response) {
  let details = '';

  try {
    const payload = await response.json();
    details = payload?.message || payload?.error_description || payload?.hint || '';
  } catch {
    details = '';
  }

  if (response.status === 404) {
    const endpoint = supabaseDbEndpoint();
    return `Supabase ${action} failed: 404 Not Found. Check SUPABASE_URL (${supabaseUrl}) and ensure table ${supabaseDbSchema}.${supabaseDbTable} exists. If you pasted a URL ending with /rest/v1, it is supported now, but the base project URL is preferred. Endpoint: ${endpoint}${details ? ` | ${details}` : ''}`;
  }

  return `Supabase ${action} failed: ${response.status} ${response.statusText}${details ? ` | ${details}` : ''}`;
}

export async function readDb() {
  return useSupabase ? readSupabaseDb() : readFileDb();
}

export async function writeDb(data) {
  return useSupabase ? writeSupabaseDb(data) : writeFileDb(data);
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
