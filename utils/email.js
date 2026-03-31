const nodemailer = require('nodemailer');

async function sendInvitationEmail({ to, inviterName, groupName, inviteUrl }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log(`[email] SMTP not configured. Invite URL for ${to}: ${inviteUrl}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log(`[email] Sending invitation to ${to} via ${process.env.SMTP_HOST}`);
  const info = await transporter.sendMail({
    from: `"Splitwise" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `${inviterName} invited you to join "${groupName}" on Splitwise`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#5bc5a7;margin-top:0">You're invited to Splitwise!</h2>
        <p><strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on Splitwise — an app to track shared expenses with friends, roommates, and family.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;background:#5bc5a7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin:16px 0;font-size:16px">Accept Invitation</a>
        <p style="color:#888;font-size:13px;margin-top:24px">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
      </div>
    `,
  });
  console.log(`[email] Invitation sent to ${to}, messageId: ${info.messageId}`);
}

module.exports = { sendInvitationEmail };
