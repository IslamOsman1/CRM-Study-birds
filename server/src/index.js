import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readDb, mutateDb } from './db.js';
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
const todayKey = '2026-07-17';
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const supabaseStorageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || '').trim();
const useSupabaseStorage = Boolean(supabaseUrl && supabaseServiceRoleKey && supabaseStorageBucket);

fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const now = () => new Date().toISOString();
const money = value => Number(value || 0);
const defaultCompanyId = 'company-default';

function safeUploadName(originalName) {
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${String(originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function supabaseStorageHeaders(contentType) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    'Content-Type': contentType || 'application/octet-stream',
    'x-upsert': 'true'
  };
}

async function storeUploadedFile(file) {
  const fileName = safeUploadName(file.originalname);

  if (useSupabaseStorage) {
    const objectPath = `documents/${fileName}`;
    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${supabaseStorageBucket}/${objectPath}`,
      {
        method: 'POST',
        headers: supabaseStorageHeaders(file.mimetype),
        body: file.buffer
      }
    );

    if (!uploadResponse.ok) {
      throw Object.assign(new Error('فشل رفع الملف إلى Supabase Storage'), { status: 500 });
    }

    return {
      fileName: objectPath,
      url: `${supabaseUrl}/storage/v1/object/public/${supabaseStorageBucket}/${objectPath}`,
      size: file.size,
      storageProvider: 'supabase'
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
  if (!document?.fileName) return;

  if (document.storageProvider === 'supabase' || (useSupabaseStorage && document.fileName.includes('/'))) {
    await fetch(
      `${supabaseUrl}/storage/v1/object/${supabaseStorageBucket}`,
      {
        method: 'DELETE',
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [document.fileName] })
      }
    ).catch(() => null);
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
    ...documentState,
    ...workflowState
  };
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
    university: '',
    source: normalizedMessage.channelType === 'facebook' ? 'Facebook' : normalizedMessage.channelType === 'instagram' ? 'Instagram' : 'WhatsApp',
    stage: 'Initial Inquiry',
    consultantId: '',
    priority: 'Medium',
    nextFollowUp: '',
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
  if (duplicate) return duplicate;

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

function buildAutomaticTasks(db, companyId) {
  const leads = getScopedItems(db.leads, companyId);
  const applications = getScopedItems(db.applications, companyId);
  const invoices = getScopedItems(db.invoices, companyId);
  const students = getScopedItems(db.students, companyId);

  const leadTasks = leads
    .filter(lead => lead.nextFollowUp && lead.nextFollowUp <= todayKey)
    .filter(lead => !['Enrolled', 'Lost'].includes(lead.stage))
    .map(lead => ({
      id: `auto-lead-${lead.id}`,
      title: `متابعة ${lead.name}`,
      description: `${lead.program || 'برنامج غير محدد'} · ${lead.country || 'وجهة غير محددة'}`,
      dueDate: lead.nextFollowUp,
      priority: lead.nextFollowUp < todayKey ? 'High' : 'Medium',
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
        dueDate: item.updatedAt?.slice(0, 10) || todayKey,
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
    .filter(invoice => invoice.dueDate && invoice.dueDate <= todayKey)
    .map(invoice => {
      const student = students.find(item => item.id === invoice.studentId);
      return {
        id: `auto-invoice-${invoice.id}`,
        title: `تحصيل ${invoice.number}`,
        description: `${student?.name || 'طالب غير معروف'} · ${invoice.dueDate}`,
        dueDate: invoice.dueDate,
        priority: invoice.dueDate < todayKey ? 'High' : 'Medium',
        status: 'open',
        kind: 'alert',
        source: 'invoice',
        companyId
      };
    });

  return [...leadTasks, ...documentTasks, ...workflowTasks, ...invoiceTasks].map(task => ({ ...task, companyId }));
}

async function prepareDb() {
  await mutateDb(async db => {
    initMetaCollections(db);
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

    db.tasks ||= [];
    for (const user of db.users) {
      if (typeof user.isActive !== 'boolean') user.isActive = true;
      if (!user.companyId) user.companyId = fallbackCompanyId;
      if (user.password && !user.passwordHash) {
        user.passwordHash = await bcrypt.hash(user.password, 10);
        delete user.password;
      }
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

  const record = await mutateDb(db => {
    initMetaCollections(db);
    const existing = db.webhookEvents.find(item => item.provider === 'meta' && item.eventId === eventHash);
    if (existing) return existing;

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

          if (Array.isArray(entry.messaging)) {
            const possibleChannels = db.connectedChannels.filter(item => item.pageId === entryId || item.instagramAccountId === entryId);
            for (const event of entry.messaging) {
              const channel = possibleChannels.find(item => item.channelType === 'facebook')
                || possibleChannels.find(item => item.channelType === 'instagram');
              if (!channel) continue;
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
            if (!channel) continue;
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
      } catch (error) {
        stored.processingStatus = 'failed';
        stored.retryCount = Number(stored.retryCount || 0) + 1;
        stored.error = error.message;
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

app.get('/api/integrations/meta/status', allowRoles('admin', 'management'), async (req, res) => {
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

  const storedFile = await storeUploadedFile(req.file);
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

app.get('/api/integrations/meta/channels', allowRoles('admin', 'management'), async (req, res) => {
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
      companyId: req.user.companyId,
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
    recentReception: receptionLogs.slice(0, 5)
  });
});

app.get('/api/settings', async (_req, res) => {
  const db = await readDb();
  db.settings.documentChecklistTemplates = sanitizeChecklistTemplates(db.settings.documentChecklistTemplates || []);
  db.settings.applicationWorkflowTemplates = sanitizeWorkflowTemplates(db.settings.applicationWorkflowTemplates || []);
  const companyId = _req.user.companyId;
  res.json({
    ...db.settings,
    users: getScopedItems(db.users, companyId).map(({ passwordHash, ...user }) => user),
    employees: getScopedItems(db.employees, companyId),
    company: db.companies.find(item => item.id === companyId) || null
  });
});

app.patch('/api/settings', allowRoles('admin', 'management'), async (req, res) => {
  const payload = req.body || {};

  const result = await mutateDb(db => {
    const settings = db.settings;
    settings.documentChecklistTemplates = sanitizeChecklistTemplates(settings.documentChecklistTemplates || []);
    settings.applicationWorkflowTemplates = sanitizeWorkflowTemplates(settings.applicationWorkflowTemplates || []);

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
      name: payload.name,
      email,
      role: payload.role,
      department: payload.department,
      avatar: payload.avatar || initials(payload.name),
      isActive: payload.isActive !== false,
      passwordHash: await bcrypt.hash(password, 10)
    };

    db.users.unshift(user);
    activity(db, req.user, 'created', 'user', user.id, `تمت إضافة المستخدم ${user.name}`);
    const { passwordHash, ...safeUser } = user;
    return safeUser;
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

    activity(db, req.user, 'updated', 'user', user.id, `تم تحديث المستخدم ${user.name}`);
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  });

  res.json(result);
});

app.get('/api/tasks', async (req, res) => {
  const db = await readDb();
  const automaticTasks = buildAutomaticTasks(db, req.user.companyId);
  const manualTasks = getScopedItems(db.tasks || [], req.user.companyId).filter(task => !task.assignedRole || task.assignedRole === req.user.role || ['admin', 'management'].includes(req.user.role));
  res.json([...automaticTasks, ...manualTasks]);
});

app.post('/api/tasks', async (req, res) => {
  const payload = req.body || {};
  if (!payload.title) return res.status(400).json({ message: 'عنوان المهمة مطلوب' });

  const result = await mutateDb(db => {
    db.tasks ||= [];
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
      assignedRole: payload.assignedRole || '',
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
    const task = db.tasks.find(item => item.id === req.params.id && item.companyId === req.user.companyId);
    if (!task) throw Object.assign(new Error('المهمة غير موجودة'), { status: 404 });

    Object.assign(task, {
      title: req.body.title ?? task.title,
      description: req.body.description ?? task.description,
      dueDate: req.body.dueDate ?? task.dueDate,
      priority: req.body.priority ?? task.priority,
      status: req.body.status ?? task.status,
      assignedRole: req.body.assignedRole ?? task.assignedRole
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
  if (q) leads = leads.filter(lead => [lead.name, lead.phone, lead.email, lead.country, lead.program, lead.source].some(value => String(value || '').toLowerCase().includes(q)));
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
      university: payload.university || '',
      source: payload.source || 'Direct',
      stage: payload.stage || 'Initial Inquiry',
      consultantId: payload.consultantId || '',
      priority: payload.priority || 'Medium',
      nextFollowUp: payload.nextFollowUp || '',
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

    if (stage === 'Application Sent' && !lead.studentId) {
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

app.get('/api/students', async (req, res) => {
  const db = await readDb();
  const students = getScopedItems(db.students, req.user.companyId);
  const applications = getScopedItems(db.applications, req.user.companyId);
  const invoices = getScopedItems(db.invoices, req.user.companyId);
  res.json(students.map(student => ({ ...student, applications: applications.filter(item => item.studentId === student.id), invoices: invoices.filter(item => item.studentId === student.id) })));
});

app.get('/api/applications', async (req, res) => {
  const db = await readDb();
  res.json(
    getScopedItems(db.applications, req.user.companyId).map(application => ({
      ...buildApplicationState(application, db.settings),
      student: db.students.find(student => student.id === application.studentId && student.companyId === req.user.companyId) || null
    }))
  );
});

app.post('/api/applications', allowRoles('admin', 'management', 'admissions', 'consultant'), async (req, res) => {
  const result = await mutateDb(db => {
    let student = db.students.find(item => item.id === req.body.studentId && item.companyId === req.user.companyId);
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
    return { ...buildApplicationState(application, db.settings), student };
  });

  res.status(201).json(result);
});

app.patch('/api/applications/:id', allowRoles('admin', 'management', 'admissions'), async (req, res) => {
  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.id);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });
    Object.assign(application, req.body, { updatedAt: now() });
    activity(db, req.user, 'updated', 'application', application.id, `تم تحديث حالة الطلب إلى ${application.status}`);
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    return nextState;
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
    const nextState = buildApplicationState(application, db.settings);
    application.documentProgress = nextState.documentProgress;
    activity(db, req.user, 'updated', 'application-follow-up', `${application.id}:${stage.id}`, `${application.id} - ${stage.title} - ${done ? 'completed' : 'reopened'}`);
    return nextState;
  });

  res.json(result);
});

app.post('/api/applications/:id/documents', allowRoles('admin', 'management', 'admissions', 'consultant'), upload.single('file'), async (req, res) => {
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
    return { document, application: nextState };
  });

  res.status(201).json(result);
});

app.patch('/api/applications/:appId/documents/:docId', allowRoles('admin', 'management', 'admissions'), async (req, res) => {
  const result = await mutateDb(db => {
    const application = db.applications.find(item => item.id === req.params.appId);
    if (!application) throw Object.assign(new Error('طلب القبول غير موجود'), { status: 404 });
    const document = application.documents.find(item => item.id === req.params.docId);
    if (!document) throw Object.assign(new Error('المستند غير موجود'), { status: 404 });

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

app.get('/api/reception', async (_req, res) => {
  const db = await readDb();
  res.json(db.receptionLogs);
});

app.post('/api/reception', allowRoles('admin', 'management', 'reception'), async (req, res) => {
  const result = await mutateDb(db => {
    const payload = req.body || {};
    if (!payload.name || !payload.phone) throw Object.assign(new Error('الاسم ورقم الهاتف مطلوبان'), { status: 400 });

    const log = {
      id: randomUUID(),
      type: payload.type || 'Walk-in',
      name: payload.name,
      phone: payload.phone,
      email: payload.email || '',
      interest: payload.interest || '',
      source: payload.source || 'Front Desk',
      consultantId: payload.consultantId || '',
      notes: payload.notes || '',
      status: 'Assigned',
      createdBy: req.user.name,
      createdAt: now()
    };

    db.receptionLogs.unshift(log);
    if (payload.createLead !== false) {
      const duplicate = db.leads.find(lead => lead.phone === payload.phone || (payload.email && lead.email === payload.email));
      if (!duplicate) {
        const lead = {
          id: randomUUID(),
          name: payload.name,
          phone: payload.phone,
          email: payload.email || '',
          country: payload.country || '',
          program: payload.interest || '',
          university: '',
          source: payload.source || payload.type || 'Front Desk',
          stage: 'Initial Inquiry',
          consultantId: payload.consultantId || '',
          priority: payload.priority || 'Medium',
          nextFollowUp: payload.nextFollowUp || '',
          notes: payload.notes || '',
          createdAt: now(),
          updatedAt: now()
        };
        db.leads.unshift(lead);
        log.leadId = lead.id;
      } else {
        log.leadId = duplicate.id;
        log.status = 'Existing Lead';
      }
    }

    activity(db, req.user, 'logged', 'reception', log.id, `${log.type}: ${log.name}`);
    return log;
  });

  res.status(201).json(result);
});

app.get('/api/employees', async (_req, res) => {
  const db = await readDb();
  res.json(db.employees.map(employee => ({ ...employee, attendance: db.attendance.filter(item => item.employeeId === employee.id).slice(0, 10) })));
});

app.post('/api/employees', allowRoles('admin', 'management', 'hr'), async (req, res) => {
  const result = await mutateDb(db => {
    const employee = {
      id: randomUUID(),
      name: req.body.name,
      email: req.body.email || '',
      phone: req.body.phone || '',
      department: req.body.department || 'Consultancy',
      title: req.body.title || '',
      status: 'Active',
      joinDate: req.body.joinDate || todayKey,
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
      date: req.body.date || todayKey,
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

app.get('/api/invoices', async (req, res) => {
  const db = await readDb();
  const invoices = getScopedItems(db.invoices, req.user.companyId);
  const payments = getScopedItems(db.payments, req.user.companyId);
  const students = getScopedItems(db.students, req.user.companyId);
  res.json(
    invoices.map(invoice => {
      const invoicePayments = payments.filter(payment => payment.invoiceId === invoice.id);
      const paid = invoicePayments.reduce((sum, payment) => sum + money(payment.amount), 0);
      const student = students.find(item => item.id === invoice.studentId) || null;
      return { ...invoice, student, payments: invoicePayments, paid, balance: Math.max(0, money(invoice.total) - paid), computedStatus: paid >= money(invoice.total) ? 'Paid' : paid > 0 ? 'Partial' : invoice.status };
    })
  );
});

app.post('/api/invoices', allowRoles('admin', 'management', 'finance'), async (req, res) => {
  const result = await mutateDb(db => {
    const student = db.students.find(item => item.id === req.body.studentId);
    if (!student) throw Object.assign(new Error('الطالب مطلوب'), { status: 400 });
    const year = new Date(todayKey).getFullYear();
    const invoice = {
      id: randomUUID(),
      number: `INV-${year}-${String(db.invoices.length + 1).padStart(4, '0')}`,
      studentId: student.id,
      description: req.body.description || 'Educational consultancy services',
      currency: req.body.currency || 'USD',
      subtotal: money(req.body.subtotal),
      tax: money(req.body.tax),
      total: money(req.body.total || (money(req.body.subtotal) + money(req.body.tax))),
      commission: money(req.body.commission),
      dueDate: req.body.dueDate || '',
      status: 'Unpaid',
      notes: req.body.notes || '',
      createdAt: now()
    };
    db.invoices.unshift(invoice);
    activity(db, req.user, 'created', 'invoice', invoice.id, `تم إنشاء الفاتورة ${invoice.number} للطالب ${student.name}`);
    return invoice;
  });

  res.status(201).json(result);
});

app.post('/api/invoices/:id/payments', allowRoles('admin', 'management', 'finance'), async (req, res) => {
  const result = await mutateDb(db => {
    const invoice = db.invoices.find(item => item.id === req.params.id);
    if (!invoice) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });
    const payment = {
      id: randomUUID(),
      invoiceId: invoice.id,
      amount: money(req.body.amount),
      method: req.body.method || 'Bank Transfer',
      reference: req.body.reference || '',
      date: req.body.date || todayKey,
      notes: req.body.notes || '',
      receivedBy: req.user.name,
      createdAt: now()
    };
    if (payment.amount <= 0) throw Object.assign(new Error('يجب أن يكون مبلغ الدفعة أكبر من صفر'), { status: 400 });
    db.payments.unshift(payment);
    const paid = db.payments.filter(item => item.invoiceId === invoice.id).reduce((sum, item) => sum + money(item.amount), 0);
    invoice.status = paid >= money(invoice.total) ? 'Paid' : 'Partial';
    activity(db, req.user, 'created', 'payment', payment.id, `تم تسجيل دفعة على الفاتورة ${invoice.number} بقيمة ${payment.amount} ${invoice.currency}`);
    return payment;
  });

  res.status(201).json(result);
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
