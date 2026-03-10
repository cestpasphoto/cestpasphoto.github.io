// Define main constants for each mode
const configs = {
    noGods: {
      gods_name: ['No power'],
      gods_descr: ["Move and build"],
      gods_instructions: ["Click highlighted cells to select your choice"],
      onnxOutputSize: 162,
      pyConstantsFileName: 'santorini/SantoriniConstantsNoGod.py',
      defaultModelFileName: 'santorini/model_no_god.onnx',
    },

    withGods: {
      gods_name: ['No power', 'Apollo', 'Minotaur', 'Atlas', 'Hephaestus', 'Artemis', 'Demeter', 'Hermes', 'Pan', 'Athena', 'Prometheus'],
      gods_descr: [
        "Move and build",
        "It may move into an opponent's space by forcing it to the space Apollo just vacated.", // Apollo
        "It may move into an opponent's space, if opponent can be forced one space straight backwards to an unoccupied space at any level.", // Minotaur
        "It may build a dome at any level.", // Atlas
        "It may build one additional block (not dome) on top of the first block.", // Hephaestus
        "It may move one additional time, but not back to its initial space.", // Artemis
        "It may build one additional time, but not on the same space.", // Demeter
        "If both Hermes do not move up or down, they may move any number of times (even zero), and then either builds.", // Hermes
        "Pan also wins if it moves down two or more levels.", // Pan
        "If one Athena moved up on the last turn, opponent cannot move up this turn.", // Athena
        "If it does not move up, it may build both before and after moving.", // Prometheus
      ],
      gods_instructions: [
        "Click highlighted cells to select your choice",
        "Click highlighted cells to select your choice", // Apollo
        "Click highlighted cells to select your choice", // Minotaur
        "At the end of your move, click on the button below to use power or not", // Atlas
        "At the end of your move, click on the button below to use power or not", // Hephaestus
        "To use such power, click thrice on the cell you want to move first", // Artemis
        "After regular move, click worker twice then click the other place to build, or click thrice not to use power", // Demeter
        "(Limited to 5 moves max actually) Click twice on worker to build and finish your move ", // Hermes
        "Click highlighted cells to select your choice", // Pan
        "Click highlighted cells to select your choice", // Athena
        "To use such power, click worker twice and build then select regular action", // Prometheus
      ],
      onnxOutputSize: 1782,
      pyConstantsFileName: 'santorini/SantoriniConstantsWithGods.py',
      defaultModelFileName: 'santorini/model_gods_default.onnx',
    }
};

const numPlayers = 2;
const NB_GODS = +new URLSearchParams(window.location.search).get('gods') || 1;
const selectedConfig = (NB_GODS === 1) ? configs.noGods : configs.withGods;
const { gods_name, gods_descr, gods_instructions, onnxOutputSize, pyConstantsFileName, defaultModelFileName } = selectedConfig;
