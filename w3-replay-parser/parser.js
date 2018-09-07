'use strict';

var fs = require('fs');
var crc32 = require('js-crc').crc32;
const zlib = require('zlib');
const constants = require('./constants');
var BlockReader = require('./block-reader');
var BufferWrapper = require('./buffer-wrapper');
var Header = require('./header');
var SubHeader = require('./sub-header');
var BlockParser = require('./block-parser');

class Parser {
	constructor(buffer, config = {}) {

		if (typeof buffer == 'string') {
			this.buffer = new BufferWrapper(fs.readFileSync(buffer));
		} else if (buffer instanceof Buffer) {
			this.buffer = new BufferWrapper(buffer);
		} else {
			throw Error("Invalid buffer, expected path to file or buffer of file")
		}

		this.config = Object.assign({
			parseActions: false,
			shouldParseBlocks: false,
			ignoreUnknown: false
		}, config);

		this.listeners = {}
		this.keepParsing = true;
		this.time = 0;
		this.players = {}
		this.playerSlots = []
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
			data.receivingPlayer = this.getPlayerSlot(data.receivingPlayerId)
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

		if (!this.keepParsing || !this.config.shouldParseBlocks) return;
		
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

	getPlayerSlot(playerSlot) {
		return this.playerSlots[playerSlot - 1].name;
	}

}


function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    	bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

const NULL_STRING = '\0';

module.exports = Parser
