const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let waitingPlayer = null;
let activeMatches = {}; // Stocke les rooms/parties en cours

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    socket.on('find_match', () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Un adversaire attend : on lance le match 1V1 !
            let p1 = waitingPlayer;
            let p2 = socket;
            waitingPlayer = null;

            let roomId = 'room_' + p1.id + '_' + p2.id;
            p1.join(roomId);
            p2.join(roomId);

            activeMatches[p1.id] = roomId;
            activeMatches[p2.id] = roomId;

            // On prévient les deux joueurs avec leur rôle respectif
            p1.emit('match_found', { opponent: "Joueur 2", role: 'p1' });
            p2.emit('match_found', { opponent: "Joueur 1", role: 'p2' });

            console.log(`Match 1V1 lancé dans la room ${roomId}`);
        } else {
            // Pas encore d'adversaire, on met en attente
            waitingPlayer = socket;
            socket.emit('waiting_for_opponent');
            console.log(`Joueur ${socket.id} en attente...`);
        }
    });

    // Synchronisation des mouvements et actions
    socket.on('player_move', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) {
            socket.to(roomId).emit('opponent_move', data);
        }
    });

    socket.on('player_shoot', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) {
            socket.to(roomId).emit('opponent_shoot', data);
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        let roomId = activeMatches[socket.id];
        if (roomId) {
            io.to(roomId).emit('opponent_disconnected');
            delete activeMatches[socket.id];
        }
        console.log(`Joueur déconnecté : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
