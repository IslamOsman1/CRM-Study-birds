import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, '..', 'data', 'db.json');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const supabaseDbTable = String(process.env.SUPABASE_DB_TABLE || 'app_state').trim() || 'app_state';
const supabaseDbRowId = String(process.env.SUPABASE_DB_ROW_ID || 'default').trim() || 'default';
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
let queue = Promise.resolve();

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    'Content-Type': 'application/json',
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
    throw new Error(`Supabase read failed: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json();
  if (rows[0]?.payload) return rows[0].payload;

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
    throw new Error(`Supabase write failed: ${response.status} ${response.statusText}`);
  }

  return data;
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
