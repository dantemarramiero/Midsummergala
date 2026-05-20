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

const stripe = STRIPE_SECRET ? require('stripe')(STRIPE_SECRET) : null;

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
      db.prepare('UPDATE reservations SET stato = ? WHERE id = ?').run('confermata', parseInt(rid));
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

  const qty        = Math.max(1, Math.min(20, parseInt(numero_biglietti) || 1));
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
    res.status(500).json({ error: 'Errore Stripe: ' + err.message });
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
