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

// ================= OYUN AYARLARI & HARİTALAR =================
let gameSettings = {
    mapType: 'classic',
    surprisesEnabled: false,
    timerValue: 60 // 0 ise kapalı
};

const MAPS = {
    classic: { // Mevcut hali
        tw: [0, 7, 14, 105, 119, 210, 217, 224],
        dw: [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208],
        tl: [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204],
        dl: [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221]
    },
    cross: { // Çapraz ağırlıklı
        tw: [0, 14, 210, 224, 112],
        dw: [16, 28, 196, 208, 48, 56, 168, 176],
        tl: [32, 42, 182, 192],
        dl: [64, 70, 154, 160, 110, 114]
    },
    corners: { // Kenar ve köşeler bonuslu
        tw: [0, 14, 210, 224, 7, 105, 119, 217],
        dw: [1, 13, 15, 29, 195, 209, 211, 223],
        tl: [2, 12, 30, 44, 180, 194, 212, 222],
        dl: [3, 11, 45, 59, 165, 179, 213, 221]
    }
};

let hiddenSurprises = {}; 

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
let questState = 'active'; 
let questTurnCounter = 0; // GÜNCELLEME: Artık Raund başına hesaplanacak

function generateNewQuest() {
    let randIdx = Math.floor(Math.random() * QUEST_LIST.length);
    currentQuest = QUEST_LIST[randIdx];
    questState = 'active';
    // GÜNCELLEME: Tur sayısını oyuncu sayısıyla çarpıyoruz (3 Raund)
    let pCount = Math.max(1, playerCount);
    questTurnCounter = 3 * pCount; 
    updateQuestUI();
}

function updateQuestUI() {
    const qt = document.getElementById('quest-text');
    const qs = document.getElementById('quest-status');
    if (!currentQuest) return;

    // GÜNCELLEME: Ekranda gösterirken oyuncu sayısına bölüp yuvarlıyoruz (Gerçek Raund)
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

function startTurnTimer() {
    clearInterval(turnTimerInterval);
    const timerDisplay = document.getElementById('timer-display');
    
    if (gameSettings.timerValue <= 0) {
        timerDisplay.style.display = 'none';
        return;
    }
    
    timerDisplay.style.display = 'block';
    currentTimerValue = gameSettings.timerValue;
    document.getElementById('timer-val').innerText = currentTimerValue;

    turnTimerInterval = setInterval(() => {
        if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) {
            currentTimerValue--;
            document.getElementById('timer-val').innerText = currentTimerValue;
            if(currentTimerValue <= 0) currentTimerValue = 0;
            return;
        }

        currentTimerValue--;
        document.getElementById('timer-val').innerText = currentTimerValue;

        if (currentTimerValue <= 0) {
            clearInterval(turnTimerInterval);
            alert("Süreniz doldu! Sıra otomatik geçiyor.");
            passTurn();
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
    let tVal = parseInt(document.getElementById('timer-input').value);
    gameSettings.timerValue = isNaN(tVal) ? 0 : tVal;
}

// 1. ODA KURAN KİŞİ
function createOnlineRoom() {
    let playerName = document.getElementById('online-player-name').value;
    if (playerName.trim() === "") { alert("Lütfen adınızı girin!"); return; }

    getSettingsFromUI();

    const createBtn = document.getElementById('btn-create-room');
    createBtn.innerText = "Oda Kuruluyor...";
    createBtn.disabled = true;

    myOnlineRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    roomRef = db.ref('rooms/' + myOnlineRoomId);
    
    isOnlineMode = true;
    myPlayerIndex = 0; 
    playerCount = 1;

    initializeBag(); 
    players = [{ name: playerName, score: 0, rack: [] }];
    refillRack(players[0]); 

    if (gameSettings.surprisesEnabled) generateSurprises();
    generateNewQuest(); 

    roomRef.set({
        status: 'waiting',
        settings: gameSettings,
        hiddenSurprises: hiddenSurprises,
        quest: { currentQuest: currentQuest, questState: questState, questTurnCounter: questTurnCounter },
        players: players,
        tileBag: tileBag,
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
        myPlayerIndex = players.length; 
        playerCount = players.length + 1;

        tileBag = data.tileBag || []; 
        
        let newPlayer = { name: playerName, score: 0, rack: [] };
        players.push(newPlayer);
        refillRack(players[myPlayerIndex]); 

        roomRef.update({
            players: players,
            tileBag: tileBag 
        });

        document.getElementById('online-waiting-area').style.display = 'block';
        document.getElementById('room-link-text').innerText = "Bağlanıldı! Kurucunun başlatması bekleniyor...";
        joinBtn.style.display = 'none';

        listenToRoom(); 
        listenToChat(); 
        listenToEmojis();
    }).catch(error => {
        alert("Bağlantı Hatası: " + error.message);
        joinBtn.innerText = "Odaya Katıl";
        joinBtn.disabled = false;
    });
}

function startOnlineGame() {
    if (players.length < 2) { alert("Başlamak için en az 2 kişi olmalı!"); return; }
    
    // GÜNCELLEME: Oyun başlarken görev turunu gerçek oyuncu sayısına göre düzelt (Örn: 3 Raund * 4 Oyuncu = 12 Hamle)
    questTurnCounter = 3 * players.length;
    
    roomRef.update({ 
        status: 'playing',
        quest: { currentQuest: currentQuest, questState: questState, questTurnCounter: questTurnCounter }
    });
}

// ================= ODA DİNLEYİCİSİ VE LOBİ =================
function listenToRoom() {
    roomRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.settings) gameSettings = data.settings;
        if (data.hiddenSurprises) hiddenSurprises = data.hiddenSurprises;
        if (data.quest) {
            currentQuest = data.quest.currentQuest;
            questState = data.quest.questState;
            questTurnCounter = data.quest.questTurnCounter;
            updateQuestUI();
        }

        players = data.players || [];
        tileBag = data.tileBag || [];
        
        if (currentPlayerIndex !== data.currentPlayerIndex && data.status === 'playing') {
            currentPlayerIndex = data.currentPlayerIndex || 0;
            startTurnTimer();
        } else {
            currentPlayerIndex = data.currentPlayerIndex || 0;
        }

        playerCount = players.length;
        if (data.firstMove !== undefined) firstMove = data.firstMove;

        if (data.status === 'waiting') {
            document.getElementById('lobby-count').innerText = players.length;
            const listElement = document.getElementById('lobby-players-list');
            listElement.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
        }
        
        if (data.status === 'playing' && document.getElementById('game-screen').style.display === 'none') {
            document.getElementById('menu-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'flex';
            document.getElementById('chat-container').style.display = 'flex'; 
            if(document.getElementById('board').innerHTML === '') createBoard();
            startTurnTimer(); 
        }

        if (data.status === 'playing') {
            document.querySelectorAll('.tile.fixed').forEach(t => t.remove());
            if (currentPlayerIndex !== myPlayerIndex) {
                 document.querySelectorAll('.tile:not(.fixed)').forEach(t => t.remove());
            }
            
            let boardState = data.board || [];
            let tempBoardState = data.tempBoard || []; 
            
            boardState.forEach(item => {
                let cell = document.getElementById(`cell-${item.index}`);
                if (cell && !cell.querySelector('.tile.fixed')) {
                    let div = document.createElement('div');
                    div.className = 'tile fixed';
                    div.innerHTML = `<span class="letter">${item.letter}</span><span class="point">${item.points}</span>`;
                    cell.appendChild(div);
                }
            });
            
            if (currentPlayerIndex !== myPlayerIndex) {
                tempBoardState.forEach(item => {
                    let cell = document.getElementById(`cell-${item.index}`);
                    if (cell && !cell.querySelector('.tile')) {
                        let div = document.createElement('div');
                        div.className = 'tile'; 
                        div.innerHTML = `<span class="letter">${item.letter}</span><span class="point">${item.points}</span>`;
                        cell.appendChild(div);
                    }
                });
            }
            updateUI();
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
    const fxLayer = document.getElementById('fx-layer');
    const el = document.createElement('div');
    el.className = 'flying-emoji';
    el.innerText = emojiChar;
    el.style.left = (20 + Math.random() * 60) + 'vw';
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}


// ================= CHAT SİSTEMİ =================
function listenToChat() {
    roomRef.child('chat').on('child_added', snapshot => {
        const msg = snapshot.val();
        const msgDiv = document.createElement('div');
        if (msg.sender === players[myPlayerIndex].name) {
            msgDiv.className = 'chat-msg self';
        } else {
            msgDiv.className = 'chat-msg';
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
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = "";
}

function handleChatKeyPress(e) { if (e.key === "Enter") sendChatMessage(); }

function pushGameStateToFirebase() {
    if (!isOnlineMode || !roomRef) return;

    let boardState = [];
    for (let i = 0; i < 225; i++) {
        let cell = document.getElementById(`cell-${i}`);
        let tile = cell.querySelector('.tile.fixed');
        if (tile) {
            boardState.push({
                index: i,
                letter: tile.querySelector('.letter').innerText,
                points: parseInt(tile.querySelector('.point').innerText)
            });
        }
    }

    let tempBoardState = tempTiles.map(t => { return { index: t.cellIndex, letter: t.letter, points: t.points }; });

    roomRef.update({
        board: boardState,
        tempBoard: tempBoardState, 
        players: players,
        tileBag: tileBag,
        currentPlayerIndex: currentPlayerIndex,
        firstMove: firstMove,
        hiddenSurprises: hiddenSurprises,
        quest: { currentQuest: currentQuest, questState: questState, questTurnCounter: questTurnCounter }
    });
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

// ================= GAME STATE =================
let currentPlayerIndex = 0;
let playerCount = 0;
let players = [];
let tileBag = [];
let draggedTileInfo = null;
let firstMove = true;
let tempTiles = [];
let gameOverCountdown = -1;

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

    players = [];
    for (let i = 1; i <= playerCount; i++) {
        let nameVal = document.getElementById(`player-name-${i}`).value;
        if(nameVal.trim() === "") nameVal = `Oyuncu ${i}`;
        players.push({ name: nameVal, score: 0, rack: [] });
    }

    currentPlayerIndex = Math.floor(Math.random() * playerCount);
    
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
    
    alert(`Oyun Başlıyor! İlk sıradaki oyuncu rastgele seçildi:\n>>> ${players[currentPlayerIndex].name} <<<`);
}

function generateSurprises() {
    hiddenSurprises = {};
    let available = [];
    for(let i=0; i<225; i++) if(i !== 112) available.push(i);
    available.sort(() => Math.random() - 0.5);
    
    for(let i=0; i<3; i++) hiddenSurprises[available[i]] = 'treasure';
    for(let i=3; i<6; i++) hiddenSurprises[available[i]] = 'mine';
}

function initializeBag() {
    tileBag = [];
    letterDistribution.forEach(item => { for (let j = 0; j < item.count; j++) tileBag.push({ ...item }); });
    tileBag.sort(() => Math.random() - 0.5);
}

function refillRack(player) {
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
        boardElement.appendChild(cell);
    }
}

function handleDrop(event, cellIndex) {
    event.preventDefault();

    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) {
        alert("Şu an sıra sizde değil, bekleyin!");
        return;
    }

    const cell = document.getElementById(`cell-${cellIndex}`);
    if (cell.querySelector('.tile')) { draggedTileInfo = null; updateUI(); return; }
    
    if (draggedTileInfo) {
        tempTiles.push({ ...draggedTileInfo, cellIndex: cellIndex });
        let activePlayer = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
        activePlayer.rack.splice(draggedTileInfo.rackIndex, 1);
        draggedTileInfo = null;
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
        tileDiv.className = 'tile';
        tileDiv.innerHTML = `<span class="letter">${tile.letter}</span><span class="point">${tile.points}</span>`;
        tileDiv.onclick = () => undoTile(index);
        cell.appendChild(tileDiv);
    });
}

function undoTile(index) {
    const tile = tempTiles[index];
    let activePlayer = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    activePlayer.rack.push({ letter: tile.letter, points: tile.points });
    tempTiles.splice(index, 1);
    renderTempTiles();
    updateUI();
    if (isOnlineMode) pushGameStateToFirebase();
}

function createTileElement(tile, rackIndex) {
    const div = document.createElement('div');
    div.className = 'tile';
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
    scoreBoard.innerHTML = players.map((p, i) =>
        `<div style="${i === currentPlayerIndex ? 'color:red;font-weight:bold;' : ''}">${p.name}: ${p.score}</div>`
    ).join('');

    document.getElementById('bag-count').innerText = tileBag.length;
    
    if (isOnlineMode && currentPlayerIndex === myPlayerIndex) {
        document.getElementById('turn-info').innerHTML = `<span style="color:#2ecc71; font-weight:bold;">SIRA SENDE! Oyna!</span>`;
    } else {
        document.getElementById('turn-info').innerText = `Sıra: ${players[currentPlayerIndex]?.name || 'Bekleniyor...'}`;
    }
    
    const swapBtn = document.getElementById('swap-btn');
    if (tileBag.length === 0) { swapBtn.disabled = true; swapBtn.style.opacity = "0.5"; }

    const rackElement = document.getElementById('player-rack');
    rackElement.innerHTML = '';
    
    let rackOwnerIndex = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
    if (players[rackOwnerIndex] && players[rackOwnerIndex].rack) {
        players[rackOwnerIndex].rack.forEach((tile, idx) => { rackElement.appendChild(createTileElement(tile, idx)); });
    }
    
    updateQuestUI(); 
}

function passTurn() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Şu an sıra sizde değil!"); return; }
    while (tempTiles.length > 0) undoTile(0);

    if (tileBag.length === 0) {
        if (gameOverCountdown === -1) gameOverCountdown = 3 * playerCount; 
        else gameOverCountdown--;
        if (gameOverCountdown <= 0) { endGame(); return; }
        document.getElementById('game-status-msg').innerText = `Oyun bitimine son ${Math.ceil(gameOverCountdown/playerCount)} tur!`;
    }

    // GÖREV TUR KONTROLÜ (Gerçek oyuncu hamle sayısından düşüyor)
    questTurnCounter--;
    if (questTurnCounter <= 0) {
        if (questState === 'active') {
            generateNewQuest();
        } else {
            generateNewQuest();
        }
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerCount;
    refillRack(players[currentPlayerIndex]);
    
    if (!isOnlineMode) startTurnTimer(); 
    updateUI();

    if (isOnlineMode) pushGameStateToFirebase();
}

function swapLetters() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
    if (tileBag.length === 0) return;
    
    const p = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    while (tempTiles.length > 0) undoTile(0);

    const countToSwap = Math.min(p.rack.length, tileBag.length);
    const oldLetters = p.rack.splice(0, countToSwap);
    for (let i = 0; i < countToSwap; i++) { p.rack.push(tileBag.pop()); }
    tileBag.push(...oldLetters);
    tileBag.sort(() => Math.random() - 0.5); 

    alert(`${countToSwap} harf değiştirildi. Sıra geçiyor...`);
    passTurn(); 
}

function endGame() {
    let winner = players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    window.onbeforeunload = null;
    alert(`OYUN BİTTİ!\n\nKazanan: ${winner.name}\nSkor: ${winner.score}`);
    location.reload(); 
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

function checkWord() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
    if (!DICT || tempTiles.length === 0) return;

    let isConnected = false;
    let usedCenter = false;

    const firstIdx = tempTiles[0].cellIndex;
    const isH = tempTiles.every(t => Math.floor(t.cellIndex / 15) === Math.floor(firstIdx / 15));
    const isV = tempTiles.every(t => t.cellIndex % 15 === firstIdx % 15);

    if (!isH && !isV) { alert("Harfler aynı sırada olmalı!"); return; }

    tempTiles.forEach(t => {
        if (t.cellIndex === 112) usedCenter = true;
        [t.cellIndex-1, t.cellIndex+1, t.cellIndex-15, t.cellIndex+15].forEach(n => {
            const c = document.getElementById(`cell-${n}`);
            if (c && c.querySelector('.tile.fixed')) isConnected = true;
        });
    });

    if (firstMove && !usedCenter) { alert("İlk kelime yıldızdan geçmeli!"); return; }
    if (!firstMove && !isConnected) { alert("Mevcut bir harfe dokunmalısınız!"); return; }

    let totalTurnScore = 0;
    let anyValidWord = false;
    let validatedCells = []; 
    let formedWords = []; 

    let activeMap = MAPS[gameSettings.mapType] || MAPS.classic;

    const scanAll = (isHorizontal) => {
        for (let i = 0; i < 15; i++) {
            let word = ""; let pSum = 0; let wMult = 1; let hasNew = false;
            let currentWordCells = []; 
            for (let j = 0; j < 15; j++) {
                let idx = isHorizontal ? (i * 15 + j) : (j * 15 + i);
                let tileEl = document.getElementById(`cell-${idx}`).querySelector('.tile');
                if (tileEl) {
                    let letter = tileEl.querySelector('.letter').innerText;
                    let p = parseInt(tileEl.querySelector('.point').innerText);
                    let isNew = !tileEl.classList.contains('fixed');
                    if (isNew) {
                        hasNew = true;
                        if (idx === 112) wMult *= 2; 
                        if (activeMap.tl && activeMap.tl.includes(idx)) p *= 3;
                        else if (activeMap.dl && activeMap.dl.includes(idx)) p *= 2;
                        if (activeMap.tw && activeMap.tw.includes(idx)) wMult *= 3;
                        else if (activeMap.dw && activeMap.dw.includes(idx)) wMult *= 2;
                    }
                    word += letter; pSum += p;
                    currentWordCells.push(document.getElementById(`cell-${idx}`));
                } else {
                    if (word.length > 1 && hasNew && DICT.has(word)) {
                        totalTurnScore += (pSum * wMult); anyValidWord = true;
                        validatedCells.push(...currentWordCells);
                        formedWords.push(word);
                    }
                    word = ""; pSum = 0; wMult = 1; hasNew = false; currentWordCells = [];
                }
            }
            if (word.length > 1 && hasNew && DICT.has(word)) {
                totalTurnScore += (pSum * wMult); anyValidWord = true;
                validatedCells.push(...currentWordCells);
                formedWords.push(word);
            }
        }
    };

    scanAll(true);
    scanAll(false);

    if (anyValidWord) {
        
        let isMined = false;

        // Görev kontrolü
        if (questState === 'active' && currentQuest) {
            let questCompleted = false;
            for (let w of formedWords) {
                if (currentQuest.check(w)) {
                    questCompleted = true;
                    break;
                }
            }
            if (questCompleted) {
                totalTurnScore += currentQuest.points;
                questState = 'cooldown';
                // GÜNCELLEME: Mola sayacını gerçek oyuncu sayısına göre ayarla
                let pCount = Math.max(1, playerCount);
                questTurnCounter = 3 * pCount; 
                sendEmoji('🎉'); 
                alert(`GÖREV TAMAMLANDI: ${currentQuest.text}!`);
            }
        }

        // Sürpriz Kutu Kontrolü
        if (gameSettings.surprisesEnabled) {
            validatedCells.forEach(cell => {
                let idx = parseInt(cell.id.split('-')[1]);
                if (hiddenSurprises[idx]) {
                    if (hiddenSurprises[idx] === 'treasure') {
                        totalTurnScore += 20;
                        alert("🎁 GİZLİ HAZİNE BULDUN! +20 Puan!");
                    } else if (hiddenSurprises[idx] === 'mine') {
                        totalTurnScore = Math.floor(totalTurnScore / 2);
                        isMined = true;
                        alert("💥 MAYINA BASTIN! Bu elde kazandığın puan yarıya düştü!");
                    }
                    delete hiddenSurprises[idx]; 
                }
            });
        }

        triggerSuccessEffect(validatedCells, isMined ? ("-" + totalTurnScore) : ("+" + totalTurnScore), isMined);
        
        setTimeout(() => {
            document.querySelectorAll('.tile:not(.fixed)').forEach(t => t.classList.add('fixed'));
            tempTiles = [];
            players[currentPlayerIndex].score += totalTurnScore;
            firstMove = false;
            
            if (players[currentPlayerIndex].rack.length === 0 && tileBag.length === 0) {
                alert(`${players[currentPlayerIndex].name} tüm harflerini bitirdi! Oyun sonlanıyor.`);
                endGame();
                return;
            }

            passTurn(); 
        }, 1000); 
        
    } else {
        alert("Geçerli bir kelime oluşturamadınız!");
    }
}