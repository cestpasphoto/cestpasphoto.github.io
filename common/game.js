/* =================== */
/* ===== GLOBALS ===== */
/* =================== */

let pyodide = null;
let onnxSession = null;

// The Global Store acting as the Single Source of Truth for the UI (Alpine.js)
document.addEventListener('alpine:init', () => {
    Alpine.store('game', {
        // --- Infrastructure ---
        isLoading: true,
        isThinking: false,
        loadingMessage: "Initializing Application...",
        arePlayersHuman: [true, false, false], // Peut être surchargé par le x-init du HTML
        
        // --- Données Standard ---
        statusMessage: "",
        currentPlayer: 0,
        gameEnded: false,
        editMode: 0,
        canUndo: false,
        
        // --- Données Spécifiques au Jeu ---
        view: {}, // Remplace 'cells'. Python y injectera ce qu'il veut.

        // --- Actions ---
        start() { init_infrastructure() },
        
        // Le routeur d'action générique : remplace clickCell
        async act(actionName, ...args) {
            if (this.isLoading || this.isThinking || this.gameEnded) return;
            
            // Sérialisation propre des arguments pour Python
            let argsStr = args.map(a => JSON.stringify(a)).join(', ');
            
            try {
                let json = await pyodide.runPythonAsync(`proxy.handle_action("${actionName}", ${argsStr})`);
                update_store(json);
            } catch (e) {
                console.error("Action Error:", e);
            }
        },

        undo() { handle_undo(this.arePlayersHuman) },
        toggleEdit() { handle_edit_toggle() },
        reset() { handle_reset() },
        trigger_ai_check() { check_ai_turn(); },
    });
});

/* =================== */
/* =====  ONNX   ===== */
/* =================== */

globalThis.predict = async function(canonicalBoard, valids) {
    if (!globalThis.onnxSession) {
        console.error("ONNX Session not initialized");
        return { pi: [], v: 0 };
    }

    try {
        const cb_js = Float32Array.from(canonicalBoard.toJs({create_proxies: false}));
        const vs_js = Uint8Array.from(valids.toJs({create_proxies: false}));
        const tensor_board = new ort.Tensor('float32', cb_js, sizeCB);
        const tensor_valid = new ort.Tensor('bool'   , vs_js, sizeV);
        
        const results = await globalThis.onnxSession.run({ board: tensor_board, valid_actions: tensor_valid });
        return {pi: Array.from(results.pi.data), v: Array.from(results.v.data)}
    } catch (e) {
        console.error("ONNX Prediction Error:", e);
        return { pi: [], v: 0 };
    }
}

async function loadONNX() {
    try {
        globalThis.onnxSession = await ort.InferenceSession.create(defaultModelFileName);
        console.log('Loaded ONNX Model');
    } catch (e) {
        console.error("Failed to load ONNX model:", e);
        Alpine.store('game').statusMessage = "Error loading AI Model";
    }
}

/* =================== */
/* ===== PYODIDE ===== */
/* =================== */

async function init_infrastructure() {
    Alpine.store('game').isLoading = true;
    Alpine.store('game').loadingMessage = "Loading Pyodide & Engine...";

    try {
        pyodide = await loadPyodide({ fullStdLib: false });
        await pyodide.loadPackage("numpy");

        // Chargement propre des fichiers en utilisant JSON
        let files = JSON.stringify(list_of_files);
        await pyodide.runPythonAsync(`
import json
from pyodide.http import pyfetch
files = json.loads('${files}')
for filename_in, filename_out in files:
    try:
        response = await pyfetch(filename_in)
        with open(filename_out, "wb") as f:
            f.write(await response.bytes())
    except Exception as e:
        print(f"Error loading {filename_in}: {e}")
        `);

        Alpine.store('game').loadingMessage = "Loading Neural Network...";
        await loadONNX();

        Alpine.store('game').loadingMessage = "Starting Game...";
        await pyodide.runPythonAsync(`import proxy`);
        
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        let initialStateJson = await pyodide.runPythonAsync(`proxy.init_game(${sims})`);
        
        Alpine.store('game').isLoading = false;
        update_store(initialStateJson);
        console.log("Initialization Complete");

    } catch (e) {
        console.error("Critical Initialization Error:", e);
        Alpine.store('game').statusMessage = "Critical Error: " + e.message;
        Alpine.store('game').isLoading = false;
    }
}

/* =================== */
/* ===== LOGIC   ===== */
/* =================== */

function update_store(jsonString) {
    if (!jsonString) return;
    const newState = JSON.parse(jsonString);
    const store = Alpine.store('game');
    
    // Mappage des champs standards
    store.statusMessage = newState.statusMessage;
    store.currentPlayer = newState.currentPlayer;
    store.gameEnded = newState.gameEnded;
    store.editMode = newState.editMode;
    store.canUndo = newState.canUndo;
    
    // Le conteneur spécifique au jeu
    store.view = newState.viewData;

    check_ai_turn();
}

function is_nextplayer_human() {
    const store = Alpine.store('game');
    return store.arePlayersHuman[store.currentPlayer];
}

async function handle_undo(playerTypes) {
    if (Alpine.store('game').isLoading || Alpine.store('game').isThinking) return;
    try {
        let json = await pyodide.runPythonAsync(`proxy.undo(${JSON.stringify(playerTypes)})`);
        update_store(json);
    } catch (e) {
        console.error("Undo Error:", e);
    }
}

async function handle_reset() {
    if (Alpine.store('game').isLoading || Alpine.store('game').isThinking) return;
    try {
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        let json = await pyodide.runPythonAsync(`proxy.init_game(${sims})`);
        update_store(json);
    } catch (e) {
        console.error("Reset Error:", e);
    }
}

async function handle_edit_toggle() {
    if (Alpine.store('game').isLoading || Alpine.store('game').isThinking) return;
    let current = Alpine.store('game').editMode;
    let next = (current + 1) % 3; // Note: Si certains jeux n'ont qu'un editMode booléen, il faudra adapter côté Python
    try {
        let json = await pyodide.runPythonAsync(`proxy.set_edit_mode(${next})`);
        update_store(json);
    } catch (e) {
        console.error("Edit Mode Error:", e);
    }
}

/* =================== */
/* ===== AI LOOP ===== */
/* =================== */

async function check_ai_turn() {
    const store = Alpine.store('game');
    if (store.gameEnded || store.editMode !== 0) return;
    
    if (!is_nextplayer_human()) {
        setTimeout(() => execute_ai_move(), 800);
    }
}

async function execute_ai_move() {
    const store = Alpine.store('game');
    if (is_nextplayer_human()) return; 

    store.statusMessage = "AI is thinking...";
    store.isThinking = true;
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
        let ai_script = `
import numpy as np
canonicalBoard = proxy.g.getCanonicalForm(proxy.board, proxy.player)
probs, _, _ = await proxy.mcts.getActionProb(canonicalBoard, temp=0)
action = np.argmax(probs)
proxy.getNextState(action)
`;
        let json = await pyodide.runPythonAsync(ai_script);
        update_store(json);
    } catch (e) {
        console.error("AI Error:", e);
        store.statusMessage = "AI Crashed";
    } finally {
        store.isThinking = false;
    }
}