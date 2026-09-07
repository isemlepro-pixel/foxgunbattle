const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Utilise la variable d'environnement de Render ou ton lien MongoDB Atlas en secours
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://isemlepro_db_user:GYKKE9eLQwd5uSS3@cluster0.snwld4m.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "foxgunbattle";

let db;

// Connexion à MongoDB
MongoClient.connect(MONGO_URI)
    .then(client => {
        db = client.db(DB_NAME);
        console.log("Connecté avec succès à la base de données MongoDB !");
        
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
    })
    .catch(err => {
        console.error("Erreur de connexion à MongoDB :", err);
    });

// Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ success: false, message: "Champs vides !" });
        
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ username });

        if (existingUser) {
            return res.json({ success: false, message: "Ce pseudo existe déjà !" });
        }

        await usersCollection.insertOne({ username, password, wins: 0, losses: 0 });
        res.json({ success: true, username });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: "Erreur serveur lors de l'inscription." });
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const usersCollection = db.collection('users');
        
        const user = await usersCollection.findOne({ username });

        if (!user || user.password !== password) {
            return res.json({ success: false, message: "Pseudo ou mot de passe incorrect !" });
        }

        res.json({ success: true, username });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: "Erreur serveur lors de la connexion." });
    }
});

let waitingPlayer = null;
let activeMatches = {};
let playerHps = {};

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
            let socketsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (socketsInRoom) {
                for (let socketId of socketsInRoom) {
                    if (socketId !== socket.id) {
                        playerHps[socketId] = (playerHps[socketId] || 100) - data.damage;
                        let currentHp = playerHps[socketId];

                        io.to(socketId).emit('take_damage', { damage: data.damage });
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
