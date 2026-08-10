import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// HELPER: Base64 to ArrayBuffer
// ======================================================

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// ======================================================
// SCENE SETUP
// ======================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1015);

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 1.6, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 7;
controls.target.set(0, 1.4, 0);

// ======================================================
// LIGHTING
// ======================================================

const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 3.5);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0x00e5ff, 1.2);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

// ======================================================
// GROUND
// ======================================================

const groundGeometry = new THREE.PlaneGeometry(30, 30);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x181a24,
    roughness: 0.8,
    metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid Helper
const gridHelper = new THREE.GridHelper(30, 30, 0x00e5ff, 0x25293a);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// ======================================================
// FBX LOADER & MODEL MANAGEMENT
// ======================================================

const loader = new FBXLoader();
let character = null;
let mixer = null;
let currentAction = null;
let currentActionKey = "idle";
const actions = {};

// ======================================================
// PUSHUP GESTURE STATE & VOICE PARSER
// ======================================================

const MAX_PUSHUP_LIMIT = 50;

const numberWords = {
    "one": 1, "a": 1, "an": 1, "single": 1,
    "two": 2, "double": 2,
    "three": 3, "triple": 3,
    "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50
};

function parsePushupCommand(text) {
    const lower = text.toLowerCase();
    const isPushup = lower.includes("pushup") || lower.includes("push up") || lower.includes("push-up");
    if (!isPushup) return null;

    let count = 3;
    const digitMatch = lower.match(/\b(\d+)\b/);
    if (digitMatch) {
        count = parseInt(digitMatch[1], 10);
    } else {
        for (const [word, num] of Object.entries(numberWords)) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(lower)) {
                count = num;
                break;
            }
        }
    }

    if (count > MAX_PUSHUP_LIMIT) {
        count = MAX_PUSHUP_LIMIT;
        const speechStatusEl = document.getElementById("speechStatus");
        if (speechStatusEl) {
            speechStatusEl.textContent = `Pushup limit is ${MAX_PUSHUP_LIMIT} reps max! Set to ${MAX_PUSHUP_LIMIT}.`;
        }
        speakText(`Pushup limit is ${MAX_PUSHUP_LIMIT} reps!`);
    }

    return Math.max(count, 1);
}

function speakText(text) {
    if ("speechSynthesis" in window) {
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.15;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn("Speech synthesis error:", e);
        }
    }
}

let pushupState = {
    active: false,
    phase: 'idle', // 'get_down', 'reps', 'get_up'
    targetReps: 0,
    currentRep: 0,
    phaseTime: 0,
    repTime: 0,
    standingY: 0,
    plankY: 0.38,
    plankZ: 0.3
};

let characterBones = {};
let initialBoneRotations = {};

function cacheBones() {
    characterBones = {};
    initialBoneRotations = {};
    if (!character) return;
    character.traverse(child => {
        if (child.isBone) {
            characterBones[child.name] = child;
            initialBoneRotations[child.name] = child.rotation.clone();
        }
    });
}

function resetBonesToInitial() {
    for (let name in characterBones) {
        if (initialBoneRotations[name]) {
            characterBones[name].rotation.copy(initialBoneRotations[name]);
        }
    }
}

function getBone(name) {
    if (characterBones[name]) return characterBones[name];
    if (characterBones['mixamorig' + name]) return characterBones['mixamorig' + name];
    for (let key in characterBones) {
        if (key.toLowerCase().includes(name.toLowerCase())) {
            return characterBones[key];
        }
    }
    return null;
}

function startPushups(reps) {
    if (!character) return;
    cacheBones();

    if (reps > MAX_PUSHUP_LIMIT) {
        reps = MAX_PUSHUP_LIMIT;
    }

    if (mixer) {
        mixer.stopAllAction();
        mixer.timeScale = 0;
    }
    currentAction = null;

    character.rotation.set(0, 0, 0);

    pushupState.active = true;
    pushupState.phase = 'get_down';
    pushupState.targetReps = reps || 3;
    pushupState.currentRep = 1;
    pushupState.phaseTime = 0;
    pushupState.repTime = 0;

    updateGestureUI("pushup", 1, pushupState.targetReps);
    speakText(`Starting ${pushupState.targetReps} pushups!`);
}

function stopPushups() {
    pushupState.active = false;
    pushupState.phase = 'idle';
    if (mixer) {
        mixer.timeScale = 1;
        mixer.stopAllAction();
    }
    currentAction = null;

    if (character) {
        character.rotation.set(0, 0, 0);
        character.position.y = pushupState.standingY;
        character.position.z = 0;
        resetBonesToInitial();
    }
    
    playLoop("idle");
    updateGestureUI("idle");
}

function updatePushupAnimation(delta) {
    if (!pushupState.active || !character) return;

    const leftArm = getBone("LeftArm");
    const rightArm = getBone("RightArm");
    const leftForeArm = getBone("LeftForeArm");
    const rightForeArm = getBone("RightForeArm");
    const head = getBone("Head");

    if (pushupState.phase === 'get_down') {
        pushupState.phaseTime += delta;
        const duration = 0.8;
        const p = Math.min(pushupState.phaseTime / duration, 1.0);
        const smoothP = p * p * (3 - 2 * p);

        // Transition character into horizontal plank position on ground
        character.rotation.x = THREE.MathUtils.lerp(0, -Math.PI / 2, smoothP);
        character.rotation.y = THREE.MathUtils.lerp(0, Math.PI, smoothP);
        character.rotation.z = 0;

        character.position.y = THREE.MathUtils.lerp(pushupState.standingY, 0.45, smoothP);
        character.position.z = THREE.MathUtils.lerp(0, 0.8, smoothP);

        // Bend arms from T-pose to floor support posture relative to rest rotation
        if (leftArm && initialBoneRotations[leftArm.name]) {
            leftArm.rotation.z = initialBoneRotations[leftArm.name].z - (1.1 * smoothP);
        }
        if (rightArm && initialBoneRotations[rightArm.name]) {
            rightArm.rotation.z = initialBoneRotations[rightArm.name].z + (1.1 * smoothP);
        }
        if (leftForeArm && initialBoneRotations[leftForeArm.name]) {
            leftForeArm.rotation.y = initialBoneRotations[leftForeArm.name].y + (1.2 * smoothP);
        }
        if (rightForeArm && initialBoneRotations[rightForeArm.name]) {
            rightForeArm.rotation.y = initialBoneRotations[rightForeArm.name].y - (1.2 * smoothP);
        }
        if (head && initialBoneRotations[head.name]) {
            head.rotation.x = initialBoneRotations[head.name].x + (0.3 * smoothP);
        }

        if (p >= 1.0) {
            pushupState.phase = 'reps';
            pushupState.currentRep = 1;
            pushupState.repTime = 0;
        }
    } else if (pushupState.phase === 'reps') {
        pushupState.repTime += delta;
        const repDuration = 1.3;
        const t = pushupState.repTime / repDuration;

        // Down and up pushup motion
        const cycle = Math.sin(t * Math.PI);
        const dipDepth = 0.25;

        character.position.y = 0.45 - (dipDepth * cycle);
        character.rotation.x = -Math.PI / 2 - (cycle * 0.08);

        const elbowFlex = cycle * 0.5;
        if (leftForeArm && initialBoneRotations[leftForeArm.name]) {
            leftForeArm.rotation.y = initialBoneRotations[leftForeArm.name].y + 1.2 - elbowFlex;
        }
        if (rightForeArm && initialBoneRotations[rightForeArm.name]) {
            rightForeArm.rotation.y = initialBoneRotations[rightForeArm.name].y - 1.2 + elbowFlex;
        }
        if (leftArm && initialBoneRotations[leftArm.name]) {
            leftArm.rotation.z = initialBoneRotations[leftArm.name].z - 1.1 + (cycle * 0.2);
        }
        if (rightArm && initialBoneRotations[rightArm.name]) {
            rightArm.rotation.z = initialBoneRotations[rightArm.name].z + 1.1 - (cycle * 0.2);
        }

        if (t >= 1.0) {
            speakText(pushupState.currentRep.toString());
            pushupState.currentRep++;
            pushupState.repTime = 0;

            if (pushupState.currentRep > pushupState.targetReps) {
                speakText("Done!");
                pushupState.phase = 'get_up';
                pushupState.phaseTime = 0;
                const speechStatusEl = document.getElementById("speechStatus");
                if (speechStatusEl) {
                    speechStatusEl.textContent = `Completed ${pushupState.targetReps} pushups! 🎉`;
                }
            } else {
                updateGestureUI("pushup", pushupState.currentRep, pushupState.targetReps);
            }
        }
    } else if (pushupState.phase === 'get_up') {
        pushupState.phaseTime += delta;
        const duration = 0.8;
        const p = Math.min(pushupState.phaseTime / duration, 1.0);
        const smoothP = p * p * (3 - 2 * p);

        // Smoothly stand back up
        character.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, smoothP);
        character.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, smoothP);
        character.rotation.z = 0;

        character.position.y = THREE.MathUtils.lerp(0.45, pushupState.standingY, smoothP);
        character.position.z = THREE.MathUtils.lerp(0.8, 0, smoothP);

        // Lerp bones back to initial rest pose
        const invP = 1.0 - smoothP;
        if (leftArm && initialBoneRotations[leftArm.name]) {
            leftArm.rotation.z = initialBoneRotations[leftArm.name].z - (1.1 * invP);
        }
        if (rightArm && initialBoneRotations[rightArm.name]) {
            rightArm.rotation.z = initialBoneRotations[rightArm.name].z + (1.1 * invP);
        }
        if (leftForeArm && initialBoneRotations[leftForeArm.name]) {
            leftForeArm.rotation.y = initialBoneRotations[leftForeArm.name].y + (1.2 * invP);
        }
        if (rightForeArm && initialBoneRotations[rightForeArm.name]) {
            rightForeArm.rotation.y = initialBoneRotations[rightForeArm.name].y - (1.2 * invP);
        }
        if (head && initialBoneRotations[head.name]) {
            head.rotation.x = initialBoneRotations[head.name].x + (0.3 * invP);
        }

        if (p >= 1.0) {
            stopPushups();
        }
    }
}

const modelFiles = {
    idle: { varName: "FBX_IDLE", file: "Idle.js" },
    walk: { varName: "FBX_WALKING", file: "Walking.js" },
    run: { varName: "FBX_SLOW_RUN", file: "Slow_Run.js" },
    wave: { varName: "FBX_WAVING", file: "Waving.js" },
    talk: { varName: "FBX_TALKING", file: "Talking.js" },
    jump: { varName: "FBX_JUMP", file: "Jump.js" },
    left: { varName: "FBX_LEFT_TURN_90", file: "Left_Turn_90.js" },
    right: { varName: "FBX_RIGHT_TURN_90", file: "Right_Turn_90.js" }
};

function parseOrLoadModel(key, callback) {
    const info = modelFiles[key];
    if (!info) return;

    function parseFromWindow() {
        try {
            const b64 = window[info.varName];
            if (!b64) throw new Error("Variable " + info.varName + " not found");
            const buffer = base64ToArrayBuffer(b64);
            const model = loader.parse(buffer, "");
            callback(null, model);
        } catch (err) {
            callback(err);
        }
    }

    if (window[info.varName]) {
        parseFromWindow();
    } else {
        const script = document.createElement("script");
        script.src = "./models/" + info.file;
        script.onload = function () {
            parseFromWindow();
        };
        script.onerror = function (err) {
            callback(new Error("Failed to load script ./models/" + info.file));
        };
        document.head.appendChild(script);
    }
}

// ======================================================
// LOAD CHARACTER & INITIALIZE IDLE
// ======================================================

parseOrLoadModel("idle", function (err, model) {
    if (err) {
        console.error("Error loading Idle model:", err);
        const loadingEl = document.getElementById("loading");
        if (loadingEl) loadingEl.textContent = "Could not load character";
        return;
    }

    character = model;
    scene.add(character);

    // Scale character
    const box = new THREE.Box3().setFromObject(character);
    const size = box.getSize(new THREE.Vector3());
    const desiredHeight = 3.2;
    if (size.y > 0) {
        const scale = desiredHeight / size.y;
        character.scale.set(scale, scale, scale);
    }

    // Center character
    let characterBox = new THREE.Box3().setFromObject(character);
    const center = characterBox.getCenter(new THREE.Vector3());
    character.position.x -= center.x;
    character.position.z -= center.z;

    // Feet on ground
    characterBox = new THREE.Box3().setFromObject(character);
    character.position.y -= characterBox.min.y;
    pushupState.standingY = character.position.y;
    cacheBones();

    // Shadows
    character.traverse(function (child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Animation Mixer
    mixer = new THREE.AnimationMixer(character);

    if (model.animations && model.animations.length > 0) {
        actions.idle = mixer.clipAction(model.animations[0]);
    }

    playLoop("idle");

    // Hide Loading
    const loadingEl = document.getElementById("loading");
    if (loadingEl) loadingEl.style.display = "none";

    // Load remaining animations in background
    ["walk", "run", "wave", "talk", "jump", "left", "right"].forEach(function (key) {
        parseOrLoadModel(key, function (animErr, animModel) {
            if (animErr) {
                console.warn("Could not load animation " + key, animErr);
                return;
            }
            if (animModel.animations && animModel.animations.length > 0) {
                actions[key] = mixer.clipAction(animModel.animations[0]);
            }
        });
    });
});

// ======================================================
// ANIMATION CONTROLS
// ======================================================

function playLoop(name) {
    if (pushupState.active) return;
    const action = actions[name];
    if (!action) {
        console.log(name + " is still loading...");
        return;
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    currentActionKey = name;
    switchAnimation(action);
}

function playOnce(name) {
    if (pushupState.active) return;
    const action = actions[name];
    if (!action) {
        console.log(name + " is still loading...");
        return;
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    currentActionKey = name;
    switchAnimation(action);

    const onFinished = function (event) {
        if (event.action === action) {
            mixer.removeEventListener("finished", onFinished);
            if (actions.idle) {
                playLoop("idle");
                updateGestureUI("idle");
            }
        }
    };
    mixer.addEventListener("finished", onFinished);
}

function switchAnimation(newAction) {
    if (!newAction) return;
    if (currentAction === newAction) return;

    if (!currentAction) {
        newAction.reset().fadeIn(0.35).play();
        currentAction = newAction;
        return;
    }

    newAction.reset().fadeIn(0.35).play();
    currentAction.fadeOut(0.35);
    currentAction = newAction;
}

// ======================================================
// VOICE CONTROL & COMMAND MAPPING
// ======================================================

const commandConfig = [
    { key: "pushup", type: "custom", label: "PUSHUPS 🏋️‍♂️", keywords: ["pushup", "pushups", "push up", "push ups"] },
    { key: "wave", type: "once", label: "WAVE 👋", keywords: ["wave", "waving", "hi", "hello", "say hi", "bye"] },
    { key: "jump", type: "once", label: "JUMP 🦘", keywords: ["jump", "jumping", "hop", "leap"] },
    { key: "walk", type: "loop", label: "WALK 🚶", keywords: ["walk", "walking", "step", "move", "go"] },
    { key: "run", type: "loop", label: "SLOW RUN 🏃", keywords: ["run", "running", "fast", "sprint"] },
    { key: "talk", type: "loop", label: "TALK 💬", keywords: ["talk", "talking", "speak", "speech", "chat"] },
    { key: "left", type: "once", label: "LEFT TURN ↶", keywords: ["left", "turn left"] },
    { key: "right", type: "once", label: "RIGHT TURN ↷", keywords: ["right", "turn right"] },
    { key: "idle", type: "loop", label: "IDLE 🧍", keywords: ["idle", "stop", "stand", "rest", "halt", "stay"] }
];

function updateGestureUI(key, currentRep, totalReps) {
    let label = "";
    if (key === "pushup") {
        label = `PUSHUPS (${currentRep || 1}/${totalReps || 5}) 🏋️‍♂️`;
    } else {
        const config = commandConfig.find(c => c.key === key);
        label = config ? config.label : key.toUpperCase();
    }

    const currentGestureEl = document.getElementById("currentGestureName");
    if (currentGestureEl) currentGestureEl.textContent = label;

    // Highlight guide card item
    document.querySelectorAll(".cmd-item").forEach(item => item.classList.remove("active"));
    const activeItem = document.getElementById("cmd-" + key);
    if (activeItem) activeItem.classList.add("active");
}

function triggerGestureByKey(key) {
    if (key === "pushup") {
        startPushups(5);
        return;
    }
    if (pushupState.active) {
        stopPushups();
    }

    const config = commandConfig.find(c => c.key === key);
    if (!config) return;

    if (config.type === "once") {
        playOnce(config.key);
    } else {
        playLoop(config.key);
    }
    updateGestureUI(config.key);
}

// Add click triggers on command guide cards for instant testing
commandConfig.forEach(config => {
    const el = document.getElementById("cmd-" + config.key);
    if (el) {
        el.addEventListener("click", () => {
            triggerGestureByKey(config.key);
            const transcriptEl = document.getElementById("speechTranscript");
            if (transcriptEl) transcriptEl.textContent = `Clicked: "${config.key.toUpperCase()}"`;
        });
    }
});

// ======================================================
// SPEECH RECOGNITION SETUP
// ======================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let lastTriggerTime = 0;

const voiceContainer = document.getElementById("voice-container");
const micButton = document.getElementById("micButton");
const speechStatus = document.getElementById("speechStatus");
const speechTranscript = document.getElementById("speechTranscript");

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = function () {
        isListening = true;
        voiceContainer.classList.add("is-listening");
        speechStatus.textContent = "Listening... Speak a command";
        speechTranscript.textContent = 'Try saying "Do 5 Pushups", "Wave", "Jump", "Walk"...';
    };

    recognition.onresult = function (event) {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const currentText = (finalTranscript || interimTranscript).toLowerCase().trim();
        if (currentText) {
            speechTranscript.textContent = `Heard: "${currentText}"`;

            // Check matching command
            const now = Date.now();
            if (now - lastTriggerTime > 1200) { // Cooldown to avoid multi-triggers
                // Check pushup with count first
                const pushupCount = parsePushupCommand(currentText);
                if (pushupCount !== null) {
                    lastTriggerTime = now;
                    startPushups(pushupCount);
                    speechStatus.textContent = `Activated: PUSHUPS (${pushupCount} reps) 🏋️‍♂️`;
                    return;
                }

                for (const cmd of commandConfig) {
                    for (const kw of cmd.keywords) {
                        if (currentText.includes(kw)) {
                            lastTriggerTime = now;
                            triggerGestureByKey(cmd.key);
                            speechStatus.textContent = `Activated: ${cmd.label}`;
                            return;
                        }
                    }
                }
            }
        }
    };

    recognition.onerror = function (event) {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
            speechStatus.textContent = "Microphone access blocked in browser";
            speechTranscript.textContent = "Please allow microphone permission to use voice";
            stopListening();
        } else if (event.error === "no-speech") {
            speechStatus.textContent = "Listening for commands...";
        }
    };

    recognition.onend = function () {
        if (isListening) {
            try {
                recognition.start();
            } catch (e) {
                console.log("Recognition restart note:", e);
            }
        } else {
            stopListening();
        }
    };
} else {
    speechStatus.textContent = "Voice control not supported on this browser";
    speechTranscript.textContent = "Click triggers in the Voice Commands card on top right";
}

function startListening() {
    if (!recognition) return;
    try {
        recognition.start();
    } catch (e) {
        console.warn("Could not start recognition:", e);
    }
}

function stopListening() {
    isListening = false;
    voiceContainer.classList.remove("is-listening");
    speechStatus.textContent = "Click Microphone to start voice commands";
    speechTranscript.textContent = 'Say: "Do 5 Pushups", "Walk", "Run", "Wave", "Jump", "Talk", "Idle"';
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

micButton.addEventListener("click", function () {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
});

// ======================================================
// ANIMATION LOOP & RESIZE
// ======================================================

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (pushupState.active) {
        updatePushupAnimation(delta);
    } else {
        if (mixer) mixer.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});