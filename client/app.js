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

const videoGrid = document.getElementById("videoGrid");
const localVideo = document.getElementById("localVideo");
const localMicBadge = document.getElementById("localMic");
const localCamBadge = document.getElementById("localCam");

const muteBtn = document.getElementById("muteBtn");
const camBtn = document.getElementById("camBtn");
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
let mediaReady = false;

let micOn = false; // default OFF
let camOn = false; // default OFF

let selectedCamId = "";
let selectedMicId = "";

// peerId -> { pc, makingOffer, ignoreOffer, polite, videoEl, micBadge, camBadge }
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

  // detect system message
  const isSystem =
    text.startsWith("System:") ||
    text.startsWith("SYSTEM:") ||
    text.startsWith("🔔") ||
    text.startsWith("✅");

  div.className = "msg " + (isSystem ? "system" : "normal");
 div.textContent = isSystem ? text.replace(/^System:\s*/i, "") : text;

  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function hostNameFromId(id) {
  const u = approvedUsers.find(x => x.id === id);
  return u ? u.name : "-";
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); } catch {}
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
  localCamBadge.textContent = camOn ? "📷 ON" : "📷 OFF";
  muteBtn.textContent = micOn ? "Mic: ON" : "Mic: OFF";
  camBtn.textContent = camOn ? "Cam: ON" : "Cam: OFF";
}

// ----- Devices -----
async function loadDevices() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    tmp.getTracks().forEach(t => t.stop());
  } catch {}

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

  const constraints = {
    video: selectedCamId ? { deviceId: { exact: selectedCamId } } : true,
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

  const a = localStream.getAudioTracks()[0];
  const v = localStream.getVideoTracks()[0];

  const haveA = senders.some(s => s.track && s.track.kind === "audio");
  const haveV = senders.some(s => s.track && s.track.kind === "video");

  if (a && !haveA) pc.addTrack(a, localStream);
  if (v && !haveV) pc.addTrack(v, localStream);
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

  top.innerHTML = `<span class="dot"></span><span>${peerName}</span>`;
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

// ----- Perfect Negotiation (key fix) -----
function ensurePeer(peerId, peerName) {
  if (peers.has(peerId)) return peers.get(peerId);

  const polite = String(myId) < String(peerId); // deterministic
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  const tile = makePeerTile(peerId, peerName);

  const state = {
    pc,
    makingOffer: false,
    ignoreOffer: false,
    polite,
    videoEl: tile.videoEl,
    micBadge: tile.micBadge,
    camBadge: tile.camBadge,
  };
  peers.set(peerId, state);

  // attach local tracks if ready
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

// ----- Roster sync (ensures EVERYONE connects to EVERYONE) -----
function syncPeersWithRoster() {
  if (!myId) return;

  const rosterIds = new Set(approvedUsers.map(u => u.id));
  rosterIds.delete(myId);

  // add missing peers
  for (const u of approvedUsers) {
    if (u.id === myId) continue;
    ensurePeer(u.id, u.name);
  }

  // remove peers not in roster
  for (const peerId of Array.from(peers.keys())) {
    if (!rosterIds.has(peerId)) {
      peers.get(peerId).pc.close();
      peers.delete(peerId);
      removePeerTile(peerId);
    }
  }

  // attach tracks if media ready
  if (mediaReady) {
    for (const p of peers.values()) attachTracksToPeerPC(p.pc);
  }

  // update badges from roster (mic/cam state)
  for (const u of approvedUsers) {
    if (u.id === myId) continue;
    const p = peers.get(u.id);
    if (!p) continue;
    p.micBadge.textContent = u.mic ? "🎤 ON" : "🎤 OFF";
    p.camBadge.textContent = u.cam ? "📷 ON" : "📷 OFF";
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
    waitingList.innerHTML = `<div class="muted">No waiting users.</div>`;
    return;
  }

  waitingUsers.forEach(u => {
    const row = document.createElement("div");
    row.className = "listItem";
    row.innerHTML = `
      <div><b>${u.name}</b><div class="muted small">${u.id}</div></div>
      <div class="row">
        <button class="btn small primary" data-approve="${u.id}">Approve</button>
        <button class="btn small danger" data-reject="${u.id}">Reject</button>
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

    // Start local media (mic/cam default OFF)
    mediaReady = false;
    await startLocalMedia();

    setStatus("Connected. You are in meeting ✅");
    logMsg("System: You joined the meeting.");

    if (isHost) hostPanel.style.display = "grid";
  });

  socket.on("peer-list", ({ peers: list }) => {
    // server sends roster list; we’ll wait for room-state for the same data too,
    // but this helps new user build early.
    // no-op (room-state handles UI and sync)
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

    // ✅ critical: always sync mesh to roster
    syncPeersWithRoster();
  });

  socket.on("media-state", ({ id, mic, cam }) => {
    // live updates without waiting full room-state
    const p = peers.get(id);
    if (p) {
      p.micBadge.textContent = mic ? "🎤 ON" : "🎤 OFF";
      p.camBadge.textContent = cam ? "📷 ON" : "📷 OFF";
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
    // room-state will follow; this is a hint only
  });

  socket.on("system", ({ msg }) => logMsg("System: " + msg));

  socket.on("chat-all", ({ name, msg }) => logMsg(`${name}: ${msg}`));
  socket.on("chat-dm", ({ name, msg, echo }) => logMsg(`${echo ? "(You → DM)" : "(DM)"} ${name}: ${msg}`));
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

  // remove all remote tiles
  Array.from(videoGrid.querySelectorAll(".tile")).forEach(t => {
    if (t.dataset.peer !== "local") t.remove();
  });

  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null;
  localVideo.srcObject = null;

  approvedUsers = [];
  waitingUsers = [];
  hostId = null;
  myId = null;
  roomId = "";
  isHost = false;

  mediaReady = false;

  setStatus("Idle");
  meetingIdEl.textContent = "-";
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

chatMin.onclick = () => { chatPane.style.display = "none"; };
chatToggle.onclick = () => { chatPane.style.display = "flex"; };

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

// mic/cam toggles (also broadcast state)
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

settingsBtn.onclick = async () => {
  settingsModal.style.display = "grid";
  await loadDevices();
};

closeSettings.onclick = () => (settingsModal.style.display = "none");

applyDevices.onclick = async () => {
  selectedCamId = camSelect.value;
  selectedMicId = micSelect.value;
  settingsModal.style.display = "none";

  await startLocalMedia(); // reopens stream

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

// ----- init -----
(async function init() {
  myName = localStorage.getItem("ch_name") || myName;
  nameInput.value = myName;
  setAvatar();

  // default OFF
  micOn = false;
  camOn = false;
  updateLocalBadges();

  setPage("home");

  connectSocket();
  await loadDevices();
})();