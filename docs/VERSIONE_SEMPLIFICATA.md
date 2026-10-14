# Versione semplificata 770 Autonomi

Interfaccia principale: `index.html` + `v2.js` + `v2.css`. Versione precedente preservata in `legacy.html`.

Tre fasi:
1. Importa PDF gestionale, CU e F24.
2. Riconciliazione unica: confronto CU, registro ritenute, registro F24, quadratura per periodo. Tutti i movimenti operativi sono editabili inline e possono essere esclusi/ripristinati. Periodo F24 originale e attribuito sono separati.
3. Genera quadro ST provvisorio, modifica i righi, conferma, esporta CSV o stampa un prospetto di lavoro.

Il calcolo parte dai registri di lavoro attivi, non da copie aggregate scollegate. Ogni modifica invalida la bozza ST; rigenerazione esplicita per non perdere modifiche manuali effettuate direttamente allo ST.

Salva/Riprendi lavoro: JSON locale con dati fiscali, **non cifrato**. Conservare in cartella sicura; non caricare su GitHub.

Limiti noti: lettori PDF dipendenti dai layout, controllo completezza ancora da collaudare sui tre listati reali, gestione automatica ravvedimenti e campi ST speciali non completa, stampa non fedele al ministeriale, export non telematico. Non considerare il programma pronto per dichiarazioni prima dei test.
