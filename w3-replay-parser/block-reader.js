const zlib = require('zlib');


class BlockReader {
	constructor (parser) {
		this.currentBlock = 0;
		this.parser = parser;
	}

	hasMoreData () {
		return this.currentBlock < this.parser.header.blocks;	
	}

	getMoreData () {
		this.currentBlock ++;

		var buffer = this.parser.read(8);

		var compressedSize = buffer.read(2).readUIntLE(0, 2);
		var uncompressedSize = buffer.read(2).readUIntLE(0, 2);
		var checksum = buffer.read(4).reverse().toString('hex');

		var compressedData = this.parser.read(compressedSize).buffer;
		var uncompressedData = this.uncompress(compressedData)

		return uncompressedData
	}

	uncompress (buffer) {
		return zlib.inflateSync(buffer, {finishFlush: zlib.constants.Z_SYNC_FLUSH });
	}
}

module.exports = BlockReader