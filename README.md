# WebRTC

A simple WebRTC video meeting app with:

*  Create / Join meeting by ID
*  Waiting room (host admits participants)
*  Multi-user video grid (camera/mic can be on/off)
*  Text chat + system messages
*  Node.js signaling server (Socket.IO)

---

## Project Structure

```
client/
  index.html
  app.js
  style.css

server/
  index.js
  package.json

typings/
```

---

## Requirements

* Node.js (recommended: 18+)
* npm

---

## Setup & Run (Local)

### 1) Install server dependencies

```bash
cd server
npm install
```

### 2) Start signaling server

```bash
npm start
```

Server runs on (example): `http://localhost:3000`
(If your server uses a different port, check `server/index.js`.)

### 3) Open the client

If your client is plain HTML/JS:

* Open `client/index.html` in the browser
  OR use VS Code Live Server.

---

## How to Use

1. Host creates a meeting → gets a Meeting ID
2. Others join using Meeting ID
3. Host admits users from waiting room
4. Everyone can see each other (when admitted)

---

## Git Workflow (Team)

We use:

* `main` = stable/release
* `develop` = active development (default)
* `feature/*` = new tasks

### Create a feature branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-task
```

### Push and open Pull Request

```bash
git push -u origin feature/your-task
```

Open PR: `feature/your-task` → `develop`

---

## Notes

* Do **not** commit `node_modules` (already ignored via `.gitignore`)
* If media permissions fail, allow camera/microphone in browser settings.

---

## License

MIT (or change as you prefer)
