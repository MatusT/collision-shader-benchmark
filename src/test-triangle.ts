// Note: You can import your separate WGSL shader files like this.
import triangleVertWGSL from './shaders/enemies.vert.wgsl';
import bulletsVertWGSL from './shaders/bullets.vert.wgsl';
import fragWGSL from './shaders/red.frag.wgsl';
import collisionShader from './shaders/collision.wgsl';

export default function init(
  context: GPUCanvasContext,
  device: GPUDevice
): void {
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  });

  const enemiesPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: triangleVertWGSL,
      }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({
        code: fragWGSL,
      }),
      entryPoint: 'main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const bulletsPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: bulletsVertWGSL,
      }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({
        code: fragWGSL,
      }),
      entryPoint: 'main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const collisionPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: "uniform"
            }
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: "read-only-storage"
            }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: "read-only-storage"
            }
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: "storage"
            }
          }
        ]
      })
    ],
  });
  const collisionPipeline = device.createComputePipeline({
    layout: collisionPipelineLayout,
    compute: {
      module: device.createShaderModule({ code: collisionShader, }),
      entryPoint: 'main',
    }
  });

  /** Storage for timestamp query results */
  let querySet: GPUQuerySet | undefined = undefined;
  /** Timestamps are resolved into this buffer */
  let resolveBuffer: GPUBuffer | undefined = undefined;
  /** Pool of spare buffers for MAP_READing the timestamps back to CPU. A buffer
   * is taken from the pool (if available) when a readback is needed, and placed
   * back into the pool once the readback is done and it's unmapped. */
  const spareResultBuffers = [];

  let t = 0;
  let computePassDurationSum = 0;
  let timerSamples = 0;
  
  /*
   */
  let constantsBuffer = device.createBuffer({
    size: 128,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  let enemiesBuffer = device.createBuffer({
    label: "Enemies Buffer",
    size: 8192 * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  let enemiesArray = new Float32Array(8192 * 4);
  for(let i = 0; i < 8192; i++)
  {
    enemiesArray.set([Math.random() - 0.5, Math.random() - 0.5, 0.015, 0.015], 4 * i);
  }

  device.queue.writeBuffer(enemiesBuffer, 0, enemiesArray.buffer, 0, enemiesArray.buffer.byteLength);

  let bulletsBuffer = device.createBuffer({
    size: 128 * 48,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  let bulletsArray = new Float32Array(128 * 12);
  for(let i = 0; i < 128; i++)
  {
    bulletsArray.set([
      Math.random() - 0.5, Math.random() - 0.5, // position
      0.025, 0.025, // size
      1.0, 0.0, // axisX
      0.0, 1.0, // axisY
    ], 12 * i);
  }

  device.queue.writeBuffer(bulletsBuffer, 0, bulletsArray.buffer, 0, bulletsArray.buffer.byteLength);

  let resultsBuffer = device.createBuffer({
    size: 8192 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  let collisionBindGroup = device.createBindGroup({
    layout: collisionPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: constantsBuffer }
      },
      {
        binding: 1,
        resource: { buffer: enemiesBuffer }
      },
      {
        binding: 2,
        resource: { buffer: bulletsBuffer }
      },
      {
        binding: 3,
        resource: { buffer: resultsBuffer }
      }
    ]
  });

  let renderEnemiesBindGroup = device.createBindGroup({
    layout: enemiesPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: enemiesBuffer }
      },
      {
        binding: 1,
        resource: { buffer: resultsBuffer }
      },
    ]
  });

  let renderBulletsBindGroup = device.createBindGroup({
    layout: bulletsPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: bulletsBuffer }
      },
    ]
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.1, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };



    const computePassDescriptor: GPUComputePassDescriptor = {};
    querySet = device.createQuerySet({
      type: 'timestamp',
      count: 2,
    });
    resolveBuffer = device.createBuffer({
      size: 2 * BigInt64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    computePassDescriptor.timestampWrites = {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };

    {
      const passEncoder = commandEncoder.beginComputePass(computePassDescriptor);
      passEncoder.setPipeline(collisionPipeline);
      passEncoder.setBindGroup(0, collisionBindGroup);
      // passEncoder.dispatchWorkgroups(2);
      passEncoder.dispatchWorkgroups(1024, 8);
      passEncoder.end();
    }

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    passEncoder.setPipeline(enemiesPipeline);
    passEncoder.setBindGroup(0, renderEnemiesBindGroup);
    passEncoder.draw(8192 * 6, 1, 0, 0);

    passEncoder.setPipeline(bulletsPipeline);
    passEncoder.setBindGroup(0, renderBulletsBindGroup);
    passEncoder.draw(128 * 6, 1, 0, 0);

    passEncoder.end();

    let resultBuffer: GPUBuffer | undefined =
      spareResultBuffers.pop() ||
      device.createBuffer({
        size: 2 * BigInt64Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    commandEncoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(
      resolveBuffer,
      0,
      resultBuffer,
      0,
      resultBuffer.size
    );

    device.queue.submit([commandEncoder.finish()]);

    resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
      const times = new BigInt64Array(resultBuffer.getMappedRange());
      const computePassDuration = Number(times[1] - times[0]);

      // console.log(computePassDuration);
      // In some cases the timestamps may wrap around and produce a negative
      // number as the GPU resets it's timings. These can safely be ignored.
      if (computePassDuration > 0) {
        computePassDurationSum += computePassDuration;
        timerSamples++;
      }
      resultBuffer.unmap();

      // Periodically update the text for the timer stats
      const kNumTimerSamplesPerUpdate = 100;
      if (timerSamples >= kNumTimerSamplesPerUpdate) {
        const avgComputeMicroseconds = Math.round(
          computePassDurationSum / timerSamples / 1000
        );

        console.log(`${avgComputeMicroseconds}µs (${avgComputeMicroseconds / 1000}ms)`);

        computePassDurationSum = 0;
        timerSamples = 0;
      }
      spareResultBuffers.push(resultBuffer);
    });

    ++t;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
