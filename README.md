# Price Watch MVP

PWA Android-first per monitoraggio prezzi.

## Cosa include
- Dashboard prodotti
- Aggiunta prodotto tramite URL
- Prezzo iniziale inserito manualmente (il worker reale di scraping è predisposto ma non incluso in questa demo statica)
- Prezzo obiettivo
- Frequenza/orario di controllo
- Storico prezzi
- Grafico prezzo
- Regole di notifica
- Service Worker + Web App Manifest
- API contract documentato

## Avvio
Serve un web server locale perché Service Worker e PWA richiedono HTTP(S).

Esempio:
```bash
python -m http.server 8080
```
poi aprire:
http://localhost:8080

## API progettate
- POST /api/auth/login
- GET /api/products
- POST /api/products
- GET /api/products/:id
- PATCH /api/products/:id
- DELETE /api/products/:id
- GET /api/products/:id/prices
- POST /api/products/:id/check
- GET /api/notifications
- PATCH /api/settings
