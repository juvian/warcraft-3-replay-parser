const constants = require('./constants');

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
			this.additionalData = buffer.read(this.additionalDataSize);
		}

		this.unknown = buffer.read(4);

		parser.players[this.id] = this;
		parser.playerSlots.push(this.id);

	}
}

module.exports = PlayerRecord;