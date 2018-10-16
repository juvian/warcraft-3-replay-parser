const constants = require('./constants');
var PlayerRecord = require('./player-record');
var GameSettings = require('./game-settings');
var GameStartRecord = require('./game-start-record');
var GameStartRecord = require('./game-start-record');
var BufferWrapper = require('./buffer-wrapper');

class StartupBlock {
	constructor (buffer, parser) {
		this.parse(buffer, parser)
	}

	parse (buffer, parser) {
		this.unknown = buffer.read(4); // unknown
		this.playerRecord = new PlayerRecord(buffer, parser);

		this.gameName = buffer.readUntil(constants.NULL_STRING).toString();
		buffer.read(1); // Nullbyte

		var encoded = buffer.readUntil(constants.NULL_STRING);
		var decoded = this.decode(encoded);

		this.gameSettings = new GameSettings(decoded);

		this.map = decoded.readUntil(constants.NULL_STRING).toString();

		this.creator = decoded.readUntil(constants.NULL_STRING).toString();

		this.playerCount = buffer.read(4).readUIntLE(0, 4);

		this.gameType = buffer.read(1).readUIntLE(0, 1);

		this.publicGame = buffer.read(1).readUIntLE(0, 1) == 0;

		this.unknown2 = buffer.read(2);

		this.languageId = buffer.read(4);

		this.parsePlayers(buffer, parser);
		this.gameStartRecord = new GameStartRecord(buffer);

		parser.emitEvent(constants.EVENTS.PARSED.STARTUP_BLOCK, this)

	}

	parsePlayers (buffer, parser) {
		this.players = [];

		while (buffer.peek(1).readUIntLE(0, 1) == constants.PLAYER_TYPE.ADDITIONAL_PLAYERS) {
			this.players.push(new PlayerRecord(buffer, parser));
		}

	}

	decode (encoded) {
		var decoded = "";
		var mask;
		for(var i = 0; i < encoded.length; i++) {
			if (i % 8 != 0) {
				decoded += String.fromCharCode((+encoded[i].toString() - !(mask & (0x01 << (i % 8)))));
			} else {
				mask = encoded[i];
			}
		}
		return new BufferWrapper(Buffer.from(decoded));
	}
}

module.exports = StartupBlock;