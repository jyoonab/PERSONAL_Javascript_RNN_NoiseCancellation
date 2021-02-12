/************************
* WebRTC Control Class
*************************/
var uuid;
var localStream;
var peerConnection;
var serverConnection;

var streamVideoTrack;
var streamAudioTrack;
var videoSender;
var audioSender;


// ICE Server Candidates
var peerConnectionConfig = {
    'iceServers':
    [
        {'urls': 'stun:stun.stunprotocol.org:3478'},
        {'urls': 'stun:stun.l.google.com:19302'},
    ]
};

// WebRTC Constructor
function WebRtc(inputStream){
  localStream = inputStream;
  uuid = createUUID();

  this.socketConnect();

  peerConnection = new RTCPeerConnection(peerConnectionConfig);

  streamVideoTrack = inputStream.getVideoTracks()[0];
  streamAudioTrack = inputStream.getAudioTracks()[0];

  if(streamVideoTrack != undefined)
    videoSender = peerConnection.addTrack(streamVideoTrack, inputStream);
  audioSender = peerConnection.addTrack(streamAudioTrack, inputStream);

  peerConnection.onicecandidate = gotIceCandidate;
  peerConnection.ontrack = gotRemoteStream;
}

WebRtc.prototype.socketConnect = function() {
  serverConnection = new WebSocket('wss://' + window.location.hostname + ':8443');
  serverConnection.onmessage = gotMessageFromServer;
}

WebRtc.prototype.peerConnect = function() {
  resetPeerConnect();
}

WebRtc.prototype.start = function() {
  startCalling();
}

WebRtc.prototype.stop = function() {
  serverConnection.send(JSON.stringify({'type': 'CLOSEWEBRTC'}));
  peerConnection.close();
}

WebRtc.prototype.applyStream = function(inputStream) {
  //this.socketConnect();
  if(audioSender != undefined)  // Check If Stream Exists; if yes, replace old track with new track
    audioSender.replaceTrack(inputStream.getAudioTracks()[0]);
}

function startCalling()
{
    setPeerConnection(localStream);
}

// Make Peer Connection
function setPeerConnection(inputStream){
  peerConnection.createOffer().then(createdDescription).catch(errorHandler);
}

function gotMessageFromServer(message)
{
    console.log("received message : ", message);
    console.log("Peer Connection : ", peerConnection.connectionState);
    if(!peerConnection) startCalling(false);

    var signal = JSON.parse(message.data);

    if(signal.uuid == uuid) return;

    if(signal.sdp)
    {
        //console.log("closeedddd", peerConnection.connectionState);
        if(peerConnection.connectionState === 'closed')
        {
          resetPeerConnect();
        }
        peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {
            // Only create answers in response to offers
            if(signal.sdp.type == 'offer')
            {
                toggleWebRtc("AUTOSTART");
                peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
            }
        }).catch(errorHandler);
    }
    else if(signal.ice)
    {
        peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
    }
    else if(signal.type === "CLOSEWEBRTC")
    {
        if(isWebRtcActivated)
        {
          toggleButton(webrtcToggle);
          isWebRtcActivated = false;
        }
        peerConnection.close();
    }
}

function gotIceCandidate(event)
{
    if(event.candidate != null)
    {
        serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid}));
    }
}

function createdDescription(description)
{
    console.log("a");
    peerConnection.setLocalDescription(description).then(function() {
        console.log("sending message : ", peerConnection.localDescription);
        //console.log("websocket status : ", serverConnection.readyState);
        serverConnection.send(JSON.stringify({'sdp': peerConnection.localDescription, 'uuid': uuid}));
    }).catch(errorHandler);
}

function gotRemoteStream(event)
{
    remoteVideo.srcObject = event.streams[0];
}

// restart peerconnection
function resetPeerConnect()
{
  if(peerConnection.connectionState === 'closed')
  {
    //serverConnection.close();
    //this.socketConnect();

    peerConnection = new RTCPeerConnection(peerConnectionConfig);

    streamVideoTrack = localStream.getVideoTracks()[0];
    streamAudioTrack = localStream.getAudioTracks()[0];

    console.log('streamVideoTrack', streamVideoTrack);
    console.log('streamAudioTrack', streamAudioTrack);

    if(streamVideoTrack != undefined)
      videoSender = peerConnection.addTrack(streamVideoTrack, localStream);
    audioSender = peerConnection.addTrack(streamAudioTrack, localStream);

    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.ontrack = gotRemoteStream;

    console.log("websocket status : ", serverConnection.readyState);
  }
}

function errorHandler(error)
{
    console.log(error);
}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function createUUID()
{
    function s4()
    {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}
