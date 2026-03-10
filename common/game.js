/* =================== */
/* ===== GLOBALS ===== */
/* =================== */

let pyodide = null;
let onnxSession = null;
let pyProxy = null;

// The Global Store acting as the Single Source of Truth for the UI (Alpine.js)
document.addEventListener('alpine:init', () => {
    Alpine.store('game', {
        // --- Infrastructure ---
        isLoading: true,
        isThinking: false,
        loadingMessage: "Initializing Application...",
        arePlayersHuman: Array.from({ length: numPlayers }, (_, i) => i === 0),
        
        // --- Standard Data ---
        statusMessage: "",
        currentPlayer: 0,
        gameEnded: false,
        winners: [],
        editMode: 0,
        canUndo: false,
        numMCTSSims: numMCTSSims,
        
        // --- Game-Specific Data ---
        view: {}, // Replaced 'cells'. Python injects what it wants here.
        extra: {}, // Generic container for any game-specific metadata (gods, powers, etc.)

        // --- Actions ---
        start() { init_infrastructure() },
        
        // Generic action router: replaces legacy clickCell
        async act(actionName, ...args) {
            if (this.isLoading || this.isThinking || this.gameEnded) return;
            
            try {
                let json = pyProxy.handle_action(actionName, ...args);
                update_store(json);
            } catch (e) {
                console.error("Action Error:", e);
            }
        },

        toggleEdit() { handle_edit_toggle() },
        reset() { handle_reset() },
        changeDifficulty() { pyProxy.changeDifficulty(this.numMCTSSims); },
        setGameMode(value) {
            const modes = {
                'P0':    Array.from({ length: numPlayers }, (_, i) => i === 0),
                'P1':    Array.from({ length: numPlayers }, (_, i) => i === 1),
                'Human': new Array(numPlayers).fill(true),
                'AI':    new Array(numPlayers).fill(false),
            };
            
            if (modes[value]) {
                this.arePlayersHuman = modes[value];
                check_ai_turn();
            }
        },
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
        pyProxy = pyodide.pyimport("proxy");
        
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        let initialStateJson = pyProxy.init_game(sims);
        
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
    store.winners = newState.winners || [];
    store.editMode = newState.editMode;
    store.canUndo = newState.canUndo;
    
    // Le conteneur spécifique au jeu
    store.view = newState.viewData;
    store.extra = newState.extra;

    check_ai_turn();
}

function is_nextplayer_human() {
    const store = Alpine.store('game');
    return store.arePlayersHuman[store.currentPlayer];
}

async function handle_reset() {
    if (Alpine.store('game').isLoading || Alpine.store('game').isThinking) return;
    try {
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        let json = pyProxy.init_game(sims);
        update_store(json);
    } catch (e) {
        console.error("Reset Error:", e);
    }
}

async function handle_edit_toggle() {
    if (Alpine.store('game').isLoading || Alpine.store('game').isThinking) return;
    let current = Alpine.store('game').editMode;
    let next = (current + 1) % 3; // Note: If some games only use a boolean editMode, adapt the Python side accordingly.
    try {
        let json = pyProxy.set_edit_mode(next);
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
        let delay = store.arePlayersHuman.every(h => !h) ? 800 : 0;
        setTimeout(() => execute_ai_move(), delay);
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