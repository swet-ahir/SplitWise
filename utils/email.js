async function sendInvitationEmail({ to, inviterName, groupName, inviteUrl }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not configured. Invite URL for ${to}: ${inviteUrl}`);
    return;
  }

  console.log(`[email] Sending invitation to ${to}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Splitwise <onboarding@resend.dev>',
      to: [to],
      subject: `${inviterName} invited you to join "${groupName}" on Splitwise`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <h2 style="color:#5bc5a7;margin-top:0">You're invited to Splitwise!</h2>
          <p><strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on Splitwise — an app to track shared expenses with friends, roommates, and family.</p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;background:#5bc5a7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin:16px 0;font-size:16px">Accept Invitation</a>
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
}

module.exports = { sendInvitationEmail };
