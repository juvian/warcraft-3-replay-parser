const constants = require('./constants');
var SlotRecord = require('./slot-record');

class GameStartRecord {
	constructor (buffer) {
		if(buffer.read(1).toString("hex") != '19') throw new Error("invalid recordID"); 

		this.bytes = buffer.read(2).readUIntLE(0, 2);

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

module.exports = GameStartRecord;