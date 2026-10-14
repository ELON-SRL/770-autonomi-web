# Fase 2 — riconciliazione F24 (prototipo)

Dopo conferma della Fase 1, la pagina mostra l'aggregazione delle ritenute gestionali per codice tributo e mese/anno del pagamento e tenta di leggere il listato F24 PDF. Filtra sulle singole righe per anno di riferimento; conserva più versamenti dello stesso periodo e permette un inserimento manuale non quietanzato. Esporta la quadratura in CSV.

**Limiti attuali, da correggere prima di utilizzo fiscale:**
- Il parser PDF F24 è sperimentale: dipende dall'ordine del testo estratto e può non riconoscere o interpretare male le colonne. Confrontare sempre il numero di righe e i totali con il PDF.
- La fase 1 permette rettifiche aggregate per percipiente; tali rettifiche non sono ancora allocate ai singoli periodi e quindi non entrano nei totali attesi F24. Non considerare valida la quadratura finale in presenza di queste rettifiche.
- La fase 2 non identifica ancora in modo affidabile sanzioni/interessi, ravvedimenti, quietanze e crediti compensati.
- Il confronto per periodo è una quadratura tecnica, non una generazione di righi ST fiscalmente validati.
- Non è implementato il salvataggio persistente né lo storico delle modifiche.

Nessun PDF viene trasmesso al repository; elaborazione in memoria nel browser. Le dipendenze PDF.js sono caricate da CDN esterno, ma i contenuti PDF sono trattati localmente.
