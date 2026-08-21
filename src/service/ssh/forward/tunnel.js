var net = require('net');
var Connection = require('ssh2');
var createConfig = require('./lib/config');
var events = require('events');
var noop = function () {
};

var tunelMark = {};

function getId(config) {
    return `${config.host}_${config.port}_${config.localHost}_${config.localPort}_${config.remoteHost}_${config.remotePort}`;
}

function bindSSHConnection(config, netConnection) {

    let id = getId(config)

    function forward(sshConnection, netConnection) {
        /**
         * forwardOut() doesn't actually listen on the local port, so need create net server to forward.
         */
        sshConnection.forwardOut(config.srcHost, config.srcPort, config.dstHost, config.dstPort, function (err, sshStream) {
            if (err) {
                netConnection.emit('error', err);
                return;
            }
            tunelMark[id] = { connection: sshConnection }
            sshStream.on('error', function (error) {
                console.log(err)
                delete tunelMark[id]
            });
            if (netConnection) {
                netConnection.pipe(sshStream).pipe(netConnection);
            }
        });
    }

    if (tunelMark[id]) {
        forward(tunelMark[id].connection, netConnection)
        return;
    }

    var sshConnection = new Connection();
    sshConnection.on('ready', function () {
        netConnection.emit('sshConnection', sshConnection, netConnection);
        forward(sshConnection, netConnection)
    }).on('error', () => {
        delete tunelMark[id]
    });
    return sshConnection;
}

function createServer(config) {
    var server;
    var connections = [];
    var connectionCount = 0;

    server = net.createServer(function (netConnection) {
        var sshConnection;
        connectionCount++;
        netConnection.on('error', server.emit.bind(server, 'error'));
        netConnection.on('close', function () {
            connectionCount--;
            if (connectionCount === 0) {
                if (!config.keepAlive) {
                    setTimeout(function () {
                        if (connectionCount === 0) {
                            server.close();
                            tunelMark[getId(config)].connection.end()
                            delete tunelMark[getId(config)]
                        }
                    }, 2);
                }
            }
        });

        server.emit('netConnection', netConnection, server);
        sshConnection = bindSSHConnection(config, netConnection);
        sshConnection.on('error', server.emit.bind(server, 'error'));

        connections.push(sshConnection, netConnection);
        sshConnection.connect(config);
    });

    server.on('close', function () {
        connections.forEach(function (connection) {
            connection.end();
        });
        let id = getId(config)
        // tunelMark[id] is only set once traffic actually opened an ssh connection,
        // so a forward that was never used has no entry here. The old try/finally
        // had no catch, and the resulting TypeError escaped the 'close' handler.
        try {
            if (tunelMark[id] && tunelMark[id].connection) {
                tunelMark[id].connection.close()
            }
        } catch (e) {
            // closing a already-dead connection must not break teardown
        } finally {
            delete tunelMark[id]
        }
    });

    return server;
}

function tunnel(configArgs, callback) {
    var server;
    var config;

    if (!callback) {
        callback = noop;
    }
    try {
        config = createConfig(configArgs);
        server = createServer(config);

        // server.listen's third argument is a 'listening' listener and is invoked
        // with no arguments, so the old `function (error)` here was always
        // undefined. Bind failures (EADDRINUSE) arrive as an 'error' event
        // instead, and with nothing listening for them the caller's promise never
        // settled and node saw an uncaught exception.
        var settled = false;
        var onListenError = function (err) {
            if (settled) { return; }
            settled = true;
            server.removeListener('listening', onListening);
            callback(err, server);
        };
        var onListening = function () {
            if (settled) { return; }
            settled = true;
            server.removeListener('error', onListenError);
            callback(null, server);
        };
        server.once('error', onListenError);
        server.once('listening', onListening);
        server.listen(config.localPort, config.localHost);
    } catch (e) {
        server = new events.EventEmitter();
        setImmediate(function () {
            callback(e);
            server.emit('error', e);
        });
    }
    return server;
}

module.exports = tunnel;
