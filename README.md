# Chatbot Project — Setup Guide

## What's inside
```
chatbot-project/
├── server.js          ← Node.js middleware (Groq + Claude support)
├── package.json
├── .env.example       ← Copy this to .env and fill in your keys
└── public/
    └── index.html     ← Browser chat UI for testing
```

---

## Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

---

## Step 2 — Install dependencies
```bash
cd chatbot-project
npm install
```

---

## Step 3 — Create your .env file
```bash
cp .env.example .env
```
Then open `.env` and fill in:

```
LLM_PROVIDER=groq                          # or "claude"
GROQ_API_KEY=your_groq_key_here            # from https://console.groq.com (free)
CLAUDE_API_KEY=your_claude_key_here        # from https://console.anthropic.com
BACKEND_BASE_URL=https://your-app.onrender.com
PORT=3000
```

---

## Step 4 — Start the server
```bash
npm run dev
```
You'll see:
```
🤖 LLM Provider: GROQ
🌐 Backend URL:  https://your-app.onrender.com
✅ Chatbot server running → http://localhost:3000
```

---

## Step 5 — Open the chat UI
Open your browser and go to:
```
http://localhost:3000
```

---

## Switch between Groq and Claude
Just change one line in your `.env` file:
```
LLM_PROVIDER=groq     # free, fast
LLM_PROVIDER=claude   # smarter, paid
```
Then restart the server.

---

## Test scenarios to try

### Contacts
- "Show me all my contacts"
- "Add a new contact"  → bot will ask for name, email, phone
- "Add contact: John Doe, john@email.com, 9876543210"  → fills all at once
- "Update contact with ID 3"

### Delivery Addresses
- "Show all my delivery addresses"
- "Add a new delivery address"  → bot asks field by field
- "Add address: 123 Main St, Sydney, NSW, 2000"  → fills all at once
- "Update delivery address ID 5"

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Cannot connect to server` | Make sure `npm run dev` is running |
| `401 Unauthorized` from LLM | Check your API key in `.env` |
| API calls failing | Check your `BACKEND_BASE_URL` in `.env` |
| Tool not being called | Rephrase your message more clearly |
