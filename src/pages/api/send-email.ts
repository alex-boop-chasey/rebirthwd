import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;  // Ensure dynamic

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  // Cloudflare env access (works local with platformProxy and prod)
  const runtime = locals.runtime;
  const RESEND_API_KEY = runtime.env.RESEND_API_KEY as string | undefined;
  const CONTACT_EMAIL = runtime.env.CONTACT_EMAIL as string | undefined;
  const TURNSTILE_SECRET_KEY = runtime.env.TURNSTILE_SECRET_KEY as string | undefined;

  console.log('Environment check:', {
    hasResendKey: !!RESEND_API_KEY,
    hasContactEmail: !!CONTACT_EMAIL,
    hasTurnstileKey: !!TURNSTILE_SECRET_KEY,
  });

  if (!RESEND_API_KEY || !CONTACT_EMAIL) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error('formData failed, falling back to text parse:', error);
    // Fallback for dev if Content-Type missing
    const text = await request.text();
    formData = new FormData();
    new URLSearchParams(text).forEach((value, key) => formData.append(key, value));
  }

  const name = formData.get('name') as string | null;
  const email = formData.get('email') as string | null;
  const message = formData.get('message') as string | null;
  const turnstileToken = formData.get('cf-turnstile-response') as string | null;

  console.log('Form data received:', { name, email, hasMessage: !!message, hasTurnstileToken: !!turnstileToken });

  if (!name || !email || !message || !turnstileToken) {
    return new Response(JSON.stringify({ error: 'Missing fields or Turnstile token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Turnstile verification
  if (TURNSTILE_SECRET_KEY) {
    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });

    const verifyResult = await verifyResponse.json() as { success: boolean };

    if (!verifyResult.success) {
      return new Response(JSON.stringify({ error: 'Turnstile verification failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const resend = new Resend(RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: 'Contact <contact@mail.rebirthwebdesign.com.au>',
    to: [CONTACT_EMAIL],
    subject: `New contact form message from ${name}`,
    reply_to: email,
    html: `
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `,
  });

  if (error) {
    console.error('Resend API error:', {
      message: error.message,
      name: error.name,
      statusCode: error.statusCode,
      raw: error,
    });
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
// ____________________
