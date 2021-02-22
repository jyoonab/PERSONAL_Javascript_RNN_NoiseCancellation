var streamVisualizerWebRtc;
var streamVisualizerVoiceRecord;
var streamVisualizerPsnr;
var webRtc = null;
var isEchoActivated = false;
var isRNNoiseActivated = false;
var isWebRtcActivated = false;
var selfTestAudio = null; // Audio for Self Test
var denoisedStream; // Denoised Stream
var originalStream; // Original Stream
var processedStream; // Stream to be applied
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
inputDevice.onchange = pageStart;
outputDevice.onchange = changeRemoteVideoOutput;

/*********************************
* Body Starts Here
*********************************/
// Enable Video and Be ready to connect
async function pageStart()
{
    const audioSource = inputDevice.value;
    //const videoSource = videoDevice.value;
    console.log(videoDevice.value);

    const hardwareInformation = await navigator.mediaDevices.enumerateDevices();
    //const audioOutputInformation = hardwareInformation.filter((device) => device.kind === "audiooutput");
    audioInputsInformation = hardwareInformation.filter((device) => device.kind === "audioinput");
    videoInputsInformation = hardwareInformation.filter((device) => device.kind === "videoinput");

    var constraints = {
      video: true,
      audio: audioInputsInformation.length != 0 ? { deviceId: audioSource ? {exact: audioSource} : undefined } : false
    };

    if(navigator.mediaDevices.getUserMedia)
    {
      if(outputDevice.options.length === 0 &&  inputDevice.options.length === 0 ) // Fetch Device Information and Apply Stream
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

  // Saves Input Devices Information on Select Form
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
  const audioDestination = outputDevice.value;
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

    originalStream = stream;
    processedStream = stream.clone();
    localVideo.srcObject = stream;
    localVideo.autoplay = true;

    // Where RNNoise Starts
    denoisedStream = await startRNNoise(stream);

    console.log(stream.getVideoTracks()[0]);
    if(stream.getVideoTracks()[0] !== undefined)
    {
      console.log("applying video to denoised stream");
      denoisedStream.addTrack(originalStream.getVideoTracks()[0]);
    }

    // As Default, Turn on self-test
    swapStreamForSelfTest();
    selfTestAudio.play();

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

    // start stream visualizer(WebRtc)
    streamVisualizerWebRtc = new StreamVisualizer(denoisedStream, localVoiceCanvas);
    streamVisualizerWebRtc.start();

    // start stream visualizer(Voice Record)
    streamVisualizerVoiceRecord = new StreamVisualizer(originalStream, remoteVoiceCanvas);
    streamVisualizerVoiceRecord.start();

    // psnr canvas
    console.log('demochart: ', demoChart);
    streamVisualizerPsnr = new PsnrVisualizer(originalStream, denoisedStream, demoChart);
    streamVisualizerPsnr.start();
}

// swap b/w denoised & original stream for self test
function swapStreamForSelfTest()
{
  if (!isWebRtcActivated) {
      if(selfTestAudio === null)
      {
        selfTestAudio = new Audio();
      }
      else if(!isRNNoiseActivated)
      {
          updateProcessedStream(denoisedStream);
      }
      else
      {
          updateProcessedStream(originalStream);
      }
      selfTestAudio.srcObject = processedStream;

      //selfTestAudio.setSinkId(outputDevice.options[outputDevice.selectedIndex].value); // Somehow, this is not working on mobile chrome
      //selfTestAudio.play();
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

function toggleWebRtc(command)
{
    if(command === "START" || command === "AUTOSTART")
    {
      console.log("START");

      webRtc.peerConnect();

      if(command === "START")  // only start webrtc on START command
        webRtc.start();

      selfTestAudio.pause();
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
      selfTestAudio.play();

      //webRtc.peerConnect();

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
    swapStreamForSelfTest();
    if(!isWebRtcActivated)
      selfTestAudio.play();

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
  else
  {
    console.log("rnnoise deactivated");
    if(isWebRtcActivated)
      webRtc.applyStream(originalStream);
    swapStreamForSelfTest();
    if(!isWebRtcActivated)
      selfTestAudio.play();

    isRNNoiseActivated = toggleButton(rnnoiseToggle);
  }
}

// replace processedStream with sourceStream
// For now, only sound is changed
function updateProcessedStream(sourceStream)
{
  try
  {
    processedStream.removeTrack(processedStream.getAudioTracks()[0]);
    processedStream.addTrack(sourceStream.getAudioTracks()[0]);
    return true;
  }
  catch(e)
  {
    console.error(e);
    return false;
  }

}

async function startRNNoise(inputStream)
{
    const sink = Audio.prototype.setSinkId;
    const context = new AudioContext({ sampleRate: 48000 });
    try {
        /*const destination = sink ? new MediaStreamAudioDestinationNode(context, {
            channelCountMode: "explicit",
            channelCount: 1,
            channelInterpretation: "speakers"
        }) : context.destination;*/
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
