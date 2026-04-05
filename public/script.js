const socket = io();

let monPseudo = "";
let monCodeSalon = "";
let suisHost = false;
let maChaineFinale = [];

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

function addEnterListener(inputId, buttonId) {
    el(inputId).addEventListener("keypress", e => { if (e.key === "Enter") { e.preventDefault(); el(buttonId).click(); } });
}
addEnterListener('pseudoInput', 'btnCreer');
addEnterListener('roomInput', 'btnRejoindre');

el('btnCreer').addEventListener('click', () => {
    monPseudo = el('pseudoInput').value;
    if (monPseudo) socket.emit('creer_salon', monPseudo);
});

el('btnRejoindre').addEventListener('click', () => {
    monPseudo = el('pseudoInput').value;
    monCodeSalon = el('roomInput').value.toUpperCase();
    if (monPseudo && monCodeSalon) socket.emit('rejoindre_salon', { pseudo: monPseudo, codeSalon: monCodeSalon });
});

el('modeSelect').addEventListener('change', () => {
    if (el('modeSelect').value === 'custom') show('customWordsInputs');
    else hide('customWordsInputs');
    socket.emit('update_config', { codeSalon: monCodeSalon, config: { mode: el('modeSelect').value, motsPerso: [el('motDebut').value, el('motMilieu').value, el('motFin').value] } });
});

el('btnLancer').addEventListener('click', () => { socket.emit('lancer_partie', monCodeSalon); });

socket.on('salon_cree', code => { monCodeSalon = code; suisHost = true; afficherLobby(); });
socket.on('salon_rejoint', code => { monCodeSalon = code; suisHost = false; afficherLobby(); });
socket.on('erreur', msg => alert(msg));

function afficherLobby() {
    hide('screen-home'); show('screen-lobby');
    el('lobbyCode').innerText = monCodeSalon; el('gameCode').innerText = monCodeSalon;
    if (suisHost) { show('hostSettings'); hide('guestMessage'); } else { hide('hostSettings'); show('guestMessage'); }
}

socket.on('mise_a_jour_lobby', ({ joueurs, createur }) => {
    el('listeJoueursLobby').innerHTML = '';
    for (const id in joueurs) el('listeJoueursLobby').innerHTML += `<li><span>${joueurs[id].pseudo}</span> <span>${id === createur ? "👑" : ""}</span></li>`;
});

// === PHASE 1 : REMPLISSAGE ===
socket.on('debut_remplissage', ({ chaineDeBase }) => {
    hide('screen-lobby'); hide('score-overlay'); hide('wait-overlay');
    show('screen-game'); show('filling-section'); hide('voting-section');

    el('gamePhase').innerText = "Phase: Remplissage";
    el('gamePhase').style.background = "#f59e0b";

    const container = el('myChainContainer');
    container.innerHTML = '';
    maChaineFinale = [...chaineDeBase];

    chaineDeBase.forEach((mot, index) => {
        const div = document.createElement('div');
        div.classList.add('timeline-node');

        if (mot !== null) {
            div.classList.add('milestone');
            div.innerHTML = `<span class="word-display">${mot}</span>`;
        } else {
            const input = document.createElement('input');
            input.type = 'text'; input.classList.add('chain-fill-input'); input.placeholder = 'Ton idée...'; input.dataset.index = index;
            input.addEventListener('keypress', (e) => {
                if (e.key === "Enter") {
                    const next = container.querySelector(`input[data-index="${index + 1}"]`);
                    if (next) next.focus(); else el('btnValiderChaine').click();
                }
            });
            div.appendChild(input);
        }
        container.appendChild(div);
    });
});

el('btnValiderChaine').addEventListener('click', () => {
    const inputs = document.querySelectorAll('.chain-fill-input');
    let ok = true;
    inputs.forEach(i => { if (!i.value.trim()) ok = false; maChaineFinale[i.dataset.index] = i.value.trim(); });
    if (!ok) return alert("Remplis toutes les cases !");

    socket.emit('soumettre_chaine', { codeSalon: monCodeSalon, chaineRemplie: maChaineFinale });
});

socket.on('attente_autres_joueurs', () => show('wait-overlay'));

// === PHASE 2 : LE TRIBUNAL ===
socket.on('tour_de_vote', ({ joueurEvalueId, pseudoEvalue, chaine, indicesVotables, toutLeMondeAVote }) => {
    hide('filling-section'); show('voting-section'); hide('wait-overlay');
    el('gamePhase').innerText = "Le Tribunal";
    el('gamePhase').style.background = "#10b981";

    const container = el('voteChainContainer'); container.innerHTML = '';
    const cEstMoi = (joueurEvalueId === socket.id);

    if (cEstMoi) {
        el('voteTitle').innerHTML = `Les autres jugent <span class="neon-text">ta chaîne</span>`;
        el('voteHelper').innerText = "Regarde les votes tomber en direct !";
    } else {
        el('voteTitle').innerHTML = `Tribunal de <span class="neon-text">${pseudoEvalue}</span>`;
        el('voteHelper').innerText = "Clique sur Oui ou Non. Ton vote est envoyé instantanément.";
    }

    // GESTION DU PANNEAU HOST
    if (suisHost) {
        show('hostActionsPanel');
        // On désactive ou active selon si tout le monde a déjà voté (ex: joueur seul)
        el('btnHostSuivant').disabled = !toutLeMondeAVote;

        // Mettre à jour le texte d'aide au-dessus du bouton
        if (toutLeMondeAVote) {
            el('hostActionsPanel').querySelector('p').innerText = "✅ Tous les votes sont enregistrés !";
        } else {
            el('hostActionsPanel').querySelector('p').innerText = "⏳ En attente des votes...";
        }
    } else {
        hide('hostActionsPanel');
    }

    chaine.forEach((mot, index) => {
        const div = document.createElement('div');
        div.classList.add('timeline-node');
        div.innerHTML = `<span class="word-display">${mot}</span>`;

        if (indicesVotables.includes(index)) {
            const voteSection = document.createElement('div');
            voteSection.classList.add('vote-section');

            if (!cEstMoi) {
                const divActions = document.createElement('div');
                divActions.classList.add('vote-actions');

                const btnOui = document.createElement('button'); btnOui.innerText = "👍 Oui"; btnOui.className = 'vote-btn btn-oui';
                const btnNon = document.createElement('button'); btnNon.innerText = "👎 Non"; btnNon.className = 'vote-btn btn-non';

                btnOui.onclick = () => {
                    btnOui.classList.add('selected'); btnNon.classList.remove('selected');
                    socket.emit('vote_live', { codeSalon: monCodeSalon, index: index, vote: 'pour' });
                };
                btnNon.onclick = () => {
                    btnNon.classList.add('selected'); btnOui.classList.remove('selected');
                    socket.emit('vote_live', { codeSalon: monCodeSalon, index: index, vote: 'contre' });
                };

                divActions.append(btnOui, btnNon);
                voteSection.appendChild(divActions);
            }

            const divLive = document.createElement('div');
            divLive.classList.add('live-votes');
            divLive.innerHTML = `<div id="pour-${index}" class="badge-vote pour">0 👍</div><div id="contre-${index}" class="badge-vote contre">0 👎</div>`;

            voteSection.appendChild(divLive);
            div.appendChild(voteSection);
        } else {
            div.classList.add('milestone');
        }
        container.appendChild(div);
    });
});

// CLICS DU CHEF
el('btnHostSuivant').addEventListener('click', () => {
    socket.emit('host_suivant', monCodeSalon);
});

el('btnSkipAFK').addEventListener('click', () => {
    if (confirm("Veux-tu vraiment forcer la suite ? (Les votes manquants seront ignorés)")) {
        socket.emit('host_suivant', monCodeSalon);
    }
});

// MAJ DES VOTES ET DU BOUTON HOST
socket.on('maj_votes_direct', ({ totaux, toutLeMondeAVote }) => {
    for (const index in totaux) {
        const spanPour = el(`pour-${index}`);
        const spanContre = el(`contre-${index}`);
        if (spanPour) spanPour.innerText = `${totaux[index].pour} 👍`;
        if (spanContre) spanContre.innerText = `${totaux[index].contre} 👎`;
    }

    if (suisHost) {
        el('btnHostSuivant').disabled = !toutLeMondeAVote;
        if (toutLeMondeAVote) {
            el('hostActionsPanel').querySelector('p').innerText = "✅ Tous les votes sont enregistrés !";
        }
    }
});

// === FIN DE MANCHE ===
socket.on('fin_de_manche', (joueurs) => {
    hide('wait-overlay'); hide('voting-section');
    el('listeScoresFin').innerHTML = '';
    Object.values(joueurs).sort((a, b) => b.score - a.score).forEach(j => {
        el('listeScoresFin').innerHTML += `<li><span>${j.pseudo}</span> <span>${j.score} pts</span></li>`;
    });
    show('score-overlay');
});

el('btnRetourLobby').addEventListener('click', () => { hide('score-overlay'); hide('screen-game'); show('screen-lobby'); });