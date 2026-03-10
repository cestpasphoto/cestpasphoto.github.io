// Define the required Python files and their local paths for Pyodide virtual file system mapping
const list_of_files = [
  ['santorini/Game.py', 'Game.py'],
  ['santorini/proxy.py', 'proxy.py'],
  ['santorini/MCTS.py', 'MCTS.py'],
  ['santorini/SantoriniDisplay.py', 'SantoriniDisplay.py'],
  ['santorini/SantoriniGame.py', 'SantoriniGame.py'],
  ['santorini/SantoriniLogicNumba.py', 'SantoriniLogicNumba.py'],
  [pyConstantsFileName, 'SantoriniConstants.py'],
];

// Define tensor shapes required for the ONNX neural network inference
const sizeCB = [1, 25, 3];
const sizeV = [1, onnxOutputSize];

// Set the default number of Monte Carlo Tree Search simulations per move
const numMCTSSims = 50;

// Define the color mapping for UI rendering based on player IDs (-1 is empty)
const colors = {'-1': 'black', '0': '#21BA45', '1': '#DB2828' };

// Set up base URLs for the simple hit counter analytics API
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2, 7).replace('-', '');

// Register an event listener to asynchronously trigger analytics tracking on page load
window.addEventListener('load', () => {
    const urls = [ 
        `${counterAPI_base}/overall`, 
        `${counterAPI_base}/overall_${counterAPI_suffix}`,
        `${counterAPI_base}/santorini_${counterAPI_suffix}`
    ];
    
    // Execute fire-and-forget fetch requests for each analytics URL, catching ad-blocker rejections silently
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});