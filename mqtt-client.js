const { Socket } = require('net');
const { Duplex } = require('stream');
const EventEmitter = require('events');

class MQTTClient extends EventEmitter {

  constructor(socket) {
    super({ objectMode: true });

    /**
      @private
      @type {boolean}
     */
    this._readingPaused = false;

    /**
      The underlying TCP Socket
      @private
      @type {Socket}
     */
    this._socket;

    this._currentReadingLen = 0;
    this._currentBuffers = [];

    this.on('sendData', (data) => {
      this._socket.write(data);
    })

    if (socket) this._wrapSocket(socket);
  }

  bytesWaiting() {
    let bufferSum = 0;
    for (let i = 0; i < this._currentBuffers.length; i++) {
      bufferSum += this._currentBuffers[i].length;
    }
    return this._currentReadingLen - bufferSum; // TODO what about negative?
  }

  connect(protocol, host, port) {
    this._wrapSocket(new Socket());
    this._socket.connect({ host: host, port: port });
    return this;
  }

  _wrapSocket(socket) {
    this._socket = socket;

    // these are simply passed through
    this._socket.on('close', hadError => this.emit('close', hadError));
    this._socket.on('connect', () => this.emit('connect'));
    this._socket.on('drain', () => this.emit('drain'));
    this._socket.on('end', () => this.emit('end'));
    this._socket.on('error', err => this.emit('error', err));
    this._socket.on('lookup', (err, address, family, host) => this.emit('lookup', err, address, family, host)); // prettier-ignore
    this._socket.on('ready', () => this.emit('ready'));
    this._socket.on('timeout', () => this.emit('timeout'));
    this._socket.on('senData', () => this.emit('senData'));

    // we customize data events!
    this._socket.on('readable', this._onReadable.bind(this));
  }

  _onReadable() {
    while (!this._readingPaused) {

      // read raw len 
      let lenBuf = this._socket.read(4);
      if (!lenBuf) return;

      // convert raw len to integer
      let len = lenBuf.readUInt32BE();

      // read read json data
      let body = this._socket.read(len);
      if (!body) {
        this._socket.unshift(lenBuf);
        return;
      }

      // convert raw json to js object
      let json;
      try {
        json = JSON.parse(body);
      } catch (ex) {
        this.socket.destroy(ex);
        return;
      }

      // add object to read buffer
      let pushOk = this.push(json);

      // pause reading if consumer is slow
      if (!pushOk) this._readingPaused = true;
    }
  }

  _read() {
    this._readingPaused = false;
    setImmediate(this._onReadable.bind(this));
  }

  _write(obj, encoding, cb) {
    this._socket.write(new Uint8Array(obj), encoding, cb);
  }

  publish(topic, data) {
    this.emit("sendData", new Uint8Array([0x30, 0x0A, 0x00, 0x04, 0x74, 0x65, 0x73, 0x00, 0x03, 0x63, 0x2F, 0x64]))
  }

  subscribe(topic, qos) {
    //0x09 en sondaki 0x00' a kadar olanların miktarı.
    //0x09'dan sonra gelen 0x00, 0x01 packet ID'si
    //en sondaki 0x00 qos ayarı
    //0x00, 0x04 -> topic değerinin uzunluğu -> 0x53, 0x45, 0x46, 0x41
    this.emit("sendData", new Uint8Array([0x82, 0x09, 0x00, 0x01, 0x00, 0x04, 0x53, 0x45, 0x46, 0x41, 0x00]))
  }

  closeConnection() {
    this.emit("sendData", new Uint8Array([0xE0, 0x00]))
  }

  _final(cb) {
    this._socket.end(cb);
  }
}

const mqtt = new MQTTClient();

module.exports = mqtt;