# Midsummer Gala — Sistema di prenotazione

## Avvio rapido

```bash
cd midsummer-gala
npm install
node server.js
```

Poi apri:
- **Frontend**: http://localhost:3000
- **Admin panel**: http://localhost:3000/admin.html?key=gala2026

## Struttura

```
midsummer-gala/
├── server.js          # Backend Express + node:sqlite (Node 24 built-in)
├── gala.db            # Database SQLite (creato automaticamente)
├── public/
│   ├── index.html     # Landing page pubblica
│   └── admin.html     # Pannello admin
└── package.json
```

## Tipologie di biglietto

| Tipo      | Prezzo    | Descrizione                    |
|-----------|-----------|--------------------------------|
| standard  | €80/pers  | Ingresso serale + cena         |
| vip       | €150/pers | Premium + area riservata       |
| tavolo    | €1.200    | Tavolo da 8 con servizio ded.  |

## API

| Metodo | Endpoint                          | Descrizione                        |
|--------|-----------------------------------|------------------------------------|
| POST   | /api/reservations                 | Nuova prenotazione (pubblica)      |
| GET    | /api/admin/stats?key=…            | Statistiche per tipo               |
| GET    | /api/admin/reservations?key=…     | Lista prenotazioni (filtrabile)    |
| PATCH  | /api/admin/reservations/:id?key=… | Cambia stato (confermata/annullata)|
| DELETE | /api/admin/reservations/:id?key=… | Elimina prenotazione               |
| GET    | /api/admin/export?key=…           | Export CSV                         |

## Configurazione

Variabili d'ambiente opzionali:

```
PORT=3000
ADMIN_PASSWORD=gala2026
```

## Requisiti

- Node.js 24+ (usa `node:sqlite` built-in, nessuna dipendenza nativa)
