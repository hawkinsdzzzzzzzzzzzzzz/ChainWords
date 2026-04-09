const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const salons = {};

const motsAuto = [
    ["Goku", "Kurama", "Dimension"],
    ["Feu", "Soleil", "Espace"],
    ["Voiture", "Vitesse", "Lumière"],
    ["Océan", "Monstre", "Peur"],
    ["Harry Potter", "Magie", "Voldemort"],
    ["Piratage", "Ordinateur", "Matrice"],
    ["Amour", "Trahison", "Vengeance"],
    ["Forêt", "Loup", "Pleine lune"]
];

const contraintesPossibles = [
    "Interdit d'utiliser la lettre 'E'.",
    "Tous les mots doivent faire 7 lettres maximum.",
    "Tous les mots doivent commencer par une consonne.",
    "Uniquement des objets ou des concepts (aucun personnage).",
    "Thème imposé : La Nature ou la Science."
];

function genererCode() { return Math.random().toString(36).substring(2, 7).toUpperCase(); }

function getTotauxVotes(salon) {
    const totaux = {};
    for (const index of salon.indicesVotables) {
        let pour = 0, contre = 0;
        for (const socketId in salon.votesEnCours[index]) {
            if (salon.votesEnCours[index][socketId] === 'pour') pour++;
            if (salon.votesEnCours[index][socketId] === 'contre') contre++;
        }
        totaux[index] = { pour, contre };
    }
    return totaux;
}

function verifierSiToutLeMondeAVote(salon) {
    let totalVotesCast = 0;
    for (const idx of salon.indicesVotables) totalVotesCast += Object.keys(salon.votesEnCours[idx]).length;
    const nbJoueurs = Object.keys(salon.joueurs).length;
    const expectedVotes = (nbJoueurs > 1 ? nbJoueurs - 1 : 0) * salon.indicesVotables.length;
    return expectedVotes === 0 || totalVotesCast >= expectedVotes;
}

// Récupère les pseudos de ceux qui n'ont pas encore fini de voter au tribunal
function getPseudosEnAttenteTribunal(salon) {
    const joueurEvalueId = salon.ordreVote[salon.indexVoteCourant];
    const votantsAttendus = Object.keys(salon.joueurs).filter(id => id !== joueurEvalueId);
    const enAttente = votantsAttendus.filter(id => {
        return salon.indicesVotables.some(idx => !salon.votesEnCours[idx] || !salon.votesEnCours[idx][id]);
    });
    return enAttente.map(id => salon.joueurs[id].pseudo);
}

// Récupère les pseudos de ceux qui n'ont pas encore voté pour le cerveau galactique
function getPseudosEnAttenteCerveau(salon) {
    const votantsAttendus = Object.keys(salon.joueurs);
    const enAttente = votantsAttendus.filter(id => !salon.votesCerveau[id]);
    return enAttente.map(id => salon.joueurs[id].pseudo);
}

function clearSalonTimer(salon) {
    if (salon.intervalTimer) {
        clearInterval(salon.intervalTimer);
        salon.intervalTimer = null;
    }
}

io.on('connection', (socket) => {

    socket.on('demander_info_salon', (codeSalon) => {
        const code = codeSalon.toUpperCase();
        if (salons[code] && salons[code].etat === 'attente') {
            const hostId = salons[code].createur;
            const hostName = salons[code].joueurs[hostId].pseudo;
            socket.emit('info_salon_recue', { code: code, hostName: hostName });
        } else {
            socket.emit('erreur_invitation', "Ce salon n'existe pas ou la partie a déjà commencé.");
        }
    });

    socket.on('creer_salon', (pseudo) => {
        const code = genererCode();
        socket.join(code);
        salons[code] = {
            createur: socket.id, joueurs: {}, etat: 'attente',
            config: { mode: 'auto', contrainte: false },
            chaineDeBase: [], indicesVotables: [], ordreVote: [],
            indexVoteCourant: 0, votesEnCours: {}, temps: 0,
            motsPersoEnCours: [], etapesPerso: ["le 1er mot mystère", "le 2ème mot mystère", "le 3ème mot mystère"],
            joueurChoixCourant: null
        };
        salons[code].joueurs[socket.id] = { pseudo: pseudo, score: 0, chaineJoueur: [], aFini: false };
        socket.emit('salon_cree', code);
        io.to(code).emit('mise_a_jour_lobby', { joueurs: salons[code].joueurs, createur: salons[code].createur });
    });

    socket.on('rejoindre_salon', ({ pseudo, codeSalon }) => {
        const code = codeSalon.toUpperCase();
        if (salons[code] && salons[code].etat === 'attente') {
            socket.join(code);
            salons[code].joueurs[socket.id] = { pseudo: pseudo, score: 0, chaineJoueur: [], aFini: false };
            socket.emit('salon_rejoint', code);
            io.to(code).emit('mise_a_jour_lobby', { joueurs: salons[code].joueurs, createur: salons[code].createur });
        } else {
            socket.emit('erreur', "Salon introuvable ou partie en cours.");
        }
    });

    socket.on('update_config', ({ codeSalon, config }) => {
        if (salons[codeSalon] && salons[codeSalon].createur === socket.id) salons[codeSalon].config = config;
    });

    socket.on('lancer_partie', (codeSalon) => {
        const salon = salons[codeSalon];
        if (salon && salon.createur === socket.id) {
            for (let id in salon.joueurs) {
                salon.joueurs[id].aFini = false;
                salon.joueurs[id].chaineJoueur = [];
            }

            if (salon.config.mode === 'custom') demarrerChoixPersonnalise(codeSalon);
            else lancerPhaseRemplissage(codeSalon, motsAuto[Math.floor(Math.random() * motsAuto.length)]);
        }
    });

    // --- PHASE 1.5 : CHOIX DES MOTS (MYSTÈRES & ALÉATOIRES) ---
    function demarrerChoixPersonnalise(codeSalon) {
        const salon = salons[codeSalon];
        salon.etat = 'choix_custom';
        salon.motsPersoEnCours = [];
        passerAuChoixCustom(codeSalon);
    }

    function passerAuChoixCustom(codeSalon) {
        const salon = salons[codeSalon];
        if (salon.motsPersoEnCours.length === 3) {
            // LES MOTS SONT MÉLANGÉS ALÉATOIREMENT AVANT LA PARTIE
            const motsMelanges = [...salon.motsPersoEnCours].sort(() => Math.random() - 0.5);
            lancerPhaseRemplissage(codeSalon, motsMelanges);
            return;
        }

        const joueursIds = Object.keys(salon.joueurs);
        // Joueur choisi aléatoirement pour écrire le mot
        const indexAleatoire = Math.floor(Math.random() * joueursIds.length);
        salon.joueurChoixCourant = joueursIds[indexAleatoire];

        io.to(codeSalon).emit('tour_choix_custom', {
            joueurId: salon.joueurChoixCourant,
            pseudo: salon.joueurs[salon.joueurChoixCourant].pseudo,
            etapeNom: salon.etapesPerso[salon.motsPersoEnCours.length]
        });
    }

    socket.on('soumettre_mot_custom', ({ codeSalon, mot }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'choix_custom' && salon.joueurChoixCourant === socket.id) {
            salon.motsPersoEnCours.push(mot.trim());
            passerAuChoixCustom(codeSalon);
        }
    });

    function lancerPhaseRemplissage(codeSalon, motsImposes) {
        const salon = salons[codeSalon];
        salon.etat = 'remplissage';

        const choixPossiblesNbX = [2, 4, 6, 8];
        const nbX = choixPossiblesNbX[Math.floor(Math.random() * choixPossiblesNbX.length)];
        const taille = 3 + nbX;
        const indexMilieu = 1 + (nbX / 2);

        salon.chaineDeBase = new Array(taille).fill(null);
        salon.chaineDeBase[0] = motsImposes[0];
        salon.chaineDeBase[indexMilieu] = motsImposes[1];
        salon.chaineDeBase[taille - 1] = motsImposes[2];

        salon.indicesVotables = [];
        salon.chaineDeBase.forEach((mot, index) => { if (mot === null) salon.indicesVotables.push(index); });

        let contrainteActive = null;
        if (salon.config.contrainte) contrainteActive = contraintesPossibles[Math.floor(Math.random() * contraintesPossibles.length)];

        for (let id in salon.joueurs) {
            salon.joueurs[id].aFini = false;
            salon.joueurs[id].chaineJoueur = [...salon.chaineDeBase];
        }

        io.to(codeSalon).emit('debut_remplissage', { chaineDeBase: salon.chaineDeBase, contrainte: contrainteActive });

        clearSalonTimer(salon);
        salon.temps = 90;
        salon.intervalTimer = setInterval(() => {
            salon.temps--;
            if (salon.temps >= 0) io.to(codeSalon).emit('timer_tick', salon.temps);

            if (salon.temps === 0) {
                io.to(codeSalon).emit('temps_ecoule');
            } else if (salon.temps <= -2) {
                for (let id in salon.joueurs) {
                    if (!salon.joueurs[id].aFini) {
                        salon.joueurs[id].chaineJoueur = [...salon.chaineDeBase].map(w => w || "AFK ❌");
                        salon.joueurs[id].aFini = true;
                    }
                }
                clearSalonTimer(salon);
                demarrerPhaseVote(codeSalon);
            }
        }, 1000);
    }

    socket.on('soumettre_chaine', ({ codeSalon, chaineRemplie }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'remplissage' && !salon.joueurs[socket.id].aFini) {
            salon.joueurs[socket.id].chaineJoueur = chaineRemplie;
            salon.joueurs[socket.id].aFini = true;

            if (Object.values(salon.joueurs).every(j => j.aFini)) {
                clearSalonTimer(salon);
                demarrerPhaseVote(codeSalon);
            } else {
                socket.emit('attente_autres_joueurs');
            }
        }
    });

    function demarrerPhaseVote(codeSalon) {
        const salon = salons[codeSalon];
        salon.etat = 'vote';
        salon.ordreVote = Object.keys(salon.joueurs);
        salon.indexVoteCourant = 0;
        lancerTourDeVote(codeSalon);
    }

    function lancerTourDeVote(codeSalon) {
        const salon = salons[codeSalon];
        const joueurEvalueId = salon.ordreVote[salon.indexVoteCourant];
        const joueurEvalue = salon.joueurs[joueurEvalueId];

        salon.votesEnCours = {};
        salon.indicesVotables.forEach(index => { salon.votesEnCours[index] = {}; });
        const toutLeMondeAVote = verifierSiToutLeMondeAVote(salon);

        io.to(codeSalon).emit('tour_de_vote', {
            joueurEvalueId: joueurEvalueId, pseudoEvalue: joueurEvalue.pseudo,
            chaine: joueurEvalue.chaineJoueur, indicesVotables: salon.indicesVotables,
            toutLeMondeAVote: toutLeMondeAVote,
            pseudosEnAttente: getPseudosEnAttenteTribunal(salon) // On envoie qui on attend
        });

        clearSalonTimer(salon);
        salon.temps = 60;
        salon.intervalTimer = setInterval(() => {
            salon.temps--;
            if (salon.temps >= 0) io.to(codeSalon).emit('timer_tick', salon.temps);

            if (salon.temps <= 0) {
                clearSalonTimer(salon);
                cloturerTourDeVote(codeSalon);
            }
        }, 1000);
    }

    socket.on('vote_live', ({ codeSalon, index, vote }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'vote') {
            const joueurEvalueId = salon.ordreVote[salon.indexVoteCourant];
            if (socket.id !== joueurEvalueId) {
                salon.votesEnCours[index][socket.id] = vote;
                const done = verifierSiToutLeMondeAVote(salon);

                io.to(codeSalon).emit('maj_votes_direct', {
                    totaux: getTotauxVotes(salon),
                    toutLeMondeAVote: done,
                    pseudosEnAttente: getPseudosEnAttenteTribunal(salon) // MAJ de la liste
                });

                if (done && salon.temps > 3) salon.temps = 3;
            }
        }
    });

    function cloturerTourDeVote(codeSalon) {
        const salon = salons[codeSalon];
        const joueurEvalueId = salon.ordreVote[salon.indexVoteCourant];
        const joueur = salon.joueurs[joueurEvalueId];
        const totaux = getTotauxVotes(salon);

        let perfect = true;
        for (const index of salon.indicesVotables) {
            const res = totaux[index];
            if (res.pour === 0 && res.contre === 0) { perfect = false; continue; }
            if (res.pour >= res.contre) joueur.score += 2;
            else perfect = false;
        }
        if (perfect && salon.indicesVotables.length > 0) joueur.score += 4;

        salon.indexVoteCourant++;
        if (salon.indexVoteCourant < salon.ordreVote.length) lancerTourDeVote(codeSalon);
        else demarrerVoteCerveau(codeSalon);
    }

    function demarrerVoteCerveau(codeSalon) {
        const salon = salons[codeSalon];
        salon.etat = 'vote_cerveau';
        salon.votesCerveau = {};

        const chainesData = [];
        for (const id in salon.joueurs) {
            chainesData.push({ id: id, pseudo: salon.joueurs[id].pseudo, chaine: salon.joueurs[id].chaineJoueur });
        }

        io.to(codeSalon).emit('debut_vote_cerveau', chainesData);
        // On envoie directement la liste de tous ceux qui doivent voter
        io.to(codeSalon).emit('maj_attente_cerveau', getPseudosEnAttenteCerveau(salon));

        clearSalonTimer(salon);
        salon.temps = 45;
        salon.intervalTimer = setInterval(() => {
            salon.temps--;
            if (salon.temps >= 0) io.to(codeSalon).emit('timer_tick', salon.temps);

            if (salon.temps <= 0) {
                clearSalonTimer(salon);
                calculerVainqueurCerveau(codeSalon);
            }
        }, 1000);
    }

    socket.on('voter_cerveau', ({ codeSalon, votedForId }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'vote_cerveau') {
            salon.votesCerveau[socket.id] = votedForId;
            const nbVotants = Object.keys(salon.votesCerveau).length;
            const nbJoueurs = Object.keys(salon.joueurs).length;

            if (nbVotants >= nbJoueurs && salon.temps > 3) salon.temps = 3;

            // Mise à jour de ceux qui n'ont pas encore cliqué
            io.to(codeSalon).emit('maj_attente_cerveau', getPseudosEnAttenteCerveau(salon));
        }
    });

    function calculerVainqueurCerveau(codeSalon) {
        const salon = salons[codeSalon];
        const compteVotes = {};

        for (const voterId in salon.votesCerveau) {
            const cibleId = salon.votesCerveau[voterId];
            compteVotes[cibleId] = (compteVotes[cibleId] || 0) + 1;
        }

        let maxVotes = 0;
        let vainqueursIds = [];

        for (const id in compteVotes) {
            if (compteVotes[id] > maxVotes) {
                maxVotes = compteVotes[id];
                vainqueursIds = [id];
            } else if (compteVotes[id] === maxVotes) {
                vainqueursIds.push(id); // Plusieurs joueurs ont le même score
            }
        }

        let nomsVainqueurs = "Personne";
        if (maxVotes > 0) {
            // S'il y a égalité parfaite, on tire un seul gagnant au sort parmi eux !
            if (vainqueursIds.length > 1) {
                const gagnantAleatoire = vainqueursIds[Math.floor(Math.random() * vainqueursIds.length)];
                vainqueursIds = [gagnantAleatoire];
            }
            nomsVainqueurs = salon.joueurs[vainqueursIds[0]].pseudo;
            salon.joueurs[vainqueursIds[0]].score += 3; // +3 points au grand vainqueur
        }

        salon.etat = 'attente';
        io.to(codeSalon).emit('fin_de_manche', { joueurs: salon.joueurs, cerveauNom: nomsVainqueurs });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Serveur lancé sur le port ${PORT}`); });