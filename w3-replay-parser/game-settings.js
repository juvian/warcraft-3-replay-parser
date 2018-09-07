class GameSettings {

	constructor (buffer) {
		this.gameSpeed = buffer.read(1) & 3;
		var byte = this.visibilityFlags = buffer.read(1);

		this.visibility = {
			hideTerrain : (byte & 1) == 1,
			mapExplored : (byte >> 1 & 1) == 1,
			alwaysVisible : (byte >> 2 & 1) == 1,
			default : (byte >> 3 & 1) == 1
		}

		this.observers = byte >> 4 & 3;

		this.teamsTogether = (byte >> 6) == 1;

		byte = this.fixedTeamsFlags = buffer.read(1);

		this.fixedTeams = byte & 3;

		byte = this.sharedUnitFlags = buffer.read(1);

		this.fullSharedUnitControl = (byte & 1) == 1;
		this.randomHeroes = (byte >> 1 & 1) == 1;
		this.randomRaces = (byte >> 2 & 1) == 1;
		this.referees = (byte >> 6 & 1) == 1;

		this.unknown = buffer.read(5);

		this.mapCheckSum = buffer.read(4).toString('hex');
	}
}

module.exports = GameSettings;