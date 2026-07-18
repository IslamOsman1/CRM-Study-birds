export function normalizePhoneE164(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  return `+${digits}`;
}

function normalizeAttachmentList(message) {
  const directAttachments = ['image', 'video', 'audio', 'document', 'sticker']
    .filter(type => message?.[type])
    .map(type => ({
      type,
      id: message[type]?.id || '',
      mimeType: message[type]?.mime_type || '',
      caption: message[type]?.caption || ''
    }));

  const nestedAttachments = (message?.attachments || []).map(item => ({
    type: item.type || 'attachment',
    id: item.payload?.attachment_id || '',
    mimeType: item.mime_type || '',
    caption: item.payload?.title || ''
  }));

  return [...directAttachments, ...nestedAttachments];
}

export function normalizeInboundMetaMessage({ companyId, channel, event, value, contact }) {
  const message = value?.messages?.[0];
  if (!message) return null;

  const contactName = contact?.profile?.name || value?.contacts?.[0]?.profile?.name || '';
  const messageType = message.type || 'unsupported';
  const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '';

  return {
    companyId,
    channelType: channel.channelType,
    channelId: channel.id,
    externalMessageId: message.id,
    externalConversationId: value?.metadata?.phone_number_id || event?.sender?.id || contact?.wa_id || '',
    externalSenderId: contact?.wa_id || event?.sender?.id || '',
    externalSenderName: contactName,
    direction: 'inbound',
    messageType,
    text,
    attachments: normalizeAttachmentList(message),
    replyToExternalMessageId: message.context?.id || '',
    status: 'delivered',
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
    rawEventReference: {
      entryId: event?.id || '',
      object: 'whatsapp'
    }
  };
}

export function normalizeMessengerInboundEvent({ companyId, channel, entry, event }) {
  const message = event?.message;
  if (!message || message.is_echo) return null;

  return {
    companyId,
    channelType: channel.channelType,
    channelId: channel.id,
    externalMessageId: message.mid || '',
    externalConversationId: event?.sender?.id || '',
    externalSenderId: event?.sender?.id || '',
    externalSenderName: '',
    direction: 'inbound',
    messageType: message.text ? 'text' : (message.attachments?.[0]?.type || 'unsupported'),
    text: message.text || message.quick_reply?.payload || '',
    attachments: normalizeAttachmentList(message),
    replyToExternalMessageId: message.reply_to?.mid || '',
    status: 'delivered',
    timestamp: event?.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString(),
    rawEventReference: {
      entryId: entry?.id || '',
      object: channel.channelType
    }
  };
}

export function normalizeMetaStatusEvents({ channel, value, event }) {
  const statuses = value?.statuses || [];
  if (statuses.length) {
    return statuses.map(status => ({
      channelType: channel.channelType,
      channelId: channel.id,
      externalMessageId: status.id || '',
      status: status.status || 'sent',
      recipientId: status.recipient_id || '',
      errorCode: status.errors?.[0]?.code || '',
      errorMessage: status.errors?.[0]?.title || '',
      timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString()
    }));
  }

  if (event?.delivery?.mids?.length) {
    return event.delivery.mids.map(messageId => ({
      channelType: channel.channelType,
      channelId: channel.id,
      externalMessageId: messageId,
      status: 'delivered',
      recipientId: event?.sender?.id || '',
      errorCode: '',
      errorMessage: '',
      timestamp: event?.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString()
    }));
  }

  if (event?.read?.mid) {
    return [{
      channelType: channel.channelType,
      channelId: channel.id,
      externalMessageId: event.read.mid,
      status: 'read',
      recipientId: event?.sender?.id || '',
      errorCode: '',
      errorMessage: '',
      timestamp: event?.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString()
    }];
  }

  return [];
}
