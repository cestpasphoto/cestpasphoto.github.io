const NO_GOD     = 0;
const APOLLO     = 1;
const MINOTAUR   = 2;
const ATLAS      = 3;
const HEPHAESTUS = 4;
const ARTEMIS    = 5;
const DEMETER    = 6;
const HERMES     = 7;
const PAN        = 8;
const ATHENA     = 9;
const PROMETHEUS = 10;
const NB_GODS = 11; // Modify this to 1 to disable use of any god, or 11 to enable all of them
const gods_name = ['No power', 'Apollo', 'Minotaur', 'Atlas', 'Hephaestus', 'Artemis', 'Demeter', 'Hermes', 'Pan', 'Athena', 'Prometheus'];
const gods_descr = [
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
];

const gods_instructions = [
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
];

const onnxOutputSize = 1782;
const pyConstantsFileName = 'santorini/SantoriniConstantsWithGods.py';
const defaultModelFileName = 'santorini/models/model_gods_default.onnx';

function selectModel(gods) {
  const groups_list = [-1, 0, 0, 2, 1, 1, 1, 3, 4, 2, 1];
  const customModelBaseName = 'santorini/models/model_gods_';
  const arrayEquals = (a, b) => a.every((v, i) => v === b[i]);
  
  let groups = [groups_list[gods[0]], groups_list[gods[1]]];
  groups.sort();
  if (arrayEquals(groups, [0, 0]))
    return customModelBaseName+"K.onnx";
  if (arrayEquals(groups, [0, 1]))
    return customModelBaseName+"A.onnx";
  if (arrayEquals(groups, [0, 2]))
    return customModelBaseName+"B.onnx";
  if (arrayEquals(groups, [0, 3]))
    return customModelBaseName+"C.onnx";
  if (arrayEquals(groups, [0, 4]))
    return customModelBaseName+"D.onnx";
  if (arrayEquals(groups, [1, 1]))
    return customModelBaseName+"F.onnx";
  if (arrayEquals(groups, [1, 2]))
    return customModelBaseName+"E.onnx";
  if (arrayEquals(groups, [1, 3]))
    return customModelBaseName+"G.onnx";
  if (arrayEquals(groups, [1, 4]))
    return customModelBaseName+"H.onnx";
  if (arrayEquals(groups, [2, 2]))
    return customModelBaseName+"L.onnx";
  if (arrayEquals(groups, [2, 3]))
    return customModelBaseName+"I.onnx";
  if (arrayEquals(groups, [2, 4]))
    return customModelBaseName+"J.onnx";
  if (arrayEquals(groups, [3, 4]))
    return customModelBaseName+"M.onnx";
  console.log('Unknown gods combination', gods, ', using default model');
  return defaultModelFileName;
}