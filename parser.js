'use strict';
class Parser {


	constructor(stream) {
		this.setStream(stream);
	}

	setStream (data) {
		this.stream = data;
		this.offset = 0;
	}

	parse () {
		this.checkSumBuffer = "";

		this.parseHeader();
		this.parseSubHeader();
		this.checksum();
		this.parseDataBlocks();

	}

	checksum () {
		var checkSum = crc32(hexToBytes(this.checkSumBuffer));
		
		delete this.checkSumBuffer;

		if (this.subHeader.checksum != checkSum) throw new Exception("invalid checksum");

	}

	readUntil(offset) {
		if (this.offset >= Utils.fromHex(offset)) throw new Exception("invalid offset, current is at " + this.offset +  " and " + offset + " was requested.");
		
		var offset = Utils.fromHex(offset) - this.offset;
		var stream = this.stream.read(offset);
		
		this.offset += offset;	
		return stream;
	}

	parseHeader() {

		var buffer = this.readUntil("0x0030");

		this.checkSumBuffer += buffer.toString('hex');
		this.header = new Header(buffer);

		console.log(this.header);
		
	}

	parseSubHeader () {
		if (!this.header) throw new Exception("header has to be read before subheader");

		var buffer = this.readUntil(this.header.firstDataBlock);

		this.checkSumBuffer += buffer.toString('hex').slice(0, -8) + '00000000';
		this.subHeader = new Subheader(buffer, this.header.version);

		console.log(this.subHeader)		
	}

	parseDataBlocks () {
		if (!this.subHeader) throw new Exception("subheader has to be read before datablocks");

		for (var i = 0; i < this.header.blocks && i < 1; i++) {
			this.parseDataBlock();
		}
	}

	parseDataBlock () {
		var buffer = this.stream.read(8);
		this.offset += 8;

		var block = new Block(buffer);
		buffer = this.stream.read(block.compressedSize);

		block.uncompress(buffer);
	}

}

class Header {

	constructor (buffer) {
		this.firstDataBlock = "0x" + buffer.slice("0x001c", "0x0020").readUIntLE(0, 3).toString(16);
		this.compressedSize = buffer.slice("0x0020", "0x0024").readUIntLE(0, 3);
		this.version = buffer.slice("0x0024", "0x0028").readUIntLE(0, 3);
		this.decompressedSize = buffer.slice("0x0028", "0x002c").readUIntLE(0, 3);
		this.blocks = buffer.slice("0x002c", "0x0030").readUIntLE(0, 3);
	}

}

class Subheader {

	constructor (buffer, headerVersion) {
		if (headerVersion == 0) {
			this.readV0(buffer);
		} else if (headerVersion == 1) {
			this.readV1(buffer);
		} else {
			throw new Exception("Unknown header version :" + headerVersion)
		}
	}

	readV0 (buffer) {
		this.versionNumber = buffer.slice("0x0002", "0x0004").toString();
		this.buildNumber = buffer.slice("0x0004", "0x0006").toString();
		this.flags = buffer.slice("0x0006", "0x0008").toString();
		this.replayLength = buffer.slice("0x0008", "0x000C").readUIntLE(0, 3);
		this.checksum = buffer.slice("0x000c", "0x0010").reverse().toString('hex');
		this.singlePlayer = this.flags == "0000";
	}

	readV1 (buffer) {
		console.log(buffer.slice("0x000A", "0x000C"));
		this.gameVersion = buffer.slice("0x0000", "0x0004").reverse().toString();
		this.versionNumber = "1." + buffer.slice("0x0004", "0x0008").readUIntLE(0, 3);
		this.buildNumber = buffer.slice("0x0008", "0x0010").readUIntLE(0, 2);
		this.flags = buffer.slice("0x000A", "0x000C").toString('hex').match(/.{2}/g).reverse().join("");
		this.replayLength = buffer.slice("0x000C", "0x0010").readUIntLE(0, 3);
		this.checksum = buffer.slice("0x0010", "0x0014").reverse().toString('hex');
		this.singlePlayer = this.flags == "0000";
	}

}

class Block {

	constructor (buffer) {
		this.compressedSize = buffer.slice("0x0000", "0x0002").readUIntLE(0, 2);
		this.uncompressedSize = buffer.slice("0x0002", "0x0004").readUIntLE(0, 2);
		this.checksum = buffer.slice("0x0004", "0x0008").reverse().toString('hex');;
	}

	uncompress (buffer) {
		var decompressed = zlib.inflateSync(buffer, {finishFlush: zlib.constants.Z_SYNC_FLUSH });
		
		this.unknown = decompressed.slice("0x0000", "0x0004");
		this.playerRecord = new PlayerRecord(decompressed.slice("0x0004"));
		
		var gameNameIdx = decompressed.indexOf(NULL_STRING, 4 + this.playerRecord.endIndex);
		this.gameName = decompressed.slice(4 + this.playerRecord.endIndex, gameNameIdx).toString();

		var encoded = decompressed.slice(gameNameIdx + 2, decompressed.indexOf(NULL_STRING, gameNameIdx + 2));
		var decoded = this.decode(encoded);

		console.log(this, decoded, decoded.length)
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
		return decoded;
	}

}

//H  àà¢ÉµÍMaps\Download\eden rpg 2.5c eng.w3x Justme_Hostbot  ¤àD­àÙbÒH|¢

class PlayerRecord {

	constructor (buffer) {
		this.type = buffer.slice("0x0000", "0x0001").toString("hex");
		this.id = buffer.slice("0x0001", "0x0002").readUIntLE(0, 1);
		var playerIdx = buffer.indexOf(NULL_STRING, 2);

		this.name = buffer.slice("0x0002", playerIdx).toString();
		this.additionalDataSize = buffer.slice(playerIdx + 1, playerIdx + 2).readUIntLE(0, 1);

		if (this.additionalDataSize == LADDER_GAME) { 
			this.runTime = buffer.slice(playerIdx + 2, playerIdx + 6).readUIntLE(0, 3);
			this.race = buffer.slice(playerIdx + 6, playerIdx + 10).toString('hex');
		}

		this.endIndex = playerIdx + 2 + this.additionalDataSize;

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

const LADDER_GAME = 8;
const NULL_STRING = '\0';

var fs = require('fs');
var crc32 = require('js-crc').crc32;
const zlib = require('zlib');


var readable = fs.createReadStream("replay.w3g");

readable.on('readable', function() {
	var parser = new Parser(readable);

	parser.parse();
})
