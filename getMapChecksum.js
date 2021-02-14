var Parser = require("./w3-replay-parser/parser.js");

var parser = new Parser("dirk.w3g", {shouldParseBlocks: false})

parser.parse()

console.log(parser.startUpData.gameSettings.mapCheckSum)


//console.log(parser.header, parser.players, parser.startUpData)