const SIGNALING_URL = window.location.origin;

// ----- DOM -----
const home = document.getElementById("home");
const waiting = document.getElementById("waiting");
const meeting = document.getElementById("meeting");

const nameInput = document.getElementById("nameInput");
const meetingInput = document.getElementById("meetingInput");
const createBtn = document.getElementById("createBtn");
const joinHomeBtn = document.getElementById("joinHomeBtn");

const preMicBtn = document.getElementById("preMic");
const preCamBtn = document.getElementById("preCam");

const waitingInfo = document.getElementById("waitingInfo");
const cancelWait = document.getElementById("cancelWait");

const meetingIdEl = document.getElementById("meetingId");
const copyId = document.getElementById("copyId");
const renameBtn = document.getElementById("renameBtn");
const avatar = document.getElementById("avatar");

const statusEl = document.getElementById("status");
const countApproved = document.getElementById("countApproved");
const countWaiting = document.getElementById("countWaiting");
const hostNameEl = document.getElementById("hostName");
const meetingTimer = document.getElementById("meetingTimer");

const videoGrid = document.getElementById("videoGrid");
const localVideo = document.getElementById("localVideo");
const localMicBadge = document.getElementById("localMic");
const localCamBadge = document.getElementById("localCam");

const muteBtn = document.getElementById("muteBtn");
const camBtn = document.getElementById("camBtn");
const screenBtn = document.getElementById("screenBtn");
const flipCamBtn = document.getElementById("flipCamBtn");
const handBtn = document.getElementById("handBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const pipBtn = document.getElementById("pipBtn");
const leaveBtn = document.getElementById("leaveBtn");

const openHostPanelBtn = document.getElementById("openHostPanel");

const chatPane = document.getElementById("chatPane");
const chatToggle = document.getElementById("chatToggle");
const chatMin = document.getElementById("chatMin");
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");
const tabAll = document.getElementById("tabAll");
const tabDM = document.getElementById("tabDM");
const dmTarget = document.getElementById("dmTarget");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const camSelect = document.getElementById("camSelect");
const micSelect = document.getElementById("micSelect");
const applyDevices = document.getElementById("applyDevices");

const hostPanel = document.getElementById("hostPanel");
const closeHostPanel = document.getElementById("closeHostPanel");
const waitingList = document.getElementById("waitingList");
const hostTransferSelect = document.getElementById("hostTransferSelect");
const transferHostBtn = document.getElementById("transferHostBtn");

// ----- State -----
let socket;
let myId = null;
let roomId = "";
let myName = localStorage.getItem("ch_name") || "Guest";
let isHost = false;

let approvedUsers = []; // [{id,name,mic,cam}]
let waitingUsers = [];
let hostId = null;

let localStream = null;
let screenStream = null;
let mediaReady = false;

let micOn = false;
let camOn = false;
let screenSharing = false;
let handRaised = false;
let facingMode = "user";

let selectedCamId = "";
let selectedMicId = "";

// Timer
let timerInterval = null;
let timerStart = 0;

// Chat badge
let unreadCount = 0;
let chatVisible = true;

// peerId -> { pc, makingOffer, ignoreOffer, polite, videoEl, micBadge, camBadge, tileEl }
const peers = new Map();

// ----- Helpers -----
function setPage(which) {
  home.style.display = which === "home" ? "block" : "none";
  waiting.style.display = which === "waiting" ? "block" : "none";
  meeting.style.display = which === "meeting" ? "block" : "none";
}

function setStatus(t) { statusEl.textContent = t; }

function genMeetingId() {
  return (crypto.randomUUID?.() || String(Math.random())).replaceAll("-", "").slice(0, 12);
}

function setAvatar() {
  const ch = (myName.trim()[0] || "G").toUpperCase();
  avatar.textContent = ch;
}

function logMsg(text) {
  const div = document.createElement("div");
  const isSystem =
    text.startsWith("System:") ||
    text.startsWith("SYSTEM:") ||
    text.startsWith("🔔") ||
    text.startsWith("✅");

  div.className = "msg " + (isSystem ? "system" : "normal");
  div.textContent = isSystem ? text.replace(/^System:\s*/i, "") : text;

  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;

  // Update unread badge if chat is hidden
  if (!chatVisible) {
    unreadCount++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  let badge = chatToggle.querySelector(".chat-badge");
  if (unreadCount > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chat-badge";
      chatToggle.appendChild(badge);
    }
    badge.textContent = unreadCount > 99 ? "99+" : unreadCount;
  } else if (badge) {
    badge.remove();
  }
}

function hostNameFromId(id) {
  const u = approvedUsers.find(x => x.id === id);
  return u ? u.name : "—";
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); } catch { }
}

function refreshDMTargets() {
  dmTarget.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Select user…";
  dmTarget.appendChild(opt0);

  approvedUsers.filter(u => u.id !== myId).forEach(u => {
    const o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name;
    dmTarget.appendChild(o);
  });
}

function updateLocalBadges() {
  localMicBadge.textContent = micOn ? "🎤 ON" : "🎤 OFF";
  localMicBadge.className = "badge" + (micOn ? " on" : "");
  localCamBadge.textContent = camOn ? "📷 ON" : "📷 OFF";
  localCamBadge.className = "badge" + (camOn ? " on" : "");

  muteBtn.textContent = micOn ? "🎤 Mic: ON" : "🎤 Mic: OFF";
  muteBtn.className = "btn control " + (micOn ? "mic-on" : "mic-off");

  camBtn.textContent = camOn ? "📷 Cam: ON" : "📷 Cam: OFF";
  camBtn.className = "btn control " + (camOn ? "cam-on" : "cam-off");
}

// ----- Timer -----
function startTimer() {
  timerStart = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - timerStart;
    const h = String(Math.floor(elapsed / 3600000)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
    meetingTimer.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  meetingTimer.textContent = "00:00:00";
}

// ----- Devices -----
async function loadDevices() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    tmp.getTracks().forEach(t => t.stop());
  } catch { }

  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter(d => d.kind === "videoinput");
  const mics = devs.filter(d => d.kind === "audioinput");

  camSelect.innerHTML = "";
  micSelect.innerHTML = "";

  cams.forEach((d, i) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `Camera ${i + 1}`;
    camSelect.appendChild(o);
  });

  mics.forEach((d, i) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `Mic ${i + 1}`;
    micSelect.appendChild(o);
  });

  if (!selectedCamId && cams[0]) selectedCamId = cams[0].deviceId;
  if (!selectedMicId && mics[0]) selectedMicId = mics[0].deviceId;

  if (selectedCamId) camSelect.value = selectedCamId;
  if (selectedMicId) micSelect.value = selectedMicId;
}

async function startLocalMedia() {
  if (localStream) localStream.getTracks().forEach(t => t.stop());

  const videoConstraint = selectedCamId
    ? { deviceId: { exact: selectedCamId } }
    : { facingMode };

  const constraints = {
    video: videoConstraint,
    audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
  };

  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  const a = localStream.getAudioTracks()[0];
  const v = localStream.getVideoTracks()[0];
  if (a) a.enabled = micOn;
  if (v) v.enabled = camOn;

  localVideo.srcObject = localStream;
  mediaReady = true;

  updateLocalBadges();
  emitMediaState();

  // Ensure our tracks are attached to all existing peer connections
  for (const p of peers.values()) {
    attachTracksToPeerPC(p.pc);
  }
}

function attachTracksToPeerPC(pc) {
  if (!localStream) return;

  const senders = pc.getSenders();
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];

  // Audio
  let aSender = senders.find(s => s.track && s.track.kind === "audio");
  if (!aSender && audioTrack) {
    aSender = pc.addTrack(audioTrack, localStream);
  } else if (aSender && audioTrack) {
    aSender.replaceTrack(audioTrack);
  }

  // Video
  let vSender = senders.find(s => s.track && s.track.kind === "video");
  if (!vSender && videoTrack) {
    vSender = pc.addTrack(videoTrack, localStream);
  } else if (vSender && videoTrack) {
    vSender.replaceTrack(videoTrack);
  }

  // Trigger renegotiation
  if (pc.signalingState === "stable") {
    pc.dispatchEvent(new Event("negotiationneeded"));
  }
}

// ----- Screen Sharing -----
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    return; // user cancelled
  }

  const screenTrack = screenStream.getVideoTracks()[0];

  // Replace video track in all peer connections
  for (const p of peers.values()) {
    const senders = p.pc.getSenders();
    const vSender = senders.find(s => s.track && s.track.kind === "video");
    if (vSender) await vSender.replaceTrack(screenTrack);
  }

  // Show screen share in local tile
  localVideo.srcObject = screenStream;
  screenSharing = true;

  screenBtn.textContent = "🖥️ Stop Sharing";
  screenBtn.className = "btn control screen-on";

  // Update local tile visual
  const localTile = videoGrid.querySelector('.tile[data-peer="local"]');
  if (localTile) localTile.classList.add("screen-sharing");

  // Broadcast screen state
  if (socket && roomId) socket.emit("screen-state", { roomId, sharing: true });

  // When user stops via browser native button
  screenTrack.onended = () => stopScreenShare();
}

async function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }

  screenSharing = false;
  screenBtn.textContent = "🖥️ Share Screen";
  screenBtn.className = "btn control purple";

  const localTile = videoGrid.querySelector('.tile[data-peer="local"]');
  if (localTile) localTile.classList.remove("screen-sharing");

  // Revert to camera
  if (localStream) {
    localVideo.srcObject = localStream;
    const camTrack = localStream.getVideoTracks()[0];
    if (camTrack) {
      for (const p of peers.values()) {
        const senders = p.pc.getSenders();
        const vSender = senders.find(s => s.track && s.track.kind === "video");
        if (vSender) await vSender.replaceTrack(camTrack);
      }
    }
  }

  if (socket && roomId) socket.emit("screen-state", { roomId, sharing: false });
}

// ----- Camera Flip -----
async function flipCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";

  // Stop current video
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.stop());
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) return;

    // Replace in local stream
    const oldVideoTrack = localStream.getVideoTracks()[0];
    if (oldVideoTrack) localStream.removeTrack(oldVideoTrack);
    localStream.addTrack(newVideoTrack);

    newVideoTrack.enabled = camOn;
    localVideo.srcObject = localStream;

    // Replace in all peer connections
    for (const p of peers.values()) {
      const senders = p.pc.getSenders();
      const vSender = senders.find(s => s.track && s.track.kind === "video");
      if (vSender) await vSender.replaceTrack(newVideoTrack);
    }

    logMsg("System: Camera flipped ✅");
  } catch (e) {
    logMsg("System: Could not flip camera — " + e.message);
    facingMode = facingMode === "user" ? "environment" : "user"; // revert
  }
}

// ----- Floating Emoji -----
function showFloatingEmoji(emoji) {
  const el = document.createElement("div");
  el.className = "floating-emoji";
  el.textContent = emoji;
  el.style.left = (Math.random() * 60 + 20) + "%";
  el.style.bottom = "100px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ----- Tiles -----
function makePeerTile(peerId, peerName) {
  const tile = document.createElement("div");
  tile.className = "tile card";
  tile.dataset.peer = peerId;

  const top = document.createElement("div");
  top.className = "tileTop";

  const micB = document.createElement("span");
  micB.className = "badge";
  micB.textContent = "🎤 OFF";

  const camB = document.createElement("span");
  camB.className = "badge";
  camB.textContent = "📷 OFF";

  const badgeWrap = document.createElement("span");
  badgeWrap.className = "badges";
  badgeWrap.appendChild(micB);
  badgeWrap.appendChild(camB);

  top.innerHTML = `<span class="dot blue"></span><span>${peerName}</span>`;
  top.appendChild(badgeWrap);

  const vid = document.createElement("video");
  vid.autoplay = true;
  vid.playsInline = true;

  tile.appendChild(top);
  tile.appendChild(vid);

  videoGrid.appendChild(tile);
  return { videoEl: vid, micBadge: micB, camBadge: camB, tileEl: tile };
}

function removePeerTile(peerId) {
  const t = videoGrid.querySelector(`.tile[data-peer="${peerId}"]`);
  if (t) t.remove();
}

// ----- Perfect Negotiation -----
function ensurePeer(peerId, peerName) {
  if (peers.has(peerId)) return peers.get(peerId);

  const polite = String(myId) < String(peerId); // deterministic
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },

      // Free TURN server (for testing)
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  });

  const tile = makePeerTile(peerId, peerName);

  const state = {
    pc,
    makingOffer: false,
    ignoreOffer: false,
    polite,
    videoEl: tile.videoEl,
    micBadge: tile.micBadge,
    camBadge: tile.camBadge,
    tileEl: tile.tileEl,
  };
  peers.set(peerId, state);

  if (mediaReady) attachTracksToPeerPC(pc);

  pc.ontrack = (ev) => {
    state.videoEl.srcObject = ev.streams[0];
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit("signal", { roomId, to: peerId, data: { candidate } });
  };

  pc.onnegotiationneeded = async () => {
    try {
      state.makingOffer = true;
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit("signal", { roomId, to: peerId, data: { description: pc.localDescription } });
    } catch (e) {
      // ignore
    } finally {
      state.makingOffer = false;
    }
  };

  return state;
}

async function handleSignal(from, data) {
  const user = approvedUsers.find(u => u.id === from);
  const peerName = user ? user.name : "Participant";
  const p = ensurePeer(from, peerName);
  const pc = p.pc;

  if (data.description) {
    const description = data.description;
    const offerCollision =
      description.type === "offer" && (p.makingOffer || pc.signalingState !== "stable");

    p.ignoreOffer = !p.polite && offerCollision;
    if (p.ignoreOffer) return;

    await pc.setRemoteDescription(description);
    if (description.type === "offer") {
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit("signal", { roomId, to: from, data: { description: pc.localDescription } });
    }
  } else if (data.candidate) {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      if (!p.ignoreOffer) throw e;
    }
  }
}

// ----- Roster sync -----
function syncPeersWithRoster() {
  if (!myId) return;

  const rosterIds = new Set(approvedUsers.map(u => u.id));
  rosterIds.delete(myId);

  for (const u of approvedUsers) {
    if (u.id === myId) continue;
    ensurePeer(u.id, u.name);
  }

  for (const peerId of Array.from(peers.keys())) {
    if (!rosterIds.has(peerId)) {
      peers.get(peerId).pc.close();
      peers.delete(peerId);
      removePeerTile(peerId);
    }
  }

  if (mediaReady) {
    for (const p of peers.values()) attachTracksToPeerPC(p.pc);
  }

  for (const u of approvedUsers) {
    if (u.id === myId) continue;
    const p = peers.get(u.id);
    if (!p) continue;
    p.micBadge.textContent = u.mic ? "🎤 ON" : "🎤 OFF";
    p.micBadge.className = "badge" + (u.mic ? " on" : "");
    p.camBadge.textContent = u.cam ? "📷 ON" : "📷 OFF";
    p.camBadge.className = "badge" + (u.cam ? " on" : "");
  }
}

// ----- Media state broadcast -----
function emitMediaState() {
  if (!roomId) return;
  socket.emit("media-state", { roomId, mic: micOn, cam: camOn });
}

// ----- Host UI -----
function renderHostWaitingList() {
  waitingList.innerHTML = "";
  if (!waitingUsers.length) {
    waitingList.innerHTML = `<div class="muted">No users waiting.</div>`;
    return;
  }

  waitingUsers.forEach(u => {
    const row = document.createElement("div");
    row.className = "listItem";
    row.innerHTML = `
      <div><b>${u.name}</b><div class="muted small">${u.id}</div></div>
      <div class="row">
        <button class="btn small success" data-approve="${u.id}">✅ Approve</button>
        <button class="btn small danger" data-reject="${u.id}">✕ Reject</button>
      </div>
    `;
    waitingList.appendChild(row);
  });

  waitingList.querySelectorAll("[data-approve]").forEach(btn => {
    btn.onclick = () => socket.emit("approve-user", { roomId, userId: btn.dataset.approve });
  });
  waitingList.querySelectorAll("[data-reject]").forEach(btn => {
    btn.onclick = () => socket.emit("reject-user", { roomId, userId: btn.dataset.reject });
  });
}

function renderHostTransferList() {
  hostTransferSelect.innerHTML = "";
  approvedUsers.filter(u => u.id !== hostId).forEach(u => {
    const o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name;
    hostTransferSelect.appendChild(o);
  });
}

// ----- Socket -----
function connectSocket() {
  socket = io(SIGNALING_URL, { transports: ["websocket"] });

  socket.on("waiting", () => {
    setPage("waiting");
    waitingInfo.textContent = "Waiting for host approval...";
    isHost = false;
  });

  socket.on("join-rejected", () => {
    alert("Host rejected your request.");
    setPage("home");
  });

  socket.on("join-approved", async ({ roomId: rid, myId: sid, host }) => {
    roomId = rid;
    myId = sid;
    isHost = host;

    meetingIdEl.textContent = roomId;
    setPage("meeting");
    setStatus("Starting media...");

    mediaReady = false;
    await startLocalMedia();

    startTimer();
    setStatus("Connected ✅");
    logMsg("System: You joined the meeting.");

    if (isHost) hostPanel.style.display = "grid";
  });

  socket.on("peer-list", ({ peers: list }) => {
    // no-op — room-state handles UI and sync
  });

  socket.on("room-state", (snap) => {
    hostId = snap.hostId;
    approvedUsers = snap.approved;
    waitingUsers = snap.waiting;

    countApproved.textContent = String(approvedUsers.length);
    countWaiting.textContent = String(waitingUsers.length);
    hostNameEl.textContent = hostNameFromId(hostId);

    refreshDMTargets();

    if (isHost) {
      renderHostWaitingList();
      renderHostTransferList();
      if (waitingUsers.length > 0) hostPanel.style.display = "grid";
    }

    syncPeersWithRoster();
  });

  socket.on("media-state", ({ id, mic, cam }) => {
    const p = peers.get(id);
    if (p) {
      p.micBadge.textContent = mic ? "🎤 ON" : "🎤 OFF";
      p.micBadge.className = "badge" + (mic ? " on" : "");
      p.camBadge.textContent = cam ? "📷 ON" : "📷 OFF";
      p.camBadge.className = "badge" + (cam ? " on" : "");
    }
  });

  socket.on("signal", async ({ from, data }) => {
    await handleSignal(from, data);
  });

  socket.on("participant-left", ({ id }) => {
    const p = peers.get(id);
    if (p) {
      p.pc.close();
      peers.delete(id);
      removePeerTile(id);
    }
  });

  socket.on("roster-changed", () => {
    // room-state will follow
  });

  socket.on("system", ({ msg }) => logMsg("System: " + msg));

  socket.on("chat-all", ({ name, msg }) => logMsg(`${name}: ${msg}`));
  socket.on("chat-dm", ({ name, msg, echo }) => logMsg(`${echo ? "(You → DM)" : "(DM)"} ${name}: ${msg}`));

  // ----- New events -----
  socket.on("screen-state", ({ id, sharing }) => {
    const p = peers.get(id);
    if (p && p.tileEl) {
      if (sharing) {
        p.tileEl.classList.add("screen-sharing");
      } else {
        p.tileEl.classList.remove("screen-sharing");
      }
    }
  });

  socket.on("raise-hand", ({ id, raised }) => {
    const p = peers.get(id);
    if (p && p.tileEl) {
      if (raised) {
        p.tileEl.classList.add("hand-raised");
      } else {
        p.tileEl.classList.remove("hand-raised");
      }
    }
  });

  socket.on("emoji-reaction", ({ id, emoji }) => {
    showFloatingEmoji(emoji);
  });
}

// ----- Actions -----
function sendJoinRequest(id) {
  roomId = id;
  meetingIdEl.textContent = roomId;
  socket.emit("join-request", { roomId, name: myName });
}

function resetAll() {
  for (const p of peers.values()) p.pc.close();
  peers.clear();

  Array.from(videoGrid.querySelectorAll(".tile")).forEach(t => {
    if (t.dataset.peer !== "local") t.remove();
  });

  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null;
  localVideo.srcObject = null;

  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  screenStream = null;
  screenSharing = false;
  handRaised = false;

  approvedUsers = [];
  waitingUsers = [];
  hostId = null;
  myId = null;
  roomId = "";
  isHost = false;

  mediaReady = false;
  stopTimer();
  unreadCount = 0;
  updateChatBadge();

  setStatus("Idle");
  meetingIdEl.textContent = "—";

  // Reset button states
  screenBtn.textContent = "🖥️ Share Screen";
  screenBtn.className = "btn control purple";
  handBtn.textContent = "✋ Raise Hand";
  handBtn.className = "btn control";
  const localTile = videoGrid.querySelector('.tile[data-peer="local"]');
  if (localTile) {
    localTile.classList.remove("screen-sharing", "hand-raised");
  }
}

// ----- UI events -----
createBtn.onclick = () => {
  myName = nameInput.value.trim() || "Guest";
  localStorage.setItem("ch_name", myName);
  setAvatar();

  const id = genMeetingId();
  meetingInput.value = id;
  sendJoinRequest(id);
};

joinHomeBtn.onclick = () => {
  myName = nameInput.value.trim() || "Guest";
  localStorage.setItem("ch_name", myName);
  setAvatar();

  const id = meetingInput.value.trim();
  if (!id) return alert("Enter meeting ID");
  sendJoinRequest(id);
};

cancelWait.onclick = () => {
  socket.emit("leave-room", { roomId });
  resetAll();
  setPage("home");
};

copyId.onclick = async () => {
  if (!roomId) return;
  await copyText(roomId);
  logMsg("System: Meeting ID copied ✅");
};

renameBtn.onclick = () => {
  const nn = prompt("Enter new name:", myName);
  if (!nn) return;
  myName = nn.trim() || "Guest";
  localStorage.setItem("ch_name", myName);
  setAvatar();
  socket.emit("rename", { roomId, name: myName });
};

leaveBtn.onclick = () => {
  socket.emit("leave-room", { roomId });
  resetAll();
  setPage("home");
};

openHostPanelBtn.onclick = () => {
  if (!isHost) return alert("Only host can manage waiting room.");
  hostPanel.style.display = "grid";
};

// Chat
chatMin.onclick = () => {
  chatPane.style.display = "none";
  chatVisible = false;
};
chatToggle.onclick = () => {
  chatPane.style.display = "flex";
  chatVisible = true;
  unreadCount = 0;
  updateChatBadge();
};

let chatMode = "all";
tabAll.onclick = () => { chatMode = "all"; tabAll.classList.add("active"); tabDM.classList.remove("active"); };
tabDM.onclick = () => { chatMode = "dm"; tabDM.classList.add("active"); tabAll.classList.remove("active"); };

sendChat.onclick = () => {
  const msg = chatInput.value.trim();
  if (!msg) return;

  if (chatMode === "all") socket.emit("chat-all", { roomId, msg });
  else {
    const to = dmTarget.value;
    if (!to) return alert("Select a user for Direct Message");
    socket.emit("chat-dm", { roomId, to, msg });
  }
  chatInput.value = "";
};

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat.click();
});

// Mic/Cam toggles
muteBtn.onclick = () => {
  if (!localStream) return;
  const a = localStream.getAudioTracks()[0];
  if (!a) return;
  micOn = !micOn;
  a.enabled = micOn;
  updateLocalBadges();
  emitMediaState();
};

camBtn.onclick = () => {
  if (!localStream) return;
  const v = localStream.getVideoTracks()[0];
  if (!v) return;
  camOn = !camOn;
  v.enabled = camOn;
  updateLocalBadges();
  emitMediaState();
};

// Screen share
screenBtn.onclick = async () => {
  if (screenSharing) {
    await stopScreenShare();
  } else {
    await startScreenShare();
  }
};

// Flip camera
flipCamBtn.onclick = async () => {
  if (screenSharing) return alert("Stop screen sharing before flipping camera.");
  await flipCamera();
};

// Raise hand
handBtn.onclick = () => {
  handRaised = !handRaised;
  handBtn.textContent = handRaised ? "✋ Lower Hand" : "✋ Raise Hand";
  handBtn.className = "btn control" + (handRaised ? " hand-on" : "");

  const localTile = videoGrid.querySelector('.tile[data-peer="local"]');
  if (localTile) {
    if (handRaised) localTile.classList.add("hand-raised");
    else localTile.classList.remove("hand-raised");
  }

  if (socket && roomId) socket.emit("raise-hand", { roomId, raised: handRaised });
};

// Fullscreen
fullscreenBtn.onclick = () => {
  if (!document.fullscreenElement) {
    meeting.requestFullscreen?.().catch(() => { });
    fullscreenBtn.textContent = "⛶ Exit Fullscreen";
  } else {
    document.exitFullscreen?.();
    fullscreenBtn.textContent = "⛶ Fullscreen";
  }
};

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fullscreenBtn.textContent = "⛶ Fullscreen";
  }
});

// Picture-in-Picture
pipBtn.onclick = async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await localVideo.requestPictureInPicture();
    }
  } catch (e) {
    logMsg("System: PiP not supported — " + e.message);
  }
};

// Emoji reactions
document.querySelectorAll(".emoji-btn").forEach(btn => {
  btn.onclick = () => {
    const emoji = btn.dataset.emoji;
    showFloatingEmoji(emoji);
    if (socket && roomId) socket.emit("emoji-reaction", { roomId, emoji });
  };
});

// Pre-join toggles
preMicBtn.onclick = () => {
  micOn = !micOn;
  preMicBtn.textContent = micOn ? "🎤 Mic: ON" : "🎤 Mic: OFF";
  preMicBtn.className = "btn small " + (micOn ? "pre-on" : "pre-off");
};

preCamBtn.onclick = () => {
  camOn = !camOn;
  preCamBtn.textContent = camOn ? "📷 Cam: ON" : "📷 Cam: OFF";
  preCamBtn.className = "btn small " + (camOn ? "pre-on" : "pre-off");
};

// Settings
settingsBtn.onclick = async () => {
  settingsModal.style.display = "grid";
  await loadDevices();
};

closeSettings.onclick = () => (settingsModal.style.display = "none");

applyDevices.onclick = async () => {
  selectedCamId = camSelect.value;
  selectedMicId = micSelect.value;
  settingsModal.style.display = "none";

  await startLocalMedia();

  // Replace tracks in all peer connections
  for (const p of peers.values()) {
    const pc = p.pc;
    const senders = pc.getSenders();
    const a = localStream.getAudioTracks()[0];
    const v = localStream.getVideoTracks()[0];

    const aSender = senders.find(s => s.track && s.track.kind === "audio");
    const vSender = senders.find(s => s.track && s.track.kind === "video");

    if (aSender && a) await aSender.replaceTrack(a);
    if (vSender && v) await vSender.replaceTrack(v);
  }

  logMsg("System: Devices applied ✅");
};

closeHostPanel.onclick = () => (hostPanel.style.display = "none");
transferHostBtn.onclick = () => {
  const to = hostTransferSelect.value;
  if (!to) return;
  socket.emit("transfer-host", { roomId, newHostId: to });
};

// ----- Init -----
(async function init() {
  myName = localStorage.getItem("ch_name") || myName;
  nameInput.value = myName;
  setAvatar();

  micOn = false;
  camOn = false;
  updateLocalBadges();

  setPage("home");

  connectSocket();
  await loadDevices();
})();