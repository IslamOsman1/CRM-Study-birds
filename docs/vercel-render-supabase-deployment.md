# Vercel Frontend + Render Backend + Supabase

هذا هو توزيع النشر المقترح للمشروع:

- `Frontend` على `Vercel`
- `Backend API` على `Render`
- `Database` على `Supabase`
- `File Storage` على `Supabase Storage`

## 1. Supabase

يوجد ملف جاهز للتنفيذ داخل المشروع: [supabase/bootstrap.sql](/D:/international-educational/eduglobal-crm/supabase/bootstrap.sql)

نفّذه مرة واحدة من داخل `Supabase SQL Editor`، وهو يقوم بـ:

- إنشاء جدول `public.app_state`
- إنشاء السجل الافتراضي `default`
- إنشاء bucket عام باسم `crm-files`
- ضبط حد رفع 12MB وأنواع الملفات الأساسية
- منح `service_role` صلاحيات REST اللازمة على `public.app_state`

إذا رغبت بالتنفيذ اليدوي فقط، فهذا الحد الأدنى:

```sql
create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb
);
```

أنشئ bucket عام للمستندات:

```text
crm-files
```

## 2. Backend على Render

يوجد ملف [render.yaml](/D:/international-educational/eduglobal-crm/render.yaml) جاهز.

عند إنشاء خدمة Render:

- النوع: `Web Service`
- الجذر: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

وفقًا لتوثيق Render، خدمة Node/Express تحتاج فقط أوامر build/start مناسبة عند إنشاء `Web Service`، ويمكن أيضًا تعريفها في `render.yaml`. كما أن ملفات `render.yaml` تكون في جذر المستودع. المصادر:
- Render Node/Express deploy: https://render.com/docs/deploy-node-express-app
- Render Blueprint/render.yaml: https://render.com/docs/blueprint-spec

### Environment Variables على Render

أضف هذه القيم:

```text
JWT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
CLIENT_ORIGIN=https://your-frontend.vercel.app
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_SCHEMA=public
SUPABASE_DB_TABLE=app_state
SUPABASE_DB_ROW_ID=default
SUPABASE_STORAGE_BUCKET=crm-files
META_APP_ID=...
META_APP_SECRET=...
META_CONFIG_ID=...
META_VERIFY_TOKEN=...
META_GRAPH_API_VERSION=v22.0
META_REDIRECT_URI=https://your-render-backend.onrender.com/api/integrations/meta/oauth/callback
META_WEBHOOK_URL=https://your-render-backend.onrender.com/api/integrations/meta/webhook
```

مهم: استخدم رابط المشروع الأساسي في `SUPABASE_URL` مثل `https://your-project-ref.supabase.co` وليس رابط `.../rest/v1` إن أمكن. وإذا كان الجدول داخل schema مخصص، غيّر `SUPABASE_DB_SCHEMA` بدل `public`.
إذا كنت قد نفذت نسخة أقدم من ملف SQL قبل 19 يوليو 2026، أعد تنفيذ الملف الحالي مرة أخرى حتى تُطبَّق أوامر `grant` الجديدة.

Render يوفّر متغيرات بيئة افتراضية مثل `RENDER=true` تلقائيًا. المصدر:
- https://render.com/docs/environment-variables

ملاحظة مهمة: نظام الملفات على Render افتراضيًا `ephemeral`، لذلك لا تعتمد على تخزين الملفات محليًا. المشروع الآن يدعم التخزين على `Supabase Storage` عند تعبئة متغيرات Supabase. المصدر:
- https://render.com/docs/disks

## 3. Frontend على Vercel

ملف [vercel.json](/D:/international-educational/eduglobal-crm/vercel.json) أصبح مخصصًا للواجهة فقط.
ويوجد أيضًا ملف [client/vercel.json](/D:/international-educational/eduglobal-crm/client/vercel.json) لحالة كون `Root Directory` في Vercel مضبوطًا على `client`.

أفضل إعدادين صالحين:

- إما `Root Directory` = جذر المشروع مع `buildCommand` من [vercel.json](/D:/international-educational/eduglobal-crm/vercel.json)
- أو `Root Directory` = `client` وسيستخدم Vercel ملف [client/vercel.json](/D:/international-educational/eduglobal-crm/client/vercel.json)

أضف في Vercel:

```text
VITE_API_URL=https://your-render-backend.onrender.com
```

ويوجد المثال داخل [client/.env.example](/D:/international-educational/eduglobal-crm/client/.env.example).

## 4. Meta OAuth / Webhook

بعد النشر النهائي:

- `CLIENT_ORIGIN` يجب أن يكون رابط Vercel الفعلي
- `META_REDIRECT_URI` يجب أن يكون رابط Render الفعلي
- `META_WEBHOOK_URL` يجب أن يكون رابط Render الفعلي

إذا تغيّر أي دومين، عدّل هذه القيم داخل Render ثم أعد النشر.

## 5. ملاحظات عملية

- التطوير المحلي ما زال يعمل باستخدام `server/data/db.json` عند غياب متغيرات Supabase
- الإنتاج ينتقل تلقائيًا إلى Supabase عند وجود `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY`
- واجهة Vercel الآن منفصلة عن الـ API، لذلك أي طلبات من الفرونت ستذهب إلى `VITE_API_URL`
