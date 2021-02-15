const HTTPS_PORT = 8443;

const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

// Yes, TLS is required
const serverConfig = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
};

// const audioList = fs.readFileSync('src').filter(fn => fn.endsWith('.mp3'));

// ----------------------------------------------------------------------------------------

// Create a server for the client html page
const handleRequest = function(request, response) {
    // Render the single client html file for any request the HTTP server receives
    console.log('request received: ' + request.url);

    if(request.url === '/') {
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end(fs.readFileSync('client/index.html'));
    } else if(request.url === '/index.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/index.js'));
    } else if(request.url === '/visualizer.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/visualizer.js'));
    } else if(request.url === '/streamvisualizer.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/streamvisualizer.js'));
    } else if(request.url === '/soundControler.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/soundControler.js'));
    } else if(request.url === '/index.css') {
        response.writeHead(200, {'Content-Type': 'text/css'});
        response.end(fs.readFileSync('client/index.css'));
    } else if(request.url === '/music_clean.mp3') {
        response.writeHead(200, {'Content-Type': 'audio/mp3'});
        response.end(fs.readFileSync('src/music_clean.mp3'));
    } else if(request.url === '/fish_en_clean.wav') {
        response.writeHead(200, {'Content-Type': 'audio/wav'});
        response.end(fs.readFileSync('src/fish_en_clean.wav'));
    } else if(request.url === '/speech_kr_clean.wav') {
        response.writeHead(200, {'Content-Type': 'audio/wav'});
        response.end(fs.readFileSync('src/speech_kr_clean.wav'));
    } else if(request.url === '/rnnoise-runtime.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('dist/rnnoise-runtime.js'));
    } else if(request.url === '/rnnoise-processor.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('dist/rnnoise-processor.js'));
    } else if(request.url === '/rnnoise-processor.wasm') {
        response.writeHead(200, {'Content-Type': 'application/wasm'});
        response.end(fs.readFileSync('dist/rnnoise-processor.wasm'));
    } else if(request.url === '/webRtc.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/webRtc.js'));
    } else if(request.url === '/webrtc.png') {
        response.writeHead(200, {'Content-Type': 'image/png'});
        response.end(fs.readFileSync('src/webrtc.png'));
    } else if(request.url === '/psnrVisualizer.js') {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(fs.readFileSync('client/psnrVisualizer.js'));
    }
};

const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(HTTPS_PORT, '0.0.0.0');

// ----------------------------------------------------------------------------------------

// Create a server for handling websocket calls
const wss = new WebSocketServer({server: httpsServer});

wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        // Broadcast any received message to all clients
        console.log('received: %s', message);
        wss.broadcast(message);
    });
});

wss.broadcast = function(data) {
    this.clients.forEach(function(client) {
        if(client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

console.log('Server running. Visit https://localhost:' + HTTPS_PORT + ' in Firefox/Chrome.\n\n\
Some important notes:\n\
  * Note the HTTPS; there is no HTTP -> HTTPS redirect.\n\
  * You\'ll also need to accept the invalid TLS certificate.\n\
  * Some browsers or OSs may not allow the webcam to be used by multiple pages at once. You may need to use two different browsers or machines.\n'
);
