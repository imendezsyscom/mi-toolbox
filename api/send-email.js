// api/send-email.js — Vercel Serverless Function
// Proxy para Resend. Evita CORS al llamar la API de Resend desde el servidor.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, cc, subject, html } = req.body

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Faltan campos requeridos: to, subject, html' })
  }

  const payload = {
    from: 'ComprasOps <onboarding@resend.dev>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  }
  if (cc && cc.length) payload.cc = Array.isArray(cc) ? cc : [cc]

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    return res.status(response.status).json({ error: data })
  }

  return res.status(200).json({ id: data.id })
}
