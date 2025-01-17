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
@binding(3) @group(0) var<storage, read> cellsCount : array<u32>;
@binding(4) @group(0) var<storage, read> cellsPrefixSum : array<u32>;
@binding(5) @group(0) var<storage, read> cellsEnemies : array<u32>;
@binding(6) @group(0) var<storage, read_write> damages : Damages;

const workgroup_len : u32 = 32;

var<workgroup> enemiesWorkgroup: array<Enemy, workgroup_len>;
var<workgroup> bulletsWorkgroup: array<Bullet, workgroup_len>;

@compute @workgroup_size(32, 1)
fn main(
    @builtin(global_invocation_id) GlobalInvocationID: vec3u,
    @builtin(local_invocation_id) LocalInvocationID: vec3u,
    @builtin(workgroup_id) WorkGroupId: vec3u
) {
    var bullet = bullets.bullets[GlobalInvocationID.x];
    var bulletPosition = bullet.position;
    var bulletSize = bullet.halfSize;
    var bulletAxisX = bullet.axisX;
    var bulletAxisY = bullet.axisY;

    var gridPosition = vec2(bullet.position[0] * 0.5 + 0.5, bullet.position[1] * 0.5 + 0.5);
    var gridSize = vec2(max(bullet.halfSize[0], bullet.halfSize[1]) * 0.5);

    var xLeft = u32(floor((max(gridPosition[0] - gridSize[0], 0.0)) / 0.0625));
    var xRight = u32(floor((min(gridPosition[0] + gridSize[0], 1.0)) / 0.0625));

    var yBottom = u32(floor((max(gridPosition[1] - gridSize[1], 0.0)) / 0.0625));
    var yTop = u32(floor((min(gridPosition[1] + gridSize[1], 1.0)) / 0.0625));

    for (var x = max(xLeft, 0); x <= min(15, xRight); x++) {
        for (var y = max(yBottom, 0); y <= min(15, yTop); y++) {
            var cellIndex = 16 * y + x;
            var cellOffset = cellsPrefixSum[cellIndex];
            var cellLength = cellsCount[cellIndex];

            for (var i = cellOffset; i < cellOffset + cellLength; i++) {
                var enemyIndex = cellsEnemies[i];
                var enemy = enemies.enemies[enemyIndex];

                var aabbHalfWidth = enemy.halfSize.x;
                var aabbHalfHeight = enemy.halfSize.y;

                var T = bulletPosition - enemy.position;
                var C1 = abs(T.x) > abs(bulletSize.x * bulletAxisX.x) + abs(bulletSize.y * bulletAxisY.x) + aabbHalfWidth;
                var C2 = abs(T.y) > abs(bulletSize.x * bulletAxisX.y) + abs(bulletSize.y * bulletAxisY.y) + aabbHalfHeight;
                var C3 = abs(dot(T, bulletAxisX)) > (abs(aabbHalfWidth * bulletAxisX.x) + abs(aabbHalfHeight * bulletAxisX.y) + bulletSize.x);
                var C4 = abs(dot(T, bulletAxisY)) > (abs(aabbHalfWidth * bulletAxisY.x) + abs(aabbHalfHeight * bulletAxisY.y) + bulletSize.y);

                if !C1 && !C2 && !C3 && !C4 {
                    damages.damages[enemyIndex * constants.bulletsCount + GlobalInvocationID.x] = 1;
                }
            }
        }
    }

    // enemiesWorkgroup[LocalInvocationID.x] = enemies.enemies[GlobalInvocationID.x];

    // for (var globalBulletOffset = 0u; globalBulletOffset < constants.bulletsCount; globalBulletOffset += 32) {
    //     bulletsWorkgroup[LocalInvocationID.x] = bullets.bullets[globalBulletOffset + LocalInvocationID.x];
    //     workgroupBarrier();

    //     for (var enemyIndex = 0u; enemyIndex < 32u; enemyIndex++) {
    //         var bullet = bulletsWorkgroup[LocalInvocationID.x];
    //         var bulletPosition = bullet.position;
    //         var bulletSize = bullet.halfSize;
    //         var bulletAxisX = bullet.axisX;
    //         var bulletAxisY = bullet.axisY;

    //         var aabbHalfWidth = enemiesWorkgroup[enemyIndex].halfSize.x;
    //         var aabbHalfHeight = enemiesWorkgroup[enemyIndex].halfSize.y;

    //         var T = bulletPosition - enemiesWorkgroup[enemyIndex].position;
    //         var C1 = abs(T.x) > abs(bulletSize.x * bulletAxisX.x) + abs(bulletSize.y * bulletAxisY.x) + aabbHalfWidth;
    //         var C2 = abs(T.y) > abs(bulletSize.x * bulletAxisX.y) + abs(bulletSize.y * bulletAxisY.y) + aabbHalfHeight;
    //         var C3 = abs(dot(T, bulletAxisX)) > (abs(aabbHalfWidth * bulletAxisX.x) + abs(aabbHalfHeight * bulletAxisX.y) + bulletSize.x);
    //         var C4 = abs(dot(T, bulletAxisY)) > (abs(aabbHalfWidth * bulletAxisY.x) + abs(aabbHalfHeight * bulletAxisY.y) + bulletSize.y);

    //         if !C1 && !C2 && !C3 && !C4 {
    //             damages.damages[(WorkGroupId.x * 32 + enemyIndex) * constants.bulletsCount + globalBulletOffset + LocalInvocationID.x] = 1;
    //         }
    //     }

    //     workgroupBarrier();
    // }
}