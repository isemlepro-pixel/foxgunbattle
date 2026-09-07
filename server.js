const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const USERS_FILE = path.join(__dirname, 'users.json');

function getUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({}));
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Champs vides !" });
    
    let users = getUsers();
    if (users[username]) {
        return res.json({ success: false, message: "Ce pseudo existe déjà !" });
    }

    users[username] = { password, wins: 0, losses: 0 };
    saveUsers(users);
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let users = getUsers();
    
    if (!users[username] || users[username].password !== password) {
        return res.json({ success: false, message: "Pseudo ou mot de passe incorrect !" });
    }

    res.json({ success: true, username });
});

let waitingPlayer = null;
let activeMatches = {};
let playerHps = {}; // Suit les PV des joueurs en direct

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    socket.on('find_match', (data) => {
        socket.username = data && data.username ? data.username : "Invité";
        playerHps[socket.id] = 100;

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            let p1 = waitingPlayer;
            let p2 = socket;
            waitingPlayer = null;

            let roomId = 'room_' + p1.id + '_' + p2.id;
            p1.join(roomId);
            p2.join(roomId);

            activeMatches[p1.id] = roomId;
            activeMatches[p2.id] = roomId;

            p1.emit('match_found', { opponent: p2.username, role: 'p1' });
            p2.emit('match_found', { opponent: p1.username, role: 'p2' });
        } else {
            waitingPlayer = socket;
            socket.emit('waiting_for_opponent');
        }
    });

    socket.on('player_move', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) socket.to(roomId).emit('opponent_move', data);
    });

    socket.on('player_shoot', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) socket.to(roomId).emit('opponent_shoot', data);
    });

    socket.on('player_attack', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) {
            // Trouve l'adversaire dans la même room
            let socketsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (socketsInRoom) {
                for (let socketId of socketsInRoom) {
                    if (socketId !== socket.id) {
                        // Inflige les dégâts à l'adversaire
                        playerHps[socketId] = (playerHps[socketId] || 100) - data.damage;
                        let currentHp = playerHps[socketId];

                        // Envoie ses nouveaux PV à l'adversaire
                        io.to(socketId).emit('take_damage', { damage: data.damage });
                        // Informe le tireur de l'impact et des PV restants de l'ennemi
                        socket.emit('hit_confirmed', { remainingHp: currentHp });

                        if (currentHp <= 0) {
                            socket.emit('match_won');
                            io.to(socketId).emit('match_lost');
                        }
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) waitingPlayer = null;
        let roomId = activeMatches[socket.id];
        if (roomId) {
            io.to(roomId).emit('opponent_disconnected');
            delete activeMatches[socket.id];
        }
        delete playerHps[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
