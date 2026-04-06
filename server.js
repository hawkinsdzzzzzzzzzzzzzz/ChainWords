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
    ["Harry Potter", "Magie", "Voldemort"]
];

function genererCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Calcule les totaux actuels des votes pour un salon
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

// Vérifie si tout le monde a voté
function verifierSiToutLeMondeAVote(salon) {
    let totalVotesCast = 0;
    for (const idx of salon.indicesVotables) {
        totalVotesCast += Object.keys(salon.votesEnCours[idx]).length;
    }
    const nbJoueurs = Object.keys(salon.joueurs).length;
    const expectedVotes = (nbJoueurs > 1 ? nbJoueurs - 1 : 0) * salon.indicesVotables.length;
    return expectedVotes === 0 || totalVotesCast >= expectedVotes;
}

io.on('connection', (socket) => {
    socket.on('creer_salon', (pseudo) => {
        const code = genererCode();
        socket.join(code);
        salons[code] = {
            createur: socket.id, joueurs: {}, etat: 'attente',
            config: { mode: 'auto', motsPerso: ["", "", ""] },
            chaineDeBase: [], indicesVotables: [], ordreVote: [],
            indexVoteCourant: 0, votesEnCours: {}
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
        if (salons[codeSalon] && salons[codeSalon].createur === socket.id) {
            salons[codeSalon].config = config;
        }
    });

    socket.on('lancer_partie', (codeSalon) => {
        const salon = salons[codeSalon];
        if (salon && salon.createur === socket.id) {
            salon.etat = 'remplissage';
            const taillesPossibles = [5, 7, 9];
            const taille = taillesPossibles[Math.floor(Math.random() * taillesPossibles.length)];
            const indexMilieu = Math.floor(taille / 2);

            let motsChoisis = salon.config.mode === 'auto' ? motsAuto[Math.floor(Math.random() * motsAuto.length)] : salon.config.motsPerso;

            salon.chaineDeBase = new Array(taille).fill(null);
            salon.chaineDeBase[0] = motsChoisis[0];
            salon.chaineDeBase[indexMilieu] = motsChoisis[1];
            salon.chaineDeBase[taille - 1] = motsChoisis[2];

            salon.indicesVotables = [];
            salon.chaineDeBase.forEach((mot, index) => { if (mot === null) salon.indicesVotables.push(index); });

            for (let id in salon.joueurs) {
                salon.joueurs[id].aFini = false;
                salon.joueurs[id].chaineJoueur = [...salon.chaineDeBase];
            }
            io.to(codeSalon).emit('debut_remplissage', { chaineDeBase: salon.chaineDeBase });
        }
    });

    socket.on('soumettre_chaine', ({ codeSalon, chaineRemplie }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'remplissage') {
            salon.joueurs[socket.id].chaineJoueur = chaineRemplie;
            salon.joueurs[socket.id].aFini = true;

            if (Object.values(salon.joueurs).every(j => j.aFini)) demarrerPhaseVote(codeSalon);
            else socket.emit('attente_autres_joueurs');
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
            toutLeMondeAVote: toutLeMondeAVote
        });
    }

    socket.on('vote_live', ({ codeSalon, index, vote }) => {
        const salon = salons[codeSalon];
        if (salon && salon.etat === 'vote') {
            const joueurEvalueId = salon.ordreVote[salon.indexVoteCourant];

            if (socket.id !== joueurEvalueId) {
                salon.votesEnCours[index][socket.id] = vote;
                const toutLeMondeAVote = verifierSiToutLeMondeAVote(salon);

                io.to(codeSalon).emit('maj_votes_direct', {
                    totaux: getTotauxVotes(salon),
                    toutLeMondeAVote: toutLeMondeAVote
                });
            }
        }
    });

    socket.on('host_suivant', (codeSalon) => {
        const salon = salons[codeSalon];
        if (salon && salon.createur === socket.id && salon.etat === 'vote') {
            cloturerTourDeVote(codeSalon);
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
            if (res.pour === 0 && res.contre === 0) {
                perfect = false;
                continue;
            }
            if (res.pour >= res.contre) joueur.score += 2;
            else perfect = false;
        }
        if (perfect && salon.indicesVotables.length > 0) joueur.score += 4;

        salon.indexVoteCourant++;
        if (salon.indexVoteCourant < salon.ordreVote.length) {
            lancerTourDeVote(codeSalon);
        } else {
            salon.etat = 'attente';
            io.to(codeSalon).emit('fin_de_manche', salon.joueurs);
        }
    }
});

// Le port est prêt pour Render.com
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});