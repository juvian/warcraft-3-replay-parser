'use strict';
class Parser {


	constructor(stream) {
		this.setStream(stream);
	}

	setStream (data) {
		this.stream = data;
	}

	parse () {
		this.checkSumBuffer = "";
		this.blockData = [];

		this.parseHeader();
		this.parseSubHeader();
		this.checksum();
		this.parseBlocks();
	}

	checksum () {
		var checkSum = crc32(hexToBytes(this.checkSumBuffer));
		
		delete this.checkSumBuffer;

		if (this.subHeader.checksum != checkSum) throw new Error("invalid checksum");

	}

	parseHeader() {

		var buffer = this.read(48);

		this.checkSumBuffer += buffer.toString('hex');
		this.header = new Header(buffer);

		console.log(this.header);
		
	}

	parseSubHeader () {
		var buffer = this.read(Utils.fromHex(this.header.firstDataBlock) - 48);

		this.checkSumBuffer += buffer.toString('hex').slice(0, -8) + '00000000';
		this.subHeader = new Subheader(buffer, this.header.version);

		console.log(this.subHeader)		
	}

	parseBlocks () {
		for (var i = 0; i < this.header.blocks && i < 2; i++) {
			this.parseBlock(i);
		}
	}

	parseBlock (idx) {
		if (idx == 0) {
			this.startUpData = new StartupBlock(this);
		} else {
			this.blockData.push(new DataBlock(this));
		}
	}

	read (bytes) {
		return new BufferWrapper(this.stream.read(bytes));
	}

}

class BufferWrapper {

	constructor (buffer) {
		this.idx = 0;
		this.buffer = buffer;
	}

	read (bytes) {
		this.idx += bytes;
		return this.buffer.slice(this.idx - bytes, this.idx);
	}

	peek (bytes) {
		return this.buffer.slice(this.idx, this.idx + bytes);
	}

	readUntil (byte, skipByte = 1) {
		var idx = this.buffer.indexOf(byte, this.idx, "utf-8");
		var buffer  = this.read(idx - this.idx);

		if (skipByte) this.idx += skipByte;

		return buffer;
	}

	toString (...args) {
		return this.buffer.toString.apply(this.buffer, arguments);
	}

}

class Header {

	constructor (buffer) {
		if (buffer.read(28).toString().indexOf('Warcraft III recorded game') != 0) throw new Error("Not a replay file");

		this.firstDataBlock = "0x" + buffer.read(4).readUIntLE(0, 3).toString(16);
		this.compressedSize = buffer.read(4).readUIntLE(0, 3);
		this.version = buffer.read(4).readUIntLE(0, 3);
		this.decompressedSize = buffer.read(4).readUIntLE(0, 3);
		this.blocks = buffer.read(4).readUIntLE(0, 3);
	}

}

class Subheader {

	constructor (buffer, headerVersion) {
		if (headerVersion == 0) {
			this.readV0(buffer);
		} else if (headerVersion == 1) {
			this.readV1(buffer);
		} else {
			throw new Error("Unknown header version :" + headerVersion)
		}
	}

	readV0 (buffer) {
		buffer.read(2); // unknown
		this.versionNumber = buffer.read(2).toString();
		this.buildNumber = buffer.read(2).toString();
		this.flags = buffer.read(2).toString();
		this.replayLength = buffer.read(4).readUIntLE(0, 3);
		this.checksum = buffer.read(4).reverse().toString('hex');
		this.singlePlayer = this.flags == "0000";
	}

	readV1 (buffer) {
		this.gameVersion = buffer.read(4).reverse().toString();
		this.versionNumber = "1." + buffer.read(4).readUIntLE(0, 3);
		this.buildNumber = buffer.read(2).readUIntLE(0, 2);
		this.flags = buffer.read(2).toString('hex').match(/.{2}/g).reverse().join("");
		this.replayLength = buffer.read(4).readUIntLE(0, 3);
		this.checksum = buffer.read(4).reverse().toString('hex');
		this.singlePlayer = this.flags == "0000";
	}

}

class Block {

	constructor (parser) {

		var buffer = parser.read(8);

		this.compressedSize = buffer.read(2).readUIntLE(0, 2);
		this.uncompressedSize = buffer.read(2).readUIntLE(0, 2);
		this.checksum = buffer.read(4).reverse().toString('hex');

		buffer = parser.read(this.compressedSize).buffer;

		this.parse(this.uncompress(buffer));
	}

	uncompress (buffer) {
		return new BufferWrapper(zlib.inflateSync(buffer, {finishFlush: zlib.constants.Z_SYNC_FLUSH }));
	}

}


class DataBlock extends Block {
	constructor (buffer) {
		super(buffer);
	}

	parse (buffer) {
		this.type = Utils.fromHex(buffer.read(1).toString("hex").split("").reverse().join(""));

		if (parsers[this.type]) {
			parsers[this.type].call(this, buffer);
		}
	}
}

class StartupBlock extends Block {
	constructor (buffer) {
		super(buffer);
	}

	parse (buffer) {
		buffer.read(4); // unknown
		this.playerRecord = new PlayerRecord(buffer);
		
		this.gameName = buffer.readUntil(NULL_STRING).toString();
		buffer.read(1); // Nullbyte

		var encoded = buffer.readUntil(NULL_STRING);
		var decoded = this.decode(encoded);

		this.gameSettings = new GameSettings(decoded);

		this.map = decoded.readUntil(NULL_STRING).toString();

		this.creator = decoded.readUntil(NULL_STRING).toString();

		this.playerCount = buffer.read(4).readUIntLE(0, 4);

		this.gameType = buffer.read(1).readUIntLE(0, 1);

		this.publicGame = buffer.read(1).readUIntLE(0, 1) == 0;

		buffer.read(2); // unknown

		this.languageId = buffer.read(4);

		this.parsePlayers(buffer);
		this.gameStartRecord = new GameStartRecord(buffer);		
	}

	parsePlayers (buffer) {
		this.players = [];

		while (buffer.peek(1).readUIntLE(0, 1) == constants.PLAYER_TYPE.ADDITIONAL_PLAYERS) {
			this.players.push(new PlayerRecord(buffer));
			buffer.read(4); // unknown
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

//H  àà¢ÉµÍMaps\Download\eden rpg 2.5c eng.w3x Justme_Hostbot  ¤àD­àÙbÒH|¢

class PlayerRecord {

	constructor (buffer) {
		this.type = buffer.read(1).toString("hex");
		this.id = buffer.read(1).readUIntLE(0, 1);

		this.name = buffer.readUntil(NULL_STRING).toString();

		this.additionalDataSize = buffer.read(1).readUIntLE(0, 1);

		if (this.additionalDataSize == constants.PLAYER_RECORD.LADDER_GAME) { 
			this.runTime = buffer.read(4).readUIntLE(0, 3);
			this.race = buffer.read(4).toString('hex');
		} else {
			buffer.read(1); // null
		}

	}

}

class GameSettings {

	constructor (buffer) {
		this.gameSpeed = buffer.read(1) & 3;
		var byte = buffer.read(1);

		this.visibility = {
			hideTerrain : (byte & 1) == 1,
			mapExplored : (byte >> 1 & 1) == 1,
			alwaysVisible : (byte >> 2 & 1) == 1,
			default : (byte >> 3 & 1) == 1
		}

		this.observers = byte >> 4 & 3;

		this.teamsTogether = (byte >> 6) == 1;

		byte = buffer.read(1);

		this.fixedTeams = byte & 3;

		byte = buffer.read(1);

		this.fullSharedUnitControl = (byte & 1) == 1;
		this.randomHeroes = (byte >> 1 & 1) == 1;
		this.randomRaces = (byte >> 2 & 1) == 1;
		this.referees = (byte >> 6 & 1) == 1;

		buffer.read(5); // unknown

		this.mapCheckSum = buffer.read(4).toString('hex');
	}

}

class GameStartRecord {
	constructor (buffer) {
		if(buffer.read(1).toString("hex") != '19') throw new Error("invalid recordID"); 

		var bytes = buffer.read(2).readUIntLE(0, 2);

		var slotRecordsQty = buffer.read(1).readUIntLE(0, 1);

		this.slotRecords = [];

		for (var i = 0; i < slotRecordsQty; i++) {
			this.slotRecords.push(new SlotRecord(buffer));
		}

		this.randomSeed = buffer.read(4).readUIntLE(0, 4); // for custom games its just the runtime of the Warcraft.exe of the game host in milliseconds.
		this.selectMode = buffer.read(1).toString("hex");
		this.startSpotCount = buffer.read(1).readUIntLE(0, 1); // (nr. of start positions in map) 
	}
}

class SlotRecord {
	constructor (buffer) {
		this.playerId = buffer.read(1).toString("hex");
		this.mapDownloadPercent = buffer.read(1).readUIntLE(0, 1);
		this.slotStatus = buffer.read(1).toString("hex");
		this.isComputer = buffer.read(1).readUIntLE(0, 1) == 1;
		this.teamNumber = buffer.read(1).readUIntLE(0, 1);
		this.isObserver = this.teamNumber == 12;
		this.color = buffer.read(1).readUIntLE(0, 1);
		this.playerRaceFlags = buffer.read(1).toString("hex");
		this.computerStrength = buffer.read(1).readUIntLE(0, 1);
		this.playerHandicap = buffer.read(1).readUIntLE(0, 1);
	}
}

function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

class Utils {

	static fromHex (hex) {
		return parseInt(hex, 16);
	}

}



var parsers = {}

const NULL_STRING = '\0';

const constants = {
	GAME_SETTINGS : {
		GAME_SPEED : {
			SLOW : 0,
			NORMAL : 1,
			FAST : 2
		},
		OBSERVER : {
			OFF : 0,
			UNUSED : 1,
			OBS_ON_DEFEAT : 2,
			ON : 3
		},
		FIXED_TEAMS : {
			OFF : 0,
			UNUSED : 1,
			UNUSED_2 : 2,
			ON : 3
		}
	},
	PLAYER_RECORD : {
		LADDER_GAME : 8
	},
	GAME_TYPE : {
		UNKNOWN : 0,
		LADDER : 1,
		SCENARIO : 1,
		CUSTOM : 9,
		SINGLE_PLAYER : 0x1D,
		LADDER_TEAM : 0x20
	},
	PLAYER_TYPE : {
		GAME_HOST : 0,
		ADDITIONAL_PLAYERS : 0x16
	},
	SLOT_RECORD : {
		SLOT_STATUS : {
			EMPTY : 0x00,
			CLOSED : 0x01,
			USED : 0x02
		},
		COLOR : {
			RED : 0,
			BLUE : 1,
			CYAN : 2,
			PURPLE : 3,
			YELLOW : 4,
			ORANGE : 5,
			GREEN : 6,
			PINK : 7,
			GRAY : 8,
			LIGHT_BLUE : 9,
			DARK_GREEN : 10,
			BROWN : 11,
			OBSERVER : 12
		},
		PLAYER_RACE_FLAGS : {
			HUMAN : 0x01,
			ORC : 0x02,
			NIGHTELF : 0x04,
			UNDEAD : 0x08,
			RANDOM : 0x20,
			RACE_SELECTABLE : 0x40
		},
		COMPUTER_STRENGTH : {
			EASY : 0x00,
			NORMAL : 0x01,
			INSANE : 0x02
		},
	},
	GAME_START_RECORD : {
		SELECT_MODE : {
			TEAM_RACE_SELECTABLE : 0x00,
			TEAM_NOT_SELECTABLE : 0x01,
			TEAM_RACE_NOT_SELECTABLE : 0x03,
			RANDOM_RACE : 0x04,
			AUTOMATED_MATCH_MAKING : 0xCC
		}
	},
	BLOCK_TYPE : {
		LEAVE_GAME : 0x17,
		CHAT : 0x20
	},
	CHAT : {
		FLAGS : {
			DELAYED : 0x10,	
			NORMAL : 0x20
		} 
	}
}


parsers[constants.BLOCK_TYPE.CHAT] = function (buffer) {
	this.playerId = buffer.read(1).readUIntLE(0, 1);
	buffer.read(2); // bytes that follow
	this.flags = buffer.read(1).toString("hex");

	if (this.flags == constants.CHAT.FLAGS.NORMAL) {
		this.mode = buffer.read(4).toString("hex");
	}
	
}


var fs = require('fs');
var crc32 = require('js-crc').crc32;
const zlib = require('zlib');


var readable = fs.createReadStream("replay.w3g");

readable.on('readable', function() {
	var parser = new Parser(readable);

	parser.parse();
})
