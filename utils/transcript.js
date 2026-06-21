const { AttachmentBuilder } = require('discord.js');

async function fetchAllMessages(channel) {
  const messages = [];
  let lastId = null;

  while (messages.length < 500) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    messages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages.reverse();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimestamp(date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function renderMessage(msg) {
  const avatar = msg.author.displayAvatarURL({ extension: 'png', size: 64 });
  const username = escapeHtml(msg.member?.displayName || msg.author.username);
  const isBot = msg.author.bot;
  const timestamp = formatTimestamp(msg.createdAt);
  const content = escapeHtml(msg.content || '');

  const attachmentHtml = msg.attachments.size
    ? [...msg.attachments.values()]
        .map((a) => {
          if (a.contentType?.startsWith('image/')) {
            return `<img class="attachment-img" src="${escapeHtml(a.url)}" alt="attachment" loading="lazy">`;
          }
          return `<a class="attachment-link" href="${escapeHtml(a.url)}" target="_blank">📎 ${escapeHtml(a.name)}</a>`;
        })
        .join('\n')
    : '';

  const embedHtml = msg.embeds.length
    ? msg.embeds
        .map((e) => {
          const title = e.title ? `<div class="embed-title">${escapeHtml(e.title)}</div>` : '';
          const desc = e.description ? `<div class="embed-desc">${escapeHtml(e.description)}</div>` : '';
          const color = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : '#D4AF37';
          return `<div class="embed" style="border-left-color:${color}">${title}${desc}</div>`;
        })
        .join('\n')
    : '';

  return `
    <div class="message ${isBot ? 'bot-message' : ''}">
      <img class="avatar" src="${escapeHtml(avatar)}" alt="avatar" loading="lazy">
      <div class="message-body">
        <div class="message-header">
          <span class="username ${isBot ? 'bot-tag' : ''}">${username}${isBot ? ' <span class="badge">BOT</span>' : ''}</span>
          <span class="timestamp">${timestamp}</span>
        </div>
        ${content ? `<div class="message-content">${content}</div>` : ''}
        ${attachmentHtml}
        ${embedHtml}
      </div>
    </div>`;
}

async function generateTranscript(channel, ticketInfo) {
  const messages = await fetchAllMessages(channel);

  const messagesHtml = messages.map(renderMessage).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${String(ticketInfo.ticketNumber).padStart(4, '0')} Transcript</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0e0e10;
      color: #dcddde;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1a1e 0%, #111113 100%);
      border-bottom: 2px solid #D4AF37;
      padding: 24px 32px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-icon {
      width: 48px;
      height: 48px;
      background: #D4AF37;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
    }
    .header-info h1 {
      font-size: 1.4rem;
      color: #D4AF37;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .header-info p { font-size: 0.85rem; color: #9b9b9b; margin-top: 3px; }
    .meta-bar {
      background: #161618;
      border-bottom: 1px solid #2a2a2e;
      padding: 12px 32px;
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #D4AF37; font-weight: 600; }
    .meta-value { font-size: 0.88rem; color: #dcddde; }
    .messages {
      max-width: 900px;
      margin: 24px auto;
      padding: 0 16px 48px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .message {
      display: flex;
      gap: 14px;
      padding: 8px 12px;
      border-radius: 6px;
      transition: background 0.1s;
    }
    .message:hover { background: #1a1a1e; }
    .bot-message { opacity: 0.85; }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 2px;
      object-fit: cover;
    }
    .message-body { flex: 1; min-width: 0; }
    .message-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
    .username { font-weight: 600; font-size: 0.95rem; color: #D4AF37; }
    .bot-tag { color: #7289da; }
    .badge {
      display: inline-block;
      background: #5865f2;
      color: #fff;
      font-size: 0.62rem;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.04em;
      vertical-align: middle;
    }
    .timestamp { font-size: 0.75rem; color: #72767d; }
    .message-content { font-size: 0.92rem; line-height: 1.5; color: #dcddde; word-break: break-word; white-space: pre-wrap; }
    .attachment-img { max-width: 400px; max-height: 300px; border-radius: 6px; margin-top: 6px; display: block; border: 1px solid #2a2a2e; }
    .attachment-link { color: #00b0f4; font-size: 0.88rem; text-decoration: none; display: inline-block; margin-top: 4px; }
    .attachment-link:hover { text-decoration: underline; }
    .embed {
      border-left: 4px solid #D4AF37;
      background: #1e1e22;
      border-radius: 0 4px 4px 0;
      padding: 10px 14px;
      margin-top: 6px;
      max-width: 500px;
    }
    .embed-title { font-weight: 700; font-size: 0.95rem; color: #fff; margin-bottom: 4px; }
    .embed-desc { font-size: 0.88rem; color: #dcddde; white-space: pre-wrap; }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 0.78rem;
      color: #4a4a4e;
      border-top: 1px solid #1a1a1e;
    }
    .no-messages { text-align: center; padding: 48px; color: #72767d; font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-icon">🎫</div>
    <div class="header-info">
      <h1>TICKET #${String(ticketInfo.ticketNumber).padStart(4, '0')} — TRANSCRIPT</h1>
      <p>${escapeHtml(channel.name)} · ${messages.length} message${messages.length !== 1 ? 's' : ''}</p>
    </div>
  </div>
  <div class="meta-bar">
    <div class="meta-item">
      <span class="meta-label">Opened By</span>
      <span class="meta-value">${escapeHtml(ticketInfo.openerTag)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Category</span>
      <span class="meta-value">${escapeHtml(ticketInfo.category || 'General')}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Opened At</span>
      <span class="meta-value">${formatTimestamp(ticketInfo.openedAt)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Closed At</span>
      <span class="meta-value">${formatTimestamp(new Date())}</span>
    </div>
    ${ticketInfo.claimedByTag ? `
    <div class="meta-item">
      <span class="meta-label">Claimed By</span>
      <span class="meta-value">${escapeHtml(ticketInfo.claimedByTag)}</span>
    </div>` : ''}
  </div>
  <div class="messages">
    ${messages.length ? messagesHtml : '<div class="no-messages">No messages found.</div>'}
  </div>
  <div class="footer">Generated by Rise Bot · ${formatTimestamp(new Date())}</div>
</body>
</html>`;

  const buffer = Buffer.from(html, 'utf8');
  const filename = `transcript-${String(ticketInfo.ticketNumber).padStart(4, '0')}-${Date.now()}.html`;
  return new AttachmentBuilder(buffer, { name: filename });
}

module.exports = { generateTranscript };
