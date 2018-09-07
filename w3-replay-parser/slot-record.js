const constants = require('./constants');

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

module.exports = SlotRecord;