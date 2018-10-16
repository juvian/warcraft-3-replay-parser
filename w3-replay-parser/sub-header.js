const constants = require('./constants');

class Subheader {

	constructor (parser) {
		var buffer = parser.read(parseInt((parser.header.firstDataBlock), 16) - parser.buffer.bytesRead);
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
		this.unknown = buffer.read(2); // unknown
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

module.exports = Subheader;