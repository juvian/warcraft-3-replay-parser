const constants = require('./constants');

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

module.exports = Block;