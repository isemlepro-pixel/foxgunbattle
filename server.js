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
let botMatches = {}; // Gestion des parties contre les bots

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    // Mode Matchmaking Joueur vs Joueur
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

    // --- Mode Jouer contre un Bot ---
    socket.on('find_bot_match', (data) => {
        socket.username = data && data.username ? data.username : "Invité";
        playerHps[socket.id] = 100;

        // Initialisation des données du bot pour ce joueur
        botMatches[socket.id] = {
            player: { x: 0, y: 0, z: 0 },
            bot: { x: 5, y: 0, z: 5, hp: 100 }
        };

        // Confirmation du lancement de la partie contre le bot au client
        socket.emit('match_found', { opponent: "Bot_Fox", role: 'p1' });

        // Boucle d'IA du bot (exécutée toutes les 50ms)
        const botInterval = setInterval(() => {
            let match = botMatches[socket.id];
            if (!match) {
                clearInterval(botInterval);
                return;
            }

            let pPos = match.player;
            let bPos = match.bot;

            // Le bot se rapproche doucement du joueur
            if (bPos.x < pPos.x) bPos.x += 0.08;
            if (bPos.x > pPos.x) bPos.x -= 0.08;
            if (bPos.z < pPos.z) bPos.z += 0.08;
            if (bPos.z > pPos.z) bPos.z -= 0.08;

            // Envoi de la position du bot au client pour l'animer sur l'écran
            socket.emit('opponent_move', { x: bPos.x, y: bPos.y, z: bPos.z });

            // Le bot attaque le joueur s'il est proche
            let distance = Math.sqrt(Math.pow(pPos.x - bPos.x, 2) + Math.pow(pPos.z - bPos.z, 2));
            if (distance < 6) {
                socket.emit('opponent_shoot');
                playerHps[socket.id] = (playerHps[socket.id] || 100) - 1;
                socket.emit('take_damage', { damage: 1 });

                if (playerHps[socket.id] <= 0) {
                    socket.emit('match_lost');
                    clearInterval(botInterval);
                    delete botMatches[socket.id];
                }
            }
        }, 50);

        socket.botInterval = botInterval;
    });

    socket.on('player_move', (data) => {
        let roomId = activeMatches[socket.id];
        if (roomId) {
            socket.to(roomId).emit('opponent_move', data);
        }
        if (botMatches[socket.id]) {
            botMatches[socket.id].player = data;
        }
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

        // --- Gestion des dégâts infligés au Bot par le joueur ---
        if (botMatches[socket.id]) {
            let match = botMatches[socket.id];
            match.bot.hp -= data.damage;
            socket.emit('hit_confirmed', { remainingHp: match.bot.hp });

            if (match.bot.hp <= 0) {
                socket.emit('match_won');
                clearInterval(socket.botInterval);
                delete botMatches[socket.id];
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

        if (botMatches[socket.id]) {
            clearInterval(socket.botInterval);
            delete botMatches[socket.id];
        }

        delete playerHps[socket.id];
        console.log(`Joueur déconnecté : ${socket.id}`);
    });
});
