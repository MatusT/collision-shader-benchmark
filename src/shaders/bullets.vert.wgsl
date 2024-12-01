struct Bullet {
    position: vec2f,
    halfSize: vec2f,
    axisX: vec2f,
    axisY: vec2f,
    damage: vec4<u32>,
}

struct Bullets {
  bullets: array<Bullet>,
}

@binding(0) @group(0) var<storage, read> bullets : Bullets;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) color : vec3f,
}

@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> VertexOutput {
  let bullet = bullets.bullets[VertexIndex / 6];

  var pos = array<vec2<f32>, 6>(
    vec2(1.0, 1.0),
    vec2(1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0, 1.0),
    vec2(1.0, 1.0),
  );

var output : VertexOutput;
  output.Position =  vec4<f32>(bullet.halfSize * pos[VertexIndex % 6] + bullet.position, 0.0, 1.0);
  output.color = vec3f(0.1, 0.3, 0.7);

  return output;
}