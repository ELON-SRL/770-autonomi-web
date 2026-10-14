# Riconciliazione manuale luglio/agosto

Nella tabella F24 selezionare la ritenuta di luglio e premere Riconcilia. Il collegamento memorizza gli identificativi F24 e il periodo ST; non cambia periodo contabile, importi o documenti originali. Annulla riconciliazione ripristina le due anomalie. Modifica/Elimina/Ripristina restano disponibili nel registro ritenute. Le modifiche invalidano la bozza ST, da rigenerare.

Il caso di prova locale `tests/manual-example.json` usa dati sintetici: ritenuta 07/2025 di 209,26 e F24 08/2025 di 209,28. Un solo rigo ST, punto 2 209,26, punto 7 209,28. I due centesimi restano una differenza da verificare, senza trasformarli automaticamente in interessi.

Collaudo 14 ottobre 2026: otto test Node superati; nell'in-app browser verificati selezione, Riconcilia, periodo originale, differenza, singolo ST, annullamento e elimina/ripristina della ritenuta collegata. I tre PDF della conversazione precedente non erano accessibili: nessun collaudo sui PDF originali dichiarato.

Una sostituzione/ripristino del listato F24 scioglie i collegamenti. Anche l'esclusione del F24 o la variazione del suo periodo/codice scioglie un collegamento incompatibile; riconciliare nuovamente dopo il ripristino. Nessuna duplicazione di importi. I collegamenti restano nella sessione corrente come le altre rettifiche.

Test: `node --test tests/*.test.mjs`. Il test browser opzionale richiede Playwright e Chrome installati, un server locale sulla porta 8765 e `node tests/manual_reconciliation.browser.cjs`. In questa sessione è stato usato il browser integrato perché Chrome non era installato.

## Filtro anno delle ritenute

L'anno selezionato filtra le ritenute in base al periodo contabile del movimento di lavoro, prima di applicare il periodo proposto ST. Le ritenute fuori anno restano visibili e modificabili nel registro, marcate come escluse dai conteggi; non entrano nel confronto gestionale/CU, nei totali per periodo, nel CSV di controllo o nei candidati alla riconciliazione. Cambiare anno ricalcola i prospetti e invalida lo ST precedente. Un collegamento ST non può riattribuire una ritenuta fra anni diversi.

Verificato con un listato sintetico misto: luglio 2025 209,26 euro e gennaio 2026 500,00 euro. Con 2025 selezionato il totale gestionale è 209,26, la ritenuta 2026 è indicata fuori anno e lo ST riconciliato agosto conserva 209,26/209,28. Cambiando a 2026 il totale gestionale diventa 500,00; tornando a 2025 torna 209,26. Il brogliaccio CU resta quello caricato: per lavorare un altro anno occorre caricare anche la CU pertinente.
