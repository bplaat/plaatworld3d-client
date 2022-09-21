(function () {
    // Constants
    const VERSION = '0.4.1';
    const DEBUG = !(window.location.hostname == 'plaatworld3d.ml' && window.location.hostname == 'plaatworld3d.netlify.app');
    const DEBUG_CONSOLE = DEBUG && false;

    const CHAT_SERVER_PLAYER_ID = 0;
    const CHAT_MAX = 10;
    const CHAT_TIMEOUT = 10000;

    const MAP_SIZE = 750;
    const MAP_GRAVITY = 6;

    const SPAWN_SIZE = 10;

    const CRATE_SIZE = 10;

    const BANK_SIZE = 5;
    const BANK_TIMEOUT = 500;

    const HOSPITAL_SIZE = 5;
    const HOSPITAL_TIMEOUT = 250;

    const DOOR_SIZE = 4;

    const PLAYER_MOVE_TIMEOUT = 150;
    const PLAYER_HEIGHT = 2;
    const PLAYER_WEIGHT = 25;
    const PLAYER_SENSITIVITY = 0.004;
    let playerSpeed = 75;
    let playerJumpHeight = 50;

    const BULLET_SPEED = 25;
    const BULLET_TIMEOUT = 2500;

    const SHOP_DISTANCE = MAP_SIZE * 3;
    const SHOP_SIZE = 32;
    const SHOP_ITEM_SIZE = 6;
    const SHOP_TIMEOUT = 500;

    const STRENGHT_COST = 10;
    const STRENGHT_STEP = 2;

    const ATTACK_COST = 25;
    const ATTACK_STEP = 2;

    const JUMP_COST = 25;
    const JUMP_STEP = 5;

    const SPEED_COST = 20;
    const SPEED_STEP = 10;

    const MOVEMENT_PRECISION = 3;

    // Round function
    function round (number, precision) {
        return Number(number.toFixed(precision));
    }

    // Rand functions
    let seed = 1;

    function random() {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    function rand (min, max) {
        return Math.floor(random() * (max - min + 1)) + min;
    }

    // Elements
    let connected = false;
    let died = false;
    let lock = false;

    const loadingLayerElement = document.getElementById('loading-layer');

    const menuLayerElement = document.getElementById('menu-layer');
    const versionLabelElements = document.querySelectorAll('.version-label');
    const nameInputElement = document.getElementById('name-input');
    const playButtonElement = document.getElementById('play-button');

    const controlsLayerElement = document.getElementById('controls-layer');
    const playerListElement = document.getElementById('player-list');
    const statsLabelElement = document.getElementById('stats-label');
    const healthBarElement = document.getElementById('health-bar');
    const chatListElement = document.getElementById('chat-list');
    const chatInputElement = document.getElementById('chat-input');

    const versionLayerElement = document.getElementById('version-layer');
    const serverVersionElement = document.getElementById('server-version');
    const clientVersionElement = document.getElementById('client-version');
    const retryButtonElement = document.getElementById('retry-button');

    const diedLayerElement = document.getElementById('died-layer');
    const playerNameElement = document.getElementById('player-name');
    const respawnButtonElement = document.getElementById('respawn-button');

    const disconnectLayerElement = document.getElementById('disconnect-layer');
    const reconnectButtonElement = document.getElementById('reconnect-button');

    // Version labels
    for (const versionLabelElement of versionLabelElements) {
        versionLabelElement.textContent = 'v' + VERSION;
    }

    // Name input
    if (localStorage.getItem('name') == null) {
        localStorage.setItem('name', nameInputElement.value);
    } else {
        nameInputElement.value = localStorage.getItem('name');
    }

    nameInputElement.addEventListener('input', function () {
        localStorage.setItem('name', nameInputElement.value);
        sendMessage('player.name', { name: nameInputElement.value });
        updatePlayer(player.id, { name: nameInputElement.value });
    });

    // Play button
    function requestLock () {
        renderer.domElement.requestPointerLock();
    }

    playButtonElement.addEventListener('click', function () {
        requestLock();
    });

    document.addEventListener('pointerlockchange', function () {
        lock = document.pointerLockElement == renderer.domElement;
        if (lock) {
            nameInputElement.blur();
            menuLayerElement.classList.add('hidden');
            controlsLayerElement.classList.remove('hidden');
        } else {
            menuLayerElement.classList.remove('hidden');
            controlsLayerElement.classList.add('hidden');
        }
    });

    // Retry, respawn and reconnect button
    retryButtonElement.addEventListener('click', function () {
        window.location.reload();
    });
    respawnButtonElement.addEventListener('click', function () {
        window.location.reload();
    });
    reconnectButtonElement.addEventListener('click', function () {
        window.location.reload();
    });

    // Stats label
    if (DEBUG) {
        statsLabelElement.classList.add('hidden');
    }

    // Scene
    const scene = new THREE.Scene();
    const backgroundColor = 0x80c0e0;
    scene.background = new THREE.Color(backgroundColor);
    scene.fog = new THREE.Fog(backgroundColor, 0, 350);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.z = MAP_SIZE;

    // Audio
    class Sound {
        constructor (audio_url) {
            this.channels = [];
            this.number = 10;
            this.index = 0;
            for (let i = 0; i < this.number; i++) {
                this.channels.push(new Audio(audio_url));
            }
        }

        play () {
            this.channels[this.index++].play();
            this.index = this.index < this.number ? this.index : 0;
        }

        playAtPosition (position, radius) {
            var distance = camera.position.distanceTo(position);
            if (distance <= radius) {
                this.channels[this.index].volume = 1 - distance / radius;
                this.play();
            }
        }
    }

    const shootSound = new Sound('/sounds/shoot.wav');
    const explosionSound = new Sound('/sounds/explosion.wav');
    const hitSound = new Sound('/sounds/hit.wav');
    const jumpSound = new Sound('/sounds/jump.wav');
    const coinSound = new Sound('/sounds/coin.wav');
    const healSound = new Sound('/sounds/heal.wav');
    const doorSound = new Sound('/sounds/door.wav');

    // Renderer
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Stats
    var stats = new Stats();
    stats.dom.style.top = '';
    stats.dom.style.left = '';
    stats.dom.style.right = '8px';
    stats.dom.style.bottom = '8px';
    document.body.appendChild(stats.dom);

    // Websockets communication
    const namePlateGeometry = new THREE.PlaneGeometry(1, 0.25);

    const headGeometry = new THREE.BoxGeometry(1, 1, 1);
    const faceTexture = new THREE.TextureLoader().load('/images/face.jpg');
    const headTexture = new THREE.TextureLoader().load('/images/head.jpg');
    const headMaterials = [
        new THREE.MeshBasicMaterial({ map: headTexture }),
        new THREE.MeshBasicMaterial({ map: headTexture }),
        new THREE.MeshBasicMaterial({ map: headTexture }),
        new THREE.MeshBasicMaterial({ map: headTexture }),
        new THREE.MeshBasicMaterial({ map: headTexture }),
        new THREE.MeshBasicMaterial({ map: faceTexture })
    ];

    const bodyGeometry = new THREE.BoxGeometry(1, 1.5, 1);
    const bodyTexture = new THREE.TextureLoader().load('/images/body.jpg');
    const bodyMaterial = new THREE.MeshBasicMaterial({ map: bodyTexture });

    let player;
    const playersGroup = new THREE.Group();
    scene.add(playersGroup);
    const players = [];

    let ws;
    if (window.location.hostname == 'plaatworld3d.ml' || window.location.hostname == 'plaatworld3d.netlify.app') {
        ws = new WebSocket('wss://plaatworld3d.fly.dev/');
    } else {
        ws = new WebSocket('ws://localhost:8080/');
    }

    function sendMessage (type, data) {
        if (DEBUG_CONSOLE) console.log('SENT: ', JSON.stringify({ type: type, data: data }));
        ws.send(JSON.stringify({ type: type, data: data }));
    }

    function addChat (name, message) {
        const chatItem = document.createElement('div');
        chatListElement.appendChild(chatItem);

        const chatName = document.createElement('b');
        chatName.textContent = name;
        chatItem.appendChild(chatName);

        chatItem.appendChild(document.createTextNode(': ' + message));

        if (chatListElement.children.length == CHAT_MAX + 1) {
            chatListElement.removeChild(chatListElement.firstChild);
        }

        setTimeout(function () {
            if (chatListElement.children.length != 0) {
                chatListElement.removeChild(chatListElement.firstChild);
            }
        }, CHAT_TIMEOUT);
    }

    function getPlayer (player_id) {
        for (let i = 0; i < players.length; i++) {
            if (players[i].id == player_id) {
                return players[i];
            }
        }
    }

    function updatePlayer (player_id, props) {
        for (let i = 0; i < players.length; i++) {
            if (players[i].id == player_id) {

                if (props.name != undefined) {
                    players[i].name = props.name;
                    if (player_id != player.id) {
                        renderNamePlate(players[i].namePlateCanvas, players[i]);
                        players[i].namePlateTexture.needsUpdate = true;
                    }
                }

                if (props.health != undefined) players[i].health = props.health;
                if (props.strength != undefined) players[i].strength = props.strength;

                if (props.health != undefined || props.strength != undefined) {
                    if (player_id == player.id) {
                        healthBarElement.style.width = players[i].health / players[i].strength * 100 + '%';
                    } else {
                        renderNamePlate(players[i].namePlateCanvas, players[i]);
                        players[i].namePlateTexture.needsUpdate = true;
                    }
                }

                if (props.attack != undefined) players[i].attack = props.attack;
                if (props.money != undefined) players[i].money = props.money;

                if (props.position != undefined) {
                    players[i].position = props.position;

                    new TWEEN.Tween(players[i].group.position)
                        .to(props.position, PLAYER_MOVE_TIMEOUT / 3 * 2)
                        .easing(TWEEN.Easing.Quadratic.InOut)
                        .start();
                }

                if (props.rotation != undefined) {
                    players[i].rotation = props.rotation;

                    players[i].head.rotation.x = props.rotation.x;
                    players[i].head.rotation.y = props.rotation.y;
                    players[i].head.rotation.z = props.rotation.z;
                }

                break;
            }
        }

        if (player_id == player.id) {
            updateStatsLabel();
        }
        updatePlayerList();
    }

    function updateStatsLabel () {
        statsLabelElement.textContent = 'Money: $' + player.money + ' - Attack: ' + player.attack + ' - Health: ' + player.health + '/' + player.strength;
    }

    function updatePlayerList () {
        const sortedPlayers = players.slice();
        sortedPlayers.sort(function (a, b) {
            return b.money - a.money;
        });

        playerListElement.innerHTML = '';
        for (const otherPlayer of sortedPlayers) {
            if (DEBUG) {
                const playerItem = document.createElement('div');
                playerItem.textContent = '#' + otherPlayer.id + ' - ' + otherPlayer.name + ': Money: $' + otherPlayer.money +
                    ' - Attack: ' + otherPlayer.attack + ' - Health: ' + otherPlayer.health + '/' + otherPlayer.strength +
                    ' - Position: ' + otherPlayer.position.x.toFixed(MOVEMENT_PRECISION) + ' ' + otherPlayer.position.y.toFixed(MOVEMENT_PRECISION) + ' ' + otherPlayer.position.z.toFixed(MOVEMENT_PRECISION);
                playerListElement.appendChild(playerItem);
            } else {
                const playerItem = document.createElement('div');
                playerItem.textContent = otherPlayer.name + ': $' + otherPlayer.money;
                playerListElement.appendChild(playerItem);
            }
        }
    }

    function renderNamePlate(canvas, player) {
        const context = canvas.getContext('2d');

        context.fillStyle = '#f00';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = '#0c0';
        context.fillRect(0, 0, Math.round(player.health / player.strength * canvas.width), canvas.height);

        context.fillStyle = '#fff';
        context.font = 'bold ' +  canvas.width / 100 * 15 + 'px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(player.name, canvas.width / 2, canvas.height / 2);
    }

    function createPlayerGroup (player, visible) {
        player.group = new THREE.Group();
        player.group.position.x = player.position.x;
        player.group.position.y = player.position.y;
        player.group.position.z = player.position.z;
        if (visible) playersGroup.add(player.group);

        player.namePlateCanvas = document.createElement('canvas');
        player.namePlateCanvas.width = 512;
        player.namePlateCanvas.height = 128;
        renderNamePlate(player.namePlateCanvas, player);

        player.namePlateTexture = new THREE.CanvasTexture(player.namePlateCanvas);
        const namePlateMaterial = new THREE.MeshBasicMaterial({ map: player.namePlateTexture });
        player.namePlate = new THREE.Mesh(namePlateGeometry, namePlateMaterial);
        player.namePlate.position.y += 1;
        player.group.add(player.namePlate);

        player.head = new THREE.Mesh(headGeometry, headMaterials);
        player.head.rotation.x = player.rotation.x;
        player.head.rotation.y = player.rotation.y;
        player.head.rotation.z = player.rotation.z;
        player.group.add(player.head);

        player.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        player.body.position.y -= 1.25;
        player.group.add(player.body);
    }

    ws.onmessage = function (event) {
        if (DEBUG_CONSOLE) console.log('RECEIVED: ', event.data);
        const message = JSON.parse(event.data);
        const type = message.type;
        const data = message.data;

        if (type == 'server.info') {
            if (data.version == VERSION) {
                sendMessage('player.connect', {
                    name: localStorage.getItem('name')
                });
            } else {
                loadingLayerElement.classList.add('hidden');
                versionLayerElement.classList.remove('hidden');
                serverVersionElement.textContent = data.version;
                clientVersionElement.textContent = VERSION;
            }
        }

        if (type == 'player.init') {
            connected = true;
            loadingLayerElement.classList.add('hidden');
            menuLayerElement.classList.remove('hidden');

            player = data;
            players.push(data);

            createPlayerGroup(player, false);

            camera.position.x = data.position.x;
            camera.position.y = data.position.y;
            camera.position.z = data.position.z;

            camera.rotation.x = data.rotation.x;
            camera.rotation.y = data.rotation.y;
            camera.rotation.z = data.rotation.z;

            updateStatsLabel();
            updatePlayerList();
        }

        if (type == 'player.new') {
            const player = data;

            createPlayerGroup(player, true);

            players.push(player);

            updatePlayerList();
        }

        if (type == 'player.name') {
            updatePlayer(data.id, {
                name: data.name
            });
        }

        if (type == 'player.health') {
            updatePlayer(data.id, {
                health: data.health
            });
        }

        if (type == 'player.strength') {
            updatePlayer(data.id, {
                strength: data.strength
            });
        }

        if (type == 'player.attack') {
            updatePlayer(data.id, {
                attack: data.attack
            });
        }

        if (type == 'player.money') {
            updatePlayer(data.id, {
                money: data.money
            });
        }

        if (type == 'player.money.give') {
            updatePlayer(data.playerId, {
                money: getPlayer(data.playerId).money + data.money
            });
        }

        if (type == 'player.move') {
            for (let i = 0; i < players.length; i++) {
                if (players[i].id == data.id) {

                    updatePlayer(data.id, {
                        position: data.position,
                        rotation: data.rotation
                    });

                    break;
                }
            }
        }

        if (type == 'player.shoot') {
            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.playerId = data.playerId;
            bullet.createdAt = data.createdAt;
            bullet.position.x = data.position.x;
            bullet.position.y = data.position.y;
            bullet.position.z = data.position.z;
            bullet.rotation.x = data.rotation.x;
            bullet.rotation.y = data.rotation.y;
            bullet.rotation.z = data.rotation.z;
            bullets.add(bullet);

            shootSound.playAtPosition(bullet.position, 100);
        }

        if (type == 'player.close') {
            for (let i = 0; i < players.length; i++) {
                if (players[i].id == data.id) {

                    playersGroup.remove(players[i].group);

                    players.splice(i, 1);

                    break;
                }
            }

            updatePlayerList();
        }

        if (type == 'player.chat') {
            if (data.id == CHAT_SERVER_PLAYER_ID) {
                addChat('Server', data.message);
            }
            else {
                for (let i = 0; i < players.length; i++) {
                    if (players[i].id == data.id) {
                        addChat(players[i].name, data.message);
                        break;
                    }
                }
            }
        }
    };

    ws.onclose = function () {
        if (!died) {
            if (lock) {
                document.exitPointerLock();
            }
            loadingLayerElement.classList.add('hidden');
            menuLayerElement.classList.add('hidden');
            controlsLayerElement.classList.add('hidden');
            disconnectLayerElement.classList.remove('hidden');
        }
    };

    // Bullets
    const BULLET_SIZE = 0.1;
    const bulletGeometry = new THREE.SphereGeometry(BULLET_SIZE, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });

    const bullets = new THREE.Group();
    scene.add(bullets);

    // Input
    let chatMode = false;
    const velocity = new THREE.Vector3();
    let moveForward = false;
    let moveLeft = false;
    let moveRight = false;
    let moveBackward = false;
    let canJump = true;
    let shoot = false;
    let lastShot = Date.now();

    window.addEventListener('keydown', function (event) {
        if (lock) {
            if (chatMode) {
                if (event.keyCode == 13) {
                    chatMode = false;

                    chatInputElement.blur();

                    if (chatInputElement.value != '') {
                        sendMessage('player.chat', {
                            message: chatInputElement.value
                        });

                        addChat(player.name, chatInputElement.value);

                        chatInputElement.value = '';
                    }
                }
            } else {
                if (event.keyCode == 87 || event.keyCode == 38) {
                    moveForward = true;
                }
                if (event.keyCode == 65 || event.keyCode == 37) {
                    moveLeft = true;
                }
                if (event.keyCode == 68 || event.keyCode == 39) {
                    moveRight = true;
                }
                if (event.keyCode == 83 || event.keyCode == 40) {
                    moveBackward = true;
                }
                if (event.keyCode == 32 && canJump) {
                    canJump = false;
                    velocity.y += playerJumpHeight;
                    jumpSound.play();
                }

                if (event.keyCode == 84 || event.keyCode == 13) {
                    event.preventDefault();
                    chatMode = true;
                    chatInputElement.focus();
                }
            }
        }
        else {
            if (event.keyCode == 13) {
                requestLock();
            }
        }
    });

    window.addEventListener('keyup', function (event) {
        if (lock) {
            if (event.keyCode == 87 || event.keyCode == 38) {
                moveForward = false;
            }
            if (event.keyCode == 65 || event.keyCode == 37) {
                moveLeft = false;
            }
            if (event.keyCode == 68 || event.keyCode == 39) {
                moveRight = false;
            }
            if (event.keyCode == 83 || event.keyCode == 40) {
                moveBackward = false;
            }
        }
    });

    window.addEventListener('mousedown', function (event) {
        if (lock) {
            if (Date.now() - lastShot > 500) {
                lastShot = Date.now();
                shoot = true;
            }
        }
    });

    window.addEventListener('mousemove', function (event) {
        if (lock) {
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(camera.quaternion);
            euler.y -= event.movementX * PLAYER_SENSITIVITY;
            euler.x -= event.movementY * PLAYER_SENSITIVITY;
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
            camera.quaternion.setFromEuler(euler);
        }
    });

    window.addEventListener('contextmenu', function (event) {
        event.preventDefault();
    });

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const groundTexture = new THREE.TextureLoader().load('/images/grass.jpg');
    const groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture });
    groundMaterial.map.repeat.set(MAP_SIZE / 5, MAP_SIZE / 5);
    groundMaterial.map.wrapS = THREE.RepeatWrapping;
    groundMaterial.map.wrapT = THREE.RepeatWrapping;
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Spawn
    const spawnGeometry = new THREE.CircleGeometry(SPAWN_SIZE, 32);
    const spawnTexture = new THREE.TextureLoader().load('/images/floor.jpg');
    const spawnMaterial = new THREE.MeshBasicMaterial({ map: spawnTexture });
    spawnMaterial.map.repeat.set(4, 4);
    spawnMaterial.map.wrapS = THREE.RepeatWrapping;
    spawnMaterial.map.wrapT = THREE.RepeatWrapping;
    const spawn = new THREE.Mesh(spawnGeometry, spawnMaterial);
    spawn.rotation.x = -Math.PI / 2;
    spawn.position.y = 0.05;
    scene.add(spawn);

    // Crates
    const crateGeometry = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    const crateTexture = new THREE.TextureLoader().load('/images/crate.jpg');
    const crateMaterial = new THREE.MeshBasicMaterial({ map: crateTexture });

    const crates = new THREE.Group();
    scene.add(crates);

    for (let i = 0; i < MAP_SIZE * MAP_SIZE / 150; i++) {
        const crate = new THREE.Mesh(crateGeometry, crateMaterial);
        crate.position.x = rand((-MAP_SIZE / 2) / CRATE_SIZE, (MAP_SIZE / 2) / CRATE_SIZE) * CRATE_SIZE;
        crate.position.z = rand((-MAP_SIZE / 2) / CRATE_SIZE, (MAP_SIZE / 2) / CRATE_SIZE) * CRATE_SIZE;
        crate.position.y = CRATE_SIZE / 2 + rand(0, 20) * CRATE_SIZE;
        crates.add(crate);
    }

    // Banks
    const bankGeometry = new THREE.CircleGeometry(BANK_SIZE, 32);
    const bankTexture = new THREE.TextureLoader().load('/images/bank.jpg');
    const bankMaterial = new THREE.MeshBasicMaterial({ map: bankTexture });

    const banks = new THREE.Group();
    scene.add(banks);

    for (let i = 0; i < MAP_SIZE * MAP_SIZE / 10000; i++) {
        const bank = new THREE.Mesh(bankGeometry,  bankMaterial);
        bank.rotation.x = -Math.PI / 2;
        bank.position.x = rand((-MAP_SIZE / 2) / BANK_SIZE, (MAP_SIZE / 2) / BANK_SIZE) * BANK_SIZE;
        bank.position.z = rand((-MAP_SIZE / 2) / BANK_SIZE, (MAP_SIZE / 2) / BANK_SIZE) * BANK_SIZE;
        bank.position.y = 0.05;
        banks.add(bank);
    }

    // Hospitals
    const hospitalGeometry = new THREE.CircleGeometry(HOSPITAL_SIZE, 32);
    const hospitalTexture = new THREE.TextureLoader().load('/images/hospital.jpg');
    const hospitalMaterial = new THREE.MeshBasicMaterial({ map: hospitalTexture });
    hospitalMaterial.map.repeat.set(3, 3);
    hospitalMaterial.map.wrapS = THREE.RepeatWrapping;
    hospitalMaterial.map.wrapT = THREE.RepeatWrapping;

    const hospitals = new THREE.Group();
    scene.add(hospitals);

    for (let i = 0; i < MAP_SIZE * MAP_SIZE / 20000; i++) {
        const hospital = new THREE.Mesh(hospitalGeometry,  hospitalMaterial);
        hospital.rotation.x = -Math.PI / 2;
        hospital.position.x = rand((-MAP_SIZE / 2) / HOSPITAL_SIZE, (MAP_SIZE / 2) / HOSPITAL_SIZE) * HOSPITAL_SIZE;
        hospital.position.z = rand((-MAP_SIZE / 2) / HOSPITAL_SIZE, (MAP_SIZE / 2) / HOSPITAL_SIZE) * HOSPITAL_SIZE;
        hospital.position.y = 0.1;
        hospitals.add(hospital);
    }

    // Door
    const doorGeometry = new THREE.CubeGeometry(DOOR_SIZE, DOOR_SIZE, DOOR_SIZE / 20);
    const doorTexture = new THREE.TextureLoader().load('/images/door.jpg');
    const doorMaterial = new THREE.MeshBasicMaterial({ map: doorTexture });

    const doors = new THREE.Group();
    scene.add(doors);

    // Map shop door
    const shopDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    shopDoor.destination = new THREE.Vector3(0, 0, SHOP_DISTANCE + SHOP_SIZE - 10);
    shopDoor.position.y = DOOR_SIZE / 2;
    shopDoor.position.z = -25;
    doors.add(shopDoor);

    // Shop floor
    const shopFloorGeometry = new THREE.CircleGeometry(SHOP_SIZE, 64);
    const shopFloorTexture = new THREE.TextureLoader().load('/images/floor.jpg');
    const shopFloorMaterial = new THREE.MeshBasicMaterial({ map: shopFloorTexture });
    shopFloorMaterial.map.repeat.set(SHOP_SIZE / 5, SHOP_SIZE / 5);
    shopFloorMaterial.map.wrapS = THREE.RepeatWrapping;
    shopFloorMaterial.map.wrapT = THREE.RepeatWrapping;
    const shopFloor = new THREE.Mesh(shopFloorGeometry, shopFloorMaterial);
    shopFloor.position.z = SHOP_DISTANCE;
    shopFloor.rotation.x = -Math.PI / 2;
    scene.add(shopFloor);

    // Shop back door
    const backDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    backDoor.destination = new THREE.Vector3(0, 0, -20);
    backDoor.position.y = DOOR_SIZE / 2;
    backDoor.position.z = SHOP_DISTANCE - SHOP_SIZE + 10;
    doors.add(backDoor);

    const shopItemGeometry = new THREE.CircleGeometry(SHOP_ITEM_SIZE, 32);

    // Shop strength
    const strengthItemTexture = new THREE.TextureLoader().load('/images/strength.jpg');
    const strengthItemMaterial = new THREE.MeshBasicMaterial({ map: strengthItemTexture });
    const strengthItem = new THREE.Mesh(shopItemGeometry,  strengthItemMaterial);
    strengthItem.rotation.x = -Math.PI / 2;
    strengthItem.position.x = -SHOP_ITEM_SIZE * 2.5;
    strengthItem.position.y = 0.1;
    strengthItem.position.z = SHOP_DISTANCE - SHOP_ITEM_SIZE * 1.5;
    scene.add(strengthItem);

    // Shop attack
    const attackItemTexture = new THREE.TextureLoader().load('/images/attack.jpg');
    const attackItemMaterial = new THREE.MeshBasicMaterial({ map: attackItemTexture });
    const attackItem = new THREE.Mesh(shopItemGeometry,  attackItemMaterial);
    attackItem.rotation.x = -Math.PI / 2;
    attackItem.position.x = SHOP_ITEM_SIZE * 2.5;
    attackItem.position.y = 0.1;
    attackItem.position.z = SHOP_DISTANCE - SHOP_ITEM_SIZE * 1.5;
    scene.add(attackItem);

    // Shop jump
    const jumpItemTexture = new THREE.TextureLoader().load('/images/jump.jpg');
    const jumpItemMaterial = new THREE.MeshBasicMaterial({ map: jumpItemTexture });
    const jumpItem = new THREE.Mesh(shopItemGeometry,  jumpItemMaterial);
    jumpItem.rotation.x = -Math.PI / 2;
    jumpItem.position.x = -SHOP_ITEM_SIZE * 2.5;
    jumpItem.position.y = 0.1;
    jumpItem.position.z = SHOP_DISTANCE + SHOP_ITEM_SIZE * 1.5;
    scene.add(jumpItem);

    // Shop speed
    const speedItemTexture = new THREE.TextureLoader().load('/images/speed.jpg');
    const speedItemMaterial = new THREE.MeshBasicMaterial({ map: speedItemTexture });
    const speedItem = new THREE.Mesh(shopItemGeometry,  speedItemMaterial);
    speedItem.rotation.x = -Math.PI / 2;
    speedItem.position.x = SHOP_ITEM_SIZE * 2.5;
    speedItem.position.y = 0.1;
    speedItem.position.z = SHOP_DISTANCE + SHOP_ITEM_SIZE * 1.5;
    scene.add(speedItem);

    // Texts
    const textMaterial = new THREE.MeshNormalMaterial();
    const texts = new THREE.Group();
    scene.add(texts);

    new THREE.FontLoader().load('/font.json', function (font) {
        // PlaatWorld 3D logo
        const logoTextGeometry = new THREE.TextGeometry('PlaatWorld 3D', {
            font: font,
            size: 1,
            height: 0.25
        });
        logoTextGeometry.center();
        const logoText = new THREE.Mesh(logoTextGeometry, textMaterial);
        logoText.position.y = 1.5;
        logoText.rotation.y = random() *  Math.PI;
        texts.add(logoText);

        // Map shop door text
        const shopTextGeometry = new THREE.TextGeometry('Shop', {
            font: font,
            size: 0.75,
            height: 0.2
        });
        shopTextGeometry.center();
        const shopText = new THREE.Mesh(shopTextGeometry, textMaterial);
        shopText.position.y = DOOR_SIZE + 1;
        shopText.position.z = -25;
        shopText.rotation.y = random() *  Math.PI;
        texts.add(shopText);

        // Shop back door text
        const backTextGeometry = new THREE.TextGeometry('Back', {
            font: font,
            size: 0.75,
            height: 0.2
        });
        backTextGeometry.center();
        const backText = new THREE.Mesh(backTextGeometry, textMaterial);
        backText.position.y = DOOR_SIZE + 1;
        backText.position.z = SHOP_DISTANCE - SHOP_SIZE + 10;
        backText.rotation.y = random() *  Math.PI;
        texts.add(backText);

        // Shop strength text
        const strengthTextGeometry = new THREE.TextGeometry('Strength $' + STRENGHT_COST, {
            font: font,
            size: 1,
            height: 0.25
        });
        strengthTextGeometry.center();
        const strengthText = new THREE.Mesh(strengthTextGeometry, textMaterial);
        strengthText.position.x = -SHOP_ITEM_SIZE * 2.5;
        strengthText.position.y = PLAYER_HEIGHT;
        strengthText.position.z = SHOP_DISTANCE - SHOP_ITEM_SIZE * 1.5;
        texts.add(strengthText);

        // Shop attack text
        const attackTextGeometry = new THREE.TextGeometry('Attack $' + ATTACK_COST, {
            font: font,
            size: 1,
            height: 0.25
        });
        attackTextGeometry.center();
        const attackText = new THREE.Mesh(attackTextGeometry, textMaterial);
        attackText.position.x = SHOP_ITEM_SIZE * 2.5;
        attackText.position.y = PLAYER_HEIGHT;
        attackText.position.z = SHOP_DISTANCE - SHOP_ITEM_SIZE * 1.5;
        texts.add(attackText);

        // Shop jump text
        const jumpTextGeometry = new THREE.TextGeometry('Jump $' + JUMP_COST, {
            font: font,
            size: 1,
            height: 0.25
        });
        jumpTextGeometry.center();
        const jumpText = new THREE.Mesh(jumpTextGeometry, textMaterial);
        jumpText.position.x = -SHOP_ITEM_SIZE * 2.5;
        jumpText.position.y = PLAYER_HEIGHT;
        jumpText.position.z = SHOP_DISTANCE + SHOP_ITEM_SIZE * 1.5;
        texts.add(jumpText);

        // Shop speed text
        const speedTextGeometry = new THREE.TextGeometry('Speed $' + SPEED_COST, {
            font: font,
            size: 1,
            height: 0.25
        });
        speedTextGeometry.center();
        const speedText = new THREE.Mesh(speedTextGeometry, textMaterial);
        speedText.position.x = SHOP_ITEM_SIZE * 2.5;
        speedText.position.y = PLAYER_HEIGHT;
        speedText.position.z = SHOP_DISTANCE + SHOP_ITEM_SIZE * 1.5;
        texts.add(speedText);
    });

    // Update
    const clock = new THREE.Clock();
    let playerMoveTime = Date.now();
    let bankTime = Date.now();
    let hospitalTime = Date.now();
    let shopTime = Date.now();

    function update () {
        const delta = clock.getDelta();

        // Player movement
        velocity.z -= velocity.z * 10 * delta;
        velocity.x -= velocity.x * 10 * delta;
        velocity.y -= MAP_GRAVITY * PLAYER_WEIGHT * delta;

        if (lock) {
            if (moveForward) {
                velocity.z -= playerSpeed * delta;
            }
            if (moveLeft) {
                velocity.x -= playerSpeed * delta;
            }
            if (moveRight) {
                velocity.x += playerSpeed * delta;
            }
            if (moveBackward) {
                velocity.z += playerSpeed * delta;
            }
        }

        const raycaster = new THREE.Raycaster(new THREE.Vector3().copy(camera.position), new THREE.Vector3(0, -1, 0), 0, PLAYER_HEIGHT + 0.1);
        if (velocity.y < 0 && raycaster.intersectObjects(crates.children).length > 0) {
            velocity.y = 0;
            canJump = true;
        }

        const oldY = camera.position.y;
        camera.translateX(velocity.x * delta);
        camera.translateZ(velocity.z * delta);
        camera.position.y = oldY;
        camera.position.y += velocity.y * delta;

        if (camera.position.y < PLAYER_HEIGHT) {
            velocity.y = 0;
            camera.position.y = PLAYER_HEIGHT;
            canJump = true;
        }

        // Send new player position when changed
        if (
            (
                player.position.x != round(camera.position.x, MOVEMENT_PRECISION) ||
                player.position.y != round(camera.position.y, MOVEMENT_PRECISION) ||
                player.position.z != round(camera.position.z, MOVEMENT_PRECISION) ||

                player.rotation.x != round(camera.rotation.x, MOVEMENT_PRECISION) ||
                player.rotation.y != round(camera.rotation.y, MOVEMENT_PRECISION) ||
                player.rotation.z != round(camera.rotation.z, MOVEMENT_PRECISION)
            ) &&
            Date.now() - playerMoveTime > PLAYER_MOVE_TIMEOUT
        ) {
            playerMoveTime = Date.now();

            updatePlayer(player.id, {
                position: {
                    x: round(camera.position.x, MOVEMENT_PRECISION),
                    y: round(camera.position.y, MOVEMENT_PRECISION),
                    z: round(camera.position.z, MOVEMENT_PRECISION),
                },
                rotation: {
                    x: round(camera.rotation.x, MOVEMENT_PRECISION),
                    y: round(camera.rotation.y, MOVEMENT_PRECISION),
                    z: round(camera.rotation.z, MOVEMENT_PRECISION)
                }
            });

            sendMessage('player.move', {
                position: {
                    x: round(camera.position.x, MOVEMENT_PRECISION),
                    y: round(camera.position.y, MOVEMENT_PRECISION),
                    z: round(camera.position.z, MOVEMENT_PRECISION),
                },
                rotation: {
                    x: round(camera.rotation.x, MOVEMENT_PRECISION),
                    y: round(camera.rotation.y, MOVEMENT_PRECISION),
                    z: round(camera.rotation.z, MOVEMENT_PRECISION)
                }
            });
        }

        // Rotate name plates
        for (const otherPlayer of players) {
            if (otherPlayer.id != player.id) {
                otherPlayer.namePlate.lookAt(camera.position);
            }
        }

        // Bullets
        for (const bullet of bullets.children) {
            bullet.translateZ(-BULLET_SPEED * delta);

            let kill = false;

            if (Date.now() - bullet.createdAt >= BULLET_TIMEOUT) {
                kill = true;
            }

            else if (bullet.position.y <= 0) {
                kill = true;
            }

            else {
                for (const crate of crates.children) {
                    if (new THREE.Box3().setFromObject(crate).containsPoint(bullet.position)) {
                        kill = true;
                        break;
                    }
                }

                for (const otherPlayer of players) {
                    if (bullet.playerId != otherPlayer.id) {
                        if (DEBUG_CONSOLE) console.log('Testing ' + otherPlayer.id);

                        if (
                            new THREE.Box3().setFromObject(otherPlayer.group).containsPoint(bullet.position)
                        ) {
                            if (DEBUG_CONSOLE) console.log('Colliding ' + otherPlayer.id + ' Player ' + player.id);

                            if (otherPlayer.id == player.id) {
                                if (DEBUG_CONSOLE) console.log('Hit');

                                hitSound.play();

                                updatePlayer(player.id, {
                                    health: player.health - rand(Math.floor(getPlayer(bullet.playerId).attack / 2), getPlayer(bullet.playerId).attack)
                                });

                                sendMessage('player.health', {
                                    health: player.health
                                });

                                if (player.health <= 0) {
                                    updatePlayer(bullet.playerId, {
                                        money: getPlayer(bullet.playerId).money + player.money
                                    });

                                    sendMessage('player.money.give', {
                                        playerId: bullet.playerId,
                                        money: player.money
                                    });

                                    if (lock) {
                                        document.exitPointerLock();
                                    }

                                    died = true;
                                    ws.close();

                                    menuLayerElement.classList.add('hidden')
                                    controlsLayerElement.classList.add('hidden');
                                    diedLayerElement.classList.remove('hidden');
                                    playerNameElement.textContent = getPlayer(bullet.playerId).name;
                                }
                            }

                            kill = true;
                            break;
                        }
                    }
                }
            }

            if (kill) {
                explosionSound.playAtPosition(bullet.position, 100);
                bullets.remove(bullet);
            }
        }

        if (shoot) {
            shoot = false;

            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.playerId = player.id;
            bullet.createdAt = Date.now();

            bullet.position.x = round(camera.position.x, MOVEMENT_PRECISION);
            bullet.position.y = round(camera.position.y, MOVEMENT_PRECISION);
            bullet.position.z = round(camera.position.z, MOVEMENT_PRECISION);

            bullet.rotation.x = round(camera.rotation.x, MOVEMENT_PRECISION);
            bullet.rotation.y = round(camera.rotation.y, MOVEMENT_PRECISION);
            bullet.rotation.z = round(camera.rotation.z, MOVEMENT_PRECISION);

            bullets.add(bullet);

            shootSound.play();

            sendMessage('player.shoot', {
                createdAt: bullet.createdAt,
                position: {
                    x: round(camera.position.x, MOVEMENT_PRECISION),
                    y: round(camera.position.y, MOVEMENT_PRECISION),
                    z: round(camera.position.z, MOVEMENT_PRECISION),
                },
                rotation: {
                    x: round(camera.rotation.x, MOVEMENT_PRECISION),
                    y: round(camera.rotation.y, MOVEMENT_PRECISION),
                    z: round(camera.rotation.z, MOVEMENT_PRECISION)
                }
            });
        }

        // Checks banks
        for (const bank of banks.children) {
            if (new THREE.Box3().setFromObject(bank).containsPoint(new THREE.Vector3(camera.position.x, bank.position.y, camera.position.z))) {
                if (Date.now() - bankTime > BANK_TIMEOUT) {
                    bankTime = Date.now();
                    coinSound.play();

                    const amount = rand(1, 2);

                    updatePlayer(player.id, {
                        money: player.money + amount
                    });

                    sendMessage('player.money', {
                        money: player.money
                    });
                }
                break;
            }
        }

        // Checks hospitals
        for (const hospital of hospitals.children) {
            if (new THREE.Box3().setFromObject(hospital).containsPoint(new THREE.Vector3(camera.position.x, hospital.position.y, camera.position.z))) {
                if (Date.now() - hospitalTime > HOSPITAL_TIMEOUT && player.money >= 2 && player.health + 1 <= player.strength) {
                    hospitalTime = Date.now();
                    healSound.play();

                    updatePlayer(player.id, {
                        money: player.money - 2,
                        health: player.health + 1
                    });

                    sendMessage('player.health', {
                        health: player.health
                    });

                    sendMessage('player.money', {
                        money: player.money
                    });
                }
                break;
            }
        }

        // Checks doors
        for (const door of doors.children) {
            if (new THREE.Box3().setFromObject(player.group).intersectsBox(new THREE.Box3().setFromObject(door))) {
                if (DEBUG_CONSOLE) console.log('Door Hit');

                doorSound.play();

                camera.position.copy(door.destination);

                updatePlayer(player.id, {
                    position: {
                        x: door.destination.x,
                        y: door.destination.y,
                        z: door.destination.z
                    }
                });

                sendMessage('player.move', {
                    position: {
                        x: door.destination.x,
                        y: door.destination.y,
                        z: door.destination.z,
                    },
                    rotation: {
                        x: round(camera.rotation.x, MOVEMENT_PRECISION),
                        y: round(camera.rotation.y, MOVEMENT_PRECISION),
                        z: round(camera.rotation.z, MOVEMENT_PRECISION)
                    }
                });

                break;
            }
        }

        // Checks strength shop item
        if (new THREE.Box3().setFromObject(strengthItem).containsPoint(new THREE.Vector3(camera.position.x, strengthItem.position.y, camera.position.z))) {
            if (Date.now() - shopTime > SHOP_TIMEOUT && player.money >= STRENGHT_COST) {
                shopTime = Date.now();
                healSound.play();

                updatePlayer(player.id, {
                    money: player.money - STRENGHT_COST,
                    health: player.health + STRENGHT_STEP,
                    strength: player.strength + STRENGHT_STEP
                });

                sendMessage('player.health', {
                    health: player.health
                });

                sendMessage('player.strength', {
                    strength: player.strength
                });

                sendMessage('player.money', {
                    money: player.money
                });
            }
        }

        // Checks attack shop item
        if (new THREE.Box3().setFromObject(attackItem).containsPoint(new THREE.Vector3(camera.position.x, attackItem.position.y, camera.position.z))) {
            if (Date.now() - shopTime > SHOP_TIMEOUT && player.money >= ATTACK_COST) {
                shopTime = Date.now();
                healSound.play();

                updatePlayer(player.id, {
                    money: player.money - ATTACK_COST,
                    attack: player.attack + ATTACK_STEP
                });

                sendMessage('player.attack', {
                    attack: player.attack
                });

                sendMessage('player.money', {
                    money: player.money
                });
            }
        }

        // Checks attack jump item
        if (new THREE.Box3().setFromObject(jumpItem).containsPoint(new THREE.Vector3(camera.position.x, jumpItem.position.y, camera.position.z))) {
            if (Date.now() - shopTime > SHOP_TIMEOUT && player.money >= JUMP_COST) {
                shopTime = Date.now();
                healSound.play();

                updatePlayer(player.id, {
                    money: player.money - JUMP_COST
                });

                playerJumpHeight += JUMP_STEP;

                sendMessage('player.money', {
                    money: player.money
                });
            }
        }

        // Checks attack speed item
        if (new THREE.Box3().setFromObject(speedItem).containsPoint(new THREE.Vector3(camera.position.x, speedItem.position.y, camera.position.z))) {
            if (Date.now() - shopTime > SHOP_TIMEOUT && player.money >= SPEED_COST) {
                shopTime = Date.now();
                healSound.play();

                updatePlayer(player.id, {
                    money: player.money - SPEED_COST
                });

                playerSpeed += SPEED_STEP;

                sendMessage('player.money', {
                    money: player.money
                });
            }
        }

        // Rotate the text
        for (const text of texts.children) {
            text.rotation.y += 0.75 * delta;
        }
    }

    // Loop
    function loop () {
        stats.begin();
        if (connected) update();
        TWEEN.update();
        renderer.render(scene, camera);
        stats.end();
        window.requestAnimationFrame(loop);
    }
    loop();
})();
