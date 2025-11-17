// DOM Elements
const homeScreen = document.getElementById('homeScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const resultsScreen = document.getElementById('resultsScreen');

// Home screen elements
const createRoomBtn = document.getElementById('createRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const playerNameInput = document.getElementById('playerNameInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');

// Lobby screen elements
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('playersList');
const readyBtn = document.getElementById('readyBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

// Game screen elements
const numberInput = document.getElementById('numberInput');
const submitNumberBtn = document.getElementById('submitNumberBtn');
const waitingPlayers = document.getElementById('waitingPlayers');

// Results screen elements
const numbersChosen = document.getElementById('numbersChosen');
const sumResult = document.getElementById('sumResult');
const calculatedResult = document.getElementById('calculatedResult');
const winnerResult = document.getElementById('winnerResult');
const playAgainBtn = document.getElementById('playAgainBtn');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// Game state
let ws = null;
let currentRoomCode = null;
let currentPlayerId = null;
let currentPlayerName = '';
let players = [];
let allPlayersReady = false;

// Initialize the game
function initGame() {
    setupEventListeners();
    connectToServer();
}

// Set up event listeners
function setupEventListeners() {
    // Home screen
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);
    
    // Lobby screen
    readyBtn.addEventListener('click', markPlayerReady);
    leaveRoomBtn.addEventListener('click', leaveRoom);
    
    // Game screen
    submitNumberBtn.addEventListener('click', submitNumber);
    numberInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitNumber();
        }
    });
    
    // Results screen
    playAgainBtn.addEventListener('click', resetRound);
    backToLobbyBtn.addEventListener('click', goToLobby);
}

// Connect to WebSocket server
function connectToServer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function(event) {
        console.log('Connected to WebSocket server');
        updateConnectionStatus(true);
    };
    
    ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };
    
    ws.onclose = function(event) {
        console.log('Disconnected from WebSocket server');
        updateConnectionStatus(false);
        
        // Attempt to reconnect after a delay
        setTimeout(connectToServer, 3000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
}

// Update connection status display
function updateConnectionStatus(connected) {
    let statusElement = document.querySelector('.connection-status');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.className = 'connection-status disconnected';
        statusElement.textContent = 'Disconnected';
        document.body.appendChild(statusElement);
    }
    
    if (connected) {
        statusElement.className = 'connection-status connected';
        statusElement.textContent = 'Connected';
    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.textContent = 'Disconnected';
    }
}

// Send message to server
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.error('WebSocket is not connected');
    }
}

// Handle incoming messages from server
function handleMessage(message) {
    switch(message.type) {
        case 'room_created':
            currentRoomCode = message.roomCode;
            currentPlayerId = message.playerId;
            roomCodeDisplay.textContent = currentRoomCode;
            showScreen(lobbyScreen);
            break;
            
        case 'room_joined':
            currentRoomCode = message.roomCode;
            currentPlayerId = message.playerId;
            roomCodeDisplay.textContent = currentRoomCode;
            updatePlayersList(message.players);
            showScreen(lobbyScreen);
            break;
            
        case 'player_joined':
            updatePlayersList(message.players);
            break;
            
        case 'player_ready_update':
            updatePlayersList(message.players);
            break;
            
        case 'game_starting':
            showScreen(gameScreen);
            resetGameScreen();
            break;
            
        case 'number_submitted':
            updateWaitingPlayers(message.playerId);
            break;
            
        case 'round_result':
            displayRoundResult(message.result);
            showScreen(resultsScreen);
            break;
            
        case 'round_reset':
            resetRoundUI();
            showScreen(lobbyScreen);
            break;
            
        case 'player_left':
            updatePlayersList(message.players);
            break;
            
        case 'error':
            alert(message.message);
            break;
    }
}

// Create a new room
function createRoom() {
    currentPlayerName = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
    sendMessage({
        type: 'create_room'
    });
}

// Join an existing room
function joinRoom() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        alert('Please enter a room code');
        return;
    }
    
    currentPlayerName = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
    sendMessage({
        type: 'join_room',
        roomCode: roomCode
    });
}

// Show a specific screen
function showScreen(screenElement) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    screenElement.classList.add('active');
}

// Update the players list in the lobby
function updatePlayersList(playerList) {
    players = playerList;
    playersList.innerHTML = '';
    
    players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = `player-item ${player.ready ? 'ready' : ''}`;
        
        const playerStatus = document.createElement('div');
        playerStatus.className = 'status-indicator';
        
        const playerName = document.createElement('span');
        playerName.textContent = player.id === currentPlayerId ? `${player.id} (You)` : player.id;
        
        playerElement.appendChild(playerStatus);
        playerElement.appendChild(playerName);
        playersList.appendChild(playerElement);
    });
}

// Mark the current player as ready
function markPlayerReady() {
    sendMessage({
        type: 'player_ready',
        playerId: currentPlayerId,
        roomCode: currentRoomCode
    });
    
    // Disable the ready button to prevent double-clicking
    readyBtn.disabled = true;
    readyBtn.textContent = 'Ready!';
    
    // Re-enable after a short delay
    setTimeout(() => {
        readyBtn.disabled = false;
        readyBtn.textContent = 'I\'m Ready';
    }, 1000);
}

// Leave the current room
function leaveRoom() {
    // In a real implementation, we would send a leave message to the server
    // For now, we'll just go back to the home screen
    currentRoomCode = null;
    currentPlayerId = null;
    players = [];
    showScreen(homeScreen);
}

// Reset game screen
function resetGameScreen() {
    numberInput.value = '';
    waitingPlayers.innerHTML = '';
    
    // Show all players as waiting
    players.forEach(player => {
        if (player.id !== currentPlayerId) { // Don't show current player as waiting
            const waitingElement = document.createElement('div');
            waitingElement.className = 'waiting-player';
            waitingElement.id = `waiting-${player.id}`;
            waitingElement.textContent = `${player.id}`;
            waitingPlayers.appendChild(waitingElement);
        }
    });
}

// Submit the chosen number
function submitNumber() {
    const number = parseInt(numberInput.value);
    
    if (isNaN(number) || number < 0 || number > 100) {
        alert('Please enter a valid number between 0 and 100');
        return;
    }
    
    sendMessage({
        type: 'choose_number',
        playerId: currentPlayerId,
        roomCode: currentRoomCode,
        number: number
    });
    
    // Disable input and button after submission
    numberInput.disabled = true;
    submitNumberBtn.disabled = true;
    submitNumberBtn.textContent = 'Submitted!';
}

// Update waiting players display
function updateWaitingPlayers(playerId) {
    const waitingElement = document.getElementById(`waiting-${playerId}`);
    if (waitingElement) {
        waitingElement.style.opacity = '0.5';
        waitingElement.style.textDecoration = 'line-through';
    }
}

// Display round results
function displayRoundResult(result) {
    numbersChosen.innerHTML = '';
    
    // Display all numbers with winner highlighting
    result.numbers.forEach((number, index) => {
        const numberElement = document.createElement('div');
        numberElement.className = `number-item ${result.winnerIndices.includes(index) ? 'winner' : ''}`;
        numberElement.textContent = `${players[index].id}: ${number}`;
        numbersChosen.appendChild(numberElement);
    });
    
    // Display calculations
    sumResult.textContent = result.sum;
    calculatedResult.textContent = result.target.toFixed(2);
    
    // Display winner(s)
    if (result.winnerIndices.length > 1) {
        // Tie scenario
        const playerNames = result.winnerIndices.map(index => players[index].id).join(' and ');
        winnerResult.textContent = `Tie between ${playerNames}!`;
    } else {
        // Single winner
        winnerResult.textContent = `${players[result.winnerIndices[0]].id} wins!`;
    }
}

// Reset the round (play again)
function resetRound() {
    sendMessage({
        type: 'reset_round',
        roomCode: currentRoomCode
    });
}

// Go back to lobby
function goToLobby() {
    showScreen(lobbyScreen);
}

// Reset round UI elements
function resetRoundUI() {
    // Reset game screen elements
    numberInput.value = '';
    numberInput.disabled = false;
    submitNumberBtn.disabled = false;
    submitNumberBtn.textContent = 'Submit Number';
    
    // Reset ready button
    readyBtn.disabled = false;
    readyBtn.textContent = 'I\'m Ready';
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', initGame);