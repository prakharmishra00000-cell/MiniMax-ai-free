document.addEventListener('DOMContentLoaded', () => {
  // Auth Screen Elements
  const authScreen = document.getElementById('authScreen');
  const chatStudio = document.getElementById('chatStudio');
  const authForm = document.getElementById('authForm');
  const authUsername = document.getElementById('authUsername');
  const authPassword = document.getElementById('authPassword');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authError = document.getElementById('authError');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const registerFields = document.getElementById('registerFields');

  // Sidebar Elements
  const userAvatar = document.getElementById('userAvatar');
  const currentUsernameText = document.getElementById('currentUsername');
  const userSearchInput = document.getElementById('userSearchInput');
  const contactsList = document.getElementById('contactsList');
  const btnLogout = document.getElementById('btnLogout');

  // Active Chat Elements
  const chatPlaceholder = document.getElementById('chatPlaceholder');
  const activeChatPanel = document.getElementById('activeChatPanel');
  const activeContactAvatar = document.getElementById('activeContactAvatar');
  const activeContactUsername = document.getElementById('activeContactUsername');
  const activeContactStatus = document.getElementById('activeContactStatus');
  const messagesLog = document.getElementById('messagesLog');
  const typingIndicator = document.getElementById('typingIndicator');
  const typingIndicatorText = document.getElementById('typingIndicatorText');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');

  // App State
  let currentUser = JSON.parse(sessionStorage.getItem('chat_user')) || null;
  let activeContact = null;
  let socket = null;
  let isRegisterTab = false;
  let typingTimeout = null;

  // Init App on Load
  if (currentUser) {
    showChatStudio();
  }

  // Auth Tab Toggles
  tabLogin.addEventListener('click', () => {
    isRegisterTab = false;
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    registerFields.classList.add('hidden');
    authSubmitBtn.textContent = 'Sign In';
    authError.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    isRegisterTab = true;
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerFields.classList.remove('hidden');
    authSubmitBtn.textContent = 'Sign Up';
    authError.classList.add('hidden');
  });

  // Auth Submission (Login or Register)
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');

    const username = authUsername.value.trim();
    const password = authPassword.value;
    const avatarTheme = document.querySelector('input[name="avatarTheme"]:checked')?.value || 'bottts';

    const url = isRegisterTab ? '/api/register' : '/api/login';
    const body = isRegisterTab 
      ? { username, password, avatar: `https://api.dicebear.com/7.x/${avatarTheme}/svg?seed=${username}` }
      : { username, password };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authentication failed');

      currentUser = data.user;
      sessionStorage.setItem('chat_user', JSON.stringify(currentUser));
      showChatStudio();

    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    }
  });

  // Logout Trigger
  btnLogout.addEventListener('click', () => {
    if (socket) socket.disconnect();
    sessionStorage.removeItem('chat_user');
    currentUser = null;
    activeContact = null;
    
    chatStudio.classList.add('hidden');
    authScreen.classList.remove('hidden');
    authForm.reset();
  });

  // Switch to Chat Panel
  function showChatStudio() {
    authScreen.classList.add('hidden');
    chatStudio.classList.remove('hidden');

    // Load active profile Info
    userAvatar.src = currentUser.avatar;
    currentUsernameText.textContent = currentUser.username;

    // Connect to Sockets
    connectSocket();

    // Fetch and display initial users list
    loadContacts('');
  }

  // Socket Connection Controller
  function connectSocket() {
    socket = io();

    // Join Server Room
    socket.emit('join', currentUser.username);

    // Message event listener
    socket.on('message', (message) => {
      // If message is from/to the open chat thread, append to log
      const isFromActive = message.sender === activeContact;
      const isToActive = message.sender === currentUser.username && message.receiver === activeContact;

      if (isFromActive || isToActive) {
        appendMessage(message);
        messagesLog.scrollTop = messagesLog.scrollHeight;
      }
      
      // Update sidebar preview
      loadContacts(userSearchInput.value);
    });

    // Typing Event listener
    socket.on('typingStatus', ({ sender, isTyping }) => {
      if (sender === activeContact) {
        if (isTyping) {
          typingIndicatorText.textContent = `${sender} is typing...`;
          typingIndicator.classList.remove('hidden');
        } else {
          typingIndicator.classList.add('hidden');
        }
      }
    });

    // User online status change listener
    socket.on('userStatus', ({ username, online }) => {
      if (username === activeContact) {
        activeContactStatus.textContent = online ? 'online' : 'offline';
        activeContactStatus.className = `status-text ${online ? 'online' : ''}`;
      }
      // Refresh user cards statuses in sidebar
      const userCardDot = document.getElementById(`status-dot-${username}`);
      if (userCardDot) {
        userCardDot.className = `online-dot ${online ? '' : 'offline'}`;
      }
    });
  }

  // Load Contacts list
  async function loadContacts(query) {
    try {
      const response = await fetch(`/api/users/search?q=${query}`, {
        headers: { 'x-username': currentUser.username }
      });
      const users = await response.json();

      if (users.length === 0) {
        contactsList.innerHTML = '<li class="no-contacts">No contacts found</li>';
        return;
      }

      contactsList.innerHTML = '';
      users.forEach(user => {
        const li = document.createElement('li');
        if (activeContact === user.username) li.className = 'active';

        li.innerHTML = `
          <img src="${user.avatar}" alt="avatar" class="avatar">
          <div class="contact-info">
            <div class="contact-header">
              <span class="contact-name">${user.username}</span>
              <span id="status-dot-${user.username}" class="online-dot ${user.online ? '' : 'offline'}"></span>
            </div>
          </div>
        `;

        li.addEventListener('click', () => {
          selectContact(user);
        });

        contactsList.appendChild(li);
      });

    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  }

  // Handle Search Queries
  userSearchInput.addEventListener('input', (e) => {
    loadContacts(e.target.value.trim());
  });

  // Select User to Chat
  async function selectContact(user) {
    activeContact = user.username;

    // Highlight selected contact card in sidebar list
    const items = contactsList.querySelectorAll('li');
    items.forEach(item => {
      const name = item.querySelector('.contact-name')?.textContent;
      item.className = name === activeContact ? 'active' : '';
    });

    // Toggle active chat panels
    chatPlaceholder.classList.add('hidden');
    activeChatPanel.classList.remove('hidden');

    // Populate active chat header details
    activeContactAvatar.src = user.avatar;
    activeContactUsername.textContent = user.username;
    activeContactStatus.textContent = user.online ? 'online' : 'offline';
    activeContactStatus.className = `status-text ${user.online ? 'online' : ''}`;

    // Load message history log
    messagesLog.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-style: italic;">Loading conversation...</div>';
    
    try {
      const response = await fetch(`/api/messages?withUser=${activeContact}`, {
        headers: { 'x-username': currentUser.username }
      });
      const messages = await response.json();

      messagesLog.innerHTML = '';
      if (messages.length === 0) {
        messagesLog.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px; font-size: 13.5px;">No messages yet. Send a greeting to start the conversation!</div>';
      } else {
        messages.forEach(msg => appendMessage(msg));
      }
      messagesLog.scrollTop = messagesLog.scrollHeight;

    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }

  // Output Message Bubble to Chat Log DOM
  function appendMessage(message) {
    const isSent = message.sender === currentUser.username;
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;

    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    wrapper.innerHTML = `
      <div class="message-bubble">
        ${escapeHTML(message.text)}
      </div>
      <span class="message-time">${timeString}</span>
    `;

    messagesLog.appendChild(wrapper);
  }

  // Send message submit trigger
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !activeContact) return;

    // Send via socket
    socket.emit('sendMessage', { receiver: activeContact, text });

    // Notify typing stopped
    socket.emit('typing', { receiver: activeContact, isTyping: false });

    messageInput.value = '';
    messageInput.style.height = 'auto';
  });

  // Handle typing event updates & Debounce typing indicators
  messageInput.addEventListener('input', () => {
    if (!activeContact) return;

    // Send typing status
    socket.emit('typing', { receiver: activeContact, isTyping: true });

    // Clear older timeouts
    if (typingTimeout) clearTimeout(typingTimeout);

    // Set timeout to send stopped typing notice
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { receiver: activeContact, isTyping: false });
    }, 2000);
  });

  // Handle Enter to submit, Shift+Enter for newline
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      messageForm.requestSubmit();
    }
  });

  // Escape HTML helper
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
});
