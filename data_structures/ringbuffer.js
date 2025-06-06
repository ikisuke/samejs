// Original: https://github.com/GoogleChromeLabs/web-audio-samples/blob/main/src/audio-worklet/design-pattern/lib/wasm-audio-helper.js

// Byte per audio sample. (32 bit float)
const BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;

// Basic byte unit of WASM heap. (16 bit = 2 bytes)
const BYTES_PER_UNIT = Uint16Array.BYTES_PER_ELEMENT;

// The max audio channel on Chrome is 32.
const MAX_CHANNEL_COUNT = 32;

// WebAudio's render quantum size.
const RENDER_QUANTUM_FRAMES = 128;

/**
 * A JS FIFO implementation for the AudioWorklet. 3 assumptions for the
 * simpler operation:
 *  1. the push and the pull operation are done by 128 frames. (Web Audio
 *    API's render quantum size in the speficiation)
 *  2. the channel count of input/output cannot be changed dynamically.
 *    The AudioWorkletNode should be configured with the `.channelCount = k`
 *    (where k is the channel count you want) and
 *    `.channelCountMode = explicit`.
 *  3. This is for the single-thread operation. (obviously)
 *
 * @class
 */
class RingBuffer {
    /**
     * @constructor
     * @param  {number} length Buffer length in frames.
     * @param  {number} channelCount Buffer channel count.
     */
    constructor(length, channelCount) {
      this._readIndex = 0;
      this._writeIndex = 0;
      this._framesAvailable = 0;
  
      this._channelCount = channelCount;
      this._length = length;
      this._channelData = [];
      for (let i = 0; i < this._channelCount; ++i) {
        this._channelData[i] = new Float32Array(length);
      }
    }
  
    /**
     * Getter for Available frames in buffer.
     *
     * @return {number} Available frames in buffer.
     */
    get framesAvailable() {
      return this._framesAvailable;
    }
  
    /**
     * Push a sequence of Float32Arrays to buffer.
     *
     * @param  {array} arraySequence A sequence of Float32Arrays.
     */
    push(arraySequence) {
      // The channel count of arraySequence and the length of each channel must
      // match with this buffer obejct.
  
      // Transfer data from the |arraySequence| storage to the internal buffer.
      const sourceLength = arraySequence[0].length;
      for (let i = 0; i < sourceLength; ++i) {
        const writeIndex = (this._writeIndex + i) % this._length;
        for (let channel = 0; channel < this._channelCount; ++channel) {
          this._channelData[channel][writeIndex] = arraySequence[channel][i];
        }
      }
  
      this._writeIndex = (this._writeIndex + sourceLength) % this._length;
  
      // For excessive frames, the buffer will be overwritten.
      this._framesAvailable += sourceLength;
      if (this._framesAvailable > this._length) {
        this._framesAvailable = this._length;
      }
    }
  
    /**
     * Pull data out of buffer and fill a given sequence of Float32Arrays.
     *
     * @param  {array} arraySequence An array of Float32Arrays.
     */
    pull(arraySequence) {
      // The channel count of arraySequence and the length of each channel must
      // match with this buffer obejct.
  
      // If the FIFO is completely empty, do nothing.
      if (this._framesAvailable === 0) {
        return;
      }
  
      const destinationLength = arraySequence[0].length;
  
      // Transfer data from the internal buffer to the |arraySequence| storage.
      for (let i = 0; i < destinationLength; ++i) {
        const readIndex = (this._readIndex + i) % this._length;
        for (let channel = 0; channel < this._channelCount; ++channel) {
          arraySequence[channel][i] = this._channelData[channel][readIndex];
        }
      }
  
      this._readIndex = (this._readIndex + destinationLength) % this._length;
  
      this._framesAvailable -= destinationLength;
      if (this._framesAvailable < 0) {
        this._framesAvailable = 0;
      }
    }
  } // class RingBuffer
  
  
  export {
    MAX_CHANNEL_COUNT,
    RENDER_QUANTUM_FRAMES,
    RingBuffer,
  };
