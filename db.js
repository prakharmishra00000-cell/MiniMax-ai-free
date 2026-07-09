const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Initialize database
let data = {
  users: [],       // [{ id, username, password, avatar }]
  messages: []     // [{ id, sender, receiver, text, timestamp }]
};

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Error loading database file, starting clean:", e);
  }
} else {
  saveDB();
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Error saving database file:", e);
  }
}

module.exports = {
  getUsers: () => data.users,
  addUser: (username, password, avatar) => {
    const user = { 
      id: 'usr_' + Math.random().toString(36).substr(2, 9), 
      username, 
      password, 
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
    };
    data.users.push(user);
    saveDB();
    return user;
  },
  findUser: (username) => {
    return data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  },
  getMessagesBetween: (user1, user2) => {
    return data.messages.filter(msg => 
      (msg.sender === user1 && msg.receiver === user2) || 
      (msg.sender === user2 && msg.receiver === user1)
    );
  },
  addMessage: (sender, receiver, text) => {
    const msg = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      sender,
      receiver,
      text,
      timestamp: new Date().toISOString()
    };
    data.messages.push(msg);
    saveDB();
    return msg;
  }
};
