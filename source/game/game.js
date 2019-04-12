
var 
	_temp,

	keys = {37: 0, 38: 0, 39: 0, 40: 0},
	key_up = 38, key_down = 40, key_left = 37, key_right = 39, key_shoot = 512,
	key_convert = {65: 37, 87: 38, 68: 39, 83: 40}, // convert AWDS to left up down right
	mouse_x = 0, mouse_y = 0,

	time_elapsed,
	time_last = performance.now(),
	
	level_width = 64,
	level_height = 64,
	level_data = new Uint8Array(level_width * level_height),

	cpus_total = 0,
	cpus_rebooted = 0,

	current_level = 0,
	entity_player,
	entities = [],
	entities_to_kill = [];
	var level_num_verts;
	var camera_shake = 0;

function load_image(name, callback) {
	var t = new Image();
	t.src = 'm/'+name+'.png';
	t.onload = callback;
}

function next_level(callback) {
	if (current_level == 3) {
		entities_to_kill.push(entity_player);
		terminal_run_outro();
	}
	else {
		current_level++;
		load_level(current_level, callback);
		
	}
}

function load_level(id, callback) {
	random_seed(0xBADC0DE1 + id);
	load_image('l'+id, function(){
		entities = [];
		num_verts = 0;

		cpus_total = 0;
		cpus_rebooted = 0;

		_temp = document.createElement('canvas');
		_temp.width = _temp.height = level_width; // assume square levels
		_temp = _temp.getContext('2d')
		_temp.drawImage(this, 0, 0);
		_temp =_temp.getImageData(0, 0, level_width, level_height).data;

		for (var y = 0, index = 0; y < level_height; y++) {
			for (var x = 0; x < level_width; x++, index++) {

				// reduce to 12 bit color to accurately match
				var color_key = 
					((_temp[index*4]>>4) << 8) + 
					((_temp[index*4+1]>>4) << 4) + 
					(_temp[index*4+2]>>4);

				if (color_key !== 0) {
					var tile = level_data[index] =
						color_key === 0x888 // wall
								? random_int(0,5) < 4 ? 
								8 : 
								random_int(8, 17)
								: array_rand([1,1,1,1,1,3,3,2,5,5,5,5,5,5,7,7,6]); // floor


					if (tile > 7) { // walls, 8 - 16
						_gl.push_block(x * s, y * s, s, s/2, tile-1);
					}

					else if (tile > 0) { // floor 1 - 7
						_gl.push_floor(x * s, y * s, s, tile-1);

						// enemies and items
						if (random_int(0, 16 - (id * 2)) == 0) {
							new entity_spider_t(x*s, 0, y*s, 5, 27);
						}
						else if (random_int(0, 100) == 0) {
							new entity_health_t(x*s, 0, y*s, 5, 31);
						}
					}

					// cpu
					if (color_key === 0x00f) {
						level_data[index] = 8;
						new entity_cpu_t(x*s, 0, y*s, 0, 18);
						cpus_total++;
					}

					// sentry
					if (color_key === 0xf00) {
						new entity_sentry_t(x*s, 0, y*s, 5, 32);
					}

					// player start position (blue)
					if (color_key === 0x0f0) {
						entity_player = new entity_player_t(x*s, 0, y*s, 5, 18);	
					}
				}
			}
		}

		// Remove all spiders that spawned close to the player start
		for (var i = 0; i < entities.length; i++) {
			var e = entities[i];
			if (
				e instanceof(entity_spider_t) &&
				Math.abs(e.x - entity_player.x) < 64 &&
				Math.abs(e.z - entity_player.z) < 64
			) {
				entities_to_kill.push(e);
			}
		}

		_gl.camera_x = -entity_player.x;
		_gl.camera_y = -300;
		_gl.camera_z = -entity_player.z - 100;

		level_num_verts = num_verts;

		terminal.show_notice(
			'SCANNING FOR OFFLINE SYSTEMS...___' +
			(cpus_total)+' SYSTEMS FOUND'
		);
		callback && callback();
	});
}

function reload_level() {
	load_level(current_level);
}

function preventDefault(ev) {
	ev.preventDefault();
}

document.onkeydown = function(ev){
	_temp = ev.keyCode;
	_temp = key_convert[_temp] || _temp;
	if (keys[_temp] !== undefined) {
		keys[_temp] = 1;
		preventDefault(ev);
	}
}

document.onkeyup = function(ev) {
	_temp = ev.keyCode;
	_temp = key_convert[_temp] || _temp;
	if (keys[_temp] !== undefined) {
		keys[_temp] = 0;
		preventDefault(ev);
	}
}

document.onmousemove = function(ev) {
	mouse_x = (ev.clientX / c.clientWidth) * c.width;
	mouse_y = (ev.clientY / c.clientHeight) * c.height;
}

document.onmousedown = function(ev) {
	keys[key_shoot] = 1;
	preventDefault(ev);
}

document.onmouseup = function(ev) {
	keys[key_shoot] = 0;
	preventDefault(ev);
}

function game_tick() {
	var time_now = performance.now();
	time_elapsed = (time_now - time_last)/1000;
	time_last = time_now;

	_gl.renderer_prepare_frame();

	// update and render entities
	for (var i = 0, e1, e2; i < entities.length; i++) {
		e1 = entities[i];
		if (e1._dead) { continue; }
		e1._update();

		// check for collisions between entities - it's quadratic and nobody cares \o/
		for (var j = i+1; j < entities.length; j++) {
			e2 = entities[j];
			if(!(
				e1.x >= e2.x + 9 ||
				e1.x + 9 <= e2.x ||
				e1.z >= e2.z + 9 ||
				e1.z + 9 <= e2.z
			)) {
				e1._check(e2);
				e2._check(e1);
			}
		}

		e1._render();		
	}

	// center camera on player, apply damping
	_gl.camera_x = _gl.camera_x * 0.9 - entity_player.x * 0.1;
	_gl.camera_y = _gl.camera_y * 0.9 - entity_player.y * 0.1;
	_gl.camera_z = _gl.camera_z * 0.9 - entity_player.z * 0.1;

	// add camera shake
	camera_shake *= 0.3;
	_gl.camera_x += camera_shake * (Math.random()-0.5);
	_gl.camera_z += camera_shake * (Math.random()-0.5);

	// health bar, render with plasma sprite
	for (var i = 0; i < entity_player.h; i++) {
		_gl.push_sprite(-_gl.camera_x - 50 + i * 4, 29-_gl.camera_y, -_gl.camera_z-30, 26);
	}

	_gl.renderer_end_frame();


	// remove dead entities
	entities = entities.filter(function(entity) {
		return entities_to_kill.indexOf(entity) === -1;
	});
	entities_to_kill = [];

	requestAnimationFrame(game_tick);
}
