import * as THREE from "three";

import {
    FBXLoader
} from "three/addons/loaders/FBXLoader.js";

import {
    OrbitControls
} from "three/addons/controls/OrbitControls.js";


// ======================================================
// SCENE
// ======================================================

const scene =
    new THREE.Scene();

scene.background =
    new THREE.Color(0x202025);


// ======================================================
// CAMERA
// ======================================================

const camera =
    new THREE.PerspectiveCamera(
        45,
        window.innerWidth /
        window.innerHeight,
        0.1,
        1000
    );


// Character closer to camera

camera.position.set(
    0,
    1.6,
    4
);


// ======================================================
// RENDERER
// ======================================================

const renderer =
    new THREE.WebGLRenderer({
        antialias: true
    });


renderer.setSize(
    window.innerWidth,
    window.innerHeight
);


renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);


renderer.shadowMap.enabled = true;


renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;


document.body.appendChild(
    renderer.domElement
);


// ======================================================
// 360 DEGREE CAMERA
// ======================================================

const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );


controls.enableDamping = true;

controls.dampingFactor = 0.05;


// Don't move the scene sideways

controls.enablePan = false;


// Zoom limits

controls.minDistance = 2.2;

controls.maxDistance = 7;


// Camera looks at character

controls.target.set(
    0,
    1.4,
    0
);


// ======================================================
// LIGHTS
// ======================================================

const ambientLight =
    new THREE.AmbientLight(
        0xffffff,
        2
    );

scene.add(
    ambientLight
);


const mainLight =
    new THREE.DirectionalLight(
        0xffffff,
        3
    );


mainLight.position.set(
    5,
    10,
    5
);


mainLight.castShadow = true;


scene.add(
    mainLight
);


// Second light

const fillLight =
    new THREE.DirectionalLight(
        0xffffff,
        1
    );


fillLight.position.set(
    -5,
    5,
    -5
);


scene.add(
    fillLight
);


// ======================================================
// GROUND
// ======================================================

const groundGeometry =
    new THREE.PlaneGeometry(
        30,
        30
    );


const groundMaterial =
    new THREE.MeshStandardMaterial({
        color: 0x444444
    });


const ground =
    new THREE.Mesh(
        groundGeometry,
        groundMaterial
    );


ground.rotation.x =
    -Math.PI / 2;


ground.receiveShadow = true;


scene.add(
    ground
);


// ======================================================
// FBX LOADER
// ======================================================

const loader =
    new FBXLoader();


// ======================================================
// CHARACTER VARIABLES
// ======================================================

let character = null;

let mixer = null;

let currentAction = null;


// All animation actions

const actions = {};


// ======================================================
// FILE NAMES
// ======================================================

const files = {

    idle:
        "Idle.fbx",

    walk:
        "Walking.fbx",

    run:
        "Slow Run.fbx",

    wave:
        "Waving.fbx",

    talk:
        "Talking.fbx",

    jump:
        "Jump.fbx",

    left:
        "Left Turn 90.fbx",

    right:
        "Right Turn 90.fbx"

};


// ======================================================
// LOAD MAIN CHARACTER
// ======================================================

loader.load(

    "./models/Idle.fbx",

    function (model) {

        console.log(
            "Idle.fbx loaded"
        );


        character = model;


        scene.add(
            character
        );


        // ==========================================
        // CHARACTER SIZE
        // ==========================================

        const box =
            new THREE.Box3()
                .setFromObject(
                    character
                );


        const size =
            box.getSize(
                new THREE.Vector3()
            );


        const desiredHeight =
            3.2;


        if (size.y > 0) {

            const scale =
                desiredHeight /
                size.y;


            character.scale.set(
                scale,
                scale,
                scale
            );

        }


        // ==========================================
        // CENTER CHARACTER
        // ==========================================

        let characterBox =
            new THREE.Box3()
                .setFromObject(
                    character
                );


        const center =
            characterBox.getCenter(
                new THREE.Vector3()
            );


        character.position.x -=
            center.x;


        character.position.z -=
            center.z;


        // ==========================================
        // PUT FEET ON GROUND
        // ==========================================

        characterBox =
            new THREE.Box3()
                .setFromObject(
                    character
                );


        character.position.y -=
            characterBox.min.y;


        // ==========================================
        // SHADOWS
        // ==========================================

        character.traverse(
            function (child) {

                if (child.isMesh) {

                    child.castShadow =
                        true;

                    child.receiveShadow =
                        true;

                }

            }
        );


        // ==========================================
        // ANIMATION MIXER
        // ==========================================

        mixer =
            new THREE.AnimationMixer(
                character
            );


        // ==========================================
        // IDLE ANIMATION
        // ==========================================

        if (
            model.animations &&
            model.animations.length > 0
        ) {

            actions.idle =
                mixer.clipAction(
                    model.animations[0]
                );


            console.log(
                "IDLE ready"
            );

        }


        // ==========================================
        // LOAD OTHER ANIMATIONS
        // ==========================================

        loadAnimation("walk");

        loadAnimation("run");

        loadAnimation("wave");

        loadAnimation("talk");

        loadAnimation("jump");

        loadAnimation("left");

        loadAnimation("right");


        // ==========================================
        // START IDLE
        // ==========================================

        setTimeout(
            function () {

                playLoop(
                    "idle"
                );


                document
                    .getElementById(
                        "loading"
                    )
                    .style.display =
                    "none";

            },
            500
        );

    },


    // ==========================================
    // LOADING PROGRESS
    // ==========================================

    function (progress) {

        if (progress.total > 0) {

            const percent =
                Math.round(
                    progress.loaded /
                    progress.total *
                    100
                );


            console.log(
                "Loading:",
                percent + "%"
            );

        }

    },


    // ==========================================
    // ERROR
    // ==========================================

    function (error) {

        console.error(
            "Could not load Idle.fbx:",
            error
        );


        document
            .getElementById(
                "loading"
            )
            .textContent =
            "Could not load character";
    }

);


// ======================================================
// LOAD ANIMATION
// ======================================================

function loadAnimation(
    name
) {

    const filename =
        files[name];


    loader.load(

        "./models/" + filename,


        function (model) {

            console.log(
                filename +
                " loaded"
            );


            if (
                model.animations &&
                model.animations.length > 0
            ) {

                const clip =
                    model.animations[0];


                actions[name] =
                    mixer.clipAction(
                        clip
                    );


                console.log(
                    name +
                    " animation ready"
                );

            }

        },


        undefined,


        function (error) {

            console.error(
                "Error loading " +
                filename,
                error
            );

        }

    );

}


// ======================================================
// PLAY LOOPING ANIMATION
// ======================================================

function playLoop(
    name
) {

    const action =
        actions[name];


    if (!action) {

        console.log(
            name +
            " is still loading..."
        );

        return;

    }


    action.reset();


    action.setLoop(
        THREE.LoopRepeat,
        Infinity
    );


    action.clampWhenFinished =
        false;


    switchAnimation(
        action
    );

}


// ======================================================
// PLAY ONCE
// ======================================================

function playOnce(
    name
) {

    const action =
        actions[name];


    if (!action) {

        console.log(
            name +
            " is still loading..."
        );

        return;

    }


    action.reset();


    action.setLoop(
        THREE.LoopOnce,
        1
    );


    action.clampWhenFinished =
        true;


    switchAnimation(
        action
    );


    // Return to idle after animation

    const onFinished =
        function (event) {

            if (
                event.action ===
                action
            ) {

                mixer.removeEventListener(
                    "finished",
                    onFinished
                );


                if (
                    actions.idle
                ) {

                    playLoop(
                        "idle"
                    );

                }

            }

        };


    mixer.addEventListener(
        "finished",
        onFinished
    );

}


// ======================================================
// SMOOTH ANIMATION SWITCH
// ======================================================

function switchAnimation(
    newAction
) {

    if (!newAction) {
        return;
    }


    if (
        currentAction ===
        newAction
    ) {

        return;

    }


    // First animation

    if (!currentAction) {

        newAction
            .reset()
            .fadeIn(0.35)
            .play();


        currentAction =
            newAction;


        return;

    }


    // Smooth transition

    newAction
        .reset()
        .fadeIn(0.35)
        .play();


    currentAction
        .fadeOut(0.35);


    currentAction =
        newAction;

}


// ======================================================
// IDLE BUTTON
// ======================================================

document
    .getElementById(
        "idleButton"
    )
    .addEventListener(
        "click",
        function () {

            playLoop(
                "idle"
            );

        }
    );


// ======================================================
// WALK BUTTON
// ======================================================

document
    .getElementById(
        "walkButton"
    )
    .addEventListener(
        "click",
        function () {

            playLoop(
                "walk"
            );

        }
    );


// ======================================================
// SLOW RUN BUTTON
// ======================================================

document
    .getElementById(
        "runButton"
    )
    .addEventListener(
        "click",
        function () {

            playLoop(
                "run"
            );

        }
    );


// ======================================================
// WAVE BUTTON
// ======================================================

document
    .getElementById(
        "waveButton"
    )
    .addEventListener(
        "click",
        function () {

            playOnce(
                "wave"
            );

        }
    );


// ======================================================
// TALK BUTTON
// ======================================================

document
    .getElementById(
        "talkButton"
    )
    .addEventListener(
        "click",
        function () {

            playLoop(
                "talk"
            );

        }
    );


// ======================================================
// JUMP BUTTON
// ======================================================

document
    .getElementById(
        "jumpButton"
    )
    .addEventListener(
        "click",
        function () {

            playOnce(
                "jump"
            );

        }
    );


// ======================================================
// LEFT TURN BUTTON
// ======================================================

document
    .getElementById(
        "leftButton"
    )
    .addEventListener(
        "click",
        function () {

            playOnce(
                "left"
            );

        }
    );


// ======================================================
// RIGHT TURN BUTTON
// ======================================================

document
    .getElementById(
        "rightButton"
    )
    .addEventListener(
        "click",
        function () {

            playOnce(
                "right"
            );

        }
    );


// ======================================================
// CLOCK
// ======================================================

const clock =
    new THREE.Clock();


// ======================================================
// ANIMATION LOOP
// ======================================================

function animate() {

    requestAnimationFrame(
        animate
    );


    const delta =
        clock.getDelta();


    // Update character

    if (mixer) {

        mixer.update(
            delta
        );

    }


    // Update 360 camera

    controls.update();


    // Render

    renderer.render(
        scene,
        camera
    );

}


animate();


// ======================================================
// WINDOW RESIZE
// ======================================================

window.addEventListener(
    "resize",
    function () {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);