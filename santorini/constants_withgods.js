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
const gods_name = ['Regular', 'Apollo', 'Minot', 'Atlas', 'Hepha', 'Artemis', 'Demeter', 'Hermes', 'Pan', 'Athena', 'Prometheus'];
const gods_descr = [
  "move on neighbour cell and build",
  "Your Worker may move into an opponent Worker's space by forcing their Worker to the space yours just vacated.",
  "Your Worker may move into an opponent Worker's space, if their Worker can be forced one space straight backwards to an unoccupied space at any level.",
  "Your Worker may build a dome at any level.",
  "Your Worker may build one additional block (not dome) on top of your first block.",
  "Your Worker may move one additional time, but not back to its initial space.",
  "Your Worker may build one additional time, but not on the same space.",
  "If your Workers do not move up or down, they may each move any number of times (even zero), and then either builds.",
  "You also win if your Worker moves down two or more levels.",
  "If one of your Workers moved up on your last turn, opponent Workers cannot move up this turn.",
  "If your Worker does not move up, it may build both before and after moving.",
];

const onnxOutputSize = 1782;
const pyConstantsFileName = 'santorini/SantoriniConstantsWithGods.py';
const modelFileName = 'santorini/model_with_gods.onnx';