import { Resend } from 'resend';

export const onRequestPost = async ({ request, env }) => {
  const resend = new Resend(env.RESEND_API_KEY);

  const formData = await request.formData();
  const name = formData.get('name');
  const email = formData.get('email');
  const message = formData.get('message');
  const turnstileToken = formData.get('cf-turnstile-response');  // Auto-added by widget

  // Basic field validation
  if (!name || !email || !message || !turnstileToken) {
    return new Response('Missing fields or Turnstile token', { status: 400 });
  }

  // Verify Turnstile token
  const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,  // Add to .env
      response: turnstileToken,
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  });

  const turnstileResult = await turnstileVerify.json();

  if (!turnstileResult.success) {
    return new Response('Turnstile verification failed', { status: 403 });
  }

  // Send email
  try {
    const { error } = await resend.emails.send({
      from: 'Rebirth Web Design <hello@rebirthwebdesign.com.au>',
      to: [env.CONTACT_EMAIL],
      subject: `New message from ${name}`,
      reply_to: email,
      html: `
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return new Response('Email failed', { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Server error:', error);
    return new Response('Server error', { status: 500 });
  }
};
// ____________________