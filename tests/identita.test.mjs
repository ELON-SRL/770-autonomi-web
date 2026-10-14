import assert from 'node:assert/strict';
import {identifyDetailed,identify} from '../identita.js';
const id='12345678901';
assert.deepEqual(identifyDetailed([id+' Azienda F34 MODELLO CU BROGLIACCIO MOVIMENTI LAVORO AUTONOMO Pag. 1']),[{id,kind:'sostituto'}]);
assert.deepEqual(identifyDetailed(['1 2 3 4 5 6 7 8 9 0 1 Azienda F34 MODELLO CU BROGLIACCIO MOVIMENTI LAVORO AUTONOMO']),[{id,kind:'sostituto'}]);
for(const text of ['Codice fiscale del sostituto: '+id,'Sostituto CF: '+id,'Partita IVA contribuente: '+id,"Codice fiscale sostituto d’imposta: "+id,'Cassetto delegato di: '+id+' - TEST SNC'])
 assert.ok(identifyDetailed(text).some(x=>x.id===id&&x.kind==='sostituto'),text);
assert.deepEqual(identifyDetailed('31/12/2025 RITENUTE MATURATE DA VERSARE [F34] TEST SNC'),[]);
assert.deepEqual(identifyDetailed('Percipiente: '+id+' AZIENDA F34 MODELLO CU BROGLIACCIO'),[]);
assert.deepEqual(identify('CF: RSSMRA80A01H501U'),['RSSMRA80A01H501U']);
assert.ok(!identifyDetailed('Utente connesso CF: RSSMRA80A01H501U').some(x=>x.kind==='sostituto'));
assert.deepEqual(identifyDetailed('Totale 12345678901'),[]);
console.log('Document identity header and role tests passed');
