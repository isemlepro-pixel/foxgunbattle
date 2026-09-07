const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuration MongoDB Atlas
const mongoUri = process.env.MONGO_URI || "mongodb+srv://isemlepro_db_user:MonMotDePasse123@cluster0.snwld4m.mongodb.net/?retryWrites=true&w=majority";
const dbName = "foxgunbattle"; // Nom de ta base de données

let db, usersCollection;

// Connexion à MongoDB Atlas
MongoClient.connect(mongoUri)
  .then(client => {
    db = client.db(dbName);
    usersCollection = db.collection('users');
    console.log("Connecté à MongoDB Atlas avec succès !");
  })
  .catch(err => {
    console.error("Erreur de connexion à MongoDB :", err);
  });

// Servir les fichiers statiques directement depuis la racine (là où se trouve ton index.html)
app.use(express.static(__dirname));
app.use(express.json());

// Routes pour l'authentification et les comptes
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
    }
    try {
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "Ce nom d'utilisateur existe déjà." });
        }
        await usersCollection.insertOne({ username, password, stats: { wins: 0, losses: 0 } });
        res.json({ success: true, message: "Compte créé avec succès !" });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await usersCollection.findOne({ username, password });
        if (!user) {
            return res.status(400).json({ error: "Identifiants incorrects." });
        }
        res.json({ success: true, username: user.username, stats: user.stats });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur lors de la connexion." });
    }
});

// Gestion du jeu en temps réel avec Socket.io (et intégration du Bot)
const activeGames = {};

io.on('connection', (socket) => {
    console.log(`Un joueur s'est connecté : ${socket.id}`);

    // Lancement d'une partie contre un Bot
    socket.on('join-bot-game', () => {
        console.log(`Mode Bot activé pour le joueur : ${socket.id}`);

        // Initialisation de l'état de la partie pour ce joueur
        activeGames[socket.id] = {
            player: { x: 0, y: 0, z: 0, health: 100 },
            bot: { id: 'bot_1', x: 5, y: 0, z: 5, health: 100 }
        };

        // Boucle de mise à jour du bot (IA simple qui se rapproche du joueur) toutes les 50ms
        const botInterval = setInterval(() => {
            const game = activeGames[socket.id];
            if (!game) {
                clearInterval(botInterval);
                return;
            }

            // Logique de déplacement du bot vers le joueur
            if (game.bot.x < game.player.x) game.bot.x += 0.1;
            if (game.bot.x > game.player.x) game.bot.x -= 0.1;
            if (game.bot.z < game.player.z) game.bot.z += 0.1;
            if (game.bot.z > game.player.z) game.bot.z -= 0.1;

            // Envoi des nouvelles positions au client
            socket.emit('game-update', {
                player: game.player,
                bot: game.bot
            });
        }, 50);

        // Réception des mouvements du joueur réel
        socket.on('player-move', (data) => {
            if (activeGames[socket.id]) {
                activeGames[socket.id].player = data;
            }
        });

        // Gestion de la déconnexion en pleine partie bot
        socket.on('disconnect', () => {
            clearInterval(botInterval);
            delete activeGames[socket.id];
            console.log(`Partie bot fermée pour le joueur : ${socket.id}`);
        });
    });

    socket.on('disconnect', () => {
        console.log(`Joueur déconnecté : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
