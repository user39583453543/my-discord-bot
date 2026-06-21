function renderMessage(msg) {
  const avatar = msg.author.displayAvatarURL({ extension: 'png', size: 64 });
  const username = escapeHtml(msg.member?.displayName || msg.author.username);
  const isBot = msg.author.bot;
  const timestamp = formatTimestamp(msg.createdAt);

  let content = '';

  if (msg.content) {
    content += `<div class="message-content">${escapeHtml(msg.content)}</div>`;
  }

  if (msg.embeds?.length) {
    for (const embed of msg.embeds) {
      content += `
      <div class="embed" style="border-left-color:#D4AF37">
        ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
        ${embed.description ? `<div class="embed-desc">${escapeHtml(embed.description)}</div>` : ''}
        ${
          embed.fields?.length
            ? embed.fields
                .map(
                  field => `
                  <div style="margin-top:8px">
                    <strong>${escapeHtml(field.name)}</strong><br>
                    ${escapeHtml(field.value)}
                  </div>
                `
                )
                .join('')
            : ''
        }
      </div>`;
    }
  }

  const attachmentHtml = msg.attachments.size
    ? [...msg.attachments.values()]
        .map((a) => {
          if (a.contentType?.startsWith('image/')) {
            return `<img class="attachment-img" src="${escapeHtml(a.url)}" alt="attachment">`;
          }
          return `<a class="attachment-link" href="${escapeHtml(a.url)}">📎 ${escapeHtml(a.name)}</a>`;
        })
        .join('')
    : '';

  return `
    <div class="message ${isBot ? 'bot-message' : ''}">
      <img class="avatar" src="${escapeHtml(avatar)}" alt="avatar">
      <div class="message-body">
        <div class="message-header">
          <span class="username ${isBot ? 'bot-tag' : ''}">
            ${username}${isBot ? ' <span class="badge">BOT</span>' : ''}
          </span>
          <span class="timestamp">${timestamp}</span>
        </div>
        ${content}
        ${attachmentHtml}
      </div>
    </div>`;
}
