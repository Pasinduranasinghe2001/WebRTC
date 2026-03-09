# WebRTC

A simple WebRTC video meeting app with:

* Create / Join meeting by ID
* Waiting room (host admits participants)
* Multi-user video grid (camera/mic can be on/off)
* Text chat + system messages
* Node.js signaling server (Socket.IO)

---

## Live Links

* **App (Frontend):** YOUR_FRONTEND_URL_HERE
* **Signaling Server (Render):** https://webrtc-s0xb.onrender.com

> Render free tier may sleep when inactive. First request can take a bit to wake up.

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

## Configure Server URL (IMPORTANT)

When deploying, the client must connect to the online server URL (not localhost).

In `client/app.js`, set your server URL like this:

```js
const SERVER_URL = "https://webrtc-s0xb.onrender.com"; // Render server
const socket = io(SERVER_URL);
```

If you're running locally, use:

```js
const SERVER_URL = "http://localhost:3000";
```

---

## How to Use

1. Host creates a meeting → gets a Meeting ID
2. Others join using Meeting ID
3. Host admits users from waiting room
4. Everyone can see each other (when admitted)

---

## Deploy

### Backend (Render)

1. Create a **Web Service** on Render
2. Connect GitHub repo
3. Select branch: `main` (recommended)
4. Set:

   * **Root Directory:** `server`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
5. Ensure your server listens on Render's port:

   * `process.env.PORT || 3000`

After deploy, Render provides a URL like:
`https://webrtc-s0xb.onrender.com`

### Frontend (Static Hosting)

Deploy the `client/` folder using one of these:

* **Netlify** (easy drag & drop)
* **Vercel**
* **GitHub Pages**

After the frontend is deployed:

1. Put your frontend URL into the **Live Links** section above
2. Ensure `client/app.js` is using the Render server URL

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
* If the client cannot connect to the server after deployment, check CORS settings in `server/index.js`.

---

