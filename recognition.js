(() => {
  let generation = 0;
  let state = 'idle';
  let candidate = null;
  let modelPromise = null;

  const status = () =>
    document.getElementById('recognition-status');

  function render() {
    if (!status()) return;

    let message = '';

    if (state === 'analyzing') {
      message = t('analyzing');
    }

    if (state === 'failed') {
      message = t('recognitionFail');
    }

    if (state === 'done') {
      if (candidate === 'snow') {
        message =
          t('suggestion') + ': ' + t('suggestedSnow');
      } else if (candidate === 'other') {
        message = t('suggestedOther');
      } else {
        message = t('uncertainResult');
      }
    }

    status().textContent = message;

    document.getElementById('confirm').disabled =
      state === 'analyzing';

    document.getElementById('retry-analysis').hidden =
      state !== 'failed';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');

      script.src = src;
      script.onload = resolve;

      script.onerror = () => {
        script.remove();
        reject(Error('script'));
      };

      document.head.append(script);
    });
  }

  async function loadModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        if (!window.tf) {
          await loadScript(
            'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
          );
        }

        await tf.ready();

        return tf.loadLayersModel(
          'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json'
        );
      })().catch(error => {
        modelPromise = null;
        throw error;
      });
    }

    return modelPromise;
  }

  // ImageNet class indexes used by this specific model:
  // 287 lynx, 288 leopard, 289 snow leopard,
  // 290 jaguar, 291 lion, 292 tiger, 293 cheetah.
  window.decideSpecies = predictions => {
    const snow = predictions.find(
      prediction => prediction.index === 289
    );

    const top = predictions[0];

    if (
      top?.index === 289 &&
      snow.probability >= 0.35 &&
      snow.probability >=
        (predictions[1]?.probability || 0) * 1.3
    ) {
      return 'snow';
    }

    if (snow?.probability >= 0.15) {
      return 'uncertain';
    }

    if (
      top &&
      top.probability >= 0.35 &&
      [287, 288, 290, 291, 292, 293].includes(top.index)
    ) {
      return 'other';
    }

    return 'uncertain';
  };

  window.renderRecognition = render;

  window.cancelRecognition = () => {
    generation++;
    state = 'idle';
    candidate = null;

    render();
  };

  window.identifyAnimal = async image => {
    const job = ++generation;

    state = 'analyzing';
    candidate = null;

    render();

    let input;
    let output;
    let timer;

    try {
      const model = await Promise.race([
        loadModel(),

        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(Error('timeout'));
          }, 60000);
        })
      ]);

      clearTimeout(timer);

      if (job !== generation) return;

      const canvas = document.createElement('canvas');

      canvas.width = 224;
      canvas.height = 224;

      canvas.getContext('2d').drawImage(
        image,
        0,
        0,
        224,
        224
      );

      input = tf.tidy(() =>
        tf.browser
          .fromPixels(canvas)
          .toFloat()
          .div(127.5)
          .sub(1)
          .expandDims()
      );

      output = model.predict(input);

      const probabilities = await output.data();

      if (job !== generation) return;

      const predictions = Array.from(
        probabilities,
        (probability, index) => ({
          probability,
          index
        })
      ).sort(
        (a, b) => b.probability - a.probability
      );

      candidate = window.decideSpecies(predictions);
      state = 'done';
    } catch {
      if (job === generation) {
        state = 'failed';
      }
    } finally {
      clearTimeout(timer);

      input?.dispose();
      output?.dispose();

      if (job === generation) {
        render();
      }
    }
  };

  document
    .getElementById('retry-analysis')
    .addEventListener('click', () => {
      const image =
        document.getElementById('preview-image');

      if (image.complete && image.naturalWidth) {
        window.identifyAnimal(image);
      }
    });
})();