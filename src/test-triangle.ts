// Note: You can import your separate WGSL shader files like this.
import triangleVertWGSL from './shaders/enemies.vert.wgsl';
import bulletsVertWGSL from './shaders/bullets.vert.wgsl';
import fragWGSL from './shaders/red.frag.wgsl';
import collisionShader from './shaders/collision.wgsl';
import {
  makeShaderDataDefinitions,
  makeStructuredView
} from 'webgpu-utils';
import { Pane } from 'tweakpane';

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

  // Tweakpane: easily adding tweak control for parameters.
  const PARAMS = {
    cell: 0,
    name: 'Test',
    active: true,
  };

  const pane = new Pane({
    title: 'Debug',
    expanded: false,
  });

  const cellIndexInput = pane.addInput(PARAMS, 'cell', { min: 0, max: 255, step: 1 });
  pane.addInput(PARAMS, 'name');
  pane.addInput(PARAMS, 'active');


  const enemiesPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX,
              buffer: { type: "uniform" }
            },
            {
              binding: 1,
              visibility: GPUShaderStage.VERTEX,
              buffer: { type: "read-only-storage" }
            },
            {
              binding: 2,
              visibility: GPUShaderStage.VERTEX,
              buffer: { type: "read-only-storage" }
            }
          ]
        })
      ]
    }),
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

  const collisionShaderModule = device.createShaderModule({ code: collisionShader, });
  const collisionPipeline = device.createComputePipeline({
    layout: collisionPipelineLayout,
    compute: {
      module: collisionShaderModule,
      entryPoint: 'main',
    }
  });

  const definitions = makeShaderDataDefinitions(collisionShader);

  const enemiesCount = 8192;
  const bulletsCount = 512;

  let querySet: GPUQuerySet | undefined = undefined;
  let resolveBuffer: GPUBuffer | undefined = undefined;
  const spareResolveResultBuffers = [];

  let t = 0;
  let computePassDurationSum = 0;
  let timerSamples = 0;

  let constantsBuffer = device.createBuffer({
    size: 128,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  let enemiesBuffer = device.createBuffer({
    label: "Enemies Buffer",
    size: enemiesCount * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  let enemies = makeStructuredView(definitions.storages.enemies, new ArrayBuffer(enemiesCount * 16));
  for (let i = 0; i < enemiesCount; i++) {
    enemies.views.enemies[i].position.set([Math.random() * 1.5 - 0.75, Math.random() * 1.5 - 0.75]);
    enemies.views.enemies[i].halfSize.set([0.015, 0.015]);
  }

  let bulletsArray = new Float32Array(bulletsCount * 8);
  for (let i = 0; i < bulletsCount; i++) {
    bulletsArray.set([
      Math.random() - 0.5, Math.random() - 0.5, // position
      0.010, 0.010, // size
      1.0, 0.0, // axisX
      0.0, -1.0, // axisY
    ], 8 * i);
  }

  const cellCount = 16;
  const cellSpacing = 1.0 / cellCount;

  const cellsCount = new Uint32Array(cellCount * cellCount);
  for (var enemyIndex = 0; enemyIndex < enemiesCount; enemyIndex++) {
    var gridPosition = [enemies.views.enemies[enemyIndex].position[0] * 0.5 + 0.5, enemies.views.enemies[enemyIndex].position[1] * 0.5 + 0.5];
    var gridSize = [enemies.views.enemies[enemyIndex].halfSize[0] * 0.5, enemies.views.enemies[enemyIndex].halfSize[1] * 0.5];

    var xLeft = Math.floor((Math.max(gridPosition[0] - gridSize[0], 0.0)) / cellSpacing);
    var xRight = Math.floor((Math.min(gridPosition[0] + gridSize[0], 1.0)) / cellSpacing);

    var yBottom = Math.floor((Math.max(gridPosition[1] - gridSize[1], 0.0)) / cellSpacing);
    var yTop = Math.floor((Math.min(gridPosition[1] + gridSize[1], 1.0)) / cellSpacing);

    for (var x = Math.max(xLeft, 0); x <= Math.min(15, xRight); x++) {
      for (var y = Math.max(yBottom, 0); y <= Math.min(15, yTop); y++) {
        var i = cellCount * y + x;

        cellsCount[i]++;
      }
    }
  }
  console.log(cellsCount);

  const cellsPrefixSum = new Uint32Array(cellCount * cellCount);
  var sum = 0;
  for (var i = 0; i < cellCount * cellCount; i++) {
    sum += cellsCount[i];
    cellsPrefixSum[i] = sum;
  }

  console.log(cellsPrefixSum);

  const cellsEnemies = new Uint32Array(cellsPrefixSum[cellsPrefixSum.length - 1]);
  for (var enemyIndex = 0; enemyIndex < enemiesCount; enemyIndex++) {
    var gridPosition = [enemies.views.enemies[enemyIndex].position[0] * 0.5 + 0.5, enemies.views.enemies[enemyIndex].position[1] * 0.5 + 0.5];
    var gridSize = [enemies.views.enemies[enemyIndex].halfSize[0] * 0.5, enemies.views.enemies[enemyIndex].halfSize[1] * 0.5];

    var xLeft = Math.floor((Math.max(gridPosition[0] - gridSize[0], 0.0)) / cellSpacing);
    var xRight = Math.floor((Math.min(gridPosition[0] + gridSize[0], 1.0)) / cellSpacing);

    var yBottom = Math.floor((Math.max(gridPosition[1] - gridSize[1], 0.0)) / cellSpacing);
    var yTop = Math.floor((Math.min(gridPosition[1] + gridSize[1], 1.0)) / cellSpacing);

    for (var x = Math.max(xLeft, 0); x <= Math.min(15, xRight); x++) {
      for (var y = Math.max(yBottom, 0); y <= Math.min(15, yTop); y++) {
        var i = cellCount * y + x;

        cellsEnemies[--cellsPrefixSum[i]] = enemyIndex;
      }
    }
  }

  console.log(cellsEnemies);

  // let enemiesInCellCount = 0;
  // cellIndexInput.on('change', function (ev) {
  //   let cell = ev.value;

  //   enemiesInCellCount = cellsCount[cell];
  //   let enemiesInCell = makeStructuredView(definitions.storages.enemies, new ArrayBuffer(enemiesCount * 16));
  //   for (let i = 0; i < enemiesInCellCount; i++) {
  //     let enemyIndex = cellsEnemies[cellsPrefixSum[cell] + i];
  
  //     enemiesInCell.views.enemies[i].position.set(enemies.views.enemies[enemyIndex].position);
  //     enemiesInCell.views.enemies[i].halfSize.set(enemies.views.enemies[enemyIndex].halfSize);
  //   }

  //   device.queue.writeBuffer(enemiesBuffer, 0, enemiesInCell.arrayBuffer, 0, enemiesInCell.arrayBuffer.byteLength);
  // });

  device.queue.writeBuffer(enemiesBuffer, 0, enemies.arrayBuffer, 0, enemies.arrayBuffer.byteLength);
  // device.queue.writeBuffer(enemiesBuffer, 0, enemiesInCell.arrayBuffer, 0, enemiesInCell.arrayBuffer.byteLength);

  let bulletsBuffer = device.createBuffer({
    label: "Bullets Buffer",
    size: bulletsCount * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  device.queue.writeBuffer(bulletsBuffer, 0, bulletsArray.buffer, 0, bulletsArray.buffer.byteLength);

  let resultsBuffer = device.createBuffer({
    label: "Results Buffer",
    size: enemiesCount * bulletsCount * 4,
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
        resource: { buffer: constantsBuffer }
      },
      {
        binding: 1,
        resource: { buffer: enemiesBuffer }
      },
      {
        binding: 2,
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

    const constantsArray = new Uint32Array([enemiesCount, bulletsCount]);
    device.queue.writeBuffer(constantsBuffer, 0, constantsArray.buffer, 0, constantsArray.buffer.byteLength);

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
      passEncoder.dispatchWorkgroups(enemiesCount / 32, 1, 1);
      passEncoder.end();
    }

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    passEncoder.setPipeline(enemiesPipeline);
    passEncoder.setBindGroup(0, renderEnemiesBindGroup);
    passEncoder.draw(enemiesCount * 6, 1, 0, 0);

    passEncoder.setPipeline(bulletsPipeline);
    passEncoder.setBindGroup(0, renderBulletsBindGroup);
    passEncoder.draw(bulletsCount * 6, 1, 0, 0);

    passEncoder.end();

    let resolveResultBuffer: GPUBuffer | undefined =
      spareResolveResultBuffers.pop() ||
      device.createBuffer({
        size: 2 * BigInt64Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    commandEncoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(
      resolveBuffer,
      0,
      resolveResultBuffer,
      0,
      resolveResultBuffer.size
    );

    device.queue.submit([commandEncoder.finish()]);

    resolveResultBuffer.mapAsync(GPUMapMode.READ).then(() => {
      const times = new BigInt64Array(resolveResultBuffer.getMappedRange());
      const computePassDuration = Number(times[1] - times[0]);

      // console.log(computePassDuration);
      // In some cases the timestamps may wrap around and produce a negative
      // number as the GPU resets it's timings. These can safely be ignored.
      if (computePassDuration > 0) {
        computePassDurationSum += computePassDuration;
        timerSamples++;
      }
      resolveResultBuffer.unmap();

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
      spareResolveResultBuffers.push(resolveResultBuffer);
    });

    ++t;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
