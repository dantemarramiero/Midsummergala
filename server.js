const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { DatabaseSync } = require('node:sqlite');

const app   = express();
const PORT  = process.env.PORT || 3000;
const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD   || 'gala2026';
const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET;
const DB_PATH = path.join(__dirname, 'gala.db');

const https  = require('https');
const Stripe = require('stripe');
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, {
  httpClient: Stripe.createNodeHttpClient(new https.Agent({ keepAlive: false }))
}) : null;

// Test connessione a Stripe all'avvio
if (STRIPE_SECRET) {
  https.get('https://api.stripe.com/', (res) => {
    console.log('  Rete Stripe     →', res.statusCode === 200 ? '✓ raggiungibile' : `HTTP ${res.statusCode}`);
  }).on('error', (err) => {
    console.error('  Rete Stripe     → ✗ ERRORE:', err.message, '| code:', err.code);
  });
}

// ── Email ─────────────────────────────────────────────────────────────────────
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.RESEND_FROM || 'Midsummer Gala <noreply@marramiero.it>';

async function sendConfirmationEmail(reservation) {
  if (!resend) return;
  const { id, nome, cognome, email, tipo_biglietto, numero_biglietti } = reservation;
  const tipoLabel = tipo_biglietto === 'navetta' ? 'Con Navetta Inclusa' : 'Standard';
  const prezzoUnit = tipo_biglietto === 'navetta' ? 65 : 50;
  const totale = prezzoUnit * numero_biglietti;
  const ref = '#' + String(id).padStart(4, '0');

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    reply_to: process.env.RESEND_REPLY_TO,
    subject: `Prenotazione confermata — Midsummer Gala 2026 ${ref}`,
    html: `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1e8d5;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1e8d5;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#241a25;max-width:580px;width:100%;">

        <!-- Header -->
        <tr><td style="padding:48px 48px 32px;border-bottom:1px solid rgba(176,136,74,0.3);">
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0884a;">Marramiero</p>
          <h1 style="margin:12px 0 0;font-size:36px;font-weight:400;color:#f1e8d5;letter-spacing:-0.02em;line-height:1.1;">
            Midsummer<br><em style="font-style:italic;color:#c9a368;">Gala</em>
          </h1>
        </td></tr>

        <!-- Conferma -->
        <tr><td style="padding:40px 48px 32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0884a;">Prenotazione confermata</p>
          <h2 style="margin:0 0 24px;font-size:26px;font-weight:400;color:#f1e8d5;">Ciao ${nome},</h2>
          <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(241,232,213,0.7);">
            La tua prenotazione per il <strong style="color:#f1e8d5;">Midsummer Gala 2026</strong> è confermata.<br>
            Ti aspettiamo sabato 4 luglio alla Tenuta Marramiero.
          </p>
        </td></tr>

        <!-- Riepilogo -->
        <tr><td style="padding:0 48px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(176,136,74,0.08);border:1px solid rgba(176,136,74,0.2);">
            <tr><td style="padding:28px 28px 8px;">
              <p style="margin:0 0 16px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(241,232,213,0.4);">Riepilogo prenotazione</p>
            </td></tr>
            <tr><td style="padding:0 28px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:13px;color:rgba(241,232,213,0.5);letter-spacing:0.1em;text-transform:uppercase;">Riferimento</td>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:20px;color:#c9a368;text-align:right;font-style:italic;">${ref}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,214,0.08);font-size:13px;color:rgba(241,232,213,0.5);letter-spacing:0.1em;text-transform:uppercase;">Nominativo</td>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:15px;color:#f1e8d5;text-align:right;">${nome} ${cognome}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:13px;color:rgba(241,232,213,0.5);letter-spacing:0.1em;text-transform:uppercase;">Tipologia</td>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:15px;color:#f1e8d5;text-align:right;">${tipoLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:13px;color:rgba(241,232,213,0.5);letter-spacing:0.1em;text-transform:uppercase;">Biglietti</td>
                  <td style="padding:10px 0;border-bottom:1px solid rgba(241,232,213,0.08);font-size:15px;color:#f1e8d5;text-align:right;">${numero_biglietti}</td>
                </tr>
                <tr>
                  <td style="padding:14px 0 0;font-size:13px;color:rgba(241,232,213,0.5);letter-spacing:0.1em;text-transform:uppercase;">Totale pagato</td>
                  <td style="padding:14px 0 0;font-size:24px;color:#c9a368;text-align:right;">€ ${totale}</td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:28px;"></td></tr>
          </table>
        </td></tr>

        <!-- Dettagli evento -->
        <tr><td style="padding:0 48px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" style="padding-right:16px;">
                <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#b0884a;">Data</p>
                <p style="margin:0;font-size:16px;color:#f1e8d5;">Sabato 4 Luglio 2026</p>
                <p style="margin:4px 0 0;font-size:13px;color:rgba(241,232,213,0.5);">Dalle ore 19:00</p>
              </td>
              <td width="50%">
                <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#b0884a;">Luogo</p>
                <p style="margin:0;font-size:16px;color:#f1e8d5;">Tenuta Marramiero</p>
                <p style="margin:4px 0 0;font-size:13px;color:rgba(241,232,213,0.5);">Contrada Sant'Andrea, Rosciano (PE)</p>
              </td>
            </tr>
            <tr><td colspan="2" style="padding-top:24px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#b0884a;">Dress Code</p>
              <p style="margin:0;font-size:16px;color:#f1e8d5;">Completo per i ragazzi · Abito lungo per le ragazze</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:28px 48px;border-top:1px solid rgba(176,136,74,0.2);">
          <p style="margin:0;font-size:12px;color:rgba(241,232,213,0.3);line-height:1.7;">
            Marramiero · Contrada Sant'Andrea · Rosciano (PE)<br>
            Per informazioni: <a href="mailto:info@marramiero.it" style="color:rgba(176,136,74,0.7);text-decoration:none;">info@marramiero.it</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nome              TEXT    NOT NULL,
    cognome           TEXT    NOT NULL,
    email             TEXT    NOT NULL,
    telefono          TEXT,
    tipo_biglietto    TEXT    NOT NULL,
    numero_biglietti  INTEGER NOT NULL DEFAULT 1,
    note              TEXT,
    stato             TEXT    NOT NULL DEFAULT 'in_attesa',
    stripe_session_id TEXT,
    created_at        TEXT    DEFAULT (datetime('now','localtime'))
  )
`);

// Add stripe_session_id column if DB existed without it
try { db.exec('ALTER TABLE reservations ADD COLUMN stripe_session_id TEXT'); } catch {}

// ── Webhook (raw body — must come BEFORE express.json()) ─────────────────────
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.status(400).json({ error: 'Stripe non configurato.' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const rid = session.metadata?.reservation_id;
    if (rid) {
      const reservationId = parseInt(rid);
      db.prepare('UPDATE reservations SET stato = ? WHERE id = ?').run('confermata', reservationId);
      const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
      if (reservation) sendConfirmationEmail(reservation).catch(console.error);
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const rid = session.metadata?.reservation_id;
    if (rid) {
      db.prepare('UPDATE reservations SET stato = ? WHERE id = ?').run('annullata', parseInt(rid));
    }
  }

  res.json({ received: true });
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Checkout ─────────────────────────────────────────────────────────────────
const PRICES_CENTS  = { standard: 5000, navetta: 6500 };
const PRICES_LABELS = { standard: 'Biglietto Standard', navetta: 'Biglietto con Navetta' };

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Pagamenti non configurati.' });

  const { nome, cognome, email, telefono, tipo_biglietto, numero_biglietti, note } = req.body || {};

  if (!nome?.trim() || !cognome?.trim() || !email?.trim() || !tipo_biglietto) {
    return res.status(400).json({ error: 'Nome, cognome, email e tipo biglietto sono obbligatori.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Indirizzo email non valido.' });
  }
  if (!['standard', 'navetta'].includes(tipo_biglietto)) {
    return res.status(400).json({ error: 'Tipo biglietto non valido.' });
  }

  const qty        = 1; // massimo 1 biglietto per ordine
  const emailClean = email.toLowerCase().trim();

  // Block duplicate confirmed reservations
  const existing = db.prepare(
    "SELECT id FROM reservations WHERE email = ? AND tipo_biglietto = ? AND stato = 'confermata'"
  ).get(emailClean, tipo_biglietto);
  if (existing) {
    return res.status(409).json({ error: 'Esiste già una prenotazione confermata con questa email.' });
  }

  // Create pending reservation
  const result = db.prepare(`
    INSERT INTO reservations (nome, cognome, email, telefono, tipo_biglietto, numero_biglietti, note, stato)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'in_attesa')
  `).run(nome.trim(), cognome.trim(), emailClean, telefono?.trim() || null, tipo_biglietto, qty, note?.trim() || null);

  const reservationId = result.lastInsertRowid;
  const origin = `${req.protocol}://${req.get('host')}`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: emailClean,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Midsummer Gala 2026 — ${PRICES_LABELS[tipo_biglietto]}`,
            description: `Sabato 4 Luglio 2026 · Tenuta Marramiero · ${qty} ${qty === 1 ? 'biglietto' : 'biglietti'}`,
          },
          unit_amount: PRICES_CENTS[tipo_biglietto],
        },
        quantity: qty,
      }],
      mode: 'payment',
      success_url: `${origin}/?payment=success&ref=${reservationId}`,
      cancel_url:  `${origin}/?payment=cancelled`,
      metadata: { reservation_id: String(reservationId) },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    });

    db.prepare('UPDATE reservations SET stripe_session_id = ? WHERE id = ?')
      .run(session.id, reservationId);

    res.json({ url: session.url });
  } catch (err) {
    // Roll back pending reservation on Stripe error
    db.prepare('DELETE FROM reservations WHERE id = ?').run(reservationId);
    console.error('STRIPE ERROR type:', err.type);
    console.error('STRIPE ERROR code:', err.code);
    console.error('STRIPE ERROR message:', err.message);
    res.status(500).json({ error: 'Errore Stripe: ' + err.message });
  }
});

// ── Send confirmation email manually (admin) ─────────────────────────────────
app.post('/api/admin/send-confirmation/:id', authAdmin, async (req, res) => {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Prenotazione non trovata.' });
  try {
    await sendConfirmationEmail(reservation);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin API ─────────────────────────────────────────────────────────────────
function authAdmin(req, res, next) {
  const pwd = req.query.key || req.headers['x-admin-key'];
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Non autorizzato.' });
  next();
}

app.get('/api/admin/stats', authAdmin, (req, res) => {
  const byType = db.prepare(`
    SELECT tipo_biglietto,
           COUNT(*) AS prenotazioni,
           SUM(numero_biglietti) AS biglietti_totali
    FROM reservations WHERE stato != 'annullata'
    GROUP BY tipo_biglietto ORDER BY tipo_biglietto
  `).all();
  const totals = db.prepare(
    "SELECT COUNT(*) AS prenotazioni, SUM(numero_biglietti) AS biglietti_totali FROM reservations WHERE stato != 'annullata'"
  ).get();
  res.json({ byType, totals });
});

app.get('/api/admin/reservations', authAdmin, (req, res) => {
  const { tipo, q } = req.query;
  let sql = 'SELECT * FROM reservations WHERE 1=1';
  const params = [];
  if (tipo && tipo !== 'all') { sql += ' AND tipo_biglietto = ?'; params.push(tipo); }
  if (q) {
    sql += ' AND (nome LIKE ? OR cognome LIKE ? OR email LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/admin/reservations/:id', authAdmin, (req, res) => {
  const { stato } = req.body || {};
  if (!['confermata', 'in_attesa', 'annullata'].includes(stato)) {
    return res.status(400).json({ error: 'Stato non valido.' });
  }
  db.prepare('UPDATE reservations SET stato = ? WHERE id = ?').run(stato, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/reservations/:id', authAdmin, (req, res) => {
  db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/export', authAdmin, (req, res) => {
  const { tipo } = req.query;
  let sql = 'SELECT * FROM reservations';
  const params = [];
  if (tipo && tipo !== 'all') { sql += ' WHERE tipo_biglietto = ?'; params.push(tipo); }
  sql += ' ORDER BY tipo_biglietto, cognome, nome';
  const rows = db.prepare(sql).all(...params);
  const headers = ['ID', 'Nome', 'Cognome', 'Email', 'Telefono', 'Tipo', 'Biglietti', 'Note', 'Stato', 'Data'];
  const csv = [
    headers.join(';'),
    ...rows.map(r => [
      r.id, `"${r.nome}"`, `"${r.cognome}"`, `"${r.email}"`,
      `"${r.telefono || ''}"`, r.tipo_biglietto, r.numero_biglietti,
      `"${(r.note || '').replace(/"/g, '""')}"`, r.stato, r.created_at
    ].join(';'))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="prenotazioni-${tipo || 'tutte'}-${Date.now()}.csv"`);
  res.send('﻿' + csv);
});

app.listen(PORT, () => {
  console.log(`\n✦ Midsummer Gala  →  http://localhost:${PORT}`);
  console.log(`  Admin panel      →  http://localhost:${PORT}/admin.html?key=${ADMIN_PASSWORD}`);
  console.log(`  Stripe           →  ${stripe ? '✓ configurato' : '✗ STRIPE_SECRET_KEY mancante'}\n`);
});
