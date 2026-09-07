const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let waitingPlayers = [];

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    socket.on('find_match', () => {
        console.log(`Recherche de match pour ${socket.id}`);
        
        // Évite de mettre le même joueur plusieurs fois en double
        if (!waitingPlayers.includes(socket)) {
            waitingPlayers.push(socket);
        }

        // Si on a au moins 2 joueurs en attente, on lance le match entre eux
        if (waitingPlayers.length >= 2) {
            let p1 = waitingPlayers.shift();
            let p2 = waitingPlayers.shift();

            // On envoie l'événement aux deux vrais joueurs
            p1.emit('match_found', { opponent: "Joueur 2" });
            p2.emit('match_found', { opponent: "Joueur 1" });

            console.log(`Match lancé entre ${p1.id} et ${p2.id}`);
        }
    });

    socket.on('disconnect', () => {
        // Retirer le joueur de la file d'attente s'il se déconnecte
        waitingPlayers = waitingPlayers.filter(s => s !== socket);
        console.log(`Joueur déconnecté : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
