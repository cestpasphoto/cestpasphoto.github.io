// Define main constants for each mode
const configs = {
	2: {
		defaultModelFileName: 'splendor/model.onnx',
		pyConstantsFileName: 'splendor/SplendorGame_2pl.py',
		sizeCB: [1, 56, 7],
		sizeV: [1, 81],
	},
	
	3: {
		defaultModelFileName: 'splendor/model_3pl.onnx',
		pyConstantsFileName: 'splendor/SplendorGame_3pl.py',
		sizeCB: [1, 71, 7],
		sizeV: [1, 81],
	},

	4: {
		defaultModelFileName: 'splendor/model_4pl.onnx',
		pyConstantsFileName: 'splendor/SplendorGame_4pl.py',
		sizeCB: [1, 88, 7],
		sizeV: [1, 81],
	},
}

const numPlayers = +new URLSearchParams(window.location.search).get('players') || 2;
const selectedConfig = configs[numPlayers] || configs[2];
const { sizeV, sizeCB, pyConstantsFileName, defaultModelFileName } = selectedConfig;

const colors = [
  ["gainsboro"  , "ghostwhite", "black"], // white
  ["dodgerblue" , "mediumblue", "white"], // blue
  ["lightgreen" , "green"     , "white"], // green
  ["tomato"     , "red"       , "white"], // red
  ["dimgray"    , "black"     , "white"], // black
  ["lightyellow", "yellow"    , "black"], // yellow
  ["darkgray"   , "darkgray"  , "black"]  // For noble
];

const all_nobles = [
  [[2,4], [3,4]],
  [[3,4], [4,4]],
  [[1,4], [2,4]],
  [[0,4], [4,4]],
  [[0,4], [1,4]],
  [[0,3], [3,3], [4,3]],
  [[0,3], [1,3], [2,3]],
  [[2,3], [3,3], [4,3]],
  [[1,3], [2,3], [3,3]],
  [[0,3], [1,3], [4,3]],
];
