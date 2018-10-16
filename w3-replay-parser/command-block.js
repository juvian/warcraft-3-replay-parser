const constants = require('./constants');
var Action = require('./action');

class CommandBlock {

	constructor(buffer, parser) {
		this.playerId = buffer.read(1).readUIntLE(0, 1);
		this.length = buffer.read(2).readUIntLE(0, 2);

		var bytesRead = buffer.bytesRead;

		if (parser.config.parseActions == false) {
			buffer.read(this.length);
			return;
		}

		while (buffer.bytesRead - bytesRead  < this.length && parser.keepParsing) {
			var actionId = buffer.read(1).readUIntLE(0, 1);
			var action = new Action(buffer, parser, this.playerId);
			action.actionId = actionId;

			switch (actionId) {
				case constants.ACTIONS.PAUSE:
				case constants.ACTIONS.RESUME:
				case constants.ACTIONS.INCREASE_GAME_SPEED:
				case constants.ACTIONS.DECREASE_GAME_SPEED:
				case constants.ACTIONS.CHEAT_THE_DUDE_ABIDES:
				case constants.ACTIONS.CHEAT_SOMEBODY_SET_US_UP_THE_BOMB:
				case constants.ACTIONS.CHEAT_WARPTEN:
				case constants.ACTIONS.CHEAT_IOCAINE_POWDER:
				case constants.ACTIONS.CHEAT_POINT_BREAK:
				case constants.ACTIONS.CHEAT_WHOS_YOUR_DADDY:
				case constants.ACTIONS.CHEAT_THERE_IS_NO_SPOON:
				case constants.ACTIONS.CHEAT_STRENGTH_AND_HONOR:
				case constants.ACTIONS.CHEAT_IT_VEXES_ME:
				case constants.ACTIONS.CHEAT_WHO_IS_JOHN_GALT:
				case constants.ACTIONS.CHEAT_I_SEE_DEAD_PEOPLE:
				case constants.ACTIONS.CHEAT_SYNERGY:
				case constants.ACTIONS.CHEAT_SHARP_AND_SHINY:
				case constants.ACTIONS.CHEAT_ALL_YOUR_BASE_ARE_BELONG_TO_US:
				case constants.ACTIONS.PRE_SUBSELECTION:
				case constants.ACTIONS.ESC_PRESSED:
				case constants.ACTIONS.ENTER_CHOOSE_HERO_SKILL_SUBMENU:
				case constants.ACTIONS.ENTER_CHOOSE_BUILDING_SUBMENU:
					break;
				case constants.ACTIONS.SET_GAME_SPEED:
				case constants.ACTIONS.UNKNOWN_0X75:
					buffer.read(1);
					break;
				case constants.ACTIONS.SAVE_GAME:
					buffer.readUntil(constants.NULL_STRING);
					break;
				case constants.ACTIONS.CHEAT_KEYER_SOZE:				
				case constants.ACTIONS.CHEAT_LEAF_IT_TO_ME:				
				case constants.ACTIONS.CHEAT_GREED_IS_GOOD:				
				case constants.ACTIONS.REMOVE_UNIT_FROM_BUILDING_QUEUE:
				case constants.ACTIONS.CHANGE_ALLY_OPTIONS:
					action.data = buffer.read(5);
					break;
				case constants.ACTIONS.UNIT_ABILITY:
					action.parseUnitAbility()
					break;
				case constants.ACTIONS.UNIT_ABILITY_WITH_POS:
					action.parseUnitAbilityWithPos();
					break;	
				case constants.ACTIONS.UNIT_ABILITY_WITH_POS_AND_TARGET:
					action.parseUnitAbilityWithPosAndTarget()
					break;
				case constants.ACTIONS.GIVE_DROP_ITEM:
					action.parseGiveDropItem();
					break;
				case constants.ACTIONS.UNIT_ABILITY_2_POS_AND_2_ITEM:
					action.parseUnitAbilityWithPosAndItem()
					break;
				case constants.ACTIONS.CHANGE_SELECTION:
					action.parseChangeSelection();
					break;
				case constants.ACTIONS.ASSIGN_GROUP:
					action.parseAssignGroup();
					break;
				case constants.ACTIONS.SELECT_SUBGROUP:
					action.parseSelectSubgroup();
					break;
				case constants.ACTIONS.SCENARIO_TRIGGER:
				case constants.ACTIONS.MINIMAP_SIGNAL:
					action.data = buffer.read(12);
					break;
				case constants.ACTIONS.UNKNOWN_0X1B:
					action.data = buffer.read(9);
					break;
				case constants.ACTIONS.TRANSFER_RESOURCES:
					action.parseTransferResources();
					break;
				case constants.ACTIONS.SELECT_GROUND_ITEM:
					action.parseSelectGroundItem();
					break;
				case constants.ACTIONS.UNKNOWN_0X21:
				case constants.ACTIONS.CANCEL_HERO_REVIVAL:
					action.data = buffer.read(8);
					break;			
				case constants.ACTIONS.CHEAT_DAYLIGHT_SAVINGS:
				case constants.ACTIONS.SAVE_GAME_FINISHED:				
					action.data = buffer.read(4);
					break;
				case constants.ACTIONS.MAP_TRIGGER_CHAT_COMMAND:
					action.parseMapTriggerChatCommand();	
					break;
				case constants.ACTIONS.CONTINUE_GAME_BLOCK_A:
				case constants.ACTIONS.CONTINUE_GAME_BLOCK_B:
					action.data = buffer.read(16);
					break;	
				case constants.ACTIONS.SELECT_GROUP:
					action.data = buffer.read(2);
					break;
				case constants.ACTIONS.SYNC_INTEGER:
				case constants.ACTIONS.UNKNOWN_0X6D:
					action.parseSyncInteger();
					break;	
				default:

					action.data = buffer.peek(this.length - (buffer.bytesRead - bytesRead));

					parser.emitEvent(constants.EVENTS.ACTIONS.UNKNOWN, action);

					if (parser.config.ignoreUnknown) {
						buffer.read(this.length - (buffer.bytesRead - bytesRead));
					} else {
						throw Error("unknown actions : " + actionId);	
					}
			}
			
			parser.emitEvent(constants.EVENTS.PARSED.ACTION, action)
		}
	}
}

module.exports = CommandBlock;