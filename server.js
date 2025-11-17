const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create an HTTP server to serve the client files
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server: server });

// Room management
const rooms = {};

// Generate a random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Broadcast message to all players in a room
function broadcastToRoom(roomId, message, excludeClient = null) {
    if (!rooms[roomId] || !rooms[roomId].players) return;
    
    Object.keys(rooms[roomId].players).forEach(playerId => {
        const player = rooms[roomId].players[playerId];
        if (player.ws !== excludeClient && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

// Calculate the game result
function calculateResult(roomId) {
    if (!rooms[roomId] || Object.keys(rooms[roomId].players).length === 0) return null;
    
    const players = rooms[roomId].players;
    const playerIds = Object.keys(players);
    const numbers = playerIds.map(id => players[id].number);
    
    // Filter out any null/undefined numbers (shouldn't happen if all players submitted)
    const validNumbers = numbers.filter(num => num !== null && num !== undefined);
    if (validNumbers.length !== playerIds.length) return null;
    
    const sum = validNumbers.reduce((acc, num) => acc + num, 0);
    const target = sum * 0.7;
    
    // Find the winner
    let minDiff = Math.abs(validNumbers[0] - target);
    let winnerIndices = [0]; // Store indices of winners
    
    for (let i = 1; i < validNumbers.length; i++) {
        const diff = Math.abs(validNumbers[i] - target);
        
        if (diff < minDiff) {
            minDiff = diff;
            winnerIndices = [i]; // Reset winner indices
        } else if (diff === minDiff) {
            winnerIndices.push(i); // Add to winner indices for tie
        }
    }
    
    return {
        numbers: validNumbers,
        sum: sum,
        target: target,
        winnerIndices: winnerIndices,
        winnerPlayerIds: winnerIndices.map(index => playerIds[index])
    };
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    console.log('New client connected');
    
    // Handle messages from the client
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'create_room':
                    // Create a new room
                    let roomCode = generateRoomCode();
                    while (rooms[roomCode]) {
                        roomCode = generateRoomCode();
                    }
                    
                    rooms[roomCode] = {
                        adminId: ws,
                        players: {},
                        status: 'waiting'
                    };
                    
                    // Add the creating player to the room as admin
                    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    rooms[roomCode].players[playerId] = {
                        name: message.playerName,
                        ws: ws,
                        number: null,
                        wins: 0,
                        isReady: false
                    };
                    
                    // Send room info back to the creator
                    ws.send(JSON.stringify({
                        type: 'room_created',
                        roomCode: roomCode,
                        playerId: playerId,
                        playerName: message.playerName,
                        players: rooms[roomCode].players
                    }));
                    
                    console.log(`Room ${roomCode} created by player ${playerId} named ${message.playerName}`);
                    break;
                    
                case 'join_room':
                    // Join an existing room
                    const { roomCode: joinRoomCode, playerName: joinPlayerName } = message;
                    
                    if (!rooms[joinRoomCode]) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room does not exist'
                        }));
                        return;
                    }
                    
                    // Check if room is full (max 8 players)
                    if (Object.keys(rooms[joinRoomCode].players).length >= 8) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room is full'
                        }));
                        return;
                    }
                    
                    // Check if name is already taken
                    const existingNames = Object.values(rooms[joinRoomCode].players).map(p => p.name);
                    if (existingNames.includes(joinPlayerName)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Name already taken in this room'
                        }));
                        return;
                    }
                    
                    // Add the player to the room
                    const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    rooms[joinRoomCode].players[newPlayerId] = {
                        name: joinPlayerName,
                        ws: ws,
                        number: null,
                        wins: 0,
                        isReady: false
                    };
                    
                    // Broadcast player joined event to all players
                    broadcastToRoom(joinRoomCode, {
                        type: 'player_joined',
                        player: {
                            id: newPlayerId,
                            name: joinPlayerName,
                            wins: 0
                        },
                        players: rooms[joinRoomCode].players
                    }, ws); // Exclude the joining player since they'll get the room_joined message instead
                    
                    // Send room info back to the joining player
                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        roomCode: joinRoomCode,
                        playerId: newPlayerId,
                        playerName: joinPlayerName,
                        players: rooms[joinRoomCode].players
                    }));
                    
                    console.log(`Player ${newPlayerId} named ${joinPlayerName} joined room ${joinRoomCode}`);
                    break;
                    
                case 'start_round':
                    const { roomCode: startRoomCode } = message;
                    
                    if (!rooms[startRoomCode]) return;
                    
                    // Check if this is the admin
                    if (rooms[startRoomCode].adminId !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only admin can start the round'
                        }));
                        return;
                    }
                    
                    // Reset all players' numbers and ready status for the new round
                    Object.keys(rooms[startRoomCode].players).forEach(playerId => {
                        rooms[startRoomCode].players[playerId].number = null;
                        rooms[startRoomCode].players[playerId].isReady = false;
                    });
                    
                    rooms[startRoomCode].status = 'playing';
                    
                    // Notify all players that the round has started
                    broadcastToRoom(startRoomCode, {
                        type: 'round_started',
                        players: rooms[startRoomCode].players
                    });
                    
                    console.log(`Round started in room ${startRoomCode}`);
                    break;
                    
                case 'number_chosen':
                    const { playerId: numberPlayerId, roomCode: numberRoomCode, number } = message;
                    
                    if (!rooms[numberRoomCode]) return;
                    
                    // Validate the number
                    if (isNaN(number) || number < 0 || number > 100) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Number must be between 0 and 100'
                        }));
                        return;
                    }
                    
                    // Set the player's number
                    rooms[numberRoomCode].players[numberPlayerId].number = number;
                    
                    // Check if all players have submitted their numbers
                    const players = rooms[numberRoomCode].players;
                    const allSubmitted = Object.keys(players).every(id => players[id].number !== null);
                    
                    if (allSubmitted) {
                        const result = calculateResult(numberRoomCode);
                        
                        if (result) {
                            // Update wins for the winners
                            result.winnerPlayerIds.forEach(winnerId => {
                                rooms[numberRoomCode].players[winnerId].wins += 1;
                            });
                            
                            // Broadcast the result to all players
                            broadcastToRoom(numberRoomCode, {
                                type: 'round_result',
                                result: result,
                                players: rooms[numberRoomCode].players // Include updated win counts
                            });
                            
                            // Reset for next round but keep wins (players keep their win counts)
                            Object.keys(rooms[numberRoomCode].players).forEach(playerId => {
                                rooms[numberRoomCode].players[playerId].number = null;
                            });
                            rooms[numberRoomCode].status = 'waiting';
                        }
                    } else {
                        // Notify others that this player has submitted
                        broadcastToRoom(numberRoomCode, {
                            type: 'number_submitted',
                            playerId: numberPlayerId,
                            players: rooms[numberRoomCode].players
                        });
                    }
                    break;
                    
                case 'play_again':
                    const { roomCode: playAgainRoomCode } = message;
                    
                    if (!rooms[playAgainRoomCode]) return;
                    
                    // Check if this is the admin
                    if (rooms[playAgainRoomCode].adminId !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only admin can start the next round'
                        }));
                        return;
                    }
                    
                    // Reset all players' numbers and ready status for the new round
                    Object.keys(rooms[playAgainRoomCode].players).forEach(playerId => {
                        rooms[playAgainRoomCode].players[playerId].number = null;
                        rooms[playAgainRoomCode].players[playerId].isReady = false;
                    });
                    
                    rooms[playAgainRoomCode].status = 'waiting';
                    
                    // Notify all players that we're back to lobby
                    broadcastToRoom(playAgainRoomCode, {
                        type: 'play_again',
                        players: rooms[playAgainRoomCode].players
                    });
                    
                    console.log(`Play again initiated in room ${playAgainRoomCode}`);
                    break;
                    
                case 'kick_player':
                    const { playerId: kickPlayerId, roomCode: kickRoomCode } = message;
                    
                    if (!rooms[kickRoomCode]) return;
                    
                    // Check if this is the admin
                    if (rooms[kickRoomCode].adminId !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only admin can kick players'
                        }));
                        return;
                    }
                    
                    // Prevent admin from kicking themselves
                    if (kickPlayerId === Object.keys(rooms[kickRoomCode].players).find(id => 
                        rooms[kickRoomCode].players[id].ws === rooms[kickRoomCode].adminId)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Admin cannot kick themselves'
                        }));
                        return;
                    }
                    
                    // Get the player to kick
                    const playerToKick = rooms[kickRoomCode].players[kickPlayerId];
                    if (!playerToKick) return;
                    
                    // Remove the player from the room
                    delete rooms[kickRoomCode].players[kickPlayerId];
                    
                    // Notify the kicked player
                    playerToKick.ws.send(JSON.stringify({
                        type: 'kicked',
                        message: 'You have been kicked from the room'
                    }));
                    
                    // Notify other players that someone was kicked
                    broadcastToRoom(kickRoomCode, {
                        type: 'player_kicked',
                        playerId: kickPlayerId,
                        players: rooms[kickRoomCode].players
                    }, playerToKick.ws);
                    
                    // Close the kicked player's connection
                    playerToKick.ws.close();
                    
                    // If the room is now empty, delete it
                    if (Object.keys(rooms[kickRoomCode].players).length === 0) {
                        delete rooms[kickRoomCode];
                        console.log(`Room ${kickRoomCode} deleted (empty after kick)`);
                    }
                    
                    console.log(`Player ${kickPlayerId} was kicked from room ${kickRoomCode}`);
                    break;

                case 'play_again':
                    const { roomCode: restartRoomCode } = message;

                    if (!rooms[restartRoomCode]) return;

                    // Check if this is the admin
                    if (rooms[restartRoomCode].adminId !== ws) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Only admin can start the next round'
                        }));
                        return;
                    }

                    // Reset all players' numbers for the new round (but keep wins)
                    Object.keys(rooms[restartRoomCode].players).forEach(playerId => {
                        rooms[restartRoomCode].players[playerId].number = null;
                    });

                    rooms[restartRoomCode].status = 'waiting';

                    // Notify all players that we're ready for a new round
                    broadcastToRoom(restartRoomCode, {
                        type: 'play_again',
                        players: rooms[restartRoomCode].players
                    });

                    console.log(`Play again initiated in room ${restartRoomCode}`);
                    break;
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        
        // Find the room this client was in and remove them
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            let playerToRemove = null;
            let playerIdToRemove = null;
            
            for (const playerId in room.players) {
                if (room.players[playerId].ws === ws) {
                    playerToRemove = room.players[playerId];
                    playerIdToRemove = playerId;
                    break;
                }
            }
            
            if (playerToRemove) {
                // If this is the admin, make another player the new admin (if any left)
                if (room.adminId === ws && Object.keys(room.players).length > 1) {
                    // Get the first other player to be the new admin
                    const otherPlayerIds = Object.keys(room.players).filter(id => id !== playerIdToRemove);
                    if (otherPlayerIds.length > 0) {
                        const newAdminId = otherPlayerIds[0];
                        room.adminId = room.players[newAdminId].ws;
                    }
                }
                
                // Remove the player
                delete room.players[playerIdToRemove];
                
                // If the room is now empty, delete it
                if (Object.keys(room.players).length === 0) {
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted (empty)`);
                } else {
                    // Notify other players that someone left
                    broadcastToRoom(roomCode, {
                        type: 'player_left',
                        playerId: playerIdToRemove,
                        players: room.players
                    });
                }
                
                break; // Exit the loop since we found and removed the player
            }
        }
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Connect to ws://localhost:${PORT} for WebSocket connections`);
    console.log(`Access the game at http://localhost:${PORT}`);
});