const constants = require('./constants');

class Action {
	constructor (buffer, parser, playerId) {
		this.buffer = buffer;
		this.parser = parser;
		this.playerId = playerId;
	}

	parseGiveDropItem () {	
		var buffer = this.buffer;

		this.abilityFlags = this.buffer.read(2);
		this.itemId = this.buffer.read(4).toString("hex");
		
		this.unknown = buffer.read(8);
		
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

		this.parser.emitEvent(constants.EVENTS.ACTIONS.GROUP_INFO, this)
	}

	parseMapTriggerChatCommand () {
		this.unknown = this.buffer.read(8); 
		this.chatCommand = this.buffer.readUntil(constants.NULL_STRING).toString();

		this.parser.emitEvent(constants.EVENTS.ACTIONS.MAP_TRIGGER_CHAT_COMMAND, this)
	}

	parseUnitAbility () {
		this.abilityFlags = this.buffer.read(2)

		this.itemId = this.buffer.read(4)

		this.unknown = this.buffer.read(8)
		
		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY, this)
	}

	parseSelectGroundItem () {
		this.abilityFlags = this.buffer.read(1)
		
		this.itemObjectId1 = this.buffer.read(4).toString("hex");
		this.itemObjectId2 = this.buffer.read(4).toString("hex");	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.SELECT_GROUND_ITEM, this)
	}

	parseUnitAbilityWithPosAndTarget () {
		this.abilityFlags =this.buffer.read(2)
		this.itemId = this.buffer.read(4)

		this.unknown = this.buffer.read(8);
		
		this.targetX = this.buffer.read(4).readUIntLE(0, 4)	
		this.targetY = this.buffer.read(4).readUIntLE(0, 4)	


		this.objectId1 = this.buffer.read(4).readUIntLE(0, 4)	
		this.objectId2 = this.buffer.read(4).readUIntLE(0, 4)	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY_WITH_POS_AND_TARGET, this)

	}

	parseUnitAbilityWithPosAndItem () {
		this.abilityFlags = this.buffer.read(2)
		
		this.A = {}
		this.B = {}

		this.A.itemId = this.buffer.read(4)

		this.unknown = this.buffer.read(8);
		
		this.A.targetX = this.buffer.read(4).readUIntLE(0, 4)	
		this.A.targetY = this.buffer.read(4).readUIntLE(0, 4)	
		
		this.unknown = this.buffer.read(9);

		this.B.itemId = this.buffer.read(4)

		this.B.targetX = this.buffer.read(4).readUIntLE(0, 4)	
		this.B.targetY = this.buffer.read(4).readUIntLE(0, 4)	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY_WITH_POS_AND_ITEM, this)

	}

	parseUnitAbilityWithPos () {
		this.abilityFlags = this.buffer.read(2)
		this.itemId = this.buffer.read(4)

		this.unknown = this.buffer.read(8);
		
		this.targetX = this.buffer.read(4).readUIntLE(0, 4)	
		this.targetY = this.buffer.read(4).readUIntLE(0, 4)	

		this.parser.emitEvent(constants.EVENTS.ACTIONS.UNIT_ABILITY_WITH_POS, this)

	}

	parseSyncInteger () {
		this.name = this.buffer.readUntil(constants.NULL_STRING).toString();
		this.checksum = this.buffer.readUntil(constants.NULL_STRING)
		this.secondChecksum = this.buffer.readUntil(constants.NULL_STRING)
		this.weakChecksum = this.buffer.read(4)

		this.parser.emitEvent(constants.EVENTS.ACTIONS.SYNC_INTEGER, this)
	}

	parseTransferResources () {
		this.receivingPlayerId = this.buffer.read(1).readUIntLE(0, 1);
		this.gold = this.buffer.read(4).readUIntLE(0, 4);
		this.lumber = this.buffer.read(4).readUIntLE(0, 4);

		this.parser.emitEvent(constants.EVENTS.ACTIONS.TRANSFER_RESOURCES, this)
	}

	parseSelectSubgroup () {
		this.itemId = this.buffer.read(4)

		this.objectId1 = this.buffer.read(4).readUIntLE(0, 4)	
		this.objectId2 = this.buffer.read(4).readUIntLE(0, 4)	
	
		this.parser.emitEvent(constants.EVENTS.ACTIONS.SELECT_SUBGROUP, this)
	}

}

module.exports = Action;