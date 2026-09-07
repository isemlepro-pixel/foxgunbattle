const express = require('http');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

// Fichiers statiques
const path = require('path');
app.use(express.static(path.join(__dirname, 'public'))); // ou __dirname direct selon ta structure

let waitingPlayers = [];
let matches = {};

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    // Le joueur clique sur "Jouer" ou entre dans la file
    socket.on('find_match', () => {
        console.log(`Recherche de match pour ${socket.id}`);
        waitingPlayers.push(socket);

        // Si on a 2 vrais joueurs immédiatement
        if (waitingPlayers.length >= 2) {
            let p1 = waitingPlayers.shift();
            let p2 = waitingPlayers.shift();
            createMatch(p1, p2, false); // false = pas de bot
        } else {
            // Lancer un compte à rebours de 10 secondes pour ce joueur seul
            socket.matchTimeout = setTimeout(() => {
                // Vérifier si le joueur est toujours dans la file d'attente
                let index = waitingPlayers.indexOf(socket);
                if (index !== -1) {
                    waitingPlayers.splice(index, 1);
                    console.log(`Pas de joueur trouvé pour ${socket.id}, ajout d'un bot.`);
                    createMatch(socket, null, true); // true = avec un bot
                }
            }, 10000); // 10 secondes
        }
    });

    socket.on('disconnect', () => {
        // Nettoyer la file d'attente si le joueur déco
        let index = waitingPlayers.indexOf(socket);
        if (index !== -1) {
            waitingPlayers.splice(index, 1);
            clearTimeout(socket.matchTimeout);
        }
        console.log(`Déconnexion : ${socket.id}`);
    });
});

function createMatch(p1, p2, isBot) {
    // Si c'est un bot, p2 sera géré par l'IA du serveur ou simulé
    if (p1.matchTimeout) clearTimeout(p1.matchTimeout);
    if (p2 && p2.matchTimeout) clearTimeout(p2.matchTimeout);

    p1.emit('match_found', { opponent: isBot ? 'Bot' : p2.id });
    if (!isBot && p2) {
        p2.emit('match_found', { opponent: p1.id });
    }
}
