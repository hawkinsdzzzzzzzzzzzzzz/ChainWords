const socket = io();

let currentRoom = '';
let myPseudo = '';

const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const voteScreen = document.getElementById('vote-screen');

document.getElementById('btn-join').addEventListener('click', () => {
    myPseudo = document.getElementById('pseudo').value;
    currentRoom = document.getElementById('room-code').value;

    if (myPseudo && currentRoom) {
        socket.emit('joinRoom', { pseudo: myPseudo, room: currentRoom });
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        document.getElementById('display-room').innerText = currentRoom;
    }
});

document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('startGame', currentRoom);
});

socket.on('updateLobby', (players) => {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    players.forEach(p => {
        list.innerHTML += `<li>👤 ${p.pseudo}</li>`;
    });
});

socket.on('gameStarted', (gameData) => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    // On réactive le bouton au cas où c'est une nouvelle manche
    document.getElementById('btn-submit-words').innerText = "Valider mon chemin";
    document.getElementById('btn-submit-words').disabled = false;

    document.getElementById('word-start').innerText = gameData.startWord;
    document.getElementById('word-end').innerText = gameData.endWord;
    document.getElementById('word-middle').innerText = gameData.middleWord;

    const container = document.getElementById('inputs-container');
    container.innerHTML = '';
    for (let i = 0; i < gameData.stepCount; i++) {
        container.innerHTML += `<input type="text" class="word-input" placeholder="Mot étape ${i + 1}">`;
    }
});

document.getElementById('btn-submit-words').addEventListener('click', () => {
    const inputs = document.querySelectorAll('.word-input');
    const words = Array.from(inputs).map(input => input.value);

    socket.emit('submitWords', { room: currentRoom, words: words, pseudo: myPseudo });
    document.getElementById('btn-submit-words').innerText = "En attente des autres joueurs...";
    document.getElementById('btn-submit-words').disabled = true;
});

// NOUVEAU : Affichage de l'écran de vote
socket.on('startVoting', (submissions) => {
    gameScreen.classList.add('hidden');
    voteScreen.classList.remove('hidden');

    const container = document.getElementById('vote-container');
    container.innerHTML = '';

    // Pour chaque joueur, on crée la liste de ses mots avec des checkbox
    Object.keys(submissions).forEach(socketId => {
        const data = submissions[socketId];

        let htmlPath = `<div class="player-path">`;
        htmlPath += `<h3>Chemin de : <span class="highlight">${data.pseudo}</span></h3>`;

        data.words.forEach((word, index) => {
            htmlPath += `
                <div class="vote-item">
                    <span>${word || "<em>(vide)</em>"}</span>
                    <input type="checkbox" class="vote-checkbox" data-owner="${socketId}" data-wordindex="${index}">
                </div>
            `;
        });

        htmlPath += `</div>`;
        container.innerHTML += htmlPath;
    });
});

// Pour la suite (Système de points)
document.getElementById('btn-submit-votes').addEventListener('click', () => {
    // Ici on récupèrera tous les votes cochés !
    alert("Prochaine étape : on compte les points !");
});