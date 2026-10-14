# Generazione ST: ritenute e ravvedimenti

La proposta ST riporta il totale delle ritenute effettive del periodo anche se il versamento differisce (interessi, centesimi o mancato versamento). Una ritenuta senza F24 resta visibile con versato zero. Per versamenti in più date, il punto 2 viene ripartito per capitale solo quando la somma dei capitali quadra esattamente con le ritenute; negli altri casi i punti 2 restano da attribuire e il messaggio mostra il totale del periodo. Non si ripete il totale su ciascuna data.

La presenza di 8948 con la stessa data normalizzata, periodo e anno del 1040 propone la casella 9. La sanzione non genera un rigo ST e non incrementa il punto 7. Il punto 7 conserva i debiti 1040 compresi gli interessi. Il punto 8 propone la riga 1040 minore soltanto se un'unica data di versamento e la quadratura con il gestionale la identificano come differenza; questa è una proposta da verificare, non una classificazione certa della quietanza.

Gli interessi modificati nella riconciliazione vengono trasferiti al punto 8 se il periodo ha una sola data di versamento. Con più date, la ripartizione richiede una verifica manuale nello ST e viene segnalata. L'importo zero scelto manualmente viene rispettato. Modificare gli interessi invalida lo ST precedente.

Il riepilogo ST mantiene visibili totale ritenute dell'anno, totale proposto nei punti 2 e numero dei ravvedimenti proposti, anche dopo modifica o conferma. Restano operativi filtro anno e riconciliazione luglio/agosto.

Collaudo su dati sintetici: ritenute maggio 561,37 con F24 561,37 + 0,40 e sanzione 1,90; agosto 209,26 con F24 209,28; dicembre 100,00 senza versamento; gennaio 2026 escluso. Risultato: tre righi, totale ritenute 870,63, versato 771,05, maggio ravvedimento e interessi 0,40, nessun rigo per la sanzione. Verificato nel browser anche il trasferimento di una modifica interessi a 0,26. Dieci test Node superati. Nessun collaudo sui PDF reali precedenti, non accessibili in questa chat.
