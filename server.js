const http = require("http");
const { Server } = require("socket.io");
const { LinkedList, Room } = require("./dataTypes");
const path = require("path");

const PORT = 0;
const ROOM_ID_LENGTH = 6;
const CLIENT_WAITING_THRESHOLD = 2;
const CLIENT_ORIGIN = ["*"];

let waitingClients = new LinkedList();
const customQueue = new Map();
const activeRooms = new Map();
const userColors = {};

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

io.on("connection", socket => {
    console.log(socket.id, " connected");

    socket.on("joinRoom", color => handleJoinRoom(socket, color));
    socket.on("joinCustomRoom", data => handleJoinCustomRoom(socket, data));
    socket.on("disconnect", () => handleDisconnect(socket));
    socket.on("cutAndPlace", data => handleCutAndPlace(socket, data));
    socket.on("lost", data => handleLost(socket, data));
    socket.on("rematchRequest", () => handleRematchRequest(socket));
    socket.on("findOtherPlayerReq", color => handleFindOtherPlayerReq(socket, color));
});

function handleFindOtherPlayerReq(socket, color) {
    const roomId = getRoomIdByClient(socket);
    const room = activeRooms.get(roomId);

    if (!room || checkBothLost(roomId, socket)) {
        if (room) socket.to(getOtherPlayerId(roomId, socket.id)).emit("opponentDisconnected");
        socket.leave(roomId);
        activeRooms.delete(roomId);
        console.log(`${roomId} destroyed`);
        handleJoinRoom(socket, color);
    }
}

function handleCutAndPlace(socket, data) {
    const roomId = getRoomIdByClient(socket);
    activeRooms.get(roomId).score[socket.id]++;

    console.log(activeRooms.get(roomId).score);
    socket.to(roomId).emit("cutAndPlace", data);
}

function handleLost(socket, data) {
    const roomId = getRoomIdByClient(socket);

    if (activeRooms.get(roomId).status[socket.id] == "lost") return;
    activeRooms.get(roomId).status[socket.id] = "lost";
    if (activeRooms.get(roomId).status[getOtherPlayerId(roomId, socket.id)] == "lost") {
        io.to(roomId).emit("both-lost");
    }

    socket.to(getOtherPlayerId(roomId, socket.id)).emit("lost", data);
}

function handleRematchRequest(socket) {
    console.log(socket.id + " requested a rematch");
    const roomId = getRoomIdByClient(socket);
    const room = activeRooms.get(roomId);

    if (!room || room.status[socket.id] !== "lost") return;

    const otherPlayerId = getOtherPlayerId(roomId, socket.id);

    if (room.status[otherPlayerId] !== "lost" || room.rematchInitiator === socket.id) return;
    io.to(otherPlayerId).emit("rematchRequest");

    const isRematchRequested = room.rematchRequest;

    if (!isRematchRequested) {
        room.rematchRequest = true;
        room.rematchInitiator = socket.id;
    } else if (room.rematchInitiator === otherPlayerId) {
        initiateRoomRematch(roomId, socket.id, otherPlayerId);
    }
}

function initiateRoomRematch(roomId, playerId1, playerId2) {
    const room = new Room(playerId1, playerId2);
    activeRooms.set(roomId, { ...room, rematchRequest: false, rematchInitiator: null });

    io.to(roomId).emit("initiateRematch");
}

function handleJoinRoom(socket, color) {
    console.log(socket.id, " room join request");

    if (waitingClients.includes(socket.id) || Array.from(socket.rooms).length > 1) {
        console.log(socket.id, " already in the queue or room");
        return;
    }

    waitingClients.queue(socket.id);
    userColors[socket.id] = color;

    if (waitingClients.length >= CLIENT_WAITING_THRESHOLD) {
        const [player1, player2] = createRoom();
        const roomId = generateRoomId();
        player1.join(roomId);
        player2.join(roomId);

        const room = new Room(player1.id, player2.id);
        activeRooms.set(roomId, room);

        const player1Color = userColors[player1.id];
        const player2Color = userColors[player2.id];

        [player1, player2].forEach(player => {
            io.to(player.id).emit("roomAssigned", {
                roomId,
                opponentColor: player.id === player1.id ? player2Color : player1Color
            });
            delete userColors[player.id];
        });

        console.log(`${roomId} created`);
    }
}

function handleJoinCustomRoom(socket, { color, customRoomName }) {
    if (!customQueue[customRoomName]) customQueue[customRoomName] = [];
    if (customQueue[customRoomName].length < CLIENT_WAITING_THRESHOLD - 1) {
        customQueue[customRoomName].push(socket);
        userColors[socket.id] = color;
        console.log(`${socket.id}  joined custom room: ${customRoomName}`);
    } else if (customQueue[customRoomName].length == CLIENT_WAITING_THRESHOLD - 1) {
        const player = customQueue[customRoomName][0];

        socket.join(customRoomName);
        player.join(customRoomName);

        const room = new Room(socket.id, player.id);
        activeRooms.set(customRoomName, room);

        socket.emit("roomAssigned", {
            roomId: customRoomName,
            opponentColor: userColors[player.id]
        });

        io.to(player.id).emit("roomAssigned", {
            roomId: customRoomName,
            opponentColor: color
        });

        delete customQueue[customRoomName];

        console.log(`${socket.id}  joined custom room: ${customRoomName}`);
        console.log(`${customRoomName} is now full`);
    } else {
        // console.log("Room already full");
        // send room full message
    }
}

function handleDisconnect(socket) {
    console.log(socket.id, " disconnected");
    for (const [roomId, room] of activeRooms.entries()) {
        if (room.players.includes(socket.id)) {
            io.to(getOtherPlayerId(roomId, socket.id)).emit("opponentDisconnected");
            if (room.status[socket.id] != "lost") room.status[socket.id] = "lost";
            if (checkBothLost(roomId, socket)) {
                activeRooms.delete(roomId);
                console.log(`${roomId} destroyed`);
                socket.leave(roomId);
            }
        }
    }
    removeFromWaitingQueue(socket.id);
}

function generateRoomId() {
    return Math.random().toString(36).substr(2, ROOM_ID_LENGTH);
}

function createRoom() {
    const player1 = io.sockets.sockets.get(waitingClients.dequeue());
    const player2 = io.sockets.sockets.get(waitingClients.dequeue());
    return [player1, player2];
}

function removeFromWaitingQueue(clientId) {
    waitingClients.removeNode(clientId);
    for (const key in customQueue) {
        customQueue[key] = customQueue[key].filter(c => c.id !== clientId);
    }
}

function getRoomIdByClient(client) {
    return Array.from(client.rooms)[1];
}

function getOtherPlayerId(roomId, clientId) {
    return activeRooms.get(roomId).players.find(id => id !== clientId);
}

function checkBothLost(roomId, socket) {
    const status = activeRooms.get(roomId).status;
    return status[socket.id] === "lost" && status[getOtherPlayerId(roomId, socket.id)] === "lost";
}

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
