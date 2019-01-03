const constants = require('./constants');

class Header {

	constructor (parser) {
		var buffer = parser.read(constants.HEADER_SIZE);

		parser.checkSumBuffer += buffer.toString('hex');

		var start = buffer.read(28).toString();

		if (start.indexOf('Warcraft III recorded game') != 0) throw new Error("Not a warcraft III replay file" + start);

		this.firstDataBlock = "0x" + buffer.read(4).readUIntLE(0, 3).toString(16);
		this.compressedSize = buffer.read(4).readUIntLE(0, 3);
		this.version = buffer.read(4).readUIntLE(0, 3);
		this.decompressedSize = buffer.read(4).readUIntLE(0, 3);
		this.blocks = buffer.read(4).readUIntLE(0, 3);

		parser.emitEvent(constants.EVENTS.PARSED.HEADER, this);
	}

}

module.exports = Header;