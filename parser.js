'use strict';

var fs = require('fs');
var crc32 = require('js-crc').crc32;
const zlib = require('zlib');


class Parser {


	constructor(buffer, parseActions = false, shouldParseBlocks = false, ignoreUnknown = false) {

		if (typeof buffer == 'string') {
			this.buffer = new BufferWrapper(fs.readFileSync(buffer));
		} else if (buffer instanceof Buffer) {
			this.buffer = new BufferWrapper(buffer);
		} else {
			throw Error("Invalid buffer, expected path to file or buffer of file")
		}

		this.listeners = {}
		this.parseActions = parseActions;
		this.keepParsing = true;
		this.time = 0;
		this.players = {}
		this.shouldParseBlocks = shouldParseBlocks;
		this.ignoreUnknown = ignoreUnknown;
	}

	parse () {
		this.checkSumBuffer = "";

		this.parseHeader();
		this.parseSubHeader();
		this.parseBlocks();

	}

	addEventListener(event, callback) {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(callback)
	}

	emitEventToListeners (event, data, realEvent) {
		if (this.listeners.hasOwnProperty(event)) {
			this.listeners[event].forEach(c => c(data, realEvent || event))
		}
	}

	emitEvent (event, data) {
			
		if (data.parser || data.buffer) {
			data = Object.assign({}, data)

			delete data.parser;
			delete data.buffer;
		}

		if (data.playerId) {
			data.player = this.getPlayer(data.playerId)
		}

		if (data.receivingPlayerId) {
			data.receivingPlayer = this.getPlayer(data.receivingPlayerId)
		}

		this.emitEventToListeners(event, data);
		this.emitEventToListeners("all", data, event);
	}

	stopParse () {
		this.keepParsing = false;
	}

	checksum (correctChecksum) {
		var checkSum = crc32(hexToBytes(this.checkSumBuffer));
		
		delete this.checkSumBuffer;

		if (correctChecksum != checkSum) throw new Error("invalid checksum");

	}

	parseHeader() {
		this.header = new Header(this);		
	}

	parseSubHeader () {
		if (!this.keepParsing) return;
		this.subHeader = new Subheader(this);
	}

	parseBlocks () {
		if (!this.keepParsing) return;

		var onDemandBuffer = new BufferWrapper(new Buffer(""), new BlockReader(this))

		this.startUpData = new StartupBlock(onDemandBuffer, this)

		if (!this.keepParsing || !this.shouldParseBlocks) return;
		
		new BlockParser(onDemandBuffer, this)
	}

	uncompress (buffer) {
		return zlib.inflateSync(buffer, {finishFlush: zlib.constants.Z_SYNC_FLUSH });
	}

	read (bytes) {
		return new BufferWrapper(this.buffer.read(bytes));
	}

	addTime(time) {
		this.time += time;
	}

	getTime () {
		var secs = Math.floor(this.time / 1000); 
		return ("0" + Math.floor(secs / 60)).slice(-2) +  ":" + ("0" + secs % 60).slice(-2);
	}

	getPlayer(playerId) {
		return this.players[playerId].name;
	}

}

class BlockReader {

	constructor (parser) {
		this.currentBlock = 0;
		this.parser = parser;
	}

	hasMoreData () {
		return this.currentBlock < this.parser.header.blocks;	
	}

	getMoreData () {
		this.currentBlock ++;

		var buffer = this.parser.read(8);

		var compressedSize = buffer.read(2).readUIntLE(0, 2);
		var uncompressedSize = buffer.read(2).readUIntLE(0, 2);
		var checksum = buffer.read(4).reverse().toString('hex');

		var compressedData = this.parser.read(compressedSize).buffer;
		var uncompressedData = this.uncompress(compressedData)

		return uncompressedData
	}

	uncompress (buffer) {
		return zlib.inflateSync(buffer, {finishFlush: zlib.constants.Z_SYNC_FLUSH });
	}

}

class EmptySource {
	constructor () {

	}

	hasMoreData() {
		return false;
	}
}

class BufferWrapper {

	constructor (buffer, source = new EmptySource()) {
		this.idx = 0;
		this.buffer = buffer;
		this.source = source;
		this.bytesRead = 0;
	}

	checkIfEnoughData (bytes) {
		if (this.readableLength() < bytes) {
			if (this.source.hasMoreData()) {
				this.buffer = Buffer.concat([this.buffer.slice(this.idx), this.source.getMoreData()])
				this.idx = 0;
				this.checkIfEnoughData(bytes);
			} else {
				throw Error("not enough bytes on buffer")
			}
		}
	}

	read (bytes) {
		this.checkIfEnoughData(bytes);
		this.idx += bytes;
		this.bytesRead += bytes;
		return this.buffer.slice(this.idx - bytes, this.idx);
	}

	peek (bytes) {
		this.checkIfEnoughData(bytes);
		return this.buffer.slice(this.idx, this.idx + bytes);
	}

	readUntil (byte, skipByte = 1) {
		var idx = this.buffer.indexOf(byte, this.idx, "utf-8");

		if (idx == -1) {
			this.checkIfEnoughData(this.readableLength() + 1);
			return this.readUntil(byte, skipByte);
		}

		var buffer  = this.read(idx - this.idx);

		if (skipByte) {
			this.idx += skipByte;
			this.bytesRead += skipByte;
		}

		return buffer;
	}

	toString (...args) {
		return this.buffer.toString.apply(this.buffer, arguments);
	}

	readableLength () {
		return this.buffer.length - this.idx;
	}

}

class Header {

	constructor (parser) {
		var buffer = parser.read(constants.HEADER_SIZE);

		parser.checkSumBuffer += buffer.toString('hex');

		if (buffer.read(28).toString().indexOf('Warcraft III recorded game') != 0) throw new Error("Not a replay file");

		this.firstDataBlock = "0x" + buffer.read(4).readUIntLE(0, 3).toString(16);
		this.compressedSize = buffer.read(4).readUIntLE(0, 3);
		this.version = buffer.read(4).readUIntLE(0, 3);
		this.decompressedSize = buffer.read(4).readUIntLE(0, 3);
		this.blocks = buffer.read(4).readUIntLE(0, 3);

		parser.emitEvent(constants.EVENTS.PARSED.HEADER, this);
	}

}

class Subheader {

	constructor (parser) {
		var buffer = parser.read(Utils.fromHex(parser.header.firstDataBlock) - parser.buffer.bytesRead);
		parser.checkSumBuffer += buffer.toString('hex').slice(0, -8) + '00000000';

		var headerVersion = parser.header.version;

		if (headerVersion == 0) {
			this.readV0(buffer);
		} else if (headerVersion == 1) {
			this.readV1(buffer);
		} else {
			throw new Error("Unknown header version :" + headerVersion)
		}

		parser.checksum(this.checksum);

		parser.emitEvent(constants.EVENTS.PARSED.SUBHEADER, this);
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

	constructor (buffer, parser) {
		this.buffer = buffer;
		this.parser = parser;
	}


	parseTimeSlot () {
		var buffer = this.buffer;

		var bytes = buffer.read(2).readUIntLE(0, 2);
		var timeIncrement = buffer.read(2).readUIntLE(0, 2);
		var actions = []

		var bytesRead = buffer.bytesRead;
		
		this.parser.addTime(timeIncrement);

		while (buffer.bytesRead - bytesRead < bytes - 2 && this.parser.keepParsing) {
			actions.push(new CommandBlock(buffer, this.parser));
		}

		if (buffer.bytesRead - bytesRead != bytes - 2) {
			console.log(actions, bytes, buffer.bytesRead - bytesRead)
			throw Error("Error parsing actions")
		}

		this.parser.emitEvent(constants.EVENTS.PARSED.TIME_SLOT, actions)
	}

	parseChat (buffer) {
		var buffer = this.buffer;

		this.playerId = buffer.read(1).readUIntLE(0, 1);
		var messageLength = buffer.read(2).readUIntLE(0, 2) - 1; // bytes that follow
		
		this.flags = buffer.read(1).readUIntLE(0, 1);

		if (this.flags == constants.CHAT.FLAGS.NORMAL) {
			this.mode = buffer.read(4).readUIntLE(0, 4);
			messageLength -= 4;
		}

		this.message = buffer.readUntil(NULL_STRING).toString();

		this.player = this.parser.getPlayer(this.playerId)
				
		this.parser.emitEvent(constants.EVENTS.PARSED.CHAT, this)

	}

	parseLeaveGame(buffer) {
		var buffer = this.buffer;

		var reason = buffer.read(2).readUIntLE(0, 2);

		if (this.reason == constants.LEAVE_GAME_REASON.CLOSED_BY_REMOTE_GAME) {
			this.reason = "Closed by remote game"
		} else if (this.reason == constants.LEAVE_GAME_REASON.CLOSED_BY_LOCAL_GAME) {
			this.reason = "Closed by local game"
		} else {
			this.reason = "Unknown: " + reason;
		}

		this.playerId = buffer.read(1).readUIntLE(0, 1);

		this.result = buffer.read(2).readUIntLE(0, 2);

		buffer.read(8); // unknown

		this.parser.emitEvent(constants.EVENTS.PARSED.LEFT_GAME, this)

	}

}

class BlockParser {
	
	constructor (buffer, parser) {
		this.parser = parser;
		this.parse(buffer)
	}	

	parse (buffer) {
		while (this.parser.keepParsing) {
			this.type = Utils.fromHex(buffer.read(1).toString("hex"));

			if (this.type == 0) return;
			
			var block = new Block(buffer, this.parser);

			if ([constants.BLOCK_TYPE.FIRST, constants.BLOCK_TYPE.SECOND, constants.BLOCK_TYPE.THIRD].includes(this.type)) {
				assert(buffer.peek(4).toString("hex") == '01000000', 'Invalid start blocks : ' + buffer.read(4).toString("hex"));
			} else if ([constants.BLOCK_TYPE.TIME_SLOT_OLD, constants.BLOCK_TYPE.TIME_SLOT].includes(this.type)) {
				block.parseTimeSlot();
			} else if (this.type == constants.BLOCK_TYPE.CHAT) {
				block.parseChat();
			} else if (this.type == constants.BLOCK_TYPE.CHECKSUM) {
				var bytesThatFollow = buffer.read(1).readUIntLE(0, 1);
				buffer.read(bytesThatFollow); // unknown
			} else if (this.type == constants.BLOCK_TYPE.LEAVE_GAME) {
				block.parseLeaveGame();
			} else {
				throw Error("unknow how to parse " + this.type)
			}

			this.parser.emitEvent(constants.EVENTS.PARSED.BLOCK, this.type)
		}		
	}

}


class StartupBlock {
	constructor (buffer, parser) {
		this.parse(buffer, parser)
	}

	parse (buffer, parser) {
		buffer.read(4); // unknown
		this.playerRecord = new PlayerRecord(buffer, parser);

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

		this.parsePlayers(buffer, parser);
		this.gameStartRecord = new GameStartRecord(buffer);

		parser.emitEvent(constants.EVENTS.PARSED.STARTUP_BLOCK, this)

	}

	parsePlayers (buffer, parser) {
		this.players = [];

		while (buffer.peek(1).readUIntLE(0, 1) == constants.PLAYER_TYPE.ADDITIONAL_PLAYERS) {
			this.players.push(new PlayerRecord(buffer, parser));
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

class PlayerRecord {

	constructor (buffer, parser) {
		this.type = buffer.read(1).toString("hex");
		this.id = buffer.read(1).readUIntLE(0, 1);

		this.name = buffer.readUntil(NULL_STRING).toString();

		this.additionalDataSize = buffer.read(1).readUIntLE(0, 1);

		if (this.additionalDataSize == constants.PLAYER_RECORD.LADDER_GAME) { 
			this.runTime = buffer.read(4).readUIntLE(0, 3);
			this.race = buffer.read(4).toString('hex');
		} else {
			buffer.read(this.additionalDataSize); // null
		}

		parser.players[this.id] = this;

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


class CommandBlock {

	constructor(buffer, parser) {
		this.playerId = buffer.read(1).readUIntLE(0, 1);
		this.length = buffer.read(2).readUIntLE(0, 2);

		var bytesRead = buffer.bytesRead;

		if (parser.parseActions == false) {
			buffer.read(this.length);
			return;
		}

		while (buffer.bytesRead - bytesRead  < this.length && parser.keepParsing) {
			var actionId = buffer.read(1).readUIntLE(0, 1);
			var action = new Action(buffer, parser, this.playerId);
			action.actionId = actionId;

			switch (actionId) {
				case constants.ACTIONS.PAUSE:
				case constants.ACTIONS.RESUME:
				case constants.ACTIONS.INCREASE_GAME_SPEED:
				case constants.ACTIONS.DECREASE_GAME_SPEED:
				case constants.ACTIONS.CHEAT_THE_DUDE_ABIDES:
				case constants.ACTIONS.CHEAT_SOMEBODY_SET_US_UP_THE_BOMB:
				case constants.ACTIONS.CHEAT_WARPTEN:
				case constants.ACTIONS.CHEAT_IOCAINE_POWDER:
				case constants.ACTIONS.CHEAT_POINT_BREAK:
				case constants.ACTIONS.CHEAT_WHOS_YOUR_DADDY:
				case constants.ACTIONS.CHEAT_THERE_IS_NO_SPOON:
				case constants.ACTIONS.CHEAT_STRENGTH_AND_HONOR:
				case constants.ACTIONS.CHEAT_IT_VEXES_ME:
				case constants.ACTIONS.CHEAT_WHO_IS_JOHN_GALT:
				case constants.ACTIONS.CHEAT_I_SEE_DEAD_PEOPLE:
				case constants.ACTIONS.CHEAT_SYNERGY:
				case constants.ACTIONS.CHEAT_SHARP_AND_SHINY:
				case constants.ACTIONS.CHEAT_ALL_YOUR_BASE_ARE_BELONG_TO_US:
				case constants.ACTIONS.PRE_SUBSELECTION:
				case constants.ACTIONS.ESC_PRESSED:
				case constants.ACTIONS.ENTER_CHOOSE_HERO_SKILL_SUBMENU:
				case constants.ACTIONS.ENTER_CHOOSE_BUILDING_SUBMENU:
					break;
				case constants.ACTIONS.SET_GAME_SPEED:
				case constants.ACTIONS.UNKNOWN_0X75:
					buffer.read(1);
					break;
				case constants.ACTIONS.SAVE_GAME:
					buffer.readUntil(NULL_STRING);
					break;
				case constants.ACTIONS.CHEAT_KEYER_SOZE:				
				case constants.ACTIONS.CHEAT_LEAF_IT_TO_ME:				
				case constants.ACTIONS.CHEAT_GREED_IS_GOOD:				
				case constants.ACTIONS.REMOVE_UNIT_FROM_BUILDING_QUEUE:
				case constants.ACTIONS.CHANGE_ALLY_OPTIONS:
					action.data = buffer.read(5);
					break;
				case constants.ACTIONS.UNIT_ABILITY:
					action.parseUnitAbility()
					break;
				case constants.ACTIONS.UNIT_ABILITY_WITH_POS:
					action.data = buffer.read(22);
					break;	
				case constants.ACTIONS.UNIT_ABILITY_WITH_POS_AND_TARGET:
					action.parseUnitAbilityWithPosAndTarget()
					break;
				case constants.ACTIONS.GIVE_DROP_ITEM:
					action.parseGiveDropItem();
					break;
				case constants.ACTIONS.UNIT_ABILITY_2_POS_AND_2_ITEM:
					action.data = buffer.read(43);
					break;
				case constants.ACTIONS.CHANGE_SELECTION:
					action.parseChangeSelection();
					break;
				case constants.ACTIONS.ASSIGN_GROUP:
					action.parseAssignGroup();
					break;
				case constants.ACTIONS.SELECT_SUBGROUP:
				case constants.ACTIONS.SCENARIO_TRIGGER:
				case constants.ACTIONS.MINIMAP_SIGNAL:
					action.data = buffer.read(12);
					break;
				case constants.ACTIONS.UNKNOWN_0X1B:
					action.data = buffer.read(9);
					break;
				case constants.ACTIONS.TRANSFER_RESOURCES:
					action.parseTransferResources();
					break;
				case constants.ACTIONS.SELECT_GROUND_ITEM:
					action.parseSelectGroundItem();
					break;
				case constants.ACTIONS.UNKNOWN_0X21:
				case constants.ACTIONS.CANCEL_HERO_REVIVAL:
					action.data = buffer.read(8);
					break;			
				case constants.ACTIONS.CHEAT_DAYLIGHT_SAVINGS:
				case constants.ACTIONS.SAVE_GAME_FINISHED:				
					action.data = buffer.read(4);
					break;
				case constants.ACTIONS.MAP_TRIGGER_CHAT_COMMAND:
					action.parseMapTriggerChatCommand();	
					break;
				case constants.ACTIONS.CONTINUE_GAME_BLOCK_A:
				case constants.ACTIONS.CONTINUE_GAME_BLOCK_B:
					action.data = buffer.read(16);
					break;	
				case constants.ACTIONS.SELECT_GROUP:
					action.data = buffer.read(2);
					break;
				case constants.ACTIONS.SYNC_INTEGER:
				case constants.ACTIONS.UNKNOWN_0X6D:
					action.parseSyncInteger();
					break;	
				default:

					action.data = buffer.peek(this.length - (buffer.bytesRead - bytesRead));

					parser.emitEvent(constants.EVENTS.ACTIONS.UNKNOWN, action);

					if (parser.ignoreUnknown) {
						buffer.read(this.length - (buffer.bytesRead - bytesRead));
					} else {
						throw Error("unknown actions : " + actionId);	
					}
			}

			parser.emitEvent(constants.EVENTS.PARSED.ACTION, action)
		}
	}
}


class Action {
	constructor (buffer, parser, playerId) {
		this.buffer = buffer;
		this.parser = parser;
		this.playerId = playerId;
	}

	parseGiveDropItem () {	
		var buffer = this.buffer;

		this.abilityFlags = new AbilityFlags(buffer);
		this.itemId = this.buffer.read(4).toString("hex");
		
		buffer.read(8); // unknown
		
		this.targetX = buffer.read(4).toString("hex");
		this.targetY = buffer.read(4).toString("hex");

		this.targetObjectId1 = buffer.read(4).toString("hex");
		this.targetObjectId2 = buffer.read(4).toString("hex");

		this.itemObjectId1 = buffer.read(4).toString("hex");
		this.itemObjectId2 = buffer.read(4).toString("hex");

		this.parser.emitEvent(constants.EVENTS.ACTIONS.ITEM, this)
		
	}

	parseChangeSelection () {
		this.selectMode = this.buffer.read(1).toString("hex");
		this.parseGroupInfo();

		this.parser.emitEvent(constants.EVENTS.ACTIONS.CHANGE_SELECTION, this)

	}

	parseAssignGroup () {
		this.groupNumber = this.buffer.read(1).readUIntLE(0, 1);
		this.parseGroupInfo(); 

		this.parser.emitEvent(constants.EVENTS.ACTIONS.ASSIGN_GROUP, this)
	}

	parseGroupInfo () {
		this.numberOfUnits = this.buffer.read(2).readUIntLE(0, 2);

		this.objectIds = [];

		for (var i = 0; i < this.numberOfUnits; i++) {
			this.objectIds.push({objectId1: this.buffer.read(4).toString("hex"), objectId2 : this.buffer.read(4).toString("hex")})
		}
	}

	parseMapTriggerChatCommand () {
		this.buffer.read(8); // unknown
		this.chatCommand = this.buffer.readUntil(NULL_STRING).toString();

		this.parser.emitEvent(constants.EVENTS.ACTIONS.MAP_TRIGGER_CHAT_COMMAND, this)
	}

	parseUnitAbility () {
		this.abilityFlags = new AbilityFlags(this.buffer)

		this.itemId = this.buffer.read(4)

		this.buffer.read(8) // unknown
		
		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY, this)
	}

	parseSelectGroundItem () {
		this.abilityFlags = this.buffer.read(1) //new AbilityFlags(this.buffer)
		
		this.itemObjectId1 = this.buffer.read(4).toString("hex");
		this.itemObjectId2 = this.buffer.read(4).toString("hex");	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.SELECT_GROUND_ITEM, this)
	}

	parseUnitAbilityWithPosAndTarget () {
		this.abilityFlags = new AbilityFlags(this.buffer)
		this.itemId = this.buffer.read(4)

		this.buffer.read(8)	; // unknown
		
		this.targetX = this.buffer.read(4).readUIntLE(0, 4)	
		this.targetY = this.buffer.read(4).readUIntLE(0, 4)	


		this.objectId1 = this.buffer.read(4).readUIntLE(0, 4)	
		this.objectId2 = this.buffer.read(4).readUIntLE(0, 4)	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY_WITH_POS_AND_TARGET, this)

	}

	parseSyncInteger () {
		this.name = this.buffer.readUntil(NULL_STRING).toString();
		this.checksum = this.buffer.readUntil(NULL_STRING)
		this.secondChecksum = this.buffer.readUntil(NULL_STRING)
		this.weakChecksum = this.buffer.read(4)
	}

	parseTransferResources () {
		this.receivingPlayerId = this.buffer.read(1).readUIntLE(0, 1);
		this.gold = this.buffer.read(4).readUIntLE(0, 4);
		this.lumber = this.buffer.read(4).readUIntLE(0, 4);
	}

}

class AbilityFlags {
	constructor (buffer) {
		this.flags = buffer.read(2);
	}
}


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
		CHAT : 0x20,
		FIRST : 0x1a,
		SECOND : 0x1b,
		THIRD : 0x1c,
		TIME_SLOT_OLD : 0x1E,
		TIME_SLOT : 0x1F,
		CHECKSUM : 0x22
	},
	CHAT : {
		FLAGS : {
			DELAYED : 0x10,	
			NORMAL : 0x20,
			START : 0x1A
		},
		MODES : {
			ALL: 0x00,
			ALLIES: 0x01,
			OBSERVER: 0x02,
			PLAYER1: 0x03,
			PLAYER2: 0x04,
			PLAYER3: 0x05,
			PLAYER4: 0x06,
			PLAYER5: 0x07,
			PLAYER6: 0x08,
			PLAYER7: 0x09,
			PLAYER8: 0x0A,
			PLAYER9: 0x0B,
			PLAYER10: 0x0C,
			PLAYER11: 0x0D,
			PLAYER12: 0x0E,
		} 
	},
	ACTIONS : {
		PAUSE : 0x01,
		RESUME : 0x02,
		SET_GAME_SPEED : 0x03,
		INCREASE_GAME_SPEED : 0x04,
		DECREASE_GAME_SPEED : 0x05,
		SAVE_GAME : 0x06,
		SAVE_GAME_FINISHED : 0x07,
		UNIT_ABILITY : 0x10,
		UNIT_ABILITY_WITH_POS : 0x11,
		UNIT_ABILITY_WITH_POS_AND_TARGET : 0x12,
		GIVE_DROP_ITEM : 0x13,
		UNIT_ABILITY_2_POS_AND_2_ITEM : 0x14,
		CHANGE_SELECTION : 0x16,
		ASSIGN_GROUP : 0x17,
		SELECT_GROUP : 0x18,
		SELECT_SUBGROUP : 0x19,
		PRE_SUBSELECTION : 0x1A,
		UNKNOWN_0X1B : 0x1B,
		SELECT_GROUND_ITEM : 0x1C,
		CANCEL_HERO_REVIVAL : 0x1D,
		REMOVE_UNIT_FROM_BUILDING_QUEUE : 0x1E,
		UNKNOWN_0X21 : 0X21,
		CHEAT_THE_DUDE_ABIDES : 0X20,
		CHEAT_SOMEBODY_SET_US_UP_THE_BOMB : 0X22,
		CHEAT_WARPTEN : 0X23,
		CHEAT_IOCAINE_POWDER : 0X24,
		CHEAT_POINT_BREAK: 0X25,
		CHEAT_WHOS_YOUR_DADDY : 0X26,
		CHEAT_KEYER_SOZE : 0X27,
		CHEAT_LEAF_IT_TO_ME : 0X28,
		CHEAT_THERE_IS_NO_SPOON : 0X29,
		CHEAT_STRENGTH_AND_HONOR : 0X2A,
		CHEAT_IT_VEXES_ME : 0X2B,
		CHEAT_WHO_IS_JOHN_GALT : 0X2C,
		CHEAT_GREED_IS_GOOD : 0X2D,
		CHEAT_DAYLIGHT_SAVINGS : 0X2E,
		CHEAT_I_SEE_DEAD_PEOPLE : 0X2F,
		CHEAT_SYNERGY : 0X30,
		CHEAT_SHARP_AND_SHINY : 0X31,
		CHEAT_ALL_YOUR_BASE_ARE_BELONG_TO_US : 0X32,
		CHANGE_ALLY_OPTIONS : 0X50,
		TRANSFER_RESOURCES : 0X51,
		MAP_TRIGGER_CHAT_COMMAND : 0X60,
		ESC_PRESSED : 0X61,
		SCENARIO_TRIGGER : 0X62,
		ENTER_CHOOSE_HERO_SKILL_SUBMENU : 0X66,
		ENTER_CHOOSE_BUILDING_SUBMENU : 0X67,
		MINIMAP_SIGNAL : 0X68,
		CONTINUE_GAME_BLOCK_B : 0X69,
		CONTINUE_GAME_BLOCK_A : 0X6A,
		UNKNOWN_0X75 : 0X75,
		SYNC_INTEGER: 0x6B,
		UNKNOWN_0X6D: 0x6D 
	},
	LEAVE_GAME_REASON: {
		CLOSED_BY_REMOTE_GAME: 0x01,
		CLOSED_BY_LOCAL_GAME: 0x0C
	},
	HEADER_SIZE: 48,
	EVENTS: {
		PARSED: {
			HEADER: "parsed-header",
			SUBHEADER: "parsed-sub-header",
			STARTUP_BLOCK: "parsed-startup-block",
			TIME_SLOT: "parsed-time-slot",
			BLOCK: "parsed-block",
			ACTION: "parsed-action",
			CHAT: "parsed-chat",
			LEFT_GAME: "parsed-left-game"
		},
		ACTIONS: {
			MAP_TRIGGER_CHAT_COMMAND: "map-trigger-chat-command",
			ITEM: "item",
			CHANGE_SELECTION: "change-selection",
			SELECT_GROUP: "select-group",
			UNIT_ABILITY: "unit-ability",
			SELECT_GROUND_ITEM: "select-ground-item",
			UNIT_ABILITY_WITH_POS_AND_TARGET: "unit-ability-with-pos-and-target",
			UNKNOWN: "unknown"
		}
	}
}

function assert(bool, message) {
	if (!bool) throw Error(message);
}


module.exports = {
	parser: Parser,
	constants: constants
}

