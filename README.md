# TrovaPrezzi V3

La ricerca non è limitata all'URL inserito: l'URL è facoltativo e solo un riferimento.

Questa V3 implementa il primo strato multi-negozio tramite Google Shopping/SerpApi. Non equivale letteralmente a “tutti i siti affidabili”: per aumentare la copertura vanno aggiunti ulteriori provider, comparatori e adapter diretti dei retailer, con deduplicazione, identificazione prodotto e verifica del venditore.

## Netlify
Imposta `SERPAPI_KEY` nelle Environment variables con scope Functions e poi fai un nuovo deploy. Netlify rende le variabili disponibili alle Functions a runtime; non mettere la chiave nel frontend.

## Test
Cerca un prodotto noto. Dovresti ricevere più offerte/negozi. L'URL può essere lasciato vuoto.

## Prossimi passi
Più provider, adapter retailer, EAN/GTIN matching, costo totale incluse spedizioni, disponibilità/venditore, database, account, scheduler e notifiche push.
