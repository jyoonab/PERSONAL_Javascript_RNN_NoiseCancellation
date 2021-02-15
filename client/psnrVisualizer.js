var updateInterval = 100;

// Interesting parameters to tweak!
const PSNR_SMOOTHING = 0.8;
const PSNR_FFT_SIZE = 2048;

var demoChart, chart2, y_axis;

function PsnrVisualizer(originalStream, denoisedStream, demoChart) {
  chart2 = new Rickshaw.Graph({
      element: demoChart,
      width: "300",
      height: "150",
      renderer: "line",
      min: "0",
      max: "100",
      series: new Rickshaw.Series.FixedDuration([{
          name: 'one',
          color: '#446CB3'
      }], undefined, {
          timeInterval: updateInterval,
          maxDataPoints: 100
      })
  });

  y_axis = new Rickshaw.Graph.Axis.Y({
      graph: chart2,
      orientation: 'left',
      tickFormat: function (y) {
          return y.toFixed(2);
      },
      ticks: 5,
      element: document.getElementById('y_axis'),
  });

  // cope with browser differences
  if (typeof AudioContext === 'function') {
    this.context = new AudioContext();
  } else if (typeof webkitAudioContext === 'function') {
    this.context = new webkitAudioContext(); // eslint-disable-line new-cap
  } else {
    alert('Sorry! Web Audio is not supported by this browser');
  }

  // Create a MediaStreamAudioSourceNode from the remoteStream
  this.sourceFromOriginalStream = this.context.createMediaStreamSource(originalStream);
  this.analyserFromOriginalStream = this.context.createAnalyser();
  this.streamDataFromOriginalStream = this.makeAnalyser(this.analyserFromOriginalStream, this.sourceFromOriginalStream);

  this.sourceFromDenoisedStream = this.context.createMediaStreamSource(denoisedStream);
  this.analyserFromDenoisedStream = this.context.createAnalyser();
  this.streamDataFromDenoisedStream = this.makeAnalyser(this.analyserFromDenoisedStream, this.sourceFromDenoisedStream);

  this.startTime = 0;
  this.startOffset = 0;
}

// make a new analyzer and connect this with stream
// return list of stream data
PsnrVisualizer.prototype.makeAnalyser = function(inputAnalyser, inputStream){
  inputAnalyser.minDecibels = -140;
  inputAnalyser.maxDecibels = 0;

  streamData = new Uint8Array(inputAnalyser.frequencyBinCount);
  inputStream.connect(inputAnalyser);

  return streamData;
}

PsnrVisualizer.prototype.start = function() {
  requestAnimationFrame(this.draw.bind(this));
};

PsnrVisualizer.prototype.draw = function() {
  let barWidth;
  let offset;
  let height;
  let percent;
  let value;
  this.analyserFromOriginalStream.smoothingTimeConstant = PSNR_SMOOTHING;
  this.analyserFromOriginalStream.fftSize = PSNR_FFT_SIZE;

  // Get the frequency data from the currently playing music
  this.analyserFromOriginalStream.getByteTimeDomainData(this.streamDataFromOriginalStream);
  this.analyserFromDenoisedStream.getByteTimeDomainData(this.streamDataFromDenoisedStream);

  let tmpData = {
            one: this.getPsnr(this.streamDataFromOriginalStream, this.streamDataFromDenoisedStream) != Infinity ? this.getPsnr(this.streamDataFromOriginalStream, this.streamDataFromDenoisedStream) : 0
  };
  chart2.series.addData(tmpData);
  chart2.render();

  requestAnimationFrame(this.draw.bind(this));
};

PsnrVisualizer.prototype.getFrequencyValue = function(freq) {
  let nyquist = this.context.sampleRate/2;
  let index = Math.round(freq/nyquist * this.freqs.length);
  return this.freqs[index];
};

// get Peak Signal-to-Noise Ratio(PSNR) of two data
// this this function compares Original Stream(MAXi) and Denoised Stream(MSE)
PsnrVisualizer.prototype.getPsnr = function(maxi, mse){
  return Math.abs(20*Math.log10(this.getMse(maxi)) - 10*Math.log10(this.getMse(mse)));
}

// get Mean Squared Error(MSE) of data
PsnrVisualizer.prototype.getMse = function(inputData){
  var totalNumber = 0, average = 0, squaredMean = 0, result = 0;

  for (let i = 0; i < this.analyserFromOriginalStream.frequencyBinCount; i++) {
    totalNumber += inputData[i]; // add all numbers
  }
  average = totalNumber / this.analyserFromOriginalStream.frequencyBinCount;

  for (let i = 0; i < this.analyserFromOriginalStream.frequencyBinCount; i++) {
    squaredMean = (inputData[i] - average) * (inputData[i] - average) // (Yi1 - Yi2)^2
    result += squaredMean; // add all numbers
  }

  return result;
}
