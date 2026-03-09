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
