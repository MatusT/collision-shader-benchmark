struct Constants {
  enemiesCount: u32,
  bulletsCount: u32,
}

struct Enemy {
  position: vec2f,
  halfSize: vec2f,
}

struct Enemies {
  enemies: array<Enemy>,
}

struct Damages {
  damages: array<u32>,
}

@binding(0) @group(0) var<uniform> constants : Constants;
@binding(1) @group(0) var<storage, read> enemies : Enemies;
@binding(2) @group(0) var<storage, read> damages : Damages;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) color : vec3f,
}

@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> VertexOutput {
  let enemyId = VertexIndex / 6;

  let enemy = enemies.enemies[enemyId];

  var pos = array<vec2<f32>, 6>(
    vec2(1.0, 1.0),
    vec2(1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0, 1.0),
    vec2(1.0, 1.0),
  );
  
  var output : VertexOutput;
  output.Position =  vec4<f32>(enemy.halfSize * pos[VertexIndex % 6] + enemy.position, 0.0, 1.0);
  
  var hit = false;
  for (var i = u32(0); i < u32(constants.bulletsCount); i++)
  {
    if (damages.damages[enemyId * constants.bulletsCount + i] > 0)
    {
      hit = true;
    }
  }

  if (hit)
  {
    output.color = vec3f(1.0, 0.0, 0.0);
  }
  else {
    output.color = vec3f(1.0);
    // output.Position =  vec4<f32>(0.0);
  }

  return output;
}