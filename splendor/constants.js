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

const tokensCoord      = [["20%", "83%"], ["20%", "53%"], ["50%", "83%"], ["50%", "53%"]];
const tokensCoordSmall = [["20%", "83%"], ["20%", "50%"], ["50%", "83%"], ["50%", "50%"]];
const tokensCoordNoble = [["25%", "83%"], ["25%", "50%"], ["25%", "16%"]];

const nobles_names = [
  "Isabelle of Castile", "Anne of Brittany", "Mary Stuart", "Elisabeth of Austria", 
  "Charles V", "Machiavelli", "Suleiman the Magnificent", "Henry VIII",
  "Francis I", "Catherine of Medici"
];

// Note : nobles_req is kept just in case you use it for tooltips, 
// though the actual requirements checking is fully done in Python now.
const nobles_req = [
  "4[W] 4[B] 4[K]", "3[B] 3[G] 3[R]", "3[R] 3[G] 3[B]", "3[W] 3[B] 3[K]",
  "3[W] 3[R] 3[K]", "4[B] 4[W] 4[R]", "4[B] 4[G] 4[R]", "4[R] 4[B] 4[K]",
  "3[R] 3[W] 3[G]", "3[G] 3[W] 3[B]"
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
