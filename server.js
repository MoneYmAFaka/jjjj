// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Security middleware
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Store waiting users
let waitingUsers = new Set();
let activeConnections = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
    const userId = uuidv4();
    ws.userId = userId;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Message handling error:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'find_partner':
            findPartner(ws);
            break;
        case 'video_offer':
        case 'video_answer':
        case 'ice_candidate':
            forwardToPartner(ws, data);
            break;
        case 'chat_message':
            if (activeConnections.has(ws.userId)) {
                const partnerId = activeConnections.get(ws.userId);
                const partnerWs = [...wss.clients].find(client => client.userId === partnerId);
                if (partnerWs) {
                    // Basic content moderation
                    const sanitizedMessage = moderateContent(data.message);
                    partnerWs.send(JSON.stringify({
                        type: 'chat_message',
                        message: sanitizedMessage
                    }));
                }
            }
            break;
    }
}

function findPartner(ws) {
    if (waitingUsers.size > 0) {
        const partner = [...waitingUsers][0];
        waitingUsers.delete(partner);
        
        // Match users
        activeConnections.set(ws.userId, partner.userId);
        activeConnections.set(partner.userId, ws.userId);

        // Notify both users
        ws.send(JSON.stringify({ type: 'partner_found' }));
        partner.send(JSON.stringify({ type: 'partner_found' }));
    } else {
        waitingUsers.add(ws);
        ws.send(JSON.stringify({ type: 'waiting' }));
    }
}

function handleDisconnect(ws) {
    waitingUsers.delete(ws);
    if (activeConnections.has(ws.userId)) {
        const partnerId = activeConnections.get(ws.userId);
        const partnerWs = [...wss.clients].find(client => client.userId === partnerId);
        if (partnerWs) {
            partnerWs.send(JSON.stringify({ type: 'partner_disconnected' }));
        }
        activeConnections.delete(partnerId);
        activeConnections.delete(ws.userId);
    }
}

function forwardToPartner(ws, data) {
    if (activeConnections.has(ws.userId)) {
        const partnerId = activeConnections.get(ws.userId);
        const partnerWs = [...wss.clients].find(client => client.userId === partnerId);
        if (partnerWs) {
            partnerWs.send(JSON.stringify(data));
        }
    }
}

function moderateContent(message) {
    // Basic content moderation
    const profanityList = ['badword1', 'badword2']; // Add actual profanity list
    let moderatedMessage = message;
    profanityList.forEach(word => {
        const regex = new RegExp(word, 'gi');
        moderatedMessage = moderatedMessage.replace(regex, '***');
    });
    return moderatedMessage;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Serve static files
app.use(express.static('public'));