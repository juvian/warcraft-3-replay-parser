var dir = 'C:/Users/julia_000/Documents/Warcraft III/Replay/'; // your directory

var fs = require('fs');
var Parser = require('./parser')

var count = 1

var files = fs.readdirSync(dir);
files.sort(function(a, b) {
               return fs.statSync(dir + b).mtime.getTime() - 
                      fs.statSync(dir + a).mtime.getTime();
           });


files.forEach(function(file){
	var readable = fs.createReadStream(dir + file);

	readable.on('readable', function() {
		var parser = new Parser(readable);

		try{
			parser.parse();
		} catch (ex) {return}

		var map = parser.startUpData.map
		var players = parser.startUpData.players

		if (map.indexOf("eden") != -1) {
			var user = "Thezodiac"

			var matches = players.filter(v => v.name.toLowerCase().indexOf(user.substring(1).toLowerCase()) != -1)

			if (matches.length) {
				fs.createReadStream(dir + file).pipe(fs.createWriteStream('replays/' + count++ + "-" + matches.length + ".w3g"));
			}
		}


	})
})