/* =================== */
/* ===== GLOBALS ===== */
/* =================== */

let pyodide = null;
let onnxSession = null;

// The Global Store acting as the Single Source of Truth for the UI (Alpine.js)
// Alpine will bind to this object.
document.addEventListener('alpine:init', () => {
    Alpine.store('game', {
        isLoading: true,
        isThinking: false,
        loadingMessage: "Initializing Application...",
        arePlayersHuman: [true, false],
        // The following variables come python        
        cells: [],
        statusMessage: "",
        currentPlayer: 0,
        gameEnded: false,
        editMode: 0,
        canUndo: false,
        
        start() { init_infrastructure() },
        clickCell(y, x) { handle_click(y, x) },
        undo() { handle_undo(this.arePlayersHuman) },
        toggleEdit() { handle_edit_toggle() },
        reset() { handle_reset() },
        trigger_ai_check() { check_ai_turn(); },
    });
});

/* =================== */
/* =====  ONNX   ===== */
/* =================== */

// Bridge function called BY Python (MCTS) via Pyodide
// Must remain in global scope or be explicitly attached to window
globalThis.predict = async function(canonicalBoard, valids) {
    if (!globalThis.onnxSession) {
        console.error("ONNX Session not initialized");
        return { pi: [], v: 0 };
    }

    try {
        // Convert Pyodide proxies to JS TypedArrays
        // sizeCB and sizeV are defined in main.js/constants.js
        const cb_js = Float32Array.from(canonicalBoard.toJs({create_proxies: false}));
        const vs_js = Uint8Array.from(valids.toJs({create_proxies: false}));

        const tensor_board = new ort.Tensor('float32', cb_js, sizeCB);
        const tensor_valid = new ort.Tensor('bool'   , vs_js, sizeV);

        // Run Inference
        const results = await globalThis.onnxSession.run({ 
            board: tensor_board, 
            valid_actions: tensor_valid 
        });

        // Return pure JS objects to Python
        return {
            pi: Array.from(results.pi.data), 
            v: Array.from(results.v.data)
        };
    } catch (e) {
        console.error("ONNX Prediction Error:", e);
        return { pi: [], v: 0 };
    }
}

async function loadONNX() {
    try {
        // defaultModelFileName is defined in constants.js
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
        // 1. Load Pyodide
        pyodide = await loadPyodide({ fullStdLib: false });
        await pyodide.loadPackage("numpy");

        // 2. Load File System (Python Scripts)
        // list_of_files is defined in main.js
        let file_loader_script = `
import pyodide_js
from pyodide.http import pyfetch
files = ${JSON.stringify(list_of_files)}
for filename_in, filename_out in files:
    try:
        response = await pyfetch(filename_in)
        with open(filename_out, "wb") as f:
            f.write(await response.bytes())
    except Exception as e:
        print(f"Error loading {filename_in}: {e}")
`;
        await pyodide.runPythonAsync(file_loader_script);

        // 3. Load ONNX
        Alpine.store('game').loadingMessage = "Loading Neural Network...";
        await loadONNX();

        // 4. Initialize Game in Python
        Alpine.store('game').loadingMessage = "Starting Game...";
        
        // We import the specific proxy file which acts as our Controller
        await pyodide.runPythonAsync(`import proxy`);
        
        // numMCTSSims comes from main.js or constants.js, defaulting if missing
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        
        // Call init and get the first state JSON
        let initialStateJson = await pyodide.runPythonAsync(`proxy.init_game(${sims})`);
        update_store(initialStateJson);

        Alpine.store('game').isLoading = false;
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

// Updates the Alpine Reactive Store with data from Python
function update_store(jsonString) {
    const newState = JSON.parse(jsonString);
    
    // Batch update properties to trigger Alpine reactivity
    Alpine.store('game').cells = newState.cells;
    Alpine.store('game').statusMessage = newState.statusMessage;
    Alpine.store('game').currentPlayer = newState.currentPlayer;
    Alpine.store('game').gameEnded = newState.gameEnded;
    Alpine.store('game').editMode = newState.editMode;
    Alpine.store('game').canUndo = newState.canUndo;

    // Check if it's AI's turn
    check_ai_turn();
}

function is_nextplayer_human() {
    return Alpine.store('game').arePlayersHuman[Alpine.store('game').currentPlayer];
}

async function handle_click(y, x) {
    if (Alpine.store('game').isLoading || Alpine.store('game').gameEnded || !is_nextplayer_human()) return;
    
    try {
        let json = await pyodide.runPythonAsync(`proxy.handle_click(${y}, ${x})`);
        update_store(json);
    } catch (e) {
        console.error("Click Error:", e);
    }
}

async function handle_undo(arePlayersHuman) {
    if (Alpine.store('game').isLoading || !is_nextplayer_human()) return;
    try {
        let json = await pyodide.runPythonAsync(`proxy.undo(${JSON.stringify(arePlayersHuman)})`);
        update_store(json);
    } catch (e) {
        console.error("Undo Error:", e);
    }
}

async function handle_reset() {
    if (Alpine.store('game').isLoading || !is_nextplayer_human()) return;
    try {
        // numMCTSSims assumed global
        const sims = (typeof numMCTSSims !== 'undefined') ? numMCTSSims : 50;
        let json = await pyodide.runPythonAsync(`proxy.init_game(${sims})`);
        update_store(json);
    } catch (e) {
        console.error("Reset Error:", e);
    }
}

async function handle_edit_toggle() {
    if (Alpine.store('game').isLoading || !is_nextplayer_human()) return;
    
    // Cycle: Play (0) -> Level (1) -> Worker (2) -> Play (0)
    let current = Alpine.store('game').editMode;
    let next = (current + 1) % 3;
    
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
    // If game over or edit mode, no AI
    if (Alpine.store('game').gameEnded || Alpine.store('game').editMode !== 0) return;
    if (!is_nextplayer_human()) {
        // We could give a small delay for UI update (so user sees the previous move)
        // But we give a longer one so that user can jump off the "AI-AI" mode
        setTimeout(() => execute_ai_move(), 1000);
    }
}

async function execute_ai_move() {
    // Double check just in case
    if (is_nextplayer_human()) {
        return; 
    }

    Alpine.store('game').statusMessage = "AI is thinking...";
    Alpine.store('game').isThinking = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
        let json = await pyodide.runPythonAsync('proxy.run_ai_step()');
        update_store(json);
    } catch (e) {
        console.error("AI Error:", e);
        Alpine.store('game').statusMessage = "AI Crashed";
    } finally {
        Alpine.store('game').isThinking = false;
    }
}