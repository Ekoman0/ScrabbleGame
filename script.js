// ================= FIREBASE AYARLARI =================
const firebaseConfig = {
    apiKey: "AIzaSyBSCuFHGw0SEKNb6AdQIdPvGeSgfD20qY4",
    authDomain: "scrabblegame-b3ed4.firebaseapp.com",
    databaseURL: "https://scrabblegame-b3ed4-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "scrabblegame-b3ed4",
    storageBucket: "scrabblegame-b3ed4.firebasestorage.app",
    messagingSenderId: "932769983173",
    appId: "1:932769983173:web:959037670e8621ee851eac",
    measurementId: "G-0H0H9R004B"
};

// Firebase Başlatma
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let isOnlineMode = false;
let myOnlineRoomId = null;
let roomRef = null;
let myPlayerIndex = -1; 
let myPlayerId = null; 

// ================= GAME STATE =================
let currentPlayerIndex = 0;
let playerCount = 0;
let players = [];
let tileBag = [];
let draggedTileInfo = null;
let firstMove = true;
let tempTiles = [];
let gameOverCountdown = -1;

// ================= YENİ: SERVER TIME SİSTEMİ =================
let serverTimeOffset = 0;
firebase.database().ref(".info/serverTimeOffset").on("value", function(snap) {
    serverTimeOffset = snap.val() || 0;
});

// ================= MAĞAZA VERİLERİ (LOCALSTORAGE) =================
let playerData = {
    gold: 5000,
    owned: ['tile-default', 'chat-default', 'avatar-default', 'board-default', 'rack-default'],
    equipped: { tile: 'tile-default', chat: 'chat-default', avatar: 'avatar-default', board: 'board-default', rack: 'rack-default' }
};

function loadPlayerData() {
    let raw = localStorage.getItem('scrabble_playerData');
    if (raw) {
        let parsed = JSON.parse(raw);
        playerData.gold = parsed.gold || 0;
        playerData.owned = parsed.owned || ['tile-default', 'chat-default', 'avatar-default', 'board-default', 'rack-default'];
        playerData.equipped = parsed.equipped || { tile: 'tile-default', chat: 'chat-default', avatar: 'avatar-default', board: 'board-default', rack: 'rack-default' };
        
        // Geriye dönük uyumluluk (Eski kayıtlara 'rack' ekle)
        if (!playerData.owned.includes('rack-default')) playerData.owned.push('rack-default');
        if (!playerData.equipped.rack) playerData.equipped.rack = 'rack-default';
    }
    
    // TEST İÇİN: 5000 altından azsa 5000'e tamamla
    if (playerData.gold < 5000) {
        playerData.gold = 5000;
        savePlayerData();
    }
}
function savePlayerData() {
    localStorage.setItem('scrabble_playerData', JSON.stringify(playerData));
}
// (loadPlayerData DOMContentLoaded içinde çağrılacak)

// ================= YENİ: SES MOTORU (WEB AUDIO API) =================
// Hiçbir dosya indirmeye gerek kalmadan elektronik olarak ses üretiyoruz!
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!gameSettings.soundsEnabled) return; // Ayarlardan kapalıysa çalma
    
    // Tarayıcı güvenlik gereği sesi bekletiyorsa uyandır
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'click') {
        // Harf koyma / çekme (Kısa tok ses)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'success') {
        // Puan Kazanma / Görev (Çing Sesi)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'error') {
        // Yanlış kelime / Mayın (Bızz Sesi)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'emoji') {
        // Emoji uçurma (Pop Sesi)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'tick') {
        // Süre biterken (Tik tak)
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'your_turn') {
        // Sıra Sende Sesi
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    }
}

async function fetchWordDefinition(wordLower) {
    try {
        const response = await fetch(`https://sozluk.gov.tr/gts?ara=${wordLower}`);
        const data = await response.json();
        if (Array.isArray(data) && data[0].anlamlarListe && data[0].anlamlarListe[0]) {
            return data[0].anlamlarListe[0].anlam;
        }
        return null;
    } catch (e) {
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://sozluk.gov.tr/gts?ara=' + wordLower)}`;
            const res2 = await fetch(proxyUrl);
            const data2 = await res2.json();
            if (Array.isArray(data2) && data2[0].anlamlarListe && data2[0].anlamlarListe[0]) {
                return data2[0].anlamlarListe[0].anlam;
            }
        } catch(e2) { console.error("TDK çekilemedi", e2); }
    }
    return null;
}

// ================= OYUN AYARLARI & HARİTALAR =================
let gameSettings = {
    mapType: 'classic',
    surprisesEnabled: false,
    sabotageEnabled: false,
    soundsEnabled: true, // YENİ: Ses Ayarı
    timerValue: 60 
};

const MAPS = {
    classic: { 
        tw: [0, 7, 14, 105, 119, 210, 217, 224],
        dw: [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208],
        tl: [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204],
        dl: [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221]
    },
    cross: { 
        tw: [0, 14, 210, 224, 112],
        dw: [16, 28, 196, 208, 48, 56, 168, 176],
        tl: [32, 42, 182, 192],
        dl: [64, 70, 154, 160, 110, 114]
    },
    corners: { 
        tw: [0, 14, 210, 224, 7, 105, 119, 217],
        dw: [1, 13, 15, 29, 195, 209, 211, 223],
        tl: [2, 12, 30, 44, 180, 194, 212, 222],
        dl: [3, 11, 45, 59, 165, 179, 213, 221]
    }
};

let hiddenSurprises = {}; 
let frozenCells = {}; 
let sabotageMode = null; 

// ================= DİNAMİK GÖREVLER SİSTEMİ =================
const QUEST_LIST = [
    { text: "5 harfli bir kelime yaz (+5 Puan)", points: 5, check: w => w.length === 5 },
    { text: "6 harfli bir kelime yaz (+8 Puan)", points: 8, check: w => w.length === 6 },
    { text: "7 harfli kelime yaz (+15 Puan)", points: 15, check: w => w.length >= 7 },
    { text: "İçinde 'Z' olan kelime yaz (+10 Puan)", points: 10, check: w => w.includes('Z') },
    { text: "İçinde 'J' olan kelime yaz (+15 Puan)", points: 15, check: w => w.includes('J') },
    { text: "İçinde 'V' olan kelime yaz (+8 Puan)", points: 8, check: w => w.includes('V') },
    { text: "İçinde 'Ğ' olan kelime yaz (+10 Puan)", points: 10, check: w => w.includes('Ğ') },
    { text: "İçinde 'F' olan kelime yaz (+8 Puan)", points: 8, check: w => w.includes('F') },
    { text: "İçinde 'P' olan kelime yaz (+6 Puan)", points: 6, check: w => w.includes('P') },
    { text: "İçinde 'Ç' olan kelime yaz (+6 Puan)", points: 6, check: w => w.includes('Ç') },
    { text: "İçinde 'Ö' olan kelime yaz (+8 Puan)", points: 8, check: w => w.includes('Ö') },
    { text: "İçinde 'Ü' olan kelime yaz (+6 Puan)", points: 6, check: w => w.includes('Ü') },
    { text: "'A' harfi ile başlayan kelime yaz (+5 Puan)", points: 5, check: w => w.startsWith('A') },
    { text: "'K' harfi ile başlayan kelime yaz (+5 Puan)", points: 5, check: w => w.startsWith('K') },
    { text: "'M' harfi ile başlayan kelime yaz (+6 Puan)", points: 6, check: w => w.startsWith('M') },
    { text: "'S' harfi ile başlayan kelime yaz (+5 Puan)", points: 5, check: w => w.startsWith('S') },
    { text: "'E' harfi ile başlayan kelime yaz (+4 Puan)", points: 4, check: w => w.startsWith('E') },
    { text: "'T' harfi ile biten kelime yaz (+5 Puan)", points: 5, check: w => w.endsWith('T') },
    { text: "'K' harfi ile biten kelime yaz (+4 Puan)", points: 4, check: w => w.endsWith('K') },
    { text: "'N' harfi ile biten kelime yaz (+5 Puan)", points: 5, check: w => w.endsWith('N') },
    { text: "'R' harfi ile biten kelime yaz (+5 Puan)", points: 5, check: w => w.endsWith('R') },
    { text: "İçinde en az iki tane 'A' olan kelime yaz (+6 Puan)", points: 6, check: w => (w.match(/A/g) || []).length >= 2 },
    { text: "İçinde en az iki tane 'E' olan kelime yaz (+6 Puan)", points: 6, check: w => (w.match(/E/g) || []).length >= 2 },
    { text: "Sadece 3 harfli kelime yaz (+3 Puan)", points: 3, check: w => w.length === 3 },
    { text: "İçinde 'B' ve 'R' olan kelime yaz (+8 Puan)", points: 8, check: w => w.includes('B') && w.includes('R') },
    { text: "İçinde 'S' ve 'T' olan kelime yaz (+7 Puan)", points: 7, check: w => w.includes('S') && w.includes('T') },
    { text: "İçinde 'K' ve 'L' olan kelime yaz (+6 Puan)", points: 6, check: w => w.includes('K') && w.includes('L') },
    { text: "İçinde 'D' olan kelime yaz (+4 Puan)", points: 4, check: w => w.includes('D') },
    { text: "İçinde 'Y' olan kelime yaz (+5 Puan)", points: 5, check: w => w.includes('Y') },
    { text: "'M' harfi ile biten kelime yaz (+6 Puan)", points: 6, check: w => w.endsWith('M') }
];

let currentQuest = null;
let currentQuestIndex = -1; 
let questState = 'active'; 
let questTurnCounter = 0; 

function generateNewQuest() {
    currentQuestIndex = Math.floor(Math.random() * QUEST_LIST.length);
    currentQuest = QUEST_LIST[currentQuestIndex];
    questState = 'active';
    let pCount = Math.max(1, playerCount);
    questTurnCounter = 3 * pCount; 
    updateQuestUI();
}

function updateQuestUI() {
    const qt = document.getElementById('quest-text');
    const qs = document.getElementById('quest-status');
    if (!currentQuest) return;

    let pCount = Math.max(1, playerCount);
    let roundsLeft = Math.ceil(questTurnCounter / pCount);

    if (questState === 'active') {
        qt.innerText = currentQuest.text;
        qs.innerText = `Kalan Tur: ${roundsLeft}`;
        qs.style.color = "red";
    } else {
        qt.innerText = "Sıradaki görev bekleniyor...";
        qs.innerText = `Yenilenmesine: ${roundsLeft} tur`;
        qs.style.color = "green";
    }
}

// ================= SÜRE (TIMER) SİSTEMİ =================
let turnTimerInterval = null;
let currentTimerValue = 0;
let turnStartTime = 0;
let isTimerPaused = false; 

function startTurnTimer() {
    clearInterval(turnTimerInterval);
    const timerDisplay = document.getElementById('timer-display');
    
    if (gameSettings.timerValue <= 0) {
        timerDisplay.style.display = 'none';
        return;
    }
    
    timerDisplay.style.display = 'block';
    
    if (!isOnlineMode) turnStartTime = Date.now();

    turnTimerInterval = setInterval(() => {
        if (isTimerPaused) {
            // Süre duraklatıldıysa turnStartTime'ı ileri iterek elapsed'ı sabit tutuyoruz
            turnStartTime += 1000;
            return;
        }

        let elapsed = 0;
        if (isOnlineMode) {
            let estimatedServerTimeMs = Date.now() + serverTimeOffset;
            elapsed = Math.floor(( estimatedServerTimeMs - turnStartTime ) / 1000);
        } else {
            elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        }
        
        currentTimerValue = gameSettings.timerValue - elapsed;
        if (currentTimerValue < 0) currentTimerValue = 0;
        
        document.getElementById('timer-val').innerText = currentTimerValue;

        // YENİ: Son 5 saniyede tik-tak sesi
        if (currentTimerValue <= 5 && currentTimerValue > 0) {
            playSound('tick');
        }

        if (currentTimerValue <= 0) {
            clearInterval(turnTimerInterval);
            if (!isOnlineMode || currentPlayerIndex === myPlayerIndex) {
                alert("Süreniz doldu! Sıra otomatik geçiyor.");
                passTurn(true);
            } else {
                document.getElementById('timer-val').innerText = 0;
            }
        }
    }, 1000);
}

// ================= MENÜ YÖNETİMİ =================
function showOfflineMenu() {
    isOnlineMode = false;
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'block';
    document.getElementById('offline-menu').style.display = 'block';
}

function showOnlineMenu() {
    document.getElementById('mode-selection').style.display = 'none';
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('oda');
    
    if (roomParam) {
        myOnlineRoomId = roomParam;
        document.getElementById('btn-create-room').style.display = 'none';
        document.getElementById('btn-join-room').style.display = 'block';
        document.getElementById('room-link-text').innerText = `Davet Geldi: Oda ${roomParam}`;
        document.getElementById('online-menu').style.display = 'block';
    } else {
        document.getElementById('settings-panel').style.display = 'block';
        document.getElementById('online-menu').style.display = 'block';
    }
}

function getSettingsFromUI() {
    gameSettings.mapType = document.getElementById('map-select').value;
    gameSettings.surprisesEnabled = document.getElementById('surprises-toggle').checked;
    
    let sabToggle = document.getElementById('sabotage-toggle');
    gameSettings.sabotageEnabled = sabToggle ? sabToggle.checked : false;

    let soundToggle = document.getElementById('sounds-toggle');
    gameSettings.soundsEnabled = soundToggle ? soundToggle.checked : true;

    let tVal = parseInt(document.getElementById('timer-input').value);
    gameSettings.timerValue = isNaN(tVal) ? 0 : tVal;
}

// 1. ODA KURAN KİŞİ
function createOnlineRoom() {
    let playerName = document.getElementById('online-player-name').value;
    if (playerName.trim() === "") { alert("Lütfen adınızı girin!"); return; }

    getSettingsFromUI();

    // Kullanıcı ilk butona bastığında AudioContext uyandırılır (Mobil uyumluluk için şart)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const createBtn = document.getElementById('btn-create-room');
    createBtn.innerText = "Oda Kuruluyor...";
    createBtn.disabled = true;

    myOnlineRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    roomRef = db.ref('rooms/' + myOnlineRoomId);
    
    isOnlineMode = true;
    myPlayerIndex = 0; 
    playerCount = 1;
    myPlayerId = Math.random().toString(36).substr(2, 9); 

    players = [{ 
        id: myPlayerId,
        name: playerName, score: 0, rack: [],
        comboStreak: 0, longestWord: "", questsCompleted: 0, minesHit: 0, passCount: 0,
        equipped: playerData.equipped
    }];

    if (gameSettings.surprisesEnabled) generateSurprises();
    generateNewQuest(); 

    roomRef.set({
        status: 'waiting',
        settings: gameSettings,
        hiddenSurprises: hiddenSurprises,
        frozenCells: frozenCells,
        quest: { questIndex: currentQuestIndex, questState: questState, questTurnCounter: questTurnCounter },
        players: players,
        tileBag: [], 
        currentPlayerIndex: 0,
        board: [],
        firstMove: true 
    }).then(() => {
        let roomUrl = window.location.origin + window.location.pathname + "?oda=" + myOnlineRoomId;
        document.getElementById('room-link-text').innerHTML = `<b>Oda: ${myOnlineRoomId}</b><br><a href="${roomUrl}" target="_blank" style="color:#3498db; word-break: break-all;">${roomUrl}</a>`;
        document.getElementById('online-waiting-area').style.display = 'block';
        document.getElementById('settings-panel').style.display = 'none';
        createBtn.style.display = 'none';

        listenToRoom(); 
        listenToChat(); 
        listenToEmojis(); 
        listenToAnimations(); 
    }).catch(error => {
        alert("Bağlantı Hatası: " + error.message);
        createBtn.innerText = "Yeni Oda Kur";
        createBtn.disabled = false;
    });
}

// 2. ODAYA KATILAN KİŞİ
function joinOnlineRoom() {
    let playerName = document.getElementById('online-player-name').value;
    if (playerName.trim() === "") { alert("Lütfen adınızı girin!"); return; }

    getSettingsFromUI(); // Kendi ses tercihini al
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const joinBtn = document.getElementById('btn-join-room');
    joinBtn.innerText = "Bağlanıyor...";
    joinBtn.disabled = true;

    roomRef = db.ref('rooms/' + myOnlineRoomId);
    
    roomRef.once('value').then(snapshot => {
        const data = snapshot.val();
        if (!data) { alert("Hata: Oda bulunamadı!"); joinBtn.innerText = "Odaya Katıl"; joinBtn.disabled = false; return; }
        if (data.status === 'playing') { alert("Hata: Bu oyun zaten başlamış!"); joinBtn.innerText = "Odaya Katıl"; joinBtn.disabled = false; return; }

        isOnlineMode = true;
        players = data.players || [];
        myPlayerId = Math.random().toString(36).substr(2, 9); 
        myPlayerIndex = players.length; 
        playerCount = players.length + 1;

        let newPlayer = { 
            id: myPlayerId,
            name: playerName, score: 0, rack: [],
            comboStreak: 0, longestWord: "", questsCompleted: 0, minesHit: 0, passCount: 0,
            equipped: playerData.equipped
        };
        players.push(newPlayer);

        roomRef.update({
            players: players
        });

        document.getElementById('online-waiting-area').style.display = 'block';
        document.getElementById('room-link-text').innerText = "Bağlanıldı! Kurucunun başlatması bekleniyor...";
        joinBtn.style.display = 'none';

        listenToRoom(); 
        listenToChat(); 
        listenToEmojis();
        listenToAnimations();
    }).catch(error => {
        alert("Bağlantı Hatası: " + error.message);
        joinBtn.innerText = "Odaya Katıl";
        joinBtn.disabled = false;
    });
}

// 3. KURUCU OYUNU BAŞLATIYOR 
function startOnlineGame() {
    if (players.length < 2) { alert("Başlamak için en az 2 kişi olmalı!"); return; }
    
    questTurnCounter = 3 * players.length;
    players.sort(() => Math.random() - 0.5); 
    
    initializeBag();
    players.forEach(p => refillRack(p));
    
    turnStartTime = Date.now() + serverTimeOffset;

    roomRef.update({ 
        status: 'playing',
        players: players,
        tileBag: tileBag, 
        currentPlayerIndex: 0,
        turnStartTime: turnStartTime,
        quest: { questIndex: currentQuestIndex, questState: questState, questTurnCounter: questTurnCounter }
    });
}

function getAvatarIcon(id) {
    const icons = {
        'avatar-king': '👑', 'avatar-wizard': '🧙‍♂️', 'avatar-ninja': '🥷',
        'avatar-alien': '👽', 'avatar-pirate': '🏴‍☠️', 'avatar-robot': '🤖',
        'avatar-angel': '👼', 'avatar-devil': '😈', 'avatar-dragon': '🐉',
        'avatar-ghost': '👻', 'avatar-vampire': '🧛', 'avatar-unicorn': '🦄',
        'avatar-monkey': '🐵', 'avatar-pumpkin': '🎃', 'avatar-astronaut': '👨‍🚀',
        'avatar-detective': '🕵️', 'avatar-scientist': '👨‍🔬', 'avatar-viking': '🪓',
        'avatar-samurai': '⚔️'
    };
    return icons[id] || '👤';
}

// ================= ODA DİNLEYİCİSİ VE LOBİ =================
function listenToRoom() {
    roomRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.settings) {
            // Ses ayarını kendi tarayıcımdan kullanmak için onu es geçiyoruz
            let mySound = gameSettings.soundsEnabled;
            gameSettings = data.settings;
            gameSettings.soundsEnabled = mySound;
        }
        if (data.hiddenSurprises) hiddenSurprises = data.hiddenSurprises;
        if (data.frozenCells) frozenCells = data.frozenCells; else frozenCells = {};
        
        if (data.quest) {
            currentQuestIndex = data.quest.questIndex;
            currentQuest = currentQuestIndex !== undefined && currentQuestIndex !== -1 ? QUEST_LIST[currentQuestIndex] : null;
            questState = data.quest.questState;
            questTurnCounter = data.quest.questTurnCounter;
            updateQuestUI();
        }

        if (data.status === 'finished') {
            document.querySelectorAll('#board .tile:not(.fixed)').forEach(t => t.remove());
            players = data.players || [];
            endGame(true);
            return;
        }

        players = data.players || [];
        tileBag = data.tileBag || []; 
        if (data.turnStartTime) turnStartTime = data.turnStartTime;
        
        if (myPlayerId) {
            myPlayerIndex = players.findIndex(p => p.id === myPlayerId);
        }
        
        if (currentPlayerIndex !== data.currentPlayerIndex && data.status === 'playing') {
            currentPlayerIndex = data.currentPlayerIndex || 0;
            startTurnTimer();
            if (isOnlineMode && currentPlayerIndex === myPlayerIndex) {
                playSound('your_turn');
            }
        } else {
            currentPlayerIndex = data.currentPlayerIndex || 0;
        }

        playerCount = players.length;
        if (data.firstMove !== undefined) firstMove = data.firstMove;

        if (data.status === 'waiting') {
            document.getElementById('lobby-count').innerText = players.length;
            const listElement = document.getElementById('lobby-players-list');
            listElement.innerHTML = players.map(p => {
                let pAvatar = p.equipped && p.equipped.avatar ? p.equipped.avatar : 'avatar-default';
                let icon = getAvatarIcon(pAvatar);
                return `<li>${icon} ${p.name}</li>`;
            }).join('');
        }
        
        if (data.status === 'playing' && document.getElementById('game-screen').style.display === 'none') {
            document.getElementById('menu-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'flex';
            document.getElementById('chat-container').style.display = 'flex'; 
            if(document.getElementById('board').innerHTML === '') createBoard();
            startTurnTimer(); 
            
            alert(`Oyun Başlıyor!\nİlk hamleyi yapacak kişi rastgele seçildi:\n>>> ${players[currentPlayerIndex].name} <<<`);
        }

        if (data.status === 'playing') {
            document.querySelectorAll('#board .tile').forEach(t => t.remove());
            
            let boardState = data.board || [];
            let tempBoardState = data.tempBoard || []; 
            
            boardState.forEach(item => {
                let cell = document.getElementById(`cell-${item.index}`);
                if (cell) {
                    let div = document.createElement('div');
                    let skinInfo = item.skin || 'tile-default';
                    div.className = `tile fixed ${skinInfo}`;
                    div.innerHTML = `<span class="letter">${item.letter}</span><span class="point">${item.points}</span>`;
                    cell.appendChild(div);
                }
            });
            
            if (currentPlayerIndex === myPlayerIndex) {
                renderTempTiles(); 
            } else {
                tempBoardState.forEach(item => {
                    let cell = document.getElementById(`cell-${item.index}`);
                    if (cell) {
                        let div = document.createElement('div');
                        let skinInfo = item.skin || 'tile-default';
                        div.className = `tile ${skinInfo}`; 
                        div.innerHTML = `<span class="letter">${item.letter}</span><span class="point">${item.points}</span>`;
                        cell.appendChild(div);
                    }
                });
            }
            updateUI();
        }
    });
}

// ================= ANİMASYON YAYINI SİSTEMİ =================
function broadcastAnimation(type, data) {
    if (!isOnlineMode || !roomRef) return;
    roomRef.child('animations').push({
        type: type,
        ...data,
        sender: myPlayerId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

function listenToAnimations() {
    roomRef.child('animations').on('child_added', snapshot => {
        const anim = snapshot.val();
        if (!anim || anim.sender === myPlayerId) return; // Kendi animasyonlarımı zaten görüyorum
        if (Date.now() - anim.timestamp > 5000) return; // Eski animasyonları atla

        if (anim.type === 'checking') {
            // Diğer oyuncunun harflerini "doğrulanıyor" animasyonuyla göster
            (anim.cellIndices || []).forEach(idx => {
                let cell = document.getElementById(`cell-${idx}`);
                if (cell) {
                    let tileEl = cell.querySelector('.tile');
                    if (tileEl) tileEl.classList.add('checking-anim');
                }
            });
        } else if (anim.type === 'check_done') {
            // Doğrulama animasyonunu temizle
            document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));
        } else if (anim.type === 'success') {
            // Başarılı kelime animasyonu
            document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));
            let targetCells = (anim.cellIndices || []).map(idx => document.getElementById(`cell-${idx}`)).filter(c => c);
            playSound('success');
            triggerSuccessEffect(targetCells, anim.scoreText, anim.isMine);
        } else if (anim.type === 'error') {
            // Başarısız kelime denemesi
            document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));
            playSound('error');
        }
    });
}

// ================= EMOJİ SİSTEMİ =================
function sendEmoji(emojiChar) {
    if (isOnlineMode) {
        roomRef.child('emojis').push({
            char: emojiChar,
            sender: players[myPlayerIndex].name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        triggerEmojiAnimation(emojiChar);
    }
}

function listenToEmojis() {
    roomRef.child('emojis').on('child_added', snapshot => {
        const data = snapshot.val();
        if (Date.now() - data.timestamp < 5000 || !data.timestamp) {
            triggerEmojiAnimation(data.char);
        }
    });
}

function triggerEmojiAnimation(emojiChar) {
    playSound('emoji'); // YENİ: Emoji Uçuşma Sesi
    const fxLayer = document.getElementById('fx-layer');
    const el = document.createElement('div');
    el.className = 'flying-emoji';
    el.innerText = emojiChar;
    el.style.left = (20 + Math.random() * 60) + 'vw';
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ================= CHAT SİSTEMİ =================
function triggerFlyingChat(sender, text) {
    const fxLayer = document.getElementById('fx-layer');
    const el = document.createElement('div');
    el.className = 'flying-chat';
    el.innerHTML = `<b>${sender}:</b> ${text}`;
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

function listenToChat() {
    roomRef.child('chat').on('child_added', snapshot => {
        const msg = snapshot.val();
        
        if (Date.now() - msg.timestamp < 5000 || !msg.timestamp) {
            if (msg.sender !== players[myPlayerIndex].name) {
                playSound('emoji'); 
            }
            triggerFlyingChat(msg.sender, msg.text);
        }

        const msgDiv = document.createElement('div');
        let chatSkin = msg.skin || 'chat-default';
        if (msg.sender === players[myPlayerIndex].name) {
            msgDiv.className = `chat-msg self ${chatSkin}`;
        } else if (msg.sender === "SİSTEM") {
            msgDiv.className = 'chat-msg';
            msgDiv.style.backgroundColor = '#f39c12';
            msgDiv.style.color = '#fff';
        } else {
            msgDiv.className = `chat-msg ${chatSkin}`;
        }
        msgDiv.innerHTML = `<span>${msg.sender}</span>${msg.text}`;
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text === "") return;
    roomRef.child('chat').push({
        sender: players[myPlayerIndex].name,
        text: text,
        skin: playerData.equipped.chat,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = "";
}

function handleChatKeyPress(e) { if (e.key === "Enter") sendChatMessage(); }

function pushGameStateToFirebase(isFinished = false) {
    if (!isOnlineMode || !roomRef) return;

    let boardState = [];
    for (let i = 0; i < 225; i++) {
        let cell = document.getElementById(`cell-${i}`);
        let tile = cell.querySelector('.tile.fixed');
        if (tile) {
            let skin = 'tile-default';
            tile.classList.forEach(c => { if (c.startsWith('tile-') && c !== 'tile-default') skin = c; });
            boardState.push({
                index: i,
                letter: tile.querySelector('.letter').innerText,
                points: parseInt(tile.querySelector('.point').innerText),
                skin: skin
            });
        }
    }

    let tempBoardState = tempTiles.map(t => { 
        return { 
            index: t.cellIndex, 
            letter: t.letter, 
            points: t.points, 
            skin: playerData.equipped.tile 
        }; 
    });

    let updateData = {
        board: boardState,
        tempBoard: tempBoardState, 
        players: players,
        tileBag: tileBag,
        currentPlayerIndex: currentPlayerIndex,
        turnStartTime: turnStartTime,
        firstMove: firstMove,
        hiddenSurprises: hiddenSurprises,
        frozenCells: frozenCells,
        quest: { questIndex: currentQuestIndex, questState: questState, questTurnCounter: questTurnCounter }
    };
    if (isFinished) updateData.status = 'finished';

    roomRef.update(updateData);
}

// ================= DICTIONARY =================
let DICT = null;
async function loadDictionary() {
    try {
        const res = await fetch("words.txt");
        const text = await res.text();
        const words = text.split("\n")
            .map(w => w.trim().replace("\r", ""))
            .filter(w => w.length > 0)
            .map(w => w.toLocaleUpperCase("tr"));
        return new Set(words);
    } catch (e) {
        console.error("Sözlük yüklenemedi:", e);
        return new Set();
    }
}
loadDictionary().then(set => { DICT = set; console.log("Sözlük yüklendi:", DICT.size); });

// (Değişkenler dosya başına taşındı)

const letterDistribution = [
    { letter: 'A', points: 1, count: 12 }, { letter: 'B', points: 3, count: 2 },
    { letter: 'C', points: 4, count: 2 }, { letter: 'Ç', points: 4, count: 2 },
    { letter: 'D', points: 3, count: 2 }, { letter: 'E', points: 1, count: 8 },
    { letter: 'F', points: 7, count: 1 }, { letter: 'G', points: 5, count: 1 },
    { letter: 'Ğ', points: 8, count: 1 }, { letter: 'H', points: 5, count: 1 },
    { letter: 'I', points: 2, count: 4 }, { letter: 'İ', points: 1, count: 7 },
    { letter: 'J', points: 10, count: 1 }, { letter: 'K', points: 1, count: 7 },
    { letter: 'L', points: 1, count: 7 }, { letter: 'M', points: 2, count: 4 },
    { letter: 'N', points: 1, count: 5 }, { letter: 'O', points: 2, count: 3 },
    { letter: 'Ö', points: 7, count: 1 }, { letter: 'P', points: 5, count: 1 },
    { letter: 'R', points: 1, count: 6 }, { letter: 'S', points: 2, count: 3 },
    { letter: 'Ş', points: 4, count: 2 }, { letter: 'T', points: 1, count: 5 },
    { letter: 'U', points: 2, count: 3 }, { letter: 'Ü', points: 3, count: 2 },
    { letter: 'V', points: 7, count: 1 }, { letter: 'Y', points: 3, count: 2 },
    { letter: 'Z', points: 4, count: 2 }
];

window.onbeforeunload = function() {
    if (document.getElementById('game-screen').style.display !== 'none') {
        return "Oyundan çıkmak istediğinize emin misiniz? İlerleyişiniz kaybolacak.";
    }
};

// ================= CORE FUNCTIONS =================

function preparePlayers(num) {
    playerCount = num;
    document.getElementById('player-buttons').style.display = 'none';
    const namesContainer = document.getElementById('name-inputs');
    namesContainer.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        namesContainer.innerHTML += `<input type="text" id="player-name-${i}" class="player-name-input" placeholder="${i}. Oyuncu Adı" value="Oyuncu ${i}">`;
    }
    document.getElementById('name-input-area').style.display = 'block';
}

function startGameWithNames() {
    if (!DICT) { alert("Sözlük yükleniyor..."); return; }
    
    getSettingsFromUI();
    if (audioCtx.state === 'suspended') audioCtx.resume(); // Ses motorunu başlat

    players = [];
    for (let i = 1; i <= playerCount; i++) {
        let nameVal = document.getElementById(`player-name-${i}`).value;
        if(nameVal.trim() === "") nameVal = `Oyuncu ${i}`;
        players.push({ 
            name: nameVal, score: 0, rack: [],
            comboStreak: 0, longestWord: "", questsCompleted: 0, minesHit: 0, passCount: 0,
            equipped: playerData.equipped
        });
    }

    players.sort(() => Math.random() - 0.5);
    currentPlayerIndex = 0;
    
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none'; 
    
    if (gameSettings.surprisesEnabled) generateSurprises();
    generateNewQuest();

    initializeBag();
    players.forEach(p => refillRack(p));
    createBoard();
    updateUI();
    startTurnTimer();
    
    alert(`Oyun Başlıyor!\nİlk sıradaki oyuncu rastgele seçildi:\n>>> ${players[currentPlayerIndex].name} <<<`);
}

function generateSurprises() {
    hiddenSurprises = {};
    let available = [];
    let activeMap = MAPS[gameSettings.mapType] || MAPS.classic;

    let specialCells = new Set([112]); 
    if (activeMap.tw) activeMap.tw.forEach(c => specialCells.add(c));
    if (activeMap.dw) activeMap.dw.forEach(c => specialCells.add(c));
    if (activeMap.tl) activeMap.tl.forEach(c => specialCells.add(c));
    if (activeMap.dl) activeMap.dl.forEach(c => specialCells.add(c));

    for(let i=0; i<225; i++) {
        if(!specialCells.has(i)) available.push(i);
    }
    available.sort(() => Math.random() - 0.5);
    
    const surpriseTypes = ['minus_rand', 'half_lose', 'double_gain', 'plus_rand'];
    for(let i=0; i<3; i++) {
        if (available[i] !== undefined) {
            let randType = surpriseTypes[Math.floor(Math.random() * surpriseTypes.length)];
            hiddenSurprises[available[i]] = randType;
        }
    }
}

function initializeBag() {
    tileBag = [];
    letterDistribution.forEach(item => { for (let j = 0; j < item.count; j++) tileBag.push({ ...item }); });
    tileBag.sort(() => Math.random() - 0.5);
}

function refillRack(player) {
    if (!player.rack) player.rack = []; 
    while (player.rack.length < 7 && tileBag.length > 0) {
        player.rack.push(tileBag.pop());
    }
}

function createBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';
    
    let activeMap = MAPS[gameSettings.mapType] || MAPS.classic;

    for (let i = 0; i < 225; i++) {
        let cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `cell-${i}`;
        
        if (i === 112) { cell.classList.add('center'); cell.innerText = '★'; }
        else if (activeMap.tw && activeMap.tw.includes(i)) { cell.classList.add('tw'); cell.innerText = '3X KELİME'; }
        else if (activeMap.dw && activeMap.dw.includes(i)) { cell.classList.add('dw'); cell.innerText = '2X KELİME'; }
        else if (activeMap.tl && activeMap.tl.includes(i)) { cell.classList.add('tl'); cell.innerText = '3X HARF'; }
        else if (activeMap.dl && activeMap.dl.includes(i)) { cell.classList.add('dl'); cell.innerText = '2X HARF'; }
        
        cell.ondragover = (e) => e.preventDefault();
        cell.ondrop = (e) => handleDrop(e, i);
        cell.onclick = () => handleCellClick(i); 
        boardElement.appendChild(cell);
    }
    renderSpecialCells();
}

function renderSpecialCells() {
    for (let i = 0; i < 225; i++) {
        let cell = document.getElementById(`cell-${i}`);
        if (!cell) continue;

        if (frozenCells[i] > 0) {
            cell.classList.add('frozen');
        } else {
            cell.classList.remove('frozen');
        }

        if (gameSettings.surprisesEnabled && hiddenSurprises[i]) {
            cell.classList.add('surprise-mark');
        } else {
            cell.classList.remove('surprise-mark');
        }
    }
}

function prepareSabotage(type) {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) {
        alert("Şu an sıra sizde değil!"); return;
    }
    let p = players[currentPlayerIndex];
    if (p.score < 15) {
        alert("Bu yetenek için en az 15 puanınız olmalı!");
        return;
    }
    sabotageMode = type;
    if (type === 'freeze') alert("Buz Atmak için boş bir hücreye tıklayın! (İptal etmek için pas geçin)");
}

function handleCellClick(cellIndex) {
    if (!sabotageMode) return;

    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) {
        sabotageMode = null; return;
    }

    let p = players[currentPlayerIndex];
    if (p.score < 15) {
        alert("Bu yetenek için 15 puanın olmalı!");
        sabotageMode = null; return;
    }

    const cell = document.getElementById(`cell-${cellIndex}`);

    if (sabotageMode === 'freeze') {
        if (cell.querySelector('.tile')) {
            alert("Buz atmak için BOŞ bir hücre seçmelisin!");
            sabotageMode = null; return;
        }
        frozenCells[cellIndex] = playerCount * 3; 
        p.score = Math.max(0, p.score - 15);
        playSound('click');
        alert("Hücre 3 tur boyunca donduruldu!");
    } 
    
    sabotageMode = null;
    updateUI();
    renderSpecialCells();
    if (isOnlineMode) pushGameStateToFirebase();
}

function handleDrop(event, cellIndex) {
    event.preventDefault();

    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) {
        alert("Şu an sıra sizde değil, bekleyin!"); return;
    }

    if (frozenCells[cellIndex] && frozenCells[cellIndex] > 0) {
        alert("Bu hücre dondurulmuş! Buraya harf koyamazsınız."); return;
    }

    const cell = document.getElementById(`cell-${cellIndex}`);
    if (cell.querySelector('.tile')) { draggedTileInfo = null; updateUI(); return; }
    
    if (draggedTileInfo) {
        tempTiles.push({ ...draggedTileInfo, cellIndex: cellIndex });
        let activePlayer = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
        activePlayer.rack.splice(draggedTileInfo.rackIndex, 1);
        draggedTileInfo = null;
        playSound('click'); // YENİ: Harf koyma sesi
        renderTempTiles();
        updateUI();
        if (isOnlineMode) pushGameStateToFirebase();
    }
}

function renderTempTiles() {
    document.querySelectorAll('.tile:not(.fixed)').forEach(t => t.remove());
    tempTiles.forEach((tile, index) => {
        const cell = document.getElementById(`cell-${tile.cellIndex}`);
        const tileDiv = document.createElement('div');
        let rackOwnerIndex = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
        let pSkin = (players[rackOwnerIndex] && players[rackOwnerIndex].equipped) ? players[rackOwnerIndex].equipped.tile : 'tile-default';
        tileDiv.className = `tile ${pSkin}`;
        tileDiv.innerHTML = `<span class="letter">${tile.letter}</span><span class="point">${tile.points}</span>`;
        tileDiv.onclick = () => undoTile(index);
        cell.appendChild(tileDiv);
    });
}

function undoTile(index) {
    const tile = tempTiles[index];
    let activePlayer = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    if (!activePlayer.rack) activePlayer.rack = [];
    activePlayer.rack.push({ letter: tile.letter, points: tile.points });
    tempTiles.splice(index, 1);
    playSound('click'); // YENİ: Harf çekme sesi
    renderTempTiles();
    updateUI();
    if (isOnlineMode) pushGameStateToFirebase();
}

function createTileElement(tile, rackIndex) {
    const div = document.createElement('div');
    let rackOwnerIndex = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
    let pSkin = (players[rackOwnerIndex] && players[rackOwnerIndex].equipped) ? players[rackOwnerIndex].equipped.tile : 'tile-default';
    div.className = `tile ${pSkin}`;
    div.draggable = true;
    div.innerHTML = `<span class="letter">${tile.letter}</span><span class="point">${tile.points}</span>`;

    div.ondragstart = () => { 
        if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
        draggedTileInfo = { ...tile, rackIndex: rackIndex }; 
    };
    div.addEventListener('touchstart', (e) => {
        if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
        e.preventDefault(); draggedTileInfo = { ...tile, rackIndex: rackIndex };
    });
    div.addEventListener('touchmove', (e) => {
        if(!draggedTileInfo) return;
        e.preventDefault(); const touch = e.touches[0];
        div.style.position = 'absolute'; div.style.left = touch.clientX - div.offsetWidth/2 + 'px'; div.style.top = touch.clientY - div.offsetHeight/2 + 'px';
    });
    div.addEventListener('touchend', (e) => {
        if(!draggedTileInfo) return;
        e.preventDefault(); const touch = e.changedTouches[0];
        const elem = document.elementFromPoint(touch.clientX, touch.clientY);
        const cellElem = elem ? elem.closest('.cell') : null;
        if (cellElem) {
            const cellIndex = parseInt(cellElem.id.split('-')[1]);
            handleDrop({ preventDefault: () => {}, target: cellElem }, cellIndex);
        } else { draggedTileInfo = null; updateUI(); }
        div.style.position = 'relative'; div.style.left = ''; div.style.top = '';
    });
    return div;
}

function updateUI() {
    const scoreBoard = document.getElementById('score-board');
    scoreBoard.innerHTML = players.map((p, i) => {
        let pAvatar = p.equipped && p.equipped.avatar ? p.equipped.avatar : 'avatar-default';
        let icon = getAvatarIcon(pAvatar);
        return `<div style="${i === currentPlayerIndex ? 'color:red;font-weight:bold;' : ''}">${icon} ${p.name}: ${p.score}</div>`;
    }).join('');

    document.getElementById('bag-count').innerText = tileBag.length;
    
    if (isOnlineMode && currentPlayerIndex === myPlayerIndex) {
        document.getElementById('turn-info').innerHTML = `<span style="color:#2ecc71; font-weight:bold;">SIRA SENDE! Oyna!</span>`;
    } else {
        document.getElementById('turn-info').innerText = `Sıra: ${players[currentPlayerIndex]?.name || 'Bekleniyor...'}`;
    }
    
    const swapBtn = document.getElementById('swap-btn');
    if (tileBag.length === 0 || (isOnlineMode && currentPlayerIndex !== myPlayerIndex)) {
        swapBtn.disabled = true; swapBtn.style.opacity = "0.5";
    } else {
        swapBtn.disabled = false; swapBtn.style.opacity = "1";
    }

    const sabotagePanel = document.getElementById('sabotage-panel');
    if (sabotagePanel) {
        if (gameSettings.sabotageEnabled && (isOnlineMode ? currentPlayerIndex === myPlayerIndex : true)) {
            sabotagePanel.style.display = 'flex';
        } else {
            sabotagePanel.style.display = 'none';
        }
    }

    const rackElement = document.getElementById('player-rack');
    rackElement.innerHTML = '';
    rackElement.className = 'rack-container';
    
    let rackOwnerIndex = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
    if (players[rackOwnerIndex]) {
        let pRackSkin = players[rackOwnerIndex].equipped && players[rackOwnerIndex].equipped.rack ? players[rackOwnerIndex].equipped.rack : 'rack-default';
        if (pRackSkin !== 'rack-default') rackElement.classList.add(pRackSkin);

        if ((players[rackOwnerIndex].comboStreak || 0) >= 3) {
            rackElement.classList.add('on-fire');
        } else {
            rackElement.classList.remove('on-fire');
        }

        if (players[rackOwnerIndex].rack) {
            players[rackOwnerIndex].rack.forEach((tile, idx) => { rackElement.appendChild(createTileElement(tile, idx)); });
        }
    }
    
    renderSpecialCells();
    updateQuestUI(); 
}

function passTurn(isManualPass = false) {
    isTimerPaused = false; 
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Şu an sıra sizde değil!"); return; }
    
    sabotageMode = null; 
    
    let p = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    if (isManualPass) { p.passCount = (p.passCount || 0) + 1; }
    p.comboStreak = 0; 
    
    while (tempTiles.length > 0) undoTile(0);

    if (tileBag.length === 0) {
        if (gameOverCountdown === -1) gameOverCountdown = 3 * playerCount; 
        else gameOverCountdown--;
        if (gameOverCountdown <= 0) { endGame(); return; }
        document.getElementById('game-status-msg').innerText = `Oyun bitimine son ${Math.ceil(gameOverCountdown/playerCount)} tur!`;
    }

    questTurnCounter--;
    if (questTurnCounter <= 0) {
        if (questState === 'active') { generateNewQuest(); } else { generateNewQuest(); }
    }

    for (let key in frozenCells) {
        frozenCells[key]--;
        if (frozenCells[key] <= 0) delete frozenCells[key];
    }

    refillRack(p);

    currentPlayerIndex = (currentPlayerIndex + 1) % playerCount;
    
    if (isOnlineMode) {
        turnStartTime = Date.now() + serverTimeOffset;
    } else {
        turnStartTime = Date.now();
        startTurnTimer(); 
    }
    
    updateUI();

    if (isOnlineMode) pushGameStateToFirebase();
}

function swapLetters() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
    if (tileBag.length === 0) return;
    
    const p = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    while (tempTiles.length > 0) undoTile(0);

    if (!p.rack) p.rack = [];
    const countToSwap = Math.min(p.rack.length, tileBag.length);
    const oldLetters = p.rack.splice(0, countToSwap);
    for (let i = 0; i < countToSwap; i++) { p.rack.push(tileBag.pop()); }
    tileBag.push(...oldLetters);
    tileBag.sort(() => Math.random() - 0.5); 

    p.passCount = (p.passCount || 0) + 1;
    p.comboStreak = 0;

    playSound('click');
    alert(`${countToSwap} harf değiştirildi. Sıra geçiyor...`);
    passTurn(); 
}

function endGame(skipFirebase = false) {
    if (document.getElementById('oscar-modal').style.display === 'flex') return;
    window.onbeforeunload = null;

    if (isOnlineMode && roomRef && !skipFirebase) {
        pushGameStateToFirebase(true);
    }

    let winner = players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    let cambaz = players.reduce((prev, current) => ((prev.longestWord||"").length > (current.longestWord||"").length) ? prev : current);
    let gorevci = players.reduce((prev, current) => ((prev.questsCompleted||0) > (current.questsCompleted||0)) ? prev : current);
    let esek = players.reduce((prev, current) => ((prev.minesHit||0) > (current.minesHit||0)) ? prev : current);
    let bariscil = players.reduce((prev, current) => ((prev.passCount||0) > (current.passCount||0)) ? prev : current);

    document.getElementById('oscar-winner').innerText = `Kazanan: ${winner.name} (${winner.score} Puan)`;
    document.getElementById('oscar-longest').innerText = `${cambaz.name} - ${cambaz.longestWord || "Yok"} (${(cambaz.longestWord||"").length} Harf)`;
    document.getElementById('oscar-quests').innerText = `${gorevci.name} - ${gorevci.questsCompleted || 0} Görev`;
    document.getElementById('oscar-mines').innerText = `${esek.name} - ${esek.minesHit || 0} Kez Sürprize Denk Geldi`;
    document.getElementById('oscar-passes').innerText = `${bariscil.name} - ${bariscil.passCount || 0} Kez Pas/Değişim`;

    let myScore = 0;
    if (isOnlineMode && myPlayerIndex >= 0 && players[myPlayerIndex]) {
        myScore = players[myPlayerIndex].score;
    } else if (!isOnlineMode && players.length > 0) {
        myScore = players[0].score;
    }
    if (myScore > 0) {
        playerData.gold += myScore;
        savePlayerData();
        updateGoldDisplay();
    }

    playSound('success'); // Oyun bitiş sesi
    document.getElementById('oscar-modal').style.display = 'flex';
}

function triggerSuccessEffect(targetCells, scoreGained, isMine = false) {
    targetCells.forEach(cell => {
        const tile = cell.querySelector('.tile');
        if (tile) {
            tile.classList.add('success'); 
            if (isMine) tile.style.backgroundColor = 'red'; 
            
            setTimeout(() => { tile.classList.remove('success'); tile.style.backgroundColor = ''; }, 1000);
            
            const rect = cell.getBoundingClientRect();
            const fxLayer = document.getElementById('fx-layer');
            
            for (let i = 0; i < 5; i++) {
                const particle = document.createElement('div');
                particle.style.position = 'absolute'; particle.style.width = '6px'; particle.style.height = '6px';
                particle.style.backgroundColor = isMine ? 'red' : '#f1c40f'; 
                particle.style.borderRadius = '50%';
                particle.style.left = (rect.left + rect.width / 2) + 'px'; particle.style.top = (rect.top + rect.height / 2) + 'px';
                particle.style.transition = 'all 0.8s ease-out';
                fxLayer.appendChild(particle);
                setTimeout(() => {
                    particle.style.transform = `translate(${(Math.random() - 0.5) * 80}px, ${(Math.random() - 0.5) * 80}px) scale(0)`;
                    particle.style.opacity = '0';
                }, 50);
                setTimeout(() => particle.remove(), 850);
            }
        }
    });

    if (targetCells.length > 0) {
        const firstCellRect = targetCells[0].getBoundingClientRect();
        const fxLayer = document.getElementById('fx-layer');
        const floatingScore = document.createElement('div');
        floatingScore.className = 'floating-score';
        floatingScore.innerText = scoreGained;
        if (isMine) floatingScore.style.color = "red";
        
        floatingScore.style.left = (firstCellRect.left + (firstCellRect.width / 2) - 10) + 'px';
        floatingScore.style.top = (firstCellRect.top - 20) + 'px';
        fxLayer.appendChild(floatingScore);
        setTimeout(() => floatingScore.remove(), 2000);
    }
}

// ================= WORD CHECK LOGIC =================

let isChecking = false;
let isConfirmAnimating = false;

async function checkWord() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
    if (isChecking || isConfirmAnimating) return;
    if (!DICT || tempTiles.length === 0) return;

    let isConnected = false;
    let usedCenter = false;

    const firstIdx = tempTiles[0].cellIndex;
    const isH = tempTiles.every(t => Math.floor(t.cellIndex / 15) === Math.floor(firstIdx / 15));
    const isV = tempTiles.every(t => t.cellIndex % 15 === firstIdx % 15);

    if (!isH && !isV) { playSound('error'); alert("Harfler aynı sırada olmalı!"); return; }

    tempTiles.forEach(t => {
        if (t.cellIndex === 112) usedCenter = true;
        [t.cellIndex-1, t.cellIndex+1, t.cellIndex-15, t.cellIndex+15].forEach(n => {
            const c = document.getElementById(`cell-${n}`);
            if (c && c.querySelector('.tile.fixed')) isConnected = true;
        });
    });

    let hasFixedTiles = document.querySelectorAll('.tile.fixed').length > 0;
    if (!firstMove && !hasFixedTiles) {
        if (!usedCenter) { playSound('error'); alert("Tahta boş, kelime yıldızdan geçmeli!"); return; }
    } else if (!firstMove && !isConnected) {
        playSound('error'); alert("Mevcut bir harfe dokunmalısınız!"); return;
    }

    if (firstMove && !usedCenter) { playSound('error'); alert("İlk kelime yıldızdan geçmeli!"); return; }

    let totalTurnScore = 0;
    let anyValidWord = false;
    let validatedCells = []; 
    let formedWords = []; 
    let validNewTileIndices = new Set(); 

    let activeMap = MAPS[gameSettings.mapType] || MAPS.classic;
    let candidates = [];

    const scanAll = (isHorizontal) => {
        for (let i = 0; i < 15; i++) {
            let word = ""; let pSum = 0; let wMult = 1; let hasNew = false;
            let currentWordCells = []; 
            let currentNewIndices = []; 
            for (let j = 0; j < 15; j++) {
                let idx = isHorizontal ? (i * 15 + j) : (j * 15 + i);
                let tileEl = document.getElementById(`cell-${idx}`).querySelector('.tile');
                if (tileEl) {
                    let letter = tileEl.querySelector('.letter').innerText;
                    let p = parseInt(tileEl.querySelector('.point').innerText);
                    let isNew = !tileEl.classList.contains('fixed');
                    if (isNew) {
                        hasNew = true;
                        currentNewIndices.push(idx);
                        if (idx === 112) wMult *= 2; 
                        if (activeMap.tl && activeMap.tl.includes(idx)) p *= 3;
                        else if (activeMap.dl && activeMap.dl.includes(idx)) p *= 2;
                        if (activeMap.tw && activeMap.tw.includes(idx)) wMult *= 3;
                        else if (activeMap.dw && activeMap.dw.includes(idx)) wMult *= 2;
                    }
                    word += letter; pSum += p;
                    currentWordCells.push(document.getElementById(`cell-${idx}`));
                } else {
                    if (word.length > 1 && hasNew) candidates.push({ word, pSum, wMult, currentWordCells, currentNewIndices });
                    word = ""; pSum = 0; wMult = 1; hasNew = false; currentWordCells = []; currentNewIndices = [];
                }
            }
            if (word.length > 1 && hasNew) candidates.push({ word, pSum, wMult, currentWordCells, currentNewIndices });
        }
    };

    scanAll(true);
    scanAll(false);

    isChecking = true;
    isTimerPaused = true;
    let pauseStartTime = Date.now();

    try {
    
    // Doğrulanıyor Animasyonu ve UI
    document.getElementById('turn-info').innerHTML = `<span style="color:#f39c12; font-weight:bold;">⏳ TDK Doğrulanıyor...</span>`;
    let checkingCellIndices = tempTiles.map(t => t.cellIndex);
    tempTiles.forEach(t => {
        let cell = document.getElementById(`cell-${t.cellIndex}`);
        let tileEl = cell.querySelector('.tile:not(.fixed)');
        if (tileEl) tileEl.classList.add('checking-anim');
    });
    // Diğer oyunculara doğrulama animasyonunu yayınla
    broadcastAnimation('checking', { cellIndices: checkingCellIndices });

    let validDefinitions = [];

    for (let c of candidates) {
        let isLocalValid = DICT && DICT.has(c.word);
        let definition = await fetchWordDefinition(c.word.toLocaleLowerCase('tr'));
        let isValidFromTdk = definition !== null;
        
        if (isValidFromTdk) {
            validDefinitions.push({ word: c.word, def: definition });
            if (DICT) DICT.add(c.word); 
        } else if (isLocalValid) {
            validDefinitions.push({ word: c.word, def: "Sözlükte bulundu ancak TDK API'de tanımı yok." });
        }
        
        if (isValidFromTdk || isLocalValid) {
            totalTurnScore += (c.pSum * c.wMult); 
            anyValidWord = true;
            validatedCells.push(...c.currentWordCells);
            formedWords.push(c.word);
            c.currentNewIndices.forEach(id => validNewTileIndices.add(id));
        }
    }
    isChecking = false;

    if (anyValidWord) {
        let p = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
        let tilesToKeep = [];
        let returnedLetters = [];
        
        if (!p.rack) p.rack = []; 

        tempTiles.forEach(t => {
            if (validNewTileIndices.has(t.cellIndex)) {
                tilesToKeep.push(t);
            } else {
                p.rack.push({ letter: t.letter, points: t.points }); 
                let cell = document.getElementById(`cell-${t.cellIndex}`);
                let tileEl = cell.querySelector('.tile:not(.fixed)');
                if (tileEl) tileEl.remove(); 
                returnedLetters.push(t.letter);
            }
        });

        tempTiles = tilesToKeep;

        if (returnedLetters.length > 0) {
            if (isOnlineMode) pushGameStateToFirebase();
            playSound('error');
            alert(`Oluşturduğunuz geçerli kelimeler kabul edildi. Anlamlı bir kelimeye bağlanmayan harfleriniz (${returnedLetters.join(', ')}) ıstakanıza geri döndü.`);
        }

        let isMined = false;

        p.comboStreak = (p.comboStreak || 0) + 1;
        if (p.comboStreak >= 3) {
            totalTurnScore += 1; 
        }

        for (let w of formedWords) {
            if (w.length > (p.longestWord || "").length) {
                p.longestWord = w;
            }
        }

        if (questState === 'active' && currentQuest) {
            let questCompleted = false;
            for (let w of formedWords) {
                if (currentQuest.check(w)) { questCompleted = true; break; }
            }
            if (questCompleted) {
                totalTurnScore += currentQuest.points;
                p.questsCompleted = (p.questsCompleted || 0) + 1; 
                questState = 'cooldown';
                let pCount = Math.max(1, playerCount);
                questTurnCounter = 3 * pCount; 
                sendEmoji('🎉'); 
                playSound('success');
                alert(`GÖREV TAMAMLANDI: ${currentQuest.text}!`);
            }
        }

        if (validDefinitions.length > 0 && isOnlineMode) {
            let defsWithMeaning = validDefinitions.filter(d => d.def !== "Sözlükte bulundu ancak TDK API'de tanımı yok.");
            if (defsWithMeaning.length > 0) {
                let randDef = defsWithMeaning[Math.floor(Math.random() * defsWithMeaning.length)];
                roomRef.child('chat').push({
                    sender: "SİSTEM",
                    text: `🤓 İlginç Bilgi: ${randDef.word} - ${randDef.def}`,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
        }

        if (gameSettings.surprisesEnabled) {
            validatedCells.forEach(cell => {
                let idx = parseInt(cell.id.split('-')[1]);
                if (hiddenSurprises[idx] && validNewTileIndices.has(idx)) { 
                    let type = hiddenSurprises[idx];
                    
                    if (type === 'double_gain') {
                        totalTurnScore *= 2;
                        playSound('success');
                        alert("🎁 GİZLİ HAZİNE! Kazandığın puan 2'ye katlandı!");
                    } else if (type === 'half_lose') {
                        totalTurnScore = Math.floor(totalTurnScore / 2);
                        isMined = true;
                        p.minesHit = (p.minesHit || 0) + 1;
                        playSound('error');
                        alert("💥 MAYIN! Bu elde kazandığın puan yarıya düştü!");
                    } else if (type === 'plus_rand') {
                        let rand = Math.floor(Math.random() * 10) + 1;
                        totalTurnScore += rand;
                        playSound('success');
                        alert(`🎁 GİZLİ HAZİNE! Ekstra +${rand} Puan kazandın!`);
                    } else if (type === 'minus_rand') {
                        let rand = Math.floor(Math.random() * 10) + 1;
                        totalTurnScore -= rand;
                        isMined = true;
                        p.minesHit = (p.minesHit || 0) + 1;
                        playSound('error');
                        alert(`💥 MAYIN! Toplam puanından ${rand} Puan silindi!`);
                    }
                    
                    delete hiddenSurprises[idx]; 
                }
            });
        }
        
        // Doğrulanıyor animasyonunu temizle
        document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));

        // FIX: Önce tile'ları hemen fixed yap ve state'i güncelle (race condition önleme)
        document.querySelectorAll('.tile:not(.fixed)').forEach(t => t.classList.add('fixed'));
        tempTiles = [];
        p.score += totalTurnScore;
        firstMove = false;
        
        if (isOnlineMode) {
            players[myPlayerIndex] = p;
        } else {
            players[currentPlayerIndex] = p;
        }

        // FIX: Hemen Firebase'e push et, böylece listener tetiklendiğinde güncel veriyi kullanır
        if (isOnlineMode) pushGameStateToFirebase();
        updateUI();

        playSound('success');
        let scoreText = isMined ? ("-" + totalTurnScore) : ("+" + totalTurnScore);
        triggerSuccessEffect(validatedCells, scoreText, isMined);
        // Diğer oyunculara başarı animasyonunu yayınla
        let successCellIndices = validatedCells.map(c => parseInt(c.id.split('-')[1]));
        broadcastAnimation('success', { cellIndices: successCellIndices, scoreText: scoreText, isMine: isMined });
        
        // Animasyon süresince yeni hamle yapılmasını engelle, ama state zaten güncel
        isConfirmAnimating = true;
        setTimeout(() => {
            isConfirmAnimating = false;
            
            if (p.rack.length === 0 && tileBag.length === 0) {
                alert(`${p.name} tüm harflerini bitirdi! Oyun sonlanıyor.`);
                pushGameStateToFirebase(true);
                endGame();
                return;
            }

            passTurn(); 
        }, 1000); 
        
    } else {
        isTimerPaused = false;
        let pauseDuration = Date.now() - pauseStartTime;
        turnStartTime += pauseDuration;
        if (isOnlineMode) {
            roomRef.update({ turnStartTime: turnStartTime });
        }

        document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));
        updateUI(); 

        playSound('error');
        broadcastAnimation('error', {});
        alert("Geçerli bir kelime oluşturamadınız!");
        while (tempTiles.length > 0) undoTile(0);
    }

    } catch (error) {
        console.error("checkWord hatası:", error);
        isChecking = false;
        isTimerPaused = false;
        isConfirmAnimating = false;
        document.querySelectorAll('.checking-anim').forEach(el => el.classList.remove('checking-anim'));
        let pauseDuration = Date.now() - pauseStartTime;
        turnStartTime += pauseDuration;
        if (isOnlineMode) {
            roomRef.update({ turnStartTime: turnStartTime });
        }
        updateUI();
        alert("Bir hata oluştu, lütfen tekrar deneyin.");
    }
}

// ================= MAĞAZA (SHOP) KONTROLCÜSÜ =================

const SHOP_ITEMS = {
    tiles: [
        { id: 'tile-default', name: 'Klasik Ahşap', price: 0, preview: 'A' },
        { id: 'tile-gold', name: 'Altın Kaplama', price: 100, preview: 'A', class: 'tile-gold' },
        { id: 'tile-neon', name: 'Siber Neon', price: 100, preview: 'A', class: 'tile-neon' },
        { id: 'tile-diamond', name: 'Buzul Elmas', price: 100, preview: 'A', class: 'tile-diamond' },
        { id: 'tile-ruby', name: 'Ateş Yakut', price: 100, preview: 'A', class: 'tile-ruby' },
        { id: 'tile-emerald', name: 'Zümrüt Yeşili', price: 100, preview: 'Z', class: 'tile-emerald' },
        { id: 'tile-obsidian', name: 'Gece Karası', price: 100, preview: 'A', class: 'tile-obsidian' },
        { id: 'tile-rainbow', name: 'Gökkuşağı', price: 100, preview: 'W', class: 'tile-rainbow' },
        { id: 'tile-magic', name: 'Büyülü Aura 🌀', price: 100, preview: 'M', class: 'tile-magic' },
        { id: 'tile-electric', name: 'Yüksek Gerilim ⚡', price: 100, preview: 'E', class: 'tile-electric' },
        { id: 'tile-hologram', name: 'Hologram', price: 100, preview: 'H', class: 'tile-hologram' },
        { id: 'tile-fire', name: 'Alev Alev', price: 100, preview: 'F', class: 'tile-fire' },
        { id: 'tile-water', name: 'Okyanus Dalgası', price: 100, preview: 'O', class: 'tile-water' },
        { id: 'tile-toxic', name: 'Zehirli Asit', price: 100, preview: 'Z', class: 'tile-toxic' },
        { id: 'tile-cyber', name: 'Siber Şeffaf', price: 100, preview: 'C', class: 'tile-cyber' },
        { id: 'tile-lava', name: 'Magma Çekirdek', price: 100, preview: 'L', class: 'tile-lava' },
        { id: 'tile-ghost', name: 'Ruhani Gölge', price: 100, preview: 'G', class: 'tile-ghost' },
        { id: 'tile-royal', name: 'Kraliyet Kadifesi', price: 100, preview: 'K', class: 'tile-royal' },
        { id: 'tile-matrix', name: 'Sayısal Kod', price: 100, preview: '1', class: 'tile-matrix' },
        { id: 'tile-candy', name: 'Şeker Diyarı', price: 100, preview: 'S', class: 'tile-candy' }
    ],
    racks: [
        { id: 'rack-default', name: 'Klasik Ahşap', price: 0, class: '' },
        { id: 'rack-neon', name: 'Neon Çerçeve', price: 100, class: 'rack-neon' },
        { id: 'rack-lava', name: 'Akan Lav', price: 100, class: 'rack-lava' },
        { id: 'rack-ice', name: 'Buzul', price: 100, class: 'rack-ice' },
        { id: 'rack-gold', name: 'Altın Varak', price: 100, class: 'rack-gold' },
        { id: 'rack-void', name: 'Kara Delik', price: 100, class: 'rack-void' },
        { id: 'rack-cyber', name: 'Yüksek Teknoloji', price: 100, class: 'rack-cyber' },
        { id: 'rack-forest', name: 'Sarmaşık Sarılı', price: 100, class: 'rack-forest' },
        { id: 'rack-royal', name: 'İmparatorluk', price: 100, class: 'rack-royal' },
        { id: 'rack-blood', name: 'Vampir Tabutu', price: 100, class: 'rack-blood' },
        { id: 'rack-disco', name: 'Disko Pist', price: 100, class: 'rack-disco' }
    ],
    chats: [
        { id: 'chat-default', name: 'Standart', price: 0 },
        { id: 'chat-vip', name: 'VIP Altın', price: 100, class: 'chat-vip' },
        { id: 'chat-neon', name: 'Zehirli Yeşil', price: 100, class: 'chat-neon' },
        { id: 'chat-matrix', name: 'Hacker Matrix', price: 100, class: 'chat-matrix' },
        { id: 'chat-love', name: 'Sevgi Balonu', price: 100, class: 'chat-love' },
        { id: 'chat-fire', name: 'Alevli İsyankar', price: 100, class: 'chat-fire' },
        { id: 'chat-cloud', name: 'Mavi Bulut', price: 100, class: 'chat-cloud' },
        { id: 'chat-ice', name: 'Buz Sarkıtları', price: 100, class: 'chat-ice' },
        { id: 'chat-galaxy', name: 'Galaksi', price: 100, class: 'chat-galaxy' },
        { id: 'chat-royal', name: 'Kraliyet Moru', price: 100, class: 'chat-royal' },
        { id: 'chat-blood', name: 'Kan Kırmızı', price: 100, class: 'chat-blood' },
        { id: 'chat-party', name: 'Disko Parti', price: 100, class: 'chat-party' },
        { id: 'chat-retro', name: '8-Bit Retro', price: 100, class: 'chat-retro' },
        { id: 'chat-paper', name: 'Kağıt Uçak', price: 100, class: 'chat-paper' },
        { id: 'chat-ghost', name: 'Fısıltı', price: 100, class: 'chat-ghost' },
        { id: 'chat-gold-edge', name: 'Zengin Çizgisi', price: 100, class: 'chat-gold-edge' },
        { id: 'chat-tech', name: 'Teknik Kod', price: 100, class: 'chat-tech' }
    ],
    avatars: [
        { id: 'avatar-default', name: 'Anonim', price: 0, icon: '👤' },
        { id: 'avatar-king', name: 'Kral', price: 100, icon: '👑' },
        { id: 'avatar-wizard', name: 'Büyücü', price: 100, icon: '🧙‍♂️' },
        { id: 'avatar-ninja', name: 'Ninja', price: 100, icon: '🥷' },
        { id: 'avatar-alien', name: 'Uzaylı', price: 100, icon: '👽' },
        { id: 'avatar-pirate', name: 'Korsan', price: 100, icon: '🏴‍☠️' },
        { id: 'avatar-robot', name: 'Robot', price: 100, icon: '🤖' },
        { id: 'avatar-angel', name: 'Melek', price: 100, icon: '👼' },
        { id: 'avatar-devil', name: 'Şeytan', price: 100, icon: '😈' },
        { id: 'avatar-dragon', name: 'Ejderha', price: 100, icon: '🐉' },
        { id: 'avatar-ghost', name: 'Hayalet', price: 100, icon: '👻' },
        { id: 'avatar-vampire', name: 'Vampir', price: 100, icon: '🧛' },
        { id: 'avatar-unicorn', name: 'Tekboynuz', price: 100, icon: '🦄' },
        { id: 'avatar-monkey', name: 'Maymun Kral', price: 100, icon: '🐵' },
        { id: 'avatar-pumpkin', name: 'Balkabağı', price: 100, icon: '🎃' },
        { id: 'avatar-astronaut', name: 'Astronot', price: 100, icon: '👨‍🚀' },
        { id: 'avatar-detective', name: 'Detektif', price: 100, icon: '🕵️' },
        { id: 'avatar-scientist', name: 'Bilim İnsanı', price: 100, icon: '👨‍🔬' },
        { id: 'avatar-viking', name: 'Viking', price: 100, icon: '🪓' },
        { id: 'avatar-samurai', name: 'Samuray', price: 100, icon: '🎎' }
    ],
    boards: [
        { id: 'board-default', name: 'Klasik Beyaz', price: 0 },
        { id: 'board-parchment', name: 'Eski Parşömen', price: 100, class: 'board-parchment' },
        { id: 'board-space', name: 'Derin Uzay', price: 100, class: 'board-space' },
        { id: 'board-soccer', name: 'Futbol Sahası', price: 100, class: 'board-soccer' },
        { id: 'board-snow', name: 'Kış Masalı', price: 100, class: 'board-snow' },
        { id: 'board-lava', name: 'Cehennem Ateşi', price: 100, class: 'board-lava' },
        { id: 'board-cyberpunk', name: 'Siberpunk', price: 100, class: 'board-cyberpunk' },
        { id: 'board-ocean', name: 'Okyanus Dibi', price: 100, class: 'board-ocean' },
        { id: 'board-desert', name: 'Kızgın Çöl', price: 100, class: 'board-desert' },
        { id: 'board-casino', name: 'Casino Masası', price: 100, class: 'board-casino' },
        { id: 'board-hacker', name: 'Matrix Kodları', price: 100, class: 'board-hacker' },
        { id: 'board-palace', name: 'Altın Saray', price: 100, class: 'board-palace' },
        { id: 'board-haunted', name: 'Korku Evi', price: 100, class: 'board-haunted' },
        { id: 'board-nature', name: 'Doğa Ana', price: 100, class: 'board-nature' },
        { id: 'board-egypt', name: 'Antik Mısır', price: 100, class: 'board-egypt' },
        { id: 'board-volcano', name: 'Yanardağ', price: 100, class: 'board-volcano' }
    ]
};

function updateGoldDisplay() {
    let g = document.getElementById('player-gold-display');
    if (g) g.innerText = `💰 ${playerData.gold} Altın`;
    let sg = document.getElementById('shop-gold-display');
    if (sg) sg.innerText = `Bakiye: ${playerData.gold} Altın`;
}

function openShopModal() {
    updateGoldDisplay();
    document.getElementById('shop-modal').style.display = 'flex';
    openShopTab('tiles');
}

function openShopTab(tabName) {
    document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.shop-content').forEach(c => c.style.display = 'none');
    
    // Event üzerinden gelindiyse aktifi işaretle
    if (window.event && window.event.currentTarget && window.event.currentTarget.classList) {
        window.event.currentTarget.classList.add('active');
    } else {
        // Doğrudan çağrıldıysa (ilk açılış) ilgili butonu bul ve aktif et
        const btns = document.querySelectorAll('.shop-tab-btn');
        btns.forEach(b => { if(b.getAttribute('onclick').includes(tabName)) b.classList.add('active'); });
    }
    
    const content = document.getElementById(`shop-content-${tabName}`);
    if (content) {
        content.style.display = 'grid';
        renderShopItems(tabName);
    }
}

function renderShopItems(category) {
    let container = document.getElementById(`shop-content-${category}`);
    container.innerHTML = '';
    
    // Category mapping to equip key
    let eqKey = category === 'tiles' ? 'tile' : (category === 'racks' ? 'rack' : (category === 'chats' ? 'chat' : (category === 'avatars' ? 'avatar' : 'board')));

    SHOP_ITEMS[category].forEach(item => {
        let isOwned = playerData.owned.includes(item.id);
        let isEquipped = playerData.equipped[eqKey] === item.id;

        let btnHtml = '';
        if (isEquipped) {
            btnHtml = `<button disabled style="background:#2ecc71; color:white; border:none; padding:8px 5px; border-radius:5px; cursor:not-allowed; width:100%; font-weight:bold; font-size:13px;">✅ Kuşanıldı</button>`;
        } else if (isOwned) {
            btnHtml = `<button onclick="equipShopItem('${eqKey}', '${item.id}')" style="background:#3498db; color:white; border:none; padding:8px 5px; border-radius:5px; cursor:pointer; width:100%; font-weight:bold; font-size:13px;">Kuşan (Sende Var)</button>`;
        } else {
            btnHtml = `<button onclick="buyShopItem('${item.id}', ${item.price})" style="background:#e67e22; color:white; border:none; padding:8px 5px; border-radius:5px; cursor:pointer; width:100%; font-weight:bold; font-size:13px;">Satın Al: ${item.price} 💰</button>`;
        }

        let previewHtml = '';
        if (category === 'tiles') {
            previewHtml = `<div class="tile ${item.class || ''}" style="width: 44px; height: 44px; display:flex; margin: 10px auto; position:relative; transform: scale(1.2); flex-shrink:0;"><span class="letter">${item.preview}</span><span class="point">1</span></div>`;
        } else if (category === 'racks') {
            previewHtml = `<div class="rack-container ${item.class || ''}" style="margin: 10px auto; width:100%; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:none; font-size:12px; color:transparent;">■■■</div>`;
        } else if (category === 'chats') {
            previewHtml = `<div class="chat-msg ${item.class || ''}" style="margin: 10px auto; width:90%; text-align:center;">Örnek Mesaj</div>`;
        } else if (category === 'avatars') {
            previewHtml = `<div style="font-size:50px; text-align:center; margin: 10px 0;">${item.icon}</div>`;
        } else if (category === 'boards') {
            previewHtml = `<div style="height:60px; border-radius:5px; margin: 10px 0; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold;" class="${item.class || 'board-default'}" ${!item.class ? 'style="background:#f4f4f4; color:#333;"' : ''}>${item.name}</div>`;
        }

        container.innerHTML += `
            <div style="background:#fff; padding:12px; border-radius:10px; border:2px solid #ecf0f1; box-shadow:0 4px 6px rgba(0,0,0,0.05); text-align:center; display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
                <div style="width: 100%;">
                    ${previewHtml}
                    <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#2c3e50; line-height:1.2;">${item.name}</div>
                </div>
                ${btnHtml}
            </div>
        `;
    });
}

function buyShopItem(itemId, price) {
    if (playerData.gold < price) {
        playSound('error');
        alert("Yeterli altınınız yok! Oyun oynayarak altın kazanabilirsiniz.");
        return;
    }
    playerData.gold -= price;
    playerData.owned.push(itemId);
    savePlayerData();
    playSound('success');
    
    let cat = itemId.startsWith('tile') ? 'tiles' : 
              (itemId.startsWith('chat') ? 'chats' : 
              (itemId.startsWith('avatar') ? 'avatars' : 
              (itemId.startsWith('rack') ? 'racks' : 'boards')));
    updateGoldDisplay();
    renderShopItems(cat);
}

function equipShopItem(category, itemId) {
    playerData.equipped[category] = itemId;
    savePlayerData();
    
    // YENİ: Oyuncunun mevcut oyun verisindeki kuşanmış eşyalarını güncelle
    let pIdx = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
    if (players[pIdx]) {
        if (!players[pIdx].equipped) players[pIdx].equipped = {};
        players[pIdx].equipped[category] = itemId;
        
        // Eğer online ise diğerlerine de duyur (Örn: avatar değişince görsünler)
        if (isOnlineMode) pushGameStateToFirebase();
    }
    
    playSound('click');
    
    if (category === 'board') applyBoardTheme();
    
    updateUI(); // Harf/Istaka skini anında değişsin
    renderShopItems(category + 's');
}

function applyBoardTheme() {
    let bc = document.getElementById('board-container');
    if (!bc) return;
    bc.className = ''; 
    if (playerData.equipped.board !== 'board-default') {
        bc.classList.add(playerData.equipped.board);
    }
}

// Başlangıç yüklemeleri
document.addEventListener('DOMContentLoaded', () => {
    loadPlayerData();
    updateGoldDisplay();
    applyBoardTheme();
});
