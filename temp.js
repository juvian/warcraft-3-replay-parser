var Parser = require("./w3-replay-parser/parser.js");
var constants = require("./w3-replay-parser/constants.js");


var parser = new Parser("ATempReplay.w3g", {shouldParseBlocks: true, parseActions: true, fromCrash: true})

parser.addEventListener("all", function (data, event) {
	if (parser.getTime().indexOf("52") == 0 && event != 'parsed-checksum')
		console.log(JSON.stringify(data), event)
})
try {
	parser.parse()
} catch (ex) {}

console.log(parser.getTime())


//console.log(parser.header, parser.players, parser.startUpData)