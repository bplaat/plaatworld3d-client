(function () {
    // Constants
    const DEBUG = false;

    const MAX_CHAT = 10;

    const MAP_SIZE = 750;
    const MAP_GRAVITY = 6;

    const CRATE_SIZE = 10;

    const PLAYER_HEIGHT = 2;
    const PLAYER_WEIGHT = 40;
    const PLAYER_MAX_HEALTH = 100;
    const PLAYER_SENSITIVITY = 0.004;
    const PLAYER_SPEED = 150;
    const PLAYER_JUMP_HEIGHT = 150;

    const BULLET_SPEED = 40;
    const BULLET_TIMEOUT = 2500;

    // Rand
    let seed = 1;

    function random() {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    function rand (min, max) {
        return Math.floor(random() * (max - min + 1)) + min;
    }

    // Elements
    let lock = false;

    const menuLayerElement = document.getElementById('menu-layer');
    const nameInput = document.getElementById('name-input');
    const playButton = document.getElementById('play-button');

    const controlsLayerElement = document.getElementById('controls-layer');
    const playerListElement = document.getElementById('player-list');
    const healthBarElement = document.getElementById('health-bar');
    const chatListElement = document.getElementById('chat-list');
    const chatInputElement = document.getElementById('chat-input');

    // Name input
    if (localStorage.getItem('name') == null) {
        localStorage.setItem('name', nameInput.value);
    } else {
        nameInput.value = localStorage.getItem('name');
    }

    nameInput.addEventListener('input', function () {
        localStorage.setItem('name', nameInput.value);
        sendMessage('player.name', { name: nameInput.value });
        updatePlayer(player.id, { name: nameInput.value });
    });

    // Play button
    function requestLock () {
        renderer.domElement.requestPointerLock();
    }

    playButton.addEventListener('click', function () {
        requestLock();
    });

    document.addEventListener('pointerlockchange', function () {
        lock = document.pointerLockElement == renderer.domElement;
        if (lock) {
            nameInput.blur();
            menuLayerElement.classList.add('hidden');
            controlsLayerElement.classList.remove('hidden');
        } else {
            menuLayerElement.classList.remove('hidden');
            controlsLayerElement.classList.add('hidden');
        }
    });

    // Audio
    class Sound {
        constructor (audio_url) {
            this.channels = [];
            this.number = 10;
            this.index = 0;
            for (var i = 0; i < this.number; i++) {
                this.channels.push(new Audio(audio_url));
            }
        }

        play () {
            this.channels[this.index++].play();
            this.index = this.index < this.number ? this.index : 0;
        }
    }

    const shootSound = new Sound('/sounds/shoot.wav');
    const explosionSound = new Sound('/sounds/explosion.wav');
    const hitSound = new Sound('/sounds/hit.wav');
    const jumpSound = new Sound('/sounds/jump.wav');

    // Scene
    const scene = new THREE.Scene();
    const backgroundColor = 0x80c0e0;
    scene.background = new THREE.Color(backgroundColor);
    scene.fog = new THREE.Fog(backgroundColor, 0, 350);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = MAP_SIZE;

    // Renderer
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    });

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

    const ws = new WebSocket('ws://localhost:8081');

    function sendMessage (type, data) {
        if (DEBUG) console.log('SENT: ', JSON.stringify({ type: type, data: data }));
        ws.send(JSON.stringify({ type: type, data: data }));
    }

    function addChat (name, message) {
        chatListElement.innerHTML += '<div><b>' + name + '</b>: ' + message + '</div>';

        if (chatListElement.children.length == MAX_CHAT + 1) {
            chatListElement.removeChild(chatListElement.firstChild);
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

                if (props.health != undefined) {
                    players[i].health = props.health;
                    if (player_id == player.id) {
                        healthBarElement.style.width = props.health / PLAYER_MAX_HEALTH * 100 + '%';
                    } else {
                        renderNamePlate(players[i].namePlateCanvas, players[i]);
                        players[i].namePlateTexture.needsUpdate = true;
                    }
                }

                if (props.x != undefined) players[i].x = props.x;
                if (props.y != undefined) players[i].y = props.y;
                if (props.z != undefined) players[i].z = props.z;

                if (props.x != undefined || props.y != undefined || props.z != undefined) {
                    new TWEEN.Tween(players[i].group.position)
                        .to({ x: props.x, y: props.y, z: props.z }, 75)
                        .easing(TWEEN.Easing.Quadratic.InOut)
                        .start();
                }

                break;
            }
        }

        updatePlayerList();
    }

    function updatePlayerList () {
        playerListElement.innerHTML = '';
        for (const otherPlayer of players) {
            if (DEBUG) {
                playerListElement.innerHTML += '<div>#' + otherPlayer.id + ' - ' + otherPlayer.name + ' - ' + otherPlayer.health + ' - ' + otherPlayer.x.toFixed(2) + ' ' + otherPlayer.y.toFixed(2) + ' ' + otherPlayer.z.toFixed(2) + '</div>';
            } else {
                playerListElement.innerHTML += '<div>' + otherPlayer.name + '</div>';
            }
        }
    }

    function renderNamePlate(canvas, player) {
        const context = canvas.getContext('2d');

        context.fillStyle = '#f00';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = '#0c0';
        context.fillRect(0, 0, Math.round(player.health / PLAYER_MAX_HEALTH * canvas.width), canvas.height);

        context.fillStyle = '#fff';
        context.font = 'bold ' +  canvas.width / 100 * 15 + 'px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(player.name, canvas.width / 2, canvas.height / 2);
    }

    function createPlayerGroup (player, visible) {
        player.group = new THREE.Group();
        player.group.position.x = player.x;
        player.group.position.y = player.y;
        player.group.position.z = player.z;
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
        player.group.add(player.head);

        player.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        player.body.position.y -= 1.25;
        player.group.add(player.body);
    }

    ws.onopen = function (event) {
        sendMessage('player.connect', {
            name: localStorage.getItem('name')
        });
    };

    ws.onmessage = function (event) {
        if (DEBUG) console.log('RECEIVED: ', event.data);
        const message = JSON.parse(event.data);
        const type = message.type;
        const data = message.data;

        if (type == 'player.init') {
            player = data;
            players.push(data);

            createPlayerGroup(player, false);

            camera.position.x = data.x;
            camera.position.y = data.y;
            camera.position.z = data.z;

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

        if (type == 'player.move') {
            for (let i = 0; i < players.length; i++) {
                if (players[i].id == data.id) {

                    updatePlayer(data.id, {
                        x: data.x,
                        y: data.y,
                        z: data.z
                    });

                    players[i].head.rotation.x = data.rotationX;
                    players[i].head.rotation.z = data.rotationZ;

                    break;
                }
            }
        }

        if (type == 'player.shoot') {
            shootSound.play();

            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.playerId = data.playerId;
            bullet.createdAt = data.createdAt;
            bullet.position.x = data.x;
            bullet.position.y = data.y;
            bullet.position.z = data.z;
            bullet.rotation.x = data.rotationX;
            bullet.rotation.y = data.rotationY;
            bullet.rotation.z = data.rotationZ;
            bullets.add(bullet);
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
            console.log(data);
            if (data.id == 0) {
                addChat('<u>Server</u>', data.message);
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
        alert('The connection with the server is lost!');
        window.location.reload();
    };

    // Bullets
    const BULLET_SIZE = 0.1;
    const bulletGeometry = new THREE.SphereGeometry(BULLET_SIZE, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });

    const bullets = new THREE.Group();
    scene.add(bullets);

    // Input
    let chatMode = false;
    let chatMessage = '';
    const velocity = new THREE.Vector3();
    let moveForward = false;
    let moveLeft = false;
    let moveRight = false;
    let moveBackward = false;
    let canJump = true;
    let shoot = false;
    let lastShot = Date.now();

    window.addEventListener('keydown', function (event) {
        if (chatMode) {
            if (event.keyCode == 8) {
                chatMessage = chatMessage.substring(0, chatMessage.length - 1);
            } else if (event.keyCode == 13) {
                chatMode = false;
                chatInputElement.classList.remove('active');

                if (chatMessage != '') {
                    sendMessage('player.chat', {
                        message: chatMessage
                    });

                    addChat(player.name, chatMessage);

                    chatMessage = '';
                }
            } else if (chatMessage.length < 24) {
                chatMessage += event.key;
            }

            chatInputElement.textContent = chatMessage;
        } else {
            if (lock) {
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
                    velocity.y += PLAYER_JUMP_HEIGHT;
                    jumpSound.play();
                }

                if (event.keyCode == 84 || event.keyCode == 13) {
                    chatMode = true;
                    chatInputElement.classList.add('active');
                }
            }
            else {
                if (event.keyCode == 13) {
                    requestLock();
                }
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
        if (lock && Date.now() - lastShot > 500) {
            lastShot = Date.now();
            shoot = true;
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

    // Ground
    const groundGeometry = new THREE.PlaneBufferGeometry(MAP_SIZE, MAP_SIZE);
    const groundTexture = new THREE.TextureLoader().load('/images/grass.jpg');
    const groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.material.map.repeat.set(MAP_SIZE / 10, MAP_SIZE / 10);
    ground.material.map.wrapS = THREE.RepeatWrapping;
    ground.material.map.wrapT = THREE.RepeatWrapping;
    scene.add(ground);

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

    // Update
    let previousTime = performance.now();
    let updateTime = Date.now();

    function update () {
        const time = performance.now();
        const delta = (time - previousTime) / 1000;

        // Player movement
        velocity.z -= velocity.z * 10 * delta;
        velocity.x -= velocity.x * 10 * delta;
        velocity.y -= MAP_GRAVITY * PLAYER_WEIGHT * delta;

        if (lock) {
            if (moveForward) {
                velocity.z -= PLAYER_SPEED * delta;
            }
            if (moveLeft) {
                velocity.x -= PLAYER_SPEED * delta;
            }
            if (moveRight) {
                velocity.x += PLAYER_SPEED * delta;
            }
            if (moveBackward) {
                velocity.z += PLAYER_SPEED * delta;
            }
        }

        const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, PLAYER_HEIGHT);
        raycaster.ray.origin.copy(camera.position);
        raycaster.ray.origin.y -= PLAYER_HEIGHT;
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

        // Send new player position
        if (player != undefined && Date.now() - updateTime > 100) {
            updateTime = Date.now();

            updatePlayer(player.id, {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            });

            sendMessage('player.move', {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                rotationX: camera.rotation.x,
                rotationZ: camera.rotation.z
            });
        }

        // Rotate name plates
        for (const otherPlayer of players) {
            if (otherPlayer.id != player.id) {
                otherPlayer.namePlate.lookAt(camera.position);
            }
        }

        // Bullets
        for (let i = 0; i < bullets.children.length; i++) {
            const bullet = bullets.children[i];
            bullet.translateZ(-BULLET_SPEED * delta);

            let kill = false;

            if (Date.now() - bullet.createdAt >= BULLET_TIMEOUT) {
                kill = true;
            }

            else if (bullet.position.y <= 0) {
                kill = true;
            }

            else {
                for (let j = 0; j < crates.children.length; j++) {
                    const crate = crates.children[j];
                    if (new THREE.Box3().setFromObject(crate).containsPoint(bullet.position)) {
                        kill = true;
                        break;
                    }
                }

                for (const otherPlayer of players) {
                    if (bullet.playerId != otherPlayer.id) {
                        if (DEBUG) console.log('Testing ' + otherPlayer.id);

                        if (
                            new THREE.Box3().setFromObject(otherPlayer.group).containsPoint(bullet.position)
                        ) {
                            if (DEBUG) console.log('Colliding ' + otherPlayer.id + ' Player ' + player.id);

                            if (otherPlayer.id == player.id) {
                                if (DEBUG) console.log('hit');

                                hitSound.play();

                                updatePlayer(player.id, {
                                    health: player.health - rand(4, 10)
                                });

                                sendMessage('player.health', {
                                    health: player.health
                                });

                                if (player.health <= 0) {
                                    window.location.reload();
                                }
                            }

                            kill = true;
                            break;
                        }
                    }
                }
            }

            if (kill) {
                bullets.remove(bullet);
                explosionSound.play();
            }
        }

        if (shoot) {
            shoot = false;

            shootSound.play();

            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.playerId = player.id;
            bullet.createdAt = Date.now();
            bullet.position.copy(camera.position);
            bullet.rotation.copy(camera.rotation);
            bullets.add(bullet);

            sendMessage('player.shoot', {
                createdAt: bullet.createdAt,
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                rotationX: camera.rotation.x,
                rotationY: camera.rotation.y,
                rotationZ: camera.rotation.z
            });
        }

        previousTime = time;
    }

    // Loop
    function loop () {
        update();
        TWEEN.update();
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    }

    loop();
})();
