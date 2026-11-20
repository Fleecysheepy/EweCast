let model;

self.onmessage = async ({data: {text}}) => {
  try {
    if (!model) {
      const {KokoroTTS} = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
      model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: progress => {
          if (progress.file?.endsWith('.onnx') && Number.isFinite(progress.progress)) {
            self.postMessage({progress: Math.round(progress.progress)});
          }
        }
      });
    }
    self.postMessage({generating: true});
    const speech = await model.generate(text, {voice: 'af_heart', speed: 1});
    const encoded = speech.toWav();
    const wav = encoded instanceof ArrayBuffer ? encoded : Uint8Array.from(encoded).buffer;
    self.postMessage({wav}, [wav]);
  } catch (error) {
    console.warn('Kokoro voice failed', error);
    self.postMessage({failed: true});
  }
};
