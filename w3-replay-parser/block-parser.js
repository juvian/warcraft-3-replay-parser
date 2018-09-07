const constants = require('./constants');

class BlockParser {
	
	constructor (buffer, parser) {
		this.parser = parser;
		this.parse(buffer)
	}	

	parse (buffer) {
		while (this.parser.keepParsing) {
			this.type = parseInt((buffer.read(1).toString("hex")), 16);

			if (this.type == 0) return;
			
			var block = new Block(buffer, this.parser);

			if ([constants.BLOCK_TYPE.FIRST, constants.BLOCK_TYPE.SECOND, constants.BLOCK_TYPE.THIRD].includes(this.type)) {
				if(buffer.peek(4).toString("hex") != '01000000') throw Error('Invalid start blocks : ' + buffer.read(4).toString("hex"));
			} else if ([constants.BLOCK_TYPE.TIME_SLOT_OLD, constants.BLOCK_TYPE.TIME_SLOT].includes(this.type)) {
				block.parseTimeSlot();
			} else if (this.type == constants.BLOCK_TYPE.CHAT) {
				block.parseChat();
			} else if (this.type == constants.BLOCK_TYPE.CHECKSUM) {
				var bytesThatFollow = buffer.read(1).readUIntLE(0, 1);
				this.parser.emitEvent(constants.EVENTS.PARSED.CHECKSUM, buffer.read(bytesThatFollow));
			} else if (this.type == constants.BLOCK_TYPE.LEAVE_GAME) {
				block.parseLeaveGame();
			} else {
				throw Error("unknow how to parse " + this.type)
			}

			this.parser.emitEvent(constants.EVENTS.PARSED.BLOCK, this.type)
		}		
	}
}

module.exports = BlockParser;