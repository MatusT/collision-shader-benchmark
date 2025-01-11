import './style.css'
import init from './test-triangle';
import { assert } from './utils/util';

(async () => {
  if (navigator.gpu === undefined) {
    const h = document.querySelector('#title') as HTMLElement;
    h.innerText = 'WebGPU is not supported in this browser.';
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    const h = document.querySelector('#title') as HTMLElement;
    h.innerText = 'No adapter is available for WebGPU.';
    return;
  }

  const hasTimestampQuery = adapter.features.has('timestamp-query');
  console.log("Support timestamp", hasTimestampQuery);

  const device = await adapter.requestDevice({
    requiredFeatures: hasTimestampQuery ? ['timestamp-query'] : [],
  });

  const canvas = document.querySelector<HTMLCanvasElement>('#webgpu-canvas');
  assert(canvas !== null);
  const observer = new ResizeObserver(() => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    // Note: You might want to add logic to resize your render target textures here.

  });
  observer.observe(canvas);
  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  init(context, device);  // Remove me!
})();