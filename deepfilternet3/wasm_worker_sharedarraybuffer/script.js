let gainNode;
let gainRange;
let audioContext = null;
let sampleRate = 48000;
let worker;
let onnx_path = './denoiser_model.ort'
let rawAnalyser;
let denoisedAnalyser;
let rawCanvasCtx;
let denoisedCanvasCtx;

window.addEventListener("load", (event) => {
  document.getElementById("toggle").addEventListener("click", toggleSound);

  gainRange = document.getElementById("gain");
  gainRange.oninput = () => {
    gainNode.gain.value = gainRange.value;
  };

  gainRange.disabled = true;

  const rawCanvas = document.getElementById("raw");
  const denoisedCanvas = document.getElementById("denoised");
  if (rawCanvas && denoisedCanvas) {
    rawCanvasCtx = rawCanvas.getContext("2d");
    denoisedCanvasCtx = denoisedCanvas.getContext("2d");
  }
});

async function toggleSound(event) {
  if (!audioContext) {
    audioDemoStart();

    gainRange.disabled = false;
  } else {
    gainRange.disabled = true;
    worker.postMessage({"command": "stop"})

    await audioContext.close();
    audioContext = null;
  }
}

async function setupWorker(rawSab, denoisedSab) {
  // The Web Worker can receive two commands: 
  // - on "init", it starts periodically reading from the queue and
  //  accumulating audio data.
  // - on "stop", it takes all this accumulated audio data, converts to PCM16
  // instead of float32 and turns the stream into a WAV file, sending it back
  // to the main thread to offer it as download.

  URLFromFiles(['worker.js', 'ringbuffer.js']).then((e) => {
      worker = new Worker(e);

      worker.onmessage = (e) => {
        const { type } = e.data;

        switch (type) {
          case "FETCH_WASM": {
            fetch("/pkg/df_bg.wasm")
              .then((response) => response.arrayBuffer())
              .then((bytes) => {
                fetch('/DeepFilterNet3_onnx.tar.gz').then((response) => response.arrayBuffer())
                .then((model_bytes) => {
                  worker.postMessage({
                    command: "init",
                    bytes: bytes,
                    base_url: document.baseURI,
                    model_bytes: model_bytes,
                    rawSab: rawSab,
                    denoisedSab: denoisedSab
                  });
                });
              });
              console.log("fetching...")
            break;
          }
          case "SETUP_AWP": {
            setupWebAudio(rawSab, denoisedSab);
          }
          default: {
            break;
          }
        }
      }
      
      // worker.postMessage({
      //   command: "init", 
        // rawSab: rawSab,
        // denoisedSab: denoisedSab,
      //   sampleRate: sampleRate,
      //   base_url: document.baseURI,
      //   onnx_path: onnx_path,
      //   hop_size: 480,
      //   state_size: 45304
      // });
  });
};

async function setupWebAudio(rawSab, denoisedSab) {
  audioContext.resume();

  gainNode = audioContext.createGain()

  URLFromFiles(['audio-processor.js', 'ringbuffer.js']).then((e) => {
      audioContext.audioWorklet.addModule(e)
        .then(() => getLiveAudio(audioContext))
        .then((liveIn) => {
            rawAnalyser = audioContext.createAnalyser();
            denoisedAnalyser = audioContext.createAnalyser();
            let audioProcesser = new AudioWorkletNode(audioContext, 'random-audio-processor',
                {
                  processorOptions: {
                    rawSab: rawSab,
                    denoisedSab: denoisedSab
                  }
                }
            )

            liveIn.connect(rawAnalyser).connect(audioProcesser).connect(denoisedAnalyser).connect(gainNode).connect(audioContext.destination)
            draw();
        })
        .catch(e => console.error(e))
  });
}

async function audioDemoStart() {
  audioContext = new AudioContext({sampleRate: sampleRate})

  var rawSab = RingBuffer.getStorageForCapacity(sampleRate * 2, Float32Array);
  var denoisedSab = RingBuffer.getStorageForCapacity(sampleRate * 2, Float32Array);

  setupWorker(rawSab, denoisedSab);
}

function getLiveAudio(audioContext) {
  return navigator.mediaDevices.getUserMedia({
          audio: true
      })
      .then(stream => audioContext.createMediaStreamSource(stream))
}

function drawWaveform(ctx, analyser) {
  if (!ctx || !analyser) return;
  const WIDTH = ctx.canvas.width;
  const HEIGHT = ctx.canvas.height;
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  analyser.getByteTimeDomainData(dataArray);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgb(0, 0, 0)';
  ctx.beginPath();

  const sliceWidth = WIDTH / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * HEIGHT / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(WIDTH, HEIGHT / 2);
  ctx.stroke();
}

function draw() {
  requestAnimationFrame(draw);
  drawWaveform(rawCanvasCtx, rawAnalyser);
  drawWaveform(denoisedCanvasCtx, denoisedAnalyser);
}
