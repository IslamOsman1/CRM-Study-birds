# Vercel + Supabase Deployment

هذا المشروع أصبح جاهزًا للعمل بالنمط التالي:

- الواجهة الأمامية على `Vercel`
- الـ API عبر `Express` داخل `Vercel Function`
- قاعدة البيانات على `Supabase` عبر جدول JSON مركزي
- رفع المستندات إلى `Supabase Storage` عند تفعيل متغيرات Supabase

## 1. إنشاء جدول قاعدة البيانات في Supabase

نفّذ SQL التالي داخل `Supabase SQL Editor`:

```sql
create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb
);
```

إذا غيّرت اسم الجدول، غيّر معه `SUPABASE_DB_TABLE`.

## 2. إنشاء Bucket للمستندات

أنشئ bucket باسم:

```text
crm-files
```

أو استخدم اسمًا مختلفًا ثم حدّث `SUPABASE_STORAGE_BUCKET`.

يفضّل أن يكون bucket `public` حتى تعمل روابط المستندات الحالية مباشرة.

## 3. متغيرات البيئة في Vercel

أضف القيم التالية داخل مشروع Vercel:

```text
JWT_SECRET
TOKEN_ENCRYPTION_KEY
CLIENT_ORIGIN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_TABLE
SUPABASE_DB_ROW_ID
SUPABASE_STORAGE_BUCKET
META_APP_ID
META_APP_SECRET
META_CONFIG_ID
META_VERIFY_TOKEN
META_GRAPH_API_VERSION
META_REDIRECT_URI
META_WEBHOOK_URL
```

### قيم مهمة للإنتاج

```text
CLIENT_ORIGIN=https://your-project.vercel.app
SUPABASE_DB_TABLE=app_state
SUPABASE_DB_ROW_ID=default
SUPABASE_STORAGE_BUCKET=crm-files
META_REDIRECT_URI=https://your-project.vercel.app/api/integrations/meta/oauth/callback
META_WEBHOOK_URL=https://your-project.vercel.app/api/integrations/meta/webhook
```

### للواجهة الأمامية

في Vercel لا تحتاج غالبًا إلى `VITE_API_URL` لأن الواجهة والـ API على نفس الدومين.

اتركها فارغة:

```text
VITE_API_URL=
```

## 4. رفع المشروع على Vercel

من جذر المشروع:

```bash
npx vercel
```

وللإنتاج:

```bash
npx vercel --prod
```

الملفات المضافة للتشغيل:

- `vercel.json`
- `api/index.js`

## 5. ملاحظات تشغيلية

- في التطوير المحلي يبقى المشروع قادرًا على استخدام `server/data/db.json` عند غياب متغيرات Supabase.
- عند تفعيل `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` ينتقل التخزين إلى Supabase تلقائيًا.
- المستندات الجديدة تُرفع إلى `Supabase Storage` عند تفعيل `SUPABASE_STORAGE_BUCKET`.
- الروابط القديمة المحلية داخل `server/uploads` ستظل محلية، لذلك يفضّل رفع مستندات جديدة بعد الانتقال للإنتاج أو تنفيذ migration لاحقًا إن لزم.
