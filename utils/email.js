function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Subject lines mustn't contain CR/LF — that would let a malicious display name
// inject extra headers (BCC, etc.) via the API payload.
function sanitizeSubject(str) {
  return String(str || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
}

async function sendInvitationEmail({ to, inviterName, groupName, inviteUrl }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not configured. Invite URL for ${to}: ${inviteUrl}`);
    return;
  }

  console.log(`[email] Sending invitation to ${to}`);

  const safeInviter = escapeHTML(inviterName);
  const safeGroup = escapeHTML(groupName);
  const safeUrl = escapeHTML(inviteUrl); // attribute-context safety
  const subject = sanitizeSubject(`${inviterName} invited you to join "${groupName}" on Splitwise`);

  // Add a request-level timeout so a hung email API doesn't block the request indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Splitwise <onboarding@resend.dev>',
        to: [to],
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
            <h2 style="color:#5bc5a7;margin-top:0">You're invited to Splitwise!</h2>
            <p><strong>${safeInviter}</strong> has invited you to join the group <strong>"${safeGroup}"</strong> on Splitwise — an app to track shared expenses with friends, roommates, and family.</p>
            <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:#5bc5a7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin:16px 0;font-size:16px">Accept Invitation</a>
            <p style="color:#888;font-size:13px;margin-top:24px">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to send email: ${err.message || res.statusText}`);
    }

    const data = await res.json();
    console.log(`[email] Invitation sent to ${to}, id: ${data.id}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendInvitationEmail };
