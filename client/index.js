var streamVisualizerWebRtc;
var streamVisualizerVoiceRecord;
var streamVisualizerPsnr;
var webRtc = null;
var isEchoActivated = false;
var isRNNoiseActivated = false;
var isWebRtcActivated = false;
var doesDeviceExists = true;
var denoisedStream; // Denoised Stream
var originalStream; // Original Stream
var audioInputsInformation;
var videoInputsInformation;

var peerConnectionConfig = {
    'iceServers':
    [
        {'urls': 'stun:stun.stunprotocol.org:3478'},
        {'urls': 'stun:stun.l.google.com:19302'},
    ]
};

/*********************************
Initializing Elements
*********************************/

// temp
var demoChart = document.querySelector("#demo_chart");

// Select (Where I/O Device Information is Saved)
const inputDevice = document.getElementById('inputDevice');
const outputDevice = document.getElementById('outputDevice');
const videoDevice = document.getElementById('videoDevice');

// Video
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Canvas
const localVoiceCanvas = document.getElementById('localVoiceCanvas');
const remoteVoiceCanvas = document.getElementById('remoteVoiceCanvas');
const psnrCanvas = document.getElementById('psnrCanvas');

// Button
const echoToggle = document.getElementById('echoToggle');
const rnnoiseToggle = document.getElementById('rnnoiseToggle');
const webrtcToggle = document.getElementById('webrtcToggle');

// Pragraph
const rnnoiseSpeedMeter = document.getElementById('rnnoiseSpeedMeter');

/*********************************
* Initializing Inputs
*********************************/
//inputDevice.onchange = pageStart;
inputDevice.onchange = pageStart;
outputDevice.onchange = changeRemoteVideoOutput;

/*********************************
* Dummy Tracks
*********************************/
let dummyAudio = () => {
  let ctx = new AudioContext(), oscillator = ctx.createOscillator();
  let dst = oscillator.connect(ctx.createMediaStreamDestination());
  oscillator.start();
  return Object.assign(dst.stream.getAudioTracks()[0], {enabled: false});
}

let dummyVideo = ({width = 640, height = 480} = {}) => {
  let canvas = Object.assign(document.createElement("canvas"), {width, height});
  canvas.getContext('2d').fillRect(0, 0, width, height);
  let dummyStream = canvas.captureStream();
  return Object.assign(dummyStream.getVideoTracks()[0], {enabled: false});
}

/*********************************
* Body Starts Here
*********************************/
// Enable Video and Be ready to connect
async function pageStart()
{
    const audioSource = inputDevice.value;
    const videoSource = videoDevice.value;

    const hardwareInformation = await navigator.mediaDevices.enumerateDevices();
    //const audioOutputInformation = hardwareInformation.filter((device) => device.kind === "audiooutput");
    audioInputsInformation = hardwareInformation.filter((device) => device.kind === "audioinput");
    videoInputsInformation = hardwareInformation.filter((device) => device.kind === "videoinput");

    var constraints = {
      video: videoInputsInformation.length != 0 ? { deviceId: audioSource ? {exact: videoSource} : undefined } : false,
      audio: audioInputsInformation.length != 0 ? { deviceId: audioSource ? {exact: audioSource} : undefined } : false
    };

    console.log("constraints ", constraints.video, " ", constraints.audio);

    if(navigator.mediaDevices.getUserMedia)
    {
      await navigator.permissions.query({name: 'geolocation'});
      if(constraints.video === false, constraints.audio === false)
          saveDeviceInformation(null);
      else if(outputDevice.options.length === 0 &&  inputDevice.options.length === 0 ) // Fetch Device Information and Apply Stream
          navigator.mediaDevices.getUserMedia(constraints).then(saveDeviceInformation).catch(errorHandler);
      else // Change Audio Source Only
          navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
    }
    else
    {
        alert('Your browser does not support getUserMedia API');
    }
}

// Put Device Information into selection
async function saveDeviceInformation(stream)
{
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
  const audioInputs = devices.filter((device) => device.kind === "audioinput");
  const videoInputs = devices.filter((device) => device.kind === "videoinput");

  // Saves Output Devices Information on Select Form
  audioOutputs.forEach(
    (device, i) => outputDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  // Saves Input Device Information on Select Form
  audioInputs.forEach(
    (device, i) => inputDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  videoInputs.forEach(
    (device, i) => videoDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  getUserMediaSuccess(stream);
}

// Change Audio Destination
function changeRemoteVideoOutput() {
  console.log("speaker changed", outputDevice.value);
  const audioDestination = outputDevice.value;
  attachSinkId(localVideo, audioDestination);
  attachSinkId(remoteVideo, audioDestination);
}

// Change Audio Sink Id
function attachSinkId(element, sinkId) {
  if (typeof element.sinkId !== 'undefined') {
    element.setSinkId(sinkId)
        .then(() => {
          console.log(`Success, audio output device attached: ${sinkId}`);
        })
        .catch(error => {
          let errorMessage = error;
          if (error.name === 'SecurityError') {
            errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
          }
          console.error(errorMessage);
          // Jump back to first output device in the list as it's the default.
          outputDevice.selectedIndex = 0;
        });
  } else {
    console.warn('Browser does not support output device selection.');
  }
}

async function getUserMediaSuccess(stream)
{
    var startTime, endTime, elapsedTime;

    let dummyTracks = (...args) => new MediaStream([dummyVideo(...args), dummyAudio()]);

    remoteVideo.srcObject = dummyTracks();

    // if none of mic or video is found, make all streams empty
    if(stream === null)
    {
      doesDeviceExists = false;

      stream = new MediaStream();
      stream.addTrack(dummyTracks().getVideoTracks()[0]);
      stream.addTrack(dummyTracks().getAudioTracks()[0]);
    }

    originalStream = stream;
    if(originalStream.getVideoTracks()[0] === undefined)
      originalStream.addTrack(dummyTracks().getVideoTracks()[0]); // add dummy video
    if(originalStream.getAudioTracks()[0] === undefined)
      originalStream.addTrack(dummyTracks().getAudioTracks()[0]); // add dummy audio

    denoisedStream = await startRNNoise(stream); // Where RNNoise Starts
    denoisedStream.addTrack(originalStream.getVideoTracks()[0]); // add dummy video

    if(!isRNNoiseActivated)
      localVideo.srcObject = originalStream;
    else if(isRNNoiseActivated)
      localVideo.srcObject = denoisedStream;
    localVideo.autoplay = true;

    // Initialize WebRTC
    if(webRtc === null)
    {
      console.log("making new WebRtc");
      webRtc = new WebRtc(originalStream);
    }
    else if(isWebRtcActivated && isRNNoiseActivated)
    {
      console.log("applying denoised stream");
      webRtc.applyStream(denoisedStream);
    }
    else if(isWebRtcActivated && !isRNNoiseActivated)
    {
      console.log("applying original stream");
      webRtc.applyStream(originalStream);
    }

    // Activate StreamVisualizer only when Audio Stream Exists
    if(originalStream.getAudioTracks()[0] != undefined)
    {
      // start stream visualizer(WebRtc)
      streamVisualizerWebRtc = new StreamVisualizer(denoisedStream, localVoiceCanvas);
      streamVisualizerWebRtc.start();

      // start stream visualizer(Voice Record)
      streamVisualizerVoiceRecord = new StreamVisualizer(originalStream, remoteVoiceCanvas);
      streamVisualizerVoiceRecord.start();

      // psnr canvas
      //streamVisualizerPsnr = new PsnrVisualizer(originalStream, denoisedStream, demoChart);
      //streamVisualizerPsnr.start();
    }
}

// change button's status
// return true if the button is being on
// return false if the button is being off
function toggleButton(item)
{
  if(!item.classList.contains("selected"))
  {
    console.log("turning on");
    item.innerHTML = item.innerHTML.replace("Off", "On");
    item.classList.add("selected");
    return true;
  }
  else
  {
    console.log("turning off");
    item.innerHTML = item.innerHTML.replace("On", "Off");
    item.classList.remove("selected");
    return false;
  }
}

async function toggleWebRtc(command)
{
    if(command === "START" || command === "AUTOSTART")
    {
      console.log(command);

      await webRtc.peerConnect();

      if(command === "START")
        webRtc.start();

      if(doesDeviceExists)
        localVideo.muted = true;

      if(isRNNoiseActivated)
          webRtc.applyStream(denoisedStream);
      else
          webRtc.applyStream(originalStream);
      isWebRtcActivated = toggleButton(webrtcToggle);
      console.log("isWebRtcActivated", isWebRtcActivated, " ", command);
    }
    if(command === "STOP")
    {
      console.log("STOP");
      webRtc.stop();
      if(doesDeviceExists)
        localVideo.muted = false;

      isWebRtcActivated = toggleButton(webrtcToggle);
    }
}

function toggleRNNoise(command)
{
  if(command === "START")
  {
    console.log("rnnoise activated");
    if(isWebRtcActivated)
      webRtc.applyStream(denoisedStream);

    localVideo.srcObject = denoisedStream;

    if(!isWebRtcActivated)
      localVideo.muted = false;

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
  else
  {
    console.log("rnnoise deactivated");
    if(isWebRtcActivated)
      webRtc.applyStream(originalStream);

    localVideo.srcObject = originalStream;

    if(!isWebRtcActivated)
      localVideo.muted = false;

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
}

async function startRNNoise(inputStream)
{
    const sink = Audio.prototype.setSinkId;
    const context = new AudioContext({ sampleRate: 48000 });
    try {
        const destination = context.createMediaStreamDestination();

        await RNNoiseNode.register(context)
        const source = context.createMediaStreamSource(inputStream),
        rnnoise = new RNNoiseNode(context);

        rnnoise.connect(destination);
        source.connect(rnnoise);

        return destination.stream;

    } catch (e) {
        context.close();
        console.error(e);
        return inputStream;
    }
}

function errorHandler(error)
{
  console.log(error);
}

// Button Select Event
function setButton(buttonName) {
  switch (buttonName)
  {
    case 'EchoToggle' :
      if(!isEchoActivated)
        isEchoActivated = toggleButton(echoToggle);
      else
        isEchoActivated = toggleButton(echoToggle);
      break;
    case 'RNNoiseToggle' :
      if(!isRNNoiseActivated)
        toggleRNNoise("START");
      else
        toggleRNNoise("STOP");
      break;
    case 'WebRtcToggle' :
      if(!isWebRtcActivated)
        toggleWebRtc("START");
      else
        toggleWebRtc("STOP");
      break;
    default :
      console.log("Not Configured Yet");
  }
}

pageStart();
