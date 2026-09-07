const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Permet de charger le fichier index.html automatiquement
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Un joueur s\'est connecté');

    socket.on('find_match', () => {
        setTimeout(() => {
            socket.emit('match_found', { opponent: "Bot Tueur" });
        }, 1500);
    });

    socket.on('disconnect', () => {
        console.log('Un joueur est parti');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('Serveur lancé sur le port ' + PORT);
});