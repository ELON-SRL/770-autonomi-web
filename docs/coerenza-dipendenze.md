# Contratto di coerenza e propagazione — 770 Autonomi

## Sorgenti di verità
- PDF importati: immutabili; mantengono i dati originari.
- `ledgerState`: ritenute operative, fatture, periodi, rettifiche, esclusioni, riconciliazioni manuali.
- `f24Rows` + `f24Manual`: versamenti operativi con originali e modifiche.
- `overrides`: correzioni della vista CU, distinte dalle ritenute operative.
- `stDraft`: proposta derivata; può essere modificata dopo la generazione, ma ogni modifica alle sorgenti la invalida.

## Dipendenze obbligatorie
| Evento | Aggiornamenti richiesti |
|---|---|
| Importazione gestionale/CU | Stato ritenute, confronto CU, dettaglio fatture, riepilogo periodi, CSV; azzerare F24 e ST precedenti |
| Aggiunta/modifica/esclusione/ripristino ritenuta | Confronto CU, dettaglio fatture, CSV percipiente, riepilogo periodi, quadratura F24, invalidazione ST |
| Modifica/ripristino correzione CU | Confronto CU, esportazione CU, invalidazione ST e conferme precedenti |
| Aggiunta/modifica/esclusione/ripristino F24 | Movimenti F24, ravvedimenti, quadratura F24, link manuali validi, invalidazione ST |
| Riconciliazione/annullamento manuale | Periodo proposto ST e quadratura F24; periodo contabile e F24 originali invariati |
| Cambio anno | Tutte le viste filtrate, conferme e ST da invalidare |
| Modifica manuale ST | ST e stampa/esportazione da riconfermare |
| Esportazione CSV | Derivare sempre dallo stato corrente; bloccare su incoerenze; nome revisione univoco |

## Test automatizzati
- `tests/invoice_roundtrip.test.mjs`: conservazione metadati fattura dal parser al registro e al CSV.
- `tests/export_current.test.mjs`, `tests/export_audit.test.mjs`: esportazioni aggiornate e quadratura.
- `tests/manual_match_st.test.mjs`: un solo rigo ST dopo abbinamento luglio/agosto e annullamento.
- `tests/browser_pdf_integration.mjs`: browser, riconciliazione, modifica F24 e invalidazione ST.
- `tests/browser_real_pdfs.mjs`: importazione PDF reali, dettaglio e CSV per percipiente con rettifica e ricalcolo.

I test devono passare prima del deploy. Non sostituiscono la validazione fiscale del quadro ST né il controllo di ogni possibile combinazione di rettifiche.
