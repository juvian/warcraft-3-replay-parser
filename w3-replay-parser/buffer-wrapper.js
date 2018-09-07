class EmptySource {
	hasMoreData() {
		return false;
	}
}

class BufferWrapper {

	constructor (buffer, source = new EmptySource()) {
		this.idx = 0;
		this.buffer = buffer;
		this.source = source;
		this.bytesRead = 0;
	}

	checkIfEnoughData (bytes) {
		if (this.readableLength() < bytes) {
			if (this.source.hasMoreData()) {
				this.buffer = Buffer.concat([this.buffer.slice(this.idx), this.source.getMoreData()])
				this.idx = 0;
				this.checkIfEnoughData(bytes);
			} else {
				throw Error("not enough bytes on buffer")
			}
		}
	}

	read (bytes) {
		this.checkIfEnoughData(bytes);
		this.idx += bytes;
		this.bytesRead += bytes;
		return this.buffer.slice(this.idx - bytes, this.idx);
	}

	peek (bytes) {
		this.checkIfEnoughData(bytes);
		return this.buffer.slice(this.idx, this.idx + bytes);
	}

	readUntil (byte, skipByte = 1) {
		var idx = this.buffer.indexOf(byte, this.idx, "utf-8");

		if (idx == -1) {
			this.checkIfEnoughData(this.readableLength() + 1);
			return this.readUntil(byte, skipByte);
		}

		var buffer  = this.read(idx - this.idx);

		if (skipByte) {
			this.idx += skipByte;
			this.bytesRead += skipByte;
		}

		return buffer;
	}

	toString (...args) {
		return this.buffer.toString.apply(this.buffer, arguments);
	}

	readableLength () {
		return this.buffer.length - this.idx;
	}

}

module.exports = BufferWrapper;