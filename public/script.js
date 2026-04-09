const socket = io();

let monPseudo = "";
let monCodeSalon = "";
let suisHost = false;
let maChaineFinale = [];

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

function cacherTout() {
    hide('screen-home'); hide('screen-invite'); hide('screen-lobby');
    hide('screen-game'); hide('wait-overlay'); hide('score-overlay');
    hide('custom-selection-section'); hide('filling-section');
    hide('voting-section'); hide('cerveau-section'); hide('floatingTimer');
}

function addEnterListener(inputId, buttonId) {
    el(inputId).addEventListener("keypress", e => { if (e.key === "Enter") { e.preventDefault(); el(buttonId).click(); } });
}
addEnterListener('pseudoInput', 'btnCreer');
addEnterListener('roomInput', 'btnRejoindre');
addEnterListener('customWordInput', 'btnSoumettreCustom');
addEnterListener('invitePseudoInput', 'btnRejoindreInvite');

const urlParams = new URLSearchParams(window.location.search);
const inviteCode = urlParams.get('room');

if (inviteCode) {
    cacherTout();
    socket.emit('demander_info_salon', inviteCode);
}

socket.on('info_salon_recue', ({ code, hostName }) => {
    cacherTout(); show('screen-invite');
    monCodeSalon = code;
    el('inviteHostName').innerText = hostName;
});

socket.on('erreur_invitation', (msg) => {
    alert(msg);
    window.location.href = "/";
});

el('btnRejoindreInvite').addEventListener('click', () => {
    monPseudo = el('invitePseudoInput').value.trim();
    if (!monPseudo) return alert("⚠️ Tu dois écrire un pseudo !");
    socket.emit('rejoindre_salon', { pseudo: monPseudo, codeSalon: monCodeSalon });
});

el('btnCreer').addEventListener('click', () => {
    monPseudo = el('pseudoInput').value.trim();
    if (!monPseudo) return alert("⚠️ Tu dois écrire un pseudo !");
    socket.emit('creer_salon', monPseudo);
});

el('btnRejoindre').addEventListener('click', () => {
    monPseudo = el('pseudoInput').value.trim();
    monCodeSalon = el('roomInput').value.trim().toUpperCase();
    if (!monPseudo || !monCodeSalon) return alert("⚠️ Remplis tout !");
    socket.emit('rejoindre_salon', { pseudo: monPseudo, codeSalon: monCodeSalon });
});

function envoyerConfig() {
    socket.emit('update_config', {
        codeSalon: monCodeSalon,
        config: { mode: el('modeSelect').value, contrainte: el('contrainteCheck').checked }
    });
}
el('modeSelect').addEventListener('change', envoyerConfig);
el('contrainteCheck').addEventListener('change', envoyerConfig);

el('btnLancer').addEventListener('click', () => {
    envoyerConfig();
    socket.emit('lancer_partie', monCodeSalon);
});

el('btnCopyLink').addEventListener('click', () => {
    const link = window.location.origin + "?room=" + monCodeSalon;
    navigator.clipboard.writeText(link).then(() => {
        const btn = el('btnCopyLink');
        btn.innerText = "✅ Lien copié !";
        setTimeout(() => btn.innerText = "📋 Copier l'invitation", 2000);
    });
});

socket.on('salon_cree', code => { monCodeSalon = code; suisHost = true; afficherLobby(); });
socket.on('salon_rejoint', code => { monCodeSalon = code; suisHost = false; afficherLobby(); });
socket.on('erreur', msg => alert(msg));

function afficherLobby() {
    cacherTout(); show('screen-lobby');
    el('lobbyCode').innerText = monCodeSalon; el('gameCode').innerText = monCodeSalon;
    if (suisHost) { show('hostSettings'); hide('guestMessage'); } else { hide('hostSettings'); show('guestMessage'); }
    window.history.pushState({}, document.title, "/");
}

socket.on('mise_a_jour_lobby', ({ joueurs, createur }) => {
    el('listeJoueursLobby').innerHTML = '';
    for (const id in joueurs) el('listeJoueursLobby').innerHTML += `<li><span>${joueurs[id].pseudo}</span> <span>${id === createur ? "👑" : ""}</span></li>`;
});

socket.on('tour_choix_custom', ({ joueurId, pseudo, etapeNom }) => {
    cacherTout(); show('screen-game'); show('custom-selection-section');
    el('gamePhase').innerText = "Préparation";
    el('gamePhase').style.background = "#6366f1";

    if (joueurId === socket.id) {
        el('customHelperText').innerHTML = `C'est <b>ton tour</b> ! Écris <span class="neon-text">${etapeNom}</span>.`;
        show('myCustomInputArea');
        el('customWordInput').value = "";
        el('customWordInput').focus();
    } else {
        el('customHelperText').innerHTML = `<span class="neon-text">${pseudo}</span> écrit ${etapeNom}...`;
        hide('myCustomInputArea');
    }
});

el('btnSoumettreCustom').addEventListener('click', () => {
    const val = el('customWordInput').value.trim();
    if (!val) return alert("Tape un mot !");
    socket.emit('soumettre_mot_custom', { codeSalon: monCodeSalon, mot: val });
});


socket.on('debut_remplissage', ({ chaineDeBase, contrainte }) => {
    cacherTout(); show('screen-game'); show('filling-section'); show('floatingTimer');

    el('gamePhase').innerText = "Phase: Remplissage";
    el('gamePhase').style.background = "#f59e0b";

    if (contrainte) {
        show('contrainteBanner');
        el('contrainteBanner').innerText = "💀 CONTRAINTE : " + contrainte;
    } else {
        hide('contrainteBanner');
    }

    const container = el('myChainContainer');
    container.innerHTML = '';
    maChaineFinale = [...chaineDeBase];

    chaineDeBase.forEach((mot, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'path-step';

        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'path-node' + (mot !== null ? ' milestone' : '');

        if (mot !== null) {
            nodeDiv.innerHTML = `<span class="word-display">${mot}</span>`;
        } else {
            const input = document.createElement('input');
            input.type = 'text'; input.className = 'path-input'; input.placeholder = '?'; input.dataset.index = index;
            input.addEventListener('keypress', (e) => {
                if (e.key === "Enter") {
                    const next = container.querySelector(`input[data-index="${index + 1}"]`);
                    if (next) next.focus(); else el('btnValiderChaine').click();
                }
            });
            nodeDiv.appendChild(input);
        }

        stepDiv.appendChild(nodeDiv);
        container.appendChild(stepDiv);

        if (index < chaineDeBase.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'path-arrow';
            arrow.innerText = "➔";
            container.appendChild(arrow);
        }
    });
});

socket.on('timer_tick', (temps) => {
    el('timeVal').innerText = temps;
    if (temps <= 10) el('floatingTimer').style.background = "rgba(220, 38, 38, 1)";
    else el('floatingTimer').style.background = "rgba(239, 68, 68, 0.9)";
});

socket.on('temps_ecoule', () => { soumettreMaChaine(); });

el('btnValiderChaine').addEventListener('click', soumettreMaChaine);

function soumettreMaChaine() {
    if (!el('wait-overlay').classList.contains('hidden')) return;
    const inputs = document.querySelectorAll('.path-input');
    inputs.forEach(i => { maChaineFinale[i.dataset.index] = i.value.trim() || "Rien ❌"; });
    socket.emit('soumettre_chaine', { codeSalon: monCodeSalon, chaineRemplie: maChaineFinale });
}

socket.on('attente_autres_joueurs', () => show('wait-overlay'));

socket.on('tour_de_vote', ({ joueurEvalueId, pseudoEvalue, chaine, indicesVotables, toutLeMondeAVote, pseudosEnAttente }) => {
    cacherTout(); show('screen-game'); show('voting-section'); show('floatingTimer');
    el('gamePhase').innerText = "Le Tribunal";
    el('gamePhase').style.background = "#10b981";

    const container = el('voteChainContainer'); container.innerHTML = '';
    const cEstMoi = (joueurEvalueId === socket.id);

    if (cEstMoi) {
        el('voteTitle').innerHTML = `Le tribunal juge <span class="neon-text">ta chaîne</span>`;
        el('voteHelper').innerText = "Regarde les votes tomber en direct !";
    } else {
        el('voteTitle').innerHTML = `Tribunal de <span class="neon-text">${pseudoEvalue}</span>`;
        el('voteHelper').innerText = "Clique sur Oui ou Non sous chaque mot !";
    }

    if (toutLeMondeAVote) el('voteStatus').innerText = "✅ Tous les votes sont enregistrés !";
    else el('voteStatus').innerText = "⏳ En attente de : " + pseudosEnAttente.join(", ");

    chaine.forEach((mot, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'path-step';

        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'path-node' + (!indicesVotables.includes(index) ? ' milestone' : '');
        nodeDiv.innerHTML = `<span class="word-display">${mot}</span>`;

        stepDiv.appendChild(nodeDiv);

        if (indicesVotables.includes(index)) {
            if (!cEstMoi) {
                const voteArea = document.createElement('div');
                voteArea.className = 'path-vote-area';

                const btnOui = document.createElement('button'); btnOui.innerText = "👍"; btnOui.className = 'vote-btn btn-oui';
                const btnNon = document.createElement('button'); btnNon.innerText = "👎"; btnNon.className = 'vote-btn btn-non';

                btnOui.onclick = () => {
                    btnOui.classList.add('selected'); btnNon.classList.remove('selected');
                    socket.emit('vote_live', { codeSalon: monCodeSalon, index: index, vote: 'pour' });
                };
                btnNon.onclick = () => {
                    btnNon.classList.add('selected'); btnOui.classList.remove('selected');
                    socket.emit('vote_live', { codeSalon: monCodeSalon, index: index, vote: 'contre' });
                };

                voteArea.append(btnOui, btnNon);
                stepDiv.appendChild(voteArea);
            }

            const liveArea = document.createElement('div');
            liveArea.className = 'live-votes-mini';
            liveArea.innerHTML = `<span id="pour-${index}" class="text-green">0 👍</span> <span id="contre-${index}" class="text-red">0 👎</span>`;
            stepDiv.appendChild(liveArea);
        }

        container.appendChild(stepDiv);

        if (index < chaine.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'path-arrow';
            arrow.innerText = "➔";
            container.appendChild(arrow);
        }
    });
});

socket.on('maj_votes_direct', ({ totaux, toutLeMondeAVote, pseudosEnAttente }) => {
    for (const index in totaux) {
        const spanPour = el(`pour-${index}`);
        const spanContre = el(`contre-${index}`);
        if (spanPour) spanPour.innerText = `${totaux[index].pour} 👍`;
        if (spanContre) spanContre.innerText = `${totaux[index].contre} 👎`;
    }

    if (toutLeMondeAVote) {
        el('voteStatus').innerText = "✅ Tous les votes sont enregistrés ! 3... 2... 1...";
    } else {
        el('voteStatus').innerText = "⏳ En attente de : " + pseudosEnAttente.join(", ");
    }
});

socket.on('debut_vote_cerveau', (chainesData) => {
    cacherTout(); show('screen-game'); show('cerveau-section'); show('floatingTimer');
    el('gamePhase').innerText = "Vote Final";
    el('gamePhase').style.background = "#eab308";

    const container = el('cerveauCardsContainer');
    container.innerHTML = '';

    chainesData.forEach(data => {
        if (data.id === socket.id) return;

        const card = document.createElement('div');
        card.classList.add('cerveau-card');

        const formatChaine = data.chaine.join(" ➔ ");
        card.innerHTML = `<h3>Chaîne de <span class="neon-text">${data.pseudo}</span></h3>
                          <div class="cerveau-chaine">${formatChaine}</div>`;

        card.addEventListener('click', () => {
            if (confirm(`Voter pour la chaîne de ${data.pseudo} ?`)) {
                socket.emit('voter_cerveau', { codeSalon: monCodeSalon, votedForId: data.id });
                hide('cerveau-section');
                show('wait-overlay');
            }
        });

        container.appendChild(card);
    });
});

socket.on('maj_attente_cerveau', (pseudosEnAttente) => {
    const statusEl = el('cerveauVoteStatus');
    if (!statusEl) return;

    if (pseudosEnAttente.length === 0) {
        statusEl.innerText = "✅ Tous les votes sont enregistrés ! 3... 2... 1...";
    } else {
        statusEl.innerText = "⏳ En attente de : " + pseudosEnAttente.join(", ");
    }
});

socket.on('fin_de_manche', ({ joueurs, cerveauNom }) => {
    cacherTout(); show('score-overlay');

    el('cerveauWinnerName').innerText = cerveauNom;
    el('listeScoresFin').innerHTML = '';

    Object.values(joueurs).sort((a, b) => b.score - a.score).forEach(j => {
        el('listeScoresFin').innerHTML += `<li><span>${j.pseudo}</span> <span>${j.score} pts</span></li>`;
    });

    if (suisHost) {
        show('btnProchaineManche'); hide('attenteHostFin');
    } else {
        hide('btnProchaineManche'); show('attenteHostFin');
    }
});

el('btnProchaineManche').addEventListener('click', () => {
    socket.emit('lancer_partie', monCodeSalon);
});