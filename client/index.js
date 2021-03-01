let streamVisualizerWebRtc = null;
let streamVisualizerVoiceRecord = null;
let streamVisualizerPsnr = null;
let webRtc = null;
let isEchoActivated = false;
let isRNNoiseActivated = false;
let isWebRtcActivated = false;
let doesDeviceExist = true;
let denoisedStream; // Denoised Stream
let originalStream; // Original Stream
let audioInputsInformation;
let videoInputsInformation;

/*********************************
Initializing Elements
*********************************/

// PSNR Chart
const demoChart = document.querySelector("#demo_chart");

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

// Hidden Button
// Visible only when no mic or no camera found & Stream Starts Passively(means the stream is started by another user)
/* NOTE : The Browser Blocks Video Play if Unauthorized Video is tried to be played automatically.
This button is workaround so user can play stream after clicking it*/
const hiddenButton = document.getElementById('hiddenButton');
hiddenButton.onclick = function(){ remoteVideo.play() };

// Pragraph - Rnnoise Speed Meter
const rnnoiseSpeedMeter = document.getElementById('rnnoiseSpeedMeter');

/*********************************
* Initializing Inputs
*********************************/
inputDevice.onchange = pageStart;
videoDevice.onchange = pageStart;
outputDevice.onchange = handleAudioOutputChange;


/*********************************
* - Dummy Tracks -
* This is to prevent exceptions caused by empty Audio or Video
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
// Enable Video and Be Ready to Connect
async function pageStart()
{
    const audioSource = inputDevice.value;
    const videoSource = videoDevice.value;
    const hardwareInformation = await navigator.mediaDevices.enumerateDevices();

    audioInputsInformation = hardwareInformation.filter((device) => device.kind === "audioinput");
    videoInputsInformation = hardwareInformation.filter((device) => device.kind === "videoinput");

    let constraints = {
      video: videoInputsInformation.length != 0 ? { deviceId: videoSource ? {exact: videoSource} : undefined } : false,
      audio: audioInputsInformation.length != 0 ? { deviceId: audioSource ? {exact: audioSource} : undefined } : false
    };

    if(constraints.video === false, constraints.audio === false) // If any device not found, just start saveDeviceInformationToSelectForm() with null
        saveDeviceInformationToSelectForm(null);
    else if(outputDevice.options.length === 0 &&  inputDevice.options.length === 0 ) // If audio or video found and this is first initializing state
        navigator.mediaDevices.getUserMedia(constraints).then(saveDeviceInformationToSelectForm).catch(errorHandler);
    else // If Audio or Video is Change
        navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
}

// Put Device Information into Select Form
async function saveDeviceInformationToSelectForm(stream)
{
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
  const audioInputs = devices.filter((device) => device.kind === "audioinput");
  const videoInputs = devices.filter((device) => device.kind === "videoinput");

  // Save Output Devices Information on Select Form
  audioOutputs.forEach(
    (device, i) => outputDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  // Save Input Device Information on Select Form
  audioInputs.forEach(
    (device, i) => inputDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  // Save Video Device Information on Select Form
  videoInputs.forEach(
    (device, i) => videoDevice.append(new Option( device.label || `device ${i}`, device.deviceId ))
  );

  getUserMediaSuccess(stream);
}

// Start Initializing Everything(including RNNoise, WebRTC.. etc)
async function getUserMediaSuccess(stream)
{
    let dummyTracks = (...args) => new MediaStream([dummyVideo(...args), dummyAudio()]); // Make a dummy tracks so we can replace this with empty tracks.

    remoteVideo.srcObject = dummyTracks();

    // if none of mic or video is found, make all streams empty
    if(stream === null)
    {
      doesDeviceExist = false;

      stream = new MediaStream();
      stream.addTrack(dummyTracks().getVideoTracks()[0]);
      stream.addTrack(dummyTracks().getAudioTracks()[0]);
    }

    originalStream = stream;
    if(originalStream.getVideoTracks()[0] === undefined) // if no video, add dummy video
      originalStream.addTrack(dummyTracks().getVideoTracks()[0]);
    if(originalStream.getAudioTracks()[0] === undefined) // if no audio, add dummy audio
      originalStream.addTrack(dummyTracks().getAudioTracks()[0]);

    denoisedStream = await startRNNoise(stream); // Where RNNoise Starts
    denoisedStream.addTrack(originalStream.getVideoTracks()[0]); // add dummy video to denoised stream

    if(!isRNNoiseActivated) // If rnnoise is off, apply original stream
      localVideo.srcObject = originalStream;
    else if(isRNNoiseActivated) // If rnnoise is on, apply denoised stream
      localVideo.srcObject = denoisedStream;

    // Initialize WebRTC
    if(webRtc === null) // If this is the first time to initialize WebRTC, newly make one
      webRtc = new WebRtc(originalStream);
    else if(isWebRtcActivated && isRNNoiseActivated) // If WebRTC is already initialized and RNNoise is activated, just apply denoised stream on WebRTC
      webRtc.applyStream(denoisedStream);
    else if(isWebRtcActivated && !isRNNoiseActivated) // If WebRTC is already initialized and RNNoise is not activated, just apply original stream on WebRTC
      webRtc.applyStream(originalStream);

    // Activate StreamVisualizer only when Audio Stream Exists
    if(originalStream.getAudioTracks()[0] != undefined)
    {
      // start stream visualizer(WebRtc)
      if(streamVisualizerWebRtc === null)
      {
        streamVisualizerWebRtc = new StreamVisualizer(denoisedStream, localVoiceCanvas);
        streamVisualizerWebRtc.start();
      }
      else
      {
        streamVisualizerWebRtc.apply(denoisedStream);
      }

      // start stream visualizer(Voice Record)
      if(streamVisualizerVoiceRecord === null)
      {
        streamVisualizerVoiceRecord = new StreamVisualizer(originalStream, remoteVoiceCanvas);
        streamVisualizerVoiceRecord.start();
      }
      else
      {
        streamVisualizerVoiceRecord.apply(originalStream);
      }

      // psnr canvas
      if(streamVisualizerPsnr === null) // If streamVisualizerPsnr has not been initialized
      {
        streamVisualizerPsnr = new PsnrVisualizer(originalStream, denoisedStream, demoChart);
        streamVisualizerPsnr.start();
      }
      else // If streamVisualizerPsnr is already initialized, just change stream
      {
        streamVisualizerPsnr.apply(originalStream, denoisedStream);
      }
    }
}

// Change Audio Destination
function handleAudioOutputChange()
{
  const audioDestination = outputDevice.value;
  attachSinkId(localVideo, audioDestination);
  attachSinkId(remoteVideo, audioDestination);
}

// Change Audio Sink Id
function attachSinkId(element, sinkId)
{
  if (typeof element.sinkId !== 'undefined') // Start Replacement only when element's sink id exists
  {
    element.setSinkId(sinkId) // Replacement Starts Here
        .then(() => {
          console.log(`Success, audio output device attached: ${sinkId}`);
        })
        .catch(error => {
          console.error(error);
          outputDevice.selectedIndex = 0; // Jump back to first output device in the list as it's the default.
        });
  } else {
    console.warn('Browser does not support output device selection.');
  }
}

// change button's status
// return true if the button is being on
// return false if the button is being off
function toggleButton(item)
{
  if(!item.classList.contains("selected"))
  {
    item.innerHTML = item.innerHTML.replace("Off", "On");
    item.classList.add("selected");
    return true;
  }
  else
  {
    item.innerHTML = item.innerHTML.replace("On", "Off");
    item.classList.remove("selected");
    return false;
  }
}

// Turn On & Off WebRtc
// COMMAND can be :
// - START (means the user has activated webRtc)
// - AUTOSTART (means the user from opposite side has activated webRtc)
// - STOP (webRtc has been stopped)
async function toggleWebRtc(command)
{
    if(command === "START" || command === "AUTOSTART")
    {
      await webRtc.peerConnect(); // make PeerConnection

      if(command === "START") // make call newly only when "START" (Another call should not be made on "AUTOSTART" b/c calling is already made)
        webRtc.start();

      if(doesDeviceExist) // If Device Exists, Turn Off Self-Audio
        localVideo.muted = true;

      if(command == "AUTOSTART" && !doesDeviceExist) // Enable Hidden Button
        hiddenButton.style.display = "inline";

      if(isRNNoiseActivated) // If RNNoise is Enabled, apply Denoised Stream
          webRtc.applyStream(denoisedStream);
      else // If RNNoise is Disabled, apply Original Stream
          webRtc.applyStream(originalStream);

      isWebRtcActivated = toggleButton(webrtcToggle);
    }
    if(command === "STOP")
    {
      webRtc.stop();  // WebRtc Stops Here

      if(doesDeviceExist) // If Device Exists, Turn On Self-Audio
        localVideo.muted = false;

      isWebRtcActivated = toggleButton(webrtcToggle);
    }
}

// Turn On & Off RNNoise
// COMMAND can be :
// - START (means the user has activated RNNoise)
// - STOP (RNNoise has been stopped)
function toggleRNNoise(command)
{
  if(command === "START")
  {
    if(isWebRtcActivated) // If WebRTC on, apply changed stream also
      webRtc.applyStream(denoisedStream);

    localVideo.srcObject = denoisedStream; //Apply Denoised Stream on Local Video

    if(!isWebRtcActivated) // If WebRTC is turned off, turn off self audio
      localVideo.muted = false;

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
  if(command === "STOP")
  {
    if(isWebRtcActivated) // If WebRTC on, apply changed stream also
      webRtc.applyStream(originalStream);

    localVideo.srcObject = originalStream; //Apply Original Stream on Local Video

    if(!isWebRtcActivated) // If WebRTC is turned off, turn off self audio
      localVideo.muted = false;

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
}

// Apply a stream with RNNoise and return Denoised Stream
// If failed, just return the input stream back
async function startRNNoise(inputStream)
{
    //const sink = Audio.prototype.setSinkId;
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
        isEchoActivated = toggleButton(echoToggle); // Nothing Yet
      else
        isEchoActivated = toggleButton(echoToggle); // Nothing Yet
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
