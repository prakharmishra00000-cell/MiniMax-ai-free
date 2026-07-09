const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Store user online socket mappings
const activeUsers = new Map(); // username -> socketId

// Register Endpoint
app.post('/api/register', (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const existing = db.findUser(username);
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const user = db.addUser(username, password, avatar);
  res.json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
});

// Login Endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.findUser(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
});

// User Search Endpoint
app.get('/api/users/search', (req, res) => {
  const { q } = req.query;
  const currentUsername = req.headers['x-username'];

  let users = db.getUsers().map(u => ({ username: u.username, avatar: u.avatar }));
  
  // Filter out current user
  if (currentUsername) {
    users = users.filter(u => u.username.toLowerCase() !== currentUsername.toLowerCase());
  }

  // Filter search query
  if (q) {
    users = users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()));
  }

  // Inject online status
  users = users.map(u => ({
    ...u,
    online: activeUsers.has(u.username)
  }));

  res.json(users);
});

// Fetch Messages Endpoint
app.get('/api/messages', (req, res) => {
  const { withUser } = req.query;
  const currentUsername = req.headers['x-username'];

  if (!currentUsername || !withUser) {
    return res.status(400).json({ error: 'Sender and receiver parameters are required' });
  }

  const messages = db.getMessagesBetween(currentUsername, withUser);
  res.json(messages);
});

// Socket.io Communication Engine
io.on('connection', (socket) => {
  let socketUsername = '';

  // Register username mapping on connect/join
  socket.on('join', (username) => {
    socketUsername = username;
    activeUsers.set(username, socket.id);
    
    // Broadcast user login status
    io.emit('userStatus', { username, online: true });
    
    console.log(`User registered socket: ${username} (${socket.id})`);
  });

  // Handle outgoing chat messages
  socket.on('sendMessage', ({ receiver, text }) => {
    if (!socketUsername || !receiver || !text) return;

    // Save message to database
    const message = db.addMessage(socketUsername, receiver, text);

    // Send to recipient if online
    const receiverSocketId = activeUsers.get(receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message', message);
    }

    // Echo back to sender
    socket.emit('message', message);
  });

  // Handle typing status updates
  socket.on('typing', ({ receiver, isTyping }) => {
    const receiverSocketId = activeUsers.get(receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typingStatus', { sender: socketUsername, isTyping });
    }
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    if (socketUsername) {
      activeUsers.delete(socketUsername);
      io.emit('userStatus', { username: socketUsername, online: false });
      console.log(`User disconnected socket: ${socketUsername}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Obsidian Chat Server running on http://localhost:${PORT}`);
});
