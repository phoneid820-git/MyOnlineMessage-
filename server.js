const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Database (In-memory for real-time speed)
let onlineUsers = {}; // { userId: socketId }
let allMessages = []; // No delete policy: Unlimited messages store

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. USER LOGIN & DASHBOARD SYNC
    socket.on('user-login', (userId) => {
        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        console.log(`${userId} is now online.`);
        
        // Broadcast online status for blue tick/sync icon
        io.emit('user-status-update', { userId: userId, status: 'online' });
    });

    // 2. UNLIMITED REAL-TIME MESSAGING
    socket.on('send-message', (data) => {
        // Data contains: sender, receiver, text, type (text/image/video/audio/voice)
        const messageData = {
            sender: data.sender,
            receiver: data.receiver,
            content: data.content,
            type: data.type, // 'text', 'image', 'video', 'audio', 'voice', 'song'
            timestamp: new Date().getTime(),
            status: 'sent'
        };

        // Store message (No delete policy)
        allMessages.push(messageData);

        // Send to receiver if online
        const receiverSocketId = onlineUsers[data.receiver];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive-message', messageData);
            // Delivery status update (Double Tick/Blue Tick logic)
            io.to(onlineUsers[data.sender]).emit('message-status', { 
                msgId: messageData.timestamp, 
                status: 'delivered' 
            });
        }
    });

    // 3. AUDIO CALL NOTIFICATION & REAL-TIME SIGNALING
    socket.on('initiate-audio-call', (data) => {
        const targetSocketId = onlineUsers[data.targetId];
        if (targetSocketId) {
            // Send call notification to target
            io.to(targetSocketId).emit('incoming-call-notification', {
                callerId: socket.userId,
                callerName: data.callerName,
                type: 'audio'
            });
        } else {
            socket.emit('call-error', { message: "User is offline" });
        }
    });

    socket.on('accept-call', (data) => {
        const callerSocketId = onlineUsers[data.callerId];
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-accepted', { receiverId: socket.userId });
        }
    });

    socket.on('reject-call', (data) => {
        const callerSocketId = onlineUsers[data.callerId];
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-rejected', { reason: 'busy' });
        }
    });

    // 4. DISCONNECT LOGIC
    socket.on('disconnect', () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit('user-status-update', { userId: socket.userId, status: 'offline' });
        }
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

