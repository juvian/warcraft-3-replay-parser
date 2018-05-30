var dir = 'C:/Users/julia_000/Documents/Warcraft III/Replay/'; // your directory

var fs = require('fs');
var Parser = require('./parser').parser

var count = 1

var files = fs.readdirSync(dir);
files.filter(v => v != "TempReplay.w3g").sort(function(a, b) {
               return fs.statSync(dir + b).mtime.getTime() - 
                      fs.statSync(dir + a).mtime.getTime();
           });


files.forEach(function(file){
	var parser = new Parser(fs.readFileSync(dir + file));

	try{
		parser.parse();
	} catch (ex) {console.log(ex);return}

	var map = parser.startUpData.map
	var players = parser.startUpData.players

	if (map.indexOf("HM") != -1) {
		var user = "Aethael"
		var matches = players.filter(v => v.name.toLowerCase().indexOf(user.substring(1).toLowerCase()) != -1)

		if (matches.length) {
			console.log(file)
			//fs.createReadStream(dir + file).pipe(fs.createWriteStream('replays/' + count++ + "-" + matches.length + ".w3g"));
		}
	}

})