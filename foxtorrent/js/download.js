'use strict';

// Handle when we're launched via a "view" activity
if (window.navigator && window.navigator.mozSetMessageHandler) {
    window.navigator.mozSetMessageHandler('activity', function(activityRequest) {
        var option = activityRequest.source;

        if (option.name === 'view') {
            DownloadManager.downloadTorrent(option.data.url);
        }
    });
}

var DownloadManager = {
    downloads: {},
    downloadTorrent: function(url) {
        var download = new Download(url);
        downloads[url] = download;
        download.start();
    }
};

function Download(url) {
    this.url = url;
    this.percentDownloaded = 0;
    this.error = false;
    this.errorMessage = '';
}

Download.prototype.start = function() {
    var self = this;

    self._downloadBinaryFile(self.url, function(error, result) {
        if (error) {
            console.error('Error fetching torrent file: ' + error);
            self.error = true;
            self.errorMessage = error;
            return;
        }

        self._processTorrentFile(result);
    });
};

Download.prototype._downloadBinaryFile = function(url, callback) {
    var xhr = new XMLHttpRequest({ mozSystem: true });
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function(e) {
        if (xhr.status !== 200) {
            callback(xhr.responseText);
            return;
        }

        callback(null, xhr.response);
    }

    xhr.send();
}

Download.prototype._processTorrentFile = function(torrentFile) {
    var self = this;

    if (torrentFile.byteLength === 0) {
        console.error('Received empty torrent file');
        this.error = true;
        this.errorMessage = 'Received empty torrent file';
        return;
    }

    var torrentFileBinary = new Uint8Array(torrentFile);
    var torrent = this._bencodingDecode(torrentFileBinary);

    // tracker request
    var info = torrentFileBinary.subarray(torrent['info'].__start, torrent['info'].__end);
    this.infoSha1 = CryptoJS.SHA1(CryptoJS.lib.WordArray.create(info)).toString(CryptoJS.enc.Hex);
    this.peerId = CryptoJS.lib.WordArray.random(20).toString(CryptoJS.enc.Hex);

    var left = 0;

    if (torrent.info.files) {
        left = _.reduce(torrent.info.files, function(length, file) {
            return length + file.length;
        }, 0);
    } else {
        left = torrent.info.length;
    }

    var params = _.reduce({
        info_hash: this._escapeHexBytes(this.infoSha1),
        peer_id: this._escapeHexBytes(this.peerId),
        port: 6881,
        uploaded: 0,
        downloaded: 0,
        left: left,
        event: 'started'
    }, function(result, value, key) {
        if (result.length) {
            result += '&';
        }
        return result + key + '=' + value;
    }, '');

    this._downloadBinaryFile(torrent.announce.toString() + '?' + params, function(error, result) {
        if (error) {
            console.error('Error fetching tracker info');
            this.error = true;
            this.errorMessage = error;
            return;
        }

        var trackerInfoBinary = new Uint8Array(result);
        var trackerInfo = self._bencodingDecode(trackerInfoBinary);

        // compact form of peers
        if (trackerInfo.peers.__type === 'string') {

            var peerInfo = trackerInfo.peers.dataView();
            var peers = [];

            // each peer is encoded as 6 bytes, 4 for the host and 2 for the port
            for (var i = 0; i < peerInfo.byteLength; i += 6) {
                var host = peerInfo.getUint8(i) + '.'
                    + peerInfo.getUint8(i + 1) + '.'
                    + peerInfo.getUint8(i + 2) + '.'
                    + peerInfo.getUint8(i + 3);
                var port = peerInfo.getUint16(i + 4);

                peers.push({ host: host, port: port });
            }

            if (!peers.length) {
                console.error('No peers found');
                self.error = true;
                self.errorMessage = 'No peers found';
                return;
            }

            var peer = peers[_.random(peers.length - 1)];
            self.peerConnection = new PeerConnection(peer.host, peer.port, self);
        }
    });
};

Download.prototype._bencodingDecode = function(buffer, marker) {
    marker = marker || { offset: 0 };

    switch(String.fromCharCode(buffer[marker.offset])) {
    case 'd':
        var result = { __start: marker.offset, __type: 'dict' }
        marker.offset++;
        while (String.fromCharCode(buffer[marker.offset]) !== 'e') {
            var key = this._bencodingDecode(buffer, marker).toString();
            var value = this._bencodingDecode(buffer, marker);
            result[key] = value;
        }
        marker.offset++;
        result.__end = marker.offset;
        return result;
    case 'l':
        var result = [];
        result.__start = marker.offset;
        result.__type = 'list';
        marker.offset++;
        while (String.fromCharCode(buffer[marker.offset]) !== 'e') {
            result.push(this._bencodingDecode(buffer, marker));
        }
        marker.offset++;
        result.__end = marker.offset;
        return result;
    case 'i':
        marker.offset++;
        var endOffset = marker.offset;
        while (String.fromCharCode(buffer[endOffset]) !== 'e') {
            endOffset++;
        }
        // FIXME: we could do these lazy like strings
        var result = parseInt(new TextDecoder('utf-8').decode(buffer.subarray(marker.offset, endOffset)));
        marker.offset = endOffset + 1;
        return result;
    default: // strings
        var colonOffset = marker.offset;
        while (String.fromCharCode(buffer[colonOffset]) !== ':') {
            colonOffset++;
        }
        var length = parseInt(new TextDecoder('utf-8').decode(buffer.subarray(marker.offset, colonOffset)));
        var result = new BencodedString(buffer, colonOffset + 1, colonOffset + 1 + length);
        marker.offset = colonOffset + 1 + length;
        return result;
    }
};

Download.prototype._escapeHexBytes = function(hex) {
    var res = '';
    for (var i = 0; i < hex.length; i += 2) {
        res += '%' + hex.charAt(i) + hex.charAt(i + 1);
    }
    return res;
}

function BencodedString(buffer, start, end) {
    this.buffer = buffer;
    this.__start = start;
    this.__end = end;
    this.__type = 'string';
}

BencodedString.prototype.toString = function() {
    return new TextDecoder('utf-8').decode(this.buffer.subarray(this.__start, this.__end));
}

BencodedString.prototype.dataView = function() {
    return new DataView(this.buffer.buffer, this.__start, this.__end - this.__start);
}

function PeerConnection(host, port, download) {
    var self = this;
    this.state = 'disconnected';
    this.download = download;

    this.socket = navigator.mozTCPSocket.open(host, port, { binaryType: 'arraybuffer' });
    this.socket.onerror = function(event) {
        self._handleError(event.data);
    };
    this.socket.onclose = function() {
        self._handleSocketClosed();
    };
    this.socket.ondata = function(event) {
        self._handleDataReceived(event.data);
    };
    this.socket.ondrain = function() {
        self._handleDrain();
    };

    if (this.socket.readyState === 'open') {
        this._sendHandshake();
    } else {
        this.socket.onopen = function() {
            self._sendHandshake();
        };
    }
}

PeerConnection.prototype._sendHandshake = function() {

    if (this.state !== 'disconnected') {
        console.error('Attempting to send handshake in an invalid state');
        return;
    }

    this.state = 'handshaking';

    // 1 byte for protocol length (the value 19), 19 for 'BitTorrent protocol', 8 empty bytes,
    // 20 bytes for the info SHA1 and 20 bytes for the peer ID SHA1.
    var PROTOCOL_LENGTH_BYTES = 1;
    var PROTOCOL_BYTES = 19;
    var RESERVED_BYTES = 8;
    var INFO_SHA1_BYTES = 20;
    var PEER_ID_BYTES = 20;

    var handshakeSize = PROTOCOL_LENGTH_BYTES
        + PROTOCOL_BYTES
        + RESERVED_BYTES
        + INFO_SHA1_BYTES
        + PEER_ID_BYTES;

    var offset = 0;

    var handshake = new DataView(new ArrayBuffer(handshakeSize));
    handshake.setUint8(0, 19);
    offset += PROTOCOL_LENGTH_BYTES;

    var protocol = 'BitTorrent protocol';
    for (var i = 0; i < protocol.length; i++) {
        handshake.setUint8(offset + i, protocol.charCodeAt(i));
    }
    offset += PROTOCOL_BYTES + RESERVED_BYTES;

    for (var i = 0; i < 20; i++) {
        var bytesHex = '0x' + this.download.infoSha1.substring(i * 2, i * 2 + 2);
        handshake.setUint8(offset + i, parseInt(bytesHex));
    }
    offset += INFO_SHA1_BYTES;

    for (var i = 0; i < 20; i++) {
        var bytesHex = '0x' + this.download.peerId.substring(i * 2, i * 2 + 2);
        handshake.setUint8(offset + i, parseInt(bytesHex));
    }

    var handshakeBuffer = handshake.buffer;
    this.socket.send(handshakeBuffer);
};

PeerConnection.prototype._handleError = function(error) {

};

PeerConnection.prototype._handleSocketClosed = function() {
    console.log('closed ');
};

PeerConnection.prototype._handleDataReceived = function(data) {
    var dataBinary = new Uint8Array(data);
    if (this.state === 'disconnected') {
        console.console.warn('Data received when not connected. Odd.');
    } else if (this.state === 'handshaking') {
        if (!this._verifyHandshake(dataBinary)) {
            console.error('Invalid handshake from peer ' + data.byteLength);
            return;
        }

        this.state = 'connected';
        return;
    }

    console.log('op: ' + dataBinary[0]);
    switch (dataBinary[0]) {
    case 0:
        // choke
        break;
    case 1:
        // unchoke
        break;
    case 2:
        // interested
        break;
    case 3:
        // not interested
        break;
    case 4:
        // have
        break;
    case 5:
        // bitfield
        break;
    case 6:
        // request
        break;
    case 7:
        // piece
        break;
    case 8:
        // cancel
        break;
    }
};

PeerConnection.prototype._handleDrain = function() {

};

PeerConnection.prototype._verifyHandshake = function(handshake) {

    if (handshake.byteLength != 68) {
        return false;
    } else if (handshake[0] != 19) {
        return false;
    }

    var protocol = 'BitTorrent protocol';
    for (var i = 0; i < protocol.length; i++) {
        if (handshake[1 + i] != protocol.charCodeAt(i)) {
            return false;
        }
    }

    return true;
}

