// 4 floats = 16 bytes
struct Enemy {
  position: vec2f,
  halfSize: vec2f,
}

// 8 floats = 32 bytes
struct Bullet {
position: vec2f,
halfSize: vec2f,
axisX: vec2f,
axisY: vec2f,
}

struct Constants {
  enemiesCount: u32,
  bulletsCount: u32,
}

struct Enemies {
  enemies: array<Enemy>,
}

struct Bullets {
  bullets: array<Bullet>,
}

struct Damages {
  damages: array<u32>,
}

@binding(0) @group(0) var<uniform> constants : Constants;
@binding(1) @group(0) var<storage, read> enemies : Enemies;
@binding(2) @group(0) var<storage, read> bullets : Bullets;
@binding(3) @group(0) var<storage, read_write> damages : Damages;

@compute @workgroup_size(8, 8)
fn main(
    @builtin(global_invocation_id) GlobalInvocationID: vec3u,
    @builtin(local_invocation_id) LocalInvocationID: vec3u
) {
    var enemyindex = GlobalInvocationID.x;
    var bulletIndex = GlobalInvocationID.y;

    var bullet = bullets.bullets[bulletIndex];
    var bulletPosition = bullet.position;
    var bulletSize = bullet.halfSize;
    var bulletAxisX = bullet.axisX;
    var bulletAxisY = bullet.axisY;

    //for (var i = 0u; i < arrayLength(&enemies.enemies); i++) {
    var enemy = enemies.enemies[enemyindex];

    var aabbHalfWidth = enemy.halfSize.x;
    var aabbHalfHeight = enemy.halfSize.y;

    var T = bulletPosition - enemy.position;
    var C1 = abs(T.x) > abs(bulletSize.x * bulletAxisX.x) + abs(bulletSize.y * bulletAxisY.x) + aabbHalfWidth;
    var C2 = abs(T.y) > abs(bulletSize.x * bulletAxisX.y) + abs(bulletSize.y * bulletAxisY.y) + aabbHalfHeight;
    var C3 = abs(dot(T, bulletAxisX)) > (abs(aabbHalfWidth * bulletAxisX.x) + abs(aabbHalfHeight * bulletAxisX.y) + bulletSize.x);
    var C4 = abs(dot(T, bulletAxisY)) > (abs(aabbHalfWidth * bulletAxisY.x) + abs(aabbHalfHeight * bulletAxisY.y) + bulletSize.y);

    if (!C1 && !C2 && !C3 && !C4) {
        damages.damages[enemyindex * constants.bulletsCount + bulletIndex] = 1;
    } else {
        damages.damages[enemyindex * constants.bulletsCount + bulletIndex] = 0;
    }

        
    //}

    // Version #1
    // var index = GlobalInvocationID.x;

    // var bullet = bullets.bullets[index];
    // var bulletPosition = bullet.position;
    // var bulletSize = bullet.halfSize;
    // var bulletAxisX = bullet.axisX;
    // var bulletAxisY = bullet.axisY;

    // for (var i = 0u; i < arrayLength(&enemies.enemies); i++) {
    //     var enemy = enemies.enemies[i];

    //     var aabbHalfWidth = enemy.halfSize.x;
    //     var aabbHalfHeight = enemy.halfSize.y;
        
    //     var T = bulletPosition - enemy.position;
    //     var C1 = abs(T.x) > abs(bulletSize.x * bulletAxisX.x) + abs(bulletSize.y * bulletAxisY.x) + aabbHalfWidth;
    //     var C2 = abs(T.y) > abs(bulletSize.x * bulletAxisX.y) + abs(bulletSize.y * bulletAxisY.y) + aabbHalfHeight;
    //     var C3 = abs(dot(T, bulletAxisX)) > (abs(aabbHalfWidth * bulletAxisX.x) + abs(aabbHalfHeight * bulletAxisX.y) + bulletSize.x);
    //     var C4 = abs(dot(T, bulletAxisY)) > (abs(aabbHalfWidth * bulletAxisY.x) + abs(aabbHalfHeight * bulletAxisY.y) + bulletSize.y);

    //     damages.damages[i * 128 + LocalInvocationID.x] = u32(C1) + u32(C2) + u32(C3) + u32(C4);
    // }
}