const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');

// Servir les fichiers statiques (ton index.html doit être à la racine ou dans un dossier public selon ton choix)
// Si ton index.html est directement à la racine du projet, utilise __dirname tout court :
app.use(express.static(__dirname));

let waitingPlayers = [];

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    socket.on('find_match', () => {
        console.log(`Recherche de match pour ${socket.id}`);
        waitingPlayers.push(socket);

        if (waitingPlayers.length >= 2) {
            let p1 = waitingPlayers.shift();
            let p2 = waitingPlayers.shift();
            createMatch(p1, p2, false);
        } else {
            socket.matchTimeout = setTimeout(() => {
                let index = waitingPlayers.indexOf(socket);
                if (index !== -1) {
                    waitingPlayers.splice(index, 1);
                    console.log(`Pas de joueur trouvé pour ${socket.id}, ajout d'un bot.`);
                    createMatch(socket, null, true);
                }
            }, 10000); // 10 secondes
        }
    });

    socket.on('disconnect', () => {
        let index = waitingPlayers.indexOf(socket);
        if (index !== -1) {
            waitingPlayers.splice(index, 1);
            clearTimeout(socket.matchTimeout);
        }
        console.log(`Déconnexion : ${socket.id}`);
    });
});

function createMatch(p1, p2, isBot) {
    if (p1.matchTimeout) clearTimeout(p1.matchTimeout);
    if (p2 && p2.matchTimeout) clearTimeout(p2.matchTimeout);

    p1.emit('match_found', { opponent: isBot ? 'Bot' : p2.id });
    if (!isBot && p2) {
        p2.emit('match_found', { opponent: p1.id });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
