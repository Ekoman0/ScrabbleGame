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

// ================= MENÜ YÖNETİMİ =================
function showOfflineMenu() {
    isOnlineMode = false;
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('offline-menu').style.display = 'block';
}

function showOnlineMenu() {
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('online-menu').style.display = 'block';
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('oda');
    
    if (roomParam) {
        myOnlineRoomId = roomParam;
        document.getElementById('btn-create-room').style.display = 'none';
        document.getElementById('btn-join-room').style.display = 'block';
        document.getElementById('room-link-text').innerText = `Davet Geldi: Oda ${roomParam}`;
    }
}

// 1. ODA KURAN KİŞİ
function createOnlineRoom() {
    let playerName = document.getElementById('online-player-name').value;
    if (playerName.trim() === "") { alert("Lütfen adınızı girin!"); return; }

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

    roomRef.set({
        status: 'waiting',
        players: players,
        tileBag: tileBag,
        currentPlayerIndex: 0,
        board: [],
        firstMove: true 
    }).then(() => {
        let roomUrl = window.location.origin + window.location.pathname + "?oda=" + myOnlineRoomId;
        document.getElementById('room-link-text').innerHTML = `<b>Oda: ${myOnlineRoomId}</b><br><a href="${roomUrl}" target="_blank" style="color:#3498db; word-break: break-all;">${roomUrl}</a>`;
        document.getElementById('online-waiting-area').style.display = 'block';
        createBtn.style.display = 'none';

        listenToRoom(); 
        listenToChat(); // YENİ: Chat'i dinlemeye başla
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
        listenToChat(); // YENİ: Chat'i dinlemeye başla
    }).catch(error => {
        alert("Bağlantı Hatası: " + error.message);
        joinBtn.innerText = "Odaya Katıl";
        joinBtn.disabled = false;
    });
}

function startOnlineGame() {
    if (players.length < 2) { alert("Başlamak için en az 2 kişi olmalı!"); return; }
    roomRef.update({ status: 'playing' });
}

// ================= ODA DİNLEYİCİSİ VE LOBİ =================
function listenToRoom() {
    roomRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        players = data.players || [];
        tileBag = data.tileBag || [];
        currentPlayerIndex = data.currentPlayerIndex || 0;
        playerCount = players.length;
        
        if (data.firstMove !== undefined) {
            firstMove = data.firstMove;
        }

        // YENİ: Lobi Ekranı Güncellemesi
        if (data.status === 'waiting') {
            document.getElementById('lobby-count').innerText = players.length;
            const listElement = document.getElementById('lobby-players-list');
            listElement.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
            
            // Eğer ben kurucu değilsem başlat butonunu gizleyebilirim (İsteğe bağlı, şimdilik duruyor)
        }
        
        // Oyun Başlama Anı
        if (data.status === 'playing' && document.getElementById('game-screen').style.display === 'none') {
            document.getElementById('menu-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'flex';
            document.getElementById('chat-container').style.display = 'flex'; // Chat'i göster
            if(document.getElementById('board').innerHTML === '') createBoard();
        }

        // Oyun İçi Tahta Senkronizasyonu
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

// ================= YENİ: CHAT SİSTEMİ =================
function listenToChat() {
    roomRef.child('chat').on('child_added', snapshot => {
        const msg = snapshot.val();
        const msgDiv = document.createElement('div');
        
        // Kendi mesajımızsa sağa yasla ve mavi yap
        if (msg.sender === players[myPlayerIndex].name) {
            msgDiv.className = 'chat-msg self';
        } else {
            msgDiv.className = 'chat-msg';
        }
        
        msgDiv.innerHTML = `<span>${msg.sender}</span>${msg.text}`;
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(msgDiv);
        
        // Otomatik en aşağıya kaydır
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text === "") return;
    
    // Mesajı Firebase'e gönder
    roomRef.child('chat').push({
        sender: players[myPlayerIndex].name,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Kutuyu temizle
    input.value = "";
}

function handleChatKeyPress(e) {
    if (e.key === "Enter") {
        sendChatMessage();
    }
}


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

    let tempBoardState = tempTiles.map(t => {
        return {
            index: t.cellIndex,
            letter: t.letter,
            points: t.points
        };
    });

    roomRef.update({
        board: boardState,
        tempBoard: tempBoardState, 
        players: players,
        tileBag: tileBag,
        currentPlayerIndex: currentPlayerIndex,
        firstMove: firstMove 
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

const bonuses = {
    tw: [0, 7, 14, 105, 119, 210, 217, 224],
    dw: [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208],
    tl: [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204],
    dl: [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221]
};

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
    
    players = [];
    for (let i = 1; i <= playerCount; i++) {
        let nameVal = document.getElementById(`player-name-${i}`).value;
        if(nameVal.trim() === "") nameVal = `Oyuncu ${i}`;
        players.push({ name: nameVal, score: 0, rack: [] });
    }

    currentPlayerIndex = Math.floor(Math.random() * playerCount);
    
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none'; // Offline modda chat kapalı
    
    initializeBag();
    players.forEach(p => refillRack(p));
    createBoard();
    updateUI();
    
    alert(`Oyun Başlıyor! İlk sıradaki oyuncu rastgele seçildi:\n>>> ${players[currentPlayerIndex].name} <<<`);
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
    for (let i = 0; i < 225; i++) {
        let cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `cell-${i}`;
        if (i === 112) { cell.classList.add('center'); cell.innerText = '★'; }
        else if (bonuses.tw.includes(i)) { cell.classList.add('tw'); cell.innerText = '3X KELİME'; }
        else if (bonuses.dw.includes(i)) { cell.classList.add('dw'); cell.innerText = '2X KELİME'; }
        else if (bonuses.tl.includes(i)) { cell.classList.add('tl'); cell.innerText = '3X HARF'; }
        else if (bonuses.dl.includes(i)) { cell.classList.add('dl'); cell.innerText = '2X HARF'; }
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
    
    if (cell.querySelector('.tile')) {
        draggedTileInfo = null;
        updateUI(); 
        return;
    }
    
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
        e.preventDefault();
        draggedTileInfo = { ...tile, rackIndex: rackIndex };
    });

    div.addEventListener('touchmove', (e) => {
        if(!draggedTileInfo) return;
        e.preventDefault();
        const touch = e.touches[0];
        div.style.position = 'absolute';
        div.style.left = touch.clientX - div.offsetWidth/2 + 'px';
        div.style.top = touch.clientY - div.offsetHeight/2 + 'px';
    });

    div.addEventListener('touchend', (e) => {
        if(!draggedTileInfo) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const elem = document.elementFromPoint(touch.clientX, touch.clientY);
        const cellElem = elem ? elem.closest('.cell') : null;
        
        if (cellElem) {
            const cellIndex = parseInt(cellElem.id.split('-')[1]);
            handleDrop({ preventDefault: () => {}, target: cellElem }, cellIndex);
        } else {
            draggedTileInfo = null;
            updateUI();
        }
        
        div.style.position = 'relative'; 
        div.style.left = '';
        div.style.top = '';
    });

    return div;
}

// ================= UI & TURN MANAGEMENT =================

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
    if (tileBag.length === 0) {
        swapBtn.disabled = true;
        swapBtn.style.opacity = "0.5";
    }

    const rackElement = document.getElementById('player-rack');
    rackElement.innerHTML = '';
    
    let rackOwnerIndex = isOnlineMode ? myPlayerIndex : currentPlayerIndex;
    
    if (players[rackOwnerIndex] && players[rackOwnerIndex].rack) {
        players[rackOwnerIndex].rack.forEach((tile, idx) => {
            rackElement.appendChild(createTileElement(tile, idx));
        });
    }
}

function passTurn() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Şu an sıra sizde değil!"); return; }

    while (tempTiles.length > 0) undoTile(0);

    if (tileBag.length === 0) {
        if (gameOverCountdown === -1) gameOverCountdown = 3 * playerCount; 
        else gameOverCountdown--;

        if (gameOverCountdown <= 0) {
            endGame();
            return;
        }
        document.getElementById('game-status-msg').innerText = `Oyun bitimine son ${Math.ceil(gameOverCountdown/playerCount)} tur!`;
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerCount;
    refillRack(players[currentPlayerIndex]);
    updateUI();

    if (isOnlineMode) {
        pushGameStateToFirebase();
    }
}

// ================= ACTIONS =================

function swapLetters() {
    if (isOnlineMode && currentPlayerIndex !== myPlayerIndex) { alert("Sıra sizde değil!"); return; }
    if (tileBag.length === 0) return;
    
    const p = isOnlineMode ? players[myPlayerIndex] : players[currentPlayerIndex];
    while (tempTiles.length > 0) undoTile(0);

    const countToSwap = Math.min(p.rack.length, tileBag.length);
    
    const oldLetters = p.rack.splice(0, countToSwap);
    for (let i = 0; i < countToSwap; i++) {
        p.rack.push(tileBag.pop());
    }
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

// ================= EFEKT FONKSİYONU =================
function triggerSuccessEffect(targetCells, scoreGained) {
    targetCells.forEach(cell => {
        const tile = cell.querySelector('.tile');
        if (tile) {
            tile.classList.add('success'); 
            
            setTimeout(() => {
                tile.classList.remove('success');
            }, 1000);
            
            const rect = cell.getBoundingClientRect();
            const fxLayer = document.getElementById('fx-layer');
            
            for (let i = 0; i < 5; i++) {
                const particle = document.createElement('div');
                particle.style.position = 'absolute';
                particle.style.width = '6px';
                particle.style.height = '6px';
                particle.style.backgroundColor = '#f1c40f'; 
                particle.style.borderRadius = '50%';
                particle.style.left = (rect.left + rect.width / 2) + 'px';
                particle.style.top = (rect.top + rect.height / 2) + 'px';
                particle.style.transition = 'all 0.8s ease-out';
                
                fxLayer.appendChild(particle);
                
                setTimeout(() => {
                    const moveX = (Math.random() - 0.5) * 80;
                    const moveY = (Math.random() - 0.5) * 80;
                    particle.style.transform = `translate(${moveX}px, ${moveY}px) scale(0)`;
                    particle.style.opacity = '0';
                }, 50);
                
                setTimeout(() => particle.remove(), 850);
            }
        }
    });

    if (targetCells.length > 0 && scoreGained > 0) {
        const firstCellRect = targetCells[0].getBoundingClientRect();
        const fxLayer = document.getElementById('fx-layer');
        
        const floatingScore = document.createElement('div');
        floatingScore.className = 'floating-score';
        floatingScore.innerText = "+" + scoreGained;
        
        floatingScore.style.left = (firstCellRect.left + (firstCellRect.width / 2) - 10) + 'px';
        floatingScore.style.top = (firstCellRect.top - 20) + 'px';
        
        fxLayer.appendChild(floatingScore);
        
        setTimeout(() => {
            floatingScore.remove();
        }, 2000);
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
                        if (bonuses.tl.includes(idx)) p *= 3;
                        else if (bonuses.dl.includes(idx)) p *= 2;
                        if (bonuses.tw.includes(idx)) wMult *= 3;
                        else if (bonuses.dw.includes(idx)) wMult *= 2;
                    }
                    word += letter; pSum += p;
                    currentWordCells.push(document.getElementById(`cell-${idx}`));
                } else {
                    if (word.length > 1 && hasNew && DICT.has(word)) {
                        totalTurnScore += (pSum * wMult); anyValidWord = true;
                        validatedCells.push(...currentWordCells);
                    }
                    word = ""; pSum = 0; wMult = 1; hasNew = false; currentWordCells = [];
                }
            }
            if (word.length > 1 && hasNew && DICT.has(word)) {
                totalTurnScore += (pSum * wMult); anyValidWord = true;
                validatedCells.push(...currentWordCells);
            }
        }
    };

    scanAll(true);
    scanAll(false);

    if (anyValidWord) {
        triggerSuccessEffect(validatedCells, totalTurnScore);
        
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