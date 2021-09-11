const { mqEmitter } = require("../mqtt-client");

const publish = (topic, data) => {


  mqEmitter.emit("publish", data)
}

module.exports = publish;